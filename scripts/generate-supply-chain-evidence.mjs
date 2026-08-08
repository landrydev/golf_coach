import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArguments(process.argv.slice(2));
const releaseId = requiredOption(options, "release-id");
const sourceCommit = requiredOption(options, "source-commit");
const outputDirectory = resolve(
  projectRoot,
  options.get("output-dir") ?? "docs/release-evidence",
);

if (!/^[A-Z0-9][A-Z0-9._-]{5,80}$/.test(releaseId)) {
  throw new Error("release-id must be a bounded filesystem-safe identifier.");
}
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
  throw new Error("source-commit must be a full lowercase Git SHA-1.");
}

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  throw new Error(
    "Run this generator through npm so the exact npm CLI entry point is available.",
  );
}

const packageJsonPath = join(projectRoot, "package.json");
const packageLockPath = join(projectRoot, "package-lock.json");
const [packageJsonBytes, packageLockBytes] = await Promise.all([
  readFile(packageJsonPath),
  readFile(packageLockPath),
]);
const dependencyProvenance = await verifyDependencySources({
  packageJsonBytes,
  packageLockBytes,
  sourceCommit,
});
const packageLock = JSON.parse(packageLockBytes.toString("utf8"));
const rootPackage = packageLock.packages?.[""];
if (!rootPackage?.name || !rootPackage?.version) {
  throw new Error("package-lock.json is missing its root name or version.");
}

const cyclonedxBytes = await npmSbom("cyclonedx");
const spdxBytes = await npmSbom("spdx");
const cyclonedx = parseJson(cyclonedxBytes, "CycloneDX");
const spdx = parseJson(spdxBytes, "SPDX");

assertCycloneDx(cyclonedx, rootPackage);
assertSpdx(spdx, rootPackage);

const lockedComponents = lockedNameVersions(packageLock);
const cycloneComponents = new Set(
  cyclonedx.components.map((component) => `${component.name}@${component.version}`),
);
const missingComponents = [...lockedComponents].filter(
  (component) => !cycloneComponents.has(component),
);
if (missingComponents.length > 0) {
  throw new Error(
    `CycloneDX omitted ${missingComponents.length} locked component(s): ${missingComponents
      .slice(0, 10)
      .join(", ")}`,
  );
}

await mkdir(outputDirectory, { recursive: true });
const cyclonedxPath = join(outputDirectory, `${releaseId}-sbom.cdx.json`);
const spdxPath = join(outputDirectory, `${releaseId}-sbom.spdx.json`);
await writeFile(cyclonedxPath, cyclonedxBytes);
await writeFile(spdxPath, spdxBytes);

const evidence = {
  evidenceType: "package-lock-only-sbom",
  generatedAt: new Date().toISOString(),
  limitations: [
    "Includes the complete locked graph, including development and optional dependencies.",
    "Does not prove which dependencies are present in the deployed Sites archive.",
    "Registry license metadata is not a legal conclusion or obligation review.",
    "SBOM generation does not replace vulnerability, provenance, or malicious-package review.",
  ],
  npmVersion: process.env.npm_config_user_agent?.match(/npm\/([^ ]+)/)?.[1] ?? null,
  nodeVersion: process.version,
  packageJson: {
    sha256: sha256(packageJsonBytes),
    sourceCommitMatched: true,
    sourceCommitSha256: dependencyProvenance.packageJsonSha256,
  },
  packageLock: {
    lockfileVersion: packageLock.lockfileVersion,
    sha256: sha256(packageLockBytes),
    sourceCommitMatched: true,
    sourceCommitSha256: dependencyProvenance.packageLockSha256,
    uniqueNameVersionComponents: lockedComponents.size,
  },
  releaseId,
  sourceCommit,
  sourceHeadMatched: true,
  artifacts: {
    cyclonedx: {
      componentCount: cyclonedx.components.length,
      format: `CycloneDX ${cyclonedx.specVersion}`,
      path: posixRelative(cyclonedxPath),
      sha256: sha256(cyclonedxBytes),
      sizeBytes: cyclonedxBytes.length,
    },
    spdx: {
      format: spdx.spdxVersion,
      packageCount: spdx.packages.length,
      path: posixRelative(spdxPath),
      sha256: sha256(spdxBytes),
      sizeBytes: spdxBytes.length,
    },
  },
};
const manifestPath = join(outputDirectory, `${releaseId}-sbom-manifest.json`);
await writeFile(manifestPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log("Supply-chain evidence generated", {
  cyclonedxComponents: evidence.artifacts.cyclonedx.componentCount,
  cyclonedxSha256: evidence.artifacts.cyclonedx.sha256,
  lockSha256: evidence.packageLock.sha256,
  manifest: posixRelative(manifestPath),
  spdxPackages: evidence.artifacts.spdx.packageCount,
  spdxSha256: evidence.artifacts.spdx.sha256,
});

function parseArguments(argumentsList) {
  const parsed = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(
        "Usage: npm run generate:supply-chain-evidence -- --release-id ID --source-commit SHA [--output-dir PATH]",
      );
    }
    const normalizedKey = key.slice(2);
    if (parsed.has(normalizedKey)) {
      throw new Error(`Duplicate option: ${key}`);
    }
    parsed.set(normalizedKey, value);
  }
  return parsed;
}

