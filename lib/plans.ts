import { and, asc, count, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assessments,
  auditEvents,
  coachingPackages,
  contentMediaAttachments,
  developmentPlans,
  evidenceItems,
  golferGoals,
  golferPlanResponses,
  golfers,
  instructorProfiles,
  launchMonitorComparisonGroups,
  launchMonitorComparisonMetrics,
  launchMonitorMetrics,
  launchMonitorSessions,
  lessons,
  mediaAssetDetails,
  mediaAssets,
  milestones,
  phaseReviews,
  phaseReviewSources,
  planPhases,
  planPriorities,
  practiceAssignmentSnapshots,
  practiceCheckIns,
  practiceItems,
  shareLinks,
  shareSessions,
} from "@/db/schema";
import type { PlanViewModel } from "@/components/plan/types";
import { RequestError } from "./http";
import { assertPublicationReady } from "./publication-readiness";
import {
  configuredRoadmapAccessRequirements,
  requireGolferRecordProcessingConsent,
  requireRoadmapSharingConsent,
} from "./consent-enforcement";
import {
  currentConsentGrantsCondition,
  consentGrantRequirementsCurrent,
  consentGrantTransactionGuard,
  type ConsentGrantRequirement,
} from "./consent-repository";
import { pauseAtSyntheticConcurrencyBarrier } from "./synthetic-concurrency-barrier";
import {
  createShareSessionToken,
  createShareToken,
  hashShareSessionContext,
  hashShareSessionToken,
  hashToken,
  newId,
  shareSessionContextsEqual,
} from "./tokens";

const DEFAULT_SHARE_DAYS = 30;
export const SHARE_SESSION_MAX_SECONDS = 12 * 60 * 60;

// A plan is intentionally a small, current-priority-led view rather than an
// unbounded activity archive. The extra phase row is read only to fail closed
// when the three-or-four-phase roadmap invariant has been breached.
const PLAN_PHASE_CAP = 4;
const PLAN_LESSON_SNAPSHOT_CAP = 12;
const PLAN_PRACTICE_SNAPSHOT_CAP = 8;
const PLAN_EVIDENCE_SNAPSHOT_CAP = 20;
const PLAN_MEDIA_SNAPSHOT_CAP = 24;
const PLAN_COMPARISON_SNAPSHOT_CAP = 8;
const PLAN_TIMELINE_SNAPSHOT_CAP = 60;

export type PlanShareSummary = {
  id: string;
  status: "active" | "revoked" | "expired";
  planRevision: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  lastAccessedAt: number | null;
  accessCount: number;
};

export type PlanSharingState = {
  publishedRevision: number | null;
  lastSharedAt: number | null;
  shares: PlanShareSummary[];
};

export type AccountActiveShareControl = {
  id: string;
  planRevision: number;
  status: "active";
  createdAt: number;
  expiresAt: number | null;
  lastAccessedAt: number | null;
  accessCount: number;
  activeSessionCount: number;
};

export type ShareMutationIntentReceipt =
  | Readonly<{
      operation: "plan.publish_and_share";
      expiresInDays: number;
    }>
  | Readonly<{
      operation: "share.replace_inaccessible_link";
      sourceShareId: string;
    }>
  | Readonly<{
      operation: "share.reissue_same_revision";
      sourceShareId: string;
      sourceStatus: "revoked" | "expired";
      sourceUpdatedAt: number;
      expiresInDays: number;
    }>;

export type ShareMutationReceipt = {
  intent: ShareMutationIntentReceipt;
  shareId: string;
  rawToken: string;
  planId: string;
  planRevision: number;
  status: "active";
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  lastAccessedAt: null;
  accessCount: 0;
};

export type GolferResponseType =
  | "ask_question"
  | "wait"
  | "decline"
  | "request_reassessment"
  | "independent_practice"
  | "external_action_opened";

export type PlanResponseSummary = {
  id: string;
  responseType: GolferResponseType;
  occurredAt: number;
};

export async function listPlanShares(
  accountId: string,
  planId: string,
): Promise<PlanShareSummary[]> {
  return (await getPlanSharingState(accountId, planId)).shares;
}

export async function getPlanSharingState(
  accountId: string,
  planId: string,
): Promise<PlanSharingState> {
  await requireGolferRecordProcessingConsent(accountId);
  const db = getDb();
  const [[plan], rows] = await Promise.all([
    db
      .select({
        publishedRevision: developmentPlans.publishedRevision,
        lastSharedAt: developmentPlans.lastSharedAt,
      })
      .from(developmentPlans)
      .where(
        and(
          eq(developmentPlans.accountId, accountId),
          eq(developmentPlans.id, planId),
        ),
      )
      .limit(1),
    db
      .select({
        id: shareLinks.id,
        status: shareLinks.status,
        planRevision: shareLinks.planRevision,
        createdAt: shareLinks.createdAt,
        updatedAt: shareLinks.updatedAt,
        expiresAt: shareLinks.expiresAt,
        lastAccessedAt: shareLinks.lastAccessedAt,
        accessCount: shareLinks.accessCount,
      })
      .from(shareLinks)
      .where(
        and(eq(shareLinks.accountId, accountId), eq(shareLinks.planId, planId)),
      )
      .orderBy(desc(shareLinks.createdAt), desc(shareLinks.id))
      .limit(20),
  ]);
  if (!plan) throw new RequestError(404, "plan_not_found", "Plan not found.");

  const now = Date.now();

  return {
    publishedRevision: plan.publishedRevision,
    lastSharedAt: toMillis(plan.lastSharedAt),
    shares: rows.map((row) => ({
      id: row.id,
      status: effectiveShareStatus(row, now),
      planRevision: row.planRevision,
      createdAt: requiredShareTimestamp(row.createdAt),
      updatedAt: requiredShareTimestamp(row.updatedAt),
      expiresAt: toMillis(row.expiresAt),
      lastAccessedAt: toMillis(row.lastAccessedAt),
      accessCount: row.accessCount,
    })),
  };
}

/**
 * Account-control inventory for access containment after entitlement loss.
 * It deliberately excludes golfer, plan, recipient, bearer, and session IDs.
 * Revoking the returned link ID terminates every session beneath it.
 */
export async function listAccountActiveShareControls(
  accountId: string,
): Promise<AccountActiveShareControl[]> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({
      id: shareLinks.id,
      planRevision: shareLinks.planRevision,
      createdAt: shareLinks.createdAt,
      expiresAt: shareLinks.expiresAt,
      lastAccessedAt: shareLinks.lastAccessedAt,
      accessCount: shareLinks.accessCount,
      activeSessionCount: count(shareSessions.id),
    })
    .from(shareLinks)
    .leftJoin(
      shareSessions,
      and(
        eq(shareSessions.accountId, shareLinks.accountId),
        eq(shareSessions.shareLinkId, shareLinks.id),
        isNull(shareSessions.revokedAt),
        gt(shareSessions.expiresAt, now),
      ),
    )
    .where(
      and(
        eq(shareLinks.accountId, accountId),
        eq(shareLinks.status, "active"),
        isNull(shareLinks.revokedAt),
        or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, now)),
      ),
    )
    .groupBy(
      shareLinks.id,
      shareLinks.planRevision,
      shareLinks.createdAt,
      shareLinks.expiresAt,
      shareLinks.lastAccessedAt,
      shareLinks.accessCount,
    )
    .orderBy(desc(shareLinks.createdAt), desc(shareLinks.id))
    .limit(100);

  return rows.map((row) => ({
    id: row.id,
    planRevision: row.planRevision,
    status: "active",
    createdAt: requiredShareTimestamp(row.createdAt),
    expiresAt: toMillis(row.expiresAt),
    lastAccessedAt: toMillis(row.lastAccessedAt),
    accessCount: row.accessCount,
    activeSessionCount: Number(row.activeSessionCount),
  }));
}

export async function listPlanResponses(
  accountId: string,
  planId: string,
): Promise<PlanResponseSummary[]> {
  await requireGolferRecordProcessingConsent(accountId);
  const db = getDb();
  const rows = await db
    .select({
      id: golferPlanResponses.id,
      responseType: golferPlanResponses.responseType,
      occurredAt: golferPlanResponses.occurredAt,
    })
    .from(golferPlanResponses)
    .where(
      and(
        eq(golferPlanResponses.accountId, accountId),
        eq(golferPlanResponses.planId, planId),
      ),
    )
    .orderBy(desc(golferPlanResponses.occurredAt))
    .limit(20);

  return rows.map((row) => ({
    id: row.id,
    responseType: row.responseType as GolferResponseType,
    occurredAt: toMillis(row.occurredAt) ?? Date.now(),
  }));
}

export async function getCoachPlan(
  accountId: string,
  planId: string,
): Promise<PlanViewModel | null> {
  await requireGolferRecordProcessingConsent(accountId);
  const db = getDb();
  const [plan] = await db
    .select()
    .from(developmentPlans)
    .where(and(eq(developmentPlans.accountId, accountId), eq(developmentPlans.id, planId)))
    .limit(1);
  if (!plan) return null;
  return assemblePlanView(accountId, plan);
}

export async function getCoachPlanForGolfer(
  accountId: string,
  golferId: string,
): Promise<PlanViewModel | null> {
  await requireGolferRecordProcessingConsent(accountId);
  const db = getDb();
  const [plan] = await db
    .select()
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, accountId),
        eq(developmentPlans.golferId, golferId),
      ),
    )
    .orderBy(desc(developmentPlans.updatedAt), desc(developmentPlans.id))
    .limit(1);
  if (!plan) return null;
  return assemblePlanView(accountId, plan);
}

export async function publishPlanAndCreateShare(input: {
  accountId: string;
  planId: string;
  expectedRevision: number;
  intendedRecipientContext: string;
  expiresInDays?: number;
  requestId?: string | null;
}): Promise<ShareMutationReceipt> {
  const db = getDb();
  const [plan] = await db
    .select()
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, input.accountId),
        eq(developmentPlans.id, input.planId),
      ),
    )
    .limit(1);
  if (!plan) throw new RequestError(404, "plan_not_found", "Plan not found.");
  if (plan.revision !== input.expectedRevision) {
    throw new RequestError(
      409,
      "stale_plan_revision",
      "This plan changed after the preview loaded. Refresh and review the latest version before publishing.",
    );
  }
  if (plan.status === "archived") {
    throw new RequestError(409, "plan_not_publishable", "This plan cannot be published in its current state.");
  }
  if (plan.publishedRevision !== null) {
    throw new RequestError(
      409,
      "publish_conflict",
      "This exact revision already has a sharing record. Create a new plan revision before publishing again.",
    );
  }
  const consentRequirements = await requireRoadmapSharingConsent(
    input.accountId,
    plan.golferId,
  );

  const publishModel = await assemblePlanView(input.accountId, plan);
  if (!publishModel) {
    throw new RequestError(409, "plan_not_ready", "The complete golfer view could not be prepared.");
  }
  assertPublicationReady(publishModel);

  const days = input.expiresInDays ?? DEFAULT_SHARE_DAYS;
  if (![1, 7, 30, 90].includes(days)) {
    throw new RequestError(400, "invalid_expiry", "Share expiry must be 1, 7, 30, or 90 days.");
  }
  const previousLastSharedAt = toMillis(plan.lastSharedAt);
  const now = new Date(Math.max(Date.now(), (previousLastSharedAt ?? -1) + 1));
  const expiresAt = new Date(now.getTime() + days * 86_400_000);
  const share = await createShareToken();
  const shareId = newId();
  const revision = Math.max(plan.revision, 1);
  const publishGuard = and(
    eq(developmentPlans.revision, input.expectedRevision),
    isNull(developmentPlans.publishedRevision),
    plan.lastSharedAt === null
      ? isNull(developmentPlans.lastSharedAt)
      : eq(developmentPlans.lastSharedAt, plan.lastSharedAt),
    inArray(developmentPlans.status, [
      "draft",
      "preview_ready",
      "published",
      "paused",
      "completed",
    ]),
  );

  try {
    await db.batch([
      consentGrantTransactionGuard(
        input.accountId,
        consentRequirements,
      ),
      db
        .update(shareLinks)
        .set({
          status: "revoked",
          revokedAt: now,
          revokeReason: "replaced by a newly published link",
          updatedAt: now,
        })
        .where(
          and(
            eq(shareLinks.accountId, input.accountId),
            eq(shareLinks.planId, input.planId),
            eq(shareLinks.status, "active"),
          ),
        ),
      db
        .update(developmentPlans)
        .set({
        // published_revision is the one-time CAS marker for this exact content
        // revision; last_shared_at also protects the observed publish state.
        // The NOT NULL title sentinel makes a lost race abort the D1 batch,
        // including the earlier link revocation.
        title: sql<string>`case when ${publishGuard} then ${developmentPlans.title} else null end`,
        status:
          plan.status === "paused" || plan.status === "completed"
            ? plan.status
            : "published",
        approvedRevision: revision,
        publishedRevision: revision,
        coachApprovedAt: now,
        previewedAt: now,
        publishedAt: plan.publishedAt ?? now,
        lastSharedAt: now,
        updatedAt: now,
      })
        .where(
          and(
            eq(developmentPlans.accountId, input.accountId),
            eq(developmentPlans.id, input.planId),
          ),
        ),
      db.insert(shareLinks).values({
      id: shareId,
      accountId: input.accountId,
      planId: input.planId,
      tokenHash: share.hash,
      tokenHashAlgorithm: "hmac-sha256-v1",
      status: "active",
      scope: "golfer_plan_read",
      planRevision: revision,
      intendedRecipientContext: input.intendedRecipientContext,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }),
      db.insert(auditEvents).values({
      id: newId(),
      accountId: input.accountId,
      actorType: "account",
      actorAccountId: input.accountId,
      action: "plan.publish_and_share",
      targetType: "development_plan",
      targetId: input.planId,
      outcome: "success",
      requestId: input.requestId ?? null,
      metadata: { shareId, expiresAt: expiresAt.toISOString(), planRevision: revision },
      }),
    ]);
  } catch (error) {
    if (
      !(await consentGrantRequirementsCurrent(
        input.accountId,
        consentRequirements,
      ))
    ) {
      throw new RequestError(
        409,
        "current_consent_required",
        "A current configured authorization is required for this action.",
      );
    }
    await rethrowPublishConflict(input, previousLastSharedAt, error);
  }

  return {
    intent: {
      operation: "plan.publish_and_share",
      expiresInDays: days,
    },
    shareId,
    rawToken: share.raw,
    planId: input.planId,
    planRevision: revision,
    status: "active",
    createdAt: now,
    updatedAt: now,
    expiresAt,
    lastAccessedAt: null,
    accessCount: 0,
  };
}

