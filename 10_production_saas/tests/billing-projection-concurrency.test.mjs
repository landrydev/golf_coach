import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { startD1Worker } from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const { env } = await import("cloudflare:workers");
const {
  applyStripeSubscriptionEvent,
  reserveStripeSubscriptionProjectionGeneration,
} = await import("../lib/billing-repository.ts");

test(
  "a stale subscription projection revision rolls the entire D1 effect back",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    const database = await worker.database();
    env.DB = database;
    context.after(async () => {
      delete env.DB;
      await worker.dispose();
    });

    const now = Date.now();
    const accountId = "account_projection_fence";
    const subscriptionId = "subscription_projection_fence";
    const eventId = "billing_event_projection_fence";
    const leaseToken = "lease_projection_fence";
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
          "subject-projection-fence",
          "projection.fence@example.test",
          "projection.fence@example.test",
          now,
        ),
      database
        .prepare(
          `insert into billing_customers (
            provider, provider_customer_id, account_id
          ) values ('stripe', 'cus_projection_fence', ?)`,
        )
        .bind(accountId),
      database
        .prepare(
          `insert into subscriptions (
            id, account_id, provider, provider_customer_id,
            provider_subscription_id, provider_price_id, product_code,
            status, billing_interval, last_provider_sync_at,
            projection_revision
          ) values (?, ?, 'stripe', 'cus_projection_fence',
            'sub_projection_fence', 'price_projection_fence', 'solo',
            'active', 'month', ?, 1)`,
        )
        .bind(subscriptionId, accountId, now),
      database
        .prepare(
          `insert into billing_events (
            id, provider, provider_event_id, provider_event_type,
            status, payload_sha256, event_occurred_at,
            lease_token, lease_expires_at, last_attempt_at,
            processing_attempts
          ) values (?, 'stripe', 'evt_projection_fence',
            'customer.subscription.updated', 'processing', ?, ?, ?, ?, ?, 1)`,
        )
        .bind(
          eventId,
          "a".repeat(64),
          now,
          leaseToken,
          now + 5 * 60 * 1_000,
          now,
        ),
    ]);

    // Simulate another provider projection winning after this invocation read
    // revision 1 but before its fenced transaction reached the subscription.
    // The trigger's increment is itself inside the batch and must roll back.
    await database
      .prepare(
        `create trigger force_projection_revision_race
        after update of provider_event_id on billing_events
        when new.id = '${eventId}'
        begin
          update subscriptions
          set projection_revision = projection_revision + 1
          where id = '${subscriptionId}';
        end`,
      )
      .run();

    const claim = {
      eventId,
      leaseToken,
      leaseExpiresAt: new Date(now + 5 * 60 * 1_000),
    };
    const projectionGeneration =
      await reserveStripeSubscriptionProjectionGeneration(
        "sub_projection_fence",
      );
    const input = projectionInput(
      accountId,
      claim,
      projectionGeneration,
      now,
    );
    await assert.rejects(applyStripeSubscriptionEvent(input));

    const rolledBack = await inspect(database, subscriptionId, eventId);
    assert.equal(rolledBack.subscription.status, "active");
    assert.equal(rolledBack.subscription.projection_revision, 1);
    assert.equal(rolledBack.event.status, "processing");
    assert.equal(rolledBack.event.lease_token, leaseToken);
    assert.equal(rolledBack.auditCount, 0);

    await database
      .prepare("drop trigger force_projection_revision_race")
      .run();
    await applyStripeSubscriptionEvent(input);
    const applied = await inspect(database, subscriptionId, eventId);
    assert.equal(applied.subscription.status, "canceled");
    assert.equal(applied.subscription.projection_revision, 2);
    assert.equal(applied.event.status, "processed");
    assert.equal(applied.event.lease_token, null);
    assert.equal(applied.auditCount, 1);
  },
);

function projectionInput(accountId, claim, projectionGeneration, now) {
  return {
    claim,
    providerEventId: "evt_projection_fence",
    providerEventType: "customer.subscription.updated",
    eventOccurredAt: new Date(now),
    projectionGeneration,
    projection: {
      accountId,
      providerCustomerId: "cus_projection_fence",
      providerSubscriptionId: "sub_projection_fence",
      providerPriceId: "price_projection_fence",
      status: "canceled",
      billingInterval: "month",
      currency: "CAD",
      unitAmountMinor: 4900,
      trialStartsAt: null,
      trialEndsAt: null,
      currentPeriodStartsAt: new Date(now - 1_000),
      currentPeriodEndsAt: new Date(now + 1_000),
      cancelAtPeriodEnd: false,
      canceledAt: new Date(now),
      endedAt: new Date(now),
    },
  };
}

async function inspect(database, subscriptionId, eventId) {
  const [subscription, event, audits] = await database.batch([
    database
      .prepare(
        "select status, projection_revision from subscriptions where id = ?",
      )
      .bind(subscriptionId),
    database
      .prepare(
        "select status, lease_token from billing_events where id = ?",
      )
      .bind(eventId),
    database.prepare(
      "select count(*) as count from audit_events where actor_reference = 'evt_projection_fence' and action = 'billing.subscription_synced'",
    ),
  ]);
  return {
    subscription: subscription.results[0],
    event: event.results[0],
    auditCount: audits.results[0].count,
  };
}