function requiredOption(parsed, key) {
  const value = parsed.get(key);
  if (!value) throw new Error(`Missing required option: --${key}`);
  return value;
}

async function npmSbom(format) {
  const childEnvironment = allowlistedEnvironment();
  const result = await run(
    process.execPath,
    [
      npmExecPath,
      "sbom",
      "--package-lock-only",
      "--sbom-format",
      format,
      "--sbom-type",
      "application",
    ],
    childEnvironment,
    "npm sbom",
  );
  if (result.stderr.length > 0) {
    console.error(`npm sbom (${format}) emitted diagnostic output`, {
      bytes: result.stderr.length,
    });
  }
  return result.stdout;
}

function run(command, argumentsList, environment, label = "command") {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, argumentsList, {
      cwd: projectRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => {
      const result = {
        stderr: Buffer.concat(stderr),
        stdout: Buffer.concat(stdout),
      };
      if (code === 0 && signal === null) {
        resolvePromise(result);
        return;
      }
      rejectPromise(
        new Error(
          `${label} failed (${code ?? "no exit code"}/${signal ?? "no signal"}).`,
        ),
      );
    });
  });
}

async function verifyDependencySources({
  packageJsonBytes,
  packageLockBytes,
  sourceCommit,
}) {
  const gitExecutable = await resolveGitExecutable();
  const gitEnvironment = allowlistedEnvironment();
  const safeDirectoryArguments = [
    "-c",
    `safe.directory=${projectRoot.replaceAll("\\", "/")}`,
  ];
  const head = (
    await run(
      gitExecutable,
      [...safeDirectoryArguments, "rev-parse", "--verify", "HEAD^{commit}"],
      gitEnvironment,
      "git rev-parse",
    )
  ).stdout
    .toString("utf8")
    .trim();
  if (head !== sourceCommit) {
    throw new Error(
      "The asserted source commit must exactly match the checked-out HEAD commit.",
    );
  }

  const status = await run(
    gitExecutable,
    [
      ...safeDirectoryArguments,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      "package.json",
      "package-lock.json",
    ],
    gitEnvironment,
    "git status",
  );
  if (status.stdout.length > 0) {
    throw new Error(
      "package.json and package-lock.json must have no staged, unstaged, or untracked changes.",
    );
  }

  const [committedPackageJsonBytes, committedPackageLockBytes] = await Promise.all(
    ["package.json", "package-lock.json"].map(async (filename) =>
      (
        await run(
          gitExecutable,
          [
            ...safeDirectoryArguments,
            "cat-file",
            "blob",
            `${sourceCommit}:${filename}`,
          ],
          gitEnvironment,
          "git cat-file",
        )
      ).stdout,
    ),
  );
  if (!packageJsonBytes.equals(committedPackageJsonBytes)) {
    throw new Error(
      "The working package.json does not exactly match the asserted source commit.",
    );
  }
  if (!packageLockBytes.equals(committedPackageLockBytes)) {
    throw new Error(
      "The working package-lock.json does not exactly match the asserted source commit.",
    );
  }

  return {
    packageJsonSha256: sha256(committedPackageJsonBytes),
    packageLockSha256: sha256(committedPackageLockBytes),
  };
}

