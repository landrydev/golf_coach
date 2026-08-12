import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";

export const PRIVATE_SUCCESSOR_PROFILE = "private_successor_preflight";
export const PRIVATE_SUCCESSOR_CONTRACT_VERSION = 2;
export const PRIVATE_SUCCESSOR_MANIFEST_PATH =
  ".work/private-successor-preflight/manifest.json";

export const PRIVATE_SUCCESSOR_EXPECTED_MIGRATION_TAGS = deepFreeze([
  "0000_nappy_inertia",
  "0001_sour_pete_wisdom",
  "0002_nifty_lord_tyger",
  "0003_condemned_brood",
  "0004_grey_ikaris",
  "0005_cultured_marrow",
  "0006_nervous_dragon_man",
  "0007_fearless_valeria_richards",
  "0008_reflective_mystique",
  "0009_cultured_namora",
  "0010_steep_hemingway",
  "0011_stormy_shard",
  "0012_giant_rockslide",
  "0013_mature_alex_power",
  "0014_easy_electro",
  "0015_freezing_puma",
  "0016_handy_green_goblin",
]);

export const PREFLIGHT_BLOCKER_IDS = deepFreeze({
  containment: {
    cliInput: "CONTAINMENT_CLI_INPUT_REJECTED",
    credentialEnvironment: "CONTAINMENT_CREDENTIAL_ENVIRONMENT_REJECTED",
    configurationShape: "CONTAINMENT_CONFIGURATION_SHAPE_INVALID",
    outputBoundary: "CONTAINMENT_OUTPUT_BOUNDARY_INVALID",
  },
  local: {
    preflightManifest: "LOCAL_PREFLIGHT_MANIFEST_MISSING_OR_INVALID",
    migrationInventory: "LOCAL_PACKAGED_MIGRATION_INVENTORY_INVALID",
    migrationParity: "LOCAL_PACKAGED_MIGRATION_PARITY_FAILED",
    migrationApply: "LOCAL_D1_MIGRATION_APPLY_FAILED",
    migration0011: "LOCAL_D1_MIGRATION_0011_STRUCTURE_FAILED",
    foreignKeys: "LOCAL_D1_FOREIGN_KEY_CHECK_FAILED",
  },
  provider: {
    account: "PROVIDER_ACCOUNT_BINDING_UNPROVEN",
    database: "PROVIDER_DATABASE_BINDING_UNPROVEN",
    media: "PROVIDER_MEDIA_STORAGE_BINDING_UNPROVEN",
    identity: "PROVIDER_OIDC_BINDING_UNPROVEN",
    domain: "PROVIDER_DOMAIN_TLS_BINDING_UNPROVEN",
    secrets: "PROVIDER_SECRET_PROVISIONING_UNPROVEN",
    observability: "PROVIDER_LOG_RETENTION_AND_ALERTING_UNPROVEN",
  },
  release: {
    recovery: "RELEASE_BACKUP_RESTORE_EXERCISE_MISSING",
    hostedJourney: "RELEASE_HOSTED_CONTROLLED_JOURNEY_MISSING",
    accessibility: "RELEASE_HOSTED_ACCESSIBILITY_REVIEW_MISSING",
    acceptance: "RELEASE_OWNER_EXACT_VERSION_ACCEPTANCE_MISSING",
  },
});

const FIXED_NON_SECRET_VALUES = deepFreeze({
  APPLICATION_WRITE_MODE: "frozen",
  BILLING_CHECKOUT_ENABLED: "false",
  INSTRUCTOR_ACCESS_MODE: "owner_private",
  INSTRUCTOR_AUTH_MODE: "oidc_v1",
  OIDC_ID_TOKEN_SIGNING_ALG: "RS256",
  OIDC_TOKEN_ENDPOINT_AUTH_METHOD: "client_secret_basic",
});

const SUPPLIED_NON_SECRET_RULES = deepFreeze({
  APP_URL: "canonical_public_https_origin",
  AUTH_SESSION_LIFETIME_SECONDS: "integer_900_through_86400",
  CONSENT_POLICY_REGISTRY_JSON:
    "runtime_validated_required_consent_policy_registry",
  OIDC_CLIENT_ID: "visible_ascii_public_client_identifier",
  OIDC_ISSUER: "canonical_public_https_issuer",
  RELEASE_ID: "immutable_normalized_release_identifier",
});

