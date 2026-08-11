import { lstat, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildArtifactIdentity,
  validateBuildArtifactIdentity,
} from "./build-artifact-identity.mjs";
import { FUNCTIONAL_QA_SCENARIOS } from "./functional-qa-fixtures.mjs";
import { buildSourceIdentity, validateCandidateName } from "./source-identity.mjs";
import {
  FUNCTIONAL_QA_ACCEPTANCE_SCENARIOS,
  validateFunctionalQaCandidateManifest,
} from "./write-functional-qa-manifest.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const REPOSITORY_ROOT = resolve(PROJECT_ROOT, "..");
const DEFAULT_OUTPUT_ROOT = resolve(REPOSITORY_ROOT, "output/playwright");
const LEDGER_SCHEMA_VERSION = 1;
const REQUIRED_VIEWPORTS = Object.freeze([
  { width: 320, height: 844 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
]);

export const FUNCTIONAL_QA_H_EXTERNAL_ACTIVATION_PENDING =
  "configuration_ready_external_activation_pending";

export function createFunctionalQaCandidateLedger({
  candidateId,
  sourceIdentity,
  buildIdentity,
  createdAt = new Date(),
}) {
  const candidate = validateCandidateName(candidateId);
  return Object.freeze({
    schemaVersion: LEDGER_SCHEMA_VERSION,
    recordType: "functional-qa-exact-candidate-completion-ledger",
    candidateId: candidate,
    createdAt: createdAt.toISOString(),
    workingManifest: {
      path: `output/playwright/${candidate}/candidate-manifest.json`,
      schemaVersion: 2,
      eligibilityAuthority: false,
    },
    sourceIdentity: identityBinding(candidate, "source", sourceIdentity),
    buildIdentity: identityBinding(candidate, "build", buildIdentity),
    verification: {
      command: "npm run verify",
      status: "not_recorded",
      tests: null,
      passed: null,
      failed: null,
      cancelled: null,
      skipped: null,
      todo: null,
      durationMs: null,
      evidencePaths: [],
    },
    requiredViewports: REQUIRED_VIEWPORTS.map((viewport) => ({
      ...viewport,
      functionalResult: "not_recorded",
      visualResult: "not_recorded",
      manualReviewResult: "not_recorded",
      evidencePaths: [],
    })),
    fixtureScenarios: FUNCTIONAL_QA_SCENARIOS.map(({ id, label }) => ({
      id,
      label,
      functionalResult: "not_recorded",
      visualResult: "not_recorded",
      evidencePaths: [],
    })),
    acceptanceScenarios: FUNCTIONAL_QA_ACCEPTANCE_SCENARIOS.map(({ id, label }) => ({
      id,
      label,
      automatedResult: "not_recorded",
      browserFunctionalResult: "not_recorded",
      browserVisualResult: "not_recorded",
      manualReviewResult: "not_recorded",
      externalDependencyResult: "not_recorded",
      evidencePaths: [],
      blockerIds: [],
    })),
    browserReview: {
      consoleErrorCount: null,
      failedNetworkRequestCount: null,
      keyboardResult: "not_recorded",
      touchEquivalentResult: "not_recorded",
      reducedMotionResult: "not_recorded",
      reflowAndOverflowResult: "not_recorded",
      manualVisualResult: "not_recorded",
      visualReviewer: null,
      evidencePaths: [],
    },
    completionEligibility: {
      eligible: false,
      reason:
        "Template only. Record green verification and complete exact-candidate A-H, fixture, viewport, keyboard, touch, reflow, console, network, and manual visual evidence before eligibility review.",
    },
  });
}

export function validateFunctionalQaCandidateLedger(ledger, candidateId) {
  const candidate = validateCandidateName(candidateId);
  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) {
    throw new Error("Functional QA completion ledger must be an object.");
  }
  if (
    ledger.schemaVersion !== LEDGER_SCHEMA_VERSION ||
    ledger.recordType !== "functional-qa-exact-candidate-completion-ledger" ||
    ledger.candidateId !== candidate
  ) {
    throw new Error("Functional QA completion ledger schema or candidateId is invalid.");
  }
  if (
    ledger.workingManifest?.path !==
      `output/playwright/${candidate}/candidate-manifest.json` ||
    ledger.workingManifest?.schemaVersion !== 2 ||
    ledger.workingManifest?.eligibilityAuthority !== false
  ) {
    throw new Error("Functional QA working-manifest binding is invalid.");
  }
  validateIdentityBinding(ledger.sourceIdentity, candidate, "source", 2);
  validateIdentityBinding(ledger.buildIdentity, candidate, "build", 1);
  validateOrderedRecords(
    ledger.requiredViewports,
    REQUIRED_VIEWPORTS,
    (record) => `${record.width}x${record.height}`,
    (record) => `${record.width}x${record.height}`,
    "required viewports",
  );
  validateOrderedRecords(
    ledger.fixtureScenarios,
    FUNCTIONAL_QA_SCENARIOS,
    ({ id }) => id,
    ({ id }) => id,
    "fixture scenarios",
  );
  validateOrderedRecords(
    ledger.acceptanceScenarios,
    FUNCTIONAL_QA_ACCEPTANCE_SCENARIOS,
    ({ id }) => id,
    ({ id }) => id,
    "acceptance Scenarios A-H",
  );
  assertEvidenceArray(ledger.verification?.evidencePaths, candidate, true);
  for (const viewport of ledger.requiredViewports) {
    assertEvidenceArray(viewport.evidencePaths, candidate, true);
  }
  for (const scenario of ledger.fixtureScenarios) {
    assertEvidenceArray(scenario.evidencePaths, candidate, true);
  }
  for (const scenario of ledger.acceptanceScenarios) {
    assertEvidenceArray(scenario.evidencePaths, candidate, true);
    if (!Array.isArray(scenario.blockerIds)) {
      throw new Error(`Functional QA acceptance Scenario ${scenario.id} blockers are invalid.`);
    }
  }
  assertEvidenceArray(ledger.browserReview?.evidencePaths, candidate, true);
  if (typeof ledger.completionEligibility?.eligible !== "boolean") {
    throw new Error("Functional QA completion-ledger eligibility is invalid.");
  }
  if (ledger.completionEligibility.eligible) {
    assertEligibleLedger(ledger, candidate);
  }
  return ledger;
}

