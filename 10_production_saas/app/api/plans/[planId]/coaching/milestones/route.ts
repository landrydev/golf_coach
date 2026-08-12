import { createMilestone, listMilestones, transitionMilestone } from "@/lib/rich-coaching";
import {
  coachRequest, dateValue, enumValue, exactJson, json, optionalText,
  planMutationContext, requiredText, routeError,
} from "@/app/api/coaching/_shared";

export async function GET(request: Request, route: { params: Promise<{ planId: string }> }) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const { planId } = await route.params;
    const milestones = await listMilestones({
      accountId: context.accountId,
      planId,
      includeWithdrawn: new URL(request.url).searchParams.get("includeWithdrawn") === "true",
    });
    return json({ milestones }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function POST(request: Request, route: { params: Promise<{ planId: string }> }) {
  const requestContext = await coachRequest(request, true);
  if (requestContext instanceof Response) return requestContext;
  try {
    const { planId } = await route.params;
    const body = await exactJson(request, ["expectedRevision", "phaseId", "title", "summary", "occurredAt"]);
    const result = await createMilestone(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      {
        phaseId: optionalText(body.phaseId, "phaseId", 200),
        title: requiredText(body.title, "title", 160),
        summary: requiredText(body.summary, "summary", 2_000),
        occurredAt: dateValue(body.occurredAt, "occurredAt"),
      },
    );
    return json({ milestone: { id: result.milestoneId }, plan: { revision: result.revision } }, requestContext.requestId, 201);
  } catch (error) {
    return routeError(error, requestContext.requestId);
  }
}

export async function PATCH(request: Request, route: { params: Promise<{ planId: string }> }) {
  const requestContext = await coachRequest(request, true);
  if (requestContext instanceof Response) return requestContext;
  try {
    const { planId } = await route.params;
    const body = await exactJson(request, ["expectedRevision", "milestoneId", "nextStatus"]);
    const result = await transitionMilestone(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      {
        milestoneId: requiredText(body.milestoneId, "milestoneId", 200),
        nextStatus: enumValue(body.nextStatus, "nextStatus", ["published", "withdrawn"] as const),
      },
    );
    return json({ transitioned: true, plan: { revision: result.revision } }, requestContext.requestId);
  } catch (error) {
    return routeError(error, requestContext.requestId);
  }
}
