import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ClientMutationApiError,
  ClientMutationOutcomeUnknownError,
} from "../lib/client-mutation-recovery.ts";
import {
  CONSENT_STATE_INVALIDATING_CONFLICT_CODES,
  navigateToConfirmedDestination,
  requiresAuthoritativeMutationReload,
} from "../lib/client-terminal-mutation.ts";
import { isConsentTransitionStatusPair } from "../lib/client-response-validation.ts";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("authoritative reload classification is exact for outcome-unknown and conflicts", () => {
  assert.equal(
    requiresAuthoritativeMutationReload(
      new ClientMutationOutcomeUnknownError("timeout"),
      CONSENT_STATE_INVALIDATING_CONFLICT_CODES,
    ),
    true,
  );
  assert.equal(
    requiresAuthoritativeMutationReload(
      new ClientMutationApiError(409, "stale_profile_update", "stale"),
    ),
    true,
  );
  for (const code of CONSENT_STATE_INVALIDATING_CONFLICT_CODES) {
    assert.equal(
      requiresAuthoritativeMutationReload(
        new ClientMutationApiError(409, code, "stale"),
        CONSENT_STATE_INVALIDATING_CONFLICT_CODES,
      ),
      true,
    );
  }
  assert.equal(
    requiresAuthoritativeMutationReload(
      new ClientMutationApiError(409, "idempotency_key_reused", "reused"),
      CONSENT_STATE_INVALIDATING_CONFLICT_CODES,
    ),
    false,
  );
  assert.equal(
    requiresAuthoritativeMutationReload(
      new ClientMutationApiError(400, "invalid_field", "invalid"),
    ),
    false,
  );
});

test("consent acknowledgement status is bound to replay truth", () => {
  assert.equal(isConsentTransitionStatusPair(201, false), true);
  assert.equal(isConsentTransitionStatusPair(200, true), true);
  for (const [status, replayed] of [
    [200, false],
    [201, true],
    [202, false],
    [204, true],
  ]) {
    assert.equal(isConsentTransitionStatusPair(status, replayed), false);
  }
});

test("confirmed staged-create navigation cannot refresh and bounce to its source route", async () => {
  const calls = [];
  const router = {
    push(destination) {
      calls.push(["push", destination]);
    },
    refresh() {
      calls.push(["refresh"]);
    },
  };
  const destination = "/app/golfers/golfer-navigation-test/complete";

  navigateToConfirmedDestination(router, destination);

  assert.deepEqual(calls, [["push", destination]]);

  const source = await sourceOf("app/app/golfers/new/StagedGolferForm.tsx");
  assert.match(
    source,
    /const destination =\s*`\/app\/golfers\/\$\{encodeURIComponent\(result\.golfer\.id\)\}\/complete`;/,
  );
  const capture = source.indexOf("setConfirmedDestination(destination)");
  const navigate = source.indexOf(
    "navigateToConfirmedDestination(router, destination)",
  );
  assert.ok(capture >= 0);
  assert.ok(navigate > capture);
  assert.doesNotMatch(source, /router\.refresh\(\)/);
  assert.match(source, /href=\{confirmedDestination\}/);
  assert.match(source, /Continue to roadmap completion/);
});

test("confirmed full-create navigation cannot refresh and strand its terminal form", async () => {
  const source = await sourceOf("app/app/golfers/new/NewGolferForm.tsx");
  assert.match(
    source,
    /const destination =\s*`\/app\/golfers\/\$\{encodeURIComponent\(result\.golfer\.id\)\}`;/,
  );
  const capture = source.indexOf("setConfirmedDestination(destination)");
  const navigate = source.indexOf(
    "navigateToConfirmedDestination(router, destination)",
  );
  assert.ok(capture >= 0);
  assert.ok(navigate > capture);
  assert.doesNotMatch(source, /router\.refresh\(\)/);
  assert.match(source, /href=\{confirmedDestination\}/);
  assert.match(source, /Open confirmed golfer workspace/);
  assert.match(
    source,
    /disabled=\{[\s\S]*?status === "saved"[\s\S]*?\}/,
  );
});

