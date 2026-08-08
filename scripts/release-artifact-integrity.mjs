import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_PRERENDER_MANIFESTS = [
  "server/vinext-server.json",
  "server/ssr/vinext-server.json",
];

export async function auditReleaseArtifacts(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const findings = [];
  const files = [];
  await collectFiles(root, root, files, findings);

  const manifestSecrets = [];
  for (const relativePath of EXPECTED_PRERENDER_MANIFESTS) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    try {
      const manifest = JSON.parse(await readFile(absolutePath, "utf8"));
      const keys = Object.keys(manifest).sort();
      if (keys.length !== 1 || keys[0] !== "prerenderSecret") {
        findings.push(`${relativePath}: unexpected vinext server manifest shape`);
        continue;
      }
      if (!/^[0-9a-f]{64}$/i.test(manifest.prerenderSecret)) {
        findings.push(`${relativePath}: generated prerender credential has an invalid format`);
        continue;
      }
      manifestSecrets.push({ relativePath, value: manifest.prerenderSecret });
    } catch {
      findings.push(`${relativePath}: required vinext server manifest is missing or malformed`);
    }
  }

  let expectedCredentialCopies = 0;
  let unexpectedCredentialCopies = 0;
  let unexpectedCredentialPathCopies = 0;
  if (manifestSecrets.length === EXPECTED_PRERENDER_MANIFESTS.length) {
    const expectedSecret = manifestSecrets[0].value;
    if (manifestSecrets.some(({ value }) => value !== expectedSecret)) {
      findings.push("server manifests: generated prerender credentials do not match");
    } else {
      const needle = Buffer.from(expectedSecret, "utf8");
      for (const { absolutePath, relativePath } of files) {
        const pathCopies = countOccurrences(
          Buffer.from(relativePath, "utf8"),
          needle,
        );
        if (pathCopies > 0) {
          unexpectedCredentialPathCopies += pathCopies;
          findings.push(
            "artifact path: generated server credential escaped into a filename",
          );
        }

        let contents;
        try {
          contents = await readFile(absolutePath);
        } catch {
          findings.push(`${relativePath}: artifact could not be read`);
          continue;
        }
        const copies = countOccurrences(contents, needle);
        if (EXPECTED_PRERENDER_MANIFESTS.includes(relativePath)) {
          expectedCredentialCopies += copies;
          if (copies !== 1) {
            findings.push(`${relativePath}: expected exactly one generated credential copy`);
          }
        } else if (copies > 0) {
          unexpectedCredentialCopies += copies;
          findings.push(`${relativePath}: generated server credential escaped its allowlisted manifests`);
        }
      }
    }
  }

  const workerConfigPath = path.join(root, "server", "wrangler.json");
  let productionPrerenderBindingConfigured = false;
  try {
    const workerConfig = JSON.parse(await readFile(workerConfigPath, "utf8"));
    productionPrerenderBindingConfigured = containsConfigurationToken(
      workerConfig,
      "VINEXT_PRERENDER",
    );
    if (productionPrerenderBindingConfigured) {
      findings.push("server/wrangler.json: VINEXT_PRERENDER must not be configured for production");
    }
  } catch {
    findings.push("server/wrangler.json: required packaged Worker configuration is missing or malformed");
  }

  const credentialValues = manifestSecrets.map(({ value }) => value);
  return {
    scannedFiles: files.length,
    expectedServerCredentialFiles: manifestSecrets.length,
    expectedCredentialCopies,
    unexpectedCredentialCopies,
    unexpectedCredentialPathCopies,
    productionPrerenderBindingConfigured,
    findings: findings.map((finding) =>
      redactKnownCredentials(finding, credentialValues),
    ),
  };
}

export async function assertReleaseArtifacts(rootDirectory) {
  const report = await auditReleaseArtifacts(rootDirectory);
  if (report.findings.length > 0) {
    throw new Error(
      `Release artifact integrity check failed:\n${report.findings
        .map((finding) => `- ${finding}`)
        .join("\n")}`,
    );
  }
  return report;
}

async function collectFiles(root, directory, files, findings) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    findings.push(`${relative(root, directory)}: artifact directory could not be read`);
    return;
  }

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = relative(root, absolutePath);
    if (entry.isSymbolicLink()) {
      findings.push(`${relativePath}: symbolic links are not allowed in release artifacts`);
    } else if (entry.isDirectory()) {
      await collectFiles(root, absolutePath, files, findings);
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath });
    }
  }
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let offset = 0;
  while (offset <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, offset);
    if (found === -1) break;
    count += 1;
    offset = found + needle.length;
  }
  return count;
}

function containsConfigurationToken(value, forbiddenToken) {
  if (typeof value === "string") {
    return containsToken(value, forbiddenToken);
  }
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((entry) =>
      containsConfigurationToken(entry, forbiddenToken),
    );
  }
  return Object.entries(value).some(
    ([key, child]) =>
      containsToken(key, forbiddenToken) ||
      containsConfigurationToken(child, forbiddenToken),
  );
}

function containsToken(value, forbiddenToken) {
  const escaped = forbiddenToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9_])${escaped}($|[^A-Z0-9_])`, "i").test(
    value,
  );
}

function redactKnownCredentials(value, credentials) {
  let redacted = value;
  for (const credential of credentials) {
    redacted = redacted.replaceAll(credential, "[generated-credential]");
  }
  return redacted;
}

function relative(root, target) {
  const value = path.relative(root, target).replaceAll(path.sep, "/");
  return value || ".";
}

async function runCli() {
  const rootArgument = process.argv[2] ?? "dist";
  try {
    const report = await assertReleaseArtifacts(rootArgument);
    console.log("Release artifact integrity check passed", {
      scannedFiles: report.scannedFiles,
      expectedServerCredentialFiles: report.expectedServerCredentialFiles,
      expectedCredentialCopies: report.expectedCredentialCopies,
      unexpectedCredentialCopies: report.unexpectedCredentialCopies,
      unexpectedCredentialPathCopies:
        report.unexpectedCredentialPathCopies,
      productionPrerenderBindingConfigured:
        report.productionPrerenderBindingConfigured,
    });
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
