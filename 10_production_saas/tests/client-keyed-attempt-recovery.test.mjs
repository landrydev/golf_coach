import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  KEYED_ATTEMPT_LIFETIME_MS,
  KEYED_ATTEMPT_MAX_BODY_BYTES,
  KEYED_ATTEMPT_VERSION,
  KeyedAttemptStorageError,
  clearKeyedAttempt,
  keyedAttemptBlockedMessage,
  keyedAttemptMutationDisposition,
  keyedAttemptRetryReadiness,
  keyedAttemptStorageKey,
  loadKeyedAttempt,
  matchesCanonicalKeyedAttemptEmail,
  matchesCanonicalKeyedAttemptExternalUrl,
  matchesCanonicalKeyedAttemptOptionalText,
  matchesCanonicalKeyedAttemptText,
  persistKeyedAttempt,
} from "../lib/client-keyed-attempt-recovery.ts";
import {
  ClientMutationApiError,
  ClientMutationOutcomeUnknownError,
  requireClientMutationJson,
} from "../lib/client-mutation-recovery.ts";
import { cleanEmail, cleanExternalUrl, cleanText } from "../lib/http.ts";
import {
  activateClientRequestScope,
  beginOwnedClientRequest,
  createClientRequestOwnershipState,
  ownsClientRequest,
  retireClientRequestScope,
} from "../lib/client-request-ownership.ts";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const accountA = "account_recovery_a";
const accountB = "account_recovery_b";
const operationKey = "attempt-recovery-operation-0001";
const firstOwner = "attempt-recovery-owner-000001";
const secondOwner = "attempt-recovery-owner-000002";
const exactBody = JSON.stringify({
  type: "access",
  details: "Please review the stored contact details.",
});
const NOW = 1_800_000_000_000;

test("same-tab reload restores the exact key, body, and UI without cross-account bleed", () => {
  const storage = memoryStorage();
  const saved = persistKeyedAttempt(
    {
      accountScope: accountA,
      operation: "data_request_manual_create",
      key: operationKey,
      body: exactBody,
      ui: {
        reviewType: "access",
        reviewDetails: "Please review the stored contact details.",
      },
    },
    storage,
    () => firstOwner,
  );

  const restored = loadKeyedAttempt(
    accountA,
    "data_request_manual_create",
    storage,
    () => secondOwner,
  );
  assert.equal(restored.kind, "restored");
  assert.equal(restored.attempt.key, operationKey);
  assert.equal(restored.attempt.body, exactBody);
  assert.equal(restored.attempt.owner, secondOwner);
  assert.notEqual(restored.attempt.owner, saved.owner);
  assert.deepEqual(restored.attempt.ui, saved.ui);
  assert.deepEqual(
    loadKeyedAttempt(accountB, "data_request_manual_create", storage),
    { kind: "empty" },
  );
  assert.notEqual(
    keyedAttemptStorageKey(accountA, "data_request_manual_create"),
    keyedAttemptStorageKey(accountB, "data_request_manual_create"),
  );
});

test("unavailable or corrupt session storage fails closed and is not erased", () => {
  const denied = memoryStorage({ throwOnSet: true });
  assert.deepEqual(
    loadKeyedAttempt(accountA, "package_create", denied),
    { kind: "blocked", reason: "unavailable" },
  );
  assert.throws(
    () =>
      persistKeyedAttempt(
        {
          accountScope: accountA,
          operation: "package_create",
          key: operationKey,
          body: JSON.stringify({ title: "Recovery package" }),
          ui: { priceText: "" },
        },
        denied,
      ),
    KeyedAttemptStorageError,
  );

  const corrupt = memoryStorage();
  const storageKey = keyedAttemptStorageKey(accountA, "golfer_staged_create");
  corrupt.setItem(storageKey, "{not-json");
  assert.deepEqual(
    loadKeyedAttempt(accountA, "golfer_staged_create", corrupt),
    { kind: "blocked", reason: "invalid" },
  );
  assert.equal(corrupt.getItem(storageKey), "{not-json");
});

