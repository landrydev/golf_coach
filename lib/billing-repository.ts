import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  auditEvents,
  billingCheckoutAttempts,
  billingCustomers,
  billingEvents,
  billingSubscriptionProjectionGenerations,
  subscriptions,
} from "@/db/schema";
import {
  billingReconciliationSuccessEffects,
  billingReconciliationWebhookRecoveryEffects,
  type BillingReconciliationClaim,
  type BillingReconciliationTarget,
} from "@/lib/billing-reconciliation-repository";
import type { BillingAccountOperationLeaseClaim } from "@/lib/billing-account-operation-lease";
import { newId } from "@/lib/tokens";

const PROVIDER = "stripe";
const BILLING_EVENT_LEASE_MS = 5 * 60 * 1_000;
const OPEN_SUBSCRIPTION_STATUSES = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "paused",
  "unpaid",
] as const;

export type SubscriptionRecord = typeof subscriptions.$inferSelect;
export type BillingEventRecord = typeof billingEvents.$inferSelect;
export type BillingEventClaim = Readonly<{
  eventId: string;
  leaseToken: string;
  leaseExpiresAt: Date;
}>;
export type StripeSubscriptionProjectionGeneration = Readonly<{
  providerSubscriptionId: string;
  generation: number;
}>;
export type SubscriptionStatus = SubscriptionRecord["status"];

export type StripeSubscriptionProjection = {
  accountId: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  providerPriceId: string;
  status: SubscriptionStatus;
  billingInterval: "month" | "year";
  currency: string | null;
  unitAmountMinor: number | null;
  trialStartsAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodStartsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  endedAt: Date | null;
};

export type CheckoutAttemptCompletion = Readonly<{
  attemptId: string;
  providerSessionId: string;
  providerCreatedAt: Date | null;
}>;

export class BillingRepositoryError extends Error {
  constructor(
    public readonly code: string,
    public readonly safeMessage: string,
  ) {
    super(safeMessage);
    this.name = "BillingRepositoryError";
  }
}

/**
 * Return the account's open Stripe subscription, or its most recently synced
 * historical Stripe subscription. Tenant ownership is always part of the
 * query; callers cannot use a provider identifier to cross that boundary.
 */
export async function getSubscriptionForAccount(
  accountId: string,
): Promise<SubscriptionRecord | null> {
  const db = getDb();
  const [open] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.accountId, accountId),
        eq(subscriptions.provider, PROVIDER),
        inArray(subscriptions.status, OPEN_SUBSCRIPTION_STATUSES),
      ),
    )
    .orderBy(desc(subscriptions.lastProviderSyncAt), desc(subscriptions.updatedAt))
    .limit(1);
  if (open) return open;

  const [latest] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.accountId, accountId),
        eq(subscriptions.provider, PROVIDER),
      ),
    )
    .orderBy(desc(subscriptions.lastProviderSyncAt), desc(subscriptions.updatedAt))
    .limit(1);
  return latest ?? null;
}

export function isOpenSubscription(subscription: SubscriptionRecord): boolean {
  return (OPEN_SUBSCRIPTION_STATUSES as readonly string[]).includes(
    subscription.status,
  );
}

/**
 * Reserve the next provider-projection generation before retrieving Stripe.
 * Any older retrieval still in flight is fenced out by the terminal D1 batch.
 */
