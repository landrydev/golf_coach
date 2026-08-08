import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createGunzip } from "node:zlib";
import { assertReleaseArtifacts } from "./release-artifact-integrity.mjs";

export const RELEASE_ARCHIVE_LIMITS = Object.freeze({
  archiveBytes: 64 * 1024 * 1024,
  entryCount: 4_096,
  fileBytes: 32 * 1024 * 1024,
  listingBytes: 8 * 1024 * 1024,
  pathBytes: 1_024,
  tarStreamBytes: 128 * 1024 * 1024,
  tarTimeoutMs: 60_000,
});

export async function verifyReleaseArchive({
  archivePath,
  localDistPath,
  retrospective = false,
  sourceRoot,
}) {
  if (!localDistPath && !retrospective) {
    throw new Error(
      "Release-mode archive verification requires --local-dist. Use --retrospective only for explicitly degraded historical inspection.",
    );
  }
  if (localDistPath && retrospective) {
    throw new Error(
      "Choose one archive verification mode: exact release comparison or retrospective inspection.",
    );
  }

  const archive = path.resolve(archivePath);
  const source = path.resolve(sourceRoot ?? process.cwd());
  const archiveBytes = await readBoundedFile(
    archive,
    RELEASE_ARCHIVE_LIMITS.archiveBytes,
    "Release archive",
  );
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "roadmap-release-archive-"),
  );
  try {
    const immutableArchive = path.join(temporaryRoot, "submitted.tar.gz");
    const extractionRoot = path.join(temporaryRoot, "extracted");
    await writeFile(immutableArchive, archiveBytes, {
      flag: "wx",
      mode: 0o600,
    });
    await assertBoundedGzipStream(immutableArchive);

    const entries = lines(
      await runTar(["-tzf", immutableArchive], {
        maxOutputBytes: RELEASE_ARCHIVE_LIMITS.listingBytes,
      }),
    );
    const verboseEntries = lines(
      await runTar(["-tvzf", immutableArchive], {
        maxOutputBytes: RELEASE_ARCHIVE_LIMITS.listingBytes,
      }),
    );
    validateArchiveEntries(entries, verboseEntries);

    await mkdir(extractionRoot, { mode: 0o700 });
    await runTar(["-xzf", immutableArchive, "-C", extractionRoot], {
      maxOutputBytes: RELEASE_ARCHIVE_LIMITS.listingBytes,
    });
    const extractedDist = path.join(extractionRoot, "dist");
    const extractedFiles = await inventoryFiles(extractedDist);
    const sourceMappedFiles = await verifySourceMappings(extractedDist, source);
    let localBuildCompared = false;
    if (localDistPath) {
      const localFiles = await inventoryFiles(path.resolve(localDistPath));
      const inventoryFindings = compareInventories(localFiles, extractedFiles);
      if (inventoryFindings.length > 0) {
        throw new Error(
          `Release archive does not match the submitted local build:\n${inventoryFindings
            .map((finding) => `- ${finding}`)
            .join("\n")}`,
        );
      }
      localBuildCompared = true;
    }

    const artifactReport = await assertReleaseArtifacts(extractedDist);
    const requiredFiles = [
      ".openai/hosting.json",
      ".openai/drizzle/meta/_journal.json",
      "client/favicon.svg",
      "server/index.js",
      "server/wrangler.json",
    ];
    for (const requiredFile of requiredFiles) {
      if (!extractedFiles.has(requiredFile)) {
        throw new Error(`Release archive is missing required file: dist/${requiredFile}`);
      }
    }

    const migrationFiles = [...extractedFiles.keys()].filter((filename) =>
      /^\.openai\/drizzle\/\d{4}_.+\.sql$/.test(filename),
    );
    if (migrationFiles.length === 0) {
      throw new Error("Release archive contains no packaged migrations.");
    }

    return {
      archiveSha256: sha256(archiveBytes),
      archiveSizeBytes: archiveBytes.length,
      artifactReport,
      entryCount: entries.length,
      fileCount: extractedFiles.size,
      localBuildCompared,
      migrationCount: migrationFiles.length,
      sourceMappedFiles,
      verificationMode: localDistPath ? "release" : "retrospective",
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function verifySourceMappings(extractedDist, sourceRoot) {
  const mappings = [
    {
      kind: "json",
      packaged: path.join(extractedDist, ".openai", "hosting.json"),
      source: path.join(sourceRoot, ".openai", "hosting.json"),
    },
    {
      kind: "text",
      packaged: path.join(extractedDist, "client", "favicon.svg"),
      source: path.join(sourceRoot, "public", "favicon.svg"),
    },
  ];

  const sourceDrizzle = await inventoryFiles(path.join(sourceRoot, "drizzle"));
  const packagedDrizzle = await inventoryFiles(
    path.join(extractedDist, ".openai", "drizzle"),
  );
  const drizzleInventoryFindings = compareInventoryKeys(
    sourceDrizzle,
    packagedDrizzle,
    "packaged migration set",
  );
  if (drizzleInventoryFindings.length > 0) {
    throw new Error(drizzleInventoryFindings.join("\n"));
  }
  for (const relativePath of sourceDrizzle.keys()) {
    mappings.push({
      kind: relativePath.endsWith(".json") ? "json" : "text",
      packaged: path.join(
        extractedDist,
        ".openai",
        "drizzle",
        ...relativePath.split("/"),
      ),
      source: path.join(sourceRoot, "drizzle", ...relativePath.split("/")),
    });
  }

  for (const mapping of mappings) {
    const [packagedBytes, sourceBytes] = await Promise.all([
      readFile(mapping.packaged),
      readFile(mapping.source),
    ]);
    const packaged = canonicalSourceValue(packagedBytes, mapping.kind);
    const expected = canonicalSourceValue(sourceBytes, mapping.kind);
    if (packaged !== expected) {
      throw new Error(
        `${path.relative(extractedDist, mapping.packaged).replaceAll(path.sep, "/")}: packaged control differs from source`,
      );
    }
  }
  return mappings.length;
}

export function validateArchiveEntries(entries, verboseEntries) {
  if (entries.length === 0 || entries.length !== verboseEntries.length) {
    throw new Error("Release archive listing is empty or internally inconsistent.");
  }
  if (entries.length > RELEASE_ARCHIVE_LIMITS.entryCount) {
    throw new Error("Release archive exceeds the allowed entry count.");
  }

  const seenPortablePaths = new Set();
  for (const [index, rawEntry] of entries.entries()) {
    const entryType = verboseEntries[index]?.[0];
    if (entryType !== "-" && entryType !== "d") {
      throw new Error("Release archive contains a link or unsupported entry type.");
    }

    const portablePath = portableArchivePath(rawEntry);
    if (seenPortablePaths.has(portablePath)) {
      throw new Error(
        "Release archive contains entries that collide on a portable filesystem.",
      );
    }
    seenPortablePaths.add(portablePath);
  }
}

function portableArchivePath(rawEntry) {
  if (Buffer.byteLength(rawEntry, "utf8") > RELEASE_ARCHIVE_LIMITS.pathBytes) {
    throw new Error("Release archive entry path exceeds the allowed length.");
  }
  if (rawEntry.includes("\\")) {
    throw new Error("Release archive entry uses a non-portable path separator.");
  }
  if (
    rawEntry.startsWith("/") ||
    /^[a-z]:/i.test(rawEntry) ||
    /[\u0000-\u001f\u007f]/.test(rawEntry)
  ) {
    throw new Error("Release archive entry uses an unsafe path.");
  }
  if (rawEntry !== "dist/" && !rawEntry.startsWith("dist/")) {
    throw new Error("Release archive entry exists outside the dist root.");
  }

  const withoutTrailingSlash = rawEntry.endsWith("/")
    ? rawEntry.slice(0, -1)
    : rawEntry;
  const segments = withoutTrailingSlash.split("/");
  if (segments.length === 0 || segments[0] !== "dist") {
    throw new Error("Release archive entry exists outside the dist root.");
  }

  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new Error("Release archive entry uses an ambiguous path segment.");
    }
    if (segment.endsWith(".") || segment.endsWith(" ")) {
      throw new Error(
        "Release archive entry is unsafe on Windows-compatible filesystems.",
      );
    }
    if (/[<>:"|?*]/.test(segment)) {
      throw new Error(
        "Release archive entry is unsafe on Windows-compatible filesystems.",
      );
    }
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)) {
      throw new Error(
        "Release archive entry uses a reserved Windows device name.",
      );
    }
  }

  return segments
    .map((segment) => segment.normalize("NFC").toLowerCase())
    .join("/");
}

