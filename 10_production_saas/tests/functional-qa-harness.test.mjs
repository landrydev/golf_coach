import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createFunctionalQaFixtureRegistry,
  FUNCTIONAL_QA_MEDIA_UPLOAD_POLICY,
  FUNCTIONAL_QA_SCENARIOS,
  functionalQaIdentity,
  functionalQaWorkerBindings,
} from "../scripts/functional-qa-fixtures.mjs";
import { startFunctionalQaServer } from "../scripts/functional-qa-server.mjs";
import {
  createFunctionalQaCandidateManifest,
  FUNCTIONAL_QA_ACCEPTANCE_SCENARIOS,
  validateFunctionalQaCandidateManifest,
} from "../scripts/write-functional-qa-manifest.mjs";
import {
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

test("functional QA scenario catalogue is complete, stable, and identity-isolated", () => {
  assert.deepEqual(
    FUNCTIONAL_QA_SCENARIOS.map(({ id }) => id),
    [
      "fresh",
      "standard",
      "three-phase",
      "mixed-30",
      "long-content",
      "expired",
      "revoked",
      "republished",
    ],
  );
  const identities = FUNCTIONAL_QA_SCENARIOS.map(({ id }) =>
    functionalQaIdentity(id),
  );
  assert.equal(new Set(identities.map(({ email }) => email)).size, identities.length);
  assert.deepEqual(functionalQaIdentity("standard"), {
    email: "visual.coach@example.test",
    name: "Coach Rowan",
  });
  assert.deepEqual(FUNCTIONAL_QA_MEDIA_UPLOAD_POLICY.allowedMimeTypes, [
    "image/png",
    "image/jpeg",
    "image/webp",
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "text/csv",
  ]);
  assert.equal(FUNCTIONAL_QA_MEDIA_UPLOAD_POLICY.accountMediaConsentRequired, false);
  assert.equal(FUNCTIONAL_QA_MEDIA_UPLOAD_POLICY.golferMediaConsentRequired, false);
});

test(
  "fixture registry builds every required scenario and preserves private-access lifecycle states",
  { timeout: 180_000 },
  async (context) => {
    const worker = await startD1Worker(functionalQaWorkerBindings());
    context.after(() => worker.dispose());
    const hookCalls = [];
    const fixtures = createFunctionalQaFixtureRegistry({
      worker,
      richFixtureHooks: [
        {
          name: "future-rich-slice-contract",
          scenarios: ["long-content"],
          async seed({ scenario, fixture, helpers }) {
            hookCalls.push({
              scenarioId: scenario.id,
              fixtureScenarioId: fixture.scenarioId,
              hasJsonWrite: typeof helpers.jsonWrite === "function",
            });
          },
        },
      ],
    });

    const fresh = await fixtures.get("fresh");
    assert.equal(fresh.state, "empty");

    const standard = await fixtures.get("standard");
    assert.equal(standard.workspace.phases.length, 4);
    assert.ok(standard.token);

    const threePhase = await fixtures.get("three-phase");
    assert.equal(threePhase.workspace.phases.length, 3);
    assert.equal(threePhase.coachingPackage, null);

    const mixed = await fixtures.get("mixed-30");
    assert.equal(mixed.records.length, 30);
    assert.deepEqual(
      Object.fromEntries(
        [...new Set(mixed.records.map(({ targetState }) => targetState))]
          .sort()
          .map((state) => [
            state,
            mixed.records.filter(({ targetState }) => targetState === state).length,
          ]),
      ),
      {
        archived: 3,
        completed: 4,
        draft: 5,
        incomplete: 5,
        paused: 5,
        published: 5,
        "review-needed": 3,
      },
    );

    const longContent = await fixtures.get("long-content");
    assert.ok(longContent.token);
    assert.equal(longContent.workspace.phases.length, 4);
    assert.deepEqual(hookCalls, [
      {
        scenarioId: "long-content",
        fixtureScenarioId: "long-content",
        hasJsonWrite: true,
      },
    ]);

    const expired = await fixtures.get("expired");
    await assertCapabilityUnavailable(worker, expired);
    const revoked = await fixtures.get("revoked");
    await assertCapabilityUnavailable(worker, revoked);

    const republished = await fixtures.get("republished");
    await assertCapabilityUnavailable(worker, {
      ...republished,
      token: republished.oldToken,
    });
    const replacement = await exchangeCapability(worker, republished);
    assert.equal(replacement.status, 200);
    assert.match((await replacement.json()).sessionContext, /^[0-9a-f]{64}$/);

    assert.deepEqual(fixtures.seededScenarioIds(), [
      "expired",
      "fresh",
      "long-content",
      "mixed-30",
      "republished",
      "revoked",
      "standard",
      "three-phase",
    ]);
  },
);

test(
  "functional QA HTTP server exposes deterministic entries, static assets, and the preserved visual route",
  { timeout: 90_000 },
  async (context) => {
    const runtime = await startFunctionalQaServer({ port: 0 });
    context.after(() => runtime.close());

    const catalogueResponse = await fetch(`${runtime.origin}/__qa/scenarios`);
    assert.equal(catalogueResponse.status, 200);
    const catalogue = await catalogueResponse.json();
    assert.equal(catalogue.scenarios.length, FUNCTIONAL_QA_SCENARIOS.length);
    assert.equal(
      catalogue.scenarios.find(({ id }) => id === "fresh").entries.app,
      `${runtime.origin}/__qa/fresh/app`,
    );
    assert.equal(
      catalogue.scenarios.find(({ id }) => id === "republished").entries.oldGolfer,
      `${runtime.origin}/__qa/republished/old-golfer`,
    );

    const favicon = await fetch(`${runtime.origin}/favicon.svg`);
    assert.equal(favicon.status, 200);
    assert.match(favicon.headers.get("content-type") ?? "", /^image\/svg\+xml/);

    const landing = await fetch(runtime.origin);
    assert.equal(landing.status, 200);
    const landingHtml = await landing.text();
    assert.match(landingHtml, new RegExp(escapeRegExp(`${runtime.origin}/favicon.svg`)));
    assert.doesNotMatch(landingHtml, /https:\/\/roadmap-test\.chatgpt\.site\/favicon\.svg/);

    const freshEntry = await fetch(`${runtime.origin}/__qa/fresh/app`, {
      redirect: "manual",
    });
    assert.equal(freshEntry.status, 302);
    assert.equal(freshEntry.headers.get("location"), "/app");
    const freshCookie = firstCookie(freshEntry.headers.get("set-cookie"));
    assert.match(freshCookie, /^roadmap_qa_scenario=fresh\b/);
    const freshWorkspace = await fetch(`${runtime.origin}/app`, {
      headers: { cookie: freshCookie },
    });
    assert.equal(freshWorkspace.status, 200);
    const freshWorkspaceHtml = await freshWorkspace.text();
    assert.match(freshWorkspaceHtml, /Home \| Roadmap/);
    assert.match(freshWorkspaceHtml, /Create the next player roadmap|Create a roadmap|Welcome back/);
    assert.doesNotMatch(freshWorkspaceHtml, /Golfer records are unavailable/);
    const freshMedia = await fetch(`${runtime.origin}/app/media`, {
      headers: { cookie: freshCookie },
    });
    assert.equal(freshMedia.status, 200);
    assert.match(await freshMedia.text(), /synthetic-functional-qa-v1|Media library \| Roadmap/);

    const visualEntry = await fetch(`${runtime.origin}/__visual/golfer`, {
      redirect: "manual",
    });
    assert.equal(visualEntry.status, 302);
    assert.match(
      visualEntry.headers.get("location") ?? "",
      /^\/r\/plan\?context=[0-9a-f]{64}$/,
    );
    const visualCookies = visualEntry.headers.get("set-cookie") ?? "";
    assert.match(visualCookies, /roadmap_qa_scenario=standard/);
    assert.match(visualCookies, /roadmap_share=/);
  },
);

test("candidate manifest is an incomplete exact-evidence template, not a completion claim", () => {
  const manifest = createFunctionalQaCandidateManifest({
    candidateId: "candidate-v17",
    origin: "http://127.0.0.1:4175",
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
  });
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.candidateId, "candidate-v17");
  assert.equal(manifest.verification.status, "not_recorded");
  assert.equal(manifest.completionEligibility.eligible, false);
  assert.deepEqual(
    manifest.requiredViewports.map(({ width }) => width),
    [320, 390, 768, 1440],
  );
  assert.equal(manifest.scenarios.length, FUNCTIONAL_QA_SCENARIOS.length);
  assert.ok(manifest.scenarios.every(({ artifactPaths }) => artifactPaths.length === 0));
  assert.deepEqual(
    FUNCTIONAL_QA_ACCEPTANCE_SCENARIOS.map(({ id }) => id),
    ["A", "B", "C", "D", "E", "F", "G", "H"],
  );
  assert.deepEqual(
    manifest.acceptanceScenarios.map(({ id, label }) => ({ id, label })),
    FUNCTIONAL_QA_ACCEPTANCE_SCENARIOS,
  );
  for (const scenario of manifest.acceptanceScenarios) {
    assert.equal(scenario.automatedResult, "not_recorded");
    assert.equal(scenario.browserFunctionalResult, "not_recorded");
    assert.equal(scenario.browserVisualResult, "not_recorded");
    assert.equal(scenario.manualReviewResult, "not_recorded");
    assert.equal(scenario.externalDependencyResult, "not_recorded");
    assert.deepEqual(scenario.evidencePaths, []);
    assert.deepEqual(scenario.blockerIds, []);
    assert.deepEqual(scenario.notes, []);
  }
  assert.deepEqual(manifest.sourceIdentity, {
    inventoryPath: "output/playwright/candidate-v17/source-identity.json",
    schemaVersion: null,
    aggregateSha256: null,
    fileCount: null,
    totalBytes: null,
    exactCommitOrArchive: null,
    releaseId: null,
    status: "RECORD BEFORE CLAIMING EXACT-CANDIDATE EVIDENCE",
  });
  assert.match(manifest.completionEligibility.reason, /acceptance Scenarios A-H/);
  assert.equal(
    validateFunctionalQaCandidateManifest(manifest, "candidate-v17"),
    manifest,
  );
  const incompleteSchema = structuredClone(manifest);
  incompleteSchema.acceptanceScenarios.pop();
  assert.throws(
    () => validateFunctionalQaCandidateManifest(incompleteSchema, "candidate-v17"),
    /Scenarios A-H/,
  );
  const wrongIdentityPath = structuredClone(manifest);
  wrongIdentityPath.sourceIdentity.inventoryPath =
    "output/playwright/another-candidate/source-identity.json";
  assert.throws(
    () => validateFunctionalQaCandidateManifest(wrongIdentityPath, "candidate-v17"),
    /source identity binding is invalid/,
  );
});

