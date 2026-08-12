import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCandidateName } from "./source-identity.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const EXPECTED_PACKAGE_NAME = "roadmap-production-saas";
const BUILD_IDENTITY_SCHEMA_VERSION = 1;
const SECRET_FILE_PATTERNS = Object.freeze([
  /^\.env(?:\.|$)/i,
  /^\.dev\.vars(?:\.|$)/i,
  /^(?:id_rsa|id_ed25519)(?:\.|$)/i,
  /(?:^|[-_.])credentials?(?:[-_.]|$)/i,
  /(?:^|[-_.])service[-_.]?account(?:[-_.]|$)/i,
  /\.(?:jks|key|p12|pfx|pem)$/i,
]);

export function resolveCandidateBuildIdentityPath(
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
  const outputPath = resolve(candidateDirectory, "build-identity.json");
  if (dirname(outputPath) !== candidateDirectory) {
    throw new Error("build identity path escaped the validated candidate directory");
  }
  return { outputRoot, candidateDirectory, outputPath };
}

export async function buildArtifactIdentity({
  projectRoot = DEFAULT_PROJECT_ROOT,
  candidate = null,
} = {}) {
  const resolvedProjectRoot = resolve(projectRoot);
  await assertExpectedProjectRoot(resolvedProjectRoot);
  const distRoot = resolve(resolvedProjectRoot, "dist");
  assertContained(resolvedProjectRoot, distRoot, "dist");
  const distMetadata = await lstat(distRoot).catch(() => null);
  if (!distMetadata?.isDirectory() || distMetadata.isSymbolicLink()) {
    throw new Error("dist must be a regular directory produced by a completed build");
  }

  const relativePaths = [];
  await collectRegularFiles(resolvedProjectRoot, distRoot, "dist", relativePaths);
  relativePaths.sort(comparePortablePaths);
  if (!relativePaths.length) {
    throw new Error("build artifact identity resolved no regular files under dist");
  }

  const files = [];
  for (const relativePath of relativePaths) {
    files.push(await hashStableFile(resolvedProjectRoot, relativePath));
  }
  const aggregateSha256 = aggregateFor(files);
  return {
    schemaVersion: BUILD_IDENTITY_SCHEMA_VERSION,
    ...(candidate === null ? {} : { candidate: validateCandidateName(candidate) }),
    root: "dist",
    aggregateSha256,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
}

export function validateBuildArtifactIdentity(identity, candidate = null) {
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    throw new Error("build artifact identity must be an object");
  }
  if (
    identity.schemaVersion !== BUILD_IDENTITY_SCHEMA_VERSION ||
    identity.root !== "dist" ||
    !Array.isArray(identity.files) ||
    identity.files.length === 0 ||
    identity.fileCount !== identity.files.length
  ) {
    throw new Error("build artifact identity structure is invalid");
  }
  if (candidate !== null && identity.candidate !== validateCandidateName(candidate)) {
    throw new Error("build artifact identity candidate does not match");
  }
  let priorPath = null;
  let totalBytes = 0;
  for (const file of identity.files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      !safeBuildPath(file.path) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      typeof file.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(file.sha256) ||
      (priorPath !== null && comparePortablePaths(priorPath, file.path) >= 0)
    ) {
      throw new Error("build artifact identity file inventory is invalid");
    }
    priorPath = file.path;
    totalBytes += file.bytes;
  }
  if (
    identity.totalBytes !== totalBytes ||
    identity.aggregateSha256 !== aggregateFor(identity.files)
  ) {
    throw new Error("build artifact identity aggregate is invalid");
  }
  return identity;
}

