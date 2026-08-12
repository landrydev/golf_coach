import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const EXPECTED_PACKAGE_NAME = "roadmap-production-saas";
const IDENTITY_SCHEMA_VERSION = 2;

const ALLOWED_SOURCE_DIRECTORIES = Object.freeze([
  "app",
  "components",
  "db",
  "drizzle",
  "lib",
  "public",
  "scripts",
  "tests",
  "worker",
]);

const ALLOWED_SOURCE_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".png",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
]);

const ALLOWED_CONFIG_FILES = Object.freeze([
  ".openai/hosting.json",
  "cloudflare-env.d.ts",
  "drizzle.config.ts",
  "eslint.config.mjs",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "tsconfig.json",
  "vite.config.ts",
]);

// PowerShell is intentionally not a generally allowed source extension. This
// one pinned browser wrapper is part of the exact-candidate QA surface.
const ALLOWED_EXPLICIT_FILES = Object.freeze([
  "scripts/playwright-cli.ps1",
]);

const EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".next",
  ".secrets",
  ".work",
  ".wrangler",
  "build",
  "dist",
  "docs",
  "node_modules",
  "output",
  "outputs",
  "secrets",
  "work",
]);

const SECRET_FILE_PATTERNS = Object.freeze([
  /^\.env(?:\.|$)/i,
  /^\.dev\.vars(?:\.|$)/i,
  /^(?:id_rsa|id_ed25519)(?:\.|$)/i,
  /(?:^|[-_.])credentials?(?:[-_.]|$)/i,
  /(?:^|[-_.])service[-_.]?account(?:[-_.]|$)/i,
  /\.(?:jks|key|p12|pfx|pem)$/i,
]);

export function validateCandidateName(value) {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(value)
  ) {
    throw new Error(
      "candidate must be a lowercase slug of 1-80 letters, numbers, or internal hyphens",
    );
  }
  return value;
}

export function resolveCandidateOutputPath(
  candidate,
  projectRoot = DEFAULT_PROJECT_ROOT,
) {
  const validatedCandidate = validateCandidateName(candidate);
  const resolvedProjectRoot = resolve(projectRoot);
  const outputRoot = resolve(resolvedProjectRoot, "..", "output", "playwright");
  const candidateDirectory = resolve(outputRoot, validatedCandidate);
  if (dirname(candidateDirectory) !== outputRoot) {
    throw new Error("candidate output path escaped the Playwright output root");
  }
  const outputPath = resolve(candidateDirectory, "source-identity.json");
  if (dirname(outputPath) !== candidateDirectory) {
    throw new Error("source identity path escaped the validated candidate directory");
  }
  return { outputRoot, candidateDirectory, outputPath };
}

export async function buildSourceIdentity({
  projectRoot = DEFAULT_PROJECT_ROOT,
  candidate = null,
} = {}) {
  const resolvedProjectRoot = resolve(projectRoot);
  await assertExpectedProjectRoot(resolvedProjectRoot);
  const relativePaths = await collectAllowedFiles(resolvedProjectRoot);
  if (!relativePaths.length) {
    throw new Error("source identity allowlist resolved no files");
  }

  const files = [];
  for (const relativePath of relativePaths) {
    files.push(await hashStableFile(resolvedProjectRoot, relativePath));
  }
  const aggregate = createHash("sha256");
  aggregate.update(`roadmap-source-identity-v${IDENTITY_SCHEMA_VERSION}\0`, "utf8");
  for (const file of files) {
    aggregate.update(`${Buffer.byteLength(file.path, "utf8")}:${file.path}\0`, "utf8");
    aggregate.update(`${file.bytes}:${file.sha256}\n`, "utf8");
  }
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);

  return {
    schemaVersion: IDENTITY_SCHEMA_VERSION,
    ...(candidate === null ? {} : { candidate: validateCandidateName(candidate) }),
    aggregateSha256: aggregate.digest("hex"),
    fileCount: files.length,
    totalBytes,
    files,
  };
}

