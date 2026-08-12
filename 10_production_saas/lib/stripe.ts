import { RequestError } from "./http";
import { safeErrorType } from "./log-safety";
import {
  isStripePriceId,
  readBillingPolicy,
  type BillingPolicy,
} from "./billing-policy";
import {
  billingCommercialPolicyMatchesProviderCredential,
  configuredBillingCommercialPolicy,
} from "./billing-commercial-policy";
import { productAccessConfigurationReady } from "./product-access";

const STRIPE_API = "https://api.stripe.com/v1";
const WEBHOOK_TOLERANCE_SECONDS = 300;
const STRIPE_REQUEST_TIMEOUT_MS = 10_000;

type StripeObject = Record<string, unknown> & { id: string };

export type StripeCheckoutSession = StripeObject & {
  url?: string | null;
  mode?: string | null;
  status?: string | null;
  client_reference_id?: string | null;
  customer?: string | StripeObject | null;
  subscription?: string | StripeObject | null;
  metadata?: Record<string, unknown> | null;
  created?: number;
  expires_at?: number;
};

export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: StripeObject };
};

type CheckoutInput = {
  accountId: string;
  attemptId: string;
  idempotencyKey: string;
  priceId: string;
  email: string;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
  expiresAtSeconds: number;
};

export type CheckoutConfiguration = {
  priceId: string;
  sessionLifetimeSeconds: number;
};

export type ValidatedCheckoutSession = {
  id: string;
  status: "open" | "complete" | "expired";
  url: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  createdAt: Date;
  expiresAt: Date;
};

export type ValidatedCustomerSubscription = Readonly<{
  id: string;
  status:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "paused";
}>;

export function billingConfigured(): boolean {
  return Boolean(
      process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.STRIPE_WEBHOOK_SECRET?.trim() &&
      configuredBillingPolicy(),
  );
}

export function checkoutEnabled(): boolean {
  const billingPolicy = configuredBillingPolicy();
  const commercialPolicy = configuredBillingCommercialPolicy();
  const subscriptionAccessReady =
    process.env.INSTRUCTOR_ACCESS_MODE === "subscription_required" &&
    productAccessConfigurationReady({
      INSTRUCTOR_ACCESS_MODE: process.env.INSTRUCTOR_ACCESS_MODE,
      SUBSCRIPTION_ACCESS_STATUSES: process.env.SUBSCRIPTION_ACCESS_STATUSES,
      STRIPE_CHECKOUT_PRICE_ID: process.env.STRIPE_CHECKOUT_PRICE_ID,
      STRIPE_RECOGNIZED_PRICE_IDS:
        process.env.STRIPE_RECOGNIZED_PRICE_IDS,
      SUBSCRIPTION_ENTITLEMENT_PRICE_IDS:
        process.env.SUBSCRIPTION_ENTITLEMENT_PRICE_IDS,
      SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS:
        process.env.SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS,
    });
  return Boolean(
    billingConfigured() &&
      checkoutConfiguration() &&
      billingPolicy &&
      commercialPolicy &&
      commercialPolicy.priceId === billingPolicy.checkoutPriceId &&
      billingCommercialPolicyMatchesProviderCredential(
        commercialPolicy,
        process.env.STRIPE_SECRET_KEY,
      ) &&
      subscriptionAccessReady &&
      process.env.BILLING_CHECKOUT_ENABLED === "true",
  );
}

export function checkoutConfiguration(): CheckoutConfiguration | null {
  const policy = configuredBillingPolicy();
  const normalizedLifetime =
    process.env.STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS?.trim() ?? "";
  if (!policy || !/^[1-9][0-9]*$/.test(normalizedLifetime)) return null;
  const sessionLifetimeSeconds = Number(normalizedLifetime);
  if (
    !Number.isSafeInteger(sessionLifetimeSeconds) ||
    // Reserve one minute above Stripe's provider-side 30-minute minimum so
    // ordinary D1/network latency cannot make a freshly reserved timestamp
    // invalid by the time the create request reaches Stripe.
    sessionLifetimeSeconds < 31 * 60 ||
    sessionLifetimeSeconds > 24 * 60 * 60
  ) {
    return null;
  }
  return { priceId: policy.checkoutPriceId, sessionLifetimeSeconds };
}

