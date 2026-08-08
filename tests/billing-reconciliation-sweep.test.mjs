import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import {
  identityHeaders,
  startD1Worker,
  testOrigin,
} from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const { billingReconciliationBackoffMs } = await import(
  "../lib/billing-reconciliation-sweep.ts"
);

const PRICE_ID = "price_scheduled_reconciliation";
const STRIPE_SECRET = "sk_test_scheduled_reconciliation_only";
const stripeBindings = {
  STRIPE_SECRET_KEY: STRIPE_SECRET,
  STRIPE_WEBHOOK_SECRET: "whsec_scheduled_reconciliation_only",
  STRIPE_CHECKOUT_PRICE_ID: PRICE_ID,
  STRIPE_RECOGNIZED_PRICE_IDS: PRICE_ID,
  SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: PRICE_ID,
  SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
  STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS: "3600",
  BILLING_CHECKOUT_ENABLED: "false",
};

test("automatic reconciliation backoff is bounded and dead-letters after eight attempts", () => {
  assert.equal(billingReconciliationBackoffMs(1), 5 * 60 * 1_000);
  assert.equal(billingReconciliationBackoffMs(2), 15 * 60 * 1_000);
  assert.equal(billingReconciliationBackoffMs(7), 24 * 60 * 60 * 1_000);
  assert.equal(billingReconciliationBackoffMs(8), null);
  assert.equal(billingReconciliationBackoffMs(0), null);
});

test(
  "scheduled recovery completes provider-backed Checkout without another browser request",
  { timeout: 60_000 },
  async (context) => {
    const identity = {
      email: "coach.a@example.test",
      name: "Scheduled Recovery Coach",
    };
    const attemptId = "attempt_scheduled_recovery";
    const sessionId = "cs_scheduled_recovery";
    const subscriptionId = "sub_scheduled_recovery";
    const customerId = "cus_scheduled_recovery";
    const createdSeconds = Math.floor(Date.now() / 1_000) - 60;
    const expiresSeconds = createdSeconds + 3_600;
    let accountId;
    const providerCalls = [];

    const worker = await startD1Worker(stripeBindings, {
      triggerHandlers: true,
      outboundService: async (request) => {
        const url = new URL(request.url);
        providerCalls.push(`${request.method} ${url.pathname}`);
        assert.equal(request.method, "GET");
        assert.equal(
          request.headers.get("authorization"),
          `Bearer ${STRIPE_SECRET}`,
        );
        if (url.pathname === `/v1/checkout/sessions/${sessionId}`) {
          return Response.json({
            id: sessionId,
            mode: "subscription",
            status: "complete",
            url: null,
            client_reference_id: accountId,
            customer: customerId,
            subscription: subscriptionId,
            created: createdSeconds,
            expires_at: expiresSeconds,
            metadata: {
              account_id: accountId,
              checkout_attempt_id: attemptId,
              price_id: PRICE_ID,
            },
          });
        }
        if (url.pathname === `/v1/subscriptions/${subscriptionId}`) {
          return Response.json(
            stripeSubscription({
              id: subscriptionId,
              customerId,
              accountId,
              checkoutAttemptId: attemptId,
            }),
          );
        }
        return Response.json({ error: { code: "unexpected" } }, { status: 500 });
      },
    });
    context.after(() => worker.dispose());

    const profile = await worker.dispatch("/api/profile", {
      headers: identityHeaders(identity.email, identity.name),
    });
    assert.equal(profile.status, 200);
    const account = await worker.inspect([
      {
        sql: "select id from accounts where normalized_email = ?",
        params: [identity.email],
      },
    ]);
    accountId = account[0].results[0].id;
    await worker.inspect([
      {
        sql: `insert into billing_checkout_attempts (
          id, account_id, provider, state, request_version,
          idempotency_key, provider_price_id, application_origin,
          provider_customer_id, customer_email, provider_expires_at,
          provider_session_id, provider_created_at, created_at, updated_at
        ) values (?, ?, 'stripe', 'completed_pending_sync', 1, ?, ?, ?,
          null, ?, ?, ?, ?, ?, ?)`,
        params: [
          attemptId,
          accountId,
          `roadmap-checkout-v1-${attemptId}`,
          PRICE_ID,
          testOrigin,
          identity.email,
          expiresSeconds * 1_000,
          sessionId,
          createdSeconds * 1_000,
          createdSeconds * 1_000,
          createdSeconds * 1_000,
        ],
      },
    ]);

    const scheduled = await worker.dispatchScheduled();
    assert.equal(scheduled.status, 200);
    assert.deepEqual(providerCalls, [
      `GET /v1/checkout/sessions/${sessionId}`,
      `GET /v1/subscriptions/${subscriptionId}`,
    ]);

    const state = await worker.inspect([
      {
        sql: "select state from billing_checkout_attempts where id = ?",
        params: [attemptId],
      },
      {
        sql: `select provider_subscription_id, status
          from subscriptions where account_id = ?`,
        params: [accountId],
      },
      {
        sql: `select state, processing_attempts
          from billing_reconciliation_targets
          where checkout_attempt_id = ?`,
        params: [attemptId],
      },
    ]);
    assert.deepEqual(state[0].results, [{ state: "completed" }]);
    assert.deepEqual(state[1].results, [
      { provider_subscription_id: subscriptionId, status: "active" },
    ]);
    assert.deepEqual(state[2].results, [
      { state: "succeeded", processing_attempts: 1 },
    ]);
  },
);

