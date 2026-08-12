import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import {
  evaluateCanonicalRequest,
  resolveApplicationOrigin,
} from "../lib/canonical-origin.ts";
import { assertSameOrigin, RequestError } from "../lib/http.ts";
import {
  startD1Worker,
  testOrigin,
} from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const { normalizeApplicationPath } = await import("../lib/product-access.ts");

const canonicalOrigin = testOrigin;
const aliasOrigin = "https://roadmap-alias.test";

test("configured origins are canonical and unconfigured fallback is restricted to local tests", () => {
  assert.deepEqual(
    resolveApplicationOrigin(canonicalOrigin, new URL(`${aliasOrigin}/support`)),
    { ok: true, origin: canonicalOrigin, source: "configured" },
  );
  assert.deepEqual(
    resolveApplicationOrigin(undefined, new URL("https://roadmap.example/support")),
    {
      ok: true,
      origin: "https://roadmap.example",
      source: "local_test_fallback",
    },
  );
  assert.deepEqual(
    resolveApplicationOrigin(undefined, new URL("http://localhost:3000/support")),
    {
      ok: true,
      origin: "http://localhost:3000",
      source: "local_test_fallback",
    },
  );
  assert.deepEqual(
    resolveApplicationOrigin(undefined, new URL("https://roadmap.production.ca/support")),
    { ok: false, code: "application_origin_not_configured" },
  );

  for (const configured of [
    "not a URL",
    "http://roadmap.production.ca",
    "https://user@roadmap.production.ca",
    "https://roadmap.production.ca/app",
    "https://roadmap.production.ca?alias=1",
    "https://roadmap.production.ca/%2e",
  ]) {
    assert.deepEqual(
      resolveApplicationOrigin(configured, new URL("https://roadmap.test/")),
      { ok: false, code: "application_origin_invalid" },
      configured,
    );
  }
});

test("mutation origin validation uses APP_URL and ignores forwarded-host claims", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(
      mutationRequest(`${canonicalOrigin}/api/profile`, canonicalOrigin, {
        "x-forwarded-host": "attacker.test",
      }),
      canonicalOrigin,
    ),
  );

  for (const request of [
    mutationRequest(`${canonicalOrigin}/api/profile`, aliasOrigin),
    mutationRequest(`${aliasOrigin}/api/profile`, canonicalOrigin),
    mutationRequest(`${canonicalOrigin}/api/profile`, canonicalOrigin, {
      "sec-fetch-site": "cross-site",
    }),
  ]) {
    assert.throws(
      () => assertSameOrigin(request, canonicalOrigin),
      (error) =>
        error instanceof RequestError &&
        error.status === 403 &&
        ["cross_origin_request", "cross_site_request"].includes(error.code),
    );
  }

  assert.throws(
    () =>
      assertSameOrigin(
        mutationRequest("https://roadmap.production.ca/api/profile", "https://roadmap.production.ca"),
        undefined,
      ),
    (error) =>
      error instanceof RequestError &&
      error.status === 503 &&
      error.code === "application_origin_not_configured",
  );
  assert.throws(
    () => assertSameOrigin(mutationRequest(`${canonicalOrigin}/api/profile`, canonicalOrigin), "bad"),
    (error) =>
      error instanceof RequestError &&
      error.status === 503 &&
      error.code === "application_origin_invalid",
  );
});

test("canonical boundary redirects only safe public reads and rejects host spoofing", () => {
  const publicAlias = boundaryDecision(`${aliasOrigin}/support?source=alias`, {
    headers: { host: new URL(aliasOrigin).host },
  });
  assert.deepEqual(publicAlias, {
    action: "redirect",
    location: `${canonicalOrigin}/support?source=alias`,
  });

  const publicHead = boundaryDecision(`${aliasOrigin}/privacy?view=compact`, {
    method: "HEAD",
  });
  assert.deepEqual(publicHead, {
    action: "redirect",
    location: `${canonicalOrigin}/privacy?view=compact`,
  });

  const hostSpoof = boundaryDecision(`${canonicalOrigin}/support`, {
    headers: { host: "attacker.test" },
  });
  assert.equal(hostSpoof.action, "reject");
  assert.equal(hostSpoof.status, 421);

  const forwardedHostIsIgnored = boundaryDecision(`${canonicalOrigin}/support`, {
    headers: {
      host: new URL(canonicalOrigin).host,
      "x-forwarded-host": "attacker.test",
    },
  });
  assert.equal(forwardedHostIsIgnored.action, "allow");

  const explicitDefaultPort = boundaryDecision(`${canonicalOrigin}/support`, {
    headers: { host: `${new URL(canonicalOrigin).host}:443` },
  });
  assert.equal(explicitDefaultPort.action, "allow");

  const forwardedHostCannotBlessAlias = boundaryDecision(`${aliasOrigin}/api/health`, {
    headers: { "x-forwarded-host": new URL(canonicalOrigin).host },
  });
  assert.equal(forwardedHostCannotBlessAlias.action, "reject");
  assert.equal(forwardedHostCannotBlessAlias.status, 421);
});