export async function reserveStripeSubscriptionProjectionGeneration(
  providerSubscriptionId: string,
): Promise<StripeSubscriptionProjectionGeneration> {
  assertProviderSubscriptionIdentifier(providerSubscriptionId);
  const now = new Date();
  const [reserved] = await getDb()
    .insert(billingSubscriptionProjectionGenerations)
    .values({
      provider: PROVIDER,
      providerSubscriptionId,
      generation: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        billingSubscriptionProjectionGenerations.provider,
        billingSubscriptionProjectionGenerations.providerSubscriptionId,
      ],
      set: {
        generation: sql`${billingSubscriptionProjectionGenerations.generation} + 1`,
        updatedAt: now,
      },
    })
    .returning({
      providerSubscriptionId:
        billingSubscriptionProjectionGenerations.providerSubscriptionId,
      generation: billingSubscriptionProjectionGenerations.generation,
    });

  if (
    !reserved ||
    reserved.providerSubscriptionId !== providerSubscriptionId ||
    !Number.isSafeInteger(reserved.generation) ||
    reserved.generation < 1
  ) {
    throw new BillingRepositoryError(
      "subscription_projection_generation_failed",
      "The provider subscription projection could not be reserved.",
    );
  }
  return reserved;
}

/** Record creation of a hosted Stripe surface without persisting its URL. */
export async function recordHostedBillingSession(input: {
  accountId: string;
  kind: "checkout" | "portal";
  providerSessionId: string;
  requestId?: string | null;
}): Promise<void> {
  const db = getDb();
  await db.insert(auditEvents).values({
    id: newId(),
    accountId: input.accountId,
    actorType: "account",
    actorAccountId: input.accountId,
    action: `billing.${input.kind}_session_created`,
    targetType: "billing_session",
    targetId: input.providerSessionId,
    outcome: "success",
    requestId: input.requestId ?? null,
    metadata: { provider: PROVIDER },
  });
}

export async function recordBillingReconciliationCheck(input: {
  accountId: string;
  result:
    | "no_local_billing_state"
    | "checkout_reserved"
    | "checkout_open"
    | "checkout_expired"
    | "subscription_reconciled"
    | "failed";
  outcome: "success" | "failure";
  errorCode?: string | null;
  requestId?: string | null;
}): Promise<void> {
  await getDb().insert(auditEvents).values({
    id: newId(),
    accountId: input.accountId,
    actorType: "account",
    actorAccountId: input.accountId,
    action: "billing.reconciliation_checked",
    targetType: "account",
    targetId: input.accountId,
    outcome: input.outcome,
    requestId: input.requestId ?? null,
    metadata: {
      provider: PROVIDER,
      result: input.result,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    },
  });
}

export type BillingEventReceipt = {
  event: BillingEventRecord;
  duplicate: boolean;
  integrityMatches: boolean;
};

/**
 * Persist only the event envelope and a digest of the raw body. The webhook
 * body itself is intentionally never stored.
 */
export async function receiveBillingEvent(input: {
  providerEventId: string;
  providerEventType: string;
  payloadSha256: string;
  eventOccurredAt: Date;
}): Promise<BillingEventReceipt> {
  const db = getDb();
  const id = newId();
  await db
    .insert(billingEvents)
    .values({
      id,
      provider: PROVIDER,
      providerEventId: input.providerEventId,
      providerEventType: input.providerEventType,
      status: "received",
      payloadSha256: input.payloadSha256,
      eventOccurredAt: input.eventOccurredAt,
    })
    .onConflictDoNothing();

  const [event] = await db
    .select()
    .from(billingEvents)
    .where(
      and(
        eq(billingEvents.provider, PROVIDER),
        eq(billingEvents.providerEventId, input.providerEventId),
      ),
    )
    .limit(1);
  if (!event) {
    throw new BillingRepositoryError(
      "billing_event_receipt_failed",
      "The billing event could not be durably recorded.",
    );
  }

  return {
    event,
    duplicate: event.id !== id,
    integrityMatches:
      event.payloadSha256 === input.payloadSha256 &&
      event.providerEventType === input.providerEventType,
  };
}