async function inventoryFiles(root) {
  const inventory = new Map();
  const limits = { bytes: 0, files: 0 };
  await walk(root, root, inventory, limits);
  return inventory;
}

async function walk(root, directory, inventory, limits) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
    if (entry.isSymbolicLink()) {
      throw new Error(`Artifact inventory rejects symbolic link: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      await walk(root, absolutePath, inventory, limits);
    } else if (entry.isFile()) {
      limits.files += 1;
      if (limits.files > RELEASE_ARCHIVE_LIMITS.entryCount) {
        throw new Error("Artifact inventory exceeds the allowed file count.");
      }
      const bytes = await readBoundedFile(
        absolutePath,
        RELEASE_ARCHIVE_LIMITS.fileBytes,
        "Artifact file",
      );
      limits.bytes += bytes.length;
      if (limits.bytes > RELEASE_ARCHIVE_LIMITS.tarStreamBytes) {
        throw new Error("Artifact inventory exceeds the allowed total size.");
      }
      inventory.set(relativePath, sha256(bytes));
    }
  }
}

function compareInventories(expected, actual) {
  const findings = [];
  for (const [filename, digest] of expected) {
    if (!actual.has(filename)) {
      findings.push(`${diagnosticPath(filename)}: missing from archive`);
    } else if (actual.get(filename) !== digest) {
      findings.push(
        `${diagnosticPath(filename)}: content differs from local build`,
      );
    }
  }
  for (const filename of actual.keys()) {
    if (!expected.has(filename)) {
      findings.push(`${diagnosticPath(filename)}: unexpected archive file`);
    }
  }
  return findings;
}

function compareInventoryKeys(expected, actual, label) {
  const findings = [];
  for (const filename of expected.keys()) {
    if (!actual.has(filename)) {
      findings.push(`${label}: missing ${diagnosticPath(filename)}`);
    }
  }
  for (const filename of actual.keys()) {
    if (!expected.has(filename)) {
      findings.push(`${label}: unexpected ${diagnosticPath(filename)}`);
    }
  }
  return findings;
}

function diagnosticPath(filename) {
  return filename.replace(/[0-9a-f]{64}/gi, "[redacted-64-hex]");
}

function canonicalSourceValue(bytes, kind) {
  const text = bytes.toString("utf8").replace(/\r\n?/g, "\n");
  if (kind === "json") return JSON.stringify(JSON.parse(text));
  return text;
}

async function readBoundedFile(filename, maximumBytes, label) {
  const handle = await open(filename, "r");
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error(`${label} is not a regular file.`);
    if (metadata.size > maximumBytes) {
      throw new Error(`${label} exceeds the allowed size.`);
    }

    const chunks = [];
    let totalBytes = 0;
    const stream = handle.createReadStream({ autoClose: false });
    for await (const chunk of stream) {
      totalBytes += chunk.length;
      if (totalBytes > maximumBytes) {
        stream.destroy();
        throw new Error(`${label} exceeds the allowed size.`);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, totalBytes);
  } finally {
    await handle.close();
  }
}

async function assertBoundedGzipStream(archive) {
  const input = createReadStream(archive);
  const gunzip = createGunzip();
  const output = input.pipe(gunzip);
  let timedOut = false;
  let totalBytes = 0;
  const timer = setTimeout(() => {
    timedOut = true;
    gunzip.destroy(new Error("Release archive decompression timed out."));
    input.destroy();
  }, RELEASE_ARCHIVE_LIMITS.tarTimeoutMs);

  try {
    for await (const chunk of output) {
      totalBytes += chunk.length;
      if (totalBytes > RELEASE_ARCHIVE_LIMITS.tarStreamBytes) {
        throw new Error("Release archive exceeds the allowed unpacked size.");
      }
    }
  } catch (error) {
    if (timedOut) {
      throw new Error("Release archive decompression timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    input.destroy();
    gunzip.destroy();
  }
}

function runTar(argumentsList, options = {}) {
  const maxOutputBytes =
    options.maxOutputBytes ?? RELEASE_ARCHIVE_LIMITS.listingBytes;
  const timeoutMs = options.timeoutMs ?? RELEASE_ARCHIVE_LIMITS.tarTimeoutMs;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("tar", argumentsList, {
      env: allowlistedEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let terminationError;
    let settled = false;
    let timer;

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };

    const collect = (destination, chunk) => {
      if (settled) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        terminationError = new Error(
          "tar output exceeds the allowed release-archive inspection size.",
        );
        child.kill();
        settle(rejectPromise, terminationError);
        return;
      }
      destination.push(chunk);
    };
    timer = setTimeout(() => {
      terminationError = new Error("tar timed out while inspecting the release archive.");
      child.kill();
      settle(rejectPromise, terminationError);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => collect(stdout, chunk));
    child.stderr.on("data", (chunk) => collect(stderr, chunk));
    child.once("error", (error) => settle(rejectPromise, error));
    child.once("close", (code, signal) => {
      if (terminationError) {
        settle(rejectPromise, terminationError);
        return;
      }
      if (code === 0 && signal === null) {
        settle(resolvePromise, Buffer.concat(stdout).toString("utf8"));
        return;
      }
      settle(
        rejectPromise,
        new Error(
          `tar failed (${code ?? "no exit code"}/${signal ?? "no signal"}).`,
        ),
      );
    });
  });
}

function allowlistedEnvironment() {
  const allowedKeys = [
    "ComSpec",
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

function lines(value) {
  return value
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseArguments(argumentsList) {
  const parsed = new Map();
  const valueOptions = new Set(["archive", "local-dist", "source-root"]);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const key = argumentsList[index];
    if (key === "--retrospective") {
      if (parsed.has("retrospective")) {
        throw new Error("Duplicate option: --retrospective");
      }
      parsed.set("retrospective", true);
      continue;
    }
    if (!key?.startsWith("--") || !valueOptions.has(key.slice(2))) {
      throw new Error(
        "Usage: node scripts/verify-release-archive.mjs --archive PATH --local-dist PATH [--source-root PATH] OR --archive PATH --retrospective [--source-root PATH]",
      );
    }
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(
        "Usage: node scripts/verify-release-archive.mjs --archive PATH --local-dist PATH [--source-root PATH] OR --archive PATH --retrospective [--source-root PATH]",
      );
    }
    const normalizedKey = key.slice(2);
    if (parsed.has(normalizedKey)) {
      throw new Error(`Duplicate option: ${key}`);
    }
    parsed.set(normalizedKey, value);
    index += 1;
  }
  return parsed;
}

async function runCli() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const archivePath = options.get("archive");
    if (!archivePath) throw new Error("Missing required option: --archive");
    const report = await verifyReleaseArchive({
      archivePath,
      localDistPath: options.get("local-dist"),
      retrospective: options.has("retrospective"),
      sourceRoot: options.get("source-root") ?? process.cwd(),
    });
    console.log(
      report.verificationMode === "release"
        ? "Exact-build release archive verification passed"
        : "Retrospective archive inspection passed; exact-build attestation was not performed",
      {
        archiveSha256: report.archiveSha256,
        archiveSizeBytes: report.archiveSizeBytes,
        entryCount: report.entryCount,
        fileCount: report.fileCount,
        localBuildCompared: report.localBuildCompared,
        migrationCount: report.migrationCount,
        sourceMappedFiles: report.sourceMappedFiles,
        expectedServerCredentialFiles:
          report.artifactReport.expectedServerCredentialFiles,
        unexpectedCredentialCopies:
          report.artifactReport.unexpectedCredentialCopies,
        unexpectedCredentialPathCopies:
          report.artifactReport.unexpectedCredentialPathCopies,
        verificationMode: report.verificationMode,
      },
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
