import { getLaunchMonitorComparison } from "@/lib/rich-coaching";
import { coachRequest, json, routeError } from "@/app/api/coaching/_shared";

export async function GET(
  request: Request,
  route: { params: Promise<{ planId: string; comparisonId: string }> },
) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const { planId, comparisonId } = await route.params;
    const comparison = await getLaunchMonitorComparison({ accountId: context.accountId, planId, comparisonId });
    return json({ comparison }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}
