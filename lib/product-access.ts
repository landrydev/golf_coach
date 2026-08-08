import { subscriptionStatuses } from "@/db/schema";
import {
  isStripePriceId,
  readBillingPolicy,
  type BillingPolicy,
  type BillingPolicyEnvironment,
} from "@/lib/billing-policy";

export const instructorAccessModes = [
  "owner_private",
  "subscription_required",
] as const;

export type InstructorAccessMode = (typeof instructorAccessModes)[number];
export type InstructorAccessScope = "account" | "core";
export type InstructorAccessDecision =
  | "not_applicable"
  | "granted"
  | "authentication_required"
  | "forbidden"
  | "subscription_required"
  | "unavailable";

export type ProductAccessEnvironment = BillingPolicyEnvironment & {
  DB?: D1Database;
  INSTRUCTOR_ACCESS_MODE?: string;
  OWNER_PRIVATE_ACCESS_PEPPER?: string;
  OWNER_PRIVATE_EMAIL_DIGESTS?: string;
  SUBSCRIPTION_ACCESS_STATUSES?: string;
};

type OwnerPrivateConfiguration = {
  mode: "owner_private";
  pepper: string;
  emailDigests: readonly string[];
};

type SubscriptionConfiguration = {
  mode: "subscription_required";
  allowedStatuses: ReadonlySet<string>;
  billingPolicy: BillingPolicy;
};

type ProductAccessConfiguration =
  | OwnerPrivateConfiguration
  | SubscriptionConfiguration;

const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/billing/webhook",
]);

const ACCOUNT_API_PATHS = new Set([
  "/api/profile",
  "/api/data-export",
  "/api/data-requests",
  "/api/billing/checkout",
  "/api/billing/portal",
  "/api/billing/reconcile",
]);

/**
 * Classify at the Worker boundary so a newly added instructor API fails into
 * the protected core scope unless it is deliberately added to the small
 * public or account-control allowlist. Vinext's `.rsc` request form is
 * normalized so client navigation cannot bypass the page policy.
 */
export function instructorAccessScopeForPath(
  rawPathname: string,
): InstructorAccessScope | null {
  const pathname = normalizeApplicationPath(rawPathname);

  if (pathname === "/app" || pathname.startsWith("/app/")) {
    if (
      pathname === "/app/billing" ||
      pathname.startsWith("/app/billing/") ||
      pathname === "/app/settings" ||
      pathname.startsWith("/app/settings/")
    ) {
      return "account";
    }
    return "core";
  }

  if (!pathname.startsWith("/api/")) return null;
  if (PUBLIC_API_PATHS.has(pathname)) return null;
  if (ACCOUNT_API_PATHS.has(pathname)) return "account";
  return "core";
}

export function productAccessConfigurationReady(
  environment: ProductAccessEnvironment,
): boolean {
  return readProductAccessConfiguration(environment) !== null;
}

export async function evaluateInstructorRequestAccess(input: {
  pathname: string;
  authenticatedEmail: string | null;
  environment: ProductAccessEnvironment;
  nowMs?: number;
}): Promise<InstructorAccessDecision> {
  const scope = instructorAccessScopeForPath(input.pathname);
  if (!scope) return "not_applicable";
  if (!input.authenticatedEmail) return "authentication_required";

  const configuration = readProductAccessConfiguration(input.environment);
  if (!configuration) return "unavailable";

  const normalizedEmail = normalizeIdentityEmail(input.authenticatedEmail);
  if (!normalizedEmail) return "forbidden";

  if (configuration.mode === "owner_private") {
    const digest = await hmacSha256Hex(configuration.pepper, normalizedEmail);
    return constantTimeListIncludes(configuration.emailDigests, digest)
      ? "granted"
      : "forbidden";
  }

  if (scope === "account") return "granted";
  if (!input.environment.DB) return "unavailable";

  try {
    const subscription = await input.environment.DB.prepare(
      `select s.status as status,
              s.provider_price_id as providerPriceId,
              s.last_provider_sync_at as lastProviderSyncAt
         from accounts a
         join subscriptions s on s.account_id = a.id
        where a.normalized_email = ?1
          and s.provider = 'stripe'
        order by
          case when s.status in ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'unpaid') then 0 else 1 end,
          s.last_provider_sync_at desc,
          s.updated_at desc
        limit 1`,
    )
      .bind(normalizedEmail)
      .first<{
        status: string;
        providerPriceId: string | null;
        lastProviderSyncAt: number | null;
      }>();

    if (!subscription) return "subscription_required";

    const knownStatuses = new Set<string>(subscriptionStatuses);
    if (!knownStatuses.has(subscription.status)) return "unavailable";
    if (!configuration.allowedStatuses.has(subscription.status)) {
      return "subscription_required";
    }

    const priceId = subscription.providerPriceId;
    if (
      typeof priceId !== "string" ||
      priceId !== priceId.trim() ||
      !isStripePriceId(priceId) ||
      !configuration.billingPolicy.recognizedPriceIds.has(priceId)
    ) {
      return "unavailable";
    }
    if (!configuration.billingPolicy.entitlementPriceIds.has(priceId)) {
      return "subscription_required";
    }

    const nowMs = input.nowMs ?? Date.now();
    const lastProviderSyncAt = subscription.lastProviderSyncAt;
    if (
      !Number.isSafeInteger(nowMs) ||
      typeof lastProviderSyncAt !== "number" ||
      !Number.isSafeInteger(lastProviderSyncAt) ||
      lastProviderSyncAt < 0 ||
      lastProviderSyncAt > nowMs ||
      nowMs - lastProviderSyncAt >
        configuration.billingPolicy.maxProjectionAgeSeconds * 1_000
    ) {
      return "unavailable";
    }

    return "granted";
  } catch {
    return "unavailable";
  }
}

