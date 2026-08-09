import {
  isClientMutationApiError,
  isClientMutationOutcomeUnknown,
} from "./client-mutation-recovery.ts";

export const CONSENT_STATE_INVALIDATING_CONFLICT_CODES = [
  "stale_consent_state",
  "stale_consent_policy",
] as const;

/**
 * Decide whether a client mutation must stop and reload authoritative state.
 * Outcome-unknown failures always stop. Callers can treat every HTTP 409 as
 * state-invalidating or name the exact conflict codes that invalidate their
 * local snapshot.
 */
export function requiresAuthoritativeMutationReload(
  error: unknown,
  conflictCodes: "all" | readonly string[] = "all",
): boolean {
  if (isClientMutationOutcomeUnknown(error)) return true;
  if (!isClientMutationApiError(error) || error.status !== 409) return false;
  return (
    conflictCodes === "all" ||
    (error.code !== null && conflictCodes.includes(error.code))
  );
}
