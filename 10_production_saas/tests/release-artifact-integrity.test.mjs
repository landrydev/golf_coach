import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertReleaseArtifacts,
  auditReleaseArtifacts,
} from "../scripts/release-artifact-integrity.mjs";
import {
  RELEASE_ARCHIVE_LIMITS,
  validateArchiveEntries,
  verifyReleaseArchive,
} from "../scripts/verify-release-archive.mjs";

const SYNTHETIC_SECRET = "ab".repeat(32);
const FULL_PROVIDER_LOG_DISABLE_CONFIGURATION = {
  enabled: false,
  logs: { enabled: false, invocation_logs: false },
};

test("the exact build keeps its generated prerender credential server-only", async () => {
  const report = await assertReleaseArtifacts(
    path.resolve(import.meta.dirname, "..", "dist"),
  );

  assert.equal(report.expectedServerCredentialFiles, 2);
  assert.equal(report.expectedCredentialCopies, 2);
  assert.equal(report.unexpectedCredentialCopies, 0);
  assert.equal(report.unexpectedCredentialPathCopies, 0);
  assert.equal(report.productionPrerenderBindingConfigured, false);
  assert.equal(report.expectedSchedulerConfigured, true);
  assert.equal(report.providerCustomLogCollectionConfigured, false);
  assert.equal(report.automaticInvocationLogsDisableConfigured, true);
  assert.equal(report.providerLogPersistenceDisableConfigured, true);
});

test("artifact audit rejects credential copies outside the server manifests without disclosing them", async (context) => {
  const root = await createSyntheticArtifacts(context);
  await mkdir(path.join(root, "client", "assets"), { recursive: true });
  await writeFile(
    path.join(root, "client", "assets", "unexpected.js"),
    `export const leaked = "${SYNTHETIC_SECRET}";`,
  );

  const report = await auditReleaseArtifacts(root);
  assert.equal(report.unexpectedCredentialCopies, 1);
  assert.ok(
    report.findings.some((finding) =>
      finding.includes("client/assets/unexpected.js"),
    ),
  );
  assert.doesNotMatch(report.findings.join("\n"), new RegExp(SYNTHETIC_SECRET));
});

test("artifact audit rejects a credential copied into an artifact filename without disclosing it", async (context) => {
  const root = await createSyntheticArtifacts(context);
  await writeFile(path.join(root, `${SYNTHETIC_SECRET}.txt`), "synthetic\n");

  const report = await auditReleaseArtifacts(root);
  assert.equal(report.unexpectedCredentialPathCopies, 1);
  assert.ok(
    report.findings.some((finding) => finding.includes("artifact path")),
  );
  assert.doesNotMatch(report.findings.join("\n"), new RegExp(SYNTHETIC_SECRET));
});

test("artifact audit rejects production prerender configuration forms", async (context) => {
  const configurations = [
    { vars: { VINEXT_PRERENDER: "1" } },
    { define: { "process.env.VINEXT_PRERENDER": '\"1\"' } },
    {
      secrets_store_secrets: [
        {
          binding: "VINEXT_PRERENDER",
          secret_name: "synthetic-name",
          store_id: "synthetic-store",
        },
      ],
    },
    {
      unsafe: {
        bindings: [
          { name: "VINEXT_PRERENDER", text: "1", type: "plain_text" },
        ],
      },
    },
  ];

  for (const configuration of configurations) {
    const root = await createSyntheticArtifacts(context, configuration);
    const report = await auditReleaseArtifacts(root);
    assert.equal(report.productionPrerenderBindingConfigured, true);
    assert.ok(
      report.findings.some((finding) => finding.includes("VINEXT_PRERENDER")),
    );
  }

  const safeRoot = await createSyntheticArtifacts(context, {
    vars: { VINEXT_PRERENDERED: "not-the-reserved-flag" },
  });
  const safeReport = await auditReleaseArtifacts(safeRoot);
  assert.equal(safeReport.productionPrerenderBindingConfigured, false);
});

