import {
  archiveRoadmapTemplate,
  setRoadmapTemplateFavourite,
  updateRoadmapTemplate,
} from "@/lib/rich-coaching";
import { RequestError } from "@/lib/http";
import {
  booleanValue,
  coachRequest,
  exactJson,
  json,
  positiveInteger,
  requiredText,
  routeError,
} from "../../_shared";
import { roadmapContent } from "../route";

export async function PUT(request: Request, route: { params: Promise<{ roadmapId: string }> }) {
  const context = await coachRequest(request, true);
  if (context instanceof Response) return context;
  try {
    const body = await exactJson(request, ["expectedVersion", "title", "description", "content"]);
    const { roadmapId } = await route.params;
    const result = await updateRoadmapTemplate({
      accountId: context.accountId,
      roadmapTemplateId: roadmapId,
      expectedVersion: positiveInteger(body.expectedVersion, "expectedVersion"),
      title: requiredText(body.title, "title", 160),
      description: requiredText(body.description, "description", 1_500),
      content: roadmapContent(body.content),
      requestId: context.requestId,
    });
    return json({ updated: true, template: result }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function PATCH(request: Request, route: { params: Promise<{ roadmapId: string }> }) {
  const context = await coachRequest(request, true);
  if (context instanceof Response) return context;
  try {
    const body = await exactJson(request, ["expectedVersion", "favourite"]);
    const { roadmapId } = await route.params;
    const result = await setRoadmapTemplateFavourite({
      accountId: context.accountId,
      roadmapTemplateId: roadmapId,
      expectedVersion: positiveInteger(body.expectedVersion, "expectedVersion"),
      favourite: booleanValue(body.favourite, "favourite"),
      requestId: context.requestId,
    });
    return json({ updated: true, template: result }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function DELETE(request: Request, route: { params: Promise<{ roadmapId: string }> }) {
  const context = await coachRequest(request, true);
  if (context instanceof Response) return context;
  try {
    const body = await exactJson(request, ["expectedVersion", "confirmation"]);
    if (body.confirmation !== "archive_roadmap_template") {
      throw new RequestError(400, "confirmation_required", "Confirm roadmap template archival.");
    }
    const { roadmapId } = await route.params;
    const result = await archiveRoadmapTemplate({
      accountId: context.accountId,
      roadmapTemplateId: roadmapId,
      expectedVersion: positiveInteger(body.expectedVersion, "expectedVersion"),
      requestId: context.requestId,
    });
    return json({ archived: true, template: result }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}
