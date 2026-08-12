import type { ConsentPurpose, ConsentRecordView } from "@/lib/consent-repository";
import type { AccountDataRequestView } from "@/lib/repository";

const DATA_REQUEST_TYPES = new Set<AccountDataRequestView["type"]>([
  "access",
  "export",
  "correction",
  "deletion",
  "restriction",
  "consent_withdrawal",
]);

const DATA_REQUEST_STATUSES = new Set<AccountDataRequestView["status"]>([
  "submitted",
  "identity_verification_required",
  "verified",
  "in_progress",
  "fulfilled",
  "denied",
  "canceled",
  "failed",
]);

const CONSENT_PURPOSES = new Set<ConsentRecordView["purpose"]>([
  "terms",
  "privacy_notice",
  "golfer_record",
  "roadmap_sharing",
  "media_use",
  "service_email",
  "optional_analytics",
]);

const CONSENT_STATUSES = new Set<ConsentRecordView["status"]>([
  "granted",
  "declined",
  "withdrawn",
  "expired",
]);

const CONSENT_CAPTURE_METHODS = new Set<ConsentRecordView["captureMethod"]>([
  "self_service",
  "instructor_attested",
  "support_assisted",
  "imported",
]);

const EXPORT_COLLECTION_KEYS = [
  "subscriptions",
  "mediaAssets",
  "coachingPackages",
  "golfers",
  "developmentPlans",
  "goals",
  "assessments",
  "priorities",
  "phases",
  "phasePriorities",
  "lessons",
  "practiceItems",
  "evidenceItems",
  "phaseReviews",
  "phaseReviewEvidence",
  "shareLinks",
  "golferResponses",
  "consentRecords",
  "dataRequests",
] as const;

export const CLIENT_DATA_EXPORT_MAX_BYTES = 6 * 1024 * 1024;

export type DataRequestEnvelope = Readonly<{
  request: AccountDataRequestView;
  existing?: boolean;
  deferred?: boolean;
  message?: string;
}>;

export type ConsentTransitionEnvelope = Readonly<{
  record: ConsentRecordView;
  replayed: boolean;
}>;

export function isAccountDataRequestView(
  value: unknown,
): value is AccountDataRequestView {
  if (
    !isPlainObject(value) ||
    !hasExactlyKeys(value, ["id", "type", "status", "createdAt", "updatedAt"])
  ) {
    return false;
  }
  return (
    isSafeIdentifier(value.id) &&
    DATA_REQUEST_TYPES.has(value.type as AccountDataRequestView["type"]) &&
    DATA_REQUEST_STATUSES.has(value.status as AccountDataRequestView["status"]) &&
    isEpoch(value.createdAt) &&
    isEpoch(value.updatedAt) &&
    value.updatedAt >= value.createdAt
  );
}

export function isDataRequestEnvelope(
  value: unknown,
): value is DataRequestEnvelope {
  if (!isPlainObject(value) || !isAccountDataRequestView(value.request)) {
    return false;
  }
  return (
    (!Object.hasOwn(value, "existing") || typeof value.existing === "boolean") &&
    (!Object.hasOwn(value, "deferred") || typeof value.deferred === "boolean") &&
    (!Object.hasOwn(value, "message") || typeof value.message === "string")
  );
}

export function isDataRequestListEnvelope(
  value: unknown,
): value is Readonly<{ requests: AccountDataRequestView[] }> {
  return (
    isPlainObject(value) &&
    hasExactlyKeys(value, ["requests"]) &&
    Array.isArray(value.requests) &&
    value.requests.every(isAccountDataRequestView)
  );
}

export function isConsentTransitionEnvelope(
  value: unknown,
  expected: Readonly<{
    action: "grant" | "withdraw";
    policyVersion: string;
    purpose: ConsentPurpose;
  }>,
): value is ConsentTransitionEnvelope {
  if (
    !isPlainObject(value) ||
    !hasExactlyKeys(value, ["record", "replayed"]) ||
    typeof value.replayed !== "boolean" ||
    !isConsentRecordView(value.record)
  ) {
    return false;
  }
  const expectedStatus = expected.action === "grant" ? "granted" : "withdrawn";
  return (
    value.record.purpose === expected.purpose &&
    value.record.policyVersion === expected.policyVersion &&
    value.record.status === expectedStatus
  );
}

export function isConsentTransitionStatusPair(
  status: number,
  replayed: boolean,
): boolean {
  return replayed ? status === 200 : status === 201;
}

export function parseInstructorDataExport(
  body: string,
  declaredContentLength: string | null,
  expectedAccountId: string,
): unknown {
  if (!isSafeIdentifier(expectedAccountId)) return null;
  const byteLength = new TextEncoder().encode(body).byteLength;
  if (byteLength < 1 || byteLength > CLIENT_DATA_EXPORT_MAX_BYTES) return null;
  if (declaredContentLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(declaredContentLength)) return null;
    const declared = Number(declaredContentLength);
    if (!Number.isSafeInteger(declared) || declared !== byteLength) return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isPlainObject(value)) return null;
  if (
    value.exportVersion !== "roadmap-instructor-export.v1" ||
    value.scope !== "authenticated_instructor_workspace" ||
    !isSafeIdentifier(value.requestRecordId) ||
    !isIsoInstant(value.generatedAt) ||
    !Array.isArray(value.notes) ||
    !value.notes.every((note) => typeof note === "string") ||
    !isPlainObject(value.account) ||
    value.account.id !== expectedAccountId ||
    typeof value.account.primaryEmail !== "string" ||
    !value.account.primaryEmail.trim() ||
    (value.instructorProfile !== null && !isPlainObject(value.instructorProfile))
  ) {
    return null;
  }
  if (EXPORT_COLLECTION_KEYS.some((key) => !Array.isArray(value[key]))) {
    return null;
  }
  return value;
}

function isConsentRecordView(value: unknown): value is ConsentRecordView {
  if (
    !isPlainObject(value) ||
    !hasExactlyKeys(value, [
      "id",
      "purpose",
      "status",
      "policyVersion",
      "purposeDescription",
      "captureMethod",
      "grantedAt",
      "declinedAt",
      "withdrawnAt",
      "expiresAt",
      "createdAt",
    ])
  ) {
    return false;
  }
  if (
    !isSafeIdentifier(value.id) ||
    !CONSENT_PURPOSES.has(value.purpose as ConsentRecordView["purpose"]) ||
    !CONSENT_STATUSES.has(value.status as ConsentRecordView["status"]) ||
    typeof value.policyVersion !== "string" ||
    !value.policyVersion.trim() ||
    typeof value.purposeDescription !== "string" ||
    !value.purposeDescription.trim() ||
    !CONSENT_CAPTURE_METHODS.has(
      value.captureMethod as ConsentRecordView["captureMethod"],
    ) ||
    !isNullableEpoch(value.grantedAt) ||
    !isNullableEpoch(value.declinedAt) ||
    !isNullableEpoch(value.withdrawnAt) ||
    !isNullableEpoch(value.expiresAt) ||
    !isEpoch(value.createdAt)
  ) {
    return false;
  }
  if (value.status === "granted") {
    return value.grantedAt !== null && value.withdrawnAt === null;
  }
  if (value.status === "withdrawn") return value.withdrawnAt !== null;
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactlyKeys(
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

function isSafeIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

function isEpoch(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isNullableEpoch(value: unknown): value is number | null {
  return value === null || isEpoch(value);
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return false;
  }
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}
