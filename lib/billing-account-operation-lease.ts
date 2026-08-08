import { env } from "cloudflare:workers";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  billingAccountOperationLeases,
} from "@/db/schema";
import { newId } from "@/lib/tokens";

const PROVIDER = "stripe";
export const BILLING_ACCOUNT_OPERATION_LEASE_MS = 5 * 60 * 1_000;

export type BillingAccountOperation = "checkout" | "reconciliation";
export type BillingAccountOperationLeaseRecord =
  typeof billingAccountOperationLeases.$inferSelect;
export type BillingAccountOperationLeaseClaim = Readonly<{
  accountId: string;
  operation: BillingAccountOperation;
  leaseToken: string;
  leaseGeneration: number;
  leaseExpiresAt: Date;
}>;

export type BillingAccountOperationLeaseErrorCode =
  | "billing_operation_lease_invalid"
  | "billing_operation_lease_account_not_found"
  | "billing_operation_lease_lost"
  | "billing_operation_lease_persistence_failed";

export class BillingAccountOperationLeaseError extends Error {
  constructor(
    public readonly code: BillingAccountOperationLeaseErrorCode,
    public readonly safeMessage: string,
    options?: ErrorOptions,
  ) {
    super(safeMessage, options);
    this.name = "BillingAccountOperationLeaseError";
  }
}

/**
 * Acquire the account-wide Stripe operation mutex. The account is selected in
 * the write itself, so a caller cannot manufacture a lease for another or
 * nonexistent tenant. A live owner returns null; an expired or idle row is
 * atomically reclaimed with a fresh token and monotonically increasing fence.
 */
export async function acquireBillingAccountOperationLease(input: {
  accountId: string;
  operation: BillingAccountOperation;
  now?: Date;
}): Promise<BillingAccountOperationLeaseClaim | null> {
  assertIdentifier(input.accountId, "accountId");
  assertOperation(input.operation);
  const now = checkedDate(input.now ?? new Date(), "now");
  const leaseToken = newId();
  const leaseExpiresAt = new Date(
    now.getTime() + BILLING_ACCOUNT_OPERATION_LEASE_MS,
  );

  let claimedAccountId: string | null;
  try {
    const claimed = await d1()
      .prepare(
        `INSERT INTO billing_account_operation_leases (
          account_id,
          provider,
          state,
          operation,
          lease_token,
          lease_generation,
          lease_expires_at,
          last_acquired_at,
          last_released_at,
          created_at,
          updated_at
        )
        SELECT id, 'stripe', 'held', ?, ?, 1, ?, ?, NULL, ?, ?
        FROM accounts
        WHERE id = ?
        ON CONFLICT (account_id) DO UPDATE SET
          provider = 'stripe',
          state = 'held',
          operation = excluded.operation,
          lease_token = excluded.lease_token,
          lease_generation = min(
            billing_account_operation_leases.lease_generation + 1,
            2147483647
          ),
          lease_expires_at = excluded.lease_expires_at,
          last_acquired_at = excluded.last_acquired_at,
          last_released_at = NULL,
          updated_at = excluded.updated_at
        WHERE billing_account_operation_leases.state = 'idle'
          OR billing_account_operation_leases.lease_token IS NULL
          OR billing_account_operation_leases.lease_expires_at IS NULL
          OR billing_account_operation_leases.lease_expires_at <= ?
        RETURNING account_id`,
      )
      .bind(
        input.operation,
        leaseToken,
        leaseExpiresAt.getTime(),
        now.getTime(),
        now.getTime(),
        now.getTime(),
        input.accountId,
        now.getTime(),
      )
      .first<{ account_id: string }>();
    claimedAccountId = claimed?.account_id ?? null;
  } catch (cause) {
    throw persistenceFailed("The billing operation lease could not be acquired.", cause);
  }

  if (!claimedAccountId) {
    const existing = await getBillingAccountOperationLease(input.accountId);
    if (
      existing?.state === "held" &&
      existing.leaseToken &&
      existing.leaseExpiresAt &&
      existing.leaseExpiresAt.getTime() > now.getTime()
    ) {
      return null;
    }
    const [account] = await getDb()
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, input.accountId))
      .limit(1);
    if (!account) {
      throw new BillingAccountOperationLeaseError(
        "billing_operation_lease_account_not_found",
        "The billing account was not found.",
      );
    }
    throw persistenceFailed("The billing operation lease could not be reclaimed.");
  }

  const record = await getBillingAccountOperationLease(input.accountId);
  if (
    !record ||
    record.state !== "held" ||
    record.operation !== input.operation ||
    record.leaseToken !== leaseToken ||
    !record.leaseExpiresAt ||
    record.leaseExpiresAt.getTime() !== leaseExpiresAt.getTime()
  ) {
    throw persistenceFailed("The acquired billing operation lease could not be loaded.");
  }

  return claimFromRecord(record);
}

