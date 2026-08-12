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
import { publishPlanAndCreateShare } from "@/lib/plans";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";
import { requestCorrelationId } from "@/lib/request-correlation";
import { shareMutationEnvelope, shareOrigin } from "@/lib/share-origin";

const PUBLISH_FIELDS = [
  "intendedRecipientContext",
  "expiresInDays",
  "expectedRevision",
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
    // Resolve the one permitted URL origin before account creation, abuse
    // counters, or the publish transaction can write anything.
    const origin = shareOrigin(request);
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const { planId } = await context.params;
    await enforceAbuseLimit(ABUSE_LIMITS.planPublishAccount, account.id);
    const payload = asObject(await readJson<unknown>(request));
    assertExactObjectKeys(payload, PUBLISH_FIELDS);
    if (payload.confirmation !== "reviewed_exact_golfer_view") {
      throw new RequestError(
        400,
        "review_confirmation_required",
        "Review and confirm the exact golfer view before publishing.",
      );
    }
    const intendedRecipientContext = cleanText(
      payload.intendedRecipientContext,
      "intendedRecipientContext",
      { required: true, max: 240 },
    );
    const expiresInDays = Number(payload.expiresInDays ?? 30);
    if (!Number.isSafeInteger(payload.expectedRevision) || (payload.expectedRevision as number) < 1) {
      throw new RequestError(
        400,
        "invalid_revision",
        "The reviewed plan revision is required before publishing.",
      );
    }
    const result = await publishPlanAndCreateShare({
      accountId: account.id,
      planId,
      expectedRevision: payload.expectedRevision as number,
      intendedRecipientContext,
      expiresInDays,
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
