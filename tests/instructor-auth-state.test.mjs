import assert from "node:assert/strict";
import test from "node:test";
import {
  INSTRUCTOR_SESSION_COOKIE,
  OIDC_TRANSACTION_COOKIE,
  readInstructorAuthConfiguration,
} from "../lib/instructor-auth-contract.ts";
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
} from "../lib/instructor-auth-state.ts";
import { startD1Worker } from "./support/d1-worker.mjs";

const ISSUER = "https://issuer.state.example.ca";
const NOW = 1_800_000_000_000;
const configuration = readInstructorAuthConfiguration({
  APP_URL: "https://roadmap.example.ca",
  INSTRUCTOR_AUTH_MODE: "oidc_v1",
  OIDC_ISSUER: ISSUER,
  OIDC_CLIENT_ID: "state-test-client",
  OIDC_CLIENT_SECRET: "synthetic-state-client-secret",
  OIDC_TOKEN_ENDPOINT_AUTH_METHOD: "client_secret_basic",
  OIDC_ID_TOKEN_SIGNING_ALG: "RS256",
  AUTH_SESSION_LIFETIME_SECONDS: "900",
  AUTH_SESSION_PEPPER: "synthetic-state-session-pepper-tests-only-2026",
  AUTH_TRANSACTION_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString("base64url"),
});
assert.equal(configuration?.mode, "oidc_v1");

test("auth cookies accept one exact opaque value and reject ambiguity", () => {
  const value = randomOpaqueAuthValue();
  assert.match(value, /^[A-Za-z0-9_-]{43}$/);
  const serialized = serializeAuthCookie(
    INSTRUCTOR_SESSION_COOKIE,
    value,
    900,
    NOW,
  );
  assert.match(serialized, /^__Host-roadmap_session=/);
  assert.match(serialized, /; Secure; HttpOnly; SameSite=Lax$/);
  assert.doesNotMatch(serialized, /Domain=/i);
  assert.equal(
    readUniqueAuthCookie(
      new Request("https://roadmap.example.ca/app", {
        headers: { cookie: `${INSTRUCTOR_SESSION_COOKIE}=${value}` },
      }),
      INSTRUCTOR_SESSION_COOKIE,
    ),
    value,
  );
  assert.equal(
    readUniqueAuthCookie(
      new Request("https://roadmap.example.ca/app", {
        headers: {
          cookie: `${INSTRUCTOR_SESSION_COOKIE}=${value}; ${INSTRUCTOR_SESSION_COOKIE}=${randomOpaqueAuthValue()}`,
        },
      }),
      INSTRUCTOR_SESSION_COOKIE,
    ),
    null,
  );
  assert.equal(
    clearAuthCookie(OIDC_TRANSACTION_COOKIE),
    "__Host-roadmap_oidc_tx=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure; HttpOnly; SameSite=Lax",
  );
});

test(
  "OIDC transaction state is encrypted, atomically consumed, non-replayable, and expiring",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const database = await worker.database();
    const state = randomOpaqueAuthValue();
    const nonce = randomOpaqueAuthValue();
    const verifier = randomOpaqueAuthValue();
    await createOidcLoginTransaction({
      database,
      configuration,
      state,
      nonce,
      pkceVerifier: verifier,
      returnTo: "/app?from=state",
      now: NOW,
    });
    const stored = await database
      .prepare(
        `select state_hash, sealed_payload, payload_iv, consumed_at
          from oidc_login_transactions`,
      )
      .all();
    assert.equal(stored.results.length, 1);
    assert.match(stored.results[0].state_hash, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(
      JSON.stringify(stored.results),
      new RegExp(`${state}|${nonce}|${verifier}`),
    );

    assert.deepEqual(
      await consumeOidcLoginTransaction({
        database,
        configuration,
        state,
        now: NOW + 1,
      }),
      {
        nonce,
        pkceVerifier: verifier,
        returnTo: "/app?from=state",
      },
    );
    assert.equal(
      await consumeOidcLoginTransaction({
        database,
        configuration,
        state,
        now: NOW + 2,
      }),
      null,
    );
    assert.equal(
      await consumeOidcLoginTransaction({
        database,
        configuration,
        state: randomOpaqueAuthValue(),
        now: NOW + 2,
      }),
      null,
    );

    const expiredState = randomOpaqueAuthValue();
    await createOidcLoginTransaction({
      database,
      configuration,
      state: expiredState,
      nonce: randomOpaqueAuthValue(),
      pkceVerifier: randomOpaqueAuthValue(),
      returnTo: "/app",
      now: NOW,
    });
    assert.equal(
      await consumeOidcLoginTransaction({
        database,
        configuration,
        state: expiredState,
        now: NOW + 10 * 60 * 1_000,
      }),
      null,
    );
  },
);

test(
  "sessions bind exact issuer-subject, reject email linking, and obey revocation, expiry, version, and status",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const database = await worker.database();
    const claims = {
      issuer: ISSUER,
      subject: "stable-state-subject",
      email: "state.coach@example.test",
    };
    const first = await createInstructorSessionForOidcIdentity({
      database,
      configuration,
      claims,
      now: NOW,
    });
    assert.equal(first.kind, "created");
    assert.equal(
      (await validateInstructorSession({
        database,
        configuration,
        token: first.token,
        now: NOW + 1,
      }))?.accountId,
      first.identity.accountId,
    );

    const sameIdentity = await createInstructorSessionForOidcIdentity({
      database,
      configuration,
      claims: { ...claims, email: "changed.profile@example.test" },
      now: NOW + 2,
    });
    assert.equal(sameIdentity.kind, "created");
    assert.equal(sameIdentity.identity.accountId, first.identity.accountId);
    const conflict = await createInstructorSessionForOidcIdentity({
      database,
      configuration,
      claims: { ...claims, subject: "different-subject" },
      now: NOW + 3,
    });
    assert.deepEqual(conflict, { kind: "identity_link_required" });

    assert.equal(
      await revokeInstructorSession({
        database,
        configuration,
        token: first.token,
        now: NOW + 4,
      }),
      true,
    );
    assert.equal(
      await validateInstructorSession({
        database,
        configuration,
        token: first.token,
        now: NOW + 5,
      }),
      null,
    );
    assert.equal(
      await validateInstructorSession({
        database,
        configuration,
        token: sameIdentity.token,
        now: NOW + 901_000,
      }),
      null,
    );

    await database
      .prepare(
        "update accounts set identity_version = identity_version + 1 where id = ?",
      )
      .bind(first.identity.accountId)
      .run();
    assert.equal(
      await validateInstructorSession({
        database,
        configuration,
        token: sameIdentity.token,
        now: NOW + 6,
      }),
      null,
    );

    const currentVersion = await createInstructorSessionForOidcIdentity({
      database,
      configuration,
      claims,
      now: NOW + 7,
    });
    assert.equal(currentVersion.kind, "created");
    for (const status of [
      "pending_verification",
      "suspended",
      "deletion_pending",
      "deleted",
    ]) {
      await database
        .prepare("update accounts set status = ? where id = ?")
        .bind(status, first.identity.accountId)
        .run();
      assert.equal(
        await validateInstructorSession({
          database,
          configuration,
          token: currentVersion.token,
          now: NOW + 8,
        }),
        null,
        status,
      );
    }
  },
);
