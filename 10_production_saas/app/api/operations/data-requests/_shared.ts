import {
  evaluateDataRequestOperatorAccess,
  type DataRequestOperatorAccessEnvironment,
} from "@/lib/data-request-operator-access";
import type { RequestIdentity } from "@/lib/identity";
import { RequestError } from "@/lib/http";
import {
  ABUSE_LIMITS,
  clientNetworkSubject,
  enforceAbuseLimit,
} from "@/lib/rate-limit";

export async function requireDataRequestOperator(
  identity: RequestIdentity,
  environment: DataRequestOperatorAccessEnvironment = {
    DATA_REQUEST_OPERATOR_ACCESS_PEPPER:
      process.env.DATA_REQUEST_OPERATOR_ACCESS_PEPPER,
    DATA_REQUEST_OPERATOR_EMAIL_DIGESTS:
      process.env.DATA_REQUEST_OPERATOR_EMAIL_DIGESTS,
  },
): Promise<string> {
  // Local development fallback identity is useful for ordinary product work,
  // but operator APIs require an identity actually forwarded by SIWC.
  if (identity.source !== "siwc") {
    throw new RequestError(
      401,
      "authentication_required",
      "Sign in with an authorized account to use this operation.",
    );
  }

  const access = await evaluateDataRequestOperatorAccess({
    authenticatedEmail: identity.email,
    environment,
  });
  if (access.decision === "unavailable") {
    throw new RequestError(
      503,
      "data_request_operator_access_unavailable",
      "Data-request operator access is temporarily unavailable.",
    );
  }
  if (access.decision === "forbidden") {
    throw new RequestError(
      403,
      "data_request_operator_access_denied",
      "Data-request operator access is not available for this account.",
    );
  }
  return access.operatorDigest;
}

export async function enforceDataRequestOperatorAbuseLimits(
  request: Request,
  operatorDigest: string,
): Promise<void> {
  const networkSubject = clientNetworkSubject(request);
  // The raw network address and HMAC-derived operator reference exist only in
  // this request. enforceAbuseLimit applies a second, scope/window-separated
  // HMAC before either subject can reach the operational counter table.
  await Promise.all([
    enforceAbuseLimit(
      ABUSE_LIMITS.dataRequestOperatorNetwork,
      networkSubject,
    ),
    enforceAbuseLimit(
      ABUSE_LIMITS.dataRequestOperatorIdentity,
      operatorDigest,
    ),
  ]);
}

export function validatedOperatorIdempotencyKey(request: Request): string {
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

export function operatorJson(
  body: unknown,
  requestId: string,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: operatorPrivateHeaders(requestId),
  });
}

export function operatorErrorResponse(
  response: Response,
  requestId: string,
): Response {
  const headers = operatorPrivateHeaders(requestId);
  for (const [name, value] of headers) response.headers.set(name, value);
  return response;
}

function operatorPrivateHeaders(requestId: string): Headers {
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "X-Request-ID": requestId,
  });
}
