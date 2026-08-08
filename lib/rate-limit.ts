import { env } from "cloudflare:workers";
import { RequestError } from "./http";

type AbuseLimit = {
  scope:
    | "share_exchange_network"
    | "share_exchange_capability"
    | "share_response_network"
    | "share_response_capability"
    | "plan_publish_account"
    | "share_revoke_account"
    | "billing_checkout_account"
    | "billing_portal_account"
    | "billing_reconcile_account"
    | "data_export_account"
    | "data_request_account"
    | "data_request_operator_network"
    | "data_request_operator_identity";
  maximum: number;
  windowSeconds: number;
};

// These are narrowly scoped security controls, not product/package limits.
// They intentionally allow ordinary retries while containing automated token
// guessing, duplicate expensive work, and hosted-provider session churn.
export const ABUSE_LIMITS = {
  shareExchangeNetwork: limit("share_exchange_network", 30, 60),
  shareExchangeCapability: limit("share_exchange_capability", 12, 5 * 60),
  shareResponseNetwork: limit("share_response_network", 60, 60),
  shareResponseCapability: limit("share_response_capability", 20, 10 * 60),
  planPublishAccount: limit("plan_publish_account", 12, 60 * 60),
  shareRevokeAccount: limit("share_revoke_account", 30, 60 * 60),
  billingCheckoutAccount: limit("billing_checkout_account", 5, 15 * 60),
  billingPortalAccount: limit("billing_portal_account", 10, 15 * 60),
  billingReconcileAccount: limit("billing_reconcile_account", 6, 15 * 60),
  dataExportAccount: limit("data_export_account", 3, 60 * 60),
  dataRequestAccount: limit("data_request_account", 10, 60 * 60),
  dataRequestOperatorNetwork: limit(
    "data_request_operator_network",
    60,
    5 * 60,
  ),
  dataRequestOperatorIdentity: limit(
    "data_request_operator_identity",
    30,
    5 * 60,
  ),
} as const satisfies Record<string, AbuseLimit>;

type CounterRow = { request_count: number };

export async function enforceAbuseLimit(
  rule: AbuseLimit,
  subject: string,
  now = Date.now(),
): Promise<void> {
  if (!subject) {
    throw new Error("A non-empty abuse-limit subject is required.");
  }
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  const windowMs = rule.windowSeconds * 1_000;
  const windowStartedAt = Math.floor(now / windowMs) * windowMs;
  const windowExpiresAt = windowStartedAt + windowMs;
  const subjectKeyHash = await hashSubject(
    rule.scope,
    windowStartedAt,
    subject,
  );

  // D1 executes batch statements as one transaction. The UPSERT itself is a
  // single atomic SQLite statement, so concurrent edge requests cannot pass by
  // racing a read followed by a write. Expired digests are removed eagerly.
  const [, counterResult] = await env.DB.batch<CounterRow>([
    env.DB.prepare(
      "DELETE FROM abuse_rate_limits WHERE window_expires_at <= ?",
    ).bind(now),
    env.DB.prepare(
      `INSERT INTO abuse_rate_limits (
        scope,
        subject_key_hash,
        window_started_at,
        window_expires_at,
        request_count,
        last_request_at
      ) VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT (scope, subject_key_hash, window_started_at)
      DO UPDATE SET
        request_count = min(abuse_rate_limits.request_count + 1, 2147483647),
        last_request_at = excluded.last_request_at
      RETURNING request_count`,
    ).bind(
      rule.scope,
      subjectKeyHash,
      windowStartedAt,
      windowExpiresAt,
      now,
    ),
  ]);

  const requestCount = Number(counterResult.results[0]?.request_count);
  if (!Number.isSafeInteger(requestCount) || requestCount < 1) {
    throw new Error("D1 did not return a valid abuse-limit counter.");
  }

  if (requestCount > rule.maximum) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowExpiresAt - now) / 1_000),
    );
    throw new RequestError(
      429,
      "rate_limit_exceeded",
      "Too many requests. Try again after the indicated delay.",
      {
        "Cache-Control": "private, no-store, max-age=0",
        "Retry-After": String(retryAfterSeconds),
      },
    );
  }
}

export function clientNetworkSubject(request: Request): string {
  const address = request.headers.get("cf-connecting-ip")?.trim().toLowerCase();
  if (address && address.length <= 64 && /^[0-9a-f:.]+$/.test(address)) {
    return address;
  }
  if (process.env.NODE_ENV !== "production") {
    return "local-network-unavailable";
  }
  throw new RequestError(
    503,
    "client_network_unavailable",
    "This request cannot be safely processed right now.",
  );
}

async function hashSubject(
  scope: AbuseLimit["scope"],
  windowStartedAt: number,
  subject: string,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(abuseLimitPepper()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${scope}\u0000${windowStartedAt}\u0000${subject}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function abuseLimitPepper(): string {
  const configured = process.env.ABUSE_LIMIT_PEPPER?.trim();
  if (configured) {
    if (configured.length < 32) {
      throw new Error("ABUSE_LIMIT_PEPPER must contain at least 32 characters.");
    }
    return configured;
  }
  if (process.env.NODE_ENV !== "production") {
    return "roadmap-local-abuse-limit-pepper-not-for-production";
  }
  throw new Error("ABUSE_LIMIT_PEPPER is required in production.");
}

function limit(
  scope: AbuseLimit["scope"],
  maximum: number,
  windowSeconds: number,
): AbuseLimit {
  return { scope, maximum, windowSeconds };
}
