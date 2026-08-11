import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RequestError } from "../lib/http.ts";
import {
  createMediaUploadBody,
  MEDIA_UPLOAD_CONTENT_TYPE,
  MEDIA_UPLOAD_METADATA_MAX_BYTES,
  MEDIA_UPLOAD_PROTOCOL_VERSION,
} from "../lib/media-upload-protocol.ts";
import { readMediaUploadEnvelope } from "../lib/media-upload-reader.ts";

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

test("the versioned browser envelope carries exact size and digest and reconstructs the file stream", async () => {
  const file = new File([png], "synthetic.png", { type: "image/png" });
  const body = await createMediaUploadBody(file, fields());
  assert.equal(body.type, MEDIA_UPLOAD_CONTENT_TYPE);

  const decoded = await readMediaUploadEnvelope(request(body), 50_000_000);
  assert.equal(decoded.metadata.protocolVersion, MEDIA_UPLOAD_PROTOCOL_VERSION);
  assert.equal(decoded.metadata.byteSize, png.byteLength);
  assert.equal(decoded.metadata.sha256, await digestHex(png));
  assert.deepEqual(decoded.signatureBytes, png);
  assert.deepEqual(
    new Uint8Array(await new Response(decoded.body).arrayBuffer()),
    png,
  );
});

test("metadata shape, protocol version, digest, and declared length fail before file persistence", async () => {
  for (const [change, code] of [
    [(metadata) => ({ ...metadata, unexpected: true }), "invalid_media_metadata"],
    [
      (metadata) => ({ ...metadata, protocolVersion: "roadmap-media-upload-v0" }),
      "invalid_media_metadata",
    ],
    [(metadata) => ({ ...metadata, sha256: "A".repeat(64) }), "invalid_media_metadata"],
  ]) {
    const body = manualEnvelope(change(metadata(png.byteLength)), png);
    await assert.rejects(
      readMediaUploadEnvelope(request(body), 50_000_000),
      (error) => error instanceof RequestError && error.code === code,
    );
  }

  const valid = manualEnvelope(metadata(png.byteLength), png);
  await assert.rejects(
    readMediaUploadEnvelope(request(valid, valid.size + 1), 50_000_000),
    (error) =>
      error instanceof RequestError && error.code === "invalid_media_envelope",
  );
});

test("the streamed file proves early EOF and trailing-byte absence", async () => {
  const early = manualEnvelope(metadata(png.byteLength + 1), png);
  const earlyDecoded = await readMediaUploadEnvelope(
    request(early, null),
    50_000_000,
  );
  await assert.rejects(
    new Response(earlyDecoded.body).arrayBuffer(),
    (error) =>
      error instanceof RequestError && error.code === "invalid_media_envelope",
  );

  const trailing = manualEnvelope(metadata(png.byteLength), png, new Uint8Array([1]));
  const trailingDecoded = await readMediaUploadEnvelope(
    request(trailing, null),
    50_000_000,
  );
  await assert.rejects(
    new Response(trailingDecoded.body).arrayBuffer(),
    (error) =>
      error instanceof RequestError && error.code === "invalid_media_envelope",
  );
});

test("oversized metadata and policy-exceeding files fail before a file stream is returned", async () => {
  const oversizedPrefix = new Uint8Array(4);
  new DataView(oversizedPrefix.buffer).setUint32(
    0,
    MEDIA_UPLOAD_METADATA_MAX_BYTES + 1,
    false,
  );
  await assert.rejects(
    readMediaUploadEnvelope(
      request(new Blob([oversizedPrefix], { type: MEDIA_UPLOAD_CONTENT_TYPE })),
      50_000_000,
    ),
    (error) =>
      error instanceof RequestError && error.code === "invalid_media_envelope",
  );

  const body = manualEnvelope(metadata(png.byteLength), png);
  const accepted = await readMediaUploadEnvelope(
    request(body),
    png.byteLength,
  );
  assert.equal(
    (await new Response(accepted.body).arrayBuffer()).byteLength,
    png.byteLength,
  );
  await assert.rejects(
    readMediaUploadEnvelope(request(body), png.byteLength - 1),
    (error) => error instanceof RequestError && error.code === "media_size_invalid",
  );
  await assert.rejects(
    readMediaUploadEnvelope(request(body, body.size + 1), png.byteLength),
    (error) =>
      error instanceof RequestError &&
      error.status === 413 &&
      error.code === "media_size_invalid",
  );
});

test("fatal metadata encoding, corrupt prefixes, wrong types, and encoded bodies fail closed", async () => {
  const fatalJson = new Uint8Array([0xff, 0xff]);
  const fatalPrefix = new Uint8Array(4);
  new DataView(fatalPrefix.buffer).setUint32(0, fatalJson.byteLength, false);
  await assert.rejects(
    readMediaUploadEnvelope(
      request(
        new Blob([fatalPrefix, fatalJson, png], {
          type: MEDIA_UPLOAD_CONTENT_TYPE,
        }),
      ),
      50_000_000,
    ),
    (error) =>
      error instanceof RequestError && error.code === "invalid_media_metadata",
  );

  await assert.rejects(
    readMediaUploadEnvelope(
      request(
        new Blob([new Uint8Array([0, 0, 0])], {
          type: MEDIA_UPLOAD_CONTENT_TYPE,
        }),
      ),
      50_000_000,
    ),
    (error) =>
      error instanceof RequestError && error.code === "invalid_media_envelope",
  );

  for (const headers of [
    { "content-type": "application/octet-stream" },
    {
      "content-encoding": "gzip",
      "content-type": MEDIA_UPLOAD_CONTENT_TYPE,
    },
  ]) {
    const guarded = new Request("https://roadmap.example/api/media", {
      method: "POST",
      headers,
      body: new Blob([png]),
    });
    await assert.rejects(
      readMediaUploadEnvelope(guarded, 50_000_000),
      (error) =>
        error instanceof RequestError &&
        ["unsupported_media_type", "unsupported_content_encoding"].includes(
          error.code,
        ),
    );
    assert.equal(guarded.bodyUsed, false);
  }
});

