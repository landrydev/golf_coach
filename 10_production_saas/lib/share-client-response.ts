export type ShareMutationIntent =
  | Readonly<{
      operation: "plan.publish_and_share";
      expiresInDays: number;
    }>
  | Readonly<{
      operation: "share.replace_inaccessible_link";
      sourceShareId: string;
    }>
  | Readonly<{
      operation: "share.reissue_same_revision";
      sourceShareId: string;
      sourceStatus: "revoked" | "expired";
      sourceUpdatedAt: number;
      expiresInDays: number;
    }>;

export type ShareMutationEnvelope = Readonly<{
  intent: ShareMutationIntent;
  share: Readonly<{
    id: string;
    url: string;
    planId: string;
    planRevision: number;
    status: "active";
    createdAt: string;
    updatedAt: string;
    expiresAt: string | null;
    lastAccessedAt: null;
    accessCount: 0;
  }>;
}>;

/**
 * A committed share mutation can return its raw bearer only once. Accept an
 * acknowledgement only when every field and the complete canonical URL are
 * present; otherwise the caller must reconcile by reloading, never display a
 * guessed or partial link.
 */
export function isShareMutationEnvelope(
  value: unknown,
  expectedOrigin: string,
  expectedPlanId: string,
  expectedPlanRevision: number,
  expectedIntent: ShareMutationIntent,
): value is ShareMutationEnvelope {
  const canonicalOrigin = parseBareCanonicalOrigin(expectedOrigin);
  if (
    !canonicalOrigin ||
    !isUuid(expectedPlanId) ||
    !Number.isSafeInteger(expectedPlanRevision) ||
    expectedPlanRevision < 1 ||
    !isPlainObject(value) ||
    !hasExactlyKeys(value, ["intent", "share"]) ||
    !shareMutationIntentMatches(value.intent, expectedIntent)
  ) {
    return false;
  }
  const share = value.share;
  if (
    !isPlainObject(share) ||
    !hasExactlyKeys(share, [
      "id",
      "url",
      "planId",
      "planRevision",
      "status",
      "createdAt",
      "updatedAt",
      "expiresAt",
      "lastAccessedAt",
      "accessCount",
    ]) ||
    typeof share.id !== "string" ||
    !isUuid(share.id) ||
    typeof share.url !== "string" ||
    share.planId !== expectedPlanId ||
    !isUuid(share.planId) ||
    share.planRevision !== expectedPlanRevision ||
    !Number.isSafeInteger(share.planRevision) ||
    (share.planRevision as number) < 1 ||
    share.status !== "active" ||
    !isCanonicalIsoInstant(share.createdAt) ||
    !isCanonicalIsoInstant(share.updatedAt) ||
    share.updatedAt !== share.createdAt ||
    !shareExpiryMatchesIntent(
      share.createdAt,
      share.expiresAt,
      expectedIntent,
    ) ||
    share.lastAccessedAt !== null ||
    share.accessCount !== 0
  ) {
    return false;
  }

  try {
    const url = new URL(share.url);
    return (
      url.toString() === share.url &&
      url.origin === canonicalOrigin.origin &&
      !url.username &&
      !url.password &&
      url.pathname === "/r" &&
      url.search === "" &&
      /^#token=[A-Za-z0-9_-]{40,64}$/.test(url.hash)
    );
  } catch {
    return false;
  }
}

function shareMutationIntentMatches(
  value: unknown,
  expected: ShareMutationIntent,
): value is ShareMutationIntent {
  if (!isPlainObject(value) || !isPlainObject(expected)) return false;

  switch (expected.operation) {
    case "plan.publish_and_share":
      return (
        hasExactlyKeys(expected, ["operation", "expiresInDays"]) &&
        hasExactlyKeys(value, ["operation", "expiresInDays"]) &&
        value.operation === expected.operation &&
        isShareExpiryDays(expected.expiresInDays) &&
        value.expiresInDays === expected.expiresInDays
      );
    case "share.replace_inaccessible_link":
      return (
        hasExactlyKeys(expected, ["operation", "sourceShareId"]) &&
        hasExactlyKeys(value, ["operation", "sourceShareId"]) &&
        value.operation === expected.operation &&
        isUuid(expected.sourceShareId) &&
        value.sourceShareId === expected.sourceShareId
      );
    case "share.reissue_same_revision":
      return (
        hasExactlyKeys(expected, [
          "operation",
          "sourceShareId",
          "sourceStatus",
          "sourceUpdatedAt",
          "expiresInDays",
        ]) &&
        hasExactlyKeys(value, [
          "operation",
          "sourceShareId",
          "sourceStatus",
          "sourceUpdatedAt",
          "expiresInDays",
        ]) &&
        value.operation === expected.operation &&
        isUuid(expected.sourceShareId) &&
        value.sourceShareId === expected.sourceShareId &&
        (expected.sourceStatus === "revoked" ||
          expected.sourceStatus === "expired") &&
        value.sourceStatus === expected.sourceStatus &&
        Number.isSafeInteger(expected.sourceUpdatedAt) &&
        expected.sourceUpdatedAt >= 0 &&
        value.sourceUpdatedAt === expected.sourceUpdatedAt &&
        isShareExpiryDays(expected.expiresInDays) &&
        value.expiresInDays === expected.expiresInDays
      );
  }
}

function shareExpiryMatchesIntent(
  createdAt: string,
  expiresAt: unknown,
  intent: ShareMutationIntent,
): boolean {
  if (expiresAt !== null && !isCanonicalIsoInstant(expiresAt)) return false;
  const createdAtMillis = Date.parse(createdAt);

  if (intent.operation === "share.replace_inaccessible_link") {
    return expiresAt === null || Date.parse(expiresAt) > createdAtMillis;
  }

  return (
    typeof expiresAt === "string" &&
    Date.parse(expiresAt) - createdAtMillis ===
      intent.expiresInDays * 86_400_000
  );
}

function isShareExpiryDays(value: unknown): value is number {
  return Number.isSafeInteger(value) && [1, 7, 30, 90].includes(value as number);
}

function parseBareCanonicalOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.origin !== value ||
      url.toString() !== `${value}/` ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      (url.protocol !== "https:" && !isLocalDevelopmentUrl(url))
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactlyKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isCanonicalIsoInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function isLocalDevelopmentUrl(url: URL): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}