export async function writeCandidateBuildIdentity(
  candidate,
  { projectRoot = DEFAULT_PROJECT_ROOT } = {},
) {
  const validatedCandidate = validateCandidateName(candidate);
  const resolvedProjectRoot = resolve(projectRoot);
  const identity = await buildArtifactIdentity({
    projectRoot: resolvedProjectRoot,
    candidate: validatedCandidate,
  });
  const target = resolveCandidateBuildIdentityPath(
    validatedCandidate,
    resolvedProjectRoot,
  );
  await ensureSafeOutputDirectory(resolvedProjectRoot, target.candidateDirectory);
  const existing = await lstat(target.outputPath).catch(() => null);
  if (existing) {
    throw new Error("build identity already exists; use a new candidate");
  }
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

async function collectRegularFiles(projectRoot, directory, relativeDirectory, paths) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => comparePortablePaths(left.name, right.name));
  for (const entry of entries) {
    const relativePath = toPortablePath(join(relativeDirectory, entry.name));
    if (!safeBuildPath(relativePath)) {
      throw new Error(`unsafe or secret-like build artifact path: ${relativePath}`);
    }
    const absolutePath = resolve(projectRoot, relativePath);
    assertContained(projectRoot, absolutePath, relativePath);
    if (entry.isSymbolicLink()) {
      throw new Error(`symbolic links are not allowed in build identity inputs: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      await collectRegularFiles(projectRoot, absolutePath, relativePath, paths);
    } else if (entry.isFile()) {
      paths.push(relativePath);
    } else {
      throw new Error(`build identity input is not a regular file: ${relativePath}`);
    }
  }
}

async function hashStableFile(projectRoot, relativePath) {
  const absolutePath = resolve(projectRoot, relativePath);
  assertContained(projectRoot, absolutePath, relativePath);
  const handle = await open(absolutePath, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile()) {
      throw new Error(`build identity input is not a regular file: ${relativePath}`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      bytes.byteLength !== after.size
    ) {
      throw new Error(`build identity input changed while hashing: ${relativePath}`);
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

function aggregateFor(files) {
  const aggregate = createHash("sha256");
  aggregate.update(`roadmap-build-identity-v${BUILD_IDENTITY_SCHEMA_VERSION}\0`, "utf8");
  for (const file of files) {
    aggregate.update(`${Buffer.byteLength(file.path, "utf8")}:${file.path}\0`, "utf8");
    aggregate.update(`${file.bytes}:${file.sha256}\n`, "utf8");
  }
  return aggregate.digest("hex");
}

function safeBuildPath(relativePath) {
  if (
    !relativePath.startsWith("dist/") ||
    relativePath.includes("\\") ||
    /[\0-\x1f\x7f]/.test(relativePath)
  ) {
    return false;
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return false;
  }
  const filename = segments.at(-1) ?? "";
  return !SECRET_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

function assertContained(root, absolutePath, displayPath) {
  const relation = relative(root, absolutePath);
  if (
    relation === "" ||
    relation === ".." ||
    relation.startsWith(`..${sep}`) ||
    isAbsolute(relation)
  ) {
    throw new Error(`path escaped projectRoot: ${displayPath}`);
  }
}

async function ensureSafeOutputDirectory(projectRoot, candidateDirectory) {
  const repositoryRoot = resolve(projectRoot, "..");
  const directories = [
    resolve(repositoryRoot, "output"),
    resolve(repositoryRoot, "output", "playwright"),
    candidateDirectory,
  ];
  for (const directory of directories) {
    const relation = relative(repositoryRoot, directory);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
      throw new Error("build identity output directory escaped the repository root");
    }
    let metadata = await lstat(directory).catch(() => null);
    if (!metadata) {
      await mkdir(directory);
      metadata = await lstat(directory);
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`build identity output component is unsafe: ${directory}`);
    }
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
    throw new Error(
      "usage: node scripts/build-artifact-identity.mjs --candidate <validated-candidate>",
    );
  }
  return validateCandidateName(argv[1]);
}

async function main() {
  const candidate = parseCandidateArgument(process.argv.slice(2));
  const { identity, outputPath } = await writeCandidateBuildIdentity(candidate);
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
