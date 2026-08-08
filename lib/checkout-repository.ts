import { env } from "cloudflare:workers";
import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db/index";
import {
  billingCheckoutAttempts,
  billingCustomers,
  subscriptions,
} from "../db/schema";
import {
  billingAccountOperationLeaseD1Guard,
  type BillingAccountOperation,
  type BillingAccountOperationLeaseClaim,
} from "./billing-account-operation-lease";
import { newId } from "./tokens";

const PROVIDER = "stripe";
const IDEMPOTENCY_KEY_PREFIX = "roadmap-checkout-v1-";
const BLOCKING_ATTEMPT_STATES = [
  "reserved",
  "open",
  "completed_pending_sync",
  "quarantined",
] as const;
const ERROR_RECORDABLE_STATES = BLOCKING_ATTEMPT_STATES;
const OPEN_SUBSCRIPTION_STATUSES = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "paused",
  "unpaid",
] as const;

export type BillingCustomerRecord = typeof billingCustomers.$inferSelect;
export type CheckoutAttemptRecord = typeof billingCheckoutAttempts.$inferSelect;

export type CheckoutRepositoryErrorCode =
  | "checkout_attempt_invalid"
  | "checkout_attempt_not_found"
  | "checkout_attempt_conflict"
  | "checkout_attempt_expired"
  | "checkout_attempt_persistence_failed"
  | "checkout_customer_snapshot_conflict"
  | "subscription_already_open";

export class CheckoutRepositoryError extends Error {
  constructor(
    public readonly code: CheckoutRepositoryErrorCode,
    public readonly safeMessage: string,
    options?: ErrorOptions,
  ) {
    super(safeMessage, options);
    this.name = "CheckoutRepositoryError";
  }
}

export type ReserveCheckoutAttemptInput = Readonly<{
  accountId: string;
  providerPriceId: string;
  applicationOrigin: string;
  providerCustomerId: string | null;
  customerEmail: string;
  providerExpiresAt: Date;
  operationLease?: BillingAccountOperationLeaseClaim;
  now?: Date;
}>;

export type CheckoutAttemptReservation = Readonly<{
  attempt: CheckoutAttemptRecord;
  created: boolean;
}>;

export type CheckoutAttemptMutation = Readonly<{
  attempt: CheckoutAttemptRecord;
  changed: boolean;
}>;

export type StrandedCheckoutReservationExpiration = Readonly<{
  expired: boolean;
  attemptId: string | null;
}>;

/**
 * Return the one Stripe customer identity canonically owned by an account.
 * Provider identifiers are never used without the local tenant boundary.
 */
export async function getCanonicalBillingCustomer(
  accountId: string,
): Promise<BillingCustomerRecord | null> {
  assertOpaqueIdentifier(accountId, "accountId");
  const [customer] = await getDb()
    .select()
    .from(billingCustomers)
    .where(
      and(
        eq(billingCustomers.provider, PROVIDER),
        eq(billingCustomers.accountId, accountId),
      ),
    )
    .limit(1);
  return customer ?? null;
}

/**
 * Return an attempt only when both its opaque ID and owning account match.
 */
export async function getCheckoutAttemptForAccount(
  accountId: string,
  attemptId: string,
): Promise<CheckoutAttemptRecord | null> {
  assertOpaqueIdentifier(accountId, "accountId");
  assertOpaqueIdentifier(attemptId, "attemptId");
  const [attempt] = await getDb()
    .select()
    .from(billingCheckoutAttempts)
    .where(
      and(
        eq(billingCheckoutAttempts.id, attemptId),
        eq(billingCheckoutAttempts.accountId, accountId),
        eq(billingCheckoutAttempts.provider, PROVIDER),
      ),
    )
    .limit(1);
  return attempt ?? null;
}

/**
 * Resolve identifiers from an already signature-verified Checkout event
 * without using provider-supplied account metadata as an ownership claim.
 * Either identifier may independently establish that the event names a local
 * attempt; if both are known locally, they must name the same row.
 */
