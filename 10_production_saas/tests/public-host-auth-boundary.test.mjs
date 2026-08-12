import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { startD1Worker } from "./support/d1-worker.mjs";
import {
  createSyntheticOidcProvider,
  SYNTHETIC_OIDC_CLIENT_ID,
  SYNTHETIC_OIDC_CLIENT_SECRET,
  SYNTHETIC_OIDC_ISSUER,
} from "./support/synthetic-oidc.mjs";

const PUBLIC_ORIGIN = "https://roadmap.example.ca";
const SESSION_PEPPER =
  "synthetic-public-host-session-pepper-tests-only-2026";
const TRANSACTION_KEY = Buffer.alloc(32, 17).toString("base64url");
const DEFAULT_OIDC_EMAIL = "oidc.coach@example.test";
const FORGED_IDENTITY_HEADERS = {
  "oai-authenticated-user-email": "forged-oai@example.test",
  "oai-authenticated-user-full-name": "Forged%20OAI",
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  "x-roadmap-auth-account-id": "forged-account",
  "x-roadmap-auth-session-id": "forged-session",
  "x-roadmap-auth-email": "forged-internal@example.test",
  "x-roadmap-auth-display-name": "Forged%20Internal",
  "x-roadmap-auth-display-name-encoding": "percent-encoded-utf-8",
  "x-roadmap-auth-source": "oidc",
};

