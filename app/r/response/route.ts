import { cookies } from "next/headers";
import {
  assertExactObjectKeys,
  assertSameOrigin,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import {
  recordGolferResponse,
  type GolferResponseType,
} from "@/lib/plans";
import {
  ABUSE_LIMITS,
  clientNetworkSubject,
  enforceAbuseLimit,
} from "@/lib/rate-limit";
import { requestCorrelationId } from "@/lib/request-correlation";

const SHARE_COOKIE = "roadmap_share";
const RESPONSE_TYPES = new Set<GolferResponseType>([
  "ask_question",
  "wait",
  "decline",
  "request_reassessment",
  "independent_practice",
  "external_action_opened",
]);

export async function POST(request: Request): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    await enforceAbuseLimit(
      ABUSE_LIMITS.shareResponseNetwork,
      clientNetworkSubject(request),
    );
    const idempotencyKey = validatedIdempotencyKey(request);
    const value = await readJson<unknown>(request);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new RequestError(400, "invalid_body", "Request body must be a JSON object.");
    }
    const payload = value as Record<string, unknown>;
    assertExactObjectKeys(payload, ["responseType"]);
    if (
      typeof payload.responseType !== "string" ||
      !RESPONSE_TYPES.has(payload.responseType as GolferResponseType)
    ) {
      throw new RequestError(
        400,
        "invalid_response_type",
        "Choose one of the available plan responses.",
      );
    }

    const cookieStore = await cookies();
    const rawSessionToken = cookieStore.get(SHARE_COOKIE)?.value;
    if (!rawSessionToken) {
      throw new RequestError(404, "plan_unavailable", "This private plan is unavailable.");
    }
    await enforceAbuseLimit(
      ABUSE_LIMITS.shareResponseCapability,
      rawSessionToken,
    );

    const response = await recordGolferResponse({
      rawSessionToken,
      responseType: payload.responseType as GolferResponseType,
      idempotencyKey,
      requestId,
    });

    return Response.json(
      {
        response: response.response,
        idempotentReplay: response.replayed,
      },
      {
        status: response.replayed ? 200 : 201,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Request-ID": requestId,
        },
      },
    );
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("X-Request-ID", requestId);
    return response;
  }
}

function validatedIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{19,127}$/.test(value)) {
    throw new RequestError(
      400,
      "idempotency_key_required",
      "Provide a stable Idempotency-Key of 20 to 128 safe characters.",
    );
  }
  return value;
}
