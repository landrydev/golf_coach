import {
  applyStripeSubscriptionEvent,
  BillingRepositoryError,
  failBillingEvent,
  ignoreBillingEvent,
  markBillingEventProcessing,
  receiveBillingEvent,
  type BillingEventRecord,
  type StripeSubscriptionProjection,
  type SubscriptionStatus,
} from "@/lib/billing-repository";
import { errorResponse, RequestError } from "@/lib/http";
import {
  retrieveSubscription,
  verifyStripeEvent,
  type StripeEvent,
} from "@/lib/stripe";
import { requestId } from "../_shared";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const SUPPORTED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

type JsonObject = Record<string, unknown>;
type InvoiceSummary = {
  providerInvoiceId: string | null;
  amountMinor: number | null;
  currency: string | null;
};
type ResolvedEvent =
  | {
      disposition: "process";
      projection: StripeSubscriptionProjection;
      accountId: string;
      invoice: InvoiceSummary;
    }
  | {
      disposition: "ignore";
      reasonCode: string;
      reasonMessage: string;
      invoice: InvoiceSummary;
    };

class WebhookProcessingError extends Error {
  constructor(
    public readonly code: string,
    public readonly safeMessage: string,
  ) {
    super(safeMessage);
    this.name = "WebhookProcessingError";
  }
}

export async function POST(request: Request) {
  let event: StripeEvent | null = null;
  let receipt: BillingEventRecord | null = null;
  let accountId: string | null = null;
  let invoice: InvoiceSummary = emptyInvoiceSummary();
  const currentRequestId = requestId(request);

  try {
    const raw = await readRawWebhook(request);
    event = await verifyStripeEvent(
      raw.body,
      request.headers.get("stripe-signature"),
    );
    validateEventEnvelope(event);

    const received = await receiveBillingEvent({
      providerEventId: event.id,
      providerEventType: event.type,
      payloadSha256: raw.sha256,
      eventOccurredAt: secondsToDate(event.created, "event_created_invalid"),
    });
    if (!received.integrityMatches) {
      return webhookError(
        409,
        "event_integrity_conflict",
        "A billing event with this identifier was already received with different content.",
      );
    }
    receipt = received.event;

    if (
      received.duplicate &&
      ["processed", "ignored"].includes(received.event.status)
    ) {
      return acknowledge(received.event.status, true);
    }

    await markBillingEventProcessing(receipt.id);

    if (!SUPPORTED_EVENT_TYPES.has(event.type)) {
      await ignoreBillingEvent({
        eventId: receipt.id,
        reasonCode: "event_type_not_actionable",
        reasonMessage: "The signed event type is not used by this application.",
      });
      return acknowledge("ignored", received.duplicate);
    }

    const resolved = await resolveEvent(event);
    invoice = resolved.invoice;
    if (resolved.disposition === "ignore") {
      await ignoreBillingEvent({
        eventId: receipt.id,
        reasonCode: resolved.reasonCode,
        reasonMessage: resolved.reasonMessage,
        ...resolved.invoice,
      });
      return acknowledge("ignored", received.duplicate);
    }

    accountId = resolved.accountId;
    await applyStripeSubscriptionEvent({
      eventId: receipt.id,
      providerEventId: event.id,
      providerEventType: event.type,
      projection: resolved.projection,
      eventOccurredAt: secondsToDate(event.created, "event_created_invalid"),
      ...resolved.invoice,
      requestId: currentRequestId,
    });
    return acknowledge("processed", received.duplicate);
  } catch (error) {
    if (!receipt || !event) return preReceiptError(error);

    const failure = safeFailure(error);
    try {
      await failBillingEvent({
        eventId: receipt.id,
        providerEventId: event.id,
        providerEventType: event.type,
        errorCode: failure.code,
        errorMessage: failure.message,
        accountId,
        ...invoice,
        requestId: currentRequestId,
      });
    } catch {
      // Deliberately omit the thrown database error: runtime errors can contain
      // statements or bound values. The opaque event ID is enough to reconcile.
      console.error("Stripe webhook failure could not be recorded", {
        providerEventId: event.id,
        providerEventType: event.type,
        errorCode: failure.code,
      });
    }
    console.error("Stripe webhook processing failed", {
      providerEventId: event.id,
      providerEventType: event.type,
      errorCode: failure.code,
    });
    return webhookError(500, failure.code, failure.message);
  }
}

