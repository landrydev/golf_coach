import {
  isStripePriceId,
  readBillingPolicy,
} from "@/lib/billing-policy";
import {
  billingCommercialPolicyMatchesPrice,
  configuredBillingCommercialPolicy,
} from "@/lib/billing-commercial-policy";
import type {
  StripeSubscriptionProjection,
  SubscriptionStatus,
} from "@/lib/billing-repository";

type JsonObject = Record<string, unknown>;

export class StripeSubscriptionProjectionError extends Error {
  constructor(
    public readonly code: string,
    public readonly safeMessage: string,
  ) {
    super(safeMessage);
    this.name = "StripeSubscriptionProjectionError";
  }
}

export function parseStripeSubscriptionForReconciliation(input: {
  subscription: JsonObject;
  accountId: string;
  expectedSubscriptionId: string;
  expectedCustomerId?: string | null;
  expectedPriceId?: string | null;
  expectedCheckoutAttemptId?: string | null;
}): StripeSubscriptionProjection {
  const metadata = objectValue(input.subscription.metadata);
  if (
    metadata?.account_id !== undefined &&
    metadata.account_id !== input.accountId
  ) {
    throw invalid(
      "account_reference_mismatch",
      "The provider subscription does not match this billing account.",
    );
  }

  const projection = parseStripeSubscriptionProjection(
    input.subscription,
    input.accountId,
  );
  if (projection.providerSubscriptionId !== input.expectedSubscriptionId) {
    throw invalid(
      "subscription_id_mismatch",
      "The provider returned an inconsistent subscription reference.",
    );
  }
  if (
    input.expectedCustomerId &&
    projection.providerCustomerId !== input.expectedCustomerId
  ) {
    throw invalid(
      "customer_id_mismatch",
      "The provider returned an inconsistent customer reference.",
    );
  }
  if (
    input.expectedPriceId &&
    (projection.providerPriceId !== input.expectedPriceId ||
      (metadata?.price_id !== undefined &&
        metadata.price_id !== input.expectedPriceId))
  ) {
    throw invalid(
      "subscription_price_mismatch",
      "The provider subscription Price does not match the local checkout record.",
    );
  }
  if (
    input.expectedCheckoutAttemptId &&
    metadata?.checkout_attempt_id !== input.expectedCheckoutAttemptId
  ) {
    throw invalid(
      "checkout_attempt_reference_mismatch",
      "The provider subscription does not match the local checkout attempt.",
    );
  }
  return projection;
}

export function parseStripeSubscriptionProjection(
  subscription: JsonObject,
  accountId: string,
): StripeSubscriptionProjection {
  const billingPolicy = readBillingPolicy({
    STRIPE_CHECKOUT_PRICE_ID: process.env.STRIPE_CHECKOUT_PRICE_ID,
    STRIPE_RECOGNIZED_PRICE_IDS: process.env.STRIPE_RECOGNIZED_PRICE_IDS,
    SUBSCRIPTION_ENTITLEMENT_PRICE_IDS:
      process.env.SUBSCRIPTION_ENTITLEMENT_PRICE_IDS,
    SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS:
      process.env.SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS,
  });
  if (!billingPolicy) {
    throw invalid(
      "billing_price_not_configured",
      "The billing Price policy is not configured.",
    );
  }

  const itemsContainer = objectValue(subscription.items);
  const items = Array.isArray(itemsContainer?.data)
    ? itemsContainer.data.map(objectValue).filter(isPresent)
    : [];
  if (items.length !== 1) {
    throw invalid(
      "subscription_price_mismatch",
      "The subscription does not contain exactly one recognized SaaS Price.",
    );
  }

  const item = items[0];
  if (item.quantity !== 1) {
    throw invalid(
      "subscription_quantity_unsupported",
      "The subscription must contain exactly one unit of the SaaS Price.",
    );
  }
  const price = objectValue(item.price);
  const providerPriceId = objectId(price);
  if (
    !price ||
    !providerPriceId ||
    !isStripePriceId(providerPriceId) ||
    !billingPolicy.recognizedPriceIds.has(providerPriceId)
  ) {
    throw invalid(
      "subscription_price_mismatch",
      "The subscription Price is not recognized for provider synchronization.",
    );
  }
  const recurring = objectValue(price.recurring);
  const interval = stringValue(recurring?.interval);
  if (interval !== "month" && interval !== "year") {
    throw invalid(
      "subscription_interval_unsupported",
      "The configured subscription interval is unsupported.",
    );
  }
  const currency =
    currencyValue(price.currency) ?? currencyValue(subscription.currency);
  const unitAmountMinor = minorAmount(price.unit_amount);
  const commercialPolicy = configuredBillingCommercialPolicy();
  if (
    commercialPolicy &&
    commercialPolicy.priceId === billingPolicy.checkoutPriceId &&
    providerPriceId === billingPolicy.checkoutPriceId &&
    !billingCommercialPolicyMatchesPrice({
      policy: commercialPolicy,
      priceId: providerPriceId,
      currency,
      amountMinor: unitAmountMinor,
      billingInterval: interval,
    })
  ) {
    throw invalid(
      "billing_commercial_policy_mismatch",
      "The provider Price does not match the configured commercial policy.",
    );
  }

  const customerId = objectId(subscription.customer);
  if (!customerId || !/^cus_[A-Za-z0-9_]+$/.test(customerId)) {
    throw invalid(
      "subscription_customer_missing",
      "The subscription customer reference is unavailable.",
    );
  }
  const subscriptionId = safeIdentifier(subscription.id);
  if (!subscriptionId || !/^sub_[A-Za-z0-9_]+$/.test(subscriptionId)) {
    throw invalid(
      "subscription_id_missing",
      "The subscription reference is unavailable.",
    );
  }

  return {
    accountId,
    providerCustomerId: customerId,
    providerSubscriptionId: subscriptionId,
    providerPriceId,
    status: mapSubscriptionStatus(subscription.status),
    billingInterval: interval,
    currency,
    unitAmountMinor,
    trialStartsAt: optionalSecondsToDate(subscription.trial_start),
    trialEndsAt: optionalSecondsToDate(subscription.trial_end),
    currentPeriodStartsAt: optionalSecondsToDate(
      item.current_period_start ?? subscription.current_period_start,
    ),
    currentPeriodEndsAt: optionalSecondsToDate(
      item.current_period_end ?? subscription.current_period_end,
    ),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    canceledAt: optionalSecondsToDate(subscription.canceled_at),
    endedAt: optionalSecondsToDate(subscription.ended_at),
  };
}

function mapSubscriptionStatus(value: unknown): SubscriptionStatus {
  switch (value) {
    case "incomplete":
    case "trialing":
    case "active":
    case "past_due":
    case "paused":
    case "canceled":
    case "unpaid":
      return value;
    case "incomplete_expired":
      return "ended";
    default:
      throw invalid(
        "subscription_status_unsupported",
        "The provider returned an unsupported subscription status.",
      );
  }
}

function objectValue(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function objectId(value: unknown): string | null {
  if (typeof value === "string") return safeIdentifier(value);
  return safeIdentifier(objectValue(value)?.id);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeIdentifier(value: unknown, maxLength = 255): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u0020\u007f]/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function currencyValue(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z]{3}$/.test(value)
    ? value.toUpperCase()
    : null;
}

function minorAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function optionalSecondsToDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 8_640_000_000_000
  ) {
    throw invalid(
      "subscription_timestamp_invalid",
      "The provider returned an invalid subscription timestamp.",
    );
  }
  return new Date(value * 1_000);
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function invalid(code: string, message: string) {
  return new StripeSubscriptionProjectionError(code, message);
}
