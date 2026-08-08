import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  auditEvents,
  billingEvents,
  subscriptions,
} from "@/db/schema";
import { newId } from "@/lib/tokens";

const PROVIDER = "stripe";
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

export async function markBillingEventProcessing(eventId: string): Promise<void> {
  const db = getDb();
  await db
    .update(billingEvents)
    .set({
      status: "processing",
      processingAttempts: sql`${billingEvents.processingAttempts} + 1`,
      lastErrorCode: null,
      lastErrorMessage: null,
    })
    .where(eq(billingEvents.id, eventId));
}

export async function ignoreBillingEvent(input: {
  eventId: string;
  reasonCode: string;
  reasonMessage: string;
  providerInvoiceId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
}): Promise<void> {
  const db = getDb();
  await db
    .update(billingEvents)
    .set({
      status: "ignored",
      processedAt: new Date(),
      providerInvoiceId: input.providerInvoiceId ?? null,
      amountMinor: input.amountMinor ?? null,
      currency: input.currency ?? null,
      lastErrorCode: input.reasonCode,
      lastErrorMessage: input.reasonMessage,
    })
    .where(eq(billingEvents.id, input.eventId));
}

export async function failBillingEvent(input: {
  eventId: string;
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
  const now = new Date();
  let verifiedAccountId: string | null = null;
  if (input.accountId) {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, input.accountId))
      .limit(1);
    verifiedAccountId = account?.id ?? null;
  }
  await db.batch([
    db
      .update(billingEvents)
      .set({
        accountId: verifiedAccountId,
        status: "failed",
        processedAt: now,
        providerInvoiceId: input.providerInvoiceId ?? null,
        amountMinor: input.amountMinor ?? null,
        currency: input.currency ?? null,
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage,
      })
      .where(eq(billingEvents.id, input.eventId)),
    db.insert(auditEvents).values({
      id: newId(),
      accountId: verifiedAccountId,
      actorType: "billing_provider",
      actorReference: input.providerEventId,
      action: "billing.webhook_failed",
      targetType: "billing_event",
      targetId: input.eventId,
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
  eventId: string;
  providerEventId: string;
  providerEventType: string;
  projection: StripeSubscriptionProjection;
  eventOccurredAt: Date;
  providerInvoiceId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  requestId?: string | null;
}): Promise<void> {
  const db = getDb();
  const projection = input.projection;
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
          ),
        )
    : db.insert(subscriptions).values({ id: subscriptionId, ...values });

  await db.batch([
    subscriptionMutation,
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
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .where(eq(billingEvents.id, input.eventId)),
    db.insert(auditEvents).values({
      id: newId(),
      accountId: projection.accountId,
      actorType: "billing_provider",
      actorReference: input.providerEventId,
      action: "billing.subscription_synced",
      targetType: "subscription",
      targetId: subscriptionId,
      outcome: "success",
      requestId: input.requestId ?? null,
      metadata: {
        provider: PROVIDER,
        eventType: input.providerEventType,
        status: projection.status,
        invoiceRecorded: Boolean(input.providerInvoiceId),
      },
    }),
  ]);
}

function isOpenStatus(status: SubscriptionStatus): boolean {
  return (OPEN_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}