test(
  "OIDC transaction and session lifecycle is one-time, revocable, expiring, and identity-version fenced",
  { timeout: 90_000 },
  async (context) => {
    const harness = await startOidcHarness(context);
    const login = await beginLogin(harness, "/app?welcome=1");
    const callback = await completeLogin(harness, login);

    assert.equal(callback.response.status, 303);
    assert.equal(callback.response.headers.get("location"), "/app?welcome=1");
    assertAuthSecurityHeaders(callback.response);
    assertSecureHostCookie(callback.sessionSetCookie, "__Host-roadmap_session");
    assertExpiredHostCookie(
      setCookieFor(callback.response, "__Host-roadmap_oidc_tx"),
      "__Host-roadmap_oidc_tx",
    );

    const state = new URL(login.authorizationLocation).searchParams.get("state");
    const nonce = new URL(login.authorizationLocation).searchParams.get("nonce");
    const authorizationCode = login.callbackUrl.searchParams.get("code");
    const persisted = await harness.worker.inspect([
      {
        sql: `select state_hash, sealed_payload, payload_iv, consumed_at
          from oidc_login_transactions`,
      },
      {
        sql: `select id, account_id, identity_version, token_hash, revoked_at,
          expires_at from instructor_sessions order by created_at`,
      },
    ]);
    assert.equal(persisted[0].results.length, 1);
    assert.match(persisted[0].results[0].state_hash, /^[0-9a-f]{64}$/);
    assert.ok(persisted[0].results[0].consumed_at);
    assert.doesNotMatch(
      JSON.stringify(persisted[0].results),
      new RegExp(
        `${escapeRegExp(state)}|${escapeRegExp(nonce)}|${escapeRegExp(authorizationCode)}`,
      ),
    );
    assert.equal(persisted[1].results.length, 1);
    assert.match(persisted[1].results[0].token_hash, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(
      persisted[1].results[0].token_hash,
      new RegExp(escapeRegExp(callback.sessionCookie.split("=")[1])),
    );

    const authenticated = await harness.worker.dispatch("/api/profile", {
      headers: {
        cookie: callback.sessionCookie,
        ...FORGED_IDENTITY_HEADERS,
      },
    });
    assert.equal(authenticated.status, 200);

    const tokenRequestsBeforeReplay = harness.provider.tokenRequests.length;
    const replay = await harness.worker.dispatch(
      `${login.callbackUrl.pathname}${login.callbackUrl.search}`,
      {
        headers: navigationHeaders({ cookie: login.transactionCookie }),
      },
    );
    assert.equal(replay.status, 400);
    assertAuthSecurityHeaders(replay);
    assert.equal(
      harness.provider.tokenRequests.length,
      tokenRequestsBeforeReplay,
      "a consumed transaction must fail before another provider exchange",
    );
    const [sessionCountAfterReplay] = await harness.worker.inspect([
      { sql: "select count(*) as count from instructor_sessions" },
    ]);
    assert.equal(sessionCountAfterReplay.results[0].count, 1);

    const now = Date.now();
    await harness.worker.inspect([
      {
        sql: `update instructor_sessions set authenticated_at = ?, created_at = ?,
          expires_at = ? where id = ?`,
        params: [
          now - 120_000,
          now - 120_000,
          now - 1,
          persisted[1].results[0].id,
        ],
      },
    ]);
    const expired = await harness.worker.dispatch("/api/profile", {
      headers: { cookie: callback.sessionCookie },
    });
    assert.equal(expired.status, 401);
    assertExpiredHostCookie(
      setCookieFor(expired, "__Host-roadmap_session"),
      "__Host-roadmap_session",
    );

    const versionLogin = await beginLogin(harness, "/app");
    const versionCallback = await completeLogin(harness, versionLogin);
    assert.equal(versionCallback.response.status, 303);
    const [account] = await harness.worker.inspect([
      {
        sql: `select id, identity_version from accounts
          where auth_provider = 'oidc'`,
      },
    ]);
    assert.equal(account.results.length, 1);
    await harness.worker.inspect([
      {
        sql: "update accounts set identity_version = identity_version + 1 where id = ?",
        params: [account.results[0].id],
      },
    ]);
    const staleIdentity = await harness.worker.dispatch("/api/profile", {
      headers: { cookie: versionCallback.sessionCookie },
    });
    assert.equal(staleIdentity.status, 401);
    const [historicalSessions] = await harness.worker.inspect([
      {
        sql: `select count(*) as count from instructor_sessions
          where account_id = ?`,
        params: [account.results[0].id],
      },
    ]);
    assert.equal(historicalSessions.results[0].count, 2);

    const logoutLogin = await beginLogin(harness, "/app");
    const logoutCallback = await completeLogin(harness, logoutLogin);
    assert.equal(logoutCallback.response.status, 303);
    const rotationLogin = await beginLogin(harness, "/app/settings");
    const rotated = await completeLogin(
      harness,
      rotationLogin,
      {},
      { existingSessionCookie: logoutCallback.sessionCookie },
    );
    assert.equal(rotated.response.status, 303);
    const rotatedPrior = await harness.worker.dispatch("/api/profile", {
      headers: { cookie: logoutCallback.sessionCookie },
    });
    assert.equal(rotatedPrior.status, 401);
    const rotatedCurrent = await harness.worker.dispatch("/api/profile", {
      headers: { cookie: rotated.sessionCookie },
    });
    assert.equal(rotatedCurrent.status, 200);
    const logout = await harness.worker.dispatch(
      "/auth/logout?return_to=%2Fsupport",
      {
        method: "POST",
        headers: sameOriginHeaders({ cookie: rotated.sessionCookie }),
      },
    );
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.get("location"), "/support");
    assertExpiredHostCookie(
      setCookieFor(logout, "__Host-roadmap_session"),
      "__Host-roadmap_session",
    );
    assertExpiredHostCookie(
      setCookieFor(logout, "__Host-roadmap_oidc_tx"),
      "__Host-roadmap_oidc_tx",
    );
    const revokedReplay = await harness.worker.dispatch("/api/profile", {
      headers: { cookie: rotated.sessionCookie },
    });
    assert.equal(revokedReplay.status, 401);

    const expiredTransaction = await beginLogin(harness, "/app");
    const beforeExpiredExchange = harness.provider.tokenRequests.length;
    await harness.worker.inspect([
      {
        sql: `update oidc_login_transactions set created_at = ?, expires_at = ?
          where consumed_at is null`,
        params: [now - 120_000, now - 1],
      },
    ]);
    const expiredCallback = await completeLogin(
      harness,
      expiredTransaction,
      {},
      { expectSession: false },
    );
    assert.equal(expiredCallback.response.status, 400);
    assert.equal(harness.provider.tokenRequests.length, beforeExpiredExchange);
  },
);

