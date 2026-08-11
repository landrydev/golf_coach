import * as oidc from "openid-client";
import {
  INSTRUCTOR_AUTH_CALLBACK_PATH,
  INSTRUCTOR_AUTH_LOGIN_PATH,
  INSTRUCTOR_AUTH_LOGOUT_PATH,
  INSTRUCTOR_SESSION_COOKIE,
  OIDC_TRANSACTION_COOKIE,
  PERCENT_ENCODED_UTF8,
  TRUSTED_AUTH_ACCOUNT_ID_HEADER,
  TRUSTED_AUTH_DISPLAY_NAME_ENCODING_HEADER,
  TRUSTED_AUTH_DISPLAY_NAME_HEADER,
  TRUSTED_AUTH_EMAIL_HEADER,
  TRUSTED_AUTH_SESSION_ID_HEADER,
  TRUSTED_AUTH_SOURCE_HEADER,
  isAllowedOidcUrl,
  readInstructorAuthConfiguration,
  safeInstructorReturnPath,
  type InstructorAuthConfigurationEnvironment,
  type OidcInstructorAuthConfiguration,
  type SitesIdentityHeaders,
} from "./instructor-auth-contract.ts";
import {
  clearAuthCookie,
  consumeOidcLoginTransaction,
  createInstructorSessionForOidcIdentity,
  createOidcLoginTransaction,
  randomOpaqueAuthValue,
  readUniqueAuthCookie,
  revokeInstructorSession,
  serializeAuthCookie,
  validateInstructorSession,
  InstructorAuthStateError,
  type TrustedInstructorIdentity,
} from "./instructor-auth-state.ts";
import { readApplicationWriteControl } from "./application-write-control.ts";
import { assertSameOrigin, RequestError } from "./http.ts";
import {
  ABUSE_LIMITS,
  clientNetworkSubject,
  enforceAbuseLimit,
} from "./rate-limit.ts";

const AUTH_REQUEST_TIMEOUT_SECONDS = 10;
const TRANSACTION_COOKIE_LIFETIME_SECONDS = 10 * 60;
const MAX_DISPLAY_NAME_LENGTH = 200;
const INTERNAL_AUTH_HEADER_PREFIX = "x-roadmap-auth-";
const OAI_AUTH_HEADER_PREFIX = "oai-authenticated-user-";

export type InstructorAuthEnvironment = InstructorAuthConfigurationEnvironment & {
  DB?: D1Database;
  ABUSE_LIMIT_PEPPER?: string;
  APPLICATION_WRITE_MODE?: string;
};

export type AuthenticatedInstructorIdentity = Readonly<{
  accountId: string | null;
  sessionId: string | null;
  email: string;
  displayName: string;
  source: "oidc" | "siwc";
}>;

export type InstructorAuthenticationResult =
  | Readonly<{
      status: "authenticated";
      identity: AuthenticatedInstructorIdentity;
      clearSessionCookie: false;
    }>
  | Readonly<{
      status: "anonymous" | "unavailable";
      identity: null;
      clearSessionCookie: boolean;
    }>;

export async function handleInstructorAuthRoute(input: {
  request: Request;
  environment: InstructorAuthEnvironment;
  requestId: string;
  sitesIdentity: SitesIdentityHeaders | null;
}): Promise<Response | null> {
  const pathname = new URL(input.request.url).pathname;
  if (
    pathname !== INSTRUCTOR_AUTH_LOGIN_PATH &&
    pathname !== INSTRUCTOR_AUTH_CALLBACK_PATH &&
    pathname !== INSTRUCTOR_AUTH_LOGOUT_PATH
  ) {
    return null;
  }

  if (pathname === INSTRUCTOR_AUTH_LOGOUT_PATH) {
    return handleLogout(input.request, input.environment, input.requestId);
  }
  if (input.request.method !== "GET") {
    return authFailure(405, "method_not_allowed", "GET", {
      clearTransaction: true,
    });
  }
  if (
    !readApplicationWriteControl(input.environment.APPLICATION_WRITE_MODE)
      .writesEnabled
  ) {
    return authFailure(503, "authentication_writes_unavailable");
  }

  const configuration = readInstructorAuthConfiguration(input.environment);
  if (!configuration || configuration.mode === "disabled") {
    return authFailure(503, "authentication_unavailable");
  }
  if (configuration.mode === "sites_siwc") {
    const returnTo = uniqueReturnTo(input.request);
    if (returnTo === null) {
      return authFailure(400, "invalid_return_target");
    }
    const target =
      pathname === INSTRUCTOR_AUTH_LOGIN_PATH
        ? `/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`
        : "/";
    return authRedirect(target);
  }
  if (!input.environment.DB) {
    return authFailure(503, "authentication_unavailable");
  }
  const oidcEnvironment = {
    ...input.environment,
    DB: input.environment.DB,
  };

  if (pathname === INSTRUCTOR_AUTH_LOGIN_PATH) {
    return handleOidcLogin(input.request, oidcEnvironment, configuration);
  }
  return handleOidcCallback(
    input.request,
    oidcEnvironment,
    configuration,
    input.requestId,
  );
}

