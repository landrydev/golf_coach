import {
  isClientMutationApiError,
  isClientMutationOutcomeUnknown,
} from "./client-mutation-recovery.ts";
import { isSafeMailtoAddress } from "./mailto.ts";

export const KEYED_ATTEMPT_VERSION = "roadmap-keyed-attempt.v2";
export const KEYED_ATTEMPT_LIFETIME_MS = 24 * 60 * 60 * 1_000;
export const KEYED_ATTEMPT_MAX_BODY_BYTES = 64 * 1024;
export const KEYED_ATTEMPT_MAX_RECORD_BYTES = 72 * 1024;

export type KeyedAttemptOperation =
  | "golfer_full_create"
  | "golfer_staged_create"
  | "package_create"
  | "data_request_manual_create"
  | "data_request_deletion_create";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type KeyedAttemptRecord = Readonly<{
  version: typeof KEYED_ATTEMPT_VERSION;
  accountScope: string;
  operation: KeyedAttemptOperation;
  owner: string;
  key: string;
  body: string;
  ui: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}>;

export type KeyedAttemptBlockedReason =
  | "unavailable"
  | "invalid"
  | "expired"
  | "legacy";

export type KeyedAttemptLoadResult =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "restored"; attempt: KeyedAttemptRecord }>
  | Readonly<{
      kind: "blocked";
      reason: KeyedAttemptBlockedReason;
    }>;

export type KeyedAttemptRetryReadiness =
  | "ready"
  | "expired"
  | "blocked";

export type KeyedAttemptMutationDisposition =
  | "retry_exact"
  | "reconcile_required"
  | "definitive_failure";

export type RestoredFormValue = string | boolean;

const RECOVERY_REQUIRED_CODES = new Set([
  "idempotency_record_incomplete",
  "idempotency_key_reused",
]);
const SAFE_SCOPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{19,127}$/;
const KEYED_ATTEMPT_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const LEGACY_KEYED_ATTEMPT_STORAGE_VERSION = "v1";
const MANUAL_REVIEW_TYPES = new Set([
  "access",
  "correction",
  "restriction",
  "consent_withdrawal",
]);

export class KeyedAttemptStorageError extends Error {
  constructor() {
    super("This browser tab cannot safely persist the pending operation.");
    this.name = "KeyedAttemptStorageError";
  }
}

export function keyedAttemptStorageKey(
  accountScope: string,
  operation: KeyedAttemptOperation,
): string {
  if (!SAFE_SCOPE.test(accountScope)) throw new KeyedAttemptStorageError();
  return `roadmap:keyed-attempt:v2:${operation}:${accountScope}`;
}

export function loadKeyedAttempt(
  accountScope: string,
  operation: KeyedAttemptOperation,
  storage?: StorageLike,
  createOwner: () => string = defaultAttemptOwner,
  now: number = Date.now(),
): KeyedAttemptLoadResult {
  let resolved: StorageLike;
  let raw: string | null;
  try {
    if (!isValidNow(now)) return { kind: "blocked", reason: "invalid" };
    resolved = resolveStorage(storage);
    proveStorageWritable(resolved, accountScope);
    const key = keyedAttemptStorageKey(accountScope, operation);
    raw = resolved.getItem(key);
    const legacyKey = legacyKeyedAttemptStorageKey(accountScope, operation);
    const legacyRaw = resolved.getItem(legacyKey);
    if (legacyRaw !== null) {
      if (!compareAndRemove(resolved, legacyKey, legacyRaw)) {
        return { kind: "blocked", reason: "unavailable" };
      }
      if (raw === null) return { kind: "blocked", reason: "legacy" };
    }
  } catch {
    return { kind: "blocked", reason: "unavailable" };
  }
  if (raw === null) return { kind: "empty" };
  if (byteLength(raw) > KEYED_ATTEMPT_MAX_RECORD_BYTES) {
    return { kind: "blocked", reason: "invalid" };
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!isValidRecord(value, accountScope, operation)) {
      return { kind: "blocked", reason: "invalid" };
    }
    if (value.createdAt > now + KEYED_ATTEMPT_CLOCK_SKEW_MS) {
      return { kind: "blocked", reason: "invalid" };
    }
    if (now >= value.expiresAt) {
      const key = keyedAttemptStorageKey(accountScope, operation);
      return compareAndRemove(resolved, key, raw)
        ? { kind: "blocked", reason: "expired" }
        : { kind: "blocked", reason: "unavailable" };
    }
    const claimed: KeyedAttemptRecord = {
      ...value,
      owner: createOwner(),
    };
    if (!isValidRecord(claimed, accountScope, operation)) {
      return { kind: "blocked", reason: "invalid" };
    }
    const claimedRaw = JSON.stringify(claimed);
    const key = keyedAttemptStorageKey(accountScope, operation);
    if (
      byteLength(claimedRaw) > KEYED_ATTEMPT_MAX_RECORD_BYTES ||
      resolved.getItem(key) !== raw
    ) {
      return { kind: "blocked", reason: "invalid" };
    }
    resolved.setItem(key, claimedRaw);
    if (resolved.getItem(key) !== claimedRaw) {
      return { kind: "blocked", reason: "unavailable" };
    }
    return { kind: "restored", attempt: claimed };
  } catch {
    return { kind: "blocked", reason: "invalid" };
  }
}

