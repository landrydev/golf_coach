import { RequestError } from "./http";

const STRIPE_API = "https://api.stripe.com/v1";
const WEBHOOK_TOLERANCE_SECONDS = 300;
const STRIPE_REQUEST_TIMEOUT_MS = 10_000;

type StripeObject = Record<string, unknown> & { id: string };

export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: StripeObject };
};

type CheckoutInput = {
  accountId: string;
  email: string;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export function billingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.STRIPE_WEBHOOK_SECRET?.trim() &&
      process.env.STRIPE_SOLO_PRICE_ID?.trim(),
  );
}

export function checkoutEnabled(): boolean {
  return billingConfigured() && process.env.BILLING_CHECKOUT_ENABLED === "true";
}

export async function createCheckoutSession(input: CheckoutInput) {
  const priceId = requiredEnv("STRIPE_SOLO_PRICE_ID");
  const body = new URLSearchParams({
    mode: "subscription",
    client_reference_id: input.accountId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "subscription_data[metadata][account_id]": input.accountId,
    "metadata[account_id]": input.accountId,
    billing_address_collection: "auto",
    allow_promotion_codes: "false",
  });

  if (input.customerId) body.set("customer", input.customerId);
  else body.set("customer_email", input.email);

  return stripeRequest<{ id: string; url: string }>(
    "/checkout/sessions",
    body,
    "POST",
    operationKey("checkout", input.accountId, 10 * 60 * 1_000),
  );
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
      errorType: error instanceof Error ? error.name : typeof error,
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
      code: payload.error?.code ?? "unknown",
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
  kind: "checkout" | "portal",
  subject: string,
  bucketMilliseconds: number,
): string {
  const bucket = Math.floor(Date.now() / bucketMilliseconds);
  return `roadmap-${kind}-${subject.slice(0, 96)}-${bucket}`;
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