export const PRIVATE_SUCCESSOR_NON_SECRET_VARIABLES = deepFreeze(
  [...Object.keys(FIXED_NON_SECRET_VALUES), ...Object.keys(SUPPLIED_NON_SECRET_RULES)]
    .sort()
    .map((name) =>
      Object.hasOwn(FIXED_NON_SECRET_VALUES, name)
        ? { name, source: "fixed", exactValue: FIXED_NON_SECRET_VALUES[name] }
        : { name, source: "operator_bound_non_secret", rule: SUPPLIED_NON_SECRET_RULES[name] },
    ),
);

export const PRIVATE_SUCCESSOR_EXPECTED_SECRET_NAMES = deepFreeze(
  [
    "ABUSE_LIMIT_PEPPER",
    "AUTH_SESSION_PEPPER",
    "AUTH_TRANSACTION_ENCRYPTION_KEY",
    "DATA_REQUEST_OPERATOR_ACCESS_PEPPER",
    "DATA_REQUEST_OPERATOR_EMAIL_DIGESTS",
    "OIDC_CLIENT_SECRET",
    "OWNER_PRIVATE_ACCESS_PEPPER",
    "OWNER_PRIVATE_EMAIL_DIGESTS",
    "SHARE_TOKEN_PEPPER",
  ].sort(),
);

export const PRIVATE_SUCCESSOR_FORBIDDEN_SECRET_NAMES = deepFreeze(
  [
    "SITES_BYPASS_BEARER",
    "SIWC_BYPASS_BEARER",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ].sort(),
);

const REJECTED_AMBIENT_CREDENTIAL_NAMES = new Set([
  "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_REMOTE",
  "CLOUDFLARE_EMAIL",
  "CF_API_KEY",
  "CF_API_TOKEN",
  "D1_REMOTE",
  "MINIFLARE_REMOTE",
  "R2_REMOTE",
  "WRANGLER_API_TOKEN",
  "WRANGLER_REMOTE",
  ...PRIVATE_SUCCESSOR_EXPECTED_SECRET_NAMES,
  ...PRIVATE_SUCCESSOR_FORBIDDEN_SECRET_NAMES,
]);

const EXPECTED_NON_SECRET_NAMES = PRIVATE_SUCCESSOR_NON_SECRET_VARIABLES.map(
  ({ name }) => name,
);

const CONSENT_PURPOSES = new Set([
  "terms",
  "privacy_notice",
  "golfer_record",
  "roadmap_sharing",
  "media_use",
  "service_email",
  "optional_analytics",
]);
const CONSENT_SUBJECT_TYPES = new Set(["account", "golfer"]);
const CONSENT_ENTRY_KEYS = ["purposeDescription", "subjectTypes", "version"];
const CONSENT_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

export class DirectPreflightContractError extends Error {
  constructor(blockerId, message) {
    super(message);
    this.name = "DirectPreflightContractError";
    this.blockerId = blockerId;
  }
}

/**
 * The executable preflight has no CLI configuration surface. Provider/resource
 * values belong to a later reviewed integration; secrets never belong here.
 */
export function assertLocalOnlyPreflightInvocation({
  argumentsList = [],
  environmentNames = [],
} = {}) {
  if (!Array.isArray(argumentsList) || argumentsList.length !== 0) {
    throw contractError(
      PREFLIGHT_BLOCKER_IDS.containment.cliInput,
      "The local D1 preflight accepts no command-line inputs.",
    );
  }
  if (!Array.isArray(environmentNames)) {
    throw contractError(
      PREFLIGHT_BLOCKER_IDS.containment.credentialEnvironment,
      "The local D1 preflight environment-name inventory is invalid.",
    );
  }
  if (
    environmentNames.some(
      (name) => typeof name !== "string" || REJECTED_AMBIENT_CREDENTIAL_NAMES.has(name),
    )
  ) {
    throw contractError(
      PREFLIGHT_BLOCKER_IDS.containment.credentialEnvironment,
      "The local D1 preflight refuses provider or runtime credential variables.",
    );
  }
  return Object.freeze({ localOnly: true, acceptedCliInputs: 0 });
}

