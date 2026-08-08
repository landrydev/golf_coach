import {
  assertExactObjectKeys,
  assertSameOrigin,
  cleanText,
  errorResponse,
  RequestError,
  readJson,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import {
  type AccountDataRequestType,
  createAccountDataRequest,
  getOrCreateAccountForIdentity,
  listAccountDataRequests,
} from "@/lib/repository";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";
import { requestCorrelationId } from "@/lib/request-correlation";

export async function GET(request: Request): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);
    const account = await getOrCreateAccountForIdentity(auth.identity);
    const requests = await listAccountDataRequests(account.id);
    return json({ requests }, { requestId });
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
    const account = await getOrCreateAccountForIdentity(auth.identity);
    await enforceAbuseLimit(ABUSE_LIMITS.dataRequestAccount, account.id);
    const payload = asObject(await readJson<unknown>(request));
    rejectClientAccountId(payload);
    assertExactObjectKeys(payload, ["type", "details"]);

    if (!isAccountDataRequestType(payload.type)) {
      throw new RequestError(
        400,
        "invalid_field",
        "type must be access, export, correction, deletion, restriction, or consent_withdrawal.",
      );
    }
    const details = requestDetails(payload, payload.type);
    const submission = await createAccountDataRequest(
      account.id,
      { type: payload.type, details: details || null },
      idempotencyKey,
      requestId,
    );

    return json(
      {
        request: submission.request,
        existing: !submission.created,
      },
      { status: submission.created ? 201 : 200, requestId },
    );
  } catch (error) {
    return noStore(errorResponse(error), requestId);
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

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, "invalid_body", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function requestDetails(
  payload: Record<string, unknown>,
  type: AccountDataRequestType,
): string {
  const field = "details";
  const value = payload[field];
  const requiresDetails =
    type === "access" ||
    type === "correction" ||
    type === "restriction" ||
    type === "consent_withdrawal";
  if (value === undefined || value === null || value === "") {
    if (requiresDetails) {
      throw new RequestError(
        400,
        "invalid_field",
        "details is required for this request type.",
      );
    }
    return "";
  }
  if (typeof value !== "string") {
    throw new RequestError(400, "invalid_field", `${field} must be text.`);
  }
  const details = cleanText(value, field, { required: requiresDetails, max: 1_000 });
  if (requiresDetails && !details) {
    throw new RequestError(400, "invalid_field", "details is required for this request type.");
  }
  return details;
}

function isAccountDataRequestType(value: unknown): value is AccountDataRequestType {
  return (
    value === "access" ||
    value === "export" ||
    value === "correction" ||
    value === "deletion" ||
    value === "restriction" ||
    value === "consent_withdrawal"
  );
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