export async function createCheckoutSession(input: CheckoutInput) {
  const policy = requiredBillingPolicy();
  if (
    !isStripePriceId(input.priceId) ||
    !policy.recognizedPriceIds.has(input.priceId) ||
    !safeOpaqueIdentifier(input.accountId) ||
    !safeOpaqueIdentifier(input.attemptId) ||
    !safeIdempotencyKey(input.idempotencyKey) ||
    !Number.isSafeInteger(input.expiresAtSeconds)
  ) {
    throw new RequestError(
      503,
      "billing_not_configured",
      "Billing is not available yet. No charge was made.",
    );
  }
  const body = new URLSearchParams({
    mode: "subscription",
    client_reference_id: input.accountId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": "1",
    "subscription_data[metadata][account_id]": input.accountId,
    "subscription_data[metadata][checkout_attempt_id]": input.attemptId,
    "subscription_data[metadata][price_id]": input.priceId,
    "metadata[account_id]": input.accountId,
    "metadata[checkout_attempt_id]": input.attemptId,
    "metadata[price_id]": input.priceId,
    expires_at: String(input.expiresAtSeconds),
    billing_address_collection: "auto",
    allow_promotion_codes: "false",
  });

  if (input.customerId) body.set("customer", input.customerId);
  else body.set("customer_email", input.email);

  return stripeRequest<StripeCheckoutSession>(
    "/checkout/sessions",
    body,
    "POST",
    input.idempotencyKey,
  );
}

export async function retrieveCheckoutSession(sessionId: string) {
  if (!safeOpaqueIdentifier(sessionId)) {
    throw new RequestError(
      502,
      "billing_provider_response_invalid",
      "Billing is temporarily unavailable. No charge was made.",
    );
  }
  return stripeRequest<StripeCheckoutSession>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    undefined,
    "GET",
  );
}

/**
 * Bind a provider response back to the immutable D1 attempt snapshot before
 * any hosted URL is returned. Price is asserted through server-issued Stripe
 * metadata here and through the actual subscription item in the webhook.
 */
export function validateCheckoutSessionForAttempt(
  session: StripeCheckoutSession,
  attempt: {
    id: string;
    accountId: string;
    providerPriceId: string;
    providerCustomerId: string | null;
    providerExpiresAt: Date;
    providerSessionId?: string | null;
  },
): ValidatedCheckoutSession {
  const metadata = objectValue(session.metadata);
  const sessionCustomerId = objectId(session.customer);
  const sessionSubscriptionId = objectId(session.subscription);
  const created = session.created;
  const expiresAt = session.expires_at;
  const expectedExpirySeconds = Math.floor(
    attempt.providerExpiresAt.getTime() / 1_000,
  );
  if (
    !safeOpaqueIdentifier(session.id) ||
    (attempt.providerSessionId && session.id !== attempt.providerSessionId) ||
    session.mode !== "subscription" ||
    session.client_reference_id !== attempt.accountId ||
    metadata?.account_id !== attempt.accountId ||
    metadata?.checkout_attempt_id !== attempt.id ||
    metadata?.price_id !== attempt.providerPriceId ||
    (attempt.providerCustomerId !== null &&
      sessionCustomerId !== attempt.providerCustomerId) ||
    (sessionCustomerId !== null &&
      !/^cus_[A-Za-z0-9_]+$/.test(sessionCustomerId)) ||
    (sessionSubscriptionId !== null &&
      !/^sub_[A-Za-z0-9_]+$/.test(sessionSubscriptionId)) ||
    typeof created !== "number" ||
    !Number.isSafeInteger(created) ||
    typeof expiresAt !== "number" ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt !== expectedExpirySeconds ||
    created < 0 ||
    created >= expiresAt ||
    !["open", "complete", "expired"].includes(session.status ?? "") ||
    (session.url !== null &&
      session.url !== undefined &&
      typeof session.url !== "string")
  ) {
    throw new RequestError(
      502,
      "billing_provider_response_invalid",
      "Billing is temporarily unavailable. No charge was made.",
    );
  }

  return {
    id: session.id,
    status: session.status as ValidatedCheckoutSession["status"],
    url: session.url ?? null,
    providerCustomerId: sessionCustomerId,
    providerSubscriptionId: sessionSubscriptionId,
    createdAt: new Date(created * 1_000),
    expiresAt: new Date(expiresAt * 1_000),
  };
}

