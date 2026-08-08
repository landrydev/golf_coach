export type BillingPolicyEnvironment = {
  STRIPE_CHECKOUT_PRICE_ID?: string;
  STRIPE_RECOGNIZED_PRICE_IDS?: string;
  SUBSCRIPTION_ENTITLEMENT_PRICE_IDS?: string;
  SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS?: string;
};

export type BillingPolicy = {
  checkoutPriceId: string;
  recognizedPriceIds: ReadonlySet<string>;
  entitlementPriceIds: ReadonlySet<string>;
  maxProjectionAgeSeconds: number;
};

const MAX_PRICE_IDS = 64;
const MAX_PROJECTION_AGE_SECONDS = 31_536_000;

/**
 * Parse the shared billing policy without operational defaults. A partially
 * configured or internally inconsistent policy is unavailable rather than
 * silently broadening checkout or product access.
 */
export function readBillingPolicy(
  environment: BillingPolicyEnvironment,
): BillingPolicy | null {
  const checkoutPriceId = environment.STRIPE_CHECKOUT_PRICE_ID?.trim() ?? "";
  const recognizedPriceIds = parsePriceIdList(
    environment.STRIPE_RECOGNIZED_PRICE_IDS,
  );
  const entitlementPriceIds = parsePriceIdList(
    environment.SUBSCRIPTION_ENTITLEMENT_PRICE_IDS,
  );
  const maxProjectionAgeSeconds = parseProjectionAgeSeconds(
    environment.SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS,
  );

  if (
    !isStripePriceId(checkoutPriceId) ||
    !recognizedPriceIds ||
    !entitlementPriceIds ||
    maxProjectionAgeSeconds === null ||
    !recognizedPriceIds.has(checkoutPriceId) ||
    !entitlementPriceIds.has(checkoutPriceId) ||
    [...entitlementPriceIds].some(
      (priceId) => !recognizedPriceIds.has(priceId),
    )
  ) {
    return null;
  }

  return {
    checkoutPriceId,
    recognizedPriceIds,
    entitlementPriceIds,
    maxProjectionAgeSeconds,
  };
}

export function billingPolicyConfigurationReady(
  environment: BillingPolicyEnvironment,
): boolean {
  return readBillingPolicy(environment) !== null;
}

export function isStripePriceId(value: string): boolean {
  return /^price_[A-Za-z0-9_]{1,120}$/.test(value);
}

function parsePriceIdList(
  value: string | undefined,
): ReadonlySet<string> | null {
  if (!value?.trim()) return null;
  const priceIds = value.split(",").map((item) => item.trim());
  if (
    priceIds.length === 0 ||
    priceIds.length > MAX_PRICE_IDS ||
    priceIds.some((priceId) => !isStripePriceId(priceId)) ||
    new Set(priceIds).size !== priceIds.length
  ) {
    return null;
  }
  return new Set(priceIds);
}

function parseProjectionAgeSeconds(value: string | undefined): number | null {
  const normalized = value?.trim() ?? "";
  if (!/^[1-9][0-9]*$/.test(normalized)) return null;
  const seconds = Number(normalized);
  return Number.isSafeInteger(seconds) && seconds <= MAX_PROJECTION_AGE_SECONDS
    ? seconds
    : null;
}
