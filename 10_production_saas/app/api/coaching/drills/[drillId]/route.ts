import {
  archiveDrillTemplate,
  setDrillTemplateFavourite,
  updateDrillTemplate,
} from "@/lib/rich-coaching";
import { RequestError } from "@/lib/http";
import {
  booleanValue,
  coachRequest,
  exactJson,
  json,
  positiveInteger,
  routeError,
} from "../../_shared";
import { DRAFT_FIELDS, drillDraft } from "../route";

export async function PUT(request: Request, route: { params: Promise<{ drillId: string }> }) {
  const context = await coachRequest(request, true);
  if (context instanceof Response) return context;
  try {
    const body = await exactJson(request, ["expectedVersion", ...DRAFT_FIELDS]);
    const { drillId } = await route.params;
    const result = await updateDrillTemplate({
      accountId: context.accountId,
      drillTemplateId: drillId,
      expectedVersion: positiveInteger(body.expectedVersion, "expectedVersion"),
      draft: drillDraft(body),
      requestId: context.requestId,
    });
    return json({ updated: true, template: result }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function PATCH(request: Request, route: { params: Promise<{ drillId: string }> }) {
  const context = await coachRequest(request, true);
  if (context instanceof Response) return context;
  try {
    const body = await exactJson(request, ["expectedVersion", "favourite"]);
    const { drillId } = await route.params;
    const result = await setDrillTemplateFavourite({
      accountId: context.accountId,
      drillTemplateId: drillId,
      expectedVersion: positiveInteger(body.expectedVersion, "expectedVersion"),
      favourite: booleanValue(body.favourite, "favourite"),
      requestId: context.requestId,
    });
    return json({ updated: true, template: result }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function DELETE(request: Request, route: { params: Promise<{ drillId: string }> }) {
  const context = await coachRequest(request, true);
  if (context instanceof Response) return context;
  try {
    const body = await exactJson(request, ["expectedVersion", "confirmation"]);
    if (body.confirmation !== "archive_drill_template") {
      throw new RequestError(400, "confirmation_required", "Confirm drill template archival.");
    }
    const { drillId } = await route.params;
    const result = await archiveDrillTemplate({
      accountId: context.accountId,
      drillTemplateId: drillId,
      expectedVersion: positiveInteger(body.expectedVersion, "expectedVersion"),
      requestId: context.requestId,
    });
    return json({ archived: true, template: result }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}
