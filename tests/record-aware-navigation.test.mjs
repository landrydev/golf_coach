import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard and golfer hub actions retain exact record-aware destinations", async () => {
  const [
    commandCentre,
    golferHub,
    workspacePage,
    workspace,
    mediaLibrary,
    nextAction,
    recoveryPage,
  ] = await Promise.all([
    readFile(new URL("../lib/command-centre.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/app/golfers/[golferId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app/coaching/plans/[planId]/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/app/media/MediaLibrary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/workspace-next-action.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/app/golfers/[golferId]/recover/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(commandCentre, /planId: practiceItems\.planId/);
  assert.match(commandCentre, /practiceItemId: practiceCheckIns\.practiceItemId/);
  assert.match(commandCentre, /kind: "practice",[\s\S]*checkInId: row\.id/);
  assert.match(commandCentre, /kind: "launch_import", importId: row\.id/);
  assert.match(commandCentre, /#media-asset-\$\{encodeURIComponent\(row\.id\)\}/);

  assert.match(golferHub, /const latestLesson = model\.lessons\.at\(-1\)/);
  assert.match(golferHub, /kind: "lesson", lessonId: latestLesson\.id/);
  assert.match(golferHub, /kind: "practice", practiceId: activePractice\.id/);
  assert.match(golferHub, /kind: "media", attachmentId: latestMediaAttachment\.attachmentId/);
  assert.doesNotMatch(golferHub, /href="#living-content-editor">Add a completed lesson/);

  assert.match(workspacePage, /resolveCoachingWorkspaceLocation/);
  assert.match(workspacePage, /initialFocus=\{initialLocation\.focus\}/);
  assert.match(workspace, /target\.closest\("details"\)/);
  assert.match(workspace, /disclosure\.open = true/);
  assert.match(workspace, /checkInId: checkIn\.id/);
  assert.match(workspace, /Import receipts/);
  assert.match(workspace, /kind: "launch_import"/);
  assert.match(mediaLibrary, /id=\{`media-asset-\$\{asset\.id\}`\}/);

  assert.match(nextAction, /const golferHref = `\/app\/golfers\/\$\{encodeURIComponent\(golfer\.id\)\}`/);
  assert.match(nextAction, /href: `\$\{golferHref\}\/recover`/);
  assert.match(recoveryPage, /const encodedGolferId = encodeURIComponent\(golferId\)/);
  assert.match(recoveryPage, /const returnTo = `\/app\/golfers\/\$\{encodedGolferId\}\/recover`/);
  assert.match(recoveryPage, /requirePageIdentity\(returnTo\)/);
  assert.match(recoveryPage, /if \(action\.href !== returnTo\) redirect\(action\.href\)/);
});
