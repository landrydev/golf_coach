import assert from "node:assert/strict";
import test from "node:test";
import { startFunctionalQaServer } from "../scripts/functional-qa-server.mjs";
import { createMediaUploadBody } from "../lib/media-upload-protocol.ts";

const ADVERTISED_UPLOAD_REGRESSION_BYTES = 2_282_761;

test(
  "the built QA HTTP path accepts and persists a versioned private-media upload above Vinext's default 1 MiB action-body ceiling",
  { timeout: 120_000 },
  async (context) => {
    const runtime = await startFunctionalQaServer({
      host: "127.0.0.1",
      port: 0,
      eagerScenarios: ["fresh"],
    });
    context.after(() => runtime.close());

    const entry = await fetch(`${runtime.origin}/__qa/fresh/app`, {
      redirect: "manual",
    });
    assert.equal(entry.status, 302);
    const scenarioCookie = firstCookie(entry.headers.get("set-cookie"));

    const upload = await browserUpload(
      runtime.origin,
      scenarioCookie,
      uploadForm("qa-advertised-limit-regression.png", largePngBytes()),
    );
    if (upload.status !== 201) {
      assert.equal(upload.status, 201, await upload.text());
    }
    const uploadedAsset = (await upload.json()).asset;
    assert.equal(uploadedAsset.status, "ready");
    assert.equal(uploadedAsset.byteSize, ADVERTISED_UPLOAD_REGRESSION_BYTES);

    const [rows] = await runtime.worker.inspect([
      {
        sql: `select status, byte_size as byteSize, object_key as objectKey
                from media_assets
               where id = ?`,
        params: [uploadedAsset.id],
      },
    ]);
    assert.equal(rows.results.length, 1);
    assert.equal(rows.results[0].status, "ready");
    assert.equal(rows.results[0].byteSize, ADVERTISED_UPLOAD_REGRESSION_BYTES);
    const storedObject = await (await runtime.worker.media()).head(
      rows.results[0].objectKey,
    );
    assert.ok(storedObject);
    assert.equal(storedObject.size, ADVERTISED_UPLOAD_REGRESSION_BYTES);

    const delivered = await fetch(
      `${runtime.origin}/api/media/${encodeURIComponent(uploadedAsset.id)}`,
      { headers: { cookie: scenarioCookie } },
    );
    assert.equal(delivered.status, 200);
    assert.equal(
      (await delivered.arrayBuffer()).byteLength,
      ADVERTISED_UPLOAD_REGRESSION_BYTES,
    );
  },
);

test(
  "the QA HTTP proxy preserves a streamed media client error without terminating its response body",
  { timeout: 120_000 },
  async (context) => {
    const runtime = await startFunctionalQaServer({
      host: "127.0.0.1",
      port: 0,
      eagerScenarios: ["fresh"],
    });
    context.after(() => runtime.close());

    const entry = await fetch(`${runtime.origin}/__qa/fresh/app`, {
      redirect: "manual",
    });
    assert.equal(entry.status, 302);
    const scenarioCookie = firstCookie(entry.headers.get("set-cookie"));

    // This is the exact 2,283,217-byte envelope shape recorded by the r8
    // browser trace: the file is valid, but its required alt text is empty.
    // The production worker must reject it with a readable 400 response; the
    // local browser proxy must not turn that response into a 500 `terminated`.
    const body = await uploadForm("og.png", largePngBytes(), {
      altText: "",
      heightPixels: 909,
      orientation: "unknown",
      widthPixels: 1731,
    });
    assert.equal(body.size, 2_283_217);
    const rejected = await fetch(`${runtime.origin}/api/media`, {
      method: "POST",
      headers: {
        cookie: scenarioCookie,
        origin: runtime.origin,
      },
      body,
    });

    assert.equal(rejected.status, 400);
    assert.match(rejected.headers.get("content-type") ?? "", /^application\/json\b/);
    assert.match(rejected.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);
    assert.deepEqual(await rejected.json(), {
      error: {
        code: "invalid_media_metadata",
        message: "altText is invalid.",
      },
    });
  },
);

