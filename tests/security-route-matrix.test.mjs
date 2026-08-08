import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { register } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  startD1Worker,
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
    "/api/profile",
    "/api/data-export",
    "/api/data-requests",
    "/api/billing/checkout",
    "/api/billing/portal",
    "/api/billing/reconcile",
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
