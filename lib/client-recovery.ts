type ClientFetch = (input: string, init: RequestInit) => Promise<Response>;

const SHARE_EXCHANGE_TIMEOUT_MS = 10_000;
const SHARE_PLAN_REDIRECT = "/r/plan";

export type ShareExchangeResult =
  | { kind: "success"; redirectTo: typeof SHARE_PLAN_REDIRECT }
  | { kind: "retryable" }
  | { kind: "unavailable" };

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
      headers: { "Content-Type": "application/json" },
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
