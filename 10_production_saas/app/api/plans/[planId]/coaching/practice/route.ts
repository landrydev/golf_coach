import { assertExactObjectKeys } from "@/lib/http";
import {
  assignDrillToPlan,
  listPracticeAssignments,
  replacePracticeAssignment,
  transitionPracticeAssignment,
  type DrillTemplateDraft,
} from "@/lib/rich-coaching";
import {
  coachRequest,
  enumValue,
  exactJson,
  json,
  objectBody,
  optionalDate,
  optionalText,
  planMutationContext,
  requiredText,
  routeError,
  stringArray,
} from "@/app/api/coaching/_shared";

const DRILL_FIELDS = [
  "title", "purpose", "whenItFits", "equipment", "setup", "steps", "dosageOrCadence",
  "feelOrCue", "successCheck", "commonMiss", "stopOrAskRule", "constraintOrAdaptation",
  "progression", "regression",
] as const;

export async function GET(request: Request, route: { params: Promise<{ planId: string }> }) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const { planId } = await route.params;
    const assignments = await listPracticeAssignments({
      accountId: context.accountId,
      planId,
      includeRetired: new URL(request.url).searchParams.get("includeRetired") === "true",
    });
    return json({ assignments }, context.requestId);
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
      "expectedRevision", "phaseId", "drillTemplateId", "customization", "dueAt",
    ]);
    const result = await assignDrillToPlan(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      {
        phaseId: requiredText(body.phaseId, "phaseId", 200),
        drillTemplateId: optionalText(body.drillTemplateId, "drillTemplateId", 200),
        customization: body.customization === null || body.customization === undefined
          ? null
          : drillCustomization(body.customization),
        dueAt: optionalDate(body.dueAt, "dueAt"),
      },
    );
    return json(
      { assignment: { id: result.practiceItemId }, plan: { revision: result.revision } },
      requestContext.requestId,
      201,
    );
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
      "expectedRevision",
      "operation",
      "practiceItemId",
      "nextStatus",
      "phaseId",
      "customization",
      "dueAt",
    ]);
    if (body.operation === "replace") {
      assertExactObjectKeys(body, [
        "expectedRevision",
        "operation",
        "practiceItemId",
        "phaseId",
        "customization",
        "dueAt",
      ]);
      const result = await replacePracticeAssignment(
        await planMutationContext(requestContext, planId, body.expectedRevision),
        {
          practiceItemId: requiredText(body.practiceItemId, "practiceItemId", 200),
          phaseId: requiredText(body.phaseId, "phaseId", 200),
          customization: drillCustomization(body.customization),
          dueAt: optionalDate(body.dueAt, "dueAt"),
        },
      );
      return json(
        {
          replacement: {
            id: result.practiceItemId,
            replacedPracticeItemId: result.replacedPracticeItemId,
          },
          plan: { revision: result.revision },
        },
        requestContext.requestId,
      );
    }
    assertExactObjectKeys(body, ["expectedRevision", "practiceItemId", "nextStatus"]);
    const result = await transitionPracticeAssignment(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      {
        practiceItemId: requiredText(body.practiceItemId, "practiceItemId", 200),
        nextStatus: enumValue(body.nextStatus, "nextStatus", ["active", "paused", "completed", "retired"] as const),
      },
    );
    return json({ transitioned: true, plan: { revision: result.revision } }, requestContext.requestId);
  } catch (error) {
    return routeError(error, requestContext.requestId);
  }
}

function drillCustomization(value: unknown): Partial<DrillTemplateDraft> {
  const body = objectBody(value, "customization");
  assertExactObjectKeys(body, DRILL_FIELDS);
  return {
    ...(body.title === undefined ? {} : { title: requiredText(body.title, "customization.title", 160) }),
    ...(body.purpose === undefined ? {} : { purpose: requiredText(body.purpose, "customization.purpose", 2_000) }),
    ...(body.whenItFits === undefined ? {} : { whenItFits: requiredText(body.whenItFits, "customization.whenItFits", 2_000) }),
    ...(body.equipment === undefined ? {} : { equipment: stringArray(body.equipment, "customization.equipment", 24) }),
    ...(body.setup === undefined ? {} : { setup: requiredText(body.setup, "customization.setup", 3_000) }),
    ...(body.steps === undefined ? {} : { steps: stringArray(body.steps, "customization.steps", 24) }),
    ...(body.dosageOrCadence === undefined ? {} : { dosageOrCadence: requiredText(body.dosageOrCadence, "customization.dosageOrCadence", 1_000) }),
    ...(body.feelOrCue === undefined ? {} : { feelOrCue: optionalText(body.feelOrCue, "customization.feelOrCue", 1_000) }),
    ...(body.successCheck === undefined ? {} : { successCheck: requiredText(body.successCheck, "customization.successCheck", 2_000) }),
    ...(body.commonMiss === undefined ? {} : { commonMiss: optionalText(body.commonMiss, "customization.commonMiss", 2_000) }),
    ...(body.stopOrAskRule === undefined ? {} : { stopOrAskRule: requiredText(body.stopOrAskRule, "customization.stopOrAskRule", 2_000) }),
    ...(body.constraintOrAdaptation === undefined ? {} : { constraintOrAdaptation: optionalText(body.constraintOrAdaptation, "customization.constraintOrAdaptation", 2_000) }),
    ...(body.progression === undefined ? {} : { progression: optionalText(body.progression, "customization.progression", 2_000) }),
    ...(body.regression === undefined ? {} : { regression: optionalText(body.regression, "customization.regression", 2_000) }),
  };
}
