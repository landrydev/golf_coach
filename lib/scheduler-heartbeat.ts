import {
  loadBillingReconciliationBacklog,
  type BillingReconciliationSweepResult,
} from "@/lib/billing-reconciliation-sweep";

const BILLING_SCHEDULER_KEY = "billing_reconciliation";
const SCHEDULER_INTERVAL_SECONDS = 5 * 60;
const SCHEDULER_STALE_AFTER_SECONDS = SCHEDULER_INTERVAL_SECONDS * 3;

type SchedulerHeartbeatRow = Readonly<{
  releaseId: string;
  state: "running" | "succeeded" | "failed";
  startedAt: number;
  completedAt: number | null;
  billingConfigured: number | null;
  consideredCount: number | null;
  attemptedCount: number | null;
  succeededCount: number | null;
  failedCount: number | null;
  deadLetterCount: number | null;
  lastFailureCode: string | null;
}>;

type DeadLetterSummaryRow = Readonly<{
  count: number;
  oldestDeadLetteredAt: number | null;
}>;

export type SchedulerAttempt = Readonly<{
  attemptToken: string;
  releaseId: string;
  startedAt: Date;
}>;

export type SchedulerOperationalHealth = Readonly<{
  status: "ready" | "degraded";
  releaseId: string;
  scheduler: Readonly<{
    state: "never_run" | "running" | "succeeded" | "failed";
    releaseId: string | null;
    releaseCurrent: boolean;
    startedAt: string | null;
    completedAt: string | null;
    ageSeconds: number | null;
    stale: boolean;
    billingConfigured: boolean | null;
    result: Readonly<{
      considered: number;
      attempted: number;
      succeeded: number;
      failed: number;
      deadLetterCount: number;
    }> | null;
    lastFailureCode: string | null;
  }>;
  billingReconciliation: Readonly<{
    deadLetterCount: number;
    oldestDeadLetterAgeSeconds: number | null;
    overdueAccountCount: number | null;
    overdueAccountCountIsLowerBound: boolean | null;
    oldestOverdueAgeSeconds: number | null;
  }>;
}>;

/** Record an invocation before any billing configuration or provider work. */
export async function beginBillingSchedulerAttempt(input: {
  database: D1Database;
  releaseId: string | undefined;
  startedAt?: Date;
}): Promise<SchedulerAttempt> {
  const startedAt = checkedDate(input.startedAt ?? new Date());
  const release = normalizeReleaseId(input.releaseId);
  const attempt: SchedulerAttempt = {
    attemptToken: crypto.randomUUID(),
    releaseId: release.value,
    startedAt,
  };

  await input.database
    .prepare(
      `INSERT INTO scheduler_heartbeat (
         scheduler_key, attempt_token, release_id, state, started_at,
         completed_at, billing_configured, considered_count, attempted_count,
         succeeded_count, failed_count, dead_letter_count, last_failure_code,
         updated_at
       ) VALUES (?, ?, ?, 'running', ?, null, null, null, null, null, null,
         null, null, ?)
       ON CONFLICT(scheduler_key) DO UPDATE SET
         attempt_token = excluded.attempt_token,
         release_id = excluded.release_id,
         state = 'running',
         started_at = excluded.started_at,
         completed_at = null,
         billing_configured = null,
         considered_count = null,
         attempted_count = null,
         succeeded_count = null,
         failed_count = null,
         dead_letter_count = null,
         last_failure_code = null,
         updated_at = excluded.updated_at`,
    )
    .bind(
      BILLING_SCHEDULER_KEY,
      attempt.attemptToken,
      attempt.releaseId,
      attempt.startedAt.getTime(),
      attempt.startedAt.getTime(),
    )
    .run();

  return attempt;
}

/** Complete only the invocation that still owns the singleton heartbeat. */
export async function completeBillingSchedulerAttempt(input: {
  database: D1Database;
  attempt: SchedulerAttempt;
  result: BillingReconciliationSweepResult;
  completedAt?: Date;
}): Promise<void> {
  const completedAt = checkedCompletionDate(
    input.completedAt ?? new Date(),
    input.attempt.startedAt,
  );
  checkedSweepResult(input.result);

  await input.database
    .prepare(
      `UPDATE scheduler_heartbeat
          SET state = 'succeeded',
              completed_at = ?,
              billing_configured = ?,
              considered_count = ?,
              attempted_count = ?,
              succeeded_count = ?,
              failed_count = ?,
              dead_letter_count = ?,
              last_failure_code = null,
              updated_at = ?
        WHERE scheduler_key = ?
          AND attempt_token = ?
          AND state = 'running'`,
    )
    .bind(
      completedAt.getTime(),
      input.result.configured ? 1 : 0,
      input.result.considered,
      input.result.attempted,
      input.result.succeeded,
      input.result.failed,
      input.result.deadLetterCount,
      completedAt.getTime(),
      BILLING_SCHEDULER_KEY,
      input.attempt.attemptToken,
    )
    .run();
}

