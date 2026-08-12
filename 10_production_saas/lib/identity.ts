import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  PERCENT_ENCODED_UTF8,
  TRUSTED_AUTH_ACCOUNT_ID_HEADER,
  TRUSTED_AUTH_DISPLAY_NAME_ENCODING_HEADER,
  TRUSTED_AUTH_DISPLAY_NAME_HEADER,
  TRUSTED_AUTH_EMAIL_HEADER,
  TRUSTED_AUTH_SESSION_ID_HEADER,
  TRUSTED_AUTH_SOURCE_HEADER,
  instructorAuthSignInPath,
} from "@/lib/instructor-auth-contract";
import {
  INTERNAL_REQUEST_ID_HEADER,
  safeRequestCorrelationId,
} from "@/lib/request-correlation";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RequestIdentity = Readonly<{
  accountId: string | null;
  sessionId: string | null;
  displayName: string;
  email: string;
  fullName: string | null;
  source: "oidc" | "siwc" | "development";
  requestId: string;
}>;

export async function getRequestIdentity(): Promise<RequestIdentity | null> {
  const requestHeaders = await headers();
  const requestId = safeRequestCorrelationId(
    requestHeaders.get(INTERNAL_REQUEST_ID_HEADER),
  );
  const source = requestHeaders.get(TRUSTED_AUTH_SOURCE_HEADER);
  const email = normalizedEmail(requestHeaders.get(TRUSTED_AUTH_EMAIL_HEADER));
  const encodedDisplayName = requestHeaders.get(TRUSTED_AUTH_DISPLAY_NAME_HEADER);
  const displayName =
    encodedDisplayName &&
    requestHeaders.get(TRUSTED_AUTH_DISPLAY_NAME_ENCODING_HEADER) ===
      PERCENT_ENCODED_UTF8
      ? decodedDisplayName(encodedDisplayName)
      : null;

  if ((source === "oidc" || source === "siwc") && email && displayName) {
    const accountId = requestHeaders.get(TRUSTED_AUTH_ACCOUNT_ID_HEADER);
    const sessionId = requestHeaders.get(TRUSTED_AUTH_SESSION_ID_HEADER);
    if (
      (source === "oidc" &&
        (!accountId || !UUID_V4.test(accountId) || !sessionId || !UUID_V4.test(sessionId))) ||
      (source === "siwc" && (accountId !== null || sessionId !== null))
    ) {
      return null;
    }
    return Object.freeze({
      accountId: accountId?.toLowerCase() ?? null,
      sessionId: sessionId?.toLowerCase() ?? null,
      displayName,
      email,
      fullName: displayName,
      source,
      requestId,
    });
  }

  if (process.env.NODE_ENV !== "production") {
    const developmentEmail =
      normalizedEmail(process.env.DEV_AUTH_EMAIL ?? null) ?? "owner@roadmap.local";
    const fullName = process.env.DEV_AUTH_NAME?.trim() || "Roadmap Owner";
    return Object.freeze({
      accountId: null,
      sessionId: null,
      displayName: fullName,
      email: developmentEmail,
      fullName,
      source: "development",
      requestId,
    });
  }

  return null;
}

export async function requirePageIdentity(
  returnTo: string,
): Promise<RequestIdentity> {
  const identity = await getRequestIdentity();
  if (identity) return identity;
  redirect(instructorAuthSignInPath(returnTo));
}

export async function requireApiIdentity(): Promise<
  | { identity: RequestIdentity; response: null }
  | { identity: null; response: Response }
> {
  const identity = await getRequestIdentity();
  if (identity) return { identity, response: null };

  return {
    identity: null,
    response: Response.json(
      { error: { code: "authentication_required", message: "Sign in required." } },
      { status: 401 },
    ),
  };
}

function normalizedEmail(value: string | null): string | null {
  if (!value || value !== value.trim()) return null;
  const normalized = value.toLowerCase();
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : null;
}

function decodedDisplayName(value: string): string | null {
  if (value.length > 1_024) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded &&
      decoded === decoded.trim() &&
      decoded.length <= 200 &&
      !/[\u0000-\u001f\u007f]/.test(decoded)
      ? decoded
      : null;
  } catch {
    return null;
  }
}
