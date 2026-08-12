import { env } from "cloudflare:workers";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { requireApiIdentity } from "@/lib/identity";
import { assertSameOrigin, errorResponse, RequestError } from "@/lib/http";
import {
  requireCurrentConsentGrant,
  type ConsentGrantRequirement,
} from "@/lib/consent-repository";
import {
  listMediaAssets,
  storeMediaAsset,
  storeStreamedMediaAsset,
} from "@/lib/media";
import { readMediaUploadPolicy } from "@/lib/media-policy";
import { MEDIA_UPLOAD_CONTENT_TYPE } from "@/lib/media-upload-protocol";
import {
  readLegacyMediaUploadForm,
  readMediaUploadEnvelope,
} from "@/lib/media-upload-reader";
import { requestCorrelationId } from "@/lib/request-correlation";

const ALLOWED_FIELDS = new Set([
  "file",
  "altText",
  "caption",
  "transcript",
  "capturedAt",
  "orientation",
  "viewLabel",
  "coachContext",
  "posterMediaAssetId",
  "widthPixels",
  "heightPixels",
  "durationMs",
  "replacementForAssetId",
  "replacementReason",
]);

export async function GET() {
  try {
    const authentication = await requireApiIdentity();
    if (authentication.response) return authentication.response;
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const policy = readMediaUploadPolicy(env.MEDIA_UPLOAD_POLICY_JSON);
    const assets = await listMediaAssets(account.id);
    return Response.json({
      configuration: policy
        ? {
            ready: true,
            maxBytes: policy.maxBytes,
            maxVideoDurationMs: policy.maxVideoDurationMs,
            allowedMimeTypes: policy.allowedMimeTypes,
          }
        : { ready: false },
      assets: assets.map((asset) => ({
        ...asset,
        url: asset.status === "ready" ? `/api/media/${encodeURIComponent(asset.id)}` : null,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const requestId = requestCorrelationId(request);
  let streamedBody: ReadableStream<Uint8Array> | null = null;
  try {
    assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return authentication.response;
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const policy = readMediaUploadPolicy(env.MEDIA_UPLOAD_POLICY_JSON);
    if (!policy) {
      throw new RequestError(
        503,
        "media_policy_unavailable",
        "Media upload is configuration ready but its approved limits are not active.",
      );
    }
    const consentRequirements: readonly ConsentGrantRequirement[] =
      policy.accountMediaConsentRequired
        ? [
            await requireCurrentConsentGrant(
              account.id,
              { type: "account", golferId: null },
              "media_use",
            ),
          ]
        : [];
    if (
      request.headers.get("content-type")?.trim().toLowerCase() ===
      MEDIA_UPLOAD_CONTENT_TYPE
    ) {
      const upload = await readMediaUploadEnvelope(request, policy.maxBytes);
      streamedBody = upload.body;
      const { metadata } = upload;
      const capturedAt = metadata.capturedAt
        ? dateOnly(metadata.capturedAt, "capturedAt")
        : null;
      const asset = await storeStreamedMediaAsset({
        accountId: account.id,
        body: upload.body,
        byteSize: metadata.byteSize,
        contentSha256: metadata.sha256,
        signatureBytes: upload.signatureBytes,
        mimeType: metadata.mimeType,
        originalFilename: metadata.originalFilename,
        widthPixels: metadata.widthPixels,
        heightPixels: metadata.heightPixels,
        durationMs: metadata.durationMs,
        altText: metadata.altText,
        caption: metadata.caption,
        transcript: metadata.transcript,
        capturedAt,
        orientation: metadata.orientation,
        viewLabel: metadata.viewLabel,
        coachContext: metadata.coachContext,
        posterMediaAssetId: metadata.posterMediaAssetId,
        replacementForAssetId: metadata.replacementForAssetId,
        replacementReason: metadata.replacementReason ?? undefined,
        requestId,
        consentRequirements,
      });
      streamedBody = null;
      return uploadResponse(asset, requestId);
    }

    const form = await readLegacyMediaUploadForm(request);
    assertFormShape(form);
    const fileValue = form.get("file");
    if (!(fileValue instanceof File)) {
      throw new RequestError(400, "media_file_required", "Choose one media file to upload.");
    }
    if (fileValue.size > policy.maxBytes) {
      throw new RequestError(
        413,
        "media_size_invalid",
        `Choose a file no larger than ${policy.maxBytes} bytes.`,
      );
    }
    const capturedAtText = optionalText(form, "capturedAt", 20);
    const capturedAt = capturedAtText ? dateOnly(capturedAtText, "capturedAt") : null;
    const orientation = optionalText(form, "orientation", 20) || "unknown";
    if (!["landscape", "portrait", "square", "unknown"].includes(orientation)) {
      throw new RequestError(400, "invalid_media_metadata", "Media orientation is invalid.");
    }
    const replacementReason = optionalText(form, "replacementReason", 40);
    if (
      replacementReason &&
      !["coach_replaced", "processing_retry", "metadata_correction"].includes(
        replacementReason,
      )
    ) {
      throw new RequestError(400, "invalid_media_metadata", "Replacement reason is invalid.");
    }
    const asset = await storeMediaAsset({
      accountId: account.id,
      bytes: new Uint8Array(await fileValue.arrayBuffer()),
      mimeType: fileValue.type,
      originalFilename: fileValue.name,
      widthPixels: optionalInteger(form, "widthPixels"),
      heightPixels: optionalInteger(form, "heightPixels"),
      durationMs: optionalInteger(form, "durationMs"),
      altText: requiredText(form, "altText", 1_000),
      caption: optionalText(form, "caption", 2_000),
      transcript: optionalText(form, "transcript", 20_000),
      capturedAt,
      orientation: orientation as "landscape" | "portrait" | "square" | "unknown",
      viewLabel: optionalText(form, "viewLabel", 160),
      coachContext: optionalText(form, "coachContext", 2_000),
      posterMediaAssetId: optionalId(form, "posterMediaAssetId"),
      replacementForAssetId: optionalId(form, "replacementForAssetId"),
      replacementReason: (replacementReason || undefined) as
        | "coach_replaced"
        | "processing_retry"
        | "metadata_correction"
        | undefined,
      requestId,
      consentRequirements,
    });
    return uploadResponse(asset, requestId);
  } catch (error) {
    await streamedBody?.cancel("media_upload_failed").catch(() => undefined);
    const response = errorResponse(error);
    response.headers.set("X-Request-ID", requestId);
    return response;
  }
}

function uploadResponse(
  asset: Awaited<ReturnType<typeof storeMediaAsset>>,
  requestId: string,
): Response {
  return Response.json(
    {
      asset: {
        ...asset,
        url: `/api/media/${encodeURIComponent(asset.id)}`,
      },
    },
    { status: 201, headers: { "X-Request-ID": requestId } },
  );
}

function assertFormShape(form: FormData) {
  const seen = new Map<string, number>();
  for (const key of form.keys()) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new RequestError(400, "unexpected_field", `Unexpected field: ${key}.`);
    }
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count !== 1) {
      throw new RequestError(400, "duplicate_field", `${key} must appear exactly once.`);
    }
  }
}

function requiredText(form: FormData, field: string, max: number): string {
  const value = form.get(field);
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new RequestError(400, "invalid_media_metadata", `${field} is required.`);
  }
  return value.trim();
}

function optionalText(form: FormData, field: string, max: number): string | null {
  const value = form.get(field);
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new RequestError(400, "invalid_media_metadata", `${field} is invalid.`);
  }
  return value.trim() || null;
}

function optionalId(form: FormData, field: string): string | null {
  const value = optionalText(form, field, 80);
  if (value && !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new RequestError(400, "invalid_media_metadata", `${field} is invalid.`);
  }
  return value;
}

function optionalInteger(form: FormData, field: string): number | null {
  const text = optionalText(form, field, 20);
  if (!text) return null;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RequestError(400, "invalid_media_metadata", `${field} must be a positive integer.`);
  }
  return value;
}

function dateOnly(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RequestError(400, "invalid_media_metadata", `${field} must be a valid date.`);
  }
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now() + 86_400_000) {
    throw new RequestError(400, "invalid_media_metadata", `${field} must be a valid past date.`);
  }
  return parsed;
}
