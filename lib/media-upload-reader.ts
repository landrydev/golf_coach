import { RequestError } from "./http.ts";
import {
  MEDIA_UPLOAD_CONTENT_TYPE,
  MEDIA_UPLOAD_METADATA_MAX_BYTES,
  MEDIA_UPLOAD_PREFIX_BYTES,
  MEDIA_UPLOAD_PROTOCOL_VERSION,
  mediaUploadMetadataKeys,
  type MediaUploadMetadata,
} from "./media-upload-protocol.ts";

export type DecodedMediaUpload = Readonly<{
  body: ReadableStream<Uint8Array>;
  metadata: MediaUploadMetadata;
  signatureBytes: Uint8Array;
}>;

const LEGACY_MULTIPART_MAX_BYTES = 1024 * 1024;

/**
 * Reads the route-owned binary envelope with a fixed metadata bound, then only
 * peeks the bounded bytes needed for signature validation. The returned stream
 * reconstructs that prefix ahead of the unread request body without retaining
 * a request-sized chunk list or whole-file allocation.
 */
export async function readMediaUploadEnvelope(
  request: Request,
  maximumFileBytes: number,
): Promise<DecodedMediaUpload> {
  if (normalizedContentType(request) !== MEDIA_UPLOAD_CONTENT_TYPE) {
    throw new RequestError(
      415,
      "unsupported_media_type",
      `Expected ${MEDIA_UPLOAD_CONTENT_TYPE}.`,
    );
  }
  assertIdentityEncoding(request);
  if (!Number.isSafeInteger(maximumFileBytes) || maximumFileBytes < 1) {
    throw new RequestError(
      503,
      "media_policy_unavailable",
      "The media upload limit is unavailable.",
    );
  }

  const maximumEnvelopeBytes =
    MEDIA_UPLOAD_PREFIX_BYTES +
    MEDIA_UPLOAD_METADATA_MAX_BYTES +
    maximumFileBytes;
  const declaredLength = declaredBodyLength(request, maximumEnvelopeBytes);
  const reader = request.body?.getReader();
  if (!reader) {
    throw new RequestError(400, "invalid_media_envelope", "The upload body is missing.");
  }
  const stream = boundedStreamReader(reader, maximumEnvelopeBytes);

  try {
    const prefix = await stream.readExact(MEDIA_UPLOAD_PREFIX_BYTES);
    const metadataLength = new DataView(
      prefix.buffer,
      prefix.byteOffset,
      prefix.byteLength,
    ).getUint32(0, false);
    if (
      metadataLength < 2 ||
      metadataLength > MEDIA_UPLOAD_METADATA_MAX_BYTES
    ) {
      throw new RequestError(
        400,
        "invalid_media_envelope",
        "The upload metadata length is invalid.",
      );
    }

    const metadataBytes = await stream.readExact(metadataLength);
    const metadata = parseMetadata(metadataBytes, maximumFileBytes);
    const expectedLength =
      MEDIA_UPLOAD_PREFIX_BYTES + metadataLength + metadata.byteSize;
    const declaredFileBytes =
      declaredLength === null
        ? null
        : declaredLength - MEDIA_UPLOAD_PREFIX_BYTES - metadataLength;
    if (declaredFileBytes !== null && declaredFileBytes > maximumFileBytes) {
      throw new RequestError(
        413,
        "media_size_invalid",
        `Choose a file no larger than ${maximumFileBytes} bytes.`,
      );
    }
    if (declaredLength !== null && declaredLength !== expectedLength) {
      throw new RequestError(
        400,
        "invalid_media_envelope",
        "The upload length does not match its metadata.",
      );
    }

    const signatureLength = Math.min(
      metadata.byteSize,
      metadata.mimeType === "text/csv" ? 8_192 : 32,
    );
    const signatureBytes = await stream.readExact(signatureLength);
    const body = stream.fileBody(
      signatureBytes,
      metadata.byteSize - signatureLength,
      metadata.byteSize,
      maximumFileBytes,
      expectedLength,
    );
    return { body, metadata, signatureBytes };
  } catch (error) {
    await stream.cancel();
    stream.release();
    throw error;
  }
}

/**
 * Preserves bounded compatibility for existing small multipart API callers.
 * Large browser uploads use the binary protocol and never enter Vinext's
 * progressive multipart parser.
 */
export async function readLegacyMediaUploadForm(
  request: Request,
): Promise<FormData> {
  if (!normalizedContentType(request).startsWith("multipart/form-data;")) {
    throw new RequestError(
      415,
      "unsupported_media_type",
      `Expected ${MEDIA_UPLOAD_CONTENT_TYPE}.`,
    );
  }
  assertIdentityEncoding(request);
  const contentType = request.headers.get("content-type")!;
  declaredBodyLength(request, LEGACY_MULTIPART_MAX_BYTES);
  const bytes = await readBoundedBody(request, LEGACY_MULTIPART_MAX_BYTES);
  const stableBytes = new Uint8Array(bytes.byteLength);
  stableBytes.set(bytes);
  try {
    return await new Request(request.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body: stableBytes.buffer,
    }).formData();
  } catch {
    throw new RequestError(
      400,
      "invalid_media_envelope",
      "The multipart upload body is invalid.",
    );
  }
}

