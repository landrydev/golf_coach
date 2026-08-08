import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_GENERATED_PATHS = Object.freeze([
  "server/index.js",
  "server/ssr/vinext-server.json",
  "server/vinext-server.json",
]);
const PRERENDER_MANIFEST_PATHS = Object.freeze([
  "server/ssr/vinext-server.json",
  "server/vinext-server.json",
]);
const UUID_PATTERN =
  /(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![0-9a-f])/gi;
const LIMITS = Object.freeze({
  fileBytes: 32 * 1024 * 1024,
  files: 4_096,
  totalBytes: 128 * 1024 * 1024,
});

export async function compareReleaseBuilds({ leftDist, rightDist }) {
  const [leftRoot, rightRoot] = await Promise.all([
    realpath(path.resolve(leftDist)),
    realpath(path.resolve(rightDist)),
  ]);
  if (canonicalPath(leftRoot) === canonicalPath(rightRoot)) {
    throw new Error("Release builds must come from two distinct directories.");
  }
  const [left, right] = await Promise.all([
    inventory(leftRoot),
    inventory(rightRoot),
  ]);
  const inventoryFindings = compareKeys(left, right);
  if (inventoryFindings.length > 0) {
    throw new Error(
      `Release build inventories differ:\n${inventoryFindings
        .map((finding) => `- ${finding}`)
        .join("\n")}`,
    );
  }

  assertExpectedGeneratedPaths(left, "left");
  assertExpectedGeneratedPaths(right, "right");
  assertManifestPair(left, "left");
  assertManifestPair(right, "right");

  const rawDifferingPaths = [];
  const normalizedDifferingPaths = [];
  let leftBuildIdOccurrences = 0;
  let rightBuildIdOccurrences = 0;
  for (const filename of [...left.keys()].sort()) {
    const leftBytes = left.get(filename);
    const rightBytes = right.get(filename);
    if (!leftBytes.equals(rightBytes)) rawDifferingPaths.push(filename);

    const leftNormalized = normalize(filename, leftBytes);
    const rightNormalized = normalize(filename, rightBytes);
    if (filename === "server/index.js") {
      leftBuildIdOccurrences = leftNormalized.generatedValueOccurrences;
      rightBuildIdOccurrences = rightNormalized.generatedValueOccurrences;
    }
    if (!leftNormalized.bytes.equals(rightNormalized.bytes)) {
      normalizedDifferingPaths.push(filename);
    }
  }

  if (normalizedDifferingPaths.length > 0) {
    throw new Error(
      `Release builds differ outside controlled generated values:\n${normalizedDifferingPaths
        .map((filename) => `- ${diagnosticPath(filename)}`)
        .join("\n")}`,
    );
  }
  const unexpectedRawDifferences = rawDifferingPaths.filter(
    (filename) => !EXPECTED_GENERATED_PATHS.includes(filename),
  );
  if (unexpectedRawDifferences.length > 0) {
    throw new Error(
      `Release builds contain unexpected raw differences:\n${unexpectedRawDifferences
        .map((filename) => `- ${diagnosticPath(filename)}`)
        .join("\n")}`,
    );
  }

  return {
    fileCount: left.size,
    rawDifferenceCount: rawDifferingPaths.length,
    rawDifferingPaths,
    normalizedDifferenceCount: 0,
    expectedGeneratedPaths: [...EXPECTED_GENERATED_PATHS],
    serverBuildIdOccurrences: {
      left: leftBuildIdOccurrences,
      right: rightBuildIdOccurrences,
    },
  };
}

async function inventory(root) {
  const files = new Map();
  const state = { bytes: 0, files: 0 };
  await walk(root, root, files, state);
  return files;
}

