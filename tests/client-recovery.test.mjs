import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  attemptExternalHandoffRecord,
  isRetryableShareExchangeStatus,
  requestShareExchange,
} from "../lib/client-recovery.ts";

test("external coach handoff tracking is non-blocking, keepalive, and failure tolerant", async () => {
  const calls = [];
  attemptExternalHandoffRecord((input, init) => {
    calls.push({ input, init });
    return Promise.reject(new Error("offline"));
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "/r/response");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.keepalive, true);
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    responseType: "external_action_opened",
  });

  assert.doesNotThrow(() =>
    attemptExternalHandoffRecord(() => {
      throw new Error("fetch failed before returning a promise");
    }),
  );
  await new Promise((resolve) => setImmediate(resolve));
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

test("share exchange keeps bearer material in the body and accepts only the fixed plan redirect", async () => {
  const token = "private-fragment-capability";
  let captured;
  const result = await requestShareExchange(token, async (input, init) => {
    captured = { input, init };
    return Response.json({ redirectTo: "/r/plan" });
  });

  assert.deepEqual(result, { kind: "success", redirectTo: "/r/plan" });
  assert.equal(captured.input, "/r/session");
  assert.equal(captured.input.includes(token), false);
  assert.deepEqual(JSON.parse(captured.init.body), { token });
  assert.equal(captured.init.cache, "no-store");
  assert.equal(captured.init.credentials, "same-origin");

  const unexpectedRedirect = await requestShareExchange(
    token,
    async () => Response.json({ redirectTo: "https://attacker.invalid/" }),
  );
  assert.deepEqual(unexpectedRedirect, { kind: "retryable" });
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

test("ShareAccess preserves retryable fragments and exposes accessible recovery", async () => {
  const [component, styles] = await Promise.all([
    readFile(new URL("../app/r/ShareAccess.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/r/share.module.css", import.meta.url), "utf8"),
  ]);

  const requestIndex = component.indexOf("const result = await requestShareExchange(token)");
  const retryableIndex = component.indexOf('result.kind === "retryable"', requestIndex);
  const clearIndex = component.indexOf("clearFragment();", requestIndex);
  assert.ok(requestIndex >= 0);
  assert.ok(retryableIndex > requestIndex);
  assert.ok(clearIndex > retryableIndex);
  assert.match(
    component,
    /setState\("retryable_exchange"\);[\s\S]*?return;[\s\S]*?clearFragment\(\)/,
  );
  assert.match(component, /<button type="button" onClick=\{retry\}>/);
  assert.match(component, /aria-busy=\{state === "loading"\}/);
  assert.match(component, /Do not copy or share the address/);
  assert.match(styles, /\.card button:focus-visible/);
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
