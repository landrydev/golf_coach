import { isPublicHostname } from "./external-url-policy.ts";

export const instructorAuthModes = [
  "disabled",
  "sites_siwc",
  "oidc_v1",
] as const;

export type InstructorAuthMode = (typeof instructorAuthModes)[number];

export const INSTRUCTOR_AUTH_LOGIN_PATH = "/auth/login";
export const INSTRUCTOR_AUTH_CALLBACK_PATH = "/auth/callback";
export const INSTRUCTOR_AUTH_LOGOUT_PATH = "/auth/logout";

export const INSTRUCTOR_SESSION_COOKIE = "__Host-roadmap_session";
export const OIDC_TRANSACTION_COOKIE = "__Host-roadmap_oidc_tx";

export const TRUSTED_AUTH_ACCOUNT_ID_HEADER = "x-roadmap-auth-account-id";
export const TRUSTED_AUTH_SESSION_ID_HEADER = "x-roadmap-auth-session-id";
export const TRUSTED_AUTH_EMAIL_HEADER = "x-roadmap-auth-email";
export const TRUSTED_AUTH_DISPLAY_NAME_HEADER =
  "x-roadmap-auth-display-name";
export const TRUSTED_AUTH_DISPLAY_NAME_ENCODING_HEADER =
  "x-roadmap-auth-display-name-encoding";
export const TRUSTED_AUTH_SOURCE_HEADER = "x-roadmap-auth-source";
export const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";

const OAI_AUTH_HEADER_PREFIX = "oai-authenticated-user-";
const TRUSTED_AUTH_HEADER_PREFIX = "x-roadmap-auth-";
const OAI_EMAIL_HEADER = "oai-authenticated-user-email";
const OAI_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const OAI_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const RESERVED_AUTH_PATHS = new Set([
  INSTRUCTOR_AUTH_LOGIN_PATH,
  INSTRUCTOR_AUTH_CALLBACK_PATH,
  INSTRUCTOR_AUTH_LOGOUT_PATH,
  "/signin-with-chatgpt",
  "/signout-with-chatgpt",
  "/callback",
]);

export type InstructorAuthConfigurationEnvironment = {
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
};

export type OidcInstructorAuthConfiguration = Readonly<{
  mode: "oidc_v1";
  applicationOrigin: string;
  callbackUrl: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  tokenEndpointAuthMethod: "client_secret_basic";
  idTokenSigningAlgorithm: "RS256";
  sessionLifetimeSeconds: number;
  sessionPepper: string;
  transactionEncryptionKey: Uint8Array;
}>;

export type SitesSiwcConfiguration = Readonly<{
  mode: "sites_siwc";
  applicationOrigin: string;
}>;

export type InstructorAuthConfiguration =
  | Readonly<{ mode: "disabled" }>
  | SitesSiwcConfiguration
  | OidcInstructorAuthConfiguration;

export type SitesIdentityHeaders = Readonly<{
  email: string | null;
  encodedFullName: string | null;
  fullNameEncoding: string | null;
}>;

export type PreparedInstructorAuthRequest = Readonly<{
  request: Request;
  sitesIdentity: SitesIdentityHeaders | null;
}>;

/**
 * Capture the platform-owned SIWC claims for the one explicit staging mode,
 * then remove every public identity header before application routing. A
 * caller can never directly select one of the private x-roadmap-auth-* values.
 */
export function prepareInstructorAuthRequest(
  request: Request,
): PreparedInstructorAuthRequest {
  const sitesIdentity: SitesIdentityHeaders = {
    email: request.headers.get(OAI_EMAIL_HEADER),
    encodedFullName: request.headers.get(OAI_FULL_NAME_HEADER),
    fullNameEncoding: request.headers.get(OAI_FULL_NAME_ENCODING_HEADER),
  };
  const headers = new Headers(request.headers);
  const untrustedNames: string[] = [];
  for (const [name] of headers) {
    const normalized = name.toLowerCase();
    if (
      normalized.startsWith(OAI_AUTH_HEADER_PREFIX) ||
      normalized.startsWith(TRUSTED_AUTH_HEADER_PREFIX)
    ) {
      untrustedNames.push(name);
    }
  }
  for (const name of untrustedNames) headers.delete(name);

  return {
    request: new Request(request, { headers }),
    sitesIdentity:
      sitesIdentity.email ||
      sitesIdentity.encodedFullName ||
      sitesIdentity.fullNameEncoding
        ? sitesIdentity
        : null,
  };
}

export function instructorAuthSignInPath(returnTo: string): string {
  return `${INSTRUCTOR_AUTH_LOGIN_PATH}?return_to=${encodeURIComponent(
    safeInstructorReturnPath(returnTo),
  )}`;
}

export function instructorAuthSignOutPath(returnTo = "/"): string {
  return `${INSTRUCTOR_AUTH_LOGOUT_PATH}?return_to=${encodeURIComponent(
    safeInstructorReturnPath(returnTo),
  )}`;
}

export function safeInstructorReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    value.length > 2_048 ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/";
  }

  let url: URL;
  try {
    url = new URL(value, "https://return-path.invalid");
  } catch {
    return "/";
  }
  if (
    url.origin !== "https://return-path.invalid" ||
    url.pathname.includes("%") ||
    url.pathname.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(url.pathname)
  ) {
    return "/";
  }
  const effectivePath = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  if (
    [...RESERVED_AUTH_PATHS].some(
      (reserved) =>
        effectivePath === reserved || effectivePath.startsWith(`${reserved}/`),
    )
  ) {
    return "/";
  }

  return `${effectivePath}${url.search}${url.hash}`;
}

