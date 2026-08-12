import { listRichCoachingTimeline } from "@/lib/rich-coaching";
import { coachRequest, json, positiveInteger, routeError } from "@/app/api/coaching/_shared";

export async function GET(request: Request, route: { params: Promise<{ planId: string }> }) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const { planId } = await route.params;
    const limitText = new URL(request.url).searchParams.get("limit");
    const items = await listRichCoachingTimeline({
      accountId: context.accountId,
      planId,
      limit: limitText ? positiveInteger(Number(limitText), "limit") : undefined,
    });
    return json({ items }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}