export async function markBillingEventProcessing(
  eventId: string,
): Promise<BillingEventClaim | null> {
  const db = getDb();
  const now = new Date();
  const leaseToken = newId();
  const leaseExpiresAt = new Date(now.getTime() + BILLING_EVENT_LEASE_MS);
  const claimed = await db
    .update(billingEvents)
    .set({
      status: "processing",
      processedAt: null,
      leaseToken,
      leaseExpiresAt,
      lastAttemptAt: now,
      processingAttempts: sql`${billingEvents.processingAttempts} + 1`,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(billingEvents.id, eventId),
        or(
          inArray(billingEvents.status, ["received", "failed"]),
          and(
            eq(billingEvents.status, "processing"),
            or(
              isNull(billingEvents.leaseToken),
              isNull(billingEvents.leaseExpiresAt),
              lt(billingEvents.leaseExpiresAt, now),
            ),
          ),
        ),
      ),
    )
    .returning({ id: billingEvents.id });
  return claimed.length === 1
    ? { eventId, leaseToken, leaseExpiresAt }
    : null;
}

export async function ignoreBillingEvent(input: {
  claim: BillingEventClaim;
  reasonCode: string;
  reasonMessage: string;
  providerInvoiceId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.batch([
    billingEventLeaseGuard(db, input.claim, now),
    db
      .update(billingEvents)
      .set({
        status: "ignored",
        processedAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
        providerInvoiceId: input.providerInvoiceId ?? null,
        amountMinor: input.amountMinor ?? null,
        currency: input.currency ?? null,
        lastErrorCode: input.reasonCode,
        lastErrorMessage: input.reasonMessage,
        updatedAt: now,
      })
      .where(
        and(
          eq(billingEvents.id, input.claim.eventId),
          eq(billingEvents.status, "processing"),
          eq(billingEvents.leaseToken, input.claim.leaseToken),
        ),
      ),
  ]);
}

export async function failBillingEvent(input: {
  claim: BillingEventClaim;
  providerEventId: string;
  providerEventType: string;
  errorCode: string;
  errorMessage: string;
  accountId?: string | null;
  providerInvoiceId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  requestId?: string | null;
}): Promise<void> {
  const db = getDb();
  let verifiedAccountId: string | null = null;
  if (input.accountId) {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, input.accountId))
      .limit(1);
    verifiedAccountId = account?.id ?? null;
  }
  const now = new Date();
  await db.batch([
    billingEventLeaseGuard(db, input.claim, now),
    db
      .update(billingEvents)
      .set({
        accountId: verifiedAccountId,
        status: "failed",
        processedAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
        providerInvoiceId: input.providerInvoiceId ?? null,
        amountMinor: input.amountMinor ?? null,
        currency: input.currency ?? null,
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage,
        updatedAt: now,
      })
      .where(
        and(
          eq(billingEvents.id, input.claim.eventId),
          eq(billingEvents.status, "processing"),
          eq(billingEvents.leaseToken, input.claim.leaseToken),
        ),
      ),
    db.insert(auditEvents).values({
      id: newId(),
      accountId: verifiedAccountId,
      actorType: "billing_provider",
      actorReference: input.providerEventId,
      action: "billing.webhook_failed",
      targetType: "billing_event",
      targetId: input.claim.eventId,
      outcome: "failure",
      requestId: input.requestId ?? null,
      metadata: {
        provider: PROVIDER,
        eventType: input.providerEventType,
        errorCode: input.errorCode,
      },
    }),
  ]);
}

/**
 * Apply the provider projection and finish the event in one D1 batch. Before
 * writing, enforce both local-account existence and immutable provider
 * ownership so a customer/subscription can never migrate between tenants due
 * to webhook metadata alone.
 */
export async function applyStripeSubscriptionEvent(input: {
  claim: BillingEventClaim;
  providerEventId: string;
  providerEventType: string;
  projection: StripeSubscriptionProjection;
  projectionGeneration: StripeSubscriptionProjectionGeneration;
  eventOccurredAt: Date;
  checkoutAttempt?: CheckoutAttemptCompletion | null;
  providerInvoiceId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  requestId?: string | null;
}): Promise<void> {
  return applyStripeSubscriptionProjection({
    ...input,
    terminalContext: {
      kind: "event",
      claim: input.claim,
      providerEventId: input.providerEventId,
      providerEventType: input.providerEventType,
    },
  });
}

