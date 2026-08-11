import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validatePrivateSuccessorNonSecretVariables } from "./direct-operations-contract.mjs";

export const DIRECT_CLOUDFLARE_OUTPUT = ".work/direct-cloudflare/wrangler.json";
export const EXPECTED_CRON = "*/5 * * * *";
export const EXPECTED_DIRECT_COMPATIBILITY_FLAGS = Object.freeze([
  "global_fetch_strictly_public",
  "nodejs_compat",
]);
export const DIRECT_PUBLIC_AUTH_MODE = "oidc_v1";
export const DIRECT_OIDC_TOKEN_ENDPOINT_AUTH_METHOD = "client_secret_basic";
export const DIRECT_OIDC_ID_TOKEN_SIGNING_ALG = "RS256";
export const SITES_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/;
const WORKER_NAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESOURCE_NAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/;
const R2_BUCKET_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const OIDC_CLIENT_ID_PATTERN = /^[\x21-\x7e]{1,256}$/;
const MIN_AUTH_SESSION_LIFETIME_SECONDS = 900;
const MAX_AUTH_SESSION_LIFETIME_SECONDS = 86_400;
const SENSITIVE_KEY_PATTERN =
  /(?:^|_)(?:api_?key|credentials?|password|pepper|private_?key|secrets?|tokens?)(?:$|_)/i;
const REVIEWED_NON_SECRET_CONFIGURATION_KEYS = new Set([
  "OIDC_ID_TOKEN_SIGNING_ALG",
  "OIDC_TOKEN_ENDPOINT_AUTH_METHOD",
]);
const PLACEHOLDER_UUIDS = new Set([
  "00000000-0000-0000-0000-000000000000",
  SITES_PLACEHOLDER_DATABASE_ID,
]);

export function directCloudflarePaths(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot);
  return {
    root,
    sourceConfig: path.join(root, "dist", "server", "wrangler.json"),
    outputDirectory: path.join(root, ".work", "direct-cloudflare"),
    outputConfig: path.join(root, ...DIRECT_CLOUDFLARE_OUTPUT.split("/")),
    main: path.join(root, "dist", "server", "index.js"),
    assets: path.join(root, "dist", "client"),
    packagedMigrations: path.join(root, "dist", ".openai", "drizzle"),
    sourceMigrations: path.join(root, "drizzle"),
  };
}