async function resolveEvent(event: StripeEvent): Promise<ResolvedEvent> {
  const source = event.data.object;
  if (event.type === "checkout.session.completed") {
    if (source.mode !== undefined && source.mode !== "subscription") {
      return ignored(
        "checkout_not_subscription",
        "The Checkout event is outside the SaaS subscription flow.",
      );
    }
    const checkoutAccountId = combineAccountReferences([
      stringValue(source.client_reference_id),
      metadataAccountId(source),
    ]);
    const subscriptionId = objectId(source.subscription);
    if (!checkoutAccountId || !subscriptionId) {
      return ignored(
        "checkout_not_owned",
        "The Checkout event has no server-issued account and subscription reference.",
      );
    }

    const subscription = await retrieveSubscription(subscriptionId);
    ensureSameIdentifier(subscriptionId, subscription.id, "subscription_id_mismatch");
    ensureSameOptionalIdentifier(
      objectId(source.customer),
      objectId(subscription.customer),
      "customer_id_mismatch",
    );
    const accountId = requireAccountOwnership(subscription, checkoutAccountId);
    return processed(
      parseSubscriptionProjection(subscription, accountId),
      emptyInvoiceSummary(),
    );
  }

  if (event.type.startsWith("customer.subscription.")) {
    const eventAccountId = metadataAccountId(source);
    const subscription = await retrieveSubscription(source.id);
    ensureSameIdentifier(source.id, subscription.id, "subscription_id_mismatch");
    const accountId = combineAccountReferences([
      eventAccountId,
      metadataAccountId(subscription),
    ]);
    if (!accountId) {
      return ignored(
        "subscription_not_owned",
        "The subscription event has no server-issued account reference.",
      );
    }
    return processed(
      parseSubscriptionProjection(subscription, accountId),
      emptyInvoiceSummary(),
    );
  }

  const summary = invoiceSummary(source, event.type);
  const subscriptionId = invoiceSubscriptionId(source);
  if (!subscriptionId) {
    return ignored(
      "invoice_without_subscription",
      "The invoice is not associated with a subscription.",
      summary,
    );
  }

  const invoiceAccountId = combineAccountReferences([
    metadataAccountId(source),
    invoiceSubscriptionMetadataAccountId(source),
  ]);
  const subscription = await retrieveSubscription(subscriptionId);
  ensureSameIdentifier(subscriptionId, subscription.id, "subscription_id_mismatch");
  ensureSameOptionalIdentifier(
    objectId(source.customer),
    objectId(subscription.customer),
    "customer_id_mismatch",
  );
  const accountId = combineAccountReferences([
    invoiceAccountId,
    metadataAccountId(subscription),
  ]);
  if (!accountId) {
    return ignored(
      "invoice_not_owned",
      "The invoice has no server-issued account reference.",
      summary,
    );
  }
  return processed(parseSubscriptionProjection(subscription, accountId), summary);
}

