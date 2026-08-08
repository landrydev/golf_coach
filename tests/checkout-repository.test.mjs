import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { startD1Worker, testOrigin } from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const { env } = await import("cloudflare:workers");
const {
  CheckoutRepositoryError,
  expireCheckoutAttemptAfterProviderConfirmation,
  finalizeCheckoutAttemptOpen,
  getCanonicalBillingCustomer,
  getCheckoutAttemptForAccount,
  markCheckoutAttemptCompletedPendingSync,
  recordCheckoutAttemptError,
  requireCheckoutAttemptForCompletion,
  resolveCheckoutAttemptForSignedWebhook,
  reserveOrLoadCheckoutAttempt,
} = await import("../lib/checkout-repository.ts");

const PRICE = "price_checkout_repository_test";
const BASE_TIME = Date.UTC(2026, 7, 7, 18, 0, 0);
const accounts = {
  owner: "account-owner",
  other: "account-other",
  race: "account-race",
  expiry: "account-expiry",
  pending: "account-pending",
  finalize: "account-finalize",
  duplicateA: "account-duplicate-a",
  duplicateB: "account-duplicate-b",
  error: "account-error",
  completion: "account-completion",
  providerComplete: "account-provider-complete",
  drift: "account-drift",
  subscription: "account-subscription",
  blockerSubscription: "account-blocker-subscription",
  constraint: "account-constraint",
  lookupA: "account-lookup-a",
  lookupB: "account-lookup-b",
};