/** Persist a normalized machine code, never an exception message or payload. */
export async function failBillingSchedulerAttempt(input: {
  database: D1Database;
  attempt: SchedulerAttempt;
  failureCode: string;
  completedAt?: Date;
}): Promise<void> {
  const completedAt = checkedCompletionDate(
    input.completedAt ?? new Date(),
    input.attempt.startedAt,
  );
  const failureCode = normalizeFailureCode(input.failureCode);

  await input.database
    .prepare(
      `UPDATE scheduler_heartbeat
          SET state = 'failed',
              completed_at = ?,
              billing_configured = null,
              considered_count = null,
              attempted_count = null,
              succeeded_count = null,
              failed_count = null,
              dead_letter_count = null,
              last_failure_code = ?,
              updated_at = ?
        WHERE scheduler_key = ?
          AND attempt_token = ?
          AND state = 'running'`,
    )
    .bind(
      completedAt.getTime(),
      failureCode,
      completedAt.getTime(),
      BILLING_SCHEDULER_KEY,
      input.attempt.attemptToken,
    )
    .run();
}

/**
 * Read the latest scheduler attempt and current bounded aggregates of
 * exhausted and overdue reconciliation work. No tenant IDs, provider IDs,
 * messages, or payloads are returned from D1, which keeps this safe for an
 * authenticated operator response.
 */
export async function loadSchedulerOperationalHealth(input: {
  database: D1Database;
  releaseId: string | undefined;
  now?: Date;
}): Promise<SchedulerOperationalHealth> {
  const now = checkedDate(input.now ?? new Date());
  const release = normalizeReleaseId(input.releaseId);
  const releaseId = release.value;
  const [heartbeat, deadLetters, backlog] = await Promise.all([
    input.database
      .prepare(
        `SELECT release_id AS releaseId,
                state,
                started_at AS startedAt,
                completed_at AS completedAt,
                billing_configured AS billingConfigured,
                considered_count AS consideredCount,
                attempted_count AS attemptedCount,
                succeeded_count AS succeededCount,
                failed_count AS failedCount,
                dead_letter_count AS deadLetterCount,
                last_failure_code AS lastFailureCode
           FROM scheduler_heartbeat
          WHERE scheduler_key = ?`,
      )
      .bind(BILLING_SCHEDULER_KEY)
      .first<SchedulerHeartbeatRow>(),
    input.database
      .prepare(
        `SELECT count(*) AS count,
                min(automatic_dead_lettered_at) AS oldestDeadLetteredAt
           FROM billing_reconciliation_targets
          WHERE provider = 'stripe'
            AND state = 'failed'
            AND automatic_dead_lettered_at IS NOT NULL`,
      )
      .first<DeadLetterSummaryRow>(),
    loadBillingReconciliationBacklog({
      database: input.database,
      now,
    }).then(
      (summary) => summary,
      () => null,
    ),
  ]);

  const deadLetterCount = checkedCount(deadLetters?.count ?? 0);
  const oldestDeadLetterAgeSeconds = ageSeconds(
    now,
    checkedOptionalTimestamp(deadLetters?.oldestDeadLetteredAt ?? null),
  );
  const oldestOverdueAgeSeconds = ageSeconds(
    now,
    backlog?.oldestOverdueAt ?? null,
  );

  if (!heartbeat) {
    return {
      status: "degraded",
      releaseId,
      scheduler: {
        state: "never_run",
        releaseId: null,
        releaseCurrent: false,
        startedAt: null,
        completedAt: null,
        ageSeconds: null,
        stale: true,
        billingConfigured: null,
        result: null,
        lastFailureCode: null,
      },
      billingReconciliation: {
        deadLetterCount,
        oldestDeadLetterAgeSeconds,
        overdueAccountCount: backlog?.overdueAccountCount ?? null,
        overdueAccountCountIsLowerBound:
          backlog?.overdueAccountCountIsLowerBound ?? null,
        oldestOverdueAgeSeconds,
      },
    };
  }

  const startedAt = checkedTimestamp(heartbeat.startedAt);
  const completedAt = checkedOptionalTimestamp(heartbeat.completedAt);
  // Age is measured from invocation start, not completion. A delayed or long
  // invocation must not make a missed five-minute cadence look recent merely
  // because it completed late.
  const schedulerAgeSeconds = ageSeconds(now, startedAt);
  if (schedulerAgeSeconds === null) {
    throw new Error("scheduler_heartbeat_timestamp_invalid");
  }
  const stale = schedulerAgeSeconds > SCHEDULER_STALE_AFTER_SECONDS;
  const releaseCurrent =
    release.valid &&
    isValidNormalizedReleaseId(heartbeat.releaseId) &&
    heartbeat.releaseId === releaseId;
  const result =
    heartbeat.state === "succeeded"
      ? {
          considered: checkedCount(heartbeat.consideredCount),
          attempted: checkedCount(heartbeat.attemptedCount),
          succeeded: checkedCount(heartbeat.succeededCount),
          failed: checkedCount(heartbeat.failedCount),
          deadLetterCount: checkedCount(heartbeat.deadLetterCount),
        }
      : null;
  const healthy =
    heartbeat.state === "succeeded" &&
    !stale &&
    releaseCurrent &&
    deadLetterCount === 0 &&
    backlog?.overdueAccountCount === 0 &&
    result !== null &&
    result.failed === 0;

  return {
    status: healthy ? "ready" : "degraded",
    releaseId,
    scheduler: {
      state: heartbeat.state,
      releaseId: heartbeat.releaseId,
      releaseCurrent,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt?.toISOString() ?? null,
      ageSeconds: schedulerAgeSeconds,
      stale,
      billingConfigured:
        heartbeat.state === "succeeded"
          ? checkedBoolean(heartbeat.billingConfigured)
          : null,
      result,
      lastFailureCode: heartbeat.lastFailureCode,
    },
    billingReconciliation: {
      deadLetterCount,
      oldestDeadLetterAgeSeconds,
      overdueAccountCount: backlog?.overdueAccountCount ?? null,
      overdueAccountCountIsLowerBound:
        backlog?.overdueAccountCountIsLowerBound ?? null,
      oldestOverdueAgeSeconds,
    },
  };
}

