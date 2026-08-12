import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditEvents,
  contentMediaAttachments,
  developmentPlans,
  instructorProfiles,
  launchMonitorImports,
  launchMonitorSessions,
  mediaAssetDetails,
  mediaAssetReplacements,
  mediaAssets,
  shareLinks,
  shareSessions,
} from "@/db/schema";
import {
  consentGrantRequirementsCurrent,
  consentGrantTransactionGuard,
  currentConsentGrantsCondition,
  type ConsentGrantRequirement,
} from "./consent-repository";
import { RequestError } from "./http";
import {
  fileSignatureMatches,
  mediaKindForMimeType,
  readMediaUploadPolicy,
  supportedMediaMimeTypes,
  type SupportedMediaMimeType,
} from "./media-policy";
import {
  consumeSyntheticConcurrencyFault,
  pauseAtSyntheticConcurrencyBarrier,
} from "./synthetic-concurrency-barrier";
import { runFixedLengthMediaUploadPipeline } from "./media-upload-pipeline";
import { newId } from "./tokens";

const MEDIA_DELETE_CLAIM_PREFIX = "storage_delete_pending:";
const MEDIA_DELETE_CLAIM_LEASE_MS = 60_000;

export type MediaOrientation = "landscape" | "portrait" | "square" | "unknown";

export type MediaAssetView = Readonly<{
  id: string;
  status: "pending" | "ready" | "failed" | "quarantined" | "deleted";
  mediaKind: "image" | "video" | "audio" | "document";
  mimeType: string;
  originalFilename: string | null;
  byteSize: number;
  widthPixels: number | null;
  heightPixels: number | null;
  durationMs: number | null;
  altText: string | null;
  caption: string | null;
  transcript: string | null;
  capturedAt: number | null;
  orientation: MediaOrientation;
  viewLabel: string | null;
  coachContext: string | null;
  posterMediaAssetId: string | null;
  failureCode: string | null;
  uploadedAt: number | null;
  replacementMediaAssetId: string | null;
}>;

export type StoreMediaAssetInput = Readonly<{
  accountId: string;
  bytes: Uint8Array;
  mimeType: string;
  originalFilename: string | null;
  widthPixels: number | null;
  heightPixels: number | null;
  durationMs: number | null;
  altText: string;
  caption: string | null;
  transcript: string | null;
  capturedAt: Date | null;
  orientation: MediaOrientation;
  viewLabel: string | null;
  coachContext: string | null;
  posterMediaAssetId?: string | null;
  replacementForAssetId?: string | null;
  replacementReason?: "coach_replaced" | "processing_retry" | "metadata_correction";
  requestId?: string | null;
  consentRequirements: readonly ConsentGrantRequirement[];
}>; 

export type StoreStreamedMediaAssetInput = Readonly<
  Omit<StoreMediaAssetInput, "bytes"> & {
    body: ReadableStream<Uint8Array>;
    byteSize: number;
    contentSha256: string;
    signatureBytes: Uint8Array;
  }
>;

export type ProfileBrandingState = Readonly<{
  logoMediaAssetId: string | null;
  profilePhotoMediaAssetId: string | null;
  attachments: readonly Readonly<{
    id: string;
    mediaAssetId: string;
    role: "logo" | "profile_photo" | "supporting";
  }>[];
}>;

export async function getProfileBrandingState(
  accountId: string,
): Promise<ProfileBrandingState> {
  const db = getDb();
  const [profile] = await db
    .select({
      logoMediaAssetId: instructorProfiles.logoMediaAssetId,
      profilePhotoMediaAssetId: instructorProfiles.profilePhotoMediaAssetId,
    })
    .from(instructorProfiles)
    .where(eq(instructorProfiles.accountId, accountId))
    .limit(1);
  if (!profile) {
    return {
      logoMediaAssetId: null,
      profilePhotoMediaAssetId: null,
      attachments: [],
    };
  }
  const rows = await db
    .select({
      id: contentMediaAttachments.id,
      mediaAssetId: contentMediaAttachments.mediaAssetId,
      role: contentMediaAttachments.attachmentRole,
    })
    .from(contentMediaAttachments)
    .innerJoin(
      mediaAssets,
      and(
        eq(mediaAssets.accountId, contentMediaAttachments.accountId),
        eq(mediaAssets.id, contentMediaAttachments.mediaAssetId),
        eq(mediaAssets.status, "ready"),
      ),
    )
    .where(
      and(
        eq(contentMediaAttachments.accountId, accountId),
        eq(contentMediaAttachments.profileAccountId, accountId),
        eq(contentMediaAttachments.status, "active"),
        inArray(contentMediaAttachments.attachmentRole, [
          "logo",
          "profile_photo",
          "supporting",
        ]),
      ),
    );
  return {
    ...profile,
    attachments: rows.map((row) => ({
      id: row.id,
      mediaAssetId: row.mediaAssetId,
      role: row.role as "logo" | "profile_photo" | "supporting",
    })),
  };
}

