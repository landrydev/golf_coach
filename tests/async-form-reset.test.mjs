import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sources = [
  new URL("../app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", import.meta.url),
  new URL("../app/app/coaching/drills/DrillLibrary.tsx", import.meta.url),
];

test("async coaching form handlers retain their concrete form before awaiting", async () => {
  for (const sourcePath of sources) {
    const source = await readFile(sourcePath, "utf8");

    assert.doesNotMatch(
      source,
      /event\.currentTarget\.reset\(\)/,
      `${sourcePath.pathname} must not dereference a React event after an awaited request`,
    );
  }
});
