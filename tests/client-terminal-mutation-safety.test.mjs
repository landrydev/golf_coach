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
    const navigate = source.indexOf("router.push(destination)");
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