test("artifact audit requires the exact packaged billing-recovery schedule", async (context) => {
  for (const configuration of [
    { triggers: { crons: [] } },
    { triggers: { crons: ["0 * * * *"] } },
    { triggers: { crons: ["*/5 * * * *", "0 * * * *"] } },
    { vars: {} },
  ]) {
    const root = await createSyntheticArtifacts(context, configuration);
    const report = await auditReleaseArtifacts(root);
    assert.equal(report.expectedSchedulerConfigured, false);
    assert.ok(
      report.findings.some((finding) =>
        finding.includes("expected billing-recovery schedule"),
      ),
    );
  }

  const root = await createSyntheticArtifacts(context, {
    triggers: { crons: ["*/5 * * * *"] },
  });
  const report = await auditReleaseArtifacts(root);
  assert.equal(report.expectedSchedulerConfigured, true);
});

test("artifact audit requires the full provider log-persistence disable configuration", async (context) => {
  for (const observability of [
    undefined,
    { enabled: true, logs: { enabled: true, invocation_logs: false } },
    { enabled: false, logs: { enabled: true, invocation_logs: false } },
    { enabled: true, logs: { enabled: true, invocation_logs: true } },
    { enabled: false, logs: { enabled: false, invocation_logs: true } },
  ]) {
    const root = await createSyntheticArtifacts(context, { observability });
    const report = await auditReleaseArtifacts(root);
    assert.equal(report.providerLogPersistenceDisableConfigured, false);
    assert.ok(
      report.findings.some((finding) =>
        finding.includes("full provider log-persistence disable configuration"),
      ),
    );
  }

  const root = await createSyntheticArtifacts(context);
  const report = await auditReleaseArtifacts(root);
  assert.equal(report.providerCustomLogCollectionConfigured, false);
  assert.equal(report.automaticInvocationLogsDisableConfigured, true);
  assert.equal(report.providerLogPersistenceDisableConfigured, true);
  assert.doesNotMatch(report.findings.join("\n"), /provider log persistence/i);
});

test("archive entry validation rejects traversal, links, and portable-path collisions", () => {
  assert.doesNotThrow(() =>
    validateArchiveEntries(
      ["dist/", "dist/server/index.js"],
      ["drwxr-xr-x dist/", "-rw-r--r-- dist/server/index.js"],
    ),
  );

  for (const [entries, verboseEntries] of [
    [["dist/../outside"], ["-rw-r--r-- dist/../outside"]],
    [["other/file"], ["-rw-r--r-- other/file"]],
    [["dist/link"], ["lrwxr-xr-x dist/link"]],
    [["dist/server/./index.js"], ["-rw-r--r-- dist/server/./index.js"]],
    [["dist/server//index.js"], ["-rw-r--r-- dist/server//index.js"]],
    [["dist/server/index.js:payload"], ["-rw-r--r-- dist/server/index.js:payload"]],
    [["dist/server/.. /index.js"], ["-rw-r--r-- dist/server/.. /index.js"]],
    [["dist/CON.txt"], ["-rw-r--r-- dist/CON.txt"]],
    [
      ["dist/server/index.js", "dist/server/index.js"],
      ["-rw-r--r-- first", "-rw-r--r-- second"],
    ],
    [
      ["dist/server/index.js", "dist/SERVER/INDEX.JS"],
      ["-rw-r--r-- first", "-rw-r--r-- second"],
    ],
    [
      ["dist/client/caf\u00e9.js", "dist/client/cafe\u0301.js"],
      ["-rw-r--r-- first", "-rw-r--r-- second"],
    ],
  ]) {
    assert.throws(() => validateArchiveEntries(entries, verboseEntries));
  }

  const tooManyEntries = Array.from(
    { length: RELEASE_ARCHIVE_LIMITS.entryCount + 1 },
    (_, index) => `dist/file-${index}.txt`,
  );
  assert.throws(() =>
    validateArchiveEntries(
      tooManyEntries,
      tooManyEntries.map((entry) => `-rw-r--r-- ${entry}`),
    ),
  );
});