test(
  "checkout attempts enforce durable concurrency, expiry, and tenant ownership",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    const database = await worker.database();
    env.DB = database;
    context.after(async () => {
      delete env.DB;
      await worker.dispose();
    });
    await seedAccounts(database, Object.entries(accounts));

    await context.test(
      "canonical customers and composite ownership are constrained in D1",
      async () => {
        await insertCustomer(database, "cus_owner", accounts.owner);

        const customer = await getCanonicalBillingCustomer(accounts.owner);
        assert.equal(customer?.provider, "stripe");
        assert.equal(customer?.providerCustomerId, "cus_owner");
        assert.equal(customer?.accountId, accounts.owner);
        assert.equal(
          await getCanonicalBillingCustomer(accounts.other),
          null,
        );

        await assert.rejects(
          insertCustomer(database, "cus_second_for_owner", accounts.owner),
          /unique constraint failed/i,
        );
        await assert.rejects(
          insertAttemptRaw(database, {
            id: "attempt-cross-tenant",
            accountId: accounts.other,
            customerId: "cus_owner",
            expiresAt: BASE_TIME + 3_600_000,
          }),
          /foreign key constraint failed/i,
        );
        await assertRepositoryError(
          reserveOrLoadCheckoutAttempt({
            ...reservationInput(accounts.other, BASE_TIME),
            providerCustomerId: "cus_owner",
          }),
          "checkout_customer_snapshot_conflict",
        );
      },
    );

    await context.test(
      "concurrent reservations admit one winner and preserve its frozen snapshot",
      async () => {
        const now = new Date(BASE_TIME);
        const providerExpiresAt = new Date(BASE_TIME + 3_600_000);
        const input = {
          ...reservationInput(accounts.race, BASE_TIME),
          providerExpiresAt,
          now,
        };
        const reservations = await Promise.all(
          Array.from({ length: 12 }, () =>
            reserveOrLoadCheckoutAttempt(input),
          ),
        );

        assert.equal(
          reservations.filter((reservation) => reservation.created).length,
          1,
        );
        assert.equal(
          new Set(reservations.map(({ attempt }) => attempt.id)).size,
          1,
        );
        const original = reservations[0].attempt;
        assert.equal(
          original.idempotencyKey,
          `roadmap-checkout-v1-${original.id}`,
        );
        assert.equal(original.providerPriceId, PRICE);
        assert.equal(original.applicationOrigin, testOrigin);
        assert.equal(original.customerEmail, `${accounts.race}@example.test`);
        assert.equal(original.providerCustomerId, null);
        assert.equal(original.providerExpiresAt.getTime(), providerExpiresAt.getTime());

        const retry = await reserveOrLoadCheckoutAttempt({
          accountId: accounts.race,
          providerPriceId: "price_changed_retry",
          applicationOrigin: "https://changed-roadmap.test",
          providerCustomerId: null,
          customerEmail: "changed-retry@example.test",
          providerExpiresAt: new Date(BASE_TIME + 7_200_000),
          now: new Date(BASE_TIME + 1_000),
        });
        assert.equal(retry.created, false);
        assert.deepEqual(frozenSnapshot(retry.attempt), frozenSnapshot(original));

        const result = await database
          .prepare(
            "select count(*) as count from billing_checkout_attempts where account_id = ? and state in ('reserved', 'open', 'completed_pending_sync', 'quarantined')",
          )
          .bind(accounts.race)
          .first();
        assert.equal(result.count, 1);
      },
    );

    await context.test(
      "only provider-confirmed expiry unlocks a replacement attempt",
      async () => {
        const first = await reserveOrLoadCheckoutAttempt(
          reservationInput(accounts.expiry, BASE_TIME),
        );
        const providerCreatedAt = new Date(BASE_TIME + 10_000);
        const atBoundary =
          await expireCheckoutAttemptAfterProviderConfirmation({
          accountId: accounts.expiry,
          attemptId: first.attempt.id,
          providerSessionId: "cs_provider_confirmed_expired",
          providerCreatedAt,
          requestId: "request-provider-expiry",
          now: new Date(BASE_TIME + 3_600_000),
        });
        assert.equal(atBoundary.changed, true);
        assert.equal(atBoundary.attempt.state, "expired");
        assert.equal(
          atBoundary.attempt.providerSessionId,
          "cs_provider_confirmed_expired",
        );
        assert.equal(
          atBoundary.attempt.providerCreatedAt?.getTime(),
          providerCreatedAt.getTime(),
        );
        assert.equal(
          atBoundary.attempt.expiredAt?.getTime(),
          BASE_TIME + 3_600_000,
        );

        const retry = await expireCheckoutAttemptAfterProviderConfirmation({
          accountId: accounts.expiry,
          attemptId: first.attempt.id,
          providerSessionId: "cs_provider_confirmed_expired",
          providerCreatedAt,
          requestId: "request-provider-expiry-retry",
          now: new Date(BASE_TIME + 3_600_001),
        });
        assert.equal(retry.changed, false);
        assert.equal(retry.attempt.state, "expired");

        const expiryAudits = await database
          .prepare(
            "select actor_type, actor_account_id, action, target_type, target_id, outcome, request_id, metadata from audit_events where action = 'billing.checkout_session_expired' and target_id = ?",
          )
          .bind(first.attempt.id)
          .all();
        assert.deepEqual(expiryAudits.results, [
          {
            actor_type: "system",
            actor_account_id: null,
            action: "billing.checkout_session_expired",
            target_type: "billing_checkout_attempt",
            target_id: first.attempt.id,
            outcome: "success",
            request_id: "request-provider-expiry",
            metadata: JSON.stringify({
              provider: "stripe",
              requestVersion: 1,
              reason: "provider_session_expired",
            }),
          },
        ]);
        assert.doesNotMatch(
          JSON.stringify(expiryAudits.results[0]),
          /cs_provider_confirmed_expired|@example\.test|https?:\/\//,
        );

        const replacement = await reserveOrLoadCheckoutAttempt({
          ...reservationInput(accounts.expiry, BASE_TIME + 3_600_001),
          providerExpiresAt: new Date(BASE_TIME + 7_200_000),
        });
        assert.equal(replacement.created, true);
        assert.notEqual(replacement.attempt.id, first.attempt.id);

        await assertRepositoryError(
          expireCheckoutAttemptAfterProviderConfirmation({
            accountId: accounts.other,
            attemptId: replacement.attempt.id,
            providerSessionId: "cs_wrong_tenant_expired",
            providerCreatedAt: new Date(BASE_TIME + 3_610_000),
            now: new Date(BASE_TIME + 8_000_000),
          }),
          "checkout_attempt_not_found",
        );
      },
    );

    await context.test(
      "provider completion is atomic, blocking, and idempotent after webhook completion",
      async () => {
        const reservation = await reserveOrLoadCheckoutAttempt(
          reservationInput(accounts.providerComplete, BASE_TIME),
        );
        await finalizeCheckoutAttemptOpen({
          accountId: accounts.providerComplete,
          attemptId: reservation.attempt.id,
          providerSessionId: "cs_provider_complete",
          providerCreatedAt: new Date(BASE_TIME + 10_000),
          now: new Date(BASE_TIME + 20_000),
        });
        const completions = await Promise.all(
          Array.from({ length: 8 }, () =>
            markCheckoutAttemptCompletedPendingSync({
              accountId: accounts.providerComplete,
              attemptId: reservation.attempt.id,
              providerSessionId: "cs_provider_complete",
              providerCreatedAt: new Date(BASE_TIME + 10_000),
              requestId: "request-provider-complete",
              // Local expiry has passed; the validated provider response is
              // authoritative and must still make the attempt blocking.
              now: new Date(BASE_TIME + 3_600_001),
            }),
          ),
        );
        assert.equal(
          completions.filter((completion) => completion.changed).length,
          1,
        );
        assert.ok(
          completions.every(
            ({ attempt }) => attempt.state === "completed_pending_sync",
          ),
        );

        const completionAudits = await database
          .prepare(
            "select actor_type, actor_account_id, action, target_type, target_id, outcome, request_id, metadata from audit_events where action = 'billing.checkout_completion_pending_sync' and target_id = ?",
          )
          .bind(reservation.attempt.id)
          .all();
        assert.deepEqual(completionAudits.results, [
          {
            actor_type: "system",
            actor_account_id: null,
            action: "billing.checkout_completion_pending_sync",
            target_type: "billing_checkout_attempt",
            target_id: reservation.attempt.id,
            outcome: "success",
            request_id: "request-provider-complete",
            metadata: JSON.stringify({
              provider: "stripe",
              requestVersion: 1,
              state: "completed_pending_sync",
            }),
          },
        ]);
        assert.doesNotMatch(
          JSON.stringify(completionAudits.results[0]),
          /cs_provider_complete|@example\.test|https?:\/\//,
        );
        assert.ok(
          completions.every(
            ({ attempt }) =>
              attempt.providerSessionId === "cs_provider_complete" &&
              attempt.providerCreatedAt?.getTime() === BASE_TIME + 10_000,
          ),
        );

        const blockedRetry = await reserveOrLoadCheckoutAttempt({
          ...reservationInput(accounts.providerComplete, BASE_TIME + 4_000_000),
          providerExpiresAt: new Date(BASE_TIME + 8_000_000),
        });
        assert.equal(blockedRetry.created, false);
        assert.equal(blockedRetry.attempt.id, reservation.attempt.id);
        assert.equal(blockedRetry.attempt.state, "completed_pending_sync");

        const expiryLostRace =
          await expireCheckoutAttemptAfterProviderConfirmation({
            accountId: accounts.providerComplete,
            attemptId: reservation.attempt.id,
            providerSessionId: "cs_provider_complete",
            providerCreatedAt: new Date(BASE_TIME + 10_000),
            now: new Date(BASE_TIME + 3_600_002),
          });
        assert.equal(expiryLostRace.changed, false);
        assert.equal(expiryLostRace.attempt.state, "completed_pending_sync");

        await database
          .prepare(
            `update billing_checkout_attempts
              set state = 'completed', completed_at = ?, updated_at = ?
              where id = ?`,
          )
          .bind(
            BASE_TIME + 3_600_003,
            BASE_TIME + 3_600_003,
            reservation.attempt.id,
          )
          .run();
        for (const mutation of [
          markCheckoutAttemptCompletedPendingSync({
            accountId: accounts.providerComplete,
            attemptId: reservation.attempt.id,
            providerSessionId: "cs_provider_complete",
            providerCreatedAt: new Date(BASE_TIME + 10_000),
            now: new Date(BASE_TIME + 3_600_004),
          }),
          expireCheckoutAttemptAfterProviderConfirmation({
            accountId: accounts.providerComplete,
            attemptId: reservation.attempt.id,
            providerSessionId: "cs_provider_complete",
            providerCreatedAt: new Date(BASE_TIME + 10_000),
            now: new Date(BASE_TIME + 3_600_004),
          }),
        ]) {
          const webhookWon = await mutation;
          assert.equal(webhookWon.changed, false);
          assert.equal(webhookWon.attempt.state, "completed");
          assert.equal(
            webhookWon.attempt.completedAt?.getTime(),
            BASE_TIME + 3_600_003,
          );
        }
      },
    );

    await context.test(
      "reserved-to-open finalization is fenced and emits one atomic safe audit",
      async () => {
        const reservation = await reserveOrLoadCheckoutAttempt(
          reservationInput(accounts.finalize, BASE_TIME),
        );
        const providerSessionId = "cs_finalize_once";
        const finalizations = await Promise.all(
          Array.from({ length: 8 }, () =>
            finalizeCheckoutAttemptOpen({
              accountId: accounts.finalize,
              attemptId: reservation.attempt.id,
              providerSessionId,
              providerCreatedAt: new Date(BASE_TIME + 10_000),
              requestId: "request-finalize-once",
              now: new Date(BASE_TIME + 20_000),
            }),
          ),
        );
        assert.equal(
          finalizations.filter((result) => result.changed).length,
          1,
        );
        assert.ok(finalizations.every(({ attempt }) => attempt.state === "open"));

        const audits = await database
          .prepare(
            "select action, target_type, target_id, request_id, metadata from audit_events where action = 'billing.checkout_session_created' and target_id = ?",
          )
          .bind(reservation.attempt.id)
          .all();
        assert.equal(audits.results.length, 1);
        assert.deepEqual(audits.results[0], {
          action: "billing.checkout_session_created",
          target_type: "billing_checkout_attempt",
          target_id: reservation.attempt.id,
          request_id: "request-finalize-once",
          metadata: JSON.stringify({ provider: "stripe", requestVersion: 1 }),
        });
        const persistedAudit = JSON.stringify(audits.results[0]);
        assert.doesNotMatch(persistedAudit, /https?:\/\//);
        assert.doesNotMatch(persistedAudit, /roadmap-checkout-v1-/);
        assert.doesNotMatch(persistedAudit, new RegExp(providerSessionId));

        await assertRepositoryError(
          finalizeCheckoutAttemptOpen({
            accountId: accounts.other,
            attemptId: reservation.attempt.id,
            providerSessionId,
            providerCreatedAt: new Date(BASE_TIME + 10_000),
            now: new Date(BASE_TIME + 30_000),
          }),
          "checkout_attempt_not_found",
        );
        await assertRepositoryError(
          finalizeCheckoutAttemptOpen({
            accountId: accounts.finalize,
            attemptId: reservation.attempt.id,
            providerSessionId: "cs_different_session",
            providerCreatedAt: new Date(BASE_TIME + 10_000),
            now: new Date(BASE_TIME + 30_000),
          }),
          "checkout_attempt_conflict",
        );
      },
    );

    await context.test(
      "session uniqueness failure rolls back the conditional audit",
      async () => {
        const first = await reserveOrLoadCheckoutAttempt(
          reservationInput(accounts.duplicateA, BASE_TIME),
        );
        await finalizeCheckoutAttemptOpen({
          accountId: accounts.duplicateA,
          attemptId: first.attempt.id,
          providerSessionId: "cs_shared_unique_session",
          providerCreatedAt: new Date(BASE_TIME + 10_000),
          now: new Date(BASE_TIME + 20_000),
        });

        const second = await reserveOrLoadCheckoutAttempt(
          reservationInput(accounts.duplicateB, BASE_TIME),
        );
        await assertRepositoryError(
          finalizeCheckoutAttemptOpen({
            accountId: accounts.duplicateB,
            attemptId: second.attempt.id,
            providerSessionId: "cs_shared_unique_session",
            providerCreatedAt: new Date(BASE_TIME + 10_000),
            now: new Date(BASE_TIME + 20_000),
          }),
          "checkout_attempt_conflict",
        );
        const unchanged = await getCheckoutAttemptForAccount(
          accounts.duplicateB,
          second.attempt.id,
        );
        assert.equal(unchanged?.state, "reserved");
        assert.equal(unchanged?.providerSessionId, null);
        const auditCount = await database
          .prepare(
            "select count(*) as count from audit_events where action = 'billing.checkout_session_created' and target_id = ?",
          )
          .bind(second.attempt.id)
          .first();
        assert.equal(auditCount.count, 0);
      },
    );

    await context.test(
      "safe error recording never unlocks or rewrites terminal attempts",
      async () => {
        const reservation = await reserveOrLoadCheckoutAttempt(
          reservationInput(accounts.error, BASE_TIME),
        );
        const recorded = await recordCheckoutAttemptError({
          accountId: accounts.error,
          attemptId: reservation.attempt.id,
          errorCode: "stripe_timeout",
          now: new Date(BASE_TIME + 1_000),
        });
        assert.equal(recorded.changed, true);
        assert.equal(recorded.attempt.state, "reserved");
        assert.equal(recorded.attempt.lastErrorCode, "stripe_timeout");
        assert.equal(
          recorded.attempt.idempotencyKey,
          reservation.attempt.idempotencyKey,
        );

        await assertRepositoryError(
          recordCheckoutAttemptError({
            accountId: accounts.error,
            attemptId: reservation.attempt.id,
            errorCode: "provider failed: raw payload follows",
          }),
          "checkout_attempt_invalid",
        );
        await expireCheckoutAttemptAfterProviderConfirmation({
          accountId: accounts.error,
          attemptId: reservation.attempt.id,
          providerSessionId: "cs_error_then_expired",
          providerCreatedAt: new Date(BASE_TIME + 10_000),
          now: new Date(BASE_TIME + 3_600_000),
        });
        const terminal = await recordCheckoutAttemptError({
          accountId: accounts.error,
          attemptId: reservation.attempt.id,
          errorCode: "late_error",
          now: new Date(BASE_TIME + 3_600_001),
        });
        assert.equal(terminal.changed, false);
        assert.equal(terminal.attempt.state, "expired");
        assert.equal(terminal.attempt.lastErrorCode, null);
      },
    );

    await context.test(
      "completion lookup validates attempt, tenant, session, customer, and price",
      async () => {
        await insertCustomer(database, "cus_completion", accounts.completion);
        const reservation = await reserveOrLoadCheckoutAttempt({
          ...reservationInput(accounts.completion, BASE_TIME),
          providerCustomerId: "cus_completion",
        });
        const completionInput = {
          accountId: accounts.completion,
          attemptId: reservation.attempt.id,
          providerSessionId: "cs_completion",
          providerCustomerId: "cus_completion",
          providerPriceId: PRICE,
        };

        assert.equal(
          (await requireCheckoutAttemptForCompletion(completionInput)).state,
          "reserved",
        );
        await finalizeCheckoutAttemptOpen({
          accountId: accounts.completion,
          attemptId: reservation.attempt.id,
          providerSessionId: completionInput.providerSessionId,
          providerCreatedAt: new Date(BASE_TIME + 10_000),
          now: new Date(BASE_TIME + 20_000),
        });
        assert.equal(
          (await requireCheckoutAttemptForCompletion(completionInput)).state,
          "open",
        );

        await assertRepositoryError(
          requireCheckoutAttemptForCompletion({
            ...completionInput,
            accountId: accounts.other,
          }),
          "checkout_attempt_not_found",
        );
        for (const mismatch of [
          { providerSessionId: "cs_wrong_completion" },
          { providerCustomerId: "cus_wrong_completion" },
          { providerPriceId: "price_wrong_completion" },
        ]) {
          await assertRepositoryError(
            requireCheckoutAttemptForCompletion({
              ...completionInput,
              ...mismatch,
            }),
            "checkout_attempt_conflict",
          );
        }

        const drift = await reserveOrLoadCheckoutAttempt(
          reservationInput(accounts.drift, BASE_TIME),
        );
        await insertCustomer(database, "cus_drift", accounts.drift);
        await assertRepositoryError(
          requireCheckoutAttemptForCompletion({
            accountId: accounts.drift,
            attemptId: drift.attempt.id,
            providerSessionId: "cs_drift",
            providerCustomerId: "cus_different_after_reservation",
            providerPriceId: PRICE,
          }),
          "checkout_attempt_conflict",
        );
      },
    );

    await context.test(
      "signed-webhook lookup resolves local identifiers without account metadata",
      async () => {
        const first = await reserveOrLoadCheckoutAttempt(
          reservationInput(accounts.lookupA, BASE_TIME),
        );
        const second = await reserveOrLoadCheckoutAttempt(
          reservationInput(accounts.lookupB, BASE_TIME),
        );
        await finalizeCheckoutAttemptOpen({
          accountId: accounts.lookupA,
          attemptId: first.attempt.id,
          providerSessionId: "cs_signed_lookup_a",
          providerCreatedAt: new Date(BASE_TIME + 10_000),
          now: new Date(BASE_TIME + 20_000),
        });
        await finalizeCheckoutAttemptOpen({
          accountId: accounts.lookupB,
          attemptId: second.attempt.id,
          providerSessionId: "cs_signed_lookup_b",
          providerCreatedAt: new Date(BASE_TIME + 10_000),
          now: new Date(BASE_TIME + 20_000),
        });

        assert.equal(
          (
            await resolveCheckoutAttemptForSignedWebhook({
              attemptId: first.attempt.id,
            })
          )?.id,
          first.attempt.id,
        );
        assert.equal(
          (
            await resolveCheckoutAttemptForSignedWebhook({
              providerSessionId: "cs_signed_lookup_a",
            })
          )?.id,
          first.attempt.id,
        );
        assert.equal(
          (
            await resolveCheckoutAttemptForSignedWebhook({
              attemptId: first.attempt.id,
              providerSessionId: "cs_signed_lookup_a",
            })
          )?.id,
          first.attempt.id,
        );

        // One locally unknown identifier does not erase the other known local
        // identity; classification can still quarantine or reconcile the row.
        assert.equal(
          (
            await resolveCheckoutAttemptForSignedWebhook({
              attemptId: first.attempt.id,
              providerSessionId: "cs_signed_lookup_unknown",
            })
          )?.id,
          first.attempt.id,
        );
        assert.equal(
          await resolveCheckoutAttemptForSignedWebhook({
            attemptId: "attempt-not-local",
            providerSessionId: "cs_signed_lookup_not_local",
          }),
          null,
        );

        await assertRepositoryError(
          resolveCheckoutAttemptForSignedWebhook({
            attemptId: first.attempt.id,
            providerSessionId: "cs_signed_lookup_b",
          }),
          "checkout_attempt_conflict",
        );
        for (const invalidInput of [
          {},
          { attemptId: "invalid attempt id" },
          { providerSessionId: "session_without_prefix" },
        ]) {
          await assertRepositoryError(
            resolveCheckoutAttemptForSignedWebhook(invalidInput),
            "checkout_attempt_invalid",
          );
        }
      },
    );

    await context.test(
      "open subscriptions block reservation and lifecycle checks reject invalid rows",
      async () => {
        await insertCustomer(
          database,
          "cus_open_subscription",
          accounts.subscription,
        );
        await database
          .prepare(
            `insert into subscriptions (
              id, account_id, provider, provider_customer_id, product_code, status
            ) values (?, ?, 'stripe', ?, 'solo', 'active')`,
          )
          .bind(
            "subscription-open",
            accounts.subscription,
            "cus_open_subscription",
          )
          .run();
        await assertRepositoryError(
          reserveOrLoadCheckoutAttempt({
            ...reservationInput(accounts.subscription, BASE_TIME),
            providerCustomerId: "cus_open_subscription",
          }),
          "subscription_already_open",
        );

        const existingBlocker = await reserveOrLoadCheckoutAttempt(
          reservationInput(accounts.blockerSubscription, BASE_TIME),
        );
        await insertCustomer(
          database,
          "cus_blocker_subscription",
          accounts.blockerSubscription,
        );
        await database
          .prepare(
            `insert into subscriptions (
              id, account_id, provider, provider_customer_id, product_code, status
            ) values (?, ?, 'stripe', ?, 'solo', 'active')`,
          )
          .bind(
            "subscription-after-blocker",
            accounts.blockerSubscription,
            "cus_blocker_subscription",
          )
          .run();
        await assertRepositoryError(
          reserveOrLoadCheckoutAttempt(
            reservationInput(accounts.blockerSubscription, BASE_TIME + 1_000),
          ),
          "subscription_already_open",
        );
        assert.equal(
          (
            await getCheckoutAttemptForAccount(
              accounts.blockerSubscription,
              existingBlocker.attempt.id,
            )
          )?.state,
          "reserved",
        );

        const constraintAttempt = await reserveOrLoadCheckoutAttempt(
          reservationInput(accounts.constraint, BASE_TIME),
        );
        await assert.rejects(
          database
            .prepare(
              "update billing_checkout_attempts set state = 'open' where id = ?",
            )
            .bind(constraintAttempt.attempt.id)
            .run(),
          /check constraint failed/i,
        );
        await assert.rejects(
          database
            .prepare(
              "update billing_checkout_attempts set state = 'completed' where id = ?",
            )
            .bind(constraintAttempt.attempt.id)
            .run(),
          /check constraint failed/i,
        );
      },
    );
  },
);