export function persistKeyedAttempt(
  input: Readonly<{
    accountScope: string;
    operation: KeyedAttemptOperation;
    key: string;
    body: string;
    ui: Record<string, unknown>;
  }>,
  storage?: StorageLike,
  createOwner: () => string = defaultAttemptOwner,
  now: number = Date.now(),
): KeyedAttemptRecord {
  if (!isValidNow(now) || !Number.isSafeInteger(now + KEYED_ATTEMPT_LIFETIME_MS)) {
    throw new KeyedAttemptStorageError();
  }
  const attempt: KeyedAttemptRecord = {
    version: KEYED_ATTEMPT_VERSION,
    accountScope: input.accountScope,
    operation: input.operation,
    owner: createOwner(),
    key: input.key,
    body: input.body,
    ui: input.ui,
    createdAt: now,
    expiresAt: now + KEYED_ATTEMPT_LIFETIME_MS,
  };
  if (!isValidRecord(attempt, input.accountScope, input.operation)) {
    throw new KeyedAttemptStorageError();
  }
  const serialized = JSON.stringify(attempt);
  if (byteLength(serialized) > KEYED_ATTEMPT_MAX_RECORD_BYTES) {
    throw new KeyedAttemptStorageError();
  }
  try {
    const resolved = resolveStorage(storage);
    const storageKey = keyedAttemptStorageKey(
      input.accountScope,
      input.operation,
    );
    const legacyStorageKey = legacyKeyedAttemptStorageKey(
      input.accountScope,
      input.operation,
    );
    if (
      resolved.getItem(storageKey) !== null ||
      resolved.getItem(legacyStorageKey) !== null
    ) {
      throw new Error("an attempt is already persisted");
    }
    resolved.setItem(storageKey, serialized);
    if (resolved.getItem(storageKey) !== serialized) {
      throw new Error("storage verification failed");
    }
  } catch {
    throw new KeyedAttemptStorageError();
  }
  return attempt;
}

export function clearKeyedAttempt(
  attempt: KeyedAttemptRecord,
  storage?: StorageLike,
): boolean {
  try {
    const resolved = resolveStorage(storage);
    if (!isValidRecord(attempt, attempt.accountScope, attempt.operation)) {
      return false;
    }
    const key = keyedAttemptStorageKey(
      attempt.accountScope,
      attempt.operation,
    );
    if (resolved.getItem(key) !== JSON.stringify(attempt)) return false;
    resolved.removeItem(key);
    return resolved.getItem(key) === null;
  } catch {
    return false;
  }
}

/**
 * Rechecks the exact owned record immediately before a retry. This prevents a
 * long-lived tab from sending a saved operation after its bounded recovery
 * window or after a successor mount has claimed the storage slot.
 */
export function keyedAttemptRetryReadiness(
  attempt: KeyedAttemptRecord,
  storage?: StorageLike,
  now: number = Date.now(),
): KeyedAttemptRetryReadiness {
  if (
    !isValidNow(now) ||
    !isValidRecord(attempt, attempt.accountScope, attempt.operation) ||
    attempt.createdAt > now + KEYED_ATTEMPT_CLOCK_SKEW_MS
  ) {
    return "blocked";
  }
  try {
    const resolved = resolveStorage(storage);
    const key = keyedAttemptStorageKey(
      attempt.accountScope,
      attempt.operation,
    );
    const serialized = JSON.stringify(attempt);
    if (resolved.getItem(key) !== serialized) return "blocked";
    if (now < attempt.expiresAt) return "ready";
    return compareAndRemove(resolved, key, serialized) ? "expired" : "blocked";
  } catch {
    return "blocked";
  }
}

