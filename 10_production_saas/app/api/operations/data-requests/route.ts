import {
  enforceDataRequestOperatorAbuseLimits,
  operatorErrorResponse,
  operatorJson,
  requireDataRequestOperator,
} from "./_shared";
import { listDataRequestOperatorQueue } from "@/lib/data-request-operations";
import { parseDataRequestOperatorPage } from "@/lib/data-request-operator-pagination";
import { errorResponse } from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { requestCorrelationId } from "@/lib/request-correlation";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    const auth = await requireApiIdentity();
    if (auth.response) return operatorErrorResponse(auth.response, requestId);
    const operatorDigest = await requireDataRequestOperator(auth.identity);
    const page = parseDataRequestOperatorPage(request);
    await enforceDataRequestOperatorAbuseLimits(request, operatorDigest);
    const queue = await listDataRequestOperatorQueue({
      operatorDigest,
      requestId,
      page,
    });
    return operatorJson(
      {
        ...queue,
        capabilities: {
          detailInventoryAvailable: true,
          statusTransitionAvailable: queue.requests.some(
            (item) => item.capabilities.statusTransitionAvailable,
          ),
          fulfillmentAvailable: false,
          deletionAvailable: false,
        },
      },
      requestId,
    );
  } catch (error) {
    return operatorErrorResponse(errorResponse(error), requestId);
  }
}
