import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CLIENT_MUTATION_MAX_RESPONSE_BYTES,
  CLIENT_MUTATION_TIMEOUT_MS,
  ClientMutationOutcomeUnknownError,
  clientMutationErrorMessage,
  requestClientMutation,
  requireClientMutationJson,
  requireClientMutationSuccess,
} from "../lib/client-mutation-recovery.ts";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("bounded client mutations return definitive responses without replay", async () => {
  let calls = 0;
  let receivedSignal;
  const response = new Response(JSON.stringify({ ok: true }), {
    status: 201,
    statusText: "Created",
    headers: {
      "Content-Type": "application/json",
      "X-Synthetic": "buffered",
    },
  });

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

  assert.notEqual(actual, response);
  assert.equal(calls, 1);
  assert.equal(receivedSignal instanceof AbortSignal, true);
  assert.equal(receivedSignal.aborted, false);
  assert.equal(actual.redirected, false);
  assert.equal(response.bodyUsed, true);
  assert.equal(actual.status, 201);
  assert.equal(actual.statusText, "Created");
  assert.equal(actual.headers.get("x-synthetic"), "buffered");
  assert.deepEqual(await actual.json(), { ok: true });
  assert.equal(CLIENT_MUTATION_TIMEOUT_MS, 10_000);
});

test("client mutations reject followed redirects before buffering their bodies", async () => {
  let calls = 0;
  let cancelled = false;
  let receivedInit;
  const redirectedResponse = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
    { status: 200 },
  );
  Object.defineProperty(redirectedResponse, "redirected", { value: true });

  await assert.rejects(
    requestClientMutation(
      "/api/synthetic",
      { method: "POST", redirect: "follow" },
      {
        timeoutMs: 100,
        fetcher: async (_input, init) => {
          calls += 1;
          receivedInit = init;
          return redirectedResponse;
        },
      },
    ),
    (error) => {
      assert.equal(error instanceof ClientMutationOutcomeUnknownError, true);
      assert.equal(error.reason, "redirected_response");
      assert.equal(error.status, 200);
      return true;
    },
  );

  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(receivedInit.redirect, "error");
  assert.equal(receivedInit.signal.aborted, true);
  assert.equal(cancelled, true);
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

test("retryable responses abort the request and cancel their bodies", async () => {
  let calls = 0;
  let cancelled = false;
  let signal;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
    { status: 503 },
  );

  await assert.rejects(
    requestClientMutation(
      "/api/synthetic",
      { method: "POST" },
      {
        timeoutMs: 100,
        fetcher: async (_input, init) => {
          calls += 1;
          signal = init.signal;
          return response;
        },
      },
    ),
    (error) => {
      assert.equal(error instanceof ClientMutationOutcomeUnknownError, true);
      assert.equal(error.reason, "retryable_response");
      assert.equal(error.status, 503);
      return true;
    },
  );

  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  assert.equal(cancelled, true);
  assert.equal(response.bodyUsed, true);
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

test("the deadline covers a response body that stalls after headers", async () => {
  let calls = 0;
  let cancelled = false;
  let signal;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"partial":'));
      },
      cancel() {
        cancelled = true;
      },
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json" },
    },
  );

  await assert.rejects(
    requestClientMutation(
      "/api/synthetic",
      { method: "POST" },
      {
        timeoutMs: 15,
        fetcher: async (_input, init) => {
          calls += 1;
          signal = init.signal;
          return response;
        },
      },
    ),
    (error) => {
      assert.equal(error instanceof ClientMutationOutcomeUnknownError, true);
      assert.equal(error.reason, "timeout");
      return true;
    },
  );

  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  assert.equal(cancelled, true);
  assert.equal(response.bodyUsed, true);
});

test("oversized mutation responses are outcome-unknown and are never replayed", async () => {
  let calls = 0;
  let cancelled = false;
  let signal;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          new Uint8Array(CLIENT_MUTATION_MAX_RESPONSE_BYTES + 1),
        );
      },
      cancel() {
        cancelled = true;
      },
    }),
    {
      status: 201,
      statusText: "Created",
      headers: { "Content-Type": "application/json" },
    },
  );

  await assert.rejects(
    requestClientMutation(
      "/api/synthetic",
      { method: "POST" },
      {
        timeoutMs: 100,
        fetcher: async (_input, init) => {
          calls += 1;
          signal = init.signal;
          return response;
        },
      },
    ),
    (error) => {
      assert.equal(error instanceof ClientMutationOutcomeUnknownError, true);
      assert.equal(error.reason, "response_too_large");
      assert.equal(error.status, 201);
      return true;
    },
  );

  await Promise.resolve();
  assert.equal(CLIENT_MUTATION_MAX_RESPONSE_BYTES, 8 * 1024 * 1024);
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  assert.equal(cancelled, true);
  assert.equal(response.bodyUsed, true);
});

