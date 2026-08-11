import type { GolferResponseType, PlanResponseSummary } from "./plans";
import {
  clientMutationErrorRequestId,
  clientMutationResponseRequestId,
  requestClientMutation,
} from "./client-mutation-recovery.ts";
import {
  BROWSER_SHARE_EXCHANGE_MEDIA_TYPE,
  isUnavailableShareExchangePayload,
} from "./share-exchange-browser-contract.ts";

type ClientFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type SerialClientTaskQueue = Readonly<{
  run<T>(task: () => Promise<T>): Promise<T>;
}>;

const SHARE_EXCHANGE_TIMEOUT_MS = 10_000;
const GOLFER_RESPONSE_TIMEOUT_MS = 10_000;
const GOLFER_RESPONSE_ATTEMPT_STORAGE_KEY =
  "roadmap:golfer-response-attempt:v3";
const CONTEXTLESS_GOLFER_RESPONSE_ATTEMPT_STORAGE_KEY =
  "roadmap:golfer-response-attempt:v2";
const LEGACY_GOLFER_RESPONSE_ATTEMPT_STORAGE_PREFIX =
  "roadmap:golfer-response-attempt:v1:";
const GOLFER_RESPONSE_OPERATION_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{19,127}$/;
const SHARE_SESSION_CONTEXT_PATTERN = /^[0-9a-f]{64}$/;
const SHARE_PLAN_PATH = "/r/plan";

/**
 * Serializes browser effects that cannot be generation-fenced after the user
 * agent processes response headers. In particular, a stale Set-Cookie cannot
 * be rolled back by React, so the successor request must start only after its
 * predecessor settles and must therefore be the last cookie writer.
 */
export function createSerialClientTaskQueue(): SerialClientTaskQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

export type SharePlanRedirect = `/r/plan?context=${string}`;

export type ExplicitGolferResponseType = Exclude<
  GolferResponseType,
  "external_action_opened"
>;

const EXPLICIT_GOLFER_RESPONSE_TYPES: readonly ExplicitGolferResponseType[] = [
  "ask_question",
  "wait",
  "decline",
  "request_reassessment",
  "independent_practice",
];
const EXPLICIT_GOLFER_RESPONSE_TYPE_SET = new Set<string>(
  EXPLICIT_GOLFER_RESPONSE_TYPES,
);

export type ShareExchangeResult =
  | {
      kind: "success";
      sessionContext: string;
      redirectTo: SharePlanRedirect;
      requestId?: string;
    }
  | { kind: "retryable"; requestId?: string }
  | { kind: "unavailable"; requestId?: string };

export type GolferResponseSubmissionResult =
  | {
      kind: "success";
      response: PlanResponseSummary;
      idempotentReplay: boolean;
      requestId?: string;
    }
  | { kind: "outcome_unknown"; requestId?: string }
  | {
      kind: "rejected";
      status: number;
      code: string | null;
      message: string;
      requestId?: string;
    };

/**
 * A definitive response rejection can also prove that the rendered private
 * session is no longer authoritative. Those states must lock every response
 * choice until a full document navigation checks the server again.
 */
export function golferResponseRequiresSessionReload(
  result: GolferResponseSubmissionResult,
): boolean {
  return (
    result.kind === "rejected" &&
    (result.status === 404 ||
      result.code === "plan_unavailable" ||
      result.code === "share_session_changed" ||
      result.code === "session_context_required")
  );
}

export type GolferResponsePendingAttempt = {
  sessionContext: string;
  responseType: ExplicitGolferResponseType;
  key: string;
};

type OwnedGolferResponsePendingAttempt = GolferResponsePendingAttempt & {
  owner: string;
};

export type GolferResponseRecoveryState =
  | { kind: "ready" }
  | { kind: "pending"; attempt: GolferResponsePendingAttempt }
  | {
      kind: "blocked";
      reason:
        | "contextless_state"
        | "invalid_state"
        | "storage_unavailable"
        | "invalid_session_context"
        | "ownership_lost";
    };

