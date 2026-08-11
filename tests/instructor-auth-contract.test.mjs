import assert from "node:assert/strict";
import test from "node:test";
import {
  instructorAuthConfigurationReady,
  instructorAuthSignInPath,
  instructorAuthSignOutPath,
  isAllowedOidcUrl,
  prepareInstructorAuthRequest,
  readInstructorAuthConfiguration,
  safeInstructorReturnPath,
} from "../lib/instructor-auth-contract.ts";

const VALID_OIDC_ENVIRONMENT = Object.freeze({
  APP_URL: "https://roadmap.example.ca",
  INSTRUCTOR_AUTH_MODE: "oidc_v1",
  OIDC_ISSUER: "https://issuer.roadmap.example.ca",
  OIDC_CLIENT_ID: "roadmap-test-client",
  OIDC_CLIENT_SECRET: "synthetic-client-secret",
  OIDC_TOKEN_ENDPOINT_AUTH_METHOD: "client_secret_basic",
  OIDC_ID_TOKEN_SIGNING_ALG: "RS256",
  AUTH_SESSION_LIFETIME_SECONDS: "3600",
  AUTH_SESSION_PEPPER: "synthetic-session-pepper-at-least-32-characters",
  AUTH_TRANSACTION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
});

const FORGED_IDENTITY_HEADERS = Object.freeze({
  "oai-authenticated-user-email": "forged-oai@example.test",
  "oai-authenticated-user-full-name": "Forged%20OAI",
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  "x-roadmap-auth-account-id": "forged-account",
  "x-roadmap-auth-session-id": "forged-session",
  "x-roadmap-auth-email": "forged-internal@example.test",
  "x-roadmap-auth-display-name": "Forged%20Internal",
  "x-roadmap-auth-display-name-encoding": "percent-encoded-utf-8",
  "x-roadmap-auth-source": "oidc",
});

test("the public boundary captures only the Sites adapter and strips every identity header", async () => {
  const original = new Request("https://roadmap.example.ca/api/profile", {
    headers: {
      ...FORGED_IDENTITY_HEADERS,
      authorization: "Bearer browser-controlled",
      "x-unrelated-header": "preserved",
    },
  });
  const prepared = prepareInstructorAuthRequest(original);

  assert.deepEqual(prepared.sitesIdentity, {
    email: "forged-oai@example.test",
    encodedFullName: "Forged%20OAI",
    fullNameEncoding: "percent-encoded-utf-8",
  });
  for (const header of Object.keys(FORGED_IDENTITY_HEADERS)) {
    assert.equal(prepared.request.headers.get(header), null, header);
  }
  assert.equal(
    prepared.request.headers.get("authorization"),
    "Bearer browser-controlled",
  );
  assert.equal(prepared.request.headers.get("x-unrelated-header"), "preserved");
  assert.equal(
    original.headers.get("x-roadmap-auth-account-id"),
    "forged-account",
    "request preparation must not mutate the caller's Request",
  );

  const anonymous = prepareInstructorAuthRequest(
    new Request("https://roadmap.example.ca/api/profile"),
  );
  assert.equal(anonymous.sitesIdentity, null);
});

test("instructor return paths preserve safe local destinations and reject aliases into auth routes", () => {
  const safe = "/app/billing?from=auth#subscription";
  assert.equal(safeInstructorReturnPath(safe), safe);
  assert.equal(
    instructorAuthSignInPath(safe),
    `/auth/login?return_to=${encodeURIComponent(safe)}`,
  );
  assert.equal(
    instructorAuthSignOutPath(safe),
    `/auth/logout?return_to=${encodeURIComponent(safe)}`,
  );

  for (const unsafe of [
    null,
    "",
    "app",
    "https://attacker.example/app",
    "//attacker.example/app",
    "/\\attacker.example/app",
    "/auth/login",
    "/auth/callback",
    "/auth/logout",
    "/auth/login/",
    "/auth/login/again",
    "/auth/callback/step",
    "/auth/logout/confirm",
    "/signin-with-chatgpt",
    "/signin-with-chatgpt/again",
    "/signout-with-chatgpt",
    "/signout-with-chatgpt/again",
    "/callback",
    "/callback/again",
    "/auth/%6cogin",
    "/%61uth/login",
    "/auth%2flogin",
    "/%2f%2fattacker.example/app",
    "/%252f%252fattacker.example/app",
    "/app\r\nlocation:https://attacker.example",
  ]) {
    assert.equal(safeInstructorReturnPath(unsafe), "/", String(unsafe));
  }

  const maximumPath = `/${"a".repeat(2_047)}`;
  assert.equal(maximumPath.length, 2_048);
  assert.equal(safeInstructorReturnPath(maximumPath), maximumPath);
  assert.equal(safeInstructorReturnPath(`${maximumPath}a`), "/");
  assert.equal(safeInstructorReturnPath("/app//settings///"), "/app/settings");
});

