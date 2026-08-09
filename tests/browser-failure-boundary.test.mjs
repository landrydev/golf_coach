import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const canonicalOrigin = "https://roadmap.example";
const aliasOrigin = "https://roadmap-alias.example";
const ownerAccess = {
  INSTRUCTOR_ACCESS_MODE: "owner_private",
  OWNER_PRIVATE_ACCESS_PEPPER:
    "synthetic-browser-failure-boundary-pepper-2026-08-09",
  OWNER_PRIVATE_EMAIL_DIGESTS: "0".repeat(64),
};

test("document navigations receive generic private HTML for 401, 403, and 503 access failures", async () => {
  const unauthenticated = await invokeWorker("/app", {
    headers: navigationHeaders(),
  }, ownerAccess);
  const unauthenticatedBody = await assertDocumentFailure(
    unauthenticated,
    401,
    "Sign in required",
  );
  assert.doesNotMatch(unauthenticatedBody, /authentication_required/);

  const forbiddenEmail = "unlisted.coach@example.test";
  const forbidden = await invokeWorker(
    "/app",
    {
      headers: navigationHeaders({
        "oai-authenticated-user-email": forbiddenEmail,
      }),
    },
    ownerAccess,
  );
  const forbiddenBody = await assertDocumentFailure(
    forbidden,
    403,
    "Access unavailable",
  );
  assert.doesNotMatch(
    forbiddenBody,
    new RegExp(`${escapeRegex(forbiddenEmail)}|pepper|digest|owner_private`, "i"),
  );

  const unavailable = await invokeWorker(
    "/app",
    {
      headers: navigationHeaders({
        "oai-authenticated-user-email": "coach@example.test",
      }),
    },
    { INSTRUCTOR_ACCESS_MODE: "owner_private" },
  );
  const unavailableBody = await assertDocumentFailure(
    unavailable,
    503,
    "Access temporarily unavailable",
  );
  assert.doesNotMatch(
    unavailableBody,
    /product_access_unavailable|OWNER_PRIVATE|configuration|environment/i,
  );

  assert.equal(unauthenticated.headers.get("referrer-policy"), "no-referrer");
  assert.equal(forbidden.headers.get("referrer-policy"), "no-referrer");
  assert.equal(unavailable.headers.get("referrer-policy"), "no-referrer");

  const firstNonce = cspNonce(unauthenticated);
  const secondNonce = cspNonce(forbidden);
  assert.notEqual(firstNonce, secondNonce);
  assert.equal(unauthenticatedBody.includes(firstNonce), false);
  assert.equal(forbiddenBody.includes(secondNonce), false);
});

test("API, RSC, and Accept-only programmatic failures retain JSON semantics", async () => {
  const scenarios = [
    {
      label: "API document-shaped request",
      path: "/api/profile",
      headers: navigationHeaders(),
    },
    {
      label: "RSC suffix",
      path: "/app.rsc",
      headers: navigationHeaders(),
    },
    {
      label: "RSC protocol header",
      path: "/app",
      headers: navigationHeaders({ rsc: "1" }),
    },
    {
      label: "RSC content negotiation",
      path: "/app",
      headers: navigationHeaders({ accept: "text/html,text/x-component" }),
    },
    {
      label: "Accept-only fetch client",
      path: "/app",
      headers: { accept: "text/html,application/json" },
    },
  ];

  for (const scenario of scenarios) {
    const response = await invokeWorker(
      scenario.path,
      { headers: scenario.headers },
      ownerAccess,
    );
    assert.equal(response.status, 401, scenario.label);
    assert.match(
      response.headers.get("content-type") ?? "",
      /^application\/json/i,
      scenario.label,
    );
    assert.deepEqual(
      await response.json(),
      {
        error: {
          code: "authentication_required",
          message: "Sign in is required for this feature.",
        },
      },
      scenario.label,
    );
    assertPrivateFailure(response);
  }

  const frozenApi = await invokeWorker(
    "/api/profile",
    {
      method: "PUT",
      headers: navigationHeaders({
        "content-type": "application/json",
        "oai-authenticated-user-email": "coach.a@example.test",
        origin: canonicalOrigin,
      }),
      body: "{}",
    },
    {
      APPLICATION_WRITE_MODE: "frozen",
      INSTRUCTOR_ACCESS_MODE: "owner_private",
      OWNER_PRIVATE_ACCESS_PEPPER:
        "synthetic-owner-access-pepper-for-tests-only-2026-08-07",
      OWNER_PRIVATE_EMAIL_DIGESTS:
        "64b324c39c650e97d7ae285e733f72de0c663e85dcda9eb073ccbfebeb546ed0",
    },
  );
  assert.equal(frozenApi.status, 503);
  assert.equal(
    (await frozenApi.json()).error.code,
    "application_writes_unavailable",
  );

  const frozenPage = await invokeWorker(
    "/app",
    {
      headers: navigationHeaders({
        "oai-authenticated-user-email": "coach.a@example.test",
      }),
    },
    {
      APPLICATION_WRITE_MODE: "frozen",
      INSTRUCTOR_ACCESS_MODE: "owner_private",
      OWNER_PRIVATE_ACCESS_PEPPER:
        "synthetic-owner-access-pepper-for-tests-only-2026-08-07",
      OWNER_PRIVATE_EMAIL_DIGESTS:
        "64b324c39c650e97d7ae285e733f72de0c663e85dcda9eb073ccbfebeb546ed0",
    },
  );
  await assertDocumentFailure(
    frozenPage,
    503,
    "Changes temporarily unavailable",
  );
  assert.equal(frozenPage.headers.get("retry-after"), "60");
});

