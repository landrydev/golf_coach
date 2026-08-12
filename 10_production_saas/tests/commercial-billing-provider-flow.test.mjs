import assert from "node:assert/strict";
import test from "node:test";
import {
  identityHeaders,
  startD1Worker,
  syntheticBillingCommercialPolicyJson,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "coach.a@example.test",
  name: "Commercial Provider Coach",
};
const PRICE_ID = "price_commercial_provider_test";

test(
  "an existing synthetic customer can open the Stripe test Portal through the real route",
  { timeout: 60_000 },
  async (context) => {
    const calls = [];
    const worker = await startD1Worker(
      {
        STRIPE_SECRET_KEY: "sk_test_commercial_provider_only",
        STRIPE_WEBHOOK_SECRET: "whsec_commercial_provider_only",
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
      },
      {
        outboundService: async (request) => {
          calls.push(request.url);
          const url = new URL(request.url);
          assert.equal(request.method, "POST");
          assert.equal(url.pathname, "/v1/billing_portal/sessions");
          assert.equal(
            request.headers.get("authorization"),
            "Bearer sk_test_commercial_provider_only",
          );
          const body = new URLSearchParams(await request.text());
          assert.equal(body.get("customer"), "cus_commercial_provider");
          assert.equal(body.get("return_url"), `${testOrigin}/app/billing`);
          return Response.json({
            id: "bps_commercial_provider",
            url: "https://billing.stripe.com/p/session/commercial-provider",
          });
        },
      },
    );
    context.after(() => worker.dispose());

    const profile = await worker.dispatch("/api/profile", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(profile.status, 200);
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
          values ('stripe', 'cus_commercial_provider', ?)`,
        params: [accountId],
      },
    ]);

    const portal = await worker.dispatch("/api/billing/portal", {
      method: "POST",
      redirect: "manual",
      headers: writeHeaders(coach.email, coach.name),
      body: "{}",
    });
    assert.equal(portal.status, 303);
    assert.equal(
      portal.headers.get("location"),
      "https://billing.stripe.com/p/session/commercial-provider",
    );
    assert.equal(calls.length, 1);

    const [audit] = await worker.inspect([
      {
        sql: `select action, target_type, target_id, metadata
          from audit_events where action = 'billing.portal_session_created'`,
      },
    ]);
    assert.equal(audit.results.length, 1);
    assert.equal(audit.results[0].action, "billing.portal_session_created");
    assert.equal(audit.results[0].target_type, "billing_session");
    assert.equal(audit.results[0].target_id, "bps_commercial_provider");
    assert.equal(JSON.stringify(audit.results[0]).includes("billing.stripe.com"), false);
  },
);
