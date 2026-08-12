import assert from "node:assert/strict";
import test from "node:test";
import {
  COACHING_WORKSPACE_TABS,
  clearCoachingWorkspaceRecordQuery,
  coachingWorkspaceFocusDomId,
  coachingWorkspaceHref,
  resolveCoachingWorkspaceLocation,
  resolveCoachingWorkspaceTab,
} from "../lib/coaching-workspace-tab.ts";

test("coaching workspace deep links select every bounded destination", () => {
  for (const tab of COACHING_WORKSPACE_TABS) {
    assert.equal(resolveCoachingWorkspaceTab(tab), tab);
  }
});

test("missing, empty, or unbounded coaching tabs fall back to Practice", () => {
  assert.equal(resolveCoachingWorkspaceTab(undefined), "practice");
  assert.equal(resolveCoachingWorkspaceTab(""), "practice");
  assert.equal(resolveCoachingWorkspaceTab("billing"), "practice");
});

test("record-aware workspace locations accept only bounded context for the selected tab", () => {
  assert.deepEqual(
    resolveCoachingWorkspaceLocation({
      tab: "practice",
      practiceId: "practice_1",
      checkInId: "check_in_1",
      lessonId: "ignored_lesson",
    }),
    {
      tab: "practice",
      focus: {
        kind: "practice",
        practiceId: "practice_1",
        checkInId: "check_in_1",
      },
    },
  );
  assert.deepEqual(
    resolveCoachingWorkspaceLocation({ tab: "lessons", lessonId: "lesson-1" }),
    { tab: "lessons", focus: { kind: "lesson", lessonId: "lesson-1" } },
  );
  assert.deepEqual(
    resolveCoachingWorkspaceLocation({ tab: "media", attachmentId: "attachment.1" }),
    { tab: "media", focus: { kind: "media", attachmentId: "attachment.1" } },
  );
  assert.deepEqual(
    resolveCoachingWorkspaceLocation({ tab: "launch", importId: "import:1" }),
    { tab: "launch", focus: { kind: "launch_import", importId: "import:1" } },
  );

  assert.deepEqual(
    resolveCoachingWorkspaceLocation({ tab: "media", lessonId: "lesson_1" }),
    { tab: "media", focus: null },
  );
  assert.deepEqual(
    resolveCoachingWorkspaceLocation({ tab: "practice", checkInId: "orphan_check_in" }),
    { tab: "practice", focus: null },
  );
  assert.deepEqual(
    resolveCoachingWorkspaceLocation({ tab: "lessons", lessonId: "../unsafe" }),
    { tab: "lessons", focus: null },
  );
});

test("workspace hrefs and DOM ids carry an exact record without leaking stale context", () => {
  const href = coachingWorkspaceHref("plan / 1", {
    tab: "practice",
    focus: { kind: "practice", practiceId: "practice_1", checkInId: "check_1" },
  });
  assert.equal(
    href,
    "/app/coaching/plans/plan%20%2F%201?tab=practice&practiceId=practice_1&checkInId=check_1",
  );
  assert.equal(
    coachingWorkspaceHref("plan_1", {
      tab: "media",
      focus: { kind: "lesson", lessonId: "lesson_1" },
    }),
    "/app/coaching/plans/plan_1?tab=media",
  );
  assert.equal(
    coachingWorkspaceHref("plan_1", {
      tab: "lessons",
      focus: { kind: "lesson", lessonId: "../unsafe" },
    }),
    "/app/coaching/plans/plan_1?tab=lessons",
  );
  assert.equal(
    coachingWorkspaceFocusDomId({
      kind: "practice",
      practiceId: "practice_1",
      checkInId: "check_1",
    }),
    "workspace-check-in-check_1",
  );
  assert.equal(
    coachingWorkspaceFocusDomId({ kind: "lesson", lessonId: "lesson_1" }),
    "workspace-lesson-lesson_1",
  );

  const url = new URL(
    "https://example.test/app/coaching/plans/plan_1?tab=practice&practiceId=p&checkInId=c&lessonId=l&attachmentId=a&importId=i&retained=yes",
  );
  clearCoachingWorkspaceRecordQuery(url);
  assert.equal(url.searchParams.get("tab"), "practice");
  assert.equal(url.searchParams.get("retained"), "yes");
  for (const key of ["practiceId", "checkInId", "lessonId", "attachmentId", "importId"]) {
    assert.equal(url.searchParams.has(key), false);
  }
});