test(
  "account status gates live sessions and issuer-subject identity never merges by email",
  { timeout: 90_000 },
  async (context) => {
    const harness = await startOidcHarness(context);
    const first = await completeLogin(
      harness,
      await beginLogin(harness, "/app"),
      {
        sub: "stable-subject-one",
        email: "shared.oidc@example.test",
      },
    );
    assert.equal(first.response.status, 303);
    const [created] = await harness.worker.inspect([
      {
        sql: `select id, auth_issuer, auth_subject, normalized_email, status
          from accounts where auth_provider = 'oidc'`,
      },
    ]);
    assert.deepEqual(created.results.map(({ auth_issuer, auth_subject }) => ({
      auth_issuer,
      auth_subject,
    })), [
      {
        auth_issuer: SYNTHETIC_OIDC_ISSUER,
        auth_subject: "stable-subject-one",
      },
    ]);

    for (const status of [
      "pending_verification",
      "suspended",
      "deletion_pending",
      "deleted",
    ]) {
      await harness.worker.inspect([
        {
          sql: "update accounts set status = ? where id = ?",
          params: [status, created.results[0].id],
        },
      ]);
      const denied = await harness.worker.dispatch("/api/profile", {
        headers: { cookie: first.sessionCookie },
      });
      assert.equal(denied.status, 401, status);
    }
    await harness.worker.inspect([
      {
        sql: "update accounts set status = 'active' where id = ?",
        params: [created.results[0].id],
      },
    ]);

    const sameIdentity = await completeLogin(
      harness,
      await beginLogin(harness, "/app/settings"),
      {
        sub: "stable-subject-one",
        email: "changed.profile@example.test",
      },
    );
    assert.equal(sameIdentity.response.status, 303);
    const [afterSameIdentity] = await harness.worker.inspect([
      {
        sql: `select id, auth_subject, normalized_email from accounts
          where auth_provider = 'oidc'`,
      },
    ]);
    assert.equal(afterSameIdentity.results.length, 1);
    assert.equal(afterSameIdentity.results[0].id, created.results[0].id);

    const conflictingIdentity = await completeLogin(
      harness,
      await beginLogin(harness, "/app"),
      {
        sub: "different-subject",
        email: afterSameIdentity.results[0].normalized_email,
      },
      { expectSession: false },
    );
    assert.equal(conflictingIdentity.response.status, 400);
    assert.equal(setCookieFor(conflictingIdentity.response, "__Host-roadmap_session"), null);
    const [afterConflict] = await harness.worker.inspect([
      {
        sql: `select count(*) as count from accounts
          where auth_provider = 'oidc'`,
      },
    ]);
    assert.equal(afterConflict.results[0].count, 1);

    for (const invalidClaims of [
      { iss: "https://attacker.example.ca" },
      { aud: "different-client" },
      { nonce: "forged-nonce" },
      { exp: Math.floor(Date.now() / 1_000) - 60 },
      { email_verified: false },
      { email: " nul@example.test" },
      { email: "nul\u0000@example.test" },
      { email: "del\u007f@example.test" },
      { email: "line\r\nbreak@example.test" },
      { email: "coach例@example.test" },
      { email: `${"a".repeat(245)}@example.test` },
    ]) {
      const invalid = await completeLogin(
        harness,
        await beginLogin(harness, "/app"),
        invalidClaims,
        { expectSession: false },
      );
      assert.equal(invalid.response.status, 400, JSON.stringify(invalidClaims));
      assertAuthSecurityHeaders(invalid.response);
      assert.doesNotMatch(
        await invalid.response.text(),
        /synthetic-access-token|forged-nonce|different-client|attacker\.example/i,
      );
    }
  },
);

