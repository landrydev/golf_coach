import assert from "node:assert/strict";
import test from "node:test";
import {
  INSTRUCTOR_SESSION_COOKIE,
  OIDC_TRANSACTION_COOKIE,
  readInstructorAuthConfiguration,
} from "../lib/instructor-auth-contract.ts";
import {
  MAX_ACTIVE_INSTRUCTOR_SESSIONS,
  cleanupInstructorAuthState,
  createInstructorSessionForOidcIdentity,
  validateInstructorSession,
} from "../lib/instructor-auth-state.ts";
import { startD1Worker } from "./support/d1-worker.mjs";

const APPLICATION_ORIGIN = "https://roadmap.example.ca";
const ISSUER = "https://issuer.hardening.example.ca";
const NOW = 1_900_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const SESSION_COOKIE_VALUE = Buffer.alloc(32, 41).toString("base64url");
const AUTH_ENVIRONMENT = Object.freeze({
  APP_URL: APPLICATION_ORIGIN,
  INSTRUCTOR_AUTH_MODE: "oidc_v1",
  OIDC_ISSUER: ISSUER,
  OIDC_CLIENT_ID: "hardening-test-client",
  OIDC_CLIENT_SECRET: "synthetic-hardening-client-secret",
  OIDC_TOKEN_ENDPOINT_AUTH_METHOD: "client_secret_basic",
  OIDC_ID_TOKEN_SIGNING_ALG: "RS256",
  AUTH_SESSION_LIFETIME_SECONDS: "900",
  AUTH_SESSION_PEPPER:
    "synthetic-hardening-session-pepper-tests-only-2026",
  AUTH_TRANSACTION_ENCRYPTION_KEY: Buffer.alloc(32, 43).toString("base64url"),
});
const configuration = readInstructorAuthConfiguration(AUTH_ENVIRONMENT);

assert.equal(configuration?.mode, "oidc_v1");
assert.match(SESSION_COOKIE_VALUE, /^[A-Za-z0-9_-]{43}$/);

test(
  "cleanup removes only sessions beyond retention across revoked states and preserves tenants",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const database = await worker.database();
    const createdAt = NOW - 40 * DAY_MS;
    const tenantA = await createSessions(
      database,
      instructorClaims("cleanup-a"),
      4,
      createdAt,
    );
    const tenantB = await createSessions(
      database,
      instructorClaims("cleanup-b"),
      2,
      createdAt + 100,
    );

    await database.batch([
      sessionRetentionUpdate(database, tenantA[0].identity.sessionId, {
        expiresAt: NOW + DAY_MS,
      }),
      sessionRetentionUpdate(database, tenantA[1].identity.sessionId, {
        expiresAt: NOW - DAY_MS,
      }),
      sessionRetentionUpdate(database, tenantA[2].identity.sessionId, {
        expiresAt: NOW - 31 * DAY_MS,
      }),
      sessionRetentionUpdate(database, tenantA[3].identity.sessionId, {
        expiresAt: NOW - 31 * DAY_MS,
        revokedAt: NOW - 32 * DAY_MS,
        revokeReason: "security_revocation",
      }),
      sessionRetentionUpdate(database, tenantB[0].identity.sessionId, {
        expiresAt: NOW + DAY_MS,
      }),
      sessionRetentionUpdate(database, tenantB[1].identity.sessionId, {
        expiresAt: NOW - DAY_MS,
      }),
    ]);

    assert.deepEqual(await cleanupInstructorAuthState({ database, now: NOW }), {
      transactionsDeleted: 0,
      sessionsDeleted: 2,
    });

    const rows = await database
      .prepare(
        `select id, account_id as accountId, expires_at as expiresAt,
                revoked_at as revokedAt
           from instructor_sessions
          order by created_at, id`,
      )
      .all();
    const retainedIds = rows.results.map((row) => row.id).sort();
    assert.deepEqual(
      retainedIds,
      [
        tenantA[0].identity.sessionId,
        tenantA[1].identity.sessionId,
        tenantB[0].identity.sessionId,
        tenantB[1].identity.sessionId,
      ].sort(),
    );
    assert.deepEqual(
      rows.results
        .filter((row) => row.accountId === tenantB[0].identity.accountId)
        .map((row) => row.id)
        .sort(),
      tenantB.map((session) => session.identity.sessionId).sort(),
      "cleanup must not remove another tenant's live or recently expired sessions",
    );
  },
);