type OwnedGolferResponseRecoveryState =
  | { kind: "ready" }
  | { kind: "pending"; attempt: OwnedGolferResponsePendingAttempt }
  | Extract<GolferResponseRecoveryState, { kind: "blocked" }>;

export type GolferResponseAttemptRegistry = {
  recovery(): GolferResponseRecoveryState;
  pending(): GolferResponsePendingAttempt | null;
  keyFor(responseType: ExplicitGolferResponseType): string;
  settle(
    responseType: ExplicitGolferResponseType,
    key: string,
    outcome: GolferResponseSubmissionResult["kind"],
  ): void;
};

export type GolferResponseAttemptStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

function browserFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, init);
}

/**
 * Starts a non-blocking, best-effort record of an external handoff. The native
 * link remains the authoritative navigation path, so tracking can never prevent
 * the golfer from reaching the coach's service.
 */
export function attemptExternalHandoffRecord(
  sessionContext: string,
  fetcher: ClientFetch = browserFetch,
): void {
  try {
    const pending = fetcher("/r/response", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        responseType: "external_action_opened",
        sessionContext,
      }),
      credentials: "same-origin",
      keepalive: true,
    });
    void pending.catch(() => undefined);
  } catch {
    // A synchronous tracking failure must not cancel the native link action.
  }
}

/**
 * Retains exactly one unresolved explicit choice until the server gives a
 * definitive success or rejection. Per-tab session storage lets a timeout or
 * transport failure restore both the choice and its operation key after a
 * reload without creating durable cross-tab state.
 */
export function createGolferResponseAttemptRegistry(
  sessionContext: string,
  createKey: () => string = () => crypto.randomUUID(),
  storage: GolferResponseAttemptStorage | null = browserSessionStorage(),
  createOwner: () => string = () => crypto.randomUUID(),
): GolferResponseAttemptRegistry {
  let recoveryState = restoreGolferResponseRecoveryState(
    sessionContext,
    storage,
    createOwner,
  );

  return {
    recovery() {
      return cloneRecoveryState(recoveryState);
    },
    pending() {
      return recoveryState.kind === "pending"
        ? {
            sessionContext: recoveryState.attempt.sessionContext,
            responseType: recoveryState.attempt.responseType,
            key: recoveryState.attempt.key,
          }
        : null;
    },
    keyFor(responseType) {
      if (recoveryState.kind === "blocked") {
        throw new Error("Golfer response recovery is blocked.");
      }
      if (recoveryState.kind === "pending") {
        if (recoveryState.attempt.responseType === responseType) {
          return recoveryState.attempt.key;
        }
        throw new Error("Another golfer response is awaiting confirmation.");
      }
      const created = createKey();
      if (!GOLFER_RESPONSE_OPERATION_KEY_PATTERN.test(created)) {
        throw new Error("Golfer response operation key is invalid.");
      }
      const owner = createOwner();
      if (!GOLFER_RESPONSE_OPERATION_KEY_PATTERN.test(owner)) {
        recoveryState = { kind: "blocked", reason: "storage_unavailable" };
        throw new Error("Golfer response recovery owner is invalid.");
      }
      const pendingAttempt = { sessionContext, responseType, owner, key: created };
      if (!safeStorageSetIfEmpty(
        storage,
        GOLFER_RESPONSE_ATTEMPT_STORAGE_KEY,
        JSON.stringify(pendingAttempt),
      )) {
        recoveryState = { kind: "blocked", reason: "storage_unavailable" };
        throw new Error("Golfer response recovery storage is unavailable.");
      }
      recoveryState = { kind: "pending", attempt: pendingAttempt };
      return created;
    },
    settle(responseType, key, outcome) {
      if (
        outcome !== "outcome_unknown" &&
        recoveryState.kind === "pending" &&
        recoveryState.attempt.responseType === responseType &&
        recoveryState.attempt.key === key
      ) {
        if (
          safeStorageCompareAndRemove(
            storage,
            GOLFER_RESPONSE_ATTEMPT_STORAGE_KEY,
            JSON.stringify(recoveryState.attempt),
          )
        ) {
          recoveryState = { kind: "ready" };
        } else {
          recoveryState = { kind: "blocked", reason: "ownership_lost" };
        }
      }
    },
  };
}

