import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  buildSourceIdentity,
  resolveCandidateOutputPath,
  validateCandidateName,
  writeCandidateSourceIdentity,
} from "../scripts/source-identity.mjs";

test("source identity is deterministic, sorted, and writes only to the validated candidate path", async (context) => {
  const fixture = await sourceFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  const first = await buildSourceIdentity({ projectRoot: fixture.projectRoot });
  const second = await buildSourceIdentity({ projectRoot: fixture.projectRoot });
  assert.deepEqual(second, first);
  assert.equal(first.schemaVersion, 2);
  assert.match(first.aggregateSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    first.files.map((file) => file.path),
    [...first.files.map((file) => file.path)].sort(),
  );
  assert.equal(first.fileCount, first.files.length);
  assert.equal(first.totalBytes, first.files.reduce((sum, file) => sum + file.bytes, 0));

  const written = await writeCandidateSourceIdentity("candidate-2026-08-10", {
    projectRoot: fixture.projectRoot,
  });
  const expected = resolve(
    fixture.root,
    "output",
    "playwright",
    "candidate-2026-08-10",
    "source-identity.json",
  );
  assert.equal(written.outputPath, expected);
  const stored = JSON.parse(await readFile(expected, "utf8"));
  assert.equal(stored.candidate, "candidate-2026-08-10");
  assert.equal(stored.aggregateSha256, first.aggregateSha256);
  assert.equal(stored.fileCount, first.fileCount);
  await assert.rejects(
    writeCandidateSourceIdentity("candidate-2026-08-10", {
      projectRoot: fixture.projectRoot,
    }),
    /source identity already exists/,
    "an exact source identity must never be overwritten",
  );
});

test("candidate validation rejects traversal, separators, absolute paths, and ambiguous slugs", () => {
  assert.equal(validateCandidateName("final-candidate-01"), "final-candidate-01");
  for (const candidate of [
    "../escape",
    "..",
    "candidate/child",
    "candidate\\child",
    ".hidden",
    "candidate--",
    "UPPERCASE",
    "C:\\escape",
    "a".repeat(81),
  ]) {
    assert.throws(() => validateCandidateName(candidate), /candidate must be a lowercase slug/);
    assert.throws(() => resolveCandidateOutputPath(candidate), /candidate must be a lowercase slug/);
  }
});

test("generated, documentation, output, dependency, and secret-like files are excluded", async (context) => {
  const fixture = await sourceFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await Promise.all([
    fixture.write("dist/generated.js", "generated"),
    fixture.write("node_modules/example/index.js", "dependency"),
    fixture.write(".work/browser/state.json", "work"),
    fixture.write("output/playwright/old/source-identity.json", "old-output"),
    fixture.write("outputs/legacy.txt", "old-output"),
    fixture.write("docs/internal.md", "documentation"),
    fixture.write("app/docs/generated.ts", "excluded nested docs"),
    fixture.write("app/.env.production", "SECRET=value"),
    fixture.write("tests/private-key.pem", "not-a-real-key"),
    fixture.write("scripts/docs/generated.mjs", "excluded nested documentation"),
    fixture.write("scripts/secrets/operator.json", "not-a-real-secret"),
    fixture.write("scripts/operator-credentials.json", "not-a-real-credential"),
    fixture.write("scripts/generated-helper.ps1", "Write-Output 'not explicit'"),
  ]);

  const before = await buildSourceIdentity({ projectRoot: fixture.projectRoot });
  const paths = before.files.map((file) => file.path);
  for (const excluded of [
    "dist/generated.js",
    "node_modules/example/index.js",
    ".work/browser/state.json",
    "output/playwright/old/source-identity.json",
    "outputs/legacy.txt",
    "docs/internal.md",
    "app/docs/generated.ts",
    "app/.env.production",
    "tests/private-key.pem",
    "scripts/docs/generated.mjs",
    "scripts/secrets/operator.json",
    "scripts/operator-credentials.json",
    "scripts/generated-helper.ps1",
  ]) {
    assert.equal(paths.includes(excluded), false, `${excluded} must be excluded`);
  }

  await fixture.write("dist/generated.js", "mutated generated output");
  await fixture.write("app/.env.production", "SECRET=changed");
  const after = await buildSourceIdentity({ projectRoot: fixture.projectRoot });
  assert.deepEqual(after, before);
});