test("strict version, operation UI, body, and size checks reject malformed records", () => {
  const storage = memoryStorage();
  assert.throws(
    () =>
      persistKeyedAttempt(
        {
          accountScope: accountA,
          operation: "golfer_full_create",
          key: operationKey,
          body: JSON.stringify({ golfer: "Synthetic" }),
          ui: { phaseCount: 5 },
        },
        storage,
      ),
    KeyedAttemptStorageError,
  );
  assert.throws(
    () =>
      persistKeyedAttempt(
        {
          accountScope: accountA,
          operation: "golfer_staged_create",
          key: operationKey,
          body: JSON.stringify({ value: "x".repeat(KEYED_ATTEMPT_MAX_BODY_BYTES) }),
          ui: {},
        },
        storage,
      ),
    KeyedAttemptStorageError,
  );
});

test("only an exact owned compare-and-remove retires a saved attempt", () => {
  const storage = memoryStorage();
  const saved = persistKeyedAttempt(
    {
      accountScope: accountA,
      operation: "data_request_deletion_create",
      key: operationKey,
      body: JSON.stringify({ type: "deletion" }),
      ui: {},
    },
    storage,
    () => firstOwner,
  );
  assert.equal(clearKeyedAttempt(saved, storage), true);
  assert.deepEqual(
    loadKeyedAttempt(accountA, "data_request_deletion_create", storage),
    { kind: "empty" },
  );
  const stickyStorage = memoryStorage({ ignoreRemove: true });
  const stickyAttempt = persistKeyedAttempt(
    {
      accountScope: accountA,
      operation: "data_request_deletion_create",
      key: operationKey,
      body: JSON.stringify({ type: "deletion" }),
      ui: {},
    },
    stickyStorage,
    () => firstOwner,
  );
  assert.equal(clearKeyedAttempt(stickyAttempt, stickyStorage), false);
});

test("a same-account remount claims the attempt and fences a late predecessor clear", () => {
  const storage = memoryStorage();
  const firstMount = persistKeyedAttempt(
    {
      accountScope: accountA,
      operation: "data_request_manual_create",
      key: operationKey,
      body: exactBody,
      ui: {
        reviewType: "access",
        reviewDetails: "Please review the stored contact details.",
      },
    },
    storage,
    () => firstOwner,
  );
  const successor = loadKeyedAttempt(
    accountA,
    "data_request_manual_create",
    storage,
    () => secondOwner,
  );
  assert.equal(successor.kind, "restored");

  assert.equal(keyedAttemptRetryReadiness(firstMount, storage), "blocked");
  assert.equal(keyedAttemptRetryReadiness(successor.attempt, storage), "ready");
  assert.equal(clearKeyedAttempt(firstMount, storage), false);
  assert.equal(
    loadStoredAttempt(storage, accountA, "data_request_manual_create").owner,
    secondOwner,
  );
  assert.equal(clearKeyedAttempt(successor.attempt, storage), true);
});

test("keyed attempts expire at a fixed boundary and cannot be retried from a long-lived tab", () => {
  const storage = memoryStorage();
  const attempt = persistKeyedAttempt(
    {
      accountScope: accountA,
      operation: "data_request_deletion_create",
      key: operationKey,
      body: JSON.stringify({ type: "deletion" }),
      ui: {},
    },
    storage,
    () => firstOwner,
    NOW,
  );

  assert.equal(attempt.version, KEYED_ATTEMPT_VERSION);
  assert.equal(attempt.createdAt, NOW);
  assert.equal(attempt.expiresAt, NOW + KEYED_ATTEMPT_LIFETIME_MS);
  assert.equal(
    keyedAttemptRetryReadiness(
      attempt,
      storage,
      NOW + KEYED_ATTEMPT_LIFETIME_MS - 1,
    ),
    "ready",
  );
  assert.equal(
    keyedAttemptRetryReadiness(
      attempt,
      storage,
      NOW + KEYED_ATTEMPT_LIFETIME_MS,
    ),
    "expired",
  );
  assert.equal(
    storage.getItem(
      keyedAttemptStorageKey(accountA, "data_request_deletion_create"),
    ),
    null,
  );
  assert.deepEqual(
    loadKeyedAttempt(
      accountA,
      "data_request_deletion_create",
      storage,
      () => secondOwner,
      NOW + KEYED_ATTEMPT_LIFETIME_MS,
    ),
    { kind: "empty" },
  );
});