export function productAccessDeniedResponse(
  decision: Exclude<
    InstructorAccessDecision,
    "not_applicable" | "granted"
  >,
  request: Request,
): Response {
  const isApi = normalizeApplicationPath(new URL(request.url).pathname).startsWith(
    "/api/",
  );
  const details =
    decision === "subscription_required"
      ? {
          status: 402,
          code: "subscription_required",
          message: "An eligible subscription is required for this feature.",
          heading: "Subscription required",
        }
      : decision === "authentication_required"
        ? {
            status: 401,
            code: "authentication_required",
            message: "Sign in is required for this feature.",
            heading: "Sign in required",
          }
      : decision === "forbidden"
        ? {
            status: 403,
            code: "product_access_denied",
            message: "Product access is not available for this account.",
            heading: "Access unavailable",
          }
        : {
            status: 503,
            code: "product_access_unavailable",
            message: "Product access is temporarily unavailable.",
            heading: "Access temporarily unavailable",
          };
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };

  if (isApi) {
    return Response.json(
      { error: { code: details.code, message: details.message } },
      { status: details.status, headers },
    );
  }

  const billingLink =
    decision === "subscription_required"
      ? '<p><a href="/app/billing">Review plan and billing</a></p>'
      : "";
  return new Response(
    `<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${details.heading} | Roadmap</title></head><body><main><h1>${details.heading}</h1><p>${details.message}</p>${billingLink}<p><a href="/support">Contact support</a></p></main></body></html>`,
    {
      status: details.status,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

function readProductAccessConfiguration(
  environment: ProductAccessEnvironment,
): ProductAccessConfiguration | null {
  const mode = environment.INSTRUCTOR_ACCESS_MODE?.trim();
  if (mode === "owner_private") {
    const pepper = environment.OWNER_PRIVATE_ACCESS_PEPPER?.trim() ?? "";
    const emailDigests = parseDigestList(
      environment.OWNER_PRIVATE_EMAIL_DIGESTS,
    );
    if (pepper.length < 32 || !emailDigests) return null;
    return { mode, pepper, emailDigests };
  }

  if (mode === "subscription_required") {
    const allowedStatuses = parseSubscriptionStatuses(
      environment.SUBSCRIPTION_ACCESS_STATUSES,
    );
    const billingPolicy = readBillingPolicy(environment);
    if (!allowedStatuses || !billingPolicy) return null;
    return { mode, allowedStatuses, billingPolicy };
  }

  return null;
}

function parseDigestList(value: string | undefined): readonly string[] | null {
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

function parseSubscriptionStatuses(
  value: string | undefined,
): ReadonlySet<string> | null {
  if (!value?.trim()) return null;
  const statuses = value.split(",").map((item) => item.trim());
  const knownStatuses = new Set<string>(subscriptionStatuses);
  if (
    statuses.length === 0 ||
    statuses.some((status) => !knownStatuses.has(status)) ||
    new Set(statuses).size !== statuses.length
  ) {
    return null;
  }
  return new Set(statuses);
}

function normalizeIdentityEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > 254 ||
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
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

export function normalizeApplicationPath(pathname: string): string {
  let normalized = pathname;

  // WHATWG URL keeps percent-encoded path characters in `pathname`, while the
  // application router decodes route segments. Decode repeatedly so the
  // access and privacy boundaries classify the same effective route, including
  // double-encoded unreserved characters. Invalid or ambiguous paths default
  // to a protected API-shaped sentinel rather than falling into public scope.
  for (let pass = 0; pass < 8; pass += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(normalized);
    } catch {
      return "/api/__invalid_path__";
    }
    if (decoded === normalized) break;
    normalized = decoded;
  }
  if (
    /%(?:[0-9a-f]{2})/i.test(normalized) ||
    /[\u0000-\u001f\u007f?#]/.test(normalized)
  ) {
    return "/api/__invalid_path__";
  }

  normalized = normalized.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!normalized.startsWith("/")) return "/api/__invalid_path__";

  if (normalized.endsWith(".rsc")) {
    return normalized.slice(0, -4) || "/";
  }
  return normalized;
}