/**
 * Validate an exact, provider-independent runtime variable set. The return value
 * contains names, fixed public values, and hashes only; supplied values are never
 * copied into an evidence manifest.
 */
export function validatePrivateSuccessorNonSecretVariables(variables) {
  if (!isPlainRecord(variables)) {
    throw invalidConfiguration();
  }
  const actualNames = Object.keys(variables).sort();
  if (!sameStrings(actualNames, EXPECTED_NON_SECRET_NAMES)) {
    throw invalidConfiguration();
  }
  if (
    actualNames.some(
      (name) =>
        PRIVATE_SUCCESSOR_EXPECTED_SECRET_NAMES.includes(name) ||
        PRIVATE_SUCCESSOR_FORBIDDEN_SECRET_NAMES.includes(name),
    )
  ) {
    throw invalidConfiguration();
  }
  for (const name of actualNames) {
    if (typeof variables[name] !== "string" || variables[name] !== variables[name].trim()) {
      throw invalidConfiguration();
    }
  }
  for (const [name, expected] of Object.entries(FIXED_NON_SECRET_VALUES)) {
    if (variables[name] !== expected) throw invalidConfiguration();
  }
  assertCanonicalPublicOrigin(variables.APP_URL);
  assertCanonicalPublicIssuer(variables.OIDC_ISSUER);
  if (!/^[\x21-\x7e]{1,256}$/.test(variables.OIDC_CLIENT_ID)) {
    throw invalidConfiguration();
  }
  if (
    !/^[1-9][0-9]*$/.test(variables.AUTH_SESSION_LIFETIME_SECONDS) ||
    Number(variables.AUTH_SESSION_LIFETIME_SECONDS) < 900 ||
    Number(variables.AUTH_SESSION_LIFETIME_SECONDS) > 86_400
  ) {
    throw invalidConfiguration();
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(variables.RELEASE_ID) ||
    ["unversioned", "invalid_release_id"].includes(variables.RELEASE_ID)
  ) {
    throw invalidConfiguration();
  }
  validateRequiredConsentPolicyRegistryJson(
    variables.CONSENT_POLICY_REGISTRY_JSON,
  );

  const suppliedValueHashes = Object.fromEntries(
    Object.keys(SUPPLIED_NON_SECRET_RULES)
      .sort()
      .map((name) => [name, sha256(variables[name])]),
  );
  return deepFreeze({
    variableNames: actualNames,
    fixedValues: { ...FIXED_NON_SECRET_VALUES },
    suppliedValueHashes,
    configurationSha256: sha256(canonicalJson(variables)),
  });
}

/**
 * Mirror the runtime consent parser's exact public configuration boundary and
 * additionally require the two policies needed by bounded V1 readiness. The
 * returned evidence contains purpose names and a hash only, never policy copy.
 */
export function validateRequiredConsentPolicyRegistryJson(value) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    Buffer.byteLength(value, "utf8") > 16 * 1024
  ) {
    throw invalidConfiguration();
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalidConfiguration();
  }
  if (!isPlainRecord(parsed)) throw invalidConfiguration();

  for (const [purpose, entry] of Object.entries(parsed)) {
    if (
      !CONSENT_PURPOSES.has(purpose) ||
      !hasExactKeys(entry, CONSENT_ENTRY_KEYS) ||
      typeof entry.version !== "string" ||
      !CONSENT_VERSION_PATTERN.test(entry.version) ||
      typeof entry.purposeDescription !== "string" ||
      entry.purposeDescription !== entry.purposeDescription.trim() ||
      entry.purposeDescription.length < 1 ||
      entry.purposeDescription.length > 500 ||
      /[\u0000-\u001f\u007f]/u.test(entry.purposeDescription) ||
      !Array.isArray(entry.subjectTypes) ||
      entry.subjectTypes.length < 1 ||
      entry.subjectTypes.length > CONSENT_SUBJECT_TYPES.size ||
      entry.subjectTypes.some(
        (subjectType) =>
          typeof subjectType !== "string" ||
          !CONSENT_SUBJECT_TYPES.has(subjectType),
      ) ||
      new Set(entry.subjectTypes).size !== entry.subjectTypes.length
    ) {
      throw invalidConfiguration();
    }
  }

  if (
    !parsed.golfer_record?.subjectTypes.includes("account") ||
    !parsed.roadmap_sharing?.subjectTypes.includes("golfer")
  ) {
    throw invalidConfiguration();
  }
  return deepFreeze({
    configuredPurposes: Object.keys(parsed).sort(),
    requiredPoliciesReady: true,
    registrySha256: sha256(value),
  });
}

