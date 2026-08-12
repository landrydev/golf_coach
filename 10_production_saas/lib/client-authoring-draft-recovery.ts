export const AUTHORING_DRAFT_VERSION = "roadmap-authoring-draft.v1";
export const AUTHORING_DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1_000;
export const AUTHORING_DRAFT_MAX_VALUES_BYTES = 64 * 1_024;
export const AUTHORING_DRAFT_MAX_RECORD_BYTES = 72 * 1_024;

export type AuthoringDraftAction =
  | "plan_core_edit"
  | "staged_plan_complete"
  | "living_lesson_create"
  | "living_practice_create"
  | "living_evidence_create"
  | "living_review_create";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type AuthoringDraftScope = Readonly<{
  accountScope: string;
  resourceId: string;
  action: AuthoringDraftAction;
}>;

export type AuthoringDraftEnvelope = Readonly<{
  version: typeof AUTHORING_DRAFT_VERSION;
  scope: AuthoringDraftScope;
  owner: string;
  baseRevision: number;
  baseFingerprint: string;
  appliedFingerprint: string | null;
  values: Readonly<Record<string, string>>;
  ui: Readonly<Record<string, string | number>>;
  createdAt: number;
  expiresAt: number;
  integrity: string;
}>;

export type AuthoringDraftHandle = Readonly<{
  envelope: AuthoringDraftEnvelope;
  serialized: string;
}>;

export type AuthoringDraftReconciliation =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "applied" }>
  | Readonly<{ kind: "unchanged" | "diverged"; draft: AuthoringDraftHandle }>
  | Readonly<{ kind: "blocked"; reason: "unavailable" | "invalid" }>;

export type AuthoringDraftPersistResult =
  | Readonly<{ kind: "persisted"; draft: AuthoringDraftHandle }>
  | Readonly<{ kind: "blocked"; reason: "unavailable" | "invalid" }>;