export async function createBillingPortalSession(input: {
  customerId: string;
  returnUrl: string;
}) {
  return stripeRequest<{ id: string; url: string }>(
    "/billing_portal/sessions",
    new URLSearchParams({
      customer: input.customerId,
      return_url: input.returnUrl,
    }),
    "POST",
    operationKey("portal", input.customerId, 60 * 1_000),
  );
}

export async function retrieveSubscription(subscriptionId: string) {
  return stripeRequest<StripeObject>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    undefined,
    "GET",
  );
}

/**
 * Enumerate all subscriptions for a server-owned customer before Checkout.
 * A truncated or tenant-conflicting response fails closed; callers must never
 * infer eligibility from an incomplete provider page.
 */
export async function retrieveCustomerSubscriptionsForCheckout(input: {
  accountId: string;
  customerId: string;
}): Promise<readonly ValidatedCustomerSubscription[]> {
  if (
    !safeOpaqueIdentifier(input.accountId) ||
    !/^cus_[A-Za-z0-9_]+$/.test(input.customerId)
  ) {
    throw providerResponseInvalid();
  }
  const query = new URLSearchParams({
    customer: input.customerId,
    status: "all",
    limit: "100",
  });
  const payload = await stripeRequest<unknown>(
    `/subscriptions?${query.toString()}`,
    undefined,
    "GET",
  );
  const list = objectValue(payload);
  if (
    list?.object !== "list" ||
    list.has_more !== false ||
    !Array.isArray(list.data) ||
    list.data.length > 100
  ) {
    throw providerResponseInvalid();
  }

  const supportedStatuses = new Set<ValidatedCustomerSubscription["status"]>([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ]);
  const seen = new Set<string>();
  const subscriptions: ValidatedCustomerSubscription[] = [];
  for (const item of list.data) {
    const subscription = objectValue(item);
    const id = subscription?.id;
    const customerId = objectId(subscription?.customer);
    const status = subscription?.status;
    const metadataAccountId = objectValue(subscription?.metadata)?.account_id;
    if (
      typeof id !== "string" ||
      !/^sub_[A-Za-z0-9_]+$/.test(id) ||
      seen.has(id) ||
      customerId !== input.customerId ||
      typeof status !== "string" ||
      !supportedStatuses.has(
        status as ValidatedCustomerSubscription["status"],
      ) ||
      (metadataAccountId !== undefined &&
        metadataAccountId !== input.accountId)
    ) {
      throw providerResponseInvalid();
    }
    seen.add(id);
    subscriptions.push({
      id,
      status: status as ValidatedCustomerSubscription["status"],
    });
  }
  return subscriptions;
}