export function privateSuccessorContractDescriptor() {
  return deepFreeze({
    contractId: PRIVATE_SUCCESSOR_PROFILE,
    contractVersion: PRIVATE_SUCCESSOR_CONTRACT_VERSION,
    requiredNonSecretVariables: PRIVATE_SUCCESSOR_NON_SECRET_VARIABLES,
    expectedSecretNames: PRIVATE_SUCCESSOR_EXPECTED_SECRET_NAMES,
    forbiddenSecretNames: PRIVATE_SUCCESSOR_FORBIDDEN_SECRET_NAMES,
    localExecution: {
      cliInputs: "none",
      providerCredentials: "rejected_by_name_without_reading_values",
      remoteOperations: "prohibited",
      networkOperations: "prohibited",
    },
    containmentProfile: {
      applicationWrites: "frozen",
      billingCheckout: "disabled",
      instructorAccess: "owner_private",
      publicExposure: "prohibited_until_provider_and_release_readiness",
    },
    migrationContract: {
      dialect: "sqlite",
      exactTags: PRIVATE_SUCCESSOR_EXPECTED_MIGRATION_TAGS,
      latestTag: PRIVATE_SUCCESSOR_EXPECTED_MIGRATION_TAGS.at(-1),
    },
  });
}

export function buildPrivateSuccessorReadiness({
  containmentBlockers = [],
  localBlockers = [],
} = {}) {
  assertKnownBlockers(containmentBlockers, "containment");
  assertKnownBlockers(localBlockers, "local");
  const providerBlockers = sortedValues(PREFLIGHT_BLOCKER_IDS.provider);
  const releaseBlockers = sortedValues(PREFLIGHT_BLOCKER_IDS.release);
  return deepFreeze({
    containment: stage(containmentBlockers),
    local: stage(localBlockers),
    provider: stage(providerBlockers),
    release: {
      ...stage(releaseBlockers),
      dependsOn: ["containment", "local", "provider"],
    },
  });
}

/**
 * Create a deterministic, value-safe chain: contract -> migration set ->
 * readiness. No runtime value, credential value, absolute path, or raw SQL is
 * admitted to the manifest.
 */
export function buildPrivateSuccessorManifest({ migrationInventory, readiness }) {
  assertSafeMigrationInventory(migrationInventory);
  assertReadinessShape(readiness);
  const descriptor = privateSuccessorContractDescriptor();
  const contractSha256 = sha256(canonicalJson(descriptor));
  const migrationPayload = {
    previousSha256: contractSha256,
    files: migrationInventory.map(({ relativePath, bytes, sha256: digest }) => ({
      relativePath,
      bytes,
      sha256: digest,
    })),
  };
  const migrationSha256 = sha256(canonicalJson(migrationPayload));
  const readinessPayload = {
    previousSha256: migrationSha256,
    stages: readiness,
  };
  const readinessSha256 = sha256(canonicalJson(readinessPayload));
  const body = {
    schemaVersion: 1,
    profile: PRIVATE_SUCCESSOR_PROFILE,
    contract: { sha256: contractSha256, descriptor },
    migrations: { ...migrationPayload, sha256: migrationSha256 },
    readiness: { ...readinessPayload, sha256: readinessSha256 },
  };
  return deepFreeze({
    ...body,
    manifestSha256: sha256(canonicalJson(body)),
  });
}