export async function authenticateInstructorRequest(input: {
  request: Request;
  environment: InstructorAuthEnvironment;
  sitesIdentity: SitesIdentityHeaders | null;
}): Promise<InstructorAuthenticationResult> {
  const configuration = readInstructorAuthConfiguration(input.environment);
  if (!configuration) return unavailable();
  if (configuration.mode === "disabled") return unavailable();

  if (configuration.mode === "sites_siwc") {
    const identity = trustedSitesIdentity(input.sitesIdentity);
    return identity
      ? Object.freeze({
          status: "authenticated",
          identity,
          clearSessionCookie: false,
        })
      : anonymous(false);
  }

  if (!input.environment.DB) return unavailable();
  const token = readUniqueAuthCookie(input.request, INSTRUCTOR_SESSION_COOKIE);
  if (!token) return anonymous(hasSessionCookie(input.request));
  try {
    const identity = await validateInstructorSession({
      database: input.environment.DB,
      configuration,
      token,
    });
    if (!identity) return anonymous(true);
    return Object.freeze({
      status: "authenticated",
      identity: oidcIdentity(identity),
      clearSessionCookie: false,
    });
  } catch {
    return unavailable();
  }
}

export function withTrustedInstructorAuthentication(
  request: Request,
  identity: AuthenticatedInstructorIdentity,
): Request {
  const headers = new Headers(request.headers);
  const names: string[] = [];
  for (const [name] of headers) {
    if (
      name.toLowerCase().startsWith(INTERNAL_AUTH_HEADER_PREFIX) ||
      name.toLowerCase().startsWith(OAI_AUTH_HEADER_PREFIX)
    ) {
      names.push(name);
    }
  }
  for (const name of names) headers.delete(name);

  if (identity.accountId) {
    headers.set(TRUSTED_AUTH_ACCOUNT_ID_HEADER, identity.accountId);
  }
  if (identity.sessionId) {
    headers.set(TRUSTED_AUTH_SESSION_ID_HEADER, identity.sessionId);
  }
  headers.set(TRUSTED_AUTH_EMAIL_HEADER, identity.email);
  headers.set(
    TRUSTED_AUTH_DISPLAY_NAME_HEADER,
    encodeURIComponent(identity.displayName),
  );
  headers.set(
    TRUSTED_AUTH_DISPLAY_NAME_ENCODING_HEADER,
    PERCENT_ENCODED_UTF8,
  );
  headers.set(TRUSTED_AUTH_SOURCE_HEADER, identity.source);
  return new Request(request, { headers });
}

export function withInstructorAuthCookies(
  response: Response,
  result: InstructorAuthenticationResult,
): Response {
  if (!result.clearSessionCookie) return response;
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", clearAuthCookie(INSTRUCTOR_SESSION_COOKIE));
  return cloneResponse(response, headers);
}

async function handleOidcLogin(
  request: Request,
  environment: InstructorAuthEnvironment & { DB: D1Database },
  configuration: OidcInstructorAuthConfiguration,
): Promise<Response> {
  const returnTo = uniqueReturnTo(request);
  if (returnTo === null) return authFailure(400, "invalid_return_target");
  try {
    await enforceAuthLimit(request, environment, ABUSE_LIMITS.authLoginNetwork);
    const client = await oidcConfiguration(configuration);
    const state = randomOpaqueAuthValue();
    const nonce = randomOpaqueAuthValue();
    const pkceVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(pkceVerifier);
    await createOidcLoginTransaction({
      database: environment.DB,
      configuration,
      state,
      pkceVerifier,
      nonce,
      returnTo,
    });
    const location = oidc.buildAuthorizationUrl(client, {
      redirect_uri: configuration.callbackUrl,
      response_type: "code",
      scope: "openid email profile",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });
    const response = authRedirect(location.href);
    const headers = new Headers(response.headers);
    headers.append(
      "Set-Cookie",
      serializeAuthCookie(
        OIDC_TRANSACTION_COOKIE,
        state,
        TRANSACTION_COOKIE_LIFETIME_SECONDS,
      ),
    );
    return cloneResponse(response, headers);
  } catch (error) {
    return requestErrorOrFailure(error, 503, "authentication_unavailable");
  }
}

