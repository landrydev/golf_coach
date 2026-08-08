import { and, asc, eq, gt, inArray, max, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditEvents,
  developmentPlans,
  evidenceItems,
  lessons,
  phaseReviews,
  phasePriorities,
  planPhases,
  planPriorities,
  practiceItems,
  shareLinks,
} from "@/db/schema";
import { RequestError } from "./http";
import { newId } from "./tokens";
import {
  consentGrantRequirementsCurrent,
  consentGrantTransactionGuard,
  type ConsentGrantRequirement,
} from "./consent-repository";

type MutationContext = {
  accountId: string;
  planId: string;
  expectedRevision: number;
  consentRequirements: readonly ConsentGrantRequirement[];
  requestId?: string | null;
};

type PhaseReviewInput = {
  phaseId: string;
  transition: "continue" | "pause" | "advance" | "complete_plan";
  outcome: "complete" | "partially_complete" | "paused" | "revised" | "insufficient_evidence" | "goal_changed";
  originalPurpose: string;
  baselineSummary: string;
  workCompleted: string;
  changeSummary: string;
  reliabilityLabel: string;
  limitations: string;
  golferContribution?: string | null;
  coachConclusion: string;
  remainingOpportunity?: string | null;
  nextPhaseRationale?: string | null;
  independentPracticeAlternative?: string | null;
  nextPhaseId?: string | null;
  nextPriorityTitle?: string | null;
  nextPriorityRationale?: string | null;
};

export async function addCompletedLesson(
  context: MutationContext,
  input: {
    phaseId: string;
    title: string;
    purpose: string;
    coachObservation?: string | null;
    takeaway?: string | null;
    nextCheck?: string | null;
    phaseConnection?: string | null;
    occurredAt: Date;
  },
): Promise<string> {
  const { plan, phase } = await requireOwnedPlanAndPhase(context, input.phaseId);
  const db = getDb();
  const [sequenceRow] = await db
    .select({ value: max(lessons.sequence) })
    .from(lessons)
    .where(and(eq(lessons.accountId, context.accountId), eq(lessons.planId, context.planId)));
  const lessonId = newId();
  const now = new Date();
  await db.batch([
    consentGrantTransactionGuard(
      context.accountId,
      context.consentRequirements,
    ),
    db.insert(lessons).values({
      id: lessonId,
      accountId: context.accountId,
      planId: context.planId,
      phaseId: phase.id,
      sequence: (sequenceRow?.value ?? 0) + 1,
      title: input.title,
      status: guardedStatus(context, "completed"),
      purpose: input.purpose,
      coachObservation: input.coachObservation || null,
      takeaway: input.takeaway || null,
      nextCheck: input.nextCheck || null,
      phaseConnection: input.phaseConnection || null,
      occurredAt: input.occurredAt,
      coachApprovedAt: now,
      completedAt: input.occurredAt,
    }),
    ...invalidationStatements(
      context,
      plan.status === "paused" ? "paused" : "draft",
      "lesson added",
      now,
    ),
    auditStatement(context, "lesson.create", "lesson", lessonId, { phaseId: phase.id }),
  ]);
  return lessonId;
}

export async function addPracticeItem(
  context: MutationContext,
  input: {
    phaseId: string;
    title: string;
    objective: string;
    rationale: string;
    instructions: string[];
    timeOrCadence?: string | null;
    successCheck: string;
    commonMistake?: string | null;
    stopOrAskRule: string;
    constraintNote?: string | null;
  },
): Promise<string> {
  const { plan, phase } = await requireOwnedPlanAndPhase(context, input.phaseId);
  const db = getDb();
  const itemId = newId();
  const now = new Date();
  const currentRevision = currentPlanRevisionExists(context);
  const activePractice = and(
    eq(practiceItems.accountId, context.accountId),
    eq(practiceItems.planId, context.planId),
    eq(practiceItems.status, "active"),
    currentRevision,
  );

  try {
    await db.batch([
      consentGrantTransactionGuard(
        context.accountId,
        context.consentRequirements,
      ),
      replacementRetirementAuditStatement(context, itemId, now),
      db
        .update(practiceItems)
        .set({ status: "retired", retiredAt: now, updatedAt: now })
        .where(activePractice),
      db.insert(practiceItems).values({
        id: itemId,
        accountId: context.accountId,
        planId: context.planId,
        phaseId: phase.id,
        title: input.title,
        status: guardedStatus(context, "active"),
        objective: input.objective,
        rationale: input.rationale,
        instructions: input.instructions,
        timeOrCadence: input.timeOrCadence || null,
        successCheck: input.successCheck,
        commonMistake: input.commonMistake || null,
        stopOrAskRule: input.stopOrAskRule,
        constraintNote: input.constraintNote || null,
        startsAt: now,
        coachApprovedAt: now,
      }),
      ...invalidationStatements(
        context,
        plan.status === "paused" ? "paused" : "draft",
        "practice updated",
        now,
      ),
      auditStatement(context, "practice.create", "practice_item", itemId, {
        phaseId: phase.id,
      }, now),
    ]);
  } catch (error) {
    await rethrowStaleRevision(context, error);
  }
  return itemId;
}

