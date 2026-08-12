import { assertExactObjectKeys, RequestError } from "@/lib/http";
import { createLaunchMonitorComparison, listLaunchMonitorComparisons } from "@/lib/rich-coaching";
import {
  coachRequest, exactJson, json, objectBody, optionalText, planMutationContext,
  requiredText, routeError,
} from "@/app/api/coaching/_shared";

export async function GET(request: Request, route: { params: Promise<{ planId: string }> }) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const { planId } = await route.params;
    const comparisons = await listLaunchMonitorComparisons({
      accountId: context.accountId,
      planId,
      includeWithdrawn: new URL(request.url).searchParams.get("includeWithdrawn") === "true",
    });
    return json({ comparisons }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function POST(request: Request, route: { params: Promise<{ planId: string }> }) {
  const requestContext = await coachRequest(request, true);
  if (requestContext instanceof Response) return requestContext;
  try {
    const { planId } = await route.params;
    const body = await exactJson(request, [
      "expectedRevision", "title", "baselineSessionId", "currentSessionId", "coachInterpretation",
      "limitations", "nextEvidenceNeeded", "metricPairs",
    ]);
    if (!Array.isArray(body.metricPairs) || body.metricPairs.length < 1 || body.metricPairs.length > 64) {
      throw new RequestError(400, "invalid_field", "metricPairs must contain 1 to 64 pairs.");
    }
    const metricPairs = body.metricPairs.map((entry, index) => {
      const pair = objectBody(entry, `metricPairs[${index}]`);
      assertExactObjectKeys(pair, ["baselineMetricId", "currentMetricId", "displayName"]);
      return {
        baselineMetricId: requiredText(pair.baselineMetricId, `metricPairs[${index}].baselineMetricId`, 200),
        currentMetricId: requiredText(pair.currentMetricId, `metricPairs[${index}].currentMetricId`, 200),
        displayName: optionalText(pair.displayName, `metricPairs[${index}].displayName`, 160),
      };
    });
    const result = await createLaunchMonitorComparison(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      {
        title: requiredText(body.title, "title", 160),
        baselineSessionId: requiredText(body.baselineSessionId, "baselineSessionId", 200),
        currentSessionId: requiredText(body.currentSessionId, "currentSessionId", 200),
        coachInterpretation: requiredText(body.coachInterpretation, "coachInterpretation", 2_000),
        limitations: requiredText(body.limitations, "limitations", 1_500),
        nextEvidenceNeeded: optionalText(body.nextEvidenceNeeded, "nextEvidenceNeeded", 1_000),
        metricPairs,
      },
    );
    return json({ comparison: { id: result.comparisonId }, plan: { revision: result.revision } }, requestContext.requestId, 201);
  } catch (error) {
    return routeError(error, requestContext.requestId);
  }
}
