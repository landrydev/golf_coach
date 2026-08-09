/** Cloudflare Worker entry point for the Roadmap application. */
import handler from "vinext/server/app-router-entry";
import { evaluateCanonicalRequest } from "../lib/canonical-origin";
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
import { safeErrorType } from "../lib/log-safety";
import { withTrustedRequestCorrelation } from "../lib/request-correlation";
import {
  readApplicationWriteControl,
  requestMayReachApplicationWrites,
  SCHEDULED_WRITES_UNAVAILABLE_LOG,
} from "../lib/application-write-control";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
  APP_URL?: string;
  INSTRUCTOR_ACCESS_MODE?: string;
  OWNER_PRIVATE_ACCESS_PEPPER?: string;
  OWNER_PRIVATE_EMAIL_DIGESTS?: string;
  DATA_REQUEST_OPERATOR_ACCESS_PEPPER?: string;
  DATA_REQUEST_OPERATOR_EMAIL_DIGESTS?: string;
  CONSENT_POLICY_REGISTRY_JSON?: string;
  SUBSCRIPTION_ACCESS_STATUSES?: string;
  STRIPE_CHECKOUT_PRICE_ID?: string;
  STRIPE_RECOGNIZED_PRICE_IDS?: string;
  SUBSCRIPTION_ENTITLEMENT_PRICE_IDS?: string;
  SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS?: string;
  APPLICATION_WRITE_MODE?: string;
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
    const applicationPath = normalizeApplicationPath(url.pathname);
    const contentSecurityPolicy = contentSecurityPolicyForRequest(
      request,
      applicationPath,
    );

    try {
      // Vinext's build-only prerender namespace must never be reachable from
      // the deployed Worker. Keep this application-owned deny rule ahead of
      // canonical-origin, product-access, and framework routing so a future
      // environment/configuration mistake cannot enable the upstream handler.
      if (
        applicationPath === "/__vinext/prerender" ||
        applicationPath.startsWith("/__vinext/prerender/")
      ) {
        const response = withSecurityHeaders(
          new Response("Not Found", {
            status: 404,
            headers: {
              "Cache-Control": "private, no-store, max-age=0",
              Pragma: "no-cache",
              "X-Robots-Tag": "noindex, nofollow, noarchive",
            },
          }),
          request,
          requestId,
          contentSecurityPolicy,
        );
        emitRequestTelemetry({
          request,
          requestId,
          status: response.status,
          startedAt,
        });
        return response;
      }

      const canonicalDecision = evaluateCanonicalRequest(
        request,
        env.APP_URL,
        applicationPath,
      );
      if (canonicalDecision.action !== "allow") {
        const response = withSecurityHeaders(
          canonicalRequestResponse(canonicalDecision),
          request,
          requestId,
          contentSecurityPolicy,
        );
        emitRequestTelemetry({
          request,
          requestId,
          status: response.status,
          startedAt,
        });
        return response;
      }

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
          contentSecurityPolicy,
        );
        emitRequestTelemetry({
          request,
          requestId,
          status: response.status,
          startedAt,
        });
        return response;
      }

      const writeControl = readApplicationWriteControl(
        env.APPLICATION_WRITE_MODE,
      );
      if (
        requestMayReachApplicationWrites(request.method, applicationPath) &&
        !writeControl.writesEnabled
      ) {
        const response = withSecurityHeaders(
          applicationWritesUnavailableResponse(request),
          request,
          requestId,
          contentSecurityPolicy,
        );
        emitRequestTelemetry({
          request,
          requestId,
          status: response.status,
          startedAt,
        });
        return response;
      }

      const trustedRequest = withTrustedRequestCorrelation(
        request,
        requestId,
        contentSecurityPolicy ?? undefined,
      );
      const response = withSecurityHeaders(
        await handler.fetch(trustedRequest, env, ctx),
        request,
        requestId,
        contentSecurityPolicy,
      );
      emitRequestTelemetry({
        request,
        requestId,
        status: response.status,
        startedAt,
      });
      return response;
    } catch (error) {
      const response = withSecurityHeaders(
        Response.json(
          {
            error: {
              code: "internal_error",
              message: "The request could not be completed.",
            },
          },
          {
            status: 500,
            headers: {
              "Cache-Control": "private, no-store, max-age=0",
              Pragma: "no-cache",
              "X-Robots-Tag": "noindex, nofollow, noarchive",
            },
          },
        ),
        request,
        requestId,
        contentSecurityPolicy,
      );
      console.error("Worker request failed", {
        errorType: safeErrorType(error),
        requestId,
      });
      emitRequestTelemetry({
        request,
        requestId,
        status: response.status,
        startedAt,
      });
      return response;
    }
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (!readApplicationWriteControl(env.APPLICATION_WRITE_MODE).writesEnabled) {
      console.info(SCHEDULED_WRITES_UNAVAILABLE_LOG);
      return;
    }

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

function applicationWritesUnavailableResponse(request: Request): Response {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "Retry-After": "60",
    Vary: "Accept",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
  const message = "Changes are temporarily unavailable. Try again later.";

  if (acceptsHtml(request)) {
    return new Response(
      `<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Changes temporarily unavailable | Roadmap</title></head><body><main><h1>Changes temporarily unavailable</h1><p>${message}</p><p><a href="/support">Review support options</a></p></main></body></html>`,
      {
        status: 503,
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }

  return Response.json(
    {
      error: {
        code: "application_writes_unavailable",
        message,
      },
    },
    { status: 503, headers },
  );
}

function acceptsHtml(request: Request): boolean {
  return (request.headers.get("accept") ?? "")
    .split(",")
    .some((value) => value.trim().split(";", 1)[0] === "text/html");
}

function canonicalRequestResponse(
  decision: Exclude<ReturnType<typeof evaluateCanonicalRequest>, { action: "allow" }>,
): Response {
  if (decision.action === "redirect") {
    return new Response(null, {
      status: 308,
      headers: {
        Location: decision.location,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  }

  return Response.json(
    {
      error: {
        code: decision.code,
        message:
          decision.status === 503
            ? "The application origin is unavailable."
            : "This request did not use the canonical application origin.",
      },
    },
    {
      status: decision.status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );
}

function withSecurityHeaders(
  response: Response,
  request: Request,
  requestId: string,
  contentSecurityPolicy: string | null,
): Response {
  const headers = new Headers(response.headers);
  const requestUrl = new URL(request.url);
  const applicationPath = normalizeApplicationPath(requestUrl.pathname);
  const isInstructorPath =
    applicationPath === "/app" || applicationPath.startsWith("/app/");
  const isGolferPath =
    applicationPath === "/r" || applicationPath.startsWith("/r/");
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

  if (contentSecurityPolicy) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    headers.set("Content-Security-Policy", contentSecurityPolicy);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function contentSecurityPolicyForRequest(
  request: Request,
  applicationPath: string,
): string | null {
  const requestUrl = new URL(request.url);
  if (
    requestUrl.hostname === "localhost" ||
    requestUrl.hostname === "127.0.0.1"
  ) {
    return null;
  }

  // Vinext 0.0.45 reads a nonce from the trusted request CSP and propagates it
  // to its RSC/hydration bootstrap. Hex is a valid nonce-source value and a
  // UUID v4 supplies fresh per-response entropy without retaining key material.
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const isBillingPage = applicationPath === "/app/billing";
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    isBillingPage
      ? "form-action 'self' https://checkout.stripe.com https://billing.stripe.com"
      : "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}'`,
    `script-src-elem 'self' 'nonce-${nonce}'`,
    "script-src-attr 'none'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
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