/**
 * Apply a provider-authoritative projection fetched by an authenticated,
 * tenant-scoped reconciliation request. The same ownership, checkout,
 * optimistic-concurrency, and pre-retrieval generation fences used by signed
 * webhooks remain mandatory.
 */
export async function applyStripeSubscriptionReconciliation(input: {
  claim: BillingReconciliationClaim;
  operationLease: BillingAccountOperationLeaseClaim;
  projection: StripeSubscriptionProjection;
  projectionGeneration: StripeSubscriptionProjectionGeneration;
  reconciledAt: Date;
  checkoutAttempt?: CheckoutAttemptCompletion | null;
  requestId?: string | null;
}): Promise<void> {
  if (input.claim.accountId !== input.projection.accountId) {
    throw new BillingRepositoryError(
      "billing_reconciliation_account_mismatch",
      "The billing reconciliation does not match this account.",
    );
  }
  if (
    !input.operationLease ||
    input.operationLease.operation !== "reconciliation" ||
    input.operationLease.accountId !== input.claim.accountId
  ) {
    throw new BillingRepositoryError(
      "billing_operation_lease_mismatch",
      "The billing operation lease does not match this reconciliation.",
    );
  }
  assertCheckoutReconciliationTarget(input.claim, input.checkoutAttempt);
  return applyStripeSubscriptionProjection({
    projection: input.projection,
    projectionGeneration: input.projectionGeneration,
    eventOccurredAt: input.reconciledAt,
    checkoutAttempt: input.checkoutAttempt,
    requestId: input.requestId,
    terminalContext: {
      kind: "reconciliation",
      claim: input.claim,
      operationLease: input.operationLease,
    },
  });
}

type StripeProjectionTerminalContext =
  | Readonly<{
      kind: "event";
      claim: BillingEventClaim;
      providerEventId: string;
      providerEventType: string;
    }>
  | Readonly<{
      kind: "reconciliation";
      claim: BillingReconciliationClaim;
      operationLease: BillingAccountOperationLeaseClaim;
    }>;

