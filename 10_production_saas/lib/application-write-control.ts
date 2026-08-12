export const APPLICATION_WRITE_MODE_ENVIRONMENT_KEY =
  "APPLICATION_WRITE_MODE";

export const SCHEDULED_WRITES_UNAVAILABLE_LOG =
  "Scheduled application writes unavailable";

export type ApplicationWriteModeState = "enabled" | "frozen" | "invalid";

export type ApplicationWriteControl = Readonly<{
  state: ApplicationWriteModeState;
  writesEnabled: boolean;
}>;

/**
 * Parse the exact control-plane value. Missing, malformed, or padded values
 * fail closed so a configuration typo cannot silently restore writes during
 * incident containment or data recovery.
 */
export function readApplicationWriteControl(
  value: string | undefined,
): ApplicationWriteControl {
  if (value === "enabled") {
    return Object.freeze({ state: "enabled", writesEnabled: true });
  }
  if (value === "frozen") {
    return Object.freeze({ state: "frozen", writesEnabled: false });
  }
  return Object.freeze({ state: "invalid", writesEnabled: false });
}

/**
 * Conservatively identify requests that can reach application-owned writes.
 *
 * Several instructor pages and nominally read-only API handlers reconcile an
 * identity, persist an audit event, or increment an abuse counter. Keep those
 * routes behind the write control for GET and HEAD as well as conventional
 * mutations. The two health endpoints are explicit read-only API exceptions.
 */
export function requestMayReachApplicationWrites(
  method: string,
  normalizedApplicationPath: string,
): boolean {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "OPTIONS") return false;
  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") return true;

  if (
    normalizedApplicationPath === "/app" ||
    normalizedApplicationPath.startsWith("/app/")
  ) {
    return true;
  }

  if (
    normalizedApplicationPath === "/api/health" ||
    normalizedApplicationPath === "/api/operations/health"
  ) {
    return false;
  }

  return (
    normalizedApplicationPath === "/api" ||
    normalizedApplicationPath.startsWith("/api/")
  );
}