function reservationInput(accountId, nowMilliseconds) {
  return {
    accountId,
    providerPriceId: PRICE,
    applicationOrigin: testOrigin,
    providerCustomerId: null,
    customerEmail: `${accountId}@example.test`,
    providerExpiresAt: new Date(nowMilliseconds + 3_600_000),
    now: new Date(nowMilliseconds),
  };
}

function frozenSnapshot(attempt) {
  return {
    id: attempt.id,
    idempotencyKey: attempt.idempotencyKey,
    providerPriceId: attempt.providerPriceId,
    applicationOrigin: attempt.applicationOrigin,
    providerCustomerId: attempt.providerCustomerId,
    customerEmail: attempt.customerEmail,
    providerExpiresAt: attempt.providerExpiresAt.getTime(),
    createdAt: attempt.createdAt.getTime(),
  };
}

async function seedAccounts(database, entries) {
  await database.batch(
    entries.map(([label, id]) => {
      const email = `${label.toLowerCase()}@example.test`;
      return database
        .prepare(
          `insert into accounts (
            id, auth_subject, primary_email, normalized_email,
            email_verified_at, status
          ) values (?, ?, ?, ?, ?, 'active')`,
        )
        .bind(
          id,
          `subject-${label}`,
          email,
          email,
          BASE_TIME,
        );
    }),
  );
}

function insertCustomer(database, customerId, accountId) {
  return database
    .prepare(
      "insert into billing_customers (provider, provider_customer_id, account_id) values ('stripe', ?, ?)",
    )
    .bind(customerId, accountId)
    .run();
}

function insertAttemptRaw(database, input) {
  return database
    .prepare(
      `insert into billing_checkout_attempts (
        id, account_id, idempotency_key, provider_price_id,
        application_origin, provider_customer_id, customer_email,
        provider_expires_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.accountId,
      `roadmap-checkout-v1-${input.id}`,
      PRICE,
      testOrigin,
      input.customerId,
      `${input.accountId}@example.test`,
      input.expiresAt,
      BASE_TIME,
      BASE_TIME,
    )
    .run();
}

async function assertRepositoryError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof CheckoutRepositoryError);
    assert.equal(error.code, code);
    assert.equal(error.message, error.safeMessage);
    return true;
  });
}
