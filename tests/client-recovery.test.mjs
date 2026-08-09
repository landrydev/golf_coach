import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  attemptExternalHandoffRecord,
  clearGolferResponsePendingAttempt,
  createGolferResponseAttemptRegistry,
  createSerialClientTaskQueue,
  golferResponseRequiresSessionReload,
  isRetryableShareExchangeStatus,
  requestGolferResponse,
  requestShareExchange,
} from "../lib/client-recovery.ts";
import { CLIENT_MUTATION_MAX_RESPONSE_BYTES } from "../lib/client-mutation-recovery.ts";

const SESSION_CONTEXT = "a".repeat(64);
const OTHER_SESSION_CONTEXT = "b".repeat(64);
const SAFE_REQUEST_ID = "2d48a8b9-0777-4dd0-b36a-f2fe065e1e3c";

test("serialized client tasks make a successor the final cookie writer", async () => {
  const queue = createSerialClientTaskQueue();
  const order = [];
  let cookie = null;
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.run(async () => {
    order.push("first:start");
    await firstGate;
    cookie = "session-a";
    order.push("first:cookie");
  });
  await Promise.resolve();
  const successor = queue.run(async () => {
    order.push("successor:start");
    cookie = "session-b";
    order.push("successor:cookie");
  });

  await Promise.resolve();
  assert.deepEqual(order, ["first:start"]);
  releaseFirst();
  await Promise.all([first, successor]);
  assert.deepEqual(order, [
    "first:start",
    "first:cookie",
    "successor:start",
    "successor:cookie",
  ]);
  assert.equal(cookie, "session-b");
});

test("external coach handoff tracking is non-blocking, keepalive, and failure tolerant", async () => {
  const calls = [];
  attemptExternalHandoffRecord(SESSION_CONTEXT, (input, init) => {
    calls.push({ input, init });
    return Promise.reject(new Error("offline"));
  });
  attemptExternalHandoffRecord(SESSION_CONTEXT, (input, init) => {
    calls.push({ input, init });
    return Promise.reject(new Error("offline again"));
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].input, "/r/response");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.keepalive, true);
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    responseType: "external_action_opened",
    sessionContext: SESSION_CONTEXT,
  });
  const handoffKeys = calls.map(
    ({ init }) => init.headers["Idempotency-Key"],
  );
  for (const key of handoffKeys) {
    assert.match(key, /^[A-Za-z0-9][A-Za-z0-9._:-]{19,127}$/);
  }
  assert.notEqual(handoffKeys[0], handoffKeys[1]);

  assert.doesNotThrow(() =>
    attemptExternalHandoffRecord(SESSION_CONTEXT, () => {
      throw new Error("fetch failed before returning a promise");
    }),
  );
  await new Promise((resolve) => setImmediate(resolve));
});

test("explicit golfer responses use the supplied operation key and validate the stored result", async () => {
  const operationKey = "golfer-response-operation-key-0001";
  let captured;
  const result = await requestGolferResponse(
    "wait",
    operationKey,
    SESSION_CONTEXT,
    async (input, init) => {
      captured = { input, init };
      return Response.json(
        {
          response: {
            id: "stored-response-id",
            responseType: "wait",
            occurredAt: 1_784_000_000_000,
          },
          idempotentReplay: false,
        },
        { status: 201 },
      );
    },
  );

  assert.deepEqual(result, {
    kind: "success",
    response: {
      id: "stored-response-id",
      responseType: "wait",
      occurredAt: 1_784_000_000_000,
    },
    idempotentReplay: false,
  });
  assert.equal(captured.input, "/r/response");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers["Idempotency-Key"], operationKey);
  assert.equal(captured.init.cache, "no-store");
  assert.equal(captured.init.credentials, "same-origin");
  assert.ok(captured.init.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(captured.init.body), {
    responseType: "wait",
    sessionContext: SESSION_CONTEXT,
  });
});

test("golfer response acknowledgements bind status, replay flag, and JSON media type", async () => {
  const responseBody = (idempotentReplay) => ({
    response: {
      id: "stored-response-id",
      responseType: "wait",
      occurredAt: 1_784_000_000_000,
    },
    idempotentReplay,
  });
  for (const response of [
    Response.json(responseBody(false), { status: 200 }),
    Response.json(responseBody(true), { status: 201 }),
    Response.json(responseBody(false), { status: 202 }),
    new Response(JSON.stringify(responseBody(false)), {
      status: 201,
      headers: { "Content-Type": "text/plain" },
    }),
  ]) {
    const result = await requestGolferResponse(
      "wait",
      "golfer-response-operation-key-0001",
      SESSION_CONTEXT,
      async () => response,
    );
    assert.deepEqual(result, { kind: "outcome_unknown" });
  }
});

