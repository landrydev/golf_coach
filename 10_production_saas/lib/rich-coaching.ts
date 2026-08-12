import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  assessments,
  auditEvents,
  contentMediaAttachments,
  developmentPlans,
  drillTemplates,
  evidenceItems,
  instructorProfiles,
  launchMonitorComparisonGroups,
  launchMonitorComparisonMetrics,
  launchMonitorImports,
  launchMonitorMetricDefinitions,
  launchMonitorMetrics,
  launchMonitorSessions,
  launchMonitorShots,
  lessonRevisionSnapshots,
  lessons,
  mediaAssetDetails,
  mediaAssetReplacements,
  mediaAssets,
  milestones,
  phaseReviewSources,
  phaseReviews,
  planPhases,
  practiceAssignmentReplacements,
  practiceAssignmentSnapshots,
  practiceCheckIns,
  practiceItems,
  roadmapTemplates,
  shareLinks,
  shareSessions,
} from "@/db/schema";
import {
  consentGrantRequirementsCurrent,
  consentGrantTransactionGuard,
  type ConsentGrantRequirement,
} from "@/lib/consent-repository";
import { configuredRoadmapAccessRequirements } from "@/lib/consent-enforcement";
import { RequestError } from "@/lib/http";
import {
  launchCsvStageFingerprint,
  launchMetricsForRow,
  summarizeLaunchCsvRows,
} from "@/lib/launch-csv-review";
import {
  assertMediaStillRetained,
  assertMediaStillReady,
  readyMediaTransactionGuard,
  readyMediaTransactionGuards,
  retainedMediaTransactionGuard,
} from "@/lib/media";
import { resolveShareSession } from "@/lib/plans";
import {
  hashToken,
  newId,
  shareSessionContextsEqual,
} from "@/lib/tokens";
import { pauseAtSyntheticConcurrencyBarrier } from "@/lib/synthetic-concurrency-barrier";

const MAX_TEMPLATE_STEPS = 24;
const MAX_EQUIPMENT_ITEMS = 24;
const MAX_IMPORT_COLUMNS = 200;
const MAX_IMPORT_ROWS = 10_000;
const MAX_SESSION_SHOTS = 1_000;
const MAX_METRICS_PER_SHOT = 64;
const MAX_SUMMARY_METRICS = 64;
const MAX_SESSION_METRICS = 2_000;
// Metric-definition subqueries add two bindings to every value row. Five rows
// leave deliberate headroom below D1's per-statement SQLite binding ceiling.
const MAX_METRIC_ROWS_PER_INSERT = 5;
const MAX_PERSISTED_CSV_BYTES = 512_000;
const MAX_LESSON_ASSOCIATIONS_PER_TYPE = 50;

export type RichPlanMutationContext = Readonly<{
  accountId: string;
  planId: string;
  expectedRevision: number;
  consentRequirements: readonly ConsentGrantRequirement[];
  requestId?: string | null;
}>;

export type DrillTemplateDraft = Readonly<{
  title: string;
  purpose: string;
  whenItFits: string;
  equipment: readonly string[];
  setup: string;
  steps: readonly string[];
  dosageOrCadence: string;
  feelOrCue?: string | null;
  successCheck: string;
  commonMiss?: string | null;
  stopOrAskRule: string;
  constraintOrAdaptation?: string | null;
  progression?: string | null;
  regression?: string | null;
}>;

export type RoadmapTemplateContent = Readonly<{
  goalPrompt?: string | null;
  assessmentPrompt?: string | null;
  priorityPrompt?: string | null;
  phases: readonly Readonly<{
    title: string;
    purpose: string;
    rationale?: string | null;
    progressSignals: readonly string[];
  }>[];
}>;

export type MediaUploadPolicy = Readonly<{
  allowedMimeTypes: readonly string[];
  maximumBytes: number;
}>;

export type MediaAssetDraft = Readonly<{
  mediaKind: "image" | "video" | "audio" | "document";
  mimeType: string;
  originalFilename?: string | null;
  byteSize: number;
  altText?: string | null;
  caption?: string | null;
  transcript?: string | null;
  capturedAt?: Date | null;
  orientation?: "landscape" | "portrait" | "square" | "unknown";
  viewLabel?: string | null;
  coachContext?: string | null;
}>;

export type PlanMediaAttachmentTarget =
  | Readonly<{ kind: "assessment"; id: string }>
  | Readonly<{ kind: "lesson"; id: string }>
  | Readonly<{ kind: "practice"; id: string }>
  | Readonly<{ kind: "evidence"; id: string }>
  | Readonly<{ kind: "phase_review"; id: string }>;

export type AccountMediaAttachmentTarget =
  | Readonly<{ kind: "profile" }>
  | Readonly<{ kind: "drill"; id: string }>;

export type AttachmentRole =
  | "primary"
  | "supporting"
  | "demo"
  | "baseline"
  | "current"
  | "poster"
  | "logo"
  | "profile_photo"
  | "source";

export type LaunchMetricInput = Readonly<{
  canonicalKey: string;
  originalName: string;
  displayName: string;
  numericValue: number;
  unit: string;
  sourceColumn?: string | null;
  direction?: "higher" | "lower" | "target" | "context_only" | "unknown";
  golferFacing?: boolean;
}>;

export type LaunchShotInput = Readonly<{
  sourceRowNumber?: number | null;
  label?: string | null;
  capturedAt?: Date | null;
  metrics: readonly LaunchMetricInput[];
}>;

export type LaunchMonitorSessionInput = Readonly<{
  phaseId?: string | null;
  lessonId?: string | null;
  importId?: string | null;
  stagedReviewFingerprint?: string | null;
  sourceMediaAssetId?: string | null;
  sourceMode: "manual" | "csv_import";
  sessionDate: Date;
  deviceSource: string;
  club?: string | null;
  environment?: string | null;
  conditions?: string | null;
  notes?: string | null;
  coachInterpretation: string;
  limitations: string;
  representativeness: "representative" | "limited" | "unknown";
  nextEvidenceNeeded?: string | null;
  summaryMetrics: readonly LaunchMetricInput[];
  shots?: readonly LaunchShotInput[];
}>;

export type RichTimelineItem = Readonly<{
  id: string;
  kind:
    | "lesson"
    | "practice"
    | "practice_check_in"
    | "evidence"
    | "launch_session"
    | "phase_review"
    | "milestone";
  occurredAt: number;
  title: string;
  summary: string | null;
  status: string;
}>;

export type LaunchMonitorComparison = Readonly<{
  id: string;
  title: string;
  baselineSessionId: string;
  currentSessionId: string;
  coachInterpretation: string;
  limitations: string;
  nextEvidenceNeeded: string | null;
  metrics: readonly Readonly<{
    displayName: string;
    unit: string;
    baselineValue: number;
    currentValue: number;
    delta: number;
  }>[];
}>;

export async function createDrillTemplate(
  accountId: string,
  input: DrillTemplateDraft,
  requestId?: string | null,
): Promise<{ id: string; version: number }> {
  const draft = normalizedDrillDraft(input);
  await requireActiveAccount(accountId);
  const id = newId();
  const now = new Date();
  const db = getDb();
  await db.batch([
    db.insert(drillTemplates).values({
      id,
      accountId,
      ...draft,
      status: "active",
      isFavourite: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }),
    auditStatement({
      accountId,
      action: "drill_template.created",
      targetType: "drill_template",
      targetId: id,
      requestId,
      metadata: { sourceTemplateId: null, version: 1 },
      occurredAt: now,
    }),
  ]);
  return { id, version: 1 };
}

export async function duplicateDrillTemplate(input: {
  accountId: string;
  sourceTemplateId: string;
  title?: string | null;
  requestId?: string | null;
}): Promise<{ id: string; version: number }> {
  const sourceTemplateId = opaqueId(input.sourceTemplateId, "sourceTemplateId");
  const [source] = await getDb()
    .select()
    .from(drillTemplates)
    .where(
      and(
        eq(drillTemplates.accountId, input.accountId),
        eq(drillTemplates.id, sourceTemplateId),
      ),
    )
    .limit(1);
  if (!source) throw notFound("drill_template_not_found", "Drill template not found.");
  const id = newId();
  const now = new Date();
  const title = input.title
    ? requiredText(input.title, "title", 160)
    : `${source.title.slice(0, 155).trimEnd()} copy`;
  const db = getDb();
  await db.batch([
    db.insert(drillTemplates).values({
      id,
      accountId: input.accountId,
      sourceTemplateId: source.id,
      title,
      purpose: source.purpose,
      whenItFits: source.whenItFits,
      equipment: source.equipment,
      setup: source.setup,
      steps: source.steps,
      dosageOrCadence: source.dosageOrCadence,
      feelOrCue: source.feelOrCue,
      successCheck: source.successCheck,
      commonMiss: source.commonMiss,
      stopOrAskRule: source.stopOrAskRule,
      constraintOrAdaptation: source.constraintOrAdaptation,
      progression: source.progression,
      regression: source.regression,
      status: "active",
      isFavourite: source.isFavourite,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }),
    auditStatement({
      accountId: input.accountId,
      action: "drill_template.duplicated",
      targetType: "drill_template",
      targetId: id,
      requestId: input.requestId,
      metadata: { sourceTemplateId: source.id, version: 1 },
      occurredAt: now,
    }),
  ]);
  return { id, version: 1 };
}