export function parseDirectCloudflareArguments(argumentsList) {
  const names = new Map([
    ["--account-id", "accountId"],
    ["--worker-name", "workerName"],
    ["--d1-database-name", "d1DatabaseName"],
    ["--d1-database-id", "d1DatabaseId"],
    ["--r2-bucket", "r2Bucket"],
    ["--app-url", "appUrl"],
    ["--oidc-issuer", "oidcIssuer"],
    ["--oidc-client-id", "oidcClientId"],
    ["--auth-session-lifetime-seconds", "authSessionLifetimeSeconds"],
    ["--release-id", "releaseId"],
    ["--consent-policy-registry-json", "consentPolicyRegistryJson"],
  ]);
  const values = {};

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const property = names.get(argument);
    if (!property) {
      throw new Error("Unknown direct-Cloudflare argument.");
    }
    if (Object.hasOwn(values, property)) {
      throw new Error(`Duplicate direct-Cloudflare argument: ${argument}`);
    }
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for direct-Cloudflare argument: ${argument}`);
    }
    values[property] = value;
    index += 1;
  }

  return assertDirectCloudflareInputs(values);
}

export function assertDirectCloudflareInputs(inputs) {
  const required = [
    ["accountId", "Cloudflare account ID"],
    ["workerName", "worker name"],
    ["d1DatabaseName", "D1 database name"],
    ["d1DatabaseId", "D1 database ID"],
    ["r2Bucket", "R2 bucket"],
    ["appUrl", "APP_URL"],
    ["oidcIssuer", "OIDC issuer"],
    ["oidcClientId", "OIDC client ID"],
    ["authSessionLifetimeSeconds", "authentication session lifetime"],
    ["releaseId", "release ID"],
    ["consentPolicyRegistryJson", "consent policy registry JSON"],
  ];
  for (const [property, label] of required) {
    if (typeof inputs?.[property] !== "string" || inputs[property].length === 0) {
      throw new Error(`An explicit non-secret ${label} is required.`);
    }
    if (inputs[property] !== inputs[property].trim()) {
      throw new Error(`${label} must not contain surrounding whitespace.`);
    }
  }

  if (!ACCOUNT_ID_PATTERN.test(inputs.accountId)) {
    throw new Error("Cloudflare account ID must be exactly 32 lowercase hexadecimal characters.");
  }
  if (!WORKER_NAME_PATTERN.test(inputs.workerName)) {
    throw new Error(
      "Worker name must be 1-63 lowercase letters, numbers, or internal hyphens.",
    );
  }
  if (!RESOURCE_NAME_PATTERN.test(inputs.d1DatabaseName)) {
    throw new Error(
      "D1 database name must be 1-63 lowercase letters, numbers, underscores, or internal hyphens.",
    );
  }
  if (!UUID_PATTERN.test(inputs.d1DatabaseId)) {
    throw new Error("D1 database ID must be a canonical lowercase UUID.");
  }
  if (PLACEHOLDER_UUIDS.has(inputs.d1DatabaseId)) {
    throw new Error("D1 database ID must not be a placeholder UUID.");
  }
  if (!R2_BUCKET_PATTERN.test(inputs.r2Bucket)) {
    throw new Error(
      "R2 bucket must be 3-63 lowercase letters, numbers, or internal hyphens.",
    );
  }

  if (!OIDC_CLIENT_ID_PATTERN.test(inputs.oidcClientId)) {
    throw new Error(
      "OIDC client ID must be 1-256 visible ASCII characters without whitespace.",
    );
  }

  const authSessionLifetimeSeconds = Number(inputs.authSessionLifetimeSeconds);
  if (
    !/^[1-9][0-9]*$/.test(inputs.authSessionLifetimeSeconds) ||
    !Number.isSafeInteger(authSessionLifetimeSeconds) ||
    authSessionLifetimeSeconds < MIN_AUTH_SESSION_LIFETIME_SECONDS ||
    authSessionLifetimeSeconds > MAX_AUTH_SESSION_LIFETIME_SECONDS
  ) {
    throw new Error(
      `Authentication session lifetime must be an integer from ${MIN_AUTH_SESSION_LIFETIME_SECONDS} through ${MAX_AUTH_SESSION_LIFETIME_SECONDS} seconds.`,
    );
  }

  let appUrl;
  try {
    appUrl = new URL(inputs.appUrl);
  } catch {
    throw new Error("APP_URL must be a canonical HTTPS origin.");
  }
  if (
    appUrl.protocol !== "https:" ||
    appUrl.username !== "" ||
    appUrl.password !== "" ||
    appUrl.port !== "" ||
    appUrl.pathname !== "/" ||
    appUrl.search !== "" ||
    appUrl.hash !== "" ||
    appUrl.hostname === "localhost" ||
    !appUrl.hostname.includes(".") ||
    isIP(appUrl.hostname) !== 0 ||
    inputs.appUrl !== appUrl.origin
  ) {
    throw new Error(
      "APP_URL must be an exact public HTTPS origin with no credentials, port, path, query, fragment, or trailing slash.",
    );
  }

  const oidcIssuer = canonicalPublicHttpsIssuer(inputs.oidcIssuer);

  const validated = Object.freeze({
    accountId: inputs.accountId,
    workerName: inputs.workerName,
    d1DatabaseName: inputs.d1DatabaseName,
    d1DatabaseId: inputs.d1DatabaseId,
    r2Bucket: inputs.r2Bucket,
    appUrl: appUrl.origin,
    oidcIssuer,
    oidcClientId: inputs.oidcClientId,
    authSessionLifetimeSeconds: String(authSessionLifetimeSeconds),
    releaseId: inputs.releaseId,
    consentPolicyRegistryJson: inputs.consentPolicyRegistryJson,
  });
  validatePrivateSuccessorNonSecretVariables(
    privateSuccessorVariables(validated),
  );
  return validated;
}

export async function prepareDirectCloudflareConfig({
  projectRoot = process.cwd(),
  inputs,
} = {}) {
  const validatedInputs = assertDirectCloudflareInputs(inputs);
  const paths = directCloudflarePaths(projectRoot);
  await assertIgnoredOutputBoundary(paths);
  const source = await readJson(paths.sourceConfig, "freshly built Worker config");
  assertSourceWorkerConfig(source);
  await assertArtifactLayout(paths);

  const sourceD1 = source.d1_databases[0];
  const sourceR2 = source.r2_buckets[0];
  const config = {
    account_id: validatedInputs.accountId,
    name: validatedInputs.workerName,
    main: relativeConfigPath(paths.outputDirectory, paths.main),
    compatibility_date: source.compatibility_date,
    compatibility_flags: source.compatibility_flags,
    no_bundle: true,
    workers_dev: false,
    preview_urls: false,
    routes: [],
    vars: privateSuccessorVariables(validatedInputs),
    d1_databases: [
      {
        binding: sourceD1.binding,
        database_name: validatedInputs.d1DatabaseName,
        database_id: validatedInputs.d1DatabaseId,
        migrations_dir: relativeConfigPath(
          paths.outputDirectory,
          paths.packagedMigrations,
        ),
      },
    ],
    r2_buckets: [
      {
        binding: sourceR2.binding,
        bucket_name: validatedInputs.r2Bucket,
      },
    ],
    triggers: { crons: [EXPECTED_CRON] },
    rules: source.rules,
    assets: {
      ...source.assets,
      directory: relativeConfigPath(paths.outputDirectory, paths.assets),
    },
    observability: {
      enabled: false,
      logs: { enabled: false, invocation_logs: false },
    },
  };

  assertNoSitesOrSecretMaterial(config, "rendered direct-Cloudflare config");
  assertNoPlaceholderUuid(config);
  validatePrivateSuccessorNonSecretVariables(config.vars);
  return { config, paths };
}

function privateSuccessorVariables(inputs) {
  return {
    APP_URL: inputs.appUrl,
    APPLICATION_WRITE_MODE: "frozen",
    AUTH_SESSION_LIFETIME_SECONDS: inputs.authSessionLifetimeSeconds,
    BILLING_CHECKOUT_ENABLED: "false",
    CONSENT_POLICY_REGISTRY_JSON: inputs.consentPolicyRegistryJson,
    INSTRUCTOR_ACCESS_MODE: "owner_private",
    INSTRUCTOR_AUTH_MODE: DIRECT_PUBLIC_AUTH_MODE,
    OIDC_CLIENT_ID: inputs.oidcClientId,
    OIDC_ID_TOKEN_SIGNING_ALG: DIRECT_OIDC_ID_TOKEN_SIGNING_ALG,
    OIDC_ISSUER: inputs.oidcIssuer,
    OIDC_TOKEN_ENDPOINT_AUTH_METHOD:
      DIRECT_OIDC_TOKEN_ENDPOINT_AUTH_METHOD,
    RELEASE_ID: inputs.releaseId,
  };
}

export async function renderDirectCloudflareConfig(options = {}) {
  const { config, paths } = await prepareDirectCloudflareConfig(options);
  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  await mkdir(paths.outputDirectory, { recursive: true, mode: 0o700 });
  const temporary = path.join(
    paths.outputDirectory,
    `.wrangler-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rm(paths.outputConfig, { force: true });
    await rename(temporary, paths.outputConfig);
  } finally {
    await rm(temporary, { force: true });
  }
  return {
    outputPath: paths.outputConfig,
    config,
    releaseReady: false,
    publicAuthMode: DIRECT_PUBLIC_AUTH_MODE,
  };
}

