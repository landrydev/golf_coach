import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { register } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  grantSyntheticGolferRecordConsent,
  identityHeaders,
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(projectRoot, "app");

test("the unused image optimization proxy is absent from the Worker boundary", async () => {
  const source = await readFile(resolve(projectRoot, "worker/index.ts"), "utf8");
  assert.doesNotMatch(source, /handleImageOptimization|\/_vinext\/image|env\.IMAGES/);

  const response = await fetchBuiltApp(
    "/_vinext/image?url=https%3A%2F%2Fattacker.example%2Fimage.png&w=640&q=75",
    {},
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
  );
  assert.notEqual(response.status, 200);
});

test(
  "every browser mutation except the signed Stripe webhook rejects missing and foreign origins first",
  { timeout: 60_000 },
  async () => {
    const mutations = await discoverBrowserMutations();
    assert.ok(
      mutations.some(
        ({ method, routePath }) =>
          method === "POST" && routePath === "/api/billing/webhook",
      ),
      "the explicitly exempt signed webhook must remain visible in the route inventory",
    );

    const browserMutations = mutations.filter(
      ({ routePath }) => routePath !== "/api/billing/webhook",
    );
    assert.ok(browserMutations.length > 0);

    for (const mutation of browserMutations) {
      const path = materializeDynamicPath(mutation.routePath);
      for (const scenario of [
        {
          label: "missing Origin",
          headers: {
            "content-type": "application/json",
            "oai-authenticated-user-email": "coach.a@example.test",
          },
        },
        {
          label: "foreign Origin",
          headers: {
            "content-type": "application/json",
            origin: "https://attacker.example",
            "sec-fetch-site": "cross-site",
            "oai-authenticated-user-email": "coach.a@example.test",
          },
        },
      ]) {
        // Supply a synthetically allowlisted identity so the outer product
        // guard grants access, then omit database bindings and send malformed
        // JSON. A 403 demonstrates that each route's CSRF boundary runs before
        // identity reconciliation, body parsing, or persistence access.
        const response = await fetchBuiltApp(
          path,
          {
            method: mutation.method,
            headers: scenario.headers,
            body: "{",
          },
          {
            APPLICATION_WRITE_MODE: "enabled",
            INSTRUCTOR_ACCESS_MODE: "owner_private",
            OWNER_PRIVATE_ACCESS_PEPPER:
              "synthetic-owner-access-pepper-for-tests-only-2026-08-07",
            OWNER_PRIVATE_EMAIL_DIGESTS:
              "64b324c39c650e97d7ae285e733f72de0c663e85dcda9eb073ccbfebeb546ed0",
          },
        );
        assert.equal(
          response.status,
          403,
          `${mutation.method} ${mutation.routePath} accepted ${scenario.label}`,
        );
        assert.equal(
          (await response.json()).error.code,
          "cross_origin_request",
          `${mutation.method} ${mutation.routePath} did not fail at Origin validation for ${scenario.label}`,
        );
      }
    }
  },
);

