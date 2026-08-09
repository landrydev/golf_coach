import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");

test("the local recovery exercise boots the exact build against restored D1 and R2 state", async () => {
  const [packageJson, exercise, workerSupport] = await Promise.all([
    readFile(resolve(projectRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(
      resolve(projectRoot, "scripts/local-synthetic-recovery-exercise.mjs"),
      "utf8",
    ),
    readFile(resolve(projectRoot, "tests/support/d1-worker.mjs"), "utf8"),
  ]);

  assert.match(
    packageJson.scripts["exercise:recovery:local"],
    /^npm run build && node /u,
  );
  assert.match(exercise, /startD1Worker\(/u);
  assert.match(
    exercise,
    /const applicationDatabase = await restoredApplication\.database\(\)/u,
  );
  assert.match(
    exercise,
    /applicationDatabase\.exec\(snapshot\.toString\("utf8"\)\)/u,
  );
  assert.match(
    exercise,
    /applicationDatabase\.batch\([\s\S]*?buildRecoveryNormalizationStatements\(\)[\s\S]*?applicationDatabase\.prepare\(statement\)/u,
  );
  assert.match(exercise, /await restoredApplication\.media\(\)/u);
  assert.match(exercise, /dispatch\("\/api\/profile"/u);
  assert.match(exercise, /dispatch\("\/api\/packages"/u);
  assert.match(exercise, /dispatch\("\/app"/u);
  assert.match(
    exercise,
    /'consent-alpha-golfer-record'[\s\S]*?'golfer_record'[\s\S]*?'synthetic-golfer-record-v1'/u,
  );
  assert.match(
    exercise,
    /assert\.match\(workspaceBody, \/Synthetic Golfer Alpha\/u\)/u,
  );
  assert.match(
    exercise,
    /assert\.match\(workspaceBody, \/Synthetic Alpha Roadmap\/u\)/u,
  );
  assert.match(
    exercise,
    /assert\.doesNotMatch\(workspaceBody, \/Golfer records are unavailable\\\.\/u\)/u,
  );
  assert.match(exercise, /"\/api\/operations\/health"/u);
  assert.match(exercise, /restoredApplicationRuntime: applicationResult/u);
  assert.match(workerSupport, /media\(\) \{[\s\S]*?getR2Bucket\("MEDIA"\)/u);
});