/** Clears recovery state only after the active share session is definitively
 * retired or replaced. Retryable exchange/close failures intentionally retain
 * it because the server outcome is still unknown.
 */
export function clearGolferResponsePendingAttempt(
  storage: GolferResponseAttemptStorage | null = browserSessionStorage(),
): void {
  safeStorageRemove(storage, GOLFER_RESPONSE_ATTEMPT_STORAGE_KEY);
  safeStorageRemove(
    storage,
    CONTEXTLESS_GOLFER_RESPONSE_ATTEMPT_STORAGE_KEY,
  );
  for (const responseType of EXPLICIT_GOLFER_RESPONSE_TYPES) {
    safeStorageRemove(
      storage,
      `${LEGACY_GOLFER_RESPONSE_ATTEMPT_STORAGE_PREFIX}${responseType}`,
    );
  }
}

function browserSessionStorage(): GolferResponseAttemptStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function restoreGolferResponseRecoveryState(
  sessionContext: string,
  storage: GolferResponseAttemptStorage | null,
  createOwner: () => string,
): OwnedGolferResponseRecoveryState {
  if (!SHARE_SESSION_CONTEXT_PATTERN.test(sessionContext)) {
    return { kind: "blocked", reason: "invalid_session_context" };
  }

  const storageReads = [
    safeStorageGet(storage, GOLFER_RESPONSE_ATTEMPT_STORAGE_KEY),
    safeStorageGet(storage, CONTEXTLESS_GOLFER_RESPONSE_ATTEMPT_STORAGE_KEY),
    ...EXPLICIT_GOLFER_RESPONSE_TYPES.map((responseType) =>
      safeStorageGet(
        storage,
        `${LEGACY_GOLFER_RESPONSE_ATTEMPT_STORAGE_PREFIX}${responseType}`,
      ),
    ),
  ];
  if (storageReads.some((result) => !result.ok)) {
    return { kind: "blocked", reason: "storage_unavailable" };
  }
  const [currentRead, contextlessV2Read, ...legacyReads] = storageReads as Array<{
    ok: true;
    value: string | null;
  }>;
  if (
    contextlessV2Read.value !== null ||
    legacyReads.some((result) => result.value !== null)
  ) {
    return { kind: "blocked", reason: "contextless_state" };
  }

  if (currentRead.value === null) return { kind: "ready" };
  const current = parseGolferResponsePendingAttempt(currentRead.value);
  if (!current) return { kind: "blocked", reason: "invalid_state" };
  if (current.sessionContext !== sessionContext) {
    return safeStorageRemove(storage, GOLFER_RESPONSE_ATTEMPT_STORAGE_KEY)
      ? { kind: "ready" }
      : { kind: "blocked", reason: "storage_unavailable" };
  }
  const owner = createOwner();
  if (!GOLFER_RESPONSE_OPERATION_KEY_PATTERN.test(owner)) {
    return { kind: "blocked", reason: "storage_unavailable" };
  }
  const claimed: OwnedGolferResponsePendingAttempt = { ...current, owner };
  return safeStorageCompareAndSet(
    storage,
    GOLFER_RESPONSE_ATTEMPT_STORAGE_KEY,
    currentRead.value,
    JSON.stringify(claimed),
  )
    ? { kind: "pending", attempt: claimed }
    : { kind: "blocked", reason: "ownership_lost" };
}

