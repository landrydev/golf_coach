import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { startD1Worker, testOrigin } from "./support/d1-worker.mjs";

const WEBHOOK_SECRET = "whsec_synthetic_webhook_integration_only";
const SECRET_KEY = "sk_test_synthetic_webhook_integration_only";
const CHECKOUT_PRICE = "price_current_entitled_test";
const HISTORICAL_PRICE = "price_historical_recognized_test";

test(
  "signed Checkout completion atomically projects real D1 state and replays once",
  { timeout: 60_000 },
  async (context) => {
    const accountId = "account_webhook_integration";
    const attemptId = "attempt_webhook_integration";
    const sessionId = "cs_webhook_integration";
    const customerId = "cus_webhook_integration";
    const subscriptionId = "sub_webhook_integration";
    const eventId = "evt_webhook_integration";
    const reconciliationId = "reconciliation_webhook_integration";
    const nowSeconds = Math.floor(Date.now() / 1_000);
    let providerCalls = 0;

    const worker = await startD1Worker(
      {
        STRIPE_SECRET_KEY: SECRET_KEY,
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        STRIPE_CHECKOUT_PRICE_ID: CHECKOUT_PRICE,
        STRIPE_RECOGNIZED_PRICE_IDS: `${CHECKOUT_PRICE},${HISTORICAL_PRICE}`,
        SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: CHECKOUT_PRICE,
        SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
        STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS: "3600",
        BILLING_CHECKOUT_ENABLED: "false",
      },
      {
        outboundService: async (request) => {
          providerCalls += 1;
          const url = new URL(request.url);
          assert.equal(request.method, "GET");
          assert.equal(
            url.pathname,
            `/v1/subscriptions/${subscriptionId}`,
          );
          assert.equal(request.headers.get("authorization"), `Bearer ${SECRET_KEY}`);
          return Response.json(
            stripeSubscription({
              accountId,
              attemptId,
              customerId,
              subscriptionId,
              priceId: HISTORICAL_PRICE,
              nowSeconds,
            }),
          );
        },
      },
    );
    context.after(() => worker.dispose());

    const createdAt = (nowSeconds - 60) * 1_000;
    const expiresAt = (nowSeconds + 3_600) * 1_000;
    await worker.inspect([
      {
        sql: `insert into accounts (
          id, auth_subject, primary_email, normalized_email,
          email_verified_at, status
        ) values (?, ?, ?, ?, ?, 'active')`,
        params: [
          accountId,
          "subject-webhook-integration",
          "webhook.integration@example.test",
          "webhook.integration@example.test",
          createdAt,
        ],
      },
      {
        sql: `insert into billing_checkout_attempts (
          id, account_id, provider, state, request_version,
          idempotency_key, provider_price_id, application_origin,
          provider_customer_id, customer_email, provider_expires_at,
          created_at, updated_at
        ) values (?, ?, 'stripe', 'reserved', 1, ?, ?, ?, null, ?, ?, ?, ?)`,
        params: [
          attemptId,
          accountId,
          `roadmap-checkout-v1-${attemptId}`,
          HISTORICAL_PRICE,
          testOrigin,
          "webhook.integration@example.test",
          expiresAt,
          createdAt,
          createdAt,
        ],
      },
      {
        sql: `insert into billing_reconciliation_targets (
          id, account_id, provider, subscription_id, checkout_attempt_id,
          state, lease_token, lease_expires_at, last_attempt_at,
          processing_attempts, last_error_code, last_error_message,
          last_completed_at, last_succeeded_at, created_at, updated_at
        ) values (?, ?, 'stripe', null, ?, 'failed', null, null, ?, 8,
          'billing_provider_error', 'Provider retrieval failed.', ?, null, ?, ?)`,
        params: [
          reconciliationId,
          accountId,
          attemptId,
          createdAt,
          createdAt,
          createdAt,
          createdAt,
        ],
      },
    ]);

    const event = {
      id: eventId,
      type: "checkout.session.completed",
      created: nowSeconds,
      data: {
        object: {
          id: sessionId,
          mode: "subscription",
          status: "complete",
          created: nowSeconds - 60,
          client_reference_id: accountId,
          customer: customerId,
          subscription: subscriptionId,
          metadata: {
            account_id: accountId,
            checkout_attempt_id: attemptId,
            price_id: HISTORICAL_PRICE,
          },
        },
      },
    };
    const rawBody = JSON.stringify(event);
    const first = await signedWebhook(worker, rawBody, nowSeconds);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), {
      received: true,
      disposition: "processed",
      duplicate: false,
    });
    assert.equal(providerCalls, 1);

    const inspection = await worker.inspect([
      {
        sql: `select provider_customer_id, account_id
          from billing_customers where provider = 'stripe'`,
      },
      {
        sql: `select account_id, provider_customer_id,
          provider_subscription_id, provider_price_id, status,
          last_provider_sync_at
          from subscriptions where provider_subscription_id = ?`,
        params: [subscriptionId],
      },
      {
        sql: `select state, provider_session_id, provider_customer_id,
          completed_at, last_error_code
          from billing_checkout_attempts where id = ?`,
        params: [attemptId],
      },
      {
        sql: `select status, processing_attempts, lease_token,
          lease_expires_at, account_id, subscription_id
          from billing_events where provider_event_id = ?`,
        params: [eventId],
      },
      {
        sql: `select count(*) as count from audit_events
          where action = 'billing.subscription_synced'
            and actor_reference = ?`,
        params: [eventId],
      },
      {
        sql: `select state, lease_token, lease_expires_at, last_error_code,
          last_error_message, last_completed_at, last_succeeded_at
          from billing_reconciliation_targets where id = ?`,
        params: [reconciliationId],
      },
    ]);
    assert.deepEqual(inspection[0].results, [
      { provider_customer_id: customerId, account_id: accountId },
    ]);
    assert.deepEqual(
      {
        ...inspection[1].results[0],
        last_provider_sync_at: Boolean(
          inspection[1].results[0].last_provider_sync_at,
        ),
      },
      {
        account_id: accountId,
        provider_customer_id: customerId,
        provider_subscription_id: subscriptionId,
        provider_price_id: HISTORICAL_PRICE,
        status: "active",
        last_provider_sync_at: true,
      },
    );
    assert.deepEqual(
      {
        ...inspection[2].results[0],
        completed_at: Boolean(inspection[2].results[0].completed_at),
      },
      {
        state: "completed",
        provider_session_id: sessionId,
        provider_customer_id: customerId,
        completed_at: true,
        last_error_code: null,
      },
    );
    const eventRow = inspection[3].results[0];
    assert.equal(eventRow.status, "processed");
    assert.equal(eventRow.processing_attempts, 1);
    assert.equal(eventRow.lease_token, null);
    assert.equal(eventRow.lease_expires_at, null);
    assert.equal(eventRow.account_id, accountId);
    assert.ok(eventRow.subscription_id);
    assert.equal(inspection[4].results[0].count, 1);
    assert.deepEqual(
      {
        ...inspection[5].results[0],
        last_completed_at: Boolean(inspection[5].results[0].last_completed_at),
        last_succeeded_at: Boolean(inspection[5].results[0].last_succeeded_at),
      },
      {
        state: "succeeded",
        lease_token: null,
        lease_expires_at: null,
        last_error_code: null,
        last_error_message: null,
        last_completed_at: true,
        last_succeeded_at: true,
      },
    );

    const duplicate = await signedWebhook(worker, rawBody, nowSeconds);
    assert.equal(duplicate.status, 200);
    assert.deepEqual(await duplicate.json(), {
      received: true,
      disposition: "processed",
      duplicate: true,
    });
    assert.equal(providerCalls, 1);

    const afterReplay = await worker.inspect([
      {
        sql: `select processing_attempts from billing_events
          where provider_event_id = ?`,
        params: [eventId],
      },
      {
        sql: `select count(*) as count from audit_events
          where action = 'billing.subscription_synced'
            and actor_reference = ?`,
        params: [eventId],
      },
    ]);
    assert.equal(afterReplay[0].results[0].processing_attempts, 1);
    assert.equal(afterReplay[1].results[0].count, 1);
  },
);

