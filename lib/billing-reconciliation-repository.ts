import { env } from "cloudflare:workers";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  billingReconciliationTargets,
  billingSubscriptionProjectionGenerations,
} from "@/db/schema";
import {
  billingAccountOperationLeaseGuard,
  type BillingAccountOperationLeaseClaim,
} from "@/lib/billing-account-operation-lease";
import {
  billingReconciliationBackoffMs,
  MAX_AUTOMATIC_RECONCILIATION_FAILURES,
} from "@/lib/billing-reconciliation-policy";
import { newId } from "@/lib/tokens";

const PROVIDER = "stripe";
const RECONCILIATION_LEASE_MS = 5 * 60 * 1_000;

export type BillingReconciliationTarget =
  | Readonly<{ kind: "subscription"; subscriptionId: string }>
  | Readonly<{ kind: "checkout_attempt"; checkoutAttemptId: string }>;
export type BillingReconciliationTargetRecord =
  typeof billingReconciliationTargets.$inferSelect;
export type BillingReconciliationProjectionGeneration = Readonly<{
  providerSubscriptionId: string;
  generation: number;
}>;
export type BillingReconciliationClaim = Readonly<{
  reconciliationId: string;
  accountId: string;
  target: BillingReconciliationTarget;
  leaseToken: string;
  leaseExpiresAt: Date;
  processingAttempt: number;
  automaticFailureCount: number;
}>;

export class BillingReconciliationRepositoryError extends Error {
  constructor(
    public readonly code:
      | "billing_reconciliation_input_invalid"
      | "billing_reconciliation_target_not_found"
      | "billing_reconciliation_persistence_failed",
    public readonly safeMessage: string,
    options?: ErrorOptions,
  ) {
    super(safeMessage, options);
    this.name = "BillingReconciliationRepositoryError";
  }
}

/**
 * Atomically create or reclaim the durable lease for one locally owned billing
 * object. INSERT ... SELECT proves account ownership in the write statement;
 * callers never claim work by a browser- or provider-supplied Stripe ID.
 */
export async function claimBillingReconciliation(input: {
  accountId: string;
  target: BillingReconciliationTarget;
  now?: Date;
}): Promise<BillingReconciliationClaim | null> {
  assertIdentifier(input.accountId, "accountId");
  assertTarget(input.target);
  const now = checkedDate(input.now ?? new Date(), "now");
  const reconciliationId = newId();
  const leaseToken = newId();
  const leaseExpiresAt = new Date(now.getTime() + RECONCILIATION_LEASE_MS);
  const targetId = localTargetId(input.target);
  const targetShape =
    input.target.kind === "subscription"
      ? {
          source: "subscriptions",
          sourceIdColumn: "id",
          providerIdentifierRequirement:
            "AND provider_subscription_id IS NOT NULL",
          subscriptionValue: "id",
          checkoutValue: "NULL",
          conflictColumn: "subscription_id",
        }
      : {
          source: "billing_checkout_attempts",
          sourceIdColumn: "id",
          providerIdentifierRequirement: "",
          subscriptionValue: "NULL",
          checkoutValue: "id",
          conflictColumn: "checkout_attempt_id",
        };

  let claimedId: string | null;
  try {
    const claimed = await d1()
      .prepare(
        `INSERT INTO billing_reconciliation_targets (
           id,
           account_id,
           provider,
           subscription_id,
           checkout_attempt_id,
           state,
           lease_token,
           lease_expires_at,
           last_attempt_at,
           processing_attempts,
           automatic_failure_count,
           next_automatic_attempt_at,
           automatic_dead_lettered_at,
           last_error_code,
           last_error_message,
           last_completed_at,
           last_succeeded_at,
           created_at,
           updated_at
         )
         SELECT ?, account_id, 'stripe', ${targetShape.subscriptionValue},
           ${targetShape.checkoutValue}, 'processing', ?, ?, ?, 1, 0, NULL, NULL,
           NULL, NULL, NULL, NULL, ?, ?
         FROM ${targetShape.source}
         WHERE ${targetShape.sourceIdColumn} = ?
           AND account_id = ?
           AND provider = 'stripe'
           ${targetShape.providerIdentifierRequirement}
         ON CONFLICT (provider, account_id, ${targetShape.conflictColumn})
           WHERE ${targetShape.conflictColumn} IS NOT NULL
         DO UPDATE SET
           state = 'processing',
           lease_token = excluded.lease_token,
           lease_expires_at = excluded.lease_expires_at,
           last_attempt_at = excluded.last_attempt_at,
           processing_attempts = min(
             billing_reconciliation_targets.processing_attempts + 1,
             2147483647
           ),
           next_automatic_attempt_at = NULL,
           automatic_dead_lettered_at = NULL,
           last_error_code = NULL,
           last_error_message = NULL,
           last_completed_at = NULL,
           updated_at = excluded.updated_at
         WHERE billing_reconciliation_targets.state <> 'processing'
            OR billing_reconciliation_targets.lease_token IS NULL
            OR billing_reconciliation_targets.lease_expires_at IS NULL
            OR billing_reconciliation_targets.lease_expires_at <= ?
         RETURNING id`,
      )
      .bind(
        reconciliationId,
        leaseToken,
        leaseExpiresAt.getTime(),
        now.getTime(),
        now.getTime(),
        now.getTime(),
        targetId,
        input.accountId,
        now.getTime(),
      )
      .first<{ id: string }>();
    claimedId = claimed?.id ?? null;
  } catch (cause) {
    throw persistenceFailed(
      "The billing reconciliation target could not be claimed.",
      cause,
    );
  }

  if (!claimedId) {
    const existing = await getBillingReconciliationTarget({
      accountId: input.accountId,
      target: input.target,
    });
    if (existing?.state === "processing") return null;
    if (existing) {
      throw persistenceFailed(
        "The billing reconciliation target could not be reclaimed.",
      );
    }
    throw new BillingReconciliationRepositoryError(
      "billing_reconciliation_target_not_found",
      "The billing reconciliation target is unavailable for this account.",
    );
  }

  const record = await getBillingReconciliationTarget({
    accountId: input.accountId,
    target: input.target,
  });
  if (
    !record ||
    record.id !== claimedId ||
    record.state !== "processing" ||
    record.leaseToken !== leaseToken ||
    !record.leaseExpiresAt ||
    record.leaseExpiresAt.getTime() !== leaseExpiresAt.getTime()
  ) {
    throw persistenceFailed(
      "The claimed billing reconciliation target could not be loaded.",
    );
  }

  return {
    reconciliationId: record.id,
    accountId: record.accountId,
    target: targetFromRecord(record),
    leaseToken,
    leaseExpiresAt,
    processingAttempt: record.processingAttempts,
    automaticFailureCount: record.automaticFailureCount,
  };
}