export async function updateDrillTemplate(input: {
  accountId: string;
  drillTemplateId: string;
  expectedVersion: number;
  draft: DrillTemplateDraft;
  requestId?: string | null;
}): Promise<{ version: number }> {
  const drillTemplateId = opaqueId(input.drillTemplateId, "drillTemplateId");
  const expectedVersion = boundedInteger(input.expectedVersion, "expectedVersion", 1, Number.MAX_SAFE_INTEGER);
  const draft = normalizedDrillDraft(input.draft);
  await requireTemplateVersion(input.accountId, drillTemplateId, expectedVersion, "drill");
  const now = new Date();
  const db = getDb();
  try {
    await db.batch([
      db
        .update(drillTemplates)
        .set({
          ...draft,
          title: sql<string>`case when ${drillTemplates.version} = ${expectedVersion} and ${drillTemplates.status} = 'active' then ${draft.title} else null end`,
          version: sql`${drillTemplates.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(drillTemplates.accountId, input.accountId), eq(drillTemplates.id, drillTemplateId))),
      auditStatement({
        accountId: input.accountId,
        action: "drill_template.updated",
        targetType: "drill_template",
        targetId: drillTemplateId,
        requestId: input.requestId,
        metadata: { fromVersion: expectedVersion, toVersion: expectedVersion + 1 },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await rethrowTemplateVersionConflict(input.accountId, drillTemplateId, expectedVersion, "drill", error);
  }
  return { version: expectedVersion + 1 };
}

export async function setDrillTemplateFavourite(input: {
  accountId: string;
  drillTemplateId: string;
  expectedVersion: number;
  favourite: boolean;
  requestId?: string | null;
}): Promise<{ version: number }> {
  return mutateDrillTemplateState({ ...input, action: "favourite", value: input.favourite });
}

export async function archiveDrillTemplate(input: {
  accountId: string;
  drillTemplateId: string;
  expectedVersion: number;
  requestId?: string | null;
}): Promise<{ version: number }> {
  return mutateDrillTemplateState({ ...input, action: "archive", value: true });
}

export async function createRoadmapTemplate(input: {
  accountId: string;
  title: string;
  description: string;
  content: RoadmapTemplateContent;
  origin?: "coach" | "editable_example";
  requestId?: string | null;
}): Promise<{ id: string; version: number }> {
  await requireActiveAccount(input.accountId);
  const content = normalizedRoadmapTemplateContent(input.content);
  const id = newId();
  const now = new Date();
  const db = getDb();
  await db.batch([
    db.insert(roadmapTemplates).values({
      id,
      accountId: input.accountId,
      title: requiredText(input.title, "title", 160),
      description: requiredText(input.description, "description", 1_500),
      content,
      origin: input.origin ?? "coach",
      status: "active",
      isFavourite: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }),
    auditStatement({
      accountId: input.accountId,
      action: "roadmap_template.created",
      targetType: "roadmap_template",
      targetId: id,
      requestId: input.requestId,
      metadata: { origin: input.origin ?? "coach", phaseCount: content.phases.length },
      occurredAt: now,
    }),
  ]);
  return { id, version: 1 };
}

export async function duplicateRoadmapTemplate(input: {
  accountId: string;
  sourceTemplateId: string;
  expectedSourceVersion: number;
  title?: string | null;
  requestId?: string | null;
}): Promise<{ id: string; version: number }> {
  const sourceTemplateId = opaqueId(input.sourceTemplateId, "sourceTemplateId");
  const expectedSourceVersion = boundedInteger(input.expectedSourceVersion, "expectedSourceVersion", 1, Number.MAX_SAFE_INTEGER);
  const [source] = await getDb()
    .select()
    .from(roadmapTemplates)
    .where(
      and(
        eq(roadmapTemplates.accountId, input.accountId),
        eq(roadmapTemplates.id, sourceTemplateId),
        eq(roadmapTemplates.status, "active"),
      ),
    )
    .limit(1);
  if (!source) throw notFound("roadmap_template_not_found", "Roadmap template not found.");
  if (source.version !== expectedSourceVersion) {
    throw conflict("stale_template_version", "This roadmap template changed. Refresh before duplicating it.");
  }
  const id = newId();
  const now = new Date();
  const db = getDb();
  await db.batch([
    db.insert(roadmapTemplates).values({
      id,
      accountId: input.accountId,
      sourceTemplateId,
      title: input.title
        ? requiredText(input.title, "title", 160)
        : `${source.title.slice(0, 155).trimEnd()} copy`,
      description: source.description,
      content: source.content,
      origin: "coach",
      status: "active",
      isFavourite: source.isFavourite,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }),
    auditStatement({
      accountId: input.accountId,
      action: "roadmap_template.duplicated",
      targetType: "roadmap_template",
      targetId: id,
      requestId: input.requestId,
      metadata: { sourceTemplateId, sourceVersion: expectedSourceVersion },
      occurredAt: now,
    }),
  ]);
  return { id, version: 1 };
}

export async function updateRoadmapTemplate(input: {
  accountId: string;
  roadmapTemplateId: string;
  expectedVersion: number;
  title: string;
  description: string;
  content: RoadmapTemplateContent;
  requestId?: string | null;
}): Promise<{ version: number }> {
  const roadmapTemplateId = opaqueId(input.roadmapTemplateId, "roadmapTemplateId");
  const expectedVersion = boundedInteger(input.expectedVersion, "expectedVersion", 1, Number.MAX_SAFE_INTEGER);
  const title = requiredText(input.title, "title", 160);
  const description = requiredText(input.description, "description", 1_500);
  const content = normalizedRoadmapTemplateContent(input.content);
  await requireTemplateVersion(input.accountId, roadmapTemplateId, expectedVersion, "roadmap");
  const now = new Date();
  const db = getDb();
  try {
    await db.batch([
      db
        .update(roadmapTemplates)
        .set({
          title: sql<string>`case when ${roadmapTemplates.version} = ${expectedVersion} and ${roadmapTemplates.status} = 'active' then ${title} else null end`,
          description,
          content,
          version: sql`${roadmapTemplates.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(roadmapTemplates.accountId, input.accountId), eq(roadmapTemplates.id, roadmapTemplateId))),
      auditStatement({
        accountId: input.accountId,
        action: "roadmap_template.updated",
        targetType: "roadmap_template",
        targetId: roadmapTemplateId,
        requestId: input.requestId,
        metadata: { fromVersion: expectedVersion, toVersion: expectedVersion + 1, phaseCount: content.phases.length },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await rethrowTemplateVersionConflict(input.accountId, roadmapTemplateId, expectedVersion, "roadmap", error);
  }
  return { version: expectedVersion + 1 };
}

export async function setRoadmapTemplateFavourite(input: {
  accountId: string;
  roadmapTemplateId: string;
  expectedVersion: number;
  favourite: boolean;
  requestId?: string | null;
}): Promise<{ version: number }> {
  return mutateRoadmapTemplateState({ ...input, action: "favourite", value: input.favourite });
}

export async function archiveRoadmapTemplate(input: {
  accountId: string;
  roadmapTemplateId: string;
  expectedVersion: number;
  requestId?: string | null;
}): Promise<{ version: number }> {
  return mutateRoadmapTemplateState({ ...input, action: "archive", value: true });
}

export async function reserveMediaAssetMetadata(input: {
  accountId: string;
  asset: MediaAssetDraft;
  policy: MediaUploadPolicy;
  requestId?: string | null;
}): Promise<{ id: string; objectKey: string; status: "pending" }> {
  await requireActiveAccount(input.accountId);
  const asset = normalizedMediaAsset(input.asset, input.policy);
  const id = newId();
  const objectKey = `accounts/${input.accountId}/${id}`;
  const now = new Date();
  const db = getDb();
  await db.batch([
    db.insert(mediaAssets).values({
      id,
      accountId: input.accountId,
      storageProvider: "r2",
      objectKey,
      status: "pending",
      mediaKind: asset.mediaKind,
      mimeType: asset.mimeType,
      originalFilename: asset.originalFilename,
      byteSize: asset.byteSize,
      altText: asset.altText,
      caption: asset.caption,
      transcript: asset.transcript,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(mediaAssetDetails).values({
      accountId: input.accountId,
      mediaAssetId: id,
      capturedAt: asset.capturedAt,
      orientation: asset.orientation,
      viewLabel: asset.viewLabel,
      coachContext: asset.coachContext,
      processingAttempts: 0,
      createdAt: now,
      updatedAt: now,
    }),
    auditStatement({
      accountId: input.accountId,
      action: "media_asset.reserved",
      targetType: "media_asset",
      targetId: id,
      requestId: input.requestId,
      metadata: { mediaKind: asset.mediaKind },
      occurredAt: now,
    }),
  ]);
  return { id, objectKey, status: "pending" };
}

export async function markMediaAssetReady(input: {
  accountId: string;
  mediaAssetId: string;
  contentSha256: string;
  widthPixels?: number | null;
  heightPixels?: number | null;
  durationMs?: number | null;
  posterMediaAssetId?: string | null;
  requestId?: string | null;
}): Promise<void> {
  const mediaAssetId = opaqueId(input.mediaAssetId, "mediaAssetId");
  const [asset] = await getDb()
    .select({ id: mediaAssets.id, status: mediaAssets.status })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.accountId, input.accountId), eq(mediaAssets.id, mediaAssetId)))
    .limit(1);
  if (!asset) throw notFound("media_asset_not_found", "Media asset not found.");
  if (!/^[0-9a-f]{64}$/.test(input.contentSha256)) {
    throw invalid("contentSha256", "contentSha256 must be a lowercase SHA-256 value.");
  }
  if (asset.status === "ready") {
    throw conflict(
      "media_asset_immutable",
      "Ready media metadata cannot be overwritten; create a replacement asset.",
    );
  }
  if (asset.status !== "pending" && asset.status !== "failed") {
    throw conflict("media_asset_not_processible", "This media asset cannot be marked ready.");
  }
  positiveOptionalInteger(input.widthPixels, "widthPixels");
  positiveOptionalInteger(input.heightPixels, "heightPixels");
  nonNegativeOptionalInteger(input.durationMs, "durationMs");
  const posterMediaAssetId = input.posterMediaAssetId
    ? opaqueId(input.posterMediaAssetId, "posterMediaAssetId")
    : null;
  if (posterMediaAssetId === mediaAssetId) {
    throw invalid("posterMediaAssetId", "A media asset cannot be its own poster.");
  }
  if (posterMediaAssetId) await requireReadyMedia(input.accountId, posterMediaAssetId, "image");
  const now = new Date();
  const db = getDb();
  try {
    await db.batch([
      db
        .update(mediaAssets)
        .set({
          status: sql<"ready">`case when ${mediaAssets.status} in ('pending', 'failed') then 'ready' else null end`,
          contentSha256: input.contentSha256,
          widthPixels: input.widthPixels ?? null,
          heightPixels: input.heightPixels ?? null,
          durationMs: input.durationMs ?? null,
          failureCode: null,
          uploadedAt: now,
          processedAt: now,
          updatedAt: now,
        })
        .where(and(eq(mediaAssets.accountId, input.accountId), eq(mediaAssets.id, mediaAssetId))),
      ...(posterMediaAssetId
        ? [readyMediaTransactionGuard(input.accountId, posterMediaAssetId)]
        : []),
      db
        .update(mediaAssetDetails)
        .set({
          posterMediaAssetId,
          processingAttempts: sql`${mediaAssetDetails.processingAttempts} + 1`,
          lastProcessingAttemptAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(mediaAssetDetails.accountId, input.accountId),
            eq(mediaAssetDetails.mediaAssetId, mediaAssetId),
          ),
        ),
      auditStatement({
        accountId: input.accountId,
        action: "media_asset.ready",
        targetType: "media_asset",
        targetId: mediaAssetId,
        requestId: input.requestId,
        metadata: { posterAttached: Boolean(posterMediaAssetId) },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    if (posterMediaAssetId) {
      await assertMediaStillReady(input.accountId, [posterMediaAssetId]);
    }
    throw error;
  }
}

export async function replaceMediaAssetMetadata(input: {
  accountId: string;
  replacedMediaAssetId: string;
  replacement: MediaAssetDraft;
  policy: MediaUploadPolicy;
  reasonCode?: "coach_replaced" | "processing_retry" | "metadata_correction";
  requestId?: string | null;
}): Promise<{ id: string; objectKey: string; status: "pending" }> {
  const replacedMediaAssetId = opaqueId(input.replacedMediaAssetId, "replacedMediaAssetId");
  const [source] = await getDb()
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.accountId, input.accountId),
        eq(mediaAssets.id, replacedMediaAssetId),
        sql`${mediaAssets.status} <> 'deleted'`,
      ),
    )
    .limit(1);
  if (!source) throw notFound("media_asset_not_found", "Media asset not found.");
  const [existingReplacement] = await getDb()
    .select({ id: mediaAssetReplacements.replacementMediaAssetId })
    .from(mediaAssetReplacements)
    .where(
      and(
        eq(mediaAssetReplacements.accountId, input.accountId),
        eq(mediaAssetReplacements.replacedMediaAssetId, replacedMediaAssetId),
      ),
    )
    .limit(1);
  if (existingReplacement) {
    throw conflict("media_asset_already_replaced", "This media asset already has a replacement.");
  }
  const asset = normalizedMediaAsset(input.replacement, input.policy);
  const id = newId();
  const objectKey = `accounts/${input.accountId}/${id}`;
  const now = new Date();
  const db = getDb();
  try {
    await db.batch([
      retainedMediaTransactionGuard(input.accountId, replacedMediaAssetId),
      db.insert(mediaAssets).values({
        id,
        accountId: input.accountId,
        storageProvider: "r2",
        objectKey,
        status: "pending",
        mediaKind: asset.mediaKind,
        mimeType: asset.mimeType,
        originalFilename: asset.originalFilename,
        byteSize: asset.byteSize,
        altText: asset.altText,
        caption: asset.caption,
        transcript: asset.transcript,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(mediaAssetDetails).values({
        accountId: input.accountId,
        mediaAssetId: id,
        capturedAt: asset.capturedAt,
        orientation: asset.orientation,
        viewLabel: asset.viewLabel,
        coachContext: asset.coachContext,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(mediaAssetReplacements).values({
        accountId: input.accountId,
        replacedMediaAssetId,
        replacementMediaAssetId: id,
        reasonCode: input.reasonCode ?? "coach_replaced",
        createdAt: now,
      }),
      auditStatement({
        accountId: input.accountId,
        action: "media_asset.replacement_reserved",
        targetType: "media_asset",
        targetId: id,
        requestId: input.requestId,
        metadata: {
          replacedMediaAssetId,
          reasonCode: input.reasonCode ?? "coach_replaced",
        },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await assertMediaStillRetained(input.accountId, replacedMediaAssetId);
    throw error;
  }
  return { id, objectKey, status: "pending" };
}

export async function attachAccountMedia(input: {
  accountId: string;
  mediaAssetId: string;
  target: AccountMediaAttachmentTarget;
  role: AttachmentRole;
  label?: string | null;
  coachContext?: string | null;
  sortOrder?: number;
  requestId?: string | null;
}): Promise<{ id: string }> {
  const mediaAssetId = opaqueId(input.mediaAssetId, "mediaAssetId");
  await requireReadyMedia(input.accountId, mediaAssetId);
  if (input.target.kind === "profile") {
    const [profile] = await getDb()
      .select({ accountId: instructorProfiles.accountId })
      .from(instructorProfiles)
      .where(eq(instructorProfiles.accountId, input.accountId))
      .limit(1);
    if (!profile) throw notFound("profile_not_found", "Instructor profile not found.");
    if (!new Set<AttachmentRole>(["logo", "profile_photo", "supporting"]).has(input.role)) {
      throw invalid("role", "Profile media must be a logo, profile photo, or supporting asset.");
    }
  } else {
    const [drill] = await getDb()
      .select({ id: drillTemplates.id })
      .from(drillTemplates)
      .where(
        and(
          eq(drillTemplates.accountId, input.accountId),
          eq(drillTemplates.id, opaqueId(input.target.id, "target.id")),
          eq(drillTemplates.status, "active"),
        ),
      )
      .limit(1);
    if (!drill) throw notFound("drill_template_not_found", "Drill template not found.");
    if (!new Set<AttachmentRole>(["primary", "supporting", "demo", "poster", "source"]).has(input.role)) {
      throw invalid("role", "Drill media role is invalid.");
    }
  }
  const id = newId();
  const now = new Date();
  const sortOrder = nonNegativeInteger(input.sortOrder ?? 0, "sortOrder");
  const db = getDb();
  const affectedPlan = accountAttachmentAffectedPlan(input.target);
  const reason = input.target.kind === "profile" ? "coach profile media changed" : "assigned drill media changed";
  await pauseAtSyntheticConcurrencyBarrier("media-attachment-before-commit");
  try {
    await db.batch([
      readyMediaTransactionGuard(input.accountId, mediaAssetId),
      db
        .update(contentMediaAttachments)
        .set({ status: "withdrawn", withdrawnAt: now, updatedAt: now })
        .where(
          and(
            eq(contentMediaAttachments.accountId, input.accountId),
            eq(contentMediaAttachments.status, "active"),
            eq(contentMediaAttachments.targetType, input.target.kind),
            eq(contentMediaAttachments.attachmentRole, input.role),
            input.target.kind === "profile"
              ? eq(contentMediaAttachments.profileAccountId, input.accountId)
              : eq(contentMediaAttachments.drillTemplateId, input.target.id),
          ),
        ),
      db.insert(contentMediaAttachments).values({
        id,
        accountId: input.accountId,
        planId: null,
        mediaAssetId,
        profileAccountId: input.target.kind === "profile" ? input.accountId : null,
        drillTemplateId: input.target.kind === "drill" ? input.target.id : null,
        targetType: input.target.kind,
        attachmentRole: input.role,
        label: optionalText(input.label, "label", 300),
        coachContext: optionalText(input.coachContext, "coachContext", 1_500),
        sortOrder,
        status: "active",
        createdAt: now,
        updatedAt: now,
      }),
      ...(input.target.kind === "profile" && input.role === "logo"
        ? [
            db
              .update(instructorProfiles)
              .set({ logoMediaAssetId: mediaAssetId, updatedAt: now })
              .where(eq(instructorProfiles.accountId, input.accountId)),
          ]
        : []),
      ...(input.target.kind === "profile" && input.role === "profile_photo"
        ? [
            db
              .update(instructorProfiles)
              .set({ profilePhotoMediaAssetId: mediaAssetId, updatedAt: now })
              .where(eq(instructorProfiles.accountId, input.accountId)),
          ]
        : []),
      ...accountPlanInvalidationStatements(input.accountId, affectedPlan, reason, now),
      auditStatement({
        accountId: input.accountId,
        action: "media_attachment.created",
        targetType: "content_media_attachment",
        targetId: id,
        requestId: input.requestId,
        metadata: { targetType: input.target.kind, mediaAssetId },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await assertMediaStillReady(input.accountId, [mediaAssetId]);
    throw error;
  }
  return { id };
}

export async function withdrawAccountMediaAttachment(input: {
  accountId: string;
  attachmentId: string;
  requestId?: string | null;
}): Promise<void> {
  const attachmentId = opaqueId(input.attachmentId, "attachmentId");
  const [attachment] = await getDb()
    .select()
    .from(contentMediaAttachments)
    .where(
      and(
        eq(contentMediaAttachments.accountId, input.accountId),
        eq(contentMediaAttachments.id, attachmentId),
        eq(contentMediaAttachments.status, "active"),
        sql`${contentMediaAttachments.planId} is null`,
      ),
    )
    .limit(1);
  if (!attachment) throw notFound("media_attachment_not_found", "Active media attachment not found.");
  const target: AccountMediaAttachmentTarget = attachment.profileAccountId
    ? { kind: "profile" }
    : { kind: "drill", id: attachment.drillTemplateId! };
  const now = new Date();
  const db = getDb();
  await db.batch([
    db
      .update(contentMediaAttachments)
      .set({ status: "withdrawn", withdrawnAt: now, updatedAt: now })
      .where(
        and(
          eq(contentMediaAttachments.accountId, input.accountId),
          eq(contentMediaAttachments.id, attachmentId),
          eq(contentMediaAttachments.status, "active"),
        ),
      ),
    ...(target.kind === "profile" && attachment.attachmentRole === "logo"
      ? [
          db
            .update(instructorProfiles)
            .set({ logoMediaAssetId: null, updatedAt: now })
            .where(
              and(
                eq(instructorProfiles.accountId, input.accountId),
                eq(instructorProfiles.logoMediaAssetId, attachment.mediaAssetId),
              ),
            ),
        ]
      : []),
    ...(target.kind === "profile" && attachment.attachmentRole === "profile_photo"
      ? [
          db
            .update(instructorProfiles)
            .set({ profilePhotoMediaAssetId: null, updatedAt: now })
            .where(
              and(
                eq(instructorProfiles.accountId, input.accountId),
                eq(instructorProfiles.profilePhotoMediaAssetId, attachment.mediaAssetId),
              ),
            ),
        ]
      : []),
    ...accountPlanInvalidationStatements(
      input.accountId,
      accountAttachmentAffectedPlan(target),
      target.kind === "profile" ? "coach profile media changed" : "assigned drill media changed",
      now,
    ),
    auditStatement({
      accountId: input.accountId,
      action: "media_attachment.withdrawn",
      targetType: "content_media_attachment",
      targetId: attachmentId,
      requestId: input.requestId,
      metadata: { targetType: target.kind, mediaAssetId: attachment.mediaAssetId },
      occurredAt: now,
    }),
  ]);
}

export async function attachPlanMedia(
  context: RichPlanMutationContext,
  input: {
    mediaAssetId: string;
    target: PlanMediaAttachmentTarget;
    role: AttachmentRole;
    label?: string | null;
    coachContext?: string | null;
    sortOrder?: number;
  },
): Promise<{ id: string; revision: number }> {
  const plan = await requireRichPlan(context);
  if (
    !new Set<AttachmentRole>([
      "primary",
      "supporting",
      "demo",
      "baseline",
      "current",
      "poster",
      "source",
    ]).has(input.role)
  ) {
    throw invalid("role", "Plan media role is invalid.");
  }
  const mediaAssetId = opaqueId(input.mediaAssetId, "mediaAssetId");
  await Promise.all([
    requireReadyMedia(context.accountId, mediaAssetId),
    requirePlanMediaTarget(context, input.target),
  ]);
  const id = newId();
  const now = new Date();
  const targetColumns = attachmentTargetColumns(input.target);
  const db = getDb();
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      readyMediaTransactionGuard(context.accountId, mediaAssetId),
      db.insert(contentMediaAttachments).values({
        id,
        accountId: context.accountId,
        planId: context.planId,
        mediaAssetId,
        ...targetColumns,
        targetType: input.target.kind,
        attachmentRole: input.role,
        label: optionalText(input.label, "label", 300),
        coachContext: optionalText(input.coachContext, "coachContext", 1_500),
        sortOrder: nonNegativeInteger(input.sortOrder ?? 0, "sortOrder"),
        status: "active",
        createdAt: now,
        updatedAt: now,
      }),
      ...richPlanInvalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "media attachment changed",
        now,
      ),
      richPlanAuditStatement(context, {
        action: "media_attachment.created",
        targetType: "content_media_attachment",
        targetId: id,
        metadata: {
          targetType: input.target.kind,
          targetId: input.target.id,
          mediaAssetId,
        },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await assertMediaStillReady(context.accountId, [mediaAssetId]);
    await rethrowRichPlanConflict(context, error);
  }
  return { id, revision: context.expectedRevision + 1 };
}

export async function withdrawPlanMediaAttachment(
  context: RichPlanMutationContext,
  input: { attachmentId: string },
): Promise<{ revision: number }> {
  const plan = await requireRichPlan(context);
  const attachmentId = opaqueId(input.attachmentId, "attachmentId");
  const [attachment] = await getDb()
    .select({ id: contentMediaAttachments.id, targetType: contentMediaAttachments.targetType })
    .from(contentMediaAttachments)
    .where(
      and(
        eq(contentMediaAttachments.accountId, context.accountId),
        eq(contentMediaAttachments.planId, context.planId),
        eq(contentMediaAttachments.id, attachmentId),
        eq(contentMediaAttachments.status, "active"),
      ),
    )
    .limit(1);
  if (!attachment) throw notFound("media_attachment_not_found", "Active media attachment not found.");
  const now = new Date();
  const db = getDb();
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      db
        .update(contentMediaAttachments)
        .set({ status: "withdrawn", withdrawnAt: now, updatedAt: now })
        .where(
          and(
            eq(contentMediaAttachments.accountId, context.accountId),
            eq(contentMediaAttachments.planId, context.planId),
            eq(contentMediaAttachments.id, attachmentId),
            eq(contentMediaAttachments.status, "active"),
          ),
        ),
      ...richPlanInvalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "media attachment changed",
        now,
      ),
      richPlanAuditStatement(context, {
        action: "media_attachment.withdrawn",
        targetType: "content_media_attachment",
        targetId: attachmentId,
        metadata: { targetType: attachment.targetType },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await rethrowRichPlanConflict(context, error);
  }
  return { revision: context.expectedRevision + 1 };
}

export async function assignDrillToPlan(
  context: RichPlanMutationContext,
  input: {
    phaseId: string;
    drillTemplateId?: string | null;
    customization?: Partial<DrillTemplateDraft> | null;
    dueAt?: Date | null;
  },
): Promise<{ practiceItemId: string; revision: number }> {
  const plan = await requireRichPlan(context);
  const phaseId = opaqueId(input.phaseId, "phaseId");
  await requireOwnedPhase(context, phaseId);
  let source: typeof drillTemplates.$inferSelect | null = null;
  if (input.drillTemplateId) {
    const [row] = await getDb()
      .select()
      .from(drillTemplates)
      .where(
        and(
          eq(drillTemplates.accountId, context.accountId),
          eq(drillTemplates.id, opaqueId(input.drillTemplateId, "drillTemplateId")),
          eq(drillTemplates.status, "active"),
        ),
      )
      .limit(1);
    if (!row) throw notFound("drill_template_not_found", "Drill template not found.");
    source = row;
  }
  if (!source && !input.customization) {
    throw invalid("customization", "A drill template or complete custom drill is required.");
  }
  const base: DrillTemplateDraft = source
    ? {
        title: source.title,
        purpose: source.purpose,
        whenItFits: source.whenItFits,
        equipment: source.equipment,
        setup: source.setup,
        steps: source.steps,
        dosageOrCadence: source.dosageOrCadence,
        feelOrCue: source.feelOrCue,
        successCheck: source.successCheck,
        commonMiss: source.commonMiss,
        stopOrAskRule: source.stopOrAskRule,
        constraintOrAdaptation: source.constraintOrAdaptation,
        progression: source.progression,
        regression: source.regression,
      }
    : (input.customization as DrillTemplateDraft);
  const snapshot = normalizedDrillDraft({ ...base, ...(input.customization ?? {}) });
  if (input.dueAt && !validDate(input.dueAt)) throw invalid("dueAt", "dueAt must be a valid date.");
  const db = getDb();
  // Drill media is reusable source content, while a practice assignment is a
  // historical plan record. Copy every currently active, ready source
  // attachment into the plan/practice scope so later drill-library edits or
  // withdrawals cannot silently change an existing golfer assignment.
  const sourceMediaAttachments = source
    ? await db
        .select({
          id: contentMediaAttachments.id,
          mediaAssetId: contentMediaAttachments.mediaAssetId,
          attachmentRole: contentMediaAttachments.attachmentRole,
          label: contentMediaAttachments.label,
          coachContext: contentMediaAttachments.coachContext,
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
            eq(contentMediaAttachments.accountId, context.accountId),
            eq(contentMediaAttachments.drillTemplateId, source.id),
            eq(contentMediaAttachments.targetType, "drill"),
            eq(contentMediaAttachments.status, "active"),
            inArray(contentMediaAttachments.attachmentRole, [
              "primary",
              "supporting",
              "demo",
              "poster",
              "source",
            ]),
            sql`${contentMediaAttachments.planId} is null`,
          ),
        )
        .orderBy(
          asc(contentMediaAttachments.sortOrder),
          asc(contentMediaAttachments.createdAt),
          asc(contentMediaAttachments.id),
        )
    : [];
  const practiceItemId = newId();
  const now = new Date();
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      ...readyMediaTransactionGuards(
        context.accountId,
        sourceMediaAttachments.map((attachment) => attachment.mediaAssetId),
      ),
      ...(source
        ? [
            db
              .update(drillTemplates)
              .set({
                title: sql<string>`case
                  when ${drillTemplates.version} = ${source.version}
                   and ${drillTemplates.status} = 'active'
                   and (
                     select count(*)
                     from ${contentMediaAttachments}
                     where ${contentMediaAttachments.accountId} = ${drillTemplates.accountId}
                       and ${contentMediaAttachments.drillTemplateId} = ${drillTemplates.id}
                       and ${contentMediaAttachments.targetType} = 'drill'
                       and ${contentMediaAttachments.status} = 'active'
                       and ${contentMediaAttachments.planId} is null
                       and ${contentMediaAttachments.attachmentRole}
                         in ('primary', 'supporting', 'demo', 'poster', 'source')
                   ) = ${sourceMediaAttachments.length}
                  then ${drillTemplates.title}
                  else null
                end`,
              })
              .where(
                and(
                  eq(drillTemplates.accountId, context.accountId),
                  eq(drillTemplates.id, source.id),
                ),
              ),
          ]
        : []),
      ...sourceMediaAttachments.map((attachment) =>
        db
          .update(contentMediaAttachments)
          .set({
            mediaAssetId: sql<string>`case
              when ${contentMediaAttachments.status} = 'active'
               and ${contentMediaAttachments.targetType} = 'drill'
               and ${contentMediaAttachments.drillTemplateId} = ${source!.id}
              then ${contentMediaAttachments.mediaAssetId}
              else null
            end`,
          })
          .where(
            and(
              eq(contentMediaAttachments.accountId, context.accountId),
              eq(contentMediaAttachments.id, attachment.id),
            ),
          ),
      ),
      db.insert(practiceItems).values({
        id: practiceItemId,
        accountId: context.accountId,
        planId: context.planId,
        phaseId,
        title: snapshot.title,
        status: "active",
        objective: snapshot.purpose,
        rationale: snapshot.whenItFits,
        instructions: snapshot.steps,
        timeOrCadence: snapshot.dosageOrCadence,
        successCheck: snapshot.successCheck,
        commonMistake: snapshot.commonMiss,
        stopOrAskRule: snapshot.stopOrAskRule,
        constraintNote: snapshot.constraintOrAdaptation,
        startsAt: now,
        dueAt: input.dueAt ?? null,
        coachApprovedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(practiceAssignmentSnapshots).values({
        accountId: context.accountId,
        planId: context.planId,
        practiceItemId,
        drillTemplateId: source?.id ?? null,
        drillTemplateVersion: source?.version ?? null,
        wasCustomized: Boolean(input.customization),
        ...snapshot,
        createdAt: now,
      }),
      ...sourceMediaAttachments.map((attachment, sortOrder) =>
        db.insert(contentMediaAttachments).values({
          id: newId(),
          accountId: context.accountId,
          planId: context.planId,
          mediaAssetId: attachment.mediaAssetId,
          practiceItemId,
          targetType: "practice",
          attachmentRole: attachment.attachmentRole,
          label: attachment.label,
          coachContext: attachment.coachContext,
          // Snapshot the effective source ordering rather than retaining
          // mutable library ordering gaps or relying on equal timestamps.
          sortOrder,
          status: "active",
          createdAt: now,
          updatedAt: now,
        }),
      ),
      ...richPlanInvalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "practice assignment changed",
        now,
      ),
      richPlanAuditStatement(context, {
        action: "practice.assigned",
        targetType: "practice_item",
        targetId: practiceItemId,
        metadata: {
          phaseId,
          drillTemplateId: source?.id ?? null,
          drillTemplateVersion: source?.version ?? null,
          customized: Boolean(input.customization),
          mediaAttachmentCount: sourceMediaAttachments.length,
        },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await assertMediaStillReady(
      context.accountId,
      sourceMediaAttachments.map((attachment) => attachment.mediaAssetId),
    );
    if (source) {
      await rethrowDrillAssignmentSourceConflict(
        context,
        source.id,
        source.version,
        sourceMediaAttachments.map((attachment) => attachment.id),
      );
    }
    await rethrowRichPlanConflict(context, error);
  }
  return { practiceItemId, revision: context.expectedRevision + 1 };
}

export async function replacePracticeAssignment(
  context: RichPlanMutationContext,
  input: {
    practiceItemId: string;
    phaseId?: string | null;
    customization: Partial<DrillTemplateDraft>;
    dueAt?: Date | null;
  },
): Promise<{
  practiceItemId: string;
  replacedPracticeItemId: string;
  revision: number;
}> {
  const plan = await requireRichPlan(context);
  const replacedPracticeItemId = opaqueId(input.practiceItemId, "practiceItemId");
  const db = getDb();
  const [existing] = await db
    .select({ assignment: practiceItems, snapshot: practiceAssignmentSnapshots })
    .from(practiceItems)
    .innerJoin(
      practiceAssignmentSnapshots,
      and(
        eq(practiceAssignmentSnapshots.accountId, practiceItems.accountId),
        eq(practiceAssignmentSnapshots.planId, practiceItems.planId),
        eq(practiceAssignmentSnapshots.practiceItemId, practiceItems.id),
      ),
    )
    .where(
      and(
        eq(practiceItems.accountId, context.accountId),
        eq(practiceItems.planId, context.planId),
        eq(practiceItems.id, replacedPracticeItemId),
      ),
    )
    .limit(1);
  if (!existing) {
    throw notFound(
      "practice_assignment_snapshot_not_found",
      "A structured practice assignment was not found.",
    );
  }
  if (existing.assignment.status !== "active" && existing.assignment.status !== "paused") {
    throw conflict(
      "practice_assignment_not_replaceable",
      "Only an active or paused practice assignment can be edited by replacement.",
    );
  }
  const phaseId =
    input.phaseId === undefined
      ? existing.assignment.phaseId
      : input.phaseId === null
        ? null
        : opaqueId(input.phaseId, "phaseId");
  if (!phaseId) throw invalid("phaseId", "A replacement assignment requires a phase.");
  await requireOwnedPhase(context, phaseId);
  if (input.dueAt !== undefined && input.dueAt !== null && !validDate(input.dueAt)) {
    throw invalid("dueAt", "dueAt must be a valid date.");
  }
  const dueAt = input.dueAt === undefined ? existing.assignment.dueAt : input.dueAt;
  const prior = existing.snapshot;
  // Deliberately rebuild from the immutable assignment snapshot. The reusable
  // template is provenance only and is never consulted during an assignment edit.
  const snapshot = normalizedDrillDraft({
    title: prior.title,
    purpose: prior.purpose,
    whenItFits: prior.whenItFits,
    equipment: prior.equipment,
    setup: prior.setup,
    steps: prior.steps,
    dosageOrCadence: prior.dosageOrCadence,
    feelOrCue: prior.feelOrCue,
    successCheck: prior.successCheck,
    commonMiss: prior.commonMiss,
    stopOrAskRule: prior.stopOrAskRule,
    constraintOrAdaptation: prior.constraintOrAdaptation,
    progression: prior.progression,
    regression: prior.regression,
    ...input.customization,
  });
  const sourceMediaAttachments = await db
    .select({
      mediaAssetId: contentMediaAttachments.mediaAssetId,
      attachmentRole: contentMediaAttachments.attachmentRole,
      label: contentMediaAttachments.label,
      coachContext: contentMediaAttachments.coachContext,
      sortOrder: contentMediaAttachments.sortOrder,
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
        eq(contentMediaAttachments.accountId, context.accountId),
        eq(contentMediaAttachments.planId, context.planId),
        eq(contentMediaAttachments.practiceItemId, replacedPracticeItemId),
        eq(contentMediaAttachments.targetType, "practice"),
        eq(contentMediaAttachments.status, "active"),
      ),
    )
    .orderBy(
      asc(contentMediaAttachments.sortOrder),
      asc(contentMediaAttachments.createdAt),
      asc(contentMediaAttachments.id),
    );
  const practiceItemId = newId();
  const now = new Date();
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      ...readyMediaTransactionGuards(
        context.accountId,
        sourceMediaAttachments.map((attachment) => attachment.mediaAssetId),
      ),
      db.insert(practiceItems).values({
        id: practiceItemId,
        accountId: context.accountId,
        planId: context.planId,
        phaseId,
        lessonId: existing.assignment.lessonId,
        title: snapshot.title,
        status: existing.assignment.status,
        objective: snapshot.purpose,
        rationale: snapshot.whenItFits,
        instructions: snapshot.steps,
        timeOrCadence: snapshot.dosageOrCadence,
        successCheck: snapshot.successCheck,
        commonMistake: snapshot.commonMiss,
        stopOrAskRule: snapshot.stopOrAskRule,
        constraintNote: snapshot.constraintOrAdaptation,
        startsAt: existing.assignment.startsAt,
        dueAt,
        coachApprovedAt: now,
        pausedAt:
          existing.assignment.status === "paused"
            ? (existing.assignment.pausedAt ?? now)
            : null,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(practiceAssignmentSnapshots).values({
        accountId: context.accountId,
        planId: context.planId,
        practiceItemId,
        drillTemplateId: prior.drillTemplateId,
        drillTemplateVersion: prior.drillTemplateVersion,
        wasCustomized: true,
        ...snapshot,
        createdAt: now,
      }),
      ...sourceMediaAttachments.map((attachment) =>
        db.insert(contentMediaAttachments).values({
          id: newId(),
          accountId: context.accountId,
          planId: context.planId,
          mediaAssetId: attachment.mediaAssetId,
          practiceItemId,
          targetType: "practice",
          attachmentRole: attachment.attachmentRole,
          label: attachment.label,
          coachContext: attachment.coachContext,
          sortOrder: attachment.sortOrder,
          status: "active",
          createdAt: now,
          updatedAt: now,
        }),
      ),
      db
        .update(practiceItems)
        .set({
          status: sql`case when ${practiceItems.status} = ${existing.assignment.status} then 'retired' else null end`,
          retiredAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(practiceItems.accountId, context.accountId),
            eq(practiceItems.planId, context.planId),
            eq(practiceItems.id, replacedPracticeItemId),
          ),
        ),
      db.insert(practiceAssignmentReplacements).values({
        accountId: context.accountId,
        planId: context.planId,
        replacedPracticeItemId,
        replacementPracticeItemId: practiceItemId,
        replacedStatus: existing.assignment.status,
        replacementPlanRevision: context.expectedRevision + 1,
        createdAt: now,
      }),
      ...richPlanInvalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "practice assignment replaced",
        now,
      ),
      richPlanAuditStatement(context, {
        action: "practice.replaced",
        targetType: "practice_item",
        targetId: practiceItemId,
        metadata: {
          replacedPracticeItemId,
          replacementPracticeItemId: practiceItemId,
          fromStatus: existing.assignment.status,
          phaseId,
          drillTemplateId: prior.drillTemplateId,
          drillTemplateVersion: prior.drillTemplateVersion,
          mediaAttachmentCount: sourceMediaAttachments.length,
          replacementPlanRevision: context.expectedRevision + 1,
        },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await assertMediaStillReady(
      context.accountId,
      sourceMediaAttachments.map((attachment) => attachment.mediaAssetId),
    );
    await rethrowRichPlanConflict(context, error);
  }
  return {
    practiceItemId,
    replacedPracticeItemId,
    revision: context.expectedRevision + 1,
  };
}

export async function transitionPracticeAssignment(
  context: RichPlanMutationContext,
  input: {
    practiceItemId: string;
    nextStatus: "active" | "paused" | "completed" | "retired";
  },
): Promise<{ revision: number }> {
  const plan = await requireRichPlan(context);
  const practiceItemId = opaqueId(input.practiceItemId, "practiceItemId");
  const [item] = await getDb()
    .select({ status: practiceItems.status })
    .from(practiceItems)
    .where(
      and(
        eq(practiceItems.accountId, context.accountId),
        eq(practiceItems.planId, context.planId),
        eq(practiceItems.id, practiceItemId),
      ),
    )
    .limit(1);
  if (!item) throw notFound("practice_item_not_found", "Practice assignment not found.");
  const allowed: Record<string, readonly string[]> = {
    draft: ["active", "retired"],
    active: ["paused", "completed", "retired"],
    paused: ["active", "completed", "retired"],
    completed: ["retired"],
    retired: [],
  };
  if (!allowed[item.status]?.includes(input.nextStatus)) {
    throw conflict("invalid_practice_transition", "This practice lifecycle transition is not allowed.");
  }
  const now = new Date();
  const db = getDb();
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      db
        .update(practiceItems)
        .set({
          status: sql<typeof input.nextStatus>`case when ${practiceItems.status} = ${item.status} then ${input.nextStatus} else null end`,
          pausedAt: input.nextStatus === "paused" ? now : null,
          completedAt: input.nextStatus === "completed" ? now : null,
          retiredAt: input.nextStatus === "retired" ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(practiceItems.accountId, context.accountId),
            eq(practiceItems.planId, context.planId),
            eq(practiceItems.id, practiceItemId),
          ),
        ),
      ...richPlanInvalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "practice lifecycle changed",
        now,
      ),
      richPlanAuditStatement(context, {
        action: "practice.lifecycle_transitioned",
        targetType: "practice_item",
        targetId: practiceItemId,
        metadata: { fromStatus: item.status, toStatus: input.nextStatus },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await rethrowRichPlanConflict(context, error);
  }
  return { revision: context.expectedRevision + 1 };
}

export async function recordPracticeCheckIn(input: {
  rawSessionToken: string;
  sessionContext: string;
  practiceItemId: string;
  idempotencyKey: string;
  completionStatus: "completed" | "not_completed";
  perceivedDifficulty?: "very_easy" | "easy" | "appropriate" | "hard" | "very_hard" | null;
  confidenceRating?: number | null;
  note?: string | null;
  requestHelp?: boolean;
  requestId?: string | null;
}): Promise<{ checkIn: { id: string; occurredAt: number }; replayed: boolean }> {
  const resolved = await resolveShareSession(input.rawSessionToken);
  if (!resolved) throw notFound("plan_unavailable", "This private plan is unavailable.");
  if (!shareSessionContextsEqual(input.sessionContext, resolved.sessionContext)) {
    throw conflict("share_session_changed", "This private plan session changed. Reload before checking in.");
  }
  const practiceItemId = opaqueId(input.practiceItemId, "practiceItemId");
  const idempotencyKey = requiredText(input.idempotencyKey, "idempotencyKey", 200);
  if (idempotencyKey.length < 16) {
    throw invalid("idempotencyKey", "idempotencyKey must contain at least 16 characters.");
  }
  const confidenceRating = input.confidenceRating ?? null;
  if (confidenceRating !== null && (!Number.isInteger(confidenceRating) || confidenceRating < 1 || confidenceRating > 5)) {
    throw invalid("confidenceRating", "confidenceRating must be an integer from 1 to 5.");
  }
  const note = optionalText(input.note, "note", 1_000);
  const [receiptHash, inputFingerprint, checkInId, auditId] = await Promise.all([
    hashToken(JSON.stringify(["practice-check-in-key-v1", resolved.accountId, resolved.sessionId, idempotencyKey])),
    hashToken(
      JSON.stringify([
        "practice-check-in-input-v1",
        practiceItemId,
        input.completionStatus,
        input.perceivedDifficulty ?? null,
        confidenceRating,
        note,
        Boolean(input.requestHelp),
      ]),
    ),
    hashToken(JSON.stringify(["practice-check-in-record-v1", resolved.accountId, resolved.sessionId, idempotencyKey])),
    hashToken(JSON.stringify(["practice-check-in-audit-v1", resolved.accountId, resolved.sessionId, idempotencyKey])),
  ]);
  const replay = await replayPracticeCheckIn({
    accountId: resolved.accountId,
    shareSessionId: resolved.sessionId,
    receiptHash,
    inputFingerprint,
  });
  if (replay) return replay;
  const [practice] = await getDb()
    .select({ id: practiceItems.id, status: practiceItems.status })
    .from(practiceItems)
    .where(
      and(
        eq(practiceItems.accountId, resolved.accountId),
        eq(practiceItems.planId, resolved.model.plan.id),
        eq(practiceItems.id, practiceItemId),
        inArray(practiceItems.status, ["active", "paused"]),
      ),
    )
    .limit(1);
  if (!practice) throw conflict("practice_check_in_unavailable", "This practice assignment is not open for check-in.");
  const occurredAt = new Date();
  const consentRequirements = configuredRoadmapAccessRequirements(resolved.golferId);
  const db = getDb();
  try {
    await db.batch([
      consentGrantTransactionGuard(resolved.accountId, consentRequirements),
      db
        .update(shareSessions)
        .set({
          tokenHash: sql<string>`case when
            ${shareSessions.revokedAt} is null
            and ${shareSessions.expiresAt} > ${occurredAt.getTime()}
            and exists (
              select 1 from ${shareLinks}
              join ${developmentPlans}
                on ${developmentPlans.accountId} = ${shareLinks.accountId}
               and ${developmentPlans.id} = ${shareLinks.planId}
              where ${shareLinks.accountId} = ${shareSessions.accountId}
                and ${shareLinks.id} = ${shareSessions.shareLinkId}
                and ${shareLinks.status} = 'active'
                and (${shareLinks.expiresAt} is null or ${shareLinks.expiresAt} > ${occurredAt.getTime()})
                and ${developmentPlans.publishedRevision} = ${shareLinks.planRevision}
            ) then ${shareSessions.tokenHash} else null end`,
          updatedAt: occurredAt,
        })
        .where(
          and(
            eq(shareSessions.accountId, resolved.accountId),
            eq(shareSessions.id, resolved.sessionId),
          ),
        ),
      db.insert(practiceCheckIns).values({
        id: checkInId,
        accountId: resolved.accountId,
        planId: resolved.model.plan.id,
        practiceItemId,
        shareLinkId: resolved.shareId,
        shareSessionId: resolved.sessionId,
        idempotencyKeyHash: receiptHash,
        inputFingerprint,
        completionStatus: input.completionStatus,
        perceivedDifficulty: input.perceivedDifficulty ?? null,
        confidenceRating,
        note,
        requestHelp: Boolean(input.requestHelp),
        occurredAt,
        createdAt: occurredAt,
      }),
      db.insert(auditEvents).values({
        id: auditId,
        accountId: resolved.accountId,
        actorType: "golfer_share",
        actorReference: resolved.shareId,
        action: "practice.check_in_recorded",
        targetType: "practice_item",
        targetId: practiceItemId,
        outcome: "success",
        requestId: input.requestId ?? null,
        metadata: { checkInId, inputFingerprint },
        occurredAt,
      }),
    ]);
  } catch (error) {
    const racedReplay = await replayPracticeCheckIn({
      accountId: resolved.accountId,
      shareSessionId: resolved.sessionId,
      receiptHash,
      inputFingerprint,
    });
    if (racedReplay) return racedReplay;
    if (!(await consentGrantRequirementsCurrent(resolved.accountId, consentRequirements))) {
      throw conflict("current_consent_required", "Current configured authorization is required for this check-in.");
    }
    const current = await resolveShareSession(input.rawSessionToken);
    if (!current) throw notFound("plan_unavailable", "This private plan is unavailable.");
    throw error;
  }
  return {
    checkIn: { id: checkInId, occurredAt: occurredAt.getTime() },
    replayed: false,
  };
}

/**
 * Stores a bounded, vendor-neutral import review. The normalized review rows,
 * exact accepted-row snapshot, source row numbers, mapping, confirmed units,
 * and rejected-row reasons remain private and durable so refresh cannot change
 * the final commit. Staging does not publish or revise golfer-visible content.
 */
export async function stageLaunchMonitorImport(
  context: RichPlanMutationContext,
  input: {
    sourceMediaAssetId?: string | null;
    columnHeaders: readonly string[];
    columnMappings: Readonly<Record<string, string | null>>;
    validationReport: Readonly<Record<string, unknown>>;
    reviewRows: readonly (readonly string[])[];
    acceptedRows: readonly (readonly string[])[];
    acceptedSourceRowNumbers: readonly number[];
    rejectedRows: readonly Readonly<{ row: number; reason: string }>[];
    totalRowCount: number;
    acceptedRowCount: number;
    rejectedRowCount: number;
    status: "mapping_required" | "validated" | "failed";
    errorCode?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<{ id: string; replayed: boolean }> {
  await requireRichPlan(context);
  const headers = normalizedStringList(input.columnHeaders, "columnHeaders", MAX_IMPORT_COLUMNS, 160, true);
  const totalRowCount = boundedInteger(input.totalRowCount, "totalRowCount", 0, MAX_IMPORT_ROWS);
  const acceptedRowCount = boundedInteger(input.acceptedRowCount, "acceptedRowCount", 0, totalRowCount);
  const rejectedRowCount = boundedInteger(input.rejectedRowCount, "rejectedRowCount", 0, totalRowCount);
  if (acceptedRowCount + rejectedRowCount > totalRowCount) {
    throw invalid("rowCounts", "Accepted and rejected rows cannot exceed total rows.");
  }
  const columnMappings = normalizedColumnMappings(input.columnMappings, headers);
  const validationReport = normalizedJsonObject(input.validationReport, "validationReport", 20_000);
  const reviewRows = normalizedCsvRows(input.reviewRows, headers, "reviewRows", MAX_SESSION_SHOTS);
  const acceptedRows = normalizedCsvRows(
    input.acceptedRows,
    headers,
    "acceptedRows",
    MAX_SESSION_SHOTS,
  );
  const acceptedSourceRowNumbers = normalizedCsvSourceRows(
    input.acceptedSourceRowNumbers,
    "acceptedSourceRowNumbers",
    MAX_SESSION_SHOTS,
  );
  const rejectedRows = normalizedRejectedCsvRows(
    input.rejectedRows,
    "rejectedRows",
    MAX_SESSION_SHOTS,
  );
  if (
    reviewRows.length !== totalRowCount ||
    acceptedRows.length !== acceptedRowCount ||
    acceptedSourceRowNumbers.length !== acceptedRowCount ||
    rejectedRows.length !== rejectedRowCount
  ) {
    throw invalid("rowCounts", "Persisted CSV review rows must exactly match their declared counts.");
  }
  const reviewedSourceRows = new Set(
    [...acceptedSourceRowNumbers, ...rejectedRows.map(({ row }) => row)],
  );
  if (
    reviewedSourceRows.size !== acceptedSourceRowNumbers.length + rejectedRows.length ||
    [...reviewedSourceRows].some((row) => row > totalRowCount + 1)
  ) {
    throw invalid(
      "rowCounts",
      "Accepted and rejected source row numbers must be unique rows from the persisted review.",
    );
  }
  if (
    input.status === "validated" &&
    (acceptedRowCount === 0 ||
      acceptedRowCount + rejectedRowCount !== totalRowCount ||
      (rejectedRowCount > 0 && validationReport.excludedRejectedRows !== true))
  ) {
    throw invalid(
      "status",
      "A validated import requires accepted rows and every rejected row must be explicitly excluded.",
    );
  }
  if (input.status !== "validated" && acceptedRows.length) {
    throw invalid("acceptedRows", "Only a validated import can lock accepted rows for commit.");
  }
  if (input.status === "validated") {
    assertValidatedLaunchImportReview(columnMappings, validationReport);
    assertPersistedLaunchCsvFingerprint(
      headers,
      columnMappings,
      validationReport,
      acceptedRows,
    );
  }
  const sourceMediaAssetId = input.sourceMediaAssetId
    ? opaqueId(input.sourceMediaAssetId, "sourceMediaAssetId")
    : null;
  if (sourceMediaAssetId) await requireReadyMedia(context.accountId, sourceMediaAssetId, "document");
  const errorCode = optionalCode(input.errorCode, "errorCode");
  const requestFingerprint = await hashToken(
    stableJsonStringify([
      "launch-import-request-v1",
      context.accountId,
      context.planId,
      {
        sourceMediaAssetId,
        status: input.status,
        columnHeaders: headers,
        columnMappings,
        validationReport,
        reviewRows,
        acceptedRows,
        acceptedSourceRowNumbers,
        rejectedRows,
        totalRowCount,
        acceptedRowCount,
        rejectedRowCount,
        errorCode,
      },
    ]),
  );
  let idempotencyKeyHash: string | null = null;
  if (input.idempotencyKey) {
    const key = requiredText(input.idempotencyKey, "idempotencyKey", 200);
    if (key.length < 16) throw invalid("idempotencyKey", "idempotencyKey must contain at least 16 characters.");
    idempotencyKeyHash = await hashToken(
      JSON.stringify(["launch-import-v1", context.accountId, context.planId, key]),
    );
    const [existing] = await getDb()
      .select({
        id: launchMonitorImports.id,
        requestFingerprint: launchMonitorImports.requestFingerprint,
      })
      .from(launchMonitorImports)
      .where(
        and(
          eq(launchMonitorImports.accountId, context.accountId),
          eq(launchMonitorImports.planId, context.planId),
          eq(launchMonitorImports.idempotencyKeyHash, idempotencyKeyHash),
        ),
      )
      .limit(1);
    if (existing) {
      assertLaunchImportReplayFingerprint(existing.requestFingerprint, requestFingerprint);
      return { id: existing.id, replayed: true };
    }
  }
  const id = newId();
  const now = new Date();
  const db = getDb();
  await pauseAtSyntheticConcurrencyBarrier("launch-import-before-guarded-stage");
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      ...(sourceMediaAssetId
        ? [readyMediaTransactionGuard(context.accountId, sourceMediaAssetId)]
        : []),
      db.insert(launchMonitorImports).values({
        id,
        accountId: context.accountId,
        planId: context.planId,
        sourceMediaAssetId,
        status: input.status,
        columnHeaders: headers,
        columnMappings,
        validationReport,
        reviewRows,
        acceptedRows,
        acceptedSourceRowNumbers,
        rejectedRows,
        totalRowCount,
        acceptedRowCount,
        rejectedRowCount,
        errorCode,
        idempotencyKeyHash,
        requestFingerprint,
        createdAt: now,
        updatedAt: now,
      }),
      richPlanAuditStatement(context, {
        action: "launch_monitor.import_staged",
        targetType: "launch_monitor_import",
        targetId: id,
        metadata: {
          status: input.status,
          headerCount: headers.length,
          totalRowCount,
          acceptedRowCount,
          rejectedRowCount,
          sourceMediaAttached: Boolean(sourceMediaAssetId),
        },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await assertMediaStillReady(
      context.accountId,
      sourceMediaAssetId ? [sourceMediaAssetId] : [],
    );
    if (idempotencyKeyHash) {
      const [raced] = await db
        .select({
          id: launchMonitorImports.id,
          requestFingerprint: launchMonitorImports.requestFingerprint,
        })
        .from(launchMonitorImports)
        .where(
          and(
            eq(launchMonitorImports.accountId, context.accountId),
            eq(launchMonitorImports.planId, context.planId),
            eq(launchMonitorImports.idempotencyKeyHash, idempotencyKeyHash),
          ),
        )
        .limit(1);
      if (raced) {
        assertLaunchImportReplayFingerprint(raced.requestFingerprint, requestFingerprint);
        return { id: raced.id, replayed: true };
      }
    }
    await rethrowRichPlanConflict(context, error);
  }
  return { id, replayed: false };
}

export async function commitLaunchMonitorSession(
  context: RichPlanMutationContext,
  input: LaunchMonitorSessionInput,
): Promise<{ sessionId: string; revision: number }> {
  const plan = await requireRichPlan(context);
  if (!validDate(input.sessionDate)) throw invalid("sessionDate", "sessionDate must be a valid date.");
  const phaseId = input.phaseId ? opaqueId(input.phaseId, "phaseId") : null;
  const lessonId = input.lessonId ? opaqueId(input.lessonId, "lessonId") : null;
  const importId = input.importId ? opaqueId(input.importId, "importId") : null;
  const sourceMediaAssetId = input.sourceMediaAssetId
    ? opaqueId(input.sourceMediaAssetId, "sourceMediaAssetId")
    : null;
  if (input.sourceMode === "manual" && importId) {
    throw invalid("importId", "Manual sessions cannot reference an import.");
  }
  if (input.sourceMode === "csv_import" && !importId) {
    throw invalid("importId", "CSV sessions require a validated import.");
  }
  if (input.sourceMode === "manual" && input.stagedReviewFingerprint) {
    throw invalid("stagedReviewFingerprint", "Manual sessions cannot reference a staged CSV review.");
  }
  const validatedImport = importId
    ? await requireValidatedLaunchImport(context, importId)
    : null;
  if (
    validatedImport &&
    sourceMediaAssetId !== null &&
    sourceMediaAssetId !== validatedImport.sourceMediaAssetId
  ) {
    throw conflict(
      "launch_import_source_mismatch",
      "The final session must use the source document locked with the reviewed import.",
    );
  }
  const committedSourceMediaAssetId = validatedImport
    ? validatedImport.sourceMediaAssetId
    : sourceMediaAssetId;
  await Promise.all([
    phaseId ? requireOwnedPhase(context, phaseId) : Promise.resolve(),
    lessonId ? requireOwnedLesson(context, lessonId) : Promise.resolve(),
    committedSourceMediaAssetId
      ? requireReadyMedia(context.accountId, committedSourceMediaAssetId, "document")
      : Promise.resolve(),
  ]);
  const lockedCsv = validatedImport
    ? launchImportCommitData(
        validatedImport,
        requiredText(input.stagedReviewFingerprint, "stagedReviewFingerprint", 120),
      )
    : null;
  const summaryMetrics = normalizedLaunchMetrics(
    lockedCsv?.summaryMetrics ?? input.summaryMetrics,
    "summaryMetrics",
    MAX_SUMMARY_METRICS,
  );
  const shots = [...(lockedCsv?.shots ?? input.shots ?? [])];
  if (shots.length > MAX_SESSION_SHOTS) {
    throw invalid("shots", `A session can contain at most ${MAX_SESSION_SHOTS} shots.`);
  }
  const normalizedShots = shots.map((shot, index) => ({
    sourceRowNumber:
      shot.sourceRowNumber === null || shot.sourceRowNumber === undefined
        ? null
        : boundedInteger(shot.sourceRowNumber, `shots[${index}].sourceRowNumber`, 1, MAX_IMPORT_ROWS),
    label: optionalText(shot.label, `shots[${index}].label`, 160),
    capturedAt:
      shot.capturedAt === null || shot.capturedAt === undefined
        ? null
        : validDate(shot.capturedAt)
          ? shot.capturedAt
          : (() => {
              throw invalid(`shots[${index}].capturedAt`, "capturedAt must be a valid date.");
            })(),
    metrics: normalizedLaunchMetrics(
      shot.metrics,
      `shots[${index}].metrics`,
      MAX_METRICS_PER_SHOT,
    ),
  }));
  const metricCount = summaryMetrics.length + normalizedShots.reduce((sum, shot) => sum + shot.metrics.length, 0);
  if (metricCount === 0) throw invalid("metrics", "A launch-monitor session requires at least one metric.");
  if (metricCount > MAX_SESSION_METRICS) {
    throw invalid("metrics", `A session can contain at most ${MAX_SESSION_METRICS} metric values.`);
  }
  const allMetrics = [...summaryMetrics, ...normalizedShots.flatMap((shot) => shot.metrics)];
  const metricDefinitions = normalizedLaunchMetricDefinitions(allMetrics);
  const sessionId = newId();
  const now = new Date();
  const shotRows = normalizedShots.map((shot, index) => ({
    id: newId(),
    accountId: context.accountId,
    sessionId,
    sequence: index + 1,
    sourceRowNumber: shot.sourceRowNumber,
    label: shot.label,
    capturedAt: shot.capturedAt,
    createdAt: now,
  }));
  const metricRows = [
    ...summaryMetrics.map((metric, index) => launchMetricRow({
      accountId: context.accountId,
      sessionId,
      shotId: null,
      metric,
      isSummary: true,
      sortOrder: index,
      createdAt: now,
    })),
    ...normalizedShots.flatMap((shot, shotIndex) =>
      shot.metrics.map((metric, metricIndex) => launchMetricRow({
        accountId: context.accountId,
        sessionId,
        shotId: shotRows[shotIndex]!.id,
        metric,
        isSummary: false,
        sortOrder: metricIndex,
        createdAt: now,
      }))),
  ];
  const db = getDb();
  const shotInsertStatements = chunksOf(shotRows, 12).map((rows) =>
    db.insert(launchMonitorShots).values(rows),
  );
  const metricInsertStatements = chunksOf(metricRows, MAX_METRIC_ROWS_PER_INSERT).map((rows) =>
    db.insert(launchMonitorMetrics).values(rows),
  );
  const metricDefinitionStatements = launchMetricDefinitionStatements(
    context.accountId,
    metricDefinitions,
    now,
  );
  await pauseAtSyntheticConcurrencyBarrier("launch-session-before-guarded-commit");
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      ...(committedSourceMediaAssetId
        ? [readyMediaTransactionGuard(context.accountId, committedSourceMediaAssetId)]
        : []),
      ...metricDefinitionStatements,
      db.insert(launchMonitorSessions).values({
        id: sessionId,
        accountId: context.accountId,
        planId: context.planId,
        phaseId,
        lessonId,
        importId,
        sourceMediaAssetId: committedSourceMediaAssetId,
        sourceMode: input.sourceMode,
        sessionDate: input.sessionDate,
        deviceSource: requiredText(input.deviceSource, "deviceSource", 160),
        club: optionalText(input.club, "club", 120),
        environment: optionalText(input.environment, "environment", 300),
        conditions: optionalText(input.conditions, "conditions", 1_000),
        notes: optionalText(input.notes, "notes", 3_000),
        coachInterpretation: requiredText(input.coachInterpretation, "coachInterpretation", 4_000),
        limitations: requiredText(input.limitations, "limitations", 2_000),
        representativeness: input.representativeness,
        nextEvidenceNeeded: optionalText(input.nextEvidenceNeeded, "nextEvidenceNeeded", 2_000),
        status: "committed",
        coachApprovedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...shotInsertStatements,
      ...metricInsertStatements,
      ...(importId
        ? [
            db
              .update(launchMonitorImports)
              .set({
                status: sql<"committed">`case when ${launchMonitorImports.status} = 'validated' then 'committed' else null end`,
                committedAt: now,
                updatedAt: now,
              })
              .where(
                and(
                  eq(launchMonitorImports.accountId, context.accountId),
                  eq(launchMonitorImports.planId, context.planId),
                  eq(launchMonitorImports.id, importId),
                ),
              ),
          ]
        : []),
      ...richPlanInvalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "launch-monitor evidence changed",
        now,
      ),
      richPlanAuditStatement(context, {
        action: "launch_monitor.session_committed",
        targetType: "launch_monitor_session",
        targetId: sessionId,
        metadata: {
          sourceMode: input.sourceMode,
          importId,
          sourceMediaAttached: Boolean(committedSourceMediaAssetId),
          shotCount: shotRows.length,
          summaryMetricCount: summaryMetrics.length,
          metricCount,
        },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await assertMediaStillReady(
      context.accountId,
      committedSourceMediaAssetId ? [committedSourceMediaAssetId] : [],
    );
    await rethrowLaunchSessionCommitConflict(context, metricDefinitions, error);
  }
  return { sessionId, revision: context.expectedRevision + 1 };
}

export async function createLaunchMonitorComparison(
  context: RichPlanMutationContext,
  input: {
    title: string;
    baselineSessionId: string;
    currentSessionId: string;
    coachInterpretation: string;
    limitations: string;
    nextEvidenceNeeded?: string | null;
    metricPairs: readonly Readonly<{
      baselineMetricId: string;
      currentMetricId: string;
      displayName?: string | null;
    }>[];
  },
): Promise<{ comparisonId: string; revision: number }> {
  const plan = await requireRichPlan(context);
  const baselineSessionId = opaqueId(input.baselineSessionId, "baselineSessionId");
  const currentSessionId = opaqueId(input.currentSessionId, "currentSessionId");
  if (baselineSessionId === currentSessionId) {
    throw invalid("currentSessionId", "Baseline and current sessions must be different.");
  }
  await Promise.all([
    requireCommittedLaunchSession(context, baselineSessionId),
    requireCommittedLaunchSession(context, currentSessionId),
  ]);
  if (input.metricPairs.length === 0 || input.metricPairs.length > MAX_SUMMARY_METRICS) {
    throw invalid("metricPairs", `Select between 1 and ${MAX_SUMMARY_METRICS} metric pairs.`);
  }
  const normalizedPairs = input.metricPairs.map((pair, index) => ({
    baselineMetricId: opaqueId(pair.baselineMetricId, `metricPairs[${index}].baselineMetricId`),
    currentMetricId: opaqueId(pair.currentMetricId, `metricPairs[${index}].currentMetricId`),
    displayName: pair.displayName
      ? requiredText(pair.displayName, `metricPairs[${index}].displayName`, 160)
      : null,
  }));
  if (new Set(normalizedPairs.map((pair) => pair.baselineMetricId)).size !== normalizedPairs.length) {
    throw invalid("metricPairs", "A baseline metric can be selected only once.");
  }
  if (new Set(normalizedPairs.map((pair) => pair.currentMetricId)).size !== normalizedPairs.length) {
    throw invalid("metricPairs", "A current metric can be selected only once.");
  }
  const metricRows = await getDb()
    .select({
      id: launchMonitorMetrics.id,
      sessionId: launchMonitorMetrics.sessionId,
      metricDefinitionId: launchMonitorMetrics.metricDefinitionId,
      displayName: launchMonitorMetrics.displayName,
      unit: launchMonitorMetrics.unit,
      isSummary: launchMonitorMetrics.isSummary,
      isGolferFacing: launchMonitorMetrics.isGolferFacing,
    })
    .from(launchMonitorMetrics)
    .where(
      and(
        eq(launchMonitorMetrics.accountId, context.accountId),
        inArray(launchMonitorMetrics.sessionId, [baselineSessionId, currentSessionId]),
        eq(launchMonitorMetrics.isSummary, true),
      ),
    );
  const byId = new Map(metricRows.map((row) => [row.id, row]));
  const validatedPairs = normalizedPairs.map((pair, index) => {
    const baseline = byId.get(pair.baselineMetricId);
    const current = byId.get(pair.currentMetricId);
    if (
      !baseline ||
      !current ||
      !baseline.isSummary ||
      !current.isSummary ||
      !baseline.isGolferFacing ||
      !current.isGolferFacing ||
      baseline.sessionId !== baselineSessionId ||
      current.sessionId !== currentSessionId
    ) {
      throw invalid(
        "metricPairs",
        "Comparison metrics must be golfer-facing summary metrics from their selected sessions.",
      );
    }
    if (
      !baseline.metricDefinitionId ||
      baseline.metricDefinitionId !== current.metricDefinitionId ||
      baseline.unit !== current.unit
    ) {
      throw invalid(
        "metricPairs",
        "Comparison metrics require the same canonical definition and exact unit; unit conversion is not inferred.",
      );
    }
    return {
      accountId: context.accountId,
      baselineMetricId: baseline.id,
      currentMetricId: current.id,
      displayName: pair.displayName ?? current.displayName,
      unit: current.unit,
      sortOrder: index,
    };
  });
  const comparisonId = newId();
  const now = new Date();
  const db = getDb();
  const pairInsertStatements = chunksOf(validatedPairs, 10).map((rows) =>
    db.insert(launchMonitorComparisonMetrics).values(
      rows.map((pair) => ({ ...pair, comparisonGroupId: comparisonId, createdAt: now })),
    ),
  );
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      db.insert(launchMonitorComparisonGroups).values({
        id: comparisonId,
        accountId: context.accountId,
        planId: context.planId,
        title: requiredText(input.title, "title", 160),
        baselineSessionId,
        currentSessionId,
        coachInterpretation: requiredText(input.coachInterpretation, "coachInterpretation", 4_000),
        limitations: requiredText(input.limitations, "limitations", 2_000),
        nextEvidenceNeeded: optionalText(input.nextEvidenceNeeded, "nextEvidenceNeeded", 2_000),
        status: "active",
        coachApprovedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...pairInsertStatements,
      ...richPlanInvalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "launch-monitor comparison changed",
        now,
      ),
      richPlanAuditStatement(context, {
        action: "launch_monitor.comparison_created",
        targetType: "launch_monitor_comparison",
        targetId: comparisonId,
        metadata: { baselineSessionId, currentSessionId, metricPairCount: validatedPairs.length },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await rethrowRichPlanConflict(context, error);
  }
  return { comparisonId, revision: context.expectedRevision + 1 };
}

export async function getLaunchMonitorComparison(input: {
  accountId: string;
  planId: string;
  comparisonId: string;
}): Promise<LaunchMonitorComparison> {
  const comparisonId = opaqueId(input.comparisonId, "comparisonId");
  const [group] = await getDb()
    .select()
    .from(launchMonitorComparisonGroups)
    .where(
      and(
        eq(launchMonitorComparisonGroups.accountId, input.accountId),
        eq(launchMonitorComparisonGroups.planId, opaqueId(input.planId, "planId")),
        eq(launchMonitorComparisonGroups.id, comparisonId),
        eq(launchMonitorComparisonGroups.status, "active"),
      ),
    )
    .limit(1);
  if (!group) throw notFound("launch_comparison_not_found", "Launch-monitor comparison not found.");
  const pairs = await getDb()
    .select()
    .from(launchMonitorComparisonMetrics)
    .where(
      and(
        eq(launchMonitorComparisonMetrics.accountId, input.accountId),
        eq(launchMonitorComparisonMetrics.comparisonGroupId, comparisonId),
      ),
    )
    .orderBy(asc(launchMonitorComparisonMetrics.sortOrder));
  const metricRows = pairs.length
    ? await getDb()
        .select({ id: launchMonitorMetrics.id, numericValue: launchMonitorMetrics.numericValue })
        .from(launchMonitorMetrics)
        .where(
          and(
            eq(launchMonitorMetrics.accountId, input.accountId),
            inArray(launchMonitorMetrics.sessionId, [group.baselineSessionId, group.currentSessionId]),
            eq(launchMonitorMetrics.isSummary, true),
          ),
        )
    : [];
  const values = new Map(metricRows.map((row) => [row.id, row.numericValue]));
  return {
    id: group.id,
    title: group.title,
    baselineSessionId: group.baselineSessionId,
    currentSessionId: group.currentSessionId,
    coachInterpretation: group.coachInterpretation,
    limitations: group.limitations,
    nextEvidenceNeeded: group.nextEvidenceNeeded,
    metrics: pairs.map((pair) => {
      const baselineValue = values.get(pair.baselineMetricId);
      const currentValue = values.get(pair.currentMetricId);
      if (baselineValue === undefined || currentValue === undefined) {
        throw conflict("launch_comparison_incomplete", "Launch-monitor comparison metrics are incomplete.");
      }
      return {
        displayName: pair.displayName,
        unit: pair.unit,
        baselineValue,
        currentValue,
        delta: currentValue - baselineValue,
      };
    }),
  };
}

export async function createLessonRecord(
  context: RichPlanMutationContext,
  input: {
    phaseId?: string | null;
    title: string;
    purpose: string;
    status?: "planned" | "scheduled" | "completed";
    scheduledAt?: Date | null;
    occurredAt?: Date | null;
    coachObservation?: string | null;
    golferLearning?: string | null;
    takeaway?: string | null;
    nextCheck?: string | null;
    phaseConnection?: string | null;
  },
): Promise<{ lessonId: string; sequence: number; revision: number }> {
  const plan = await requireRichPlan(context);
  const phaseId = input.phaseId ? opaqueId(input.phaseId, "phaseId") : null;
  if (phaseId) await requireOwnedPhase(context, phaseId);
  const status = input.status ?? "planned";
  const scheduledAt = input.scheduledAt ?? null;
  const occurredAt = input.occurredAt ?? null;
  if (scheduledAt && !validDate(scheduledAt)) throw invalid("scheduledAt", "scheduledAt must be a valid date.");
  if (occurredAt && !validDate(occurredAt)) throw invalid("occurredAt", "occurredAt must be a valid date.");
  if (status === "scheduled" && !scheduledAt) {
    throw invalid("scheduledAt", "A scheduled lesson requires scheduledAt.");
  }
  if (status === "completed" && !occurredAt) {
    throw invalid("occurredAt", "A completed lesson requires occurredAt.");
  }
  const [sequenceRow] = await getDb()
    .select({ value: max(lessons.sequence) })
    .from(lessons)
    .where(
      and(
        eq(lessons.accountId, context.accountId),
        eq(lessons.planId, context.planId),
      ),
    );
  const sequence = Number(sequenceRow?.value ?? 0) + 1;
  const lessonId = newId();
  const now = new Date();
  const db = getDb();
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      db.insert(lessons).values({
        id: lessonId,
        accountId: context.accountId,
        planId: context.planId,
        phaseId,
        sequence,
        title: requiredText(input.title, "title", 160),
        purpose: requiredText(input.purpose, "purpose", 2_000),
        status,
        scheduledAt,
        occurredAt,
        coachObservation: optionalText(input.coachObservation, "coachObservation", 4_000),
        golferLearning: optionalText(input.golferLearning, "golferLearning", 4_000),
        takeaway: optionalText(input.takeaway, "takeaway", 3_000),
        nextCheck: optionalText(input.nextCheck, "nextCheck", 2_000),
        phaseConnection: optionalText(input.phaseConnection, "phaseConnection", 2_000),
        coachApprovedAt: status === "completed" ? now : null,
        completedAt: status === "completed" ? now : null,
        createdAt: now,
        updatedAt: now,
      }),
      ...richPlanInvalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "lesson changed",
        now,
      ),
      richPlanAuditStatement(context, {
        action: "lesson.created",
        targetType: "lesson",
        targetId: lessonId,
        metadata: { phaseId, sequence, status },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await rethrowRichPlanConflict(context, error);
  }
  return { lessonId, sequence, revision: context.expectedRevision + 1 };
}

export async function createEvidenceRecord(
  context: RichPlanMutationContext,
  input: {
    phaseId: string;
    lessonId?: string | null;
    mediaAssetId?: string | null;
    evidenceType: "coach_observation" | "golfer_report" | "measurement" | "outcome_count" | "media" | "comparison" | "note";
    contextType: "assessment" | "lesson" | "practice" | "on_course" | "phase_review" | "other";
    title: string;
    claim?: string | null;
    sourceLabel: string;
    sourceType: "coach_observed" | "golfer_reported" | "device" | "document" | "mixed";
    observedAt?: Date | null;
    comparisonRole?: "standalone" | "baseline" | "current";
    comparisonGroupId?: string | null;
    metricName?: string | null;
    metricValue?: number | null;
    metricUnit?: string | null;
    valueText?: string | null;
    interpretation: string;
    limitation: string;
    maturity: "single_observation" | "early_indication" | "repeated_practice" | "on_course_observation" | "insufficient";
    nextEvidenceNeeded?: string | null;
    isRepresentative?: boolean;
  },
): Promise<{ evidenceId: string; revision: number }> {
  const plan = await requireRichPlan(context);
  const phaseId = opaqueId(input.phaseId, "phaseId");
  const lessonId = input.lessonId ? opaqueId(input.lessonId, "lessonId") : null;
  const mediaAssetId = input.mediaAssetId ? opaqueId(input.mediaAssetId, "mediaAssetId") : null;
  await Promise.all([
    requireOwnedPhase(context, phaseId),
    lessonId ? requireOwnedLesson(context, lessonId) : Promise.resolve(),
    mediaAssetId ? requireReadyMedia(context.accountId, mediaAssetId) : Promise.resolve(),
  ]);
  if (input.evidenceType === "media" && !mediaAssetId) {
    throw invalid("mediaAssetId", "Media evidence requires a ready media asset.");
  }
  if (input.evidenceType !== "media" && mediaAssetId) {
    throw invalid("mediaAssetId", "Only media evidence can reference a media asset.");
  }
  if (input.contextType === "lesson" && !lessonId) {
    throw invalid("lessonId", "Lesson evidence requires a lesson.");
  }
  const observedAt = input.observedAt ?? null;
  if (observedAt && !validDate(observedAt)) throw invalid("observedAt", "observedAt must be valid.");
  const metricName = optionalText(input.metricName, "metricName", 160);
  const metricUnit = optionalText(input.metricUnit, "metricUnit", 80);
  const metricValue = input.metricValue ?? null;
  if (metricValue !== null && (!Number.isFinite(metricValue) || !metricName || !metricUnit)) {
    throw invalid("metricValue", "A numeric measurement requires a finite value, metric name, and exact unit.");
  }
  if (metricValue === null && (metricName || metricUnit)) {
    throw invalid("metricValue", "Metric name and unit require a numeric measurement value.");
  }
  const comparisonRole = input.comparisonRole ?? "standalone";
  const comparisonGroupId = optionalText(input.comparisonGroupId, "comparisonGroupId", 80);
  if (comparisonRole !== "standalone" && !comparisonGroupId) {
    throw invalid("comparisonGroupId", "Baseline and current evidence require a comparison group label.");
  }
  const evidenceId = newId();
  const mediaAttachmentId = mediaAssetId ? newId() : null;
  const title = requiredText(input.title, "title", 160);
  const now = new Date();
  const db = getDb();
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      ...(mediaAssetId
        ? [readyMediaTransactionGuard(context.accountId, mediaAssetId)]
        : []),
      db.insert(evidenceItems).values({
        id: evidenceId,
        accountId: context.accountId,
        planId: context.planId,
        phaseId,
        lessonId,
        mediaAssetId,
        status: "published",
        evidenceType: input.evidenceType,
        contextType: input.contextType,
        title,
        claim: optionalText(input.claim, "claim", 1_500),
        sourceLabel: requiredText(input.sourceLabel, "sourceLabel", 300),
        sourceType: input.sourceType,
        observedAt,
        comparisonRole,
        comparisonGroupId,
        metricName,
        metricValue,
        metricUnit,
        valueText: optionalText(input.valueText, "valueText", 1_000),
        interpretation: requiredText(input.interpretation, "interpretation", 2_000),
        limitation: requiredText(input.limitation, "limitation", 1_500),
        maturity: input.maturity,
        nextEvidenceNeeded: optionalText(input.nextEvidenceNeeded, "nextEvidenceNeeded", 1_000),
        isRepresentative: input.isRepresentative ?? false,
        coachApprovedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...(mediaAssetId && mediaAttachmentId
        ? [
            db.insert(contentMediaAttachments).values({
              id: mediaAttachmentId,
              accountId: context.accountId,
              planId: context.planId,
              mediaAssetId,
              evidenceItemId: evidenceId,
              targetType: "evidence",
              attachmentRole: "supporting",
              label: title,
              coachContext: "Media evidence selected by the coach.",
              sortOrder: 0,
              status: "active",
              createdAt: now,
              updatedAt: now,
            }),
          ]
        : []),
      ...richPlanInvalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "evidence changed",
        now,
      ),
      richPlanAuditStatement(context, {
        action: "evidence.created",
        targetType: "evidence_item",
        targetId: evidenceId,
        metadata: {
          phaseId,
          lessonId,
          evidenceType: input.evidenceType,
          mediaAttached: Boolean(mediaAssetId),
        },
        occurredAt: now,
      }),
      ...(mediaAssetId && mediaAttachmentId
        ? [
            richPlanAuditStatement(context, {
              action: "media_attachment.created",
              targetType: "content_media_attachment",
              targetId: mediaAttachmentId,
              metadata: { targetType: "evidence", evidenceId, mediaAssetId },
              occurredAt: now,
            }),
          ]
        : []),
    ]);
  } catch (error) {
    await assertMediaStillReady(
      context.accountId,
      mediaAssetId ? [mediaAssetId] : [],
    );
    await rethrowRichPlanConflict(context, error);
  }
  return { evidenceId, revision: context.expectedRevision + 1 };
}

export async function transitionLessonLifecycle(
  context: RichPlanMutationContext,
  input: {
    lessonId: string;
    nextStatus: "planned" | "scheduled" | "completed" | "canceled" | "archived";
    scheduledAt?: Date | null;
    occurredAt?: Date | null;
    coachObservation?: string | null;
    golferLearning?: string | null;
    takeaway?: string | null;
    nextCheck?: string | null;
    phaseConnection?: string | null;
    evidenceItemIds?: readonly string[];
    launchSessionIds?: readonly string[];
  },
): Promise<{ revision: number }> {
  const plan = await requireRichPlan(context);
  const lessonId = opaqueId(input.lessonId, "lessonId");
  const db = getDb();
  const [[lesson], currentEvidenceRows, currentLaunchSessionRows] = await Promise.all([
    db
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.accountId, context.accountId),
          eq(lessons.planId, context.planId),
          eq(lessons.id, lessonId),
        ),
      )
      .limit(1),
    db
      .select({ id: evidenceItems.id })
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.accountId, context.accountId),
          eq(evidenceItems.planId, context.planId),
          eq(evidenceItems.lessonId, lessonId),
        ),
      )
      .orderBy(asc(evidenceItems.id))
      .limit(MAX_LESSON_ASSOCIATIONS_PER_TYPE + 1),
    db
      .select({ id: launchMonitorSessions.id })
      .from(launchMonitorSessions)
      .where(
        and(
          eq(launchMonitorSessions.accountId, context.accountId),
          eq(launchMonitorSessions.planId, context.planId),
          eq(launchMonitorSessions.lessonId, lessonId),
        ),
      )
      .orderBy(asc(launchMonitorSessions.id))
      .limit(MAX_LESSON_ASSOCIATIONS_PER_TYPE + 1),
  ]);
  if (!lesson) throw notFound("lesson_not_found", "Lesson not found.");
  if (
    currentEvidenceRows.length > MAX_LESSON_ASSOCIATIONS_PER_TYPE ||
    currentLaunchSessionRows.length > MAX_LESSON_ASSOCIATIONS_PER_TYPE
  ) {
    throw conflict(
      "lesson_history_snapshot_too_large",
      `A lesson correction can preserve at most ${MAX_LESSON_ASSOCIATIONS_PER_TYPE} evidence records and ${MAX_LESSON_ASSOCIATIONS_PER_TYPE} launch sessions. Remove excess associations first.`,
    );
  }
  const allowed: Record<string, readonly string[]> = {
    planned: ["scheduled", "completed", "canceled", "archived"],
    scheduled: ["planned", "completed", "canceled", "archived"],
    completed: ["archived"],
    canceled: ["planned", "scheduled", "archived"],
    archived: [],
  };
  if (
    lesson.status === "archived" ||
    (input.nextStatus !== lesson.status && !allowed[lesson.status]?.includes(input.nextStatus))
  ) {
    throw conflict("invalid_lesson_transition", "This lesson lifecycle transition is not allowed.");
  }
  const scheduledAt = input.scheduledAt ?? lesson.scheduledAt;
  const occurredAt = input.occurredAt ?? lesson.occurredAt;
  if (input.scheduledAt && !validDate(input.scheduledAt)) throw invalid("scheduledAt", "scheduledAt must be valid.");
  if (input.occurredAt && !validDate(input.occurredAt)) throw invalid("occurredAt", "occurredAt must be valid.");
  if (input.nextStatus === "scheduled" && !scheduledAt) {
    throw invalid("scheduledAt", "A scheduled lesson requires scheduledAt.");
  }
  if (input.nextStatus === "completed" && !occurredAt) {
    throw invalid("occurredAt", "A completed lesson requires occurredAt.");
  }
  const evidenceItemIds = input.evidenceItemIds === undefined
    ? undefined
    : normalizedStringList(input.evidenceItemIds, "evidenceItemIds", MAX_LESSON_ASSOCIATIONS_PER_TYPE, 200, true).map((id, index) =>
        opaqueId(id, `evidenceItemIds[${index}]`),
      );
  const launchSessionIds = input.launchSessionIds === undefined
    ? undefined
    : normalizedStringList(input.launchSessionIds, "launchSessionIds", MAX_LESSON_ASSOCIATIONS_PER_TYPE, 200, true).map((id, index) =>
        opaqueId(id, `launchSessionIds[${index}]`),
      );
  await validateLessonEvidenceSelections(context, lessonId, evidenceItemIds, launchSessionIds);
  const now = new Date();
  const historySnapshotId = newId();
  const evidenceStatements = evidenceItemIds === undefined
    ? []
    : [
        db
          .update(evidenceItems)
          .set({ lessonId: null, updatedAt: now })
          .where(
            and(
              eq(evidenceItems.accountId, context.accountId),
              eq(evidenceItems.planId, context.planId),
              eq(evidenceItems.lessonId, lessonId),
            ),
          ),
        ...(evidenceItemIds.length
          ? [
              db
                .update(evidenceItems)
                .set({ lessonId, updatedAt: now })
                .where(
                  and(
                    eq(evidenceItems.accountId, context.accountId),
                    eq(evidenceItems.planId, context.planId),
                    inArray(evidenceItems.id, evidenceItemIds),
                  ),
                ),
            ]
          : []),
      ];
  const launchSessionStatements = launchSessionIds === undefined
    ? []
    : [
        db
          .update(launchMonitorSessions)
          .set({ lessonId: null, updatedAt: now })
          .where(
            and(
              eq(launchMonitorSessions.accountId, context.accountId),
              eq(launchMonitorSessions.planId, context.planId),
              eq(launchMonitorSessions.lessonId, lessonId),
            ),
          ),
        ...(launchSessionIds.length
          ? [
              db
                .update(launchMonitorSessions)
                .set({ lessonId, updatedAt: now })
                .where(
                  and(
                    eq(launchMonitorSessions.accountId, context.accountId),
                    eq(launchMonitorSessions.planId, context.planId),
                    inArray(launchMonitorSessions.id, launchSessionIds),
                  ),
                ),
            ]
          : []),
      ];
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      db.insert(lessonRevisionSnapshots).values({
        id: historySnapshotId,
        accountId: context.accountId,
        planId: context.planId,
        lessonId,
        sourcePlanRevision: context.expectedRevision,
        replacementPlanRevision: context.expectedRevision + 1,
        phaseId: lesson.phaseId,
        sequence: lesson.sequence,
        title: lesson.title,
        status: lesson.status,
        purpose: lesson.purpose,
        coachObservation: lesson.coachObservation,
        golferLearning: lesson.golferLearning,
        takeaway: lesson.takeaway,
        nextCheck: lesson.nextCheck,
        phaseConnection: lesson.phaseConnection,
        scheduledAt: lesson.scheduledAt,
        occurredAt: lesson.occurredAt,
        coachApprovedAt: lesson.coachApprovedAt,
        completedAt: lesson.completedAt,
        canceledAt: lesson.canceledAt,
        archivedAt: lesson.archivedAt,
        evidenceItemIds: currentEvidenceRows.map((row) => row.id),
        launchSessionIds: currentLaunchSessionRows.map((row) => row.id),
        createdAt: now,
      }),
      db
        .update(lessons)
        .set({
          status: sql<typeof input.nextStatus>`case when ${lessons.status} = ${lesson.status} then ${input.nextStatus} else null end`,
          scheduledAt: input.nextStatus === "planned" ? null : scheduledAt,
          occurredAt: input.nextStatus === "completed" ? occurredAt : lesson.occurredAt,
          coachObservation: input.coachObservation === undefined
            ? lesson.coachObservation
            : optionalText(input.coachObservation, "coachObservation", 4_000),
          golferLearning: input.golferLearning === undefined
            ? lesson.golferLearning
            : optionalText(input.golferLearning, "golferLearning", 4_000),
          takeaway: input.takeaway === undefined
            ? lesson.takeaway
            : optionalText(input.takeaway, "takeaway", 3_000),
          nextCheck: input.nextCheck === undefined
            ? lesson.nextCheck
            : optionalText(input.nextCheck, "nextCheck", 2_000),
          phaseConnection: input.phaseConnection === undefined
            ? lesson.phaseConnection
            : optionalText(input.phaseConnection, "phaseConnection", 2_000),
          coachApprovedAt: input.nextStatus === "completed" ? now : null,
          completedAt: input.nextStatus === "completed" ? now : null,
          canceledAt: input.nextStatus === "canceled" ? now : null,
          archivedAt: input.nextStatus === "archived" ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(lessons.accountId, context.accountId),
            eq(lessons.planId, context.planId),
            eq(lessons.id, lessonId),
          ),
        ),
      ...evidenceStatements,
      ...launchSessionStatements,
      ...richPlanInvalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "lesson lifecycle changed",
        now,
      ),
      richPlanAuditStatement(context, {
        action: "lesson.revision_snapshotted",
        targetType: "lesson_revision_snapshot",
        targetId: historySnapshotId,
        metadata: {
          lessonId,
          sourcePlanRevision: context.expectedRevision,
          replacementPlanRevision: context.expectedRevision + 1,
          evidenceItemCount: currentEvidenceRows.length,
          launchSessionCount: currentLaunchSessionRows.length,
        },
        occurredAt: now,
      }),
      richPlanAuditStatement(context, {
        action: "lesson.lifecycle_transitioned",
        targetType: "lesson",
        targetId: lessonId,
        metadata: {
          fromStatus: lesson.status,
          toStatus: input.nextStatus,
          evidenceItemCount: evidenceItemIds?.length ?? null,
          launchSessionCount: launchSessionIds?.length ?? null,
          historySnapshotId,
        },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await rethrowRichPlanConflict(context, error);
  }
  return { revision: context.expectedRevision + 1 };
}

async function validateLessonEvidenceSelections(
  context: RichPlanMutationContext,
  lessonId: string,
  evidenceItemIds: readonly string[] | undefined,
  launchSessionIds: readonly string[] | undefined,
): Promise<void> {
  const [evidenceRows, sessionRows] = await Promise.all([
    evidenceItemIds?.length
      ? getDb()
          .select({ id: evidenceItems.id, lessonId: evidenceItems.lessonId })
          .from(evidenceItems)
          .where(
            and(
              eq(evidenceItems.accountId, context.accountId),
              eq(evidenceItems.planId, context.planId),
              inArray(evidenceItems.status, ["draft", "published"]),
              inArray(evidenceItems.id, evidenceItemIds),
            ),
          )
      : Promise.resolve([]),
    launchSessionIds?.length
      ? getDb()
          .select({ id: launchMonitorSessions.id, lessonId: launchMonitorSessions.lessonId })
          .from(launchMonitorSessions)
          .where(
            and(
              eq(launchMonitorSessions.accountId, context.accountId),
              eq(launchMonitorSessions.planId, context.planId),
              eq(launchMonitorSessions.status, "committed"),
              inArray(launchMonitorSessions.id, launchSessionIds),
            ),
          )
      : Promise.resolve([]),
  ]);
  if (
    evidenceItemIds &&
    (evidenceRows.length !== evidenceItemIds.length ||
      evidenceRows.some((row) => row.lessonId && row.lessonId !== lessonId))
  ) {
    throw conflict(
      "lesson_evidence_unavailable",
      "Every selected evidence item must be available in this plan and not linked to another lesson.",
    );
  }
  if (
    launchSessionIds &&
    (sessionRows.length !== launchSessionIds.length ||
      sessionRows.some((row) => row.lessonId && row.lessonId !== lessonId))
  ) {
    throw conflict(
      "lesson_measurement_unavailable",
      "Every selected measurement session must be available in this plan and not linked to another lesson.",
    );
  }
}

export async function createMilestone(
  context: RichPlanMutationContext,
  input: { phaseId?: string | null; title: string; summary: string; occurredAt: Date },
): Promise<{ milestoneId: string; revision: number }> {
  const plan = await requireRichPlan(context);
  const phaseId = input.phaseId ? opaqueId(input.phaseId, "phaseId") : null;
  if (phaseId) await requireOwnedPhase(context, phaseId);
  if (!validDate(input.occurredAt)) throw invalid("occurredAt", "occurredAt must be a valid date.");
  const milestoneId = newId();
  const now = new Date();
  const db = getDb();
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      db.insert(milestones).values({
        id: milestoneId,
        accountId: context.accountId,
        planId: context.planId,
        phaseId,
        title: requiredText(input.title, "title", 160),
        summary: requiredText(input.summary, "summary", 2_000),
        occurredAt: input.occurredAt,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      }),
      ...richPlanInvalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "private milestone changed",
        now,
      ),
      richPlanAuditStatement(context, {
        action: "milestone.created",
        targetType: "milestone",
        targetId: milestoneId,
        metadata: { phaseId, visibility: "private" },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await rethrowRichPlanConflict(context, error);
  }
  return { milestoneId, revision: context.expectedRevision + 1 };
}

export async function transitionMilestone(
  context: RichPlanMutationContext,
  input: { milestoneId: string; nextStatus: "published" | "withdrawn" },
): Promise<{ revision: number }> {
  const plan = await requireRichPlan(context);
  const milestoneId = opaqueId(input.milestoneId, "milestoneId");
  const [milestone] = await getDb()
    .select({ status: milestones.status })
    .from(milestones)
    .where(
      and(
        eq(milestones.accountId, context.accountId),
        eq(milestones.planId, context.planId),
        eq(milestones.id, milestoneId),
      ),
    )
    .limit(1);
  if (!milestone) throw notFound("milestone_not_found", "Milestone not found.");
  const allowed =
    (milestone.status === "draft" && (input.nextStatus === "published" || input.nextStatus === "withdrawn")) ||
    (milestone.status === "published" && input.nextStatus === "withdrawn");
  if (!allowed) throw conflict("invalid_milestone_transition", "This milestone transition is not allowed.");
  const now = new Date();
  const db = getDb();
  try {
    await db.batch([
      ...richPlanMutationGuards(context),
      db
        .update(milestones)
        .set({
          status: sql<typeof input.nextStatus>`case when ${milestones.status} = ${milestone.status} then ${input.nextStatus} else null end`,
          coachApprovedAt: input.nextStatus === "published" ? now : undefined,
          withdrawnAt: input.nextStatus === "withdrawn" ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(milestones.accountId, context.accountId),
            eq(milestones.planId, context.planId),
            eq(milestones.id, milestoneId),
          ),
        ),
      ...richPlanInvalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "milestone visibility changed",
        now,
      ),
      richPlanAuditStatement(context, {
        action: "milestone.transitioned",
        targetType: "milestone",
        targetId: milestoneId,
        metadata: { fromStatus: milestone.status, toStatus: input.nextStatus },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await rethrowRichPlanConflict(context, error);
  }
  return { revision: context.expectedRevision + 1 };
}

export async function listRichCoachingTimeline(input: {
  accountId: string;
  planId: string;
  limit?: number;
}): Promise<readonly RichTimelineItem[]> {
  const planId = opaqueId(input.planId, "planId");
  const [plan] = await getDb()
    .select({ id: developmentPlans.id })
    .from(developmentPlans)
    .where(and(eq(developmentPlans.accountId, input.accountId), eq(developmentPlans.id, planId)))
    .limit(1);
  if (!plan) throw notFound("plan_not_found", "Plan not found.");
  const limit = boundedInteger(input.limit ?? 100, "limit", 1, 250);
  const db = getDb();
  const [lessonRows, practiceRows, checkInRows, evidenceRows, sessionRows, reviewRows, milestoneRows] =
    await Promise.all([
      db.select({ id: lessons.id, title: lessons.title, summary: lessons.takeaway, status: lessons.status, occurredAt: sql<number>`coalesce(${lessons.occurredAt}, ${lessons.scheduledAt}, ${lessons.createdAt})` }).from(lessons).where(and(eq(lessons.accountId, input.accountId), eq(lessons.planId, planId))),
      db.select({ id: practiceItems.id, title: practiceItems.title, summary: practiceItems.objective, status: practiceItems.status, occurredAt: sql<number>`coalesce(${practiceItems.completedAt}, ${practiceItems.createdAt})` }).from(practiceItems).where(and(eq(practiceItems.accountId, input.accountId), eq(practiceItems.planId, planId))),
      db.select({ id: practiceCheckIns.id, title: practiceItems.title, summary: practiceCheckIns.note, status: practiceCheckIns.completionStatus, occurredAt: practiceCheckIns.occurredAt }).from(practiceCheckIns).innerJoin(practiceItems, and(eq(practiceItems.accountId, practiceCheckIns.accountId), eq(practiceItems.planId, practiceCheckIns.planId), eq(practiceItems.id, practiceCheckIns.practiceItemId))).where(and(eq(practiceCheckIns.accountId, input.accountId), eq(practiceCheckIns.planId, planId))),
      db.select({ id: evidenceItems.id, title: evidenceItems.title, summary: evidenceItems.interpretation, status: evidenceItems.status, occurredAt: sql<number>`coalesce(${evidenceItems.observedAt}, ${evidenceItems.createdAt})` }).from(evidenceItems).where(and(eq(evidenceItems.accountId, input.accountId), eq(evidenceItems.planId, planId))),
      db.select({ id: launchMonitorSessions.id, title: launchMonitorSessions.deviceSource, summary: launchMonitorSessions.coachInterpretation, status: launchMonitorSessions.status, occurredAt: launchMonitorSessions.sessionDate }).from(launchMonitorSessions).where(and(eq(launchMonitorSessions.accountId, input.accountId), eq(launchMonitorSessions.planId, planId))),
      db.select({ id: phaseReviews.id, title: phaseReviews.reliabilityLabel, summary: phaseReviews.coachConclusion, status: phaseReviews.status, occurredAt: sql<number>`coalesce(${phaseReviews.sharedAt}, ${phaseReviews.confirmedAt}, ${phaseReviews.createdAt})` }).from(phaseReviews).where(and(eq(phaseReviews.accountId, input.accountId), eq(phaseReviews.planId, planId))),
      db.select({ id: milestones.id, title: milestones.title, summary: milestones.summary, status: milestones.status, occurredAt: milestones.occurredAt }).from(milestones).where(and(eq(milestones.accountId, input.accountId), eq(milestones.planId, planId))),
    ]);
  return [
    ...lessonRows.map((row) => timelineRow("lesson", row)),
    ...practiceRows.map((row) => timelineRow("practice", row)),
    ...checkInRows.map((row) => timelineRow("practice_check_in", row)),
    ...evidenceRows.map((row) => timelineRow("evidence", row)),
    ...sessionRows.map((row) => timelineRow("launch_session", row)),
    ...reviewRows.map((row) => timelineRow("phase_review", row)),
    ...milestoneRows.map((row) => timelineRow("milestone", row)),
  ]
    .sort((left, right) => right.occurredAt - left.occurredAt || left.id.localeCompare(right.id))
    .slice(0, limit);
}

export async function listDrillTemplates(input: {
  accountId: string;
  includeArchived?: boolean;
  favouriteOnly?: boolean;
  search?: string | null;
  limit?: number;
}) {
  const limit = boundedInteger(input.limit ?? 100, "limit", 1, 250);
  const search = optionalText(input.search, "search", 160)?.toLowerCase() ?? null;
  const conditions = [eq(drillTemplates.accountId, input.accountId)];
  if (!input.includeArchived) conditions.push(eq(drillTemplates.status, "active"));
  if (input.favouriteOnly) conditions.push(eq(drillTemplates.isFavourite, true));
  if (search) conditions.push(sql`instr(lower(${drillTemplates.title}), ${search}) > 0`);
  const rows = await getDb()
    .select()
    .from(drillTemplates)
    .where(and(...conditions))
    .orderBy(desc(drillTemplates.isFavourite), asc(drillTemplates.title), desc(drillTemplates.updatedAt))
    .limit(limit);
  return rows.map((row) => ({
    ...row,
    archivedAt: nullableEpochMs(row.archivedAt),
    createdAt: toEpochMs(row.createdAt),
    updatedAt: toEpochMs(row.updatedAt),
  }));
}

export async function listRoadmapTemplates(input: {
  accountId: string;
  includeArchived?: boolean;
  favouriteOnly?: boolean;
  search?: string | null;
  limit?: number;
}) {
  const limit = boundedInteger(input.limit ?? 100, "limit", 1, 250);
  const search = optionalText(input.search, "search", 160)?.toLowerCase() ?? null;
  const conditions = [eq(roadmapTemplates.accountId, input.accountId)];
  if (!input.includeArchived) conditions.push(eq(roadmapTemplates.status, "active"));
  if (input.favouriteOnly) conditions.push(eq(roadmapTemplates.isFavourite, true));
  if (search) conditions.push(sql`instr(lower(${roadmapTemplates.title}), ${search}) > 0`);
  const rows = await getDb()
    .select()
    .from(roadmapTemplates)
    .where(and(...conditions))
    .orderBy(desc(roadmapTemplates.isFavourite), asc(roadmapTemplates.title), desc(roadmapTemplates.updatedAt))
    .limit(limit);
  return rows.map((row) => ({
    ...row,
    content: normalizedRoadmapTemplateContent(row.content as RoadmapTemplateContent),
    archivedAt: nullableEpochMs(row.archivedAt),
    createdAt: toEpochMs(row.createdAt),
    updatedAt: toEpochMs(row.updatedAt),
  }));
}

export async function listPracticeCheckIns(input: {
  accountId: string;
  planId: string;
  practiceItemId?: string | null;
  limit?: number;
}) {
  const planId = opaqueId(input.planId, "planId");
  const practiceItemId = input.practiceItemId
    ? opaqueId(input.practiceItemId, "practiceItemId")
    : null;
  const limit = boundedInteger(input.limit ?? 100, "limit", 1, 250);
  const conditions = [
    eq(practiceCheckIns.accountId, input.accountId),
    eq(practiceCheckIns.planId, planId),
  ];
  if (practiceItemId) conditions.push(eq(practiceCheckIns.practiceItemId, practiceItemId));
  const rows = await getDb()
    .select({
      id: practiceCheckIns.id,
      practiceItemId: practiceCheckIns.practiceItemId,
      completionStatus: practiceCheckIns.completionStatus,
      perceivedDifficulty: practiceCheckIns.perceivedDifficulty,
      confidenceRating: practiceCheckIns.confidenceRating,
      note: practiceCheckIns.note,
      requestHelp: practiceCheckIns.requestHelp,
      occurredAt: practiceCheckIns.occurredAt,
    })
    .from(practiceCheckIns)
    .where(and(...conditions))
    .orderBy(desc(practiceCheckIns.occurredAt), desc(practiceCheckIns.id))
    .limit(limit);
  return rows.map((row) => ({ ...row, occurredAt: toEpochMs(row.occurredAt) }));
}

export async function listPracticeAssignments(input: {
  accountId: string;
  planId: string;
  includeRetired?: boolean;
}) {
  const planId = opaqueId(input.planId, "planId");
  const conditions = [
    eq(practiceItems.accountId, input.accountId),
    eq(practiceItems.planId, planId),
  ];
  if (!input.includeRetired) conditions.push(sql`${practiceItems.status} <> 'retired'`);
  const rows = await getDb()
    .select({ assignment: practiceItems, snapshot: practiceAssignmentSnapshots })
    .from(practiceItems)
    .leftJoin(
      practiceAssignmentSnapshots,
      and(
        eq(practiceAssignmentSnapshots.accountId, practiceItems.accountId),
        eq(practiceAssignmentSnapshots.planId, practiceItems.planId),
        eq(practiceAssignmentSnapshots.practiceItemId, practiceItems.id),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(practiceItems.createdAt), desc(practiceItems.id));
  const checkIns = await listPracticeCheckIns({
    accountId: input.accountId,
    planId,
    limit: 250,
  });
  const replacements = await getDb()
    .select()
    .from(practiceAssignmentReplacements)
    .where(
      and(
        eq(practiceAssignmentReplacements.accountId, input.accountId),
        eq(practiceAssignmentReplacements.planId, planId),
      ),
    )
    .orderBy(asc(practiceAssignmentReplacements.createdAt));
  const checkInsByPractice = groupBy(checkIns, (row) => row.practiceItemId);
  const previousByReplacement = new Map(
    replacements.map((row) => [row.replacementPracticeItemId, row]),
  );
  const nextByReplaced = new Map(
    replacements.map((row) => [row.replacedPracticeItemId, row]),
  );
  return rows.map(({ assignment, snapshot }) => ({
    assignment: {
      ...assignment,
      startsAt: nullableEpochMs(assignment.startsAt),
      dueAt: nullableEpochMs(assignment.dueAt),
      coachApprovedAt: nullableEpochMs(assignment.coachApprovedAt),
      pausedAt: nullableEpochMs(assignment.pausedAt),
      completedAt: nullableEpochMs(assignment.completedAt),
      retiredAt: nullableEpochMs(assignment.retiredAt),
      createdAt: toEpochMs(assignment.createdAt),
      updatedAt: toEpochMs(assignment.updatedAt),
    },
    snapshot: snapshot
      ? { ...snapshot, createdAt: toEpochMs(snapshot.createdAt) }
      : null,
    lineage: {
      previous: replacementLineageView(previousByReplacement.get(assignment.id), "previous"),
      next: replacementLineageView(nextByReplaced.get(assignment.id), "next"),
    },
    checkIns: checkInsByPractice.get(assignment.id) ?? [],
  }));
}

export async function listPlanMediaAttachments(input: {
  accountId: string;
  planId: string;
  target?: PlanMediaAttachmentTarget | null;
  includeWithdrawn?: boolean;
}) {
  const planId = opaqueId(input.planId, "planId");
  const conditions = [
    eq(contentMediaAttachments.accountId, input.accountId),
    eq(contentMediaAttachments.planId, planId),
  ];
  if (!input.includeWithdrawn) conditions.push(eq(contentMediaAttachments.status, "active"));
  if (input.target) {
    const id = opaqueId(input.target.id, "target.id");
    conditions.push(eq(contentMediaAttachments.targetType, input.target.kind));
    conditions.push(mediaAttachmentTargetCondition(input.target.kind, id));
  }
  const rows = await getDb()
    .select({ attachment: contentMediaAttachments, asset: mediaAssets, details: mediaAssetDetails })
    .from(contentMediaAttachments)
    .innerJoin(
      mediaAssets,
      and(
        eq(mediaAssets.accountId, contentMediaAttachments.accountId),
        eq(mediaAssets.id, contentMediaAttachments.mediaAssetId),
      ),
    )
    .leftJoin(
      mediaAssetDetails,
      and(
        eq(mediaAssetDetails.accountId, mediaAssets.accountId),
        eq(mediaAssetDetails.mediaAssetId, mediaAssets.id),
      ),
    )
    .where(and(...conditions))
    .orderBy(asc(contentMediaAttachments.sortOrder), asc(contentMediaAttachments.createdAt));
  return rows.map(({ attachment, asset, details }) => ({
    attachment: {
      ...attachment,
      withdrawnAt: nullableEpochMs(attachment.withdrawnAt),
      createdAt: toEpochMs(attachment.createdAt),
      updatedAt: toEpochMs(attachment.updatedAt),
    },
    asset: {
      id: asset.id,
      status: asset.status,
      mediaKind: asset.mediaKind,
      mimeType: asset.mimeType,
      altText: asset.altText,
      caption: asset.caption,
      transcript: asset.transcript,
      widthPixels: asset.widthPixels,
      heightPixels: asset.heightPixels,
      durationMs: asset.durationMs,
      capturedAt: nullableEpochMs(details?.capturedAt),
      orientation: details?.orientation ?? "unknown",
      viewLabel: details?.viewLabel ?? null,
      coachContext: details?.coachContext ?? null,
    },
  }));
}

export async function listLaunchMonitorImports(input: {
  accountId: string;
  planId: string;
  includeTerminal?: boolean;
  limit?: number;
}) {
  const planId = opaqueId(input.planId, "planId");
  const limit = boundedInteger(input.limit ?? 100, "limit", 1, 250);
  const conditions = [
    eq(launchMonitorImports.accountId, input.accountId),
    eq(launchMonitorImports.planId, planId),
  ];
  if (!input.includeTerminal) {
    conditions.push(inArray(launchMonitorImports.status, ["staged", "mapping_required", "validated"]));
  }
  const rows = await getDb()
    .select()
    .from(launchMonitorImports)
    .where(and(...conditions))
    .orderBy(desc(launchMonitorImports.updatedAt), desc(launchMonitorImports.id))
    .limit(limit);
  return rows.map(({
    idempotencyKeyHash: idempotencySecret,
    requestFingerprint: requestSecret,
    ...row
  }) => {
    void idempotencySecret;
    void requestSecret;
    return {
      ...row,
      committedAt: nullableEpochMs(row.committedAt),
      createdAt: toEpochMs(row.createdAt),
      updatedAt: toEpochMs(row.updatedAt),
    };
  });
}

export async function listLaunchMonitorSessions(input: {
  accountId: string;
  planId: string;
  includeWithdrawn?: boolean;
  limit?: number;
}) {
  const planId = opaqueId(input.planId, "planId");
  const limit = boundedInteger(input.limit ?? 100, "limit", 1, 250);
  const conditions = [
    eq(launchMonitorSessions.accountId, input.accountId),
    eq(launchMonitorSessions.planId, planId),
  ];
  if (!input.includeWithdrawn) conditions.push(sql`${launchMonitorSessions.status} <> 'withdrawn'`);
  const sessions = await getDb()
    .select()
    .from(launchMonitorSessions)
    .where(and(...conditions))
    .orderBy(desc(launchMonitorSessions.sessionDate), desc(launchMonitorSessions.id))
    .limit(limit);
  if (!sessions.length) return [];
  const metrics = await rowsForIdChunks(
    sessions.map((session) => session.id),
    (ids) =>
      getDb()
        .select()
        .from(launchMonitorMetrics)
        .where(
          and(
            eq(launchMonitorMetrics.accountId, input.accountId),
            inArray(launchMonitorMetrics.sessionId, ids),
            eq(launchMonitorMetrics.isSummary, true),
          ),
        )
        .orderBy(asc(launchMonitorMetrics.sortOrder)),
  );
  const metricsBySession = groupBy(metrics, (row) => row.sessionId);
  return sessions.map((session) => ({
    ...session,
    sessionDate: toEpochMs(session.sessionDate),
    coachApprovedAt: nullableEpochMs(session.coachApprovedAt),
    withdrawnAt: nullableEpochMs(session.withdrawnAt),
    createdAt: toEpochMs(session.createdAt),
    updatedAt: toEpochMs(session.updatedAt),
    summaryMetrics: (metricsBySession.get(session.id) ?? []).map(launchMetricView),
  }));
}

export async function getLaunchMonitorSessionDetails(input: {
  accountId: string;
  planId: string;
  sessionId: string;
}) {
  const planId = opaqueId(input.planId, "planId");
  const sessionId = opaqueId(input.sessionId, "sessionId");
  const [session] = await getDb()
    .select()
    .from(launchMonitorSessions)
    .where(
      and(
        eq(launchMonitorSessions.accountId, input.accountId),
        eq(launchMonitorSessions.planId, planId),
        eq(launchMonitorSessions.id, sessionId),
      ),
    )
    .limit(1);
  if (!session) throw notFound("launch_session_not_found", "Launch-monitor session not found.");
  const [shots, metrics] = await Promise.all([
    getDb()
      .select()
      .from(launchMonitorShots)
      .where(
        and(
          eq(launchMonitorShots.accountId, input.accountId),
          eq(launchMonitorShots.sessionId, sessionId),
        ),
      )
      .orderBy(asc(launchMonitorShots.sequence)),
    getDb()
      .select()
      .from(launchMonitorMetrics)
      .where(
        and(
          eq(launchMonitorMetrics.accountId, input.accountId),
          eq(launchMonitorMetrics.sessionId, sessionId),
        ),
      )
      .orderBy(asc(launchMonitorMetrics.sortOrder)),
  ]);
  const shotMetrics = groupBy(
    metrics.filter((metric) => metric.shotId),
    (metric) => metric.shotId!,
  );
  return {
    session: {
      ...session,
      sessionDate: toEpochMs(session.sessionDate),
      coachApprovedAt: nullableEpochMs(session.coachApprovedAt),
      withdrawnAt: nullableEpochMs(session.withdrawnAt),
      createdAt: toEpochMs(session.createdAt),
      updatedAt: toEpochMs(session.updatedAt),
    },
    summaryMetrics: metrics.filter((metric) => metric.isSummary).map(launchMetricView),
    shots: shots.map((shot) => ({
      ...shot,
      capturedAt: nullableEpochMs(shot.capturedAt),
      createdAt: toEpochMs(shot.createdAt),
      metrics: (shotMetrics.get(shot.id) ?? []).map(launchMetricView),
    })),
  };
}

export async function listLaunchMonitorComparisons(input: {
  accountId: string;
  planId: string;
  includeWithdrawn?: boolean;
}) {
  const planId = opaqueId(input.planId, "planId");
  const conditions = [
    eq(launchMonitorComparisonGroups.accountId, input.accountId),
    eq(launchMonitorComparisonGroups.planId, planId),
  ];
  if (!input.includeWithdrawn) conditions.push(eq(launchMonitorComparisonGroups.status, "active"));
  const groups = await getDb()
    .select()
    .from(launchMonitorComparisonGroups)
    .where(and(...conditions))
    .orderBy(desc(launchMonitorComparisonGroups.createdAt));
  return Promise.all(
    groups.map(async (group) => {
      if (group.status !== "active") {
        return {
          ...group,
          coachApprovedAt: nullableEpochMs(group.coachApprovedAt),
          withdrawnAt: nullableEpochMs(group.withdrawnAt),
          createdAt: toEpochMs(group.createdAt),
          updatedAt: toEpochMs(group.updatedAt),
          metrics: [],
        };
      }
      return getLaunchMonitorComparison({
        accountId: input.accountId,
        planId,
        comparisonId: group.id,
      });
    }),
  );
}

export async function listPhaseReviewSources(input: {
  accountId: string;
  planId: string;
  phaseReviewId: string;
}) {
  const rows = await getDb()
    .select()
    .from(phaseReviewSources)
    .where(
      and(
        eq(phaseReviewSources.accountId, input.accountId),
        eq(phaseReviewSources.planId, opaqueId(input.planId, "planId")),
        eq(phaseReviewSources.phaseReviewId, opaqueId(input.phaseReviewId, "phaseReviewId")),
      ),
    )
    .orderBy(asc(phaseReviewSources.sortOrder));
  return rows.map((row) => ({ ...row, createdAt: toEpochMs(row.createdAt) }));
}

export async function listMilestones(input: {
  accountId: string;
  planId: string;
  includeWithdrawn?: boolean;
}) {
  const conditions = [
    eq(milestones.accountId, input.accountId),
    eq(milestones.planId, opaqueId(input.planId, "planId")),
  ];
  if (!input.includeWithdrawn) conditions.push(sql`${milestones.status} <> 'withdrawn'`);
  const rows = await getDb()
    .select()
    .from(milestones)
    .where(and(...conditions))
    .orderBy(desc(milestones.occurredAt), desc(milestones.id));
  return rows.map((row) => ({
    ...row,
    occurredAt: toEpochMs(row.occurredAt),
    coachApprovedAt: nullableEpochMs(row.coachApprovedAt),
    withdrawnAt: nullableEpochMs(row.withdrawnAt),
    createdAt: toEpochMs(row.createdAt),
    updatedAt: toEpochMs(row.updatedAt),
  }));
}

export function richPlanMutationGuards(context: RichPlanMutationContext) {
  const db = getDb();
  return [
    consentGrantTransactionGuard(context.accountId, context.consentRequirements),
    db
      .update(developmentPlans)
      .set({
        status: sql`case when ${developmentPlans.revision} = ${context.expectedRevision}
          then ${developmentPlans.status} else null end`,
      })
      .where(
        and(
          eq(developmentPlans.accountId, context.accountId),
          eq(developmentPlans.id, context.planId),
        ),
      ),
  ] as const;
}

async function mutateDrillTemplateState(input: {
  accountId: string;
  drillTemplateId: string;
  expectedVersion: number;
  action: "favourite" | "archive";
  value: boolean;
  requestId?: string | null;
}): Promise<{ version: number }> {
  const id = opaqueId(input.drillTemplateId, "drillTemplateId");
  const version = boundedInteger(input.expectedVersion, "expectedVersion", 1, Number.MAX_SAFE_INTEGER);
  await requireTemplateVersion(input.accountId, id, version, "drill");
  const now = new Date();
  const db = getDb();
  try {
    await db.batch([
      db
        .update(drillTemplates)
        .set({
          title: sql<string>`case when ${drillTemplates.version} = ${version} and ${drillTemplates.status} = 'active' then ${drillTemplates.title} else null end`,
          status: input.action === "archive" ? "archived" : "active",
          isFavourite: input.action === "favourite" ? input.value : false,
          version: sql`${drillTemplates.version} + 1`,
          archivedAt: input.action === "archive" ? now : null,
          updatedAt: now,
        })
        .where(and(eq(drillTemplates.accountId, input.accountId), eq(drillTemplates.id, id))),
      auditStatement({
        accountId: input.accountId,
        action: input.action === "archive" ? "drill_template.archived" : "drill_template.favourite_changed",
        targetType: "drill_template",
        targetId: id,
        requestId: input.requestId,
        metadata: {
          fromVersion: version,
          toVersion: version + 1,
          ...(input.action === "favourite" ? { favourite: input.value } : {}),
        },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await rethrowTemplateVersionConflict(input.accountId, id, version, "drill", error);
  }
  return { version: version + 1 };
}

async function mutateRoadmapTemplateState(input: {
  accountId: string;
  roadmapTemplateId: string;
  expectedVersion: number;
  action: "favourite" | "archive";
  value: boolean;
  requestId?: string | null;
}): Promise<{ version: number }> {
  const id = opaqueId(input.roadmapTemplateId, "roadmapTemplateId");
  const version = boundedInteger(input.expectedVersion, "expectedVersion", 1, Number.MAX_SAFE_INTEGER);
  await requireTemplateVersion(input.accountId, id, version, "roadmap");
  const now = new Date();
  const db = getDb();
  try {
    await db.batch([
      db
        .update(roadmapTemplates)
        .set({
          title: sql<string>`case when ${roadmapTemplates.version} = ${version} and ${roadmapTemplates.status} = 'active' then ${roadmapTemplates.title} else null end`,
          status: input.action === "archive" ? "archived" : "active",
          isFavourite: input.action === "favourite" ? input.value : false,
          version: sql`${roadmapTemplates.version} + 1`,
          archivedAt: input.action === "archive" ? now : null,
          updatedAt: now,
        })
        .where(and(eq(roadmapTemplates.accountId, input.accountId), eq(roadmapTemplates.id, id))),
      auditStatement({
        accountId: input.accountId,
        action: input.action === "archive" ? "roadmap_template.archived" : "roadmap_template.favourite_changed",
        targetType: "roadmap_template",
        targetId: id,
        requestId: input.requestId,
        metadata: {
          fromVersion: version,
          toVersion: version + 1,
          ...(input.action === "favourite" ? { favourite: input.value } : {}),
        },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    await rethrowTemplateVersionConflict(input.accountId, id, version, "roadmap", error);
  }
  return { version: version + 1 };
}

async function requireTemplateVersion(
  accountId: string,
  id: string,
  expectedVersion: number,
  kind: "drill" | "roadmap",
): Promise<void> {
  const row =
    kind === "drill"
      ? (
          await getDb()
            .select({ version: drillTemplates.version, status: drillTemplates.status })
            .from(drillTemplates)
            .where(and(eq(drillTemplates.accountId, accountId), eq(drillTemplates.id, id)))
            .limit(1)
        )[0]
      : (
          await getDb()
            .select({ version: roadmapTemplates.version, status: roadmapTemplates.status })
            .from(roadmapTemplates)
            .where(and(eq(roadmapTemplates.accountId, accountId), eq(roadmapTemplates.id, id)))
            .limit(1)
        )[0];
  if (!row) throw notFound(`${kind}_template_not_found`, `${kind === "drill" ? "Drill" : "Roadmap"} template not found.`);
  if (row.status !== "active") throw conflict("template_archived", "Archived templates cannot be changed.");
  if (row.version !== expectedVersion) throw conflict("stale_template_version", "This template changed. Refresh before saving.");
}

async function rethrowTemplateVersionConflict(
  accountId: string,
  id: string,
  expectedVersion: number,
  kind: "drill" | "roadmap",
  error: unknown,
): Promise<never> {
  await requireTemplateVersion(accountId, id, expectedVersion, kind);
  throw error;
}

export function richPlanInvalidationStatements(
  context: RichPlanMutationContext,
  status: "draft" | "paused",
  reason: string,
  now: Date,
) {
  const db = getDb();
  return [
    db
      .update(developmentPlans)
      .set({
        revision: sql`${developmentPlans.revision} + 1`,
        status,
        approvedRevision: null,
        publishedRevision: null,
        coachApprovedAt: null,
        previewedAt: null,
        publishedAt: null,
        lastSharedAt: null,
        pausedAt:
          status === "paused"
            ? sql`coalesce(${developmentPlans.pausedAt}, ${now.getTime()})`
            : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(developmentPlans.accountId, context.accountId),
          eq(developmentPlans.id, context.planId),
          eq(developmentPlans.revision, context.expectedRevision),
        ),
      ),
    db
      .update(shareLinks)
      .set({
        status: "revoked",
        revokedAt: now,
        revokeReason: reason,
        updatedAt: now,
      })
      .where(
        and(
          eq(shareLinks.accountId, context.accountId),
          eq(shareLinks.planId, context.planId),
          eq(shareLinks.status, "active"),
        ),
      ),
  ] as const;
}

function accountAttachmentAffectedPlan(target: AccountMediaAttachmentTarget) {
  return target.kind === "profile"
    ? sql`${developmentPlans.status} <> 'archived'`
    : sql`exists (
        select 1
        from ${practiceAssignmentSnapshots}
        where ${practiceAssignmentSnapshots.accountId} = ${developmentPlans.accountId}
          and ${practiceAssignmentSnapshots.planId} = ${developmentPlans.id}
          and ${practiceAssignmentSnapshots.drillTemplateId} = ${target.id}
      ) and ${developmentPlans.status} <> 'archived'`;
}

function accountPlanInvalidationStatements(
  accountId: string,
  affectedPlan: ReturnType<typeof sql>,
  reason: string,
  now: Date,
) {
  const db = getDb();
  return [
    db
      .update(shareSessions)
      .set({ revokedAt: now, revokeReason: reason, updatedAt: now })
      .where(
        and(
          eq(shareSessions.accountId, accountId),
          sql`${shareSessions.revokedAt} is null`,
          sql`exists (
            select 1
            from ${shareLinks}
            join ${developmentPlans}
              on ${developmentPlans.accountId} = ${shareLinks.accountId}
             and ${developmentPlans.id} = ${shareLinks.planId}
            where ${shareLinks.accountId} = ${shareSessions.accountId}
              and ${shareLinks.id} = ${shareSessions.shareLinkId}
              and ${affectedPlan}
          )`,
        ),
      ),
    db
      .update(shareLinks)
      .set({ status: "revoked", revokedAt: now, revokeReason: reason, updatedAt: now })
      .where(
        and(
          eq(shareLinks.accountId, accountId),
          eq(shareLinks.status, "active"),
          sql`exists (
            select 1
            from ${developmentPlans}
            where ${developmentPlans.accountId} = ${shareLinks.accountId}
              and ${developmentPlans.id} = ${shareLinks.planId}
              and ${affectedPlan}
          )`,
        ),
      ),
    db
      .update(developmentPlans)
      .set({
        revision: sql`${developmentPlans.revision} + 1`,
        status: sql`case
          when ${developmentPlans.status} = 'paused' then 'paused'
          when ${developmentPlans.status} = 'completed' then 'completed'
          else 'draft'
        end`,
        approvedRevision: null,
        publishedRevision: null,
        coachApprovedAt: null,
        previewedAt: null,
        publishedAt: null,
        lastSharedAt: null,
        updatedAt: now,
      })
      .where(and(eq(developmentPlans.accountId, accountId), affectedPlan)),
  ] as const;
}

async function requireActiveAccount(accountId: string): Promise<void> {
  const [account] = await getDb()
    .select({ status: accounts.status })
    .from(accounts)
    .where(eq(accounts.id, opaqueId(accountId, "accountId")))
    .limit(1);
  if (!account) throw notFound("account_not_found", "Account not found.");
  if (account.status !== "active") {
    throw conflict("account_not_active", "The account must be active for this action.");
  }
}

async function requireRichPlan(context: RichPlanMutationContext) {
  opaqueId(context.accountId, "accountId");
  opaqueId(context.planId, "planId");
  if (!Number.isInteger(context.expectedRevision) || context.expectedRevision < 1) {
    throw invalid("expectedRevision", "expectedRevision must be a positive integer.");
  }
  const [plan] = await getDb()
    .select()
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, context.accountId),
        eq(developmentPlans.id, context.planId),
      ),
    )
    .limit(1);
  if (!plan) throw notFound("plan_not_found", "Plan not found.");
  if (plan.revision !== context.expectedRevision) {
    throw conflict(
      "stale_plan_revision",
      "This plan changed after the page loaded. Refresh before saving.",
    );
  }
  if (plan.status === "completed" || plan.status === "archived") {
    throw conflict("plan_not_editable", "Completed or archived plans cannot be changed.");
  }
  return plan;
}

async function rethrowRichPlanConflict(
  context: RichPlanMutationContext,
  error: unknown,
): Promise<never> {
  if (!(await consentGrantRequirementsCurrent(context.accountId, context.consentRequirements))) {
    throw conflict(
      "current_consent_required",
      "A current configured authorization is required for this action.",
    );
  }
  const [plan] = await getDb()
    .select({ revision: developmentPlans.revision })
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, context.accountId),
        eq(developmentPlans.id, context.planId),
      ),
    )
    .limit(1);
  if (!plan) throw notFound("plan_not_found", "Plan not found.");
  if (plan.revision !== context.expectedRevision) {
    throw conflict("stale_plan_revision", "This plan changed while the update was being saved.");
  }
  throw error;
}

async function rethrowDrillAssignmentSourceConflict(
  context: RichPlanMutationContext,
  drillTemplateId: string,
  expectedTemplateVersion: number,
  sourceAttachmentIds: readonly string[],
): Promise<void> {
  const [template] = await getDb()
    .select({ version: drillTemplates.version, status: drillTemplates.status })
    .from(drillTemplates)
    .where(
      and(
        eq(drillTemplates.accountId, context.accountId),
        eq(drillTemplates.id, drillTemplateId),
      ),
    )
    .limit(1);
  if (!template || template.status !== "active") {
    throw conflict(
      "drill_template_changed",
      "This drill template changed while the assignment was being saved. Refresh before assigning it.",
    );
  }
  if (template.version !== expectedTemplateVersion) {
    throw conflict(
      "stale_template_version",
      "This drill template changed while the assignment was being saved. Refresh before assigning it.",
    );
  }
  const activeSourceRows = await getDb()
    .select({ id: contentMediaAttachments.id })
    .from(contentMediaAttachments)
    .where(
      and(
        eq(contentMediaAttachments.accountId, context.accountId),
        eq(contentMediaAttachments.drillTemplateId, drillTemplateId),
        eq(contentMediaAttachments.targetType, "drill"),
        eq(contentMediaAttachments.status, "active"),
        inArray(contentMediaAttachments.attachmentRole, [
          "primary",
          "supporting",
          "demo",
          "poster",
          "source",
        ]),
        sql`${contentMediaAttachments.planId} is null`,
      ),
    );
  const selectedIds = [...sourceAttachmentIds].sort();
  const currentIds = activeSourceRows.map((row) => row.id).sort();
  if (
    currentIds.length !== selectedIds.length ||
    currentIds.some((id, index) => id !== selectedIds[index])
  ) {
    throw conflict(
      "drill_media_changed",
      "This drill's demo media changed while the assignment was being saved. Refresh before assigning it.",
    );
  }
}

async function requireOwnedPhase(context: RichPlanMutationContext, phaseId: string): Promise<void> {
  const [phase] = await getDb()
    .select({ id: planPhases.id })
    .from(planPhases)
    .where(
      and(
        eq(planPhases.accountId, context.accountId),
        eq(planPhases.planId, context.planId),
        eq(planPhases.id, phaseId),
      ),
    )
    .limit(1);
  if (!phase) throw notFound("phase_not_found", "Phase not found in this plan.");
}

async function requireOwnedLesson(context: RichPlanMutationContext, lessonId: string): Promise<void> {
  const [lesson] = await getDb()
    .select({ id: lessons.id })
    .from(lessons)
    .where(
      and(
        eq(lessons.accountId, context.accountId),
        eq(lessons.planId, context.planId),
        eq(lessons.id, lessonId),
      ),
    )
    .limit(1);
  if (!lesson) throw notFound("lesson_not_found", "Lesson not found in this plan.");
}

async function requireValidatedLaunchImport(
  context: RichPlanMutationContext,
  importId: string,
): Promise<{
  id: string;
  sourceMediaAssetId: string | null;
  columnHeaders: string[];
  columnMappings: Record<string, string | null>;
  validationReport: Record<string, unknown>;
  acceptedRows: string[][];
  acceptedSourceRowNumbers: number[];
  acceptedRowCount: number;
}> {
  const [record] = await getDb()
    .select({
      id: launchMonitorImports.id,
      sourceMediaAssetId: launchMonitorImports.sourceMediaAssetId,
      columnHeaders: launchMonitorImports.columnHeaders,
      columnMappings: launchMonitorImports.columnMappings,
      validationReport: launchMonitorImports.validationReport,
      acceptedRows: launchMonitorImports.acceptedRows,
      acceptedSourceRowNumbers: launchMonitorImports.acceptedSourceRowNumbers,
      acceptedRowCount: launchMonitorImports.acceptedRowCount,
    })
    .from(launchMonitorImports)
    .where(
      and(
        eq(launchMonitorImports.accountId, context.accountId),
        eq(launchMonitorImports.planId, context.planId),
        eq(launchMonitorImports.id, importId),
        eq(launchMonitorImports.status, "validated"),
      ),
    )
    .limit(1);
  if (!record) throw conflict("launch_import_not_ready", "Launch-monitor import is not ready to commit.");
  return record;
}

function launchImportCommitData(
  stagedImport: {
    columnHeaders: string[];
    columnMappings: Record<string, string | null>;
    validationReport: Record<string, unknown>;
    acceptedRows: string[][];
    acceptedSourceRowNumbers: number[];
    acceptedRowCount: number;
  },
  suppliedFingerprint: string,
): { summaryMetrics: LaunchMetricInput[]; shots: LaunchShotInput[] } {
  const persistedFingerprint = stagedImport.validationReport.acceptedRowsFingerprint;
  if (
    typeof persistedFingerprint !== "string" ||
    !/^launch-csv-v1-[0-9a-f]{8}$/.test(persistedFingerprint) ||
    suppliedFingerprint !== persistedFingerprint
  ) {
    throw conflict(
      "launch_import_review_mismatch",
      "The CSV mapping or reviewed rows no longer match the validated import.",
    );
  }
  if (
    stagedImport.acceptedRows.length !== stagedImport.acceptedRowCount ||
    stagedImport.acceptedSourceRowNumbers.length !== stagedImport.acceptedRowCount
  ) {
    throw conflict(
      "launch_import_row_count_mismatch",
      "The persisted accepted rows no longer match the validated import count.",
    );
  }
  const rawUnits = stagedImport.validationReport.metricUnits;
  if (!rawUnits || typeof rawUnits !== "object" || Array.isArray(rawUnits)) {
    throw conflict("launch_import_units_missing", "The validated import has no confirmed unit mapping.");
  }
  const units = Object.fromEntries(
    Object.entries(rawUnits).map(([header, unit]) => {
      if (typeof unit !== "string" || !unit.trim()) {
        throw conflict("launch_import_units_missing", "Every imported measurement requires a confirmed unit.");
      }
      return [header, unit.trim()];
    }),
  );
  const expected = Object.entries(stagedImport.columnMappings).flatMap(([sourceColumn, canonicalKey]) => {
    if (!canonicalKey) return [];
    const unit = units[sourceColumn];
    if (!unit) {
      throw conflict("launch_import_units_missing", "Every imported measurement requires a confirmed unit.");
    }
    return [{ sourceColumn, canonicalKey, unit }];
  });
  if (!expected.length) {
    throw conflict("launch_import_mapping_missing", "The validated import has no measurement mapping.");
  }
  const calculatedFingerprint = launchCsvStageFingerprint({
    headers: stagedImport.columnHeaders,
    mappings: stagedImport.columnMappings,
    units,
    acceptedRows: stagedImport.acceptedRows,
  });
  if (calculatedFingerprint !== persistedFingerprint) {
    throw conflict(
      "launch_import_review_mismatch",
      "The persisted reviewed rows no longer match their locked mapping and units.",
    );
  }
  const review = {
    headers: stagedImport.columnHeaders,
    mappings: stagedImport.columnMappings,
    units,
  };
  let summaryMetrics: LaunchMetricInput[];
  let shots: LaunchShotInput[];
  try {
    summaryMetrics = summarizeLaunchCsvRows(stagedImport.acceptedRows, review);
    shots = stagedImport.acceptedRows.map((row, index) => ({
      sourceRowNumber: stagedImport.acceptedSourceRowNumbers[index]!,
      label: `CSV row ${stagedImport.acceptedSourceRowNumbers[index]!}`,
      capturedAt: null,
      metrics: launchMetricsForRow(row, review),
    }));
  } catch {
    throw conflict(
      "launch_import_review_invalid",
      "The persisted reviewed rows can no longer produce the validated measurement set.",
    );
  }
  if (summaryMetrics.length !== expected.length) {
    throw conflict("launch_import_mapping_missing", "The validated import has no usable measurement mapping.");
  }
  return { summaryMetrics, shots };
}

async function requireCommittedLaunchSession(
  context: RichPlanMutationContext,
  sessionId: string,
): Promise<void> {
  const [session] = await getDb()
    .select({ id: launchMonitorSessions.id })
    .from(launchMonitorSessions)
    .where(
      and(
        eq(launchMonitorSessions.accountId, context.accountId),
        eq(launchMonitorSessions.planId, context.planId),
        eq(launchMonitorSessions.id, sessionId),
        eq(launchMonitorSessions.status, "committed"),
      ),
    )
    .limit(1);
  if (!session) throw notFound("launch_session_not_found", "Committed launch-monitor session not found.");
}

async function requireReadyMedia(
  accountId: string,
  mediaAssetId: string,
  mediaKind?: "image" | "video" | "audio" | "document",
): Promise<void> {
  const conditions = [
    eq(mediaAssets.accountId, accountId),
    eq(mediaAssets.id, mediaAssetId),
    eq(mediaAssets.status, "ready"),
  ];
  if (mediaKind) conditions.push(eq(mediaAssets.mediaKind, mediaKind));
  const [asset] = await getDb()
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(...conditions))
    .limit(1);
  if (!asset) throw notFound("media_asset_not_ready", "Ready media asset not found.");
}

async function requirePlanMediaTarget(
  context: RichPlanMutationContext,
  target: PlanMediaAttachmentTarget,
): Promise<void> {
  const id = opaqueId(target.id, "target.id");
  let found: { id: string } | undefined;
  if (target.kind === "assessment") {
    [found] = await getDb().select({ id: assessments.id }).from(assessments).where(and(eq(assessments.accountId, context.accountId), eq(assessments.planId, context.planId), eq(assessments.id, id))).limit(1);
  } else if (target.kind === "lesson") {
    [found] = await getDb().select({ id: lessons.id }).from(lessons).where(and(eq(lessons.accountId, context.accountId), eq(lessons.planId, context.planId), eq(lessons.id, id))).limit(1);
  } else if (target.kind === "practice") {
    [found] = await getDb().select({ id: practiceItems.id }).from(practiceItems).where(and(eq(practiceItems.accountId, context.accountId), eq(practiceItems.planId, context.planId), eq(practiceItems.id, id))).limit(1);
  } else if (target.kind === "evidence") {
    [found] = await getDb().select({ id: evidenceItems.id }).from(evidenceItems).where(and(eq(evidenceItems.accountId, context.accountId), eq(evidenceItems.planId, context.planId), eq(evidenceItems.id, id))).limit(1);
  } else {
    [found] = await getDb().select({ id: phaseReviews.id }).from(phaseReviews).where(and(eq(phaseReviews.accountId, context.accountId), eq(phaseReviews.planId, context.planId), eq(phaseReviews.id, id))).limit(1);
  }
  if (!found) throw notFound("media_target_not_found", "Media target not found in this plan.");
}

function attachmentTargetColumns(target: PlanMediaAttachmentTarget) {
  return {
    assessmentId: target.kind === "assessment" ? target.id : null,
    lessonId: target.kind === "lesson" ? target.id : null,
    practiceItemId: target.kind === "practice" ? target.id : null,
    evidenceItemId: target.kind === "evidence" ? target.id : null,
    phaseReviewId: target.kind === "phase_review" ? target.id : null,
  };
}

function normalizedDrillDraft(input: DrillTemplateDraft) {
  return {
    title: requiredText(input.title, "title", 160),
    purpose: requiredText(input.purpose, "purpose", 2_000),
    whenItFits: requiredText(input.whenItFits, "whenItFits", 2_000),
    equipment: normalizedStringList(input.equipment, "equipment", MAX_EQUIPMENT_ITEMS, 160),
    setup: requiredText(input.setup, "setup", 3_000),
    steps: normalizedStringList(input.steps, "steps", MAX_TEMPLATE_STEPS, 1_000),
    dosageOrCadence: requiredText(input.dosageOrCadence, "dosageOrCadence", 1_000),
    feelOrCue: optionalText(input.feelOrCue, "feelOrCue", 1_000),
    successCheck: requiredText(input.successCheck, "successCheck", 2_000),
    commonMiss: optionalText(input.commonMiss, "commonMiss", 2_000),
    stopOrAskRule: requiredText(input.stopOrAskRule, "stopOrAskRule", 2_000),
    constraintOrAdaptation: optionalText(input.constraintOrAdaptation, "constraintOrAdaptation", 2_000),
    progression: optionalText(input.progression, "progression", 2_000),
    regression: optionalText(input.regression, "regression", 2_000),
  };
}

function normalizedRoadmapTemplateContent(input: RoadmapTemplateContent) {
  if (!input || typeof input !== "object" || !Array.isArray(input.phases)) {
    throw invalid("content", "Roadmap template content is invalid.");
  }
  if (input.phases.length === 0 || input.phases.length > 12) {
    throw invalid("content.phases", "A roadmap template requires between 1 and 12 phases.");
  }
  return {
    goalPrompt: optionalText(input.goalPrompt, "content.goalPrompt", 1_000),
    assessmentPrompt: optionalText(input.assessmentPrompt, "content.assessmentPrompt", 1_000),
    priorityPrompt: optionalText(input.priorityPrompt, "content.priorityPrompt", 1_000),
    phases: input.phases.map((phase, index) => ({
      title: requiredText(phase.title, `content.phases[${index}].title`, 160),
      purpose: requiredText(phase.purpose, `content.phases[${index}].purpose`, 2_000),
      rationale: optionalText(phase.rationale, `content.phases[${index}].rationale`, 2_000),
      progressSignals: normalizedStringList(
        phase.progressSignals,
        `content.phases[${index}].progressSignals`,
        12,
        500,
      ),
    })),
  };
}

function normalizedMediaAsset(asset: MediaAssetDraft, policy: MediaUploadPolicy) {
  if (!new Set(["image", "video", "audio", "document"]).has(asset.mediaKind)) {
    throw invalid("mediaKind", "mediaKind is invalid.");
  }
  const orientation = asset.orientation ?? "unknown";
  if (!new Set(["landscape", "portrait", "square", "unknown"]).has(orientation)) {
    throw invalid("orientation", "orientation is invalid.");
  }
  if (
    !Array.isArray(policy.allowedMimeTypes) ||
    policy.allowedMimeTypes.some((value) => typeof value !== "string" || !value.trim())
  ) {
    throw invalid("policy.allowedMimeTypes", "Media policy MIME types are invalid.");
  }
  if (!policy.allowedMimeTypes.includes(asset.mimeType)) {
    throw new RequestError(415, "media_type_unsupported", "This media format is not supported.");
  }
  if (!Number.isSafeInteger(policy.maximumBytes) || policy.maximumBytes < 1) {
    throw invalid("policy.maximumBytes", "Media policy maximumBytes is invalid.");
  }
  const byteSize = boundedInteger(asset.byteSize, "byteSize", 1, policy.maximumBytes);
  if (asset.capturedAt && !validDate(asset.capturedAt)) {
    throw invalid("capturedAt", "capturedAt must be a valid date.");
  }
  return {
    mediaKind: asset.mediaKind,
    mimeType: requiredText(asset.mimeType, "mimeType", 160).toLowerCase(),
    originalFilename: optionalText(asset.originalFilename, "originalFilename", 255),
    byteSize,
    altText: requiredText(asset.altText, "altText", 500),
    caption: optionalText(asset.caption, "caption", 1_500),
    transcript: optionalText(asset.transcript, "transcript", 20_000),
    capturedAt: asset.capturedAt ?? null,
    orientation,
    viewLabel: optionalText(asset.viewLabel, "viewLabel", 300),
    coachContext: optionalText(asset.coachContext, "coachContext", 2_000),
  };
}

type NormalizedLaunchMetric = ReturnType<typeof normalizedLaunchMetric>;

function normalizedLaunchMetrics(
  metrics: readonly LaunchMetricInput[],
  field: string,
  maximum: number,
): NormalizedLaunchMetric[] {
  if (!Array.isArray(metrics) || metrics.length > maximum) {
    throw invalid(field, `${field} can contain at most ${maximum} metrics.`);
  }
  const normalized = metrics.map((metric, index) => normalizedLaunchMetric(metric, `${field}[${index}]`));
  const keys = normalized.map((metric) => metric.canonicalKey);
  if (new Set(keys).size !== keys.length) {
    throw invalid(field, "Metric canonical keys must be unique within each shot or summary.");
  }
  return normalized;
}

function normalizedLaunchMetric(metric: LaunchMetricInput, field: string) {
  const canonicalKey = requiredText(metric.canonicalKey, `${field}.canonicalKey`, 80).toLowerCase();
  if (!/^[a-z0-9_]+$/.test(canonicalKey)) {
    throw invalid(`${field}.canonicalKey`, "Metric keys may contain lowercase letters, numbers, and underscores only.");
  }
  if (!Number.isFinite(metric.numericValue)) {
    throw invalid(`${field}.numericValue`, "Metric values must be finite numbers.");
  }
  return {
    canonicalKey,
    originalName: requiredText(metric.originalName, `${field}.originalName`, 160),
    displayName: requiredText(metric.displayName, `${field}.displayName`, 160),
    numericValue: metric.numericValue,
    unit: requiredText(metric.unit, `${field}.unit`, 40),
    sourceColumn: optionalText(metric.sourceColumn, `${field}.sourceColumn`, 160),
    direction: metric.direction ?? "unknown",
    golferFacing: Boolean(metric.golferFacing),
  };
}

type LaunchMetricDefinitionInput = Readonly<{
  canonicalKey: string;
  displayName: string;
  direction: NormalizedLaunchMetric["direction"];
}>;

function normalizedLaunchMetricDefinitions(
  metrics: readonly NormalizedLaunchMetric[],
): LaunchMetricDefinitionInput[] {
  const unique = new Map<string, NormalizedLaunchMetric>();
  for (const metric of metrics) {
    const existing = unique.get(metric.canonicalKey);
    if (
      existing &&
      (existing.displayName !== metric.displayName || existing.direction !== metric.direction)
    ) {
      throw invalid(
        "metrics",
        `Metric ${metric.canonicalKey} has conflicting display metadata in this session.`,
      );
    }
    unique.set(metric.canonicalKey, metric);
  }
  if (unique.size > MAX_SUMMARY_METRICS) {
    throw invalid("metrics", `A session can use at most ${MAX_SUMMARY_METRICS} canonical metrics.`);
  }
  return [...unique.values()].map(({ canonicalKey, displayName, direction }) => ({
    canonicalKey,
    displayName,
    direction,
  }));
}

function launchMetricDefinitionStatements(
  accountId: string,
  definitions: readonly LaunchMetricDefinitionInput[],
  now: Date,
) {
  const db = getDb();
  const inserts = chunksOf(definitions, 10).map((chunk) =>
    db
      .insert(launchMonitorMetricDefinitions)
      .values(chunk.map((definition) => ({
        id: newId(),
        accountId,
        canonicalKey: definition.canonicalKey,
        displayName: definition.displayName,
        direction: definition.direction,
        createdAt: now,
        updatedAt: now,
      })))
      .onConflictDoNothing(),
  );
  const metadataGuards = definitions.map((definition) =>
    db
      .update(launchMonitorMetricDefinitions)
      .set({
        displayName: sql<string>`case
          when ${launchMonitorMetricDefinitions.displayName} = ${definition.displayName}
            and ${launchMonitorMetricDefinitions.direction} = ${definition.direction}
          then ${launchMonitorMetricDefinitions.displayName}
          else null
        end`,
      })
      .where(
        and(
          eq(launchMonitorMetricDefinitions.accountId, accountId),
          eq(launchMonitorMetricDefinitions.canonicalKey, definition.canonicalKey),
        ),
      ),
  );
  return [...inserts, ...metadataGuards];
}

async function rethrowLaunchSessionCommitConflict(
  context: RichPlanMutationContext,
  definitions: readonly LaunchMetricDefinitionInput[],
  error: unknown,
): Promise<never> {
  if (!(await consentGrantRequirementsCurrent(context.accountId, context.consentRequirements))) {
    throw conflict(
      "current_consent_required",
      "A current configured authorization is required for this action.",
    );
  }
  const db = getDb();
  const [plan] = await db
    .select({ revision: developmentPlans.revision })
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, context.accountId),
        eq(developmentPlans.id, context.planId),
      ),
    )
    .limit(1);
  if (!plan) throw notFound("plan_not_found", "Plan not found.");
  if (plan.revision !== context.expectedRevision) {
    throw conflict("stale_plan_revision", "This plan changed while the update was being saved.");
  }
  const rows = await db
    .select({
      canonicalKey: launchMonitorMetricDefinitions.canonicalKey,
      displayName: launchMonitorMetricDefinitions.displayName,
      direction: launchMonitorMetricDefinitions.direction,
    })
    .from(launchMonitorMetricDefinitions)
    .where(
      and(
        eq(launchMonitorMetricDefinitions.accountId, context.accountId),
        inArray(
          launchMonitorMetricDefinitions.canonicalKey,
          definitions.map(({ canonicalKey }) => canonicalKey),
        ),
      ),
    );
  const rowsByKey = new Map(rows.map((row) => [row.canonicalKey, row]));
  for (const definition of definitions) {
    const persisted = rowsByKey.get(definition.canonicalKey);
    if (
      persisted &&
      (persisted.displayName !== definition.displayName ||
        persisted.direction !== definition.direction)
    ) {
      throw conflict(
        "metric_definition_conflict",
        `Metric ${definition.canonicalKey} conflicts with the account's canonical definition.`,
      );
    }
  }
  throw error;
}

function launchMetricDefinitionReference(accountId: string, canonicalKey: string) {
  return sql<string>`(
    select ${launchMonitorMetricDefinitions.id}
    from ${launchMonitorMetricDefinitions}
    where ${launchMonitorMetricDefinitions.accountId} = ${accountId}
      and ${launchMonitorMetricDefinitions.canonicalKey} = ${canonicalKey}
    limit 1
  )`;
}

/* Definitions and their metadata guards share the session's atomic batch. */
function launchMetricRow(input: {
  accountId: string;
  sessionId: string;
  shotId: string | null;
  metric: NormalizedLaunchMetric;
  isSummary: boolean;
  sortOrder: number;
  createdAt: Date;
}) {
  return {
    id: newId(),
    accountId: input.accountId,
    sessionId: input.sessionId,
    shotId: input.shotId,
    metricDefinitionId: launchMetricDefinitionReference(
      input.accountId,
      input.metric.canonicalKey,
    ),
    originalName: input.metric.originalName,
    displayName: input.metric.displayName,
    numericValue: input.metric.numericValue,
    unit: input.metric.unit,
    sourceColumn: input.metric.sourceColumn,
    isSummary: input.isSummary,
    isGolferFacing: input.metric.golferFacing,
    sortOrder: input.sortOrder,
    createdAt: input.createdAt,
  };
}

async function replayPracticeCheckIn(input: {
  accountId: string;
  shareSessionId: string;
  receiptHash: string;
  inputFingerprint: string;
}): Promise<{ checkIn: { id: string; occurredAt: number }; replayed: true } | null> {
  const [row] = await getDb()
    .select({
      id: practiceCheckIns.id,
      inputFingerprint: practiceCheckIns.inputFingerprint,
      occurredAt: practiceCheckIns.occurredAt,
    })
    .from(practiceCheckIns)
    .where(
      and(
        eq(practiceCheckIns.accountId, input.accountId),
        eq(practiceCheckIns.shareSessionId, input.shareSessionId),
        eq(practiceCheckIns.idempotencyKeyHash, input.receiptHash),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.inputFingerprint !== input.inputFingerprint) {
    throw conflict(
      "idempotency_key_reused",
      "This idempotency key was already used with different check-in data.",
    );
  }
  return {
    checkIn: { id: row.id, occurredAt: toEpochMs(row.occurredAt) },
    replayed: true,
  };
}

function timelineRow(
  kind: RichTimelineItem["kind"],
  row: { id: string; title: string; summary: string | null; status: string; occurredAt: Date | number },
): RichTimelineItem {
  return {
    id: row.id,
    kind,
    occurredAt: toEpochMs(row.occurredAt),
    title: row.title,
    summary: row.summary,
    status: row.status,
  };
}

function richPlanAuditStatement(
  context: RichPlanMutationContext,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
    occurredAt?: Date;
  },
) {
  return auditStatement({ accountId: context.accountId, requestId: context.requestId, ...input });
}

function auditStatement(input: {
  accountId: string;
  action: string;
  targetType: string;
  targetId: string;
  requestId?: string | null;
  metadata: Record<string, unknown>;
  occurredAt?: Date;
}) {
  return getDb().insert(auditEvents).values({
    id: newId(),
    accountId: input.accountId,
    actorType: "account",
    actorAccountId: input.accountId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    outcome: "success",
    requestId: input.requestId ?? null,
    metadata: input.metadata,
    occurredAt: input.occurredAt,
  });
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") throw invalid(field, `${field} is required.`);
  const normalized = value.trim();
  if (!normalized) throw invalid(field, `${field} is required.`);
  if (normalized.length > maximum) throw invalid(field, `${field} is too long.`);
  return normalized;
}

function optionalText(
  value: unknown,
  field: string,
  maximum: number,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, field, maximum);
}

function optionalCode(value: unknown, field: string): string | null {
  const normalized = optionalText(value, field, 120);
  if (normalized && !/^[a-z0-9_:-]+$/.test(normalized)) {
    throw invalid(field, `${field} may contain lowercase letters, numbers, underscores, colons, and hyphens.`);
  }
  return normalized;
}

function opaqueId(value: unknown, field: string): string {
  const id = requiredText(value, field, 200);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
    throw invalid(field, `${field} is invalid.`);
  }
  return id;
}

function normalizedStringList(
  value: readonly string[],
  field: string,
  maximumItems: number,
  maximumItemLength: number,
  requireUnique = false,
): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw invalid(field, `${field} can contain at most ${maximumItems} items.`);
  }
  const result = value.map((item, index) => requiredText(item, `${field}[${index}]`, maximumItemLength));
  if (requireUnique && new Set(result.map((item) => item.toLowerCase())).size !== result.length) {
    throw invalid(field, `${field} cannot contain duplicates.`);
  }
  return result;
}

function normalizedColumnMappings(
  input: Readonly<Record<string, string | null>>,
  headers: readonly string[],
): Record<string, string | null> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalid("columnMappings", "columnMappings must be an object.");
  }
  const headerSet = new Set(headers);
  const result: Record<string, string | null> = {};
  for (const [header, mapped] of Object.entries(input)) {
    if (!headerSet.has(header)) throw invalid("columnMappings", "Every mapping key must match a column header.");
    if (mapped === null || mapped === "") {
      result[header] = null;
      continue;
    }
    const canonical = requiredText(mapped, `columnMappings.${header}`, 80).toLowerCase();
    if (!/^[a-z0-9_]+$/.test(canonical)) {
      throw invalid("columnMappings", "Mapped metric keys may contain lowercase letters, numbers, and underscores only.");
    }
    result[header] = canonical;
  }
  return result;
}

function normalizedCsvRows(
  value: readonly (readonly string[])[],
  headers: readonly string[],
  field: string,
  maximumRows: number,
): string[][] {
  if (!Array.isArray(value) || value.length > maximumRows) {
    throw invalid(field, `${field} can contain at most ${maximumRows} rows.`);
  }
  const rows = value.map((rawRow, rowIndex) => {
    if (!Array.isArray(rawRow) || rawRow.length !== headers.length) {
      throw invalid(field, `${field}[${rowIndex}] must contain exactly ${headers.length} cells.`);
    }
    return rawRow.map((rawCell, columnIndex) => {
      if (typeof rawCell !== "string") {
        throw invalid(field, `${field}[${rowIndex}][${columnIndex}] must be text.`);
      }
      const cell = rawCell.trim();
      if (cell.length > 160) {
        throw invalid(field, `${field}[${rowIndex}][${columnIndex}] is too long.`);
      }
      return cell;
    });
  });
  if (new TextEncoder().encode(JSON.stringify(rows)).byteLength > MAX_PERSISTED_CSV_BYTES) {
    throw invalid(field, `${field} is too large to retain as a resumable review.`);
  }
  return rows;
}

function normalizedCsvSourceRows(
  value: readonly number[],
  field: string,
  maximumRows: number,
): number[] {
  if (!Array.isArray(value) || value.length > maximumRows) {
    throw invalid(field, `${field} can contain at most ${maximumRows} row numbers.`);
  }
  const rows = value.map((row, index) =>
    boundedInteger(row, `${field}[${index}]`, 2, MAX_IMPORT_ROWS + 1),
  );
  if (new Set(rows).size !== rows.length) {
    throw invalid(field, `${field} cannot contain duplicates.`);
  }
  return rows;
}

function normalizedRejectedCsvRows(
  value: readonly Readonly<{ row: number; reason: string }>[],
  field: string,
  maximumRows: number,
): Array<{ row: number; reason: string }> {
  if (!Array.isArray(value) || value.length > maximumRows) {
    throw invalid(field, `${field} can contain at most ${maximumRows} rejected rows.`);
  }
  const rows = value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw invalid(field, `${field}[${index}] must be an object.`);
    }
    const keys = Object.keys(raw);
    if (keys.length !== 2 || !keys.includes("row") || !keys.includes("reason")) {
      throw invalid(field, `${field}[${index}] may contain only row and reason.`);
    }
    return {
      row: boundedInteger(raw.row, `${field}[${index}].row`, 2, MAX_IMPORT_ROWS + 1),
      reason: requiredText(raw.reason, `${field}[${index}].reason`, 500),
    };
  });
  if (new Set(rows.map(({ row }) => row)).size !== rows.length) {
    throw invalid(field, `${field} cannot contain duplicate row numbers.`);
  }
  return rows;
}

function assertPersistedLaunchCsvFingerprint(
  headers: readonly string[],
  columnMappings: Readonly<Record<string, string | null>>,
  validationReport: Readonly<Record<string, unknown>>,
  acceptedRows: readonly (readonly string[])[],
): void {
  const rawUnits = validationReport.metricUnits;
  if (!rawUnits || typeof rawUnits !== "object" || Array.isArray(rawUnits)) {
    throw invalid("validationReport.metricUnits", "The reviewed CSV requires confirmed units.");
  }
  const units = Object.fromEntries(
    Object.entries(rawUnits).map(([header, unit]) => [
      header,
      requiredText(unit, `validationReport.metricUnits.${header}`, 40),
    ]),
  );
  const expected = launchCsvStageFingerprint({
    headers,
    mappings: columnMappings,
    units,
    acceptedRows,
  });
  if (validationReport.acceptedRowsFingerprint !== expected) {
    throw invalid(
      "validationReport.acceptedRowsFingerprint",
      "The accepted-row fingerprint does not match the persisted mapping, units, and rows.",
    );
  }
}

function assertValidatedLaunchImportReview(
  columnMappings: Readonly<Record<string, string | null>>,
  validationReport: Readonly<Record<string, unknown>>,
): void {
  if (validationReport.version !== "launch-csv-review-v1") {
    throw invalid(
      "validationReport.version",
      "A validated import requires a launch-csv-review-v1 review.",
    );
  }
  if (
    typeof validationReport.acceptedRowsFingerprint !== "string" ||
    !/^launch-csv-v1-[0-9a-f]{8}$/.test(validationReport.acceptedRowsFingerprint)
  ) {
    throw invalid(
      "validationReport.acceptedRowsFingerprint",
      "A validated import requires a fingerprint for the reviewed accepted rows.",
    );
  }

  const mappedColumns = Object.entries(columnMappings).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  if (!mappedColumns.length) {
    throw invalid("columnMappings", "A validated import requires at least one mapped measurement.");
  }
  const canonicalKeys = mappedColumns.map(([, canonicalKey]) => canonicalKey);
  if (new Set(canonicalKeys).size !== canonicalKeys.length) {
    throw invalid("columnMappings", "Each imported column must map to a different measurement.");
  }

  const rawUnits = validationReport.metricUnits;
  if (!rawUnits || typeof rawUnits !== "object" || Array.isArray(rawUnits)) {
    throw invalid(
      "validationReport.metricUnits",
      "A validated import requires an explicit unit for every mapped measurement.",
    );
  }
  const units = rawUnits as Record<string, unknown>;
  const mappedHeaders = mappedColumns.map(([header]) => header);
  const unitHeaders = Object.keys(units);
  if (
    unitHeaders.length !== mappedHeaders.length ||
    unitHeaders.some((header) => !mappedHeaders.includes(header))
  ) {
    throw invalid(
      "validationReport.metricUnits",
      "Confirmed units must exactly match the mapped CSV columns.",
    );
  }
  for (const header of mappedHeaders) {
    requiredText(units[header], `validationReport.metricUnits.${header}`, 40);
  }

  const confirmedColumns = validationReport.confirmedUnitColumns;
  if (!Array.isArray(confirmedColumns)) {
    throw invalid(
      "validationReport.confirmedUnitColumns",
      "A validated import requires explicit unit confirmation for every mapped measurement.",
    );
  }
  const normalizedConfirmedColumns = confirmedColumns.map((header, index) =>
    requiredText(header, `validationReport.confirmedUnitColumns[${index}]`, 160),
  );
  if (
    new Set(normalizedConfirmedColumns).size !== mappedHeaders.length ||
    normalizedConfirmedColumns.some((header) => !mappedHeaders.includes(header))
  ) {
    throw invalid(
      "validationReport.confirmedUnitColumns",
      "Unit confirmations must exactly match the mapped CSV columns.",
    );
  }
}

function normalizedJsonObject(
  value: Readonly<Record<string, unknown>>,
  field: string,
  maximumBytes: number,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(field, `${field} must be an object.`);
  }
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    throw invalid(field, `${field} must be JSON serializable.`);
  }
  if (new TextEncoder().encode(json).byteLength > maximumBytes) {
    throw invalid(field, `${field} is too large.`);
  }
  return JSON.parse(json) as Record<string, unknown>;
}

function assertLaunchImportReplayFingerprint(
  persistedFingerprint: string | null,
  requestFingerprint: string,
): void {
  if (persistedFingerprint !== requestFingerprint) {
    throw conflict(
      "idempotency_key_reused",
      "This idempotency key was already used for different launch-import review data.",
    );
  }
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

function stableJsonValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, stableJsonValue(record[key])]),
    );
  }
  throw new Error("Launch-import fingerprint input is not canonical JSON data.");
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw invalid(field, `${field} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value as number;
}

function nonNegativeInteger(value: unknown, field: string): number {
  return boundedInteger(value, field, 0, Number.MAX_SAFE_INTEGER);
}

function positiveOptionalInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return boundedInteger(value, field, 1, Number.MAX_SAFE_INTEGER);
}

function nonNegativeOptionalInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return boundedInteger(value, field, 0, Number.MAX_SAFE_INTEGER);
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function toEpochMs(value: Date | number): number {
  return value instanceof Date ? value.getTime() : Number(value);
}

function nullableEpochMs(value: Date | number | null | undefined): number | null {
  return value === null || value === undefined ? null : toEpochMs(value);
}

function groupBy<T, K extends string>(values: readonly T[], key: (value: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    const group = groups.get(groupKey);
    if (group) group.push(value);
    else groups.set(groupKey, [value]);
  }
  return groups;
}

function replacementLineageView(
  row: typeof practiceAssignmentReplacements.$inferSelect | undefined,
  direction: "previous" | "next",
) {
  if (!row) return null;
  return {
    practiceItemId:
      direction === "previous"
        ? row.replacedPracticeItemId
        : row.replacementPracticeItemId,
    replacedFromStatus: row.replacedStatus,
    replacementPlanRevision: row.replacementPlanRevision,
    replacedAt: toEpochMs(row.createdAt),
  };
}

function chunksOf<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function rowsForIdChunks<T>(
  ids: readonly string[],
  query: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const rows = await Promise.all(chunksOf(ids, 75).map((chunk) => query(chunk)));
  return rows.flat();
}

function mediaAttachmentTargetCondition(kind: PlanMediaAttachmentTarget["kind"], id: string) {
  if (kind === "assessment") return eq(contentMediaAttachments.assessmentId, id);
  if (kind === "lesson") return eq(contentMediaAttachments.lessonId, id);
  if (kind === "practice") return eq(contentMediaAttachments.practiceItemId, id);
  if (kind === "evidence") return eq(contentMediaAttachments.evidenceItemId, id);
  return eq(contentMediaAttachments.phaseReviewId, id);
}

function launchMetricView(metric: typeof launchMonitorMetrics.$inferSelect) {
  return {
    id: metric.id,
    metricDefinitionId: metric.metricDefinitionId,
    originalName: metric.originalName,
    displayName: metric.displayName,
    numericValue: metric.numericValue,
    unit: metric.unit,
    sourceColumn: metric.sourceColumn,
    isSummary: metric.isSummary,
    isGolferFacing: metric.isGolferFacing,
    sortOrder: metric.sortOrder,
  };
}

function invalid(field: string, message: string): RequestError {
  return new RequestError(400, `invalid_${field.replace(/[^A-Za-z0-9]+/g, "_").toLowerCase()}`, message);
}

function notFound(code: string, message: string): RequestError {
  return new RequestError(404, code, message);
}

function conflict(code: string, message: string): RequestError {
  return new RequestError(409, code, message);
}
