import { requireApiIdentity } from "@/lib/identity";
import {
  assertExactObjectKeys,
  assertSameOrigin,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { reissuePublishedPlanShare } from "@/lib/plans";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { requestCorrelationId } from "@/lib/request-correlation";
import { shareMutationEnvelope, shareOrigin } from "@/lib/share-origin";

const REISSUE_FIELDS = [
  "expectedRevision",
  "expectedLastSharedAt",
  "expectedSourceShareId",
  "expectedSourceStatus",
  "expectedSourceUpdatedAt",
  "expiresInDays",
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
    // Resolve the only permitted return origin before account reconciliation,
    // rate-limit writes, or the one-time bearer transaction.
    const origin = shareOrigin(request);
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const { planId } = await context.params;
    await enforceAbuseLimit(ABUSE_LIMITS.planPublishAccount, account.id);

    const payload = asObject(await readJson<unknown>(request));
    assertExactObjectKeys(payload, REISSUE_FIELDS);
    if (payload.confirmation !== "reissue_same_published_revision") {
      throw new RequestError(
        400,
        "share_reissue_confirmation_required",
        "Confirm the exact published revision and new expiry before reissuing private access.",
      );
    }
    const expectedRevision = positiveSafeInteger(
      payload.expectedRevision,
      "expectedRevision",
    );
    const expectedLastSharedAt = nonNegativeSafeInteger(
      payload.expectedLastSharedAt,
      "expectedLastSharedAt",
    );
    const expectedSourceUpdatedAt = nonNegativeSafeInteger(
      payload.expectedSourceUpdatedAt,
      "expectedSourceUpdatedAt",
    );
    const expiresInDays = positiveSafeInteger(
      payload.expiresInDays,
      "expiresInDays",
    );
    if (![1, 7, 30, 90].includes(expiresInDays)) {
      throw new RequestError(
        400,
        "invalid_expiry",
        "Share expiry must be 1, 7, 30, or 90 days.",
      );
    }
    if (
      payload.expectedSourceStatus !== "revoked" &&
      payload.expectedSourceStatus !== "expired"
    ) {
      throw new RequestError(
        400,
        "invalid_share_history_status",
        "The observed sharing record must be revoked or expired.",
      );
    }
    const expectedSourceShareId = cleanText(
      payload.expectedSourceShareId,
      "expectedSourceShareId",
      { required: true, max: 64 },
    );
    if (!isUuid(expectedSourceShareId)) {
      throw new RequestError(
        400,
        "invalid_share_history_id",
        "The observed sharing record is invalid.",
      );
    }

    const result = await reissuePublishedPlanShare({
      accountId: account.id,
      planId,
      expectedRevision,
      expectedLastSharedAt,
      expectedSourceShareId,
      expectedSourceStatus: payload.expectedSourceStatus,
      expectedSourceUpdatedAt,
      expiresInDays,
      requestId,
    });

    return Response.json(shareMutationEnvelope(result, origin), {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": requestId,
      },
    });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("X-Request-ID", requestId);
    return response;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(
      400,
      "invalid_body",
      "Request body must be a JSON object.",
    );
  }
  return value as Record<string, unknown>;
}

function positiveSafeInteger(value: unknown, field: string): number {
  const parsed = nonNegativeSafeInteger(value, field);
  if (parsed < 1) {
    throw new RequestError(
      400,
      "invalid_field",
      `${field} must be a positive whole number.`,
    );
  }
  return parsed;
}

function nonNegativeSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RequestError(
      400,
      "invalid_field",
      `${field} must be a non-negative whole number.`,
    );
  }
  return value as number;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