export async function getBillingReconciliationTarget(input: {
  accountId: string;
  target: BillingReconciliationTarget;
}): Promise<BillingReconciliationTargetRecord | null> {
  assertIdentifier(input.accountId, "accountId");
  assertTarget(input.target);
  const [record] = await getDb()
    .select()
    .from(billingReconciliationTargets)
    .where(
      and(
        eq(billingReconciliationTargets.accountId, input.accountId),
        eq(billingReconciliationTargets.provider, PROVIDER),
        targetPredicate(input.target),
      ),
    )
    .limit(1);
  return record ?? null;
}

/**
 * Return terminal effects for the caller's projection transaction. Projection
 * success is deliberately not exposed as a standalone repository call: the
 * live lease, latest pre-retrieval generation, projection mutation, Checkout
 * mutation, success audit, and these effects must commit or roll back in one
 * D1 batch.
 */
export function billingReconciliationSuccessEffects(
  db: ReturnType<typeof getDb>,
  input: {
    claim: BillingReconciliationClaim;
    operationLease: BillingAccountOperationLeaseClaim;
    terminalTarget: BillingReconciliationTarget;
    projectionGeneration: BillingReconciliationProjectionGeneration;
    now?: Date;
  },
) {
  assertClaim(input.claim);
  assertOperationLease(input.operationLease, input.claim);
  assertTarget(input.terminalTarget);
  if (!targetsEqual(input.claim.target, input.terminalTarget)) {
    throw invalid(
      "claim target must match the local billing object being committed.",
    );
  }
  assertProjectionGeneration(input.projectionGeneration);
  const now = checkedDate(input.now ?? new Date(), "now");
  return [
    billingAccountOperationLeaseGuard(db, input.operationLease, now),
    billingReconciliationTerminalGuard(
      db,
      input.claim,
      input.terminalTarget,
      now,
      input.projectionGeneration,
    ),
    db
      .update(billingReconciliationTargets)
      .set({
        state: "succeeded",
        leaseToken: null,
        leaseExpiresAt: null,
        automaticFailureCount: 0,
        nextAutomaticAttemptAt: null,
        automaticDeadLetteredAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastCompletedAt: now,
        lastSucceededAt: now,
        updatedAt: now,
      })
      .where(claimPredicate(input.claim)),
  ] as const;
}