test("mount-time expiry and legacy records retire with an inspect-before-new-attempt barrier", () => {
  const expiredStorage = memoryStorage();
  persistKeyedAttempt(
    {
      accountScope: accountA,
      operation: "package_create",
      key: operationKey,
      body: JSON.stringify({ title: "Recovery package" }),
      ui: { priceText: "" },
    },
    expiredStorage,
    () => firstOwner,
    NOW,
  );
  assert.deepEqual(
    loadKeyedAttempt(
      accountA,
      "package_create",
      expiredStorage,
      () => secondOwner,
      NOW + KEYED_ATTEMPT_LIFETIME_MS,
    ),
    { kind: "blocked", reason: "expired" },
  );
  assert.equal(
    expiredStorage.getItem(keyedAttemptStorageKey(accountA, "package_create")),
    null,
  );
  assert.match(
    keyedAttemptBlockedMessage("package creation", "expired"),
    /24-hour recovery window[\s\S]*Reload and inspect/,
  );

  const legacyStorage = memoryStorage();
  const legacyKey = `roadmap:keyed-attempt:v1:package_create:${accountA}`;
  legacyStorage.setItem(legacyKey, JSON.stringify({ version: "legacy" }));
  assert.deepEqual(
    loadKeyedAttempt(
      accountA,
      "package_create",
      legacyStorage,
      () => secondOwner,
      NOW,
    ),
    { kind: "blocked", reason: "legacy" },
  );
  assert.equal(legacyStorage.getItem(legacyKey), null);
  assert.match(
    keyedAttemptBlockedMessage("package creation", "legacy"),
    /older saved[\s\S]*cannot be safely age-checked[\s\S]*Reload and inspect/,
  );
});

test("persistence never overwrites an existing owned slot", () => {
  const storage = memoryStorage();
  const first = persistKeyedAttempt(
    {
      accountScope: accountA,
      operation: "data_request_deletion_create",
      key: operationKey,
      body: JSON.stringify({ type: "deletion" }),
      ui: {},
    },
    storage,
    () => firstOwner,
  );
  assert.throws(
    () =>
      persistKeyedAttempt(
        {
          accountScope: accountA,
          operation: "data_request_deletion_create",
          key: "attempt-recovery-operation-0002",
          body: JSON.stringify({ type: "deletion" }),
          ui: {},
        },
        storage,
        () => secondOwner,
      ),
    KeyedAttemptStorageError,
  );
  assert.deepEqual(
    loadStoredAttempt(storage, accountA, "data_request_deletion_create"),
    first,
  );
});

test("wrong-owner and wrong-scope records cannot clear another account's attempt", () => {
  const storage = memoryStorage();
  const accountAAttempt = persistKeyedAttempt(
    {
      accountScope: accountA,
      operation: "data_request_deletion_create",
      key: operationKey,
      body: JSON.stringify({ type: "deletion" }),
      ui: {},
    },
    storage,
    () => firstOwner,
  );
  const accountBAttempt = persistKeyedAttempt(
    {
      accountScope: accountB,
      operation: "data_request_deletion_create",
      key: "attempt-recovery-operation-0002",
      body: JSON.stringify({ type: "deletion" }),
      ui: {},
    },
    storage,
    () => secondOwner,
  );

  assert.equal(
    clearKeyedAttempt({ ...accountAAttempt, owner: secondOwner }, storage),
    false,
  );
  assert.equal(clearKeyedAttempt(accountAAttempt, storage), true);
  assert.deepEqual(
    loadStoredAttempt(storage, accountB, "data_request_deletion_create"),
    accountBAttempt,
  );
});

test("scope changes, successor requests, and unmounts fence asynchronous owners", () => {
  const state = createClientRequestOwnershipState();
  const accountAGeneration = activateClientRequestScope(state, accountA);
  const firstRequest = beginOwnedClientRequest(state, accountA);
  assert.ok(firstRequest);
  assert.equal(ownsClientRequest(state, firstRequest), true);

  const successorRequest = beginOwnedClientRequest(state, accountA);
  assert.ok(successorRequest);
  assert.equal(ownsClientRequest(state, firstRequest), false);
  assert.equal(ownsClientRequest(state, successorRequest), true);

  retireClientRequestScope(state, accountA, accountAGeneration);
  assert.equal(ownsClientRequest(state, successorRequest), false);
  activateClientRequestScope(state, accountB);
  assert.equal(ownsClientRequest(state, successorRequest), false);
  assert.equal(beginOwnedClientRequest(state, accountA), null);
  assert.ok(beginOwnedClientRequest(state, accountB));
});