async function applyStripeSubscriptionProjection(input: {
  projection: StripeSubscriptionProjection;
  projectionGeneration: StripeSubscriptionProjectionGeneration;
  eventOccurredAt: Date;
  checkoutAttempt?: CheckoutAttemptCompletion | null;
  providerInvoiceId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  requestId?: string | null;
  terminalContext: StripeProjectionTerminalContext;
}): Promise<void> {
  const db = getDb();
  const projection = input.projection;
  const projectionGeneration = input.projectionGeneration;
  if (!projectionGeneration) {
    throw new BillingRepositoryError(
      "subscription_projection_generation_missing",
      "The provider subscription projection reservation is missing.",
    );
  }
  assertProjectionGeneration(projectionGeneration, projection);
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, projection.accountId))
    .limit(1);
  if (!account) {
    throw new BillingRepositoryError(
      "billing_account_not_found",
      "The billing event does not reference an existing account.",
    );
  }

  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.provider, PROVIDER),
        eq(
          subscriptions.providerSubscriptionId,
          projection.providerSubscriptionId,
        ),
      ),
    )
    .limit(1);
  if (existing && existing.accountId !== projection.accountId) {
    throw new BillingRepositoryError(
      "subscription_ownership_conflict",
      "The provider subscription is already owned by another account.",
    );
  }
  if (
    existing &&
    existing.providerCustomerId !== projection.providerCustomerId
  ) {
    throw new BillingRepositoryError(
      "customer_identity_changed",
      "The provider customer does not match the existing subscription.",
    );
  }

  const [customerOwner] = await db
    .select({
      id: subscriptions.id,
      accountId: subscriptions.accountId,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.provider, PROVIDER),
        eq(
          subscriptions.providerCustomerId,
          projection.providerCustomerId,
        ),
      ),
    )
    .limit(1);
  if (customerOwner && customerOwner.accountId !== projection.accountId) {
    throw new BillingRepositoryError(
      "customer_ownership_conflict",
      "The provider customer is already owned by another account.",
    );
  }

  if (!existing && isOpenStatus(projection.status)) {
    const [otherOpen] = await db
      .select({
        id: subscriptions.id,
        providerSubscriptionId: subscriptions.providerSubscriptionId,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.accountId, projection.accountId),
          eq(subscriptions.provider, PROVIDER),
          inArray(subscriptions.status, OPEN_SUBSCRIPTION_STATUSES),
        ),
      )
      .limit(1);
    if (
      otherOpen &&
      otherOpen.providerSubscriptionId !== projection.providerSubscriptionId
    ) {
      throw new BillingRepositoryError(
        "multiple_open_subscriptions",
        "The account already has a different open subscription.",
      );
    }
  }

  const now = new Date();
  const subscriptionId = existing?.id ?? newId();
  const reconciliationTarget =
    input.terminalContext.kind === "reconciliation"
      ? reconciliationTargetForMutation(
          input.terminalContext.claim,
          subscriptionId,
          input.checkoutAttempt,
        )
      : null;
  const wasPaused = existing?.status === "paused";
  const isPaused = projection.status === "paused";
  const isTerminal = ["canceled", "ended"].includes(projection.status);
  const canceledAt =
    projection.canceledAt ??
    (projection.status === "canceled" ? input.eventOccurredAt : null);
  const endedAt =
    projection.endedAt ??
    canceledAt ??
    (isTerminal ? input.eventOccurredAt : null);
  const cancelRequestedAt = projection.cancelAtPeriodEnd
    ? existing?.cancelRequestedAt ?? input.eventOccurredAt
    : isTerminal
      ? existing?.cancelRequestedAt ?? canceledAt
      : null;
  const pauseStartsAt = isPaused
    ? existing?.pauseStartsAt ?? input.eventOccurredAt
    : existing?.pauseStartsAt ?? null;
  const pauseEndsAt =
    !isPaused && wasPaused
      ? input.eventOccurredAt
      : existing?.pauseEndsAt ?? null;

  const values = {
    accountId: projection.accountId,
    provider: PROVIDER,
    providerCustomerId: projection.providerCustomerId,
    providerSubscriptionId: projection.providerSubscriptionId,
    providerPriceId: projection.providerPriceId,
    productCode: "solo",
    status: projection.status,
    billingInterval: projection.billingInterval,
    currency: projection.currency,
    unitAmountMinor: projection.unitAmountMinor,
    trialStartsAt: projection.trialStartsAt,
    trialEndsAt: projection.trialEndsAt,
    currentPeriodStartsAt: projection.currentPeriodStartsAt,
    currentPeriodEndsAt: projection.currentPeriodEndsAt,
    cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
    cancelRequestedAt,
    canceledAt,
    pauseStartsAt,
    pauseEndsAt,
    endedAt,
    lastProviderSyncAt: now,
    projectionRevision: existing ? existing.projectionRevision + 1 : 1,
    updatedAt: now,
  } as const;

  const subscriptionMutation = existing
    ? db
        .update(subscriptions)
        .set(values)
        .where(
          and(
            eq(subscriptions.id, existing.id),
            eq(subscriptions.accountId, projection.accountId),
            eq(subscriptions.projectionRevision, existing.projectionRevision),
          ),
        )
    : db.insert(subscriptions).values({ id: subscriptionId, ...values });

  const subscriptionConcurrencyEffects = existing
    ? [subscriptionProjectionRevisionGuard(db, existing)]
    : [];

  // This insert is part of the same D1 transaction as the subscription
  // projection. Both uniqueness constraints and the subscription composite FK
  // enforce immutable customer ownership even when two first events race.
  const customerOwnershipMutation = db
    .insert(billingCustomers)
    .values({
      provider: PROVIDER,
      providerCustomerId: projection.providerCustomerId,
      accountId: projection.accountId,
      updatedAt: now,
    })
    .onConflictDoNothing();

  const checkoutAttemptEffects = input.checkoutAttempt
    ? checkoutAttemptCompletionEffects(
        db,
        input.checkoutAttempt,
        projection,
        input.eventOccurredAt,
        now,
      )
    : [];

  const terminalContext = input.terminalContext;
  const reconciliationEffects =
    terminalContext.kind === "reconciliation"
      ? billingReconciliationSuccessEffects(db, {
          claim: terminalContext.claim,
          operationLease: terminalContext.operationLease,
          terminalTarget: reconciliationTarget!,
          projectionGeneration,
          now,
        })
      : null;
  const terminalGuard =
    terminalContext.kind === "event"
      ? generationFencedBillingEventLeaseGuard(
          db,
          terminalContext.claim,
          now,
          projectionGeneration,
        )
      : reconciliationEffects![0];
  const additionalTerminalGuards =
    terminalContext.kind === "reconciliation"
      ? [reconciliationEffects![1]]
      : [];
  const eventCompletionEffects =
    terminalContext.kind === "event"
      ? [
          db
            .update(billingEvents)
            .set({
              accountId: projection.accountId,
              subscriptionId,
              status: "processed",
              providerInvoiceId: input.providerInvoiceId ?? null,
              amountMinor: input.amountMinor ?? null,
              currency: input.currency ?? null,
              processedAt: now,
              leaseToken: null,
              leaseExpiresAt: null,
              lastErrorCode: null,
              lastErrorMessage: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(billingEvents.id, terminalContext.claim.eventId),
                eq(billingEvents.status, "processing"),
                eq(billingEvents.leaseToken, terminalContext.claim.leaseToken),
              ),
            ),
        ]
      : [];
  const webhookRecoveryEffects =
    terminalContext.kind === "event"
      ? billingReconciliationWebhookRecoveryEffects(db, {
          accountId: projection.accountId,
          subscriptionId,
          checkoutAttemptId: input.checkoutAttempt?.attemptId,
          projectionGeneration,
          now,
        })
      : [];
  const reconciliationCompletionEffects = reconciliationEffects
    ? [reconciliationEffects[2]]
    : [];
  const auditMutation =
    terminalContext.kind === "event"
      ? db.insert(auditEvents).values({
          id: newId(),
          accountId: projection.accountId,
          actorType: "billing_provider",
          actorReference: terminalContext.providerEventId,
          action: "billing.subscription_synced",
          targetType: "subscription",
          targetId: subscriptionId,
          outcome: "success",
          requestId: input.requestId ?? null,
          metadata: {
            provider: PROVIDER,
            eventType: terminalContext.providerEventType,
            status: projection.status,
            invoiceRecorded: Boolean(input.providerInvoiceId),
            checkoutAttemptCompleted: Boolean(input.checkoutAttempt),
          },
        })
      : db.insert(auditEvents).values({
          id: newId(),
          accountId: projection.accountId,
          actorType: "account",
          actorAccountId: terminalContext.claim.accountId,
          action: "billing.subscription_reconciled",
          targetType: "subscription",
          targetId: subscriptionId,
          outcome: "success",
          requestId: input.requestId ?? null,
          metadata: {
            provider: PROVIDER,
            status: projection.status,
            checkoutAttemptCompleted: Boolean(input.checkoutAttempt),
          },
        });

  await db.batch([
    terminalGuard,
    ...additionalTerminalGuards,
    customerOwnershipMutation,
    ...checkoutAttemptEffects,
    ...subscriptionConcurrencyEffects,
    subscriptionMutation,
    ...eventCompletionEffects,
    ...webhookRecoveryEffects,
    ...reconciliationCompletionEffects,
    auditMutation,
  ]);
}