test("bodyless response statuses remain valid buffered responses", async () => {
  for (const [status, statusText] of [
    [204, "No Content"],
    [205, "Reset Content"],
    [304, "Not Modified"],
  ]) {
    let calls = 0;
    const actual = await requestClientMutation(
      "/api/synthetic",
      { method: "POST" },
      {
        timeoutMs: 100,
        fetcher: async () => {
          calls += 1;
          return new Response(null, {
            status,
            statusText,
            headers: { "X-Synthetic": "bodyless" },
          });
        },
      },
    );

    assert.equal(calls, 1);
    assert.equal(actual.status, status);
    assert.equal(actual.statusText, statusText);
    assert.equal(actual.headers.get("x-synthetic"), "bodyless");
    assert.equal(actual.body, null);
    assert.equal(await actual.text(), "");
  }
});

test("malformed or structurally invalid 2xx JSON is outcome-unknown", async () => {
  for (const response of [
    new Response('{"golfer":', {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
    new Response(JSON.stringify({ golfer: {} }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
  ]) {
    await assert.rejects(
      requireClientMutationJson(
        response,
        (value) =>
          value !== null &&
          typeof value === "object" &&
          "golfer" in value &&
          value.golfer !== null &&
          typeof value.golfer === "object" &&
          "id" in value.golfer &&
          typeof value.golfer.id === "string",
        "fallback",
      ),
      (error) => {
        assert.equal(error instanceof ClientMutationOutcomeUnknownError, true);
        assert.equal(error.reason, "malformed_success_response");
        assert.equal(error.status, 201);
        return true;
      },
    );
  }
});

test("status-constrained success rejects an unexpected 2xx acknowledgement", async () => {
  await requireClientMutationSuccess(
    new Response(null, { status: 204 }),
    "fallback",
    [204],
  );
  await assert.rejects(
    requireClientMutationSuccess(
      new Response(null, { status: 200 }),
      "fallback",
      [204],
    ),
    (error) => {
      assert.equal(error instanceof ClientMutationOutcomeUnknownError, true);
      assert.equal(error.reason, "malformed_success_response");
      assert.equal(error.status, 200);
      return true;
    },
  );
});

test("malformed and structured non-2xx JSON remain definitive failures", async () => {
  await assert.rejects(
    requireClientMutationJson(
      new Response("not json", { status: 400 }),
      () => false,
      "Safe fallback",
    ),
    (error) => {
      assert.equal(error instanceof ClientMutationOutcomeUnknownError, false);
      assert.equal(error.message, "Safe fallback");
      return true;
    },
  );
  await assert.rejects(
    requireClientMutationJson(
      new Response(JSON.stringify({ error: { message: "Specific failure" } }), {
        status: 409,
      }),
      () => false,
      "Safe fallback",
    ),
    (error) => {
      assert.equal(error instanceof ClientMutationOutcomeUnknownError, false);
      assert.equal(error.message, "Specific failure");
      return true;
    },
  );
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

test("every application client network call uses a bounded recovery helper", async () => {
  const expectedCalls = new Map([
    ["app/app/golfers/[golferId]/LivingPlanForms.tsx", { mutation: 2 }],
    ["app/app/golfers/[golferId]/PublishControls.tsx", { mutation: 4 }],
    ["app/app/golfers/[golferId]/complete/StagedCompletionForm.tsx", { mutation: 1 }],
    ["app/app/golfers/[golferId]/edit/PlanEditorForm.tsx", { mutation: 1 }],
    ["app/app/golfers/[golferId]/settings/GolferSettingsForm.tsx", { mutation: 2 }],
    ["app/app/golfers/new/NewGolferForm.tsx", { mutation: 1 }],
    ["app/app/golfers/new/StagedGolferForm.tsx", { mutation: 1 }],
    ["app/app/packages/PackageForm.tsx", { mutation: 1 }],
    ["app/app/packages/PackageLifecycleControls.tsx", { mutation: 1 }],
    ["app/app/settings/ProfileForm.tsx", { mutation: 1 }],
    ["app/app/settings/shares/ShareAccessControls.tsx", { mutation: 1 }],
    ["app/app/settings/data/DataRequestControls.tsx", { mutation: 4 }],
    ["app/r/ShareAccess.tsx", { shareExchange: 1 }],
    ["components/consent/ConsentPurposeControl.tsx", { mutation: 1 }],
    ["components/plan/CloseRoadmap.tsx", { mutation: 1 }],
    [
      "components/plan/GolferChoices.tsx",
      { golferResponse: 1, externalHandoff: 1 },
    ],
  ]);
  const clientFiles = (
    await Promise.all(
      ["app", "components", "lib"].map((directory) =>
        discoverClientSourceFiles(path.join(projectRoot, directory)),
      ),
    )
  ).flat().sort();
  const actualCalls = new Map();

  for (const filename of clientFiles) {
    const source = await readFile(filename, "utf8");
    assert.doesNotMatch(
      source,
      new RegExp(CLIENT_NETWORK_PRIMITIVE.source),
      `${relativePath(filename)} uses a browser network primitive outside an approved helper`,
    );
    const calls = {
      mutation: countCalls(source, "requestClientMutation"),
      golferResponse: countCalls(source, "requestGolferResponse"),
      shareExchange: countCalls(source, "requestShareExchange"),
      externalHandoff: countCalls(source, "attemptExternalHandoffRecord"),
    };
    const usedCalls = Object.fromEntries(
      Object.entries(calls).filter(([, count]) => count > 0),
    );
    if (Object.keys(usedCalls).length > 0) {
      actualCalls.set(relativePath(filename), usedCalls);
    }
  }

  assert.deepEqual(actualCalls, expectedCalls);
});

test("network primitives stay inside explicit browser and server transport allowlists", async () => {
  const approvedBrowserTransports = new Map([
    ["lib/client-mutation-recovery.ts", ["fetch"]],
    ["lib/client-recovery.ts", ["fetch"]],
  ]);
  const approvedServerTransports = new Map([
    ["lib/http.ts", ["fetch", "fetch"]],
    ["lib/stripe.ts", ["fetch"]],
    ["lib/synthetic-concurrency-barrier.ts", ["fetch"]],
  ]);
  const approved = new Map([
    ...approvedBrowserTransports,
    ...approvedServerTransports,
  ]);
  const actual = new Map();
  const sourceFiles = (
    await Promise.all(
      ["app", "components", "lib"].map((directory) =>
        discoverSourceFiles(path.join(projectRoot, directory)),
      ),
    )
  ).flat().sort();

  for (const filename of sourceFiles) {
    const source = await readFile(filename, "utf8");
    const primitives = [...source.matchAll(CLIENT_NETWORK_PRIMITIVE)].map(
      (match) => networkPrimitiveName(match[0]),
    );
    if (primitives.length > 0) actual.set(relativePath(filename), primitives);
  }

  assert.deepEqual(actual, approved);
});

test("outcome-unknown keyed retries retain their exact payload and visible state", async () => {
  for (const relativeFilename of [
    "app/app/golfers/new/NewGolferForm.tsx",
    "app/app/golfers/new/StagedGolferForm.tsx",
    "app/app/packages/PackageForm.tsx",
  ]) {
    const source = await readFile(path.join(projectRoot, relativeFilename), "utf8");
    assert.match(source, /pendingAttemptRef/);
    assert.match(source, /JSON\.stringify\(/);
    assert.match(source, /persistKeyedAttempt\(/);
    assert.match(source, /body:\s*attempt\.body/);
    assert.match(source, /keyedAttemptMutationDisposition\(/);
    assert.match(source, /clearKeyedAttempt\(/);
    assert.match(source, /isClientMutationOutcomeUnknown\(/);
    assert.match(source, /===\s*"recovery"/);
    assert.match(source, /===\s*"blocked"/);
  }

  const dataRequests = await readFile(
    path.join(projectRoot, "app/app/settings/data/DataRequestControls.tsx"),
    "utf8",
  );
  assert.match(dataRequests, /manualReviewAttemptRef/);
  assert.match(dataRequests, /data_request_manual_create/);
  assert.match(dataRequests, /data_request_deletion_create/);
  assert.match(dataRequests, /body:\s*attempt\.body/);
  assert.match(dataRequests, /setManualRecovery\("retry"\)/);
  assert.match(dataRequests, /anyRecoveryPending/);
  assert.match(dataRequests, /Reload and inspect request history/);

  const publishing = await readFile(
    path.join(projectRoot, "app/app/golfers/[golferId]/PublishControls.tsx"),
    "utf8",
  );
  const publishFunction = publishing.slice(
    publishing.indexOf("async function publish"),
    publishing.indexOf("async function revoke"),
  );
  assert.doesNotMatch(publishFunction, /setShareUrl\(""\)/);
  assert.match(publishFunction, /requireClientMutationJson/);
});

test("definitive close and share exchange state precedes fallible browser effects", async () => {
  const closeSource = await readFile(
    path.join(projectRoot, "components/plan/CloseRoadmap.tsx"),
    "utf8",
  );
  assert.match(
    closeSource,
    /catch \(error\)[\s\S]*return;[\s\S]*setClosed\(true\)[\s\S]*window\.location\.replace/,
  );

  const shareSource = await readFile(
    path.join(projectRoot, "app/r/ShareAccess.tsx"),
    "utf8",
  );
  assert.match(
    shareSource,
    /active\.current &&[\s\S]*currentGeneration\.current === generation &&[\s\S]*fragmentBelongsTo\(generation\.token\)/,
  );
  assert.match(
    shareSource,
    /runOwnedEffect\(generation, clearGolferResponsePendingAttempt\)[\s\S]*runOwnedEffect\(generation, \(\) => setRedirectTo\(result\.redirectTo\)\)[\s\S]*runOwnedEffect\(generation, \(\) => setState\("access_granted"\)\)[\s\S]*runOwnedEffect\(generation, \(\) => \{[\s\S]*shareToken\.current = null;[\s\S]*clearFragment\(generation, result\.redirectTo\)[\s\S]*window\.location\.replace/,
  );
  assert.match(
    shareSource,
    /addEventListener\("hashchange", beginCurrentGeneration\)[\s\S]*removeEventListener\("hashchange", beginCurrentGeneration\)[\s\S]*currentGeneration\.current = null/,
  );
  assert.match(shareSource, /state === "access_granted"[\s\S]*<a href=\{redirectTo\}>/);
});

async function discoverClientSourceFiles(root) {
  const sourceFiles = await discoverSourceFiles(root);
  const clientFiles = [];
  for (const filename of sourceFiles) {
    const source = await readFile(filename, "utf8");
    if (hasUseClientDirective(source)) clientFiles.push(filename);
  }
  return clientFiles.sort();
}

async function discoverSourceFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const filename = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await discoverSourceFiles(filename)));
      continue;
    }
    if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(filename);
  }
  return files.sort();
}

function hasUseClientDirective(source) {
  let remaining = source.replace(/^\uFEFF/, "");
  while (true) {
    remaining = remaining.trimStart();
    if (remaining.startsWith("//")) {
      const lineEnd = remaining.indexOf("\n");
      remaining = lineEnd < 0 ? "" : remaining.slice(lineEnd + 1);
      continue;
    }
    if (remaining.startsWith("/*")) {
      const commentEnd = remaining.indexOf("*/", 2);
      if (commentEnd < 0) return false;
      remaining = remaining.slice(commentEnd + 2);
      continue;
    }
    break;
  }
  return /^(?:"use client"|'use client')\s*;/.test(remaining);
}

function countCalls(source, functionName) {
  return [...source.matchAll(new RegExp(`\\b${functionName}\\s*\\(`, "g"))].length;
}

function networkPrimitiveName(match) {
  if (/XMLHttpRequest/.test(match)) return "XMLHttpRequest";
  if (/sendBeacon/.test(match)) return "sendBeacon";
  return "fetch";
}

const CLIENT_NETWORK_PRIMITIVE = /\bfetch\b|\bXMLHttpRequest\b|\.\s*sendBeacon\b/g;

function relativePath(filename) {
  return path.relative(projectRoot, filename).replaceAll("\\", "/");
}
