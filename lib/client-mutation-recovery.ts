type ClientFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ClientMutationOutcomeUnknownReason =
  | "timeout"
  | "transport"
  | "retryable_response"
  | "redirected_response"
  | "response_too_large"
  | "malformed_success_response";

export const CLIENT_MUTATION_TIMEOUT_MS = 10_000;
export const CLIENT_MUTATION_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

const RETRYABLE_RESPONSE_STATUSES = new Set([408, 425, 429]);

export class ClientMutationOutcomeUnknownError extends Error {
  readonly reason: ClientMutationOutcomeUnknownReason;
  readonly status: number | null;

  constructor(
    reason: ClientMutationOutcomeUnknownReason,
    status: number | null = null,
  ) {
    super("The mutation outcome is unknown.");
    this.name = "ClientMutationOutcomeUnknownError";
    this.reason = reason;
    this.status = status;
  }
}

export class ClientMutationApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "ClientMutationApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Bounds one browser mutation without replaying it. A deadline, transport
 * failure, or retryable response cannot prove whether the server committed, so
 * callers must preserve the user's intent and present an outcome-unknown state.
 */
export async function requestClientMutation(
  input: RequestInfo | URL,
  init: RequestInit,
  options: {
    timeoutMs?: number;
    fetcher?: ClientFetch;
  } = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? CLIENT_MUTATION_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Client mutation timeout must be a positive number.");
  }

  const fetcher = options.fetcher ?? browserFetch;
  const controller = new AbortController();
  const callerSignal = init.signal;
  const forwardAbort = () => controller.abort();
  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener("abort", forwardAbort, { once: true });
  }

  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = Promise.resolve().then(async () => {
      const response = await fetcher(input, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      });
      if (response.redirected) {
        controller.abort();
        void cancelResponseBody(response);
        throw new ClientMutationOutcomeUnknownError(
          "redirected_response",
          response.status,
        );
      }
      if (
        response.status >= 500 ||
        RETRYABLE_RESPONSE_STATUSES.has(response.status)
      ) {
        controller.abort();
        void cancelResponseBody(response);
        throw new ClientMutationOutcomeUnknownError(
          "retryable_response",
          response.status,
        );
      }

      const body = await bufferResponseBody(
        response,
        init.method,
        (reader) => {
          activeReader = reader;
        },
        () => controller.abort(),
      );
      activeReader = null;
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    });
    const expired = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        void activeReader?.cancel().catch(() => undefined);
        reject(new ClientMutationOutcomeUnknownError("timeout"));
      }, timeoutMs);
    });

    return await Promise.race([operation, expired]);
  } catch (error) {
    if (error instanceof ClientMutationOutcomeUnknownError) throw error;
    throw new ClientMutationOutcomeUnknownError("transport");
  } finally {
    if (timeout) clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}

export function isClientMutationOutcomeUnknown(
  error: unknown,
): error is ClientMutationOutcomeUnknownError {
  return error instanceof ClientMutationOutcomeUnknownError;
}

export function isClientMutationApiError(
  error: unknown,
): error is ClientMutationApiError {
  return error instanceof ClientMutationApiError;
}

export function clientMutationOutcomeUnknownMessage(
  action: string,
  recovery: "retry_same_attempt" | "reload_before_retry",
): string {
  const lead = `Roadmap could not confirm whether ${action}.`;
  return recovery === "retry_same_attempt"
    ? `${lead} Check your connection, then try this same action again; Roadmap will reuse the same attempt.`
    : `${lead} Reload this page to check the current state before trying again.`;
}

export function clientMutationErrorMessage(
  error: unknown,
  action: string,
  recovery: "retry_same_attempt" | "reload_before_retry",
  fallback: string,
): string {
  if (isClientMutationOutcomeUnknown(error)) {
    return clientMutationOutcomeUnknownMessage(action, recovery);
  }
  return error instanceof Error ? error.message : fallback;
}