test(
  "successful open-session polls reset the automatic failure budget",
  { timeout: 60_000 },
  async (context) => {
    const identity = {
      email: "coach.a@example.test",
      name: "Success Budget Coach",
    };
    const attemptId = "attempt_success_budget";
    const sessionId = "cs_success_budget";
    const createdSeconds = Math.floor(Date.now() / 1_000) - 60;
    const expiresSeconds = createdSeconds + 3_600;
    let accountId;
    let failProviderRead = false;
    let providerCalls = 0;
    const worker = await startD1Worker(stripeBindings, {
      triggerHandlers: true,
      outboundService: async (request) => {
        providerCalls += 1;
        assert.equal(request.method, "GET");
        assert.equal(new URL(request.url).pathname, `/v1/checkout/sessions/${sessionId}`);
        if (failProviderRead) {
          return Response.json(
            { error: { code: "temporary_provider_failure" } },
            { status: 503 },
          );
        }
        return Response.json({
          id: sessionId,
          mode: "subscription",
          status: "open",
          url: "https://checkout.stripe.com/c/pay/success-budget",
          client_reference_id: accountId,
          customer: null,
          subscription: null,
          created: createdSeconds,
          expires_at: expiresSeconds,
          metadata: {
            account_id: accountId,
            checkout_attempt_id: attemptId,
            price_id: PRICE_ID,
          },
        });
      },
    });
    context.after(() => worker.dispose());

    accountId = await createTestAccount(worker, identity);
    const old = Date.now() - 20 * 60 * 1_000;
    await worker.inspect([
      openCheckoutInsert({
        attemptId,
        accountId,
        sessionId,
        email: identity.email,
        createdSeconds,
        expiresSeconds,
      }),
      {
        sql: `insert into billing_reconciliation_targets (
          id, account_id, provider, checkout_attempt_id, state,
          lease_token, lease_expires_at, last_attempt_at, processing_attempts,
          automatic_failure_count, next_automatic_attempt_at,
          automatic_dead_lettered_at, last_error_code, last_error_message,
          last_completed_at, last_succeeded_at, created_at, updated_at
        ) values (?, ?, 'stripe', ?, 'succeeded', null, null, ?, 7,
          0, null, null, null, null, ?, ?, ?, ?)`,
        params: [
          "reconciliation_success_budget",
          accountId,
          attemptId,
          old,
          old,
          old,
          old,
          old,
        ],
      },
    ]);

    assert.equal((await worker.dispatchScheduled()).status, 200);
    let [target] = await worker.inspect([
      {
        sql: `select state, processing_attempts, automatic_failure_count,
          next_automatic_attempt_at, automatic_dead_lettered_at
          from billing_reconciliation_targets where checkout_attempt_id = ?`,
        params: [attemptId],
      },
    ]);
    assert.deepEqual(target.results, [
      {
        state: "succeeded",
        processing_attempts: 8,
        automatic_failure_count: 0,
        next_automatic_attempt_at: null,
        automatic_dead_lettered_at: null,
      },
    ]);

    await worker.inspect([
      {
        sql: `update billing_reconciliation_targets
          set last_attempt_at = ?, last_completed_at = ?, last_succeeded_at = ?
          where checkout_attempt_id = ?`,
        params: [old, old, old, attemptId],
      },
    ]);
    failProviderRead = true;
    assert.equal((await worker.dispatchScheduled()).status, 200);
    [target] = await worker.inspect([
      {
        sql: `select state, processing_attempts, automatic_failure_count,
          next_automatic_attempt_at, automatic_dead_lettered_at
          from billing_reconciliation_targets where checkout_attempt_id = ?`,
        params: [attemptId],
      },
    ]);
    assert.equal(target.results[0].state, "failed");
    assert.equal(target.results[0].processing_attempts, 9);
    assert.equal(target.results[0].automatic_failure_count, 1);
    assert.equal(target.results[0].automatic_dead_lettered_at, null);
    assert.ok(target.results[0].next_automatic_attempt_at > Date.now());
    assert.equal(providerCalls, 2);
  },
);