/**
 * Replaces a live one-time share bearer that the instructor can no longer
 * access (for example, after a committed publish acknowledgement was lost).
 *
 * The caller must name the exact active sharing record it observed. That
 * record ID and the plan's last_shared_at value form the transaction guard, so
 * two tabs acting from the same rendered state cannot both create live links.
 * The new raw bearer is returned once and is never persisted.
 */
export async function replaceInaccessiblePlanShare(input: {
  accountId: string;
  planId: string;
  expectedRevision: number;
  expectedShareId: string;
  requestId?: string | null;
}): Promise<ShareMutationReceipt> {
  const db = getDb();
  const [plan] = await db
    .select()
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, input.accountId),
        eq(developmentPlans.id, input.planId),
      ),
    )
    .limit(1);
  if (!plan) throw new RequestError(404, "plan_not_found", "Plan not found.");
  assertShareReplacementPlanState(plan, input.expectedRevision);

  const consentRequirements = await requireRoadmapSharingConsent(
    input.accountId,
    plan.golferId,
  );
  const publishModel = await assemblePlanView(input.accountId, plan);
  if (!publishModel) {
    throw new RequestError(
      409,
      "plan_not_ready",
      "The complete golfer view could not be prepared.",
    );
  }
  assertPublicationReady(publishModel);

  const observedAt = new Date();
  const [sourceLink] = await db
    .select({
      id: shareLinks.id,
      intendedRecipientContext: shareLinks.intendedRecipientContext,
      expiresAt: shareLinks.expiresAt,
    })
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.accountId, input.accountId),
        eq(shareLinks.id, input.expectedShareId),
        eq(shareLinks.planId, input.planId),
        eq(shareLinks.planRevision, input.expectedRevision),
        eq(shareLinks.status, "active"),
        isNull(shareLinks.revokedAt),
        or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, observedAt)),
      ),
    )
    .limit(1);
  if (!sourceLink) throw shareReplacementUnavailable();

  const previousLastSharedAt = toMillis(plan.lastSharedAt);
  const now = new Date(Math.max(Date.now(), (previousLastSharedAt ?? -1) + 1));
  if (
    sourceLink.expiresAt !== null &&
    (toMillis(sourceLink.expiresAt) ?? 0) <= now.getTime()
  ) {
    throw shareReplacementUnavailable();
  }
  const replacement = await createShareToken();
  const replacementShareId = newId();
  const replacementGuard = and(
    eq(developmentPlans.revision, input.expectedRevision),
    eq(developmentPlans.publishedRevision, input.expectedRevision),
    plan.lastSharedAt === null
      ? isNull(developmentPlans.lastSharedAt)
      : eq(developmentPlans.lastSharedAt, plan.lastSharedAt),
    inArray(developmentPlans.status, ["published", "paused", "completed"]),
    sql`exists (
      select 1 from ${shareLinks}
      where ${shareLinks.accountId} = ${input.accountId}
        and ${shareLinks.id} = ${input.expectedShareId}
        and ${shareLinks.planId} = ${input.planId}
        and ${shareLinks.planRevision} = ${input.expectedRevision}
        and ${shareLinks.status} = 'active'
        and ${shareLinks.revokedAt} is null
        and (${shareLinks.expiresAt} is null or ${shareLinks.expiresAt} > ${now.getTime()})
    )`,
  );

  try {
    await db.batch([
      consentGrantTransactionGuard(input.accountId, consentRequirements),
      db
        .update(developmentPlans)
        .set({
          // title is NOT NULL. A stale plan/link observation therefore aborts
          // the complete D1 batch, including revocations and the new insert.
          title: sql<string>`case when ${replacementGuard} then ${developmentPlans.title} else null end`,
          lastSharedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(developmentPlans.accountId, input.accountId),
            eq(developmentPlans.id, input.planId),
          ),
        ),
      db
        .update(shareSessions)
        .set({
          revokedAt: now,
          revokeReason: "share link replaced after inaccessible-link recovery",
          updatedAt: now,
        })
        .where(
          and(
            eq(shareSessions.accountId, input.accountId),
            isNull(shareSessions.revokedAt),
            sql`exists (
              select 1 from ${shareLinks}
              where ${shareLinks.accountId} = ${shareSessions.accountId}
                and ${shareLinks.id} = ${shareSessions.shareLinkId}
                and ${shareLinks.planId} = ${input.planId}
                and ${shareLinks.status} = 'active'
            )`,
          ),
        ),
      db
        .update(shareLinks)
        .set({
          status: "revoked",
          revokedAt: now,
          revokeReason: "replaced after inaccessible-link recovery",
          updatedAt: now,
        })
        .where(
          and(
            eq(shareLinks.accountId, input.accountId),
            eq(shareLinks.planId, input.planId),
            eq(shareLinks.status, "active"),
          ),
        ),
      db.insert(shareLinks).values({
        id: replacementShareId,
        accountId: input.accountId,
        planId: input.planId,
        tokenHash: replacement.hash,
        tokenHashAlgorithm: "hmac-sha256-v1",
        status: "active",
        scope: "golfer_plan_read",
        planRevision: input.expectedRevision,
        intendedRecipientContext: sourceLink.intendedRecipientContext,
        expiresAt: sourceLink.expiresAt,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(auditEvents).values({
        id: newId(),
        accountId: input.accountId,
        actorType: "account",
        actorAccountId: input.accountId,
        action: "share.replace_inaccessible_link",
        targetType: "development_plan",
        targetId: input.planId,
        outcome: "success",
        requestId: input.requestId ?? null,
        metadata: {
          previousShareId: sourceLink.id,
          replacementShareId,
          expiresAt: sourceLink.expiresAt?.toISOString() ?? null,
          planRevision: input.expectedRevision,
        },
      }),
    ]);
  } catch (error) {
    if (
      !(await consentGrantRequirementsCurrent(
        input.accountId,
        consentRequirements,
      ))
    ) {
      throw new RequestError(
        409,
        "current_consent_required",
        "A current configured authorization is required for this action.",
      );
    }
    await rethrowShareReplacementConflict(input, previousLastSharedAt, error);
  }

  return {
    intent: {
      operation: "share.replace_inaccessible_link",
      sourceShareId: sourceLink.id,
    },
    shareId: replacementShareId,
    rawToken: replacement.raw,
    planId: input.planId,
    planRevision: input.expectedRevision,
    status: "active",
    createdAt: now,
    updatedAt: now,
    expiresAt: sourceLink.expiresAt,
    lastAccessedAt: null,
    accessCount: 0,
  };
}

/**
 * Issues a new bearer for the already-published revision only after the
 * instructor has rendered and named the exact terminal history record at the
 * head of that revision. Unlike inaccessible-link replacement, this path is
 * available only when no live link remains and always selects a fresh bounded
 * future expiry.
 */
export async function reissuePublishedPlanShare(input: {
  accountId: string;
  planId: string;
  expectedRevision: number;
  expectedLastSharedAt: number;
  expectedSourceShareId: string;
  expectedSourceStatus: "revoked" | "expired";
  expectedSourceUpdatedAt: number;
  expiresInDays: number;
  requestId?: string | null;
}): Promise<ShareMutationReceipt> {
  if (![1, 7, 30, 90].includes(input.expiresInDays)) {
    throw new RequestError(
      400,
      "invalid_expiry",
      "Share expiry must be 1, 7, 30, or 90 days.",
    );
  }

  const db = getDb();
  const [plan] = await db
    .select()
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, input.accountId),
        eq(developmentPlans.id, input.planId),
      ),
    )
    .limit(1);
  if (!plan) throw new RequestError(404, "plan_not_found", "Plan not found.");
  assertShareReissuePlanState(plan, input.expectedRevision);

  const previousLastSharedAt = toMillis(plan.lastSharedAt);
  if (
    previousLastSharedAt === null ||
    previousLastSharedAt !== input.expectedLastSharedAt
  ) {
    throw shareReissueConflict();
  }

  const consentRequirements = await requireRoadmapSharingConsent(
    input.accountId,
    plan.golferId,
  );
  const publishModel = await assemblePlanView(input.accountId, plan);
  if (!publishModel) {
    throw new RequestError(
      409,
      "plan_not_ready",
      "The complete golfer view could not be prepared.",
    );
  }
  assertPublicationReady(publishModel);

  const observedAt = new Date();
  const [[sourceLink], [liveLink]] = await Promise.all([
    db
      .select({
        id: shareLinks.id,
        status: shareLinks.status,
        planRevision: shareLinks.planRevision,
        intendedRecipientContext: shareLinks.intendedRecipientContext,
        expiresAt: shareLinks.expiresAt,
        revokedAt: shareLinks.revokedAt,
        createdAt: shareLinks.createdAt,
        updatedAt: shareLinks.updatedAt,
      })
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.accountId, input.accountId),
          eq(shareLinks.planId, input.planId),
          eq(shareLinks.planRevision, input.expectedRevision),
        ),
      )
      .orderBy(desc(shareLinks.createdAt), desc(shareLinks.id))
      .limit(1),
    db
      .select({ id: shareLinks.id })
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.accountId, input.accountId),
          eq(shareLinks.planId, input.planId),
          eq(shareLinks.status, "active"),
          isNull(shareLinks.revokedAt),
          or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, observedAt)),
        ),
      )
      .limit(1),
  ]);
  if (liveLink) throw shareReissueLiveLinkExists();
  if (
    !sourceLink ||
    sourceLink.id !== input.expectedSourceShareId ||
    sourceLink.planRevision !== input.expectedRevision ||
    requiredShareTimestamp(sourceLink.updatedAt) !==
      input.expectedSourceUpdatedAt ||
    effectiveShareStatus(sourceLink, observedAt.getTime()) !==
      input.expectedSourceStatus
  ) {
    throw shareReissueConflict();
  }

  const sourceCreatedAt = requiredShareTimestamp(sourceLink.createdAt);
  const sourceUpdatedAt = requiredShareTimestamp(sourceLink.updatedAt);
  const now = new Date(
    Math.max(Date.now(), previousLastSharedAt + 1, sourceUpdatedAt + 1),
  );
  const expiresAt = new Date(
    now.getTime() + input.expiresInDays * 86_400_000,
  );
  const replacement = await createShareToken();
  const replacementShareId = newId();
  const observedSourceState =
    input.expectedSourceStatus === "revoked"
      ? sql`${shareLinks.status} = 'revoked'`
      : sql`(
          ${shareLinks.status} = 'expired'
          or (
            ${shareLinks.status} = 'active'
            and ${shareLinks.revokedAt} is null
            and ${shareLinks.expiresAt} is not null
            and ${shareLinks.expiresAt} <= ${observedAt.getTime()}
          )
        )`;
  const reissueGuard = and(
    eq(developmentPlans.revision, input.expectedRevision),
    eq(developmentPlans.publishedRevision, input.expectedRevision),
    eq(developmentPlans.lastSharedAt, plan.lastSharedAt!),
    inArray(developmentPlans.status, ["published", "paused", "completed"]),
    sql`exists (
      select 1 from ${shareLinks}
       where ${shareLinks.accountId} = ${input.accountId}
         and ${shareLinks.id} = ${input.expectedSourceShareId}
         and ${shareLinks.planId} = ${input.planId}
         and ${shareLinks.planRevision} = ${input.expectedRevision}
         and ${shareLinks.updatedAt} = ${sourceUpdatedAt}
         and ${observedSourceState}
    )`,
    sql`not exists (
      select 1 from share_links as newer
       where newer.account_id = ${input.accountId}
         and newer.plan_id = ${input.planId}
         and newer.plan_revision = ${input.expectedRevision}
         and (
           newer.created_at > ${sourceCreatedAt}
           or (newer.created_at = ${sourceCreatedAt} and newer.id > ${input.expectedSourceShareId})
         )
    )`,
    sql`not exists (
      select 1 from ${shareLinks}
       where ${shareLinks.accountId} = ${input.accountId}
         and ${shareLinks.planId} = ${input.planId}
         and ${shareLinks.status} = 'active'
         and ${shareLinks.revokedAt} is null
         and (${shareLinks.expiresAt} is null or ${shareLinks.expiresAt} > ${now.getTime()})
    )`,
  );

  await pauseAtSyntheticConcurrencyBarrier(
    "share-reissue-after-source-observation",
  );

  try {
    await db.batch([
      consentGrantTransactionGuard(input.accountId, consentRequirements),
      db
        .update(developmentPlans)
        .set({
          // title is NOT NULL, so a stale plan, history head, or newly live
          // link aborts this complete batch before any replacement survives.
          title: sql<string>`case when ${reissueGuard} then ${developmentPlans.title} else null end`,
          lastSharedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(developmentPlans.accountId, input.accountId),
            eq(developmentPlans.id, input.planId),
          ),
        ),
      db
        .update(shareSessions)
        .set({
          revokedAt: now,
          revokeReason: "share history superseded by same-revision reissue",
          updatedAt: now,
        })
        .where(
          and(
            eq(shareSessions.accountId, input.accountId),
            isNull(shareSessions.revokedAt),
            sql`exists (
              select 1 from ${shareLinks}
               where ${shareLinks.accountId} = ${shareSessions.accountId}
                 and ${shareLinks.id} = ${shareSessions.shareLinkId}
                 and ${shareLinks.planId} = ${input.planId}
            )`,
          ),
        ),
      db
        .update(shareLinks)
        .set({
          status: "revoked",
          revokedAt: now,
          revokeReason: "superseded by same-revision reissue",
          updatedAt: now,
        })
        .where(
          and(
            eq(shareLinks.accountId, input.accountId),
            eq(shareLinks.planId, input.planId),
            eq(shareLinks.status, "active"),
          ),
        ),
      db.insert(shareLinks).values({
        id: replacementShareId,
        accountId: input.accountId,
        planId: input.planId,
        tokenHash: replacement.hash,
        tokenHashAlgorithm: "hmac-sha256-v1",
        status: "active",
        scope: "golfer_plan_read",
        planRevision: input.expectedRevision,
        intendedRecipientContext: sourceLink.intendedRecipientContext,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(auditEvents).values({
        id: newId(),
        accountId: input.accountId,
        actorType: "account",
        actorAccountId: input.accountId,
        action: "share.reissue_same_revision",
        targetType: "development_plan",
        targetId: input.planId,
        outcome: "success",
        requestId: input.requestId ?? null,
        metadata: {
          sourceShareId: sourceLink.id,
          sourceObservedStatus: input.expectedSourceStatus,
          replacementShareId,
          expiresAt: expiresAt.toISOString(),
          expiryDays: input.expiresInDays,
          planRevision: input.expectedRevision,
        },
      }),
    ]);
  } catch (error) {
    if (
      !(await consentGrantRequirementsCurrent(
        input.accountId,
        consentRequirements,
      ))
    ) {
      throw new RequestError(
        409,
        "current_consent_required",
        "A current configured authorization is required for this action.",
      );
    }
    await rethrowShareReissueConflict(input, previousLastSharedAt, error);
  }

  return {
    intent: {
      operation: "share.reissue_same_revision",
      sourceShareId: sourceLink.id,
      sourceStatus: input.expectedSourceStatus,
      sourceUpdatedAt,
      expiresInDays: input.expiresInDays,
    },
    shareId: replacementShareId,
    rawToken: replacement.raw,
    planId: input.planId,
    planRevision: input.expectedRevision,
    status: "active",
    createdAt: now,
    updatedAt: now,
    expiresAt,
    lastAccessedAt: null,
    accessCount: 0,
  };
}

export async function revokeShareLink(input: {
  accountId: string;
  shareId: string;
  reason: string;
  requestId?: string | null;
}): Promise<void> {
  const db = getDb();
  const [link] = await db
    .select({ id: shareLinks.id, planId: shareLinks.planId, status: shareLinks.status })
    .from(shareLinks)
    .where(and(eq(shareLinks.accountId, input.accountId), eq(shareLinks.id, input.shareId)))
    .limit(1);
  if (!link) throw new RequestError(404, "share_not_found", "Share link not found.");
  if (link.status !== "active") return;

  const now = new Date();
  try {
    await db.batch([
      db
        .update(shareLinks)
        .set({
          // A zero-row conditional update would not abort the audit insert.
          // Use the non-null token hash as a rollback sentinel so exactly one
          // concurrent revocation can commit its terminal reason and audit.
          tokenHash: sql<string>`case when ${shareLinks.status} = 'active' then ${shareLinks.tokenHash} else null end`,
          status: "revoked",
          revokedAt: now,
          revokeReason: input.reason,
          updatedAt: now,
        })
        .where(
          and(
            eq(shareLinks.accountId, input.accountId),
            eq(shareLinks.id, input.shareId),
          ),
        ),
      db
        .update(shareSessions)
        .set({
          revokedAt: now,
          revokeReason: "share link revoked",
          updatedAt: now,
        })
        .where(
          and(
            eq(shareSessions.accountId, input.accountId),
            eq(shareSessions.shareLinkId, input.shareId),
            isNull(shareSessions.revokedAt),
          ),
        ),
      db.insert(auditEvents).values({
        id: newId(),
        accountId: input.accountId,
        actorType: "account",
        actorAccountId: input.accountId,
        action: "share.revoke",
        targetType: "share_link",
        targetId: input.shareId,
        outcome: "success",
        requestId: input.requestId ?? null,
        metadata: { planId: link.planId, reasonRecorded: true },
      }),
    ]);
  } catch (error) {
    const [current] = await db
      .select({ status: shareLinks.status })
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.accountId, input.accountId),
          eq(shareLinks.id, input.shareId),
        ),
      )
      .limit(1);
    if (current && current.status !== "active") return;
    throw error;
  }
}