export async function getBillingAccountOperationLease(
  accountId: string,
): Promise<BillingAccountOperationLeaseRecord | null> {
  assertIdentifier(accountId, "accountId");
  const [record] = await getDb()
    .select()
    .from(billingAccountOperationLeases)
    .where(
      and(
        eq(billingAccountOperationLeases.accountId, accountId),
        eq(billingAccountOperationLeases.provider, PROVIDER),
      ),
    )
    .limit(1);
  return record ?? null;
}

/** Renew only a currently live claim; an expired owner can never resurrect. */
export async function renewBillingAccountOperationLease(
  claim: BillingAccountOperationLeaseClaim,
  nowInput?: Date,
): Promise<BillingAccountOperationLeaseClaim> {
  assertClaim(claim);
  const now = checkedDate(nowInput ?? new Date(), "now");
  const leaseExpiresAt = new Date(
    now.getTime() + BILLING_ACCOUNT_OPERATION_LEASE_MS,
  );
  let renewed: { account_id: string } | null;
  try {
    renewed = await d1()
      .prepare(
        `UPDATE billing_account_operation_leases
        SET lease_expires_at = ?, updated_at = ?
        WHERE account_id = ?
          AND provider = 'stripe'
          AND state = 'held'
          AND operation = ?
          AND lease_token = ?
          AND lease_generation = ?
          AND lease_expires_at > ?
        RETURNING account_id`,
      )
      .bind(
        leaseExpiresAt.getTime(),
        now.getTime(),
        claim.accountId,
        claim.operation,
        claim.leaseToken,
        claim.leaseGeneration,
        now.getTime(),
      )
      .first<{ account_id: string }>();
  } catch (cause) {
    throw persistenceFailed("The billing operation lease could not be renewed.", cause);
  }
  if (!renewed) throw leaseLost();
  return { ...claim, leaseExpiresAt };
}

/**
 * Assert ownership without extending it. Use the exported D1 guard below when
 * the assertion must commit atomically with terminal billing mutations.
 */
export async function assertBillingAccountOperationLease(
  claim: BillingAccountOperationLeaseClaim,
  nowInput?: Date,
): Promise<void> {
  assertClaim(claim);
  const now = checkedDate(nowInput ?? new Date(), "now");
  let owned: { account_id: string } | null;
  try {
    owned = await d1()
      .prepare(
        `SELECT account_id
        FROM billing_account_operation_leases
        WHERE account_id = ?
          AND provider = 'stripe'
          AND state = 'held'
          AND operation = ?
          AND lease_token = ?
          AND lease_generation = ?
          AND lease_expires_at > ?`
      )
      .bind(
        claim.accountId,
        claim.operation,
        claim.leaseToken,
        claim.leaseGeneration,
        now.getTime(),
      )
      .first<{ account_id: string }>();
  } catch (cause) {
    throw persistenceFailed("The billing operation lease could not be verified.", cause);
  }
  if (!owned) throw leaseLost();
}

/**
 * First statement for a terminal D1 batch. A released, expired, or reclaimed
 * claim makes account_id NULL and triggers the table's NOT NULL/PK constraint,
 * rolling back every later statement instead of allowing a stale worker to
 * publish provider-derived state.
 */
export function billingAccountOperationLeaseGuard(
  db: ReturnType<typeof getDb>,
  claim: BillingAccountOperationLeaseClaim,
  nowInput?: Date,
) {
  assertClaim(claim);
  const now = checkedDate(nowInput ?? new Date(), "now");
  return db
    .update(billingAccountOperationLeases)
    .set({
      accountId: sql<string>`case
        when ${billingAccountOperationLeases.provider} = ${PROVIDER}
          and ${billingAccountOperationLeases.state} = 'held'
          and ${billingAccountOperationLeases.operation} = ${claim.operation}
          and ${billingAccountOperationLeases.leaseToken} = ${claim.leaseToken}
          and ${billingAccountOperationLeases.leaseGeneration} = ${claim.leaseGeneration}
          and ${billingAccountOperationLeases.leaseExpiresAt} > ${now.getTime()}
        then ${billingAccountOperationLeases.accountId}
        else null
      end`,
    })
    .where(eq(billingAccountOperationLeases.accountId, claim.accountId));
}

