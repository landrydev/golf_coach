import {
  applyStripeSubscriptionEvent,
  BillingRepositoryError,
  failBillingEvent,
  ignoreBillingEvent,
  markBillingEventProcessing,
  receiveBillingEvent,
  reserveStripeSubscriptionProjectionGeneration,
  type BillingEventClaim,
  type BillingEventRecord,
  type StripeSubscriptionProjection,
  type StripeSubscriptionProjectionGeneration,
} from "@/lib/billing-repository";
import { isStripePriceId } from "@/lib/billing-policy";
import {
  CheckoutRepositoryError,
  requireCheckoutAttemptForCompletion,
  resolveCheckoutAttemptForSignedWebhook,
} from "@/lib/checkout-repository";
import { errorResponse, RequestError } from "@/lib/http";
import {
  retrieveSubscription,
  verifyStripeEvent,
  type StripeEvent,
} from "@/lib/stripe";
import {
  parseStripeSubscriptionProjection,
  StripeSubscriptionProjectionError,
} from "@/lib/stripe-subscription";
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
      projectionGeneration: StripeSubscriptionProjectionGeneration;
      accountId: string;
      invoice: InvoiceSummary;
      checkoutAttempt: {
        attemptId: string;
        providerSessionId: string;
        providerCreatedAt: Date | null;
      } | null;
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
    public readonly accountId: string | null = null,
  ) {
    super(safeMessage);
    this.name = "WebhookProcessingError";
  }
}

