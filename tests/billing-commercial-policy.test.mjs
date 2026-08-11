import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import {
  billingCommercialPolicyMatchesProviderCredential,
  billingCommercialPolicyMatchesPrice,
  readBillingCommercialPolicy,
} from "../lib/billing-commercial-policy.ts";
import { syntheticBillingCommercialPolicyJson } from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const { checkoutEnabled } = await import("../lib/stripe.ts");
const { parseStripeSubscriptionProjection } = await import(
  "../lib/stripe-subscription.ts"
);

const PRICE_ID = "price_commercial_policy_test";

test("commercial terms are exact owner configuration with no defaults", () => {
  const policy = readBillingCommercialPolicy(
    syntheticBillingCommercialPolicyJson(PRICE_ID),
  );
  assert.ok(policy);
  assert.deepEqual(policy, {
    version: "synthetic-test-v1",
    approvalReference: "SYNTHETIC-TEST-POLICY-NOT-OWNER-APPROVAL",
    providerMode: "test",
    priceId: PRICE_ID,
    currency: "CAD",
    amountMinor: 7_500,
    billingInterval: "month",
    trialTerms: "No synthetic trial in this test policy.",
    cancellationTerms:
      "Synthetic cancellation is reflected only after a signed provider state update.",
    pauseResumeTerms:
      "Synthetic pause and resume use the Stripe test Portal and signed state updates.",
    taxTerms: "Synthetic test amount; no real tax calculation or charge.",
    refundTerms: "Synthetic test mode only; no real refund is created.",
    failedPaymentTerms:
      "Synthetic failed payment follows the explicitly configured entitlement statuses.",
    dataAfterEndTerms:
      "Synthetic records remain test-only; this is not an approved retention policy.",
    supportContact: "Synthetic test support route: /support",
  });
  assert.equal(
    billingCommercialPolicyMatchesPrice({
      policy,
      priceId: PRICE_ID,
      currency: "cad",
      amountMinor: 7_500,
      billingInterval: "month",
    }),
    true,
  );
  assert.equal(
    billingCommercialPolicyMatchesProviderCredential(
      policy,
      "sk_test_synthetic_only",
    ),
    true,
  );
  assert.equal(
    billingCommercialPolicyMatchesProviderCredential(
      policy,
      "sk_live_wrong_mode",
    ),
    false,
  );
});

test("commercial policy rejects missing, partial, padded, extended, and mismatched Price values", () => {
  const valid = JSON.parse(syntheticBillingCommercialPolicyJson(PRICE_ID));
  const invalid = [
    undefined,
    "",
    " {}",
    "{}",
    JSON.stringify({ ...valid, extra: true }),
    JSON.stringify({ ...valid, approvalReference: "" }),
    JSON.stringify({ ...valid, version: " padded " }),
    JSON.stringify({ ...valid, priceId: "prod_not_a_price" }),
    JSON.stringify({ ...valid, currency: "USD" }),
    JSON.stringify({ ...valid, amountMinor: 0 }),
    JSON.stringify({ ...valid, amountMinor: 7_500.5 }),
    JSON.stringify({ ...valid, billingInterval: "week" }),
    JSON.stringify({ ...valid, providerMode: "sandbox" }),
    JSON.stringify({ ...valid, refundTerms: "bad\ntext" }),
  ];
  for (const serialized of invalid) {
    assert.equal(readBillingCommercialPolicy(serialized), null);
  }

  const policy = readBillingCommercialPolicy(JSON.stringify(valid));
  assert.ok(policy);
  for (const mismatch of [
    { priceId: "price_other", currency: "cad", amountMinor: 7_500, billingInterval: "month" },
    { priceId: PRICE_ID, currency: "usd", amountMinor: 7_500, billingInterval: "month" },
    { priceId: PRICE_ID, currency: "cad", amountMinor: 7_501, billingInterval: "month" },
    { priceId: PRICE_ID, currency: "cad", amountMinor: 7_500, billingInterval: "year" },
  ]) {
    assert.equal(
      billingCommercialPolicyMatchesPrice({ policy, ...mismatch }),
      false,
    );
  }
});

