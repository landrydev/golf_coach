import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  grantSyntheticGolferRecordConsent,
  identityHeaders,
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const coach = {
  email: "coach.a@example.test",
  name: "Coach Avery",
};

test("every JSON mutation route uses the shared exact-object key boundary", async () => {
  const appRoot = fileURLToPath(new URL("../app", import.meta.url));
  const routeFiles = [
    ...(await collectRouteFiles(path.join(appRoot, "api"))),
    ...(await collectRouteFiles(path.join(appRoot, "r"))),
  ];
  const jsonMutationRoutes = [];
  const violations = [];

  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile, "utf8");
    if (!source.includes("readJson")) continue;
    const relative = path.relative(appRoot, routeFile).replaceAll("\\", "/");
    jsonMutationRoutes.push(relative);
    if (
      !source.includes("assertExactObjectKeys(") &&
      !source.includes("parsePackageInput(")
    ) {
      violations.push(relative);
    }
  }

  assert.ok(jsonMutationRoutes.length > 0, "no JSON mutation routes were discovered");
  assert.deepEqual(violations, []);

  const packageInput = await readFile(
    fileURLToPath(new URL("../lib/package-input.ts", import.meta.url)),
    "utf8",
  );
  assert.match(packageInput, /assertExactObjectKeys\(payload, PACKAGE_FIELDS\)/);
});