test("API, private, capability, mutation, and encoded aliases never redirect", () => {
  const scenarios = [
    { url: `${aliasOrigin}/api/health`, method: "GET" },
    { url: `${aliasOrigin}/app`, method: "GET" },
    { url: `${aliasOrigin}/r/plan`, method: "GET" },
    { url: `${aliasOrigin}/support`, method: "POST" },
    { url: `${aliasOrigin}/%61pi/profile`, method: "GET" },
    { url: `${aliasOrigin}/%2561pp.rsc`, method: "GET" },
    { url: `${aliasOrigin}/%72/plan`, method: "GET" },
    { url: `${aliasOrigin}/app%2Fsettings`, method: "GET" },
  ];

  for (const scenario of scenarios) {
    const decision = boundaryDecision(scenario.url, { method: scenario.method });
    assert.equal(decision.action, "reject", scenario.url);
    assert.equal(decision.status, 421, scenario.url);
    assert.equal(decision.code, "non_canonical_origin", scenario.url);
  }
});

test(
  "built Worker enforces aliases before routing and accepts canonical requests",
  { timeout: 60_000 },
  async (context) => {
    const publicAlias = await fetchBuilt(`${aliasOrigin}/support?source=alias`, {
      headers: { host: new URL(aliasOrigin).host },
    });
    assert.equal(publicAlias.status, 308);
    assert.equal(publicAlias.headers.get("location"), `${canonicalOrigin}/support?source=alias`);

    for (const path of ["/%61pi/health", "/%72/plan", "/app%2Fsettings"]) {
      const response = await fetchBuilt(`${aliasOrigin}${path}`);
      assert.equal(response.status, 421, path);
      assert.equal(response.headers.get("location"), null, path);
      assert.equal((await response.json()).error.code, "non_canonical_origin", path);
    }

    const hostSpoof = await fetchBuilt(`${canonicalOrigin}/support`, {
      headers: { host: "attacker.test" },
    });
    assert.equal(hostSpoof.status, 421);
    assert.equal(hostSpoof.headers.get("location"), null);

    const missing = await fetchBuilt("https://roadmap.production.ca/support", {}, {});
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).error.code, "application_origin_not_configured");

    const invalid = await fetchBuilt(`${canonicalOrigin}/support`, {}, { APP_URL: "bad" });
    assert.equal(invalid.status, 503);
    assert.equal((await invalid.json()).error.code, "application_origin_invalid");

    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const canonical = await worker.dispatch("/support", {
      headers: { "x-forwarded-host": "attacker.test" },
    });
    assert.equal(canonical.status, 200);

    const foreignOrigin = await worker.dispatch("/r/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: aliasOrigin,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ token: "not-a-valid-token" }),
    });
    assert.equal(foreignOrigin.status, 403);
    assert.equal((await foreignOrigin.json()).error.code, "cross_origin_request");

    const canonicalOriginRequest = await worker.dispatch("/r/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: canonicalOrigin,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ token: "not-a-valid-token" }),
    });
    assert.equal(canonicalOriginRequest.status, 404);
    assert.equal((await canonicalOriginRequest.json()).error.code, "plan_unavailable");
  },
);

function mutationRequest(url, origin, extraHeaders = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      ...extraHeaders,
    },
  });
}

function boundaryDecision(url, init = {}) {
  const request = new Request(url, init);
  return evaluateCanonicalRequest(
    request,
    canonicalOrigin,
    normalizeApplicationPath(new URL(request.url).pathname),
  );
}

let builtWorkerPromise;

async function fetchBuilt(url, init = {}, environment = { APP_URL: canonicalOrigin }) {
  builtWorkerPromise ??= import(new URL("../dist/server/index.js", import.meta.url))
    .then(({ default: worker }) => worker);
  const worker = await builtWorkerPromise;
  return worker.fetch(
    new Request(url, init),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      ...environment,
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}
