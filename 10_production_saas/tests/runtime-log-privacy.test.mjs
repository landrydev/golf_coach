import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const stableIdentifierNames = [
  "accountId",
  "attemptId",
  "reconciliationId",
  "providerEventId",
  "providerCustomerId",
  "providerSubscriptionId",
  "providerSessionId",
  "sessionId",
  "shareId",
  "golferId",
  "planId",
];

test("production console calls omit stable customer and provider identifiers", async () => {
  let reviewedCalls = 0;
  const productionSources = (
    await Promise.all(
      ["app", "lib", "worker"].map((directory) =>
        walk(resolve(projectRoot, directory)),
      ),
    )
  )
    .flat()
    .filter((filename) => /\.(?:ts|tsx)$/.test(filename));

  for (const filename of productionSources) {
    const relativePath = relative(projectRoot, filename).replaceAll("\\", "/");
    const source = await readFile(filename, "utf8");
    const calls = consoleCalls(source);
    reviewedCalls += calls.length;

    for (const call of calls) {
      for (const identifier of stableIdentifierNames) {
        assert.doesNotMatch(
          call,
          new RegExp(`\\b${identifier}\\b`),
          `${relativePath} logs stable identifier ${identifier}`,
        );
      }
      assert.doesNotMatch(call, /request\.(?:url|headers|body)\b/);
      assert.doesNotMatch(call, /\b(?:email|token|capability|cookie|authorization)\s*:/i);
    }
  }
  assert.ok(reviewedCalls >= 10, "the production log inventory unexpectedly shrank");
});

test("custom error names are normalized before logging", async () => {
  const { safeErrorType } = await import("../lib/log-safety.ts");
  const custom = new Error("private message");
  custom.name = "CoachPrivateName";
  assert.equal(safeErrorType(custom), "Error");
  assert.equal(safeErrorType(new TypeError("private message")), "TypeError");
  assert.equal(safeErrorType("private value"), "string");
  assert.equal(safeErrorType({ private: true }), "unknown");
});

function consoleCalls(source) {
  return [...source.matchAll(/console\.(?:error|warn|info|log)\([\s\S]*?\);/g)]
    .map((match) => match[0]);
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(filename)));
    else files.push(filename);
  }
  return files;
}