test(
  "the central write control freezes every discovered write-capable request without exposing its state",
  { timeout: 120_000 },
  async (context) => {
    const worker = await startD1Worker({
      APPLICATION_WRITE_MODE: "frozen",
    });
    context.after(() => worker.dispose());
    const mutations = await discoverBrowserMutations();
    assert.ok(mutations.length >= 25);

    for (const mutation of mutations) {
      const response = await worker.dispatch(
        materializeDynamicPath(mutation.routePath),
        {
          method: mutation.method,
          headers: {
            ...writeHeaders("coach.a@example.test", "Coach Avery"),
            accept: "application/json",
          },
          body: "{}",
        },
      );
      assert.equal(
        response.status,
        503,
        `${mutation.method} ${mutation.routePath} bypassed the write freeze`,
      );
      assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
      assert.equal(response.headers.get("retry-after"), "60");
      assert.deepEqual(await response.json(), {
        error: {
          code: "application_writes_unavailable",
          message: "Changes are temporarily unavailable. Try again later.",
        },
      });
    }

    const instructorPages = await discoverInstructorPages();
    assert.deepEqual(
      instructorPages,
      [
        "/app",
        "/app/billing",
        "/app/golfers",
        "/app/golfers/[golferId]",
        "/app/golfers/[golferId]/complete",
        "/app/golfers/[golferId]/edit",
        "/app/golfers/[golferId]/settings",
        "/app/golfers/new",
        "/app/packages",
        "/app/settings",
        "/app/settings/data",
        "/app/settings/shares",
      ].sort(),
    );
    for (const routePath of instructorPages) {
      const path = materializeDynamicPath(routePath);
      await assertWriteUnavailable(
        worker,
        path,
        { method: "GET", headers: frozenReadHeaders("application/json") },
        `GET ${routePath}`,
      );
      await assertWriteUnavailable(
        worker,
        `${path}.rsc`,
        {
          method: "GET",
          headers: frozenReadHeaders("text/x-component"),
        },
        `GET ${routePath}.rsc`,
      );
      await assertWriteUnavailable(
        worker,
        path,
        { method: "HEAD", headers: frozenReadHeaders("application/json") },
        `HEAD ${routePath}`,
      );
      await assertWriteUnavailable(
        worker,
        `${path}.rsc`,
        { method: "HEAD", headers: frozenReadHeaders("text/x-component") },
        `HEAD ${routePath}.rsc`,
      );
    }

    const writeCapableGetApis = await discoverWriteCapableGetApis();
    assert.deepEqual(
      writeCapableGetApis,
      [
        "/api/account/shares",
        "/api/consents",
        "/api/data-requests",
        "/api/golfers",
        "/api/operations/data-requests",
        "/api/operations/data-requests/[requestId]",
        "/api/packages",
        "/api/profile",
      ].sort(),
    );
    for (const routePath of writeCapableGetApis) {
      const path = materializeDynamicPath(routePath);
      for (const method of ["GET", "HEAD"]) {
        await assertWriteUnavailable(
          worker,
          path,
          { method, headers: frozenReadHeaders("application/json") },
          `${method} ${routePath}`,
        );
      }
    }

    await assertWriteUnavailable(
      worker,
      "/%",
      { method: "GET", headers: frozenReadHeaders("application/json") },
      "GET invalid normalized API path",
    );

    const htmlResponse = await worker.dispatch("/api/profile", {
      method: "PUT",
      headers: {
        ...writeHeaders("coach.a@example.test", "Coach Avery"),
        accept: "text/html,application/xhtml+xml",
      },
      body: "{}",
    });
    assert.equal(htmlResponse.status, 503);
    assert.match(
      htmlResponse.headers.get("content-type") ?? "",
      /^text\/html/i,
    );
    const html = await htmlResponse.text();
    assert.match(html, /<main>/i);
    assert.match(html, /<h1>Changes temporarily unavailable<\/h1>/i);
    assert.match(html, /href="\/support"/i);
    assert.doesNotMatch(html, /frozen|invalid|APPLICATION_WRITE_MODE/i);

    const missingIdentity = await worker.dispatch("/api/profile", {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });
    assert.equal(missingIdentity.status, 401);
    assert.notEqual(missingIdentity.headers.get("retry-after"), "60");
    assert.equal(
      (await missingIdentity.json()).error.code,
      "authentication_required",
    );

    const unauthorizedIdentity = await worker.dispatch("/api/profile", {
      method: "HEAD",
      headers: {
        ...identityHeaders("not.allowed@example.test", "Unknown Coach"),
        accept: "application/json",
      },
    });
    assert.equal(unauthorizedIdentity.status, 403);
    assert.notEqual(unauthorizedIdentity.headers.get("retry-after"), "60");

    const nonCanonical = await worker.dispatch(
      "https://noncanonical.test/api/profile",
      {
        method: "GET",
        headers: { accept: "application/json" },
      },
    );
    assert.equal(nonCanonical.status, 421);
    assert.notEqual(nonCanonical.headers.get("retry-after"), "60");
    assert.equal(
      (await nonCanonical.json()).error.code,
      "non_canonical_origin",
    );

    const publicRedirect = await worker.dispatch(
      "https://noncanonical.test/privacy",
      { redirect: "manual" },
    );
    assert.equal(publicRedirect.status, 308);
    assert.equal(publicRedirect.headers.get("location"), `${testOrigin}/privacy`);

    const publicHealth = await worker.dispatch("/api/health");
    assert.equal(publicHealth.status, 200);
    const publicHealthBody = await publicHealth.json();
    assert.equal(publicHealthBody.status, "live");
    assert.doesNotMatch(
      JSON.stringify(publicHealthBody),
      /writeControl|applicationWrites|frozen|invalid/i,
    );

    for (const path of ["/", "/privacy", "/support", "/terms", "/r", "/r/plan"]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await worker.dispatch(path, {
          method,
          headers: { accept: "text/html" },
        });
        assert.equal(response.status, 200, `${method} ${path} was not readable`);
        assert.notEqual(response.headers.get("retry-after"), "60");
      }
    }

    const allowedOptions = await worker.dispatch("/api/profile", {
      method: "OPTIONS",
      headers: identityHeaders("coach.a@example.test", "Coach Avery"),
    });
    assert.notEqual(allowedOptions.status, 503);
    assert.notEqual(allowedOptions.headers.get("retry-after"), "60");

    const operationalHealth = await worker.dispatch(
      "/api/operations/health",
      {
        headers: identityHeaders("coach.a@example.test", "Coach Avery"),
      },
    );
    assert.equal(operationalHealth.status, 503);
    const operationalBody = await operationalHealth.json();
    assert.deepEqual(operationalBody.application.writeControl, {
      state: "frozen",
    });
    assert.equal(
      operationalBody.application.checks.applicationWritesEnabled,
      false,
    );

    await assertNoContainmentWrites(worker);
  },
);

