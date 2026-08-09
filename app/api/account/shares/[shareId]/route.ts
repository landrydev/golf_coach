import { requireApiIdentity } from "@/lib/identity";
import {
  assertExactObjectKeys,
  assertSameOrigin,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { revokeShareLink } from "@/lib/plans";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { requestCorrelationId } from "@/lib/request-correlation";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return authentication.response;
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const { shareId } = await context.params;
    await enforceAbuseLimit(ABUSE_LIMITS.shareRevokeAccount, account.id);

    const payload = asObject(await readJson<unknown>(request));
    assertExactObjectKeys(payload, ["confirmation"]);
    if (payload.confirmation !== "revoke_private_share_access") {
      throw new RequestError(
        400,
        "share_revocation_confirmation_required",
        "Confirm the private-access revocation before continuing.",
      );
    }

    await revokeShareLink({
      accountId: account.id,
      shareId,
      reason: "Revoked from account access controls",
      requestId,
    });
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Request-ID": requestId,
      },
    });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
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
