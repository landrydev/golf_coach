import { env } from "cloudflare:workers";
import { subscriptionProjectionRefreshIntervalSeconds } from "@/lib/billing-policy";
import { reconcileBillingAccount } from "@/lib/billing-reconciliation";
import {
  MAX_AUTOMATIC_RECONCILIATION_FAILURES,
  OPEN_CHECKOUT_RECONCILIATION_INTERVAL_MS,
} from "@/lib/billing-reconciliation-policy";
import { billingConfigured, configuredBillingPolicy } from "@/lib/stripe";

export { billingReconciliationBackoffMs } from "@/lib/billing-reconciliation-policy";

const PROVIDER = "stripe";
const MAX_SWEEP_ACCOUNTS = 12;
// One row beyond sweep capacity proves that a successful bounded sweep left
// actionable work behind without counting or returning the whole tenant set.
const BACKLOG_ACCOUNT_SAMPLE_LIMIT = MAX_SWEEP_ACCOUNTS + 1;

const DUE_ACCOUNTS_CTE = `WITH candidate_work AS (
       SELECT
         attempt.account_id,
         CASE
           WHEN target.id IS NULL THEN attempt.updated_at
           WHEN target.state = 'processing' THEN target.lease_expires_at
           WHEN target.state = 'failed'
             AND target.automatic_dead_lettered_at IS NULL
             THEN COALESCE(
               target.next_automatic_attempt_at,
               target.last_completed_at,
               target.last_attempt_at
             )
           WHEN target.state = 'succeeded'
             THEN target.last_attempt_at + ?
           ELSE NULL
         END AS due_at
       FROM billing_checkout_attempts AS attempt
       LEFT JOIN billing_reconciliation_targets AS target
         ON target.provider = attempt.provider
        AND target.account_id = attempt.account_id
        AND target.checkout_attempt_id = attempt.id
       WHERE attempt.provider = ?
         AND attempt.state IN ('open', 'completed_pending_sync')
         AND attempt.provider_session_id IS NOT NULL

       UNION ALL

       SELECT
         subscription.account_id,
         CASE
           WHEN target.id IS NULL OR target.state = 'succeeded'
             THEN COALESCE(subscription.last_provider_sync_at, 0) + ?
           WHEN target.state = 'processing' THEN target.lease_expires_at
           WHEN target.state = 'failed'
             AND target.automatic_dead_lettered_at IS NULL
             THEN COALESCE(
               target.next_automatic_attempt_at,
               target.last_completed_at,
               target.last_attempt_at
             )
           ELSE NULL
         END AS due_at
       FROM subscriptions AS subscription
       LEFT JOIN billing_reconciliation_targets AS target
         ON target.provider = subscription.provider
        AND target.account_id = subscription.account_id
        AND target.subscription_id = subscription.id
       WHERE subscription.provider = ?
         AND subscription.provider_subscription_id IS NOT NULL
         AND subscription.status IN (
           'incomplete', 'trialing', 'active', 'past_due', 'paused', 'unpaid'
         )
   ), due_accounts AS (
       SELECT candidate_work.account_id, MIN(due_at) AS due_at
       FROM candidate_work
       WHERE due_at IS NOT NULL
         AND due_at <= ?
         AND NOT EXISTS (
           SELECT 1
           FROM billing_account_operation_leases AS operation_lease
           WHERE operation_lease.account_id = candidate_work.account_id
             AND operation_lease.provider = 'stripe'
             AND operation_lease.state = 'held'
             AND operation_lease.lease_expires_at > ?
         )
       GROUP BY candidate_work.account_id
   )`;

type DueAccountRow = Readonly<{ accountId: string }>;

type BacklogSummaryRow = Readonly<{
  overdueAccountCount: number;
  oldestOverdueAt: number | null;
}>;

export type BillingReconciliationSweepResult = Readonly<{
  configured: boolean;
  considered: number;
  attempted: number;
  succeeded: number;
  failed: number;
  deadLetterCount: number;
}>;

export type BillingReconciliationBacklogSummary = Readonly<{
  overdueAccountCount: number;
  /** True means the reported count is a lower bound at the sample limit. */
  overdueAccountCountIsLowerBound: boolean;
  oldestOverdueAt: Date | null;
}>;

/**
 * Recover existing provider-backed billing work without a browser request.
 * The sweep never creates or changes a Stripe object: every selected account
 * still passes through the same GET-only, tenant-bound reconciliation path.
 */
export async function runBillingReconciliationSweep(input?: {
  now?: Date;
  limit?: number;
}): Promise<BillingReconciliationSweepResult> {
  const billingPolicy = configuredBillingPolicy();
  if (!billingConfigured() || !billingPolicy) return emptyResult(false);

  const now = checkedDate(input?.now ?? new Date());
  const limit = checkedLimit(input?.limit ?? MAX_SWEEP_ACCOUNTS);
  const projectionRefreshIntervalMs =
    subscriptionProjectionRefreshIntervalSeconds(
      billingPolicy.maxProjectionAgeSeconds,
    ) * 1_000;
  const dueAccountIds = await loadDueAccountIds({
    database: env.DB,
    nowMs: now.getTime(),
    limit,
    projectionRefreshIntervalMs,
  });

  let succeeded = 0;
  let failed = 0;
  for (const accountId of dueAccountIds) {
    try {
      await reconcileBillingAccount({
        accountId,
        requestId: `scheduled-${crypto.randomUUID()}`,
        automatic: true,
      });
      succeeded += 1;
    } catch (error) {
      failed += 1;
      console.error("Scheduled billing reconciliation failed", {
        errorCode: safeErrorCode(error),
      });
    }
  }

  const deadLetterCount = await countDeadLetters();
  if (deadLetterCount > 0) {
    console.error("Billing reconciliation automatic retries exhausted", {
      deadLetterCount,
      maximumFailures: MAX_AUTOMATIC_RECONCILIATION_FAILURES,
    });
  }

  return {
    configured: true,
    considered: dueAccountIds.length,
    attempted: dueAccountIds.length,
    succeeded,
    failed,
    deadLetterCount,
  };
}

