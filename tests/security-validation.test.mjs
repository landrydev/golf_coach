import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import {
  assertSameOrigin,
  cleanEmail,
  cleanExternalUrl,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "../lib/http.ts";
import {
  isAccessibleCoachAccent,
  safeCoachAccent,
} from "../lib/colors.ts";
import {
  createShareSessionToken,
  createShareToken,
  hashShareSessionToken,
  hashToken,
  newId,
} from "../lib/tokens.ts";
import { startD1Worker, testOrigin } from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

test("same-origin validation rejects cross-origin and cross-site writes", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("https://roadmap.example/api/profile", {
        method: "PUT",
        headers: {
          origin: "https://roadmap.example",
          "sec-fetch-site": "same-origin",
        },
      }),
    ),
  );

  assert.throws(
    () =>
      assertSameOrigin(
        new Request("https://roadmap.example/api/profile", {
          method: "PUT",
          headers: { origin: "https://attacker.example" },
        }),
      ),
    (error) =>
      error instanceof RequestError &&
      error.status === 403 &&
      error.code === "cross_origin_request",
  );
  assert.throws(
    () =>
      assertSameOrigin(
        new Request("https://roadmap.example/api/profile", {
          method: "PUT",
          headers: {
            origin: "https://roadmap.example",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    (error) =>
      error instanceof RequestError &&
      error.status === 403 &&
      error.code === "cross_site_request",
  );
  assert.throws(
    () =>
      assertSameOrigin(
        new Request("https://roadmap.example/api/profile", { method: "PUT" }),
      ),
    (error) =>
      error instanceof RequestError &&
      error.status === 403 &&
      error.code === "cross_origin_request",
  );
  assert.throws(
    () =>
      assertSameOrigin(
        new Request("https://roadmap.example/api/profile", {
          method: "PUT",
          headers: {
            origin: "https://roadmap.example",
            "sec-fetch-site": "same-site",
          },
        }),
      ),
    (error) =>
      error instanceof RequestError &&
      error.status === 403 &&
      error.code === "cross_site_request",
  );
});

test("text, email, and external-link helpers enforce canonical bounded input", () => {
  assert.equal(cleanText("  line one\r\nline two  ", "note"), "line one\nline two");
  assert.equal(cleanEmail("  Coach@Example.CA  "), "coach@example.ca");
  assert.equal(
    cleanExternalUrl("https://coach.example.ca/book?q=one", "url"),
    "https://coach.example.ca/book?q=one",
  );

  assert.throws(
    () => cleanText("   ", "name", { required: true }),
    (error) => error instanceof RequestError && error.code === "invalid_field",
  );
  assert.throws(
    () => cleanText("12345", "short", { max: 4 }),
    (error) => error instanceof RequestError && error.code === "invalid_field",
  );
  assert.throws(
    () => cleanEmail("not-an-email"),
    (error) => error instanceof RequestError && error.code === "invalid_field",
  );
  for (const unsafeUrl of [
    "http://coach.example/book",
    "javascript:alert(1)",
    "/relative-path",
    "https://localhost/book",
    "https://coach.local/book",
    "https://127.0.0.1/book",
    "https://0x7f000001/book",
    "https://10.0.0.1/book",
    "https://[::1]/book",
    "https://[fc00::1]/book",
    "https://single-label/book",
  ]) {
    assert.throws(
      () => cleanExternalUrl(unsafeUrl, "url"),
      (error) => error instanceof RequestError && error.code === "invalid_field",
    );
  }
});

test("coach accents preserve normal-text contrast on light product surfaces", () => {
  assert.equal(isAccessibleCoachAccent("#176b55"), true);
  assert.equal(isAccessibleCoachAccent("#000000"), true);
  assert.equal(isAccessibleCoachAccent("#ffffff"), false);
  assert.equal(isAccessibleCoachAccent("#bada55"), false);
  assert.equal(isAccessibleCoachAccent("not-a-colour"), false);
  assert.equal(safeCoachAccent("#ffffff"), "#1f5a48");
  assert.equal(safeCoachAccent("#176b55"), "#176b55");
});

test("JSON parsing enforces media type, syntax, and the 64 KiB limit", async () => {
  const parsed = await readJson(
    new Request("https://roadmap.example/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ displayName: "Coach" }),
    }),
  );
  assert.deepEqual(parsed, { displayName: "Coach" });

  await assert.rejects(
    readJson(
      new Request("https://roadmap.example/api/profile", {
        method: "PUT",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
    ),
    (error) => error instanceof RequestError && error.status === 415,
  );
  await assert.rejects(
    readJson(
      new Request("https://roadmap.example/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{broken",
      }),
    ),
    (error) => error instanceof RequestError && error.code === "invalid_json",
  );
  await assert.rejects(
    readJson(
      new Request("https://roadmap.example/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(65_536) }),
      }),
    ),
    (error) => error instanceof RequestError && error.status === 413,
  );
});

test("request errors produce the stable JSON error envelope", async () => {
  const response = errorResponse(
    new RequestError(409, "state_conflict", "The state changed."),
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: { code: "state_conflict", message: "The state changed." },
  });
});

