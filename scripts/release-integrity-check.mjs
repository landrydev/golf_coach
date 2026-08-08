import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const APP_ROOT = process.cwd();
const WORKSPACE_ROOT = path.resolve(APP_ROOT, "..");
const EXPECTED_BUSINESS_PLAN_V1_SHA256 =
  "c159ed115c5d06e3dc46e35bc43f66ce55d261ba78197eeb8b04c36931351683";
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
  "outputs",
  "work",
]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".example",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const SECRET_PATTERNS = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "Stripe secret key", pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { name: "Stripe webhook secret", pattern: /\bwhsec_[A-Za-z0-9]{16,}\b/ },
  { name: "OpenAI project key", pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/ },
  { name: "long bearer credential", pattern: /\bBearer\s+[A-Za-z0-9.~-]{32,}\b/i },
  { name: "credential-bearing URL", pattern: /https?:\/\/[^\s"'<>]+[?&](?:token|secret|key|credential)=[A-Za-z0-9._~-]{24,}/i },
];

const findings = [];
const textFiles = [];
await collectFiles(APP_ROOT);

for (const file of textFiles) {
  const relative = relativePath(file);
  const contents = await readFile(file, "utf8");
  for (const candidate of SECRET_PATTERNS) {
    if (candidate.pattern.test(contents)) {
      findings.push(`${relative}: possible ${candidate.name}`);
    }
  }
}

await verifyBusinessPlanHistory();
await verifyMigrationJournal();
await verifyHostingManifest();

if (findings.length > 0) {
  console.error("Release integrity check failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  const lockHash = await sha256File(path.join(APP_ROOT, "package-lock.json"));
  console.log("Release integrity check passed", {
    scannedSourceTextFiles: textFiles.length,
    secretFindings: 0,
    businessPlanV1Preserved: true,
    packageLockSha256: lockHash,
  });
}

async function collectFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      findings.push(`${relativePath(path.join(directory, entry.name))}: symbolic link is not allowed in the release source`);
      continue;
    }
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        await collectFiles(path.join(directory, entry.name));
      }
      continue;
    }
    if (!entry.isFile()) continue;

    const file = path.join(directory, entry.name);
    if (entry.name.startsWith(".env") && entry.name !== ".env.example") {
      findings.push(`${relativePath(file)}: unexpected environment file`);
    }
    if (isTextFile(entry.name)) textFiles.push(file);
  }
}

function isTextFile(name) {
  return TEXT_EXTENSIONS.has(path.extname(name).toLowerCase()) ||
    [".env.example", ".gitignore"].includes(name);
}

async function verifyBusinessPlanHistory() {
  const source = path.join(WORKSPACE_ROOT, "00_source", "BUSINESS_PLAN.md");
  try {
    const digest = await sha256File(source);
    if (digest !== EXPECTED_BUSINESS_PLAN_V1_SHA256) {
      findings.push("../00_source/BUSINESS_PLAN.md: historical Business Plan V1 hash changed");
    }
  } catch {
    findings.push("../00_source/BUSINESS_PLAN.md: historical source could not be verified");
  }
}

async function verifyMigrationJournal() {
  const journalPath = path.join(APP_ROOT, "drizzle", "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    findings.push("drizzle/meta/_journal.json: migration journal is empty or malformed");
    return;
  }
  for (const [index, entry] of journal.entries.entries()) {
    if (entry.idx !== index || typeof entry.tag !== "string") {
      findings.push(`drizzle/meta/_journal.json: invalid entry at index ${index}`);
      continue;
    }
    try {
      await stat(path.join(APP_ROOT, "drizzle", `${entry.tag}.sql`));
    } catch {
      findings.push(`drizzle/${entry.tag}.sql: journaled migration is missing`);
    }
  }
}

async function verifyHostingManifest() {
  const manifestPath = path.join(APP_ROOT, ".openai", "hosting.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    !manifest.project_id ||
    typeof manifest.d1 !== "string" ||
    typeof manifest.r2 !== "string"
  ) {
    findings.push(".openai/hosting.json: required Sites resource declarations are missing");
  }
  const forbiddenKeys = [];
  visit(manifest, "hosting", forbiddenKeys);
  for (const key of forbiddenKeys) {
    findings.push(`.openai/hosting.json: secret-shaped manifest key ${key}`);
  }
}

function visit(value, prefix, forbiddenKeys) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const current = `${prefix}.${key}`;
    if (/(?:secret|token|password|credential|private_key)/i.test(key)) {
      forbiddenKeys.push(current);
    }
    visit(child, current, forbiddenKeys);
  }
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function relativePath(file) {
  return path.relative(APP_ROOT, file).replaceAll(path.sep, "/");
}
