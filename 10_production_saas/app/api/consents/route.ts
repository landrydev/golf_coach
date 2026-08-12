import {
  assertExactObjectKeys,
  assertSameOrigin,
  errorResponse,
  RequestError,
  readJson,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import {
  isConsentPurpose,
  isConsentSubjectType,
  listConsentCurrentState,
  parseConsentPolicyRegistry,
  recordConsentTransition,
  type ConsentSubject,
} from "@/lib/consent-repository";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { requestCorrelationId } from "@/lib/request-correlation";

const TRANSITION_FIELDS = [
  "action",
  "purpose",
  "policyVersion",
  "subjectType",
  "golferId",
  "expectedCurrentRecordId",
  "evidenceReference",
] as const;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

export async function GET(request: Request): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);
    const subject = readSubjectQuery(request);
    const account = await getOrCreateAccountForIdentity(auth.identity);
    const registry = parseConsentPolicyRegistry();
    const consents = await listConsentCurrentState(account.id, subject, registry);

    return json(
      {
        subject,
        policyRegistry: { state: registry.state },
        consents,
      },
      { requestId },
    );
  } catch (error) {
    return noStore(errorResponse(error), requestId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);
    const idempotencyKey = validatedIdempotencyKey(request);
    const payload = asObject(await readJson<unknown>(request));
    rejectClientAccountId(payload);
    assertExactObjectKeys(payload, TRANSITION_FIELDS);

    const action = transitionAction(payload.action);
    if (!isConsentPurpose(payload.purpose)) {
      throw new RequestError(400, "invalid_field", "purpose is not supported.");
    }
    if (!isConsentSubjectType(payload.subjectType)) {
      throw new RequestError(400, "invalid_field", "subjectType is not supported.");
    }
    const policyVersion = safeString(payload.policyVersion, "policyVersion", SAFE_VERSION);
    const subject = consentSubject(payload.subjectType, payload.golferId);
    const expectedCurrentRecordId = nullableIdentifier(
      payload,
      "expectedCurrentRecordId",
      true,
    );
    const evidenceReference = nullableIdentifier(payload, "evidenceReference", false);
    const account = await getOrCreateAccountForIdentity(auth.identity);

    const result = await recordConsentTransition({
      accountId: account.id,
      action,
      purpose: payload.purpose,
      policyVersion,
      subject,
      expectedCurrentRecordId,
      evidenceReference,
      idempotencyKey,
      requestId,
      registry: parseConsentPolicyRegistry(),
    });

    return json(result, { status: result.replayed ? 200 : 201, requestId });
  } catch (error) {
    return noStore(errorResponse(error), requestId);
  }
}

function readSubjectQuery(request: Request): ConsentSubject {
  const query = new URL(request.url).searchParams;
  const unsupported = [...new Set(query.keys())].filter(
    (key) => key !== "subjectType" && key !== "golferId",
  );
  if (
    unsupported.length > 0 ||
    query.getAll("subjectType").length > 1 ||
    query.getAll("golferId").length > 1
  ) {
    throw new RequestError(400, "invalid_query", "The consent query is invalid.");
  }

  const subjectType = query.get("subjectType") ?? "account";
  if (!isConsentSubjectType(subjectType)) {
    throw new RequestError(400, "invalid_query", "The consent query is invalid.");
  }
  const golferId = query.get("golferId");
  return consentSubject(subjectType, golferId);
}

function consentSubject(
  subjectType: "account" | "golfer",
  golferIdValue: unknown,
): ConsentSubject {
  if (subjectType === "account") {
    if (
      golferIdValue !== null &&
      golferIdValue !== undefined &&
      golferIdValue !== ""
    ) {
      throw new RequestError(
        400,
        "invalid_consent_subject",
        "The consent subject is invalid.",
      );
    }
    return { type: "account", golferId: null };
  }
  const golferId = safeString(golferIdValue, "golferId", SAFE_IDENTIFIER);
  return { type: "golfer", golferId };
}

function transitionAction(value: unknown): "grant" | "withdraw" {
  if (value === "grant" || value === "withdraw") return value;
  throw new RequestError(400, "invalid_field", "action is not supported.");
}

function nullableIdentifier(
  payload: Record<string, unknown>,
  field: string,
  required: boolean,
): string | null {
  if (!Object.hasOwn(payload, field)) {
    if (required) {
      throw new RequestError(400, "invalid_field", `${field} is required.`);
    }
    return null;
  }
  const value = payload[field];
  if (value === null || value === "") return null;
  return safeString(value, field, SAFE_IDENTIFIER);
}

function safeString(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new RequestError(400, "invalid_field", `${field} is invalid.`);
  }
  return value;
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

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, "invalid_body", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function rejectClientAccountId(payload: Record<string, unknown>): void {
  if (Object.hasOwn(payload, "accountId") || Object.hasOwn(payload, "account_id")) {
    throw new RequestError(
      400,
      "client_account_id_not_allowed",
      "accountId is assigned from the authenticated session.",
    );
  }
}

function json(
  body: unknown,
  options: { status?: number; requestId?: string } = {},
): Response {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  if (options.requestId) headers.set("X-Request-ID", options.requestId);
  return Response.json(body, { status: options.status ?? 200, headers });
}

function noStore(response: Response, requestId?: string): Response {
  response.headers.set("Cache-Control", "private, no-store");
  if (requestId) response.headers.set("X-Request-ID", requestId);
  return response;
}
