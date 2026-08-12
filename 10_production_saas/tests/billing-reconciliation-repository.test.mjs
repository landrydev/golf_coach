import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { startD1Worker, testOrigin } from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const { env } = await import("cloudflare:workers");
const { getDb } = await import("../db/index.ts");
const { auditEvents } = await import("../db/schema.ts");
const {
  applyStripeSubscriptionReconciliation,
  BillingRepositoryError,
} = await import("../lib/billing-repository.ts");
const { acquireBillingAccountOperationLease } = await import(
  "../lib/billing-account-operation-lease.ts"
);
const {
  BillingReconciliationRepositoryError,
  billingReconciliationSuccessEffects,
  claimBillingReconciliation,
  completeBillingReconciliationCheck,
  failBillingReconciliation,
  getBillingReconciliationTarget,
} = await import("../lib/billing-reconciliation-repository.ts");

const BASE_TIME = Date.UTC(2026, 7, 8, 18, 0, 0);
const LEASE_MS = 5 * 60 * 1_000;
const accounts = {
  owner: "account-reconcile-owner",
  other: "account-reconcile-other",
  race: "account-reconcile-race",
  lifecycle: "account-reconcile-lifecycle",
  generation: "account-reconcile-generation",
  relation: "account-reconcile-relation",
  checkoutRelation: "account-reconcile-checkout-relation",
  terminalRelation: "account-reconcile-terminal-relation",
  cascade: "account-reconcile-cascade",
};