test("golfer response attempts retain unknown keys and rotate after definitive outcomes", () => {
  const { storage } = memoryStorage();
  let sequence = 0;
  const registry = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    () => `synthetic-operation-key-${String(++sequence).padStart(4, "0")}`,
    storage,
  );

  const first = registry.keyFor("wait");
  assert.deepEqual(registry.pending(), {
    sessionContext: SESSION_CONTEXT,
    responseType: "wait",
    key: first,
  });
  assert.equal(registry.keyFor("wait"), first);
  assert.throws(
    () => registry.keyFor("decline"),
    /Another golfer response is awaiting confirmation/,
  );
  registry.settle("wait", first, "outcome_unknown");
  assert.equal(registry.keyFor("wait"), first);

  registry.settle("wait", first, "success");
  assert.equal(registry.pending(), null);
  const afterSuccess = registry.keyFor("wait");
  assert.notEqual(afterSuccess, first);

  registry.settle("wait", afterSuccess, "rejected");
  assert.equal(registry.pending(), null);
  assert.notEqual(registry.keyFor("wait"), afterSuccess);
});

test("ambiguous golfer response attempts survive a same-tab remount and clear after success", () => {
  const { storage, values } = memoryStorage();
  let sequence = 0;
  const createKey = () =>
    `synthetic-persisted-operation-${String(++sequence).padStart(4, "0")}`;

  const firstMount = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    createKey,
    storage,
  );
  const firstKey = firstMount.keyFor("request_reassessment");
  firstMount.settle(
    "request_reassessment",
    firstKey,
    "outcome_unknown",
  );
  assert.equal(values.size, 1);

  const remounted = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    createKey,
    storage,
  );
  assert.deepEqual(remounted.pending(), {
    sessionContext: SESSION_CONTEXT,
    responseType: "request_reassessment",
    key: firstKey,
  });
  assert.equal(remounted.keyFor("request_reassessment"), firstKey);
  assert.throws(() => remounted.keyFor("decline"));
  remounted.settle("request_reassessment", firstKey, "success");
  assert.equal(values.size, 0);

  const afterSuccess = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    createKey,
    storage,
  );
  assert.notEqual(afterSuccess.keyFor("request_reassessment"), firstKey);
});

test("a late golfer-response settlement cannot clear a successor mount's owned attempt", () => {
  const { storage, values } = memoryStorage();
  const operationKey = "synthetic-late-settle-operation-0001";
  const firstMount = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    () => operationKey,
    storage,
    () => "synthetic-response-owner-000001",
  );
  assert.equal(firstMount.keyFor("wait"), operationKey);

  const successorMount = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    () => "synthetic-unused-operation-0001",
    storage,
    () => "synthetic-response-owner-000002",
  );
  assert.equal(successorMount.keyFor("wait"), operationKey);
  const successorRaw = values.get("roadmap:golfer-response-attempt:v3");

  firstMount.settle("wait", operationKey, "success");
  assert.deepEqual(firstMount.recovery(), {
    kind: "blocked",
    reason: "ownership_lost",
  });
  assert.equal(values.get("roadmap:golfer-response-attempt:v3"), successorRaw);

  successorMount.settle("wait", operationKey, "outcome_unknown");
  const reloaded = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    () => "synthetic-must-not-rotate-0001",
    storage,
    () => "synthetic-response-owner-000003",
  );
  assert.equal(reloaded.keyFor("wait"), operationKey);
  reloaded.settle("wait", operationKey, "success");
  assert.equal(values.size, 0);
});

test("timeout, remount, and replay retain one logical response attempt", async () => {
  const { storage, values } = memoryStorage();
  let sequence = 0;
  const createKey = () =>
    `synthetic-timeout-operation-${String(++sequence).padStart(4, "0")}`;
  const firstMount = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    createKey,
    storage,
  );
  const operationKey = firstMount.keyFor("wait");
  const requestKeys = [];
  let committedResponses = 0;

  const timedOut = await requestGolferResponse(
    "wait",
    operationKey,
    SESSION_CONTEXT,
    async (_input, init) => {
      requestKeys.push(init.headers["Idempotency-Key"]);
      committedResponses += 1;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(new Error("acknowledgement lost")),
          { once: true },
        );
      });
    },
    5,
  );
  assert.deepEqual(timedOut, { kind: "outcome_unknown" });
  firstMount.settle("wait", operationKey, timedOut.kind);

  const remounted = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    createKey,
    storage,
  );
  assert.deepEqual(remounted.pending(), {
    sessionContext: SESSION_CONTEXT,
    responseType: "wait",
    key: operationKey,
  });
  assert.throws(() => remounted.keyFor("decline"));

  const replayKey = remounted.keyFor("wait");
  const replayed = await requestGolferResponse(
    "wait",
    replayKey,
    SESSION_CONTEXT,
    async (_input, init) => {
      requestKeys.push(init.headers["Idempotency-Key"]);
      return Response.json({
        response: {
          id: "single-committed-response",
          responseType: "wait",
          occurredAt: 1_784_000_000_000,
        },
        idempotentReplay: true,
      });
    },
  );
  assert.equal(replayed.kind, "success");
  remounted.settle("wait", replayKey, replayed.kind);

  assert.deepEqual(requestKeys, [operationKey, operationKey]);
  assert.equal(committedResponses, 1);
  assert.equal(remounted.pending(), null);
  assert.equal(values.size, 0);
});

