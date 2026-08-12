import { requireApiIdentity } from "@/lib/identity";
import { errorResponse } from "@/lib/http";
import { listAccountActiveShareControls } from "@/lib/plans";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { requestCorrelationId } from "@/lib/request-correlation";

export async function GET(request: Request) {
  const requestId = requestCorrelationId(request);
  try {
    const authentication = await requireApiIdentity();
    if (authentication.response) return withRequestId(authentication.response, requestId);
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    await enforceAbuseLimit(ABUSE_LIMITS.shareRevokeAccount, account.id);
    const shares = await listAccountActiveShareControls(account.id);

    return Response.json(
      {
        shares: shares.map((share) => ({
          id: share.id,
          planRevision: share.planRevision,
          status: share.status,
          createdAt: new Date(share.createdAt).toISOString(),
          expiresAt:
            share.expiresAt === null
              ? null
              : new Date(share.expiresAt).toISOString(),
          lastAccessedAt:
            share.lastAccessedAt === null
              ? null
              : new Date(share.lastAccessedAt).toISOString(),
          accessCount: share.accessCount,
          activeSessionCount: share.activeSessionCount,
        })),
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Request-ID": requestId,
        },
      },
    );
  } catch (error) {
    return withRequestId(errorResponse(error), requestId);
  }
}

function withRequestId(response: Response, requestId: string): Response {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Request-ID", requestId);
  return response;
}