export async function listMediaAssets(
  accountId: string,
  options: { includeDeleted?: boolean; limit?: number } = {},
): Promise<MediaAssetView[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const rows = await getDb()
    .select({ asset: mediaAssets, details: mediaAssetDetails })
    .from(mediaAssets)
    .leftJoin(
      mediaAssetDetails,
      and(
        eq(mediaAssetDetails.accountId, mediaAssets.accountId),
        eq(mediaAssetDetails.mediaAssetId, mediaAssets.id),
      ),
    )
    .where(
      options.includeDeleted
        ? eq(mediaAssets.accountId, accountId)
        : and(
            eq(mediaAssets.accountId, accountId),
            inArray(mediaAssets.status, ["pending", "ready", "failed", "quarantined"]),
          ),
    )
    .orderBy(desc(mediaAssets.createdAt), desc(mediaAssets.id))
    .limit(limit);
  const replacementRows = rows.length
    ? await getDb()
        .select()
        .from(mediaAssetReplacements)
        .where(
          and(
            eq(mediaAssetReplacements.accountId, accountId),
            inArray(
              mediaAssetReplacements.replacedMediaAssetId,
              rows.map(({ asset }) => asset.id),
            ),
          ),
        )
    : [];
  const replacements = new Map(
    replacementRows.map((row) => [row.replacedMediaAssetId, row.replacementMediaAssetId]),
  );
  return rows.map(({ asset, details }) =>
    mediaView(asset, details, replacements.get(asset.id) ?? null),
  );
}

export async function getMediaAsset(
  accountId: string,
  mediaAssetId: string,
): Promise<MediaAssetView | null> {
  const [row] = await getDb()
    .select({ asset: mediaAssets, details: mediaAssetDetails })
    .from(mediaAssets)
    .leftJoin(
      mediaAssetDetails,
      and(
        eq(mediaAssetDetails.accountId, mediaAssets.accountId),
        eq(mediaAssetDetails.mediaAssetId, mediaAssets.id),
      ),
    )
    .where(and(eq(mediaAssets.accountId, accountId), eq(mediaAssets.id, mediaAssetId)))
    .limit(1);
  if (!row) return null;
  const [replacement] = await getDb()
    .select({ id: mediaAssetReplacements.replacementMediaAssetId })
    .from(mediaAssetReplacements)
    .where(
      and(
        eq(mediaAssetReplacements.accountId, accountId),
        eq(mediaAssetReplacements.replacedMediaAssetId, mediaAssetId),
      ),
    )
    .limit(1);
  return mediaView(row.asset, row.details, replacement?.id ?? null);
}

export async function storeMediaAsset(
  input: StoreMediaAssetInput,
): Promise<MediaAssetView> {
  const contentSha256 = await sha256Hex(input.bytes);
  return storePreparedMediaAsset(input, {
    byteSize: input.bytes.byteLength,
    contentSha256,
    signatureBytes: input.bytes.subarray(
      0,
      input.mimeType === "text/csv"
        ? Math.min(input.bytes.byteLength, 8_192)
        : 32,
    ),
    async writeStorage(objectKey, mediaAssetId, mimeType, policyVersion) {
      const stored = await env.MEDIA.put(objectKey, input.bytes, {
        httpMetadata: { contentType: mimeType },
        customMetadata: {
          mediaAssetId,
          policyVersion,
          sha256: contentSha256,
        },
        sha256: contentSha256,
      });
      assertStoredObject(stored, input.bytes.byteLength, contentSha256);
    },
  });
}

export async function storeStreamedMediaAsset(
  input: StoreStreamedMediaAssetInput,
): Promise<MediaAssetView> {
  if (!/^[0-9a-f]{64}$/u.test(input.contentSha256)) {
    throw new RequestError(
      400,
      "invalid_media_metadata",
      "The media SHA-256 digest is invalid.",
    );
  }
  return storePreparedMediaAsset(input, {
    byteSize: input.byteSize,
    contentSha256: input.contentSha256,
    signatureBytes: input.signatureBytes,
    async writeStorage(objectKey, mediaAssetId, mimeType, policyVersion) {
      const stored = await runFixedLengthMediaUploadPipeline(
        input.body,
        input.byteSize,
        (body) => env.MEDIA.put(objectKey, body, {
          httpMetadata: { contentType: mimeType },
          customMetadata: {
            mediaAssetId,
            policyVersion,
            sha256: input.contentSha256,
          },
          sha256: input.contentSha256,
        }),
      );
      assertStoredObject(stored, input.byteSize, input.contentSha256);
    },
  });
}