export async function POST(request: Request) {
  let event: StripeEvent | null = null;
  let receipt: BillingEventRecord | null = null;
  let claim: BillingEventClaim | null = null;
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

    claim = await markBillingEventProcessing(receipt.id);
    if (!claim) {
      // Preserve Stripe's retry path until the owning invocation has completed.
      // A crashed invocation's five-minute lease can then be reclaimed safely.
      return processingInProgress();
    }

    if (!SUPPORTED_EVENT_TYPES.has(event.type)) {
      await ignoreBillingEvent({
        claim,
        reasonCode: "event_type_not_actionable",
        reasonMessage: "The signed event type is not used by this application.",
      });
      return acknowledge("ignored", received.duplicate);
    }

    const resolved = await resolveEvent(event);
    invoice = resolved.invoice;
    if (resolved.disposition === "ignore") {
      await ignoreBillingEvent({
        claim,
        reasonCode: resolved.reasonCode,
        reasonMessage: resolved.reasonMessage,
        ...resolved.invoice,
      });
      return acknowledge("ignored", received.duplicate);
    }

    accountId = resolved.accountId;
    await applyStripeSubscriptionEvent({
      claim,
      providerEventId: event.id,
      providerEventType: event.type,
      projection: resolved.projection,
      projectionGeneration: resolved.projectionGeneration,
      eventOccurredAt: secondsToDate(event.created, "event_created_invalid"),
      checkoutAttempt: resolved.checkoutAttempt,
      ...resolved.invoice,
      requestId: currentRequestId,
    });
    return acknowledge("processed", received.duplicate);
  } catch (error) {
    if (!receipt || !event) return preReceiptError(error);

    if (error instanceof WebhookProcessingError && error.accountId) {
      accountId = error.accountId;
    }
    const failure = safeFailure(error);
    if (claim) {
      try {
        await failBillingEvent({
          claim,
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
        // statements or bound values. Durable billing-event state retains the
        // provider reference needed for reconciliation; runtime logs do not.
        console.error("Stripe webhook failure could not be recorded", {
          errorCode: failure.code,
        });
      }
    }
    console.error("Stripe webhook processing failed", {
      errorCode: failure.code,
    });
    return webhookError(500, failure.code, failure.message);
  }
}

async function resolveEvent(event: StripeEvent): Promise<ResolvedEvent> {
  const source = event.data.object;
  if (event.type === "checkout.session.completed") {
    const lookupAttemptId = checkoutAttemptLookupIdentifier(
      metadataCheckoutAttemptId(source),
    );
    const lookupSessionId = checkoutSessionIdentifier(source.id);
    const localAttempt =
      lookupAttemptId || lookupSessionId
        ? await resolveCheckoutAttemptForSignedWebhook({
            attemptId: lookupAttemptId,
            providerSessionId: lookupSessionId,
          })
        : null;

    // Checkout events outside this application's durable attempt ledger are
    // intentionally acknowledged without making a provider API request. If a
    // local reference exists, every shape/ownership failure below is retryable
    // and associated with that verified local account for reconciliation.
    if (!localAttempt) {
      return ignored(
        "checkout_not_owned",
        "The Checkout event does not reference a local server-issued attempt.",
      );
    }
    if (source.mode !== "subscription" || source.status !== "complete") {
      throw localCheckoutError(
        "checkout_shape_invalid",
        "The local Checkout completion has an invalid mode or status.",
        localAttempt.accountId,
      );
    }
    let checkoutAccountId: string | null;
    let checkoutAttemptId: string | null;
    let checkoutPriceId: string | null;
    try {
      checkoutAccountId = combineAccountReferences([
        stringValue(source.client_reference_id),
        metadataAccountId(source),
      ]);
      checkoutAttemptId = combineCheckoutAttemptReferences([
        metadataCheckoutAttemptId(source),
      ]);
      checkoutPriceId = combineCheckoutPriceReferences([
        metadataPriceId(source),
      ]);
    } catch (error) {
      throw associateLocalCheckoutError(error, localAttempt.accountId);
    }
    const providerSessionId = checkoutSessionIdentifier(source.id);
    const subscriptionId = subscriptionIdentifier(source.subscription);
    if (
      !checkoutAccountId ||
      !checkoutAttemptId ||
      !checkoutPriceId ||
      !providerSessionId ||
      !subscriptionId
    ) {
      throw localCheckoutError(
        "checkout_ownership_metadata_missing",
        "The local Checkout completion has incomplete ownership references.",
        localAttempt.accountId,
      );
    }
    if (
      checkoutAccountId !== localAttempt.accountId ||
      checkoutAttemptId !== localAttempt.id ||
      checkoutPriceId !== localAttempt.providerPriceId ||
      (localAttempt.providerSessionId !== null &&
        providerSessionId !== localAttempt.providerSessionId)
    ) {
      throw localCheckoutError(
        "checkout_local_reference_mismatch",
        "The local Checkout completion does not match its durable attempt.",
        localAttempt.accountId,
      );
    }

    const projectionGeneration =
      await reserveStripeSubscriptionProjectionGeneration(subscriptionId);
    const subscription = await retrieveSubscription(subscriptionId);
    ensureSameIdentifier(subscriptionId, subscription.id, "subscription_id_mismatch");
    ensureSameOptionalIdentifier(
      objectId(source.customer),
      objectId(subscription.customer),
      "customer_id_mismatch",
    );
    const accountId = requireAccountOwnership(subscription, checkoutAccountId);
    const subscriptionAttemptId = combineCheckoutAttemptReferences([
      checkoutAttemptId,
      metadataCheckoutAttemptId(subscription),
    ]);
    const subscriptionPriceId = combineCheckoutPriceReferences([
      checkoutPriceId,
      metadataPriceId(subscription),
    ]);
    const projection = parseStripeSubscriptionProjection(subscription, accountId);
    if (
      !subscriptionAttemptId ||
      !subscriptionPriceId ||
      subscriptionPriceId !== projection.providerPriceId
    ) {
      throw localCheckoutError(
        "checkout_metadata_mismatch",
        "The Checkout and subscription ownership metadata do not match.",
        localAttempt.accountId,
      );
    }
    await requireCheckoutAttemptForCompletion({
      accountId,
      attemptId: subscriptionAttemptId,
      providerSessionId,
      providerCustomerId: projection.providerCustomerId,
      providerPriceId: projection.providerPriceId,
    });
    return processed(
      projection,
      emptyInvoiceSummary(),
      projectionGeneration,
      {
        attemptId: subscriptionAttemptId,
        providerSessionId,
        providerCreatedAt: optionalSecondsToDate(source.created),
      },
    );
  }

  if (event.type.startsWith("customer.subscription.")) {
    const eventAccountId = metadataAccountId(source);
    const subscriptionId = safeIdentifier(source.id);
    if (!subscriptionId) {
      throw new WebhookProcessingError(
        "subscription_id_missing",
        "The subscription reference is unavailable.",
      );
    }
    const projectionGeneration =
      await reserveStripeSubscriptionProjectionGeneration(subscriptionId);
    const subscription = await retrieveSubscription(subscriptionId);
    ensureSameIdentifier(subscriptionId, subscription.id, "subscription_id_mismatch");
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
      parseStripeSubscriptionProjection(subscription, accountId),
      emptyInvoiceSummary(),
      projectionGeneration,
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
  const projectionGeneration =
    await reserveStripeSubscriptionProjectionGeneration(subscriptionId);
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
  return processed(
    parseStripeSubscriptionProjection(subscription, accountId),
    summary,
    projectionGeneration,
  );
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

function combineCheckoutAttemptReferences(
  references: Array<string | null>,
): string | null {
  const present = references.filter(isPresent).map((value) => {
    const identifier = safeIdentifier(value, 128);
    if (!identifier || !/^[A-Za-z0-9_-]+$/.test(identifier)) {
      throw new WebhookProcessingError(
        "checkout_attempt_reference_invalid",
        "The Checkout attempt reference is invalid.",
      );
    }
    return identifier;
  });
  const unique = [...new Set(present)];
  if (unique.length > 1) {
    throw new WebhookProcessingError(
      "checkout_attempt_reference_mismatch",
      "The billing event contains conflicting Checkout attempt references.",
    );
  }
  return unique[0] ?? null;
}

function combineCheckoutPriceReferences(
  references: Array<string | null>,
): string | null {
  const present = references.filter(isPresent);
  if (present.some((priceId) => !isStripePriceId(priceId))) {
    throw new WebhookProcessingError(
      "checkout_price_reference_invalid",
      "The Checkout Price reference is invalid.",
    );
  }
  const unique = [...new Set(present)];
  if (unique.length > 1) {
    throw new WebhookProcessingError(
      "checkout_price_reference_mismatch",
      "The billing event contains conflicting Checkout Price references.",
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

function metadataCheckoutAttemptId(value: JsonObject): string | null {
  return stringValue(objectValue(value.metadata)?.checkout_attempt_id);
}

function metadataPriceId(value: JsonObject): string | null {
  return stringValue(objectValue(value.metadata)?.price_id);
}

function checkoutAttemptLookupIdentifier(value: string | null): string | null {
  const identifier = safeIdentifier(value, 128);
  return identifier && /^[A-Za-z0-9_-]+$/.test(identifier)
    ? identifier
    : null;
}

function checkoutSessionIdentifier(value: unknown): string | null {
  const identifier = safeIdentifier(value);
  return identifier && /^cs_[A-Za-z0-9_]+$/.test(identifier)
    ? identifier
    : null;
}

function subscriptionIdentifier(value: unknown): string | null {
  const identifier = objectId(value);
  return identifier && /^sub_[A-Za-z0-9_]+$/.test(identifier)
    ? identifier
    : null;
}

function localCheckoutError(
  code: string,
  message: string,
  accountId: string,
): WebhookProcessingError {
  return new WebhookProcessingError(code, message, accountId);
}

function associateLocalCheckoutError(
  error: unknown,
  accountId: string,
): unknown {
  if (!(error instanceof WebhookProcessingError)) return error;
  return new WebhookProcessingError(error.code, error.safeMessage, accountId);
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
  projectionGeneration: StripeSubscriptionProjectionGeneration,
  checkoutAttempt: {
    attemptId: string;
    providerSessionId: string;
    providerCreatedAt: Date | null;
  } | null = null,
): ResolvedEvent {
  return {
    disposition: "process",
    projection,
    projectionGeneration,
    accountId: projection.accountId,
    invoice,
    checkoutAttempt,
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

function processingInProgress(): Response {
  return Response.json(
    {
      error: {
        code: "billing_event_processing_in_progress",
        message: "The billing event is already being processed. Retry later.",
      },
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "60",
      },
    },
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
  if (error instanceof CheckoutRepositoryError) {
    return { code: error.code, message: error.safeMessage };
  }
  if (error instanceof WebhookProcessingError) {
    return { code: error.code, message: error.safeMessage };
  }
  if (error instanceof StripeSubscriptionProjectionError) {
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