export function keyedAttemptMutationDisposition(
  error: unknown,
): KeyedAttemptMutationDisposition {
  if (isClientMutationOutcomeUnknown(error)) return "retry_exact";
  if (
    isClientMutationApiError(error) &&
    ((error.code !== null && RECOVERY_REQUIRED_CODES.has(error.code)) ||
      (error.status === 409 && error.code === null))
  ) {
    return "reconcile_required";
  }
  return "definitive_failure";
}

export function keyedAttemptBlockedMessage(
  action: string,
  reason?: KeyedAttemptBlockedReason,
): string {
  if (reason === "expired") {
    return (
      `Roadmap retired this tab's saved ${action} attempt after its 24-hour ` +
      "recovery window. Reload and inspect the authoritative workspace record " +
      "before deciding whether to submit anything new."
    );
  }
  if (reason === "legacy") {
    return (
      `Roadmap retired an older saved ${action} attempt that cannot be safely ` +
      "age-checked. Reload and inspect the authoritative workspace record " +
      "before deciding whether to submit anything new."
    );
  }
  return (
    `Roadmap cannot safely reconcile the saved ${action} attempt in this tab, ` +
    "so it will not create a new attempt. Reload and inspect the authoritative " +
    "workspace record, then contact support if the result is not present."
  );
}

export function keyedAttemptReceiptBlockedMessage(action: string): string {
  return (
    `Roadmap received an incomplete or conflicting operation receipt for ${action} ` +
    "and will not retry or replace the saved attempt. Reload and inspect the " +
    "authoritative workspace record, then contact support if the result is not present."
  );
}

/**
 * Match a receipt field against the exact text transform performed by
 * `cleanText` after a keyed request has been accepted by the server. Keeping
 * the comparison here prevents a committed save from becoming an ambiguous
 * client outcome merely because the server normalized line endings or outer
 * whitespace.
 */
export function matchesCanonicalKeyedAttemptText(
  received: unknown,
  submitted: RestoredFormValue,
): received is string {
  const canonical = canonicalKeyedAttemptText(submitted);
  return canonical !== null && received === canonical;
}

export function matchesCanonicalKeyedAttemptOptionalText(
  received: unknown,
  submitted: RestoredFormValue,
): received is string | null {
  const canonical = canonicalKeyedAttemptText(submitted);
  return canonical !== null && received === (canonical || null);
}

export function matchesCanonicalKeyedAttemptEmail(
  received: unknown,
  submitted: RestoredFormValue,
): received is string | null {
  const canonical = canonicalKeyedAttemptText(submitted);
  if (canonical === null) return false;
  if (!canonical) return received === null;
  const email = canonical.toLowerCase();
  return isSafeMailtoAddress(email) && received === email;
}

export function matchesCanonicalKeyedAttemptExternalUrl(
  received: unknown,
  submitted: RestoredFormValue,
): received is string {
  const canonical = canonicalKeyedAttemptExternalUrl(submitted);
  return canonical !== null && received === canonical;
}