async function storePreparedMediaAsset(
  input: Omit<StoreMediaAssetInput, "bytes">,
  prepared: Readonly<{
    byteSize: number;
    contentSha256: string;
    signatureBytes: Uint8Array;
    writeStorage: (
      objectKey: string,
      mediaAssetId: string,
      mimeType: SupportedMediaMimeType,
      policyVersion: string,
    ) => Promise<void>;
  }>,
): Promise<MediaAssetView> {
  const policy = readMediaUploadPolicy(env.MEDIA_UPLOAD_POLICY_JSON);
  if (!policy) {
    throw new RequestError(
      503,
      "media_policy_unavailable",
      "Media upload is configuration ready but its approved limits are not active.",
    );
  }
  if (!env.MEDIA) {
    throw new RequestError(503, "media_storage_unavailable", "Private media storage is unavailable.");
  }
  const consentRequirements =
    policy.accountMediaConsentRequired &&
    Array.isArray(input.consentRequirements)
      ? input.consentRequirements
      : [];
  if (
    policy.accountMediaConsentRequired &&
    !isAccountMediaConsentRequirement(consentRequirements)
  ) {
    throw new RequestError(
      503,
      "media_consent_guard_unavailable",
      "Media upload authorization could not be verified.",
    );
  }
  if (!supportedMediaMimeTypes.includes(input.mimeType as SupportedMediaMimeType)) {
    throw new RequestError(415, "media_type_unsupported", "This media format is not supported.");
  }
  const mimeType = input.mimeType as SupportedMediaMimeType;
  if (!policy.allowedMimeTypes.includes(mimeType)) {
    throw new RequestError(
      415,
      "media_type_not_configured",
      "This media format is not enabled by the current media policy.",
    );
  }
  if (prepared.byteSize < 1 || prepared.byteSize > policy.maxBytes) {
    throw new RequestError(
      413,
      "media_size_invalid",
      `Choose a non-empty file no larger than ${policy.maxBytes} bytes.`,
    );
  }
  if (!fileSignatureMatches(mimeType, prepared.signatureBytes)) {
    throw new RequestError(
      415,
      "media_signature_mismatch",
      "The file contents do not match the selected media format.",
    );
  }
  const mediaKind = mediaKindForMimeType(mimeType);
  if (
    mediaKind === "video" &&
    (!input.durationMs || input.durationMs > policy.maxVideoDurationMs)
  ) {
    throw new RequestError(
      400,
      "media_duration_invalid",
      "A valid video duration within the configured limit is required.",
    );
  }
  if (!input.altText.trim()) {
    throw new RequestError(400, "media_alt_text_required", "Describe the media for people who cannot view it.");
  }
  let posterMediaAssetId: string | null = null;
  if (input.posterMediaAssetId) {
    if (mediaKind !== "video") {
      throw new RequestError(
        400,
        "invalid_media_poster",
        "A poster image can be selected only for a video.",
      );
    }
    const poster = await getMediaAsset(input.accountId, input.posterMediaAssetId);
    if (!poster || poster.status !== "ready" || poster.mediaKind !== "image") {
      throw new RequestError(
        400,
        "invalid_media_poster",
        "Choose a ready image from this account as the video poster.",
      );
    }
    posterMediaAssetId = poster.id;
  }
  if (input.replacementForAssetId) {
    const existing = await getMediaAsset(input.accountId, input.replacementForAssetId);
    if (!existing || existing.status === "deleted") {
      throw new RequestError(404, "media_replacement_source_not_found", "The media being replaced was not found.");
    }
    if (existing.replacementMediaAssetId) {
      throw new RequestError(409, "media_already_replaced", "This media already has a replacement.");
    }
  }

  const id = newId();
  const objectKey = `accounts/${input.accountId}/media/${id}/${newId()}`;
  const now = new Date();
  const contentSha256 = prepared.contentSha256;
  const db = getDb();
  try {
    await pauseAtSyntheticConcurrencyBarrier(
      "media-upload-before-pending-commit",
    );
    await db.batch([
      db.insert(mediaAssets).values({
        id,
        accountId: input.accountId,
        storageProvider: "r2",
        objectKey,
        status: "pending",
        mediaKind,
        mimeType,
        originalFilename: cleanFilename(input.originalFilename),
        byteSize: prepared.byteSize,
        contentSha256,
        widthPixels: positiveOrNull(input.widthPixels),
        heightPixels: positiveOrNull(input.heightPixels),
        durationMs: mediaKind === "video" ? input.durationMs : null,
        altText: bounded(input.altText, 1_000),
        caption: boundedOrNull(input.caption, 2_000),
        transcript: boundedOrNull(input.transcript, 20_000),
      }),
      ...(consentRequirements.length
        ? [
            consentGrantTransactionGuard(
              input.accountId,
              consentRequirements,
            ),
          ]
        : []),
      ...(posterMediaAssetId
        ? [readyMediaTransactionGuard(input.accountId, posterMediaAssetId)]
        : []),
      db.insert(mediaAssetDetails).values({
        accountId: input.accountId,
        mediaAssetId: id,
        capturedAt: input.capturedAt,
        orientation: input.orientation,
        viewLabel: boundedOrNull(input.viewLabel, 160),
        coachContext: boundedOrNull(input.coachContext, 2_000),
        posterMediaAssetId,
        processingAttempts: 1,
        lastProcessingAttemptAt: now,
      }),
    ]);
  } catch (error) {
    if (posterMediaAssetId) {
      await assertMediaStillReady(input.accountId, [posterMediaAssetId]);
    }
    await rethrowConsentRace(
      input.accountId,
      consentRequirements,
      error,
    );
  }

  try {
    if (
      await consumeSyntheticConcurrencyFault(
        "media-next-storage-write",
        input.accountId,
      )
    ) {
      throw new Error("Synthetic one-shot media storage write failure.");
    }
    await prepared.writeStorage(objectKey, id, mimeType, policy.version);
  } catch (error) {
    if (isRejectedUploadRequest(error)) {
      return rejectPendingUploadAfterCleanup({
        accountId: input.accountId,
        mediaAssetId: id,
        objectKey,
        rejection: error,
        requestId: input.requestId,
      });
    }
    if (
      await consentRequirementLost(
        input.accountId,
        consentRequirements,
      )
    ) {
      return rejectPendingUploadAfterCleanup({
        accountId: input.accountId,
        mediaAssetId: id,
        objectKey,
        rejection: currentMediaConsentRequiredError(),
        requestId: input.requestId,
      });
    }
    const cleanupConfirmed = await deleteUploadObjectForRollback(
      input.accountId,
      objectKey,
    );
    await markUploadFailure(
      input.accountId,
      id,
      cleanupConfirmed ? "storage_write_failed" : "storage_cleanup_failed",
      input.requestId,
    );
    throw new RequestError(
      502,
      "media_upload_failed",
      "The private upload did not finish. The failed item can be retried safely.",
    );
  }

  try {
    await pauseAtSyntheticConcurrencyBarrier(
      "media-upload-before-ready-commit",
    );
    await db.batch([
      db
        .update(mediaAssets)
        .set({
          status: "ready",
          failureCode: null,
          uploadedAt: now,
          processedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(mediaAssets.accountId, input.accountId),
            eq(mediaAssets.id, id),
            eq(mediaAssets.status, "pending"),
          ),
        ),
      ...(consentRequirements.length
        ? [
            consentGrantTransactionGuard(
              input.accountId,
              consentRequirements,
            ),
          ]
        : []),
      ...(input.replacementForAssetId
        ? [retainedMediaTransactionGuard(input.accountId, input.replacementForAssetId)]
        : []),
      ...(input.replacementForAssetId
        ? [
            db.insert(mediaAssetReplacements).values({
              accountId: input.accountId,
              replacedMediaAssetId: input.replacementForAssetId,
              replacementMediaAssetId: id,
              reasonCode: input.replacementReason ?? "coach_replaced",
            }),
          ]
        : []),
      auditInsert(input.accountId, "media.upload", id, input.requestId, {
        mediaKind,
        replacement: Boolean(input.replacementForAssetId),
      }),
    ]);
  } catch {
    if (
      await consentRequirementLost(
        input.accountId,
        consentRequirements,
      )
    ) {
      return rejectPendingUploadAfterCleanup({
        accountId: input.accountId,
        mediaAssetId: id,
        objectKey,
        rejection: currentMediaConsentRequiredError(),
        requestId: input.requestId,
      });
    }
    const cleanupConfirmed = await deleteUploadObjectForRollback(
      input.accountId,
      objectKey,
    );
    await markUploadFailure(
      input.accountId,
      id,
      cleanupConfirmed ? "metadata_commit_failed" : "storage_cleanup_failed",
      input.requestId,
    );
    throw new RequestError(
      502,
      "media_upload_failed",
      "The upload could not be committed. Retry after checking the media library.",
    );
  }
  const result = await getMediaAsset(input.accountId, id);
  if (!result) throw new Error("Committed media asset could not be read.");
  return result;
}

