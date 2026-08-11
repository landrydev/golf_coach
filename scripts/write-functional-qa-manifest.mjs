import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FUNCTIONAL_QA_SCENARIOS } from "./functional-qa-fixtures.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), "..");
const repositoryRoot = resolve(projectRoot, "..");
const defaultOutputRoot = resolve(repositoryRoot, "output/playwright");

export const FUNCTIONAL_QA_ACCEPTANCE_SCENARIOS = Object.freeze([
  { id: "A", label: "First self-serve roadmap" },
  { id: "B", label: "Swing-video evidence" },
  { id: "C", label: "Practice-drill reuse" },
  { id: "D", label: "Launch-monitor import and comparison" },
  { id: "E", label: "Living journey and phase transition" },
  { id: "F", label: "Return and management" },
  { id: "G", label: "Golfer mobile and print experience" },
  { id: "H", label: "SaaS billing in test mode" },
]);

export function createFunctionalQaCandidateManifest({
  candidateId,
  origin = "http://127.0.0.1:4175",
  createdAt = new Date(),
}) {
  const normalizedCandidateId = validCandidateId(candidateId);
  const normalizedOrigin = validLoopbackOrigin(origin);
  return Object.freeze({
    schemaVersion: 2,
    evidenceClass: "EXACT-FINAL-CANDIDATE LOCAL SYNTHETIC BROWSER QA",
    candidateId: normalizedCandidateId,
    createdAt: createdAt.toISOString(),
    sourceIdentity: {
      inventoryPath: `output/playwright/${normalizedCandidateId}/source-identity.json`,
      schemaVersion: null,
      aggregateSha256: null,
      fileCount: null,
      totalBytes: null,
      exactCommitOrArchive: null,
      releaseId: null,
      status: "RECORD BEFORE CLAIMING EXACT-CANDIDATE EVIDENCE",
    },
    server: {
      command: "npm run qa:functional:server",
      origin: normalizedOrigin,
      scenarioCatalogue: `${normalizedOrigin}/__qa/scenarios`,
    },
    playwright: {
      command: "npm run qa:playwright -- -CandidateId <candidate> -Session <session> <command>",
      mode: "CLI-first; no Playwright test specs",
      artifactDirectory: `output/playwright/${normalizedCandidateId}`,
    },
    verification: {
      command: "npm run verify",
      status: "not_recorded",
      tests: null,
      passed: null,
      failed: null,
      skipped: null,
      todo: null,
      durationMs: null,
    },
    requiredViewports: [
      { width: 320, height: 844 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 1000 },
    ],
    requiredSurfaces: [
      "landing",
      "onboarding",
      "dashboard",
      "authoring",
      "golfer-hub",
      "media",
      "launch-data-import",
      "drill-library-and-assignment",
      "share-centre",
      "golfer-roadmap",
    ],
    requiredStates: [
      "short",
      "long",
      "empty",
      "loading",
      "partial",
      "error",
      "recovery",
      "expired",
      "revoked",
      "republished",
    ],
    scenarios: FUNCTIONAL_QA_SCENARIOS.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      appEntry: `${normalizedOrigin}/__qa/${scenario.id}/app`,
      golferEntry: scenario.hasGolferEntry
        ? `${normalizedOrigin}/__qa/${scenario.id}/golfer`
        : null,
      oldGolferEntry: scenario.hasOldGolferEntry
        ? `${normalizedOrigin}/__qa/${scenario.id}/old-golfer`
        : null,
      functionalResult: "not_recorded",
      visualResult: "not_recorded",
      artifactPaths: [],
      notes: [],
    })),
    acceptanceScenarios: FUNCTIONAL_QA_ACCEPTANCE_SCENARIOS.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      automatedResult: "not_recorded",
      browserFunctionalResult: "not_recorded",
      browserVisualResult: "not_recorded",
      manualReviewResult: "not_recorded",
      externalDependencyResult: "not_recorded",
      evidencePaths: [],
      blockerIds: [],
      notes: [],
    })),
    browserReview: {
      unexplainedConsoleErrors: null,
      failedNetworkRequests: null,
      keyboardReview: "not_recorded",
      touchEquivalentReview: "not_recorded",
      reducedMotionReview: "not_recorded",
      reflowAndOverflowReview: "not_recorded",
      visualReviewer: null,
    },
    completionEligibility: {
      eligible: false,
      reason:
        "Template only. Record exact source identity, verification, acceptance Scenarios A-H, every required fixture state, and reviewed artifacts before changing this value.",
    },
  });
}