const SAFE_SCOPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_OWNER = /^[A-Za-z0-9][A-Za-z0-9._:-]{19,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CLOCK_SKEW_MS = 5 * 60 * 1_000;
const BASE_PLAN_FIELDS = [
  "title",
  "goalStatement",
  "goalWhy",
  "goalContext",
  "assessmentSummary",
  "assessmentStrengths",
  "assessmentPrimaryPattern",
  "assessmentLimitations",
  "priorityTitle",
  "priorityRationale",
] as const;
const BASE_STAGED_FIELDS = [
  "assessmentSummary",
  "assessmentStrengths",
  "assessmentPrimaryPattern",
  "assessmentLimitations",
  "priorityTitle",
  "priorityRationale",
  "firstPhaseRationale",
  "firstPhaseProgressSignals",
  "firstPhasePackageId",
] as const;
const LIVING_FIELDS: Readonly<Record<Exclude<AuthoringDraftAction, "plan_core_edit" | "staged_plan_complete">, readonly string[]>> = {
  living_lesson_create: [
    "phaseId",
    "title",
    "occurredAt",
    "purpose",
    "coachObservation",
    "takeaway",
    "nextCheck",
    "phaseConnection",
  ],
  living_practice_create: [
    "phaseId",
    "title",
    "timeOrCadence",
    "objective",
    "rationale",
    "instructions",
    "successCheck",
    "commonMistake",
    "stopOrAskRule",
    "constraintNote",
  ],
  living_evidence_create: [
    "phaseId",
    "evidenceType",
    "contextType",
    "title",
    "observedAt",
    "sourceLabel",
    "sourceType",
    "claim",
    "interpretation",
    "limitation",
    "maturity",
    "nextEvidenceNeeded",
  ],
  living_review_create: [
    "phaseId",
    "transition",
    "outcome",
    "originalPurpose",
    "baselineSummary",
    "workCompleted",
    "changeSummary",
    "reliabilityLabel",
    "limitations",
    "golferContribution",
    "coachConclusion",
    "remainingOpportunity",
    "nextPhaseRationale",
    "independentPracticeAlternative",
  ],
};

/**
 * Persist the exact, bounded form draft before issuing its non-idempotent
 * mutation. A pre-existing malformed record is never overwritten silently.
 */
export async function persistAuthoringDraft(
  input: Readonly<{
    scope: AuthoringDraftScope;
    baseRevision: number;
    baseState: unknown;
    appliedState?: unknown;
    values: Readonly<Record<string, string>>;
    ui: Readonly<Record<string, string | number>>;
  }>,
  storage?: StorageLike,
  now: number = Date.now(),
): Promise<AuthoringDraftPersistResult> {
  if (
    !isValidScope(input.scope) ||
    !validRevision(input.baseRevision) ||
    !isValidValues(input.values, input.scope.action, input.ui) ||
    !isValidUi(input.ui, input.scope.action) ||
    !Number.isSafeInteger(now) ||
    now < 1
  ) {
    return { kind: "blocked", reason: "invalid" };
  }

  let resolved: StorageLike;
  let existing: string | null;
  try {
    resolved = resolveStorage(storage);
    proveStorageWritable(resolved, input.scope);
    existing = resolved.getItem(authoringDraftStorageKey(input.scope));
  } catch {
    return { kind: "blocked", reason: "unavailable" };
  }

  if (existing !== null) {
    const validated = await validateSerialized(existing, input.scope, now, false);
    if (!validated) return { kind: "blocked", reason: "invalid" };
  }

  try {
    const baseFingerprint = await fingerprintState(input.baseState);
    const appliedFingerprint = Object.hasOwn(input, "appliedState")
      ? await fingerprintState(input.appliedState)
      : null;
    const owner = randomOwner();
    const core = {
      version: AUTHORING_DRAFT_VERSION,
      scope: { ...input.scope },
      owner,
      baseRevision: input.baseRevision,
      baseFingerprint,
      appliedFingerprint,
      values: { ...input.values },
      ui: { ...input.ui },
      createdAt: now,
      expiresAt: now + AUTHORING_DRAFT_LIFETIME_MS,
    } as const;
    const integrity = await sha256(stableJson(core));
    const envelope: AuthoringDraftEnvelope = { ...core, integrity };
    const serialized = JSON.stringify(envelope);
    if (byteLength(serialized) > AUTHORING_DRAFT_MAX_RECORD_BYTES) {
      return { kind: "blocked", reason: "invalid" };
    }

    const key = authoringDraftStorageKey(input.scope);
    if (resolved.getItem(key) !== existing) {
      return { kind: "blocked", reason: "invalid" };
    }
    resolved.setItem(key, serialized);
    if (resolved.getItem(key) !== serialized) {
      return { kind: "blocked", reason: "unavailable" };
    }
    return { kind: "persisted", draft: { envelope, serialized } };
  } catch {
    return { kind: "blocked", reason: "unavailable" };
  }
}

/**
 * Compare a saved draft with the authoritative state on each mount. Only an
 * exact expected-state fingerprint may be classified as applied.
 */
export async function reconcileAuthoringDraft(
  input: Readonly<{
    scope: AuthoringDraftScope;
    currentRevision: number;
    currentState: unknown;
  }>,
  storage?: StorageLike,
  now: number = Date.now(),
): Promise<AuthoringDraftReconciliation> {
  if (!isValidScope(input.scope) || !validRevision(input.currentRevision)) {
    return { kind: "blocked", reason: "invalid" };
  }

  let resolved: StorageLike;
  let serialized: string | null;
  try {
    resolved = resolveStorage(storage);
    proveStorageWritable(resolved, input.scope);
    serialized = resolved.getItem(authoringDraftStorageKey(input.scope));
  } catch {
    return { kind: "blocked", reason: "unavailable" };
  }
  if (serialized === null) return { kind: "empty" };

  const envelope = await validateSerialized(serialized, input.scope, now, true);
  if (!envelope) return { kind: "blocked", reason: "invalid" };
  const draft = { envelope, serialized } as const;

  if (now >= envelope.expiresAt) {
    return clearAuthoringDraft(draft, resolved)
      ? { kind: "empty" }
      : { kind: "blocked", reason: "unavailable" };
  }

  let currentFingerprint: string;
  try {
    currentFingerprint = await fingerprintState(input.currentState);
  } catch {
    return { kind: "blocked", reason: "unavailable" };
  }

  if (
    input.currentRevision === envelope.baseRevision &&
    currentFingerprint === envelope.baseFingerprint
  ) {
    return { kind: "unchanged", draft };
  }
  if (
    input.currentRevision > envelope.baseRevision &&
    envelope.appliedFingerprint !== null &&
    currentFingerprint === envelope.appliedFingerprint
  ) {
    return clearAuthoringDraft(draft, resolved)
      ? { kind: "applied" }
      : { kind: "blocked", reason: "unavailable" };
  }
  return { kind: "diverged", draft };
}

export function clearAuthoringDraft(
  draft: AuthoringDraftHandle,
  storage?: StorageLike,
): boolean {
  try {
    const resolved = resolveStorage(storage);
    const key = authoringDraftStorageKey(draft.envelope.scope);
    if (resolved.getItem(key) !== draft.serialized) return false;
    resolved.removeItem(key);
    return resolved.getItem(key) === null;
  } catch {
    return false;
  }
}

/** Explicit user-directed removal for a record that cannot be trusted. */
export function discardAuthoringDraft(
  scope: AuthoringDraftScope,
  storage?: StorageLike,
): boolean {
  try {
    const resolved = resolveStorage(storage);
    const key = authoringDraftStorageKey(scope);
    resolved.removeItem(key);
    return resolved.getItem(key) === null;
  } catch {
    return false;
  }
}

export function authoringDraftStorageKey(scope: AuthoringDraftScope): string {
  if (!isValidScope(scope)) throw new Error("Invalid authoring draft scope.");
  return `roadmap:authoring-draft:v1:${scope.action}:${scope.accountScope}:${scope.resourceId}`;
}

export function captureAuthoringDraftValues(
  form: HTMLFormElement,
): Record<string, string> | null {
  try {
    const values: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [name, value] of new FormData(form).entries()) {
      if (typeof value !== "string" || Object.hasOwn(values, name)) return null;
      values[name] = value;
    }
    return values;
  } catch {
    return null;
  }
}