test("context-bound recovery retires a different session and explicit clearing removes every format", () => {
  const { storage, values } = memoryStorage();
  const registry = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    () => "synthetic-cross-share-operation-0001",
    storage,
  );
  registry.keyFor("independent_practice");
  assert.equal(values.size, 1);
  const [storageKey] = values.keys();
  const replacement = createGolferResponseAttemptRegistry(
    OTHER_SESSION_CONTEXT,
    () => "synthetic-cross-share-operation-0002",
    storage,
  );
  assert.deepEqual(replacement.recovery(), { kind: "ready" });
  assert.equal(values.size, 0);

  values.set(
    storageKey,
    JSON.stringify({
      sessionContext: SESSION_CONTEXT,
      responseType: "wait",
      key: "synthetic-current-operation-0001",
    }),
  );
  values.set(
    "roadmap:golfer-response-attempt:v2",
    JSON.stringify({
      responseType: "wait",
      key: "synthetic-contextless-v2-operation-0001",
    }),
  );
  values.set(
    "roadmap:golfer-response-attempt:v1:wait",
    "synthetic-legacy-operation-0001",
  );
  clearGolferResponsePendingAttempt(storage);
  assert.equal(values.size, 0);
});

test("contextless and conflicting legacy attempts fail closed until explicitly cleared", () => {
  for (const entries of [
    [["roadmap:golfer-response-attempt:v1:wait", "synthetic-legacy-operation-0001"]],
    [[
      "roadmap:golfer-response-attempt:v2",
      JSON.stringify({
        responseType: "wait",
        key: "synthetic-contextless-v2-operation-0001",
      }),
    ]],
    [
      ["roadmap:golfer-response-attempt:v1:wait", "synthetic-legacy-wait-operation-0001"],
      ["roadmap:golfer-response-attempt:v1:decline", "synthetic-legacy-decline-operation-0001"],
    ],
  ]) {
    const { storage, values } = memoryStorage(entries);
    const registry = createGolferResponseAttemptRegistry(
      SESSION_CONTEXT,
      () => "synthetic-blocked-operation-0001",
      storage,
    );
    assert.deepEqual(registry.recovery(), {
      kind: "blocked",
      reason: "contextless_state",
    });
    assert.equal(registry.pending(), null);
    assert.throws(() => registry.keyFor("wait"), /recovery is blocked/);
    assert.deepEqual([...values.entries()], entries);
  }
});

test("malformed current recovery state fails closed rather than allowing a new response", () => {
  const { storage, values } = memoryStorage();
  values.set(
    "roadmap:golfer-response-attempt:v3",
    JSON.stringify({
      sessionContext: SESSION_CONTEXT,
      responseType: "external_action_opened",
      key: "synthetic-invalid-explicit-operation-0001",
    }),
  );
  const registry = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    () => "synthetic-unused-operation-0001",
    storage,
  );
  assert.deepEqual(registry.recovery(), {
    kind: "blocked",
    reason: "invalid_state",
  });
  assert.equal(values.size, 1);
});

test("golfer-response recovery rejects extra-field tampering instead of claiming it", () => {
  const raw = JSON.stringify({
    sessionContext: SESSION_CONTEXT,
    responseType: "wait",
    key: "synthetic-extra-field-operation-0001",
    injected: true,
  });
  const { storage, values } = memoryStorage([
    ["roadmap:golfer-response-attempt:v3", raw],
  ]);
  const registry = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    () => "synthetic-unused-operation-0001",
    storage,
  );
  assert.deepEqual(registry.recovery(), {
    kind: "blocked",
    reason: "invalid_state",
  });
  assert.equal(values.get("roadmap:golfer-response-attempt:v3"), raw);
});

