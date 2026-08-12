import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the exact built Vinext worker retains its default 1 MiB Server Action limit", async () => {
  const worker = await readFile(
    new URL("../dist/server/index.js", import.meta.url),
    "utf8",
  );
  assert.match(worker, /var __MAX_ACTION_BODY_SIZE = 1048576;/);
  assert.doesNotMatch(worker, /var __MAX_ACTION_BODY_SIZE = 52428800;/);
  assert.match(worker, /application\/vnd\.roadmap\.media-upload/);
  assert.match(worker, /roadmap-media-upload-v1/);
});