test(
  "two concurrent identical callbacks consume one transaction and create one session",
  { timeout: 90_000 },
  async (context) => {
    const harness = await startOidcHarness(context);
    const login = await beginLogin(harness, "/app");
    const callback = harness.provider.authorize(login.authorizationLocation);
    const callbackPath = `${callback.pathname}${callback.search}`;
    const responses = await Promise.all([
      harness.worker.dispatch(callbackPath, {
        headers: navigationHeaders({
          cookie: login.transactionCookie,
          "cf-connecting-ip": "192.0.2.210",
        }),
      }),
      harness.worker.dispatch(callbackPath, {
        headers: navigationHeaders({
          cookie: login.transactionCookie,
          "cf-connecting-ip": "192.0.2.211",
        }),
      }),
    ]);
    assert.deepEqual(
      responses.map(({ status }) => status).sort((left, right) => left - right),
      [303, 400],
    );
    assert.equal(harness.provider.tokenRequests.length, 1);
    assert.deepEqual(await authPersistence(harness.worker), {
      accounts: 1,
      sessions: 1,
      transactions: 1,
    });
    assert.equal(
      responses.filter((response) =>
        setCookieFor(response, "__Host-roadmap_session"),
      ).length,
      1,
    );
  },
);

test(
  "auth modes, forged headers, return targets, logout method, and origin all fail closed",
  { timeout: 90_000 },
  async (context) => {
    const harness = await startOidcHarness(context);
    const forged = await harness.worker.dispatch("/api/profile", {
      headers: FORGED_IDENTITY_HEADERS,
    });
    assert.equal(forged.status, 401);
    const forgedPersistence = await harness.worker.inspect([
      { sql: "select count(*) as count from accounts" },
      { sql: "select count(*) as count from instructor_sessions" },
    ]);
    assert.equal(forgedPersistence[0].results[0].count, 0);
    assert.equal(forgedPersistence[1].results[0].count, 0);

    for (const returnTo of [
      "https://attacker.example/app",
      "//attacker.example/app",
      "/auth/%6cogin",
      "/%61uth/callback",
    ]) {
      const result = await completeLogin(
        harness,
        await beginLogin(harness, returnTo),
      );
      assert.equal(result.response.status, 303);
      assert.equal(result.response.headers.get("location"), "/", returnTo);
    }

    const active = await completeLogin(
      harness,
      await beginLogin(harness, "/app"),
    );
    for (const method of ["GET", "DELETE", "PUT"]) {
      const wrongMethod = await harness.worker.dispatch("/auth/logout", {
        method,
        headers: { cookie: active.sessionCookie },
      });
      assert.equal(wrongMethod.status, 405, method);
      assert.equal(wrongMethod.headers.get("allow"), "POST");
      assertAuthSecurityHeaders(wrongMethod);
    }
    for (const headers of [
      { cookie: active.sessionCookie },
      {
        cookie: active.sessionCookie,
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    ]) {
      const rejected = await harness.worker.dispatch("/auth/logout", {
        method: "POST",
        headers,
      });
      assert.equal(rejected.status, 403);
      assertAuthSecurityHeaders(rejected);
    }
    const stillLive = await harness.worker.dispatch("/api/profile", {
      headers: { cookie: active.sessionCookie },
    });
    assert.equal(stillLive.status, 200);

    for (const mode of [undefined, "OIDC_V1", "unreviewed"]) {
      const disabledWorker = await startD1Worker(
        mode === undefined ? {} : { INSTRUCTOR_AUTH_MODE: mode },
        {
          instructorAuthModeDefault: false,
          origin: PUBLIC_ORIGIN,
        },
      );
      context.after(() => disabledWorker.dispose());
      const login = await disabledWorker.dispatch("/auth/login?return_to=%2Fapp", {
        headers: navigationHeaders(),
      });
      assert.equal(login.status, 503, String(mode));
      assertAuthSecurityHeaders(login);
      const api = await disabledWorker.dispatch("/api/profile", {
        headers: FORGED_IDENTITY_HEADERS,
      });
      assert.ok([401, 503].includes(api.status));
    }
  },
);

test(
  "provider metadata, redirects, and unpublished RS256 keys fail closed",
  { timeout: 90_000 },
  async (context) => {
    const incompatible = await startOidcHarness(context);
    incompatible.provider.setDiscoveryOverrides({
      code_challenge_methods_supported: [],
    });
    const incompatibleResponse = await incompatible.worker.dispatch(
      "/auth/login?return_to=%2Fapp",
      { headers: navigationHeaders() },
    );
    assert.equal(incompatibleResponse.status, 503);
    assertAuthSecurityHeaders(incompatibleResponse);
    assert.equal(
      setCookieFor(incompatibleResponse, "__Host-roadmap_oidc_tx"),
      null,
    );
    const incompatiblePersistence = await authPersistence(
      incompatible.worker,
    );
    assert.deepEqual(incompatiblePersistence, {
      accounts: 0,
      sessions: 0,
      transactions: 0,
    });

    const redirecting = await startOidcHarness(context);
    const redirectTarget =
      "https://redirect-target.example.ca/openid-configuration";
    redirecting.provider.setDiscoveryRedirect(redirectTarget);
    const redirectResponse = await redirecting.worker.dispatch(
      "/auth/login?return_to=%2Fapp",
      { headers: navigationHeaders() },
    );
    assert.equal(redirectResponse.status, 503);
    assertAuthSecurityHeaders(redirectResponse);
    assert.deepEqual(redirecting.provider.requests, [
      {
        method: "GET",
        url: `${SYNTHETIC_OIDC_ISSUER}/.well-known/openid-configuration`,
      },
    ]);
    assert.equal(
      redirecting.provider.requests.some(({ url }) => url === redirectTarget),
      false,
    );
    assert.deepEqual(await authPersistence(redirecting.worker), {
      accounts: 0,
      sessions: 0,
      transactions: 0,
    });

    for (const field of [
      "authorization_endpoint",
      "token_endpoint",
      "jwks_uri",
    ]) {
      const selfReferential = await startOidcHarness(context);
      selfReferential.provider.setDiscoveryOverrides({
        [field]: `${PUBLIC_ORIGIN}/synthetic-oidc-${field}`,
      });
      const selfResponse = await selfReferential.worker.dispatch(
        "/auth/login?return_to=%2Fapp",
        { headers: navigationHeaders() },
      );
      assert.equal(selfResponse.status, 503, field);
      assertAuthSecurityHeaders(selfResponse);
      assert.equal(
        selfReferential.provider.requests.some(({ url }) =>
          url.startsWith(PUBLIC_ORIGIN),
        ),
        false,
        field,
      );
      assert.deepEqual(await authPersistence(selfReferential.worker), {
        accounts: 0,
        sessions: 0,
        transactions: 0,
      });
    }

    for (const endpoint of ["token", "jwks"]) {
      const unavailable = await startOidcHarness(context);
      const pending = await beginLogin(unavailable, "/app");
      if (endpoint === "token") unavailable.provider.setTokenFailure(503);
      else unavailable.provider.setJwksFailure(503);
      const providerFailure = await completeLogin(
        unavailable,
        pending,
        {},
        { expectSession: false },
      );
      assert.equal(providerFailure.response.status, 503, endpoint);
      assertAuthSecurityHeaders(providerFailure.response);
      assert.deepEqual(await authPersistence(unavailable.worker), {
        accounts: 0,
        sessions: 0,
        transactions: 1,
      });
    }

    const unknownKey = await startOidcHarness(context);
    unknownKey.provider.useUnpublishedSigningKey();
    const rejectedKey = await completeLogin(
      unknownKey,
      await beginLogin(unknownKey, "/app"),
      {},
      { expectSession: false },
    );
    assert.equal(rejectedKey.response.status, 400);
    assertAuthSecurityHeaders(rejectedKey.response);
    assert.equal(
      unknownKey.provider.requests.some(
        ({ url }) => url === `${SYNTHETIC_OIDC_ISSUER}/jwks`,
      ),
      true,
    );
    const unknownKeyPersistence = await authPersistence(unknownKey.worker);
    assert.equal(unknownKeyPersistence.accounts, 0);
    assert.equal(unknownKeyPersistence.sessions, 0);
  },
);

test(
  "frozen application writes block login and callback but never block session revocation",
  { timeout: 90_000 },
  async (context) => {
    const harness = await startOidcHarness(context);
    const active = await completeLogin(
      harness,
      await beginLogin(harness, "/app"),
    );
    assert.equal(active.response.status, 303);
    const pending = await beginLogin(harness, "/app/settings");
    const persistenceBeforeFreeze = await authPersistence(harness.worker);
    assert.deepEqual(persistenceBeforeFreeze, {
      accounts: 1,
      sessions: 1,
      transactions: 2,
    });
    const providerRequestsBeforeFreeze = harness.provider.requests.length;
    const tokenRequestsBeforeFreeze = harness.provider.tokenRequests.length;

    await harness.worker.setBindings({ APPLICATION_WRITE_MODE: "frozen" });
    const frozenLogin = await harness.worker.dispatch(
      "/auth/login?return_to=%2Fapp",
      {
        headers: navigationHeaders({
          "cf-connecting-ip": "192.0.2.201",
        }),
      },
    );
    assert.equal(frozenLogin.status, 503);
    assertAuthSecurityHeaders(frozenLogin);
    assert.equal(harness.provider.requests.length, providerRequestsBeforeFreeze);

    const pendingCallback = harness.provider.authorize(
      pending.authorizationLocation,
    );
    const frozenCallback = await harness.worker.dispatch(
      `${pendingCallback.pathname}${pendingCallback.search}`,
      {
        headers: navigationHeaders({
          cookie: pending.transactionCookie,
          "cf-connecting-ip": "192.0.2.202",
        }),
      },
    );
    assert.equal(frozenCallback.status, 503);
    assertAuthSecurityHeaders(frozenCallback);
    assert.equal(
      setCookieFor(frozenCallback, "__Host-roadmap_oidc_tx"),
      null,
    );
    assert.equal(
      harness.provider.tokenRequests.length,
      tokenRequestsBeforeFreeze,
    );
    const [pendingState] = await harness.worker.inspect([
      {
        sql: `select count(*) as count from oidc_login_transactions
          where consumed_at is null`,
      },
    ]);
    assert.equal(pendingState.results[0].count, 1);

    const frozenLogout = await harness.worker.dispatch(
      "/auth/logout?return_to=%2Fsupport",
      {
        method: "POST",
        headers: sameOriginHeaders({ cookie: active.sessionCookie }),
      },
    );
    assert.equal(frozenLogout.status, 303);
    assert.equal(frozenLogout.headers.get("location"), "/support");
    assertAuthSecurityHeaders(frozenLogout);
    const [revoked] = await harness.worker.inspect([
      {
        sql: `select count(*) as count from instructor_sessions
          where revoked_at is not null`,
      },
    ]);
    assert.equal(revoked.results[0].count, 1);

    await harness.worker.setBindings({ APPLICATION_WRITE_MODE: "enabled" });
    const revokedReplay = await harness.worker.dispatch("/api/profile", {
      headers: { cookie: active.sessionCookie },
    });
    assert.equal(revokedReplay.status, 401);
  },
);

test(
  "the auth login network limiter rejects the 21st request before provider work",
  { timeout: 90_000 },
  async (context) => {
    const harness = await startOidcHarness(context);
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const accepted = await harness.worker.dispatch(
        "/auth/login?return_to=%2Fapp",
        { headers: navigationHeaders() },
      );
      assert.equal(accepted.status, 303, `attempt ${attempt}`);
    }
    const providerRequestsBeforeLimit = harness.provider.requests.length;
    const limited = await harness.worker.dispatch(
      "/auth/login?return_to=%2Fapp",
      { headers: navigationHeaders() },
    );
    assert.equal(limited.status, 429);
    assertAuthSecurityHeaders(limited);
    assert.match(limited.headers.get("retry-after") ?? "", /^\d+$/);
    assert.equal(harness.provider.requests.length, providerRequestsBeforeLimit);
    const [rateState, transactionState] = await harness.worker.inspect([
      {
        sql: `select request_count from abuse_rate_limits
          where scope = 'auth_login_network'`,
      },
      { sql: "select count(*) as count from oidc_login_transactions" },
    ]);
    assert.equal(rateState.results[0].request_count, 21);
    assert.equal(transactionState.results[0].count, 20);
  },
);