export async function writeFunctionalQaCandidateLedger({
  candidateId,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  verifyCurrentIdentity = true,
}) {
  const candidate = validateCandidateName(candidateId);
  const normalizedOutputRoot = resolve(outputRoot);
  assertOutputRoot(normalizedOutputRoot);
  const candidateDirectory = resolve(normalizedOutputRoot, candidate);
  if (dirname(candidateDirectory) !== normalizedOutputRoot) {
    throw new Error("Candidate evidence directory escaped output/playwright.");
  }
  await assertSafeCandidateDirectory(normalizedOutputRoot, candidateDirectory);
  const manifestPath = resolve(candidateDirectory, "candidate-manifest.json");
  const sourcePath = resolve(candidateDirectory, "source-identity.json");
  const buildPath = resolve(candidateDirectory, "build-identity.json");
  const ledgerPath = resolve(candidateDirectory, "completion-ledger.json");
  const [manifest, sourceIdentity, buildIdentity] = await Promise.all([
    readRegularJson(manifestPath, "working manifest"),
    readRegularJson(sourcePath, "source identity"),
    readRegularJson(buildPath, "build identity"),
  ]);
  validateFunctionalQaCandidateManifest(manifest, candidate);
  validateStoredSourceIdentity(sourceIdentity, candidate);
  validateBuildArtifactIdentity(buildIdentity, candidate);
  if (verifyCurrentIdentity) {
    await assertCurrentIdentities(sourceIdentity, buildIdentity);
  }

  const existingMetadata = await lstat(ledgerPath).catch(() => null);
  if (existingMetadata) {
    if (existingMetadata.isSymbolicLink() || !existingMetadata.isFile()) {
      throw new Error("Functional QA completion ledger path is unsafe.");
    }
    const existing = JSON.parse(await readFile(ledgerPath, "utf8"));
    validateFunctionalQaCandidateLedger(existing, candidate);
    assertLedgerIdentityMatch(existing, sourceIdentity, buildIdentity);
    return Object.freeze({ ledgerPath, created: false, ledger: existing });
  }

  const ledger = createFunctionalQaCandidateLedger({
    candidateId: candidate,
    sourceIdentity,
    buildIdentity,
  });
  validateFunctionalQaCandidateLedger(ledger, candidate);
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return Object.freeze({ ledgerPath, created: true, ledger });
}

