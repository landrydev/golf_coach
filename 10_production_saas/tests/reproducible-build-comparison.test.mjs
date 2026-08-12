import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compareReleaseBuilds } from "../scripts/compare-release-builds.mjs";

const leftBuildId = "11111111-1111-4111-8111-111111111111";
const rightBuildId = "22222222-2222-4222-8222-222222222222";
const leftSecret = "a".repeat(64);
const rightSecret = "b".repeat(64);

test("release-build comparison permits only controlled framework-generated values", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "release-build-compare-"));
  try {
    const left = path.join(temporaryRoot, "left");
    const right = path.join(temporaryRoot, "right");
    await Promise.all([
      writeFixture(left, leftBuildId, leftSecret),
      writeFixture(right, rightBuildId, rightSecret),
    ]);

    const report = await compareReleaseBuilds({ leftDist: left, rightDist: right });
    assert.equal(report.fileCount, 4);
    assert.equal(report.rawDifferenceCount, 3);
    assert.equal(report.normalizedDifferenceCount, 0);
    assert.deepEqual(report.serverBuildIdOccurrences, { left: 3, right: 3 });

    await writeFile(path.join(right, "client", "stable.js"), "changed\n", "utf8");
    await assert.rejects(
      compareReleaseBuilds({ leftDist: left, rightDist: right }),
      /outside controlled generated values/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("release-build comparison requires independent build directories", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "release-build-compare-"));
  try {
    const build = path.join(temporaryRoot, "build");
    await writeFixture(build, leftBuildId, leftSecret);
    await assert.rejects(
      compareReleaseBuilds({ leftDist: build, rightDist: build }),
      /two distinct directories/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("release-build comparison requires every generated path", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "release-build-compare-"));
  try {
    const left = path.join(temporaryRoot, "left");
    const right = path.join(temporaryRoot, "right");
    await Promise.all([
      writeFixture(left, leftBuildId, leftSecret),
      writeFixture(right, rightBuildId, rightSecret),
    ]);
    await Promise.all([
      rm(path.join(left, "server", "index.js")),
      rm(path.join(right, "server", "index.js")),
    ]);
    await assert.rejects(
      compareReleaseBuilds({ leftDist: left, rightDist: right }),
      /missing required generated path: server\/index\.js/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("release-build comparison rejects manifest byte-shape drift", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "release-build-compare-"));
  try {
    const left = path.join(temporaryRoot, "left");
    const right = path.join(temporaryRoot, "right");
    await Promise.all([
      writeFixture(left, leftBuildId, leftSecret),
      writeFixture(right, rightBuildId, rightSecret),
    ]);
    const manifestPath = path.join(right, "server", "vinext-server.json");
    await writeFile(
      manifestPath,
      `{ "prerenderSecret": "${rightSecret}" }`,
      "utf8",
    );
    await assert.rejects(
      compareReleaseBuilds({ leftDist: left, rightDist: right }),
      /generated manifest has an unexpected shape/,
    );

    await writeFile(
      manifestPath,
      `{"prerenderSecret":"${rightSecret}","prerenderSecret":"${rightSecret}"}`,
      "utf8",
    );
    await assert.rejects(
      compareReleaseBuilds({ leftDist: left, rightDist: right }),
      /generated manifest has an unexpected shape/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("release-build comparison confines the build ID to the compiled ISR block", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "release-build-compare-"));
  try {
    const left = path.join(temporaryRoot, "left");
    const right = path.join(temporaryRoot, "right");
    await Promise.all([
      writeFixture(left, leftBuildId, leftSecret),
      writeFixture(right, rightBuildId, rightSecret),
    ]);
    await writeFile(
      path.join(right, "server", "index.js"),
      serverIndex(rightBuildId).replace(
        "function __isrCacheKey(pathname, suffix)",
        "function relocatedCacheKey(pathname, suffix)",
      ),
      "utf8",
    );
    await assert.rejects(
      compareReleaseBuilds({ leftDist: left, rightDist: right }),
      /not confined to the expected ISR cache-key block/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function writeFixture(root, buildId, secret) {
  await Promise.all([
    mkdir(path.join(root, "client"), { recursive: true }),
    mkdir(path.join(root, "server", "ssr"), { recursive: true }),
  ]);
  const manifest = JSON.stringify({ prerenderSecret: secret });
  await Promise.all([
    writeFile(path.join(root, "client", "stable.js"), "stable\n", "utf8"),
    writeFile(path.join(root, "server", "index.js"), serverIndex(buildId), "utf8"),
    writeFile(path.join(root, "server", "vinext-server.json"), manifest, "utf8"),
    writeFile(
      path.join(root, "server", "ssr", "vinext-server.json"),
      manifest,
      "utf8",
    ),
  ]);
}

function serverIndex(buildId) {
  return [
    "var request = {",
    "\tget buildId() {",
    `\t\treturn "${buildId}";`,
    "\t}",
    "};",
    "function __isrCacheKey(pathname, suffix) {",
    '\tconst normalized = pathname === "/" ? "/" : pathname.replace(/\\\/$/, "");',
    `\tconst key = "app:${buildId}:" + normalized + ":" + suffix;`,
    "\tif (key.length <= 200) return key;",
    `\treturn "app:${buildId}:__hash:" + __isrFnv1a64(normalized) + ":" + suffix;`,
    "}",
    "",
  ].join("\n");
}