test(
  "Checkout webhook classification retries malformed local events and ignores foreign ones",
  { timeout: 60_000 },
  async (context) => {
    await context.test("malformed local completion remains retryable", async () => {
      const accountId = "account_webhook_malformed_local";
      const attemptId = "attempt_webhook_malformed_local";
      const sessionId = "cs_webhook_malformed_local";
      const eventId = "evt_webhook_malformed_local";
      const nowSeconds = Math.floor(Date.now() / 1_000);
      let providerCalls = 0;
      const worker = await startD1Worker(
        { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET },
        {
          outboundService: async () => {
            providerCalls += 1;
            return Response.json({});
          },
        },
      );
      context.after(() => worker.dispose());
      await seedLocalOpenAttempt(worker, {
        accountId,
        attemptId,
        sessionId,
        nowSeconds,
      });

      const rawBody = JSON.stringify({
        id: eventId,
        type: "checkout.session.completed",
        created: nowSeconds,
        data: {
          object: {
            id: sessionId,
            mode: "subscription",
            status: "complete",
            created: nowSeconds - 60,
            client_reference_id: accountId,
            customer: "cus_webhook_malformed_local",
            subscription: "sub_webhook_malformed_local",
            metadata: {
              account_id: accountId,
              checkout_attempt_id: attemptId,
              // A local paid Session with missing frozen Price metadata must
              // retry instead of being acknowledged as an unrelated event.
            },
          },
        },
      });
      const response = await signedWebhook(worker, rawBody, nowSeconds);
      assert.equal(response.status, 500);
      assert.equal(
        (await response.json()).error.code,
        "checkout_ownership_metadata_missing",
      );
      assert.equal(providerCalls, 0);

      const inspection = await worker.inspect([
        {
          sql: `select state, provider_session_id
            from billing_checkout_attempts where id = ?`,
          params: [attemptId],
        },
        {
          sql: `select status, account_id, last_error_code,
            processing_attempts from billing_events where provider_event_id = ?`,
          params: [eventId],
        },
      ]);
      assert.deepEqual(inspection[0].results, [
        { state: "open", provider_session_id: sessionId },
      ]);
      assert.deepEqual(inspection[1].results, [
        {
          status: "failed",
          account_id: accountId,
          last_error_code: "checkout_ownership_metadata_missing",
          processing_attempts: 1,
        },
      ]);
    });

    await context.test("malformed foreign completion is acknowledged", async () => {
      const nowSeconds = Math.floor(Date.now() / 1_000);
      let providerCalls = 0;
      const worker = await startD1Worker(
        { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET },
        {
          outboundService: async () => {
            providerCalls += 1;
            return Response.json({});
          },
        },
      );
      context.after(() => worker.dispose());
      const eventId = "evt_webhook_malformed_foreign";
      const rawBody = JSON.stringify({
        id: eventId,
        type: "checkout.session.completed",
        created: nowSeconds,
        data: {
          object: {
            id: "cs_webhook_malformed_foreign",
            mode: "subscription",
            status: "complete",
            subscription: "sub_webhook_malformed_foreign",
            metadata: {},
          },
        },
      });
      const response = await signedWebhook(worker, rawBody, nowSeconds);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        received: true,
        disposition: "ignored",
        duplicate: false,
      });
      assert.equal(providerCalls, 0);

      const inspection = await worker.inspect([
        {
          sql: `select status, account_id, last_error_code
            from billing_events where provider_event_id = ?`,
          params: [eventId],
        },
      ]);
      assert.deepEqual(inspection[0].results, [
        {
          status: "ignored",
          account_id: null,
          last_error_code: "checkout_not_owned",
        },
      ]);
    });
  },
);

