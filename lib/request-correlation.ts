export const INTERNAL_REQUEST_ID_HEADER = "x-roadmap-request-id";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const localRequestIds = new WeakMap<Request, string>();

/**
 * Returns the Worker-bound request ID, or a safe local fallback when a route
 * is invoked directly by a development or unit-test harness.
 */
export function requestCorrelationId(request: Request): string {
  const trustedValue = request.headers.get(INTERNAL_REQUEST_ID_HEADER);
  if (trustedValue && UUID_V4.test(trustedValue)) {
    return trustedValue.toLowerCase();
  }

  const existing = localRequestIds.get(request);
  if (existing) return existing;

  const requestId = crypto.randomUUID();
  localRequestIds.set(request, requestId);
  return requestId;
}

/**
 * Creates the request passed to the application handler. The boundary always
 * replaces the private correlation header, so a client can never select the
 * identifier consumed by routes or persisted in audit events.
 */
export function withTrustedRequestCorrelation(
  request: Request,
  requestId: string,
): Request {
  const trustedRequestId = safeRequestCorrelationId(requestId);
  const headers = new Headers(request.headers);
  headers.delete("x-request-id");
  headers.set(INTERNAL_REQUEST_ID_HEADER, trustedRequestId);
  return new Request(request, { headers });
}

export function safeRequestCorrelationId(
  value: string | null | undefined,
): string {
  return value && UUID_V4.test(value) ? value.toLowerCase() : crypto.randomUUID();
}