test(
  "the QA-only one-shot storage fault persists a real failed upload and a processing retry succeeds",
  { timeout: 120_000 },
  async (context) => {
    const runtime = await startFunctionalQaServer({
      host: "127.0.0.1",
      port: 0,
      eagerScenarios: ["fresh"],
    });
    context.after(() => runtime.close());

    const entry = await fetch(`${runtime.origin}/__qa/fresh/app`, {
      redirect: "manual",
    });
    assert.equal(entry.status, 302);
    const scenarioCookie = firstCookie(entry.headers.get("set-cookie"));
    assert.match(scenarioCookie, /^roadmap_qa_scenario=fresh\b/);

    const faultUrl = `${runtime.origin}/__qa/faults/media-next-storage-write`;
    assert.equal(
      (
        await fetch(faultUrl, {
          method: "POST",
          headers: { origin: runtime.origin },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(faultUrl, {
          headers: { cookie: scenarioCookie, origin: runtime.origin },
        })
      ).status,
      405,
    );
    assert.equal(
      (
        await fetch(faultUrl, {
          method: "POST",
          headers: {
            cookie: scenarioCookie,
            origin: "https://not-the-functional-qa-origin.example.test",
          },
        })
      ).status,
      403,
    );
    const armed = await fetch(faultUrl, {
      method: "POST",
      headers: { cookie: scenarioCookie, origin: runtime.origin },
    });
    assert.equal(armed.status, 202);
    assert.deepEqual(await armed.json(), { armed: true });

    const failedUpload = await browserUpload(
      runtime.origin,
      scenarioCookie,
      uploadForm("qa-storage-failure.png"),
    );
    assert.equal(failedUpload.status, 502);
    assert.equal((await failedUpload.json()).error.code, "media_upload_failed");

    const [account, failedRows, failedAudits] = await runtime.worker.inspect([
      {
        sql: "select id from accounts where normalized_email = 'qa.fresh@example.test'",
      },
      {
        sql: `select id, status, failure_code as failureCode,
                    object_key as objectKey
               from media_assets
              where original_filename = 'qa-storage-failure.png'`,
      },
      {
        sql: `select action, outcome
                from audit_events
               where action = 'media.upload_failed'
               order by occurred_at`,
      },
    ]);
    assert.ok(account.results[0]?.id);
    assert.equal(failedRows.results.length, 1);
    const failedAsset = failedRows.results[0];
    assert.equal(failedAsset.status, "failed");
    assert.equal(failedAsset.failureCode, "storage_write_failed");
    assert.deepEqual(failedAudits.results, [
      { action: "media.upload_failed", outcome: "success" },
    ]);
    assert.equal(
      await (await runtime.worker.media()).head(failedAsset.objectKey),
      null,
    );

    const retry = await browserUpload(
      runtime.origin,
      scenarioCookie,
      uploadForm("qa-storage-retry.png", pngBytes(), {
        replacementForAssetId: failedAsset.id,
        replacementReason: "processing_retry",
      }),
    );
    if (retry.status !== 201) {
      assert.equal(retry.status, 201, await retry.text());
    }
    const retryAsset = (await retry.json()).asset;
    assert.equal(retryAsset.status, "ready");
    assert.notEqual(retryAsset.id, failedAsset.id);

    const [assets, replacement, successAudits] = await runtime.worker.inspect([
      {
        sql: "select id, status, object_key as objectKey from media_assets where id in (?, ?) order by id",
        params: [failedAsset.id, retryAsset.id],
      },
      {
        sql: `select replaced_media_asset_id as replacedId,
                    replacement_media_asset_id as replacementId,
                    reason_code as reasonCode
               from media_asset_replacements
              where replaced_media_asset_id = ?`,
        params: [failedAsset.id],
      },
      {
        sql: "select count(*) as count from audit_events where target_id = ? and action = 'media.upload' and outcome = 'success'",
        params: [retryAsset.id],
      },
    ]);
    assert.deepEqual(
      new Map(assets.results.map((asset) => [asset.id, asset.status])),
      new Map([
        [failedAsset.id, "failed"],
        [retryAsset.id, "ready"],
      ]),
    );
    assert.deepEqual(replacement.results, [
      {
        replacedId: failedAsset.id,
        replacementId: retryAsset.id,
        reasonCode: "processing_retry",
      },
    ]);
    assert.equal(successAudits.results[0].count, 1);
    const readyObjectKey = assets.results.find((asset) => asset.id === retryAsset.id)?.objectKey;
    assert.ok(readyObjectKey);
    assert.ok(await (await runtime.worker.media()).head(readyObjectKey));
  },
);

function uploadForm(filename, bytes = pngBytes(), overrides = {}) {
  return createMediaUploadBody(
    new File([bytes], filename, { type: "image/png" }),
    {
      altText: `Synthetic ${filename} image`,
      caption: null,
      capturedAt: null,
      coachContext: null,
      durationMs: null,
      heightPixels: 1,
      orientation: "landscape",
      posterMediaAssetId: null,
      replacementForAssetId: null,
      replacementReason: null,
      transcript: null,
      viewLabel: null,
      widthPixels: 2,
      ...overrides,
    },
  );
}

function largePngBytes() {
  const bytes = new Uint8Array(ADVERTISED_UPLOAD_REGRESSION_BYTES);
  bytes.set(pngBytes());
  return bytes;
}

async function browserUpload(origin, scenarioCookie, bodyPromise) {
  const body = await bodyPromise;
  return fetch(`${origin}/api/media`, {
    method: "POST",
    headers: {
      cookie: scenarioCookie,
      "idempotency-key": crypto.randomUUID(),
      origin,
    },
    body,
  });
}

function firstCookie(value) {
  return value?.split(",", 1)[0]?.split(";", 1)[0] ?? "";
}

function pngBytes() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01,
  ]);
}