function identityBinding(candidate, type, identity) {
  if (type === "source") {
    validateStoredSourceIdentity(identity, candidate);
  } else {
    validateBuildArtifactIdentity(identity, candidate);
  }
  return {
    inventoryPath: `output/playwright/${candidate}/${type}-identity.json`,
    schemaVersion: identity.schemaVersion,
    aggregateSha256: identity.aggregateSha256,
    fileCount: identity.fileCount,
    totalBytes: identity.totalBytes,
    status: "recorded",
  };
}

function validateStoredSourceIdentity(identity, candidate) {
  if (
    !identity ||
    typeof identity !== "object" ||
    Array.isArray(identity) ||
    identity.schemaVersion !== 2 ||
    identity.candidate !== candidate ||
    !sha256(identity.aggregateSha256) ||
    !positiveInteger(identity.fileCount) ||
    !nonNegativeInteger(identity.totalBytes) ||
    !Array.isArray(identity.files) ||
    identity.files.length !== identity.fileCount
  ) {
    throw new Error("Stored source identity is invalid.");
  }
}

function validateIdentityBinding(binding, candidate, type, schemaVersion) {
  if (
    !binding ||
    typeof binding !== "object" ||
    Array.isArray(binding) ||
    binding.inventoryPath !==
      `output/playwright/${candidate}/${type}-identity.json` ||
    binding.schemaVersion !== schemaVersion ||
    !sha256(binding.aggregateSha256) ||
    !positiveInteger(binding.fileCount) ||
    !nonNegativeInteger(binding.totalBytes) ||
    binding.status !== "recorded"
  ) {
    throw new Error(`Functional QA ${type} identity binding is invalid.`);
  }
}

function validateOrderedRecords(actual, expected, actualKey, expectedKey, label) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((record, index) => actualKey(record) !== expectedKey(expected[index]))
  ) {
    throw new Error(`Functional QA completion ledger must contain ordered ${label}.`);
  }
}

function assertEligibleLedger(ledger, candidate) {
  const verification = ledger.verification;
  if (
    verification.status !== "passed" ||
    !positiveInteger(verification.tests) ||
    verification.passed !== verification.tests ||
    verification.failed !== 0 ||
    verification.cancelled !== 0 ||
    verification.skipped !== 0 ||
    verification.todo !== 0 ||
    !nonNegativeNumber(verification.durationMs)
  ) {
    throw new Error("Eligible Functional QA ledger requires green zero-omission verification.");
  }
  assertEvidenceArray(verification.evidencePaths, candidate, false);

  for (const viewport of ledger.requiredViewports) {
    if (
      viewport.functionalResult !== "passed" ||
      viewport.visualResult !== "passed" ||
      viewport.manualReviewResult !== "passed"
    ) {
      throw new Error("Eligible Functional QA ledger requires every viewport review to pass.");
    }
    assertEvidenceArray(viewport.evidencePaths, candidate, false);
  }
  for (const scenario of ledger.fixtureScenarios) {
    if (scenario.functionalResult !== "passed" || scenario.visualResult !== "passed") {
      throw new Error("Eligible Functional QA ledger requires every fixture scenario to pass.");
    }
    assertEvidenceArray(scenario.evidencePaths, candidate, false);
  }
  for (const scenario of ledger.acceptanceScenarios) {
    if (
      scenario.automatedResult !== "passed" ||
      scenario.browserFunctionalResult !== "passed" ||
      scenario.browserVisualResult !== "passed" ||
      scenario.manualReviewResult !== "passed" ||
      scenario.blockerIds.length !== 0
    ) {
      throw new Error(`Eligible Functional QA ledger requires Scenario ${scenario.id} to pass.`);
    }
    const allowedExternal =
      scenario.externalDependencyResult === "passed" ||
      scenario.externalDependencyResult === "not_applicable" ||
      (scenario.id === "H" &&
        scenario.externalDependencyResult ===
          FUNCTIONAL_QA_H_EXTERNAL_ACTIVATION_PENDING);
    if (!allowedExternal) {
      throw new Error(
        `Eligible Functional QA ledger has invalid external status for Scenario ${scenario.id}.`,
      );
    }
    assertEvidenceArray(scenario.evidencePaths, candidate, false);
  }
  const review = ledger.browserReview;
  if (
    review.consoleErrorCount !== 0 ||
    review.failedNetworkRequestCount !== 0 ||
    review.keyboardResult !== "passed" ||
    review.touchEquivalentResult !== "passed" ||
    review.reducedMotionResult !== "passed" ||
    review.reflowAndOverflowResult !== "passed" ||
    review.manualVisualResult !== "passed" ||
    typeof review.visualReviewer !== "string" ||
    !review.visualReviewer.trim()
  ) {
    throw new Error("Eligible Functional QA ledger requires complete clean browser review.");
  }
  assertEvidenceArray(review.evidencePaths, candidate, false);
  if (
    typeof ledger.completionEligibility.reason !== "string" ||
    !ledger.completionEligibility.reason.trim()
  ) {
    throw new Error("Eligible Functional QA ledger requires a recorded eligibility reason.");
  }
}

