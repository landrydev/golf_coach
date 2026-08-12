import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { startD1Worker } from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const { env } = await import("cloudflare:workers");
const {
  applyStripeSubscriptionEvent,
  failBillingEvent,
  markBillingEventProcessing,
  reserveStripeSubscriptionProjectionGeneration,
} = await import("../lib/billing-repository.ts");

test(
  "provider generations fence older retrievals for new and existing subscriptions",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    const database = await worker.database();
    env.DB = database;
    context.after(async () => {
      delete env.DB;
      await worker.dispose();
    });

    await context.test(
      "a newer reservation fences an older first insert before either projection commits",
      async () => {
        const now = Date.now();
        const accountId = "account_provider_order_new";
        const providerSubscriptionId = "sub_provider_order_new";
        const oldClaim = eventClaim(
          "billing_event_provider_order_new_old",
          "lease_provider_order_new_old",
          now,
        );
        const newerClaim = eventClaim(
          "billing_event_provider_order_new_newer",
          "lease_provider_order_new_newer",
          now,
        );
        await seedAccount(database, accountId, "provider.order.new@example.test");
        await seedProcessingEvents(database, [oldClaim, newerClaim], now);

        // The older invocation has already retrieved an active projection.
        const olderGeneration =
          await reserveStripeSubscriptionProjectionGeneration(
            providerSubscriptionId,
          );
        const olderActive = projection(
          accountId,
          providerSubscriptionId,
          "active",
          now,
        );

        // A newer invocation reserves before retrieving canceled state.
        const newerGeneration =
          await reserveStripeSubscriptionProjectionGeneration(
            providerSubscriptionId,
          );
        const newerCanceled = projection(
          accountId,
          providerSubscriptionId,
          "canceled",
          now + 1_000,
        );
        assert.equal(olderGeneration.generation, 1);
        assert.equal(newerGeneration.generation, 2);

        await assert.rejects(
          applyStripeSubscriptionEvent(
            applyInput(oldClaim, olderGeneration, olderActive, now),
          ),
        );

        const beforeNewerCommit = await database
          .prepare(
            "select count(*) as count from subscriptions where provider_subscription_id = ?",
          )
          .bind(providerSubscriptionId)
          .first();
        assert.equal(beforeNewerCommit.count, 0);
        assert.equal(
          await eventStatus(database, oldClaim.eventId),
          "processing",
        );

        await applyStripeSubscriptionEvent(
          applyInput(
            newerClaim,
            newerGeneration,
            newerCanceled,
            now + 1_000,
          ),
        );
        const committed = await subscriptionState(
          database,
          providerSubscriptionId,
        );
        assert.equal(committed.status, "canceled");
        assert.equal(committed.projection_revision, 1);
      },
    );

    await context.test(
      "newer canceled state survives an older active apply and stale event retry re-fetch",
      async () => {
        const now = Date.now();
        const accountId = "account_provider_order_existing";
        const providerSubscriptionId = "sub_provider_order_existing";
        const oldClaim = eventClaim(
          "billing_event_provider_order_existing_old",
          "lease_provider_order_existing_old",
          now,
        );
        const newerClaim = eventClaim(
          "billing_event_provider_order_existing_newer",
          "lease_provider_order_existing_newer",
          now,
        );
        await seedAccount(
          database,
          accountId,
          "provider.order.existing@example.test",
        );
        await seedExistingSubscription(
          database,
          accountId,
          providerSubscriptionId,
          now,
        );
        await seedProcessingEvents(database, [oldClaim, newerClaim], now);

        const olderGeneration =
          await reserveStripeSubscriptionProjectionGeneration(
            providerSubscriptionId,
          );
        const olderRetrievedActive = projection(
          accountId,
          providerSubscriptionId,
          "active",
          now,
        );
        const newerGeneration =
          await reserveStripeSubscriptionProjectionGeneration(
            providerSubscriptionId,
          );
        const newerRetrievedCanceled = projection(
          accountId,
          providerSubscriptionId,
          "canceled",
          now + 1_000,
        );

        await applyStripeSubscriptionEvent(
          applyInput(
            newerClaim,
            newerGeneration,
            newerRetrievedCanceled,
            now + 1_000,
          ),
        );
        await assert.rejects(
          applyStripeSubscriptionEvent(
            applyInput(
              oldClaim,
              olderGeneration,
              olderRetrievedActive,
              now,
            ),
          ),
        );

        const fenced = await subscriptionState(
          database,
          providerSubscriptionId,
        );
        assert.equal(fenced.status, "canceled");
        assert.equal(fenced.projection_revision, 2);
        assert.equal(await eventStatus(database, oldClaim.eventId), "processing");

        // The webhook catch path records failure. A Stripe retry then takes a
        // new lease, reserves generation 3, and re-fetches current canceled
        // state rather than reusing the stale active object.
        await failBillingEvent({
          claim: oldClaim,
          providerEventId: "evt_provider_order_existing_old",
          providerEventType: "customer.subscription.updated",
          errorCode: "subscription_projection_generation_stale",
          errorMessage: "A newer provider projection was reserved.",
          accountId,
        });
        const retryClaim = await markBillingEventProcessing(oldClaim.eventId);
        assert.ok(retryClaim);
        const retryGeneration =
          await reserveStripeSubscriptionProjectionGeneration(
            providerSubscriptionId,
          );
        assert.equal(retryGeneration.generation, 3);
        await applyStripeSubscriptionEvent(
          applyInput(
            retryClaim,
            retryGeneration,
            projection(
              accountId,
              providerSubscriptionId,
              "canceled",
              now + 2_000,
            ),
            now,
          ),
        );

        const retried = await subscriptionState(
          database,
          providerSubscriptionId,
        );
        assert.equal(retried.status, "canceled");
        assert.equal(retried.projection_revision, 3);
        assert.equal(await eventStatus(database, oldClaim.eventId), "processed");
      },
    );
  },
);

