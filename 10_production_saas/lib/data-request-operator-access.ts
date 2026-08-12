export type DataRequestOperatorAccessEnvironment = {
  DATA_REQUEST_OPERATOR_ACCESS_PEPPER?: string;
  DATA_REQUEST_OPERATOR_EMAIL_DIGESTS?: string;
};

export type DataRequestOperatorAccessDecision =
  | { decision: "granted"; operatorDigest: string }
  | { decision: "forbidden" }
  | { decision: "unavailable" };

export function dataRequestOperatorAccessConfigurationReady(
  environment: DataRequestOperatorAccessEnvironment,
): boolean {
  const pepper = environment.DATA_REQUEST_OPERATOR_ACCESS_PEPPER?.trim() ?? "";
  return (
    pepper.length >= 32 &&
    parseOperatorDigestAllowlist(
      environment.DATA_REQUEST_OPERATOR_EMAIL_DIGESTS,
    ) !== null
  );
}

/**
 * SIWC proves identity; this independent digest allowlist grants the much
 * narrower data-request operator role. Configuration uncertainty is distinct
 * from a known non-member so callers can fail closed with 503 versus 403.
 */
export async function evaluateDataRequestOperatorAccess(input: {
  authenticatedEmail: string;
  environment: DataRequestOperatorAccessEnvironment;
}): Promise<DataRequestOperatorAccessDecision> {
  if (!dataRequestOperatorAccessConfigurationReady(input.environment)) {
    return { decision: "unavailable" };
  }
  const allowedDigests = parseOperatorDigestAllowlist(
    input.environment.DATA_REQUEST_OPERATOR_EMAIL_DIGESTS,
  );
  const pepper = input.environment.DATA_REQUEST_OPERATOR_ACCESS_PEPPER?.trim() ?? "";

  // The readiness check above guarantees both values are valid. Keep this
  // guard so a future parser change still fails closed rather than asserting.
  if (!allowedDigests) return { decision: "unavailable" };

  const normalizedEmail = normalizeOperatorEmail(input.authenticatedEmail);
  if (!normalizedEmail) return { decision: "forbidden" };

  const operatorDigest = await hmacSha256Hex(pepper, normalizedEmail);
  return constantTimeListIncludes(allowedDigests, operatorDigest)
    ? { decision: "granted", operatorDigest }
    : { decision: "forbidden" };
}

function parseOperatorDigestAllowlist(
  value: string | undefined,
): readonly string[] | null {
  if (!value?.trim()) return null;
  const digests = value.split(",").map((item) => item.trim().toLowerCase());
  if (
    digests.length === 0 ||
    digests.some((digest) => !/^[0-9a-f]{64}$/.test(digest)) ||
    new Set(digests).size !== digests.length
  ) {
    return null;
  }
  return digests;
}

function normalizeOperatorEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > 254 ||
    /[^\x21-\x7e]/.test(normalized) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeListIncludes(
  candidates: readonly string[],
  expected: string,
): boolean {
  let matched = 0;
  for (const candidate of candidates) {
    let difference = candidate.length ^ expected.length;
    const length = Math.max(candidate.length, expected.length);
    for (let index = 0; index < length; index += 1) {
      difference |=
        (candidate.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
    }
    matched |= Number(difference === 0);
  }
  return matched === 1;
}