test(
  "route-level CSP, injection, canonicalization, and overposting regression corpus",
  { timeout: 90_000 },
  async (context) => {
    const {
      instructorAccessScopeForPath,
      normalizeApplicationPath,
    } = await import("../lib/product-access.ts");
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    await grantSyntheticGolferRecordConsent(worker, coach);

    await context.test("CSP blocks attribute, base, frame, plugin, and worker escalation", async () => {
      const responses = await Promise.all([
        worker.dispatch("/", { headers: { accept: "text/html" } }),
        worker.dispatch("/app", { headers: { accept: "text/html" } }),
        worker.dispatch("/%61pi/future-mutation", {
          headers: { accept: "application/json" },
        }),
        worker.dispatch("/r", { headers: { accept: "text/html" } }),
      ]);

      assert.equal(responses[0].status, 200);
      assert.equal(responses[1].status, 401);
      assert.equal(responses[2].status, 401);

      for (const response of responses) {
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        assert.equal(response.headers.get("x-frame-options"), "DENY");
        assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
        assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
        assert.equal(response.headers.get("origin-agent-cluster"), "?1");

        const policy = parseCsp(response.headers.get("content-security-policy") ?? "");
        assert.deepEqual(policy.get("base-uri"), ["'none'"]);
        assert.deepEqual(policy.get("script-src-attr"), ["'none'"]);
        assert.deepEqual(policy.get("object-src"), ["'none'"]);
        assert.deepEqual(policy.get("frame-src"), ["'none'"]);
        assert.deepEqual(policy.get("frame-ancestors"), ["'none'"]);
        assert.deepEqual(policy.get("worker-src"), ["'none'"]);
        assert.deepEqual(policy.get("manifest-src"), ["'self'"]);
        assert.deepEqual(policy.get("connect-src"), ["'self'"]);
        assert.ok(policy.get("script-src")?.includes("'unsafe-inline'"));
        assert.ok(policy.get("script-src-elem")?.includes("'unsafe-inline'"));
        assert.equal(policy.get("script-src")?.includes("'unsafe-eval'"), false);
      }

      const html = await responses[0].text();
      assert.match(html, /<script\b/i, "vinext currently emits an inline bootstrap");
      assert.doesNotMatch(html, /<base\b|<object\b|<embed\b|<iframe\b/i);
    });

    await context.test("stored adversarial text is preserved as text and escaped when rendered", async () => {
      const displayName = '<img data-roadmap-injection src=x onerror="alert(1)">';
      const businessName =
        '<base data-roadmap-injection href="https://attacker.invalid/">';
      const philosophy =
        '</textarea><script data-roadmap-injection>globalThis.__roadmapStoredXss=1</script><iframe data-roadmap-injection src="https://attacker.invalid/"></iframe>';

      const saved = await worker.dispatch("/api/profile", {
        method: "PUT",
        headers: writeHeaders(coach.email, coach.name),
        body: JSON.stringify({
          displayName,
          businessName,
          professionalTitle: "Instructor",
          philosophy,
          contactEmail: coach.email,
          city: "Calgary",
          provinceOrTerritory: "Alberta",
          accentColor: "#176b55",
        }),
      });
      assert.equal(saved.status, 200);

      const profileResponse = await worker.dispatch("/api/profile", {
        headers: identityHeaders(coach.email, coach.name),
      });
      assert.equal(profileResponse.status, 200);
      const profile = (await profileResponse.json()).profile;
      assert.equal(profile.displayName, displayName);
      assert.equal(profile.businessName, businessName);
      assert.equal(profile.philosophy, philosophy);

      const settingsResponse = await worker.dispatch("/app/settings", {
        headers: {
          ...identityHeaders(coach.email, coach.name),
          accept: "text/html",
        },
      });
      assert.equal(settingsResponse.status, 200);
      const html = await settingsResponse.text();
      assert.match(html, /data-roadmap-injection/);
      assert.match(html, /(?:&lt;|\\u003c)(?:img|base|script|iframe)\b/i);
      assert.doesNotMatch(html, /<(?:img|base|script|iframe)\s+data-roadmap-injection\b/i);
      assert.doesNotMatch(html, /<script\s+data-roadmap-injection[^>]*>\s*globalThis\./i);
      assertSecureCsp(settingsResponse);
    });

    await context.test("external URL inputs canonicalize once and reject unsafe destinations", async () => {
      const supplied =
        "https://Booking.Example.CA:443/packages/../book?next=%2Fr%2Fplan#section";
      const canonical = "https://booking.example.ca/book?next=%2Fr%2Fplan#section";
      const created = await writeJson(
        worker,
        "/api/packages",
        "POST",
        packagePayload(supplied, "canonical"),
      );
      assert.equal(created.status, 201);
      assert.equal((await created.json()).package.externalActionUrl, canonical);

      for (const unsafeUrl of [
        "javascript:alert(1)",
        "http://booking.example.ca/insecure",
        "https://user:secret@booking.example.ca/private",
        "https://localhost/private",
        "https://127.0.0.1/private",
        "https://booking.example/private",
      ]) {
        const rejected = await writeJson(
          worker,
          "/api/packages",
          "POST",
          packagePayload(unsafeUrl, crypto.randomUUID()),
        );
        assert.equal(rejected.status, 400, `${unsafeUrl} should be rejected`);
        assert.equal((await rejected.json()).error.code, "invalid_field");
      }
    });

    await context.test("allowlisted JSON routes reject prototype and extra-field overposting", async () => {
      const cases = [
        {
          label: "package prototype key",
          path: "/api/packages",
          method: "POST",
          body: dangerousJson(
            packagePayload("https://booking.example.ca/prototype", "prototype"),
            "__proto__",
          ),
          code: "unexpected_field",
        },
        {
          label: "profile privilege field",
          path: "/api/profile",
          method: "PUT",
          body: JSON.stringify({ isAdmin: true }),
          code: "unexpected_field",
        },
        {
          label: "empty export constructor key",
          path: "/api/data-export",
          method: "POST",
          body: dangerousJson({}, "constructor"),
          code: "unexpected_field",
        },
        {
          label: "data request privilege field",
          path: "/api/data-requests",
          method: "POST",
          body: JSON.stringify({ type: "deletion", operatorApproved: true }),
          code: "unexpected_field",
        },
        {
          label: "full golfer privilege field",
          path: "/api/golfers",
          method: "POST",
          body: JSON.stringify({ adultEligibilityConfirmed: true, isAdmin: true }),
          code: "unexpected_field",
        },
        {
          label: "full golfer nested goal privilege field",
          path: "/api/golfers",
          method: "POST",
          body: JSON.stringify({
            adultEligibilityConfirmed: true,
            goal: { statement: "A bounded goal.", ownerOverride: true },
          }),
          code: "unexpected_field",
        },
        {
          label: "staged golfer privilege field",
          path: "/api/golfers/staged",
          method: "POST",
          body: JSON.stringify({ adultEligibilityConfirmed: true, isAdmin: true }),
          code: "unexpected_field",
        },
        {
          label: "staged completion privilege field",
          path: "/api/golfers/not-a-golfer/complete",
          method: "POST",
          body: JSON.stringify({ isAdmin: true }),
          code: "unexpected_field",
        },
        {
          label: "nested goal prototype field",
          path: "/api/golfers/staged",
          method: "POST",
          body: JSON.stringify({
            adultEligibilityConfirmed: true,
            displayName: "Adversarial Golfer",
            planTitle: "Adversarial Plan",
            goal: {
              statement: "A bounded goal.",
              prototype: { polluted: true },
            },
          }),
          code: "unexpected_field",
        },
        {
          label: "plan edit constructor key",
          path: "/api/plans/not-a-plan",
          method: "PUT",
          body: dangerousJson({ expectedRevision: 1 }, "constructor"),
          code: "unexpected_field",
        },
        {
          label: "package archive privilege field",
          path: "/api/packages/not-a-package",
          method: "DELETE",
          body: JSON.stringify({ confirmation: "archive_package", role: "owner" }),
          code: "unexpected_field",
        },
        {
          label: "golfer archive prototype key",
          path: "/api/golfers/not-a-golfer",
          method: "DELETE",
          body: dangerousJson(
            { confirmation: "archive_golfer_and_revoke_access" },
            "prototype",
          ),
          code: "unexpected_field",
        },
        {
          label: "living-content withdrawal privilege field",
          path: "/api/plans/not-a-plan/content",
          method: "DELETE",
          body: JSON.stringify({
            kind: "lesson",
            itemId: "not-an-item",
            expectedRevision: 1,
            confirmation: "withdraw_plan_content",
            accountIdOverride: "attacker-account",
          }),
          code: "unexpected_field",
        },
        {
          label: "living-content kind-specific privilege field",
          path: "/api/plans/not-a-plan/content",
          method: "POST",
          body: JSON.stringify({
            kind: "lesson",
            phaseId: "not-a-phase",
            expectedRevision: 1,
            objective: "A practice-only field must not be accepted for a lesson.",
          }),
          code: "unexpected_field",
        },
        {
          label: "plan publish privilege field",
          path: "/api/plans/not-a-plan/publish",
          method: "POST",
          body: JSON.stringify({ role: "owner" }),
          code: "unexpected_field",
        },
        {
          label: "share revoke privilege field",
          path: "/api/shares/not-a-share",
          method: "DELETE",
          body: JSON.stringify({ reason: "Synthetic rejection.", isAdmin: true }),
          code: "unexpected_field",
        },
        {
          label: "share session privilege field",
          path: "/r/session",
          method: "POST",
          body: JSON.stringify({ token: "synthetic-token", isAdmin: true }),
          code: "unexpected_field",
        },
        {
          label: "share response privilege field",
          path: "/r/response",
          method: "POST",
          body: JSON.stringify({ responseType: "acknowledged", isAdmin: true }),
          code: "unexpected_field",
        },
        {
          label: "explicit account ownership field",
          path: "/api/data-export",
          method: "POST",
          body: JSON.stringify({ accountId: "attacker-account" }),
          code: "client_account_id_not_allowed",
        },
      ];

      for (const scenario of cases) {
        const response = await worker.dispatch(scenario.path, {
          method: scenario.method,
          headers: writeHeaders(coach.email, coach.name),
          body: scenario.body,
        });
        assert.equal(response.status, 400, scenario.label);
        assert.equal((await response.json()).error.code, scenario.code, scenario.label);
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      }

      assert.equal(Object.prototype.polluted, undefined);
      assert.equal({}.polluted, undefined);
    });

    await context.test("encoded and ambiguous paths preserve the effective access boundary", async () => {
      const classificationCases = [
        ["/%61pp", "/app", "core"],
        ["/%2561pp.rsc", "/app", "core"],
        ["/app%2Fsettings", "/app/settings", "account"],
        ["/app%255Csettings", "/app/settings", "account"],
        ["/%61pi/profile", "/api/profile", "account"],
        ["/%2561pi/future-mutation", "/api/future-mutation", "core"],
        ["/%61pi%2Fbilling%2Fwebhook%2Freplay", "/api/billing/webhook/replay", "core"],
        [
          "/api/operations/data-requests%2F..%2Fgolfers",
          "/api/__invalid_path__",
          "core",
        ],
        [
          "/api/operations/data-requests%252F%252E%252E%255Cgolfers",
          "/api/__invalid_path__",
          "core",
        ],
        [
          "/api/operations/data-requests/%2e%2e.rsc",
          "/api/__invalid_path__",
          "core",
        ],
        [
          "/api/operations/data-requests%2F%2e%2e.rsc",
          "/api/__invalid_path__",
          "core",
        ],
        [
          "/api/operations/data-requests%252F%252e%252e.rsc",
          "/api/__invalid_path__",
          "core",
        ],
        ["/app/%2e/settings", "/api/__invalid_path__", "core"],
        ["/app%3Fpublic", "/api/__invalid_path__", "core"],
        ["/%", "/api/__invalid_path__", "core"],
        ["/%72/plan", "/r/plan", null],
      ];

      for (const [raw, canonical, scope] of classificationCases) {
        assert.equal(normalizeApplicationPath(raw), canonical, raw);
        assert.equal(instructorAccessScopeForPath(raw), scope, raw);
      }

      for (const path of classificationCases
        .filter(([, , scope]) => scope !== null)
        .map(([raw]) => raw)) {
        const response = await worker.dispatch(path, {
          headers: { accept: "text/html,application/json" },
        });
        assert.equal(response.status, 401, `${path} bypassed authentication`);
        assertSecureCsp(response);
      }

      const encodedGolfer = await worker.dispatch("/%72/plan", {
        headers: { accept: "text/html" },
      });
      assert.notEqual(encodedGolfer.status, 401);
      assert.equal(encodedGolfer.headers.get("referrer-policy"), "no-referrer");
      assertSecureCsp(encodedGolfer);
    });
  },
);