async function assertCurrentIdentities(storedSource, storedBuild) {
  const [currentSource, currentBuild] = await Promise.all([
    buildSourceIdentity({ projectRoot: PROJECT_ROOT }),
    buildArtifactIdentity({ projectRoot: PROJECT_ROOT }),
  ]);
  for (const [label, stored, current] of [
    ["source", storedSource, currentSource],
    ["build", storedBuild, currentBuild],
  ]) {
    if (
      stored.aggregateSha256 !== current.aggregateSha256 ||
      stored.fileCount !== current.fileCount ||
      stored.totalBytes !== current.totalBytes
    ) {
      throw new Error(`Exact-candidate ${label} identity drifted; use a new candidate.`);
    }
  }
}

function assertLedgerIdentityMatch(ledger, sourceIdentity, buildIdentity) {
  for (const [binding, identity, label] of [
    [ledger.sourceIdentity, sourceIdentity, "source"],
    [ledger.buildIdentity, buildIdentity, "build"],
  ]) {
    if (
      binding.aggregateSha256 !== identity.aggregateSha256 ||
      binding.fileCount !== identity.fileCount ||
      binding.totalBytes !== identity.totalBytes
    ) {
      throw new Error(`Functional QA ledger ${label} identity does not match inventory.`);
    }
  }
}

function assertEvidenceArray(paths, candidate, allowEmpty) {
  if (!Array.isArray(paths) || (!allowEmpty && paths.length === 0)) {
    throw new Error("Functional QA evidence arrays must be nonempty for eligibility.");
  }
  const prefix = `output/playwright/${candidate}/`;
  for (const path of paths) {
    if (
      typeof path !== "string" ||
      !path.startsWith(prefix) ||
      path.includes("\\") ||
      /[\0-\x1f\x7f]/.test(path) ||
      path.split("/").some((segment) => !segment || segment === "." || segment === "..")
    ) {
      throw new Error("Functional QA evidence path is not candidate-scoped and path-safe.");
    }
  }
}

async function assertSafeCandidateDirectory(outputRoot, candidateDirectory) {
  for (const directory of [outputRoot, candidateDirectory]) {
    const relation = relative(REPOSITORY_ROOT, directory);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
      throw new Error("Functional QA ledger directory escaped the repository root.");
    }
    const metadata = await lstat(directory).catch(() => null);
    if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Functional QA ledger directory is missing or unsafe.");
    }
  }
}

async function readRegularJson(path, label) {
  const metadata = await lstat(path).catch(() => null);
  if (!metadata?.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Functional QA ${label} is missing or unsafe.`);
  }
  return JSON.parse(await readFile(path, "utf8"));
}

function assertOutputRoot(outputRoot) {
  const relation = relative(REPOSITORY_ROOT, outputRoot);
  if (
    relation.replaceAll("\\", "/") !== "output/playwright" ||
    resolve(REPOSITORY_ROOT, relation) !== outputRoot
  ) {
    throw new Error("Functional QA evidence must be written to repository output/playwright.");
  }
}

function sha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function nonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!["--candidate", "--output-root"].includes(name)) {
      throw new Error(`Unknown argument: ${name}`);
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`${name} requires a value.`);
    values.set(name, value);
    index += 1;
  }
  return {
    candidateId: values.get("--candidate"),
    outputRoot: values.get("--output-root") ?? DEFAULT_OUTPUT_ROOT,
  };
}

async function main() {
  const result = await writeFunctionalQaCandidateLedger(
    parseArguments(process.argv.slice(2)),
  );
  process.stdout.write(
    `${result.created ? "Created" : "Using"} functional QA completion ledger: ${
      result.ledgerPath
    }\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
