import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CLIENT_MUTATION_MAX_RESPONSE_BYTES,
  CLIENT_MUTATION_TIMEOUT_MS,
  ClientMutationOutcomeUnknownError,
} from "../lib/client-mutation-recovery.ts";
import {
  CLIENT_UPLOAD_MAX_TIMEOUT_MS,
  CLIENT_UPLOAD_SERVER_OVERHEAD_MS,
  CLIENT_UPLOAD_THROUGHPUT_FLOOR_BYTES_PER_SECOND,
  clientMediaUploadTimeoutMs,
  requestClientUpload,
} from "../lib/client-upload-recovery.ts";
import { MEDIA_UPLOAD_CONTENT_TYPE } from "../lib/media-upload-protocol.ts";

const EXPECTED_URL = "http://client.invalid/api/media";

test("media upload deadlines are size-aware, conservative, and hard bounded", () => {
  const small = clientMediaUploadTimeoutMs(1);
  assert.ok(small > CLIENT_MUTATION_TIMEOUT_MS);
  assert.equal(small, CLIENT_UPLOAD_SERVER_OVERHEAD_MS + 1);

  const maximumEnvelopeBytes = 50_000_000 + 4 + 32 * 1024;
  const maximumPolicyUpload = clientMediaUploadTimeoutMs(maximumEnvelopeBytes);
  assert.equal(
    maximumPolicyUpload,
    Math.min(
      CLIENT_UPLOAD_MAX_TIMEOUT_MS,
      CLIENT_UPLOAD_SERVER_OVERHEAD_MS +
        Math.ceil(
          (maximumEnvelopeBytes * 1_000) /
            CLIENT_UPLOAD_THROUGHPUT_FLOOR_BYTES_PER_SECOND,
        ),
    ),
  );
  assert.ok(maximumPolicyUpload >= 6 * 60_000);
  assert.ok(maximumPolicyUpload <= CLIENT_UPLOAD_MAX_TIMEOUT_MS);
  assert.equal(
    clientMediaUploadTimeoutMs(Number.MAX_SAFE_INTEGER),
    CLIENT_UPLOAD_MAX_TIMEOUT_MS,
  );
  for (const invalid of [0, -1, 1.5, Number.POSITIVE_INFINITY]) {
    assert.throws(() => clientMediaUploadTimeoutMs(invalid), /positive safe integer/);
  }
});