test("confirmed plan and golfer mutations become terminal before navigation", async () => {
  const files = [
    "app/app/golfers/[golferId]/edit/PlanEditorForm.tsx",
    "app/app/golfers/[golferId]/complete/StagedCompletionForm.tsx",
    "app/app/golfers/[golferId]/settings/GolferSettingsForm.tsx",
  ];

  for (const relativePath of files) {
    const source = await sourceOf(relativePath);
    assert.match(source, /requiresAuthoritativeMutationReload\(error\)/);
    assert.match(source, /mutationTerminalRef\.current/);
    assert.match(source, /confirmedDestination/);
    assert.match(source, /<a[\s\S]*?href=\{confirmedDestination\}/);

    const capture = source.indexOf("setConfirmedDestination(destination)");
    const navigate = source.indexOf(
      "navigateToConfirmedDestination(router, destination)",
    );
    assert.ok(capture >= 0, `${relativePath} must capture its destination`);
    assert.ok(
      navigate > capture,
      `${relativePath} must capture terminal fallback before navigation`,
    );
  }

  for (const relativePath of files.slice(0, 2)) {
    const source = await sourceOf(relativePath);
    assert.match(
      source,
      /const isLocked =[\s\S]*?state === "saved"/,
    );
    assert.match(source, /if \(mutationTerminalRef\.current\) return;/);
  }

  const golferSettings = await sourceOf(files[2]);
  assert.match(
    golferSettings,
    /const golferDestination = `\/app\/golfers\/\$\{encodeURIComponent\(props\.golferId\)\}`;/,
  );
  assert.equal(
    golferSettings.match(/const destination = golferDestination;/g)?.length,
    2,
  );
  assert.match(
    golferSettings,
    /confirmedDestination !== null/,
  );
  assert.equal(
    golferSettings.match(
      /navigateToConfirmedDestination\(router, destination\)/g,
    )?.length,
    2,
  );
});

test("app client code contains no push-or-replace then refresh navigation race", async () => {
  const clientFiles = await appTsxFiles();
  for (const relativePath of clientFiles) {
    const source = await sourceOf(relativePath);
    assert.doesNotMatch(
      source,
      /router\.(?:push|replace)\([^;]+\);\s*router\.refresh\(\)/,
      `${relativePath} must not refresh its source route immediately after navigation`,
    );
  }
});

test("profile and consent conflicts lock behind an actual reload", async () => {
  const profile = await sourceOf("app/app/settings/ProfileForm.tsx");
  assert.match(
    profile,
    /profileMutationExpectedFromForm\([\s\S]*?payload,[\s\S]*?props\.expectedUpdatedAt/,
  );
  assert.match(profile, /expectedUpdatedAt:\s*props\.expectedUpdatedAt/);
  assert.match(profile, /mutationTerminalRef\.current/);
  assert.match(profile, /href="\/app\/settings"/);
  assert.match(profile, /isProfileMutationResponse\(value, expectedProfile\)/);
  assert.match(profile, /requiresAuthoritativeMutationReload\(error\)/);
  assert.match(profile, /window\.location\.reload\(\)/);

  const consent = await sourceOf(
    "components/consent/ConsentPurposeControl.tsx",
  );
  assert.match(consent, /isConsentTransitionStatusPair\(response\.status, result\.replayed\)/);
  assert.match(consent, /CONSENT_STATE_INVALIDATING_CONFLICT_CODES/);
  assert.match(consent, /disabled=\{busy \|\| reloadRequired\}/);
  assert.match(consent, /window\.location\.reload\(\)/);
});

test("living-plan withdrawal confirms the exact item before taking the mutex", async () => {
  const source = await sourceOf(
    "app/app/golfers/[golferId]/LivingPlanForms.tsx",
  );
  const start = source.indexOf("async function withdraw");
  const end = source.indexOf("return (", start);
  const withdrawal = source.slice(start, end);
  const confirmation = withdrawal.indexOf("window.confirm(");
  const mutex = withdrawal.indexOf("if (!startMutation()) return;");

  assert.ok(confirmation >= 0);
  assert.ok(mutex > confirmation);
  assert.match(withdrawal, /itemTitle: string/);
  assert.match(withdrawal, /exact \$\{kind\} item "\$\{itemTitle\}"/);
  assert.match(withdrawal, /planRevision \+ 1/);
  assert.match(source, /withdraw\(event, group\.kind, item\.id, item\.title\)/);
});

async function sourceOf(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function appTsxFiles(directory = path.join(projectRoot, "app")) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await appTsxFiles(absolute));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(path.relative(projectRoot, absolute).replaceAll("\\", "/"));
    }
  }
  return files;
}