test(
  "more than two hundred exhausted targets cannot starve a newer due account",
  { timeout: 90_000 },
  async (context) => {
    const identity = {
      email: "coach.a@example.test",
      name: "Fair Sweep Coach",
    };
    const attemptId = "attempt_fair_sweep";
    const sessionId = "cs_fair_sweep";
    const createdSeconds = Math.floor(Date.now() / 1_000) - 60;
    const expiresSeconds = createdSeconds + 3_600;
    let accountId;
    const providerCalls = [];
    const worker = await startD1Worker(stripeBindings, {
      triggerHandlers: true,
      outboundService: async (request) => {
        providerCalls.push(`${request.method} ${new URL(request.url).pathname}`);
        return Response.json({
          id: sessionId,
          mode: "subscription",
          status: "open",
          url: "https://checkout.stripe.com/c/pay/fair-sweep",
          client_reference_id: accountId,
          customer: null,
          subscription: null,
          created: createdSeconds,
          expires_at: expiresSeconds,
          metadata: {
            account_id: accountId,
            checkout_attempt_id: attemptId,
            price_id: PRICE_ID,
          },
        });
      },
    });
    context.after(() => worker.dispose());

    accountId = await createTestAccount(worker, identity);
    const old = Date.now() - 24 * 60 * 60 * 1_000;
    const future = Date.now() + 60 * 60 * 1_000;
    await worker.inspect([
      {
        sql: `with recursive sequence(n) as (
          select 1 union all select n + 1 from sequence where n < 205
        ) insert into accounts (
          id, auth_provider, auth_subject, primary_email, normalized_email,
          status, created_at, updated_at
        ) select printf('dead_account_%03d', n), 'siwc',
          printf('dead_subject_%03d', n), printf('dead%03d@example.test', n),
          printf('dead%03d@example.test', n), 'active', ?, ? from sequence`,
        params: [old, old],
      },
      {
        sql: `with recursive sequence(n) as (
          select 1 union all select n + 1 from sequence where n < 205
        ) insert into billing_checkout_attempts (
          id, account_id, provider, state, request_version, idempotency_key,
          provider_price_id, application_origin, customer_email,
          provider_expires_at, provider_session_id, provider_created_at,
          created_at, updated_at
        ) select printf('dead_attempt_%03d', n), printf('dead_account_%03d', n),
          'stripe', 'open', 1, printf('dead-key-%03d', n), ?, ?,
          printf('dead%03d@example.test', n), ?, printf('cs_dead_%03d', n),
          ?, ?, ? from sequence`,
        params: [PRICE_ID, testOrigin, future, old, old, old],
      },
      {
        sql: `with recursive sequence(n) as (
          select 1 union all select n + 1 from sequence where n < 205
        ) insert into billing_reconciliation_targets (
          id, account_id, provider, checkout_attempt_id, state,
          last_attempt_at, processing_attempts, automatic_failure_count,
          automatic_dead_lettered_at, last_error_code, last_error_message,
          last_completed_at, created_at, updated_at
        ) select printf('dead_target_%03d', n), printf('dead_account_%03d', n),
          'stripe', printf('dead_attempt_%03d', n), 'failed', ?, 8, 8, ?,
          'provider_unavailable', 'Synthetic exhausted target.', ?, ?, ?
          from sequence`,
        params: [old, old, old, old, old],
      },
      openCheckoutInsert({
        attemptId,
        accountId,
        sessionId,
        email: identity.email,
        createdSeconds,
        expiresSeconds,
      }),
    ]);

    assert.equal((await worker.dispatchScheduled()).status, 200);
    assert.deepEqual(providerCalls, [
      `GET /v1/checkout/sessions/${sessionId}`,
    ]);
    const [target] = await worker.inspect([
      {
        sql: `select state, automatic_failure_count
          from billing_reconciliation_targets where checkout_attempt_id = ?`,
        params: [attemptId],
      },
    ]);
    assert.deepEqual(target.results, [
      { state: "succeeded", automatic_failure_count: 0 },
    ]);
  },
);

