import {
  clientMutationMalformedSuccess,
  requireClientMutationJson,
} from "./client-mutation-recovery.ts";
import { isCanonicalPublicHttpsUrl } from "./external-url-policy.ts";

export type ProfileMutationResponse = Readonly<{
  profile: Readonly<{
    displayName: string;
    businessName: string | null;
    professionalTitle: string | null;
    philosophy: string | null;
    bio: string | null;
    contactEmail: string;
    contactPhone: string | null;
    websiteUrl: string | null;
    provinceOrTerritory: string | null;
    city: string | null;
    location: string | null;
    accentColor: string | null;
    setupCompletedAt: number;
    updatedAt: number;
  }>;
  changedFields: readonly ProfileMutableField[];
  publicationImpact: Readonly<{
    invalidated: boolean;
    affectedPlans: number;
    revokedShareLinks: number;
    revokedShareSessions: number;
  }>;
}>;

export type ProfileMutationExpected = Readonly<{
  displayName: string;
  businessName: string | null;
  professionalTitle: string | null;
  philosophy: string | null;
  contactEmail: string;
  contactPhone: string | null;
  websiteUrl: string | null;
  provinceOrTerritory: string | null;
  city: string | null;
  accentColor: string | null;
  previousUpdatedAt: number | null;
}>;

const PROFILE_MUTABLE_FIELDS = [
  "displayName",
  "businessName",
  "professionalTitle",
  "philosophy",
  "contactEmail",
  "contactPhone",
  "websiteUrl",
  "provinceOrTerritory",
  "city",
  "accentColor",
] as const;

type ProfileMutableField = (typeof PROFILE_MUTABLE_FIELDS)[number];

