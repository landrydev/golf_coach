/** Cloudflare Worker entry point for the Roadmap application. */
import handler from "vinext/server/app-router-entry";
import {
  evaluateInstructorRequestAccess,
  normalizeApplicationPath,
  productAccessDeniedResponse,
} from "../lib/product-access";
import { runBillingReconciliationSweep } from "../lib/billing-reconciliation-sweep";
import {
  beginBillingSchedulerAttempt,
  completeBillingSchedulerAttempt,
  failBillingSchedulerAttempt,
  schedulerFailureCode,
} from "../lib/scheduler-heartbeat";
import {
  buildRequestTelemetry,
  shouldLogRequestTelemetry,
} from "../lib/request-telemetry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
  INSTRUCTOR_ACCESS_MODE?: string;
  OWNER_PRIVATE_ACCESS_PEPPER?: string;
  OWNER_PRIVATE_EMAIL_DIGESTS?: string;
  SUBSCRIPTION_ACCESS_STATUSES?: string;
  STRIPE_CHECKOUT_PRICE_ID?: string;
  STRIPE_RECOGNIZED_PRICE_IDS?: string;
  SUBSCRIPTION_ENTITLEMENT_PRICE_IDS?: string;
  SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS?: string;
  RELEASE_ID?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    const url = new URL(request.url);

    try {
      const accessDecision = await evaluateInstructorRequestAccess({
        pathname: url.pathname,
        authenticatedEmail: request.headers.get("oai-authenticated-user-email"),
        environment: env,
      });
      if (
        accessDecision !== "not_applicable" &&
        accessDecision !== "granted"
      ) {
        const response = withSecurityHeaders(
          productAccessDeniedResponse(accessDecision, request),
          request,
          requestId,
        );
        emitRequestTelemetry({
          request,
          requestId,
          status: response.status,
          startedAt,
        });
        return response;
      }

      const response = withSecurityHeaders(
        await handler.fetch(request, env, ctx),
        request,
        requestId,
      );
      emitRequestTelemetry({
        request,
        requestId,
        status: response.status,
        startedAt,
      });
      return response;
    } catch (error) {
      emitRequestTelemetry({
        request,
        requestId,
        status: 500,
        startedAt,
      });
      throw error;
    }
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const attempt = await beginBillingSchedulerAttempt({
      database: env.DB,
      releaseId: env.RELEASE_ID,
    });

    try {
      const result = await runBillingReconciliationSweep({
        now: new Date(controller.scheduledTime),
      });
      await completeBillingSchedulerAttempt({
        database: env.DB,
        attempt,
        result,
      });
      console.log("Scheduled billing reconciliation sweep completed", result);
    } catch (error) {
      const failureCode = schedulerFailureCode(error);
      try {
        await failBillingSchedulerAttempt({
          database: env.DB,
          attempt,
          failureCode,
        });
      } catch {
        console.error("Scheduler failure heartbeat could not be persisted", {
          errorCode: "scheduler_heartbeat_persistence_failed",
        });
      }
      console.error("Scheduled billing reconciliation sweep failed", {
        errorCode: failureCode,
      });
      throw error;
    }
  },
};

function withSecurityHeaders(
  response: Response,
  request: Request,
  requestId: string,
): Response {
  const headers = new Headers(response.headers);
  const requestUrl = new URL(request.url);
  const applicationPath = normalizeApplicationPath(requestUrl.pathname);
  const isLocal = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
  const isInstructorPath =
    applicationPath === "/app" || applicationPath.startsWith("/app/");
  const isGolferPath =
    applicationPath === "/r" || applicationPath.startsWith("/r/");
  const isBillingPage = applicationPath === "/app/billing";
  const isOperationalHealth = applicationPath === "/api/operations/health";
  const isPublicHealth = applicationPath === "/api/health";

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Origin-Agent-Cluster", "?1");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("X-Request-ID", requestId);
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");

  if (
    (requestUrl.pathname.startsWith("/api/") && !isPublicHealth) ||
    isInstructorPath
  ) {
    headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  if (isInstructorPath || isGolferPath || isOperationalHealth) {
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  if (!isLocal) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    headers.set(
      "Content-Security-Policy",
      [
        // Vinext currently emits inline script elements for its RSC/hydration
        // bootstrap. Keep those elements working, while CSP3-capable browsers
        // independently block injected event-handler attributes. Replacing the
        // element allowance requires a framework-propagated per-response nonce.
        "default-src 'self'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        isBillingPage
          ? "form-action 'self' https://checkout.stripe.com https://billing.stripe.com"
          : "form-action 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline'",
        "script-src-elem 'self' 'unsafe-inline'",
        "script-src-attr 'none'",
        "connect-src 'self'",
        "frame-src 'none'",
        "object-src 'none'",
        "worker-src 'none'",
        "manifest-src 'self'",
        "upgrade-insecure-requests",
      ].join("; "),
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function emitRequestTelemetry(input: {
  request: Request;
  requestId: string;
  status: number;
  startedAt: number;
}): void {
  const telemetry = buildRequestTelemetry({
    requestId: input.requestId,
    rawPathname: new URL(input.request.url).pathname,
    method: input.request.method,
    status: input.status,
    durationMs: performance.now() - input.startedAt,
  });
  if (!shouldLogRequestTelemetry(telemetry)) return;

  // The telemetry builder exposes only fixed, allowlisted dimensions. Never
  // pass a Request, URL, exception, headers, or application payload to logs.
  try {
    console.info(telemetry);
  } catch {
    // Observability must not alter application response behavior.
  }
}

export default worker;
