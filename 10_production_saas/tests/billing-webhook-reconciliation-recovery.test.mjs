import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { startD1Worker } from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const { env } = await import("cloudflare:workers");
const {
  applyStripeSubscriptionEvent,
  applyStripeSubscriptionReconciliation,
  reserveStripeSubscriptionProjectionGeneration,
} = await import("../lib/billing-repository.ts");
const { acquireBillingAccountOperationLease } = await import(
  "../lib/billing-account-operation-lease.ts"
);
const {
  claimBillingReconciliation,
  failBillingReconciliation,
} = await import("../lib/billing-reconciliation-repository.ts");

const BASE_TIME = Date.UTC(2026, 7, 8, 20, 0, 0);

test(
  "authoritative webhook projection resolves only matching failed reconciliation targets atomically",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    const database = await worker.database();
    env.DB = database;
    context.after(async () => {
      delete env.DB;
      await worker.dispose();
    });

    await seedAccountSubscriptionTarget(database, "recovered");
    await seedAccountSubscriptionTarget(database, "unrelated");
    const successClaim = await seedProcessingEvent(database, "recovered");
    const successGeneration =
      await reserveStripeSubscriptionProjectionGeneration(
        providerSubscriptionId("recovered"),
      );

    await applyStripeSubscriptionEvent({
      claim: successClaim,
      providerEventId: "evt_webhook_recovery_recovered",
      providerEventType: "customer.subscription.updated",
      projection: projection("recovered", "past_due"),
      projectionGeneration: successGeneration,
      eventOccurredAt: new Date(BASE_TIME + 1_000),
    });

    assert.deepEqual(await targetState(database, "recovered"), {
      state: "succeeded",
      lease_token: null,
      lease_expires_at: null,
      last_error_code: null,
      last_error_message: null,
      last_completed_at: true,
      last_succeeded_at: true,
    });
    assert.deepEqual(await targetState(database, "unrelated"), {
      state: "failed",
      lease_token: null,
      lease_expires_at: null,
      last_error_code: "billing_provider_error",
      last_error_message: "Provider retrieval failed.",
      last_completed_at: true,
      last_succeeded_at: false,
    });

    await seedAccountSubscriptionTarget(database, "rollback");
    const actualClaim = await seedProcessingEvent(database, "rollback");
    const rollbackGeneration =
      await reserveStripeSubscriptionProjectionGeneration(
        providerSubscriptionId("rollback"),
      );

    await assert.rejects(
      applyStripeSubscriptionEvent({
        claim: { ...actualClaim, leaseToken: "wrong_webhook_lease" },
        providerEventId: "evt_webhook_recovery_rollback",
        providerEventType: "customer.subscription.updated",
        projection: projection("rollback", "canceled"),
        projectionGeneration: rollbackGeneration,
        eventOccurredAt: new Date(BASE_TIME + 2_000),
      }),
    );
    assert.deepEqual(await targetState(database, "rollback"), {
      state: "failed",
      lease_token: null,
      lease_expires_at: null,
      last_error_code: "billing_provider_error",
      last_error_message: "Provider retrieval failed.",
      last_completed_at: true,
      last_succeeded_at: false,
    });
    const rollbackSubscription = await database
      .prepare(
        `select status, projection_revision from subscriptions
         where provider_subscription_id = ?`,
      )
      .bind(providerSubscriptionId("rollback"))
      .first();
    assert.deepEqual(rollbackSubscription, {
      status: "active",
      projection_revision: 1,
    });
  },
);

