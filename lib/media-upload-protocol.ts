export const MEDIA_UPLOAD_CONTENT_TYPE =
  "application/vnd.roadmap.media-upload";
export const MEDIA_UPLOAD_PROTOCOL_VERSION = "roadmap-media-upload-v1";

export const MEDIA_UPLOAD_METADATA_MAX_BYTES = 32 * 1024;
export const MEDIA_UPLOAD_PREFIX_BYTES = 4;

export const mediaUploadMetadataKeys = Object.freeze([
  "altText",
  "byteSize",
  "caption",
  "capturedAt",
  "coachContext",
  "durationMs",
  "heightPixels",
  "mimeType",
  "orientation",
  "originalFilename",
  "posterMediaAssetId",
  "protocolVersion",
  "replacementForAssetId",
  "replacementReason",
  "sha256",
  "transcript",
  "viewLabel",
  "widthPixels",
] as const);

export type MediaUploadMetadata = Readonly<{
  altText: string;
  byteSize: number;
  caption: string | null;
  capturedAt: string | null;
  coachContext: string | null;
  durationMs: number | null;
  heightPixels: number | null;
  mimeType: string;
  orientation: "landscape" | "portrait" | "square" | "unknown";
  originalFilename: string;
  posterMediaAssetId: string | null;
  protocolVersion: typeof MEDIA_UPLOAD_PROTOCOL_VERSION;
  replacementForAssetId: string | null;
  replacementReason:
    | "coach_replaced"
    | "processing_retry"
    | "metadata_correction"
    | null;
  sha256: string;
  transcript: string | null;
  viewLabel: string | null;
  widthPixels: number | null;
}>;

export type MediaUploadFields = Omit<
  MediaUploadMetadata,
  | "byteSize"
  | "mimeType"
  | "originalFilename"
  | "protocolVersion"
  | "sha256"
>;

/**
 * Computes one browser-side digest of the policy-bounded File, then uses Blob
 * composition to stream the fixed header, bounded JSON metadata, and original
 * file as one request with native progress. The server does not need a second
 * request-sized allocation to verify or store the body.
 */
export async function createMediaUploadBody(
  file: File,
  fields: MediaUploadFields,
): Promise<Blob> {
  if (file.size < 1) {
    throw new RangeError("Media uploads require a non-empty file.");
  }
  const sha256 = hexDigest(
    await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
  );
  const metadata: MediaUploadMetadata = {
    ...fields,
    byteSize: file.size,
    mimeType: file.type,
    originalFilename: file.name,
    protocolVersion: MEDIA_UPLOAD_PROTOCOL_VERSION,
    sha256,
  };
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  if (
    metadataBytes.byteLength < 1 ||
    metadataBytes.byteLength > MEDIA_UPLOAD_METADATA_MAX_BYTES
  ) {
    throw new RangeError("Media upload metadata exceeds the bounded envelope.");
  }
  const prefix = new Uint8Array(MEDIA_UPLOAD_PREFIX_BYTES);
  new DataView(prefix.buffer).setUint32(0, metadataBytes.byteLength, false);
  return new Blob([prefix, metadataBytes, file], {
    type: MEDIA_UPLOAD_CONTENT_TYPE,
  });
}

function hexDigest(value: ArrayBuffer): string {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