async function authPersistence(worker) {
  const [accounts, sessions, transactions] = await worker.inspect([
    { sql: "select count(*) as count from accounts" },
    { sql: "select count(*) as count from instructor_sessions" },
    { sql: "select count(*) as count from oidc_login_transactions" },
  ]);
  return {
    accounts: accounts.results[0].count,
    sessions: sessions.results[0].count,
    transactions: transactions.results[0].count,
  };
}

async function startOidcHarness(context, bindingOverrides = {}) {
  const provider = createSyntheticOidcProvider();
  const ownerPepper = "synthetic-oidc-owner-access-pepper-tests-only";
  const ownerDigest = createHmac("sha256", ownerPepper)
    .update(DEFAULT_OIDC_EMAIL)
    .digest("hex");
  const worker = await startD1Worker(
    {
      APP_URL: PUBLIC_ORIGIN,
      INSTRUCTOR_AUTH_MODE: "oidc_v1",
      OIDC_ISSUER: SYNTHETIC_OIDC_ISSUER,
      OIDC_CLIENT_ID: SYNTHETIC_OIDC_CLIENT_ID,
      OIDC_CLIENT_SECRET: SYNTHETIC_OIDC_CLIENT_SECRET,
      OIDC_TOKEN_ENDPOINT_AUTH_METHOD: "client_secret_basic",
      OIDC_ID_TOKEN_SIGNING_ALG: "RS256",
      AUTH_SESSION_LIFETIME_SECONDS: "3600",
      AUTH_SESSION_PEPPER: SESSION_PEPPER,
      AUTH_TRANSACTION_ENCRYPTION_KEY: TRANSACTION_KEY,
      OWNER_PRIVATE_ACCESS_PEPPER: ownerPepper,
      OWNER_PRIVATE_EMAIL_DIGESTS: ownerDigest,
      ...bindingOverrides,
    },
    {
      origin: PUBLIC_ORIGIN,
      outboundService: provider.outboundService,
    },
  );
  context.after(() => worker.dispose());
  return { worker, provider, requestSequence: 0 };
}