/**
 * Reads a mutation JSON response without turning an unreadable or structurally
 * invalid 2xx body into a definitive failure. A successful status can mean the
 * server committed even when its acknowledgement was truncated, so callers
 * must use the same recovery path as any other outcome-unknown result.
 *
 * Non-2xx responses remain definitive and may expose a bounded API error
 * message; malformed error bodies use the caller's fallback.
 */
export async function requireClientMutationJson<T>(
  response: Response,
  isExpectedSuccess: (value: unknown) => boolean,
  fallback: string,
): Promise<T> {
  if (response.ok && !isApplicationJson(response.headers.get("content-type"))) {
    throw new ClientMutationOutcomeUnknownError(
      "malformed_success_response",
      response.status,
    );
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    if (response.ok) {
      throw new ClientMutationOutcomeUnknownError(
        "malformed_success_response",
        response.status,
      );
    }
    throw new ClientMutationApiError(response.status, null, fallback);
  }

  if (!response.ok) {
    throw clientMutationApiError(response.status, value, fallback);
  }
  if (!isExpectedSuccess(value)) {
    throw new ClientMutationOutcomeUnknownError(
      "malformed_success_response",
      response.status,
    );
  }
  return value as T;
}

function isApplicationJson(contentType: string | null): boolean {
  if (contentType === null) return false;
  return contentType.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

export async function requireClientMutationSuccess(
  response: Response,
  fallback: string,
  allowedSuccessStatuses?: readonly number[],
): Promise<void> {
  if (response.ok) {
    if (
      allowedSuccessStatuses &&
      !allowedSuccessStatuses.includes(response.status)
    ) {
      throw clientMutationMalformedSuccess(response.status);
    }
    return;
  }

  let value: unknown = null;
  try {
    value = await response.json();
  } catch {
    // A malformed non-2xx body is still a definitive failure.
  }
  throw clientMutationApiError(response.status, value, fallback);
}

export function clientMutationMalformedSuccess(
  status: number,
): ClientMutationOutcomeUnknownError {
  return new ClientMutationOutcomeUnknownError(
    "malformed_success_response",
    status,
  );
}

function clientMutationApiError(
  status: number,
  value: unknown,
  fallback: string,
): ClientMutationApiError {
  let code: string | null = null;
  let message = fallback;
  if (
    value !== null &&
    typeof value === "object" &&
    "error" in value &&
    value.error !== null &&
    typeof value.error === "object"
  ) {
    if (
      "message" in value.error &&
      typeof value.error.message === "string" &&
      value.error.message.trim()
    ) {
      message = value.error.message;
    }
    if (
      "code" in value.error &&
      typeof value.error.code === "string" &&
      /^[a-z][a-z0-9_]{0,127}$/.test(value.error.code)
    ) {
      code = value.error.code;
    }
  }
  return new ClientMutationApiError(status, code, message);
}

function browserFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, init);
}

async function bufferResponseBody(
  response: Response,
  requestMethod: string | undefined,
  setActiveReader: (
    reader: ReadableStreamDefaultReader<Uint8Array> | null,
  ) => void,
  abortRequest: () => void,
): Promise<BodyInit | null> {
  if (
    response.body === null ||
    requestMethod?.toUpperCase() === "HEAD" ||
    [204, 205, 304].includes(response.status)
  ) {
    if (response.body !== null) await cancelResponseBody(response);
    return null;
  }

  const reader = response.body.getReader();
  setActiveReader(reader);
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const nextByteLength = byteLength + value.byteLength;
      if (nextByteLength > CLIENT_MUTATION_MAX_RESPONSE_BYTES) {
        abortRequest();
        void reader.cancel().catch(() => undefined);
        throw new ClientMutationOutcomeUnknownError(
          "response_too_large",
          response.status,
        );
      }
      chunks.push(value);
      byteLength = nextByteLength;
    }
  } finally {
    setActiveReader(null);
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (response.body === null) return;
  try {
    await response.body.cancel();
  } catch {
    // The request signal is also aborted. A locked or already-failed body does
    // not change the caller-visible outcome-unknown result.
  }
}
