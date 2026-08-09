import type { GolferResponseType, PlanResponseSummary } from "./plans";

type ClientFetch = (input: string, init: RequestInit) => Promise<Response>;

const SHARE_EXCHANGE_TIMEOUT_MS = 10_000;
const GOLFER_RESPONSE_TIMEOUT_MS = 10_000;
const GOLFER_RESPONSE_ATTEMPT_STORAGE_PREFIX =
  "roadmap:golfer-response-attempt:v1:";
const GOLFER_RESPONSE_OPERATION_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{19,127}$/;
const SHARE_PLAN_REDIRECT = "/r/plan";

export type ShareExchangeResult =
  | { kind: "success"; redirectTo: typeof SHARE_PLAN_REDIRECT }
  | { kind: "retryable" }
  | { kind: "unavailable" };

export type GolferResponseSubmissionResult =
  | {
      kind: "success";
      response: PlanResponseSummary;
      idempotentReplay: boolean;
    }
  | { kind: "outcome_unknown" }
  | { kind: "rejected"; message: string };

export type GolferResponseAttemptRegistry = {
  keyFor(responseType: GolferResponseType): string;
  settle(
    responseType: GolferResponseType,
    key: string,
    outcome: GolferResponseSubmissionResult["kind"],
  ): void;
};

export type GolferResponseAttemptStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

function browserFetch(input: string, init: RequestInit): Promise<Response> {
  return fetch(input, init);
}

/**
 * Starts a non-blocking, best-effort record of an external handoff. The native
 * link remains the authoritative navigation path, so tracking can never prevent
 * the golfer from reaching the coach's service.
 */
export function attemptExternalHandoffRecord(
  fetcher: ClientFetch = browserFetch,
): void {
  try {
    const pending = fetcher("/r/response", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ responseType: "external_action_opened" }),
      credentials: "same-origin",
      keepalive: true,
    });
    void pending.catch(() => undefined);
  } catch {
    // A synchronous tracking failure must not cancel the native link action.
  }
}

/**
 * Retains one operation key per choice until the server gives a definitive
 * success or rejection. Per-tab session storage lets a timeout or transport
 * failure reuse the same logical operation after a reload without creating
 * durable cross-tab state.
 */
export function createGolferResponseAttemptRegistry(
  createKey: () => string = () => crypto.randomUUID(),
  storage: GolferResponseAttemptStorage | null = browserSessionStorage(),
): GolferResponseAttemptRegistry {
  const pending = new Map<GolferResponseType, string>();
  return {
    keyFor(responseType) {
      const existing = pending.get(responseType);
      if (existing) return existing;
      const storageKey = golferResponseAttemptStorageKey(responseType);
      const stored = safeStorageGet(storage, storageKey);
      if (stored && GOLFER_RESPONSE_OPERATION_KEY_PATTERN.test(stored)) {
        pending.set(responseType, stored);
        return stored;
      }
      if (stored) safeStorageRemove(storage, storageKey);
      const created = createKey();
      if (!GOLFER_RESPONSE_OPERATION_KEY_PATTERN.test(created)) {
        throw new Error("Golfer response operation key is invalid.");
      }
      pending.set(responseType, created);
      safeStorageSet(storage, storageKey, created);
      return created;
    },
    settle(responseType, key, outcome) {
      if (
        outcome !== "outcome_unknown" &&
        pending.get(responseType) === key
      ) {
        pending.delete(responseType);
        const storageKey = golferResponseAttemptStorageKey(responseType);
        if (safeStorageGet(storage, storageKey) === key) {
          safeStorageRemove(storage, storageKey);
        }
      }
    },
  };
}

function browserSessionStorage(): GolferResponseAttemptStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function golferResponseAttemptStorageKey(
  responseType: GolferResponseType,
): string {
  return `${GOLFER_RESPONSE_ATTEMPT_STORAGE_PREFIX}${responseType}`;
}

