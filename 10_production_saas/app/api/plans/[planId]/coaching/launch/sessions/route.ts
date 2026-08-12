import { assertExactObjectKeys, RequestError } from "@/lib/http";
import {
  commitLaunchMonitorSession,
  listLaunchMonitorSessions,
  type LaunchMetricInput,
  type LaunchShotInput,
} from "@/lib/rich-coaching";
import {
  booleanValue, coachRequest, dateValue, enumValue, exactJson, finiteNumber, json,
  nonNegativeInteger, objectBody, optionalDate, optionalText, planMutationContext,
  positiveInteger, requiredText, routeError,
} from "@/app/api/coaching/_shared";

export async function GET(request: Request, route: { params: Promise<{ planId: string }> }) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const { planId } = await route.params;
    const url = new URL(request.url);
    const limitText = url.searchParams.get("limit");
    const sessions = await listLaunchMonitorSessions({
      accountId: context.accountId,
      planId,
      includeWithdrawn: url.searchParams.get("includeWithdrawn") === "true",
      limit: limitText ? positiveInteger(Number(limitText), "limit") : undefined,
    });
    return json({ sessions }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function POST(request: Request, route: { params: Promise<{ planId: string }> }) {
  const requestContext = await coachRequest(request, true);
  if (requestContext instanceof Response) return requestContext;
  try {
    const { planId } = await route.params;
    const body = await exactJson(request, [
      "expectedRevision", "phaseId", "lessonId", "importId", "stagedReviewFingerprint", "sourceMediaAssetId", "sourceMode",
      "sessionDate", "deviceSource", "club", "environment", "conditions", "notes",
      "coachInterpretation", "limitations", "representativeness", "nextEvidenceNeeded",
      "summaryMetrics", "shots",
    ]);
    const result = await commitLaunchMonitorSession(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      {
        phaseId: optionalText(body.phaseId, "phaseId", 200),
        lessonId: optionalText(body.lessonId, "lessonId", 200),
        importId: optionalText(body.importId, "importId", 200),
        stagedReviewFingerprint: optionalText(body.stagedReviewFingerprint, "stagedReviewFingerprint", 120),
        sourceMediaAssetId: optionalText(body.sourceMediaAssetId, "sourceMediaAssetId", 200),
        sourceMode: enumValue(body.sourceMode, "sourceMode", ["manual", "csv_import"] as const),
        sessionDate: dateValue(body.sessionDate, "sessionDate"),
        deviceSource: requiredText(body.deviceSource, "deviceSource", 160),
        club: optionalText(body.club, "club", 80),
        environment: optionalText(body.environment, "environment", 160),
        conditions: optionalText(body.conditions, "conditions", 1_000),
        notes: optionalText(body.notes, "notes", 2_000),
        coachInterpretation: requiredText(body.coachInterpretation, "coachInterpretation", 2_000),
        limitations: requiredText(body.limitations, "limitations", 1_500),
        representativeness: enumValue(body.representativeness, "representativeness", ["representative", "limited", "unknown"] as const),
        nextEvidenceNeeded: optionalText(body.nextEvidenceNeeded, "nextEvidenceNeeded", 1_000),
        summaryMetrics: metricArray(body.summaryMetrics, "summaryMetrics", 64),
        shots: shotArray(body.shots),
      },
    );
    return json({ session: { id: result.sessionId }, plan: { revision: result.revision } }, requestContext.requestId, 201);
  } catch (error) {
    return routeError(error, requestContext.requestId);
  }
}

function metricArray(value: unknown, field: string, maximum: number): LaunchMetricInput[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new RequestError(400, "invalid_field", `${field} must contain at most ${maximum} metrics.`);
  }
  return value.map((entry, index) => {
    const item = objectBody(entry, `${field}[${index}]`);
    assertExactObjectKeys(item, [
      "canonicalKey", "originalName", "displayName", "numericValue", "unit",
      "sourceColumn", "direction", "golferFacing",
    ]);
    return {
      canonicalKey: requiredText(item.canonicalKey, `${field}[${index}].canonicalKey`, 80),
      originalName: requiredText(item.originalName, `${field}[${index}].originalName`, 160),
      displayName: requiredText(item.displayName, `${field}[${index}].displayName`, 160),
      numericValue: finiteNumber(item.numericValue, `${field}[${index}].numericValue`),
      unit: requiredText(item.unit, `${field}[${index}].unit`, 40),
      sourceColumn: optionalText(item.sourceColumn, `${field}[${index}].sourceColumn`, 160),
      direction: item.direction === undefined
        ? "unknown"
        : enumValue(item.direction, `${field}[${index}].direction`, ["higher", "lower", "target", "context_only", "unknown"] as const),
      golferFacing: item.golferFacing === undefined ? false : booleanValue(item.golferFacing, `${field}[${index}].golferFacing`),
    };
  });
}

function shotArray(value: unknown): LaunchShotInput[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 1_000) {
    throw new RequestError(400, "invalid_field", "shots must contain at most 1000 rows.");
  }
  return value.map((entry, index) => {
    const shot = objectBody(entry, `shots[${index}]`);
    assertExactObjectKeys(shot, ["sourceRowNumber", "label", "capturedAt", "metrics"]);
    return {
      sourceRowNumber: shot.sourceRowNumber === undefined || shot.sourceRowNumber === null
        ? null
        : nonNegativeInteger(shot.sourceRowNumber, `shots[${index}].sourceRowNumber`),
      label: optionalText(shot.label, `shots[${index}].label`, 160),
      capturedAt: optionalDate(shot.capturedAt, `shots[${index}].capturedAt`),
      metrics: metricArray(shot.metrics, `shots[${index}].metrics`, 64),
    };
  });
}