async function handleOidcCallback(
  request: Request,
  environment: InstructorAuthEnvironment & { DB: D1Database },
  configuration: OidcInstructorAuthConfiguration,
  requestId: string,
): Promise<Response> {
  const callback = new URL(request.url);
  const states = callback.searchParams.getAll("state");
  const codes = callback.searchParams.getAll("code");
  const cookieState = readUniqueAuthCookie(request, OIDC_TRANSACTION_COOKIE);
  if (
    states.length !== 1 ||
    codes.length !== 1 ||
    !states[0] ||
    !codes[0] ||
    callback.searchParams.has("error") ||
    cookieState !== states[0]
  ) {
    return authFailure(400, "invalid_authentication_response", undefined, {
      clearTransaction: true,
    });
  }

  let transaction;
  try {
    await enforceAuthLimit(request, environment, ABUSE_LIMITS.authCallbackNetwork);
    transaction = await consumeOidcLoginTransaction({
      database: environment.DB,
      configuration,
      state: states[0],
    });
  } catch (error) {
    return requestErrorOrFailure(error, 503, "authentication_unavailable");
  }
  if (!transaction) {
    return authFailure(400, "invalid_authentication_response", undefined, {
      clearTransaction: true,
    });
  }

  let client: oidc.Configuration;
  try {
    client = await oidcConfiguration(configuration);
  } catch {
    return authFailure(503, "authentication_unavailable", undefined, {
      clearTransaction: true,
    });
  }

  try {
    const tokens = await oidc.authorizationCodeGrant(client, request, {
      pkceCodeVerifier: transaction.pkceVerifier,
      expectedState: states[0],
      expectedNonce: transaction.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (
      !claims ||
      claims.iss !== configuration.issuer ||
      typeof claims.sub !== "string" ||
      typeof claims.email !== "string" ||
      claims.email_verified !== true
    ) {
      return authFailure(400, "invalid_identity_claims", undefined, {
        clearTransaction: true,
      });
    }
    const session = await createInstructorSessionForOidcIdentity({
      database: environment.DB,
      configuration,
      claims: {
        issuer: claims.iss,
        subject: claims.sub,
        email: claims.email,
      },
      requestId,
      replacedSessionToken: readUniqueAuthCookie(
        request,
        INSTRUCTOR_SESSION_COOKIE,
      ),
    });
    if (session.kind !== "created") {
      return authFailure(
        400,
        session.kind === "identity_link_required"
          ? "identity_link_required"
          : "account_unavailable",
        undefined,
        { clearTransaction: true },
      );
    }

    const response = authRedirect(transaction.returnTo);
    const headers = new Headers(response.headers);
    headers.append(
      "Set-Cookie",
      serializeAuthCookie(
        INSTRUCTOR_SESSION_COOKIE,
        session.token,
        configuration.sessionLifetimeSeconds,
      ),
    );
    headers.append("Set-Cookie", clearAuthCookie(OIDC_TRANSACTION_COOKIE));
    return cloneResponse(response, headers);
  } catch (error) {
    const unavailable =
      isOidcProviderUnavailable(error) ||
      (error instanceof InstructorAuthStateError &&
        error.code === "invalid_session_configuration") ||
      !(error instanceof InstructorAuthStateError ||
        error instanceof oidc.ClientError ||
        error instanceof oidc.AuthorizationResponseError ||
        error instanceof oidc.ResponseBodyError);
    const response = requestErrorOrFailure(
      error,
      unavailable ? 503 : 400,
      unavailable
        ? "authentication_unavailable"
        : "invalid_authentication_response",
    );
    const headers = new Headers(response.headers);
    headers.append("Set-Cookie", clearAuthCookie(OIDC_TRANSACTION_COOKIE));
    return cloneResponse(response, headers);
  }
}

async function handleLogout(
  request: Request,
  environment: InstructorAuthEnvironment,
  requestId: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return authFailure(405, "method_not_allowed", "POST");
  }
  try {
    assertSameOrigin(request, environment.APP_URL);
  } catch (error) {
    return requestErrorOrFailure(error, 403, "cross_origin_request");
  }

  const returnTo = uniqueReturnTo(request);
  if (returnTo === null) return authFailure(400, "invalid_return_target");
  const configuration = readInstructorAuthConfiguration(environment);
  if (!configuration || configuration.mode === "disabled") {
    return authFailure(503, "authentication_unavailable", undefined, {
      clearTransaction: true,
    });
  }

  if (configuration.mode === "oidc_v1") {
    if (!environment.DB) {
      return authFailure(503, "authentication_unavailable", undefined, {
        clearTransaction: true,
      });
    }
    const token = readUniqueAuthCookie(request, INSTRUCTOR_SESSION_COOKIE);
    if (token) {
      try {
        await revokeInstructorSession({
          database: environment.DB,
          configuration,
          token,
          requestId,
        });
      } catch {
        return authFailure(503, "authentication_unavailable", undefined, {
          clearTransaction: true,
        });
      }
    }
  }

  const location =
    configuration.mode === "sites_siwc"
      ? `/signout-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`
      : returnTo;
  const response = authRedirect(location);
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", clearAuthCookie(INSTRUCTOR_SESSION_COOKIE));
  headers.append("Set-Cookie", clearAuthCookie(OIDC_TRANSACTION_COOKIE));
  return cloneResponse(response, headers);
}

async function oidcConfiguration(
  configuration: OidcInstructorAuthConfiguration,
): Promise<oidc.Configuration> {
  const client = await oidc.discovery(
    new URL(configuration.issuer),
    configuration.clientId,
    {
      client_secret: configuration.clientSecret,
      redirect_uris: [configuration.callbackUrl],
      response_types: ["code"],
      token_endpoint_auth_method: configuration.tokenEndpointAuthMethod,
      id_token_signed_response_alg: configuration.idTokenSigningAlgorithm,
    },
    oidc.ClientSecretBasic(configuration.clientSecret),
    {
      [oidc.customFetch]: secureOidcFetchFor(configuration),
      timeout: AUTH_REQUEST_TIMEOUT_SECONDS,
      execute: [oidc.enableNonRepudiationChecks],
    },
  );
  validateProviderMetadata(client, configuration);
  return client;
}

function secureOidcFetchFor(
  configuration: OidcInstructorAuthConfiguration,
): oidc.CustomFetch {
  return async (url, options) => {
    if (!isAllowedProviderEndpoint(url, configuration.applicationOrigin)) {
      throw new TypeError("The OIDC endpoint URL is not allowed.");
    }
    // Cloudflare Workers supports `manual`, not the browser-only `error` value.
    // Returning no redirect response to openid-client preserves the same
    // fail-closed boundary without ever following a provider-selected Location.
    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        redirect: "manual",
      } as unknown as RequestInit);
    } catch (error) {
      throw new OidcProviderUnavailableError(error);
    }
    if (response.status >= 300 && response.status < 400) {
      throw new TypeError("OIDC endpoint redirects are not allowed.");
    }
    if (response.status >= 500) {
      await response.body?.cancel();
      throw new OidcProviderUnavailableError(response);
    }
    return response;
  };
}

class OidcProviderUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The OIDC provider is temporarily unavailable.", { cause });
    this.name = "OidcProviderUnavailableError";
  }
}

function isOidcProviderUnavailable(error: unknown): boolean {
  let candidate = error;
  for (let depth = 0; depth < 5 && candidate instanceof Error; depth += 1) {
    if (
      candidate instanceof OidcProviderUnavailableError ||
      (candidate instanceof oidc.ClientError &&
        ["OAUTH_TIMEOUT", "OAUTH_ABORT"].includes(candidate.code ?? ""))
    ) {
      return true;
    }
    candidate = candidate.cause;
  }
  return false;
}

function validateProviderMetadata(
  client: oidc.Configuration,
  configuration: OidcInstructorAuthConfiguration,
): void {
  const metadata = client.serverMetadata();
  if (
    metadata.issuer !== configuration.issuer ||
    !metadata.authorization_endpoint ||
    !metadata.token_endpoint ||
    !metadata.jwks_uri ||
    !isAllowedProviderEndpoint(
      metadata.authorization_endpoint,
      configuration.applicationOrigin,
    ) ||
    !isAllowedProviderEndpoint(
      metadata.token_endpoint,
      configuration.applicationOrigin,
    ) ||
    !isAllowedProviderEndpoint(
      metadata.jwks_uri,
      configuration.applicationOrigin,
    ) ||
    !metadata.response_types_supported?.includes("code") ||
    !metadata.code_challenge_methods_supported?.includes("S256") ||
    !metadata.token_endpoint_auth_methods_supported?.includes(
      configuration.tokenEndpointAuthMethod,
    ) ||
    !metadata.id_token_signing_alg_values_supported?.includes(
      configuration.idTokenSigningAlgorithm,
    )
  ) {
    throw new TypeError("The OIDC provider metadata is incompatible.");
  }
}