export async function resolveCheckoutAttemptForSignedWebhook(input: {
  attemptId?: string | null;
  providerSessionId?: string | null;
}): Promise<CheckoutAttemptRecord | null> {
  const attemptId = input.attemptId ?? null;
  const providerSessionId = input.providerSessionId ?? null;
  if (attemptId === null && providerSessionId === null) {
    throw invalid("At least one Checkout identifier is required.");
  }
  if (attemptId !== null) assertOpaqueIdentifier(attemptId, "attemptId");
  if (providerSessionId !== null) {
    assertProviderIdentifier(providerSessionId, "cs_", "providerSessionId");
  }

  const identifierPredicate =
    attemptId !== null && providerSessionId !== null
      ? or(
          eq(billingCheckoutAttempts.id, attemptId),
          eq(billingCheckoutAttempts.providerSessionId, providerSessionId),
        )
      : attemptId !== null
        ? eq(billingCheckoutAttempts.id, attemptId)
        : eq(
            billingCheckoutAttempts.providerSessionId,
            providerSessionId as string,
          );
  const attempts = await getDb()
    .select()
    .from(billingCheckoutAttempts)
    .where(
      and(
        eq(billingCheckoutAttempts.provider, PROVIDER),
        identifierPredicate,
      ),
    )
    .limit(2);

  if (attempts.length > 1) {
    throw new CheckoutRepositoryError(
      "checkout_attempt_conflict",
      "The signed provider event identifies different local checkout attempts.",
    );
  }
  return attempts[0] ?? null;
}

/**
 * Reserve the account's single blocking checkout attempt, or load the attempt
 * that won a concurrent reservation. New rows freeze the route-validated
 * price, origin, customer/email choice, and provider expiry; retries never
 * replace those fields. The canonical-customer snapshot and lack of an open
 * subscription are checked by the same SQLite statement that creates the row.
 */
export async function reserveOrLoadCheckoutAttempt(
  input: ReserveCheckoutAttemptInput,
): Promise<CheckoutAttemptReservation> {
  validateReservationInput(input);
  const now = checkedDate(input.now ?? new Date(), "now");
  assertOperationLeaseForAccount(input.operationLease, input.accountId, [
    "checkout",
  ]);
  if (input.providerExpiresAt.getTime() <= now.getTime()) {
    throw invalid("providerExpiresAt must be later than the reservation time.");
  }

  const attemptId = newId();
  const idempotencyKey = `${IDEMPOTENCY_KEY_PREFIX}${attemptId}`;
  let insertedId: string | null = null;

  try {
    const insert = d1()
      .prepare(
        `INSERT INTO billing_checkout_attempts (
          id,
          account_id,
          provider,
          state,
          request_version,
          idempotency_key,
          provider_price_id,
          application_origin,
          provider_customer_id,
          customer_email,
          provider_expires_at,
          created_at,
          updated_at
        )
        SELECT ?, ?, 'stripe', 'reserved', 1, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE COALESCE((
          SELECT provider_customer_id
          FROM billing_customers
          WHERE provider = 'stripe' AND account_id = ?
          LIMIT 1
        ), '') = COALESCE(?, '')
        AND NOT EXISTS (
          SELECT 1
          FROM subscriptions
          WHERE provider = 'stripe'
            AND account_id = ?
            AND status IN ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'unpaid')
        )
        ON CONFLICT DO NOTHING
        RETURNING id`,
      )
      .bind(
        attemptId,
        input.accountId,
        idempotencyKey,
        input.providerPriceId,
        input.applicationOrigin,
        input.providerCustomerId,
        input.customerEmail,
        input.providerExpiresAt.getTime(),
        now.getTime(),
        now.getTime(),
        input.accountId,
        input.providerCustomerId,
        input.accountId,
      );
    const inserted = input.operationLease
      ? (
          await d1().batch<{ id: string }>([
            billingAccountOperationLeaseD1Guard(input.operationLease, now),
            insert,
          ])
        )[1]?.results[0]
      : await insert.first<{ id: string }>();
    const result = inserted as { id: string } | null | undefined;
    insertedId = result?.id ?? null;
  } catch (cause) {
    throw new CheckoutRepositoryError(
      "checkout_attempt_persistence_failed",
      "The checkout attempt could not be durably reserved.",
      { cause },
    );
  }

  const blockingAttempt = await getBlockingAttempt(input.accountId);
  if (blockingAttempt) {
    // The insert fence and this read are separate D1 statements. A signed
    // provider event can project an open subscription between them, so never
    // return even an already-existing blocker without checking the current
    // subscription projection again.
    if (await hasOpenSubscription(input.accountId)) {
      throw new CheckoutRepositoryError(
        "subscription_already_open",
        "The account already has an open subscription.",
      );
    }
    return {
      attempt: blockingAttempt,
      created: blockingAttempt.id === insertedId,
    };
  }

  if (await hasOpenSubscription(input.accountId)) {
    throw new CheckoutRepositoryError(
      "subscription_already_open",
      "The account already has an open subscription.",
    );
  }

  const canonicalCustomer = await getCanonicalBillingCustomer(input.accountId);
  if (
    (canonicalCustomer?.providerCustomerId ?? null) !==
    input.providerCustomerId
  ) {
    throw new CheckoutRepositoryError(
      "checkout_customer_snapshot_conflict",
      "The checkout customer snapshot no longer matches this account.",
    );
  }

  throw new CheckoutRepositoryError(
    "checkout_attempt_persistence_failed",
    "The checkout attempt could not be durably reserved.",
  );
}

