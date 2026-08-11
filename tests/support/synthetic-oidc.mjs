import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";

// Public-host validation runs in the production bundle, where special-use
// `.test`/`.invalid` names correctly fail the hostname policy. Miniflare's
// outbound service intercepts this non-resolving public-looking test name.
export const SYNTHETIC_OIDC_ISSUER = "https://issuer.roadmap.example.ca";
export const SYNTHETIC_OIDC_CLIENT_ID = "roadmap-synthetic-client";
export const SYNTHETIC_OIDC_CLIENT_SECRET =
  "synthetic-oidc-client-secret-for-tests-only";

const SIGNING_KEY_ID = "synthetic-rs256-key-v1";

/**
 * A network-free OIDC authorization server used only by Worker integration
 * tests. Browser authorization is advanced explicitly with `authorize()`;
 * discovery, JWKS, and token exchange travel through Miniflare's outbound
 * service so the application exercises its real fetch boundary.
 */
export function createSyntheticOidcProvider(options = {}) {
  const issuer = options.issuer ?? SYNTHETIC_OIDC_ISSUER;
  const clientId = options.clientId ?? SYNTHETIC_OIDC_CLIENT_ID;
  const clientSecret =
    options.clientSecret ?? SYNTHETIC_OIDC_CLIENT_SECRET;
  const nowSeconds =
    options.nowSeconds ?? (() => Math.floor(Date.now() / 1_000));
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  let tokenSigningKey = privateKey;
  let tokenSigningKeyId = SIGNING_KEY_ID;
  const publicJwk = {
    ...publicKey.export({ format: "jwk" }),
    alg: "RS256",
    kid: SIGNING_KEY_ID,
    use: "sig",
  };
  const authorizations = new Map();
  const requests = [];
  const tokenRequests = [];
  let sequence = 0;
  let discoveryOverrides = {};
  let discoveryRedirectLocation = null;
  let jwksOverride = null;
  let jwksFailureStatus = null;
  let tokenFailureStatus = null;

  const discovery = () => ({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    ...discoveryOverrides,
  });

  return {
    issuer,
    clientId,
    clientSecret,
    requests,
    tokenRequests,
    discovery,
    setDiscoveryOverrides(value) {
      discoveryOverrides = { ...value };
    },
    setDiscoveryRedirect(location) {
      discoveryRedirectLocation = location;
    },
    setJwks(value) {
      jwksOverride = value;
    },
    setJwksFailure(status) {
      jwksFailureStatus = status;
    },
    setTokenFailure(status) {
      tokenFailureStatus = status;
    },
    useUnpublishedSigningKey() {
      tokenSigningKey = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      }).privateKey;
      tokenSigningKeyId = "synthetic-unpublished-rs256-key";
    },
    /**
     * Validates the application's authorization redirect and produces the
     * corresponding callback URL. `claims` may deliberately override any
     * ID-token claim for negative verification tests.
     */
    authorize(authorizationLocation, claims = {}) {
      const authorization = new URL(authorizationLocation);
      assertAuthorizationRequest(authorization, {
        issuer,
        clientId,
      });
      sequence += 1;
      const code = `synthetic-authorization-code-${sequence}`;
      authorizations.set(code, {
        claims,
        clientId,
        codeChallenge: authorization.searchParams.get("code_challenge"),
        nonce: authorization.searchParams.get("nonce"),
        redirectUri: authorization.searchParams.get("redirect_uri"),
        used: false,
      });
      const callback = new URL(authorization.searchParams.get("redirect_uri"));
      callback.searchParams.set("code", code);
      callback.searchParams.set("state", authorization.searchParams.get("state"));
      return callback;
    },
    outboundService: async (request) => {
      const url = new URL(request.url);
      requests.push({ method: request.method, url: url.href });
      if (
        request.method === "GET" &&
        url.href === `${issuer}/.well-known/openid-configuration`
      ) {
        if (discoveryRedirectLocation) {
          return new Response(null, {
            status: 302,
            headers: { Location: discoveryRedirectLocation },
          });
        }
        return noStoreJson(discovery());
      }
      if (request.method === "GET" && url.href === `${issuer}/jwks`) {
        if (jwksFailureStatus !== null) {
          return noStoreJson(
            { error: "synthetic_jwks_unavailable" },
            { status: jwksFailureStatus },
          );
        }
        return noStoreJson(jwksOverride ?? { keys: [publicJwk] });
      }
      if (request.method === "POST" && url.href === `${issuer}/token`) {
        return exchangeToken(request);
      }
      return noStoreJson(
        { error: "unexpected_synthetic_oidc_request" },
        { status: 500 },
      );
    },
  };

  async function exchangeToken(request) {
    const rawBody = await request.text();
    const parameters = new URLSearchParams(rawBody);
    tokenRequests.push({
      authorization: request.headers.get("authorization"),
      body: rawBody,
      contentType: request.headers.get("content-type"),
    });
    if (tokenFailureStatus !== null) {
      return noStoreJson(
        { error: "synthetic_token_unavailable" },
        { status: tokenFailureStatus },
      );
    }
    const credentials = parseClientSecretBasic(
      request.headers.get("authorization"),
    );
    if (
      !credentials ||
      credentials.clientId !== clientId ||
      credentials.clientSecret !== clientSecret
    ) {
      return noStoreJson(
        { error: "invalid_client" },
        { status: 401 },
      );
    }
    if (parameters.get("grant_type") !== "authorization_code") {
      return noStoreJson(
        { error: "unsupported_grant_type" },
        { status: 400 },
      );
    }
    const code = parameters.get("code");
    const authorization = code ? authorizations.get(code) : null;
    if (!authorization || authorization.used) {
      return noStoreJson(
        { error: "invalid_grant" },
        { status: 400 },
      );
    }
    if (
      parameters.get("client_id") &&
      parameters.get("client_id") !== clientId
    ) {
      return noStoreJson(
        { error: "invalid_grant" },
        { status: 400 },
      );
    }
    if (parameters.get("redirect_uri") !== authorization.redirectUri) {
      return noStoreJson(
        { error: "invalid_grant" },
        { status: 400 },
      );
    }
    const verifier = parameters.get("code_verifier") ?? "";
    if (pkceChallenge(verifier) !== authorization.codeChallenge) {
      return noStoreJson(
        { error: "invalid_grant" },
        { status: 400 },
      );
    }
    authorization.used = true;
    const issuedAt = nowSeconds();
    const claims = {
      iss: issuer,
      sub: "synthetic-instructor-subject",
      aud: clientId,
      iat: issuedAt,
      exp: issuedAt + 300,
      nonce: authorization.nonce,
      email: "oidc.coach@example.test",
      email_verified: true,
      name: "OIDC Test Coach",
      ...authorization.claims,
    };
    return noStoreJson({
      access_token: `synthetic-access-token-${sequence}`,
      token_type: "Bearer",
      expires_in: 300,
      id_token: signedJwt(claims, tokenSigningKey, tokenSigningKeyId),
    });
  }
}

