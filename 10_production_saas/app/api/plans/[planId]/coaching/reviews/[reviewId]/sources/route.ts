import { listPhaseReviewSources } from "@/lib/rich-coaching";
import { coachRequest, json, routeError } from "@/app/api/coaching/_shared";

export async function GET(
  request: Request,
  route: { params: Promise<{ planId: string; reviewId: string }> },
) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const { planId, reviewId } = await route.params;
    const sources = await listPhaseReviewSources({
      accountId: context.accountId,
      planId,
      phaseReviewId: reviewId,
    });
    return json({ sources }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}