/**
 * Finish a provider check that intentionally produced no subscription
 * projection, such as an open or provider-confirmed expired Checkout Session.
 * The live lease remains mandatory, but there is no projection generation to
 * fence because no subscription projection is written by this operation.
 */
export async function completeBillingReconciliationCheck(input: {
  claim: BillingReconciliationClaim;
  operationLease: BillingAccountOperationLeaseClaim;
  now?: Date;
}): Promise<void> {
  assertClaim(input.claim);
  assertOperationLease(input.operationLease, input.claim);
  if (input.claim.target.kind !== "checkout_attempt") {
    throw invalid(
      "Only a Checkout reconciliation check can complete without a projection generation.",
    );
  }
  const now = checkedDate(input.now ?? new Date(), "now");
  const db = getDb();

  try {
    await db.batch([
      billingAccountOperationLeaseGuard(db, input.operationLease, now),
      billingReconciliationTerminalGuard(
        db,
        input.claim,
        input.claim.target,
        now,
      ),
      db
        .update(billingReconciliationTargets)
        .set({
          state: "succeeded",
          leaseToken: null,
          leaseExpiresAt: null,
          automaticFailureCount: 0,
          nextAutomaticAttemptAt: null,
          automaticDeadLetteredAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          lastCompletedAt: now,
          lastSucceededAt: now,
          updatedAt: now,
        })
        .where(claimPredicate(input.claim)),
    ]);
  } catch (cause) {
    throw persistenceFailed(
      "The billing reconciliation check could not be completed.",
      cause,
    );
  }
}

export async function failBillingReconciliation(input: {
  claim: BillingReconciliationClaim;
  operationLease: BillingAccountOperationLeaseClaim;
  errorCode: string;
  errorMessage: string;
  automatic?: boolean;
  now?: Date;
}): Promise<void> {
  assertClaim(input.claim);
  assertOperationLease(input.operationLease, input.claim);
  const errorCode = checkedErrorCode(input.errorCode);
  const errorMessage = checkedErrorMessage(input.errorMessage);
  const now = checkedDate(input.now ?? new Date(), "now");
  const automaticFailureCount = input.automatic
    ? Math.min(input.claim.automaticFailureCount + 1, 2_147_483_647)
    : input.claim.automaticFailureCount;
  const automaticDeadLetteredAt =
    automaticFailureCount >= MAX_AUTOMATIC_RECONCILIATION_FAILURES
      ? now
      : null;
  const backoffMs = input.automatic
    ? billingReconciliationBackoffMs(automaticFailureCount)
    : 0;
  const nextAutomaticAttemptAt = automaticDeadLetteredAt
    ? null
    : new Date(now.getTime() + (backoffMs ?? 0));
  const db = getDb();

  try {
    await db.batch([
      billingAccountOperationLeaseGuard(db, input.operationLease, now),
      billingReconciliationTerminalGuard(
        db,
        input.claim,
        input.claim.target,
        now,
      ),
      db
        .update(billingReconciliationTargets)
        .set({
          state: "failed",
          leaseToken: null,
          leaseExpiresAt: null,
          automaticFailureCount,
          nextAutomaticAttemptAt,
          automaticDeadLetteredAt,
          lastErrorCode: errorCode,
          lastErrorMessage: errorMessage,
          lastCompletedAt: now,
          updatedAt: now,
        })
        .where(claimPredicate(input.claim)),
    ]);
  } catch (cause) {
    throw persistenceFailed(
      "The billing reconciliation failure could not be recorded.",
      cause,
    );
  }
}

/**
 * Return the tenant- and generation-bound mutation that resolves failed or
 * in-flight reconciliation work when a signed Stripe webhook commits the same
 * provider-authoritative local projection. This effect is deliberately
 * returned to the webhook caller so the target recovery,
 * subscription/Checkout projection, event completion, and audit record either
 * all commit or all roll back in one D1 batch.
 *
 * A newer authoritative webhook may displace an older live reconciliation
 * lease for the exact local subscription and, when present, Checkout attempt.
 * Clearing that lease in the webhook transaction prevents the stale
 * reconciler from later recording a failure over the newer projection.
 */
