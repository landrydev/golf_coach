import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceUrl = new URL(
  "../app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx",
  import.meta.url,
);
const routeUrl = new URL(
  "../app/api/plans/[planId]/coaching/practice/route.ts",
  import.meta.url,
);
const domainUrl = new URL("../lib/rich-coaching.ts", import.meta.url);

test("practice replacement UI and route expose structured current and immutable history", async () => {
  const [workspace, route, domain] = await Promise.all([
    readFile(workspaceUrl, "utf8"),
    readFile(routeUrl, "utf8"),
    readFile(domainUrl, "utf8"),
  ]);

  assert.match(workspace, /Edit by replacement/);
  assert.match(workspace, /Save edited replacement/);
  assert.match(workspace, /creates a new immutable assignment and retires this one/);
  assert.match(workspace, /Retained assignment history/);
  assert.match(workspace, /View retained structured guidance/);
  for (const label of [
    "Purpose",
    "When it fits",
    "Equipment",
    "Setup",
    "Steps",
    "Dosage or cadence",
    "Success check",
    "Stop or ask rule",
    "Feel or cue",
    "Common miss",
    "Constraint or adaptation",
    "Progression",
    "Regression",
  ]) {
    assert.match(workspace, new RegExp(label, "i"));
  }
  assert.match(workspace, /prior guidance, media snapshot, evidence, or golfer check-ins/);

  assert.match(route, /body\.operation === "replace"/);
  assert.match(route, /replacePracticeAssignment/);
  assert.match(route, /replacedPracticeItemId/);
  assert.match(route, /drillCustomization\(body\.customization\)/);

  assert.match(domain, /export async function replacePracticeAssignment/);
  assert.match(domain, /rebuild from the immutable assignment snapshot/);
  assert.match(domain, /db\.insert\(practiceAssignmentReplacements\)/);
  assert.match(domain, /action: "practice\.replaced"/);
  assert.match(domain, /richPlanInvalidationStatements/);
});
