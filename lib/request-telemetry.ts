import { normalizeApplicationPath } from "@/lib/product-access";

export const SLOW_REQUEST_THRESHOLD_MS = 1_000;

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SAFE_REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

export type RequestRouteFamily =
  | "public_health"
  | "operations_health"
  | "profile"
  | "billing_webhook"
  | "billing"
  | "data_export"
  | "data_requests"
  | "packages"
  | "golfers"
  | "plans"
  | "api_other"
  | "golfer_experience"
  | "instructor_app"
  | "public_site";

export type RequestTelemetry = Readonly<{
  event: "http_request";
  requestId: string;
  routeFamily: RequestRouteFamily;
  method: string;
  status: number;
  durationBucket:
    | "under_100ms"
    | "100_to_499ms"
    | "500_to_999ms"
    | "1_to_4s"
    | "5s_or_more";
  outcome: "success" | "redirect" | "client_error" | "server_error";
}>;

export function requestRouteFamily(rawPathname: string): RequestRouteFamily {
  const pathname = normalizeApplicationPath(rawPathname);

  if (pathname === "/api/health") return "public_health";
  if (pathname === "/api/operations/health") return "operations_health";
  if (pathname === "/api/profile") return "profile";
  if (
    pathname === "/api/billing/webhook" ||
    pathname.startsWith("/api/billing/webhook/")
  ) {
    return "billing_webhook";
  }
  if (pathname === "/api/billing" || pathname.startsWith("/api/billing/")) {
    return "billing";
  }
  if (pathname === "/api/data-export") return "data_export";
  if (
    pathname === "/api/data-requests" ||
    pathname.startsWith("/api/data-requests/")
  ) {
    return "data_requests";
  }
  if (pathname === "/api/packages" || pathname.startsWith("/api/packages/")) {
    return "packages";
  }
  if (pathname === "/api/golfers" || pathname.startsWith("/api/golfers/")) {
    return "golfers";
  }
  if (pathname === "/api/plans" || pathname.startsWith("/api/plans/")) {
    return "plans";
  }
  if (pathname.startsWith("/api/")) return "api_other";
  if (pathname === "/r" || pathname.startsWith("/r/")) {
    return "golfer_experience";
  }
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    return "instructor_app";
  }
  return "public_site";
}

export function buildRequestTelemetry(input: {
  requestId: string;
  rawPathname: string;
  method: string;
  status: number;
  durationMs: number;
}): RequestTelemetry {
  const method = safeMethod(input.method);
  const status = safeStatus(input.status);

  return Object.freeze({
    event: "http_request",
    requestId: safeRequestId(input.requestId),
    routeFamily: requestRouteFamily(input.rawPathname),
    method,
    status,
    durationBucket: durationBucket(input.durationMs),
    outcome:
      status >= 500
        ? "server_error"
        : status >= 400
          ? "client_error"
          : status >= 300
            ? "redirect"
            : "success",
  });
}

export function shouldLogRequestTelemetry(
  telemetry: RequestTelemetry,
): boolean {
  return (
    MUTATION_METHODS.has(telemetry.method) ||
    telemetry.status >= 500 ||
    telemetry.durationBucket === "1_to_4s" ||
    telemetry.durationBucket === "5s_or_more"
  );
}

function safeRequestId(value: string): string {
  return SAFE_REQUEST_ID.test(value) ? value : crypto.randomUUID();
}

function safeMethod(value: string): string {
  const normalized = value.toUpperCase();
  return ALLOWED_METHODS.has(normalized) ? normalized : "OTHER";
}

function safeStatus(value: number): number {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 500;
}

function durationBucket(value: number): RequestTelemetry["durationBucket"] {
  const durationMs = Number.isFinite(value) ? Math.max(0, value) : 5_000;
  if (durationMs < 100) return "under_100ms";
  if (durationMs < 500) return "100_to_499ms";
  if (durationMs < SLOW_REQUEST_THRESHOLD_MS) return "500_to_999ms";
  if (durationMs < 5_000) return "1_to_4s";
  return "5s_or_more";
}