export async function addEvidenceItem(
  context: MutationContext,
  input: {
    phaseId: string;
    evidenceType: "coach_observation" | "golfer_report" | "measurement" | "outcome_count" | "comparison" | "note";
    contextType: "assessment" | "lesson" | "practice" | "on_course" | "phase_review" | "other";
    title: string;
    claim?: string | null;
    sourceLabel: string;
    sourceType: "coach_observed" | "golfer_reported" | "device" | "document" | "mixed";
    observedAt?: Date | null;
    interpretation: string;
    limitation: string;
    maturity: "single_observation" | "early_indication" | "repeated_practice" | "on_course_observation" | "insufficient";
    nextEvidenceNeeded?: string | null;
  },
): Promise<string> {
  const { plan, phase } = await requireOwnedPlanAndPhase(context, input.phaseId);
  const db = getDb();
  const evidenceId = newId();
  const now = new Date();
  await db.batch([
    consentGrantTransactionGuard(
      context.accountId,
      context.consentRequirements,
    ),
    db.insert(evidenceItems).values({
      id: evidenceId,
      accountId: context.accountId,
      planId: context.planId,
      phaseId: phase.id,
      status: guardedStatus(context, "published"),
      evidenceType: input.evidenceType,
      contextType: input.contextType,
      title: input.title,
      claim: input.claim || null,
      sourceLabel: input.sourceLabel,
      sourceType: input.sourceType,
      observedAt: input.observedAt || null,
      comparisonRole: "standalone",
      interpretation: input.interpretation,
      limitation: input.limitation,
      maturity: input.maturity,
      nextEvidenceNeeded: input.nextEvidenceNeeded || null,
      coachApprovedAt: now,
    }),
    ...invalidationStatements(
      context,
      plan.status === "paused" ? "paused" : "draft",
      "evidence updated",
      now,
    ),
    auditStatement(context, "evidence.create", "evidence_item", evidenceId, { phaseId: phase.id }),
  ]);
  return evidenceId;
}

export type WithdrawablePlanContentKind = "lesson" | "practice" | "evidence";