test("share tokens are high-entropy bearer values with deterministic peppered hashes", async () => {
  const previousPepper = process.env.SHARE_TOKEN_PEPPER;
  process.env.SHARE_TOKEN_PEPPER = "test-pepper-one-with-sufficient-separation";
  try {
    const first = await createShareToken();
    const second = await createShareToken();
    assert.match(first.raw, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(first.prefix, first.raw.slice(0, 8));
    assert.match(first.hash, /^[0-9a-f]{64}$/);
    assert.notEqual(first.raw, second.raw);
    assert.notEqual(first.hash, second.hash);
    assert.equal(await hashToken(first.raw), first.hash);

    const session = await createShareSessionToken();
    assert.match(session.raw, /^[A-Za-z0-9_-]{43}$/);
    assert.match(session.hash, /^[0-9a-f]{64}$/);
    assert.notEqual(session.raw, first.raw);
    assert.notEqual(session.hash, first.hash);
    assert.equal(await hashShareSessionToken(session.raw), session.hash);
    assert.notEqual(await hashToken(session.raw), session.hash);

    process.env.SHARE_TOKEN_PEPPER = "test-pepper-two-with-sufficient-separation";
    assert.notEqual(await hashToken(first.raw), first.hash);
    assert.notEqual(await hashShareSessionToken(session.raw), session.hash);
    assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  } finally {
    restoreEnvironment("SHARE_TOKEN_PEPPER", previousPepper);
  }
});

test("production token hashing fails closed when the pepper is absent", async () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousPepper = process.env.SHARE_TOKEN_PEPPER;
  process.env.NODE_ENV = "production";
  delete process.env.SHARE_TOKEN_PEPPER;
  try {
    await assert.rejects(hashToken("a".repeat(43)), /SHARE_TOKEN_PEPPER is required/);
  } finally {
    restoreEnvironment("NODE_ENV", previousEnvironment);
    restoreEnvironment("SHARE_TOKEN_PEPPER", previousPepper);
  }
});

test("network abuse subjects trust only a canonical Cloudflare address", async () => {
  const { clientNetworkSubject } = await import("../lib/rate-limit.ts");
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.equal(
      clientNetworkSubject(
        new Request("https://roadmap.example/r/session", {
          headers: { "cf-connecting-ip": "2001:DB8::42" },
        }),
      ),
      "2001:db8::42",
    );
    for (const headers of [
      { "x-forwarded-for": "192.0.2.1" },
      { "cf-connecting-ip": "192.0.2.1, 198.51.100.2" },
    ]) {
      assert.throws(
        () =>
          clientNetworkSubject(
            new Request("https://roadmap.example/r/session", { headers }),
          ),
        (error) =>
          error instanceof RequestError &&
          error.status === 503 &&
          error.code === "client_network_unavailable",
      );
    }
  } finally {
    restoreEnvironment("NODE_ENV", previousEnvironment);
  }
});