test("canonical-origin decisions remain ahead of authentication and preserve redirects", async () => {
  const redirect = await invokeWorker(
    `${aliasOrigin}/support?from=alias`,
    { headers: navigationHeaders() },
    ownerAccess,
  );
  assert.equal(redirect.status, 308);
  assert.equal(
    redirect.headers.get("location"),
    `${canonicalOrigin}/support?from=alias`,
  );

  const privateAlias = await invokeWorker(
    `${aliasOrigin}/app`,
    { headers: navigationHeaders() },
    ownerAccess,
  );
  const privateAliasBody = await assertDocumentFailure(
    privateAlias,
    421,
    "Request unavailable",
  );
  assert.doesNotMatch(privateAliasBody, /Sign in|required.*sign/i);

  const apiAlias = await invokeWorker(
    `${aliasOrigin}/api/profile`,
    { headers: navigationHeaders() },
    ownerAccess,
  );
  assert.equal(apiAlias.status, 421);
  assert.equal((await apiAlias.json()).error.code, "non_canonical_origin");

  const invalidConfiguration = await invokeWorker(
    "/support",
    { headers: navigationHeaders() },
    { ...ownerAccess, APP_URL: "not a valid origin" },
  );
  const invalidBody = await assertDocumentFailure(
    invalidConfiguration,
    503,
    "Application temporarily unavailable",
  );
  assert.doesNotMatch(
    invalidBody,
    /application_origin_invalid|not a valid origin|configuration/i,
  );
});

test("unexpected document failures are generic HTML while unexpected asset fetches remain JSON", async () => {
  const privateDetail = "synthetic private storage detail";
  const originalError = console.error;
  const originalInfo = console.info;
  const errorLogs = [];
  console.error = (...values) => errorLogs.push(values);
  console.info = () => {};

  try {
    const documentFailure = await invokeWorker(
      "/favicon.svg",
      { headers: navigationHeaders() },
      {},
      async () => {
        throw new Error(privateDetail);
      },
    );
    const documentBody = await assertDocumentFailure(
      documentFailure,
      500,
      "This page could not be loaded",
    );
    assert.doesNotMatch(documentBody, /internal_error|synthetic|storage/i);

    const assetFailure = await invokeWorker(
      "/favicon.svg",
      {
        headers: {
          accept: "image/avif,image/webp,*/*",
          "sec-fetch-dest": "image",
          "sec-fetch-mode": "no-cors",
        },
      },
      {},
      async () => {
        throw new Error(privateDetail);
      },
    );
    assert.equal(assetFailure.status, 500);
    assert.match(
      assetFailure.headers.get("content-type") ?? "",
      /^application\/json/i,
    );
    assert.deepEqual(await assetFailure.json(), {
      error: {
        code: "internal_error",
        message: "The request could not be completed.",
      },
    });
    assertPrivateFailure(assetFailure);

    assert.equal(errorLogs.length, 2);
    assert.equal(JSON.stringify(errorLogs).includes(privateDetail), false);
  } finally {
    console.error = originalError;
    console.info = originalInfo;
  }
});

function navigationHeaders(overrides = {}) {
  return {
    accept: "text/html,application/xhtml+xml",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    ...overrides,
  };
}

async function assertDocumentFailure(response, status, heading) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html/i);
  assertPrivateFailure(response);
  const body = await response.text();
  assert.match(body, /^<!doctype html>/i);
  assert.match(body, new RegExp(`<h1>${escapeRegex(heading)}</h1>`, "i"));
  assert.doesNotMatch(body, /stack|exception|requestId|x-request-id/i);
  return body;
}

function assertPrivateFailure(response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  assert.match(cacheControl, /(?:^|,)\s*private\s*(?:,|$)/i);
  assert.match(cacheControl, /(?:^|,)\s*no-store\s*(?:,|$)/i);
  assert.match(cacheControl, /(?:^|,)\s*max-age=0\s*(?:,|$)/i);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
}

function cspNonce(response) {
  const policy = response.headers.get("content-security-policy") ?? "";
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /frame-ancestors 'none'/);
  const match = policy.match(/script-src 'self' 'nonce-([0-9a-f]+)'/i);
  assert.ok(match);
  return match[1];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let builtWorkerPromise;

async function invokeWorker(
  pathOrUrl,
  init = {},
  environment = {},
  assetFetch = async () => new Response("Not found", { status: 404 }),
) {
  builtWorkerPromise ??= import(new URL("../dist/server/index.js", import.meta.url))
    .then(({ default: worker }) => worker);
  const worker = await builtWorkerPromise;
  const url = pathOrUrl.startsWith("https://")
    ? pathOrUrl
    : new URL(pathOrUrl, canonicalOrigin);
  return worker.fetch(
    new Request(url, init),
    {
      APP_URL: canonicalOrigin,
      APPLICATION_WRITE_MODE: "enabled",
      ASSETS: { fetch: assetFetch },
      ...environment,
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}