async function rethrowPublishConflict(
  input: { accountId: string; planId: string; expectedRevision: number },
  previousLastSharedAt: number | null,
  error: unknown,
): Promise<never> {
  const [plan] = await getDb()
    .select({
      revision: developmentPlans.revision,
      status: developmentPlans.status,
      publishedRevision: developmentPlans.publishedRevision,
      lastSharedAt: developmentPlans.lastSharedAt,
    })
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, input.accountId),
        eq(developmentPlans.id, input.planId),
      ),
    )
    .limit(1);

  if (!plan) throw new RequestError(404, "plan_not_found", "Plan not found.");
  if (plan.revision !== input.expectedRevision) {
    throw new RequestError(
      409,
      "stale_plan_revision",
      "This plan changed while it was being published. Refresh and review the latest version.",
    );
  }
  if (plan.status === "archived") {
    throw new RequestError(409, "plan_not_publishable", "This plan cannot be published in its current state.");
  }
  if (plan.publishedRevision !== null) {
    throw new RequestError(
      409,
      "publish_conflict",
      "Another publish completed first. Refresh the sharing record before creating another link.",
    );
  }
  if (toMillis(plan.lastSharedAt) !== previousLastSharedAt) {
    throw new RequestError(
      409,
      "publish_conflict",
      "Another publish completed first. Refresh the sharing record before creating another link.",
    );
  }
  throw error;
}

function assertShareReplacementPlanState(
  plan: Pick<
    typeof developmentPlans.$inferSelect,
    "revision" | "publishedRevision" | "status"
  >,
  expectedRevision: number,
): void {
  if (plan.revision !== expectedRevision) {
    throw new RequestError(
      409,
      "stale_plan_revision",
      "This plan changed after the sharing record loaded. Refresh before replacing its link.",
    );
  }
  if (
    plan.publishedRevision !== expectedRevision ||
    !["published", "paused", "completed"].includes(plan.status)
  ) {
    throw shareReplacementUnavailable();
  }
}

function shareReplacementUnavailable(): RequestError {
  return new RequestError(
    409,
    "share_replacement_unavailable",
    "That exact active sharing record is no longer available. Reload before replacing a link.",
  );
}

async function rethrowShareReplacementConflict(
  input: {
    accountId: string;
    planId: string;
    expectedRevision: number;
    expectedShareId: string;
  },
  previousLastSharedAt: number | null,
  error: unknown,
): Promise<never> {
  const db = getDb();
  const [plan] = await db
    .select({
      revision: developmentPlans.revision,
      status: developmentPlans.status,
      publishedRevision: developmentPlans.publishedRevision,
      lastSharedAt: developmentPlans.lastSharedAt,
    })
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, input.accountId),
        eq(developmentPlans.id, input.planId),
      ),
    )
    .limit(1);
  if (!plan) throw new RequestError(404, "plan_not_found", "Plan not found.");
  assertShareReplacementPlanState(plan, input.expectedRevision);

  const [sourceLink] = await db
    .select({ id: shareLinks.id })
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.accountId, input.accountId),
        eq(shareLinks.id, input.expectedShareId),
        eq(shareLinks.planId, input.planId),
        eq(shareLinks.planRevision, input.expectedRevision),
        eq(shareLinks.status, "active"),
        isNull(shareLinks.revokedAt),
      ),
    )
    .limit(1);
  if (
    !sourceLink ||
    toMillis(plan.lastSharedAt) !== previousLastSharedAt
  ) {
    throw new RequestError(
      409,
      "share_replacement_conflict",
      "Another link change completed first. Reload the sharing record before replacing anything else.",
    );
  }
  throw error;
}

function assertShareReissuePlanState(
  plan: Pick<
    typeof developmentPlans.$inferSelect,
    "revision" | "publishedRevision" | "status"
  >,
  expectedRevision: number,
): void {
  if (plan.revision !== expectedRevision) {
    throw new RequestError(
      409,
      "stale_plan_revision",
      "This plan changed after the sharing history loaded. Refresh before reissuing access.",
    );
  }
  if (
    plan.publishedRevision !== expectedRevision ||
    !["published", "paused", "completed"].includes(plan.status)
  ) {
    throw new RequestError(
      409,
      "share_reissue_unavailable",
      "That exact plan revision is not currently published. Reload before reissuing access.",
    );
  }
}

function shareReissueConflict(): RequestError {
  return new RequestError(
    409,
    "share_reissue_conflict",
    "The sharing history changed. Reload it before reissuing private access.",
  );
}

function shareReissueLiveLinkExists(): RequestError {
  return new RequestError(
    409,
    "share_reissue_live_link_exists",
    "A live private link already exists. Reload the sharing history before making another change.",
  );
}

