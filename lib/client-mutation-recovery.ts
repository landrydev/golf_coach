type ClientFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ClientMutationOutcomeUnknownReason =
  | "timeout"
  | "transport"
  | "retryable_response";

export const CLIENT_MUTATION_TIMEOUT_MS = 10_000;

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

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = Promise.resolve().then(() =>
      fetcher(input, { ...init, signal: controller.signal }),
    );
    const expired = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new ClientMutationOutcomeUnknownError("timeout"));
      }, timeoutMs);
    });

    const response = await Promise.race([operation, expired]);
    if (
      response.status >= 500 ||
      RETRYABLE_RESPONSE_STATUSES.has(response.status)
    ) {
      throw new ClientMutationOutcomeUnknownError(
        "retryable_response",
        response.status,
      );
    }
    return response;
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

function browserFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, init);
}
