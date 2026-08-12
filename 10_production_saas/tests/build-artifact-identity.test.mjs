import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  buildArtifactIdentity,
  resolveCandidateBuildIdentityPath,
  validateBuildArtifactIdentity,
  writeCandidateBuildIdentity,
} from "../scripts/build-artifact-identity.mjs";

test("dist identity is deterministic, sorted, complete, and change-sensitive", async (context) => {
  const fixture = await buildFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  const first = await buildArtifactIdentity({ projectRoot: fixture.projectRoot });
  const second = await buildArtifactIdentity({ projectRoot: fixture.projectRoot });
  assert.deepEqual(second, first);
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.root, "dist");
  assert.deepEqual(
    first.files.map(({ path }) => path),
    ["dist/client/assets/app.js", "dist/client/favicon.svg", "dist/server/index.js"],
  );
  assert.equal(first.fileCount, first.files.length);
  assert.equal(first.totalBytes, first.files.reduce((sum, file) => sum + file.bytes, 0));
  assert.equal(validateBuildArtifactIdentity(first), first);

  await fixture.write("dist/client/assets/app.js", "export const build = 'changed';\n");
  const changed = await buildArtifactIdentity({ projectRoot: fixture.projectRoot });
  assert.notEqual(changed.aggregateSha256, first.aggregateSha256);
  assert.notEqual(
    changed.files.find(({ path }) => path === "dist/client/assets/app.js")?.sha256,
    first.files.find(({ path }) => path === "dist/client/assets/app.js")?.sha256,
  );
});

test("dist identity rejects candidate traversal, symlinks, and secret-like paths", async (context) => {
  const fixture = await buildFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  for (const candidate of ["../escape", "candidate/child", "C:\\escape", "UPPER"] ) {
    assert.throws(
      () => resolveCandidateBuildIdentityPath(candidate, fixture.projectRoot),
      /candidate must be a lowercase slug/,
    );
  }

  const external = join(fixture.root, "external-build-content");
  await mkdir(external);
  await symlink(
    external,
    join(fixture.projectRoot, "dist", "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(
    buildArtifactIdentity({ projectRoot: fixture.projectRoot }),
    /symbolic links are not allowed/,
  );
  await rm(join(fixture.projectRoot, "dist", "linked"), { force: true });

  await fixture.write("dist/client/.env.production", "SYNTHETIC_SECRET=value\n");
  await assert.rejects(
    buildArtifactIdentity({ projectRoot: fixture.projectRoot }),
    /secret-like build artifact path/,
  );
});

test("candidate dist identity is create-only and never overwrites", async (context) => {
  const fixture = await buildFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const candidate = "candidate-build-01";

  const written = await writeCandidateBuildIdentity(candidate, {
    projectRoot: fixture.projectRoot,
  });
  const expected = resolve(
    fixture.root,
    "output",
    "playwright",
    candidate,
    "build-identity.json",
  );
  assert.equal(written.outputPath, expected);
  const before = await readFile(expected, "utf8");
  await fixture.write("dist/server/index.js", "export default { changed: true };\n");
  await assert.rejects(
    writeCandidateBuildIdentity(candidate, { projectRoot: fixture.projectRoot }),
    /build identity already exists/,
  );
  assert.equal(await readFile(expected, "utf8"), before);
});

async function buildFixture() {
  const root = await mkdtemp(join(tmpdir(), "roadmap-build-identity-"));
  const projectRoot = join(root, "10_production_saas");
  const write = async (relativePath, contents) => {
    const absolutePath = join(projectRoot, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  };
  await Promise.all([
    write(
      "package.json",
      JSON.stringify({ name: "roadmap-production-saas", private: true }),
    ),
    write("dist/client/assets/app.js", "export const build = 'stable';\n"),
    write("dist/client/favicon.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n"),
    write("dist/server/index.js", "export default {};\n"),
  ]);
  return { root, projectRoot, write };
}