function cloneRecoveryState(
  state: OwnedGolferResponseRecoveryState,
): GolferResponseRecoveryState {
  return state.kind === "pending"
    ? {
        kind: "pending",
        attempt: {
          sessionContext: state.attempt.sessionContext,
          responseType: state.attempt.responseType,
          key: state.attempt.key,
        },
      }
    : { ...state };
}

function parseGolferResponsePendingAttempt(
  stored: string,
): OwnedGolferResponsePendingAttempt | null {
  if (stored.length > 384) return null;
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    const hasLegacyKeys = hasExactKeys(candidate, [
      "sessionContext",
      "responseType",
      "key",
    ]);
    const hasOwnedKeys = hasExactKeys(candidate, [
      "sessionContext",
      "responseType",
      "owner",
      "key",
    ]);
    if (
      (!hasLegacyKeys && !hasOwnedKeys) ||
      typeof candidate.sessionContext !== "string" ||
      !SHARE_SESSION_CONTEXT_PATTERN.test(candidate.sessionContext) ||
      typeof candidate.responseType !== "string" ||
      !EXPLICIT_GOLFER_RESPONSE_TYPE_SET.has(candidate.responseType) ||
      !(candidate.owner === undefined ||
        (typeof candidate.owner === "string" &&
          GOLFER_RESPONSE_OPERATION_KEY_PATTERN.test(candidate.owner))) ||
      typeof candidate.key !== "string" ||
      !GOLFER_RESPONSE_OPERATION_KEY_PATTERN.test(candidate.key)
    ) {
      return null;
    }
    return {
      sessionContext: candidate.sessionContext,
      responseType: candidate.responseType as ExplicitGolferResponseType,
      owner: typeof candidate.owner === "string" ? candidate.owner : "legacy",
      key: candidate.key,
    };
  } catch {
    return null;
  }
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function safeStorageGet(
  storage: GolferResponseAttemptStorage | null,
  key: string,
): { ok: true; value: string | null } | { ok: false } {
  if (!storage) return { ok: false };
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch {
    return { ok: false };
  }
}

function safeStorageSetIfEmpty(
  storage: GolferResponseAttemptStorage | null,
  key: string,
  value: string,
): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(key) !== null) return false;
    storage.setItem(key, value);
    return storage.getItem(key) === value;
  } catch {
    return false;
  }
}

function safeStorageCompareAndSet(
  storage: GolferResponseAttemptStorage | null,
  key: string,
  expected: string,
  replacement: string,
): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(key) !== expected) return false;
    storage.setItem(key, replacement);
    return storage.getItem(key) === replacement;
  } catch {
    return false;
  }
}

function safeStorageCompareAndRemove(
  storage: GolferResponseAttemptStorage | null,
  key: string,
  expected: string,
): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(key) !== expected) return false;
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}