function stripeSubscription(input) {
  return {
    id: input.subscriptionId,
    customer: input.customerId,
    status: "active",
    currency: "cad",
    cancel_at_period_end: false,
    metadata: {
      account_id: input.accountId,
      checkout_attempt_id: input.attemptId,
      price_id: input.priceId,
    },
    items: {
      data: [
        {
          quantity: 1,
          current_period_start: input.nowSeconds,
          current_period_end: input.nowSeconds + 30 * 24 * 60 * 60,
          price: {
            id: input.priceId,
            currency: "cad",
            unit_amount: 4900,
            recurring: { interval: "month" },
          },
        },
      ],
    },
  };
}

function signedWebhook(worker, rawBody, timestamp) {
  const signature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return worker.dispatch("/api/billing/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    body: rawBody,
  });
}

async function seedLocalOpenAttempt(
  worker,
  { accountId, attemptId, sessionId, nowSeconds },
) {
  const createdAt = (nowSeconds - 60) * 1_000;
  await worker.inspect([
    {
      sql: `insert into accounts (
        id, auth_subject, primary_email, normalized_email,
        email_verified_at, status
      ) values (?, ?, ?, ?, ?, 'active')`,
      params: [
        accountId,
        `subject-${accountId}`,
        `${accountId}@example.test`,
        `${accountId}@example.test`,
        createdAt,
      ],
    },
    {
      sql: `insert into billing_checkout_attempts (
        id, account_id, provider, state, request_version,
        idempotency_key, provider_price_id, application_origin,
        provider_customer_id, customer_email, provider_session_id,
        provider_created_at, provider_expires_at, created_at, updated_at
      ) values (?, ?, 'stripe', 'open', 1, ?, ?, ?, null, ?, ?, ?, ?, ?, ?)`,
      params: [
        attemptId,
        accountId,
        `roadmap-checkout-v1-${attemptId}`,
        HISTORICAL_PRICE,
        testOrigin,
        `${accountId}@example.test`,
        sessionId,
        createdAt,
        (nowSeconds + 3_600) * 1_000,
        createdAt,
        createdAt,
      ],
    },
  ]);
}