export function billingReconciliationWebhookRecoveryEffects(
  db: ReturnType<typeof getDb>,
  input: {
    accountId: string;
    subscriptionId: string;
    checkoutAttemptId?: string | null;
    projectionGeneration: BillingReconciliationProjectionGeneration;
    now?: Date;
  },
) {
  assertIdentifier(input.accountId, "accountId");
  assertIdentifier(input.subscriptionId, "subscriptionId");
  if (input.checkoutAttemptId !== null && input.checkoutAttemptId !== undefined) {
    assertIdentifier(input.checkoutAttemptId, "checkoutAttemptId");
  }
  assertProjectionGeneration(input.projectionGeneration);
  const now = checkedDate(input.now ?? new Date(), "now");
  const matchingTargets = [
    and(
      eq(billingReconciliationTargets.subscriptionId, input.subscriptionId),
      isNull(billingReconciliationTargets.checkoutAttemptId),
    ),
    ...(input.checkoutAttemptId
      ? [
          and(
            eq(
              billingReconciliationTargets.checkoutAttemptId,
              input.checkoutAttemptId,
            ),
            isNull(billingReconciliationTargets.subscriptionId),
          ),
        ]
      : []),
  ];

  return [
    db
      .update(billingReconciliationTargets)
      .set({
        state: "succeeded",
        leaseToken: null,
        leaseExpiresAt: null,
        automaticFailureCount: 0,
        nextAutomaticAttemptAt: null,
        automaticDeadLetteredAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastCompletedAt: now,
        lastSucceededAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(billingReconciliationTargets.accountId, input.accountId),
          eq(billingReconciliationTargets.provider, PROVIDER),
          or(
            eq(billingReconciliationTargets.state, "failed"),
            eq(billingReconciliationTargets.state, "processing"),
          ),
          or(...matchingTargets),
          sql`exists (
            select 1
            from ${billingSubscriptionProjectionGenerations}
            where ${billingSubscriptionProjectionGenerations.provider} = ${PROVIDER}
              and ${billingSubscriptionProjectionGenerations.providerSubscriptionId} = ${input.projectionGeneration.providerSubscriptionId}
              and ${billingSubscriptionProjectionGenerations.generation} = ${input.projectionGeneration.generation}
          )`,
        ),
      ),
  ] as const;
}

function billingReconciliationTerminalGuard(
  db: ReturnType<typeof getDb>,
  claim: BillingReconciliationClaim,
  terminalTarget: BillingReconciliationTarget,
  now: Date,
  projectionGeneration?: BillingReconciliationProjectionGeneration,
) {
  const generationMatches = projectionGeneration
    ? sql`and exists (
        select 1
        from ${billingSubscriptionProjectionGenerations}
        where ${billingSubscriptionProjectionGenerations.provider} = ${PROVIDER}
          and ${billingSubscriptionProjectionGenerations.providerSubscriptionId} = ${projectionGeneration.providerSubscriptionId}
          and ${billingSubscriptionProjectionGenerations.generation} = ${projectionGeneration.generation}
      )`
    : sql``;
  return db
    .update(billingReconciliationTargets)
    .set({
      // account_id is NOT NULL. A stale lease or provider generation makes it
      // NULL, forcing D1 to roll back every statement in the terminal batch.
      accountId: sql<string>`case
        when ${billingReconciliationTargets.state} = 'processing'
          and ${billingReconciliationTargets.accountId} = ${claim.accountId}
          and ${billingReconciliationTargets.leaseToken} = ${claim.leaseToken}
          and ${billingReconciliationTargets.leaseExpiresAt} > ${now.getTime()}
          and ${targetPredicate(terminalTarget)}
          ${generationMatches}
        then ${billingReconciliationTargets.accountId}
        else null
      end`,
    })
    .where(eq(billingReconciliationTargets.id, claim.reconciliationId));
}

function claimPredicate(claim: BillingReconciliationClaim) {
  return and(
    eq(billingReconciliationTargets.id, claim.reconciliationId),
    eq(billingReconciliationTargets.accountId, claim.accountId),
    eq(billingReconciliationTargets.provider, PROVIDER),
    targetPredicate(claim.target),
    eq(billingReconciliationTargets.state, "processing"),
    eq(billingReconciliationTargets.leaseToken, claim.leaseToken),
  );
}

function targetPredicate(target: BillingReconciliationTarget) {
  return target.kind === "subscription"
    ? and(
        eq(billingReconciliationTargets.subscriptionId, target.subscriptionId),
        isNull(billingReconciliationTargets.checkoutAttemptId),
      )
    : and(
        eq(
          billingReconciliationTargets.checkoutAttemptId,
          target.checkoutAttemptId,
        ),
        isNull(billingReconciliationTargets.subscriptionId),
      );
}