export async function deleteUnattachedMediaAsset(input: {
  accountId: string;
  mediaAssetId: string;
  requestId?: string | null;
}): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.accountId, input.accountId),
        eq(mediaAssets.id, input.mediaAssetId),
      ),
    )
    .limit(1);
  if (!row) throw new RequestError(404, "media_not_found", "Media was not found.");
  if (row.status === "deleted") return;
  if (row.status === "pending") {
    throw new RequestError(
      409,
      "media_processing",
      "Wait for this media upload to finish before removing it.",
    );
  }
  if (
    row.failureCode?.startsWith(MEDIA_DELETE_CLAIM_PREFIX) &&
    toMillis(row.updatedAt)! > Date.now() - MEDIA_DELETE_CLAIM_LEASE_MS
  ) {
    throw new RequestError(
      409,
      "media_delete_in_progress",
      "This media removal is already in progress.",
    );
  }
  const [attachment] = await db
    .select({ id: contentMediaAttachments.id })
    .from(contentMediaAttachments)
    .where(
      and(
        eq(contentMediaAttachments.accountId, input.accountId),
        eq(contentMediaAttachments.mediaAssetId, input.mediaAssetId),
        eq(contentMediaAttachments.status, "active"),
      ),
    )
    .limit(1);
  if (attachment) {
    throw new RequestError(
      409,
      "media_still_attached",
      "Withdraw this media from every coaching context before removing it.",
    );
  }
  // Direct profile foreign keys predate the attachment junction and must also
  // prevent removal during upgrades.
  const [profileUse] = await db
    .select({ accountId: instructorProfiles.accountId })
    .from(instructorProfiles)
    .where(
      and(
        eq(instructorProfiles.accountId, input.accountId),
        // Keep this as SQL so either optional FK can match without importing a
        // second query abstraction.
        eq(instructorProfiles.logoMediaAssetId, input.mediaAssetId),
      ),
    )
    .limit(1);
  const [photoUse] = await db
    .select({ accountId: instructorProfiles.accountId })
    .from(instructorProfiles)
    .where(
      and(
        eq(instructorProfiles.accountId, input.accountId),
        eq(instructorProfiles.profilePhotoMediaAssetId, input.mediaAssetId),
      ),
    )
    .limit(1);
  if (profileUse || photoUse) {
    throw new RequestError(409, "media_still_attached", "Remove this media from the coach profile first.");
  }
  const [posterUse] = await db
    .select({ mediaAssetId: mediaAssetDetails.mediaAssetId })
    .from(mediaAssetDetails)
    .innerJoin(
      mediaAssets,
      and(
        eq(mediaAssets.accountId, mediaAssetDetails.accountId),
        eq(mediaAssets.id, mediaAssetDetails.mediaAssetId),
      ),
    )
    .where(
      and(
        eq(mediaAssetDetails.accountId, input.accountId),
        eq(mediaAssetDetails.posterMediaAssetId, input.mediaAssetId),
        inArray(mediaAssets.status, ["pending", "ready", "failed", "quarantined"]),
      ),
    )
    .limit(1);
  if (posterUse) {
    throw new RequestError(
      409,
      "media_still_attached",
      "Choose a different poster for every video using this image before removing it.",
    );
  }
  const [launchImportUse, launchSessionUse] = await Promise.all([
    db
      .select({ id: launchMonitorImports.id })
      .from(launchMonitorImports)
      .where(
        and(
          eq(launchMonitorImports.accountId, input.accountId),
          eq(launchMonitorImports.sourceMediaAssetId, input.mediaAssetId),
          sql`${launchMonitorImports.status} <> 'abandoned'`,
        ),
      )
      .limit(1),
    db
      .select({ id: launchMonitorSessions.id })
      .from(launchMonitorSessions)
      .where(
        and(
          eq(launchMonitorSessions.accountId, input.accountId),
          eq(launchMonitorSessions.sourceMediaAssetId, input.mediaAssetId),
          inArray(launchMonitorSessions.status, ["committed", "withdrawn"]),
        ),
      )
      .limit(1),
  ]);
  if (launchImportUse[0] || launchSessionUse[0]) {
    throw new RequestError(
      409,
      "media_still_attached",
      "This source file is retained with a launch-monitor import or committed session.",
    );
  }

  await pauseAtSyntheticConcurrencyBarrier("media-delete-before-claim");

  const claimAt = new Date();
  const claimCode = `${MEDIA_DELETE_CLAIM_PREFIX}${newId()}`;
  const observedFailureCode = row.failureCode === null
    ? isNull(mediaAssets.failureCode)
    : eq(mediaAssets.failureCode, row.failureCode);
  const [claimResult] = await db.batch([
    db
      .update(mediaAssets)
      .set({
        status: "quarantined",
        failureCode: claimCode,
        updatedAt: claimAt,
      })
      .where(
        and(
          eq(mediaAssets.accountId, input.accountId),
          eq(mediaAssets.id, input.mediaAssetId),
          eq(mediaAssets.status, row.status),
          observedFailureCode,
          notExists(
            db
              .select({ id: contentMediaAttachments.id })
              .from(contentMediaAttachments)
              .where(
                and(
                  eq(contentMediaAttachments.accountId, mediaAssets.accountId),
                  eq(contentMediaAttachments.mediaAssetId, mediaAssets.id),
                  eq(contentMediaAttachments.status, "active"),
                ),
              ),
          ),
          notExists(
            db
              .select({ accountId: instructorProfiles.accountId })
              .from(instructorProfiles)
              .where(
                and(
                  eq(instructorProfiles.accountId, mediaAssets.accountId),
                  or(
                    eq(instructorProfiles.logoMediaAssetId, mediaAssets.id),
                    eq(instructorProfiles.profilePhotoMediaAssetId, mediaAssets.id),
                  ),
                ),
              ),
          ),
          notExists(
            db
              .select({ mediaAssetId: mediaAssetDetails.mediaAssetId })
              .from(mediaAssetDetails)
              .innerJoin(
                mediaAssets,
                and(
                  eq(mediaAssets.accountId, mediaAssetDetails.accountId),
                  eq(mediaAssets.id, mediaAssetDetails.mediaAssetId),
                ),
              )
              .where(
                and(
                  eq(mediaAssetDetails.accountId, row.accountId),
                  eq(mediaAssetDetails.posterMediaAssetId, row.id),
                  inArray(mediaAssets.status, ["pending", "ready", "failed", "quarantined"]),
                ),
              ),
          ),
          notExists(
            db
              .select({ id: launchMonitorImports.id })
              .from(launchMonitorImports)
              .where(
                and(
                  eq(launchMonitorImports.accountId, mediaAssets.accountId),
                  eq(launchMonitorImports.sourceMediaAssetId, mediaAssets.id),
                  sql`${launchMonitorImports.status} <> 'abandoned'`,
                ),
              ),
          ),
          notExists(
            db
              .select({ id: launchMonitorSessions.id })
              .from(launchMonitorSessions)
              .where(
                and(
                  eq(launchMonitorSessions.accountId, mediaAssets.accountId),
                  eq(launchMonitorSessions.sourceMediaAssetId, mediaAssets.id),
                  inArray(launchMonitorSessions.status, ["committed", "withdrawn"]),
                ),
              ),
          ),
        ),
      ),
  ]);
  if (Number(claimResult.meta.changes) !== 1) {
    const [current] = await db
      .select({ status: mediaAssets.status, failureCode: mediaAssets.failureCode })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.accountId, input.accountId),
          eq(mediaAssets.id, input.mediaAssetId),
        ),
      )
      .limit(1);
    if (current?.status === "deleted") return;
    if (current?.failureCode?.startsWith(MEDIA_DELETE_CLAIM_PREFIX)) {
      throw new RequestError(
        409,
        "media_delete_in_progress",
        "This media removal is already in progress.",
      );
    }
    throw new RequestError(
      409,
      "media_still_attached",
      "This media became referenced by coaching content before removal could begin.",
    );
  }

  try {
    if (
      await consumeSyntheticConcurrencyFault(
        "media-next-storage-delete",
        input.accountId,
      )
    ) {
      throw new Error("Synthetic one-shot media storage delete failure.");
    }
    await env.MEDIA.delete(row.objectKey);
  } catch {
    const failedAt = new Date();
    await db.batch([
      db
        .update(mediaAssets)
        .set({
          status: row.status,
          failureCode: row.failureCode,
          deletedAt: row.deletedAt,
          updatedAt: failedAt,
        })
        .where(
          and(
            eq(mediaAssets.accountId, input.accountId),
            eq(mediaAssets.id, input.mediaAssetId),
            eq(mediaAssets.status, "quarantined"),
            eq(mediaAssets.failureCode, claimCode),
          ),
        ),
      auditInsert(
        input.accountId,
        "media.delete_failed",
        input.mediaAssetId,
        input.requestId,
        { failureCode: "storage_delete_failed" },
        "failure",
      ),
    ]);
    throw new RequestError(
      502,
      "media_delete_failed",
      "Private storage did not confirm removal. The media remains available and can be retried.",
    );
  }

  const deletedAt = new Date();
  await db.batch([
    db
      .update(mediaAssets)
      .set({
        status: sql<"deleted">`case when ${mediaAssets.status} = 'quarantined' and ${mediaAssets.failureCode} = ${claimCode} then 'deleted' else null end`,
        failureCode: null,
        deletedAt,
        updatedAt: deletedAt,
      })
      .where(
        and(
          eq(mediaAssets.accountId, input.accountId),
          eq(mediaAssets.id, input.mediaAssetId),
        ),
      ),
    auditInsert(input.accountId, "media.delete", input.mediaAssetId, input.requestId, {}),
  ]);
}

