import { createLessonRecord, transitionLessonLifecycle } from "@/lib/rich-coaching";
import { RequestError } from "@/lib/http";
import {
  coachRequest, enumValue, exactJson, json, optionalDate, optionalText,
  planMutationContext, requiredText, routeError,
} from "@/app/api/coaching/_shared";

export async function POST(request: Request, route: { params: Promise<{ planId: string }> }) {
  const requestContext = await coachRequest(request, true);
  if (requestContext instanceof Response) return requestContext;
  try {
    const { planId } = await route.params;
    const body = await exactJson(request, [
      "expectedRevision", "phaseId", "title", "purpose", "status", "scheduledAt", "occurredAt",
      "coachObservation", "golferLearning", "takeaway", "nextCheck", "phaseConnection",
    ]);
    const result = await createLessonRecord(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      {
        phaseId: optionalText(body.phaseId, "phaseId", 200),
        title: requiredText(body.title, "title", 160),
        purpose: requiredText(body.purpose, "purpose", 2_000),
        status: body.status === undefined
          ? "planned"
          : enumValue(body.status, "status", ["planned", "scheduled", "completed"] as const),
        scheduledAt: optionalDate(body.scheduledAt, "scheduledAt"),
        occurredAt: optionalDate(body.occurredAt, "occurredAt"),
        coachObservation: optionalText(body.coachObservation, "coachObservation", 2_000),
        golferLearning: optionalText(body.golferLearning, "golferLearning", 2_000),
        takeaway: optionalText(body.takeaway, "takeaway", 1_000),
        nextCheck: optionalText(body.nextCheck, "nextCheck", 1_000),
        phaseConnection: optionalText(body.phaseConnection, "phaseConnection", 1_000),
      },
    );
    return json({ lesson: { id: result.lessonId, sequence: result.sequence }, plan: { revision: result.revision } }, requestContext.requestId, 201);
  } catch (error) {
    return routeError(error, requestContext.requestId);
  }
}

export async function PATCH(request: Request, route: { params: Promise<{ planId: string }> }) {
  const requestContext = await coachRequest(request, true);
  if (requestContext instanceof Response) return requestContext;
  try {
    const { planId } = await route.params;
    const body = await exactJson(request, [
      "expectedRevision", "lessonId", "nextStatus", "scheduledAt", "occurredAt",
      "coachObservation", "golferLearning", "takeaway", "nextCheck", "phaseConnection",
      "evidenceItemIds", "launchSessionIds",
    ]);
    const result = await transitionLessonLifecycle(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      {
        lessonId: requiredText(body.lessonId, "lessonId", 200),
        nextStatus: enumValue(body.nextStatus, "nextStatus", ["planned", "scheduled", "completed", "canceled", "archived"] as const),
        scheduledAt: optionalDate(body.scheduledAt, "scheduledAt"),
        occurredAt: optionalDate(body.occurredAt, "occurredAt"),
        ...(body.coachObservation === undefined
          ? {}
          : { coachObservation: optionalText(body.coachObservation, "coachObservation", 4_000) }),
        ...(body.golferLearning === undefined
          ? {}
          : { golferLearning: optionalText(body.golferLearning, "golferLearning", 4_000) }),
        ...(body.takeaway === undefined
          ? {}
          : { takeaway: optionalText(body.takeaway, "takeaway", 3_000) }),
        ...(body.nextCheck === undefined
          ? {}
          : { nextCheck: optionalText(body.nextCheck, "nextCheck", 2_000) }),
        ...(body.phaseConnection === undefined
          ? {}
          : { phaseConnection: optionalText(body.phaseConnection, "phaseConnection", 2_000) }),
        evidenceItemIds: optionalIdArray(body.evidenceItemIds, "evidenceItemIds"),
        launchSessionIds: optionalIdArray(body.launchSessionIds, "launchSessionIds"),
      },
    );
    return json({ transitioned: true, plan: { revision: result.revision } }, requestContext.requestId);
  } catch (error) {
    return routeError(error, requestContext.requestId);
  }
}

function optionalIdArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50) {
    throw new RequestError(400, "invalid_field", `${field} must contain at most 50 IDs.`);
  }
  return value.map((item, index) => requiredText(item, `${field}[${index}]`, 200));
}