async function beginLogin(harness, returnTo) {
  harness.requestSequence += 1;
  const query = new URLSearchParams({ return_to: returnTo });
  const response = await harness.worker.dispatch(`/auth/login?${query}`, {
    headers: navigationHeaders({
      "cf-connecting-ip": `192.0.2.${harness.requestSequence}`,
    }),
  });
  const failureBody = response.status === 303
    ? ""
    : await response.clone().text();
  const failureRateState = response.status === 303
    ? null
    : (await harness.worker.inspect([
        {
          sql: `select scope, request_count from abuse_rate_limits
            where scope = 'auth_login_network'`,
        },
      ]))[0].results;
  assert.equal(
    response.status,
    303,
    `login failed: ${failureBody}; rate state: ${JSON.stringify(failureRateState)}; provider requests: ${JSON.stringify(harness.provider.requests)}`,
  );
  assertAuthSecurityHeaders(response);
  const authorizationLocation = response.headers.get("location");
  assert.ok(authorizationLocation?.startsWith(`${SYNTHETIC_OIDC_ISSUER}/`));
  const transactionSetCookie = setCookieFor(
    response,
    "__Host-roadmap_oidc_tx",
  );
  assertSecureHostCookie(transactionSetCookie, "__Host-roadmap_oidc_tx");
  return {
    authorizationLocation,
    transactionCookie: cookiePair(transactionSetCookie),
  };
}