function targetsEqual(
  left: BillingReconciliationTarget,
  right: BillingReconciliationTarget,
): boolean {
  return left.kind === "subscription" && right.kind === "subscription"
    ? left.subscriptionId === right.subscriptionId
    : left.kind === "checkout_attempt" && right.kind === "checkout_attempt"
      ? left.checkoutAttemptId === right.checkoutAttemptId
      : false;
}

function targetFromRecord(
  record: BillingReconciliationTargetRecord,
): BillingReconciliationTarget {
  if (record.subscriptionId && !record.checkoutAttemptId) {
    return { kind: "subscription", subscriptionId: record.subscriptionId };
  }
  if (record.checkoutAttemptId && !record.subscriptionId) {
    return {
      kind: "checkout_attempt",
      checkoutAttemptId: record.checkoutAttemptId,
    };
  }
  throw persistenceFailed(
    "The billing reconciliation target has an invalid stored shape.",
  );
}

function localTargetId(target: BillingReconciliationTarget): string {
  return target.kind === "subscription"
    ? target.subscriptionId
    : target.checkoutAttemptId;
}

function assertClaim(claim: BillingReconciliationClaim): void {
  assertIdentifier(claim.reconciliationId, "reconciliationId");
  assertIdentifier(claim.accountId, "accountId");
  assertTarget(claim.target);
  assertIdentifier(claim.leaseToken, "leaseToken");
  checkedDate(claim.leaseExpiresAt, "leaseExpiresAt");
  if (!Number.isSafeInteger(claim.processingAttempt) || claim.processingAttempt < 1) {
    throw invalid("processingAttempt must be a positive safe integer.");
  }
  if (
    !Number.isSafeInteger(claim.automaticFailureCount) ||
    claim.automaticFailureCount < 0
  ) {
    throw invalid("automaticFailureCount must be a non-negative safe integer.");
  }
}

function assertOperationLease(
  operationLease: BillingAccountOperationLeaseClaim,
  claim: BillingReconciliationClaim,
): void {
  if (
    !operationLease ||
    operationLease.operation !== "reconciliation" ||
    operationLease.accountId !== claim.accountId
  ) {
    throw invalid(
      "operationLease must own reconciliation work for the claimed account.",
    );
  }
}

function assertTarget(target: BillingReconciliationTarget): void {
  if (target.kind === "subscription") {
    assertIdentifier(target.subscriptionId, "subscriptionId");
    return;
  }
  if (target.kind === "checkout_attempt") {
    assertIdentifier(target.checkoutAttemptId, "checkoutAttemptId");
    return;
  }
  throw invalid("target must identify a supported local billing object.");
}

function assertProjectionGeneration(
  generation: BillingReconciliationProjectionGeneration,
): void {
  if (!generation || !/^sub_[A-Za-z0-9_]{1,251}$/.test(generation.providerSubscriptionId)) {
    throw invalid("projectionGeneration has an invalid subscription identifier.");
  }
  if (!Number.isSafeInteger(generation.generation) || generation.generation < 1) {
    throw invalid("projectionGeneration must be a positive safe integer.");
  }
}

function assertIdentifier(value: string, field: string): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 255 ||
    value !== value.trim() ||
    /[\u0000-\u0020\u007f]/.test(value)
  ) {
    throw invalid(`${field} must be a bounded opaque identifier.`);
  }
}

function checkedDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || !Number.isSafeInteger(value.getTime())) {
    throw invalid(`${field} must be a valid date.`);
  }
  return value;
}

function checkedErrorCode(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(value)) {
    throw invalid("errorCode must be a bounded lowercase machine code.");
  }
  return value;
}

function checkedErrorMessage(value: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 500 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw invalid("errorMessage must be bounded single-line text.");
  }
  return value;
}

function d1(): D1Database {
  if (!env.DB) {
    throw persistenceFailed(
      "The billing reconciliation database is unavailable.",
    );
  }
  return env.DB;
}

function invalid(message: string): BillingReconciliationRepositoryError {
  return new BillingReconciliationRepositoryError(
    "billing_reconciliation_input_invalid",
    message,
  );
}

function persistenceFailed(
  message: string,
  cause?: unknown,
): BillingReconciliationRepositoryError {
  return new BillingReconciliationRepositoryError(
    "billing_reconciliation_persistence_failed",
    message,
    cause === undefined ? undefined : { cause },
  );
}