export async function withdrawPlanContent(
  context: MutationContext,
  input: { kind: WithdrawablePlanContentKind; itemId: string },
): Promise<void> {
  const plan = await requireOwnedEditablePlan(context);
  const db = getDb();
  const now = new Date();
  const nextPlanStatus = plan.status === "paused" ? "paused" : "draft";

  if (input.kind === "lesson") {
    const [item] = await db
      .select({ status: lessons.status })
      .from(lessons)
      .where(
        and(
          eq(lessons.accountId, context.accountId),
          eq(lessons.planId, context.planId),
          eq(lessons.id, input.itemId),
        ),
      )
      .limit(1);
    if (!item) throw contentNotFound();
    if (item.status === "archived") throw contentAlreadyWithdrawn();
    try {
      await db.batch([
        consentGrantTransactionGuard(
          context.accountId,
          context.consentRequirements,
        ),
        db
          .update(lessons)
          .set({
            status: guardedStatus(context, "archived"),
            archivedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(lessons.accountId, context.accountId),
              eq(lessons.planId, context.planId),
              eq(lessons.id, input.itemId),
            ),
          ),
        ...invalidationStatements(context, nextPlanStatus, "lesson archived", now),
        auditStatement(context, "lesson.archive", "lesson", input.itemId, {}),
      ]);
    } catch (error) {
      await rethrowStaleRevision(context, error);
    }
    return;
  }

  if (input.kind === "practice") {
    const [item] = await db
      .select({ status: practiceItems.status })
      .from(practiceItems)
      .where(
        and(
          eq(practiceItems.accountId, context.accountId),
          eq(practiceItems.planId, context.planId),
          eq(practiceItems.id, input.itemId),
        ),
      )
      .limit(1);
    if (!item) throw contentNotFound();
    if (item.status === "retired") throw contentAlreadyWithdrawn();
    try {
      await db.batch([
        consentGrantTransactionGuard(
          context.accountId,
          context.consentRequirements,
        ),
        db
          .update(practiceItems)
          .set({
            status: guardedStatus(context, "retired"),
            retiredAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(practiceItems.accountId, context.accountId),
              eq(practiceItems.planId, context.planId),
              eq(practiceItems.id, input.itemId),
            ),
          ),
        ...invalidationStatements(context, nextPlanStatus, "practice retired", now),
        auditStatement(
          context,
          "practice.retire",
          "practice_item",
          input.itemId,
          {},
        ),
      ]);
    } catch (error) {
      await rethrowStaleRevision(context, error);
    }
    return;
  }

  const [item] = await db
    .select({ status: evidenceItems.status })
    .from(evidenceItems)
    .where(
      and(
        eq(evidenceItems.accountId, context.accountId),
        eq(evidenceItems.planId, context.planId),
        eq(evidenceItems.id, input.itemId),
      ),
    )
    .limit(1);
  if (!item) throw contentNotFound();
  if (item.status === "withdrawn" || item.status === "archived") {
    throw contentAlreadyWithdrawn();
  }
  try {
    await db.batch([
      consentGrantTransactionGuard(
        context.accountId,
        context.consentRequirements,
      ),
      db
        .update(evidenceItems)
        .set({
          status: guardedStatus(context, "withdrawn"),
          withdrawnAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(evidenceItems.accountId, context.accountId),
            eq(evidenceItems.planId, context.planId),
            eq(evidenceItems.id, input.itemId),
          ),
        ),
      ...invalidationStatements(context, nextPlanStatus, "evidence withdrawn", now),
      auditStatement(
        context,
        "evidence.withdraw",
        "evidence_item",
        input.itemId,
        {},
      ),
    ]);
  } catch (error) {
    await rethrowStaleRevision(context, error);
  }
}

function contentNotFound(): RequestError {
  return new RequestError(
    404,
    "plan_content_not_found",
    "This plan content item was not found.",
  );
}

function contentAlreadyWithdrawn(): RequestError {
  return new RequestError(
    409,
    "plan_content_already_withdrawn",
    "This plan content item is already withdrawn from the golfer view.",
  );
}

export async function addPhaseReview(
  context: MutationContext,
  input: PhaseReviewInput,
): Promise<{ id: string; planStatus: "draft" | "paused" | "completed"; revision: number }> {
  const { phase } = await requireOwnedPlanAndPhase(context, input.phaseId);
  return transitionPhaseReview(context, phase, input);
}