export function restoreAuthoringDraftValues(
  form: HTMLFormElement,
  values: Readonly<Record<string, string>>,
): boolean {
  try {
    for (const [name, value] of Object.entries(values)) {
      const control = form.elements.namedItem(name);
      if (
        (typeof RadioNodeList !== "undefined" && control instanceof RadioNodeList) ||
        typeof HTMLInputElement === "undefined" ||
        typeof HTMLTextAreaElement === "undefined" ||
        typeof HTMLSelectElement === "undefined" ||
        !(
          control instanceof HTMLInputElement ||
          control instanceof HTMLTextAreaElement ||
          control instanceof HTMLSelectElement
        )
      ) {
        return false;
      }
      if (control instanceof HTMLInputElement && control.type === "checkbox") {
        return false;
      }
      control.value = value;
      if (control.value !== value) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function canonicalAuthoringValues(
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      name.endsWith("ProgressSignals") || name === "firstPhaseProgressSignals"
        ? value
            .replace(/\r\n?/g, "\n")
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
            .join("\n")
        : value.replace(/\r\n?/g, "\n").trim(),
    ]),
  );
}

export function authoringDraftReviewText(
  draft: AuthoringDraftHandle,
  label: string,
): string {
  return [
    `${label} saved draft`,
    `Base revision: ${draft.envelope.baseRevision}`,
    `Saved: ${new Date(draft.envelope.createdAt).toISOString()}`,
    "",
    ...Object.entries(draft.envelope.values).map(
      ([name, value]) => `${name}:\n${value}`,
    ),
  ].join("\n\n");
}

