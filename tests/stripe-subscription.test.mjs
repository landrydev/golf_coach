import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const {
  parseStripeSubscriptionProjection,
  StripeSubscriptionProjectionError,
} = await import("../lib/stripe-subscription.ts");

const PRICE_ID = "price_quantity_test";
const policyKeys = [
  "STRIPE_CHECKOUT_PRICE_ID",
  "STRIPE_RECOGNIZED_PRICE_IDS",
  "SUBSCRIPTION_ENTITLEMENT_PRICE_IDS",
  "SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS",
];

test("Stripe subscription projection requires item quantity exactly one", () => {
  const previous = Object.fromEntries(
    policyKeys.map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, {
    STRIPE_CHECKOUT_PRICE_ID: PRICE_ID,
    STRIPE_RECOGNIZED_PRICE_IDS: PRICE_ID,
    SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: PRICE_ID,
    SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
  });

  try {
    const projection = parseStripeSubscriptionProjection(
      stripeSubscription(1),
      "account_quantity_test",
    );
    assert.equal(projection.providerPriceId, PRICE_ID);

    for (const quantity of [undefined, null, 0, 2, -1, "1", true]) {
      const subscription = stripeSubscription(quantity);
      if (quantity === undefined) {
        delete subscription.items.data[0].quantity;
      }
      assert.throws(
        () =>
          parseStripeSubscriptionProjection(
            subscription,
            "account_quantity_test",
          ),
        (error) => {
          assert.ok(error instanceof StripeSubscriptionProjectionError);
          assert.equal(error.code, "subscription_quantity_unsupported");
          assert.equal(error.message, error.safeMessage);
          return true;
        },
      );
    }
  } finally {
    for (const key of policyKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

function stripeSubscription(quantity) {
  return {
    id: "sub_quantity_test",
    customer: "cus_quantity_test",
    status: "active",
    currency: "cad",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          quantity,
          current_period_start: 1_786_118_400,
          current_period_end: 1_788_710_400,
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