function parseSubscriptionProjection(
  subscription: JsonObject,
  accountId: string,
): StripeSubscriptionProjection {
  const configuredPriceId = process.env.STRIPE_SOLO_PRICE_ID?.trim();
  if (!configuredPriceId) {
    throw new WebhookProcessingError(
      "billing_price_not_configured",
      "The approved billing price is not configured.",
    );
  }

  const itemsContainer = objectValue(subscription.items);
  const items = Array.isArray(itemsContainer?.data)
    ? itemsContainer.data.map(objectValue).filter(isPresent)
    : [];
  const configuredItems = items.filter(
    (item) => objectId(objectValue(item.price)) === configuredPriceId,
  );
  if (items.length !== 1 || configuredItems.length !== 1) {
    throw new WebhookProcessingError(
      "subscription_price_mismatch",
      "The subscription does not contain the configured SaaS price.",
    );
  }

  const item = configuredItems[0];
  const price = objectValue(item.price);
  if (!price) {
    throw new WebhookProcessingError(
      "subscription_price_missing",
      "The subscription price details are unavailable.",
    );
  }
  const recurring = objectValue(price.recurring);
  const interval = stringValue(recurring?.interval);
  if (interval !== "month" && interval !== "year") {
    throw new WebhookProcessingError(
      "subscription_interval_unsupported",
      "The configured subscription interval is unsupported.",
    );
  }

  const customerId = objectId(subscription.customer);
  if (!customerId) {
    throw new WebhookProcessingError(
      "subscription_customer_missing",
      "The subscription customer reference is unavailable.",
    );
  }
  const subscriptionId = safeIdentifier(subscription.id);
  if (!subscriptionId) {
    throw new WebhookProcessingError(
      "subscription_id_missing",
      "The subscription reference is unavailable.",
    );
  }

  const status = mapSubscriptionStatus(subscription.status);
  const currency = currencyValue(price.currency) ?? currencyValue(subscription.currency);
  const currentPeriodStartsAt = optionalSecondsToDate(
    item.current_period_start ?? subscription.current_period_start,
  );
  const currentPeriodEndsAt = optionalSecondsToDate(
    item.current_period_end ?? subscription.current_period_end,
  );

  return {
    accountId,
    providerCustomerId: customerId,
    providerSubscriptionId: subscriptionId,
    providerPriceId: configuredPriceId,
    status,
    billingInterval: interval,
    currency,
    unitAmountMinor: minorAmount(price.unit_amount),
    trialStartsAt: optionalSecondsToDate(subscription.trial_start),
    trialEndsAt: optionalSecondsToDate(subscription.trial_end),
    currentPeriodStartsAt,
    currentPeriodEndsAt,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    canceledAt: optionalSecondsToDate(subscription.canceled_at),
    endedAt: optionalSecondsToDate(subscription.ended_at),
  };
}

async function readRawWebhook(
  request: Request,
): Promise<{ body: string; sha256: string }> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new RequestError(
      415,
      "unsupported_media_type",
      "Stripe webhooks must use application/json.",
    );
  }
  const contentEncoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    throw new RequestError(
      415,
      "unsupported_content_encoding",
      "Encoded webhook bodies are not supported.",
    );
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength.trim())) {
      throw new RequestError(
        400,
        "invalid_content_length",
        "The webhook Content-Length is invalid.",
      );
    }
    if (Number(declaredLength) > MAX_WEBHOOK_BYTES) {
      throw new RequestError(
        413,
        "payload_too_large",
        "The webhook body is too large.",
      );
    }
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > MAX_WEBHOOK_BYTES) {
          await reader.cancel("webhook_body_too_large").catch(() => undefined);
          throw new RequestError(
            413,
            "payload_too_large",
            "The webhook body is too large.",
          );
        }
        chunks.push(result.value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RequestError(
      400,
      "invalid_body_encoding",
      "The webhook body is not valid UTF-8.",
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { body, sha256 };
}

function validateEventEnvelope(event: StripeEvent): void {
  if (!safeIdentifier(event.id) || !safeEventType(event.type)) {
    throw new RequestError(
      400,
      "invalid_event",
      "Stripe event identifiers are invalid.",
    );
  }
  secondsToDate(event.created, "event_created_invalid");
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
      throw new WebhookProcessingError(
        "subscription_status_unsupported",
        "The provider returned an unsupported subscription status.",
      );
  }
}

function requireAccountOwnership(
  subscription: JsonObject,
  fallbackAccountId: string,
): string {
  const accountId = combineAccountReferences([
    fallbackAccountId,
    metadataAccountId(subscription),
  ]);
  if (!accountId) {
    throw new WebhookProcessingError(
      "account_reference_missing",
      "The billing account reference is unavailable.",
    );
  }
  return accountId;
}

function combineAccountReferences(
  references: Array<string | null>,
): string | null {
  const present = references.filter(isPresent).map(accountIdentifier);
  const unique = [...new Set(present)];
  if (unique.length > 1) {
    throw new WebhookProcessingError(
      "account_reference_mismatch",
      "The billing event contains conflicting account references.",
    );
  }
  return unique[0] ?? null;
}

function accountIdentifier(value: string): string {
  const identifier = safeIdentifier(value, 128);
  if (!identifier) {
    throw new WebhookProcessingError(
      "account_reference_invalid",
      "The billing account reference is invalid.",
    );
  }
  return identifier;
}

function metadataAccountId(value: JsonObject): string | null {
  return stringValue(objectValue(value.metadata)?.account_id);
}