export function assertSourceWorkerConfig(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Freshly built Worker config must be a JSON object.");
  }
  assertNoSitesOrSecretMaterial(source, "freshly built Worker config");
  if (source.main !== "index.js") {
    throw new Error("Freshly built Worker config main must remain index.js.");
  }
  if (source.assets?.directory !== "../client") {
    throw new Error(
      "Freshly built Worker config assets directory must remain ../client.",
    );
  }
  if (source.no_bundle !== true) {
    throw new Error("Freshly built Worker config must retain no_bundle=true.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.compatibility_date ?? "")) {
    throw new Error("Freshly built Worker config has no valid compatibility date.");
  }
  if (
    !Array.isArray(source.compatibility_flags) ||
    source.compatibility_flags.some((flag) => typeof flag !== "string") ||
    source.compatibility_flags.length !==
      EXPECTED_DIRECT_COMPATIBILITY_FLAGS.length ||
    !EXPECTED_DIRECT_COMPATIBILITY_FLAGS.every((flag) =>
      source.compatibility_flags.includes(flag),
    )
  ) {
    throw new Error(
      "Freshly built Worker must contain exactly nodejs_compat and global_fetch_strictly_public compatibility flags.",
    );
  }
  if (!Array.isArray(source.rules)) {
    throw new Error("Freshly built Worker module rules are malformed.");
  }
  if (
    !source.vars ||
    typeof source.vars !== "object" ||
    Array.isArray(source.vars) ||
    Object.keys(source.vars).length !== 0
  ) {
    throw new Error(
      "Freshly built Worker vars must be empty; runtime values and secrets must not be copied.",
    );
  }
  if (
    !Array.isArray(source.d1_databases) ||
    source.d1_databases.length !== 1 ||
    source.d1_databases[0]?.binding !== "DB" ||
    source.d1_databases[0]?.migrations_dir !== "../../migrations"
  ) {
    throw new Error("Freshly built Worker config must contain exactly the DB binding.");
  }
  if (
    !Array.isArray(source.r2_buckets) ||
    source.r2_buckets.length !== 1 ||
    source.r2_buckets[0]?.binding !== "MEDIA"
  ) {
    throw new Error("Freshly built Worker config must contain exactly the MEDIA binding.");
  }
  if (
    !Array.isArray(source.triggers?.crons) ||
    source.triggers.crons.length !== 1 ||
    source.triggers.crons[0] !== EXPECTED_CRON
  ) {
    throw new Error(`Freshly built Worker config must retain cron ${EXPECTED_CRON}.`);
  }
  if (
    source.observability?.enabled !== false ||
    source.observability?.logs?.enabled !== false ||
    source.observability?.logs?.invocation_logs !== false
  ) {
    throw new Error(
      "Freshly built Worker config must disable observability, logs, and invocation logs.",
    );
  }
}