test("incomplete, reused, and unparseable 409 receipts require reconciliation", () => {
  assert.equal(
    keyedAttemptMutationDisposition(
      new ClientMutationOutcomeUnknownError("timeout"),
    ),
    "retry_exact",
  );
  for (const code of [
    "idempotency_record_incomplete",
    "idempotency_key_reused",
  ]) {
    assert.equal(
      keyedAttemptMutationDisposition(
        new ClientMutationApiError(409, code, "Synthetic receipt failure"),
      ),
      "reconcile_required",
    );
  }
  assert.equal(
    keyedAttemptMutationDisposition(
      new ClientMutationApiError(409, null, "Unreadable conflict"),
    ),
    "reconcile_required",
  );
  assert.equal(
    keyedAttemptMutationDisposition(
      new ClientMutationApiError(400, "invalid_field", "Invalid field"),
    ),
    "definitive_failure",
  );
});

test("API failures preserve status/code and JSON success requires its media type", async () => {
  await assert.rejects(
    requireClientMutationJson(
      new Response(
        JSON.stringify({
          error: {
            code: "idempotency_record_incomplete",
            message: "Receipt incomplete.",
          },
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
      () => true,
      "Fallback",
    ),
    (error) =>
      error instanceof ClientMutationApiError &&
      error.status === 409 &&
      error.code === "idempotency_record_incomplete",
  );
  await assert.rejects(
    requireClientMutationJson(
      new Response("not-json", { status: 409 }),
      () => true,
      "Fallback",
    ),
    (error) =>
      error instanceof ClientMutationApiError &&
      error.status === 409 &&
      error.code === null,
  );
  await assert.rejects(
    requireClientMutationJson(
      new Response(JSON.stringify({ created: true }), {
        status: 201,
        headers: { "Content-Type": "text/html" },
      }),
      () => true,
      "Fallback",
    ),
    (error) =>
      error instanceof ClientMutationOutcomeUnknownError &&
      error.reason === "malformed_success_response",
  );
});

test("keyed receipt matching mirrors authoritative server canonicalization", () => {
  for (const submitted of [
    "  Coach Avery  ",
    "\tLine one\r\nline two\rline three\n ",
    "\u00a0Outer non-breaking whitespace\u00a0",
  ]) {
    const canonical = cleanText(submitted, "synthetic");
    assert.equal(matchesCanonicalKeyedAttemptText(canonical, submitted), true);
    assert.equal(
      matchesCanonicalKeyedAttemptText(`${canonical} changed`, submitted),
      false,
    );
  }

  assert.equal(matchesCanonicalKeyedAttemptOptionalText(null, " \r\n\t "), true);
  assert.equal(matchesCanonicalKeyedAttemptOptionalText("", " \r\n\t "), false);
  assert.equal(
    matchesCanonicalKeyedAttemptOptionalText("Line one\nline two", " Line one\rline two "),
    true,
  );

  const submittedEmail = "  Coach.Avery+Roadmap@GOLFMAIL.CA  ";
  const canonicalEmail = cleanEmail(submittedEmail, "email");
  assert.equal(
    matchesCanonicalKeyedAttemptEmail(canonicalEmail, submittedEmail),
    true,
  );
  assert.equal(
    matchesCanonicalKeyedAttemptEmail("coach.other@golfmail.ca", submittedEmail),
    false,
  );
  assert.equal(matchesCanonicalKeyedAttemptEmail(null, " \r\n "), true);
  assert.equal(
    matchesCanonicalKeyedAttemptEmail("not-an-email", "not-an-email"),
    false,
  );

  for (const submittedUrl of [
    "  https://BOOKING.GOLFROADMAP.CA  ",
    "https://Booking.GolfRoadmap.ca:443/coaching/../book?q=one",
  ]) {
    const canonicalUrl = cleanExternalUrl(submittedUrl, "externalActionUrl");
    assert.equal(
      matchesCanonicalKeyedAttemptExternalUrl(canonicalUrl, submittedUrl),
      true,
    );
    assert.equal(
      matchesCanonicalKeyedAttemptExternalUrl(`${canonicalUrl}changed`, submittedUrl),
      false,
    );
  }
  assert.equal(
    matchesCanonicalKeyedAttemptExternalUrl("http://booking.golfroadmap.ca/", "http://booking.golfroadmap.ca"),
    false,
  );
  assert.equal(
    matchesCanonicalKeyedAttemptExternalUrl("https://localhost/", "https://localhost"),
    false,
  );
});

test("keyed creation UIs pass account scope, lock restored fields, and expose reconciliation", async () => {
  const sources = await Promise.all(
    [
      "app/app/golfers/new/NewGolferForm.tsx",
      "app/app/golfers/new/StagedGolferForm.tsx",
      "app/app/packages/PackageForm.tsx",
      "app/app/settings/data/DataRequestControls.tsx",
    ].map((filename) => readFile(path.join(projectRoot, filename), "utf8")),
  );
  for (const source of sources) {
    assert.match(source, /recoveryScope: string/);
    assert.match(source, /loadKeyedAttempt\(.*recoveryScope|loadKeyedAttempt\(\s*recoveryScope/s);
    assert.match(source, /persistKeyedAttempt\(/);
    assert.match(source, /clearKeyedAttempt\(/);
    assert.match(source, /keyedAttemptRetryReadiness\(/);
    assert.match(source, /clearKeyedAttempt\(attempt\)/);
    assert.match(source, /beginOwnedClientRequest\(/);
    assert.match(source, /ownsClientRequest\(/);
    assert.match(source, /"blocked"/);
    assert.match(source, /Reload and inspect/);
    assert.match(source, /href="\/support"/);
    assert.match(source, /body: attempt\.body/);
  }
  assert.match(sources[0], /matchesCanonicalKeyedAttemptText/);
  assert.match(sources[1], /matchesCanonicalKeyedAttemptEmail/);
  assert.match(sources[1], /matchesCanonicalKeyedAttemptOptionalText/);
  assert.match(sources[2], /matchesCanonicalKeyedAttemptExternalUrl/);
  assert.match(sources[2], /matchesCanonicalKeyedAttemptOptionalText/);
  assert.match(sources[0], /disabled=\{fieldsLocked\}/);
  assert.match(sources[1], /disabled=\{fieldsLocked\}/);
  assert.match(sources[2], /disabled=\{fieldsLocked\}/);
  assert.match(sources[3], /disabled=\{busy !== null \|\| anyRecoveryPending\}/);
  assert.equal(
    [...sources[3].matchAll(/keyedAttemptRetryReadiness\(/g)].length,
    2,
  );

  for (const [filename, keyPattern] of [
    ["app/app/packages/page.tsx", /key=\{`package-create:\$\{account\.id\}`\}/],
    ["app/app/settings/data/page.tsx", /key=\{`data-requests:\$\{account\.id\}`\}/],
  ]) {
    const source = await readFile(path.join(projectRoot, filename), "utf8");
    assert.match(source, /recoveryScope=\{account\.id\}/);
    assert.match(source, keyPattern);
  }
  const [golferParent, quickRoadmap] = await Promise.all([
    readFile(path.join(projectRoot, "app/app/golfers/new/page.tsx"), "utf8"),
    readFile(path.join(projectRoot, "app/app/golfers/new/QuickRoadmapForm.tsx"), "utf8"),
  ]);
  assert.match(golferParent, /recoveryScope=\{account\.id\}/);
  assert.match(golferParent, /key=\{`quick-roadmap:\$\{account\.id\}`\}/);
  assert.match(quickRoadmap, /recoveryScope: string/);
  assert.match(quickRoadmap, /roadmap-\$\{recoveryScope\}-\$\{crypto\.randomUUID\(\)\}/);
  assert.match(quickRoadmap, /"Idempotency-Key": attemptKey\.current/);
});

function memoryStorage(options = {}) {
  const values = new Map();
  return {
    getItem(key) {
      if (options.throwOnGet) throw new Error("storage denied");
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (options.throwOnSet) throw new Error("storage denied");
      values.set(key, String(value));
    },
    removeItem(key) {
      if (options.throwOnRemove) throw new Error("storage denied");
      if (!options.ignoreRemove) values.delete(key);
    },
  };
}

function loadStoredAttempt(storage, accountScope, operation) {
  return JSON.parse(storage.getItem(keyedAttemptStorageKey(accountScope, operation)));
}