test("release archive verification binds the submitted archive to the local build", async (context) => {
  const fixture = await createSyntheticReleaseFixture(context);

  await assert.rejects(
    verifyReleaseArchive({
      archivePath: fixture.archive,
      sourceRoot: fixture.source,
    }),
    /requires --local-dist/,
  );

  const exactReport = await verifyReleaseArchive({
    archivePath: fixture.archive,
    localDistPath: fixture.dist,
    sourceRoot: fixture.source,
  });
  assert.equal(exactReport.verificationMode, "release");
  assert.equal(exactReport.localBuildCompared, true);
  assert.equal(exactReport.migrationCount, 1);

  await writeFile(
    path.join(fixture.dist, "server", "index.js"),
    "export default { changed: true };\n",
  );
  await assert.rejects(
    verifyReleaseArchive({
      archivePath: fixture.archive,
      localDistPath: fixture.dist,
      sourceRoot: fixture.source,
    }),
    /does not match the submitted local build/,
  );

  const retrospectiveReport = await verifyReleaseArchive({
    archivePath: fixture.archive,
    retrospective: true,
    sourceRoot: fixture.source,
  });
  assert.equal(retrospectiveReport.verificationMode, "retrospective");
  assert.equal(retrospectiveReport.localBuildCompared, false);
});

async function createSyntheticArtifacts(context, workerConfig = { vars: {} }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "roadmap-artifact-audit-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "server", "ssr"), { recursive: true });
  const manifest = `${JSON.stringify({ prerenderSecret: SYNTHETIC_SECRET })}\n`;
  const effectiveWorkerConfig = {
    observability: FULL_PROVIDER_LOG_DISABLE_CONFIGURATION,
    ...workerConfig,
  };
  await Promise.all([
    writeFile(path.join(root, "server", "vinext-server.json"), manifest),
    writeFile(path.join(root, "server", "ssr", "vinext-server.json"), manifest),
    writeFile(
      path.join(root, "server", "wrangler.json"),
      `${JSON.stringify(effectiveWorkerConfig)}\n`,
    ),
    writeFile(path.join(root, "server", "index.js"), "export default {};\n"),
  ]);
  return root;
}

async function createSyntheticReleaseFixture(context) {
  const root = await mkdtemp(path.join(os.tmpdir(), "roadmap-archive-verification-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const dist = path.join(root, "dist");
  const archive = path.join(root, "release.tar.gz");
  const hosting = `${JSON.stringify({
    d1: "DB",
    project_id: "synthetic-project",
    r2: "MEDIA",
  })}\n`;
  const favicon = '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n';
  const journal = `${JSON.stringify({
    entries: [{ idx: 0, tag: "0000_synthetic" }],
  })}\n`;
  const migration = "CREATE TABLE synthetic (id TEXT PRIMARY KEY);\n";

  for (const directory of [
    path.join(source, ".openai"),
    path.join(source, "public"),
    path.join(source, "drizzle", "meta"),
    path.join(dist, ".openai", "drizzle", "meta"),
    path.join(dist, "client"),
    path.join(dist, "server", "ssr"),
  ]) {
    await mkdir(directory, { recursive: true });
  }

  const manifest = `${JSON.stringify({ prerenderSecret: SYNTHETIC_SECRET })}\n`;
  await Promise.all([
    writeFile(path.join(source, ".openai", "hosting.json"), hosting),
    writeFile(path.join(source, "public", "favicon.svg"), favicon),
    writeFile(path.join(source, "drizzle", "0000_synthetic.sql"), migration),
    writeFile(path.join(source, "drizzle", "meta", "_journal.json"), journal),
    writeFile(path.join(dist, ".openai", "hosting.json"), hosting),
    writeFile(
      path.join(dist, ".openai", "drizzle", "0000_synthetic.sql"),
      migration,
    ),
    writeFile(
      path.join(dist, ".openai", "drizzle", "meta", "_journal.json"),
      journal,
    ),
    writeFile(path.join(dist, "client", "favicon.svg"), favicon),
    writeFile(path.join(dist, "server", "index.js"), "export default {};\n"),
    writeFile(
      path.join(dist, "server", "wrangler.json"),
      `${JSON.stringify({
        observability: FULL_PROVIDER_LOG_DISABLE_CONFIGURATION,
        triggers: { crons: ["*/5 * * * *"] },
      })}\n`,
    ),
    writeFile(path.join(dist, "server", "vinext-server.json"), manifest),
    writeFile(path.join(dist, "server", "ssr", "vinext-server.json"), manifest),
  ]);
  await runTarForTest(["-czf", archive, "-C", root, "dist"]);
  return { archive, dist, source };
}

function runTarForTest(argumentsList) {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", argumentsList, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0 && signal === null) {
        resolve();
      } else {
        reject(new Error("Synthetic tar fixture creation failed."));
      }
    });
  });
}