export type SharedMediaCapability = Readonly<{
  accountId: string;
  golferId: string;
  planId: string;
  planRevision: number;
  shareId: string;
  linkTokenHash: string;
  sessionId: string;
  sessionTokenHash: string;
  requirements: readonly ConsentGrantRequirement[];
}>;

/**
 * Authorizes the exact media relationship and exact current share capability
 * in one D1 snapshot. A plan mutation that both creates an attachment and
 * invalidates the published capability therefore cannot expose the new asset
 * through the stale session in either transaction order.
 */
export async function loadSharedMediaObject(
  capability: SharedMediaCapability,
  mediaAssetId: string,
  range: R2Range | undefined,
): Promise<{
  asset: typeof mediaAssets.$inferSelect;
  object: R2ObjectBody;
} | null> {
  await pauseAtSyntheticConcurrencyBarrier("shared-media-before-final-authorization");
  const databaseNow = sql`cast((julianday('now') - 2440587.5) * 86400000 as integer)`;
  const [row] = await getDb()
    .select({ asset: mediaAssets })
    .from(shareSessions)
    .innerJoin(
      shareLinks,
      and(
        eq(shareLinks.accountId, shareSessions.accountId),
        eq(shareLinks.id, shareSessions.shareLinkId),
      ),
    )
    .innerJoin(
      developmentPlans,
      and(
        eq(developmentPlans.accountId, shareLinks.accountId),
        eq(developmentPlans.id, shareLinks.planId),
      ),
    )
    .innerJoin(
      mediaAssets,
      and(
        eq(mediaAssets.accountId, shareSessions.accountId),
        eq(mediaAssets.id, mediaAssetId),
      ),
    )
    .where(
      and(
        eq(shareSessions.accountId, capability.accountId),
        eq(shareSessions.id, capability.sessionId),
        eq(shareSessions.shareLinkId, capability.shareId),
        eq(shareSessions.tokenHash, capability.sessionTokenHash),
        eq(shareSessions.tokenHashAlgorithm, "hmac-sha256-session-v1"),
        isNull(shareSessions.revokedAt),
        sql`${shareSessions.expiresAt} > ${databaseNow}`,
        eq(shareLinks.accountId, capability.accountId),
        eq(shareLinks.id, capability.shareId),
        eq(shareLinks.planId, capability.planId),
        eq(shareLinks.planRevision, capability.planRevision),
        eq(shareLinks.tokenHash, capability.linkTokenHash),
        eq(shareLinks.tokenHashAlgorithm, "hmac-sha256-v1"),
        eq(shareLinks.scope, "golfer_plan_read"),
        eq(shareLinks.status, "active"),
        isNull(shareLinks.revokedAt),
        sql`(${shareLinks.expiresAt} is null or ${shareLinks.expiresAt} > ${databaseNow})`,
        eq(developmentPlans.accountId, capability.accountId),
        eq(developmentPlans.id, capability.planId),
        eq(developmentPlans.golferId, capability.golferId),
        inArray(developmentPlans.status, ["published", "paused", "completed"]),
        eq(developmentPlans.publishedRevision, capability.planRevision),
        sql`${developmentPlans.publishedAt} is not null`,
        eq(mediaAssets.accountId, capability.accountId),
        eq(mediaAssets.id, mediaAssetId),
        eq(mediaAssets.status, "ready"),
        currentConsentGrantsCondition(capability.accountId, capability.requirements),
        or(
          sql`exists (
            select 1 from ${contentMediaAttachments}
             where ${contentMediaAttachments.accountId} = ${mediaAssets.accountId}
               and ${contentMediaAttachments.planId} = ${capability.planId}
               and ${contentMediaAttachments.mediaAssetId} = ${mediaAssets.id}
               and ${contentMediaAttachments.status} = 'active'
          )`,
          sql`exists (
            select 1 from ${mediaAssetDetails}
            join ${contentMediaAttachments}
              on ${contentMediaAttachments.accountId} = ${mediaAssetDetails.accountId}
             and ${contentMediaAttachments.mediaAssetId} = ${mediaAssetDetails.mediaAssetId}
           where ${mediaAssetDetails.accountId} = ${mediaAssets.accountId}
             and ${mediaAssetDetails.posterMediaAssetId} = ${mediaAssets.id}
             and ${contentMediaAttachments.planId} = ${capability.planId}
             and ${contentMediaAttachments.status} = 'active'
          )`,
          sql`exists (
            select 1 from ${instructorProfiles}
             where ${instructorProfiles.accountId} = ${mediaAssets.accountId}
               and (${instructorProfiles.logoMediaAssetId} = ${mediaAssets.id}
                 or ${instructorProfiles.profilePhotoMediaAssetId} = ${mediaAssets.id})
          )`,
        ),
      ),
    )
    .limit(1);
  if (!row) return null;
  const object = await env.MEDIA.get(row.asset.objectKey, range ? { range } : undefined);
  return object ? { asset: row.asset, object } : null;
}