async function transitionPhaseReview(
  context: MutationContext,
  phase: typeof planPhases.$inferSelect,
  input: PhaseReviewInput,
): Promise<{ id: string; planStatus: "draft" | "paused" | "completed"; revision: number }> {
  if (phase.status !== "active" && phase.status !== "paused") {
    throw new RequestError(
      409,
      "phase_not_reviewable",
      "Only the current active or paused phase can be reviewed.",
    );
  }
  validateReviewTransition(input);

  const db = getDb();
  const [allPhases, allPriorities, linkedPriorities] = await Promise.all([
    db
      .select()
      .from(planPhases)
      .where(and(eq(planPhases.accountId, context.accountId), eq(planPhases.planId, context.planId)))
      .orderBy(asc(planPhases.sequence)),
    db
      .select()
      .from(planPriorities)
      .where(and(eq(planPriorities.accountId, context.accountId), eq(planPriorities.planId, context.planId)))
      .orderBy(asc(planPriorities.sortOrder)),
    db
      .select({ priorityId: phasePriorities.priorityId })
      .from(phasePriorities)
      .where(
        and(
          eq(phasePriorities.accountId, context.accountId),
          eq(phasePriorities.phaseId, phase.id),
        ),
      ),
  ]);
  const linkedPriorityIds = new Set(linkedPriorities.map((item) => item.priorityId));
  const currentPriority =
    allPriorities.find((priority) => priority.status === "active" && priority.isCurrent) ??
    [...allPriorities]
      .reverse()
      .find(
        (priority) =>
          linkedPriorityIds.has(priority.id) &&
          (priority.status === "active" || priority.status === "deferred"),
      );
  const nextPhase = allPhases.find((candidate) => candidate.sequence === phase.sequence + 1);
  if (
    input.transition === "advance" &&
    (!nextPhase || nextPhase.id !== input.nextPhaseId || nextPhase.status !== "planned")
  ) {
    throw new RequestError(
      409,
      "next_phase_unavailable",
      "The selected next phase is no longer the next planned phase. Refresh and review the roadmap.",
    );
  }

  const reviewId = newId();
  const nextPriorityId = input.transition === "advance" ? newId() : null;
  const now = new Date();
  const supersedeReview = db
    .update(phaseReviews)
    .set({ status: "superseded", supersededAt: now, updatedAt: now })
    .where(
      and(
        eq(phaseReviews.accountId, context.accountId),
        eq(phaseReviews.planId, context.planId),
        eq(phaseReviews.phaseId, phase.id),
      ),
    );
  const insertReview = db.insert(phaseReviews).values({
    id: reviewId,
    accountId: context.accountId,
    planId: context.planId,
    phaseId: phase.id,
    nextPhaseId: input.transition === "advance" ? nextPhase!.id : null,
    recommendedPackageId: null,
    status: guardedStatus(context, "confirmed"),
    outcome: input.outcome,
    originalPurpose: input.originalPurpose,
    baselineSummary: input.baselineSummary,
    workCompleted: input.workCompleted,
    changeSummary: input.changeSummary,
    reliabilityLabel: input.reliabilityLabel,
    limitations: input.limitations,
    golferContribution: input.golferContribution || null,
    coachConclusion: input.coachConclusion,
    remainingOpportunity: input.remainingOpportunity || null,
    nextPhaseRationale: input.nextPhaseRationale || null,
    independentPracticeAlternative: input.independentPracticeAlternative || null,
    confirmedAt: now,
  });
  const currentPriorityId = currentPriority?.id ?? "__no_current_priority__";
  const maxPriorityOrder = allPriorities.reduce(
    (highest, priority) => Math.max(highest, priority.sortOrder),
    -1,
  );

  try {
    if (input.transition === "continue") {
      await db.batch([
        consentGrantTransactionGuard(
          context.accountId,
          context.consentRequirements,
        ),
        supersedeReview,
        insertReview,
        db
          .update(planPhases)
          .set({
            status: "active",
            isRecommended: true,
            startedAt: phase.startedAt ?? now,
            pausedAt: null,
            completedAt: null,
            updatedAt: now,
          })
          .where(ownedPhaseWhere(context, phase.id)),
        db
          .update(planPriorities)
          .set({ status: "active", isCurrent: true, resolvedAt: null, updatedAt: now })
          .where(ownedPriorityWhere(context, currentPriorityId)),
        ...invalidationStatements(context, "draft", "phase review continued", now),
        auditStatement(context, "phase_review.transition", "phase_review", reviewId, {
          phaseId: phase.id,
          transition: input.transition,
          outcome: input.outcome,
        }),
      ]);
    } else if (input.transition === "pause") {
      await db.batch([
        consentGrantTransactionGuard(
          context.accountId,
          context.consentRequirements,
        ),
        supersedeReview,
        insertReview,
        db
          .update(planPhases)
          .set({ status: "paused", isRecommended: true, pausedAt: now, updatedAt: now })
          .where(ownedPhaseWhere(context, phase.id)),
        db
          .update(planPriorities)
          .set({ status: "deferred", isCurrent: false, updatedAt: now })
          .where(ownedPriorityWhere(context, currentPriorityId)),
        ...invalidationStatements(context, "paused", "phase review paused", now),
        auditStatement(context, "phase_review.transition", "phase_review", reviewId, {
          phaseId: phase.id,
          transition: input.transition,
          outcome: input.outcome,
        }),
      ]);
    } else if (input.transition === "advance") {
      await db.batch([
        consentGrantTransactionGuard(
          context.accountId,
          context.consentRequirements,
        ),
        supersedeReview,
        insertReview,
        db
          .update(planPhases)
          .set({
            status: "complete",
            isRecommended: false,
            completedAt: now,
            pausedAt: null,
            updatedAt: now,
          })
          .where(ownedPhaseWhere(context, phase.id)),
        db
          .update(planPriorities)
          .set({ status: "resolved", isCurrent: false, resolvedAt: now, updatedAt: now })
          .where(ownedPriorityWhere(context, currentPriorityId)),
        db
          .update(planPhases)
          .set({
            status: "active",
            isRecommended: true,
            rationale: input.nextPhaseRationale!,
            coachApprovedAt: now,
            startedAt: now,
            pausedAt: null,
            completedAt: null,
            updatedAt: now,
          })
          .where(ownedPhaseWhere(context, nextPhase!.id)),
        db.insert(planPriorities).values({
          id: nextPriorityId!,
          accountId: context.accountId,
          planId: context.planId,
          assessmentId: currentPriority?.assessmentId ?? null,
          title: input.nextPriorityTitle!,
          description: input.nextPriorityRationale!,
          rationale: input.nextPriorityRationale!,
          status: "active",
          sortOrder: maxPriorityOrder + 1,
          isCurrent: true,
          coachApprovedAt: now,
        }),
        db.insert(phasePriorities).values({
          accountId: context.accountId,
          phaseId: nextPhase!.id,
          priorityId: nextPriorityId!,
          sortOrder: 0,
        }),
        ...invalidationStatements(context, "draft", "phase advanced", now),
        auditStatement(context, "phase_review.transition", "phase_review", reviewId, {
          phaseId: phase.id,
          nextPhaseId: nextPhase!.id,
          nextPriorityId,
          transition: input.transition,
          outcome: input.outcome,
        }),
      ]);
    } else {
      await db.batch([
        consentGrantTransactionGuard(
          context.accountId,
          context.consentRequirements,
        ),
        supersedeReview,
        insertReview,
        db
          .update(planPhases)
          .set({
            status: "complete",
            isRecommended: false,
            completedAt: now,
            pausedAt: null,
            updatedAt: now,
          })
          .where(ownedPhaseWhere(context, phase.id)),
        db
          .update(planPhases)
          .set({ status: "canceled", isRecommended: false, canceledAt: now, updatedAt: now })
          .where(
            and(
              eq(planPhases.accountId, context.accountId),
              eq(planPhases.planId, context.planId),
              gt(planPhases.sequence, phase.sequence),
              inArray(planPhases.status, ["planned", "paused", "revised"]),
            ),
          ),
        db
          .update(planPriorities)
          .set({ status: "resolved", isCurrent: false, resolvedAt: now, updatedAt: now })
          .where(ownedPriorityWhere(context, currentPriorityId)),
        ...invalidationStatements(context, "completed", "plan completed", now),
        auditStatement(context, "phase_review.transition", "phase_review", reviewId, {
          phaseId: phase.id,
          transition: input.transition,
          outcome: input.outcome,
        }),
      ]);
    }
  } catch (error) {
    await rethrowStaleRevision(context, error);
  }

  return {
    id: reviewId,
    planStatus:
      input.transition === "pause"
        ? "paused"
        : input.transition === "complete_plan"
          ? "completed"
          : "draft",
    revision: context.expectedRevision + 1,
  };
}