export function readInstructorAuthConfiguration(
  environment: InstructorAuthConfigurationEnvironment,
): InstructorAuthConfiguration | null {
  const mode = exactEnvironmentValue(environment.INSTRUCTOR_AUTH_MODE);
  if (!mode || !instructorAuthModes.includes(mode as InstructorAuthMode)) {
    return { mode: "disabled" };
  }
  if (mode === "disabled") return { mode };

  const applicationOrigin = productionApplicationOrigin(environment.APP_URL);
  if (!applicationOrigin) return null;

  if (mode === "sites_siwc") {
    const hostname = new URL(applicationOrigin).hostname.toLowerCase();
    // SIWC headers are a Sites staging adapter, never a generic production
    // authentication protocol. Custom domains must use OIDC v1.
    if (
      !hostname.endsWith(".chatgpt.site") &&
      !(
        process.env.NODE_ENV !== "production" && isLocalTestHostname(hostname)
      )
    ) {
      return null;
    }
    return { mode, applicationOrigin };
  }

  const issuer = exactEnvironmentValue(environment.OIDC_ISSUER);
  const clientId = boundedEnvironmentValue(environment.OIDC_CLIENT_ID, 255);
  const clientSecret = boundedSecret(environment.OIDC_CLIENT_SECRET, 4_096);
  const sessionPepper = boundedSecret(
    environment.AUTH_SESSION_PEPPER,
    4_096,
    32,
  );
  const transactionEncryptionKey = decodeBase64Url32(
    environment.AUTH_TRANSACTION_ENCRYPTION_KEY,
  );
  const sessionLifetimeSeconds = parseSessionLifetime(
    environment.AUTH_SESSION_LIFETIME_SECONDS,
  );
  if (
    !issuer ||
    !isAllowedOidcUrl(issuer) ||
    new URL(issuer).origin === applicationOrigin ||
    !clientId ||
    !clientSecret ||
    !sessionPepper ||
    !transactionEncryptionKey ||
    !sessionLifetimeSeconds ||
    exactEnvironmentValue(environment.OIDC_TOKEN_ENDPOINT_AUTH_METHOD) !==
      "client_secret_basic" ||
    exactEnvironmentValue(environment.OIDC_ID_TOKEN_SIGNING_ALG) !== "RS256"
  ) {
    return null;
  }

  return {
    mode: "oidc_v1",
    applicationOrigin,
    callbackUrl: `${applicationOrigin}${INSTRUCTOR_AUTH_CALLBACK_PATH}`,
    issuer,
    clientId,
    clientSecret,
    tokenEndpointAuthMethod: "client_secret_basic",
    idTokenSigningAlgorithm: "RS256",
    sessionLifetimeSeconds,
    sessionPepper,
    transactionEncryptionKey,
  };
}

export function instructorAuthConfigurationReady(
  environment: InstructorAuthConfigurationEnvironment,
): boolean {
  const configuration = readInstructorAuthConfiguration(environment);
  return configuration !== null && configuration.mode !== "disabled";
}

export function isAllowedOidcUrl(value: string): boolean {
  if (!value || value.length > 2_048 || /[\u0000-\u001f\u007f]/.test(value)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    const testEnvironment = process.env.NODE_ENV !== "production";
    return (
      parsed.protocol === "https:" &&
      !hasExplicitPort(value) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.hostname.endsWith(".") &&
      (isPublicHostname(parsed.hostname) ||
        (testEnvironment && isLocalTestHostname(parsed.hostname))) &&
      (value === parsed.origin || value === parsed.href)
    );
  } catch {
    return false;
  }
}

function productionApplicationOrigin(value: string | undefined): string | null {
  const exact = exactEnvironmentValue(value);
  if (!exact) return null;
  try {
    const parsed = new URL(exact);
    const testEnvironment = process.env.NODE_ENV !== "production";
    if (
      parsed.protocol !== "https:" ||
      hasExplicitPort(exact) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.hostname.endsWith(".") ||
      (!isPublicHostname(parsed.hostname) &&
        !(testEnvironment && isLocalTestHostname(parsed.hostname))) ||
      (exact !== parsed.origin && exact !== `${parsed.origin}/`)
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function hasExplicitPort(value: string): boolean {
  return /^https:\/\/[^/?#]*:\d+(?:[/?#]|$)/i.test(value);
}

function isLocalTestHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".example") ||
    normalized.endsWith(".invalid")
  );
}

function exactEnvironmentValue(value: string | undefined): string | null {
  if (!value || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }
  return value;
}

function boundedEnvironmentValue(
  value: string | undefined,
  maximumLength: number,
): string | null {
  const exact = exactEnvironmentValue(value);
  return exact && exact.length <= maximumLength ? exact : null;
}

function boundedSecret(
  value: string | undefined,
  maximumLength: number,
  minimumLength = 1,
): string | null {
  if (
    !value ||
    value.length < minimumLength ||
    value.length > maximumLength ||
    /[\u0000\r\n]/.test(value)
  ) {
    return null;
  }
  return value;
}

function parseSessionLifetime(value: string | undefined): number | null {
  const exact = exactEnvironmentValue(value);
  if (!exact || !/^[1-9]\d*$/.test(exact)) return null;
  const parsed = Number(exact);
  return Number.isSafeInteger(parsed) && parsed >= 900 && parsed <= 86_400
    ? parsed
    : null;
}

function decodeBase64Url32(value: string | undefined): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  try {
    const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}=`;
    const binary = atob(padded);
    if (binary.length !== 32) return null;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}