export function schedulerFailureCode(error: unknown): string {
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

function normalizeReleaseId(value: string | undefined): {
  value: string;
  valid: boolean;
} {
  const normalized = value?.trim();
  if (!normalized) return { value: "unversioned", valid: false };
  if (!isValidNormalizedReleaseId(normalized)) {
    return { value: "invalid_release_id", valid: false };
  }
  return { value: normalized, valid: true };
}

function isValidNormalizedReleaseId(value: string): boolean {
  return (
    value !== "unversioned" &&
    value !== "invalid_release_id" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

function normalizeFailureCode(value: string): string {
  return /^[a-z][a-z0-9_]{0,63}$/.test(value)
    ? value
    : "billing_reconciliation_sweep_failed";
}

function checkedSweepResult(result: BillingReconciliationSweepResult): void {
  for (const value of [
    result.considered,
    result.attempted,
    result.succeeded,
    result.failed,
    result.deadLetterCount,
  ]) {
    checkedCount(value);
  }
  if (
    result.attempted > result.considered ||
    result.succeeded + result.failed !== result.attempted
  ) {
    throw new TypeError("Scheduler result counts are inconsistent.");
  }
}

function checkedDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("Scheduler time must be valid.");
  }
  return value;
}

function checkedCompletionDate(value: Date, startedAt: Date): Date {
  const completedAt = checkedDate(value);
  if (completedAt.getTime() < startedAt.getTime()) {
    throw new TypeError("Scheduler completion cannot precede its start.");
  }
  return completedAt;
}

function checkedCount(value: number | null): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Scheduler count must be a non-negative safe integer.");
  }
  return value;
}

function checkedBoolean(value: number | null): boolean {
  if (value === 0) return false;
  if (value === 1) return true;
  throw new TypeError("Scheduler boolean is invalid.");
}

function checkedTimestamp(value: number): Date {
  const timestamp = checkedOptionalTimestamp(value);
  if (!timestamp) throw new TypeError("Scheduler timestamp is required.");
  return timestamp;
}

function checkedOptionalTimestamp(value: number | null): Date | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Scheduler timestamp is invalid.");
  }
  return checkedDate(new Date(value));
}

function ageSeconds(now: Date, value: Date | null): number | null {
  if (!value) return null;
  const elapsed = now.getTime() - value.getTime();
  if (!Number.isSafeInteger(elapsed) || elapsed < 0) {
    throw new TypeError("Scheduler age is invalid.");
  }
  return Math.floor(elapsed / 1_000);
}