test(
  "a newer webhook resolves an in-flight reconciliation and the stale worker cannot re-fail it",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    const database = await worker.database();
    env.DB = database;
    context.after(async () => {
      delete env.DB;
      await worker.dispose();
    });

    await seedAccountSubscriptionTarget(database, "interleaved");
    const interleavedAccountId = "account_webhook_recovery_interleaved";
    const interleavedTarget = {
      kind: "subscription",
      subscriptionId: localSubscriptionId("interleaved"),
    };
    const interleavedAt = new Date();
    const staleOperationLease = await acquireBillingAccountOperationLease({
      accountId: interleavedAccountId,
      operation: "reconciliation",
      now: interleavedAt,
    });
    assert.ok(staleOperationLease);
    const staleReconciliationClaim = await claimBillingReconciliation({
      accountId: interleavedAccountId,
      target: interleavedTarget,
      now: interleavedAt,
    });
    assert.ok(staleReconciliationClaim);
    const staleReconciliationGeneration =
      await reserveStripeSubscriptionProjectionGeneration(
        providerSubscriptionId("interleaved"),
      );
    assert.equal(staleReconciliationGeneration.generation, 1);

    const interleavedWebhookClaim = await seedProcessingEvent(
      database,
      "interleaved",
    );
    const newerWebhookGeneration =
      await reserveStripeSubscriptionProjectionGeneration(
        providerSubscriptionId("interleaved"),
      );
    assert.equal(newerWebhookGeneration.generation, 2);

    await applyStripeSubscriptionEvent({
      claim: interleavedWebhookClaim,
      providerEventId: "evt_webhook_recovery_interleaved",
      providerEventType: "customer.subscription.updated",
      projection: projection("interleaved", "canceled"),
      projectionGeneration: newerWebhookGeneration,
      eventOccurredAt: new Date(BASE_TIME + 1_500),
    });

    assert.deepEqual(await targetState(database, "interleaved"), {
      state: "succeeded",
      lease_token: null,
      lease_expires_at: null,
      last_error_code: null,
      last_error_message: null,
      last_completed_at: true,
      last_succeeded_at: true,
    });

    await assert.rejects(
      applyStripeSubscriptionReconciliation({
        claim: staleReconciliationClaim,
        operationLease: staleOperationLease,
        projection: projection("interleaved", "active"),
        projectionGeneration: staleReconciliationGeneration,
        reconciledAt: new Date(interleavedAt.getTime() + 1_000),
      }),
    );
    await assert.rejects(
      failBillingReconciliation({
        claim: staleReconciliationClaim,
        operationLease: staleOperationLease,
        errorCode: "subscription_projection_generation_stale",
        errorMessage: "The older provider read lost the projection race.",
        now: new Date(interleavedAt.getTime() + 2_000),
      }),
    );

    assert.deepEqual(await targetState(database, "interleaved"), {
      state: "succeeded",
      lease_token: null,
      lease_expires_at: null,
      last_error_code: null,
      last_error_message: null,
      last_completed_at: true,
      last_succeeded_at: true,
    });
    const interleavedSubscription = await database
      .prepare(
        `select status, projection_revision from subscriptions
         where provider_subscription_id = ?`,
      )
      .bind(providerSubscriptionId("interleaved"))
      .first();
    assert.deepEqual(interleavedSubscription, {
      status: "canceled",
      projection_revision: 2,
    });
  },
);