export type PackageLifecycleMutationResponse = Readonly<{
  package: Readonly<{
    id: string;
    title: string;
    name: string;
    description: string;
    purpose: string;
    fitDescription: string;
    status: "draft" | "active" | "archived";
    priceCents: number | null;
    priceAmountMinor: number | null;
    currency: string | null;
    currentDetailsText: string | null;
    inclusions: string[];
    cadence: string | null;
    practiceExpectation: string | null;
    evaluationDescription: string | null;
    terms: string;
    termsSummary: string | null;
    externalActionType: "booking" | "purchase" | "contact" | "other";
    externalActionLabel: string;
    externalActionUrl: string;
    isDefault: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
  affectedPlans: number;
  revokedShareLinks: number;
}>;

export type PackageLifecycleExpectedPackage = Readonly<
  Omit<PackageLifecycleMutationResponse["package"], "updatedAt"> & {
    previousUpdatedAt: number;
  }
>;

export type PlanContentKind = "lesson" | "practice" | "evidence" | "review";
export type WithdrawablePlanContentKind = Exclude<PlanContentKind, "review">;

export type PlanEditorMutationResponse = Readonly<{
  plan: Readonly<{
    id: string;
    status: "draft";
    revision: number;
    updatedAt: number;
  }>;
  revokedShareLinks: number;
}>;

export type StagedCompletionMutationResponse = Readonly<{
  completed: true;
  golfer: Readonly<{ id: string; displayName: string }>;
  plan: Readonly<{
    id: string;
    title: string;
    status: "draft";
    revision: number;
  }>;
  assessment: Readonly<{ id: string }>;
  priority: Readonly<{ id: string }>;
  phases: ReadonlyArray<
    Readonly<{
      id: string;
      number: number;
      title: string;
      purpose: string;
      status: "active" | "planned";
    }>
  >;
}>;

/**
 * Accept one exact successful HTTP status and one route-specific JSON shape.
 * A malformed 2xx acknowledgement cannot prove what committed, so it must use
 * the same outcome-unknown recovery path as a truncated response body.
 */
export async function requireExactClientMutationJson<T>(
  response: Response,
  expectedStatus: number,
  isExpectedSuccess: (value: unknown) => value is T,
  fallback: string,
): Promise<T> {
  if (response.ok && response.status !== expectedStatus) {
    throw clientMutationMalformedSuccess(response);
  }
  return requireClientMutationJson<T>(
    response,
    isExpectedSuccess,
    fallback,
  );
}

export function isProfileMutationResponse(
  value: unknown,
  expected: ProfileMutationExpected,
): value is ProfileMutationResponse {
  if (
    !isPlainObject(value) ||
    !hasExactlyKeys(value, ["profile", "changedFields", "publicationImpact"]) ||
    !isPlainObject(value.profile) ||
    !hasExactlyKeys(value.profile, [
      "displayName",
      "businessName",
      "professionalTitle",
      "philosophy",
      "bio",
      "contactEmail",
      "contactPhone",
      "websiteUrl",
      "provinceOrTerritory",
      "city",
      "location",
      "accentColor",
      "setupCompletedAt",
      "updatedAt",
    ]) ||
    !isOrderedProfileFieldList(value.changedFields) ||
    !isPlainObject(value.publicationImpact)
  ) {
    return false;
  }
  const profile = value.profile;
  const impact = value.publicationImpact;
  if (
    !isNonnegativeInteger(profile.setupCompletedAt) ||
    !isNonnegativeInteger(profile.updatedAt)
  ) {
    return false;
  }
  if (
    !hasExactlyKeys(impact, [
      "invalidated",
      "affectedPlans",
      "revokedShareLinks",
      "revokedShareSessions",
    ]) ||
    typeof impact.invalidated !== "boolean" ||
    !isNonnegativeInteger(impact.affectedPlans) ||
    !isNonnegativeInteger(impact.revokedShareLinks) ||
    !isNonnegativeInteger(impact.revokedShareSessions)
  ) {
    return false;
  }

  const noInvalidationCounts =
    impact.affectedPlans === 0 &&
    impact.revokedShareLinks === 0 &&
    impact.revokedShareSessions === 0;
  const previousUpdatedAt = expected.previousUpdatedAt;
  const impactConsistent = previousUpdatedAt === null
    ? !impact.invalidated &&
      noInvalidationCounts &&
      isInitialProfileFieldList(value.changedFields) &&
      profile.setupCompletedAt === profile.updatedAt
    : value.changedFields.length === 0
      ? !impact.invalidated &&
        noInvalidationCounts &&
        profile.updatedAt === previousUpdatedAt
      : impact.invalidated && profile.updatedAt > previousUpdatedAt;

  return (
    profile.displayName === expected.displayName &&
    profile.businessName === expected.businessName &&
    profile.professionalTitle === expected.professionalTitle &&
    profile.philosophy === expected.philosophy &&
    profile.bio === expected.philosophy &&
    profile.contactEmail === expected.contactEmail &&
    profile.contactPhone === expected.contactPhone &&
    profile.websiteUrl === expected.websiteUrl &&
    profile.provinceOrTerritory === expected.provinceOrTerritory &&
    profile.city === expected.city &&
    profile.location === canonicalProfileLocation(expected) &&
    profile.accentColor === expected.accentColor &&
    profile.updatedAt >= profile.setupCompletedAt &&
    impactConsistent
  );
}

/** Mirror the server's canonical form-field transforms for receipt binding. */
export function profileMutationExpectedFromForm(
  value: Readonly<Record<string, unknown>>,
  previousUpdatedAt: number | null,
): ProfileMutationExpected {
  return {
    displayName: canonicalProfileText(value.displayName),
    businessName: canonicalOptionalProfileText(value.businessName),
    professionalTitle: canonicalOptionalProfileText(value.professionalTitle),
    philosophy: canonicalOptionalProfileText(value.philosophy),
    contactEmail: canonicalProfileText(value.contactEmail).toLowerCase(),
    contactPhone: canonicalOptionalProfileText(value.contactPhone),
    websiteUrl: canonicalOptionalProfileExternalUrl(value.websiteUrl),
    provinceOrTerritory: canonicalOptionalProfileText(value.provinceOrTerritory),
    city: canonicalOptionalProfileText(value.city),
    accentColor: canonicalOptionalProfileText(value.accentColor),
    previousUpdatedAt,
  };
}

export function isPackageLifecycleMutationResponse(
  value: unknown,
  expected: Readonly<{
    package: PackageLifecycleExpectedPackage;
  }>,
): value is PackageLifecycleMutationResponse {
  if (
    !isPlainObject(value) ||
    !hasExactlyKeys(value, ["package", "affectedPlans", "revokedShareLinks"]) ||
    !isPlainObject(value.package) ||
    !hasExactlyKeys(value.package, [
      "id",
      "title",
      "name",
      "description",
      "purpose",
      "fitDescription",
      "status",
      "priceCents",
      "priceAmountMinor",
      "currency",
      "currentDetailsText",
      "inclusions",
      "cadence",
      "practiceExpectation",
      "evaluationDescription",
      "terms",
      "termsSummary",
      "externalActionType",
      "externalActionLabel",
      "externalActionUrl",
      "isDefault",
      "createdAt",
      "updatedAt",
    ]) ||
    !isNonnegativeInteger(value.affectedPlans) ||
    !isNonnegativeInteger(value.revokedShareLinks) ||
    (value.affectedPlans === 0 && value.revokedShareLinks !== 0) ||
    !isCanonicalPackageReceipt(value.package)
  ) {
    return false;
  }

  const received = value.package;
  const intended = expected.package;
  return (
    received.id === intended.id &&
    received.title === intended.title &&
    received.name === intended.name &&
    received.description === intended.description &&
    received.purpose === intended.purpose &&
    received.fitDescription === intended.fitDescription &&
    received.status === intended.status &&
    received.priceCents === intended.priceCents &&
    received.priceAmountMinor === intended.priceAmountMinor &&
    received.currency === intended.currency &&
    received.currentDetailsText === intended.currentDetailsText &&
    Array.isArray(received.inclusions) &&
    received.inclusions.length === intended.inclusions.length &&
    received.inclusions.every(
      (item, index) => item === intended.inclusions[index],
    ) &&
    received.cadence === intended.cadence &&
    received.practiceExpectation === intended.practiceExpectation &&
    received.evaluationDescription === intended.evaluationDescription &&
    received.terms === intended.terms &&
    received.termsSummary === intended.termsSummary &&
    received.externalActionType === intended.externalActionType &&
    received.externalActionLabel === intended.externalActionLabel &&
    received.externalActionUrl === intended.externalActionUrl &&
    received.isDefault === intended.isDefault &&
    received.createdAt === intended.createdAt &&
    isNonnegativeInteger(received.updatedAt) &&
    received.updatedAt > intended.previousUpdatedAt &&
    received.updatedAt >= received.createdAt
  );
}

function isCanonicalPackageReceipt(
  value: Record<string, unknown>,
): boolean {
  const price = value.priceAmountMinor;
  const status = value.status;
  return (
    isIdentifier(value.id) &&
    isCanonicalText(value.title, 120, true) &&
    value.name === value.title &&
    isCanonicalText(value.description, 1_500, true) &&
    isCanonicalText(value.purpose, 1_500, true) &&
    isCanonicalText(value.fitDescription, 1_500, true) &&
    (status === "draft" || status === "active" || status === "archived") &&
    (price === null ||
      (Number.isSafeInteger(price) &&
        (price as number) >= 0 &&
        (price as number) <= 10_000_000)) &&
    value.priceCents === price &&
    (price === null
      ? value.currency === null
      : typeof value.currency === "string" &&
        /^[A-Z]{3}$/.test(value.currency)) &&
    isOptionalCanonicalText(value.currentDetailsText, 500) &&
    (price !== null || value.currentDetailsText !== null) &&
    Array.isArray(value.inclusions) &&
    value.inclusions.length <= 20 &&
    value.inclusions.every((item) => isCanonicalText(item, 200, true)) &&
    isOptionalCanonicalText(value.cadence, 300) &&
    isOptionalCanonicalText(value.practiceExpectation, 1_000) &&
    isOptionalCanonicalText(value.evaluationDescription, 1_000) &&
    isCanonicalText(value.terms, 1_500, true) &&
    value.termsSummary === value.terms &&
    (value.externalActionType === "booking" ||
      value.externalActionType === "purchase" ||
      value.externalActionType === "contact" ||
      value.externalActionType === "other") &&
    isCanonicalText(value.externalActionLabel, 120, true) &&
    isCanonicalPublicHttpsUrl(value.externalActionUrl) &&
    typeof value.isDefault === "boolean" &&
    (!value.isDefault || status === "active") &&
    isNonnegativeInteger(value.createdAt) &&
    isNonnegativeInteger(value.updatedAt)
  );
}

function isCanonicalText(
  value: unknown,
  maximumLength: number,
  required: boolean,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= maximumLength &&
    value === value.replace(/\r\n?/g, "\n").trim() &&
    (!required || value.length > 0)
  );
}