/** Raw-D1 equivalent for repositories whose terminal transaction is a D1 batch. */
export function billingAccountOperationLeaseD1Guard(
  claim: BillingAccountOperationLeaseClaim,
  nowInput?: Date,
): D1PreparedStatement {
  assertClaim(claim);
  const now = checkedDate(nowInput ?? new Date(), "now");
  return d1()
    .prepare(
      `UPDATE billing_account_operation_leases
      SET account_id = CASE
        WHEN provider = 'stripe'
          AND state = 'held'
          AND operation = ?
          AND lease_token = ?
          AND lease_generation = ?
          AND lease_expires_at > ?
        THEN account_id
        ELSE NULL
      END
      WHERE account_id = ?`,
    )
    .bind(
      claim.operation,
      claim.leaseToken,
      claim.leaseGeneration,
      now.getTime(),
      claim.accountId,
    );
}

/** Release only the exact current owner; stale release calls are harmless. */
export async function releaseBillingAccountOperationLease(
  claim: BillingAccountOperationLeaseClaim,
  nowInput?: Date,
): Promise<boolean> {
  assertClaim(claim);
  const now = checkedDate(nowInput ?? new Date(), "now");
  let released: { account_id: string } | null;
  try {
    released = await d1()
      .prepare(
        `UPDATE billing_account_operation_leases
        SET state = 'idle',
          operation = NULL,
          lease_token = NULL,
          lease_expires_at = NULL,
          last_released_at = ?,
          updated_at = ?
        WHERE account_id = ?
          AND provider = 'stripe'
          AND state = 'held'
          AND operation = ?
          AND lease_token = ?
          AND lease_generation = ?
        RETURNING account_id`,
      )
      .bind(
        now.getTime(),
        now.getTime(),
        claim.accountId,
        claim.operation,
        claim.leaseToken,
        claim.leaseGeneration,
      )
      .first<{ account_id: string }>();
  } catch (cause) {
    throw persistenceFailed("The billing operation lease could not be released.", cause);
  }
  return Boolean(released);
}

export async function releaseBillingAccountOperationLeaseBestEffort(
  claim: BillingAccountOperationLeaseClaim,
  nowInput?: Date,
): Promise<void> {
  try {
    await releaseBillingAccountOperationLease(claim, nowInput);
  } catch {
    console.error("Billing operation lease could not be released", {
      accountId: claim.accountId,
      operation: claim.operation,
      leaseGeneration: claim.leaseGeneration,
    });
  }
}

function claimFromRecord(
  record: BillingAccountOperationLeaseRecord,
): BillingAccountOperationLeaseClaim {
  if (
    record.state !== "held" ||
    !record.operation ||
    !record.leaseToken ||
    !record.leaseExpiresAt
  ) {
    throw persistenceFailed("The stored billing operation lease has an invalid shape.");
  }
  return {
    accountId: record.accountId,
    operation: record.operation,
    leaseToken: record.leaseToken,
    leaseGeneration: record.leaseGeneration,
    leaseExpiresAt: record.leaseExpiresAt,
  };
}

function assertClaim(claim: BillingAccountOperationLeaseClaim): void {
  assertIdentifier(claim.accountId, "accountId");
  assertOperation(claim.operation);
  assertIdentifier(claim.leaseToken, "leaseToken");
  if (
    !Number.isSafeInteger(claim.leaseGeneration) ||
    claim.leaseGeneration < 1
  ) {
    throw invalid("leaseGeneration must be a positive safe integer.");
  }
  checkedDate(claim.leaseExpiresAt, "leaseExpiresAt");
}

function assertOperation(value: BillingAccountOperation): void {
  if (value !== "checkout" && value !== "reconciliation") {
    throw invalid("operation must identify a supported billing operation.");
  }
}

function assertIdentifier(value: string, field: string): void {
  if (
    value.length < 1 ||
    value.length > 255 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw invalid(`${field} is invalid.`);
  }
}

function checkedDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || !Number.isSafeInteger(value.getTime())) {
    throw invalid(`${field} is invalid.`);
  }
  return value;
}

function invalid(message: string): BillingAccountOperationLeaseError {
  return new BillingAccountOperationLeaseError(
    "billing_operation_lease_invalid",
    message,
  );
}

function leaseLost(): BillingAccountOperationLeaseError {
  return new BillingAccountOperationLeaseError(
    "billing_operation_lease_lost",
    "The billing operation lease is no longer owned by this worker.",
  );
}

function persistenceFailed(
  message: string,
  cause?: unknown,
): BillingAccountOperationLeaseError {
  return new BillingAccountOperationLeaseError(
    "billing_operation_lease_persistence_failed",
    message,
    cause === undefined ? undefined : { cause },
  );
}

function d1(): D1Database {
  if (!env.DB) {
    throw persistenceFailed("The billing operation lease database is unavailable.");
  }
  return env.DB;
}
