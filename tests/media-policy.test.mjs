import assert from "node:assert/strict";
import test from "node:test";
import {
  fileSignatureMatches,
  maximumSupportedMediaUploadBytes,
  mediaKindForMimeType,
  readMediaUploadPolicy,
} from "../lib/media-policy.ts";

const configuredPolicy = JSON.stringify({
  version: "synthetic-qa-v1",
  maxBytes: 25_000_000,
  maxVideoDurationMs: 120_000,
  allowedMimeTypes: ["image/png", "image/jpeg", "video/mp4", "video/webm"],
  accountMediaConsentRequired: true,
  golferMediaConsentRequired: true,
});

test("media upload policy is explicit, bounded, and fail closed", () => {
  assert.equal(readMediaUploadPolicy(undefined), null);
  assert.equal(readMediaUploadPolicy("not-json"), null);
  assert.equal(
    readMediaUploadPolicy(
      JSON.stringify({
        version: "synthetic-qa-v1",
        maxBytes: 25_000_000,
        maxVideoDurationMs: 120_000,
        allowedMimeTypes: ["text/html"],
        accountMediaConsentRequired: true,
        golferMediaConsentRequired: true,
      }),
    ),
    null,
  );
  assert.equal(
    readMediaUploadPolicy(
      JSON.stringify({
        version: "synthetic-qa-v1",
        maxBytes: 25_000_000,
        maxVideoDurationMs: 120_000,
        allowedMimeTypes: ["image/png", "image/png"],
        accountMediaConsentRequired: true,
        golferMediaConsentRequired: true,
      }),
    ),
    null,
  );

  assert.deepEqual(readMediaUploadPolicy(configuredPolicy), {
    version: "synthetic-qa-v1",
    maxBytes: 25_000_000,
    maxVideoDurationMs: 120_000,
    allowedMimeTypes: ["image/png", "image/jpeg", "video/mp4", "video/webm"],
    accountMediaConsentRequired: true,
    golferMediaConsentRequired: true,
  });

  assert.equal(maximumSupportedMediaUploadBytes, 50_000_000);
  assert.equal(
    readMediaUploadPolicy(
      JSON.stringify({
        version: "synthetic-qa-v1",
        maxBytes: maximumSupportedMediaUploadBytes + 1,
        maxVideoDurationMs: 120_000,
        allowedMimeTypes: ["image/png"],
        accountMediaConsentRequired: true,
        golferMediaConsentRequired: true,
      }),
    ),
    null,
  );
});

test("media kinds and file signatures reject MIME-only spoofing", () => {
  assert.equal(mediaKindForMimeType("image/png"), "image");
  assert.equal(mediaKindForMimeType("video/mp4"), "video");
  assert.equal(mediaKindForMimeType("text/csv"), "document");

  assert.equal(
    fileSignatureMatches(
      "image/png",
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    true,
  );
  assert.equal(
    fileSignatureMatches("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xdb])),
    true,
  );
  assert.equal(
    fileSignatureMatches(
      "image/webp",
      Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]),
    ),
    true,
  );
  assert.equal(
    fileSignatureMatches(
      "video/mp4",
      Uint8Array.from([0, 0, 0, 24, ...Buffer.from("ftypisom")]),
    ),
    true,
  );
  assert.equal(
    fileSignatureMatches("video/webm", Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])),
    true,
  );
  assert.equal(
    fileSignatureMatches("image/png", Uint8Array.from(Buffer.from("<script>alert(1)</script>"))),
    false,
  );
  assert.equal(
    fileSignatureMatches(
      "text/csv",
      Uint8Array.from(Buffer.from("Club,Carry distance\n7 iron,142.5\n", "utf8")),
    ),
    true,
  );
  assert.equal(
    fileSignatureMatches(
      "text/csv",
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("Name,Value\nA,1\n")]),
    ),
    false,
  );
  assert.equal(
    fileSignatureMatches(
      "text/csv",
      Uint8Array.from(Buffer.from("<script>,Value\nalert(1),1\n", "utf8")),
    ),
    false,
  );
  assert.equal(
    fileSignatureMatches("text/csv", Uint8Array.from([0x43, 0x61, 0xff, 0x2c, 0x42, 0x0a, 0x31, 0x2c, 0x32])),
    false,
  );
});