function isOptionalCanonicalText(
  value: unknown,
  maximumLength: number,
): value is string | null {
  return value === null || isCanonicalText(value, maximumLength, true);
}

export function isPlanContentCreatedResponse(
  value: unknown,
  expected: Readonly<{
    kind: PlanContentKind;
    revision: number;
  }>,
): value is Readonly<{
  item: Readonly<{ id: string; kind: PlanContentKind }>;
  plan: Readonly<{ revision: number; status?: "draft" | "paused" | "completed" }>;
}> {
  if (
    !isPlainObject(value) ||
    !hasExactlyKeys(value, ["item", "plan"]) ||
    !isPlainObject(value.item) ||
    !hasExactlyKeys(value.item, ["id", "kind"]) ||
    !isPlainObject(value.plan) ||
    !hasOnlyKeys(value.plan, ["revision", "status"]) ||
    !Object.hasOwn(value.plan, "revision")
  ) {
    return false;
  }
  return (
    isIdentifier(value.item.id) &&
    value.item.kind === expected.kind &&
    value.plan.revision === expected.revision &&
    (!Object.hasOwn(value.plan, "status") ||
      value.plan.status === "draft" ||
      value.plan.status === "paused" ||
      value.plan.status === "completed")
  );
}

export function isPlanContentWithdrawnResponse(
  value: unknown,
  expected: Readonly<{
    itemId: string;
    kind: WithdrawablePlanContentKind;
    revision: number;
  }>,
): value is Readonly<{
  withdrawn: true;
  item: Readonly<{ id: string; kind: WithdrawablePlanContentKind }>;
  plan: Readonly<{ revision: number }>;
}> {
  return (
    isPlainObject(value) &&
    hasExactlyKeys(value, ["withdrawn", "item", "plan"]) &&
    value.withdrawn === true &&
    isPlainObject(value.item) &&
    hasExactlyKeys(value.item, ["id", "kind"]) &&
    value.item.id === expected.itemId &&
    value.item.kind === expected.kind &&
    isPlainObject(value.plan) &&
    hasExactlyKeys(value.plan, ["revision"]) &&
    value.plan.revision === expected.revision
  );
}