async function completeLogin(
  harness,
  login,
  claims = {},
  options = {},
) {
  const callbackUrl = harness.provider.authorize(
    login.authorizationLocation,
    claims,
  );
  login.callbackUrl = callbackUrl;
  harness.requestSequence += 1;
  const response = await harness.worker.dispatch(
    `${callbackUrl.pathname}${callbackUrl.search}`,
    {
      headers: navigationHeaders({
        cookie: [login.transactionCookie, options.existingSessionCookie]
          .filter(Boolean)
          .join("; "),
        "cf-connecting-ip": `192.0.2.${harness.requestSequence}`,
      }),
    },
  );
  const sessionSetCookie = setCookieFor(
    response,
    "__Host-roadmap_session",
  );
  if (options.expectSession !== false) {
    assert.ok(
      sessionSetCookie,
      `session cookie missing after callback ${response.status}: ${await response.clone().text()}; set-cookie: ${JSON.stringify(setCookieValues(response))}; provider requests: ${JSON.stringify(harness.provider.requests)}; token requests: ${JSON.stringify(harness.provider.tokenRequests)}`,
    );
    assertSecureHostCookie(sessionSetCookie, "__Host-roadmap_session");
  }
  return {
    callbackUrl,
    response,
    sessionSetCookie,
    sessionCookie: sessionSetCookie ? cookiePair(sessionSetCookie) : null,
  };
}