test("storage denial fails closed before a response attempt can be issued", () => {
  const registry = createGolferResponseAttemptRegistry(
    SESSION_CONTEXT,
    () => "synthetic-storage-denied-operation-0001",
    {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
      removeItem() {
        throw new Error("denied");
      },
    },
  );
  assert.deepEqual(registry.recovery(), {
    kind: "blocked",
    reason: "storage_unavailable",
  });
  assert.throws(() => registry.keyFor("wait"), /recovery is blocked/);
});

/*
 * A valid V3 object with an unsupported response type is retained as evidence
 * of unresolved state; only a confirmed close or new exchange may clear it.
 */
test("clear removes blocked current state", () => {
  const { storage, values } = memoryStorage();
  values.set(
    "roadmap:golfer-response-attempt:v3",
    JSON.stringify({
      sessionContext: SESSION_CONTEXT,
      responseType: "external_action_opened",
      key: "synthetic-invalid-explicit-operation-0001",
    }),
  );
  clearGolferResponsePendingAttempt(storage);
  assert.equal(values.size, 0);
});

test("golfer response failures distinguish definitive rejection from outcome unknown", async () => {
  const rejected = await requestGolferResponse(
    "decline",
    "golfer-response-rejected-key-0001",
    SESSION_CONTEXT,
    async () =>
      Response.json(
        { error: { message: "This response was rejected." } },
        { status: 409 },
      ),
  );
  assert.deepEqual(rejected, {
    kind: "rejected",
    status: 409,
    code: null,
    message: "This response was rejected.",
  });

  for (const response of [
    new Response(null, { status: 503 }),
    Response.json({ unexpected: true }, { status: 200 }),
    new Response('{"response":', { status: 200 }),
  ]) {
    assert.deepEqual(
      await requestGolferResponse(
        "decline",
        "golfer-response-ambiguous-key-0001",
        SESSION_CONTEXT,
        async () => response,
      ),
      { kind: "outcome_unknown" },
    );
  }
});

test("golfer response results propagate only safe server request references", async () => {
  const rejected = await requestGolferResponse(
    "decline",
    "golfer-response-reference-key-0001",
    SESSION_CONTEXT,
    async () =>
      Response.json(
        { error: { message: "This response was rejected." } },
        {
          status: 409,
          headers: { "X-Request-ID": SAFE_REQUEST_ID.toUpperCase() },
        },
      ),
  );
  assert.equal(rejected.kind, "rejected");
  assert.equal(rejected.requestId, SAFE_REQUEST_ID);

  const unknown = await requestGolferResponse(
    "wait",
    "golfer-response-reference-key-0002",
    SESSION_CONTEXT,
    async () =>
      new Response(null, {
        status: 503,
        headers: { "X-Request-ID": SAFE_REQUEST_ID },
      }),
  );
  assert.deepEqual(unknown, {
    kind: "outcome_unknown",
    requestId: SAFE_REQUEST_ID,
  });

  const invalid = await requestGolferResponse(
    "wait",
    "golfer-response-reference-key-0003",
    SESSION_CONTEXT,
    async () =>
      new Response(null, {
        status: 503,
        headers: { "X-Request-ID": "private-data-is-not-a-request-id" },
      }),
  );
  assert.deepEqual(invalid, { kind: "outcome_unknown" });
});

test("golfer response exposes only bounded machine errors and classifies invalidated sessions", async () => {
  const unavailable = await requestGolferResponse(
    "wait",
    "golfer-response-unavailable-key-0001",
    SESSION_CONTEXT,
    async () =>
      Response.json(
        {
          error: {
            code: "plan_unavailable",
            message: "This private plan is unavailable.",
          },
        },
        { status: 404 },
      ),
  );
  assert.deepEqual(unavailable, {
    kind: "rejected",
    status: 404,
    code: "plan_unavailable",
    message: "This private plan is unavailable.",
  });
  assert.equal(golferResponseRequiresSessionReload(unavailable), true);

  const changed = await requestGolferResponse(
    "wait",
    "golfer-response-session-change-key-0001",
    SESSION_CONTEXT,
    async () =>
      Response.json(
        {
          error: {
            code: "share_session_changed",
            message: "Reload before choosing again.",
          },
        },
        { status: 409 },
      ),
  );
  assert.equal(golferResponseRequiresSessionReload(changed), true);

  const businessRejection = await requestGolferResponse(
    "ask_question",
    "golfer-response-contact-missing-key-0001",
    SESSION_CONTEXT,
    async () =>
      Response.json(
        {
          error: {
            code: "coach_contact_unavailable",
            message: "Coach contact is unavailable for this plan.",
          },
        },
        { status: 409 },
      ),
  );
  assert.equal(golferResponseRequiresSessionReload(businessRejection), false);

  const untrustedCode = await requestGolferResponse(
    "decline",
    "golfer-response-invalid-code-key-0001",
    SESSION_CONTEXT,
    async () =>
      Response.json(
        { error: { code: "INVALID CODE", message: "Rejected." } },
        { status: 400 },
      ),
  );
  assert.deepEqual(untrustedCode, {
    kind: "rejected",
    status: 400,
    code: null,
    message: "Rejected.",
  });
  assert.equal(golferResponseRequiresSessionReload(untrustedCode), false);
});