test(
  "missing, malformed, and padded write modes freeze incidental reads and scheduled work",
  { timeout: 120_000 },
  async () => {
    for (const testCase of [
      { label: "missing", bindings: {} },
      {
        label: "malformed",
        bindings: { APPLICATION_WRITE_MODE: "ENABLED" },
      },
      {
        label: "padded",
        bindings: { APPLICATION_WRITE_MODE: " enabled " },
      },
    ]) {
      const worker = await startD1Worker(testCase.bindings, {
        applicationWriteModeDefault: false,
        triggerHandlers: true,
      });
      try {
        await assertWriteUnavailable(
          worker,
          "/api/profile",
          { method: "GET", headers: frozenReadHeaders("application/json") },
          `${testCase.label} GET /api/profile`,
        );
        await assertWriteUnavailable(
          worker,
          "/app.rsc",
          {
            method: "GET",
            headers: frozenReadHeaders("text/x-component"),
          },
          `${testCase.label} GET /app.rsc`,
        );
        await assertWriteUnavailable(
          worker,
          "/app",
          { method: "HEAD", headers: frozenReadHeaders("application/json") },
          `${testCase.label} HEAD /app`,
        );

        const scheduled = await worker.dispatchScheduled();
        assert.equal(scheduled.status, 200, testCase.label);
        await assertNoContainmentWrites(worker);
      } finally {
        await worker.dispose();
      }
    }
  },
);

