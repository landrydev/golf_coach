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
    },
    ...overrides,
  };
}

test("workspace actions identify the next useful state instead of a generic open link", () => {
  assert.equal(workspaceNextAction(golfer()).label, "Review draft");
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
  assert.equal(
    workspaceNextAction(golfer({ status: "archived" })).label,
    "View archived record",
  );
  assert.equal(
    workspaceNextAction(golfer({ status: "deletion_pending" })).label,
    "Review data-request status",
  );
  assert.equal(
    workspaceNextAction(golfer({ plan: null })).label,
    "Continue setup",
  );
});
