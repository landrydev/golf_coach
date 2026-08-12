import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { STARTER_DRILL_EXAMPLES } from "../app/app/coaching/drills/starter-drills.ts";

test("real drill library exposes multiple complete synthetic starters without persisting them", async () => {
  assert.ok(STARTER_DRILL_EXAMPLES.length >= 2);
  for (const example of STARTER_DRILL_EXAMPLES) {
    assert.match(example.id, /^synthetic-/);
    assert.match(example.draft.title, /editable example/i);
    assert.ok(example.summary.length > 20);
    for (const field of [
      "purpose",
      "whenItFits",
      "setup",
      "dosageOrCadence",
      "successCheck",
      "stopOrAskRule",
    ]) {
      assert.ok(example.draft[field].trim().length > 20, `${example.id}.${field}`);
    }
    assert.ok(example.draft.equipment.length > 0);
    assert.ok(example.draft.steps.length >= 3);
  }

  const [library, starters] = await Promise.all([
    readFile(new URL("../app/app/coaching/drills/DrillLibrary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app/coaching/drills/starter-drills.ts", import.meta.url), "utf8"),
  ]);
  assert.match(library, /Unsaved synthetic starters/);
  assert.match(library, /not a diagnosis,[\s\S]*universal instruction/);
  assert.match(library, /saves nothing until you choose Create drill/);
  assert.match(library, /Use as unsaved draft/);
  assert.match(library, /setDraft\(starterDraft\(example\.draft\)\)/);
  assert.match(library, /setSelectedId\(null\)/);
  assert.match(library, /setStarterExampleId\(example\.id\)/);
  assert.doesNotMatch(starters, /fetch\(|requestClient|\/api\//);
});
