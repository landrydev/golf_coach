import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { requireApiIdentity } from "@/lib/identity";
import {
  assertExactObjectKeys,
  assertSameOrigin,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { replaceInaccessiblePlanShare } from "@/lib/plans";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";
import { requestCorrelationId } from "@/lib/request-correlation";
import { shareMutationEnvelope, shareOrigin } from "@/lib/share-origin";

const REPLACEMENT_FIELDS = [
  "expectedRevision",
  "expectedShareId",
  "confirmation",
] as const;

export async function POST(
  request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return authentication.response;
    // The replacement bearer is also returned only once. Validate its URL
    // origin before any account, rate-limit, or share mutation can write.
    const origin = shareOrigin(request);
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const { planId } = await context.params;
    await enforceAbuseLimit(ABUSE_LIMITS.planPublishAccount, account.id);
    const payload = asObject(await readJson<unknown>(request));
    assertExactObjectKeys(payload, REPLACEMENT_FIELDS);
    if (payload.confirmation !== "replace_inaccessible_private_link") {
      throw new RequestError(
        400,
        "share_replacement_confirmation_required",
        "Confirm that the existing one-time private link is inaccessible before replacing it.",
      );
    }
    if (
      !Number.isSafeInteger(payload.expectedRevision) ||
      (payload.expectedRevision as number) < 1
    ) {
      throw new RequestError(
        400,
        "invalid_revision",
        "The reviewed plan revision is required before replacing its link.",
      );
    }
    const expectedShareId = cleanText(
      payload.expectedShareId,
      "expectedShareId",
      { required: true, max: 128 },
    );

    const result = await replaceInaccessiblePlanShare({
      accountId: account.id,
      planId,
      expectedRevision: payload.expectedRevision as number,
      expectedShareId,
      requestId,
    });
    return Response.json(
      shareMutationEnvelope(result, origin),
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          "X-Request-ID": requestId,
        },
      },
    );
  } catch (error) {
    return withRequestId(errorResponse(error), requestId);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, "invalid_body", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function withRequestId(response: Response, requestId: string): Response {
  response.headers.set("X-Request-ID", requestId);
  return response;
}
