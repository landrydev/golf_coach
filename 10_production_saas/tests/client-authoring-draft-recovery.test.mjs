import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AUTHORING_DRAFT_LIFETIME_MS,
  authoringDraftStorageKey,
  canonicalAuthoringValues,
  clearAuthoringDraft,
  persistAuthoringDraft,
  reconcileAuthoringDraft,
} from "../lib/client-authoring-draft-recovery.ts";

const NOW = 1_800_000_000_000;
const accountA = "acct_authoring_recovery_a";
const accountB = "acct_authoring_recovery_b";
const planId = "plan_authoring_recovery_01";
const scope = {
  accountScope: accountA,
  resourceId: planId,
  action: "plan_core_edit",
};

test("an unchanged authoritative revision offers an explicit scoped restore", async () => {
  const storage = memoryStorage();
  const baseState = { revision: 7, title: "Original" };
  const saved = await persistAuthoringDraft(
    {
      scope,
      baseRevision: 7,
      baseState,
      appliedState: { revision: 8, title: "Revised" },
      values: planValues("Revised"),
      ui: { phaseCount: 3 },
    },
    storage,
    NOW,
  );
  assert.equal(saved.kind, "persisted");

  const recovered = await reconcileAuthoringDraft(
    { scope, currentRevision: 7, currentState: baseState },
    storage,
    NOW + 1_000,
  );
  assert.equal(recovered.kind, "unchanged");
  assert.equal(recovered.draft.envelope.values.title, "Revised");

  const otherAccount = await reconcileAuthoringDraft(
    {
      scope: { ...scope, accountScope: accountB },
      currentRevision: 7,
      currentState: baseState,
    },
    storage,
    NOW + 1_000,
  );
  assert.deepEqual(otherAccount, { kind: "empty" });
});

test("only the exact expected authoritative state is classified applied and cleared", async () => {
  const storage = memoryStorage();
  const expectedState = { revision: 8, title: "Revised" };
  const saved = await persistAuthoringDraft(
    {
      scope,
      baseRevision: 7,
      baseState: { revision: 7, title: "Original" },
      appliedState: expectedState,
      values: planValues("Revised"),
      ui: { phaseCount: 3 },
    },
    storage,
    NOW,
  );
  assert.equal(saved.kind, "persisted");

  const recovered = await reconcileAuthoringDraft(
    { scope, currentRevision: 8, currentState: expectedState },
    storage,
    NOW + 1_000,
  );
  assert.deepEqual(recovered, { kind: "applied" });
  assert.equal(storage.getItem(authoringDraftStorageKey(scope)), null);
});

test("a newer but nonmatching authoritative state is retained as diverged", async () => {
  const storage = memoryStorage();
  const saved = await persistAuthoringDraft(
    {
      scope,
      baseRevision: 7,
      baseState: { revision: 7, title: "Original" },
      appliedState: { revision: 8, title: "My revision" },
      values: planValues("My revision"),
      ui: { phaseCount: 3 },
    },
    storage,
    NOW,
  );
  assert.equal(saved.kind, "persisted");

  const recovered = await reconcileAuthoringDraft(
    {
      scope,
      currentRevision: 8,
      currentState: { revision: 8, title: "Another editor's revision" },
    },
    storage,
    NOW + 1_000,
  );
  assert.equal(recovered.kind, "diverged");
  assert.notEqual(storage.getItem(authoringDraftStorageKey(scope)), null);
});

test("tampered, oversized, and unavailable storage fail closed", async () => {
  const storage = memoryStorage();
  const saved = await persistAuthoringDraft(
    {
      scope,
      baseRevision: 7,
      baseState: { revision: 7 },
      values: planValues("Saved title"),
      ui: { phaseCount: 3 },
    },
    storage,
    NOW,
  );
  assert.equal(saved.kind, "persisted");
  const key = authoringDraftStorageKey(scope);
  const tampered = JSON.parse(storage.getItem(key));
  tampered.values.title = "Tampered title";
  storage.setItem(key, JSON.stringify(tampered));

  assert.deepEqual(
    await reconcileAuthoringDraft(
      { scope, currentRevision: 7, currentState: { revision: 7 } },
      storage,
      NOW + 1_000,
    ),
    { kind: "blocked", reason: "invalid" },
  );
  assert.notEqual(storage.getItem(key), null, "invalid data is not silently trusted or erased");

  const oversized = planValues("Oversized");
  oversized.goalContext = "x".repeat(8 * 1_024 + 1);
  assert.deepEqual(
    await persistAuthoringDraft(
      {
        scope: { ...scope, resourceId: "plan_authoring_recovery_02" },
        baseRevision: 1,
        baseState: { revision: 1 },
        values: oversized,
        ui: { phaseCount: 3 },
      },
      memoryStorage(),
      NOW,
    ),
    { kind: "blocked", reason: "invalid" },
  );

  const unavailable = {
    getItem() { throw new Error("storage denied"); },
    setItem() { throw new Error("storage denied"); },
    removeItem() { throw new Error("storage denied"); },
  };
  assert.deepEqual(
    await reconcileAuthoringDraft(
      { scope, currentRevision: 7, currentState: { revision: 7 } },
      unavailable,
      NOW,
    ),
    { kind: "blocked", reason: "unavailable" },
  );
});

