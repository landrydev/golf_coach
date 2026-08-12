import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DIRECT_PUBLIC_AUTH_MODE,
  assertDirectCloudflareInputs,
  assertNoPlaceholderUuid,
  assertNoSitesOrSecretMaterial,
  directCloudflarePaths,
  prepareDirectCloudflareConfig,
} from "./render-direct-cloudflare-config.mjs";
import {
  DirectPreflightContractError,
  PREFLIGHT_BLOCKER_IDS,
  PRIVATE_SUCCESSOR_PROFILE,
  loadVerifiedPrivateSuccessorManifest,
  validatePrivateSuccessorNonSecretVariables,
} from "./direct-operations-contract.mjs";
import { executePrivateSuccessorPreflight } from "./preflight-direct-d1.mjs";

// Admission follows the Worker-level adversarial OIDC suite, not merely the
// presence of a configuration label.
export const IMPLEMENTED_DIRECT_PUBLIC_AUTH_MODES = Object.freeze(["oidc_v1"]);
export const DIRECT_PROVIDER_EVIDENCE_IMPLEMENTED = false;
export const DIRECT_HOSTED_RELEASE_EVIDENCE_IMPLEMENTED = false;

export async function inspectDirectCloudflareConfig({
  projectRoot = process.cwd(),
} = {}) {
  const paths = directCloudflarePaths(projectRoot);
  const details = await lstat(paths.outputConfig).catch(() => null);
  if (!details?.isFile() || details.isSymbolicLink()) {
    throw new Error(
      "Generated direct-Cloudflare config is missing or unsafe; render it under .work first.",
    );
  }

  const serialized = await readFile(paths.outputConfig, "utf8");
  let config;
  try {
    config = JSON.parse(serialized);
  } catch {
    throw new Error("Generated direct-Cloudflare config is malformed JSON.");
  }
  assertNoSitesOrSecretMaterial(config, "generated direct-Cloudflare config");
  assertNoPlaceholderUuid(config);

  const inputs = assertDirectCloudflareInputs({
    accountId: config.account_id,
    workerName: config.name,
    d1DatabaseName: config.d1_databases?.[0]?.database_name,
    d1DatabaseId: config.d1_databases?.[0]?.database_id,
    r2Bucket: config.r2_buckets?.[0]?.bucket_name,
    appUrl: config.vars?.APP_URL,
    oidcIssuer: config.vars?.OIDC_ISSUER,
    oidcClientId: config.vars?.OIDC_CLIENT_ID,
    authSessionLifetimeSeconds:
      config.vars?.AUTH_SESSION_LIFETIME_SECONDS,
    releaseId: config.vars?.RELEASE_ID,
    consentPolicyRegistryJson: config.vars?.CONSENT_POLICY_REGISTRY_JSON,
  });
  const { config: expected } = await prepareDirectCloudflareConfig({
    projectRoot,
    inputs,
  });
  const expectedBytes = `${JSON.stringify(expected, null, 2)}\n`;
  if (serialized !== expectedBytes) {
    throw new Error(
      "Generated direct-Cloudflare config differs from the reviewed projection of the fresh build.",
    );
  }
  validatePrivateSuccessorNonSecretVariables(config.vars);

  const publicAuthMode = config.vars?.INSTRUCTOR_AUTH_MODE;
  const publicAuthReady = IMPLEMENTED_DIRECT_PUBLIC_AUTH_MODES.includes(publicAuthMode);
  let operationsEvidence = null;
  let operationsBlockerIds = [];
  try {
    operationsEvidence = await loadVerifiedPrivateSuccessorManifest({ projectRoot });
    if (!operationsEvidence.operationsProfileReady) {
      operationsBlockerIds = [
        ...operationsEvidence.manifest.readiness.stages.containment.blockerIds,
        ...operationsEvidence.manifest.readiness.stages.local.blockerIds,
      ];
    }
  } catch (error) {
    operationsBlockerIds = [
      error instanceof DirectPreflightContractError
        ? error.blockerId
        : PREFLIGHT_BLOCKER_IDS.local.preflightManifest,
    ];
  }
  const operationsProfileReady =
    operationsEvidence?.operationsProfileReady === true &&
    operationsBlockerIds.length === 0;
  const providerEvidenceReady = DIRECT_PROVIDER_EVIDENCE_IMPLEMENTED;
  const hostedReleaseEvidenceReady = DIRECT_HOSTED_RELEASE_EVIDENCE_IMPLEMENTED;
  const blockers = [];
  if (!publicAuthReady) {
    blockers.push(
      publicAuthMode === DIRECT_PUBLIC_AUTH_MODE
        ? "The exact oidc_v1 runtime and adversarial test contract has not yet been admitted by the release verifier."
        : "Direct public authentication has no exact implemented and verified mode.",
    );
  }
  if (!operationsProfileReady) {
    blockers.push(
      ...operationsBlockerIds.map(
        (id) => `${id}: The exact local private-successor preflight is not verified.`,
      ),
    );
  }
  if (!providerEvidenceReady) {
    blockers.push(
      ...Object.values(PREFLIGHT_BLOCKER_IDS.provider).map(
        (id) => `${id}: Direct provider binding and operations evidence is not recorded.`,
      ),
    );
  }
  if (!hostedReleaseEvidenceReady) {
    blockers.push(
      ...Object.values(PREFLIGHT_BLOCKER_IDS.release).map(
        (id) => `${id}: Hosted release evidence is not recorded.`,
      ),
    );
  }
  return {
    outputPath: paths.outputConfig,
    structuralReady: true,
    authBoundaryReady: publicAuthReady,
    operationsProfile: PRIVATE_SUCCESSOR_PROFILE,
    operationsProfileReady,
    operationsManifestSha256: operationsEvidence?.manifestSha256 ?? null,
    operationsBlockerIds,
    providerEvidenceReady,
    hostedReleaseEvidenceReady,
    releaseReady:
      publicAuthReady &&
      operationsProfileReady &&
      providerEvidenceReady &&
      hostedReleaseEvidenceReady,
    publicAuthMode,
    blockers,
  };
}