function assertCheckoutReconciliationTarget(
  claim: BillingReconciliationClaim,
  checkoutAttempt: CheckoutAttemptCompletion | null | undefined,
): void {
  if (claim.target.kind === "checkout_attempt") {
    if (
      !checkoutAttempt ||
      claim.target.checkoutAttemptId !== checkoutAttempt.attemptId
    ) {
      throw reconciliationTargetMismatch();
    }
    return;
  }
  if (checkoutAttempt) {
    throw reconciliationTargetMismatch();
  }
}

function reconciliationTargetForMutation(
  claim: BillingReconciliationClaim,
  subscriptionId: string,
  checkoutAttempt: CheckoutAttemptCompletion | null | undefined,
): BillingReconciliationTarget {
  const terminalTarget: BillingReconciliationTarget = checkoutAttempt
    ? {
        kind: "checkout_attempt",
        checkoutAttemptId: checkoutAttempt.attemptId,
      }
    : { kind: "subscription", subscriptionId };
  const matches =
    claim.target.kind === "subscription" &&
    terminalTarget.kind === "subscription"
      ? claim.target.subscriptionId === terminalTarget.subscriptionId
      : claim.target.kind === "checkout_attempt" &&
          terminalTarget.kind === "checkout_attempt"
        ? claim.target.checkoutAttemptId === terminalTarget.checkoutAttemptId
        : false;
  if (!matches) {
    throw reconciliationTargetMismatch();
  }
  return terminalTarget;
}