test("golfer response timeout aborts at the bounded wait and remains outcome unknown", async () => {
  let aborted = false;
  const result = await requestGolferResponse(
    "request_reassessment",
    "golfer-response-timeout-key-0001",
    SESSION_CONTEXT,
    async (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("aborted"));
          },
          { once: true },
        );
      }),
    5,
  );

  assert.deepEqual(result, { kind: "outcome_unknown" });
  assert.equal(aborted, true);
});

test("external coach handoff is a native link with explicit best-effort disclosure", async () => {
  const [component, styles] = await Promise.all([
    readFile(new URL("../components/plan/GolferChoices.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/plan/plan.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /<a[\s\S]*?href=\{externalActionUrl\}[\s\S]*?onClick=/);
  assert.match(component, /aria-describedby=\{externalHandoffNoteId\}/);
  assert.match(component, /best-effort record/);
  assert.match(component, /tracking or network failure will not[\s\S]*block the handoff/);
  assert.doesNotMatch(component, /window\.location\.assign\(externalActionUrl\)/);
  assert.doesNotMatch(component, /preventDefault\(/);
  assert.match(styles, /\.choiceButtons a:focus-visible/);
});

test("golfer choices restore one pending retry with accessible busy and live status", async () => {
  const component = await readFile(
    new URL("../components/plan/GolferChoices.tsx", import.meta.url),
    "utf8",
  );

  assert.match(component, /createGolferResponseAttemptRegistry\(sessionContext\)/);
  assert.match(component, /const recovery = registry\.recovery\(\)/);
  assert.match(
    component,
    /unresolved && unresolved\.responseType !== responseType\) return;/,
  );
  assert.match(
    component,
    /pendingChoice !== null && pendingChoice !== responseType/,
  );
  assert.match(component, /aria-busy=\{!recoveryReady \|\| saving !== null\}/);
  assert.match(component, /aria-live=\{isError && !saving \? "assertive" : "polite"\}/);
  assert.match(component, /aria-atomic="true"/);
  assert.match(component, /Roadmap is recording this choice/);
  assert.match(component, /cannot be safely matched to this private session/);
  assert.match(component, /golferResponseRequiresSessionReload\(result\)/);
  assert.match(component, /setSessionReloadRequired\(true\)/);
  assert.match(component, /sessionReloadRequired \|\|/);
  assert.match(component, /<a href="">Reload roadmap status<\/a>/);
  assert.match(component, /<a href="\/r">Open the private-link access page<\/a>/);
  assert.match(component, /setMessage\(OUTCOME_UNKNOWN_MESSAGE\)/);
  assert.match(component, /aria-describedby=\{choiceDescription\("wait"\)\}/);
  assert.match(component, /coachMailtoUri \|\| pendingChoice === "ask_question"/);
  assert.match(component, /Resolve earlier question choice/);
  assert.match(component, /attemptExternalHandoffRecord\(sessionContext\)/);
  assert.match(component, /activateClientRequestScope\(/);
  assert.match(component, /retireClientRequestScope\(/);
  assert.match(
    component,
    /clientMutationReferenceMessage\([\s\S]*?result\.requestId/,
  );
  const responseAwait = component.indexOf(
    "const result = await requestGolferResponse",
  );
  const ownershipFence = component.indexOf(
    "if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;",
    responseAwait,
  );
  const settlement = component.indexOf("registry.settle(", responseAwait);
  assert.ok(responseAwait >= 0);
  assert.ok(ownershipFence > responseAwait);
  assert.ok(settlement > ownershipFence);
});

test("confirmed question handoff cannot be relabelled or resubmitted when mail navigation fails", async () => {
  const component = await readFile(
    new URL("../components/plan/GolferChoices.tsx", import.meta.url),
    "utf8",
  );

  const requestIndex = component.indexOf(
    "const result = await requestGolferResponse",
  );
  const serverCatchIndex = component.indexOf("} catch {", requestIndex);
  const serverFinallyIndex = component.indexOf("} finally {", serverCatchIndex);
  const confirmedRefIndex = component.indexOf(
    "confirmedQuestionHandoffRef.current = true",
    requestIndex,
  );
  const navigationIndex = component.indexOf(
    "window.location.assign(mailtoHandoffUri)",
    serverFinallyIndex,
  );

  assert.ok(requestIndex >= 0);
  assert.ok(serverCatchIndex > requestIndex);
  assert.ok(serverFinallyIndex > serverCatchIndex);
  assert.ok(confirmedRefIndex > requestIndex);
  assert.ok(confirmedRefIndex < serverCatchIndex);
  assert.ok(navigationIndex > serverFinallyIndex);
  assert.match(
    component,
    /responseType === "ask_question" &&[\s\S]*?confirmedQuestionHandoffRef\.current[\s\S]*?return;/,
  );
  assert.match(
    component,
    /responseType === "ask_question" && confirmedQuestionHandoff/,
  );
  assert.match(
    component,
    /confirmedQuestionHandoff && coachMailtoUri[\s\S]*?<a href=\{coachMailtoUri\}[\s\S]*?Open your email app/,
  );
  assert.match(
    component,
    /window\.location\.assign\(mailtoHandoffUri\);[\s\S]*?Your question choice was recorded\.[\s\S]*?use the email link below/,
  );
});

test("share exchange keeps bearer material in the body and constructs only a context-bound plan redirect", async () => {
  const token = "private-fragment-capability";
  let captured;
  const result = await requestShareExchange(token, async (input, init) => {
    captured = { input, init };
    return Response.json({ sessionContext: SESSION_CONTEXT });
  });

  assert.deepEqual(result, {
    kind: "success",
    sessionContext: SESSION_CONTEXT,
    redirectTo: `/r/plan?context=${SESSION_CONTEXT}`,
  });
  assert.equal(captured.input, "/r/session");
  assert.equal(captured.input.includes(token), false);
  assert.deepEqual(JSON.parse(captured.init.body), { token });
  assert.equal(captured.init.cache, "no-store");
  assert.equal(captured.init.credentials, "same-origin");

  for (const invalidPayload of [
    { redirectTo: "https://attacker.invalid/" },
    { sessionContext: SESSION_CONTEXT.toUpperCase() },
    { sessionContext: SESSION_CONTEXT, redirectTo: "/r/plan" },
  ]) {
    const invalid = await requestShareExchange(
      token,
      async () => Response.json(invalidPayload),
    );
    assert.deepEqual(invalid, { kind: "retryable" });
  }
  const malformedSuccess = await requestShareExchange(
    token,
    async () => new Response('{"sessionContext":', { status: 200 }),
  );
  assert.deepEqual(malformedSuccess, { kind: "retryable" });
});

test("share exchange accepts only the exact 200 JSON acknowledgement contract", async () => {
  for (const response of [
    Response.json({ sessionContext: SESSION_CONTEXT }, { status: 201 }),
    new Response(JSON.stringify({ sessionContext: SESSION_CONTEXT }), {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    }),
  ]) {
    const result = await requestShareExchange(
      "private-fragment-token",
      async () => response,
    );
    assert.deepEqual(result, { kind: "retryable" });
  }
});

test("share exchange distinguishes retryable transport/service failures from rejected links", async () => {
  assert.equal(isRetryableShareExchangeStatus(408), true);
  assert.equal(isRetryableShareExchangeStatus(409), true);
  assert.equal(isRetryableShareExchangeStatus(425), true);
  assert.equal(isRetryableShareExchangeStatus(429), true);
  assert.equal(isRetryableShareExchangeStatus(503), true);
  assert.equal(isRetryableShareExchangeStatus(404), false);

  for (const status of [408, 429, 503]) {
    const result = await requestShareExchange(
      "retryable-token",
      async () => new Response(null, { status }),
    );
    assert.deepEqual(result, { kind: "retryable" });
  }

  const rejected = await requestShareExchange(
    "rejected-token",
    async () => new Response(null, { status: 404 }),
  );
  assert.deepEqual(rejected, { kind: "unavailable" });

  const offline = await requestShareExchange("offline-token", async () => {
    throw new Error("offline");
  });
  assert.deepEqual(offline, { kind: "retryable" });
});

test("share exchange results propagate only safe server request references", async () => {
  const success = await requestShareExchange(
    "referenced-token",
    async () =>
      Response.json(
        { sessionContext: SESSION_CONTEXT },
        { headers: { "X-Request-ID": SAFE_REQUEST_ID.toUpperCase() } },
      ),
  );
  assert.equal(success.kind, "success");
  assert.equal(success.requestId, SAFE_REQUEST_ID);

  const retryable = await requestShareExchange(
    "referenced-token",
    async () =>
      new Response(null, {
        status: 503,
        headers: { "X-Request-ID": SAFE_REQUEST_ID },
      }),
  );
  assert.deepEqual(retryable, {
    kind: "retryable",
    requestId: SAFE_REQUEST_ID,
  });

  const unavailable = await requestShareExchange(
    "referenced-token",
    async () =>
      new Response(null, {
        status: 404,
        headers: { "X-Request-ID": SAFE_REQUEST_ID },
      }),
  );
  assert.deepEqual(unavailable, {
    kind: "unavailable",
    requestId: SAFE_REQUEST_ID,
  });

  const invalid = await requestShareExchange(
    "referenced-token",
    async () =>
      new Response(null, {
        status: 503,
        headers: { "X-Request-ID": "private-data-is-not-a-request-id" },
      }),
  );
  assert.deepEqual(invalid, { kind: "retryable" });
});

test("share exchange times out to a retryable state and aborts the pending request", async () => {
  let aborted = false;
  const result = await requestShareExchange(
    "slow-token",
    async (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("aborted"));
          },
          { once: true },
        );
      }),
    5,
  );

  assert.deepEqual(result, { kind: "retryable" });
  assert.equal(aborted, true);
});

test("specialized response requests bound stalled success bodies without replay", async () => {
  const shareTracker = { calls: 0, cancelled: false };
  const shareResult = await requestShareExchange(
    "stalled-share-token",
    async () => stalledJsonResponse(shareTracker, '{"sessionContext":'),
    5,
  );
  assert.deepEqual(shareResult, { kind: "retryable" });
  assert.equal(shareTracker.calls, 1);
  assert.equal(shareTracker.cancelled, true);

  const golferTracker = { calls: 0, cancelled: false };
  const golferResult = await requestGolferResponse(
    "wait",
    "stalled-golfer-response-key-0001",
    SESSION_CONTEXT,
    async () => stalledJsonResponse(golferTracker, '{"response":'),
    5,
  );
  assert.deepEqual(golferResult, { kind: "outcome_unknown" });
  assert.equal(golferTracker.calls, 1);
  assert.equal(golferTracker.cancelled, true);
});

test("share exchange treats an oversized acknowledgement as retryable without replay", async () => {
  let calls = 0;
  let cancelled = false;
  const result = await requestShareExchange(
    "oversized-share-token",
    async () => {
      calls += 1;
      return new Response(
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
        { status: 200 },
      );
    },
    100,
  );

  assert.deepEqual(result, { kind: "retryable" });
  assert.equal(calls, 1);
  assert.equal(cancelled, true);
});

test("ShareAccess preserves retryable fragments and exposes accessible recovery", async () => {
  const [component, styles] = await Promise.all([
    readFile(new URL("../app/r/ShareAccess.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/r/share.module.css", import.meta.url), "utf8"),
  ]);

  const requestIndex = component.indexOf("const result = await requestShareExchange(token)");
  const retryableIndex = component.indexOf('result.kind === "retryable"', requestIndex);
  const ownershipIndex = component.indexOf(
    "if (!ownsGeneration(generation)) return;",
    retryableIndex,
  );
  const retireIndex = component.indexOf("shareToken.current = null", ownershipIndex);
  const clearIndex = component.indexOf("clearFragment(", retireIndex);
  assert.ok(requestIndex >= 0);
  assert.ok(retryableIndex > requestIndex);
  assert.ok(ownershipIndex > retryableIndex);
  assert.ok(retireIndex > ownershipIndex);
  assert.ok(clearIndex > retireIndex);
  assert.match(
    component,
    /result\.kind === "retryable"[\s\S]*?runOwnedEffect\(generation, \(\) => setState\("retryable_exchange"\)\)[\s\S]*?return;/,
  );
  assert.match(component, /<button type="button" onClick=\{retry\}>/);
  assert.match(component, /aria-busy=\{state === "loading"\}/);
  assert.match(component, /Do not copy or share the address/);
  assert.match(
    component,
    /result\.kind === "success"[\s\S]*?runOwnedEffect\(generation, clearGolferResponsePendingAttempt\)[\s\S]*?runOwnedEffect\(generation, \(\) => setRedirectTo\(result\.redirectTo\)\)[\s\S]*?runOwnedEffect\(generation, \(\) => setState\("access_granted"\)\)[\s\S]*?runOwnedEffect\(generation, \(\) => \{[\s\S]*?shareToken\.current = null;[\s\S]*?clearFragment\(generation, result\.redirectTo\)[\s\S]*?window\.location\.replace\(result\.redirectTo\)/,
  );
  assert.match(
    component,
    /const ownsGeneration[\s\S]*?active\.current &&[\s\S]*?currentGeneration\.current === generation &&[\s\S]*?fragmentBelongsTo\(generation\.token\)/,
  );
  assert.match(
    component,
    /const runOwnedEffect[\s\S]*?if \(!ownsGeneration\(generation\)\) return false;[\s\S]*?effect\(\);/,
  );
  assert.match(
    component,
    /generationSequence\.current = generation\.id;[\s\S]*?currentGeneration\.current = generation;[\s\S]*?shareExchangeQueue[\s\S]*?if \(!ownsGeneration\(generation\)\) return;[\s\S]*?exchangeCapability\(generation, token\)/,
  );
  assert.match(component, /const shareExchangeQueue = createSerialClientTaskQueue\(\)/);
  assert.match(
    component,
    /setRequestId\(result\.requestId \?\? null\)[\s\S]*?clientMutationReferenceMessage\(/,
  );
  assert.match(
    component,
    /window\.addEventListener\("hashchange", beginCurrentGeneration\)[\s\S]*?window\.removeEventListener\("hashchange", beginCurrentGeneration\)[\s\S]*?active\.current = false;[\s\S]*?generationSequence\.current \+= 1;[\s\S]*?currentGeneration\.current = null;/,
  );
  assert.match(
    component,
    /function retry\(\) \{[\s\S]*?beginCurrentGeneration\(\);[\s\S]*?\}/,
  );
  assert.ok(
    component.indexOf("clearGolferResponsePendingAttempt") <
      component.indexOf("clearFragment(generation, result.redirectTo)") &&
      component.indexOf("clearFragment(generation, result.redirectTo)") <
        component.indexOf("window.location.replace(result.redirectTo)"),
  );
  assert.match(component, /<a href=\{redirectTo\}>Open roadmap<\/a>/);
  assert.match(
    component,
    /replacementPath \?\?[\s\S]*?window\.location\.pathname[\s\S]*?window\.location\.search/,
  );
  assert.match(component, /try \{[\s\S]*?window\.history\.replaceState[\s\S]*?\} catch \{/);
  assert.doesNotMatch(component, /requestClientMutation|method: "DELETE"/);
  assert.match(component, /setState\(closed \? "closed" : "missing"\)/);
  assert.match(styles, /\.card button:focus-visible/);
});

test("successful roadmap close separates definitive success from local effects", async () => {
  const component = await readFile(
    new URL("../components/plan/CloseRoadmap.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    component,
    /catch \(error\) \{[\s\S]*?setClosing\(false\);[\s\S]*?return;[\s\S]*?setClosed\(true\);[\s\S]*?try \{[\s\S]*?clearGolferResponsePendingAttempt\(\);[\s\S]*?\} catch \{[\s\S]*?try \{[\s\S]*?window\.location\.replace\("\/r\?closed=1"\);[\s\S]*?\} catch \{/,
  );
  assert.match(component, /disabled=\{closing \|\| closed\}/);
  assert.match(component, /<a href="\/r\?closed=1">Continue<\/a>/);
  assert.match(component, /role=\{error \? "alert" : "status"\}/);
  assert.match(component, /body: JSON\.stringify\(\{ sessionContext \}\)/);
  assert.match(component, /credentials: "same-origin"/);
  assert.match(
    component,
    /requireClientMutationSuccess\([\s\S]*?response,[\s\S]*?\[204\],[\s\S]*?\);/,
  );
  assert.ok(
    component.indexOf("requireClientMutationSuccess(") <
      component.indexOf("catch (error)"),
  );
});

test("golfer header keeps the session-close control usable at the 320px boundary", async () => {
  const styles = await readFile(
    new URL("../components/plan/plan.module.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /\.brand\s*\{[\s\S]*?min-width:\s*0;/);
  assert.match(styles, /\.brand\s*>\s*span\s*\{[\s\S]*?flex:\s*0 0 auto;/);
  assert.match(styles, /\.headerTools\s*\{[\s\S]*?flex:\s*0 0 auto;/);
  assert.match(
    styles,
    /\.closeControl button\s*\{[\s\S]*?white-space:\s*nowrap;/,
  );
  assert.match(
    styles,
    /@media \(max-width:\s*480px\)[\s\S]*?\.header\s*\{[\s\S]*?gap:\s*0\.5rem;[\s\S]*?padding-inline:\s*0\.75rem;/,
  );
});

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    values,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
}

function stalledJsonResponse(tracker, prefix) {
  tracker.calls += 1;
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(prefix));
      },
      cancel() {
        tracker.cancelled = true;
      },
    }),
    { status: 200 },
  );
}