export function validateFunctionalQaCandidateManifest(manifest, candidateId) {
  const normalizedCandidateId = validCandidateId(candidateId);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Functional QA manifest must be an object.");
  }
  if (
    ![1, 2].includes(manifest.schemaVersion) ||
    manifest.candidateId !== normalizedCandidateId
  ) {
    throw new Error("Functional QA manifest schema or candidateId does not match.");
  }
  if (manifest.completionEligibility?.eligible !== false) {
    throw new Error(
      "Historical Functional QA manifest schemas are read-only and never eligibility authorities.",
    );
  }
  // Schema v1 is retained only so the wrapper can recognize and preserve a
  // historical packet. Exact-candidate eligibility lives in the separately
  // identity-bound completion ledger.
  if (manifest.schemaVersion === 1) return manifest;
  const expectedInventoryPath =
    `output/playwright/${normalizedCandidateId}/source-identity.json`;
  const identity = manifest.sourceIdentity;
  if (
    !identity ||
    typeof identity !== "object" ||
    Array.isArray(identity) ||
    identity.inventoryPath !== expectedInventoryPath ||
    !nullableSha256(identity.aggregateSha256) ||
    !nullableNonNegativeInteger(identity.fileCount) ||
    !nullableNonNegativeInteger(identity.totalBytes)
  ) {
    throw new Error("Functional QA manifest source identity binding is invalid.");
  }
  if (!Array.isArray(manifest.acceptanceScenarios)) {
    throw new Error("Functional QA manifest acceptance scenarios are missing.");
  }
  const expectedIds = FUNCTIONAL_QA_ACCEPTANCE_SCENARIOS.map(({ id }) => id);
  const actualIds = manifest.acceptanceScenarios.map(({ id }) => id);
  if (
    actualIds.length !== expectedIds.length ||
    actualIds.some((id, index) => id !== expectedIds[index])
  ) {
    throw new Error("Functional QA manifest must contain ordered acceptance Scenarios A-H.");
  }
  for (const scenario of manifest.acceptanceScenarios) {
    if (
      !Array.isArray(scenario.evidencePaths) ||
      !Array.isArray(scenario.blockerIds) ||
      !Array.isArray(scenario.notes)
    ) {
      throw new Error(`Functional QA acceptance Scenario ${scenario.id} evidence is invalid.`);
    }
  }
  return manifest;
}

export async function writeFunctionalQaCandidateManifest({
  candidateId,
  origin,
  outputRoot = defaultOutputRoot,
}) {
  const normalizedCandidateId = validCandidateId(candidateId);
  const normalizedOutputRoot = resolve(outputRoot);
  assertOutputRoot(normalizedOutputRoot);
  const candidateDirectory = resolve(normalizedOutputRoot, normalizedCandidateId);
  if (!candidateDirectory.startsWith(`${normalizedOutputRoot}${sep}`)) {
    throw new Error("Candidate evidence directory escaped output/playwright.");
  }
  const manifestPath = resolve(candidateDirectory, "candidate-manifest.json");
  await mkdir(candidateDirectory, { recursive: true });

  try {
    const existing = JSON.parse(await readFile(manifestPath, "utf8"));
    validateFunctionalQaCandidateManifest(existing, normalizedCandidateId);
    return Object.freeze({ manifestPath, created: false, manifest: existing });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const manifest = createFunctionalQaCandidateManifest({
    candidateId: normalizedCandidateId,
    origin,
  });
  validateFunctionalQaCandidateManifest(manifest, normalizedCandidateId);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return Object.freeze({ manifestPath, created: true, manifest });
}

function nullableSha256(value) {
  return value === null || (typeof value === "string" && /^[0-9a-f]{64}$/.test(value));
}

function nullableNonNegativeInteger(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function validCandidateId(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value)
  ) {
    throw new Error(
      "CandidateId must contain 1 to 80 letters, digits, dots, underscores, or hyphens.",
    );
  }
  return value;
}

function validLoopbackOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Origin must be a valid loopback HTTP URL.");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Origin must be an authority-only loopback HTTP URL.");
  }
  return url.origin;
}

function assertOutputRoot(outputRoot) {
  const relativeToRepository = relative(repositoryRoot, outputRoot);
  if (
    relativeToRepository.startsWith("..") ||
    resolve(repositoryRoot, relativeToRepository) !== outputRoot ||
    relativeToRepository.replaceAll("\\", "/") !== "output/playwright"
  ) {
    throw new Error("Functional QA evidence must be written to repository output/playwright.");
  }
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!["--candidate", "--origin", "--output-root"].includes(name)) {
      throw new Error(`Unknown argument: ${name}`);
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`${name} requires a value.`);
    values.set(name, value);
    index += 1;
  }
  return {
    candidateId: values.get("--candidate"),
    origin: values.get("--origin") ?? "http://127.0.0.1:4175",
    outputRoot: values.get("--output-root") ?? defaultOutputRoot,
  };
}

async function main() {
  const result = await writeFunctionalQaCandidateManifest(
    parseArguments(process.argv.slice(2)),
  );
  process.stdout.write(
    `${result.created ? "Created" : "Using"} functional QA manifest: ${
      result.manifestPath
    }\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === scriptPath) {
  await main();
}