function validateReviewTransition(input: PhaseReviewInput) {
  const continuingOutcomes = [
    "partially_complete",
    "revised",
    "insufficient_evidence",
    "goal_changed",
  ] as const;
  if (
    input.transition === "continue" &&
    !continuingOutcomes.includes(input.outcome as (typeof continuingOutcomes)[number])
  ) {
    throw new RequestError(
      400,
      "invalid_review_outcome",
      "Choose a non-final outcome when continuing this phase.",
    );
  }
  if (input.transition === "pause" && input.outcome !== "paused") {
    throw new RequestError(
      400,
      "invalid_review_outcome",
      "A paused phase review must use the paused outcome.",
    );
  }
  if (
    (input.transition === "advance" || input.transition === "complete_plan") &&
    input.outcome !== "complete"
  ) {
    throw new RequestError(
      400,
      "invalid_review_outcome",
      "Advancing or completing the plan requires a complete phase outcome.",
    );
  }
  if (input.transition === "advance") {
    if (
      !input.nextPhaseId ||
      !input.nextPriorityTitle ||
      !input.nextPriorityRationale ||
      !input.nextPhaseRationale
    ) {
      throw new RequestError(
        400,
        "next_phase_direction_required",
        "Advancing requires the next phase, its rationale, and a coach-authored current priority.",
      );
    }
  } else if (input.nextPhaseId || input.nextPriorityTitle || input.nextPriorityRationale) {
    throw new RequestError(
      400,
      "unexpected_next_phase",
      "Next-phase fields are only allowed when advancing.",
    );
  }
}