test(
  "billing reconciliation targets enforce tenant ownership, durable leases, and terminal fences",
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
    await seedSubscription(database, accounts.owner, "owner");
    await seedSubscription(database, accounts.race, "race");
    await seedSubscription(database, accounts.lifecycle, "lifecycle");
    await seedSubscription(database, accounts.generation, "generation");
    await seedSubscription(database, accounts.relation, "relation_primary");
    await seedAdditionalSubscription(
      database,
      accounts.relation,
      "relation_primary",
      "relation_other",
    );
    await seedSubscription(
      database,
      accounts.checkoutRelation,
      "checkout_relation",
    );
    await seedSubscription(
      database,
      accounts.terminalRelation,
      "terminal_primary",
    );
    await seedAdditionalSubscription(
      database,
      accounts.terminalRelation,
      "terminal_primary",
      "terminal_other",
    );
    await seedSubscription(database, accounts.cascade, "cascade");
    await seedCheckoutAttempt(database, accounts.owner, "owner");
    await seedCheckoutAttempt(
      database,
      accounts.checkoutRelation,
      "checkout_relation",
    );

    await context.test(
      "claims are account-bound and subscription and Checkout targets do not collide",
      async () => {
        const subscriptionTarget = {
          kind: "subscription",
          subscriptionId: subscriptionId("owner"),
        };
        const checkoutTarget = {
          kind: "checkout_attempt",
          checkoutAttemptId: checkoutAttemptId("owner"),
        };
        const subscriptionClaim = await claimBillingReconciliation({
          accountId: accounts.owner,
          target: subscriptionTarget,
          now: new Date(BASE_TIME),
        });
        assert.ok(subscriptionClaim);
        assert.equal(subscriptionClaim.processingAttempt, 1);
        assert.deepEqual(subscriptionClaim.target, subscriptionTarget);
        assert.equal(
          subscriptionClaim.leaseExpiresAt.getTime(),
          BASE_TIME + LEASE_MS,
        );
        assert.equal(
          await claimBillingReconciliation({
            accountId: accounts.owner,
            target: subscriptionTarget,
            now: new Date(BASE_TIME + 1),
          }),
          null,
        );

        const checkoutClaim = await claimBillingReconciliation({
          accountId: accounts.owner,
          target: checkoutTarget,
          now: new Date(BASE_TIME),
        });
        assert.ok(checkoutClaim);
        const operationLease = await acquireReconciliationOperationLease(
          accounts.owner,
          new Date(BASE_TIME),
        );
        assert.notEqual(
          checkoutClaim.reconciliationId,
          subscriptionClaim.reconciliationId,
        );
        assert.deepEqual(checkoutClaim.target, checkoutTarget);

        await assertRepositoryError(
          claimBillingReconciliation({
            accountId: accounts.other,
            target: subscriptionTarget,
            now: new Date(BASE_TIME),
          }),
          "billing_reconciliation_target_not_found",
        );
        await assertRepositoryError(
          claimBillingReconciliation({
            accountId: accounts.other,
            target: checkoutTarget,
            now: new Date(BASE_TIME),
          }),
          "billing_reconciliation_target_not_found",
        );

        const rows = await database
          .prepare(
            "select count(*) as count from billing_reconciliation_targets where account_id = ?",
          )
          .bind(accounts.owner)
          .first();
        assert.equal(rows.count, 2);

        await assertRepositoryError(
          completeBillingReconciliationCheck({
            claim: subscriptionClaim,
            operationLease,
            now: new Date(BASE_TIME + 1_000),
          }),
          "billing_reconciliation_input_invalid",
        );
        await completeBillingReconciliationCheck({
          claim: checkoutClaim,
          operationLease,
          now: new Date(BASE_TIME + 1_000),
        });
        const completedCheckoutCheck = await getBillingReconciliationTarget({
          accountId: accounts.owner,
          target: checkoutTarget,
        });
        assert.equal(completedCheckoutCheck?.state, "succeeded");
        assert.equal(completedCheckoutCheck?.leaseToken, null);
        assert.equal(
          completedCheckoutCheck?.lastSucceededAt?.getTime(),
          BASE_TIME + 1_000,
        );
        await assertRepositoryError(
          completeBillingReconciliationCheck({
            claim: checkoutClaim,
            operationLease,
            now: new Date(BASE_TIME + 2_000),
          }),
          "billing_reconciliation_persistence_failed",
        );
      },
    );

    await context.test(
      "concurrent first claims admit exactly one lease owner",
      async () => {
        const target = {
          kind: "subscription",
          subscriptionId: subscriptionId("race"),
        };
        const claims = await Promise.all(
          Array.from({ length: 12 }, () =>
            claimBillingReconciliation({
              accountId: accounts.race,
              target,
              now: new Date(BASE_TIME),
            }),
          ),
        );
        assert.equal(claims.filter(Boolean).length, 1);
        const record = await getBillingReconciliationTarget({
          accountId: accounts.race,
          target,
        });
        assert.equal(record?.state, "processing");
        assert.equal(record?.processingAttempts, 1);
        assert.equal(record?.leaseToken, claims.find(Boolean).leaseToken);
      },
    );

    await context.test(
      "failure, retry, and expiry keep one row and reject stale workers",
      async () => {
        const target = {
          kind: "subscription",
          subscriptionId: subscriptionId("lifecycle"),
        };
        const first = await claimBillingReconciliation({
          accountId: accounts.lifecycle,
          target,
          now: new Date(BASE_TIME),
        });
        assert.ok(first);
        const operationLease = await acquireReconciliationOperationLease(
          accounts.lifecycle,
          new Date(BASE_TIME),
        );
        await failBillingReconciliation({
          claim: first,
          operationLease,
          errorCode: "provider_unavailable",
          errorMessage: "The provider was temporarily unavailable.",
          now: new Date(BASE_TIME + 1_000),
        });

        let record = await getBillingReconciliationTarget({
          accountId: accounts.lifecycle,
          target,
        });
        assert.equal(record?.state, "failed");
        assert.equal(record?.leaseToken, null);
        assert.equal(record?.lastErrorCode, "provider_unavailable");
        assert.equal(record?.lastCompletedAt?.getTime(), BASE_TIME + 1_000);

        const second = await claimBillingReconciliation({
          accountId: accounts.lifecycle,
          target,
          now: new Date(BASE_TIME + 2_000),
        });
        assert.ok(second);
        assert.equal(second.reconciliationId, first.reconciliationId);
        assert.equal(second.processingAttempt, 2);
        assert.notEqual(second.leaseToken, first.leaseToken);
        record = await getBillingReconciliationTarget({
          accountId: accounts.lifecycle,
          target,
        });
        assert.equal(record?.lastErrorCode, null);
        assert.equal(record?.lastErrorMessage, null);
        assert.equal(record?.lastCompletedAt, null);

        await assertRepositoryError(
          failBillingReconciliation({
            claim: first,
            operationLease,
            errorCode: "stale_worker",
            errorMessage: "A stale worker must not finish this lease.",
            now: new Date(BASE_TIME + 3_000),
          }),
          "billing_reconciliation_persistence_failed",
        );

        const third = await claimBillingReconciliation({
          accountId: accounts.lifecycle,
          target,
          now: new Date(BASE_TIME + 2_000 + LEASE_MS),
        });
        assert.ok(third);
        assert.equal(third.reconciliationId, first.reconciliationId);
        assert.equal(third.processingAttempt, 3);
        assert.notEqual(third.leaseToken, second.leaseToken);
        await assertRepositoryError(
          failBillingReconciliation({
            claim: second,
            operationLease,
            errorCode: "expired_worker",
            errorMessage: "An expired worker must not finish this lease.",
            now: new Date(BASE_TIME + 2_000 + LEASE_MS + 1),
          }),
          "billing_reconciliation_persistence_failed",
        );
        record = await getBillingReconciliationTarget({
          accountId: accounts.lifecycle,
          target,
        });
        assert.equal(record?.state, "processing");
        assert.equal(record?.leaseToken, third.leaseToken);
        assert.equal(record?.processingAttempts, 3);
      },
    );

    await context.test(
      "lease and provider-generation guards roll back the whole success batch",
      async () => {
        const target = {
          kind: "subscription",
          subscriptionId: subscriptionId("generation"),
        };
        const first = await claimBillingReconciliation({
          accountId: accounts.generation,
          target,
          now: new Date(BASE_TIME),
        });
        assert.ok(first);
        await setProjectionGeneration(database, "generation", 1);

        const second = await claimBillingReconciliation({
          accountId: accounts.generation,
          target,
          now: new Date(BASE_TIME + LEASE_MS + 1),
        });
        assert.ok(second);
        assert.equal(second.processingAttempt, 2);
        const operationLease = await acquireReconciliationOperationLease(
          accounts.generation,
          new Date(BASE_TIME + LEASE_MS + 1),
        );

        await assert.rejects(
          runSuccessBatch({
            accountId: accounts.generation,
            claim: first,
            operationLease,
            generation: 1,
            auditId: "audit-stale-lease",
            now: new Date(BASE_TIME + LEASE_MS + 2),
          }),
        );
        assert.equal(await auditExists(database, "audit-stale-lease"), false);

        await setProjectionGeneration(database, "generation", 2);
        await assert.rejects(
          runSuccessBatch({
            accountId: accounts.generation,
            claim: second,
            operationLease,
            generation: 1,
            auditId: "audit-stale-generation",
            now: new Date(BASE_TIME + LEASE_MS + 3),
          }),
        );
        assert.equal(
          await auditExists(database, "audit-stale-generation"),
          false,
        );

        await runSuccessBatch({
          accountId: accounts.generation,
          claim: second,
          operationLease,
          generation: 2,
          auditId: "audit-current-generation",
          now: new Date(BASE_TIME + LEASE_MS + 4),
        });
        let record = await getBillingReconciliationTarget({
          accountId: accounts.generation,
          target,
        });
        assert.equal(record?.state, "succeeded");
        assert.equal(record?.leaseToken, null);
        assert.equal(
          record?.lastSucceededAt?.getTime(),
          BASE_TIME + LEASE_MS + 4,
        );
        assert.equal(
          await auditExists(database, "audit-current-generation"),
          true,
        );

        const retry = await claimBillingReconciliation({
          accountId: accounts.generation,
          target,
          now: new Date(BASE_TIME + LEASE_MS + 5),
        });
        assert.ok(retry);
        assert.equal(retry.processingAttempt, 3);
        record = await getBillingReconciliationTarget({
          accountId: accounts.generation,
          target,
        });
        assert.equal(record?.state, "processing");
        assert.equal(record?.lastCompletedAt, null);
        assert.equal(
          record?.lastSucceededAt?.getTime(),
          BASE_TIME + LEASE_MS + 4,
        );
      },
    );

    await context.test(
      "projection commits reject claims bound to a different subscription or Checkout attempt",
      async () => {
        const subscriptionClaim = await claimBillingReconciliation({
          accountId: accounts.relation,
          target: {
            kind: "subscription",
            subscriptionId: subscriptionId("relation_primary"),
          },
          now: new Date(BASE_TIME),
        });
        assert.ok(subscriptionClaim);
        const subscriptionOperationLease =
          await acquireReconciliationOperationLease(
            accounts.relation,
            new Date(BASE_TIME),
          );
        await setProjectionGeneration(database, "relation_primary", 1);

        await assertBillingRepositoryError(
          applyStripeSubscriptionReconciliation({
            claim: {
              ...subscriptionClaim,
              target: {
                kind: "subscription",
                subscriptionId: subscriptionId("relation_other"),
              },
            },
            operationLease: subscriptionOperationLease,
            projection: subscriptionProjection(
              accounts.relation,
              "relation_primary",
            ),
            projectionGeneration: {
              providerSubscriptionId:
                providerSubscriptionId("relation_primary"),
              generation: 1,
            },
            reconciledAt: new Date(BASE_TIME + 1_000),
          }),
          "billing_reconciliation_target_mismatch",
        );

        const checkoutClaim = await claimBillingReconciliation({
          accountId: accounts.checkoutRelation,
          target: {
            kind: "checkout_attempt",
            checkoutAttemptId: checkoutAttemptId("checkout_relation"),
          },
          now: new Date(BASE_TIME),
        });
        assert.ok(checkoutClaim);
        const checkoutOperationLease =
          await acquireReconciliationOperationLease(
            accounts.checkoutRelation,
            new Date(BASE_TIME),
          );
        await assertBillingRepositoryError(
          applyStripeSubscriptionReconciliation({
            claim: checkoutClaim,
            operationLease: checkoutOperationLease,
            projection: subscriptionProjection(
              accounts.checkoutRelation,
              "checkout_relation",
            ),
            projectionGeneration: {
              providerSubscriptionId:
                providerSubscriptionId("checkout_relation"),
              generation: 1,
            },
            reconciledAt: new Date(BASE_TIME + 1_000),
            checkoutAttempt: {
              attemptId: "checkout_reconcile_wrong_attempt",
              providerSessionId: "cs_reconcile_wrong_attempt",
              providerCreatedAt: null,
            },
          }),
          "billing_reconciliation_target_mismatch",
        );

        const revision = await database
          .prepare(
            "select projection_revision as revision from subscriptions where id = ?",
          )
          .bind(subscriptionId("relation_primary"))
          .first();
        assert.equal(revision.revision, 1);
        assert.equal(
          await auditActionCount(
            database,
            accounts.relation,
            "billing.subscription_reconciled",
          ),
          0,
        );
      },
    );

    await context.test(
      "terminal D1 guard rolls back when the stored target differs from the committed target",
      async () => {
        const claim = await claimBillingReconciliation({
          accountId: accounts.terminalRelation,
          target: {
            kind: "subscription",
            subscriptionId: subscriptionId("terminal_primary"),
          },
          now: new Date(BASE_TIME),
        });
        assert.ok(claim);
        const operationLease = await acquireReconciliationOperationLease(
          accounts.terminalRelation,
          new Date(BASE_TIME),
        );
        await setProjectionGeneration(database, "terminal_primary", 1);
        const committedTarget = {
          kind: "subscription",
          subscriptionId: subscriptionId("terminal_other"),
        };
        const forgedClaim = { ...claim, target: committedTarget };

        await assert.rejects(
          runSuccessBatch({
            accountId: accounts.terminalRelation,
            claim: forgedClaim,
            operationLease,
            terminalTarget: committedTarget,
            providerSubscriptionLabel: "terminal_primary",
            generation: 1,
            auditId: "audit-target-mismatch",
            now: new Date(BASE_TIME + 1_000),
          }),
        );
        assert.equal(await auditExists(database, "audit-target-mismatch"), false);
        const record = await getBillingReconciliationTarget({
          accountId: accounts.terminalRelation,
          target: claim.target,
        });
        assert.equal(record?.state, "processing");
        assert.equal(record?.leaseToken, claim.leaseToken);
      },
    );

    await context.test(
      "database constraints reject malformed or cross-tenant target rows and cascades remove work",
      async () => {
        await assert.rejects(
          insertRawTarget(database, {
            id: "reconciliation-both-targets",
            accountId: accounts.owner,
            subscriptionId: subscriptionId("owner"),
            checkoutAttemptId: checkoutAttemptId("owner"),
            leaseToken: "lease-both-targets",
          }),
          /check constraint failed/i,
        );
        await assert.rejects(
          insertRawTarget(database, {
            id: "reconciliation-cross-tenant",
            accountId: accounts.other,
            subscriptionId: subscriptionId("owner"),
            checkoutAttemptId: null,
            leaseToken: "lease-cross-tenant",
          }),
          /foreign key constraint failed/i,
        );
        await assert.rejects(
          database
            .prepare(
              `insert into billing_reconciliation_targets (
                id, account_id, subscription_id, state,
                last_attempt_at, processing_attempts
              ) values (?, ?, ?, 'processing', ?, 1)`,
            )
            .bind(
              "reconciliation-missing-lease",
              accounts.cascade,
              subscriptionId("cascade"),
              BASE_TIME,
            )
            .run(),
          /check constraint failed/i,
        );

        const target = {
          kind: "subscription",
          subscriptionId: subscriptionId("cascade"),
        };
        assert.ok(
          await claimBillingReconciliation({
            accountId: accounts.cascade,
            target,
            now: new Date(BASE_TIME),
          }),
        );
        await database
          .prepare("delete from accounts where id = ?")
          .bind(accounts.cascade)
          .run();
        const remaining = await database
          .prepare(
            "select count(*) as count from billing_reconciliation_targets where account_id = ?",
          )
          .bind(accounts.cascade)
          .first();
        assert.equal(remaining.count, 0);
      },
    );

    await context.test("invalid inputs fail before mutating D1", async () => {
      const before = await database
        .prepare("select count(*) as count from billing_reconciliation_targets")
        .first();
      await assertRepositoryError(
        claimBillingReconciliation({
          accountId: ` ${accounts.other}`,
          target: {
            kind: "subscription",
            subscriptionId: subscriptionId("owner"),
          },
          now: new Date(BASE_TIME),
        }),
        "billing_reconciliation_input_invalid",
      );
      await assertRepositoryError(
        claimBillingReconciliation({
          accountId: accounts.other,
          target: { kind: "provider_subscription", id: "sub_untrusted" },
          now: new Date(BASE_TIME),
        }),
        "billing_reconciliation_input_invalid",
      );
      await assertRepositoryError(
        claimBillingReconciliation({
          accountId: accounts.other,
          target: {
            kind: "subscription",
            subscriptionId: subscriptionId("owner"),
          },
          now: new Date(Number.NaN),
        }),
        "billing_reconciliation_input_invalid",
      );
      const after = await database
        .prepare("select count(*) as count from billing_reconciliation_targets")
        .first();
      assert.equal(after.count, before.count);
    });
  },
);

