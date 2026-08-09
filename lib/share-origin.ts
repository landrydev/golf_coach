import { resolveApplicationOrigin } from "./canonical-origin";
import { RequestError } from "./http";
import type { ShareMutationReceipt } from "./plans";

/**
 * Resolves the sole origin permitted in one-time private share URLs.
 *
 * Callers must validate this value before committing a share-token mutation:
 * a committed token whose acknowledgement cannot be assembled would otherwise
 * leave the instructor without the only copy of its bearer value.
 */
export function shareOrigin(request: Request): string {
  const resolution = resolveApplicationOrigin(
    process.env.APP_URL,
    new URL(request.url),
  );
  if (!resolution.ok) {
    throw new RequestError(
      503,
      resolution.code,
      "Private links are unavailable because the application origin is invalid.",
    );
  }
  return resolution.origin;
}

/**
 * Bind the one-time bearer acknowledgement to the authoritative persisted
 * sharing record. Client history must never infer issuance time, revision, or
 * access facts from its own clock.
 */
export function shareMutationEnvelope(
  receipt: ShareMutationReceipt,
  origin: string,
) {
  return {
    intent: receipt.intent,
    share: {
      id: receipt.shareId,
      url: `${origin.replace(/\/$/, "")}/r#token=${encodeURIComponent(receipt.rawToken)}`,
      planId: receipt.planId,
      planRevision: receipt.planRevision,
      status: receipt.status,
      createdAt: receipt.createdAt.toISOString(),
      updatedAt: receipt.updatedAt.toISOString(),
      expiresAt: receipt.expiresAt?.toISOString() ?? null,
      lastAccessedAt: receipt.lastAccessedAt,
      accessCount: receipt.accessCount,
    },
  } as const;
}