/**
 * Expire the account's stranded, unissued reservation after its frozen
 * provider lifetime. This path is intentionally narrower than provider-
 * confirmed expiry for open sessions: only `reserved` rows with no provider
 * session or provider-created timestamp qualify. The conditional audit and
 * transition commit in one D1 batch, so a concurrent signed completion cannot
 * leave a false expiration audit behind.
 */
export async function expireStrandedCheckoutReservation(input: {
  accountId: string;
  operationLease?: BillingAccountOperationLeaseClaim;
  requestId?: string | null;
  now?: Date;
}): Promise<StrandedCheckoutReservationExpiration> {
  assertOpaqueIdentifier(input.accountId, "accountId");
  assertOperationLeaseForAccount(input.operationLease, input.accountId, [
    "checkout",
  ]);
  const requestId = optionalSafeString(input.requestId, "requestId", 128);
  const now = checkedDate(input.now ?? new Date(), "now");
  const auditMetadata = JSON.stringify({
    provider: PROVIDER,
    requestVersion: 1,
    reason: "unissued_reservation_expired",
  });

  try {
    const leaseGuards = input.operationLease
      ? [billingAccountOperationLeaseD1Guard(input.operationLease, now)]
      : [];
    const results = await d1().batch<{ id: string }>([
      ...leaseGuards,
      d1()
        .prepare(
          `INSERT INTO audit_events (
            id,
            account_id,
            actor_type,
            actor_account_id,
            action,
            target_type,
            target_id,
            outcome,
            request_id,
            metadata,
            occurred_at
          )
          SELECT ?, account_id, 'account', account_id,
            'billing.checkout_reservation_expired',
            'billing_checkout_attempt', id, 'success', ?, ?, ?
          FROM billing_checkout_attempts
          WHERE account_id = ?
            AND provider = 'stripe'
            AND state = 'reserved'
            AND provider_session_id IS NULL
            AND provider_created_at IS NULL
            AND provider_expires_at <= ?`,
        )
        .bind(
          newId(),
          requestId,
          auditMetadata,
          now.getTime(),
          input.accountId,
          now.getTime(),
        ),
      d1()
        .prepare(
          `UPDATE billing_checkout_attempts
          SET state = 'expired',
            expired_at = ?,
            last_error_code = NULL,
            updated_at = ?
          WHERE account_id = ?
            AND provider = 'stripe'
            AND state = 'reserved'
            AND provider_session_id IS NULL
            AND provider_created_at IS NULL
            AND provider_expires_at <= ?
          RETURNING id`,
        )
        .bind(
          now.getTime(),
          now.getTime(),
          input.accountId,
          now.getTime(),
        ),
    ]);
    const transition = results[leaseGuards.length + 1];
    const attemptId = transition.results[0]?.id ?? null;
    return { expired: attemptId !== null, attemptId };
  } catch (cause) {
    throw new CheckoutRepositoryError(
      "checkout_attempt_persistence_failed",
      "The stranded checkout reservation could not be expired.",
      { cause },
    );
  }
}