export async function loadMediaObject(
  accountId: string,
  mediaAssetId: string,
  range: R2Range | undefined,
): Promise<{
  asset: typeof mediaAssets.$inferSelect;
  object: R2ObjectBody;
} | null> {
  const [asset] = await getDb()
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.accountId, accountId),
        eq(mediaAssets.id, mediaAssetId),
        eq(mediaAssets.status, "ready"),
      ),
    )
    .limit(1);
  if (!asset) return null;
  const object = await env.MEDIA.get(asset.objectKey, range ? { range } : undefined);
  return object ? { asset, object } : null;
}

export async function mediaAssetAttachedToPublishedPlan(
  accountId: string,
  planId: string,
  mediaAssetId: string,
): Promise<boolean> {
  const [attachment] = await getDb()
    .select({ id: contentMediaAttachments.id })
    .from(contentMediaAttachments)
    .where(
      and(
        eq(contentMediaAttachments.accountId, accountId),
        eq(contentMediaAttachments.planId, planId),
        eq(contentMediaAttachments.mediaAssetId, mediaAssetId),
        eq(contentMediaAttachments.status, "active"),
      ),
    )
    .limit(1);
  if (attachment) return true;

  // A video poster is a separate private image asset. It is deliverable only
  // when a currently active plan attachment references the video that owns it.
  const [posterForAttachment] = await getDb()
    .select({ id: contentMediaAttachments.id })
    .from(mediaAssetDetails)
    .innerJoin(
      contentMediaAttachments,
      and(
        eq(contentMediaAttachments.accountId, mediaAssetDetails.accountId),
        eq(contentMediaAttachments.mediaAssetId, mediaAssetDetails.mediaAssetId),
      ),
    )
    .where(
      and(
        eq(mediaAssetDetails.accountId, accountId),
        eq(mediaAssetDetails.posterMediaAssetId, mediaAssetId),
        eq(contentMediaAttachments.planId, planId),
        eq(contentMediaAttachments.status, "active"),
      ),
    )
    .limit(1);
  if (posterForAttachment) return true;

  // Coach branding is account-scoped rather than plan-scoped, but a branding
  // change invalidates every non-archived plan and active share before this
  // reference can change. The exact republished revision may therefore load
  // only the profile assets selected for its tenant.
  const [profileBranding] = await getDb()
    .select({ accountId: instructorProfiles.accountId })
    .from(instructorProfiles)
    .where(
      and(
        eq(instructorProfiles.accountId, accountId),
        sql`${mediaAssetId} in (${instructorProfiles.logoMediaAssetId}, ${instructorProfiles.profilePhotoMediaAssetId})`,
      ),
    )
    .limit(1);
  return Boolean(profileBranding);
}

