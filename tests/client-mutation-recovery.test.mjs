import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CLIENT_MUTATION_TIMEOUT_MS,
  ClientMutationOutcomeUnknownError,
  clientMutationErrorMessage,
  requestClientMutation,
} from "../lib/client-mutation-recovery.ts";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("bounded client mutations return definitive responses without replay", async () => {
  let calls = 0;
  let receivedSignal;
  const response = new Response(JSON.stringify({ ok: true }), { status: 201 });

  const actual = await requestClientMutation(
    "/api/synthetic",
    { method: "POST" },
    {
      timeoutMs: 100,
      fetcher: async (_input, init) => {
        calls += 1;
        receivedSignal = init.signal;
        return response;
      },
    },
  );

  assert.equal(actual, response);
  assert.equal(calls, 1);
  assert.equal(receivedSignal instanceof AbortSignal, true);
  assert.equal(receivedSignal.aborted, false);
  assert.equal(CLIENT_MUTATION_TIMEOUT_MS, 10_000);
});

test("definitive client errors are returned to the caller", async () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    const response = await requestClientMutation(
      "/api/synthetic",
      { method: "POST" },
      {
        timeoutMs: 100,
        fetcher: async () => new Response(null, { status }),
      },
    );
    assert.equal(response.status, status);
  }
});

test("retryable responses are outcome-unknown and are never replayed", async () => {
  for (const status of [408, 425, 429, 500, 503]) {
    let calls = 0;
    await assert.rejects(
      requestClientMutation(
        "/api/synthetic",
        { method: "POST" },
        {
          timeoutMs: 100,
          fetcher: async () => {
            calls += 1;
            return new Response(null, { status });
          },
        },
      ),
      (error) => {
        assert.equal(error instanceof ClientMutationOutcomeUnknownError, true);
        assert.equal(error.reason, "retryable_response");
        assert.equal(error.status, status);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});

test("transport rejection and an uncooperative stalled fetch are outcome-unknown", async () => {
  await assert.rejects(
    requestClientMutation(
      "/api/synthetic",
      { method: "POST" },
      {
        timeoutMs: 100,
        fetcher: async () => {
          throw new TypeError("synthetic network loss");
        },
      },
    ),
    (error) => {
      assert.equal(error instanceof ClientMutationOutcomeUnknownError, true);
      assert.equal(error.reason, "transport");
      assert.equal(error.status, null);
      return true;
    },
  );

  let calls = 0;
  let signal;
  const startedAt = performance.now();
  await assert.rejects(
    requestClientMutation(
      "/api/synthetic",
      { method: "POST" },
      {
        timeoutMs: 15,
        fetcher: (_input, init) => {
          calls += 1;
          signal = init.signal;
          return new Promise(() => undefined);
        },
      },
    ),
    (error) => {
      assert.equal(error instanceof ClientMutationOutcomeUnknownError, true);
      assert.equal(error.reason, "timeout");
      return true;
    },
  );
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  assert.ok(performance.now() - startedAt < 500);
});

test("outcome-unknown copy distinguishes same-attempt retry from reload-first recovery", () => {
  const error = new ClientMutationOutcomeUnknownError("timeout");
  assert.equal(
    clientMutationErrorMessage(
      error,
      "the package was saved",
      "retry_same_attempt",
      "fallback",
    ),
    "Roadmap could not confirm whether the package was saved. Check your connection, then try this same action again; Roadmap will reuse the same attempt.",
  );
  assert.equal(
    clientMutationErrorMessage(
      error,
      "the plan changes were saved",
      "reload_before_retry",
      "fallback",
    ),
    "Roadmap could not confirm whether the plan changes were saved. Reload this page to check the current state before trying again.",
  );
  assert.equal(
    clientMutationErrorMessage(
      new Error("definitive"),
      "anything happened",
      "reload_before_retry",
      "fallback",
    ),
    "definitive",
  );
  assert.equal(
    clientMutationErrorMessage(
      "unknown",
      "anything happened",
      "reload_before_retry",
      "fallback",
    ),
    "fallback",
  );
});

test("every instructor client network call uses the bounded mutation helper", async () => {
  const expectedCalls = new Map([
    ["app/app/golfers/[golferId]/LivingPlanForms.tsx", 2],
    ["app/app/golfers/[golferId]/PublishControls.tsx", 2],
    ["app/app/golfers/[golferId]/complete/StagedCompletionForm.tsx", 1],
    ["app/app/golfers/[golferId]/edit/PlanEditorForm.tsx", 1],
    ["app/app/golfers/[golferId]/settings/GolferSettingsForm.tsx", 2],
    ["app/app/golfers/new/NewGolferForm.tsx", 1],
    ["app/app/golfers/new/StagedGolferForm.tsx", 1],
    ["app/app/packages/PackageForm.tsx", 1],
    ["app/app/packages/PackageLifecycleControls.tsx", 1],
    ["app/app/settings/ProfileForm.tsx", 1],
    ["app/app/settings/data/DataRequestControls.tsx", 4],
  ]);
  const clientFiles = await discoverClientSourceFiles(
    path.join(projectRoot, "app", "app"),
  );
  const actualCalls = new Map();

  for (const filename of clientFiles) {
    const source = await readFile(filename, "utf8");
    assert.doesNotMatch(
      source,
      /\bfetch\s*\(/,
      `${relativePath(filename)} bypasses the bounded client mutation helper`,
    );
    const callCount = [...source.matchAll(/\brequestClientMutation\s*\(/g)].length;
    if (callCount > 0) {
      assert.match(source, /@\/lib\/client-mutation-recovery/);
      actualCalls.set(relativePath(filename), callCount);
    }
  }

  assert.deepEqual(actualCalls, expectedCalls);
  assert.equal(
    [...actualCalls.values()].reduce((total, count) => total + count, 0),
    17,
  );
});

async function discoverClientSourceFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const filename = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await discoverClientSourceFiles(filename)));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    const source = await readFile(filename, "utf8");
    if (source.startsWith('"use client";')) files.push(filename);
  }
  return files.sort();
}

function relativePath(filename) {
  return path.relative(projectRoot, filename).replaceAll("\\", "/");
}