async function validateSerialized(
  serialized: string,
  expectedScope: AuthoringDraftScope,
  now: number,
  allowExpired: boolean,
): Promise<AuthoringDraftEnvelope | null> {
  if (
    byteLength(serialized) > AUTHORING_DRAFT_MAX_RECORD_BYTES ||
    !Number.isSafeInteger(now) ||
    now < 1
  ) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isValidEnvelopeShape(value, expectedScope, now, allowExpired)) return null;
    const { integrity, ...core } = value;
    return (await sha256(stableJson(core))) === integrity ? value : null;
  } catch {
    return null;
  }
}

function isValidEnvelopeShape(
  value: unknown,
  expectedScope: AuthoringDraftScope,
  now: number,
  allowExpired: boolean,
): value is AuthoringDraftEnvelope {
  if (
    !isPlainObject(value) ||
    !hasExactlyKeys(value, [
      "version",
      "scope",
      "owner",
      "baseRevision",
      "baseFingerprint",
      "appliedFingerprint",
      "values",
      "ui",
      "createdAt",
      "expiresAt",
      "integrity",
    ]) ||
    value.version !== AUTHORING_DRAFT_VERSION ||
    !isPlainObject(value.scope) ||
    !hasExactlyKeys(value.scope, ["accountScope", "resourceId", "action"]) ||
    !sameScope(value.scope as AuthoringDraftScope, expectedScope) ||
    typeof value.owner !== "string" ||
    !SAFE_OWNER.test(value.owner) ||
    !validRevision(value.baseRevision) ||
    typeof value.baseFingerprint !== "string" ||
    !SHA256.test(value.baseFingerprint) ||
    !(value.appliedFingerprint === null ||
      (typeof value.appliedFingerprint === "string" && SHA256.test(value.appliedFingerprint))) ||
    !isPlainObject(value.values) ||
    !isPlainObject(value.ui) ||
    !isValidValues(value.values as Record<string, unknown>, expectedScope.action, value.ui as Record<string, unknown>) ||
    !isValidUi(value.ui as Record<string, unknown>, expectedScope.action) ||
    typeof value.createdAt !== "number" ||
    !Number.isSafeInteger(value.createdAt) ||
    typeof value.expiresAt !== "number" ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.createdAt < 1 ||
    value.expiresAt !== value.createdAt + AUTHORING_DRAFT_LIFETIME_MS ||
    value.createdAt > now + CLOCK_SKEW_MS ||
    (!allowExpired && now >= value.expiresAt) ||
    typeof value.integrity !== "string" ||
    !SHA256.test(value.integrity)
  ) {
    return false;
  }
  return byteLength(JSON.stringify(value.values)) <= AUTHORING_DRAFT_MAX_VALUES_BYTES;
}

function isValidScope(value: unknown): value is AuthoringDraftScope {
  return (
    isPlainObject(value) &&
    hasExactlyKeys(value, ["accountScope", "resourceId", "action"]) &&
    typeof value.accountScope === "string" &&
    SAFE_SCOPE.test(value.accountScope) &&
    typeof value.resourceId === "string" &&
    SAFE_SCOPE.test(value.resourceId) &&
    typeof value.action === "string" &&
    [
      "plan_core_edit",
      "staged_plan_complete",
      "living_lesson_create",
      "living_practice_create",
      "living_evidence_create",
      "living_review_create",
    ].includes(value.action)
  );
}

function isValidValues(
  values: Readonly<Record<string, unknown>>,
  action: AuthoringDraftAction,
  ui: Readonly<Record<string, unknown>>,
): values is Readonly<Record<string, string>> {
  if (!isPlainObject(values)) return false;
  const expected = expectedFields(action, ui);
  if (!expected || !hasExactlyKeys(values, expected)) return false;
  return Object.values(values).every(
    (value) => typeof value === "string" && byteLength(value) <= 8 * 1_024,
  );
}