/**
 * Record a provider-confirmed expired Checkout Session. Local time is never
 * sufficient to unlock a blocking attempt: callers must first retrieve and
 * validate the provider session, then pass its immutable identity here.
 */
export async function expireCheckoutAttemptAfterProviderConfirmation(input: {
  accountId: string;
  attemptId: string;
  providerSessionId: string;
  providerCreatedAt: Date;
  operationLease?: BillingAccountOperationLeaseClaim;
  requestId?: string | null;
  now?: Date;
}): Promise<CheckoutAttemptMutation> {
  assertOpaqueIdentifier(input.accountId, "accountId");
  assertOpaqueIdentifier(input.attemptId, "attemptId");
  assertProviderIdentifier(input.providerSessionId, "cs_", "providerSessionId");
  const providerCreatedAt = checkedDate(
    input.providerCreatedAt,
    "providerCreatedAt",
  );
  const now = checkedDate(input.now ?? new Date(), "now");
  assertOperationLeaseForAccount(input.operationLease, input.accountId, [
    "checkout",
    "reconciliation",
  ]);
  const requestId = optionalSafeString(input.requestId, "requestId", 128);
  const auditMetadata = JSON.stringify({
    provider: PROVIDER,
    requestVersion: 1,
    reason: "provider_session_expired",
  });
  let transitioned = false;
  try {
    const leaseGuards = input.operationLease
      ? [billingAccountOperationLeaseD1Guard(input.operationLease, now)]
      : [];
    const results = await d1().batch<{ id: string }>([
      ...leaseGuards,
      d1()
        .prepare(
          `INSERT INTO audit_events (
            id,
            account_id,
            actor_type,
            actor_account_id,
            action,
            target_type,
            target_id,
            outcome,
            request_id,
            metadata,
            occurred_at
          )
          SELECT ?, account_id, 'system', NULL,
            'billing.checkout_session_expired',
            'billing_checkout_attempt', id, 'success', ?, ?, ?
          FROM billing_checkout_attempts
          WHERE id = ?
            AND account_id = ?
            AND provider = 'stripe'
            AND state IN ('reserved', 'open')
            AND (provider_session_id IS NULL OR provider_session_id = ?)
            AND (provider_created_at IS NULL OR provider_created_at = ?)
            AND provider_expires_at > ?`,
        )
        .bind(
          newId(),
          requestId,
          auditMetadata,
          now.getTime(),
          input.attemptId,
          input.accountId,
          input.providerSessionId,
          providerCreatedAt.getTime(),
          providerCreatedAt.getTime(),
        ),
      d1()
        .prepare(
          `UPDATE billing_checkout_attempts
          SET state = 'expired',
            provider_session_id = ?,
            provider_created_at = COALESCE(provider_created_at, ?),
            expired_at = ?,
            last_error_code = NULL,
            updated_at = ?
          WHERE id = ?
            AND account_id = ?
            AND provider = 'stripe'
            AND state IN ('reserved', 'open')
            AND (provider_session_id IS NULL OR provider_session_id = ?)
            AND (provider_created_at IS NULL OR provider_created_at = ?)
            AND provider_expires_at > ?
          RETURNING id`,
        )
        .bind(
          input.providerSessionId,
          providerCreatedAt.getTime(),
          now.getTime(),
          now.getTime(),
          input.attemptId,
          input.accountId,
          input.providerSessionId,
          providerCreatedAt.getTime(),
          providerCreatedAt.getTime(),
        ),
    ]);
    transitioned =
      results[leaseGuards.length + 1]?.results.length === 1;
  } catch (cause) {
    throw providerTransitionError(
      cause,
      "The provider-confirmed Checkout expiration could not be recorded.",
    );
  }

  const attempt = await getCheckoutAttemptForAccount(
    input.accountId,
    input.attemptId,
  );
  if (!attempt) throw notFound();
  if (transitioned) return { attempt, changed: true };
  if (
    ["expired", "completed_pending_sync", "completed"].includes(attempt.state) &&
    providerSnapshotMatches(attempt, input.providerSessionId, providerCreatedAt)
  ) {
    return { attempt, changed: false };
  }
  throw conflict();
}

/**
 * Persist provider completion before waiting for the signed webhook projection.
 * The state remains covered by the one-blocking-attempt constraint, preventing
 * a second Checkout while billing synchronization is outstanding.
 */
