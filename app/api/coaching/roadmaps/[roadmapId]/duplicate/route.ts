import { duplicateRoadmapTemplate } from "@/lib/rich-coaching";
import { coachRequest, exactJson, json, optionalText, positiveInteger, routeError } from "../../../_shared";

export async function POST(request: Request, route: { params: Promise<{ roadmapId: string }> }) {
  const context = await coachRequest(request, true);
  if (context instanceof Response) return context;
  try {
    const body = await exactJson(request, ["expectedSourceVersion", "title"]);
    const { roadmapId } = await route.params;
    const template = await duplicateRoadmapTemplate({
      accountId: context.accountId,
      sourceTemplateId: roadmapId,
      expectedSourceVersion: positiveInteger(body.expectedSourceVersion, "expectedSourceVersion"),
      title: optionalText(body.title, "title", 160),
      requestId: context.requestId,
    });
    return json({ template }, context.requestId, 201);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}