test("Worker access classification covers every instructor page, RSC request, and API route", { timeout: 60_000 }, async () => {
  const routes = await discoverAppRoutes();
  const instructorPages = routes
    .filter(({ filename, routePath }) =>
      filename.endsWith("page.tsx") &&
      (routePath === "/app" || routePath.startsWith("/app/")),
    )
    .map(({ routePath }) => routePath);
  assert.ok(instructorPages.length > 0);

  for (const path of instructorPages) {
    const expected =
      path === "/app/billing" ||
      path.startsWith("/app/billing/") ||
      path === "/app/settings" ||
      path.startsWith("/app/settings/")
        ? "account"
        : "core";
    await assertAccessClassification(path, expected);
    await assertAccessClassification(`${path}.rsc`, expected);
  }

  const publicApiPaths = new Set([
    "/api/health",
    "/api/billing/webhook",
  ]);
  const accountApiPaths = new Set([
    "/api/account/shares",
    "/api/account/shares/[shareId]",
    "/api/profile",
    "/api/data-export",
    "/api/data-requests",
    "/api/consents",
    "/api/operations/data-requests",
    "/api/operations/data-requests/[requestId]",
    "/api/billing/checkout",
    "/api/billing/portal",
    "/api/billing/reconcile",
    "/api/operations/health",
  ]);
  const apiRoutes = routes.filter(
    ({ filename, routePath }) =>
      filename.endsWith("route.ts") && routePath.startsWith("/api/"),
  );
  assert.ok(apiRoutes.length > publicApiPaths.size + accountApiPaths.size);

  for (const { routePath } of apiRoutes) {
    const expected = publicApiPaths.has(routePath)
      ? "public"
      : accountApiPaths.has(routePath)
        ? "account"
        : "core";
    await assertAccessClassification(materializeDynamicPath(routePath), expected);
  }

  for (const publicPath of [
    "/",
    "/privacy",
    "/support",
    "/terms",
    "/r",
    "/r/plan",
    "/r/session",
    "/r/response",
  ]) {
    await assertAccessClassification(publicPath, "public");
  }

  for (const futureOrRetiredPath of [
    "/api/future-mutation",
    "/api/share/future-mutation",
    "/api/healthcheck",
    "/api/billing/webhook/replay",
    "/api/share/session",
    "/api/share/response",
  ]) {
    await assertAccessClassification(futureOrRetiredPath, "core");
  }

  for (const [encodedPath, expected] of [
    ["/%61pp", "core"],
    ["/%61pp.rsc", "core"],
    ["/%61pi/profile", "account"],
    ["/%2561pi/future-mutation", "core"],
    ["/%72/plan", "public"],
  ]) {
    await assertAccessClassification(encodedPath, expected);
  }

  for (const path of ["/app", "/app.rsc", "/api/profile", "/api/future-mutation"]) {
    const unauthenticated = await fetchBuiltApp(
      path,
      { headers: { accept: "text/html,application/json" } },
      {
        ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
        INSTRUCTOR_ACCESS_MODE: "owner_private",
        OWNER_PRIVATE_ACCESS_PEPPER:
          "synthetic-owner-private-matrix-pepper-2026-08-07",
        OWNER_PRIVATE_EMAIL_DIGESTS: "0".repeat(64),
      },
    );
    assert.equal(unauthenticated.status, 401, `${path} did not fail closed without identity`);
    assert.match(await unauthenticated.text(), /authentication_required|Sign in required/);
  }
});

test(
  "living-plan writes reject cross-tenant plans and cross-plan phase ID substitution",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const coachA = { email: "coach.a@example.test", name: "Coach Avery" };
    const coachB = { email: "coach.b@example.test", name: "Coach Bailey" };

    await createProfile(worker, coachA);
    await grantSyntheticGolferRecordConsent(worker, coachB);
    const firstWorkspace = await createGolfer(worker, coachA, "Matrix One");
    const secondWorkspace = await createGolfer(worker, coachA, "Matrix Two");
    const firstPhaseId = firstWorkspace.phases[0].id;
    const secondPhaseId = secondWorkspace.phases[0].id;

    const crossTenant = await jsonWrite(
      worker,
      `/api/plans/${firstWorkspace.plan.id}/content`,
      "POST",
      coachB,
      practicePayload(firstPhaseId),
    );
    assert.equal(crossTenant.status, 404);
    assert.equal((await crossTenant.json()).error.code, "plan_not_found");

    const crossPlanPhase = await jsonWrite(
      worker,
      `/api/plans/${firstWorkspace.plan.id}/content`,
      "POST",
      coachA,
      practicePayload(secondPhaseId),
    );
    assert.equal(crossPlanPhase.status, 400);
    assert.equal((await crossPlanPhase.json()).error.code, "phase_not_found");

    const inspection = await worker.inspect([
      {
        sql: "select id, revision from development_plans where id in (?, ?) order by id",
        params: [firstWorkspace.plan.id, secondWorkspace.plan.id],
      },
      {
        sql: "select count(*) as count from practice_items where plan_id in (?, ?)",
        params: [firstWorkspace.plan.id, secondWorkspace.plan.id],
      },
      {
        sql: "select count(*) as count from audit_events where action = 'practice.create'",
      },
    ]);
    assert.equal(inspection[0].results.length, 2);
    assert.deepEqual(
      inspection[0].results.map(({ revision }) => revision),
      [1, 1],
    );
    assert.equal(inspection[1].results[0].count, 0);
    assert.equal(inspection[2].results[0].count, 0);
  },
);