async function requireOwnedPlanAndPhase(context: MutationContext, phaseId: string) {
  const db = getDb();
  const plan = await requireOwnedEditablePlan(context);
  const [phase] = await db
    .select()
    .from(planPhases)
    .where(
      and(
        eq(planPhases.accountId, context.accountId),
        eq(planPhases.planId, context.planId),
        eq(planPhases.id, phaseId),
      ),
    )
    .limit(1);
  if (!phase) throw new RequestError(400, "phase_not_found", "Selected phase does not belong to this plan.");
  return { plan, phase };
}

async function requireOwnedEditablePlan(context: MutationContext) {
  const [plan] = await getDb()
    .select()
    .from(developmentPlans)
    .where(and(eq(developmentPlans.accountId, context.accountId), eq(developmentPlans.id, context.planId)))
    .limit(1);
  if (!plan) throw new RequestError(404, "plan_not_found", "Plan not found.");
  if (plan.revision !== context.expectedRevision) {
    throw new RequestError(
      409,
      "stale_plan_revision",
      "This plan changed after the page loaded. Refresh and review the latest revision before saving.",
    );
  }
  if (["archived", "completed"].includes(plan.status)) {
    throw new RequestError(
      409,
      "plan_not_editable",
      "Completed or archived plans cannot be changed.",
    );
  }
  return plan;
}

function invalidationStatements(
  context: MutationContext,
  status: "draft" | "paused" | "completed",
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
        completedAt:
          status === "completed"
            ? sql`coalesce(${developmentPlans.completedAt}, ${now.getTime()})`
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

function ownedPhaseWhere(context: MutationContext, phaseId: string) {
  return and(
    eq(planPhases.accountId, context.accountId),
    eq(planPhases.planId, context.planId),
    eq(planPhases.id, phaseId),
  );
}

function ownedPriorityWhere(context: MutationContext, priorityId: string) {
  return and(
    eq(planPriorities.accountId, context.accountId),
    eq(planPriorities.planId, context.planId),
    eq(planPriorities.id, priorityId),
  );
}

function guardedStatus(context: MutationContext, value: string) {
  return sql<string>`case when (
    select ${developmentPlans.revision}
    from ${developmentPlans}
    where ${developmentPlans.accountId} = ${context.accountId}
      and ${developmentPlans.id} = ${context.planId}
  ) = ${context.expectedRevision} then ${value} else null end`;
}

function currentPlanRevisionExists(context: MutationContext) {
  return sql<boolean>`exists (
    select 1
    from ${developmentPlans}
    where ${developmentPlans.accountId} = ${context.accountId}
      and ${developmentPlans.id} = ${context.planId}
      and ${developmentPlans.revision} = ${context.expectedRevision}
  )`;
}

async function rethrowStaleRevision(context: MutationContext, error: unknown): Promise<never> {
  if (
    !(await consentGrantRequirementsCurrent(
      context.accountId,
      context.consentRequirements,
    ))
  ) {
    throw new RequestError(
      409,
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
  if (plan && plan.revision !== context.expectedRevision) {
    throw new RequestError(
      409,
      "stale_plan_revision",
      "This plan changed while the review was being saved. Refresh and review the latest revision.",
    );
  }
  throw error;
}

function auditStatement(
  context: MutationContext,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
  occurredAt?: Date,
) {
  return getDb().insert(auditEvents).values({
    id: newId(),
    accountId: context.accountId,
    actorType: "account",
    actorAccountId: context.accountId,
    action,
    targetType,
    targetId,
    outcome: "success",
    requestId: context.requestId || null,
    metadata,
    occurredAt,
  });
}

function replacementRetirementAuditStatement(
  context: MutationContext,
  replacementPracticeItemId: string,
  now: Date,
) {
  const auditIdPrefix = `${newId()}:replacement-retirement:`;
  return getDb().insert(auditEvents).select(sql`
    select
      ${auditIdPrefix} || ${practiceItems.id},
      ${context.accountId},
      'account',
      ${context.accountId},
      null,
      'practice.retire',
      'practice_item',
      ${practiceItems.id},
      'success',
      ${context.requestId || null},
      null,
      json_object(
        'reason', 'replaced_by_new_practice',
        'relationship', 'retired_target_replaced_by_practice_item',
        'replacementPracticeItemId', ${replacementPracticeItemId}
      ),
      ${now.getTime()},
      null
    from ${practiceItems}
    where ${practiceItems.accountId} = ${context.accountId}
      and ${practiceItems.planId} = ${context.planId}
      and ${practiceItems.status} = 'active'
      and ${currentPlanRevisionExists(context)}
  `);
}