function assertAuthorizationRequest(url, expected) {
  if (url.origin + url.pathname !== `${expected.issuer}/authorize`) {
    throw new Error("Application used an unexpected OIDC authorization endpoint.");
  }
  const required = {
    client_id: expected.clientId,
    code_challenge_method: "S256",
    response_type: "code",
  };
  for (const [key, value] of Object.entries(required)) {
    if (url.searchParams.get(key) !== value) {
      throw new Error(`Application emitted an invalid OIDC ${key}.`);
    }
  }
  const scopes = new Set((url.searchParams.get("scope") ?? "").split(" "));
  if (
    scopes.size !== 3 ||
    !scopes.has("openid") ||
    !scopes.has("email") ||
    !scopes.has("profile")
  ) {
    throw new Error("Application emitted an invalid OIDC scope.");
  }
  for (const key of ["code_challenge", "nonce", "redirect_uri", "state"]) {
    if (!url.searchParams.get(key)) {
      throw new Error(`Application omitted required OIDC ${key}.`);
    }
  }
  if (url.searchParams.get("state") === url.searchParams.get("nonce")) {
    throw new Error("OIDC state and nonce must be independently generated.");
  }
}

function signedJwt(claims, privateKey, keyId) {
  const header = base64UrlJson({
    alg: "RS256",
    kid: keyId,
    typ: "JWT",
  });
  const payload = base64UrlJson(claims);
  const signingInput = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey)
    .toString("base64url");
  return `${signingInput}.${signature}`;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function pkceChallenge(verifier) {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function parseClientSecretBasic(value) {
  if (typeof value !== "string" || !value.startsWith("Basic ")) return null;
  const encoded = value.slice("Basic ".length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    return null;
  }
  const decodedBytes = Buffer.from(encoded, "base64");
  if (decodedBytes.toString("base64") !== encoded) return null;
  const pair = decodedBytes.toString("utf8");
  if (!Buffer.from(pair, "utf8").equals(decodedBytes)) return null;
  const separator = pair.indexOf(":");
  if (separator < 1 || separator !== pair.lastIndexOf(":")) return null;
  const parsedClientId = decodeFormComponent(pair.slice(0, separator));
  const parsedClientSecret = decodeFormComponent(pair.slice(separator + 1));
  return parsedClientId === null || parsedClientSecret === null
    ? null
    : { clientId: parsedClientId, clientSecret: parsedClientSecret };
}

function decodeFormComponent(value) {
  if (/%(?![0-9a-f]{2})/i.test(value)) return null;
  try {
    return decodeURIComponent(value.replaceAll("+", " "));
  } catch {
    return null;
  }
}

function noStoreJson(value, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(value, { ...init, headers });
}