test("verified expired drafts clear and predecessor handles cannot clear successors", async () => {
  const storage = memoryStorage();
  const first = await persistAuthoringDraft(
    {
      scope,
      baseRevision: 7,
      baseState: { revision: 7 },
      values: planValues("First"),
      ui: { phaseCount: 3 },
    },
    storage,
    NOW,
  );
  assert.equal(first.kind, "persisted");
  const second = await persistAuthoringDraft(
    {
      scope,
      baseRevision: 7,
      baseState: { revision: 7 },
      values: planValues("Second"),
      ui: { phaseCount: 3 },
    },
    storage,
    NOW + 1,
  );
  assert.equal(second.kind, "persisted");
  assert.equal(clearAuthoringDraft(first.draft, storage), false);
  assert.equal(clearAuthoringDraft(second.draft, storage), true);

  const expiring = await persistAuthoringDraft(
    {
      scope,
      baseRevision: 7,
      baseState: { revision: 7 },
      values: planValues("Expires"),
      ui: { phaseCount: 3 },
    },
    storage,
    NOW,
  );
  assert.equal(expiring.kind, "persisted");
  assert.deepEqual(
    await reconcileAuthoringDraft(
      { scope, currentRevision: 7, currentState: { revision: 7 } },
      storage,
      NOW + AUTHORING_DRAFT_LIFETIME_MS,
    ),
    { kind: "empty" },
  );
});

test("canonical authoring state mirrors server line-ending, trim, and line-list transforms", () => {
  assert.deepEqual(
    canonicalAuthoringValues({
      title: "  Revised title\r\n",
      phase1ProgressSignals: " first \r\n\r\n second  ",
      firstPhaseProgressSignals: " a\n  b \n",
    }),
    {
      title: "Revised title",
      phase1ProgressSignals: "first\nsecond",
      firstPhaseProgressSignals: "a\nb",
    },
  );
});

test("long-form components persist before requests, reconcile on mount, and use safe native methods", async () => {
  const files = [
    "app/app/golfers/[golferId]/edit/PlanEditorForm.tsx",
    "app/app/golfers/[golferId]/complete/StagedCompletionForm.tsx",
    "app/app/golfers/[golferId]/LivingPlanForms.tsx",
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /reconcileAuthoringDraft\(/);
    assert.match(source, /persistAuthoringDraft\(/);
    assert.match(source, /AuthoringDraftRecovery/);
    assert.match(source, /recoveryScope: string/);
    assert.ok(
      source.indexOf("persistAuthoringDraft(") < source.indexOf("requestClientMutation("),
      `${file} must persist before issuing the mutation`,
    );
    for (const form of source.matchAll(/<form\b[\s\S]*?onSubmit=/g)) {
      assert.match(form[0], /method="post"/, `${file} intercepted form must be POST-safe`);
    }
  }

  const destinationResolver = await readFile(
    new URL("../components/forms/StagedCompletionDraftResolution.tsx", import.meta.url),
    "utf8",
  );
  const destinationPage = await readFile(
    new URL("../app/app/golfers/[golferId]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(destinationResolver, /action: "staged_plan_complete"/);
  assert.match(destinationResolver, /reconcileAuthoringDraft\(/);
  assert.doesNotMatch(destinationResolver, /appliedState|restoreAuthoringDraftValues/);
  assert.match(destinationPage, /<StagedCompletionDraftResolution/);
  assert.match(destinationPage, /recoveryScope=\{account\.id\}/);
});

function planValues(title) {
  return {
    title,
    goalStatement: "Goal",
    goalWhy: "Why",
    goalContext: "Context",
    assessmentSummary: "Summary",
    assessmentStrengths: "Strengths",
    assessmentPrimaryPattern: "Pattern",
    assessmentLimitations: "Limits",
    priorityTitle: "Priority",
    priorityRationale: "Rationale",
    phase1Title: "Phase 1",
    phase1Purpose: "Purpose 1",
    phase1Rationale: "First",
    phase1ProgressSignals: "Signal",
    phase2Title: "Phase 2",
    phase2Purpose: "Purpose 2",
    phase2Rationale: "",
    phase2ProgressSignals: "",
    phase3Title: "Phase 3",
    phase3Purpose: "Purpose 3",
    phase3Rationale: "",
    phase3ProgressSignals: "",
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