function expectedFields(
  action: AuthoringDraftAction,
  ui: Readonly<Record<string, unknown>>,
): readonly string[] | null {
  if (action === "plan_core_edit") {
    if (ui.phaseCount !== 3 && ui.phaseCount !== 4) return null;
    return [
      ...BASE_PLAN_FIELDS,
      ...Array.from({ length: ui.phaseCount }, (_, index) => index + 1).flatMap(
        (number) => [
          `phase${number}Title`,
          `phase${number}Purpose`,
          `phase${number}Rationale`,
          `phase${number}ProgressSignals`,
        ],
      ),
    ];
  }
  if (action === "staged_plan_complete") {
    if (ui.phaseCount !== 3 && ui.phaseCount !== 4) return null;
    return [
      ...BASE_STAGED_FIELDS,
      ...Array.from({ length: ui.phaseCount }, (_, index) => index + 1).flatMap(
        (number) => [`phase${number}Title`, `phase${number}Purpose`],
      ),
    ];
  }
  const fields = LIVING_FIELDS[action];
  if (!fields) return null;
  if (action === "living_review_create" && ui.reviewTransition === "advance") {
    return [...fields, "nextPhaseId", "nextPriorityTitle", "nextPriorityRationale"];
  }
  return fields;
}

function isValidUi(
  ui: Readonly<Record<string, unknown>>,
  action: AuthoringDraftAction,
): ui is Readonly<Record<string, string | number>> {
  if (!isPlainObject(ui)) return false;
  if (action === "plan_core_edit" || action === "staged_plan_complete") {
    return hasExactlyKeys(ui, ["phaseCount"]) &&
      (ui.phaseCount === 3 || ui.phaseCount === 4);
  }
  if (action === "living_review_create") {
    return (
      hasExactlyKeys(ui, ["reviewTransition"]) &&
      typeof ui.reviewTransition === "string" &&
      ["continue", "pause", "advance", "complete_plan"].includes(ui.reviewTransition)
    );
  }
  return hasExactlyKeys(ui, []);
}

async function fingerprintState(value: unknown): Promise<string> {
  const serialized = stableJson(value);
  if (byteLength(serialized) > AUTHORING_DRAFT_MAX_VALUES_BYTES) {
    throw new Error("Authoritative state is too large.");
  }
  return sha256(serialized);
}

async function sha256(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto is unavailable.");
  const bytes = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (Array.isArray(value)) return value.map(stableValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  throw new Error("State is not canonical JSON data.");
}

function proveStorageWritable(storage: StorageLike, scope: AuthoringDraftScope): void {
  const probe = `roadmap:authoring-draft:probe:${scope.accountScope}:${scope.resourceId}`;
  storage.setItem(probe, AUTHORING_DRAFT_VERSION);
  if (storage.getItem(probe) !== AUTHORING_DRAFT_VERSION) {
    throw new Error("Storage write could not be verified.");
  }
  storage.removeItem(probe);
  if (storage.getItem(probe) !== null) {
    throw new Error("Storage cleanup could not be verified.");
  }
}

function resolveStorage(storage?: StorageLike): StorageLike {
  if (storage) return storage;
  if (typeof window === "undefined") throw new Error("Browser storage is unavailable.");
  return window.sessionStorage;
}

function randomOwner(): string {
  const owner = globalThis.crypto?.randomUUID?.();
  if (!owner || !SAFE_OWNER.test(owner)) throw new Error("Draft ownership is unavailable.");
  return owner;
}

function sameScope(left: AuthoringDraftScope, right: AuthoringDraftScope): boolean {
  return (
    left.accountScope === right.accountScope &&
    left.resourceId === right.resourceId &&
    left.action === right.action
  );
}

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 1_000_000;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactlyKeys(
  value: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