async function discoverBrowserMutations() {
  const routes = await discoverAppRoutes();
  const mutations = [];
  for (const route of routes.filter(({ filename }) => filename.endsWith("route.ts"))) {
    const source = await readFile(route.filename, "utf8");
    for (const match of source.matchAll(
      /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/g,
    )) {
      mutations.push({ method: match[1], routePath: route.routePath });
    }
  }
  return mutations.sort((left, right) =>
    `${left.routePath}:${left.method}`.localeCompare(
      `${right.routePath}:${right.method}`,
    ),
  );
}

async function discoverInstructorPages() {
  const routes = await discoverAppRoutes();
  return routes
    .filter(
      ({ filename, routePath }) =>
        filename.endsWith("page.tsx") &&
        (routePath === "/app" || routePath.startsWith("/app/")),
    )
    .map(({ routePath }) => routePath)
    .sort();
}

async function discoverWriteCapableGetApis() {
  const routes = await discoverAppRoutes();
  const healthRoutes = new Set([
    "/api/health",
    "/api/operations/health",
  ]);
  const paths = [];
  for (const route of routes.filter(
    ({ filename, routePath }) =>
      filename.endsWith("route.ts") &&
      routePath.startsWith("/api/") &&
      !healthRoutes.has(routePath),
  )) {
    const source = await readFile(route.filename, "utf8");
    if (/export\s+async\s+function\s+GET\s*\(/.test(source)) {
      paths.push(route.routePath);
    }
  }
  return paths.sort();
}

function frozenReadHeaders(accept) {
  return {
    ...identityHeaders("coach.a@example.test", "Coach Avery"),
    accept,
  };
}

async function assertWriteUnavailable(worker, path, init, label) {
  const response = await worker.dispatch(path, init);
  assert.equal(response.status, 503, `${label} bypassed the write freeze`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  assert.equal(response.headers.get("retry-after"), "60");
  if (init.method.toUpperCase() === "HEAD") {
    assert.equal(await response.text(), "", `${label} returned a HEAD body`);
    return;
  }
  assert.deepEqual(await response.json(), {
    error: {
      code: "application_writes_unavailable",
      message: "Changes are temporarily unavailable. Try again later.",
    },
  });
}

async function assertNoContainmentWrites(worker) {
  const [persisted] = await worker.inspect([
    {
      sql: `select
        (select count(*) from accounts) as accounts,
        (select count(*) from audit_events) as audit_events,
        (select count(*) from abuse_rate_limits) as rate_counters,
        (select count(*) from golfer_plan_responses) as golfer_responses,
        (select count(*) from data_requests) as data_requests,
        (select count(*) from billing_events) as billing_events,
        (select count(*) from scheduler_heartbeat) as scheduler_heartbeats`,
    },
  ]);
  assert.deepEqual(persisted.results, [
    {
      accounts: 0,
      audit_events: 0,
      rate_counters: 0,
      golfer_responses: 0,
      data_requests: 0,
      billing_events: 0,
      scheduler_heartbeats: 0,
    },
  ]);
}

async function discoverAppRoutes() {
  const files = await walk(appRoot);
  return files
    .filter((filename) => /(?:^|[\\/])(page|route)\.tsx?$/.test(filename))
    .map((filename) => ({ filename, routePath: routePathFor(filename) }));
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(filename)));
    else files.push(filename);
  }
  return files;
}

function routePathFor(filename) {
  const segments = relative(appRoot, filename)
    .split(sep)
    .slice(0, -1)
    .filter((segment) => !segment.startsWith("(") && !segment.startsWith("@"));
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function materializeDynamicPath(path) {
  return path.replace(/\[+\.{0,3}([^\]]+)\]+/g, (_match, name) =>
    `synthetic-${name.replace(/[^a-z0-9-]/gi, "-")}`,
  );
}

let builtWorkerPromise;

