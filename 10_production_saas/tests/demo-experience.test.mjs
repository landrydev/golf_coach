import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("the public synthetic demo keeps auth navigation outside RSC prefetch", async () => {
  const page = await readFile(path.join(projectRoot, "app/demo/page.tsx"), "utf8");
  const experience = await readFile(
    path.join(projectRoot, "app/demo/DemoExperience.tsx"),
    "utf8",
  );
  const authLink = await readFile(
    path.join(projectRoot, "app/demo/DemoAuthLink.tsx"),
    "utf8",
  );

  assert.match(page, /<Link href="\/" prefetch=\{false\}>Roadmap<\/Link>/);
  assert.match(page, /<DemoAuthLink>Sign in<\/DemoAuthLink>/);
  assert.doesNotMatch(page, /href="\/auth\/login/);
  assert.match(authLink, /^"use client";/);
  assert.match(authLink, /<a href="\/auth\/login\?return_to=%2Fapp">\{children\}<\/a>/);
  assert.match(page, /Interactive synthetic demo — fictional records/);
  assert.match(experience, /<button type="button" onClick=\{reset\}>Reset demo<\/button>/);
  assert.match(experience, />Reset demo</);
  assert.match(experience, /saves nothing/);
});
