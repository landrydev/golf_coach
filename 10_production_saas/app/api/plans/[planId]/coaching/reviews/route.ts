import { assertExactObjectKeys, RequestError } from "@/lib/http";
import { addPhaseReview, type PhaseReviewSourceSelection } from "@/lib/plan-content";
import {
  coachRequest,
  enumValue,
  exactJson,
  json,
  objectBody,
  optionalText,
  planMutationContext,
  requiredText,
  routeError,
} from "@/app/api/coaching/_shared";

const SOURCE_KINDS = [
  "lesson",
  "practice",
  "practice_check_in",
  "media",
  "launch_session",
  "launch_comparison",
  "evidence",
] as const;

export async function POST(request: Request, route: { params: Promise<{ planId: string }> }) {
  const requestContext = await coachRequest(request, true);
  if (requestContext instanceof Response) return requestContext;
  try {
    const { planId } = await route.params;
    const body = await exactJson(request, [
      "expectedRevision", "phaseId", "transition", "outcome", "originalPurpose",
      "baselineSummary", "workCompleted", "changeSummary", "reliabilityLabel", "limitations",
      "golferContribution", "coachConclusion", "remainingOpportunity", "nextPhaseRationale",
      "independentPracticeAlternative", "nextPhaseId", "nextPriorityTitle", "nextPriorityRationale",
      "sources",
    ]);
    const sources = sourceArray(body.sources);
    const result = await addPhaseReview(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      {
        phaseId: requiredText(body.phaseId, "phaseId", 200),
        transition: enumValue(body.transition, "transition", [
          "continue", "pause", "advance", "complete_plan",
        ] as const),
        outcome: enumValue(body.outcome, "outcome", [
          "complete", "partially_complete", "paused", "revised", "insufficient_evidence", "goal_changed",
        ] as const),
        originalPurpose: requiredText(body.originalPurpose, "originalPurpose", 1_500),
        baselineSummary: requiredText(body.baselineSummary, "baselineSummary", 1_500),
        workCompleted: requiredText(body.workCompleted, "workCompleted", 2_000),
        changeSummary: requiredText(body.changeSummary, "changeSummary", 2_000),
        reliabilityLabel: requiredText(body.reliabilityLabel, "reliabilityLabel", 500),
        limitations: requiredText(body.limitations, "limitations", 1_500),
        golferContribution: optionalText(body.golferContribution, "golferContribution", 1_500),
        coachConclusion: requiredText(body.coachConclusion, "coachConclusion", 2_000),
        remainingOpportunity: optionalText(body.remainingOpportunity, "remainingOpportunity", 1_500),
        nextPhaseRationale: optionalText(body.nextPhaseRationale, "nextPhaseRationale", 1_500),
        independentPracticeAlternative: optionalText(
          body.independentPracticeAlternative,
          "independentPracticeAlternative",
          1_500,
        ),
        nextPhaseId: optionalText(body.nextPhaseId, "nextPhaseId", 200),
        nextPriorityTitle: optionalText(body.nextPriorityTitle, "nextPriorityTitle", 160),
        nextPriorityRationale: optionalText(body.nextPriorityRationale, "nextPriorityRationale", 1_500),
        sources,
      },
    );
    return json(
      {
        review: { id: result.id, sourceCount: sources.length },
        plan: { revision: result.revision, status: result.planStatus },
      },
      requestContext.requestId,
      201,
    );
  } catch (error) {
    return routeError(error, requestContext.requestId);
  }
}

function sourceArray(value: unknown): PhaseReviewSourceSelection[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    throw new RequestError(
      400,
      "review_sources_required",
      "Select between 1 and 100 source records before confirming the review.",
    );
  }
  return value.map((entry, index) => {
    const source = objectBody(entry, `sources[${index}]`);
    assertExactObjectKeys(source, ["kind", "id"]);
    return {
      kind: enumValue(source.kind, `sources[${index}].kind`, SOURCE_KINDS),
      id: requiredText(source.id, `sources[${index}].id`, 200),
    };
  });
}