async function rethrowShareReissueConflict(
  input: {
    accountId: string;
    planId: string;
    expectedRevision: number;
    expectedSourceShareId: string;
    expectedSourceStatus: "revoked" | "expired";
    expectedSourceUpdatedAt: number;
  },
  previousLastSharedAt: number,
  error: unknown,
): Promise<never> {
  const db = getDb();
  const [plan] = await db
    .select({
      revision: developmentPlans.revision,
      status: developmentPlans.status,
      publishedRevision: developmentPlans.publishedRevision,
      lastSharedAt: developmentPlans.lastSharedAt,
    })
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, input.accountId),
        eq(developmentPlans.id, input.planId),
      ),
    )
    .limit(1);
  if (!plan) throw new RequestError(404, "plan_not_found", "Plan not found.");
  assertShareReissuePlanState(plan, input.expectedRevision);
  if (toMillis(plan.lastSharedAt) !== previousLastSharedAt) {
    throw shareReissueConflict();
  }

  const now = new Date();
  const [[sourceLink], [liveLink]] = await Promise.all([
    db
      .select({
        id: shareLinks.id,
        status: shareLinks.status,
        expiresAt: shareLinks.expiresAt,
        updatedAt: shareLinks.updatedAt,
      })
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.accountId, input.accountId),
          eq(shareLinks.planId, input.planId),
          eq(shareLinks.planRevision, input.expectedRevision),
        ),
      )
      .orderBy(desc(shareLinks.createdAt), desc(shareLinks.id))
      .limit(1),
    db
      .select({ id: shareLinks.id })
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.accountId, input.accountId),
          eq(shareLinks.planId, input.planId),
          eq(shareLinks.status, "active"),
          isNull(shareLinks.revokedAt),
          or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, now)),
        ),
      )
      .limit(1),
  ]);
  if (liveLink) throw shareReissueLiveLinkExists();
  if (
    !sourceLink ||
    sourceLink.id !== input.expectedSourceShareId ||
    requiredShareTimestamp(sourceLink.updatedAt) !==
      input.expectedSourceUpdatedAt ||
    effectiveShareStatus(sourceLink, now.getTime()) !==
      input.expectedSourceStatus
  ) {
    throw shareReissueConflict();
  }
  throw error;
}

export async function resolveShareToken(
  rawToken: string,
): Promise<{
  model: PlanViewModel;
  accountId: string;
  golferId: string;
  shareId: string;
  expiresAt: Date | null;
} | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(rawToken)) return null;
  const db = getDb();
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.tokenHash, tokenHash),
        eq(shareLinks.tokenHashAlgorithm, "hmac-sha256-v1"),
        eq(shareLinks.status, "active"),
        or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, now)),
      ),
    )
    .limit(1);
  if (!link) return null;

  const [plan] = await db
    .select()
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, link.accountId),
        eq(developmentPlans.id, link.planId),
        inArray(developmentPlans.status, ["published", "paused", "completed"]),
      ),
    )
    .limit(1);
  if (!plan || plan.publishedRevision !== link.planRevision) return null;
  const consentRequirements = roadmapAccessRequirementsOrNull(plan.golferId);
  if (
    !consentRequirements ||
    !(await consentRequirementsAreCurrent(link.accountId, consentRequirements))
  ) {
    return null;
  }

  const model = await assemblePlanView(link.accountId, plan, {
    expiresAt: toMillis(link.expiresAt),
    sharedAt: toMillis(link.createdAt),
  });
  if (!model) return null;
  await pauseAtSyntheticConcurrencyBarrier("share-token-after-assembly");
  if (
    !(await shareTokenCapabilityCurrent({
      accountId: link.accountId,
      golferId: plan.golferId,
      planId: plan.id,
      planRevision: link.planRevision,
      shareId: link.id,
      tokenHash,
      requirements: consentRequirements,
    }))
  ) {
    return null;
  }

  return {
    model,
    accountId: link.accountId,
    golferId: plan.golferId,
    shareId: link.id,
    expiresAt: link.expiresAt,
  };
}

function roadmapAccessRequirementsOrNull(
  golferId: string,
): readonly ConsentGrantRequirement[] | null {
  try {
    return configuredRoadmapAccessRequirements(golferId);
  } catch {
    return null;
  }
}

async function consentRequirementsAreCurrent(
  accountId: string,
  requirements: readonly ConsentGrantRequirement[],
): Promise<boolean> {
  try {
    return await consentGrantRequirementsCurrent(accountId, requirements);
  } catch {
    return false;
  }
}

async function shareTokenCapabilityCurrent(input: {
  accountId: string;
  golferId: string;
  planId: string;
  planRevision: number;
  shareId: string;
  tokenHash: string;
  requirements: readonly ConsentGrantRequirement[];
}): Promise<boolean> {
  const databaseNow = sql`cast((julianday('now') - 2440587.5) * 86400000 as integer)`;
  const [current] = await getDb()
    .select({ id: shareLinks.id })
    .from(shareLinks)
    .innerJoin(
      developmentPlans,
      and(
        eq(developmentPlans.accountId, shareLinks.accountId),
        eq(developmentPlans.id, shareLinks.planId),
      ),
    )
    .where(
      and(
        eq(shareLinks.accountId, input.accountId),
        eq(shareLinks.id, input.shareId),
        eq(shareLinks.planId, input.planId),
        eq(shareLinks.planRevision, input.planRevision),
        eq(shareLinks.tokenHash, input.tokenHash),
        eq(shareLinks.tokenHashAlgorithm, "hmac-sha256-v1"),
        eq(shareLinks.scope, "golfer_plan_read"),
        eq(shareLinks.status, "active"),
        isNull(shareLinks.revokedAt),
        sql`(${shareLinks.expiresAt} is null or ${shareLinks.expiresAt} > ${databaseNow})`,
        eq(developmentPlans.accountId, input.accountId),
        eq(developmentPlans.id, input.planId),
        eq(developmentPlans.golferId, input.golferId),
        inArray(developmentPlans.status, ["published", "paused", "completed"]),
        eq(developmentPlans.publishedRevision, input.planRevision),
        sql`${developmentPlans.publishedAt} is not null`,
        currentConsentGrantsCondition(input.accountId, input.requirements),
      ),
    )
    .limit(1);
  return Boolean(current);
}

async function shareSessionCapabilityCurrent(input: {
  accountId: string;
  golferId: string;
  planId: string;
  planRevision: number;
  shareId: string;
  linkTokenHash: string;
  sessionId: string;
  sessionTokenHash: string;
  requirements: readonly ConsentGrantRequirement[];
}): Promise<boolean> {
  const databaseNow = sql`cast((julianday('now') - 2440587.5) * 86400000 as integer)`;
  const [current] = await getDb()
    .select({ id: shareSessions.id })
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
    .where(
      and(
        eq(shareSessions.accountId, input.accountId),
        eq(shareSessions.id, input.sessionId),
        eq(shareSessions.shareLinkId, input.shareId),
        eq(shareSessions.tokenHash, input.sessionTokenHash),
        eq(shareSessions.tokenHashAlgorithm, "hmac-sha256-session-v1"),
        isNull(shareSessions.revokedAt),
        sql`${shareSessions.expiresAt} > ${databaseNow}`,
        eq(shareLinks.accountId, input.accountId),
        eq(shareLinks.id, input.shareId),
        eq(shareLinks.planId, input.planId),
        eq(shareLinks.planRevision, input.planRevision),
        eq(shareLinks.tokenHash, input.linkTokenHash),
        eq(shareLinks.tokenHashAlgorithm, "hmac-sha256-v1"),
        eq(shareLinks.scope, "golfer_plan_read"),
        eq(shareLinks.status, "active"),
        isNull(shareLinks.revokedAt),
        sql`(${shareLinks.expiresAt} is null or ${shareLinks.expiresAt} > ${databaseNow})`,
        eq(developmentPlans.accountId, input.accountId),
        eq(developmentPlans.id, input.planId),
        eq(developmentPlans.golferId, input.golferId),
        inArray(developmentPlans.status, ["published", "paused", "completed"]),
        eq(developmentPlans.publishedRevision, input.planRevision),
        sql`${developmentPlans.publishedAt} is not null`,
        currentConsentGrantsCondition(input.accountId, input.requirements),
      ),
    )
    .limit(1);
  return Boolean(current);
}

