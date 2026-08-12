export type BillingCommercialPolicy = Readonly<{
  version: string;
  approvalReference: string;
  providerMode: "test" | "live";
  priceId: string;
  currency: "CAD";
  amountMinor: number;
  billingInterval: "month" | "year";
  trialTerms: string;
  cancellationTerms: string;
  pauseResumeTerms: string;
  taxTerms: string;
  refundTerms: string;
  failedPaymentTerms: string;
  dataAfterEndTerms: string;
  supportContact: string;
}>;

const EXACT_KEYS = [
  "version",
  "approvalReference",
  "providerMode",
  "priceId",
  "currency",
  "amountMinor",
  "billingInterval",
  "trialTerms",
  "cancellationTerms",
  "pauseResumeTerms",
  "taxTerms",
  "refundTerms",
  "failedPaymentTerms",
  "dataAfterEndTerms",
  "supportContact",
] as const;

const POLICY_TEXT_KEYS = [
  "approvalReference",
  "trialTerms",
  "cancellationTerms",
  "pauseResumeTerms",
  "taxTerms",
  "refundTerms",
  "failedPaymentTerms",
  "dataAfterEndTerms",
  "supportContact",
] as const;

const MAX_AMOUNT_MINOR = 100_000_000;

/**
 * Parse the owner-supplied commercial decision without defaults. The exact
 * amount and consequences are deliberately configuration, not application
 * recommendations. Missing, partial, padded, or extended shapes fail closed.
 */
export function readBillingCommercialPolicy(
  serialized: string | undefined,
): BillingCommercialPolicy | null {
  if (!serialized?.trim() || serialized !== serialized.trim()) return null;

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!isExactObject(value, EXACT_KEYS)) return null;

  if (
    !exactIdentifier(value.version, 1, 80) ||
    !exactIdentifier(value.priceId, 7, 126) ||
    !/^price_[A-Za-z0-9_]{1,120}$/.test(value.priceId) ||
    !["test", "live"].includes(String(value.providerMode)) ||
    value.currency !== "CAD" ||
    !Number.isSafeInteger(value.amountMinor) ||
    (value.amountMinor as number) < 1 ||
    (value.amountMinor as number) > MAX_AMOUNT_MINOR ||
    !["month", "year"].includes(String(value.billingInterval)) ||
    POLICY_TEXT_KEYS.some((key) => !exactDisplayText(value[key], 1, 500))
  ) {
    return null;
  }

  return Object.freeze({
    version: value.version,
    approvalReference: value.approvalReference,
    providerMode: value.providerMode,
    priceId: value.priceId,
    currency: value.currency,
    amountMinor: value.amountMinor,
    billingInterval: value.billingInterval,
    trialTerms: value.trialTerms,
    cancellationTerms: value.cancellationTerms,
    pauseResumeTerms: value.pauseResumeTerms,
    taxTerms: value.taxTerms,
    refundTerms: value.refundTerms,
    failedPaymentTerms: value.failedPaymentTerms,
    dataAfterEndTerms: value.dataAfterEndTerms,
    supportContact: value.supportContact,
  } as BillingCommercialPolicy);
}

export function configuredBillingCommercialPolicy(): BillingCommercialPolicy | null {
  return readBillingCommercialPolicy(
    process.env.BILLING_COMMERCIAL_POLICY_JSON,
  );
}

export function billingCommercialPolicyConfigurationReady(
  serialized: string | undefined,
): boolean {
  return readBillingCommercialPolicy(serialized) !== null;
}

export function billingCommercialPolicyMatchesPrice(input: {
  policy: BillingCommercialPolicy;
  priceId: string;
  currency: string | null;
  amountMinor: number | null;
  billingInterval: "month" | "year";
}): boolean {
  return (
    input.priceId === input.policy.priceId &&
    input.currency?.toUpperCase() === input.policy.currency &&
    input.amountMinor === input.policy.amountMinor &&
    input.billingInterval === input.policy.billingInterval
  );
}

export function billingCommercialPolicyMatchesProviderCredential(
  policy: BillingCommercialPolicy,
  secretKey: string | undefined,
): boolean {
  const value = secretKey?.trim() ?? "";
  if (!value || value !== secretKey) return false;
  return policy.providerMode === "test"
    ? /^(?:sk|rk)_test_[A-Za-z0-9_]+$/.test(value)
    : /^(?:sk|rk)_live_[A-Za-z0-9_]+$/.test(value);
}

function isExactObject<K extends string>(
  value: unknown,
  keys: readonly K[],
): value is Record<K, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)) &&
    actual.every((key) => (keys as readonly string[]).includes(key))
  );
}

function exactIdentifier(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function exactDisplayText(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}
