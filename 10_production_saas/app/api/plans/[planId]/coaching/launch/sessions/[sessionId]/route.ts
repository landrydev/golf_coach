import { getLaunchMonitorSessionDetails } from "@/lib/rich-coaching";
import { coachRequest, json, routeError } from "@/app/api/coaching/_shared";

export async function GET(
  request: Request,
  route: { params: Promise<{ planId: string; sessionId: string }> },
) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const { planId, sessionId } = await route.params;
    const details = await getLaunchMonitorSessionDetails({ accountId: context.accountId, planId, sessionId });
    return json(details, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}