async function seedAccountSubscriptionTarget(database, label) {
  const accountId = `account_webhook_recovery_${label}`;
  const subscriptionId = localSubscriptionId(label);
  const customerId = `cus_webhook_recovery_${label}`;
  await database.batch([
    database
      .prepare(
        `insert into accounts (
          id, auth_subject, primary_email, normalized_email,
          email_verified_at, status
        ) values (?, ?, ?, ?, ?, 'active')`,
      )
      .bind(
        accountId,
        `subject_webhook_recovery_${label}`,
        `${label}@webhook-recovery.example.test`,
        `${label}@webhook-recovery.example.test`,
        BASE_TIME,
      ),
    database
      .prepare(
        `insert into billing_customers (
          provider, provider_customer_id, account_id
        ) values ('stripe', ?, ?)`,
      )
      .bind(customerId, accountId),
    database
      .prepare(
        `insert into subscriptions (
          id, account_id, provider, provider_customer_id,
          provider_subscription_id, provider_price_id, product_code,
          status, billing_interval, last_provider_sync_at,
          projection_revision
        ) values (?, ?, 'stripe', ?, ?, 'price_webhook_recovery', 'solo',
          'active', 'month', ?, 1)`,
      )
      .bind(
        subscriptionId,
        accountId,
        customerId,
        providerSubscriptionId(label),
        BASE_TIME,
      ),
    database
      .prepare(
        `insert into billing_reconciliation_targets (
          id, account_id, provider, subscription_id, checkout_attempt_id,
          state, lease_token, lease_expires_at, last_attempt_at,
          processing_attempts, last_error_code, last_error_message,
          last_completed_at, last_succeeded_at, created_at, updated_at
        ) values (?, ?, 'stripe', ?, null, 'failed', null, null, ?, 8,
          'billing_provider_error', 'Provider retrieval failed.', ?, null, ?, ?)`,
      )
      .bind(
        `reconciliation_webhook_recovery_${label}`,
        accountId,
        subscriptionId,
        BASE_TIME,
        BASE_TIME,
        BASE_TIME,
        BASE_TIME,
      ),
  ]);
}

async function seedProcessingEvent(database, label) {
  const eventId = `billing_event_webhook_recovery_${label}`;
  const leaseToken = `lease_webhook_recovery_${label}`;
  const claimedAt = Date.now();
  // The projection code validates the lease against the real runtime clock.
  // Keep this fixture lease live independently of the fixed business timestamps
  // used by the rest of the reconciliation scenario.
  const leaseExpiresAt = claimedAt + 5 * 60 * 1_000;
  await database
    .prepare(
      `insert into billing_events (
        id, provider, provider_event_id, provider_event_type,
        status, payload_sha256, event_occurred_at, lease_token,
        lease_expires_at, last_attempt_at, processing_attempts
      ) values (?, 'stripe', ?, 'customer.subscription.updated',
        'processing', ?, ?, ?, ?, ?, 1)`,
    )
    .bind(
      eventId,
      `evt_webhook_recovery_${label}`,
      "a".repeat(64),
      BASE_TIME,
      leaseToken,
      leaseExpiresAt,
      claimedAt,
    )
    .run();
  assert.ok(
    leaseExpiresAt > Date.now(),
    "fixture must hold an active webhook lease",
  );
  return {
    eventId,
    leaseToken,
    leaseExpiresAt: new Date(leaseExpiresAt),
  };
}

function projection(label, status) {
  const terminalAt = status === "canceled" ? new Date(BASE_TIME + 2_000) : null;
  return {
    accountId: `account_webhook_recovery_${label}`,
    providerCustomerId: `cus_webhook_recovery_${label}`,
    providerSubscriptionId: providerSubscriptionId(label),
    providerPriceId: "price_webhook_recovery",
    status,
    billingInterval: "month",
    currency: "CAD",
    unitAmountMinor: 4900,
    trialStartsAt: null,
    trialEndsAt: null,
    currentPeriodStartsAt: new Date(BASE_TIME),
    currentPeriodEndsAt: new Date(BASE_TIME + 30 * 24 * 60 * 60 * 1_000),
    cancelAtPeriodEnd: false,
    canceledAt: terminalAt,
    endedAt: terminalAt,
  };
}

async function targetState(database, label) {
  const row = await database
    .prepare(
      `select state, lease_token, lease_expires_at, last_error_code,
        last_error_message, last_completed_at, last_succeeded_at
       from billing_reconciliation_targets where id = ?`,
    )
    .bind(`reconciliation_webhook_recovery_${label}`)
    .first();
  return {
    ...row,
    last_completed_at: Boolean(row.last_completed_at),
    last_succeeded_at: Boolean(row.last_succeeded_at),
  };
}

function localSubscriptionId(label) {
  return `subscription_webhook_recovery_${label}`;
}

function providerSubscriptionId(label) {
  return `sub_webhook_recovery_${label}`;
}