export async function markCheckoutAttemptCompletedPendingSync(input: {
  accountId: string;
  attemptId: string;
  providerSessionId: string;
  providerCreatedAt: Date;
  operationLease?: BillingAccountOperationLeaseClaim;
  requestId?: string | null;
  now?: Date;
}): Promise<CheckoutAttemptMutation> {
  assertOpaqueIdentifier(input.accountId, "accountId");
  assertOpaqueIdentifier(input.attemptId, "attemptId");
  assertProviderIdentifier(input.providerSessionId, "cs_", "providerSessionId");
  const providerCreatedAt = checkedDate(
    input.providerCreatedAt,
    "providerCreatedAt",
  );
  const now = checkedDate(input.now ?? new Date(), "now");
  assertOperationLeaseForAccount(input.operationLease, input.accountId, [
    "checkout",
    "reconciliation",
  ]);
  const requestId = optionalSafeString(input.requestId, "requestId", 128);
  const auditMetadata = JSON.stringify({
    provider: PROVIDER,
    requestVersion: 1,
    state: "completed_pending_sync",
  });
  let transitioned = false;
  try {
    const leaseGuards = input.operationLease
      ? [billingAccountOperationLeaseD1Guard(input.operationLease, now)]
      : [];
    const results = await d1().batch<{ id: string }>([
      ...leaseGuards,
      d1()
        .prepare(
          `INSERT INTO audit_events (
            id,
            account_id,
            actor_type,
            actor_account_id,
            action,
            target_type,
            target_id,
            outcome,
            request_id,
            metadata,
            occurred_at
          )
          SELECT ?, account_id, 'system', NULL,
            'billing.checkout_completion_pending_sync',
            'billing_checkout_attempt', id, 'success', ?, ?, ?
          FROM billing_checkout_attempts
          WHERE id = ?
            AND account_id = ?
            AND provider = 'stripe'
            AND state IN ('reserved', 'open')
            AND (provider_session_id IS NULL OR provider_session_id = ?)
            AND (provider_created_at IS NULL OR provider_created_at = ?)
            AND provider_expires_at > ?`,
        )
        .bind(
          newId(),
          requestId,
          auditMetadata,
          now.getTime(),
          input.attemptId,
          input.accountId,
          input.providerSessionId,
          providerCreatedAt.getTime(),
          providerCreatedAt.getTime(),
        ),
      d1()
        .prepare(
          `UPDATE billing_checkout_attempts
          SET state = 'completed_pending_sync',
            provider_session_id = ?,
            provider_created_at = COALESCE(provider_created_at, ?),
            expired_at = NULL,
            last_error_code = NULL,
            updated_at = ?
          WHERE id = ?
            AND account_id = ?
            AND provider = 'stripe'
            AND state IN ('reserved', 'open')
            AND (provider_session_id IS NULL OR provider_session_id = ?)
            AND (provider_created_at IS NULL OR provider_created_at = ?)
            AND provider_expires_at > ?
          RETURNING id`,
        )
        .bind(
          input.providerSessionId,
          providerCreatedAt.getTime(),
          now.getTime(),
          input.attemptId,
          input.accountId,
          input.providerSessionId,
          providerCreatedAt.getTime(),
          providerCreatedAt.getTime(),
        ),
    ]);
    transitioned =
      results[leaseGuards.length + 1]?.results.length === 1;
  } catch (cause) {
    throw providerTransitionError(
      cause,
      "The completed Checkout attempt could not be queued for synchronization.",
    );
  }

  const attempt = await getCheckoutAttemptForAccount(
    input.accountId,
    input.attemptId,
  );
  if (!attempt) throw notFound();
  if (transitioned) return { attempt, changed: true };
  if (
    ["completed_pending_sync", "completed"].includes(attempt.state) &&
    providerSnapshotMatches(attempt, input.providerSessionId, providerCreatedAt)
  ) {
    return { attempt, changed: false };
  }
  throw conflict();
}

/**
 * Publish a successfully created provider session with a reserved-state fence.
 * The conditional audit insert and transition share one D1 transaction. A
 * concurrent retry therefore observes the open row without creating another
 * audit event, while any session-uniqueness failure rolls the audit back.
 */