function reconciliationTargetMismatch(): BillingRepositoryError {
  return new BillingRepositoryError(
    "billing_reconciliation_target_mismatch",
    "The billing reconciliation claim does not match the local billing object.",
  );
}

function subscriptionProjectionRevisionGuard(
  db: ReturnType<typeof getDb>,
  existing: SubscriptionRecord,
) {
  return db
    .update(subscriptions)
    .set({
      productCode: sql`case
        when ${subscriptions.accountId} = ${existing.accountId}
          and ${subscriptions.provider} = ${PROVIDER}
          and ${subscriptions.projectionRevision} = ${existing.projectionRevision}
        then ${subscriptions.productCode}
        else null
      end`,
    })
    .where(eq(subscriptions.id, existing.id));
}

function checkoutAttemptCompletionEffects(
  db: ReturnType<typeof getDb>,
  checkoutAttempt: CheckoutAttemptCompletion,
  projection: StripeSubscriptionProjection,
  completedAt: Date,
  now: Date,
) {
  const providerCreatedAt = checkoutAttempt.providerCreatedAt?.getTime() ?? null;
  const completionGuard = db
    .update(billingCheckoutAttempts)
    .set({
      state: sql`case
        when ${billingCheckoutAttempts.accountId} = ${projection.accountId}
          and ${billingCheckoutAttempts.provider} = ${PROVIDER}
          and ${billingCheckoutAttempts.providerPriceId} = ${projection.providerPriceId}
          and ${billingCheckoutAttempts.state} in ('reserved', 'open', 'completed_pending_sync', 'completed')
          and (${billingCheckoutAttempts.providerSessionId} is null
            or ${billingCheckoutAttempts.providerSessionId} = ${checkoutAttempt.providerSessionId})
          and (${billingCheckoutAttempts.providerCustomerId} is null
            or ${billingCheckoutAttempts.providerCustomerId} = ${projection.providerCustomerId})
        then ${billingCheckoutAttempts.state}
        else null
      end`,
    })
    .where(eq(billingCheckoutAttempts.id, checkoutAttempt.attemptId));

  const completionMutation = db
    .update(billingCheckoutAttempts)
    .set({
      state: "completed",
      providerSessionId: checkoutAttempt.providerSessionId,
      providerCustomerId: projection.providerCustomerId,
      providerCreatedAt:
        providerCreatedAt === null
          ? billingCheckoutAttempts.providerCreatedAt
          : sql`coalesce(${billingCheckoutAttempts.providerCreatedAt}, ${providerCreatedAt})`,
      completedAt: sql`coalesce(${billingCheckoutAttempts.completedAt}, ${completedAt.getTime()})`,
      expiredAt: null,
      lastErrorCode: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(billingCheckoutAttempts.id, checkoutAttempt.attemptId),
        eq(billingCheckoutAttempts.accountId, projection.accountId),
        eq(billingCheckoutAttempts.provider, PROVIDER),
        eq(
          billingCheckoutAttempts.providerPriceId,
          projection.providerPriceId,
        ),
        inArray(billingCheckoutAttempts.state, [
          "reserved",
          "open",
          "completed_pending_sync",
          "completed",
        ]),
        or(
          isNull(billingCheckoutAttempts.providerSessionId),
          eq(
            billingCheckoutAttempts.providerSessionId,
            checkoutAttempt.providerSessionId,
          ),
        ),
        or(
          isNull(billingCheckoutAttempts.providerCustomerId),
          eq(
            billingCheckoutAttempts.providerCustomerId,
            projection.providerCustomerId,
          ),
        ),
      ),
    );
  return [completionGuard, completionMutation] as const;
}

