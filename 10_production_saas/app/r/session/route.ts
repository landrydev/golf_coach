import { cookies } from "next/headers";
import {
  assertExactObjectKeys,
  assertSameOrigin,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import {
  createShareSession,
  endShareSession,
  SHARE_SESSION_MAX_SECONDS,
} from "@/lib/plans";
import {
  ABUSE_LIMITS,
  clientNetworkSubject,
  enforceAbuseLimit,
} from "@/lib/rate-limit";
import { requestCorrelationId } from "@/lib/request-correlation";
import { browserUnavailableShareExchangeResponse } from "@/lib/share-exchange-browser-contract";

const SHARE_COOKIE = "roadmap_share";

export async function POST(request: Request) {
  const requestId = requestCorrelationId(request);
  let sameOriginAccepted = false;
  try {
    assertSameOrigin(request);
    sameOriginAccepted = true;

    await enforceAbuseLimit(
      ABUSE_LIMITS.shareExchangeNetwork,
      clientNetworkSubject(request),
    );
    const payload = asObject(await readJson<unknown>(request));
    assertExactObjectKeys(payload, ["token"]);

    const cookieStore = await cookies();
    const existingSessionToken = cookieStore.get(SHARE_COOKIE)?.value;
    const shareVerifier = cleanText(payload.token, "token", {
      required: true,
      max: 96,
    });
    await enforceAbuseLimit(
      ABUSE_LIMITS.shareExchangeCapability,
      shareVerifier,
    );
    const session = await createShareSession(
      shareVerifier,
      requestId,
      existingSessionToken,
    );
    if (!session) {
      const browserUnavailable = browserUnavailableShareExchangeResponse(
        request.headers,
        requestId,
      );
      if (browserUnavailable) return browserUnavailable;
      throw new RequestError(404, "plan_unavailable", "This private plan is unavailable.");
    }

    const nowSeconds = Math.floor(Date.now() / 1_000);
    const expirySeconds = Math.max(
      1,
      Math.floor(session.expiresAt.getTime() / 1_000) - nowSeconds,
    );
    const maxAge = Math.min(SHARE_SESSION_MAX_SECONDS, expirySeconds);

    return Response.json(
      { sessionContext: session.sessionContext },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "Set-Cookie": sessionCookie(request, session.rawToken, maxAge),
          Vary: "Accept",
          "X-Request-ID": requestId,
        },
      },
    );
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("X-Request-ID", requestId);
    if (sameOriginAccepted) {
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      response.headers.append("Vary", "Accept");
    }
    return response;
  }
}

export async function DELETE(request: Request) {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    await enforceAbuseLimit(
      ABUSE_LIMITS.shareCloseNetwork,
      clientNetworkSubject(request),
    );
    const payload = asObject(await readJson<unknown>(request));
    assertExactObjectKeys(payload, ["sessionContext"]);
    const sessionContext = validatedSessionContext(payload.sessionContext);
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SHARE_COOKIE)?.value;
    if (sessionToken) {
      // The limiter persists only its keyed digest. Repeated requests against
      // an already-revoked cookie remain bounded without retaining raw bearer
      // material or requiring the session row to still be live.
      await enforceAbuseLimit(
        ABUSE_LIMITS.shareCloseSession,
        sessionToken,
      );
      await endShareSession(
        sessionToken,
        "closed by golfer",
        requestId,
        sessionContext,
      );
    }

    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Request-ID": requestId,
      },
    });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("X-Request-ID", requestId);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }
}

function validatedSessionContext(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new RequestError(
      400,
      "session_context_required",
      "Reload this private plan before closing it.",
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

function sessionCookie(request: Request, value: string, maxAge: number): string {
  return [
    `${SHARE_COOKIE}=${value}`,
    "Path=/r",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    isSecureRequest(request) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
}
