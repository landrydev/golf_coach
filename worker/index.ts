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
import { failureResponseForRequest } from "../lib/failure-response";
import { withTrustedRequestCorrelation } from "../lib/request-correlation";
import {
  readApplicationWriteControl,
  requestMayReachApplicationWrites,
  SCHEDULED_WRITES_UNAVAILABLE_LOG,
} from "../lib/application-write-control";
import { prepareInstructorAuthRequest } from "../lib/instructor-auth-contract";
import {
  authenticateInstructorRequest,
  handleInstructorAuthRoute,
  withInstructorAuthCookies,
  withTrustedInstructorAuthentication,
  type InstructorAuthenticationResult,
} from "../lib/instructor-auth-protocol";
import { cleanupInstructorAuthState } from "../lib/instructor-auth-state";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
  APP_URL?: string;
  INSTRUCTOR_AUTH_MODE?: string;
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_TOKEN_ENDPOINT_AUTH_METHOD?: string;
  OIDC_ID_TOKEN_SIGNING_ALG?: string;
  AUTH_SESSION_LIFETIME_SECONDS?: string;
  OIDC_CLIENT_SECRET?: string;
  AUTH_SESSION_PEPPER?: string;
  AUTH_TRANSACTION_ENCRYPTION_KEY?: string;
  ABUSE_LIMIT_PEPPER?: string;
  INSTRUCTOR_ACCESS_MODE?: string;
  OWNER_PRIVATE_ACCESS_PEPPER?: string;
  OWNER_PRIVATE_EMAIL_DIGESTS?: string;
  DATA_REQUEST_OPERATOR_ACCESS_PEPPER?: string;
  DATA_REQUEST_OPERATOR_EMAIL_DIGESTS?: string;
  CONSENT_POLICY_REGISTRY_JSON?: string;
  MEDIA_UPLOAD_POLICY_JSON?: string;
  SUBSCRIPTION_ACCESS_STATUSES?: string;
  STRIPE_CHECKOUT_PRICE_ID?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS?: string;
  BILLING_COMMERCIAL_POLICY_JSON?: string;
  BILLING_CHECKOUT_ENABLED?: string;
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
    const preparedAuthentication = prepareInstructorAuthRequest(request);
    request = preparedAuthentication.request;
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    const url = new URL(request.url);
    const applicationPath = normalizeApplicationPath(url.pathname);
    const contentSecurityPolicy = contentSecurityPolicyForRequest(
      request,
      applicationPath,
    );
    let authentication: InstructorAuthenticationResult | null = null;

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
          canonicalRequestResponse(request, applicationPath, canonicalDecision),
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

      const authenticationRouteResponse = await handleInstructorAuthRoute({
        request,
        environment: env,
        requestId,
        sitesIdentity: preparedAuthentication.sitesIdentity,
      });
      if (authenticationRouteResponse) {
        const response = withSecurityHeaders(
          authenticationRouteResponse,
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

      authentication = await authenticateInstructorRequest({
        request,
        environment: env,
        sitesIdentity: preparedAuthentication.sitesIdentity,
      });

      let accessDecision = await evaluateInstructorRequestAccess({
        pathname: url.pathname,
        authenticatedEmail:
          authentication.status === "authenticated"
            ? authentication.identity.email
            : null,
        authenticatedAccountId:
          authentication.status === "authenticated"
            ? authentication.identity.accountId
            : null,
        environment: env,
      });
      if (
        authentication.status === "unavailable" &&
        accessDecision === "authentication_required"
      ) {
        accessDecision = "unavailable";
      }
      if (
        accessDecision !== "not_applicable" &&
        accessDecision !== "granted"
      ) {
        const response = withSecurityHeaders(
          withInstructorAuthCookies(
            productAccessDeniedResponse(accessDecision, request),
            authentication,
          ),
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
          withInstructorAuthCookies(
            applicationWritesUnavailableResponse(request, applicationPath),
            authentication,
          ),
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

      const authenticatedRequest =
        authentication.status === "authenticated"
          ? withTrustedInstructorAuthentication(
              request,
              authentication.identity,
            )
          : request;
      const trustedRequest = withTrustedRequestCorrelation(
        authenticatedRequest,
        requestId,
        contentSecurityPolicy ?? undefined,
      );
      const response = withSecurityHeaders(
        withInstructorAuthCookies(
          await handler.fetch(trustedRequest, env, ctx),
          authentication,
        ),
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
      const failure = failureResponseForRequest(request, applicationPath, {
        status: 500,
        code: "internal_error",
        heading: "This page could not be loaded",
        message: "The request could not be completed.",
        links: [{ href: "/support", label: "Get support guidance" }],
      });
      const response = withSecurityHeaders(
        authentication
          ? withInstructorAuthCookies(failure, authentication)
          : failure,
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
      const authCleanup = await cleanupInstructorAuthState({
        database: env.DB,
        now: controller.scheduledTime,
      });
      const result = await runBillingReconciliationSweep({
        now: new Date(controller.scheduledTime),
      });
      await completeBillingSchedulerAttempt({
        database: env.DB,
        attempt,
        result,
      });
      console.log("Scheduled billing reconciliation sweep completed", {
        ...result,
        authCleanup,
      });
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

function applicationWritesUnavailableResponse(
  request: Request,
  applicationPath: string,
): Response {
  const message = "Changes are temporarily unavailable. Try again later.";
  return failureResponseForRequest(request, applicationPath, {
    status: 503,
    code: "application_writes_unavailable",
    heading: "Changes temporarily unavailable",
    message,
    retryAfter: "60",
    links: [{ href: "/support", label: "Review support options" }],
  });
}

function canonicalRequestResponse(
  request: Request,
  applicationPath: string,
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

  const unavailable = decision.status === 503;
  return failureResponseForRequest(request, applicationPath, {
    status: decision.status,
    code: decision.code,
    heading: unavailable
      ? "Application temporarily unavailable"
      : "Request unavailable",
    message: unavailable
      ? "The application origin is unavailable."
      : "This request did not use the canonical application origin.",
    links: [{ href: "/support", label: "Get support guidance" }],
  });
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
  const isAuthenticationPath = applicationPath.startsWith("/auth/");

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

  if (
    isInstructorPath ||
    isGolferPath ||
    isOperationalHealth ||
    isAuthenticationPath
  ) {
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
    // Local video inspection uses an object URL before any private upload is
    // accepted. Keep media otherwise same-origin and do not broaden scripts,
    // workers, frames, or object embedding.
    "media-src 'self' blob:",
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
