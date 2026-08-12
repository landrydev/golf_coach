import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every upload and dormant metadata path guards external media references in its D1 batch", async () => {
  const [mediaSource, richSource] = await Promise.all([
    readFile(new URL("../lib/media.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/rich-coaching.ts", import.meta.url), "utf8"),
  ]);

  assert.match(mediaSource, /export function retainedMediaTransactionGuard/);
  assert.match(mediaSource, /export async function assertMediaStillRetained/);

  const markReady = exportedFunction(richSource, "markMediaAssetReady");
  assertOrdered(markReady, [
    "readyMediaTransactionGuard(input.accountId, posterMediaAssetId)",
    ".update(mediaAssetDetails)",
  ]);
  assert.match(markReady, /assertMediaStillReady\(input\.accountId, \[posterMediaAssetId\]\)/);

  const reserveReplacement = exportedFunction(richSource, "replaceMediaAssetMetadata");
  assertOrdered(reserveReplacement, [
    "retainedMediaTransactionGuard(input.accountId, replacedMediaAssetId)",
    "db.insert(mediaAssetReplacements)",
  ]);
  assert.match(
    reserveReplacement,
    /assertMediaStillRetained\(input\.accountId, replacedMediaAssetId\)/,
  );

  const bufferedUpload = exportedFunction(mediaSource, "storeMediaAsset");
  const streamedUpload = exportedFunction(mediaSource, "storeStreamedMediaAsset");
  assert.match(bufferedUpload, /return storePreparedMediaAsset\(input,/);
  assert.match(streamedUpload, /return storePreparedMediaAsset\(input,/);

  const sharedUploadCommit = namedFunction(mediaSource, "storePreparedMediaAsset");
  assertOrdered(sharedUploadCommit, [
    "readyMediaTransactionGuard(input.accountId, posterMediaAssetId)",
    "db.insert(mediaAssetDetails)",
  ]);
  assertOrdered(sharedUploadCommit, [
    "retainedMediaTransactionGuard(input.accountId, input.replacementForAssetId)",
    "db.insert(mediaAssetReplacements)",
  ]);
});

function exportedFunction(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must remain exported`);
  const end = source.indexOf("\nexport ", start + 1);
  return source.slice(start, end === -1 ? source.length : end);
}

function namedFunction(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `${name} must remain present`);
  const end = source.indexOf("\nexport ", start + 1);
  return source.slice(start, end === -1 ? source.length : end);
}

function assertOrdered(source, fragments) {
  let previous = -1;
  for (const fragment of fragments) {
    const current = source.indexOf(fragment);
    assert.ok(current > previous, `${fragment} must appear in guarded batch order`);
    previous = current;
  }
}
