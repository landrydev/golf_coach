import { cookies } from "next/headers";
import {
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
  try {
    assertSameOrigin(request);
    await enforceAbuseLimit(
      ABUSE_LIMITS.shareResponseNetwork,
      clientNetworkSubject(request),
    );
    const value = await readJson<unknown>(request);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new RequestError(400, "invalid_body", "Request body must be a JSON object.");
    }
    const payload = value as { responseType?: unknown };
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
      requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
    });

    return Response.json(
      { response },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