function packagePayload(externalActionUrl, suffix) {
  return {
    title: `Security package ${suffix}`.slice(0, 120),
    description: "A bounded package used for route-level input verification.",
    priceCents: 12_500,
    currency: "CAD",
    terms: "Synthetic test terms; no purchase occurs.",
    inclusions: ["One synthetic review"],
    externalActionUrl,
    status: "active",
    isDefault: false,
  };
}

function dangerousJson(value, key) {
  const body = { ...value };
  Object.defineProperty(body, key, {
    configurable: true,
    enumerable: true,
    value: { polluted: true },
    writable: true,
  });
  return JSON.stringify(body);
}

function writeJson(worker, path, method, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}

function parseCsp(value) {
  return new Map(
    value
      .split(";")
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...sources] = directive.split(/\s+/);
        return [name, sources];
      }),
  );
}

function assertSecureCsp(response) {
  const policy = parseCsp(response.headers.get("content-security-policy") ?? "");
  assert.deepEqual(policy.get("base-uri"), ["'none'"]);
  assert.deepEqual(policy.get("script-src-attr"), ["'none'"]);
  assert.deepEqual(policy.get("object-src"), ["'none'"]);
  assert.deepEqual(policy.get("frame-src"), ["'none'"]);
  assert.deepEqual(policy.get("frame-ancestors"), ["'none'"]);
}

async function collectRouteFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRouteFiles(candidate)));
    } else if (entry.isFile() && entry.name === "route.ts") {
      files.push(candidate);
    }
  }
  return files;
}
