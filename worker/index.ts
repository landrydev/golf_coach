/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  evaluateInstructorRequestAccess,
  normalizeApplicationPath,
  productAccessDeniedResponse,
} from "../lib/product-access";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
  INSTRUCTOR_ACCESS_MODE?: string;
  OWNER_PRIVATE_ACCESS_PEPPER?: string;
  OWNER_PRIVATE_EMAIL_DIGESTS?: string;
  SUBSCRIPTION_ACCESS_STATUSES?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const imageResponse = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(imageResponse, request);
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
      return withSecurityHeaders(
        productAccessDeniedResponse(accessDecision, request),
        request,
      );
    }

    const response = await handler.fetch(request, env, ctx);
    return withSecurityHeaders(response, request);
  },
};

function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const requestUrl = new URL(request.url);
  const applicationPath = normalizeApplicationPath(requestUrl.pathname);
  const isLocal = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
  const isInstructorPath =
    applicationPath === "/app" || applicationPath.startsWith("/app/");
  const isGolferPath =
    applicationPath === "/r" || applicationPath.startsWith("/r/");
  const isBillingPage = applicationPath === "/app/billing";

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Origin-Agent-Cluster", "?1");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  if (!headers.has("X-Request-ID")) {
    headers.set("X-Request-ID", request.headers.get("cf-ray") ?? crypto.randomUUID());
  }
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");

  if (requestUrl.pathname.startsWith("/api/") || isInstructorPath) {
    headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  if (isInstructorPath || isGolferPath) {
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
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        isBillingPage
          ? "form-action 'self' https://checkout.stripe.com https://billing.stripe.com"
          : "form-action 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline'",
        "connect-src 'self'",
        "frame-src 'none'",
        "object-src 'none'",
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

export default worker;
