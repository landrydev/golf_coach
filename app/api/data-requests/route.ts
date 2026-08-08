import {
  assertSameOrigin,
  cleanText,
  errorResponse,
  RequestError,
  readJson,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import {
  createAccountDataRequest,
  getOrCreateAccountForIdentity,
  listAccountDataRequests,
} from "@/lib/repository";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";
import { newId } from "@/lib/tokens";

export async function GET(): Promise<Response> {
  const requestId = newId();
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
  const requestId = newId();
  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);
    const account = await getOrCreateAccountForIdentity(auth.identity);
    await enforceAbuseLimit(ABUSE_LIMITS.dataRequestAccount, account.id);
    const payload = asObject(await readJson<unknown>(request));
    rejectClientAccountId(payload);

    if (payload.type !== "export" && payload.type !== "deletion") {
      throw new RequestError(
        400,
        "invalid_field",
        "type must be export or deletion.",
      );
    }
    const details = optionalText(payload, "details", 1_000);
    const submission = await createAccountDataRequest(
      account.id,
      { type: payload.type, details: details || null },
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

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, "invalid_body", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function optionalText(
  payload: Record<string, unknown>,
  field: string,
  max: number,
): string {
  const value = payload[field];
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") {
    throw new RequestError(400, "invalid_field", `${field} must be text.`);
  }
  return cleanText(value, field, { max });
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