test(
  "twelve live account-operation leases cannot starve a later due account",
  { timeout: 60_000 },
  async (context) => {
    const identity = {
      email: "coach.a@example.test",
      name: "Lease Fairness Coach",
    };
    const attemptId = "attempt_lease_fairness_eligible";
    const sessionId = "cs_lease_fairness_eligible";
    const createdSeconds = Math.floor(Date.now() / 1_000) - 60;
    const expiresSeconds = createdSeconds + 3_600;
    let eligibleAccountId;
    const providerCalls = [];
    const worker = await startD1Worker(stripeBindings, {
      triggerHandlers: true,
      outboundService: async (request) => {
        const url = new URL(request.url);
        providerCalls.push(`${request.method} ${url.pathname}`);
        assert.equal(request.method, "GET");
        assert.equal(url.pathname, `/v1/checkout/sessions/${sessionId}`);
        return Response.json({
          id: sessionId,
          mode: "subscription",
          status: "open",
          url: "https://checkout.stripe.com/c/pay/lease-fairness",
          client_reference_id: eligibleAccountId,
          customer: null,
          subscription: null,
          created: createdSeconds,
          expires_at: expiresSeconds,
          metadata: {
            account_id: eligibleAccountId,
            checkout_attempt_id: attemptId,
            price_id: PRICE_ID,
          },
        });
      },
    });
    context.after(() => worker.dispose());

    eligibleAccountId = await createTestAccount(worker, identity);
    const now = Date.now();
    const oldestDueAt = now - 2 * 60 * 60 * 1_000;
    const leaseExpiresAt = now + 60 * 60 * 1_000;
    await worker.inspect([
      {
        sql: `with recursive sequence(n) as (
          select 1 union all select n + 1 from sequence where n < 12
        ) insert into accounts (
          id, auth_provider, auth_subject, primary_email, normalized_email,
          status, created_at, updated_at
        ) select printf('lease_busy_account_%02d', n), 'siwc',
          printf('lease_busy_subject_%02d', n),
          printf('lease-busy-%02d@example.test', n),
          printf('lease-busy-%02d@example.test', n),
          'active', ?, ? from sequence`,
        params: [oldestDueAt, oldestDueAt],
      },
      {
        sql: `with recursive sequence(n) as (
          select 1 union all select n + 1 from sequence where n < 12
        ) insert into billing_checkout_attempts (
          id, account_id, provider, state, request_version, idempotency_key,
          provider_price_id, application_origin, customer_email,
          provider_expires_at, provider_session_id, provider_created_at,
          created_at, updated_at
        ) select printf('lease_busy_attempt_%02d', n),
          printf('lease_busy_account_%02d', n), 'stripe', 'open', 1,
          printf('lease-busy-key-%02d', n), ?, ?,
          printf('lease-busy-%02d@example.test', n), ?,
          printf('cs_lease_busy_%02d', n), ?, ?, ? from sequence`,
        params: [
          PRICE_ID,
          testOrigin,
          leaseExpiresAt,
          oldestDueAt,
          oldestDueAt,
          oldestDueAt,
        ],
      },
      {
        sql: `with recursive sequence(n) as (
          select 1 union all select n + 1 from sequence where n < 12
        ) insert into billing_account_operation_leases (
          account_id, provider, state, operation, lease_token,
          lease_generation, lease_expires_at, last_acquired_at,
          created_at, updated_at
        ) select printf('lease_busy_account_%02d', n), 'stripe', 'held',
          'reconciliation', printf('lease-busy-token-%02d', n), 1, ?, ?, ?, ?
          from sequence`,
        params: [leaseExpiresAt, now, oldestDueAt, now],
      },
      openCheckoutInsert({
        attemptId,
        accountId: eligibleAccountId,
        sessionId,
        email: identity.email,
        createdSeconds,
        expiresSeconds,
      }),
    ]);

    assert.equal((await worker.dispatchScheduled()).status, 200);
    assert.deepEqual(providerCalls, [
      `GET /v1/checkout/sessions/${sessionId}`,
    ]);
    const state = await worker.inspect([
      {
        sql: `select state, processing_attempts
          from billing_reconciliation_targets
          where checkout_attempt_id = ?`,
        params: [attemptId],
      },
      {
        sql: `select count(*) as count
          from billing_reconciliation_targets
          where checkout_attempt_id like 'lease_busy_attempt_%'`,
      },
    ]);
    assert.deepEqual(state[0].results, [
      { state: "succeeded", processing_attempts: 1 },
    ]);
    assert.equal(state[1].results[0].count, 0);
  },
);

