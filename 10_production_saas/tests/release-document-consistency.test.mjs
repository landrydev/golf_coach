import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("README current-release identity matches the authoritative release record", async () => {
  const [readme, releaseEvidence] = await Promise.all([
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/RELEASE_EVIDENCE.md", import.meta.url), "utf8"),
  ]);

  const candidate = releaseEvidence.match(
    /^\| Candidate \| `ROADMAP-SITES-V(\d+)-[^`]+` \|$/m,
  );
  const runtimeCommit = releaseEvidence.match(
    /^\| Release commit \/ runtime `RELEASE_ID` \| `([0-9a-f]{40})` \|$/m,
  );

  assert.ok(candidate, "release evidence must declare the exact Sites candidate");
  assert.ok(runtimeCommit, "release evidence must declare the runtime release commit");
  assert.match(
    readme,
    new RegExp(`Sites version ${candidate[1]} is deployed owner-only`),
  );
  assert.ok(
    readme.includes(`\`${runtimeCommit[1]}\``),
    "README must identify the exact runtime release commit",
  );

  const currentReleaseSection = readme.match(
    /## Current private release\s+([\s\S]*?)(?=\n## )/,
  );
  assert.ok(currentReleaseSection, "README must keep a current private release section");
  const readmeVersion = currentReleaseSection[1].match(
    /Sites version (\d+) is deployed owner-only/,
  );
  assert.ok(readmeVersion, "README must identify its deployed Sites version");
  assert.equal(readmeVersion[1], candidate[1]);
});

test("visual-review harness exchanges a capability for a session before setting its local cookie", async () => {
  const harness = await readFile(
    new URL("../scripts/visual-review-server.mjs", import.meta.url),
    "utf8",
  );

  assert.match(
    harness,
    /worker\.dispatch\("\/r\/session",\s*\{[\s\S]*?body: JSON\.stringify\(\{ token: fixture\.token \}\)/,
  );
  assert.match(harness, /sessionCookie\.replace\(\/;\\s\*Secure\\b\/gi, ""\)/);
  assert.doesNotMatch(harness, /roadmap_share=\$\{fixture\.token\}/);
});