async function runSuccessBatch(input) {
  const db = getDb();
  await db.batch([
    ...billingReconciliationSuccessEffects(db, {
      claim: input.claim,
      operationLease: input.operationLease,
      terminalTarget: input.terminalTarget ?? input.claim.target,
      projectionGeneration: {
        providerSubscriptionId: providerSubscriptionId(
          input.providerSubscriptionLabel ?? "generation",
        ),
        generation: input.generation,
      },
      now: input.now,
    }),
    db.insert(auditEvents).values({
      id: input.auditId,
      accountId: input.accountId,
      actorType: "account",
      actorAccountId: input.accountId,
      action: "billing.reconciliation_test",
      targetType: "billing_reconciliation_target",
      targetId: input.claim.reconciliationId,
      outcome: "success",
    }),
  ]);
}

async function acquireReconciliationOperationLease(accountId, now) {
  const claim = await acquireBillingAccountOperationLease({
    accountId,
    operation: "reconciliation",
    now,
  });
  assert.ok(claim);
  return claim;
}

async function seedAdditionalSubscription(
  database,
  accountId,
  customerLabel,
  subscriptionLabel,
) {
  await database
    .prepare(
      `insert into subscriptions (
        id, account_id, provider, provider_customer_id,
        provider_subscription_id, provider_price_id, product_code,
        status, billing_interval, last_provider_sync_at,
        projection_revision
      ) values (?, ?, 'stripe', ?, ?, ?, 'solo',
        'ended', 'month', ?, 1)`,
    )
    .bind(
      subscriptionId(subscriptionLabel),
      accountId,
      providerCustomerId(customerLabel),
      providerSubscriptionId(subscriptionLabel),
      `price_reconcile_${subscriptionLabel}`,
      BASE_TIME,
    )
    .run();
}