test("production operation scripts and the explicit Playwright wrapper bind the aggregate identity", async (context) => {
  const fixture = await sourceFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  const initial = await buildSourceIdentity({ projectRoot: fixture.projectRoot });
  const initialPaths = initial.files.map(({ path }) => path);
  for (const required of [
    "scripts/direct-operations-contract.mjs",
    "scripts/preflight-direct-d1.mjs",
    "scripts/release-integrity-check.mjs",
    "scripts/playwright-cli.ps1",
  ]) {
    assert.equal(initialPaths.includes(required), true, `${required} must bind the candidate`);
  }

  await fixture.write(
    "scripts/direct-operations-contract.mjs",
    "export const directContract = 'changed';\n",
  );
  const afterDirectContract = await buildSourceIdentity({
    projectRoot: fixture.projectRoot,
  });
  assert.notEqual(afterDirectContract.aggregateSha256, initial.aggregateSha256);
  assert.notEqual(
    afterDirectContract.files.find(
      ({ path }) => path === "scripts/direct-operations-contract.mjs",
    )?.sha256,
    initial.files.find(
      ({ path }) => path === "scripts/direct-operations-contract.mjs",
    )?.sha256,
  );

  await fixture.write(
    "scripts/preflight-direct-d1.mjs",
    "export const preflight = 'changed';\n",
  );
  const afterPreflight = await buildSourceIdentity({
    projectRoot: fixture.projectRoot,
  });
  assert.notEqual(
    afterPreflight.aggregateSha256,
    afterDirectContract.aggregateSha256,
  );
});

test("an allowlisted source mutation changes both its file hash and aggregate identity", async (context) => {
  const fixture = await sourceFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const before = await buildSourceIdentity({ projectRoot: fixture.projectRoot });
  await fixture.write("app/main.ts", "export const candidate = 'beta';\n");
  const after = await buildSourceIdentity({ projectRoot: fixture.projectRoot });
  assert.notEqual(after.aggregateSha256, before.aggregateSha256);
  assert.equal(after.fileCount, before.fileCount);
  assert.notEqual(
    after.files.find((file) => file.path === "app/main.ts")?.sha256,
    before.files.find((file) => file.path === "app/main.ts")?.sha256,
  );
});

async function sourceFixture() {
  const root = await mkdtemp(join(tmpdir(), "roadmap-source-identity-"));
  const projectRoot = join(root, "10_production_saas");
  const write = async (relativePath, contents) => {
    const absolutePath = join(projectRoot, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  };
  await Promise.all([
    write("package.json", JSON.stringify({ name: "roadmap-production-saas", private: true })),
    write("package-lock.json", "{\"lockfileVersion\":3}\n"),
    write("app/main.ts", "export const candidate = 'alpha';\n"),
    write("components/Card.tsx", "export function Card() { return null; }\n"),
    write("db/schema.ts", "export const schemaVersion = 1;\n"),
    write("drizzle/0001_fixture.sql", "create table fixture (id text primary key);\n"),
    write("lib/domain.ts", "export const domain = true;\n"),
    write("public/fixture.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n"),
    write("tests/domain.test.mjs", "export const syntheticTest = true;\n"),
    write("worker/index.ts", "export default {};\n"),
    write("scripts/functional-qa-server.mjs", "export const qa = true;\n"),
    write("scripts/source-identity.mjs", "export const identity = true;\n"),
    write(
      "scripts/direct-operations-contract.mjs",
      "export const directContract = true;\n",
    ),
    write("scripts/preflight-direct-d1.mjs", "export const preflight = true;\n"),
    write("scripts/release-integrity-check.mjs", "export const release = true;\n"),
    write("scripts/playwright-cli.ps1", "Write-Output 'synthetic wrapper'\n"),
  ]);
  return { root, projectRoot, write };
}
