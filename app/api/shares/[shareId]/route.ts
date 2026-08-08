import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { requireApiIdentity } from "@/lib/identity";
import { assertSameOrigin, cleanText, errorResponse, readJson } from "@/lib/http";
import { revokeShareLink } from "@/lib/plans";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  try {
    assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return authentication.response;
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const { shareId } = await context.params;
    await enforceAbuseLimit(ABUSE_LIMITS.shareRevokeAccount, account.id);
    const payload = await readJson<{ reason?: unknown }>(request);
    const reason = cleanText(payload.reason, "reason", {
      required: true,
      max: 300,
    });
    await revokeShareLink({
      accountId: account.id,
      shareId,
      reason,
      requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
    });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
