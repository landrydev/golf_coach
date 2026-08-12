import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Beta 2 coach navigation exposes only the four primary jobs", async () => {
  const source = await read("app/app/layout.tsx");
  for (const label of ["Home", "Players", "Library", "Settings"]) {
    assert.match(source, new RegExp(`>${label}<`));
  }
  assert.doesNotMatch(source, />Plan &amp; billing</);
  assert.doesNotMatch(source, />Media</);
  assert.doesNotMatch(source, />Packages</);
});

test("Beta 2 home is organized around attention and progress", async () => {
  const source = await read("app/app/page.tsx");
  assert.match(source, /Continue where you left off/);
  assert.match(source, /Players needing attention/);
  assert.match(source, /Recent progress/);
});

test("Beta 2 roadmap authoring is a short conversation with three phases by default", async () => {
  const source = await read("app/app/golfers/new/QuickRoadmapForm.tsx");
  for (const prompt of ["The outcome", "Your read", "The path", "The first commitment"]) {
    assert.match(source, new RegExp(prompt));
  }
  assert.match(source, /Build the foundation/);
  assert.match(source, /Make it reliable/);
  assert.match(source, /Transfer it to play/);
});

test("Beta 2 lesson update asks only for the meaningful coaching result", async () => {
  const source = await read("app/app/golfers/[golferId]/QuickLessonUpdate.tsx");
  assert.match(source, /What changed today/);
  assert.match(source, /What should the player practise next/);
  assert.match(source, /What should they pay attention to/);
});

test("Beta 2 golfer roadmap reads as an editorial coaching story", async () => {
  const source = await read("components/plan/PlanView.tsx");
  for (const chapter of [
    "Where you are going",
    "Where you are starting",
    "What matters now",
    "Your path",
    "This week",
    "Evidence of progress",
    "A note from your coach",
  ]) {
    assert.match(source, new RegExp(chapter));
  }
});