test("MediaLibrary snapshots enabled fields before measuring, derives deadlines, and reload-locks unknown uploads", async () => {
  const [source, branding] = await Promise.all([
    readFile(
      new URL("../app/app/media/MediaLibrary.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/app/settings/BrandingMediaForm.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    source,
    /timeoutMs:\s*clientMediaUploadTimeoutMs\(body\.size\)/,
  );
  const captureIndex = source.indexOf(
    "const capturedFields = captureMediaUploadFields(",
  );
  const measuringStateIndex = source.indexOf('setState("measuring")');
  const measurementAwaitIndex = source.indexOf("await measureMedia(file)");
  assert.ok(captureIndex >= 0, "the upload must snapshot enabled form controls");
  assert.ok(
    captureIndex < measuringStateIndex,
    "form values must be captured before measuring state disables named controls",
  );
  assert.ok(
    captureIndex < measurementAwaitIndex,
    "form values must be captured before asynchronous media measurement",
  );
  assert.match(
    source,
    /function captureMediaUploadFields\([\s\S]*?const form = new FormData\(formElement\);[\s\S]*?return Object\.freeze\(\{[\s\S]*?altText,[\s\S]*?caption:[\s\S]*?capturedAt:[\s\S]*?coachContext:[\s\S]*?orientation,[\s\S]*?posterMediaAssetId,[\s\S]*?transcript:[\s\S]*?viewLabel:[\s\S]*?\}\);/,
  );
  assert.match(
    source,
    /createMediaUploadBody\(file, \{[\s\S]*?\.\.\.capturedFields,[\s\S]*?durationMs: measured\.durationMs,[\s\S]*?heightPixels: measured\.heightPixels,[\s\S]*?widthPixels: measured\.widthPixels/,
  );
  assert.match(source, /state === "reload_required"/);
  assert.match(
    source,
    /const uploadControlsLocked =[\s\S]*?state === "measuring"[\s\S]*?state === "uploading"[\s\S]*?state === "reload_required"[\s\S]*?removingId !== null/,
  );
  assert.match(source, /if \(!configuration\.ready \|\| uploadControlsLocked\) return;/);
  assert.match(source, /isClientMutationOutcomeUnknown\(error\)/);
  assert.match(source, /Reload and inspect the media library/);
  assert.match(source, /window\.location\.reload\(\)/);
  assert.ok(
    [...source.matchAll(/disabled=\{uploadControlsLocked\}/g)].length >= 8,
  );
  assert.equal(
    [...source.matchAll(/if \(uploadControlsLocked\) return;/g)].length,
    2,
    "replacement and removal handlers must share the in-flight upload guard",
  );
  assert.match(
    source,
    /disabled=\{[\s\S]*?uploadControlsLocked \|\|[\s\S]*?Boolean\(asset\.replacementMediaAssetId\)/,
  );
  assert.match(
    source,
    /disabled=\{[\s\S]*?uploadControlsLocked \|\|[\s\S]*?removingId === asset\.id/,
  );
  assert.match(
    branding,
    /timeoutMs:\s*clientMediaUploadTimeoutMs\(uploadBody\.size\)/,
  );
});

test("bounded uploads expose progress and return one definitive response", async () => {
  const request = fakeRequest((current) => {
    current.upload.onprogress({ lengthComputable: true, loaded: 1, total: 4 });
    current.upload.onprogress({ lengthComputable: true, loaded: 4, total: 4 });
    current.status = 201;
    current.statusText = "Created";
    current.responseURL = EXPECTED_URL;
    current.response = new TextEncoder().encode('{"ok":true}').buffer;
    current.responseHeaders =
      "content-type: application/json\r\nx-request-id: 2d48a8b9-0777-4dd0-b36a-f2fe065e1e3c\r\n";
    current.onload();
  });
  const progress = [];
  const body = uploadBody();

  const response = await requestClientUpload("/api/media", body, {
    timeoutMs: 250,
    onProgress: (value) => progress.push(value),
    requestFactory: () => request,
  });

  assert.deepEqual(request.openArguments, ["POST", "/api/media", true]);
  assert.equal(request.sendCalls, 1);
  assert.equal(request.sentBody, body);
  assert.equal(request.requestHeaders.get("content-type"), MEDIA_UPLOAD_CONTENT_TYPE);
  assert.equal(request.timeout, 250);
  assert.equal(request.withCredentials, true);
  assert.equal(request.responseType, "arraybuffer");
  assert.deepEqual(progress, [25, 99]);
  assert.equal(response.status, 201);
  assert.equal(response.statusText, "Created");
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { ok: true });
});

test("definitive upload 4xx responses are returned without replay", async () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    const request = fakeRequest((current) => {
      current.status = status;
      current.responseURL = EXPECTED_URL;
      current.response = new ArrayBuffer(0);
      current.onload();
    });
    const response = await requestClientUpload("/api/media", uploadBody(), {
      requestFactory: () => request,
    });
    assert.equal(request.sendCalls, 1);
    assert.equal(response.status, status);
  }
});

test("retryable upload responses are outcome-unknown and never replayed", async () => {
  for (const status of [408, 425, 429, 500, 503]) {
    const request = fakeRequest((current) => {
      current.status = status;
      current.responseURL = EXPECTED_URL;
      current.response = new ArrayBuffer(0);
      current.onload();
    });
    await assert.rejects(
      requestClientUpload("/api/media", uploadBody(), {
        requestFactory: () => request,
      }),
      (error) =>
        error instanceof ClientMutationOutcomeUnknownError &&
        error.reason === "retryable_response" &&
        error.status === status,
    );
    assert.equal(request.sendCalls, 1);
  }
});

test("uploads fail closed on redirect and oversized acknowledgement without replay", async () => {
  for (const [reason, configure] of [
    [
      "redirected_response",
      (request) => {
        request.status = 200;
        request.responseURL = "https://attacker.example/upload";
        request.response = new ArrayBuffer(0);
      },
    ],
    [
      "response_too_large",
      (request) => {
        request.status = 200;
        request.responseURL = EXPECTED_URL;
        request.response = new ArrayBuffer(CLIENT_MUTATION_MAX_RESPONSE_BYTES + 1);
      },
    ],
  ]) {
    const request = fakeRequest((current) => {
      configure(current);
      current.onload();
    });
    await assert.rejects(
      requestClientUpload("/api/media", uploadBody(), {
        requestFactory: () => request,
      }),
      (error) =>
        error instanceof ClientMutationOutcomeUnknownError &&
        error.reason === reason,
    );
    assert.equal(request.sendCalls, 1);
  }
});

test("uploads bound timeout, transport, and caller-abort outcomes without replay", async () => {
  for (const [reason, fire] of [
    ["timeout", (request) => request.ontimeout()],
    ["transport", (request) => request.onerror()],
  ]) {
    const request = fakeRequest(fire);
    await assert.rejects(
      requestClientUpload("/api/media", uploadBody(), {
        timeoutMs: 5,
        requestFactory: () => request,
      }),
      (error) =>
        error instanceof ClientMutationOutcomeUnknownError &&
        error.reason === reason,
    );
    assert.equal(request.sendCalls, 1);
  }

  const controller = new AbortController();
  const aborted = fakeRequest(() => controller.abort());
  await assert.rejects(
    requestClientUpload("/api/media", uploadBody(), {
      signal: controller.signal,
      requestFactory: () => aborted,
    }),
    (error) =>
      error instanceof ClientMutationOutcomeUnknownError &&
      error.reason === "transport",
  );
  assert.equal(aborted.sendCalls, 1);
  assert.equal(aborted.abortCalls, 1);
});

test("uploads require a bounded same-origin path before creating a request", () => {
  let factories = 0;
  const factory = () => {
    factories += 1;
    return fakeRequest(() => {});
  };
  assert.throws(
    () =>
      requestClientUpload("https://attacker.example/upload", uploadBody(), {
        requestFactory: factory,
      }),
    /same-origin absolute path/,
  );
  assert.throws(
    () =>
      requestClientUpload("/api/media", uploadBody(), {
        timeoutMs: 0,
        requestFactory: factory,
      }),
    /positive number/,
  );
  assert.equal(factories, 0);
});

test("uploads reject bodies outside the versioned media envelope", () => {
  assert.throws(
    () => requestClientUpload("/api/media", new Blob(["wrong"])),
    /Roadmap media envelope/,
  );
});

function uploadBody() {
  return new Blob([new Uint8Array([0, 0, 0, 2, 0x7b, 0x7d, 1])], {
    type: MEDIA_UPLOAD_CONTENT_TYPE,
  });
}

function fakeRequest(onSend) {
  return {
    upload: {},
    status: 0,
    statusText: "",
    responseURL: "",
    response: null,
    responseHeaders: "",
    responseType: "",
    timeout: 0,
    withCredentials: false,
    openArguments: null,
    sendCalls: 0,
    sentBody: null,
    requestHeaders: new Map(),
    abortCalls: 0,
    onload: null,
    onerror: null,
    onabort: null,
    ontimeout: null,
    open(...argumentsList) {
      this.openArguments = argumentsList;
    },
    setRequestHeader(name, value) {
      this.requestHeaders.set(name.toLowerCase(), value);
    },
    send(body) {
      this.sendCalls += 1;
      this.sentBody = body;
      onSend(this);
    },
    abort() {
      this.abortCalls += 1;
      this.onabort?.();
    },
    getResponseHeader(name) {
      if (name.toLowerCase() !== "x-request-id") return null;
      const match = this.responseHeaders.match(/^x-request-id:\s*(.+)$/im);
      return match?.[1]?.trim() ?? null;
    },
    getAllResponseHeaders() {
      return this.responseHeaders;
    },
  };
}