test("OIDC mode requires one exact complete configuration and otherwise fails closed", () => {
  const configuration = readInstructorAuthConfiguration(
    VALID_OIDC_ENVIRONMENT,
  );
  assert.equal(configuration?.mode, "oidc_v1");
  assert.equal(configuration?.applicationOrigin, "https://roadmap.example.ca");
  assert.equal(
    configuration?.callbackUrl,
    "https://roadmap.example.ca/auth/callback",
  );
  assert.equal(configuration?.issuer, "https://issuer.roadmap.example.ca");
  assert.equal(configuration?.sessionLifetimeSeconds, 3600);
  assert.equal(configuration?.transactionEncryptionKey.length, 32);
  assert.equal(instructorAuthConfigurationReady(VALID_OIDC_ENVIRONMENT), true);

  for (const INSTRUCTOR_AUTH_MODE of [
    undefined,
    "",
    "OIDC_V1",
    " oidc_v1",
    "oidc_v1 ",
    "unreviewed",
  ]) {
    const environment = { ...VALID_OIDC_ENVIRONMENT, INSTRUCTOR_AUTH_MODE };
    assert.deepEqual(readInstructorAuthConfiguration(environment), {
      mode: "disabled",
    });
    assert.equal(instructorAuthConfigurationReady(environment), false);
  }

  for (const override of [
    { APP_URL: "https://roadmap.example.ca/path" },
    { APP_URL: "https://roadmap.example.ca:443" },
    { OIDC_ISSUER: VALID_OIDC_ENVIRONMENT.APP_URL },
    { OIDC_ISSUER: "http://issuer.roadmap.example.ca" },
    { OIDC_ISSUER: "https://issuer.roadmap.example.ca:443" },
    { OIDC_ISSUER: "https://issuer.roadmap.example.ca?tenant=wrong" },
    { OIDC_CLIENT_ID: "" },
    { OIDC_CLIENT_SECRET: "" },
    { OIDC_TOKEN_ENDPOINT_AUTH_METHOD: "client_secret_post" },
    { OIDC_ID_TOKEN_SIGNING_ALG: "HS256" },
    { AUTH_SESSION_LIFETIME_SECONDS: "899" },
    { AUTH_SESSION_LIFETIME_SECONDS: "86401" },
    { AUTH_SESSION_PEPPER: "too-short" },
    {
      AUTH_TRANSACTION_ENCRYPTION_KEY: `${VALID_OIDC_ENVIRONMENT.AUTH_TRANSACTION_ENCRYPTION_KEY}=`,
    },
  ]) {
    const environment = { ...VALID_OIDC_ENVIRONMENT, ...override };
    assert.equal(readInstructorAuthConfiguration(environment), null);
    assert.equal(instructorAuthConfigurationReady(environment), false);
  }
});

test("OIDC issuers are exact canonical HTTPS identifiers without an explicit port", () => {
  for (const issuer of [
    "https://issuer.roadmap.example.ca",
    "https://issuer.roadmap.example.ca/tenant/v1",
    "https://issuer.roadmap.example.ca/tenant/v1/",
  ]) {
    assert.equal(isAllowedOidcUrl(issuer), true, issuer);
  }

  for (const issuer of [
    "HTTP://issuer.roadmap.example.ca",
    "HTTPS://issuer.roadmap.example.ca",
    "https://ISSUER.roadmap.example.ca",
    "https://issuer.roadmap.example.ca.",
    "https://issuer.roadmap.example.ca:443",
    "https://user@issuer.roadmap.example.ca",
    "https://issuer.roadmap.example.ca?tenant=v1",
    "https://issuer.roadmap.example.ca#tenant-v1",
    "https://issuer.roadmap.example.ca/tenant/../other",
    `https://issuer.roadmap.example.ca/${"a".repeat(2_100)}`,
  ]) {
    assert.equal(isAllowedOidcUrl(issuer), false, issuer);
  }
});

test("production Sites SIWC mode is confined to the Sites dispatch hostname", (context) => {
  const previousNodeEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  context.after(() => {
    if (previousNodeEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnvironment;
    }
  });

  assert.deepEqual(
    readInstructorAuthConfiguration({
      APP_URL: "https://roadmap-golf-coaching.aar-landry.chatgpt.site",
      INSTRUCTOR_AUTH_MODE: "sites_siwc",
    }),
    {
      applicationOrigin:
        "https://roadmap-golf-coaching.aar-landry.chatgpt.site",
      mode: "sites_siwc",
    },
  );
  for (const APP_URL of [
    "https://roadmap.example.ca",
    "https://roadmap.test",
    "https://roadmap-golf-coaching.aar-landry.chatgpt.site:443",
  ]) {
    assert.equal(
      readInstructorAuthConfiguration({
        APP_URL,
        INSTRUCTOR_AUTH_MODE: "sites_siwc",
      }),
      null,
      APP_URL,
    );
  }
});