function invoiceSubscriptionMetadataAccountId(invoice: JsonObject): string | null {
  const parent = objectValue(invoice.parent);
  const details = objectValue(parent?.subscription_details);
  return stringValue(objectValue(details?.metadata)?.account_id);
}

function invoiceSubscriptionId(invoice: JsonObject): string | null {
  const legacy = objectId(invoice.subscription);
  if (legacy) return legacy;
  const parent = objectValue(invoice.parent);
  return objectId(objectValue(parent?.subscription_details)?.subscription);
}

function invoiceSummary(invoice: JsonObject, eventType: string): InvoiceSummary {
  return {
    providerInvoiceId: safeIdentifier(invoice.id),
    amountMinor:
      eventType === "invoice.paid"
        ? minorAmount(invoice.amount_paid)
        : minorAmount(invoice.amount_due),
    currency: currencyValue(invoice.currency),
  };
}

function emptyInvoiceSummary(): InvoiceSummary {
  return { providerInvoiceId: null, amountMinor: null, currency: null };
}

function processed(
  projection: StripeSubscriptionProjection,
  invoice: InvoiceSummary,
): ResolvedEvent {
  return {
    disposition: "process",
    projection,
    accountId: projection.accountId,
    invoice,
  };
}

function ignored(
  reasonCode: string,
  reasonMessage: string,
  invoice = emptyInvoiceSummary(),
): ResolvedEvent {
  return { disposition: "ignore", reasonCode, reasonMessage, invoice };
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

function safeEventType(value: string): string | null {
  return value.length <= 255 && /^[a-z0-9_.]+$/.test(value) ? value : null;
}

function ensureSameIdentifier(
  expected: string,
  actual: string,
  code: string,
): void {
  if (expected !== actual) {
    throw new WebhookProcessingError(
      code,
      "The billing provider returned inconsistent object references.",
    );
  }
}

function ensureSameOptionalIdentifier(
  expected: string | null,
  actual: string | null,
  code: string,
): void {
  if (expected && actual && expected !== actual) {
    throw new WebhookProcessingError(
      code,
      "The billing provider returned inconsistent object references.",
    );
  }
}

function currencyValue(value: unknown): string | null {
  if (typeof value !== "string" || !/^[a-zA-Z]{3}$/.test(value)) return null;
  return value.toUpperCase();
}

function minorAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function optionalSecondsToDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number") {
    throw new WebhookProcessingError(
      "subscription_timestamp_invalid",
      "The provider returned an invalid subscription timestamp.",
    );
  }
  return secondsToDate(value, "subscription_timestamp_invalid");
}

function secondsToDate(value: number, code: string): Date {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000) {
    throw new WebhookProcessingError(
      code,
      "The provider returned an invalid event timestamp.",
    );
  }
  return new Date(value * 1_000);
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function acknowledge(disposition: string, duplicate: boolean): Response {
  return Response.json(
    { received: true, disposition, duplicate },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

function webhookError(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function safeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof BillingRepositoryError) {
    return { code: error.code, message: error.safeMessage };
  }
  if (error instanceof WebhookProcessingError) {
    return { code: error.code, message: error.safeMessage };
  }
  if (error instanceof RequestError) {
    const messageByCode: Record<string, string> = {
      billing_not_configured: "Billing provider configuration is unavailable.",
      billing_provider_error: "Billing provider synchronization failed.",
    };
    return {
      code: error.code,
      message:
        messageByCode[error.code] ?? "The billing event could not be processed.",
    };
  }
  return {
    code: "billing_event_processing_failed",
    message: "The billing event could not be processed.",
  };
}

function preReceiptError(error: unknown): Response {
  if (error instanceof RequestError) return errorResponse(error);
  if (error instanceof BillingRepositoryError) {
    console.error("Stripe webhook receipt failed", { errorCode: error.code });
    return webhookError(500, error.code, error.safeMessage);
  }
  if (error instanceof WebhookProcessingError) {
    return webhookError(400, error.code, error.safeMessage);
  }
  console.error("Stripe webhook request failed", {
    errorCode: "billing_webhook_request_failed",
  });
  return webhookError(
    500,
    "billing_webhook_request_failed",
    "The billing event could not be received.",
  );
}
