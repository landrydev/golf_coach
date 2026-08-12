const COACH_CONTACT_SUBJECT = "Question about my Roadmap coaching plan";

const LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?$/i;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * Accepts a conservative, printable-ASCII email subset suitable for a mailto
 * path. URI delimiters, percent escapes, quoted local parts, controls, and
 * Unicode lookalikes are intentionally excluded.
 */
export function isSafeMailtoAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 254) return false;
  if (!/^[\x21-\x7e]+$/.test(value)) return false;

  const separator = value.indexOf("@");
  if (separator <= 0 || separator !== value.lastIndexOf("@")) return false;

  const localPart = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  if (
    localPart.length > 64 ||
    !LOCAL_PART_PATTERN.test(localPart) ||
    localPart.includes("..")
  ) {
    return false;
  }

  if (domain.length > 253) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => DOMAIN_LABEL_PATTERN.test(label));
}

/**
 * Builds the only coach-contact mailto shape Roadmap emits. The address must
 * already be structurally safe and the subject is fixed, never user supplied.
 */
export function buildCoachContactMailtoUri(
  address: string | null | undefined,
): string | null {
  if (!isSafeMailtoAddress(address)) return null;
  return `mailto:${address}?subject=${encodeURIComponent(COACH_CONTACT_SUBJECT)}`;
}