function eventClaim(eventId, leaseToken, now) {
  return {
    eventId,
    leaseToken,
    leaseExpiresAt: new Date(now + 10 * 60 * 1_000),
  };
}

function applyInput(claim, projectionGeneration, value, eventOccurredAt) {
  const suffix = claim.eventId.replace("billing_event_", "");
  return {
    claim,
    providerEventId: `evt_${suffix}`,
    providerEventType: "customer.subscription.updated",
    projection: value,
    projectionGeneration,
    eventOccurredAt: new Date(eventOccurredAt),
  };
}

function projection(accountId, providerSubscriptionId, status, now) {
  const terminalAt = status === "canceled" ? new Date(now) : null;
  return {
    accountId,
    providerCustomerId: `cus_${accountId.replace("account_", "")}`,
    providerSubscriptionId,
    providerPriceId: "price_provider_ordering",
    status,
    billingInterval: "month",
    currency: "CAD",
    unitAmountMinor: 4900,
    trialStartsAt: null,
    trialEndsAt: null,
    currentPeriodStartsAt: new Date(now - 1_000),
    currentPeriodEndsAt: new Date(now + 30 * 24 * 60 * 60 * 1_000),
    cancelAtPeriodEnd: false,
    canceledAt: terminalAt,
    endedAt: terminalAt,
  };
}

async function seedAccount(database, accountId, email) {
  await database
    .prepare(
      `insert into accounts (
        id, auth_subject, primary_email, normalized_email,
        email_verified_at, status
      ) values (?, ?, ?, ?, ?, 'active')`,
    )
    .bind(accountId, `subject_${accountId}`, email, email, Date.now())
    .run();
}

async function seedExistingSubscription(
  database,
  accountId,
  providerSubscriptionId,
  now,
) {
  const customerId = `cus_${accountId.replace("account_", "")}`;
  await database.batch([
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
        ) values (?, ?, 'stripe', ?, ?, 'price_provider_ordering', 'solo',
          'active', 'month', ?, 1)`,
      )
      .bind(
        `subscription_${accountId.replace("account_", "")}`,
        accountId,
        customerId,
        providerSubscriptionId,
        now,
      ),
  ]);
}

async function seedProcessingEvents(database, claims, now) {
  await database.batch(
    claims.map((claim, index) =>
      database
        .prepare(
          `insert into billing_events (
            id, provider, provider_event_id, provider_event_type,
            status, payload_sha256, event_occurred_at,
            lease_token, lease_expires_at, last_attempt_at,
            processing_attempts
          ) values (?, 'stripe', ?, 'customer.subscription.updated',
            'processing', ?, ?, ?, ?, ?, 1)`,
        )
        .bind(
          claim.eventId,
          claim.eventId.replace("billing_event_", "evt_"),
          String(index + 1).repeat(64),
          now + index,
          claim.leaseToken,
          claim.leaseExpiresAt.getTime(),
          now,
        ),
    ),
  );
}

async function subscriptionState(database, providerSubscriptionId) {
  return database
    .prepare(
      `select status, projection_revision
         from subscriptions
        where provider = 'stripe' and provider_subscription_id = ?`,
    )
    .bind(providerSubscriptionId)
    .first();
}

async function eventStatus(database, eventId) {
  const event = await database
    .prepare("select status from billing_events where id = ?")
    .bind(eventId)
    .first();
  return event?.status ?? null;
}