export function assertNoSitesOrSecretMaterial(value, label) {
  visitConfiguration(value, (key, child) => {
    if (key.toLowerCase() === "project_id") {
      throw new Error(`${label} must not contain a Sites project_id.`);
    }
    if (/VINEXT_PRERENDER/i.test(key)) {
      throw new Error(`${label} must not contain VINEXT_PRERENDER.`);
    }
    if (
      SENSITIVE_KEY_PATTERN.test(key) &&
      !REVIEWED_NON_SECRET_CONFIGURATION_KEYS.has(key) &&
      hasConfiguredValue(child)
    ) {
      throw new Error(`${label} must not contain configured secrets or credentials.`);
    }
  });
}

export function assertNoPlaceholderUuid(value) {
  visitConfiguration(value, (_key, child) => {
    if (typeof child === "string" && PLACEHOLDER_UUIDS.has(child.toLowerCase())) {
      throw new Error("Rendered direct-Cloudflare config contains a placeholder UUID.");
    }
  });
}

async function assertIgnoredOutputBoundary(paths) {
  const expected = path.resolve(
    paths.root,
    ".work",
    "direct-cloudflare",
    "wrangler.json",
  );
  if (paths.outputConfig !== expected) {
    throw new Error("Generated direct-Cloudflare config must stay under .work/direct-cloudflare.");
  }
  const ignoreFile = await readFile(path.join(paths.root, ".gitignore"), "utf8");
  const ignoresWork = ignoreFile
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => ["/.work/", ".work/", "/.work/**", ".work/**"].includes(line));
  if (!ignoresWork) {
    throw new Error(
      "Refusing to generate config because the project .gitignore does not ignore .work.",
    );
  }
}

async function assertArtifactLayout(paths) {
  await assertRegularFile(paths.sourceConfig, "freshly built Worker config");
  await assertRegularFile(paths.main, "built Worker entrypoint");
  await assertDirectory(paths.assets, "built asset directory");
  await assertDirectory(paths.packagedMigrations, "packaged migration directory");
  await assertDirectory(paths.sourceMigrations, "source migration directory");
  assertInside(paths.root, paths.main, "Worker entrypoint");
  assertInside(paths.root, paths.assets, "asset directory");
  assertInside(paths.root, paths.packagedMigrations, "migration directory");
  await assertMigrationParity(paths.sourceMigrations, paths.packagedMigrations);
}