test(
  "scheduled GET-only refresh recovers a missed subscription update before entitlement expiry",
  { timeout: 60_000 },
  async (context) => {
    const identity = {
      email: "coach.a@example.test",
      name: "Missed Update Coach",
    };
    const subscriptionId = "sub_missed_update";
    const localSubscriptionId = "subscription_missed_update";
    const customerId = "cus_missed_update";
    let accountId;
    const providerCalls = [];
    const worker = await startD1Worker(stripeBindings, {
      triggerHandlers: true,
      outboundService: async (request) => {
        providerCalls.push(`${request.method} ${new URL(request.url).pathname}`);
        assert.equal(request.method, "GET");
        return Response.json(
          stripeSubscription({
            id: subscriptionId,
            customerId,
            accountId,
            status: "canceled",
          }),
        );
      },
    });
    context.after(() => worker.dispose());

    accountId = await createTestAccount(worker, identity);
    let lastSyncAt = Date.now() - 29 * 60 * 1_000;
    await worker.inspect([
      {
        sql: `insert into billing_customers (
          provider, provider_customer_id, account_id, created_at, updated_at
        ) values ('stripe', ?, ?, ?, ?)`,
        params: [customerId, accountId, lastSyncAt, lastSyncAt],
      },
      {
        sql: `insert into subscriptions (
          id, account_id, provider, provider_customer_id,
          provider_subscription_id, provider_price_id, product_code, status,
          billing_interval, currency, unit_amount_minor, last_provider_sync_at,
          projection_revision, created_at, updated_at
        ) values (?, ?, 'stripe', ?, ?, ?, 'solo', 'active', 'month', 'cad',
          7500, ?, 1, ?, ?)`,
        params: [
          localSubscriptionId,
          accountId,
          customerId,
          subscriptionId,
          PRICE_ID,
          lastSyncAt,
          lastSyncAt,
          lastSyncAt,
        ],
      },
    ]);

    assert.equal((await worker.dispatchScheduled()).status, 200);
    assert.deepEqual(providerCalls, []);

    lastSyncAt = Date.now() - 31 * 60 * 1_000;
    await worker.inspect([
      {
        sql: `update subscriptions set last_provider_sync_at = ?, updated_at = ?
          where id = ? and account_id = ?`,
        params: [lastSyncAt, lastSyncAt, localSubscriptionId, accountId],
      },
    ]);
    assert.equal((await worker.dispatchScheduled()).status, 200);
    assert.deepEqual(providerCalls, [`GET /v1/subscriptions/${subscriptionId}`]);

    const state = await worker.inspect([
      {
        sql: `select status, last_provider_sync_at, projection_revision
          from subscriptions where id = ? and account_id = ?`,
        params: [localSubscriptionId, accountId],
      },
      {
        sql: `select state, automatic_failure_count,
          automatic_dead_lettered_at from billing_reconciliation_targets
          where subscription_id = ? and account_id = ?`,
        params: [localSubscriptionId, accountId],
      },
    ]);
    assert.equal(state[0].results[0].status, "canceled");
    assert.equal(state[0].results[0].projection_revision, 2);
    assert.ok(state[0].results[0].last_provider_sync_at > lastSyncAt);
    assert.deepEqual(state[1].results, [
      {
        state: "succeeded",
        automatic_failure_count: 0,
        automatic_dead_lettered_at: null,
      },
    ]);
  },
);