function navigationHeaders(additional = {}) {
  return {
    accept: "text/html,application/xhtml+xml",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    ...additional,
  };
}

function sameOriginHeaders(additional = {}) {
  return {
    origin: PUBLIC_ORIGIN,
    "sec-fetch-site": "same-origin",
    ...additional,
  };
}

function setCookieFor(response, name) {
  return setCookieValues(response).find((value) =>
    value.startsWith(`${name}=`),
  ) ?? null;
}

function setCookieValues(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined
    ? combined.split(/,(?=\s*__Host-[A-Za-z0-9_-]+=)/).map((value) => value.trim())
    : [];
}

function cookiePair(setCookie) {
  assert.ok(setCookie);
  return setCookie.split(";", 1)[0];
}

function assertSecureHostCookie(setCookie, name) {
  assert.ok(setCookie, `${name} cookie missing`);
  assert.match(setCookie, new RegExp(`^${escapeRegExp(name)}=[A-Za-z0-9_-]+;`));
  assert.match(setCookie, /; Path=\//i);
  assert.match(setCookie, /; Secure/i);
  assert.match(setCookie, /; HttpOnly/i);
  assert.match(setCookie, /; SameSite=Lax/i);
  assert.match(setCookie, /; Max-Age=[1-9]\d*/i);
  assert.doesNotMatch(setCookie, /; Domain=/i);
}

function assertExpiredHostCookie(setCookie, name) {
  assert.ok(setCookie, `${name} expiry cookie missing`);
  assert.match(setCookie, new RegExp(`^${escapeRegExp(name)}=;`));
  assert.match(setCookie, /; Path=\//i);
  assert.match(setCookie, /; Secure/i);
  assert.match(setCookie, /; HttpOnly/i);
  assert.match(setCookie, /; SameSite=Lax/i);
  assert.match(setCookie, /; Max-Age=0/i);
  assert.doesNotMatch(setCookie, /; Domain=/i);
}

function assertAuthSecurityHeaders(response) {
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.match(
    response.headers.get("strict-transport-security") ?? "",
    /max-age=31536000/i,
  );
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/i,
  );
  assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