export async function writePrivateSuccessorManifest({
  projectRoot = process.cwd(),
  manifest,
} = {}) {
  const root = path.resolve(projectRoot);
  const outputPath = path.join(
    root,
    ...PRIVATE_SUCCESSOR_MANIFEST_PATH.split("/"),
  );
  await assertIgnoredManifestBoundary(root, outputPath);
  assertManifestHashChain(manifest);
  await assertManifestInventoryMatchesProject(root, manifest.migrations.files);
  const outputDirectory = path.dirname(outputPath);
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(
    outputDirectory,
    `.manifest-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rm(outputPath, { force: true });
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return outputPath;
}

/** Read and independently re-verify the exact local-only preflight evidence. */
export async function loadVerifiedPrivateSuccessorManifest({
  projectRoot = process.cwd(),
} = {}) {
  const root = path.resolve(projectRoot);
  const outputPath = path.join(
    root,
    ...PRIVATE_SUCCESSOR_MANIFEST_PATH.split("/"),
  );
  await assertIgnoredManifestBoundary(root, outputPath);
  const details = await lstat(outputPath).catch(() => null);
  if (!details?.isFile() || details.isSymbolicLink()) {
    throw contractError(
      PREFLIGHT_BLOCKER_IDS.local.preflightManifest,
      "The exact local preflight manifest is missing or unsafe.",
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(outputPath, "utf8"));
  } catch {
    throw contractError(
      PREFLIGHT_BLOCKER_IDS.local.preflightManifest,
      "The exact local preflight manifest is missing or unsafe.",
    );
  }
  assertManifestHashChain(manifest);
  await assertManifestInventoryMatchesProject(root, manifest.migrations.files);
  deepFreeze(manifest);
  return Object.freeze({
    outputPath,
    manifest,
    manifestSha256: manifest.manifestSha256,
    containmentReady: manifest.readiness.stages.containment.ready,
    localReady: manifest.readiness.stages.local.ready,
    operationsProfileReady:
      manifest.readiness.stages.containment.ready &&
      manifest.readiness.stages.local.ready,
  });
}

export function assertManifestHashChain(manifest) {
  if (
    !hasExactKeys(manifest, [
      "schemaVersion",
      "profile",
      "contract",
      "migrations",
      "readiness",
      "manifestSha256",
    ]) ||
    manifest.schemaVersion !== 1 ||
    manifest.profile !== PRIVATE_SUCCESSOR_PROFILE ||
    !hasExactKeys(manifest.contract, ["sha256", "descriptor"]) ||
    canonicalJson(manifest.contract.descriptor) !==
      canonicalJson(privateSuccessorContractDescriptor()) ||
    !hasExactKeys(manifest.migrations, [
      "previousSha256",
      "files",
      "sha256",
    ]) ||
    !hasExactKeys(manifest.readiness, [
      "previousSha256",
      "stages",
      "sha256",
    ])
  ) {
    throw invalidOutputBoundary();
  }
  assertSafeMigrationInventory(manifest.migrations.files);
  assertPrivateSuccessorReadinessSemantics(manifest.readiness.stages);
  const { manifestSha256, ...body } = manifest;
  const expectedContract = sha256(canonicalJson(manifest.contract?.descriptor));
  const { sha256: migrationDigest, ...migrationPayload } = manifest.migrations ?? {};
  const { sha256: readinessDigest, ...readinessPayload } = manifest.readiness ?? {};
  if (
    manifest.contract?.sha256 !== expectedContract ||
    migrationPayload.previousSha256 !== expectedContract ||
    migrationDigest !== sha256(canonicalJson(migrationPayload)) ||
    readinessPayload.previousSha256 !== migrationDigest ||
    readinessDigest !== sha256(canonicalJson(readinessPayload)) ||
    manifestSha256 !== sha256(canonicalJson(body))
  ) {
    throw invalidOutputBoundary();
  }
  return true;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function assertIgnoredManifestBoundary(root, outputPath) {
  const expected = path.resolve(
    root,
    ".work",
    "private-successor-preflight",
    "manifest.json",
  );
  if (outputPath !== expected) throw invalidOutputBoundary();
  const ignoreFile = await readFile(path.join(root, ".gitignore"), "utf8").catch(
    () => "",
  );
  const ignoresWork = ignoreFile
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => ["/.work/", ".work/", "/.work/**", ".work/**"].includes(line));
  if (!ignoresWork) throw invalidOutputBoundary();
  const workPath = path.join(root, ".work");
  const details = await lstat(workPath).catch(() => null);
  if (details?.isSymbolicLink() || (details && !details.isDirectory())) {
    throw invalidOutputBoundary();
  }
}

function assertCanonicalPublicOrigin(value) {
  let candidate;
  try {
    candidate = new URL(value);
  } catch {
    throw invalidConfiguration();
  }
  if (
    candidate.protocol !== "https:" ||
    candidate.username ||
    candidate.password ||
    candidate.port ||
    candidate.pathname !== "/" ||
    candidate.search ||
    candidate.hash ||
    candidate.hostname === "localhost" ||
    !candidate.hostname.includes(".") ||
    isIP(candidate.hostname) !== 0 ||
    candidate.origin !== value
  ) {
    throw invalidConfiguration();
  }
}

function assertCanonicalPublicIssuer(value) {
  let candidate;
  try {
    candidate = new URL(value);
  } catch {
    throw invalidConfiguration();
  }
  if (
    candidate.protocol !== "https:" ||
    candidate.username ||
    candidate.password ||
    candidate.port ||
    candidate.search ||
    candidate.hash ||
    candidate.hostname === "localhost" ||
    !candidate.hostname.includes(".") ||
    isIP(candidate.hostname) !== 0 ||
    candidate.pathname.includes("//") ||
    (candidate.pathname !== "/" && candidate.pathname.endsWith("/")) ||
    value !==
      (candidate.pathname === "/"
        ? candidate.origin
        : `${candidate.origin}${candidate.pathname}`)
  ) {
    throw invalidConfiguration();
  }
}

function assertSafeMigrationInventory(inventory) {
  if (!Array.isArray(inventory) || inventory.length === 0) {
    throw contractError(
      PREFLIGHT_BLOCKER_IDS.local.migrationInventory,
      "The packaged migration inventory is invalid.",
    );
  }
  let previous = "";
  for (const item of inventory) {
    if (
      !isPlainRecord(item) ||
      !/^(?:[0-9]{4}_[A-Za-z0-9_]+\.sql|meta\/(?:_journal|[0-9]{4}_snapshot)\.json)$/.test(
        item.relativePath,
      ) ||
      item.relativePath <= previous ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 1 ||
      !/^[0-9a-f]{64}$/.test(item.sha256)
    ) {
      throw contractError(
        PREFLIGHT_BLOCKER_IDS.local.migrationInventory,
        "The packaged migration inventory is invalid.",
      );
    }
    previous = item.relativePath;
  }
  const expectedPaths = [
    ...PRIVATE_SUCCESSOR_EXPECTED_MIGRATION_TAGS.map((tag) => `${tag}.sql`),
    ...PRIVATE_SUCCESSOR_EXPECTED_MIGRATION_TAGS.map(
      (_tag, index) => `meta/${String(index).padStart(4, "0")}_snapshot.json`,
    ),
    "meta/_journal.json",
  ].sort();
  if (!sameStrings(inventory.map(({ relativePath }) => relativePath), expectedPaths)) {
    throw contractError(
      PREFLIGHT_BLOCKER_IDS.local.migrationInventory,
      "The packaged migration inventory is invalid.",
    );
  }
}

async function assertManifestInventoryMatchesProject(root, expectedInventory) {
  const expectedByPath = new Map(
    expectedInventory.map((item) => [item.relativePath, item]),
  );
  for (const migrationRoot of [
    path.join(root, "drizzle"),
    path.join(root, "dist", ".openai", "drizzle"),
  ]) {
    const rootDetails = await lstat(migrationRoot).catch(() => null);
    if (!rootDetails?.isDirectory() || rootDetails.isSymbolicLink()) {
      throw contractError(
        PREFLIGHT_BLOCKER_IDS.local.migrationParity,
        "Manifest migrations do not match the exact source and package.",
      );
    }
    const actualPaths = [];
    await inspectMigrationDirectory(migrationRoot, migrationRoot, actualPaths);
    actualPaths.sort();
    if (!sameStrings(actualPaths, [...expectedByPath.keys()])) {
      throw contractError(
        PREFLIGHT_BLOCKER_IDS.local.migrationParity,
        "Manifest migrations do not match the exact source and package.",
      );
    }
    for (const relativePath of actualPaths) {
      const contents = await readFile(
        path.join(migrationRoot, ...relativePath.split("/")),
      );
      const expected = expectedByPath.get(relativePath);
      if (
        contents.byteLength !== expected.bytes ||
        sha256(contents) !== expected.sha256
      ) {
        throw contractError(
          PREFLIGHT_BLOCKER_IDS.local.migrationParity,
          "Manifest migrations do not match the exact source and package.",
        );
      }
    }
  }
}

async function inspectMigrationDirectory(root, directory, paths) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
    if (entry.isSymbolicLink()) throw invalidOutputBoundary();
    if (entry.isDirectory()) {
      if (relativePath !== "meta") throw invalidOutputBoundary();
      await inspectMigrationDirectory(root, absolutePath, paths);
    } else if (entry.isFile()) {
      paths.push(relativePath);
    } else {
      throw invalidOutputBoundary();
    }
  }
}

function assertReadinessShape(readiness) {
  if (
    !isPlainRecord(readiness) ||
    !["containment", "local", "provider", "release"].every((name) =>
      isPlainRecord(readiness[name]),
    )
  ) {
    throw invalidOutputBoundary();
  }
}

function assertPrivateSuccessorReadinessSemantics(readiness) {
  assertReadinessShape(readiness);
  if (
    !hasExactKeys(readiness, ["containment", "local", "provider", "release"]) ||
    !validStage(readiness.containment, sortedValues(PREFLIGHT_BLOCKER_IDS.containment)) ||
    !validStage(readiness.local, sortedValues(PREFLIGHT_BLOCKER_IDS.local)) ||
    !exactBlockedStage(readiness.provider, sortedValues(PREFLIGHT_BLOCKER_IDS.provider)) ||
    !hasExactKeys(readiness.release, ["ready", "blockerIds", "dependsOn"]) ||
    !exactBlockedStage(
      { ready: readiness.release.ready, blockerIds: readiness.release.blockerIds },
      sortedValues(PREFLIGHT_BLOCKER_IDS.release),
    ) ||
    !sameStrings(readiness.release.dependsOn, ["containment", "local", "provider"])
  ) {
    throw invalidOutputBoundary();
  }
}

function validStage(stageValue, knownBlockers) {
  if (!hasExactKeys(stageValue, ["ready", "blockerIds"])) return false;
  if (
    typeof stageValue.ready !== "boolean" ||
    !Array.isArray(stageValue.blockerIds) ||
    stageValue.blockerIds.some((id) => !knownBlockers.includes(id))
  ) {
    return false;
  }
  const sortedUnique = [...new Set(stageValue.blockerIds)].sort();
  return (
    sameStrings(stageValue.blockerIds, sortedUnique) &&
    stageValue.ready === (stageValue.blockerIds.length === 0)
  );
}

function exactBlockedStage(stageValue, expectedBlockers) {
  return (
    validStage(stageValue, expectedBlockers) &&
    stageValue.ready === false &&
    sameStrings(stageValue.blockerIds, expectedBlockers)
  );
}

function assertKnownBlockers(blockers, stageName) {
  if (
    !Array.isArray(blockers) ||
    blockers.some(
      (blocker) => !Object.values(PREFLIGHT_BLOCKER_IDS[stageName]).includes(blocker),
    )
  ) {
    throw invalidOutputBoundary();
  }
}

function stage(blockers) {
  const normalized = [...new Set(blockers)].sort();
  return { ready: normalized.length === 0, blockerIds: normalized };
}

function sortedValues(record) {
  return Object.values(record).sort();
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function isPlainRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasExactKeys(value, expectedKeys) {
  return (
    isPlainRecord(value) &&
    sameStrings(Object.keys(value).sort(), [...expectedKeys].sort())
  );
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function invalidConfiguration() {
  return contractError(
    PREFLIGHT_BLOCKER_IDS.containment.configurationShape,
    "The private-successor non-secret configuration is invalid.",
  );
}

function invalidOutputBoundary() {
  return contractError(
    PREFLIGHT_BLOCKER_IDS.containment.outputBoundary,
    "The private-successor manifest boundary is invalid.",
  );
}

function contractError(blockerId, message) {
  return new DirectPreflightContractError(blockerId, message);
}
