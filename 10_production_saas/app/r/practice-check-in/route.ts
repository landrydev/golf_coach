import { cookies } from "next/headers";
import {
  assertExactObjectKeys,
  assertSameOrigin,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import {
  ABUSE_LIMITS,
  clientNetworkSubject,
  enforceAbuseLimit,
} from "@/lib/rate-limit";
import { recordPracticeCheckIn } from "@/lib/rich-coaching";
import { requestCorrelationId } from "@/lib/request-correlation";

const SHARE_COOKIE = "roadmap_share";
const FIELDS = [
  "practiceItemId",
  "sessionContext",
  "completionStatus",
  "perceivedDifficulty",
  "confidenceRating",
  "note",
  "requestHelp",
] as const;

export async function POST(request: Request): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    await enforceAbuseLimit(
      ABUSE_LIMITS.shareResponseNetwork,
      clientNetworkSubject(request),
    );
    const rawSessionToken = (await cookies()).get(SHARE_COOKIE)?.value;
    if (!rawSessionToken) {
      throw new RequestError(404, "plan_unavailable", "This private plan is unavailable.");
    }
    await enforceAbuseLimit(ABUSE_LIMITS.shareResponseCapability, rawSessionToken);
    const payload = asObject(await readJson<unknown>(request));
    assertExactObjectKeys(payload, FIELDS);
    const result = await recordPracticeCheckIn({
      rawSessionToken,
      sessionContext: validatedSessionContext(payload.sessionContext),
      practiceItemId: opaqueId(payload.practiceItemId, "practiceItemId"),
      idempotencyKey: validatedIdempotencyKey(request),
      completionStatus: oneOf(payload.completionStatus, "completionStatus", [
        "completed",
        "not_completed",
      ] as const),
      perceivedDifficulty:
        payload.perceivedDifficulty == null || payload.perceivedDifficulty === ""
          ? null
          : oneOf(payload.perceivedDifficulty, "perceivedDifficulty", [
              "very_easy",
              "easy",
              "appropriate",
              "hard",
              "very_hard",
            ] as const),
      confidenceRating:
        payload.confidenceRating == null
          ? null
          : integerBetween(payload.confidenceRating, "confidenceRating", 1, 5),
      note: optionalText(payload.note, "note", 1_000),
      requestHelp: requiredBoolean(payload.requestHelp, "requestHelp"),
      requestId,
    });
    return Response.json(
      { checkIn: result.checkIn, idempotentReplay: result.replayed },
      {
        status: result.replayed ? 200 : 201,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Request-ID": requestId,
        },
      },
    );
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Request-ID", requestId);
    return response;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, "invalid_body", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function validatedSessionContext(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new RequestError(400, "session_context_required", "Reload this private plan before checking in.");
  }
  return value;
}

function opaqueId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new RequestError(400, "invalid_field", `${field} is invalid.`);
  }
  return value;
}

function validatedIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{19,127}$/.test(value)) {
    throw new RequestError(400, "idempotency_key_required", "A safe retry key is required.");
  }
  return value;
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  field: string,
  values: T,
): T[number] {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw new RequestError(400, "invalid_field", `${field} is invalid.`);
  }
  return value as T[number];
}

function integerBetween(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new RequestError(400, "invalid_field", `${field} must be from ${min} to ${max}.`);
  }
  return value as number;
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new RequestError(400, "invalid_field", `${field} is invalid.`);
  }
  return value.trim() || null;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new RequestError(400, "invalid_field", `${field} must be true or false.`);
  }
  return value;
}
