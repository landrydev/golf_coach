import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDIA_UPLOAD_CONTENT_TYPE,
  MEDIA_UPLOAD_PROTOCOL_VERSION,
} from "../lib/media-upload-protocol.ts";
import {
  identityHeaders,
  startD1Worker,
  testOrigin,
} from "./support/d1-worker.mjs";

const POLICY_MAX_BYTES = 1_024;
const POLICY = JSON.stringify({
  version: "synthetic-streaming-overflow-v1",
  maxBytes: POLICY_MAX_BYTES,
  maxVideoDurationMs: 60_000,
  allowedMimeTypes: ["image/png"],
  accountMediaConsentRequired: false,
  golferMediaConsentRequired: false,
});
const coach = {
  email: "coach.a@example.test",
  name: "Coach Streaming Boundary",
};

test(
  "missing Content-Length overflow returns 413 and rolls back D1 and R2",
  { timeout: 120_000 },
  async () => {
    const worker = await startD1Worker({ MEDIA_UPLOAD_POLICY_JSON: POLICY });
    try {
      const envelope = await overflowingEnvelope();
      const response = await worker.dispatch("/api/media", {
        method: "POST",
        headers: {
          ...identityHeaders(coach.email, coach.name),
          "content-type": MEDIA_UPLOAD_CONTENT_TYPE,
          origin: testOrigin,
          "sec-fetch-site": "same-origin",
        },
        body: envelope.bytes,
      });
      if (response.status !== 413) {
        assert.equal(response.status, 413, await response.text());
      }
      assert.equal((await response.json()).error.code, "media_size_invalid");

      const [assets, details, audits] = await worker.inspect([
        { sql: "select count(*) as count from media_assets" },
        { sql: "select count(*) as count from media_asset_details" },
        {
          sql: "select count(*) as count from audit_events where action in ('media.upload', 'media.upload_failed')",
        },
      ]);
      assert.equal(assets.results[0].count, 0);
      assert.equal(details.results[0].count, 0);
      assert.equal(audits.results[0].count, 0);
      assert.deepEqual((await (await worker.media()).list()).objects, []);
    } finally {
      await worker.dispose();
    }
  },
);

async function overflowingEnvelope() {
  const advertisedFile = new Uint8Array(POLICY_MAX_BYTES);
  advertisedFile.set(pngSignature());
  const digest = await crypto.subtle.digest("SHA-256", advertisedFile);
  const metadataBytes = new TextEncoder().encode(
    JSON.stringify({
      altText: "Synthetic overflow boundary image",
      byteSize: advertisedFile.byteLength,
      caption: null,
      capturedAt: null,
      coachContext: null,
      durationMs: null,
      heightPixels: 1,
      mimeType: "image/png",
      orientation: "landscape",
      originalFilename: "synthetic-stream-overflow.png",
      posterMediaAssetId: null,
      protocolVersion: MEDIA_UPLOAD_PROTOCOL_VERSION,
      replacementForAssetId: null,
      replacementReason: null,
      sha256: hex(new Uint8Array(digest)),
      transcript: null,
      viewLabel: null,
      widthPixels: 2,
    }),
  );
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, metadataBytes.byteLength, false);
  const advertisedLength =
    prefix.byteLength + metadataBytes.byteLength + advertisedFile.byteLength;
  const bytes = new Uint8Array(advertisedLength + 1);
  bytes.set(prefix, 0);
  bytes.set(metadataBytes, prefix.byteLength);
  bytes.set(advertisedFile, prefix.byteLength + metadataBytes.byteLength);
  bytes[bytes.byteLength - 1] = 0xff;
  return { bytes };
}

function pngSignature() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
}

function hex(bytes) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