test("Checkout stays fail-closed until terms, Price, entitlement, and activation agree", () => {
  const configuration = {
    STRIPE_SECRET_KEY: "sk_test_commercial_policy_only",
    STRIPE_WEBHOOK_SECRET: "whsec_commercial_policy_only",
    STRIPE_CHECKOUT_PRICE_ID: PRICE_ID,
    STRIPE_RECOGNIZED_PRICE_IDS: PRICE_ID,
    SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: PRICE_ID,
    SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
    STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS: "3600",
    BILLING_COMMERCIAL_POLICY_JSON:
      syntheticBillingCommercialPolicyJson(PRICE_ID),
    INSTRUCTOR_ACCESS_MODE: "subscription_required",
    SUBSCRIPTION_ACCESS_STATUSES: "trialing,active",
    BILLING_CHECKOUT_ENABLED: "true",
  };
  const previous = Object.fromEntries(
    Object.keys(configuration).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, configuration);
    assert.equal(checkoutEnabled(), true);

    for (const missing of [
      "BILLING_COMMERCIAL_POLICY_JSON",
      "SUBSCRIPTION_ACCESS_STATUSES",
      "STRIPE_WEBHOOK_SECRET",
    ]) {
      const value = process.env[missing];
      delete process.env[missing];
      assert.equal(checkoutEnabled(), false, missing);
      process.env[missing] = value;
    }

    process.env.INSTRUCTOR_ACCESS_MODE = "owner_private";
    assert.equal(checkoutEnabled(), false);
    process.env.INSTRUCTOR_ACCESS_MODE = "subscription_required";
    process.env.BILLING_COMMERCIAL_POLICY_JSON =
      syntheticBillingCommercialPolicyJson("price_other");
    assert.equal(checkoutEnabled(), false);
    process.env.BILLING_COMMERCIAL_POLICY_JSON =
      syntheticBillingCommercialPolicyJson(PRICE_ID);
    process.env.STRIPE_SECRET_KEY = "sk_live_wrong_mode";
    assert.equal(checkoutEnabled(), false);
    process.env.STRIPE_SECRET_KEY = "sk_test_commercial_policy_only";
    process.env.BILLING_CHECKOUT_ENABLED = " true ";
    assert.equal(checkoutEnabled(), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("current provider Price must match configured amount, currency, and interval", () => {
  const managed = {
    STRIPE_CHECKOUT_PRICE_ID: PRICE_ID,
    STRIPE_RECOGNIZED_PRICE_IDS: PRICE_ID,
    SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: PRICE_ID,
    SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
    BILLING_COMMERCIAL_POLICY_JSON:
      syntheticBillingCommercialPolicyJson(PRICE_ID),
  };
  const previous = Object.fromEntries(
    Object.keys(managed).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, managed);
    const base = syntheticSubscription();
    const parsed = parseStripeSubscriptionProjection(base, "account-commercial");
    assert.equal(parsed.currency, "CAD");
    assert.equal(parsed.unitAmountMinor, 7_500);
    assert.equal(parsed.billingInterval, "month");

    for (const price of [
      { currency: "usd", unit_amount: 7_500, recurring: { interval: "month" } },
      { currency: "cad", unit_amount: 7_501, recurring: { interval: "month" } },
      { currency: "cad", unit_amount: 7_500, recurring: { interval: "year" } },
    ]) {
      const mismatch = structuredClone(base);
      Object.assign(mismatch.items.data[0].price, price);
      assert.throws(
        () => parseStripeSubscriptionProjection(mismatch, "account-commercial"),
        (error) => error?.code === "billing_commercial_policy_mismatch",
      );
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

function syntheticSubscription() {
  const now = Math.floor(Date.now() / 1_000);
  return {
    id: "sub_commercial_policy",
    customer: "cus_commercial_policy",
    status: "active",
    currency: "cad",
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    trial_start: null,
    trial_end: null,
    metadata: { account_id: "account-commercial", price_id: PRICE_ID },
    items: {
      data: [
        {
          quantity: 1,
          current_period_start: now - 600,
          current_period_end: now + 3_000,
          price: {
            id: PRICE_ID,
            currency: "cad",
            unit_amount: 7_500,
            recurring: { interval: "month" },
          },
        },
      ],
    },
  };
}