function safeStorageGet(
  storage: GolferResponseAttemptStorage | null,
  key: string,
): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(
  storage: GolferResponseAttemptStorage | null,
  key: string,
  value: string,
): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage denial must not block a same-mount recovery attempt.
  }
}

function safeStorageRemove(
  storage: GolferResponseAttemptStorage | null,
  key: string,
): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage denial must not block a same-mount recovery attempt.
  }
}

/**
 * Records an explicit golfer choice with a bounded wait. Any timeout,
 * transport failure, retryable server response, or malformed success is
 * reported as outcome-unknown so the caller can retain and reuse the key.
 */
export async function requestGolferResponse(
  responseType: GolferResponseType,
  idempotencyKey: string,
  fetcher: ClientFetch = browserFetch,
  timeoutMs = GOLFER_RESPONSE_TIMEOUT_MS,
): Promise<GolferResponseSubmissionResult> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const operation = (async (): Promise<GolferResponseSubmissionResult> => {
      const response = await fetcher("/r/response", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ responseType }),
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (isAmbiguousGolferResponseStatus(response.status)) {
          return { kind: "outcome_unknown" };
        }
        return {
          kind: "rejected",
          message: responseErrorMessage(payload),
        };
      }
      if (!validGolferResponsePayload(payload, responseType)) {
        return { kind: "outcome_unknown" };
      }
      return {
        kind: "success",
        response: payload.response,
        idempotentReplay: payload.idempotentReplay,
      };
    })();
    const expired = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("golfer_response_timeout"));
      }, timeoutMs);
    });
    return await Promise.race([operation, expired]);
  } catch {
    return { kind: "outcome_unknown" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Exchanges a fragment capability without putting it in a request URL. Network,
 * timeout, throttling, conflict, and server failures are retryable. Definitive
 * client rejections can safely retire the fragment and ask for a new link.
 */
export async function requestShareExchange(
  token: string,
  fetcher: ClientFetch = browserFetch,
  timeoutMs = SHARE_EXCHANGE_TIMEOUT_MS,
): Promise<ShareExchangeResult> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const request = fetcher("/r/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    const expired = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("share_exchange_timeout"));
      }, timeoutMs);
    });
    const response = await Promise.race([request, expired]);

    if (!response.ok) {
      return isRetryableShareExchangeStatus(response.status)
        ? { kind: "retryable" }
        : { kind: "unavailable" };
    }

    const payload = (await response.json()) as { redirectTo?: unknown };
    return payload.redirectTo === SHARE_PLAN_REDIRECT
      ? { kind: "success", redirectTo: SHARE_PLAN_REDIRECT }
      : { kind: "retryable" };
  } catch {
    return { kind: "retryable" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function isRetryableShareExchangeStatus(status: number): boolean {
  return status >= 500 || [408, 409, 425, 429].includes(status);
}

function isAmbiguousGolferResponseStatus(status: number): boolean {
  return status >= 500 || [408, 425, 429].includes(status);
}

function responseErrorMessage(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string" &&
    payload.error.message.trim()
  ) {
    return payload.error.message;
  }
  return "Your choice could not be recorded. Please try again.";
}

function validGolferResponsePayload(
  payload: unknown,
  expectedResponseType: GolferResponseType,
): payload is {
  response: PlanResponseSummary;
  idempotentReplay: boolean;
} {
  if (!payload || typeof payload !== "object") return false;
  if (!("response" in payload) || !("idempotentReplay" in payload)) return false;
  const response = payload.response;
  if (!response || typeof response !== "object") return false;
  return (
    typeof payload.idempotentReplay === "boolean" &&
    "id" in response &&
    typeof response.id === "string" &&
    "responseType" in response &&
    response.responseType === expectedResponseType &&
    "occurredAt" in response &&
    typeof response.occurredAt === "number" &&
    Number.isFinite(response.occurredAt)
  );
}