async function createTestAccount(worker, identity) {
  const response = await worker.dispatch("/api/profile", {
    headers: identityHeaders(identity.email, identity.name),
  });
  assert.equal(response.status, 200);
  const [account] = await worker.inspect([
    {
      sql: "select id from accounts where normalized_email = ?",
      params: [identity.email],
    },
  ]);
  return account.results[0].id;
}

function openCheckoutInsert({
  attemptId,
  accountId,
  sessionId,
  email,
  createdSeconds,
  expiresSeconds,
}) {
  return {
    sql: `insert into billing_checkout_attempts (
      id, account_id, provider, state, request_version,
      idempotency_key, provider_price_id, application_origin,
      provider_customer_id, customer_email, provider_expires_at,
      provider_session_id, provider_created_at, created_at, updated_at
    ) values (?, ?, 'stripe', 'open', 1, ?, ?, ?, null, ?, ?, ?, ?, ?, ?)`,
    params: [
      attemptId,
      accountId,
      `roadmap-checkout-v1-${attemptId}`,
      PRICE_ID,
      testOrigin,
      email,
      expiresSeconds * 1_000,
      sessionId,
      createdSeconds * 1_000,
      createdSeconds * 1_000,
      createdSeconds * 1_000,
    ],
  };
}

function stripeSubscription({
  id,
  customerId,
  accountId,
  checkoutAttemptId,
  status = "active",
}) {
  const now = Math.floor(Date.now() / 1_000);
  const metadata = {
    account_id: accountId,
    price_id: PRICE_ID,
  };
  if (checkoutAttemptId) metadata.checkout_attempt_id = checkoutAttemptId;
  return {
    id,
    customer: customerId,
    status,
    currency: "cad",
    cancel_at_period_end: false,
    canceled_at: status === "canceled" ? now - 30 : null,
    ended_at: status === "canceled" ? now - 30 : null,
    trial_start: null,
    trial_end: null,
    metadata,
    items: {
      data: [
        {
          quantity: 1,
          current_period_start: now - 2_000,
          current_period_end: now + 2_000,
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