export async function verifyDirectCloudflareConfig({
  projectRoot = process.cwd(),
  requireReleaseReady = true,
  refreshLocalPreflight = false,
  localPreflightEnvironmentNames = Object.keys(process.env),
} = {}) {
  if (refreshLocalPreflight) {
    try {
      await executePrivateSuccessorPreflight({
        projectRoot,
        argumentsList: [],
        environmentNames: localPreflightEnvironmentNames,
        writeManifest: true,
      });
    } catch (error) {
      const blockerId =
        error instanceof DirectPreflightContractError
          ? error.blockerId
          : PREFLIGHT_BLOCKER_IDS.local.preflightManifest;
      throw new Error(`Direct local operations preflight refused: ${blockerId}.`);
    }
  }
  const report = await inspectDirectCloudflareConfig({ projectRoot });
  if (requireReleaseReady && !report.releaseReady) {
    throw new Error(
      `Direct-Cloudflare release readiness refused:\n${report.blockers
        .map((blocker) => `- ${blocker}`)
        .join("\n")}`,
    );
  }
  return report;
}

async function runCli() {
  const argumentsList = process.argv.slice(2);
  const structuralOnly = argumentsList.length === 1 && argumentsList[0] === "--structural-only";
  if (argumentsList.length > (structuralOnly ? 1 : 0)) {
    console.error("Usage: node scripts/verify-direct-cloudflare-config.mjs [--structural-only]");
    process.exitCode = 1;
    return;
  }
  try {
    const report = await verifyDirectCloudflareConfig({
      requireReleaseReady: !structuralOnly,
      refreshLocalPreflight: true,
    });
    if (structuralOnly) {
      console.log(
        report.releaseReady
          ? "Direct-Cloudflare config structure and complete release contract are locally verified."
          : report.authBoundaryReady && report.operationsProfileReady
            ? "Direct-Cloudflare local config, public auth, and operations profile are valid; release readiness remains blocked by provider and hosted evidence."
            : report.authBoundaryReady
              ? "Direct-Cloudflare config structure and public-auth boundary are valid; release readiness remains blocked by operations/policy configuration and external evidence."
              : "Direct-Cloudflare config structure is valid; release readiness remains blocked by public-auth, operations/policy, and external evidence.",
      );
    } else {
      console.log("Direct-Cloudflare config is structurally and release ready.");
    }
    return report;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return null;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await runCli();
}
