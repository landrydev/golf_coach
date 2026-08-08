import { reconcileBillingAccount } from "@/lib/billing-reconciliation";
import { assertSameOrigin, errorResponse, RequestError } from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";
import { billingRedirect, requestId } from "../_shared";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return authentication.response;
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    await enforceAbuseLimit(
      ABUSE_LIMITS.billingReconcileAccount,
      account.id,
    );
    await reconcileBillingAccount({
      accountId: account.id,
      requestId: requestId(request),
    });
    // Query parameters are user-controlled navigation context, so never encode
    // a provider outcome that the billing page could mistake for proof.
    return billingRedirect("/app/billing?reconcile=refresh_review");
  } catch (error) {
    const recovery = browserRecoveryRedirect(request, error);
    if (recovery) return recovery;
    return errorResponse(error);
  }
}

function browserRecoveryRedirect(
  request: Request,
  error: unknown,
): Response | null {
  if (!acceptsHtml(request) || !(error instanceof RequestError)) return null;

  const notice =
    error.code === "billing_reconciliation_in_progress" ||
    error.code === "billing_operation_in_progress" ||
    error.code === "billing_operation_lease_lost"
      ? "refresh_in_progress"
      : error.status === 429
        ? "refresh_rate_limited"
        : error.status === 502 || error.status === 503
          ? "refresh_unavailable"
          : null;
  if (!notice) return null;

  return billingRedirect(
    `/app/billing?reconcile=${encodeURIComponent(notice)}`,
  );
}

function acceptsHtml(request: Request): boolean {
  return (request.headers.get("accept") ?? "")
    .split(",")
    .some((value) => value.trim().split(";", 1)[0] === "text/html");
}