test(
  "sequential session creation never exceeds the exported cap and revokes the oldest",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const database = await worker.database();
    const claims = instructorClaims("sequential-cap");
    const sessions = [];

    for (
      let index = 0;
      index < MAX_ACTIVE_INSTRUCTOR_SESSIONS + 3;
      index += 1
    ) {
      const now = NOW + index;
      const session = await createSession(database, claims, now);
      sessions.push(session);
      const active = await activeSessionCount(
        database,
        session.identity.accountId,
        now,
      );
      assert.ok(
        active <= MAX_ACTIVE_INSTRUCTOR_SESSIONS,
        `active session count ${active} exceeded ${MAX_ACTIVE_INSTRUCTOR_SESSIONS}`,
      );
    }

    const rows = await sessionsForAccount(
      database,
      sessions[0].identity.accountId,
    );
    const revoked = rows.filter((row) => row.revokedAt !== null);
    const active = rows.filter((row) => row.revokedAt === null);
    assert.equal(active.length, MAX_ACTIVE_INSTRUCTOR_SESSIONS);
    assert.deepEqual(
      revoked.map((row) => row.id),
      sessions.slice(0, 3).map((session) => session.identity.sessionId),
    );
    assert.ok(
      revoked.every(
        (row) => row.revokeReason === "concurrent_session_limit",
      ),
    );
    assert.equal(
      await validateInstructorSession({
        database,
        configuration,
        token: sessions[0].token,
        now: NOW + sessions.length,
      }),
      null,
    );
    assert.equal(
      (
        await validateInstructorSession({
          database,
          configuration,
          token: sessions.at(-1).token,
          now: NOW + sessions.length,
        })
      )?.sessionId,
      sessions.at(-1).identity.sessionId,
    );
  },
);

test(
  "scheduled work cleans retained auth state without login traffic",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({}, { triggerHandlers: true });
    context.after(() => worker.dispose());
    const database = await worker.database();
    const now = Date.now();
    const sessions = await createSessions(
      database,
      instructorClaims("scheduled-cleanup"),
      2,
      now - 40 * DAY_MS,
    );
    await database.batch([
      sessionRetentionUpdate(database, sessions[0].identity.sessionId, {
        expiresAt: now - 31 * DAY_MS,
      }),
      sessionRetentionUpdate(database, sessions[1].identity.sessionId, {
        expiresAt: now - DAY_MS,
      }),
    ]);

    assert.equal((await worker.dispatchScheduled()).status, 200);
    const rows = await sessionsForAccount(
      database,
      sessions[0].identity.accountId,
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      [sessions[1].identity.sessionId],
    );
  },
);

test(
  "Promise.all session creation stays capped, revokes oldest first, and isolates tenants",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const database = await worker.database();
    const claims = instructorClaims("concurrent-cap");
    const otherTenant = await createSessions(
      database,
      instructorClaims("concurrent-cap-other-tenant"),
      2,
      NOW,
    );
    const first = await createSession(database, claims, NOW + 100);
    const concurrent = await Promise.all(
      Array.from(
        { length: MAX_ACTIVE_INSTRUCTOR_SESSIONS + 6 },
        (_, index) => createSession(database, claims, NOW + 101 + index),
      ),
    );
    const sessions = [first, ...concurrent];
    const rows = await sessionsForAccount(database, first.identity.accountId);
    const expectedRevoked = sessions.length - MAX_ACTIVE_INSTRUCTOR_SESSIONS;

    assert.equal(rows.length, sessions.length);
    assert.equal(
      rows.filter((row) => row.revokedAt === null).length,
      MAX_ACTIVE_INSTRUCTOR_SESSIONS,
    );
    assert.deepEqual(
      rows.slice(0, expectedRevoked).map((row) => row.id),
      sessions
        .slice(0, expectedRevoked)
        .map((session) => session.identity.sessionId),
    );
    assert.ok(
      rows
        .slice(0, expectedRevoked)
        .every(
          (row) =>
            row.revokedAt !== null &&
            row.revokeReason === "concurrent_session_limit",
        ),
    );
    assert.ok(
      rows.slice(expectedRevoked).every((row) => row.revokedAt === null),
    );

    const otherRows = await sessionsForAccount(
      database,
      otherTenant[0].identity.accountId,
    );
    assert.equal(otherRows.length, 2);
    assert.ok(otherRows.every((row) => row.revokedAt === null));
  },
);

