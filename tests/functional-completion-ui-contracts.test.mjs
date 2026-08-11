import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("creation, editing, and templates expose draft structure controls and an unsaved golfer candidate", async () => {
  const [staged, editor, template, candidate] = await Promise.all([
    source("app/app/golfers/[golferId]/complete/StagedCompletionForm.tsx"),
    source("app/app/golfers/[golferId]/edit/PlanEditorForm.tsx"),
    source("app/app/coaching/roadmaps/RoadmapTemplateLibrary.tsx"),
    source("app/app/golfers/[golferId]/AuthoringCandidatePreview.tsx"),
  ]);

  assert.match(staged, /Duplicate as Phase 4/);
  assert.match(staged, /moveLaterPhase/);
  assert.match(editor, /moveLaterPhase/);
  assert.match(template, /movePhase/);
  assert.match(template, /duplicatePhase/);
  assert.match(staged, /Refresh golfer preview/);
  assert.match(editor, /Refresh golfer preview/);
  assert.match(staged, /captureAuthoringDraftValues\(form\)/);
  assert.match(editor, /captureAuthoringDraftValues\(form\)/);
  assert.match(candidate, /Unsaved candidate · not shared/);
  assert.match(candidate, /exact draft words and phase order/);
});

test("private golfer media has poster, low-bandwidth, failure, and retry states", async () => {
  const [library, renderer, view, mediaDomain] = await Promise.all([
    source("app/app/media/MediaLibrary.tsx"),
    source("components/plan/PrivatePlanMedia.tsx"),
    source("components/plan/PlanView.tsx"),
    source("lib/media.ts"),
  ]);

  assert.match(library, /name="posterMediaAssetId"/);
  assert.match(library, /Video poster \/ thumbnail/);
  assert.match(library, /const durationSeconds = await finiteVideoDuration\(video\)/);
  assert.match(library, /VIDEO_DURATION_RECOVERY_TIMEOUT_MS = 4_000/);
  assert.match(library, /video\.currentTime = Number\.MAX_SAFE_INTEGER/);
  assert.match(library, /\["durationchange", "seeked", "timeupdate"\]/);
  assert.match(renderer, /poster=\{posterSrc \|\| undefined\}/);
  assert.match(renderer, /Media is taking longer to load/);
  assert.match(renderer, /Selected media could not load/);
  assert.match(renderer, /Try loading again/);
  assert.match(view, /item\.posterMediaAssetId/);
  assert.match(mediaDomain, /posterMediaAssetId: details\?\.posterMediaAssetId/);
  assert.match(mediaDomain, /posterForAttachment/);
});
