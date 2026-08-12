import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { buildArtifactIdentity } from "../scripts/build-artifact-identity.mjs";
import {
  createFunctionalQaCandidateLedger,
  FUNCTIONAL_QA_H_EXTERNAL_ACTIVATION_PENDING,
  validateFunctionalQaCandidateLedger,
} from "../scripts/write-functional-qa-ledger.mjs";
import { validateFunctionalQaCandidateManifest } from "../scripts/write-functional-qa-manifest.mjs";

const CANDIDATE = "candidate-ledger-01";

test("new exact-candidate ledger is identity-bound but ineligible and unrecorded", async (context) => {
  const fixture = await ledgerFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const ledger = await incompleteLedger(fixture.projectRoot);

  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.completionEligibility.eligible, false);
  assert.equal(ledger.verification.status, "not_recorded");
  assert.equal(ledger.sourceIdentity.status, "recorded");
  assert.equal(ledger.buildIdentity.status, "recorded");
  assert.equal(
    ledger.buildIdentity.inventoryPath,
    `output/playwright/${CANDIDATE}/build-identity.json`,
  );
  assert.ok(ledger.requiredViewports.every(({ evidencePaths }) => evidencePaths.length === 0));
  assert.equal(validateFunctionalQaCandidateLedger(ledger, CANDIDATE), ledger);
});

test("eligible ledger rejects incomplete, omitted, dirty, and misplaced evidence", async (context) => {
  const fixture = await ledgerFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const incomplete = structuredClone(await incompleteLedger(fixture.projectRoot));
  incomplete.completionEligibility.eligible = true;
  assert.throws(
    () => validateFunctionalQaCandidateLedger(incomplete, CANDIDATE),
    /green zero-omission verification/,
  );

  const complete = await completeLedger(fixture.projectRoot);
  const omittedEvidence = structuredClone(complete);
  omittedEvidence.acceptanceScenarios[0].evidencePaths = [];
  assert.throws(
    () => validateFunctionalQaCandidateLedger(omittedEvidence, CANDIDATE),
    /evidence arrays must be nonempty/,
  );

  const dirtyConsole = structuredClone(complete);
  dirtyConsole.browserReview.consoleErrorCount = 1;
  assert.throws(
    () => validateFunctionalQaCandidateLedger(dirtyConsole, CANDIDATE),
    /complete clean browser review/,
  );

  const misplacedPending = structuredClone(complete);
  misplacedPending.acceptanceScenarios[0].externalDependencyResult =
    FUNCTIONAL_QA_H_EXTERNAL_ACTIVATION_PENDING;
  assert.throws(
    () => validateFunctionalQaCandidateLedger(misplacedPending, CANDIDATE),
    /invalid external status for Scenario A/,
  );
});

test("fully recorded A-H, viewport, fixture, manual, and clean-browser ledger is accepted", async (context) => {
  const fixture = await ledgerFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const ledger = await completeLedger(fixture.projectRoot);
  assert.equal(validateFunctionalQaCandidateLedger(ledger, CANDIDATE), ledger);
  assert.equal(
    ledger.acceptanceScenarios.find(({ id }) => id === "H")
      .externalDependencyResult,
    FUNCTIONAL_QA_H_EXTERNAL_ACTIVATION_PENDING,
  );
});

test("historical manifest schemas remain readable only while explicitly ineligible", () => {
  for (const schemaVersion of [1, 2]) {
    const historical = {
      schemaVersion,
      candidateId: CANDIDATE,
      completionEligibility: { eligible: false },
      ...(schemaVersion === 2
        ? {
            sourceIdentity: {
              inventoryPath: `output/playwright/${CANDIDATE}/source-identity.json`,
              aggregateSha256: null,
              fileCount: null,
              totalBytes: null,
            },
            acceptanceScenarios: ["A", "B", "C", "D", "E", "F", "G", "H"].map(
              (id) => ({ id, evidencePaths: [], blockerIds: [], notes: [] }),
            ),
          }
        : {}),
    };
    assert.equal(validateFunctionalQaCandidateManifest(historical, CANDIDATE), historical);
    historical.completionEligibility.eligible = true;
    assert.throws(
      () => validateFunctionalQaCandidateManifest(historical, CANDIDATE),
      /never eligibility authorities/,
    );
  }
});