async function fetchBuiltApp(path, init, environment = {}) {
  builtWorkerPromise ??= import(new URL("../dist/server/index.js", import.meta.url))
    .then(({ default: worker }) => worker);
  const worker = await builtWorkerPromise;
  return worker.fetch(
    new Request(new URL(path, "https://roadmap.example"), init),
    {
      ASSETS: {
        fetch: async () => {
          throw new Error("Origin validation reached static assets");
        },
      },
      ...environment,
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function assertAccessClassification(path, expected) {
  const subscriptionResponse = await fetchBuiltApp(
    path,
    {
      headers: {
        accept: "text/html,application/json",
        "oai-authenticated-user-email": "classified.coach@example.test",
      },
    },
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      INSTRUCTOR_ACCESS_MODE: "subscription_required",
      SUBSCRIPTION_ACCESS_STATUSES: "active",
      STRIPE_CHECKOUT_PRICE_ID: "price_route_matrix",
      STRIPE_RECOGNIZED_PRICE_IDS: "price_route_matrix",
      SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: "price_route_matrix",
      SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
    },
  );
  const subscriptionBody = await subscriptionResponse.text();
  if (expected === "core") {
    assert.equal(subscriptionResponse.status, 503, `${path} did not fail closed as core`);
    assert.match(
      subscriptionBody,
      /product_access_unavailable|Access temporarily unavailable/,
      `${path} was not denied by the Worker product-access boundary`,
    );
    return;
  }
  assert.doesNotMatch(
    subscriptionBody,
    /product_access_unavailable|Access temporarily unavailable/,
    `${path} was unexpectedly classified as core instead of ${expected}`,
  );

  const ownerPrivateResponse = await fetchBuiltApp(
    path,
    {
      headers: {
        accept: "text/html,application/json",
        "oai-authenticated-user-email": "classified.coach@example.test",
      },
    },
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      INSTRUCTOR_ACCESS_MODE: "owner_private",
      OWNER_PRIVATE_ACCESS_PEPPER:
        "synthetic-owner-private-matrix-pepper-2026-08-07",
      OWNER_PRIVATE_EMAIL_DIGESTS: "0".repeat(64),
    },
  );
  const ownerPrivateBody = await ownerPrivateResponse.text();
  if (expected === "account") {
    assert.equal(
      ownerPrivateResponse.status,
      403,
      `${path} was not protected as an account route`,
    );
    assert.match(
      ownerPrivateBody,
      /product_access_denied|Product access is not available/,
      `${path} bypassed owner-private account protection`,
    );
  } else {
    assert.doesNotMatch(
      ownerPrivateBody,
      /product_access_denied|Product access is not available/,
      `${path} was unexpectedly protected instead of explicitly public`,
    );
  }
}

async function createProfile(worker, identity) {
  const response = await jsonWrite(worker, "/api/profile", "PUT", identity, {
    displayName: identity.name,
    businessName: "Security Matrix Golf",
    professionalTitle: "Golf instructor",
    philosophy: "Synthetic authorization verification only.",
    contactEmail: identity.email,
    websiteUrl: "https://security.example.ca",
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#176b55",
  });
  assert.equal(response.status, 200);
  await grantSyntheticGolferRecordConsent(worker, identity);
}

async function createGolfer(worker, identity, displayName) {
  const response = await jsonWrite(
    worker,
    "/api/golfers",
    "POST",
    identity,
    {
      adultEligibilityConfirmed: true,
      displayName,
      planTitle: `${displayName} roadmap`,
      goal: {
        statement: "Build a predictable contact window.",
        why: "Choose targets with confidence.",
        context: "Synthetic local security verification.",
      },
      assessment: {
        summary: "Contact changes when transition speed increases.",
        strengths: "Clear strike awareness.",
        primaryPattern: "Start direction changes as transition speed increases.",
        limitations: "Start direction varies under pressure.",
      },
      priority: {
        title: "Stable start direction",
        rationale: "A stable window supports target decisions.",
      },
      phases: [1, 2, 3, 4].map((number) => ({
        number,
        title: `Phase ${number}`,
        purpose: `Synthetic purpose ${number}.`,
        rationale: number === 1 ? "Establish the observed start-direction baseline first." : null,
        progressSignals: number === 1 ? ["Start direction repeats in a coach-reviewed set."] : [],
      })),
    },
  );
  assert.equal(response.status, 201);
  return response.json();
}

function practicePayload(phaseId) {
  return {
    kind: "practice",
    phaseId,
    expectedRevision: 1,
    title: "Synthetic strike window",
    objective: "Repeat a bounded contact task.",
    rationale: "Synthetic authorization verification.",
    instructions: "Use one target.\nRecord the strike location.",
    successCheck: "Complete the task without changing the target.",
    stopOrAskRule: "Stop if the task is unclear.",
  };
}

function jsonWrite(worker, path, method, identity, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(identity.email, identity.name),
    body: JSON.stringify(body),
  });
}
