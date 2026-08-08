import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assessments,
  auditEvents,
  coachingPackages,
  developmentPlans,
  evidenceItems,
  golferGoals,
  golferPlanResponses,
  golfers,
  instructorProfiles,
  lessons,
  phaseReviews,
  planPhases,
  planPriorities,
  practiceItems,
  shareLinks,
} from "@/db/schema";
import type { PlanViewModel } from "@/components/plan/types";
import { RequestError } from "./http";
import { createShareToken, hashToken, newId } from "./tokens";

const DEFAULT_SHARE_DAYS = 30;

export type PlanShareSummary = {
  id: string;
  status: string;
  planRevision: number;
  createdAt: number;
  expiresAt: number | null;
  lastAccessedAt: number | null;
  accessCount: number;
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
  const db = getDb();
  const rows = await db
    .select({
      id: shareLinks.id,
      status: shareLinks.status,
      planRevision: shareLinks.planRevision,
      createdAt: shareLinks.createdAt,
      expiresAt: shareLinks.expiresAt,
      lastAccessedAt: shareLinks.lastAccessedAt,
      accessCount: shareLinks.accessCount,
    })
    .from(shareLinks)
    .where(
      and(eq(shareLinks.accountId, accountId), eq(shareLinks.planId, planId)),
    )
    .orderBy(desc(shareLinks.createdAt))
    .limit(20);

  const now = Date.now();

  return rows.map((row) => ({
    ...row,
    status:
      row.status === "active" &&
      row.expiresAt !== null &&
      (toMillis(row.expiresAt) ?? 0) <= now
        ? "expired"
        : row.status,
    createdAt: toMillis(row.createdAt) ?? Date.now(),
    expiresAt: toMillis(row.expiresAt),
    lastAccessedAt: toMillis(row.lastAccessedAt),
  }));
}

