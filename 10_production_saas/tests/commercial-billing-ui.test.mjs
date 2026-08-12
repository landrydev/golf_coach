import assert from "node:assert/strict";
import test from "node:test";
import {
  identityHeaders,
  startD1Worker,
  syntheticBillingCommercialPolicyJson,
} from "./support/d1-worker.mjs";

const coach = {
  email: "coach.a@example.test",
  name: "Commercial Journey Coach",
};
const PRICE_ID = "price_commercial_ui_test";
const configuredBilling = {
  STRIPE_SECRET_KEY: "sk_test_commercial_ui_only",
  STRIPE_WEBHOOK_SECRET: "whsec_commercial_ui_only",
  STRIPE_CHECKOUT_PRICE_ID: PRICE_ID,
  STRIPE_RECOGNIZED_PRICE_IDS: PRICE_ID,
  SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: PRICE_ID,
  SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
  STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS: "3600",
  BILLING_COMMERCIAL_POLICY_JSON:
    syntheticBillingCommercialPolicyJson(PRICE_ID),
  INSTRUCTOR_ACCESS_MODE: "subscription_required",
  SUBSCRIPTION_ACCESS_STATUSES: "trialing,active",
};

test(
  "billing UI demonstrates configuration-ready fail-closed state and separate package path",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({ BILLING_CHECKOUT_ENABLED: "false" });
    context.after(() => worker.dispose());

    const response = await billingPage(worker);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /CONFIGURATION READY — EXTERNAL ACTIVATION PENDING/);
    assert.match(html, /No charge can be initiated from this environment/);
    assert.match(html, /Commercial activation checklist/);
    assert.match(html, /Public identity boundary/);
    assert.match(html, /Exact Roadmap Solo offer/);
    assert.match(html, /Stripe test\/live provider configuration/);
    assert.match(html, /Subscription entitlement policy/);
    assert.match(html, /Roadmap billing and coaching packages are separate/);
    assert.match(html, /Roadmap SaaS subscription/);
    assert.match(html, /Your golfer coaching package/);
    assert.match(html, /href="\/app\/packages"/);
    assert.match(html, /Review secure checkout/);
    assert.match(html, /disabled/);
    assert.doesNotMatch(html, /sk_test_|whsec_|OWNER_PRIVATE_ACCESS_PEPPER/);
  },
);

test(
  "configured test-mode offer is visible and Checkout is available without implying activation",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({
      ...configuredBilling,
      BILLING_CHECKOUT_ENABLED: "true",
    });
    context.after(() => worker.dispose());

    const response = await billingPage(worker);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Configured Roadmap Solo terms/);
    assert.match(html, /test mode/i);
    assert.match(html, /CAD(?:\s|&nbsp;)*75\.00 every month/);
    assert.match(html, /No synthetic trial in this test policy/);
    assert.match(html, /SYNTHETIC-TEST-POLICY-NOT-OWNER-APPROVAL/);
    assert.match(html, /Review the exact recurring amount before paying/);
    assert.match(html, /Review secure checkout/);
    assert.match(html, /CONFIGURATION READY — EXTERNAL ACTIVATION PENDING/);
    assert.match(html, /public domain, OIDC issuer and client/i);
    assert.doesNotMatch(html, /sk_test_commercial_ui_only|whsec_commercial_ui_only/);
  },
);

test(
  "billing UI gives truthful guidance for every provider subscription state",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker({
      ...configuredBilling,
      BILLING_CHECKOUT_ENABLED: "false",
    });
    context.after(() => worker.dispose());

    assert.equal((await billingPage(worker)).status, 200);
    const [account] = await worker.inspect([
      {
        sql: "select id from accounts where normalized_email = ?",
        params: [coach.email],
      },
    ]);
    const accountId = account.results[0].id;
    await worker.inspect([
      {
        sql: `insert into billing_customers
          (provider, provider_customer_id, account_id)
          values ('stripe', 'cus_commercial_ui', ?)`,
        params: [accountId],
      },
      {
        sql: `insert into subscriptions (
          id, account_id, provider, provider_customer_id,
          provider_subscription_id, provider_price_id, product_code,
          status, billing_interval, currency, unit_amount_minor,
          current_period_starts_at, current_period_ends_at,
          last_provider_sync_at
        ) values (
          'subscription-commercial-ui', ?, 'stripe', 'cus_commercial_ui',
          'sub_commercial_ui', ?, 'roadmap_solo', 'active', 'month', 'CAD',
          7500, ?, ?, ?
        )`,
        params: [
          accountId,
          PRICE_ID,
          Date.now() - 86_400_000,
          Date.now() + 86_400_000,
          Date.now(),
        ],
      },
    ]);

    const states = [
      ["incomplete", "Subscription setup is incomplete"],
      ["trialing", "Stripe reports a trialing subscription"],
      ["active", "Stripe reports an active subscription"],
      ["past_due", "Payment needs attention"],
      ["paused", "Stripe reports the subscription as paused"],
      ["canceled", "Stripe reports a canceled subscription"],
      ["unpaid", "Stripe reports the subscription as unpaid"],
      ["ended", "The prior subscription has ended"],
    ];
    for (const [status, guidance] of states) {
      await worker.inspect([
        {
          sql: `update subscriptions
            set status = ?, trial_ends_at = ?, updated_at = ?
            where id = 'subscription-commercial-ui'`,
          params: [
            status,
            status === "trialing" ? Date.now() + 86_400_000 : null,
            Date.now(),
          ],
        },
      ]);
      const response = await billingPage(worker);
      assert.equal(response.status, 200, status);
      const html = await response.text();
      assert.match(html, new RegExp(guidance), status);
      assert.match(html, /CAD(?:\s|&nbsp;)*75\.00 every month/, status);
      assert.match(html, /Latest provider-authoritative state synchronized from Stripe/, status);
    }
  },
);

function billingPage(worker) {
  return worker.dispatch("/app/billing", {
    headers: {
      ...identityHeaders(coach.email, coach.name),
      accept: "text/html",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
    },
  });
}
