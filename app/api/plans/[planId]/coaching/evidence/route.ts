import { createEvidenceRecord } from "@/lib/rich-coaching";
import {
  booleanValue,
  coachRequest,
  enumValue,
  exactJson,
  finiteNumber,
  json,
  optionalDate,
  optionalText,
  planMutationContext,
  requiredText,
  routeError,
} from "@/app/api/coaching/_shared";

export async function POST(request: Request, route: { params: Promise<{ planId: string }> }) {
  const requestContext = await coachRequest(request, true);
  if (requestContext instanceof Response) return requestContext;
  try {
    const { planId } = await route.params;
    const body = await exactJson(request, [
      "expectedRevision", "phaseId", "lessonId", "mediaAssetId", "evidenceType", "contextType",
      "title", "claim", "sourceLabel", "sourceType", "observedAt", "comparisonRole",
      "comparisonGroupId", "metricName", "metricValue", "metricUnit", "valueText",
      "interpretation", "limitation", "maturity", "nextEvidenceNeeded", "isRepresentative",
    ]);
    const result = await createEvidenceRecord(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      {
        phaseId: requiredText(body.phaseId, "phaseId", 200),
        lessonId: optionalText(body.lessonId, "lessonId", 200),
        mediaAssetId: optionalText(body.mediaAssetId, "mediaAssetId", 200),
        evidenceType: enumValue(body.evidenceType, "evidenceType", [
          "coach_observation", "golfer_report", "measurement", "outcome_count", "media", "comparison", "note",
        ] as const),
        contextType: enumValue(body.contextType, "contextType", [
          "assessment", "lesson", "practice", "on_course", "phase_review", "other",
        ] as const),
        title: requiredText(body.title, "title", 160),
        claim: optionalText(body.claim, "claim", 1_500),
        sourceLabel: requiredText(body.sourceLabel, "sourceLabel", 300),
        sourceType: enumValue(body.sourceType, "sourceType", [
          "coach_observed", "golfer_reported", "device", "document", "mixed",
        ] as const),
        observedAt: optionalDate(body.observedAt, "observedAt"),
        comparisonRole: body.comparisonRole === undefined
          ? "standalone"
          : enumValue(body.comparisonRole, "comparisonRole", ["standalone", "baseline", "current"] as const),
        comparisonGroupId: optionalText(body.comparisonGroupId, "comparisonGroupId", 80),
        metricName: optionalText(body.metricName, "metricName", 160),
        metricValue: body.metricValue === undefined || body.metricValue === null
          ? null
          : finiteNumber(body.metricValue, "metricValue"),
        metricUnit: optionalText(body.metricUnit, "metricUnit", 80),
        valueText: optionalText(body.valueText, "valueText", 1_000),
        interpretation: requiredText(body.interpretation, "interpretation", 2_000),
        limitation: requiredText(body.limitation, "limitation", 1_500),
        maturity: enumValue(body.maturity, "maturity", [
          "single_observation", "early_indication", "repeated_practice", "on_course_observation", "insufficient",
        ] as const),
        nextEvidenceNeeded: optionalText(body.nextEvidenceNeeded, "nextEvidenceNeeded", 1_000),
        isRepresentative: body.isRepresentative === undefined
          ? false
          : booleanValue(body.isRepresentative, "isRepresentative"),
      },
    );
    return json(
      { evidence: { id: result.evidenceId }, plan: { revision: result.revision } },
      requestContext.requestId,
      201,
    );
  } catch (error) {
    return routeError(error, requestContext.requestId);
  }
}