function safeStorageRemove(
  storage: GolferResponseAttemptStorage | null,
  key: string,
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
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
  sessionContext: string,
  fetcher: ClientFetch = browserFetch,
  timeoutMs = GOLFER_RESPONSE_TIMEOUT_MS,
): Promise<GolferResponseSubmissionResult> {
  try {
    const response = await requestClientMutation(
      "/r/response",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ responseType, sessionContext }),
        cache: "no-store",
        credentials: "same-origin",
      },
      { fetcher, timeoutMs },
    );
    const requestReference = clientResponseRequestReference(response);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const error = responseError(payload);
      return {
        kind: "rejected",
        status: response.status,
        code: error.code,
        message: error.message,
        ...requestReference,
      };
    }
    if (
      ![200, 201].includes(response.status) ||
      !hasJsonContentType(response)
    ) {
      return { kind: "outcome_unknown", ...requestReference };
    }
    const payload = await response.json().catch(() => null);
    if (
      !validGolferResponsePayload(payload, responseType) ||
      (response.status === 200) !== payload.idempotentReplay
    ) {
      return { kind: "outcome_unknown", ...requestReference };
    }
    return {
      kind: "success",
      response: payload.response,
      idempotentReplay: payload.idempotentReplay,
      ...requestReference,
    };
  } catch (error) {
    return {
      kind: "outcome_unknown",
      ...clientErrorRequestReference(error),
    };
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
  try {
    const response = await requestClientMutation(
      "/r/session",
      {
        method: "POST",
        headers: {
          Accept: BROWSER_SHARE_EXCHANGE_MEDIA_TYPE,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
        cache: "no-store",
        credentials: "same-origin",
      },
      { fetcher, timeoutMs },
    );
    const requestReference = clientResponseRequestReference(response);

    if (!response.ok) {
      return isRetryableShareExchangeStatus(response.status)
        ? { kind: "retryable", ...requestReference }
        : { kind: "unavailable", ...requestReference };
    }

    if (response.status !== 200 || !hasJsonContentType(response)) {
      return { kind: "retryable", ...requestReference };
    }
    const payload = await response.json().catch(() => null);
    if (isUnavailableShareExchangePayload(payload)) {
      return { kind: "unavailable", ...requestReference };
    }
    if (!validShareExchangePayload(payload)) {
      return { kind: "retryable", ...requestReference };
    }
    return {
      kind: "success",
      sessionContext: payload.sessionContext,
      redirectTo: `${SHARE_PLAN_PATH}?context=${payload.sessionContext}`,
      ...requestReference,
    };
  } catch (error) {
    return { kind: "retryable", ...clientErrorRequestReference(error) };
  }
}

function clientResponseRequestReference(
  response: Pick<Response, "headers">,
): Readonly<{ requestId?: string }> {
  const requestId = clientMutationResponseRequestId(response);
  return requestId === null ? {} : { requestId };
}

function clientErrorRequestReference(
  error: unknown,
): Readonly<{ requestId?: string }> {
  const requestId = clientMutationErrorRequestId(error);
  return requestId === null ? {} : { requestId };
}

function validShareExchangePayload(
  payload: unknown,
): payload is { sessionContext: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  return (
    Object.keys(candidate).length === 1 &&
    typeof candidate.sessionContext === "string" &&
    SHARE_SESSION_CONTEXT_PATTERN.test(candidate.sessionContext)
  );
}

export function isRetryableShareExchangeStatus(status: number): boolean {
  return status >= 500 || [408, 409, 425, 429].includes(status);
}

function responseError(payload: unknown): {
  code: string | null;
  message: string;
} {
  let code: string | null = null;
  let message = "Your choice could not be recorded. Please try again.";
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    !Array.isArray(payload.error)
  ) {
    if (
      "code" in payload.error &&
      typeof payload.error.code === "string" &&
      /^[a-z][a-z0-9_]{0,127}$/.test(payload.error.code)
    ) {
      code = payload.error.code;
    }
    if (
      "message" in payload.error &&
      typeof payload.error.message === "string" &&
      payload.error.message.trim()
    ) {
      message = payload.error.message;
    }
  }
  return { code, message };
}

function validGolferResponsePayload(
  payload: unknown,
  expectedResponseType: GolferResponseType,
): payload is {
  response: PlanResponseSummary;
  idempotentReplay: boolean;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  if (
    Object.keys(payload).length !== 2 ||
    !("response" in payload) ||
    !("idempotentReplay" in payload)
  ) {
    return false;
  }
  const response = payload.response;
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return false;
  }
  return (
    typeof payload.idempotentReplay === "boolean" &&
    Object.keys(response).length === 3 &&
    "id" in response &&
    typeof response.id === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(response.id) &&
    "responseType" in response &&
    response.responseType === expectedResponseType &&
    "occurredAt" in response &&
    typeof response.occurredAt === "number" &&
    Number.isSafeInteger(response.occurredAt) &&
    response.occurredAt >= 0
  );
}

function hasJsonContentType(response: Response): boolean {
  return (response.headers.get("content-type") ?? "")
    .toLowerCase()
    .startsWith("application/json");
}
