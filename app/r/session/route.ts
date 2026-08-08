import { cookies } from "next/headers";
import { assertSameOrigin, cleanText, errorResponse, readJson, RequestError } from "@/lib/http";
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

const SHARE_COOKIE = "roadmap_share";

export async function POST(request: Request) {
  let sameOriginAccepted = false;
  try {
    assertSameOrigin(request);
    sameOriginAccepted = true;

    const cookieStore = await cookies();
    const existingSessionToken = cookieStore.get(SHARE_COOKIE)?.value;
    if (existingSessionToken) {
      await endShareSession(
        existingSessionToken,
        "replaced by a new share exchange",
        request.headers.get("cf-ray"),
      );
    }

    await enforceAbuseLimit(
      ABUSE_LIMITS.shareExchangeNetwork,
      clientNetworkSubject(request),
    );
    const payload = await readJson<{ token?: unknown }>(request);
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
      request.headers.get("cf-ray"),
    );
    if (!session) {
      throw new RequestError(404, "plan_unavailable", "This private plan is unavailable.");
    }

    const nowSeconds = Math.floor(Date.now() / 1_000);
    const expirySeconds = Math.max(
      1,
      Math.floor(session.expiresAt.getTime() / 1_000) - nowSeconds,
    );
    const maxAge = Math.min(SHARE_SESSION_MAX_SECONDS, expirySeconds);

    return Response.json(
      { redirectTo: "/r/plan" },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "Set-Cookie": sessionCookie(request, session.rawToken, maxAge),
        },
      },
    );
  } catch (error) {
    const response = errorResponse(error);
    if (sameOriginAccepted) {
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      response.headers.set("Set-Cookie", expiredSessionCookie(request));
    }
    return response;
  }
}

export async function DELETE(request: Request) {
  let sameOriginAccepted = false;
  try {
    assertSameOrigin(request);
    sameOriginAccepted = true;
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SHARE_COOKIE)?.value;
    if (sessionToken) {
      await endShareSession(
        sessionToken,
        "closed by golfer",
        request.headers.get("cf-ray"),
      );
    }

    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Set-Cookie": expiredSessionCookie(request),
      },
    });
  } catch (error) {
    const response = errorResponse(error);
    if (sameOriginAccepted) {
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      response.headers.set("Set-Cookie", expiredSessionCookie(request));
    }
    return response;
  }
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

function expiredSessionCookie(request: Request): string {
  return [
    `${SHARE_COOKIE}=`,
    "Path=/r",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
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