test("PowerShell wrapper invokes the pinned CLI directly and scopes artifacts to output/playwright", async () => {
  const [wrapper, packageManifest, visualHarness] = await Promise.all([
    readFile(new URL("../scripts/playwright-cli.ps1", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/visual-review-server.mjs", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageManifest);
  assert.equal(packageJson.devDependencies["@playwright/cli"], "0.1.18");
  assert.match(wrapper, /node_modules\\@playwright\\cli\\playwright-cli\.js/);
  assert.match(wrapper, /output\\playwright/);
  assert.match(wrapper, /write-functional-qa-manifest\.mjs/);
  assert.doesNotMatch(wrapper, /\bnpx\b/i);
  assert.match(visualHarness, /incomingUrl\.pathname === "\/favicon\.svg"/);
  assert.match(visualHarness, /replaceAll\(testOrigin, browserOrigin\)/);
});

async function assertCapabilityUnavailable(worker, fixture) {
  const response = await exchangeCapability(worker, fixture);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "plan_unavailable");
}

function exchangeCapability(worker, fixture) {
  return worker.dispatch("/r/session", {
    method: "POST",
    headers: writeHeaders(fixture.identity.email, fixture.identity.name),
    body: JSON.stringify({ token: fixture.token }),
  });
}

function firstCookie(setCookie) {
  return (setCookie ?? "").split(";", 1)[0];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