export async function finalizeCheckoutAttemptOpen(input: {
  accountId: string;
  attemptId: string;
  providerSessionId: string;
  providerCreatedAt: Date;
  operationLease?: BillingAccountOperationLeaseClaim;
  requestId?: string | null;
  now?: Date;
}): Promise<CheckoutAttemptMutation> {
  assertOpaqueIdentifier(input.accountId, "accountId");
  assertOpaqueIdentifier(input.attemptId, "attemptId");
  assertProviderIdentifier(input.providerSessionId, "cs_", "providerSessionId");
  const providerCreatedAt = checkedDate(
    input.providerCreatedAt,
    "providerCreatedAt",
  );
  const now = checkedDate(input.now ?? new Date(), "now");
  assertOperationLeaseForAccount(input.operationLease, input.accountId, [
    "checkout",
  ]);
  const requestId = optionalSafeString(input.requestId, "requestId", 128);
  const auditMetadata = JSON.stringify({ provider: PROVIDER, requestVersion: 1 });
  let transitioned = false;

  try {
    const leaseGuards = input.operationLease
      ? [billingAccountOperationLeaseD1Guard(input.operationLease, now)]
      : [];
    const results = await d1().batch<{ id: string }>([
      ...leaseGuards,
      d1()
        .prepare(
          `INSERT INTO audit_events (
            id,
            account_id,
            actor_type,
            actor_account_id,
            action,
            target_type,
            target_id,
            outcome,
            request_id,
            metadata,
            occurred_at
          )
          SELECT ?, account_id, 'account', account_id,
            'billing.checkout_session_created',
            'billing_checkout_attempt',
            id,
            'success',
            ?,
            ?,
            ?
          FROM billing_checkout_attempts
          WHERE id = ?
            AND account_id = ?
            AND provider = 'stripe'
            AND state = 'reserved'
            AND provider_session_id IS NULL
            AND provider_expires_at > ?
            AND provider_expires_at > ?`,
        )
        .bind(
          newId(),
          requestId,
          auditMetadata,
          now.getTime(),
          input.attemptId,
          input.accountId,
          now.getTime(),
          providerCreatedAt.getTime(),
        ),
      d1()
        .prepare(
          `UPDATE billing_checkout_attempts
          SET state = 'open',
            provider_session_id = ?,
            provider_created_at = ?,
            last_error_code = NULL,
            updated_at = ?
          WHERE id = ?
            AND account_id = ?
            AND provider = 'stripe'
            AND state = 'reserved'
            AND provider_session_id IS NULL
            AND provider_expires_at > ?
            AND provider_expires_at > ?
          RETURNING id`,
        )
        .bind(
          input.providerSessionId,
          providerCreatedAt.getTime(),
          now.getTime(),
          input.attemptId,
          input.accountId,
          now.getTime(),
          providerCreatedAt.getTime(),
        ),
    ]);
    const transitionResult = results[leaseGuards.length + 1];
    transitioned = transitionResult.results.length === 1;
  } catch (cause) {
    const uniqueSessionConflict = /unique constraint failed/i.test(
      cause instanceof Error ? cause.message : String(cause),
    );
    throw new CheckoutRepositoryError(
      uniqueSessionConflict
        ? "checkout_attempt_conflict"
        : "checkout_attempt_persistence_failed",
      uniqueSessionConflict
        ? "The provider session is already associated with another checkout attempt."
        : "The checkout attempt could not be finalized.",
      { cause },
    );
  }

  const attempt = await getCheckoutAttemptForAccount(
    input.accountId,
    input.attemptId,
  );
  if (!attempt) throw notFound();
  if (transitioned) return { attempt, changed: true };

  if (attempt.state === "expired" || attempt.providerExpiresAt <= now) {
    throw new CheckoutRepositoryError(
      "checkout_attempt_expired",
      "The checkout attempt has expired.",
    );
  }
  if (
    ["open", "completed_pending_sync", "completed"].includes(attempt.state) &&
    attempt.providerSessionId === input.providerSessionId
  ) {
    return { attempt, changed: false };
  }
  throw conflict();
}