export async function listPlanResponses(
  accountId: string,
  planId: string,
): Promise<PlanResponseSummary[]> {
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
    .orderBy(desc(developmentPlans.updatedAt))
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
}): Promise<{ shareId: string; rawToken: string; expiresAt: Date }> {
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

  const days = input.expiresInDays ?? DEFAULT_SHARE_DAYS;
  if (![1, 7, 30, 90].includes(days)) {
    throw new RequestError(400, "invalid_expiry", "Share expiry must be 1, 7, 30, or 90 days.");
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 86_400_000);
  const share = await createShareToken();
  const shareId = newId();
  const revision = Math.max(plan.revision, 1);

  await db.batch([
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

  return { shareId, rawToken: share.raw, expiresAt };
}

export async function revokeShareLink(input: {
  accountId: string;
  shareId: string;
  reason: string;
  requestId?: string | null;
}): Promise<void> {
  const db = getDb();
  const [link] = await db
    .select({ id: shareLinks.id, planId: shareLinks.planId })
    .from(shareLinks)
    .where(and(eq(shareLinks.accountId, input.accountId), eq(shareLinks.id, input.shareId)))
    .limit(1);
  if (!link) throw new RequestError(404, "share_not_found", "Share link not found.");

  const now = new Date();
  await db.batch([
    db
      .update(shareLinks)
      .set({ status: "revoked", revokedAt: now, revokeReason: input.reason, updatedAt: now })
      .where(and(eq(shareLinks.accountId, input.accountId), eq(shareLinks.id, input.shareId))),
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
}

export async function resolveShareToken(
  rawToken: string,
  options: { recordAccess?: boolean; requestId?: string | null } = {},
): Promise<{
  model: PlanViewModel;
  accountId: string;
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

  const model = await assemblePlanView(link.accountId, plan, {
    expiresAt: toMillis(link.expiresAt),
    sharedAt: toMillis(link.createdAt),
  });
  if (!model) return null;

  if (options.recordAccess) {
    await db.batch([
      db
        .update(shareLinks)
        .set({
          lastAccessedAt: now,
          accessCount: sql`${shareLinks.accessCount} + 1`,
          updatedAt: now,
        })
        .where(eq(shareLinks.id, link.id)),
      db.insert(auditEvents).values({
        id: newId(),
        accountId: link.accountId,
        actorType: "golfer_share",
        actorReference: link.id,
        action: "share.access",
        targetType: "development_plan",
        targetId: link.planId,
        outcome: "success",
        requestId: options.requestId ?? null,
        metadata: { shareId: link.id, planRevision: link.planRevision },
      }),
    ]);
  }

  return {
    model,
    accountId: link.accountId,
    shareId: link.id,
    expiresAt: link.expiresAt,
  };
}

export async function recordGolferResponse(input: {
  rawToken: string;
  responseType: GolferResponseType;
  requestId?: string | null;
}): Promise<PlanResponseSummary> {
  const resolved = await resolveShareToken(input.rawToken);
  if (!resolved) {
    throw new RequestError(404, "plan_unavailable", "This private plan is unavailable.");
  }
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
  const id = newId();
  const occurredAt = new Date();
  await db.batch([
    db.insert(golferPlanResponses).values({
      id,
      accountId: resolved.accountId,
      planId: resolved.model.plan.id,
      shareLinkId: resolved.shareId,
      responseType: input.responseType,
      note: null,
      externalOutcomeObserved: false,
      occurredAt,
    }),
    db.insert(auditEvents).values({
      id: newId(),
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
      },
    }),
  ]);

  return {
    id,
    responseType: input.responseType,
    occurredAt: occurredAt.getTime(),
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
    lessonRows,
    practiceRows,
    evidenceRows,
    reviewRows,
  ] = await Promise.all([
    db.select().from(golfers).where(and(eq(golfers.accountId, accountId), eq(golfers.id, plan.golferId))).limit(1),
    db.select().from(instructorProfiles).where(eq(instructorProfiles.accountId, accountId)).limit(1),
    db.select().from(golferGoals).where(and(eq(golferGoals.accountId, accountId), eq(golferGoals.planId, plan.id), eq(golferGoals.isPrimary, true))).orderBy(desc(golferGoals.updatedAt)).limit(1),
    db.select().from(assessments).where(and(eq(assessments.accountId, accountId), eq(assessments.planId, plan.id))).orderBy(desc(assessments.updatedAt)).limit(1),
    db.select().from(planPriorities).where(and(eq(planPriorities.accountId, accountId), eq(planPriorities.planId, plan.id), eq(planPriorities.isCurrent, true))).orderBy(asc(planPriorities.sortOrder)).limit(1),
    db.select().from(planPhases).where(and(eq(planPhases.accountId, accountId), eq(planPhases.planId, plan.id))).orderBy(asc(planPhases.sequence)),
    db.select().from(lessons).where(and(eq(lessons.accountId, accountId), eq(lessons.planId, plan.id), eq(lessons.status, "completed"))).orderBy(asc(lessons.sequence)),
    db.select().from(practiceItems).where(and(eq(practiceItems.accountId, accountId), eq(practiceItems.planId, plan.id), inArray(practiceItems.status, ["active", "completed", "paused"]))).orderBy(asc(practiceItems.createdAt)),
    db.select().from(evidenceItems).where(and(eq(evidenceItems.accountId, accountId), eq(evidenceItems.planId, plan.id), eq(evidenceItems.status, "published"))).orderBy(desc(evidenceItems.observedAt)),
    db.select().from(phaseReviews).where(and(eq(phaseReviews.accountId, accountId), eq(phaseReviews.planId, plan.id), inArray(phaseReviews.status, ["confirmed", "shared"]))).orderBy(desc(phaseReviews.updatedAt)).limit(1),
  ]);

  const golfer = golferRows[0];
  const profile = profileRows[0];
  const goal = goalRows[0];
  const assessment = assessmentRows[0];
  const priority = priorityRows[0];
  const review = reviewRows[0];
  if (!golfer || !profile || !goal || !assessment) return null;

  const currentOrRecommendedPhase =
    phaseRows.find((phase) => phase.status === "active") ??
    phaseRows.find((phase) => phase.status === "paused") ??
    phaseRows.find((phase) => phase.isRecommended) ??
    [...phaseRows].reverse().find((phase) => phase.status === "complete") ??
    phaseRows[0];
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

  return {
    coach: {
      displayName: profile.displayName,
      businessName: profile.businessName,
      contactEmail: profile.contactEmail,
      accentColor: profile.accentColor,
    },
    golfer: { displayName: golfer.preferredName || golfer.displayName },
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
      limitations:
        assessment.limitations || "No evidence limitations have been recorded yet.",
    },
    priority: priority
      ? { title: priority.title, rationale: priority.rationale || priority.description }
      : null,
    phases: phaseRows.map((phase) => ({
      id: phase.id,
      number: phase.sequence,
      title: phase.title,
      purpose: phase.purpose,
      status: phase.status,
    })),
    lessons: lessonRows.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      summary: lesson.purpose,
      coachObservation: lesson.coachObservation,
      takeaway: lesson.takeaway,
      nextCheck: lesson.nextCheck,
      happenedAt: toMillis(lesson.occurredAt),
    })),
    practiceItems: practiceRows.map((item) => ({
      id: item.id,
      title: item.title,
      instructions: item.instructions.join("\n"),
      dosage: item.timeOrCadence,
      successSignal: item.successCheck,
      status: item.status,
    })),
    evidenceItems: evidenceRows.map((item) => ({
      id: item.id,
      title: item.title,
      summary:
        item.interpretation || item.claim || "Evidence recorded without an interpretation.",
      sourceType: item.sourceType,
      limitations: item.limitation,
      observedAt: toMillis(item.observedAt),
    })),
    phaseReview: review
      ? {
          summary: review.changeSummary || review.coachConclusion,
          evidenceSummary: review.workCompleted,
          limitations: review.limitations,
          nextRecommendation: review.nextPhaseRationale || review.independentPracticeAlternative,
          decisionStatus: review.outcome,
        }
      : null,
    coachingPackage: packageRow
      ? {
          title: packageRow.name,
          description: packageRow.fitDescription,
          priceCents: packageRow.priceAmountMinor,
          currency: packageRow.currency,
          currentDetailsText: packageRow.currentDetailsText,
          terms: packageRow.termsSummary,
          externalActionUrl: packageRow.externalActionUrl,
        }
      : null,
    access,
  };
}

function toMillis(value: Date | number | null | undefined): number | null {
  if (value == null) return null;
  return value instanceof Date ? value.getTime() : value;
}