test(
  "runtime auth preserves a valid-shaped cookie on config, D1, and revoke unavailability",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker(AUTH_ENVIRONMENT, {
      origin: APPLICATION_ORIGIN,
      instructorAuthModeDefault: false,
    });
    context.after(() => worker.dispose());
    const sessionCookie = `${INSTRUCTOR_SESSION_COOKIE}=${SESSION_COOKIE_VALUE}`;

    const definitiveInvalid = await worker.dispatch("/api/profile", {
      headers: { cookie: sessionCookie },
    });
    assert.equal(definitiveInvalid.status, 401);
    assertExpiredCookie(
      setCookieFor(definitiveInvalid, INSTRUCTOR_SESSION_COOKIE),
      INSTRUCTOR_SESSION_COOKIE,
    );

    await worker.inspect([{ sql: "drop table instructor_sessions" }]);
    const unavailableRead = await worker.dispatch("/api/profile", {
      headers: { cookie: sessionCookie },
    });
    assert.equal(unavailableRead.status, 503);
    assert.equal(
      setCookieFor(unavailableRead, INSTRUCTOR_SESSION_COOKIE),
      null,
      "authenticateInstructorRequest must preserve the cookie after a D1 failure",
    );

    const unavailableRevoke = await worker.dispatch("/auth/logout", {
      method: "POST",
      headers: sameOriginHeaders({ cookie: sessionCookie }),
    });
    assert.equal(unavailableRevoke.status, 503);
    assert.equal(
      setCookieFor(unavailableRevoke, INSTRUCTOR_SESSION_COOKIE),
      null,
      "handleInstructorAuthRoute must preserve the cookie after revoke failure",
    );
    assertExpiredCookie(
      setCookieFor(unavailableRevoke, OIDC_TRANSACTION_COOKIE),
      OIDC_TRANSACTION_COOKIE,
    );

    await worker.setBindings({ OIDC_CLIENT_SECRET: "" });
    const unavailableConfiguration = await worker.dispatch("/api/profile", {
      headers: { cookie: sessionCookie },
    });
    assert.equal(unavailableConfiguration.status, 503);
    assert.equal(
      setCookieFor(unavailableConfiguration, INSTRUCTOR_SESSION_COOKIE),
      null,
    );
    const unavailableConfigurationLogout = await worker.dispatch(
      "/auth/logout",
      {
        method: "POST",
        headers: sameOriginHeaders({ cookie: sessionCookie }),
      },
    );
    assert.equal(unavailableConfigurationLogout.status, 503);
    assert.equal(
      setCookieFor(
        unavailableConfigurationLogout,
        INSTRUCTOR_SESSION_COOKIE,
      ),
      null,
    );
  },
);

test(
  "invalid ASCII, control, and non-ASCII emails are rejected before writes",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const database = await worker.database();
    const invalidEmails = [
      ["invalid ASCII", "coach@@example.test"],
      ["space-padded ASCII", " coach@example.test"],
      ["C0 control", "coach\u0000@example.test"],
      ["line control", "coach\n@example.test"],
      ["DEL control", "coach\u007f@example.test"],
      ["non-ASCII", "coäch@example.test"],
    ];

    for (const [label, email] of invalidEmails) {
      await assert.rejects(
        createInstructorSessionForOidcIdentity({
          database,
          configuration,
          claims: {
            issuer: ISSUER,
            subject: `invalid-email-${label}`,
            email,
          },
          now: NOW,
        }),
        (error) => error?.code === "invalid_identity_claims",
        label,
      );
      assert.deepEqual(await authWriteCounts(database), {
        accounts: 0,
        auditEvents: 0,
        sessions: 0,
      });
    }
  },
);