/** Store a bounded machine code while deliberately leaving blocking state set. */
export async function recordCheckoutAttemptError(input: {
  accountId: string;
  attemptId: string;
  errorCode: string;
  now?: Date;
}): Promise<CheckoutAttemptMutation> {
  assertOpaqueIdentifier(input.accountId, "accountId");
  assertOpaqueIdentifier(input.attemptId, "attemptId");
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(input.errorCode)) {
    throw invalid("errorCode must be a bounded lowercase machine code.");
  }
  const now = checkedDate(input.now ?? new Date(), "now");
  const [recorded] = await getDb()
    .update(billingCheckoutAttempts)
    .set({ lastErrorCode: input.errorCode, updatedAt: now })
    .where(
      and(
        eq(billingCheckoutAttempts.id, input.attemptId),
        eq(billingCheckoutAttempts.accountId, input.accountId),
        eq(billingCheckoutAttempts.provider, PROVIDER),
        inArray(billingCheckoutAttempts.state, ERROR_RECORDABLE_STATES),
      ),
    )
    .returning();

  if (recorded) return { attempt: recorded, changed: true };
  const attempt = await getCheckoutAttemptForAccount(
    input.accountId,
    input.attemptId,
  );
  if (!attempt) throw notFound();
  return { attempt, changed: false };
}

/**
 * Resolve and validate the local checkout record named by a completion event.
 * A provider session/customer/price can never be reassigned across attempts or
 * tenants. Reserved is accepted to tolerate a webhook racing route finalize;
 * the webhook processor still owns the subsequent durable state transition.
 */
export async function requireCheckoutAttemptForCompletion(input: {
  accountId: string;
  attemptId: string;
  providerSessionId: string;
  providerCustomerId: string;
  providerPriceId: string;
}): Promise<CheckoutAttemptRecord> {
  assertOpaqueIdentifier(input.accountId, "accountId");
  assertOpaqueIdentifier(input.attemptId, "attemptId");
  assertProviderIdentifier(input.providerSessionId, "cs_", "providerSessionId");
  assertProviderIdentifier(
    input.providerCustomerId,
    "cus_",
    "providerCustomerId",
  );
  assertProviderIdentifier(input.providerPriceId, "price_", "providerPriceId");

  const attempt = await getCheckoutAttemptForAccount(
    input.accountId,
    input.attemptId,
  );
  if (!attempt) throw notFound();
  if (attempt.state === "expired") {
    throw new CheckoutRepositoryError(
      "checkout_attempt_expired",
      "The checkout attempt has expired.",
    );
  }
  if (attempt.state === "quarantined") throw conflict();
  if (attempt.providerPriceId !== input.providerPriceId) throw conflict();
  if (
    attempt.providerSessionId !== null &&
    attempt.providerSessionId !== input.providerSessionId
  ) {
    throw conflict();
  }
  if (
    attempt.providerCustomerId !== null &&
    attempt.providerCustomerId !== input.providerCustomerId
  ) {
    throw conflict();
  }

  const canonicalCustomer = await getCanonicalBillingCustomer(input.accountId);
  if (
    canonicalCustomer !== null &&
    canonicalCustomer.providerCustomerId !== input.providerCustomerId
  ) {
    throw conflict();
  }
  return attempt;
}

export async function getBlockingCheckoutAttemptForAccount(
  accountId: string,
): Promise<CheckoutAttemptRecord | null> {
  assertOpaqueIdentifier(accountId, "accountId");
  const [attempt] = await getDb()
    .select()
    .from(billingCheckoutAttempts)
    .where(
      and(
        eq(billingCheckoutAttempts.accountId, accountId),
        eq(billingCheckoutAttempts.provider, PROVIDER),
        inArray(billingCheckoutAttempts.state, BLOCKING_ATTEMPT_STATES),
      ),
    )
    .limit(1);
  return attempt ?? null;
}

const getBlockingAttempt = getBlockingCheckoutAttemptForAccount;

async function hasOpenSubscription(accountId: string): Promise<boolean> {
  const [subscription] = await getDb()
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.accountId, accountId),
        eq(subscriptions.provider, PROVIDER),
        inArray(subscriptions.status, OPEN_SUBSCRIPTION_STATUSES),
      ),
    )
    .limit(1);
  return Boolean(subscription);
}