/**
 * The first statement in every terminal batch is a fencing assertion. D1
 * rolls the whole batch back when a stale or expired owner makes the required
 * provider event ID null, so no terminal state, projection, or audit effect can
 * escape from a worker that no longer owns the lease.
 */
function billingEventLeaseGuard(
  db: ReturnType<typeof getDb>,
  claim: BillingEventClaim,
  now: Date,
  projectionGeneration?: StripeSubscriptionProjectionGeneration,
) {
  const generationIsCurrent = projectionGeneration
    ? sql`exists (
        select 1
        from ${billingSubscriptionProjectionGenerations}
        where ${billingSubscriptionProjectionGenerations.provider} = ${PROVIDER}
          and ${billingSubscriptionProjectionGenerations.providerSubscriptionId} = ${projectionGeneration.providerSubscriptionId}
          and ${billingSubscriptionProjectionGenerations.generation} = ${projectionGeneration.generation}
      )`
    : sql`1 = 1`;
  return db
    .update(billingEvents)
    .set({
      providerEventId: sql<string>`case
        when ${billingEvents.status} = 'processing'
          and ${billingEvents.leaseToken} = ${claim.leaseToken}
          and ${billingEvents.leaseExpiresAt} > ${now.getTime()}
          and ${generationIsCurrent}
        then ${billingEvents.providerEventId}
        else null
      end`,
    })
    .where(eq(billingEvents.id, claim.eventId));
}

function generationFencedBillingEventLeaseGuard(
  db: ReturnType<typeof getDb>,
  claim: BillingEventClaim,
  now: Date,
  projectionGeneration: StripeSubscriptionProjectionGeneration,
) {
  return billingEventLeaseGuard(db, claim, now, projectionGeneration);
}

function assertProjectionGeneration(
  claim: StripeSubscriptionProjectionGeneration,
  projection: StripeSubscriptionProjection,
): void {
  if (
    claim.providerSubscriptionId !== projection.providerSubscriptionId ||
    !Number.isSafeInteger(claim.generation) ||
    claim.generation < 1
  ) {
    throw new BillingRepositoryError(
      "subscription_projection_generation_invalid",
      "The provider subscription projection reservation is invalid.",
    );
  }
}

function assertProviderSubscriptionIdentifier(value: string): void {
  if (
    value.length < 5 ||
    value.length > 255 ||
    value !== value.trim() ||
    !/^sub_[A-Za-z0-9_]+$/.test(value)
  ) {
    throw new BillingRepositoryError(
      "subscription_projection_generation_invalid",
      "The provider subscription reference is invalid.",
    );
  }
}

function isOpenStatus(status: SubscriptionStatus): boolean {
  return (OPEN_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}