async function markUploadFailure(
  accountId: string,
  mediaAssetId: string,
  failureCode: string,
  requestId?: string | null,
) {
  const now = new Date();
  await getDb().batch([
    getDb()
      .update(mediaAssets)
      .set({ status: "failed", failureCode, updatedAt: now })
      .where(and(eq(mediaAssets.accountId, accountId), eq(mediaAssets.id, mediaAssetId))),
    auditInsert(accountId, "media.upload_failed", mediaAssetId, requestId, {
      failureCode,
    }),
  ]);
}

function isRejectedUploadRequest(error: unknown): error is RequestError {
  return (
    error instanceof RequestError &&
    (error.status === 400 || error.status === 413) &&
    [
      "invalid_media_envelope",
      "media_size_invalid",
      "payload_too_large",
    ].includes(error.code)
  );
}

function isAccountMediaConsentRequirement(
  requirements: readonly ConsentGrantRequirement[],
): boolean {
  const [requirement] = requirements;
  return (
    requirements.length === 1 &&
    requirement?.purpose === "media_use" &&
    requirement.subject.type === "account" &&
    requirement.subject.golferId === null &&
    Boolean(requirement.policyVersion) &&
    Boolean(requirement.purposeDescription)
  );
}

async function consentRequirementLost(
  accountId: string,
  requirements: readonly ConsentGrantRequirement[],
): Promise<boolean> {
  if (requirements.length < 1) return false;
  try {
    return !(await consentGrantRequirementsCurrent(accountId, requirements));
  } catch {
    // A verification outage must not be misreported as a consent withdrawal.
    // The surrounding storage/commit failure path still fails closed with a
    // private referenced row and a retryable server response.
    return false;
  }
}

async function rethrowConsentRace(
  accountId: string,
  requirements: readonly ConsentGrantRequirement[],
  originalError: unknown,
): Promise<never> {
  if (await consentRequirementLost(accountId, requirements)) {
    throw currentMediaConsentRequiredError();
  }
  throw originalError;
}

function currentMediaConsentRequiredError(): RequestError {
  return new RequestError(
    409,
    "current_consent_required",
    "A current configured authorization is required for this action.",
  );
}

async function rejectPendingUploadAfterCleanup(input: {
  accountId: string;
  mediaAssetId: string;
  objectKey: string;
  rejection: RequestError;
  requestId?: string | null;
}): Promise<never> {
  if (
    await deleteUploadObjectForRollback(input.accountId, input.objectKey)
  ) {
    await rollbackRejectedUpload(input.accountId, input.mediaAssetId);
    throw input.rejection;
  }
  await markUploadFailure(
    input.accountId,
    input.mediaAssetId,
    "storage_cleanup_failed",
    input.requestId,
  );
  throw new RequestError(
    502,
    "media_upload_cleanup_failed",
    "The upload could not be finalized. Inspect the failed private item before retrying.",
  );
}

async function deleteUploadObjectForRollback(
  accountId: string,
  objectKey: string,
): Promise<boolean> {
  try {
    if (
      await consumeSyntheticConcurrencyFault(
        "media-next-upload-cleanup-delete",
        accountId,
      )
    ) {
      throw new Error("Synthetic one-shot upload cleanup failure.");
    }
    await env.MEDIA.delete(objectKey);
  } catch {
    // A failed delete can still be a confirmed success if the object never
    // committed or a concurrent cleanup already removed it. The HEAD below is
    // the authoritative absence check in both cases.
  }
  try {
    return (await env.MEDIA.head(objectKey)) === null;
  } catch {
    return false;
  }
}

