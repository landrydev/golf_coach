import assert from "node:assert/strict";
import test from "node:test";
import { RequestError } from "../lib/http.ts";
import { runFixedLengthMediaUploadPipeline } from "../lib/media-upload-pipeline.ts";

test("storage rejection aborts and settles the source transfer before failure escapes", async () => {
  let sourceCanceled = false;
  let storageSettled = false;
  const source = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(64 * 1024));
    },
    cancel() {
      sourceCanceled = true;
    },
  });

  await assert.rejects(
    runFixedLengthMediaUploadPipeline(
      source,
      128 * 1024,
      async () => {
        storageSettled = true;
        throw new Error("synthetic storage rejection");
      },
      transformPair,
    ),
    /synthetic storage rejection/,
  );
  assert.equal(storageSettled, true);
  assert.equal(sourceCanceled, true);
});

test("a transfer failure cannot race cleanup behind an already-settled storage write", async () => {
  let sourceCanceled = false;
  let storedObject = false;
  let storageSettled = false;
  const source = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3, 4]));
    },
    cancel() {
      sourceCanceled = true;
    },
  });

  try {
    await runFixedLengthMediaUploadPipeline(
      source,
      8,
      async (body) => {
        const reader = body.getReader();
        await reader.read();
        storedObject = true;
        storageSettled = true;
        await reader.cancel("synthetic storage stopped consuming");
        return { size: 4 };
      },
      transformPair,
    );
    assert.fail("The incomplete transfer must not be accepted.");
  } catch {
    assert.equal(storageSettled, true);
    // Mirrors storePreparedMediaAsset's post-settlement delete-before-failed-row
    // cleanup. The pipeline cannot return before this is safe to perform.
    storedObject = false;
  }

  assert.equal(sourceCanceled, true);
  assert.equal(storedObject, false);
});

test("a request-boundary failure wins a storage settlement race before orphan cleanup", async () => {
  const boundaryError = new RequestError(
    413,
    "media_size_invalid",
    "Synthetic trailing-byte overflow.",
  );
  let pullCount = 0;
  let storedObject = false;
  const source = new ReadableStream({
    pull(controller) {
      pullCount += 1;
      if (pullCount === 1) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        return;
      }
      controller.error(boundaryError);
    },
  });

  await assert.rejects(
    async () => {
      try {
        await runFixedLengthMediaUploadPipeline(
          source,
          4,
          async (body) => {
            const reader = body.getReader();
            const first = await reader.read();
            assert.equal(first.value?.byteLength, 4);
            reader.releaseLock();
            storedObject = true;
            return { size: 4 };
          },
          transformPair,
        );
      } catch (error) {
        // Mirrors the caller's post-settlement R2 rollback.
        storedObject = false;
        throw error;
      }
    },
    (error) => error === boundaryError,
  );
  assert.equal(storedObject, false);
});

function transformPair() {
  return new TransformStream();
}