function validateReservationInput(input: ReserveCheckoutAttemptInput): void {
  assertOpaqueIdentifier(input.accountId, "accountId");
  assertProviderIdentifier(input.providerPriceId, "price_", "providerPriceId");
  if (input.providerCustomerId !== null) {
    assertProviderIdentifier(
      input.providerCustomerId,
      "cus_",
      "providerCustomerId",
    );
  }
  if (
    input.customerEmail.length > 320 ||
    input.customerEmail !== input.customerEmail.trim() ||
    !/^[^\s@]+@[^\s@]+$/.test(input.customerEmail)
  ) {
    throw invalid("customerEmail must be a valid bounded email address.");
  }
  if (input.applicationOrigin.length > 255) {
    throw invalid("applicationOrigin is too long.");
  }
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(input.applicationOrigin);
  } catch {
    throw invalid("applicationOrigin must be an absolute origin.");
  }
  const localHttp =
    parsedOrigin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsedOrigin.hostname);
  if (
    parsedOrigin.origin !== input.applicationOrigin ||
    (parsedOrigin.protocol !== "https:" && !localHttp)
  ) {
    throw invalid("applicationOrigin must be a canonical HTTPS origin.");
  }
  checkedDate(input.providerExpiresAt, "providerExpiresAt");
}

function assertOperationLeaseForAccount(
  claim: BillingAccountOperationLeaseClaim | undefined,
  accountId: string,
  allowedOperations: readonly BillingAccountOperation[],
): void {
  if (!claim) return;
  if (
    claim.accountId !== accountId ||
    !allowedOperations.includes(claim.operation)
  ) {
    throw new CheckoutRepositoryError(
      "checkout_attempt_invalid",
      "The billing operation lease does not own this checkout mutation.",
    );
  }
}

function assertOpaqueIdentifier(value: string, field: string): void {
  if (
    value.length < 1 ||
    value.length > 255 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw invalid(`${field} is invalid.`);
  }
}

function assertProviderIdentifier(
  value: string,
  prefix: string,
  field: string,
): void {
  assertOpaqueIdentifier(value, field);
  if (!value.startsWith(prefix)) throw invalid(`${field} is invalid.`);
}

function optionalSafeString(
  value: string | null | undefined,
  field: string,
  maximumLength: number,
): string | null {
  if (value === null || value === undefined) return null;
  if (
    value.length < 1 ||
    value.length > maximumLength ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw invalid(`${field} is invalid.`);
  }
  return value;
}

function checkedDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || !Number.isSafeInteger(value.getTime())) {
    throw invalid(`${field} is invalid.`);
  }
  return value;
}

function providerSnapshotMatches(
  attempt: CheckoutAttemptRecord,
  providerSessionId: string,
  providerCreatedAt: Date,
): boolean {
  return (
    attempt.providerSessionId === providerSessionId &&
    (attempt.providerCreatedAt === null ||
      attempt.providerCreatedAt.getTime() === providerCreatedAt.getTime())
  );
}

function providerTransitionError(
  cause: unknown,
  safeMessage: string,
): CheckoutRepositoryError {
  const uniqueSessionConflict = /unique constraint failed/i.test(
    cause instanceof Error ? cause.message : String(cause),
  );
  return new CheckoutRepositoryError(
    uniqueSessionConflict
      ? "checkout_attempt_conflict"
      : "checkout_attempt_persistence_failed",
    uniqueSessionConflict
      ? "The provider session is already associated with another checkout attempt."
      : safeMessage,
    { cause },
  );
}

function d1(): D1Database {
  if (!env.DB) {
    throw new CheckoutRepositoryError(
      "checkout_attempt_persistence_failed",
      "The checkout database is unavailable.",
    );
  }
  return env.DB;
}

function invalid(message: string): CheckoutRepositoryError {
  return new CheckoutRepositoryError("checkout_attempt_invalid", message);
}

function notFound(): CheckoutRepositoryError {
  return new CheckoutRepositoryError(
    "checkout_attempt_not_found",
    "The checkout attempt was not found for this account.",
  );
}

function conflict(): CheckoutRepositoryError {
  return new CheckoutRepositoryError(
    "checkout_attempt_conflict",
    "The checkout attempt does not match the provider completion.",
  );
}