async function walk(root, directory, files, state) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path
      .relative(root, absolutePath)
      .replaceAll(path.sep, "/");
    if (entry.isSymbolicLink()) {
      throw new Error(`Release build contains a symbolic link: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      await walk(root, absolutePath, files, state);
      continue;
    }
    if (!entry.isFile()) continue;

    state.files += 1;
    if (state.files > LIMITS.files) {
      throw new Error("Release build exceeds the allowed file count.");
    }
    const metadata = await stat(absolutePath);
    if (!metadata.isFile()) {
      throw new Error(`Release build entry is not a regular file: ${relativePath}`);
    }
    if (metadata.size > LIMITS.fileBytes) {
      throw new Error(`Release build file exceeds the size limit: ${relativePath}`);
    }
    const bytes = await readFile(absolutePath);
    if (bytes.length > LIMITS.fileBytes || bytes.length !== metadata.size) {
      throw new Error(`Release build file changed while it was being read: ${relativePath}`);
    }
    state.bytes += bytes.length;
    if (state.bytes > LIMITS.totalBytes) {
      throw new Error("Release build exceeds the allowed total size.");
    }
    files.set(relativePath, bytes);
  }
}

function compareKeys(left, right) {
  const findings = [];
  for (const filename of left.keys()) {
    if (!right.has(filename)) findings.push(`${diagnosticPath(filename)}: missing from right build`);
  }
  for (const filename of right.keys()) {
    if (!left.has(filename)) findings.push(`${diagnosticPath(filename)}: missing from left build`);
  }
  return findings;
}

function assertExpectedGeneratedPaths(files, label) {
  for (const filename of EXPECTED_GENERATED_PATHS) {
    if (!files.has(filename)) {
      throw new Error(`${label} build is missing required generated path: ${filename}`);
    }
  }
}

function assertManifestPair(files, label) {
  const secrets = PRERENDER_MANIFEST_PATHS.map((filename) =>
    parsePrerenderManifest(files.get(filename), filename).secret,
  );
  if (new Set(secrets).size !== 1) {
    throw new Error(`${label} build prerender manifests do not share one generated value.`);
  }
}

function normalize(filename, bytes) {
  if (filename === "server/index.js") return normalizeServerIndex(bytes);
  if (PRERENDER_MANIFEST_PATHS.includes(filename)) {
    const manifest = parsePrerenderManifest(bytes, filename);
    return {
      bytes: Buffer.from(
        manifest.source.replace(
          manifest.secret,
          "[generated-prerender-secret]",
        ),
        "utf8",
      ),
      generatedValueOccurrences: 1,
    };
  }
  return { bytes, generatedValueOccurrences: 0 };
}

function normalizeServerIndex(bytes) {
  const source = bytes.toString("utf8");
  const matches = [...source.matchAll(UUID_PATTERN)].map((match) => match[0]);
  const values = [...new Set(matches)];
  if (matches.length !== 3 || values.length !== 1) {
    throw new Error(
      "server/index.js must contain one generated build UUID in exactly three allowlisted slots.",
    );
  }
  const buildId = values[0];
  const getterNeedle = `get buildId() {\n\t\treturn "${buildId}";\n\t}`;
  if (!source.includes(getterNeedle)) {
    throw new Error("server/index.js generated build UUID is missing from the buildId getter.");
  }
  const isrNeedle = [
    "function __isrCacheKey(pathname, suffix) {",
    '\tconst normalized = pathname === "/" ? "/" : pathname.replace(/\\\/$/, "");',
    `\tconst key = "app:${buildId}:" + normalized + ":" + suffix;`,
    "\tif (key.length <= 200) return key;",
    `\treturn "app:${buildId}:__hash:" + __isrFnv1a64(normalized) + ":" + suffix;`,
    "}",
  ].join("\n");
  if (countOccurrences(source, getterNeedle) !== 1) {
    throw new Error("server/index.js must contain exactly one generated buildId getter.");
  }
  if (countOccurrences(source, isrNeedle) !== 1) {
    throw new Error(
      "server/index.js generated build UUID is not confined to the expected ISR cache-key block.",
    );
  }
  return {
    bytes: Buffer.from(source.replaceAll(buildId, "[generated-build-id]"), "utf8"),
    generatedValueOccurrences: matches.length,
  };
}

function parsePrerenderManifest(bytes, filename) {
  if (!bytes) throw new Error(`${filename}: required generated manifest is missing.`);
  const source = bytes.toString("utf8");
  const match = /^\{"prerenderSecret":"([0-9a-f]{64})"\}$/i.exec(source);
  if (!match) {
    throw new Error(`${filename}: generated manifest has an unexpected shape.`);
  }
  return { secret: match[1], source };
}

function countOccurrences(value, needle) {
  let count = 0;
  let offset = 0;
  while (offset <= value.length - needle.length) {
    const found = value.indexOf(needle, offset);
    if (found === -1) break;
    count += 1;
    offset = found + needle.length;
  }
  return count;
}

function diagnosticPath(filename) {
  return filename.replace(/[0-9a-f]{64}/gi, "[redacted-64-hex]");
}

function canonicalPath(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function parseArguments(argumentsList) {
  const parsed = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!["--left-dist", "--right-dist"].includes(key) || !value) {
      throw new Error(
        "Usage: node scripts/compare-release-builds.mjs --left-dist PATH --right-dist PATH",
      );
    }
    if (parsed.has(key)) throw new Error(`Duplicate option: ${key}`);
    parsed.set(key, value);
  }
  if (!parsed.has("--left-dist") || !parsed.has("--right-dist")) {
    throw new Error(
      "Usage: node scripts/compare-release-builds.mjs --left-dist PATH --right-dist PATH",
    );
  }
  return parsed;
}

async function runCli() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const report = await compareReleaseBuilds({
      leftDist: options.get("--left-dist"),
      rightDist: options.get("--right-dist"),
    });
    console.log("Reproducible release-build comparison passed", report);
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
