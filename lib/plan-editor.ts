import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assessments,
  auditEvents,
  developmentPlans,
  golferGoals,
  golfers,
  planPhases,
  planPriorities,
  shareLinks,
} from "@/db/schema";
import { RequestError } from "@/lib/http";
import { newId } from "@/lib/tokens";

export type CorePlanEditInput = {
  title: string;
  goal: {
    statement: string;
    why: string;
    context: string;
  };
  assessment: {
    summary: string;
    strengths: string;
    primaryPattern: string;
    limitations: string;
  };
  priority: {
    title: string;
    rationale: string;
  };
  phases: Array<{
    number: number;
    title: string;
    purpose: string;
    rationale: string | null;
    progressSignals: string[];
  }>;
};

export type CorePlanEditResult = {
  plan: {
    id: string;
    status: "draft";
    revision: number;
    updatedAt: number;
  };
  revokedShareLinks: number;
};

/**
 * Replace the coach-authored core of a plan as one D1 batch.
 *
 * Ownership comes only from the authenticated account ID supplied by the
 * caller. Every read and write is tenant scoped, including the revocation of
 * bearer links. The batch deliberately contains no golfer-authored response or
 * unrelated personal data.
 */
export async function editCorePlan(input: {
  accountId: string;
  planId: string;
  expectedRevision: number;
  changes: CorePlanEditInput;
  requestId?: string | null;
}): Promise<CorePlanEditResult> {
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

  if (!plan) {
    throw new RequestError(404, "plan_not_found", "Plan not found.");
  }
  if (plan.revision !== input.expectedRevision) {
    throw new RequestError(
      409,
      "stale_plan_revision",
      "This plan changed after the editor was opened. Reload the latest version before saving.",
    );
  }
  if (["completed", "archived"].includes(plan.status)) {
    throw new RequestError(
      409,
      "plan_not_editable",
      "Completed or archived plans cannot be edited.",
    );
  }
  if (
    ![3, 4].includes(input.changes.phases.length) ||
    input.changes.phases.some((phase, index) => phase.number !== index + 1)
  ) {
    throw new RequestError(
      400,
      "invalid_phases",
      "The plan must contain three or four ordered phases.",
    );
  }

  const [
    golferRows,
    goalRows,
    assessmentRows,
    priorityRows,
    phaseRows,
    activeShareRows,
  ] = await Promise.all([
    db
      .select({
        id: golfers.id,
        status: golfers.status,
        eligibilityStatus: golfers.eligibilityStatus,
      })
      .from(golfers)
      .where(
        and(
          eq(golfers.accountId, input.accountId),
          eq(golfers.id, plan.golferId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(golferGoals)
      .where(
        and(
          eq(golferGoals.accountId, input.accountId),
          eq(golferGoals.planId, input.planId),
          eq(golferGoals.status, "active"),
          eq(golferGoals.isPrimary, true),
        ),
      )
      .orderBy(desc(golferGoals.updatedAt))
      .limit(1),
    db
      .select()
      .from(assessments)
      .where(
        and(
          eq(assessments.accountId, input.accountId),
          eq(assessments.planId, input.planId),
        ),
      )
      .orderBy(desc(assessments.updatedAt))
      .limit(1),
    db
      .select()
      .from(planPriorities)
      .where(
        and(
          eq(planPriorities.accountId, input.accountId),
          eq(planPriorities.planId, input.planId),
          eq(planPriorities.status, "active"),
          eq(planPriorities.isCurrent, true),
        ),
      )
      .orderBy(asc(planPriorities.sortOrder))
      .limit(1),
    db
      .select()
      .from(planPhases)
      .where(
        and(
          eq(planPhases.accountId, input.accountId),
          eq(planPhases.planId, input.planId),
        ),
      )
      .orderBy(asc(planPhases.sequence)),
    db
      .select({ id: shareLinks.id })
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.accountId, input.accountId),
          eq(shareLinks.planId, input.planId),
          eq(shareLinks.status, "active"),
        ),
      ),
  ]);

  const golfer = golferRows[0];
  const goal = goalRows[0];
  const assessment = assessmentRows[0];
  const priority = priorityRows[0];

  if (!golfer) {
    throw new RequestError(404, "plan_not_found", "Plan not found.");
  }
  if (
    golfer.eligibilityStatus !== "adult_confirmed" ||
    ["archived", "deletion_pending", "deleted"].includes(golfer.status)
  ) {
    throw new RequestError(
      409,
      "golfer_not_editable",
      "This adults-only golfer record is not available for plan editing.",
    );
  }
  if (
    !goal ||
    !assessment ||
    ["superseded", "archived"].includes(assessment.status) ||
    !priority ||
    ![3, 4].includes(phaseRows.length) ||
    phaseRows.length !== input.changes.phases.length ||
    phaseRows.some((phase, index) => phase.sequence !== index + 1)
  ) {
    throw new RequestError(
      409,
      "plan_structure_incomplete",
      "This plan does not have the three- or four-phase editable structure required by the editor.",
    );
  }

  const now = new Date();
  const phaseUpdates = phaseRows.map((phase, index) =>
    db
      .update(planPhases)
      .set({
        title: input.changes.phases[index].title,
        purpose: input.changes.phases[index].purpose,
        rationale: input.changes.phases[index].rationale,
        progressSignals: input.changes.phases[index].progressSignals,
        coachApprovedAt: null,
        revisedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(planPhases.accountId, input.accountId),
          eq(planPhases.planId, input.planId),
          eq(planPhases.id, phase.id),
          eq(planPhases.sequence, index + 1),
        ),
      ),
  );

  try {
    await db.batch([
      db
        .update(developmentPlans)
        .set({
        // A zero-row UPDATE does not fail a D1 batch. Put the compare-and-swap
        // guard in a NOT NULL column instead so a lost race aborts and rolls
        // back the entire batch before any related plan content can persist.
        title: sql<string>`case
          when ${developmentPlans.revision} = ${input.expectedRevision}
            and ${developmentPlans.status} not in ('completed', 'archived')
          then ${input.changes.title}
          else null
        end`,
        status: "draft",
        revision: sql`${developmentPlans.revision} + 1`,
        approvedRevision: null,
        publishedRevision: null,
        coachApprovedAt: null,
        previewedAt: null,
        publishedAt: null,
        lastSharedAt: null,
        pausedAt: null,
        updatedAt: now,
      })
        .where(
          and(
            eq(developmentPlans.accountId, input.accountId),
            eq(developmentPlans.id, input.planId),
          ),
        ),
    db
      .update(golferGoals)
      .set({
        desiredOutcome: input.changes.goal.statement,
        whyItMatters: input.changes.goal.why || null,
        context: input.changes.goal.context || null,
        // The current view exposes context and constraints as one field. Once
        // edited, retain that complete text in the canonical context column.
        constraints: null,
        confirmedByGolferAt: null,
        coachApprovedAt: null,
        revisedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(golferGoals.accountId, input.accountId),
          eq(golferGoals.planId, input.planId),
          eq(golferGoals.id, goal.id),
        ),
      ),
    db
      .update(assessments)
      .set({
        status: "draft",
        startingPoint: input.changes.assessment.summary,
        strengthSummary: input.changes.assessment.strengths,
        primaryPattern: input.changes.assessment.primaryPattern,
        limitations: input.changes.assessment.limitations,
        coachApprovedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(assessments.accountId, input.accountId),
          eq(assessments.planId, input.planId),
          eq(assessments.id, assessment.id),
        ),
      ),
    db
      .update(planPriorities)
      .set({
        title: input.changes.priority.title,
        description: input.changes.priority.rationale,
        rationale: input.changes.priority.rationale,
        coachApprovedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(planPriorities.accountId, input.accountId),
          eq(planPriorities.planId, input.planId),
          eq(planPriorities.id, priority.id),
        ),
      ),
    ...phaseUpdates,
    db
      .update(shareLinks)
      .set({
        status: "revoked",
        revokedAt: now,
        revokeReason: "plan revised",
        updatedAt: now,
      })
      .where(
        and(
          eq(shareLinks.accountId, input.accountId),
          eq(shareLinks.planId, input.planId),
          eq(shareLinks.status, "active"),
        ),
      ),
      db.insert(auditEvents).values({
      id: newId(),
      accountId: input.accountId,
      actorType: "account",
      actorAccountId: input.accountId,
      action: "plan.core_edited",
      targetType: "development_plan",
      targetId: input.planId,
      outcome: "success",
      requestId: input.requestId ?? null,
      metadata: {
        previousRevision: plan.revision,
        previousStatus: plan.status,
        revisionIncrement: 1,
        shareLinksRevoked: activeShareRows.length,
        shareRevokeReason: "plan revised",
        changedFields: [
          "title",
          "goal",
          "assessment",
          "priority",
          "phases",
        ],
      },
      }),
    ]);
  } catch (error) {
    await rethrowCorePlanConflict(input, error);
  }

  const [updatedPlan] = await db
    .select({
      id: developmentPlans.id,
      status: developmentPlans.status,
      revision: developmentPlans.revision,
      updatedAt: developmentPlans.updatedAt,
    })
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, input.accountId),
        eq(developmentPlans.id, input.planId),
      ),
    )
    .limit(1);

  if (!updatedPlan || updatedPlan.status !== "draft") {
    throw new Error("The edited plan could not be loaded.");
  }

  return {
    plan: {
      id: updatedPlan.id,
      status: "draft",
      revision: updatedPlan.revision,
      updatedAt: updatedPlan.updatedAt.getTime(),
    },
    revokedShareLinks: activeShareRows.length,
  };
}

async function rethrowCorePlanConflict(
  input: { accountId: string; planId: string; expectedRevision: number },
  error: unknown,
): Promise<never> {
  const [plan] = await getDb()
    .select({ revision: developmentPlans.revision, status: developmentPlans.status })
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, input.accountId),
        eq(developmentPlans.id, input.planId),
      ),
    )
    .limit(1);

  if (!plan) {
    throw new RequestError(404, "plan_not_found", "Plan not found.");
  }
  if (plan.revision !== input.expectedRevision) {
    throw new RequestError(
      409,
      "stale_plan_revision",
      "This plan changed while the edit was being saved. Reload the latest version before saving.",
    );
  }
  if (["completed", "archived"].includes(plan.status)) {
    throw new RequestError(
      409,
      "plan_not_editable",
      "Completed or archived plans cannot be edited.",
    );
  }
  throw error;
}