test("Playwright wrapper creates the identity-bound ledger once and refuses legacy promotion", async () => {
  const [wrapper, writer] = await Promise.all([
    readFile(new URL("../scripts/playwright-cli.ps1", import.meta.url), "utf8"),
    readFile(
      new URL("../scripts/write-functional-qa-ledger.mjs", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(wrapper, /source-identity\.mjs/);
  assert.match(wrapper, /build-artifact-identity\.mjs/);
  assert.match(wrapper, /write-functional-qa-ledger\.mjs/);
  assert.match(wrapper, /historical v1\/v2 candidate/);
  assert.match(wrapper, /immutable identity files are never overwritten/);
  assert.match(writer, /flag: "wx"/);
});

async function incompleteLedger(projectRoot) {
  return createFunctionalQaCandidateLedger({
    candidateId: CANDIDATE,
    createdAt: new Date("2026-08-11T12:00:00.000Z"),
    sourceIdentity: {
      schemaVersion: 2,
      candidate: CANDIDATE,
      aggregateSha256: "a".repeat(64),
      fileCount: 1,
      totalBytes: 1,
      files: [{ path: "app/page.tsx", bytes: 1, sha256: "b".repeat(64) }],
    },
    buildIdentity: await buildArtifactIdentity({ projectRoot, candidate: CANDIDATE }),
  });
}

async function completeLedger(projectRoot) {
  const ledger = structuredClone(await incompleteLedger(projectRoot));
  const evidence = [`output/playwright/${CANDIDATE}/evidence.json`];
  Object.assign(ledger.verification, {
    status: "passed",
    tests: 12,
    passed: 12,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    durationMs: 1200,
    evidencePaths: evidence,
  });
  for (const viewport of ledger.requiredViewports) {
    Object.assign(viewport, {
      functionalResult: "passed",
      visualResult: "passed",
      manualReviewResult: "passed",
      evidencePaths: evidence,
    });
  }
  for (const scenario of ledger.fixtureScenarios) {
    Object.assign(scenario, {
      functionalResult: "passed",
      visualResult: "passed",
      evidencePaths: evidence,
    });
  }
  for (const scenario of ledger.acceptanceScenarios) {
    Object.assign(scenario, {
      automatedResult: "passed",
      browserFunctionalResult: "passed",
      browserVisualResult: "passed",
      manualReviewResult: "passed",
      externalDependencyResult:
        scenario.id === "H"
          ? FUNCTIONAL_QA_H_EXTERNAL_ACTIVATION_PENDING
          : "not_applicable",
      evidencePaths: evidence,
      blockerIds: [],
    });
  }
  Object.assign(ledger.browserReview, {
    consoleErrorCount: 0,
    failedNetworkRequestCount: 0,
    keyboardResult: "passed",
    touchEquivalentResult: "passed",
    reducedMotionResult: "passed",
    reflowAndOverflowResult: "passed",
    manualVisualResult: "passed",
    visualReviewer: "Synthetic QA reviewer",
    evidencePaths: evidence,
  });
  ledger.completionEligibility = {
    eligible: true,
    reason: "Synthetic complete-ledger validation fixture.",
  };
  return ledger;
}

async function ledgerFixture() {
  const root = await mkdtemp(join(tmpdir(), "roadmap-functional-ledger-"));
  const projectRoot = join(root, "10_production_saas");
  const write = async (relativePath, contents) => {
    const absolutePath = join(projectRoot, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  };
  await Promise.all([
    write(
      "package.json",
      JSON.stringify({ name: "roadmap-production-saas", private: true }),
    ),
    write("dist/client/app.js", "export const app = true;\n"),
    write("dist/server/index.js", "export default {};\n"),
  ]);
  return { root, projectRoot };
}
