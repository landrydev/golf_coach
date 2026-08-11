export const supportedMediaMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "text/csv",
] as const;

// This is the tested ceiling for Roadmap's versioned streaming upload protocol.
// The route enforces this exact file bound independently of its fixed 32 KiB
// metadata envelope and never raises Vinext's global multipart body limit.
export const maximumSupportedMediaUploadBytes = 50_000_000;

export type SupportedMediaMimeType = (typeof supportedMediaMimeTypes)[number];

export type MediaUploadPolicy = Readonly<{
  version: string;
  maxBytes: number;
  maxVideoDurationMs: number;
  allowedMimeTypes: readonly SupportedMediaMimeType[];
  accountMediaConsentRequired: boolean;
  golferMediaConsentRequired: boolean;
}>;

export function readMediaUploadPolicy(
  raw: string | null | undefined,
): MediaUploadPolicy | null {
  if (!raw || raw.length > 8_192) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (
    keys.join(",") !==
    "accountMediaConsentRequired,allowedMimeTypes,golferMediaConsentRequired,maxBytes,maxVideoDurationMs,version"
  ) {
    return null;
  }
  if (
    typeof value.version !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value.version) ||
    typeof value.maxBytes !== "number" ||
    !Number.isSafeInteger(value.maxBytes) ||
    value.maxBytes < 1_024 ||
    value.maxBytes > maximumSupportedMediaUploadBytes ||
    typeof value.maxVideoDurationMs !== "number" ||
    !Number.isSafeInteger(value.maxVideoDurationMs) ||
    value.maxVideoDurationMs < 1_000 ||
    value.maxVideoDurationMs > 3_600_000 ||
    typeof value.accountMediaConsentRequired !== "boolean" ||
    typeof value.golferMediaConsentRequired !== "boolean" ||
    !Array.isArray(value.allowedMimeTypes) ||
    value.allowedMimeTypes.length < 1 ||
    value.allowedMimeTypes.length > supportedMediaMimeTypes.length
  ) {
    return null;
  }
  const allowed = new Set(supportedMediaMimeTypes);
  const configured = value.allowedMimeTypes;
  if (
    configured.some(
      (mimeType) => typeof mimeType !== "string" || !allowed.has(mimeType as SupportedMediaMimeType),
    ) ||
    new Set(configured).size !== configured.length
  ) {
    return null;
  }
  return Object.freeze({
    version: value.version,
    maxBytes: value.maxBytes,
    maxVideoDurationMs: value.maxVideoDurationMs,
    accountMediaConsentRequired: value.accountMediaConsentRequired,
    golferMediaConsentRequired: value.golferMediaConsentRequired,
    allowedMimeTypes: Object.freeze([...configured]) as readonly SupportedMediaMimeType[],
  });
}

export function mediaKindForMimeType(
  mimeType: SupportedMediaMimeType,
): "image" | "video" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  return mimeType.startsWith("video/") ? "video" : "document";
}

export function fileSignatureMatches(
  mimeType: SupportedMediaMimeType,
  bytes: Uint8Array,
): boolean {
  if (mimeType === "image/png") {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mimeType === "image/jpeg") {
    return startsWith(bytes, [0xff, 0xd8, 0xff]);
  }
  if (mimeType === "image/webp") {
    return ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP");
  }
  if (mimeType === "video/webm") {
    return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  }
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    return bytes.length >= 12 && ascii(bytes, 4, "ftyp");
  }
  if (mimeType === "text/csv") {
    if (!bytes.length || bytes.length > 8_192) return false;
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    } catch {
      return false;
    }
    if (
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text) ||
      /^\s*(?:<!doctype|<html|<script|%PDF-|MZ)/i.test(text)
    ) {
      return false;
    }
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2 || lines[0]!.length > 2_000) return false;
    const delimiter = lines[0]!.includes(",") ? "," : lines[0]!.includes("\t") ? "\t" : null;
    if (!delimiter) return false;
    const headerCells = lines[0]!.split(delimiter).map((cell) => cell.trim());
    return (
      headerCells.length >= 2 &&
      headerCells.length <= 200 &&
      headerCells.every(Boolean) &&
      lines[1]!.includes(delimiter)
    );
  }
  return false;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, expected: string): boolean {
  return [...expected].every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