function parseMetadata(
  bytes: Uint8Array,
  maximumFileBytes: number,
): MediaUploadMetadata {
  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    throw new RequestError(
      400,
      "invalid_media_metadata",
      "Media upload metadata is not valid UTF-8 JSON.",
    );
  }
  if (!isRecord(value)) invalidMetadata();
  const actualKeys = Object.keys(value).sort();
  if (
    actualKeys.length !== mediaUploadMetadataKeys.length ||
    actualKeys.some((key, index) => key !== mediaUploadMetadataKeys[index])
  ) {
    invalidMetadata();
  }

  const byteSize = positiveInteger(value.byteSize, "byteSize");
  if (byteSize > maximumFileBytes) {
    throw new RequestError(
      413,
      "media_size_invalid",
      `Choose a file no larger than ${maximumFileBytes} bytes.`,
    );
  }
  const orientation = requiredString(value.orientation, "orientation", 20);
  if (!["landscape", "portrait", "square", "unknown"].includes(orientation)) {
    invalidMetadata("orientation");
  }
  const replacementReason = optionalString(
    value.replacementReason,
    "replacementReason",
    40,
  );
  if (
    replacementReason &&
    !["coach_replaced", "processing_retry", "metadata_correction"].includes(
      replacementReason,
    )
  ) {
    invalidMetadata("replacementReason");
  }

  return {
    altText: requiredString(value.altText, "altText", 1_000),
    byteSize,
    caption: optionalString(value.caption, "caption", 2_000),
    capturedAt: optionalString(value.capturedAt, "capturedAt", 20),
    coachContext: optionalString(value.coachContext, "coachContext", 2_000),
    durationMs: optionalPositiveInteger(value.durationMs, "durationMs"),
    heightPixels: optionalPositiveInteger(value.heightPixels, "heightPixels"),
    mimeType: requiredString(value.mimeType, "mimeType", 100),
    orientation: orientation as MediaUploadMetadata["orientation"],
    originalFilename: requiredString(
      value.originalFilename,
      "originalFilename",
      512,
    ),
    posterMediaAssetId: optionalId(value.posterMediaAssetId, "posterMediaAssetId"),
    protocolVersion: protocolVersion(value.protocolVersion),
    replacementForAssetId: optionalId(
      value.replacementForAssetId,
      "replacementForAssetId",
    ),
    replacementReason:
      replacementReason as MediaUploadMetadata["replacementReason"],
    sha256: sha256(value.sha256),
    transcript: optionalString(value.transcript, "transcript", 20_000),
    viewLabel: optionalString(value.viewLabel, "viewLabel", 160),
    widthPixels: optionalPositiveInteger(value.widthPixels, "widthPixels"),
  };
}

function boundedStreamReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maximumBytes: number,
) {
  let pending: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let pendingOffset = 0;
  let received = 0;
  let ended = false;
  let released = false;

  async function fill(): Promise<boolean> {
    while (pendingOffset >= pending.byteLength && !ended) {
      pending = new Uint8Array(0);
      pendingOffset = 0;
      const result = await reader.read();
      if (result.done) {
        ended = true;
        pending = new Uint8Array(0);
        pendingOffset = 0;
        break;
      }
      if (!result.value.byteLength) continue;
      received += result.value.byteLength;
      if (received > maximumBytes) {
        throw new RequestError(
          413,
          "payload_too_large",
          "The media upload body is too large.",
        );
      }
      pending = result.value;
      pendingOffset = 0;
    }
    return pendingOffset < pending.byteLength;
  }

  return Object.freeze({
    async readExact(size: number): Promise<Uint8Array> {
      const output = new Uint8Array(size);
      let outputOffset = 0;
      while (outputOffset < size) {
        if (!(await fill())) {
          throw new RequestError(
            400,
            "invalid_media_envelope",
            "The media upload body ended early.",
          );
        }
        const available = pending.byteLength - pendingOffset;
        const copied = Math.min(available, size - outputOffset);
        output.set(
          pending.subarray(pendingOffset, pendingOffset + copied),
          outputOffset,
        );
        pendingOffset += copied;
        outputOffset += copied;
      }
      return output;
    },
    fileBody(
      prefix: Uint8Array,
      remainingBytes: number,
      advertisedFileBytes: number,
      maximumFileBytes: number,
      expectedEnvelopeBytes: number,
    ): ReadableStream<Uint8Array> {
      let prefixSent = false;
      let remaining = remainingBytes;
      let terminal = false;
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (terminal) return;
          try {
            if (!prefixSent) {
              prefixSent = true;
              controller.enqueue(prefix);
              return;
            }
            if (remaining > 0) {
              if (!(await fill())) {
                throw new RequestError(
                  400,
                  "invalid_media_envelope",
                  "The media upload body ended early.",
                );
              }
              const available = pending.byteLength - pendingOffset;
              const count = Math.min(available, remaining);
              const chunk = pending.subarray(pendingOffset, pendingOffset + count);
              pendingOffset += count;
              remaining -= count;
              controller.enqueue(chunk);
              return;
            }
            let trailingBytes = 0;
            while (await fill()) {
              trailingBytes += pending.byteLength - pendingOffset;
              pendingOffset = pending.byteLength;
              if (advertisedFileBytes + trailingBytes > maximumFileBytes) {
                throw new RequestError(
                  413,
                  "media_size_invalid",
                  `Choose a file no larger than ${maximumFileBytes} bytes.`,
                );
              }
            }
            if (trailingBytes > 0) {
              throw new RequestError(
                400,
                "invalid_media_envelope",
                "The media upload body contains trailing bytes.",
              );
            }
            if (received !== expectedEnvelopeBytes) {
              throw new RequestError(
                400,
                "invalid_media_envelope",
                "The upload length does not match its metadata.",
              );
            }
            terminal = true;
            releaseReader();
            controller.close();
          } catch (error) {
            terminal = true;
            await cancelReader();
            releaseReader();
            controller.error(error);
          }
        },
        async cancel() {
          terminal = true;
          await cancelReader();
          releaseReader();
        },
      });
    },
    receivedBytes: () => received,
    cancel: cancelReader,
    release: releaseReader,
  });

  function cancelReader() {
    return reader.cancel("invalid_media_upload").catch(() => undefined);
  }

  function releaseReader() {
    if (released) return;
    released = true;
    reader.releaseLock();
  }
}

async function readBoundedBody(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const target = new Uint8Array(maximumBytes);
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (size + result.value.byteLength > maximumBytes) {
        await reader.cancel("request_body_too_large").catch(() => undefined);
        throw new RequestError(
          413,
          "payload_too_large",
          "The media upload body is too large.",
        );
      }
      target.set(result.value, size);
      size += result.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return target.subarray(0, size);
}

function declaredBodyLength(
  request: Request,
  maximumBytes: number,
): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  if (!/^(?:0|[1-9]\d*)$/u.test(raw)) {
    throw new RequestError(
      400,
      "invalid_content_length",
      "The upload Content-Length is invalid.",
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new RequestError(
      400,
      "invalid_content_length",
      "The upload Content-Length is invalid.",
    );
  }
  if (value > maximumBytes) {
    throw new RequestError(
      413,
      "payload_too_large",
      "The media upload body is too large.",
    );
  }
  return value;
}

function normalizedContentType(request: Request): string {
  return request.headers.get("content-type")?.trim().toLowerCase() ?? "";
}

function assertIdentityEncoding(request: Request): void {
  const encoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  if (encoding && encoding !== "identity") {
    throw new RequestError(
      415,
      "unsupported_content_encoding",
      "Encoded media upload bodies are not supported.",
    );
  }
}

function requiredString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") invalidMetadata(field);
  const clean = value.trim();
  if (!clean || clean.length > maximum || hasUnsafeControls(clean)) {
    invalidMetadata(field);
  }
  return clean;
}

function optionalString(
  value: unknown,
  field: string,
  maximum: number,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") invalidMetadata(field);
  const clean = value.trim();
  if (!clean) return null;
  if (clean.length > maximum || hasUnsafeControls(clean)) invalidMetadata(field);
  return clean;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalidMetadata(field);
  return value as number;
}

function optionalPositiveInteger(value: unknown, field: string): number | null {
  return value === null ? null : positiveInteger(value, field);
}

function optionalId(value: unknown, field: string): string | null {
  const text = optionalString(value, field, 80);
  if (text && !/^[0-9a-f-]{36}$/iu.test(text)) invalidMetadata(field);
  return text;
}

function sha256(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    invalidMetadata("sha256");
  }
  return value;
}

function protocolVersion(value: unknown): typeof MEDIA_UPLOAD_PROTOCOL_VERSION {
  if (value !== MEDIA_UPLOAD_PROTOCOL_VERSION) {
    invalidMetadata("protocolVersion");
  }
  return MEDIA_UPLOAD_PROTOCOL_VERSION;
}

function hasUnsafeControls(value: string): boolean {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function invalidMetadata(field?: string): never {
  throw new RequestError(
    400,
    "invalid_media_metadata",
    field ? `${field} is invalid.` : "Media upload metadata is invalid.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