test("spoofed or absent Content-Length cannot hide actual overflow and cancels the source", async () => {
  for (const declaredLength of ["advertised", null]) {
    const advertisedBytes = png.byteLength;
    const body = manualEnvelope(
      metadata(advertisedBytes),
      png,
      new Uint8Array([0xff]),
    );
    const bytes = new Uint8Array(await body.arrayBuffer());
    const tracked = trackingRequest(
      bytes,
      declaredLength === "advertised" ? body.size - 1 : null,
    );
    const decoded = await readMediaUploadEnvelope(
      tracked.request,
      advertisedBytes,
    );
    await assert.rejects(
      new Response(decoded.body).arrayBuffer(),
      (error) =>
        error instanceof RequestError &&
        error.status === 413 &&
        error.code === "media_size_invalid",
    );
    assert.equal(tracked.wasCanceled(), true);
  }
});

test("the large-file route owns a stream and R2 verifies it without framework or route whole-body parsing", async () => {
  const [config, reader, pipeline, media, route] = await Promise.all([
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/media-upload-reader.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/media-upload-pipeline.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/media.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/media/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(config, /bodySizeLimit/);
  assert.doesNotMatch(reader, /request\.(?:arrayBuffer|formData)\s*\(/);
  assert.match(reader, /MEDIA_UPLOAD_METADATA_MAX_BYTES/);
  assert.match(reader, /body\.contains trailing bytes|contains trailing bytes/);
  assert.match(pipeline, /new FixedLengthStream\(size\)/);
  assert.match(media, /runFixedLengthMediaUploadPipeline\(/);
  assert.match(media, /sha256: input\.contentSha256/);
  assert.match(media, /assertStoredObject\(stored, input\.byteSize/);
  assert.match(
    media,
    /rollbackRejectedUpload\(input\.accountId, input\.mediaAssetId\)/,
  );
  assert.equal(
    [...media.matchAll(/consentGrantTransactionGuard\(/g)].length,
    2,
  );
  assert.match(media, /media_consent_guard_unavailable/);
  assert.match(media, /media-upload-before-pending-commit/);
  assert.match(media, /media-upload-before-ready-commit/);
  assert.match(media, /consentGrantRequirementsCurrent\(/);
  assert.match(media, /media-next-upload-cleanup-delete/);
  assert.match(
    media,
    /MEDIA\.delete\(objectKey\)[\s\S]*?MEDIA\.head\(objectKey\)/,
  );
  assert.match(media, /storage_cleanup_failed/);
  assert.match(media, /media_upload_cleanup_failed/);
  assert.match(route, /const consentRequirements:/);
  assert.ok(
    [...route.matchAll(/consentRequirements,/g)].length >= 2,
    "both streamed and legacy media storage calls must receive the captured requirement",
  );
  const readPosition = route.indexOf("readMediaUploadEnvelope(request");
  for (const prerequisite of [
    "assertSameOrigin(request)",
    "requireApiIdentity()",
    "getOrCreateAccountForIdentity(authentication.identity)",
    "readMediaUploadPolicy(env.MEDIA_UPLOAD_POLICY_JSON)",
    "requireCurrentConsentGrant(",
  ]) {
    const position = route.indexOf(prerequisite);
    assert.ok(position >= 0 && position < readPosition, `${prerequisite} must precede body reading`);
  }
});

function fields() {
  return {
    altText: "Synthetic PNG",
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
  };
}

function metadata(byteSize) {
  return {
    ...fields(),
    byteSize,
    mimeType: "image/png",
    originalFilename: "synthetic.png",
    protocolVersion: MEDIA_UPLOAD_PROTOCOL_VERSION,
    sha256: "0".repeat(64),
  };
}

function manualEnvelope(metadataValue, file, trailing = new Uint8Array(0)) {
  const json = new TextEncoder().encode(JSON.stringify(metadataValue));
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, json.byteLength, false);
  return new Blob([prefix, json, file, trailing], {
    type: MEDIA_UPLOAD_CONTENT_TYPE,
  });
}

function request(body, declaredLength = body.size) {
  const headers = { "content-type": MEDIA_UPLOAD_CONTENT_TYPE };
  if (declaredLength !== null) {
    headers["content-length"] = String(declaredLength);
  }
  return new Request("https://roadmap.example/api/media", {
    method: "POST",
    headers,
    body,
  });
}

function trackingRequest(bytes, declaredLength) {
  let canceled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
    },
    cancel() {
      canceled = true;
    },
  });
  const headers = { "content-type": MEDIA_UPLOAD_CONTENT_TYPE };
  if (declaredLength !== null) {
    headers["content-length"] = String(declaredLength);
  }
  return {
    request: new Request("https://roadmap.example/api/media", {
      method: "POST",
      headers,
      body,
      duplex: "half",
    }),
    wasCanceled: () => canceled,
  };
}

async function digestHex(value) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
