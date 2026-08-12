import { requireGolferRecordProcessingConsent } from "@/lib/consent-enforcement";
import {
  assertExactObjectKeys,
  assertSameOrigin,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { requestCorrelationId } from "@/lib/request-correlation";
import type { RichPlanMutationContext } from "@/lib/rich-coaching";

export const PRIVATE_NO_STORE = {
  "Cache-Control": "private, no-store",
} as const;

export type CoachRequest = Readonly<{
  accountId: string;
  requestId: string;
}>;

export async function coachRequest(request: Request, mutation = false): Promise<CoachRequest | Response> {
  const requestId = requestCorrelationId(request);
  try {
    if (mutation) assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return withRequestId(authentication.response, requestId);
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    return { accountId: account.id, requestId };
  } catch (error) {
    return withRequestId(errorResponse(error), requestId);
  }
}

export async function planMutationContext(
  request: CoachRequest,
  planId: string,
  expectedRevision: unknown,
): Promise<RichPlanMutationContext> {
  return {
    accountId: request.accountId,
    planId: requiredText(planId, "planId", 200),
    expectedRevision: positiveInteger(expectedRevision, "expectedRevision"),
    consentRequirements: await requireGolferRecordProcessingConsent(request.accountId),
    requestId: request.requestId,
  };
}

export async function exactJson(
  request: Request,
  keys: readonly string[],
): Promise<Record<string, unknown>> {
  const body = objectBody(await readJson<unknown>(request));
  assertExactObjectKeys(body, keys);
  return body;
}

export function objectBody(value: unknown, field = "body"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, `invalid_${field}`, `${field} must be a JSON object.`);
  }
  if (Object.hasOwn(value, "accountId") || Object.hasOwn(value, "account_id")) {
    throw new RequestError(400, "client_account_id_not_allowed", "Account ownership comes from sign-in.");
  }
  return value as Record<string, unknown>;
}

export function requiredText(value: unknown, field: string, max = 2_000): string {
  return cleanText(value, field, { required: true, max });
}

export function optionalText(value: unknown, field: string, max = 2_000): string | null {
  if (value === null || value === undefined || value === "") return null;
  return cleanText(value, field, { required: true, max });
}

export function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new RequestError(400, "invalid_field", `${field} must be a boolean.`);
  return value;
}

export function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RequestError(400, "invalid_field", `${field} must be a positive integer.`);
  }
  return value as number;
}

export function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RequestError(400, "invalid_field", `${field} must be a non-negative integer.`);
  }
  return value as number;
}

export function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RequestError(400, "invalid_field", `${field} must be a finite number.`);
  }
  return value;
}

export function enumValue<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  const result = requiredText(value, field, 80);
  if (!allowed.includes(result)) throw new RequestError(400, "invalid_field", `${field} is not allowed.`);
  return result as T[number];
}

export function stringArray(value: unknown, field: string, maxItems = 1_000): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new RequestError(400, "invalid_field", `${field} must be an array with at most ${maxItems} items.`);
  }
  return value.map((item, index) => requiredText(item, `${field}[${index}]`, 2_000));
}

export function recordValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, "invalid_field", `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function dateValue(value: unknown, field: string): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestError(400, "invalid_field", `${field} must be an ISO date or date-time.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RequestError(400, "invalid_field", `${field} is invalid.`);
  return date;
}

export function optionalDate(value: unknown, field: string): Date | null {
  return value === null || value === undefined || value === "" ? null : dateValue(value, field);
}

export function json(
  body: unknown,
  requestId: string,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: { ...PRIVATE_NO_STORE, "X-Request-ID": requestId },
  });
}

export function routeError(error: unknown, requestId: string): Response {
  return withRequestId(errorResponse(error), requestId);
}

export function withRequestId(response: Response, requestId: string): Response {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Request-ID", requestId);
  return response;
}
