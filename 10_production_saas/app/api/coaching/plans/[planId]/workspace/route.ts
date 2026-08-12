import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  developmentPlans,
  assessments,
  evidenceItems,
  lessons,
  phaseReviews,
  planPhases,
} from "@/db/schema";
import { requireGolferRecordProcessingConsent } from "@/lib/consent-enforcement";
import { RequestError } from "@/lib/http";
import { listMediaAssets } from "@/lib/media";
import {
  listLaunchMonitorComparisons,
  listLaunchMonitorImports,
  listLaunchMonitorSessions,
  listMilestones,
  listPhaseReviewSources,
  listPlanMediaAttachments,
  listPracticeAssignments,
  listRichCoachingTimeline,
} from "@/lib/rich-coaching";
import { coachRequest, json, routeError } from "@/app/api/coaching/_shared";

export async function GET(
  request: Request,
  context: { params: Promise<{ planId: string }> },
): Promise<Response> {
  const authenticated = await coachRequest(request);
  if (authenticated instanceof Response) return authenticated;
  try {
    await requireGolferRecordProcessingConsent(authenticated.accountId);
    const { planId } = await context.params;
    const db = getDb();
    const [plan] = await db
      .select({
        id: developmentPlans.id,
        golferId: developmentPlans.golferId,
        title: developmentPlans.title,
        status: developmentPlans.status,
        revision: developmentPlans.revision,
        updatedAt: developmentPlans.updatedAt,
      })
      .from(developmentPlans)
      .where(
        and(
          eq(developmentPlans.accountId, authenticated.accountId),
          eq(developmentPlans.id, planId),
        ),
      )
      .limit(1);
    if (!plan) throw new RequestError(404, "plan_not_found", "Plan not found.");

    const [
      phaseRows,
      assessmentRows,
      evidenceRows,
      lessonRows,
      reviewRows,
      practiceAssignments,
      mediaAttachments,
      mediaAssets,
      launchImports,
      launchSessions,
      launchComparisons,
      milestones,
      timeline,
    ] = await Promise.all([
      db
        .select()
        .from(planPhases)
        .where(
          and(
            eq(planPhases.accountId, authenticated.accountId),
            eq(planPhases.planId, plan.id),
          ),
        )
        .orderBy(asc(planPhases.sequence)),
      db
        .select({ id: assessments.id, title: assessments.title, summary: assessments.startingPoint })
        .from(assessments)
        .where(
          and(
            eq(assessments.accountId, authenticated.accountId),
            eq(assessments.planId, plan.id),
          ),
        )
        .orderBy(desc(assessments.updatedAt))
        .limit(1),
      db
        .select({
          id: evidenceItems.id,
          title: evidenceItems.title,
          status: evidenceItems.status,
          phaseId: evidenceItems.phaseId,
          lessonId: evidenceItems.lessonId,
          mediaAssetId: evidenceItems.mediaAssetId,
          evidenceType: evidenceItems.evidenceType,
          contextType: evidenceItems.contextType,
          sourceLabel: evidenceItems.sourceLabel,
          observedAt: evidenceItems.observedAt,
          metricName: evidenceItems.metricName,
          metricValue: evidenceItems.metricValue,
          metricUnit: evidenceItems.metricUnit,
          interpretation: evidenceItems.interpretation,
          limitation: evidenceItems.limitation,
        })
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.accountId, authenticated.accountId),
            eq(evidenceItems.planId, plan.id),
            inArray(evidenceItems.status, ["draft", "published"]),
          ),
        )
        .orderBy(desc(evidenceItems.updatedAt)),
      db
        .select()
        .from(lessons)
        .where(
          and(
            eq(lessons.accountId, authenticated.accountId),
            eq(lessons.planId, plan.id),
          ),
        )
        .orderBy(desc(lessons.sequence)),
      db
        .select()
        .from(phaseReviews)
        .where(
          and(
            eq(phaseReviews.accountId, authenticated.accountId),
            eq(phaseReviews.planId, plan.id),
          ),
        )
        .orderBy(desc(phaseReviews.updatedAt)),
      listPracticeAssignments({
        accountId: authenticated.accountId,
        planId: plan.id,
        includeRetired: true,
      }),
      listPlanMediaAttachments({
        accountId: authenticated.accountId,
        planId: plan.id,
        includeWithdrawn: true,
      }),
      listMediaAssets(authenticated.accountId, { limit: 200 }),
      listLaunchMonitorImports({
        accountId: authenticated.accountId,
        planId: plan.id,
        includeTerminal: true,
      }),
      listLaunchMonitorSessions({
        accountId: authenticated.accountId,
        planId: plan.id,
        includeWithdrawn: true,
      }),
      listLaunchMonitorComparisons({
        accountId: authenticated.accountId,
        planId: plan.id,
        includeWithdrawn: true,
      }),
      listMilestones({
        accountId: authenticated.accountId,
        planId: plan.id,
        includeWithdrawn: true,
      }),
      listRichCoachingTimeline({
        accountId: authenticated.accountId,
        planId: plan.id,
        limit: 200,
      }),
    ]);
    const phaseReviewSources = await Promise.all(
      reviewRows.map(async (review) => {
        const sources = await listPhaseReviewSources({
          accountId: authenticated.accountId,
          planId: plan.id,
          phaseReviewId: review.id,
        });
        return {
          phaseReviewId: review.id,
          sources: sources.flatMap((source) => {
            const sourceId =
              source.lessonId ??
              source.practiceItemId ??
              source.practiceCheckInId ??
              source.mediaAssetId ??
              source.launchMonitorSessionId ??
              source.launchMonitorComparisonGroupId ??
              source.evidenceItemId;
            return sourceId
              ? [{
                  sourceType: source.sourceType,
                  sourceId,
                  sourcePlanRevision: source.sourcePlanRevision,
                  sourceSnapshot: source.sourceSnapshot,
                }]
              : [];
          }),
        };
      }),
    );

    return json(
      {
        plan: { ...plan, updatedAt: epoch(plan.updatedAt) },
        phases: phaseRows.map((phase) => ({
          id: phase.id,
          sequence: phase.sequence,
          title: phase.title,
          purpose: phase.purpose,
          status: phase.status,
        })),
        assessment: assessmentRows[0]
          ? {
              id: assessmentRows[0].id,
              title: assessmentRows[0].title || "Starting assessment",
              summary: assessmentRows[0].summary,
            }
          : null,
        evidenceItems: evidenceRows.map((item) => ({
          ...item,
          observedAt: nullableEpoch(item.observedAt),
        })),
        lessons: lessonRows.map((lesson) => ({
          id: lesson.id,
          phaseId: lesson.phaseId,
          sequence: lesson.sequence,
          title: lesson.title,
          purpose: lesson.purpose,
          status: lesson.status,
          scheduledAt: nullableEpoch(lesson.scheduledAt),
          occurredAt: nullableEpoch(lesson.occurredAt),
          coachObservation: lesson.coachObservation,
          golferLearning: lesson.golferLearning,
          takeaway: lesson.takeaway,
          nextCheck: lesson.nextCheck,
          phaseConnection: lesson.phaseConnection,
          createdAt: epoch(lesson.createdAt),
          updatedAt: epoch(lesson.updatedAt),
        })),
        practiceAssignments,
        mediaAttachments,
        mediaAssets: mediaAssets.map((asset) => ({
          ...asset,
          url:
            asset.status === "ready"
              ? `/api/media/${encodeURIComponent(asset.id)}`
              : null,
        })),
        launchImports,
        launchSessions,
        launchComparisons,
        phaseReviews: reviewRows.map((review) => ({
          id: review.id,
          phaseId: review.phaseId,
          status: review.status,
          outcome: review.outcome,
          summary: review.changeSummary || review.coachConclusion,
          updatedAt: epoch(review.updatedAt),
        })),
        phaseReviewSources,
        milestones,
        timeline,
      },
      authenticated.requestId,
    );
  } catch (error) {
    return routeError(error, authenticated.requestId);
  }
}

function epoch(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function nullableEpoch(value: Date | number | null): number | null {
  return value === null ? null : epoch(value);
}
