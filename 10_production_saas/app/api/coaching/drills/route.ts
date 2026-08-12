import {
  createDrillTemplate,
  listDrillTemplates,
  type DrillTemplateDraft,
} from "@/lib/rich-coaching";
import {
  coachRequest,
  exactJson,
  json,
  optionalText,
  positiveInteger,
  requiredText,
  routeError,
  stringArray,
} from "../_shared";

const DRAFT_FIELDS = [
  "title", "purpose", "whenItFits", "equipment", "setup", "steps",
  "dosageOrCadence", "feelOrCue", "successCheck", "commonMiss",
  "stopOrAskRule", "constraintOrAdaptation", "progression", "regression",
] as const;

export async function GET(request: Request) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const url = new URL(request.url);
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const favouriteOnly = url.searchParams.get("favouriteOnly") === "true";
    const limitText = url.searchParams.get("limit");
    const templates = await listDrillTemplates({
      accountId: context.accountId,
      includeArchived,
      favouriteOnly,
      search: url.searchParams.get("search"),
      limit: limitText ? positiveInteger(Number(limitText), "limit") : undefined,
    });
    return json({ templates }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function POST(request: Request) {
  const context = await coachRequest(request, true);
  if (context instanceof Response) return context;
  try {
    const body = await exactJson(request, DRAFT_FIELDS);
    const template = await createDrillTemplate(
      context.accountId,
      drillDraft(body),
      context.requestId,
    );
    return json({ template }, context.requestId, 201);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export function drillDraft(body: Record<string, unknown>): DrillTemplateDraft {
  return {
    title: requiredText(body.title, "title", 160),
    purpose: requiredText(body.purpose, "purpose", 2_000),
    whenItFits: requiredText(body.whenItFits, "whenItFits", 2_000),
    equipment: stringArray(body.equipment, "equipment", 24),
    setup: requiredText(body.setup, "setup", 3_000),
    steps: stringArray(body.steps, "steps", 24),
    dosageOrCadence: requiredText(body.dosageOrCadence, "dosageOrCadence", 1_000),
    feelOrCue: optionalText(body.feelOrCue, "feelOrCue", 1_000),
    successCheck: requiredText(body.successCheck, "successCheck", 2_000),
    commonMiss: optionalText(body.commonMiss, "commonMiss", 2_000),
    stopOrAskRule: requiredText(body.stopOrAskRule, "stopOrAskRule", 2_000),
    constraintOrAdaptation: optionalText(body.constraintOrAdaptation, "constraintOrAdaptation", 2_000),
    progression: optionalText(body.progression, "progression", 2_000),
    regression: optionalText(body.regression, "regression", 2_000),
  };
}

export { DRAFT_FIELDS };
