import {
  getSubscriptionForAccount,
  isOpenSubscription,
  recordHostedBillingSession,
} from "@/lib/billing-repository";
import { assertSameOrigin, errorResponse, RequestError } from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";
import { checkoutEnabled, createCheckoutSession } from "@/lib/stripe";
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
    await enforceAbuseLimit(ABUSE_LIMITS.billingCheckoutAccount, account.id);
    if (!checkoutEnabled()) {
      throw new RequestError(
        503,
        "billing_not_configured",
        "Billing is not available yet. No charge was made.",
      );
    }

    const existing = await getSubscriptionForAccount(account.id);
    if (existing && isOpenSubscription(existing)) {
      throw new RequestError(
        409,
        "subscription_already_open",
        "This account already has an open subscription. Use billing management instead.",
      );
    }

    const origin = applicationOrigin(request);
    const session = await createCheckoutSession({
      accountId: account.id,
      email: account.primaryEmail,
      customerId: existing?.providerCustomerId ?? null,
      successUrl: `${origin}/app/billing?checkout=complete`,
      cancelUrl: `${origin}/app/billing?checkout=canceled`,
    });
    const location = hostedBillingUrl(session.url);
    await recordHostedBillingSession({
      accountId: account.id,
      kind: "checkout",
      providerSessionId: session.id,
      requestId: requestId(request),
    });
    return billingRedirect(location);
  } catch (error) {
    return errorResponse(error);
  }
}