export async function createShareSession(
  rawShareToken: string,
  requestId?: string | null,
  existingRawSessionToken?: string | null,
): Promise<{
  rawToken: string;
  sessionContext: string;
  expiresAt: Date;
} | null> {
  const resolved = await resolveShareToken(rawShareToken);
  if (!resolved) return null;

  const now = new Date();
  const shareExpiry = toMillis(resolved.expiresAt);
  const expiresAt = new Date(
    Math.min(
      now.getTime() + SHARE_SESSION_MAX_SECONDS * 1_000,
      shareExpiry ?? Number.POSITIVE_INFINITY,
    ),
  );
  if (expiresAt.getTime() <= now.getTime()) return null;

  const db = getDb();
  const session = await createShareSessionToken();
  const sessionId = newId();
  const sessionContext = await hashShareSessionContext({
    accountId: resolved.accountId,
    shareId: resolved.shareId,
    sessionId,
  });
  const consentRequirements = configuredRoadmapAccessRequirements(resolved.golferId);
  const replacedSession = await activeShareSessionForReplacement(
    existingRawSessionToken,
    now,
  );
  try {
    await db.batch([
      consentGrantTransactionGuard(
        resolved.accountId,
        consentRequirements,
      ),
      db
      .update(shareLinks)
      .set({
        // Revalidate the capability inside the same D1 transaction that
        // creates the browser session. If revocation, expiry, or a newer plan
        // revision won the race, the NOT NULL token hash sentinel aborts the
        // entire batch instead of leaving a usable orphan session.
        tokenHash: sql<string>`case when
          ${shareLinks.status} = 'active'
          and (${shareLinks.expiresAt} is null or ${shareLinks.expiresAt} > ${now.getTime()})
          and exists (
            select 1 from ${developmentPlans}
            where ${developmentPlans.accountId} = ${shareLinks.accountId}
              and ${developmentPlans.id} = ${shareLinks.planId}
              and ${developmentPlans.status} in ('published', 'paused', 'completed')
              and ${developmentPlans.publishedRevision} = ${shareLinks.planRevision}
          )
          then ${shareLinks.tokenHash} else null end`,
        // A successful exchange is the authoritative link-open event. Keeping
        // this write on the same-origin POST avoids state-changing GET reads.
        lastAccessedAt: now,
        accessCount: sql`${shareLinks.accessCount} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(shareLinks.accountId, resolved.accountId),
          eq(shareLinks.id, resolved.shareId),
        ),
      ),
      db.insert(shareSessions).values({
      id: sessionId,
      accountId: resolved.accountId,
      shareLinkId: resolved.shareId,
      tokenHash: session.hash,
      tokenHashAlgorithm: "hmac-sha256-session-v1",
      expiresAt,
    }),
      ...(replacedSession
        ? [
            db
              .update(shareSessions)
              .set({
                tokenHash: sql<string>`case when ${shareSessions.revokedAt} is null and ${shareSessions.expiresAt} > ${now.getTime()} then ${shareSessions.tokenHash} else null end`,
                revokedAt: now,
                revokeReason: "replaced by a new share exchange",
                updatedAt: now,
              })
              .where(
                and(
                  eq(shareSessions.accountId, replacedSession.accountId),
                  eq(shareSessions.id, replacedSession.id),
                ),
              ),
            db.insert(auditEvents).values({
              id: newId(),
              accountId: replacedSession.accountId,
              actorType: "golfer_share",
              actorReference: replacedSession.shareLinkId,
              action: "share.session_ended",
              targetType: "share_session",
              targetId: replacedSession.id,
              outcome: "success",
              requestId: requestId ?? null,
              metadata: {
                shareId: replacedSession.shareLinkId,
                reason: "replaced by a new share exchange",
              },
            }),
          ]
        : []),
      db.insert(auditEvents).values({
      id: newId(),
      accountId: resolved.accountId,
      actorType: "golfer_share",
      actorReference: resolved.shareId,
      action: "share.session_created",
      targetType: "share_session",
      targetId: sessionId,
      outcome: "success",
      requestId: requestId ?? null,
      metadata: { shareId: resolved.shareId, expiresAt: expiresAt.toISOString() },
      }),
      db.insert(auditEvents).values({
        id: newId(),
        accountId: resolved.accountId,
        actorType: "golfer_share",
        actorReference: resolved.shareId,
        action: "share.access",
        targetType: "share_link",
        targetId: resolved.shareId,
        outcome: "success",
        requestId: requestId ?? null,
        metadata: { sessionId, accessRecordedAtExchange: true },
      }),
    ]);
  } catch (error) {
    if (!(await resolveShareToken(rawShareToken))) return null;
    throw error;
  }

  return {
    rawToken: session.raw,
    sessionContext,
    expiresAt,
  };
}

async function activeShareSessionForReplacement(
  rawSessionToken: string | null | undefined,
  now: Date,
): Promise<{
  id: string;
  accountId: string;
  shareLinkId: string;
} | null> {
  if (!rawSessionToken || !/^[A-Za-z0-9_-]{40,64}$/.test(rawSessionToken)) {
    return null;
  }
  const tokenHash = await hashShareSessionToken(rawSessionToken);
  const [session] = await getDb()
    .select({
      id: shareSessions.id,
      accountId: shareSessions.accountId,
      shareLinkId: shareSessions.shareLinkId,
    })
    .from(shareSessions)
    .where(
      and(
        eq(shareSessions.tokenHash, tokenHash),
        eq(shareSessions.tokenHashAlgorithm, "hmac-sha256-session-v1"),
        isNull(shareSessions.revokedAt),
        gt(shareSessions.expiresAt, now),
      ),
    )
    .limit(1);
  return session ?? null;
}

export async function resolveShareSession(
  rawSessionToken: string,
  expectedSessionContext?: string,
): Promise<{
  model: PlanViewModel;
  accountId: string;
  golferId: string;
  planId: string;
  planRevision: number;
  shareId: string;
  linkTokenHash: string;
  sessionId: string;
  sessionTokenHash: string;
  sessionContext: string;
  expiresAt: Date;
} | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(rawSessionToken)) return null;
  if (
    expectedSessionContext !== undefined &&
    !/^[0-9a-f]{64}$/.test(expectedSessionContext)
  ) {
    return null;
  }

  const db = getDb();
  const tokenHash = await hashShareSessionToken(rawSessionToken);
  const now = new Date();
  const [session] = await db
    .select()
    .from(shareSessions)
    .where(
      and(
        eq(shareSessions.tokenHash, tokenHash),
        eq(shareSessions.tokenHashAlgorithm, "hmac-sha256-session-v1"),
        isNull(shareSessions.revokedAt),
        gt(shareSessions.expiresAt, now),
      ),
    )
    .limit(1);
  if (!session) return null;

  const sessionContext = await hashShareSessionContext({
    accountId: session.accountId,
    shareId: session.shareLinkId,
    sessionId: session.id,
  });
  if (
    expectedSessionContext !== undefined &&
    !shareSessionContextsEqual(expectedSessionContext, sessionContext)
  ) {
    return null;
  }

  const [link] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.accountId, session.accountId),
        eq(shareLinks.id, session.shareLinkId),
        eq(shareLinks.status, "active"),
        or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, now)),
      ),
    )
    .limit(1);
  if (!link) return null;

  const [plan] = await db
    .select()
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, link.accountId),
        eq(developmentPlans.id, link.planId),
        inArray(developmentPlans.status, ["published", "paused", "completed"]),
      ),
    )
    .limit(1);
  if (!plan || plan.publishedRevision !== link.planRevision) return null;
  const consentRequirements = roadmapAccessRequirementsOrNull(plan.golferId);
  if (
    !consentRequirements ||
    !(await consentRequirementsAreCurrent(link.accountId, consentRequirements))
  ) {
    return null;
  }

  const effectiveExpiry = Math.min(
    toMillis(session.expiresAt) ?? now.getTime(),
    toMillis(link.expiresAt) ?? Number.POSITIVE_INFINITY,
  );
  const model = await assemblePlanView(link.accountId, plan, {
    expiresAt: effectiveExpiry,
    sharedAt: toMillis(link.createdAt),
  });
  if (!model) return null;
  await pauseAtSyntheticConcurrencyBarrier("share-session-after-assembly");
  if (
    !(await shareSessionCapabilityCurrent({
      accountId: link.accountId,
      golferId: plan.golferId,
      planId: plan.id,
      planRevision: link.planRevision,
      shareId: link.id,
      linkTokenHash: link.tokenHash,
      sessionId: session.id,
      sessionTokenHash: tokenHash,
      requirements: consentRequirements,
    }))
  ) {
    return null;
  }

  return {
    model,
    accountId: link.accountId,
    golferId: plan.golferId,
    planId: plan.id,
    planRevision: link.planRevision,
    shareId: link.id,
    linkTokenHash: link.tokenHash,
    sessionId: session.id,
    sessionTokenHash: tokenHash,
    sessionContext,
    expiresAt: session.expiresAt,
  };
}

export async function endShareSession(
  rawSessionToken: string,
  reason: "closed by golfer" | "replaced by a new share exchange",
  requestId?: string | null,
  expectedSessionContext?: string,
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(rawSessionToken)) return;

  const db = getDb();
  const tokenHash = await hashShareSessionToken(rawSessionToken);
  const [session] = await db
    .select({
      id: shareSessions.id,
      accountId: shareSessions.accountId,
      shareLinkId: shareSessions.shareLinkId,
      revokedAt: shareSessions.revokedAt,
    })
    .from(shareSessions)
    .where(
      and(
        eq(shareSessions.tokenHash, tokenHash),
        eq(shareSessions.tokenHashAlgorithm, "hmac-sha256-session-v1"),
      ),
    )
    .limit(1);
  if (!session) return;
  if (expectedSessionContext !== undefined) {
    const actualSessionContext = await hashShareSessionContext({
      accountId: session.accountId,
      shareId: session.shareLinkId,
      sessionId: session.id,
    });
    if (!shareSessionContextsEqual(expectedSessionContext, actualSessionContext)) {
      throw new RequestError(
        409,
        "share_session_changed",
        "This private plan session changed. Reload before trying again.",
      );
    }
  }
  if (session.revokedAt) return;

  const now = new Date();
  try {
    await db.batch([
      db
        .update(shareSessions)
        .set({
          tokenHash: sql<string>`case when ${shareSessions.revokedAt} is null then ${shareSessions.tokenHash} else null end`,
          revokedAt: now,
          revokeReason: reason,
          updatedAt: now,
        })
        .where(
          and(
            eq(shareSessions.accountId, session.accountId),
            eq(shareSessions.id, session.id),
          ),
        ),
      db.insert(auditEvents).values({
        id: newId(),
        accountId: session.accountId,
        actorType: "golfer_share",
        actorReference: session.shareLinkId,
        action: "share.session_ended",
        targetType: "share_session",
        targetId: session.id,
        outcome: "success",
        requestId: requestId ?? null,
        metadata: { shareId: session.shareLinkId, reason },
      }),
    ]);
  } catch (error) {
    const [current] = await db
      .select({ revokedAt: shareSessions.revokedAt })
      .from(shareSessions)
      .where(
        and(
          eq(shareSessions.accountId, session.accountId),
          eq(shareSessions.id, session.id),
        ),
      )
      .limit(1);
    if (current?.revokedAt) return;
    throw error;
  }
}

export async function recordGolferResponse(input: {
  rawSessionToken: string;
  sessionContext: string;
  responseType: GolferResponseType;
  idempotencyKey: string;
  requestId?: string | null;
}): Promise<{ response: PlanResponseSummary; replayed: boolean }> {
  const resolved = await resolveShareSession(input.rawSessionToken);
  if (!resolved) {
    throw new RequestError(404, "plan_unavailable", "This private plan is unavailable.");
  }
  if (!shareSessionContextsEqual(input.sessionContext, resolved.sessionContext)) {
    throw new RequestError(
      409,
      "share_session_changed",
      "This private plan session changed. Reload before choosing again.",
    );
  }
  const [receiptId, responseId, inputFingerprint] = await Promise.all([
    hashToken(
      JSON.stringify([
        "golfer-response-audit-receipt-v1",
        resolved.accountId,
        resolved.sessionId,
        input.idempotencyKey,
      ]),
    ),
    hashToken(
      JSON.stringify([
        "golfer-response-record-receipt-v1",
        resolved.accountId,
        resolved.sessionId,
        input.idempotencyKey,
      ]),
    ),
    hashToken(
      JSON.stringify(["golfer-response-input-v1", input.responseType]),
    ),
  ]);
  const replay = await replayGolferResponseReceipt({
    accountId: resolved.accountId,
    planId: resolved.model.plan.id,
    shareId: resolved.shareId,
    receiptId,
    responseId,
    responseType: input.responseType,
    inputFingerprint,
  });
  if (replay) return replay;
  if (
    input.responseType === "external_action_opened" &&
    !resolved.model.coachingPackage
  ) {
    throw new RequestError(
      409,
      "external_action_unavailable",
      "This plan has no current external coach action.",
    );
  }
  if (
    input.responseType === "ask_question" &&
    !resolved.model.coach.contactEmail
  ) {
    throw new RequestError(
      409,
      "coach_contact_unavailable",
      "Coach contact is unavailable for this plan.",
    );
  }

  const db = getDb();
  const occurredAt = new Date();
  const consentRequirements = configuredRoadmapAccessRequirements(resolved.golferId);
  await pauseAtSyntheticConcurrencyBarrier(
    "golfer-response-after-replay-preflight",
  );
  try {
    await db.batch([
      consentGrantTransactionGuard(
        resolved.accountId,
        consentRequirements,
      ),
      db
      .update(shareSessions)
      .set({
        // The response and its audit record may commit only while this exact
        // session still resolves to an active, current publication. The
        // token_hash constraint turns a lost revoke/expiry race into a full
        // transaction rollback.
        tokenHash: sql<string>`case when
          ${shareSessions.revokedAt} is null
          and ${shareSessions.expiresAt} > ${occurredAt.getTime()}
          and exists (
            select 1
            from ${shareLinks}
            join ${developmentPlans}
              on ${developmentPlans.accountId} = ${shareLinks.accountId}
             and ${developmentPlans.id} = ${shareLinks.planId}
            where ${shareLinks.accountId} = ${shareSessions.accountId}
              and ${shareLinks.id} = ${shareSessions.shareLinkId}
              and ${shareLinks.status} = 'active'
              and (${shareLinks.expiresAt} is null or ${shareLinks.expiresAt} > ${occurredAt.getTime()})
              and ${developmentPlans.status} in ('published', 'paused', 'completed')
              and ${developmentPlans.publishedRevision} = ${shareLinks.planRevision}
          )
          then ${shareSessions.tokenHash} else null end`,
        updatedAt: occurredAt,
      })
      .where(
        and(
          eq(shareSessions.accountId, resolved.accountId),
          eq(shareSessions.id, resolved.sessionId),
        ),
      ),
      db.insert(golferPlanResponses).values({
      id: responseId,
      accountId: resolved.accountId,
      planId: resolved.model.plan.id,
      shareLinkId: resolved.shareId,
      responseType: input.responseType,
      note: null,
      externalOutcomeObserved: false,
      occurredAt,
    }),
      db.insert(auditEvents).values({
      id: receiptId,
      accountId: resolved.accountId,
      actorType: "golfer_share",
      actorReference: resolved.shareId,
      action: "golfer.response_recorded",
      targetType: "development_plan",
      targetId: resolved.model.plan.id,
      outcome: "success",
      requestId: input.requestId ?? null,
      metadata: {
        responseType: input.responseType,
        externalOutcomeObserved: false,
        inputFingerprint,
        responseId,
      },
      }),
    ]);
  } catch (error) {
    const racedReplay = await replayGolferResponseReceipt({
      accountId: resolved.accountId,
      planId: resolved.model.plan.id,
      shareId: resolved.shareId,
      receiptId,
      responseId,
      responseType: input.responseType,
      inputFingerprint,
    });
    if (racedReplay) return racedReplay;
    if (!(await resolveShareSession(input.rawSessionToken))) {
      throw new RequestError(404, "plan_unavailable", "This private plan is unavailable.");
    }
    throw error;
  }

  return {
    response: {
      id: responseId,
      responseType: input.responseType,
      occurredAt: occurredAt.getTime(),
    },
    replayed: false,
  };
}

async function replayGolferResponseReceipt(input: {
  accountId: string;
  planId: string;
  shareId: string;
  receiptId: string;
  responseId: string;
  responseType: GolferResponseType;
  inputFingerprint: string;
}): Promise<{ response: PlanResponseSummary; replayed: true } | null> {
  const db = getDb();
  const [receipt] = await db
    .select({
      targetId: auditEvents.targetId,
      metadata: auditEvents.metadata,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.id, input.receiptId),
        eq(auditEvents.accountId, input.accountId),
        eq(auditEvents.actorType, "golfer_share"),
        eq(auditEvents.actorReference, input.shareId),
        eq(auditEvents.action, "golfer.response_recorded"),
        eq(auditEvents.outcome, "success"),
      ),
    )
    .limit(1);
  if (!receipt) return null;
  if (receipt.metadata?.inputFingerprint !== input.inputFingerprint) {
    throw new RequestError(
      409,
      "idempotency_key_reused",
      "This Idempotency-Key was already used for a different golfer response.",
    );
  }
  if (
    receipt.targetId !== input.planId ||
    receipt.metadata?.responseId !== input.responseId
  ) {
    throw new Error("The golfer response receipt target is invalid.");
  }

  const [stored] = await db
    .select({
      id: golferPlanResponses.id,
      accountId: golferPlanResponses.accountId,
      planId: golferPlanResponses.planId,
      shareLinkId: golferPlanResponses.shareLinkId,
      responseType: golferPlanResponses.responseType,
      occurredAt: golferPlanResponses.occurredAt,
    })
    .from(golferPlanResponses)
    .where(
      and(
        eq(golferPlanResponses.id, input.responseId),
        eq(golferPlanResponses.accountId, input.accountId),
      ),
    )
    .limit(1);
  if (
    !stored ||
    stored.planId !== input.planId ||
    stored.shareLinkId !== input.shareId
  ) {
    throw new Error("The golfer response receipt target is unavailable.");
  }
  if (stored.responseType !== input.responseType) {
    throw new RequestError(
      409,
      "idempotency_key_reused",
      "This Idempotency-Key was already used for a different golfer response.",
    );
  }
  const occurredAt = toMillis(stored.occurredAt);
  if (occurredAt === null) {
    throw new Error("The golfer response receipt timestamp is invalid.");
  }
  return {
    response: {
      id: stored.id,
      responseType: stored.responseType as GolferResponseType,
      occurredAt,
    },
    replayed: true,
  };
}

async function assemblePlanView(
  accountId: string,
  plan: typeof developmentPlans.$inferSelect,
  access?: PlanViewModel["access"],
): Promise<PlanViewModel | null> {
  const db = getDb();
  const [
    golferRows,
    profileRows,
    goalRows,
    assessmentRows,
    priorityRows,
    phaseRows,
    reviewRows,
  ] = await Promise.all([
    db.select().from(golfers).where(and(eq(golfers.accountId, accountId), eq(golfers.id, plan.golferId))).limit(1),
    db.select().from(instructorProfiles).where(eq(instructorProfiles.accountId, accountId)).limit(1),
    db.select().from(golferGoals).where(and(eq(golferGoals.accountId, accountId), eq(golferGoals.planId, plan.id), eq(golferGoals.isPrimary, true))).orderBy(desc(golferGoals.updatedAt)).limit(1),
    db.select().from(assessments).where(and(eq(assessments.accountId, accountId), eq(assessments.planId, plan.id))).orderBy(desc(assessments.updatedAt)).limit(1),
    db.select().from(planPriorities).where(and(eq(planPriorities.accountId, accountId), eq(planPriorities.planId, plan.id), eq(planPriorities.isCurrent, true))).orderBy(asc(planPriorities.sortOrder)).limit(1),
    db.select().from(planPhases).where(and(eq(planPhases.accountId, accountId), eq(planPhases.planId, plan.id))).orderBy(asc(planPhases.sequence)).limit(PLAN_PHASE_CAP + 1),
    db.select().from(phaseReviews).where(and(eq(phaseReviews.accountId, accountId), eq(phaseReviews.planId, plan.id), inArray(phaseReviews.status, ["confirmed", "shared"]))).orderBy(desc(phaseReviews.updatedAt)).limit(1),
  ]);

  const golfer = golferRows[0];
  const profile = profileRows[0];
  const goal = goalRows[0];
  const assessment = assessmentRows[0];
  const priority = priorityRows[0];
  const review = reviewRows[0];
  if (!golfer || !profile || !goal || !assessment) return null;
  if (phaseRows.length > PLAN_PHASE_CAP) return null;

  const currentOrRecommendedPhase =
    phaseRows.find((phase) => phase.status === "active") ??
    phaseRows.find((phase) => phase.status === "paused") ??
    phaseRows.find((phase) => phase.isRecommended) ??
    [...phaseRows].reverse().find((phase) => phase.status === "complete") ??
    phaseRows[0];
  const currentPhaseId = currentOrRecommendedPhase?.id;
  const [selectedLessonRows, practiceRows, evidenceRows] = await Promise.all([
    db
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.accountId, accountId),
          eq(lessons.planId, plan.id),
          eq(lessons.status, "completed"),
        ),
      )
      .orderBy(
        currentPhaseId
          ? sql`case when ${lessons.phaseId} = ${currentPhaseId} then 0 else 1 end`
          : sql`0`,
        desc(lessons.sequence),
      )
      .limit(PLAN_LESSON_SNAPSHOT_CAP),
    db
      .select()
      .from(practiceItems)
      .where(
        and(
          eq(practiceItems.accountId, accountId),
          eq(practiceItems.planId, plan.id),
          inArray(practiceItems.status, ["active", "completed", "paused"]),
        ),
      )
      .orderBy(
        currentPhaseId
          ? sql`case when ${practiceItems.phaseId} = ${currentPhaseId} then 0 else 1 end`
          : sql`0`,
        sql`case ${practiceItems.status}
          when 'active' then 0
          when 'paused' then 1
          else 2
        end`,
        desc(practiceItems.updatedAt),
        desc(practiceItems.createdAt),
        desc(practiceItems.id),
      )
      .limit(PLAN_PRACTICE_SNAPSHOT_CAP),
    db
      .select()
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.accountId, accountId),
          eq(evidenceItems.planId, plan.id),
          eq(evidenceItems.status, "published"),
        ),
      )
      .orderBy(
        currentPhaseId
          ? sql`case when ${evidenceItems.phaseId} = ${currentPhaseId} then 0 else 1 end`
          : sql`0`,
        desc(evidenceItems.observedAt),
        desc(evidenceItems.updatedAt),
        desc(evidenceItems.id),
      )
      .limit(PLAN_EVIDENCE_SNAPSHOT_CAP),
  ]);
  // Lesson selection is current-phase-first, but the selected chapters remain
  // chronological in the rendered story.
  const lessonRows = [...selectedLessonRows].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const [
    practiceSnapshotRows,
    checkInRows,
    mediaRows,
    comparisonRows,
    milestoneRows,
    timelineLessonRows,
    timelinePracticeRows,
    timelineReviewRows,
    launchSessionRows,
  ] = await Promise.all([
    practiceRows.length
      ? db
          .select()
          .from(practiceAssignmentSnapshots)
          .where(
            and(
              eq(practiceAssignmentSnapshots.accountId, accountId),
              eq(practiceAssignmentSnapshots.planId, plan.id),
              inArray(
                practiceAssignmentSnapshots.practiceItemId,
                practiceRows.map((row) => row.id),
              ),
            ),
          )
      : Promise.resolve([]),
    db
      .select()
      .from(practiceCheckIns)
      .where(
        and(
          eq(practiceCheckIns.accountId, accountId),
          eq(practiceCheckIns.planId, plan.id),
        ),
      )
      .orderBy(desc(practiceCheckIns.occurredAt), desc(practiceCheckIns.id))
      .limit(100),
    db
      .select({
        attachment: contentMediaAttachments,
        asset: mediaAssets,
        details: mediaAssetDetails,
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
      .leftJoin(
        mediaAssetDetails,
        and(
          eq(mediaAssetDetails.accountId, mediaAssets.accountId),
          eq(mediaAssetDetails.mediaAssetId, mediaAssets.id),
        ),
      )
      .where(
        and(
          eq(contentMediaAttachments.accountId, accountId),
          eq(contentMediaAttachments.planId, plan.id),
          eq(contentMediaAttachments.status, "active"),
        ),
      )
      .orderBy(asc(contentMediaAttachments.sortOrder), asc(contentMediaAttachments.createdAt))
      .limit(PLAN_MEDIA_SNAPSHOT_CAP),
    db
      .select()
      .from(launchMonitorComparisonGroups)
      .where(
        and(
          eq(launchMonitorComparisonGroups.accountId, accountId),
          eq(launchMonitorComparisonGroups.planId, plan.id),
          eq(launchMonitorComparisonGroups.status, "active"),
        ),
      )
      .orderBy(desc(launchMonitorComparisonGroups.createdAt))
      .limit(PLAN_COMPARISON_SNAPSHOT_CAP),
    db
      .select()
      .from(milestones)
      .where(
        and(
          eq(milestones.accountId, accountId),
          eq(milestones.planId, plan.id),
          eq(milestones.status, "published"),
        ),
      )
      .orderBy(desc(milestones.occurredAt))
      .limit(20),
    db
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.accountId, accountId),
          eq(lessons.planId, plan.id),
          inArray(lessons.status, ["planned", "scheduled", "completed", "canceled"]),
        ),
      )
      .orderBy(desc(lessons.updatedAt))
      .limit(30),
    db
      .select()
      .from(practiceItems)
      .where(
        and(eq(practiceItems.accountId, accountId), eq(practiceItems.planId, plan.id)),
      )
      .orderBy(desc(practiceItems.updatedAt))
      .limit(30),
    db
      .select()
      .from(phaseReviews)
      .where(
        and(
          eq(phaseReviews.accountId, accountId),
          eq(phaseReviews.planId, plan.id),
          inArray(phaseReviews.status, ["confirmed", "shared", "superseded"]),
        ),
      )
      .orderBy(desc(phaseReviews.updatedAt), desc(phaseReviews.id))
      .limit(20),
    db
      .select()
      .from(launchMonitorSessions)
      .where(
        and(
          eq(launchMonitorSessions.accountId, accountId),
          eq(launchMonitorSessions.planId, plan.id),
          eq(launchMonitorSessions.status, "committed"),
        ),
      )
      .orderBy(desc(launchMonitorSessions.sessionDate))
      .limit(20),
  ]);
  const lessonSummaryMetricRows = launchSessionRows.length
    ? await db
        .select({
          id: launchMonitorMetrics.id,
          sessionId: launchMonitorMetrics.sessionId,
          displayName: launchMonitorMetrics.displayName,
          numericValue: launchMonitorMetrics.numericValue,
          unit: launchMonitorMetrics.unit,
        })
        .from(launchMonitorMetrics)
        .where(
          and(
            eq(launchMonitorMetrics.accountId, accountId),
            inArray(
              launchMonitorMetrics.sessionId,
              launchSessionRows.map((row) => row.id),
            ),
            eq(launchMonitorMetrics.isSummary, true),
            eq(launchMonitorMetrics.isGolferFacing, true),
          ),
        )
        .orderBy(asc(launchMonitorMetrics.sortOrder), asc(launchMonitorMetrics.id))
    : [];
  const reviewSourceRows = review
    ? await db
        .select()
        .from(phaseReviewSources)
        .where(
          and(
            eq(phaseReviewSources.accountId, accountId),
            eq(phaseReviewSources.planId, plan.id),
            eq(phaseReviewSources.phaseReviewId, review.id),
          ),
        )
        .orderBy(asc(phaseReviewSources.sortOrder), asc(phaseReviewSources.id))
        .limit(100)
    : [];
  const reviewCheckInIds = reviewSourceRows.flatMap((row) =>
    row.practiceCheckInId ? [row.practiceCheckInId] : [],
  );
  const reviewCheckInRows = reviewCheckInIds.length
    ? await db
        .select({
          id: practiceCheckIns.id,
          practiceItemId: practiceCheckIns.practiceItemId,
          completionStatus: practiceCheckIns.completionStatus,
          occurredAt: practiceCheckIns.occurredAt,
        })
        .from(practiceCheckIns)
        .where(
          and(
            eq(practiceCheckIns.accountId, accountId),
            eq(practiceCheckIns.planId, plan.id),
            inArray(practiceCheckIns.id, reviewCheckInIds),
          ),
        )
    : [];
  const reviewPracticeIds = new Set([
    ...reviewSourceRows.flatMap((row) =>
      row.practiceItemId ? [row.practiceItemId] : [],
    ),
    ...reviewCheckInRows.map((row) => row.practiceItemId),
  ]);
  const reviewLessonIds = reviewSourceRows.flatMap((row) =>
    row.lessonId ? [row.lessonId] : [],
  );
  const reviewMediaIds = reviewSourceRows.flatMap((row) =>
    row.mediaAssetId ? [row.mediaAssetId] : [],
  );
  const reviewSessionIds = reviewSourceRows.flatMap((row) =>
    row.launchMonitorSessionId ? [row.launchMonitorSessionId] : [],
  );
  const reviewComparisonIds = reviewSourceRows.flatMap((row) =>
    row.launchMonitorComparisonGroupId ? [row.launchMonitorComparisonGroupId] : [],
  );
  const reviewEvidenceIds = reviewSourceRows.flatMap((row) =>
    row.evidenceItemId ? [row.evidenceItemId] : [],
  );
  const [
    reviewLessonRows,
    reviewPracticeRows,
    reviewMediaRows,
    reviewSessionRows,
    reviewComparisonRows,
    reviewEvidenceRows,
  ] = await Promise.all([
    reviewLessonIds.length
      ? db
          .select({ id: lessons.id, title: lessons.title })
          .from(lessons)
          .where(
            and(
              eq(lessons.accountId, accountId),
              eq(lessons.planId, plan.id),
              inArray(lessons.id, reviewLessonIds),
            ),
          )
      : Promise.resolve([]),
    reviewPracticeIds.size
      ? db
          .select({ id: practiceItems.id, title: practiceItems.title })
          .from(practiceItems)
          .where(
            and(
              eq(practiceItems.accountId, accountId),
              eq(practiceItems.planId, plan.id),
              inArray(practiceItems.id, [...reviewPracticeIds]),
            ),
          )
      : Promise.resolve([]),
    reviewMediaIds.length
      ? db
          .select({
            id: mediaAssets.id,
            caption: mediaAssets.caption,
            altText: mediaAssets.altText,
            originalFilename: mediaAssets.originalFilename,
          })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.accountId, accountId),
              inArray(mediaAssets.id, reviewMediaIds),
            ),
          )
      : Promise.resolve([]),
    reviewSessionIds.length
      ? db
          .select({
            id: launchMonitorSessions.id,
            sessionDate: launchMonitorSessions.sessionDate,
            deviceSource: launchMonitorSessions.deviceSource,
            club: launchMonitorSessions.club,
          })
          .from(launchMonitorSessions)
          .where(
            and(
              eq(launchMonitorSessions.accountId, accountId),
              eq(launchMonitorSessions.planId, plan.id),
              inArray(launchMonitorSessions.id, reviewSessionIds),
            ),
          )
      : Promise.resolve([]),
    reviewComparisonIds.length
      ? db
          .select({ id: launchMonitorComparisonGroups.id, title: launchMonitorComparisonGroups.title })
          .from(launchMonitorComparisonGroups)
          .where(
            and(
              eq(launchMonitorComparisonGroups.accountId, accountId),
              eq(launchMonitorComparisonGroups.planId, plan.id),
              inArray(launchMonitorComparisonGroups.id, reviewComparisonIds),
            ),
          )
      : Promise.resolve([]),
    reviewEvidenceIds.length
      ? db
          .select({ id: evidenceItems.id, title: evidenceItems.title })
          .from(evidenceItems)
          .where(
            and(
              eq(evidenceItems.accountId, accountId),
              eq(evidenceItems.planId, plan.id),
              inArray(evidenceItems.id, reviewEvidenceIds),
            ),
          )
      : Promise.resolve([]),
  ]);
  const comparisonPairRows = comparisonRows.length
    ? await db
        .select()
        .from(launchMonitorComparisonMetrics)
        .where(
          and(
            eq(launchMonitorComparisonMetrics.accountId, accountId),
            inArray(
              launchMonitorComparisonMetrics.comparisonGroupId,
              comparisonRows.map((row) => row.id),
            ),
          ),
        )
        .orderBy(asc(launchMonitorComparisonMetrics.sortOrder))
    : [];
  const comparisonMetricIds = comparisonPairRows.flatMap((row) => [
    row.baselineMetricId,
    row.currentMetricId,
  ]);
  const comparisonValueRows = comparisonMetricIds.length
    ? await db
        .select({ id: launchMonitorMetrics.id, numericValue: launchMonitorMetrics.numericValue })
        .from(launchMonitorMetrics)
        .where(
          and(
            eq(launchMonitorMetrics.accountId, accountId),
            inArray(launchMonitorMetrics.id, comparisonMetricIds),
          ),
        )
    : [];
  const comparisonValues = new Map(
    comparisonValueRows.map((row) => [row.id, Number(row.numericValue)]),
  );
  const practiceSnapshots = new Map(
    practiceSnapshotRows.map((row) => [row.practiceItemId, row]),
  );
  const checkInsByPractice = new Map<string, typeof checkInRows>();
  for (const checkIn of checkInRows) {
    const existing = checkInsByPractice.get(checkIn.practiceItemId) ?? [];
    existing.push(checkIn);
    checkInsByPractice.set(checkIn.practiceItemId, existing);
  }
  const summaryMetricsBySession = new Map<string, typeof lessonSummaryMetricRows>();
  for (const metric of lessonSummaryMetricRows) {
    const existing = summaryMetricsBySession.get(metric.sessionId) ?? [];
    existing.push(metric);
    summaryMetricsBySession.set(metric.sessionId, existing);
  }
  const lessonTitles = new Map(
    [...timelineLessonRows, ...reviewLessonRows].map((row) => [row.id, row.title]),
  );
  const reviewLessonLabels = new Map(
    reviewLessonRows.map((row) => [row.id, row.title]),
  );
  const reviewPracticeLabels = new Map(
    reviewPracticeRows.map((row) => [row.id, row.title]),
  );
  const reviewCheckInLabels = new Map(
    reviewCheckInRows.map((row) => [
      row.id,
      `${reviewPracticeLabels.get(row.practiceItemId) ?? "Practice"} check-in · ${
        row.completionStatus === "completed" ? "Completed" : "Not completed"
      } · ${formatSourceDate(row.occurredAt)}`,
    ]),
  );
  const reviewMediaLabels = new Map(
    reviewMediaRows.map((row) => [
      row.id,
      row.caption || row.altText || row.originalFilename || "Selected media",
    ]),
  );
  const reviewSessionLabels = new Map(
    reviewSessionRows.map((row) => [
      row.id,
      `${row.deviceSource}${row.club ? ` · ${row.club}` : ""} · ${formatSourceDate(row.sessionDate)}`,
    ]),
  );
  const reviewComparisonLabels = new Map(
    reviewComparisonRows.map((row) => [row.id, row.title]),
  );
  const reviewEvidenceLabels = new Map(
    reviewEvidenceRows.map((row) => [row.id, row.title]),
  );
  const selectedReviewSources = reviewSourceRows.flatMap((source) => {
    const sourceId =
      source.lessonId ??
      source.practiceItemId ??
      source.practiceCheckInId ??
      source.mediaAssetId ??
      source.launchMonitorSessionId ??
      source.launchMonitorComparisonGroupId ??
      source.evidenceItemId;
    if (!sourceId) return [];
    const lessonSnapshot =
      source.sourceType === "lesson"
        ? lessonReviewSourceSnapshot(source.sourceSnapshot)
        : null;
    const label =
      source.sourceType === "lesson"
        ? lessonSnapshot?.lesson.title ?? reviewLessonLabels.get(sourceId)
        : source.sourceType === "practice"
          ? reviewPracticeLabels.get(sourceId)
          : source.sourceType === "practice_check_in"
            ? reviewCheckInLabels.get(sourceId)
            : source.sourceType === "media"
              ? reviewMediaLabels.get(sourceId)
              : source.sourceType === "launch_session"
                ? reviewSessionLabels.get(sourceId)
                : source.sourceType === "launch_comparison"
                  ? reviewComparisonLabels.get(sourceId)
                  : reviewEvidenceLabels.get(sourceId);
    return [
      {
        id: sourceId,
        sourceType: source.sourceType,
        label: label ?? `${source.sourceType.replaceAll("_", " ")} record`,
        sourcePlanRevision: source.sourcePlanRevision,
        summary: lessonSnapshot
          ? lessonSnapshot.lesson.coachObservation ||
            lessonSnapshot.lesson.takeaway ||
            lessonSnapshot.lesson.purpose
          : null,
        associations: lessonSnapshot
          ? [
              ...lessonSnapshot.evidence.map(
                (item) => `Evidence: ${item.title} (${item.evidenceType.replaceAll("_", " ")})`,
              ),
              ...lessonSnapshot.launchSessions.map(
                (session) =>
                  `Measurement session: ${session.deviceSource}${session.club ? ` · ${session.club}` : ""}${session.sessionDate === null ? "" : ` · ${formatSourceDate(session.sessionDate)}`}`,
              ),
            ]
          : [],
      },
    ];
  });
  let packageRow: typeof coachingPackages.$inferSelect | undefined;
  if (currentOrRecommendedPhase?.coachingPackageId) {
    [packageRow] = await db
      .select()
      .from(coachingPackages)
      .where(
        and(
          eq(coachingPackages.accountId, accountId),
          eq(coachingPackages.id, currentOrRecommendedPhase.coachingPackageId),
          eq(coachingPackages.status, "active"),
        ),
      )
      .limit(1);
  }
  const selectedLessonIds = new Set(lessonRows.map((lesson) => lesson.id));
  const selectedPracticeIds = new Set(practiceRows.map((item) => item.id));

  return {
    coach: {
      displayName: profile.displayName,
      businessName: profile.businessName,
      contactEmail: profile.contactEmail,
      accentColor: profile.accentColor,
      logoMediaAssetId: profile.logoMediaAssetId,
      profilePhotoMediaAssetId: profile.profilePhotoMediaAssetId,
    },
    golfer: {
      displayName: golfer.preferredName || golfer.displayName,
      status: golfer.status,
    },
    plan: {
      id: plan.id,
      title: plan.title,
      status: plan.status,
      revision: plan.revision,
      updatedAt: toMillis(plan.updatedAt) ?? Date.now(),
      publishedAt: toMillis(plan.publishedAt),
    },
    goal: {
      statement: goal.desiredOutcome,
      why: goal.whyItMatters,
      context: [goal.context, goal.constraints].filter(Boolean).join("\n\n") || null,
    },
    assessment: {
      summary: assessment.startingPoint,
      strengths: assessment.strengthSummary,
      primaryPattern: assessment.primaryPattern,
      // Keep missing stored content visible to the server-side publication
      // readiness guard. The coach preview may explain the empty state, but a
      // display fallback must never make an incomplete plan publishable.
      limitations: assessment.limitations ?? "",
    },
    priority: priority
      ? { title: priority.title, rationale: priority.rationale || priority.description }
      : null,
    phases: phaseRows.map((phase) => ({
      id: phase.id,
      number: phase.sequence,
      title: phase.title,
      purpose: phase.purpose,
      rationale: phase.rationale,
      progressSignals: phase.progressSignals,
      expectations: phase.expectations,
      estimatedDuration: phase.estimatedDuration,
      status: phase.status,
    })),
    lessons: lessonRows.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      summary: lesson.purpose,
      coachObservation: lesson.coachObservation,
      golferLearning: lesson.golferLearning,
      takeaway: lesson.takeaway,
      nextCheck: lesson.nextCheck,
      phaseConnection: lesson.phaseConnection,
      status: lesson.status,
      scheduledAt: toMillis(lesson.scheduledAt),
      happenedAt: toMillis(lesson.occurredAt),
      selectedEvidence: evidenceRows
        .filter((item) => item.lessonId === lesson.id)
        .map((item) => ({
          id: item.id,
          title: item.title,
          evidenceType: item.evidenceType,
          summary:
            item.interpretation || item.claim || "Evidence recorded without an interpretation.",
        })),
      selectedMeasurements: launchSessionRows
        .filter((session) => session.lessonId === lesson.id)
        .map((session) => ({
          id: session.id,
          label: `${session.deviceSource}${session.club ? ` · ${session.club}` : ""}`,
          deviceSource: session.deviceSource,
          club: session.club,
          sessionDate: toMillis(session.sessionDate) ?? 0,
          coachInterpretation: session.coachInterpretation,
          metrics: (summaryMetricsBySession.get(session.id) ?? []).map((metric) => ({
            displayName: metric.displayName,
            numericValue: Number(metric.numericValue),
            unit: metric.unit,
          })),
        })),
    })),
    practiceItems: practiceRows.map((item) => {
      const snapshot = practiceSnapshots.get(item.id);
      return {
        id: item.id,
        title: item.title,
        instructions: item.instructions.join("\n"),
        dosage: item.timeOrCadence,
        successSignal: item.successCheck,
        status: item.status,
        purpose: snapshot?.purpose ?? item.objective,
        whenItFits: snapshot?.whenItFits ?? item.rationale,
        equipment: snapshot?.equipment ?? [],
        setup: snapshot?.setup ?? null,
        steps: snapshot?.steps ?? item.instructions,
        feelOrCue: snapshot?.feelOrCue ?? null,
        commonMiss: snapshot?.commonMiss ?? item.commonMistake,
        stopOrAskRule: snapshot?.stopOrAskRule ?? item.stopOrAskRule,
        constraintOrAdaptation:
          snapshot?.constraintOrAdaptation ?? item.constraintNote,
        progression: snapshot?.progression ?? null,
        regression: snapshot?.regression ?? null,
        dueAt: toMillis(item.dueAt),
        checkIns: (checkInsByPractice.get(item.id) ?? []).map((checkIn) => ({
          id: checkIn.id,
          completionStatus: checkIn.completionStatus,
          perceivedDifficulty: checkIn.perceivedDifficulty,
          confidenceRating: checkIn.confidenceRating,
          note: checkIn.note,
          requestHelp: checkIn.requestHelp,
          occurredAt: toMillis(checkIn.occurredAt) ?? 0,
        })),
      };
    }),
    evidenceItems: evidenceRows.map((item) => ({
      id: item.id,
      title: item.title,
      summary:
        item.interpretation || item.claim || "Evidence recorded without an interpretation.",
      sourceLabel: item.sourceLabel,
      sourceType: item.sourceType,
      contextType: item.contextType,
      maturity: item.maturity,
      limitations: item.limitation,
      nextEvidenceNeeded: item.nextEvidenceNeeded,
      observedAt: toMillis(item.observedAt),
      evidenceType: item.evidenceType,
      comparisonRole: item.comparisonRole,
      comparisonGroupId: item.comparisonGroupId,
      metricName: item.metricName,
      metricValue: item.metricValue,
      metricUnit: item.metricUnit,
      valueText: item.valueText,
      isRepresentative: item.isRepresentative,
      lessonId: item.lessonId,
      lessonTitle: item.lessonId ? lessonTitles.get(item.lessonId) ?? null : null,
    })),
    phaseReview: review
      ? {
          summary: review.changeSummary || review.coachConclusion,
          originalPurpose: review.originalPurpose,
          evidenceSummary: review.workCompleted,
          reliabilityLabel: review.reliabilityLabel,
          limitations: review.limitations,
          golferContribution: review.golferContribution,
          coachConclusion: review.coachConclusion,
          remainingOpportunity: review.remainingOpportunity,
          nextRecommendation: review.nextPhaseRationale || review.independentPracticeAlternative,
          decisionStatus: review.outcome,
          sources: selectedReviewSources,
        }
      : null,
    mediaItems: mediaRows.map(({ attachment, asset, details }) => ({
      attachmentId: attachment.id,
      mediaAssetId: asset.id,
      mediaKind: asset.mediaKind,
      mimeType: asset.mimeType,
      altText: asset.altText,
      caption: asset.caption,
      transcript: asset.transcript,
      widthPixels: asset.widthPixels,
      heightPixels: asset.heightPixels,
      durationMs: asset.durationMs,
      capturedAt: toMillis(details?.capturedAt),
      orientation: details?.orientation ?? "unknown",
      viewLabel: details?.viewLabel,
      coachContext: attachment.coachContext ?? details?.coachContext,
      posterMediaAssetId: details?.posterMediaAssetId,
      targetType: attachment.targetType,
      targetLabel: targetLabelForAttachment(attachment, {
        assessmentId: assessment.id,
        lessons: lessonRows,
        practice: practiceRows,
        evidence: evidenceRows,
        reviewId: review?.id ?? null,
      }),
      role: attachment.attachmentRole,
    })),
    launchComparisons: comparisonRows.map((comparison) => ({
      id: comparison.id,
      title: comparison.title,
      coachInterpretation: comparison.coachInterpretation,
      limitations: comparison.limitations,
      nextEvidenceNeeded: comparison.nextEvidenceNeeded,
      metrics: comparisonPairRows
        .filter((pair) => pair.comparisonGroupId === comparison.id)
        .flatMap((pair) => {
          const baselineValue = comparisonValues.get(pair.baselineMetricId);
          const currentValue = comparisonValues.get(pair.currentMetricId);
          return baselineValue === undefined || currentValue === undefined
            ? []
            : [
                {
                  displayName: pair.displayName,
                  unit: pair.unit,
                  baselineValue,
                  currentValue,
                  delta: currentValue - baselineValue,
                },
              ];
        }),
    })),
    milestones: milestoneRows.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      summary: milestone.summary,
      occurredAt: toMillis(milestone.occurredAt) ?? 0,
    })),
    timeline: [
      ...timelineLessonRows
        .filter(
          (lesson) =>
            lesson.status !== "completed" || selectedLessonIds.has(lesson.id),
        )
        .map((lesson) => ({
        id: lesson.id,
        kind: "lesson",
        title: lesson.title,
        summary: lesson.takeaway ?? lesson.purpose,
        status: lesson.status,
        occurredAt:
          toMillis(lesson.occurredAt) ??
          toMillis(lesson.scheduledAt) ??
          toMillis(lesson.createdAt) ??
          0,
        })),
      ...timelinePracticeRows
        .filter(
          (item) =>
            !["active", "completed", "paused"].includes(item.status) ||
            selectedPracticeIds.has(item.id),
        )
        .map((item) => ({
        id: item.id,
        kind: "practice",
        title: item.title,
        summary: item.objective,
        status: item.status,
        occurredAt:
          toMillis(item.completedAt) ?? toMillis(item.createdAt) ?? 0,
        })),
      ...checkInRows.map((checkIn) => ({
        id: checkIn.id,
        kind: "practice_check_in",
        title: "Practice check-in",
        summary: checkIn.note,
        status: checkIn.requestHelp
          ? "help_requested"
          : checkIn.completionStatus,
        occurredAt: toMillis(checkIn.occurredAt) ?? 0,
      })),
      ...evidenceRows.map((item) => ({
        id: item.id,
        kind: "evidence",
        title: item.title,
        summary: item.interpretation,
        status: item.maturity,
        occurredAt:
          toMillis(item.observedAt) ?? toMillis(item.createdAt) ?? 0,
      })),
      ...launchSessionRows.map((session) => ({
        id: session.id,
        kind: "launch_session",
        title: `${session.deviceSource}${session.club ? ` · ${session.club}` : ""}`,
        summary: session.coachInterpretation,
        status: session.representativeness,
        occurredAt: toMillis(session.sessionDate) ?? 0,
      })),
      ...timelineReviewRows.map((timelineReview) => ({
        id: timelineReview.id,
        kind: "phase_review",
        title: "Phase review",
        summary: timelineReview.coachConclusion,
        status: timelineReview.outcome,
        occurredAt:
          toMillis(timelineReview.sharedAt) ??
          toMillis(timelineReview.confirmedAt) ??
          toMillis(timelineReview.createdAt) ??
          0,
      })),
      ...milestoneRows.map((milestone) => ({
        id: milestone.id,
        kind: "milestone",
        title: milestone.title,
        summary: milestone.summary,
        status: milestone.status,
        occurredAt: toMillis(milestone.occurredAt) ?? 0,
      })),
    ]
      .sort(
        (left, right) =>
          right.occurredAt - left.occurredAt || left.id.localeCompare(right.id),
      )
      .slice(0, PLAN_TIMELINE_SNAPSHOT_CAP),
    coachingPackage: packageRow
      ? {
          title: packageRow.name,
          description: packageRow.fitDescription,
          priceCents: packageRow.priceAmountMinor,
          currency: packageRow.currency,
          currentDetailsText: packageRow.currentDetailsText,
          terms: packageRow.termsSummary,
          inclusions: packageRow.inclusions,
          cadence: packageRow.cadence,
          practiceExpectation: packageRow.practiceExpectation,
          evaluationDescription: packageRow.evaluationDescription,
          externalActionUrl: packageRow.externalActionUrl,
        }
      : null,
    access,
  };
}

type LessonReviewSourceSnapshot = {
  lesson: {
    title: string;
    purpose: string;
    coachObservation: string | null;
    takeaway: string | null;
  };
  evidence: Array<{ id: string; title: string; evidenceType: string }>;
  launchSessions: Array<{
    id: string;
    deviceSource: string;
    club: string | null;
    sessionDate: number | null;
  }>;
};

function lessonReviewSourceSnapshot(value: unknown): LessonReviewSourceSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  if (snapshot.version !== "lesson-review-source-v1") return null;
  const lesson = snapshot.lesson;
  if (!lesson || typeof lesson !== "object" || Array.isArray(lesson)) return null;
  const lessonRecord = lesson as Record<string, unknown>;
  if (typeof lessonRecord.title !== "string" || typeof lessonRecord.purpose !== "string") {
    return null;
  }
  const evidence = Array.isArray(snapshot.evidence) ? snapshot.evidence : [];
  const launchSessions = Array.isArray(snapshot.launchSessions)
    ? snapshot.launchSessions
    : [];
  if (
    evidence.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        typeof (item as Record<string, unknown>).id !== "string" ||
        typeof (item as Record<string, unknown>).title !== "string" ||
        typeof (item as Record<string, unknown>).evidenceType !== "string",
    ) ||
    launchSessions.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        typeof (item as Record<string, unknown>).id !== "string" ||
        typeof (item as Record<string, unknown>).deviceSource !== "string",
    )
  ) {
    return null;
  }
  return {
    lesson: {
      title: lessonRecord.title,
      purpose: lessonRecord.purpose,
      coachObservation:
        typeof lessonRecord.coachObservation === "string"
          ? lessonRecord.coachObservation
          : null,
      takeaway:
        typeof lessonRecord.takeaway === "string" ? lessonRecord.takeaway : null,
    },
    evidence: evidence as LessonReviewSourceSnapshot["evidence"],
    launchSessions: launchSessions.map((item) => {
      const record = item as Record<string, unknown>;
      return {
        id: record.id as string,
        deviceSource: record.deviceSource as string,
        club: typeof record.club === "string" ? record.club : null,
        sessionDate:
          typeof record.sessionDate === "number" && Number.isSafeInteger(record.sessionDate)
            ? record.sessionDate
            : null,
      };
    }),
  };
}

function targetLabelForAttachment(
  attachment: typeof contentMediaAttachments.$inferSelect,
  context: {
    assessmentId: string;
    lessons: Array<typeof lessons.$inferSelect>;
    practice: Array<typeof practiceItems.$inferSelect>;
    evidence: Array<typeof evidenceItems.$inferSelect>;
    reviewId: string | null;
  },
): string {
  if (
    attachment.targetType === "assessment" &&
    attachment.assessmentId === context.assessmentId
  ) {
    return "Starting assessment";
  }
  if (attachment.targetType === "lesson" && attachment.lessonId) {
    return (
      context.lessons.find((lesson) => lesson.id === attachment.lessonId)?.title ??
      "Lesson"
    );
  }
  if (attachment.targetType === "practice" && attachment.practiceItemId) {
    return (
      context.practice.find((item) => item.id === attachment.practiceItemId)?.title ??
      "Practice assignment"
    );
  }
  if (attachment.targetType === "evidence" && attachment.evidenceItemId) {
    return (
      context.evidence.find((item) => item.id === attachment.evidenceItemId)?.title ??
      "Progress evidence"
    );
  }
  if (
    attachment.targetType === "phase_review" &&
    attachment.phaseReviewId === context.reviewId
  ) {
    return "Phase review";
  }
  return attachment.label || "Coaching context";
}

function toMillis(value: Date | number | null | undefined): number | null {
  if (value == null) return null;
  return value instanceof Date ? value.getTime() : value;
}

function formatSourceDate(value: Date | number): string {
  const epoch = toMillis(value);
  return epoch === null ? "Date unavailable" : new Date(epoch).toISOString().slice(0, 10);
}

function requiredShareTimestamp(value: Date | number): number {
  const epoch = toMillis(value);
  if (
    epoch === null ||
    !Number.isSafeInteger(epoch) ||
    epoch < 0
  ) {
    throw new RequestError(
      503,
      "share_history_unavailable",
      "The authoritative sharing history is temporarily unavailable.",
    );
  }
  return epoch;
}

function effectiveShareStatus(
  row: {
    status: "active" | "revoked" | "expired";
    expiresAt: Date | number | null;
  },
  nowMs: number,
): "active" | "revoked" | "expired" {
  if (
    row.status === "active" &&
    row.expiresAt !== null &&
    requiredShareTimestamp(row.expiresAt) <= nowMs
  ) {
    return "expired";
  }
  return row.status;
}