async function rollbackRejectedUpload(
  accountId: string,
  mediaAssetId: string,
): Promise<void> {
  const db = getDb();
  await db.batch([
    db
      .delete(mediaAssetDetails)
      .where(
        and(
          eq(mediaAssetDetails.accountId, accountId),
          eq(mediaAssetDetails.mediaAssetId, mediaAssetId),
        ),
      ),
    db
      .delete(mediaAssets)
      .where(
        and(
          eq(mediaAssets.accountId, accountId),
          eq(mediaAssets.id, mediaAssetId),
          eq(mediaAssets.status, "pending"),
        ),
      ),
  ]);
}

function auditInsert(
  accountId: string,
  action: string,
  targetId: string,
  requestId: string | null | undefined,
  metadata: Record<string, unknown>,
  outcome: "success" | "failure" = "success",
) {
  return getDb().insert(auditEvents).values({
    id: newId(),
    accountId,
    actorType: "account",
    actorAccountId: accountId,
    action,
    targetType: "media_asset",
    targetId,
    outcome,
    requestId: requestId || null,
    metadata,
  });
}

export function readyMediaTransactionGuard(accountId: string, mediaAssetId: string) {
  return getDb()
    .update(mediaAssets)
    .set({
      status: sql<"ready">`case when ${mediaAssets.status} = 'ready' then 'ready' else null end`,
    })
    .where(
      and(
        eq(mediaAssets.accountId, accountId),
        eq(mediaAssets.id, mediaAssetId),
      ),
    );
}

export function retainedMediaTransactionGuard(accountId: string, mediaAssetId: string) {
  return getDb()
    .update(mediaAssets)
    .set({
      status: sql<typeof mediaAssets.$inferSelect.status>`case
        when ${mediaAssets.status} <> 'deleted'
         and coalesce(${mediaAssets.failureCode}, '') not like ${`${MEDIA_DELETE_CLAIM_PREFIX}%`}
        then ${mediaAssets.status}
        else null
      end`,
    })
    .where(
      and(
        eq(mediaAssets.accountId, accountId),
        eq(mediaAssets.id, mediaAssetId),
      ),
    );
}

export async function assertMediaStillRetained(
  accountId: string,
  mediaAssetId: string,
): Promise<void> {
  const [retained] = await getDb()
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.accountId, accountId),
        eq(mediaAssets.id, mediaAssetId),
        sql`${mediaAssets.status} <> 'deleted'`,
        sql`coalesce(${mediaAssets.failureCode}, '') not like ${`${MEDIA_DELETE_CLAIM_PREFIX}%`}`,
      ),
    )
    .limit(1);
  if (!retained) {
    throw new RequestError(
      409,
      "media_asset_unavailable",
      "The media being replaced changed while the replacement was being saved. Refresh and try again.",
    );
  }
}

export function readyMediaTransactionGuards(
  accountId: string,
  mediaAssetIds: readonly string[],
) {
  return [...new Set(mediaAssetIds)].map((mediaAssetId) =>
    readyMediaTransactionGuard(accountId, mediaAssetId),
  );
}

export async function assertMediaStillReady(
  accountId: string,
  mediaAssetIds: readonly string[],
): Promise<void> {
  const distinctIds = [...new Set(mediaAssetIds)];
  const ready = distinctIds.length
    ? await getDb()
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.accountId, accountId),
            inArray(mediaAssets.id, distinctIds),
            eq(mediaAssets.status, "ready"),
          ),
        )
    : [];
  if (ready.length !== distinctIds.length) {
    throw new RequestError(
      409,
      "media_asset_not_ready",
      "The selected media changed while this update was being saved. Refresh and choose ready media.",
    );
  }
}

function mediaView(
  asset: typeof mediaAssets.$inferSelect,
  details: typeof mediaAssetDetails.$inferSelect | null,
  replacementMediaAssetId: string | null,
): MediaAssetView {
  return {
    id: asset.id,
    status: asset.status,
    mediaKind: asset.mediaKind,
    mimeType: asset.mimeType,
    originalFilename: asset.originalFilename,
    byteSize: asset.byteSize,
    widthPixels: asset.widthPixels,
    heightPixels: asset.heightPixels,
    durationMs: asset.durationMs,
    altText: asset.altText,
    caption: asset.caption,
    transcript: asset.transcript,
    capturedAt: toMillis(details?.capturedAt),
    orientation: details?.orientation ?? "unknown",
    viewLabel: details?.viewLabel ?? null,
    coachContext: details?.coachContext ?? null,
    posterMediaAssetId: details?.posterMediaAssetId ?? null,
    failureCode: asset.failureCode,
    uploadedAt: toMillis(asset.uploadedAt),
    replacementMediaAssetId,
  };
}

function cleanFilename(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f\\/]/gu, "_").trim();
  return cleaned ? cleaned.slice(0, 180) : null;
}

function positiveOrNull(value: number | null): number | null {
  return value && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function bounded(value: string, max: number): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(cleaned)) {
    throw new RequestError(400, "invalid_media_metadata", "Media metadata is invalid.");
  }
  return cleaned;
}

function boundedOrNull(value: string | null, max: number): string | null {
  return value?.trim() ? bounded(value, max) : null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  return hexBytes(new Uint8Array(digest));
}

function assertStoredObject(
  stored: R2Object | null,
  expectedBytes: number,
  expectedSha256: string,
): void {
  const storedSha256 = stored?.checksums.sha256;
  if (
    !stored ||
    stored.size !== expectedBytes ||
    !storedSha256 ||
    hexBytes(new Uint8Array(storedSha256)) !== expectedSha256
  ) {
    throw new Error("Private storage did not verify the media size and SHA-256 digest.");
  }
}

function hexBytes(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toMillis(value: Date | number | null | undefined): number | null {
  if (value == null) return null;
  return value instanceof Date ? value.getTime() : value;
}