/**
 * Return a privacy-safe, bounded view of actionable work. The aggregate never
 * selects tenant identifiers into the operator response. Sampling one account
 * beyond sweep capacity distinguishes a fully drained sweep from remaining
 * backlog without an unbounded COUNT over all due tenants.
 */
export async function loadBillingReconciliationBacklog(input: {
  database: D1Database;
  now?: Date;
}): Promise<BillingReconciliationBacklogSummary> {
  const now = checkedDate(input.now ?? new Date());
  const billingPolicy = configuredBillingPolicy();
  const projectionRefreshIntervalMs = billingPolicy
    ? subscriptionProjectionRefreshIntervalSeconds(
        billingPolicy.maxProjectionAgeSeconds,
      ) * 1_000
    : null;
  const row = await input.database
    .prepare(
      `${DUE_ACCOUNTS_CTE}, bounded_due_accounts AS (
         SELECT due_at
           FROM due_accounts
          ORDER BY due_at, account_id
          LIMIT ?
       )
       SELECT count(*) AS overdueAccountCount,
              min(due_at) AS oldestOverdueAt
         FROM bounded_due_accounts`,
    )
    .bind(
      ...dueAccountBindings({
        nowMs: now.getTime(),
        projectionRefreshIntervalMs,
      }),
      BACKLOG_ACCOUNT_SAMPLE_LIMIT,
    )
    .first<BacklogSummaryRow>();
  if (!row) throw new Error("billing_reconciliation_backlog_unavailable");

  const overdueAccountCount = checkedStoredCount(row.overdueAccountCount);
  const oldestOverdueAt = checkedStoredTimestamp(row.oldestOverdueAt);
  if (
    (overdueAccountCount === 0 && oldestOverdueAt !== null) ||
    (overdueAccountCount > 0 && oldestOverdueAt === null)
  ) {
    throw new Error("billing_reconciliation_backlog_invalid");
  }

  return {
    overdueAccountCount,
    overdueAccountCountIsLowerBound:
      overdueAccountCount === BACKLOG_ACCOUNT_SAMPLE_LIMIT,
    oldestOverdueAt,
  };
}

/**
 * Filter eligibility before limiting and collapse multiple due objects for one
 * tenant to its oldest due time. Exhausted work therefore cannot occupy the
 * bounded candidate window, and every invocation spends its capacity on
 * distinct accounts that can actually be claimed.
 */
async function loadDueAccountIds(input: {
  database: D1Database;
  nowMs: number;
  limit: number;
  projectionRefreshIntervalMs: number;
}): Promise<readonly string[]> {
  const result = await input.database.prepare(
    `${DUE_ACCOUNTS_CTE}
     SELECT account_id AS accountId
     FROM due_accounts
     ORDER BY due_at, account_id
     LIMIT ?`,
  )
    .bind(
      ...dueAccountBindings(input),
      input.limit,
    )
    .all<DueAccountRow>();
  return result.results.map((row) => row.accountId);
}

function dueAccountBindings(input: {
  nowMs: number;
  projectionRefreshIntervalMs: number | null;
}): readonly [number, string, number | null, string, number, number] {
  return [
    OPEN_CHECKOUT_RECONCILIATION_INTERVAL_MS,
    PROVIDER,
    input.projectionRefreshIntervalMs,
    PROVIDER,
    input.nowMs,
    input.nowMs,
  ];
}

async function countDeadLetters(): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT count(*) AS count
     FROM billing_reconciliation_targets
     WHERE provider = ?
       AND state = 'failed'
       AND automatic_dead_lettered_at IS NOT NULL`,
  )
    .bind(PROVIDER)
    .first<{ count: number }>();
  const count = Number(row?.count ?? 0);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function checkedDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("Billing reconciliation sweep time must be valid.");
  }
  return value;
}

function checkedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SWEEP_ACCOUNTS) {
    throw new TypeError(
      `Billing reconciliation sweep limit must be from 1 to ${MAX_SWEEP_ACCOUNTS}.`,
    );
  }
  return value;
}

function checkedStoredCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Billing reconciliation backlog count is invalid.");
  }
  return value;
}

function checkedStoredTimestamp(value: number | null): Date | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Billing reconciliation backlog time is invalid.");
  }
  return checkedDate(new Date(value));
}

function safeErrorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[a-z][a-z0-9_]{0,63}$/.test(error.code)
  ) {
    return error.code;
  }
  return "billing_reconciliation_sweep_failed";
}

function emptyResult(configured: boolean): BillingReconciliationSweepResult {
  return {
    configured,
    considered: 0,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    deadLetterCount: 0,
  };
}