function subscriptionProjection(accountId, label) {
  return {
    accountId,
    providerCustomerId: providerCustomerId(label),
    providerSubscriptionId: providerSubscriptionId(label),
    providerPriceId: `price_reconcile_${label}`,
    status: "active",
    billingInterval: "month",
    currency: "CAD",
    unitAmountMinor: 7_500,
    trialStartsAt: null,
    trialEndsAt: null,
    currentPeriodStartsAt: new Date(BASE_TIME - 1_000),
    currentPeriodEndsAt: new Date(BASE_TIME + 86_400_000),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    endedAt: null,
  };
}

async function seedAccounts(database, entries) {
  await database.batch(
    entries.map(([label, id]) => {
      const email = `${label.toLowerCase()}@reconciliation.example.test`;
      return database
        .prepare(
          `insert into accounts (
            id, auth_subject, primary_email, normalized_email,
            email_verified_at, status
          ) values (?, ?, ?, ?, ?, 'active')`,
        )
        .bind(id, `subject-reconcile-${label}`, email, email, BASE_TIME);
    }),
  );
}

async function seedSubscription(database, accountId, label) {
  await database.batch([
    database
      .prepare(
        `insert into billing_customers (
          provider, provider_customer_id, account_id
        ) values ('stripe', ?, ?)`,
      )
      .bind(providerCustomerId(label), accountId),
    database
      .prepare(
        `insert into subscriptions (
          id, account_id, provider, provider_customer_id,
          provider_subscription_id, provider_price_id, product_code,
          status, billing_interval, last_provider_sync_at,
          projection_revision
        ) values (?, ?, 'stripe', ?, ?, ?, 'solo',
          'active', 'month', ?, 1)`,
      )
      .bind(
        subscriptionId(label),
        accountId,
        providerCustomerId(label),
        providerSubscriptionId(label),
        `price_reconcile_${label}`,
        BASE_TIME,
      ),
  ]);
}

