import { duplicateDrillTemplate } from "@/lib/rich-coaching";
import { coachRequest, exactJson, json, optionalText, routeError } from "../../../_shared";

export async function POST(
  request: Request,
  route: { params: Promise<{ drillId: string }> },
) {
  const context = await coachRequest(request, true);
  if (context instanceof Response) return context;
  try {
    const body = await exactJson(request, ["title"]);
    const { drillId } = await route.params;
    const template = await duplicateDrillTemplate({
      accountId: context.accountId,
      sourceTemplateId: drillId,
      title: optionalText(body.title, "title", 160),
      requestId: context.requestId,
    });
    return json({ template }, context.requestId, 201);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}
