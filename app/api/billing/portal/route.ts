import { recordHostedBillingSession } from "@/lib/billing-repository";
import { getCanonicalBillingCustomer } from "@/lib/checkout-repository";
import { assertSameOrigin, errorResponse, RequestError } from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";
import { billingConfigured, createBillingPortalSession } from "@/lib/stripe";
import {
  applicationOrigin,
  billingRedirect,
  hostedBillingUrl,
  requestId,
} from "../_shared";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return authentication.response;
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    await enforceAbuseLimit(ABUSE_LIMITS.billingPortalAccount, account.id);
    if (!billingConfigured()) {
      throw new RequestError(
        503,
        "billing_not_configured",
        "Billing management is not available yet.",
      );
    }

    const customer = await getCanonicalBillingCustomer(account.id);
    if (!customer) {
      throw new RequestError(
        409,
        "billing_customer_not_found",
        "No billing profile is available for this account.",
      );
    }

    const origin = applicationOrigin(request);
    const session = await createBillingPortalSession({
      customerId: customer.providerCustomerId,
      returnUrl: `${origin}/app/billing`,
    });
    const location = hostedBillingUrl(session.url);
    await recordHostedBillingSession({
      accountId: account.id,
      kind: "portal",
      providerSessionId: session.id,
      requestId: requestId(request),
    });
    return billingRedirect(location);
  } catch (error) {
    return errorResponse(error);
  }
}