async function resolveGitExecutable() {
  for (const gitExecutable of await gitExecutableCandidates()) {
    try {
      await run(
        gitExecutable,
        ["--version"],
        allowlistedEnvironment(),
        "git version",
      );
      return gitExecutable;
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    "Git is required to bind supply-chain evidence to the asserted source commit.",
  );
}

async function gitExecutableCandidates() {
  if (process.platform !== "win32") return ["git"];

  const candidates = [];
  for (const base of [process.env.ProgramFiles, process.env.LOCALAPPDATA]) {
    if (!base) continue;
    if (base === process.env.ProgramFiles) {
      candidates.push(join(base, "Git", "cmd", "git.exe"));
    }
  }

  if (process.env.LOCALAPPDATA) {
    const desktopRoot = join(process.env.LOCALAPPDATA, "GitHubDesktop");
    try {
      const versions = (await readdir(desktopRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("app-"))
        .map((entry) => entry.name)
        .sort()
        .reverse();
      for (const version of versions) {
        candidates.push(
          join(
            desktopRoot,
            version,
            "resources",
            "app",
            "git",
            "cmd",
            "git.exe",
          ),
        );
      }
    } catch {
      // Fall through to the PATH lookup below.
    }
  }

  const available = [];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      available.push(candidate);
    } catch {
      // Continue checking known absolute installations.
    }
  }
  available.push("git");
  return [...new Set(available)];
}

function allowlistedEnvironment() {
  const allowedKeys = [
    "APPDATA",
    "ComSpec",
    "LOCALAPPDATA",
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "TEMP",
    "TMP",
    "WINDIR",
  ];
  return Object.fromEntries(
    allowedKeys
      .filter((key) => typeof process.env[key] === "string")
      .map((key) => [key, process.env[key]]),
  );
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} output is not valid UTF-8 JSON.`, { cause: error });
  }
}

function assertCycloneDx(document, root) {
  if (document.bomFormat !== "CycloneDX" || document.specVersion !== "1.5") {
    throw new Error("Unexpected CycloneDX format or specification version.");
  }
  if (
    document.metadata?.component?.name !== root.name ||
    document.metadata?.component?.version !== root.version
  ) {
    throw new Error("CycloneDX root component does not match package-lock.json.");
  }
  if (!Array.isArray(document.components) || document.components.length === 0) {
    throw new Error("CycloneDX contains no dependency components.");
  }
}

function assertSpdx(document, root) {
  if (document.spdxVersion !== "SPDX-2.3" || !Array.isArray(document.packages)) {
    throw new Error("Unexpected SPDX format or package inventory.");
  }
  if (
    !document.packages.some(
      (entry) => entry.name === root.name && entry.versionInfo === root.version,
    )
  ) {
    throw new Error("SPDX root package does not match package-lock.json.");
  }
}

function lockedNameVersions(lock) {
  const components = new Set();
  for (const [location, entry] of Object.entries(lock.packages ?? {})) {
    if (!location || !entry?.version) continue;
    const name = entry.name ?? nameFromLocation(location);
    if (!name) throw new Error(`Cannot identify locked package at ${location}.`);
    components.add(`${name}@${entry.version}`);
  }
  return components;
}

function nameFromLocation(location) {
  const marker = "node_modules/";
  const position = location.lastIndexOf(marker);
  if (position < 0) return "";
  return location.slice(position + marker.length).replaceAll("\\", "/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function posixRelative(path) {
  return relative(projectRoot, path).replaceAll("\\", "/");
}
