export const MAX_AUTOMATIC_RECONCILIATION_FAILURES = 8;
export const OPEN_CHECKOUT_RECONCILIATION_INTERVAL_MS = 15 * 60 * 1_000;

const RETRY_BACKOFF_MS = [
  5 * 60 * 1_000,
  15 * 60 * 1_000,
  60 * 60 * 1_000,
  3 * 60 * 60 * 1_000,
  6 * 60 * 60 * 1_000,
  12 * 60 * 60 * 1_000,
  24 * 60 * 60 * 1_000,
] as const;

export function billingReconciliationBackoffMs(
  consecutiveAutomaticFailures: number,
): number | null {
  if (
    !Number.isSafeInteger(consecutiveAutomaticFailures) ||
    consecutiveAutomaticFailures < 1 ||
    consecutiveAutomaticFailures >= MAX_AUTOMATIC_RECONCILIATION_FAILURES
  ) {
    return null;
  }
  return RETRY_BACKOFF_MS[
    Math.min(consecutiveAutomaticFailures - 1, RETRY_BACKOFF_MS.length - 1)
  ];
}