test("share-session source keeps verifiers out of cookies and scopes session consumers beneath /r", async () => {
  const [sessionRoute, responseRoute, choices, closeControl, publishRoute] = await Promise.all([
    readFile(new URL("../app/r/session/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/r/response/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/plan/GolferChoices.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/plan/CloseRoadmap.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/plans/[planId]/publish/route.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(sessionRoute, /assertSameOrigin\(request\)/);
  assert.match(sessionRoute, /Path=\/r/);
  assert.match(sessionRoute, /HttpOnly/);
  assert.match(sessionRoute, /SameSite=Lax/);
  assert.match(sessionRoute, /SHARE_SESSION_MAX_SECONDS/);
  assert.match(sessionRoute, /createShareSession\(/);
  assert.match(sessionRoute, /endShareSession\(/);
  assert.doesNotMatch(sessionRoute, /\$\{SHARE_COOKIE\}=\$\{shareVerifier\}/);
  assert.match(sessionRoute, /"Cache-Control": "private, no-store, max-age=0"/);
  assert.match(responseRoute, /rawSessionToken/);
  assert.match(choices, /fetch\("\/r\/response"/);
  assert.match(closeControl, /fetch\("\/r\/session", \{ method: "DELETE" \}\)/);
  assert.match(publishRoute, /\/r#token=/);
  assert.doesNotMatch(publishRoute, /\/r\?token=/);
});

test("built share-session endpoint clears only its scoped secure cookie", async () => {
  const response = await fetchBuiltApp("/r/session", {
    method: "DELETE",
    headers: {
      origin: "https://roadmap.example",
      "sec-fetch-site": "same-origin",
    },
  });
  assert.equal(response.status, 204);
  const cacheControl = response.headers.get("cache-control") ?? "";
  assert.match(cacheControl, /(?:^|,)\s*private\s*(?:,|$)/i);
  assert.match(cacheControl, /(?:^|,)\s*no-store\s*(?:,|$)/i);
  assert.match(cacheControl, /(?:^|,)\s*max-age=0\s*(?:,|$)/i);
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^roadmap_share=/);
  assert.match(cookie, /Path=\/r/i);
  assert.match(cookie, /Max-Age=0/i);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Secure/i);
});

test("built share-session endpoint rejects cross-origin and malformed exchanges neutrally", async (context) => {
  const crossOrigin = await fetchBuiltApp("/r/session", {
    method: "DELETE",
    headers: {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
  });
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(await crossOrigin.json(), {
    error: {
      code: "cross_origin_request",
      message: "Request origin is not allowed.",
    },
  });
  assert.equal(crossOrigin.headers.get("set-cookie"), null);

  const worker = await startD1Worker();
  context.after(() => worker.dispose());
  const malformed = await worker.dispatch("/r/session", {
    method: "POST",
    headers: {
      "cf-connecting-ip": "192.0.2.11",
      origin: testOrigin,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: JSON.stringify({ token: "not-a-valid-token" }),
  });
  assert.equal(malformed.status, 404);
  assert.deepEqual(await malformed.json(), {
    error: {
      code: "plan_unavailable",
      message: "This private plan is unavailable.",
    },
  });
  const clearedCookie = malformed.headers.get("set-cookie") ?? "";
  assert.match(clearedCookie, /^roadmap_share=;/);
  assert.match(clearedCookie, /Path=\/r/i);
  assert.match(clearedCookie, /Max-Age=0/i);
  assert.match(clearedCookie, /HttpOnly/i);
  assert.match(clearedCookie, /SameSite=Lax/i);
  assert.match(clearedCookie, /Secure/i);
});

function restoreEnvironment(name, previousValue) {
  if (previousValue === undefined) delete process.env[name];
  else process.env[name] = previousValue;
}

async function fetchBuiltApp(path, init) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(new URL(path, "https://roadmap.example"), init),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}