function seedCheckoutAttempt(database, accountId, label) {
  return database
    .prepare(
      `insert into billing_checkout_attempts (
        id, account_id, idempotency_key, provider_price_id,
        application_origin, provider_customer_id, customer_email,
        provider_expires_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      checkoutAttemptId(label),
      accountId,
      `roadmap-checkout-reconcile-${label}`,
      `price_reconcile_${label}`,
      testOrigin,
      providerCustomerId(label),
      `${label}@reconciliation.example.test`,
      BASE_TIME + 60 * 60 * 1_000,
      BASE_TIME,
      BASE_TIME,
    )
    .run();
}

function setProjectionGeneration(database, label, generation) {
  return database
    .prepare(
      `insert into billing_subscription_projection_generations (
        provider, provider_subscription_id, generation, created_at, updated_at
      ) values ('stripe', ?, ?, ?, ?)
      on conflict (provider, provider_subscription_id)
      do update set generation = excluded.generation, updated_at = excluded.updated_at`,
    )
    .bind(
      providerSubscriptionId(label),
      generation,
      BASE_TIME,
      BASE_TIME,
    )
    .run();
}

function insertRawTarget(database, input) {
  return database
    .prepare(
      `insert into billing_reconciliation_targets (
        id, account_id, subscription_id, checkout_attempt_id,
        state, lease_token, lease_expires_at, last_attempt_at,
        processing_attempts, created_at, updated_at
      ) values (?, ?, ?, ?, 'processing', ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      input.id,
      input.accountId,
      input.subscriptionId,
      input.checkoutAttemptId,
      input.leaseToken,
      BASE_TIME + LEASE_MS,
      BASE_TIME,
      BASE_TIME,
      BASE_TIME,
    )
    .run();
}

async function auditExists(database, id) {
  const row = await database
    .prepare("select count(*) as count from audit_events where id = ?")
    .bind(id)
    .first();
  return row.count === 1;
}

async function auditActionCount(database, accountId, action) {
  const row = await database
    .prepare(
      "select count(*) as count from audit_events where account_id = ? and action = ?",
    )
    .bind(accountId, action)
    .first();
  return row.count;
}

async function assertBillingRepositoryError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof BillingRepositoryError);
    assert.equal(error.code, code);
    assert.equal(error.message, error.safeMessage);
    return true;
  });
}

async function assertRepositoryError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof BillingReconciliationRepositoryError);
    assert.equal(error.code, code);
    assert.equal(error.message, error.safeMessage);
    return true;
  });
}

function subscriptionId(label) {
  return `subscription_reconcile_${label}`;
}

function providerSubscriptionId(label) {
  return `sub_reconcile_${label}`;
}

function providerCustomerId(label) {
  return `cus_reconcile_${label}`;
}

function checkoutAttemptId(label) {
  return `checkout_reconcile_${label}`;
}