export function restoreFormControlValues(
  form: HTMLFormElement,
  values: Readonly<Record<string, RestoredFormValue>>,
): boolean {
  try {
    for (const [name, value] of Object.entries(values)) {
      const control = form.elements.namedItem(name);
      if (
        (typeof RadioNodeList !== "undefined" &&
          control instanceof RadioNodeList) ||
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
        if (typeof value !== "boolean") return false;
        control.checked = value;
      } else {
        if (typeof value !== "string") return false;
        control.value = value;
        if (control.value !== value) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function isValidRecord(
  value: unknown,
  expectedAccountScope: string,
  expectedOperation: KeyedAttemptOperation,
): value is KeyedAttemptRecord {
  if (!isPlainObject(value) || !hasExactlyKeys(value, [
    "version",
    "accountScope",
    "operation",
    "owner",
    "key",
    "body",
    "ui",
    "createdAt",
    "expiresAt",
  ])) {
    return false;
  }
  if (
    value.version !== KEYED_ATTEMPT_VERSION ||
    value.accountScope !== expectedAccountScope ||
    value.operation !== expectedOperation ||
    !SAFE_SCOPE.test(expectedAccountScope) ||
    typeof value.owner !== "string" ||
    !SAFE_KEY.test(value.owner) ||
    typeof value.key !== "string" ||
    !SAFE_KEY.test(value.key) ||
    typeof value.body !== "string" ||
    byteLength(value.body) < 2 ||
    byteLength(value.body) > KEYED_ATTEMPT_MAX_BODY_BYTES ||
    !isPlainObject(value.ui) ||
    !isValidUi(value.ui, expectedOperation) ||
    typeof value.createdAt !== "number" ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 1 ||
    typeof value.expiresAt !== "number" ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt !== value.createdAt + KEYED_ATTEMPT_LIFETIME_MS
  ) {
    return false;
  }
  try {
    return isPlainObject(JSON.parse(value.body));
  } catch {
    return false;
  }
}

function isValidUi(
  ui: Record<string, unknown>,
  operation: KeyedAttemptOperation,
): boolean {
  switch (operation) {
    case "golfer_full_create":
      return (
        hasExactlyKeys(ui, ["phaseCount"]) &&
        (ui.phaseCount === 3 || ui.phaseCount === 4)
      );
    case "golfer_staged_create":
    case "data_request_deletion_create":
      return hasExactlyKeys(ui, []);
    case "package_create":
      return (
        hasExactlyKeys(ui, ["priceText"]) &&
        typeof ui.priceText === "string" &&
        byteLength(ui.priceText) <= 64
      );
    case "data_request_manual_create":
      return (
        hasExactlyKeys(ui, ["reviewType", "reviewDetails"]) &&
        typeof ui.reviewType === "string" &&
        MANUAL_REVIEW_TYPES.has(ui.reviewType) &&
        typeof ui.reviewDetails === "string" &&
        ui.reviewDetails.length > 0 &&
        ui.reviewDetails.length <= 1_000
      );
  }
}

function resolveStorage(storage?: StorageLike): StorageLike {
  if (storage) return storage;
  if (typeof window === "undefined") throw new KeyedAttemptStorageError();
  return window.sessionStorage;
}

function legacyKeyedAttemptStorageKey(
  accountScope: string,
  operation: KeyedAttemptOperation,
): string {
  return `roadmap:keyed-attempt:${LEGACY_KEYED_ATTEMPT_STORAGE_VERSION}:${operation}:${accountScope}`;
}

function compareAndRemove(
  storage: StorageLike,
  key: string,
  expected: string,
): boolean {
  if (storage.getItem(key) !== expected) return false;
  storage.removeItem(key);
  return storage.getItem(key) === null;
}

function isValidNow(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function canonicalKeyedAttemptText(value: RestoredFormValue): string | null {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").trim()
    : null;
}

function canonicalKeyedAttemptExternalUrl(
  value: RestoredFormValue,
): string | null {
  const text = canonicalKeyedAttemptText(value);
  if (!text) return null;

  try {
    const parsed = new URL(text);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !isCanonicalPublicHostname(parsed.hostname)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isCanonicalPublicHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname.length > 253 || !hostname.includes(".")) return false;
  if (hostname.includes(":") || /^\d+(?:\.\d+){3}$/.test(hostname)) return false;

  const blockedSuffixes = [
    "localhost",
    "local",
    "internal",
    "home.arpa",
    "test",
    "invalid",
    "example",
  ];
  if (
    blockedSuffixes.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    )
  ) {
    return false;
  }

  return hostname
    .split(".")
    .every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    );
}

function proveStorageWritable(storage: StorageLike, accountScope: string): void {
  const probe = `roadmap:keyed-attempt:probe:${accountScope}`;
  storage.setItem(probe, KEYED_ATTEMPT_VERSION);
  if (storage.getItem(probe) !== KEYED_ATTEMPT_VERSION) {
    throw new KeyedAttemptStorageError();
  }
  storage.removeItem(probe);
  if (storage.getItem(probe) !== null) throw new KeyedAttemptStorageError();
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

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function defaultAttemptOwner(): string {
  return crypto.randomUUID();
}