export async function writeCandidateSourceIdentity(
  candidate,
  { projectRoot = DEFAULT_PROJECT_ROOT } = {},
) {
  const validatedCandidate = validateCandidateName(candidate);
  const resolvedProjectRoot = resolve(projectRoot);
  const identity = await buildSourceIdentity({
    projectRoot: resolvedProjectRoot,
    candidate: validatedCandidate,
  });
  const target = resolveCandidateOutputPath(validatedCandidate, resolvedProjectRoot);
  await ensureSafeOutputDirectory(resolvedProjectRoot, target);
  await assertSafeOutputFile(target.outputPath);
  await writeFile(target.outputPath, `${JSON.stringify(identity, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return { identity, outputPath: target.outputPath };
}

async function assertExpectedProjectRoot(projectRoot) {
  const packagePath = resolve(projectRoot, "package.json");
  assertContained(projectRoot, packagePath, "package.json");
  const metadata = await lstat(packagePath).catch(() => null);
  if (!metadata?.isFile() || metadata.isSymbolicLink()) {
    throw new Error("projectRoot must contain a regular package.json file");
  }
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  if (packageJson?.name !== EXPECTED_PACKAGE_NAME) {
    throw new Error(`projectRoot package name must be ${EXPECTED_PACKAGE_NAME}`);
  }
}

async function collectAllowedFiles(projectRoot) {
  const paths = new Set();
  for (const directory of ALLOWED_SOURCE_DIRECTORIES) {
    await walkAllowedDirectory(projectRoot, directory, paths);
  }
  for (const relativePath of [
    ...ALLOWED_CONFIG_FILES,
    ...ALLOWED_EXPLICIT_FILES,
  ]) {
    await addExplicitFile(projectRoot, relativePath, paths);
  }
  return [...paths].sort(comparePortablePaths);
}

async function walkAllowedDirectory(projectRoot, relativeDirectory, paths) {
  const absoluteDirectory = resolve(projectRoot, relativeDirectory);
  assertContained(projectRoot, absoluteDirectory, relativeDirectory);
  const metadata = await lstat(absoluteDirectory).catch(() => null);
  if (!metadata) return;
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`allowlisted source directory is not a regular directory: ${relativeDirectory}`);
  }
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  entries.sort((left, right) => comparePortablePaths(left.name, right.name));
  for (const entry of entries) {
    const relativePath = toPortablePath(join(relativeDirectory, entry.name));
    if (isExcludedPath(relativePath) || isSecretLikePath(relativePath)) continue;
    const absolutePath = resolve(projectRoot, relativePath);
    assertContained(projectRoot, absolutePath, relativePath);
    if (entry.isSymbolicLink()) {
      throw new Error(`symbolic links are not allowed in source identity inputs: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      await walkAllowedDirectory(projectRoot, relativePath, paths);
    } else if (
      entry.isFile() &&
      ALLOWED_SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())
    ) {
      paths.add(relativePath);
    }
  }
}

async function addExplicitFile(projectRoot, relativePath, paths) {
  const portablePath = toPortablePath(relativePath);
  if (isExcludedPath(portablePath) || isSecretLikePath(portablePath)) return;
  const absolutePath = resolve(projectRoot, portablePath);
  assertContained(projectRoot, absolutePath, portablePath);
  const metadata = await lstat(absolutePath).catch(() => null);
  if (!metadata) return;
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`allowlisted source file is not a regular file: ${portablePath}`);
  }
  paths.add(portablePath);
}

async function hashStableFile(projectRoot, relativePath) {
  const absolutePath = resolve(projectRoot, relativePath);
  assertContained(projectRoot, absolutePath, relativePath);
  const handle = await open(absolutePath, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error(`source identity input is not a file: ${relativePath}`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      bytes.byteLength !== after.size
    ) {
      throw new Error(`source identity input changed while hashing: ${relativePath}`);
    }
    return {
      path: relativePath,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } finally {
    await handle.close();
  }
}

function isExcludedPath(relativePath) {
  return relativePath
    .split("/")
    .some((segment) => EXCLUDED_SEGMENTS.has(segment.toLowerCase()));
}

function isSecretLikePath(relativePath) {
  const filename = relativePath.split("/").at(-1) ?? "";
  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

function assertContained(projectRoot, absolutePath, displayPath) {
  const relation = relative(projectRoot, absolutePath);
  if (
    relation === "" ||
    relation === ".." ||
    relation.startsWith(`..${sep}`) ||
    isAbsolute(relation)
  ) {
    throw new Error(`path escaped projectRoot: ${displayPath}`);
  }
}

async function ensureSafeOutputDirectory(projectRoot, target) {
  const repositoryRoot = resolve(projectRoot, "..");
  const outputDirectory = resolve(repositoryRoot, "output");
  const playwrightDirectory = resolve(outputDirectory, "playwright");
  for (const directory of [outputDirectory, playwrightDirectory, target.candidateDirectory]) {
    const relation = relative(repositoryRoot, directory);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
      throw new Error("source identity output directory escaped the repository root");
    }
    const metadata = await lstat(directory).catch(() => null);
    if (metadata) {
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(`source identity output component is unsafe: ${directory}`);
      }
    } else {
      await mkdir(directory);
    }
  }
}

async function assertSafeOutputFile(outputPath) {
  const metadata = await lstat(outputPath).catch(() => null);
  if (metadata) {
    throw new Error("source identity already exists; use a new candidate");
  }
}

function toPortablePath(value) {
  return value.split(sep).join("/");
}

function comparePortablePaths(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function parseCandidateArgument(argv) {
  if (argv.length !== 2 || argv[0] !== "--candidate") {
    throw new Error("usage: node scripts/source-identity.mjs --candidate <validated-candidate>");
  }
  return validateCandidateName(argv[1]);
}

async function main() {
  const candidate = parseCandidateArgument(process.argv.slice(2));
  const { identity, outputPath } = await writeCandidateSourceIdentity(candidate);
  process.stdout.write(
    `${JSON.stringify({
      candidate,
      aggregateSha256: identity.aggregateSha256,
      fileCount: identity.fileCount,
      totalBytes: identity.totalBytes,
      outputPath,
    }, null, 2)}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