async function assertMigrationParity(sourceDirectory, packagedDirectory) {
  const sourceFiles = await migrationInventory(sourceDirectory);
  const packagedFiles = await migrationInventory(packagedDirectory);
  if (
    !sourceFiles.has("meta/_journal.json") ||
    ![...sourceFiles.keys()].some((name) => /^\d{4}_.+\.sql$/.test(name))
  ) {
    throw new Error("Source migrations require a journal and at least one numbered SQL file.");
  }
  if (
    sourceFiles.size !== packagedFiles.size ||
    [...sourceFiles].some(
      ([name, contents]) => !packagedFiles.has(name) || packagedFiles.get(name) !== contents,
    )
  ) {
    throw new Error("Packaged migrations do not exactly match source drizzle migrations.");
  }
}

async function migrationInventory(root) {
  const files = new Map();
  await walk(root, root, files);
  return files;
}

async function walk(root, directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
    if (entry.isSymbolicLink()) {
      throw new Error(`Migration inventory rejects symbolic link: ${relative}`);
    }
    if (entry.isDirectory()) {
      await walk(root, absolute, files);
    } else if (entry.isFile()) {
      files.set(relative, await readFile(absolute, "utf8"));
    }
  }
}

async function assertRegularFile(target, label) {
  const details = await lstat(target).catch(() => null);
  if (!details?.isFile() || details.isSymbolicLink()) {
    throw new Error(`Required ${label} is missing or unsafe.`);
  }
}

async function assertDirectory(target, label) {
  const details = await lstat(target).catch(() => null);
  if (!details?.isDirectory() || details.isSymbolicLink()) {
    throw new Error(`Required ${label} is missing or unsafe.`);
  }
}

function assertInside(root, target, label) {
  const relative = path.relative(root, target);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must remain inside the application root.`);
  }
}

function relativeConfigPath(configDirectory, target) {
  const relative = path.relative(configDirectory, target).replaceAll(path.sep, "/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function canonicalPublicHttpsIssuer(value) {
  let issuer;
  try {
    issuer = new URL(value);
  } catch {
    throw new Error("OIDC issuer must be a canonical public HTTPS URL.");
  }
  const canonical =
    issuer.pathname === "/" ? issuer.origin : `${issuer.origin}${issuer.pathname}`;
  if (
    issuer.protocol !== "https:" ||
    issuer.username !== "" ||
    issuer.password !== "" ||
    issuer.port !== "" ||
    issuer.search !== "" ||
    issuer.hash !== "" ||
    issuer.hostname === "localhost" ||
    !issuer.hostname.includes(".") ||
    isIP(issuer.hostname) !== 0 ||
    value !== canonical
  ) {
    throw new Error(
      "OIDC issuer must be an exact public HTTPS URL without credentials, port, query, fragment, IP address, localhost name, or non-canonical spelling.",
    );
  }
  return canonical;
}

function visitConfiguration(value, visitor) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const child of value) visitConfiguration(child, visitor);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    visitor(key, child);
    visitConfiguration(child, visitor);
  }
}

function hasConfiguredValue(value) {
  if (value === null || value === undefined || value === false || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

async function readJson(filename, label) {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch {
    throw new Error(`Required ${label} is missing or malformed.`);
  }
}

function usage() {
  return [
    "Usage: npm run render:direct-cloudflare-config --",
    "  --account-id <32-lowercase-hex-account-id>",
    "  --worker-name <name>",
    "  --d1-database-name <name>",
    "  --d1-database-id <uuid>",
    "  --r2-bucket <name>",
    "  --app-url <https-origin>",
    "  --oidc-issuer <exact-https-issuer>",
    "  --oidc-client-id <public-client-id>",
    "  --auth-session-lifetime-seconds <900-86400>",
    "  --release-id <immutable-release-id>",
    "  --consent-policy-registry-json <approved-json-object>",
  ].join(" ");
}

async function runCli() {
  if (process.argv.slice(2).includes("--help")) {
    console.log(usage());
    return;
  }
  try {
    const inputs = parseDirectCloudflareArguments(process.argv.slice(2));
    const result = await renderDirectCloudflareConfig({ inputs });
    console.log(
      `Direct-Cloudflare containment config rendered to ${path.relative(process.cwd(), result.outputPath)}.`,
    );
    console.log(
      "Release readiness remains blocked by provider bindings and hosted release evidence.",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await runCli();
}