export async function verifyStripeEvent(
  rawBody: string,
  signatureHeader: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<StripeEvent> {
  if (!signatureHeader) {
    throw new RequestError(400, "missing_signature", "Stripe signature is missing.");
  }

  const timestamp = signatureHeader
    .split(",")
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = signatureHeader
    .split(",")
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  const timestampNumber = Number(timestamp);
  if (!timestamp || !Number.isInteger(timestampNumber) || signatures.length === 0) {
    throw new RequestError(400, "invalid_signature", "Stripe signature is invalid.");
  }
  if (Math.abs(nowSeconds - timestampNumber) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new RequestError(400, "stale_signature", "Stripe signature timestamp is outside the allowed window.");
  }

  const expected = await hmacHex(
    requiredEnv("STRIPE_WEBHOOK_SECRET"),
    `${timestamp}.${rawBody}`,
  );
  const matched = signatures.some((signature) => timingSafeEqual(signature, expected));
  if (!matched) {
    throw new RequestError(400, "invalid_signature", "Stripe signature is invalid.");
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new RequestError(400, "invalid_event", "Stripe event body is invalid.");
  }
  if (!isStripeEvent(event)) {
    throw new RequestError(400, "invalid_event", "Stripe event shape is invalid.");
  }
  return event;
}

async function stripeRequest<T>(
  path: string,
  body?: URLSearchParams,
  method: "GET" | "POST" = "POST",
  idempotencyKey?: string,
): Promise<T> {
  const secretKey = requiredEnv("STRIPE_SECRET_KEY");
  let response: Response;
  try {
    response = await fetch(`${STRIPE_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body,
      signal: AbortSignal.timeout(STRIPE_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("Stripe API request did not complete", {
      errorType: safeErrorType(error),
    });
    throw new RequestError(
      502,
      "billing_provider_error",
      "Billing is temporarily unavailable. No charge was made.",
    );
  }

  let payload: {
    error?: { message?: string; code?: string };
  } & T;
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new RequestError(
      502,
      "billing_provider_response_invalid",
      "Billing is temporarily unavailable. No charge was made.",
    );
  }
  if (!response.ok) {
    console.error("Stripe API request failed", {
      status: response.status,
      providerCodePresent: typeof payload.error?.code === "string",
    });
    throw new RequestError(
      502,
      "billing_provider_error",
      "Billing is temporarily unavailable. No charge was made.",
    );
  }
  return payload;
}

function operationKey(
  kind: "portal",
  subject: string,
  bucketMilliseconds: number,
): string {
  const bucket = Math.floor(Date.now() / bucketMilliseconds);
  return `roadmap-${kind}-${subject.slice(0, 96)}-${bucket}`;
}

function safeOpaqueIdentifier(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 255 &&
    !/[\u0000-\u0020\u007f]/.test(value)
  );
}

function safeIdempotencyKey(value: string): boolean {
  return safeOpaqueIdentifier(value) && value.length <= 255;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  const id = objectValue(value)?.id;
  return typeof id === "string" ? id : null;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new RequestError(
      503,
      "billing_not_configured",
      "Billing is not available yet. No charge was made.",
    );
  }
  return value;
}

function providerResponseInvalid(): RequestError {
  return new RequestError(
    502,
    "billing_provider_response_invalid",
    "Billing is temporarily unavailable. No charge was made.",
  );
}

export function configuredBillingPolicy(): BillingPolicy | null {
  return readBillingPolicy({
    STRIPE_CHECKOUT_PRICE_ID: process.env.STRIPE_CHECKOUT_PRICE_ID,
    STRIPE_RECOGNIZED_PRICE_IDS: process.env.STRIPE_RECOGNIZED_PRICE_IDS,
    SUBSCRIPTION_ENTITLEMENT_PRICE_IDS:
      process.env.SUBSCRIPTION_ENTITLEMENT_PRICE_IDS,
    SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS:
      process.env.SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS,
  });
}

function requiredBillingPolicy(): BillingPolicy {
  const policy = configuredBillingPolicy();
  if (!policy) {
    throw new RequestError(
      503,
      "billing_not_configured",
      "Billing is not available yet. No charge was made.",
    );
  }
  return policy;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function isStripeEvent(value: unknown): value is StripeEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StripeEvent>;
  return Boolean(
    typeof candidate.id === "string" &&
      typeof candidate.type === "string" &&
      typeof candidate.created === "number" &&
      candidate.data &&
      typeof candidate.data === "object" &&
      candidate.data.object &&
      typeof candidate.data.object === "object" &&
      typeof candidate.data.object.id === "string",
  );
}
