import assert from "node:assert/strict";
import test from "node:test";
import { workspaceNextAction } from "../lib/workspace-next-action.ts";

function golfer(overrides = {}) {
  return {
    id: "golfer_1",
    displayName: "Jordan",
    preferredName: null,
    contactEmail: null,
    status: "active",
    eligibilityStatus: "adult_confirmed",
    lastActivityAt: null,
    updatedAt: Date.now(),
    plan: {
      id: "plan_1",
      title: "Jordan roadmap",
      status: "draft",
      updatedAt: Date.now(),
      authoringComplete: true,
    },
    ...overrides,
  };
}

test("workspace actions identify the next useful state instead of a generic open link", () => {
  assert.deepEqual(workspaceNextAction(golfer()), {
    label: "Review draft",
    explanation: "Resolve material blockers, then preview before sharing.",
    href: "/app/golfers/golfer_1",
  });
  assert.equal(
    workspaceNextAction(golfer({ plan: { ...golfer().plan, status: "preview_ready" } })).label,
    "Preview and publish",
  );
  assert.equal(
    workspaceNextAction(golfer({ plan: { ...golfer().plan, status: "published" } })).label,
    "Review live plan",
  );
  assert.equal(
    workspaceNextAction(golfer({ plan: { ...golfer().plan, status: "paused" } })).label,
    "Review paused plan",
  );
  assert.equal(
    workspaceNextAction(golfer({ plan: { ...golfer().plan, status: "completed" } })).label,
    "Review completed plan",
  );
});

test("archived, deletion-review, and incomplete states are explicit", () => {
  const incompletePlan = { ...golfer().plan, authoringComplete: false };
  const archived = workspaceNextAction(
    golfer({ status: "archived", plan: incompletePlan }),
  );
  assert.equal(archived.label, "View archived record");
  assert.equal(archived.href, "/app/golfers/golfer_1");

  const deletionPending = workspaceNextAction(
    golfer({
      status: "deletion_pending",
      plan: { ...incompletePlan, status: "archived" },
    }),
  );
  assert.equal(deletionPending.label, "Review data-request status");
  assert.equal(deletionPending.href, "/app/settings/data");

  const planless = workspaceNextAction(golfer({ plan: null }));
  assert.equal(planless.label, "Review record recovery options");
  assert.equal(planless.href, "/app/golfers/golfer_1/recover");

  const archivedPlanless = workspaceNextAction(
    golfer({ status: "archived", plan: null }),
  );
  assert.equal(archivedPlanless.label, "View archived record");
  assert.equal(archivedPlanless.href, "/app/golfers/golfer_1/recover");

  const incomplete = workspaceNextAction(golfer({ plan: incompletePlan }));
  assert.equal(incomplete.label, "Continue roadmap setup");
  assert.equal(incomplete.href, "/app/golfers/golfer_1/complete");
});

test("record destinations encode an opaque golfer ID without changing the recovery suffix", () => {
  const action = workspaceNextAction(
    golfer({ id: "golfer /?#é", plan: null }),
  );
  assert.equal(
    action.href,
    "/app/golfers/golfer%20%2F%3F%23%C3%A9/recover",
  );
});
