import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const {
  CONSENT_PURPOSES,
  CONSENT_RECORD_STATUSES,
  CONSENT_SUBJECT_TYPES,
  parseConsentPolicyRegistry,
} = await import("../lib/consent-repository.ts");

test("consent schema vocabulary is explicit and registry parsing has no policy defaults", () => {
  assert.deepEqual(CONSENT_PURPOSES, [
    "terms",
    "privacy_notice",
    "golfer_record",
    "roadmap_sharing",
    "media_use",
    "service_email",
    "optional_analytics",
  ]);
  assert.deepEqual(CONSENT_RECORD_STATUSES, [
    "granted",
    "declined",
    "withdrawn",
    "expired",
  ]);
  assert.deepEqual(CONSENT_SUBJECT_TYPES, ["account", "golfer"]);
  assert.deepEqual(parseConsentPolicyRegistry(undefined), {
    state: "missing",
    entries: {},
  });
  assert.deepEqual(parseConsentPolicyRegistry("  "), {
    state: "missing",
    entries: {},
  });
  assert.deepEqual(parseConsentPolicyRegistry("{}"), {
    state: "ready",
    entries: {},
  });
});

test("registry accepts only exact, versioned, owner-supplied purpose entries", () => {
  const raw = JSON.stringify({
    service_email: {
      version: "synthetic-v1",
      purposeDescription: "Synthetic test description supplied only by this test.",
      subjectTypes: ["account"],
    },
    roadmap_sharing: {
      version: "synthetic-v3",
      purposeDescription: "Synthetic golfer-scoped test description.",
      subjectTypes: ["golfer"],
    },
  });
  assert.deepEqual(parseConsentPolicyRegistry(raw), {
    state: "ready",
    entries: {
      service_email: {
        version: "synthetic-v1",
        purposeDescription: "Synthetic test description supplied only by this test.",
        subjectTypes: ["account"],
      },
      roadmap_sharing: {
        version: "synthetic-v3",
        purposeDescription: "Synthetic golfer-scoped test description.",
        subjectTypes: ["golfer"],
      },
    },
  });
});

test("one malformed, ambiguous, or extra registry value fails the whole registry closed", () => {
  const invalidEntries = [
    "not-json",
    "[]",
    JSON.stringify({ unknown_purpose: policyEntry() }),
    JSON.stringify({ service_email: { ...policyEntry(), legalBasis: "invented" } }),
    JSON.stringify({ service_email: { ...policyEntry(), version: "bad version" } }),
    JSON.stringify({ service_email: { ...policyEntry(), purposeDescription: "" } }),
    JSON.stringify({ service_email: { ...policyEntry(), purposeDescription: " leading" } }),
    JSON.stringify({ service_email: { ...policyEntry(), purposeDescription: "line\nbreak" } }),
    JSON.stringify({ service_email: { ...policyEntry(), subjectTypes: [] } }),
    JSON.stringify({ service_email: { ...policyEntry(), subjectTypes: ["account", "account"] } }),
    JSON.stringify({ service_email: { ...policyEntry(), subjectTypes: ["support"] } }),
    "x".repeat(16 * 1024 + 1),
  ];

  for (const raw of invalidEntries) {
    assert.deepEqual(parseConsentPolicyRegistry(raw), {
      state: "invalid",
      entries: {},
    });
  }
});

test("transactional consent expiry uses the D1 clock at the commit boundary", async () => {
  const source = await readFile(
    new URL("../lib/consent-repository.ts", import.meta.url),
    "utf8",
  );
  const guard = source.slice(
    source.indexOf("export function consentGrantTransactionGuard"),
    source.indexOf("function withdrawalRevocationStatements"),
  );
  assert.match(
    guard,
    /cast\(\(julianday\('now'\) - 2440587\.5\) \* 86400000 as integer\)/,
  );
  const signature = guard.slice(0, guard.indexOf(") {") + 3);
  assert.doesNotMatch(signature, /\bnow\b/);
});

function policyEntry() {
  return {
    version: "synthetic-v1",
    purposeDescription: "Synthetic test description.",
    subjectTypes: ["account"],
  };
}