test("same-origin OIDC issuer configuration is rejected", () => {
  assert.equal(
    readInstructorAuthConfiguration({
      ...AUTH_ENVIRONMENT,
      OIDC_ISSUER: APPLICATION_ORIGIN,
    }),
    null,
  );
  assert.equal(
    readInstructorAuthConfiguration({
      ...AUTH_ENVIRONMENT,
      OIDC_ISSUER: `${APPLICATION_ORIGIN}/oidc/issuer`,
    }),
    null,
  );
  assert.equal(
    readInstructorAuthConfiguration({
      ...AUTH_ENVIRONMENT,
      OIDC_ISSUER: `${APPLICATION_ORIGIN}:443/oidc/issuer`,
    }),
    null,
  );
  assert.equal(
    readInstructorAuthConfiguration(AUTH_ENVIRONMENT)?.mode,
    "oidc_v1",
  );
});

function instructorClaims(suffix) {
  return {
    issuer: ISSUER,
    subject: `hardening-subject-${suffix}`,
    email: `hardening.${suffix}@example.test`,
  };
}

async function createSessions(database, claims, count, startingAt) {
  const sessions = [];
  for (let index = 0; index < count; index += 1) {
    sessions.push(await createSession(database, claims, startingAt + index));
  }
  return sessions;
}

async function createSession(database, claims, now) {
  const result = await createInstructorSessionForOidcIdentity({
    database,
    configuration,
    claims,
    now,
  });
  assert.equal(result.kind, "created");
  return result;
}

function sessionRetentionUpdate(
  database,
  sessionId,
  { expiresAt, revokedAt = null, revokeReason = null },
) {
  return database
    .prepare(
      `update instructor_sessions
          set expires_at = ?, revoked_at = ?, revoke_reason = ?, updated_at = ?
        where id = ?`,
    )
    .bind(expiresAt, revokedAt, revokeReason, NOW, sessionId);
}

async function activeSessionCount(database, accountId, now) {
  const row = await database
    .prepare(
      `select count(*) as count
         from instructor_sessions
        where account_id = ? and revoked_at is null and expires_at > ?`,
    )
    .bind(accountId, now)
    .first();
  return Number(row?.count ?? 0);
}

async function sessionsForAccount(database, accountId) {
  const result = await database
    .prepare(
      `select id, created_at as createdAt, revoked_at as revokedAt,
              revoke_reason as revokeReason
         from instructor_sessions
        where account_id = ?
        order by created_at, id`,
    )
    .bind(accountId)
    .all();
  return result.results;
}

async function authWriteCounts(database) {
  const [accounts, sessions, auditEvents] = await database.batch([
    database.prepare("select count(*) as count from accounts"),
    database.prepare("select count(*) as count from instructor_sessions"),
    database.prepare("select count(*) as count from audit_events"),
  ]);
  return {
    accounts: Number(accounts.results[0].count),
    auditEvents: Number(auditEvents.results[0].count),
    sessions: Number(sessions.results[0].count),
  };
}

function sameOriginHeaders(additional = {}) {
  return {
    origin: APPLICATION_ORIGIN,
    "sec-fetch-site": "same-origin",
    ...additional,
  };
}

function assertExpiredCookie(value, name) {
  assert.ok(value?.startsWith(`${name}=`));
  assert.match(value, /(?:^|;) Max-Age=0(?:;|$)/i);
  assert.match(value, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
}

function setCookieFor(response, name) {
  return (
    setCookieValues(response).find((value) =>
      value.startsWith(`${name}=`),
    ) ?? null
  );
}

function setCookieValues(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined ? [combined] : [];
}