export function isGolferUpdatedResponse(
  value: unknown,
): value is Readonly<{ updated: true }> {
  return (
    isPlainObject(value) &&
    hasExactlyKeys(value, ["updated"]) &&
    value.updated === true
  );
}

export function isPlanEditorMutationResponse(
  value: unknown,
  expected: Readonly<{ planId: string; revision: number }>,
): value is PlanEditorMutationResponse {
  return (
    isPlainObject(value) &&
    hasExactlyKeys(value, ["plan", "revokedShareLinks"]) &&
    isPlainObject(value.plan) &&
    hasExactlyKeys(value.plan, ["id", "status", "revision", "updatedAt"]) &&
    value.plan.id === expected.planId &&
    value.plan.status === "draft" &&
    value.plan.revision === expected.revision &&
    isNonnegativeInteger(value.plan.updatedAt) &&
    isNonnegativeInteger(value.revokedShareLinks)
  );
}

export function isStagedCompletionMutationResponse(
  value: unknown,
  expected: Readonly<{
    golferId: string;
    planId: string;
    revision: number;
    phaseCount: 3 | 4;
  }>,
): value is StagedCompletionMutationResponse {
  if (
    !isPlainObject(value) ||
    !hasExactlyKeys(value, [
      "completed",
      "golfer",
      "plan",
      "assessment",
      "priority",
      "phases",
    ]) ||
    value.completed !== true ||
    !isPlainObject(value.golfer) ||
    !hasExactlyKeys(value.golfer, ["id", "displayName"]) ||
    value.golfer.id !== expected.golferId ||
    !isNonemptyText(value.golfer.displayName) ||
    !isPlainObject(value.plan) ||
    !hasExactlyKeys(value.plan, ["id", "title", "status", "revision"]) ||
    value.plan.id !== expected.planId ||
    !isNonemptyText(value.plan.title) ||
    value.plan.status !== "draft" ||
    value.plan.revision !== expected.revision ||
    !isPlainObject(value.assessment) ||
    !hasExactlyKeys(value.assessment, ["id"]) ||
    !isIdentifier(value.assessment.id) ||
    !isPlainObject(value.priority) ||
    !hasExactlyKeys(value.priority, ["id"]) ||
    !isIdentifier(value.priority.id) ||
    !Array.isArray(value.phases) ||
    value.phases.length !== expected.phaseCount
  ) {
    return false;
  }

  return value.phases.every((phase, index) => {
    if (!isPlainObject(phase)) return false;
    return (
      hasExactlyKeys(phase, ["id", "number", "title", "purpose", "status"]) &&
      isIdentifier(phase.id) &&
      phase.number === index + 1 &&
      isNonemptyText(phase.title) &&
      isNonemptyText(phase.purpose) &&
      phase.status === (index === 0 ? "active" : "planned")
    );
  });
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

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function isNonemptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOrderedProfileFieldList(
  value: unknown,
): value is ProfileMutableField[] {
  if (!Array.isArray(value)) return false;
  let previousIndex = -1;
  for (const field of value) {
    const index = PROFILE_MUTABLE_FIELDS.indexOf(field as ProfileMutableField);
    if (index <= previousIndex) return false;
    previousIndex = index;
  }
  return true;
}

function isInitialProfileFieldList(value: readonly ProfileMutableField[]): boolean {
  return (
    value.length === PROFILE_MUTABLE_FIELDS.length &&
    value.every((field, index) => field === PROFILE_MUTABLE_FIELDS[index])
  );
}

function canonicalProfileText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

function canonicalOptionalProfileText(value: unknown): string | null {
  return canonicalProfileText(value) || null;
}

function canonicalOptionalProfileExternalUrl(value: unknown): string | null {
  const text = canonicalProfileText(value);
  if (!text) return null;
  try {
    return new URL(text).toString();
  } catch {
    // Invalid input cannot produce a successful server receipt; retaining the
    // submitted text keeps this expectation builder non-authoritative.
    return text;
  }
}

function canonicalProfileLocation(
  expected: Pick<
    ProfileMutationExpected,
    "city" | "provinceOrTerritory"
  >,
): string | null {
  return [expected.city, expected.provinceOrTerritory].filter(Boolean).join(", ") || null;
}
