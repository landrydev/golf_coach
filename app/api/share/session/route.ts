import { assertSameOrigin, cleanText, errorResponse, readJson, RequestError } from "@/lib/http";
import { resolveShareToken } from "@/lib/plans";
import {
  ABUSE_LIMITS,
  clientNetworkSubject,
  enforceAbuseLimit,
} from "@/lib/rate-limit";

const SHARE_COOKIE = "roadmap_share";
const MAX_SESSION_SECONDS = 12 * 60 * 60;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceAbuseLimit(
      ABUSE_LIMITS.shareExchangeNetwork,
      clientNetworkSubject(request),
    );
    const payload = await readJson<{ token?: unknown }>(request);
    const token = cleanText(payload.token, "token", { required: true, max: 96 });
    await enforceAbuseLimit(ABUSE_LIMITS.shareExchangeCapability, token);
    const resolved = await resolveShareToken(token);
    if (!resolved) {
      throw new RequestError(404, "plan_unavailable", "This private plan is unavailable.");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expirySeconds = resolved.expiresAt
      ? Math.max(1, Math.floor(resolved.expiresAt.getTime() / 1000) - nowSeconds)
      : MAX_SESSION_SECONDS;
    const maxAge = Math.min(MAX_SESSION_SECONDS, expirySeconds);
    const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
    const cookie = [
      `${SHARE_COOKIE}=${token}`,
      "Path=/r",
      `Max-Age=${maxAge}`,
      "HttpOnly",
      "SameSite=Lax",
      secure ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");

    return Response.json(
      { redirectTo: "/r/plan" },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": cookie,
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
    const cookie = [
      `${SHARE_COOKIE}=`,
      "Path=/r",
      "Max-Age=0",
      "HttpOnly",
      "SameSite=Lax",
      secure ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store", "Set-Cookie": cookie },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