function isAllowedProviderEndpoint(value: string, applicationOrigin: string): boolean {
  return (
    isAllowedOidcUrl(value) && new URL(value).origin !== applicationOrigin
  );
}

async function enforceAuthLimit(
  request: Request,
  environment: InstructorAuthEnvironment & { DB: D1Database },
  rule:
    | (typeof ABUSE_LIMITS)["authLoginNetwork"]
    | (typeof ABUSE_LIMITS)["authCallbackNetwork"],
): Promise<void> {
  await enforceAbuseLimit(rule, clientNetworkSubject(request), Date.now(), {
    DB: environment.DB,
    ABUSE_LIMIT_PEPPER: environment.ABUSE_LIMIT_PEPPER,
  });
}

function trustedSitesIdentity(
  value: SitesIdentityHeaders | null,
): AuthenticatedInstructorIdentity | null {
  if (!value?.email) return null;
  const email = normalizeEmail(value.email);
  if (!email) return null;
  let displayName = email;
  if (value.encodedFullName !== null || value.fullNameEncoding !== null) {
    if (
      !value.encodedFullName ||
      value.encodedFullName.length > 1_024 ||
      value.fullNameEncoding !== PERCENT_ENCODED_UTF8
    ) {
      return null;
    }
    try {
      const decoded = decodeURIComponent(value.encodedFullName);
      if (
        decoded !== decoded.trim() ||
        !decoded ||
        decoded.length > MAX_DISPLAY_NAME_LENGTH ||
        /[\u0000-\u001f\u007f]/.test(decoded)
      ) {
        return null;
      }
      displayName = decoded;
    } catch {
      return null;
    }
  }
  return Object.freeze({
    accountId: null,
    sessionId: null,
    email,
    displayName,
    source: "siwc",
  });
}

function oidcIdentity(
  value: TrustedInstructorIdentity,
): AuthenticatedInstructorIdentity {
  return Object.freeze({
    accountId: value.accountId,
    sessionId: value.sessionId,
    email: value.email,
    displayName: value.displayName,
    source: "oidc",
  });
}

function uniqueReturnTo(request: Request): string | null {
  const values = new URL(request.url).searchParams.getAll("return_to");
  if (values.length > 1) return null;
  return safeInstructorReturnPath(values[0]);
}

function normalizeEmail(value: string): string | null {
  if (value !== value.trim()) return null;
  const normalized = value.toLowerCase();
  return normalized.length <= 254 &&
    /^[\x21-\x7e]+$/.test(normalized) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : null;
}

function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${INSTRUCTOR_SESSION_COOKIE}=`));
}

function anonymous(clearSessionCookie: boolean): InstructorAuthenticationResult {
  return Object.freeze({
    status: "anonymous",
    identity: null,
    clearSessionCookie,
  });
}

function unavailable(): InstructorAuthenticationResult {
  return Object.freeze({
    status: "unavailable",
    identity: null,
    clearSessionCookie: false,
  });
}

function authRedirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: authHeaders({ Location: location }),
  });
}

function authFailure(
  status: number,
  code: string,
  allow?: "GET" | "POST",
  cookies: { clearSession?: boolean; clearTransaction?: boolean } = {},
): Response {
  const headers = authHeaders(
    allow ? { Allow: allow } : undefined,
  );
  if (cookies.clearSession) {
    headers.append("Set-Cookie", clearAuthCookie(INSTRUCTOR_SESSION_COOKIE));
  }
  if (cookies.clearTransaction) {
    headers.append("Set-Cookie", clearAuthCookie(OIDC_TRANSACTION_COOKIE));
  }
  return Response.json(
    {
      error: {
        code,
        message: "The authentication request could not be completed.",
      },
    },
    { status, headers },
  );
}

function requestErrorOrFailure(
  error: unknown,
  fallbackStatus: number,
  fallbackCode: string,
): Response {
  if (error instanceof RequestError) {
    const response = authFailure(error.status, error.code);
    const headers = new Headers(response.headers);
    if (error.headers) {
      const additions = new Headers(error.headers);
      additions.forEach((value, name) => headers.set(name, value));
    }
    return cloneResponse(response, headers);
  }
  return authFailure(fallbackStatus, fallbackCode);
}

function authHeaders(additional?: HeadersInit): Headers {
  const headers = new Headers(additional);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return headers;
}

function cloneResponse(response: Response, headers: Headers): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
