import {
  enforceDataRequestOperatorAbuseLimits,
  operatorErrorResponse,
  operatorJson,
  requireDataRequestOperator,
  validatedOperatorIdempotencyKey,
} from "../_shared";
import {
  dataRequestOperatorTransitionExpectedStatuses,
  dataRequestOperatorTransitionTargetStatuses,
  getDataRequestOperatorDetail,
  transitionDataRequestOperatorStatus,
  type DataRequestOperatorTransitionExpectedStatus,
  type DataRequestOperatorTransitionTargetStatus,
} from "@/lib/data-request-operations";
import {
  assertExactObjectKeys,
  assertSameOrigin,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { requestCorrelationId } from "@/lib/request-correlation";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    const auth = await requireApiIdentity();
    if (auth.response) return operatorErrorResponse(auth.response, requestId);
    const operatorDigest = await requireDataRequestOperator(auth.identity);
    const dataRequestId = await dataRequestIdFrom(context);
    await enforceDataRequestOperatorAbuseLimits(request, operatorDigest);
    const detail = await getDataRequestOperatorDetail({
      dataRequestId,
      operatorDigest,
      requestId,
    });
    return operatorJson(detail, requestId);
  } catch (error) {
    return operatorErrorResponse(errorResponse(error), requestId);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return operatorErrorResponse(auth.response, requestId);
    const operatorDigest = await requireDataRequestOperator(auth.identity);
    const dataRequestId = await dataRequestIdFrom(context);
    await enforceDataRequestOperatorAbuseLimits(request, operatorDigest);
    const idempotencyKey = validatedOperatorIdempotencyKey(request);
    const payload = asObject(await readJson<unknown>(request));
    assertExactObjectKeys(payload, [
      "expectedStatus",
      "expectedUpdatedAt",
      "targetStatus",
    ]);

    const expectedStatus = expectedOperatorStatus(payload.expectedStatus);
    const targetStatus = targetOperatorStatus(payload.targetStatus);
    const expectedUpdatedAt = timestampValue(
      payload.expectedUpdatedAt,
      "expectedUpdatedAt",
    );
    const result = await transitionDataRequestOperatorStatus({
      dataRequestId,
      operatorDigest,
      idempotencyKey,
      expectedStatus,
      expectedUpdatedAt,
      targetStatus,
      requestId,
    });
    return operatorJson(result, requestId);
  } catch (error) {
    return operatorErrorResponse(errorResponse(error), requestId);
  }
}

async function dataRequestIdFrom(context: {
  params: Promise<{ requestId: string }>;
}): Promise<string> {
  const { requestId } = await context.params;
  const value = cleanText(requestId, "requestId", {
    required: true,
    max: 128,
  });
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new RequestError(
      400,
      "invalid_field",
      "requestId must be a valid opaque identifier.",
    );
  }
  return value;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(
      400,
      "invalid_body",
      "Request body must be a JSON object.",
    );
  }
  return value as Record<string, unknown>;
}

function expectedOperatorStatus(
  value: unknown,
): DataRequestOperatorTransitionExpectedStatus {
  if (
    typeof value !== "string" ||
    !(dataRequestOperatorTransitionExpectedStatuses as readonly string[]).includes(
      value,
    )
  ) {
    throw new RequestError(
      400,
      "invalid_field",
      "expectedStatus must be submitted for the available review marker.",
    );
  }
  return value as DataRequestOperatorTransitionExpectedStatus;
}

function targetOperatorStatus(
  value: unknown,
): DataRequestOperatorTransitionTargetStatus {
  if (
    typeof value !== "string" ||
    !(dataRequestOperatorTransitionTargetStatuses as readonly string[]).includes(
      value,
    )
  ) {
    throw new RequestError(
      400,
      "invalid_field",
      "targetStatus must be identity_verification_required.",
    );
  }
  return value as DataRequestOperatorTransitionTargetStatus;
}

function timestampValue(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 8_640_000_000_000_000
  ) {
    throw new RequestError(
      400,
      "invalid_field",
      `${field} must be a valid epoch-millisecond version.`,
    );
  }
  return value;
}
