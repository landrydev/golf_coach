import {
  billingCommercialPolicyMatchesProviderCredential,
  configuredBillingCommercialPolicy,
} from "@/lib/billing-commercial-policy";
import { instructorAuthConfigurationReady } from "@/lib/instructor-auth-contract";
import { productAccessConfigurationReady } from "@/lib/product-access";
import {
  billingConfigured,
  checkoutConfiguration,
  checkoutEnabled,
  configuredBillingPolicy,
} from "@/lib/stripe";

export type CommercialActivationCheck = Readonly<{
  id: "identity" | "offer" | "stripe" | "entitlement" | "activation";
  label: string;
  ready: boolean;
  detail: string;
}>;

export type CommercialActivationReadiness = Readonly<{
  status:
    | "configuration_ready_external_activation_pending"
    | "configuration_supplied_controlled_evidence_required";
  checks: readonly CommercialActivationCheck[];
}>;

/**
 * Produce a value-safe commercial activation view. It reports only booleans
 * and fixed explanations; secret values, provider identifiers, and raw policy
 * JSON never leave the server through this helper.
 */
export function loadCommercialActivationReadiness(): CommercialActivationReadiness {
  const commercialPolicy = configuredBillingCommercialPolicy();
  const billingPolicy = configuredBillingPolicy();
  const identityReady =
    process.env.INSTRUCTOR_AUTH_MODE === "oidc_v1" &&
    instructorAuthConfigurationReady({
      APP_URL: process.env.APP_URL,
      INSTRUCTOR_AUTH_MODE: process.env.INSTRUCTOR_AUTH_MODE,
      OIDC_ISSUER: process.env.OIDC_ISSUER,
      OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID,
      OIDC_TOKEN_ENDPOINT_AUTH_METHOD:
        process.env.OIDC_TOKEN_ENDPOINT_AUTH_METHOD,
      OIDC_ID_TOKEN_SIGNING_ALG: process.env.OIDC_ID_TOKEN_SIGNING_ALG,
      AUTH_SESSION_LIFETIME_SECONDS:
        process.env.AUTH_SESSION_LIFETIME_SECONDS,
      OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET,
      AUTH_SESSION_PEPPER: process.env.AUTH_SESSION_PEPPER,
      AUTH_TRANSACTION_ENCRYPTION_KEY:
        process.env.AUTH_TRANSACTION_ENCRYPTION_KEY,
    });
  const offerReady = Boolean(
    commercialPolicy &&
      billingPolicy &&
      commercialPolicy.priceId === billingPolicy.checkoutPriceId,
  );
  const stripeReady =
    billingConfigured() &&
    Boolean(checkoutConfiguration()) &&
    offerReady &&
    Boolean(
      commercialPolicy &&
        billingCommercialPolicyMatchesProviderCredential(
          commercialPolicy,
          process.env.STRIPE_SECRET_KEY,
        ),
    );
  const entitlementReady =
    process.env.INSTRUCTOR_ACCESS_MODE === "subscription_required" &&
    productAccessConfigurationReady({
      INSTRUCTOR_ACCESS_MODE: process.env.INSTRUCTOR_ACCESS_MODE,
      OWNER_PRIVATE_ACCESS_PEPPER: process.env.OWNER_PRIVATE_ACCESS_PEPPER,
      OWNER_PRIVATE_EMAIL_DIGESTS: process.env.OWNER_PRIVATE_EMAIL_DIGESTS,
      SUBSCRIPTION_ACCESS_STATUSES:
        process.env.SUBSCRIPTION_ACCESS_STATUSES,
      STRIPE_CHECKOUT_PRICE_ID: process.env.STRIPE_CHECKOUT_PRICE_ID,
      STRIPE_RECOGNIZED_PRICE_IDS:
        process.env.STRIPE_RECOGNIZED_PRICE_IDS,
      SUBSCRIPTION_ENTITLEMENT_PRICE_IDS:
        process.env.SUBSCRIPTION_ENTITLEMENT_PRICE_IDS,
      SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS:
        process.env.SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS,
    });
  const activationReady =
    identityReady && stripeReady && entitlementReady && checkoutEnabled();

  const checks: CommercialActivationCheck[] = [
    {
      id: "identity",
      label: "Public identity boundary",
      ready: identityReady,
      detail: identityReady
        ? "The canonical public origin and OIDC sign-in boundary are configured."
        : "Owner/provider input still required: public domain, OIDC issuer and client, approved signup policy, and secret/session configuration.",
    },
    {
      id: "offer",
      label: "Exact Roadmap Solo offer",
      ready: offerReady,
      detail: offerReady
        ? "A versioned exact price and commercial-consequences record matches the configured Checkout Price."
        : "Owner input still required: exact price, trial, cancellation, pause/resume, tax, refund, failed-payment, data-after-end, and support terms.",
    },
    {
      id: "stripe",
      label: "Stripe test/live provider configuration",
      ready: stripeReady,
      detail: stripeReady
        ? "The Price allowlists, session lifetime, and required provider secrets are configured. Secret values are never shown here."
        : "Provider input still required: Stripe account, Product/Price, test or live credentials, webhook signing secret, Portal configuration, and Checkout lifetime.",
    },
    {
      id: "entitlement",
      label: "Subscription entitlement policy",
      ready: entitlementReady,
      detail: entitlementReady
        ? "Exact eligible subscription statuses, Prices, and projection freshness are configured."
        : "Owner input still required: the statuses and Prices that grant product access, plus failed-payment and ended-account consequences.",
    },
    {
      id: "activation",
      label: "Controlled commercial activation",
      ready: activationReady,
      detail: activationReady
        ? "Checkout is enabled in configuration; controlled provider evidence is still required before any public/live claim."
        : "Checkout remains fail-closed. No charge can start until every dependency above is supplied and the explicit activation flag is enabled.",
    },
  ];

  return Object.freeze({
    status: activationReady
      ? "configuration_supplied_controlled_evidence_required"
      : "configuration_ready_external_activation_pending",
    checks: Object.freeze(checks.map((check) => Object.freeze(check))),
  });
}
