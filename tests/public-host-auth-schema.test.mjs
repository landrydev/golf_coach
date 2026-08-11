import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startD1Worker } from "./support/d1-worker.mjs";

test("public-host auth schema stores only bounded fingerprints and stable issuer-subject mappings", async () => {
  const journal = JSON.parse(
    await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  const authMigrationName = journal.entries.find(({ idx }) => idx === 11)?.tag;
  assert.ok(authMigrationName?.startsWith("0011_"));
  const migrations = await Promise.all(
    journal.entries.map((entry) =>
      readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"),
    ),
  );
  const compact = migrations.join("\n").replace(/\s+/g, " ");

  assert.match(compact, /CREATE TABLE `oidc_login_transactions`/);
  assert.match(compact, /hmac-sha256-oidc-state-v1/);
  assert.match(compact, /aes-256-gcm-v1/);
  assert.match(compact, /CREATE TABLE `instructor_sessions`/);
  assert.match(compact, /hmac-sha256-instructor-session-v1/);
  assert.match(
    compact,
    /FOREIGN KEY \(`account_id`\) REFERENCES `accounts`\(`id`\)[^;]+ON DELETE cascade/,
  );
  assert.match(compact, /accounts_oidc_auth_identity_unique/);
  assert.match(compact, /accounts_normalized_email_unique/);
  assert.match(compact, /accounts_identity_version_check/);
  assert.doesNotMatch(
    compact,
    /(?:raw_state|state_token|raw_session|session_token|id_token|access_token|refresh_token)/i,
  );
});

test(
  "identity-version changes leave historical sessions present but stale",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const now = Date.now();
    const tokenHash = "a".repeat(64);

    await worker.inspect([
      {
        sql: `insert into accounts
          (id, auth_provider, auth_issuer, auth_subject, identity_version,
           primary_email, normalized_email, email_verified_at, status)
          values (?, 'oidc', ?, ?, 1, ?, ?, ?, 'active')`,
        params: [
          "account_auth_schema",
          "https://issuer.schema.test",
          "stable-subject",
          "schema.coach@example.test",
          "schema.coach@example.test",
          now,
        ],
      },
      {
        sql: `insert into instructor_sessions
          (id, account_id, identity_version, token_hash, authenticated_at, expires_at)
          values (?, ?, 1, ?, ?, ?)`,
        params: [
          "session_auth_schema",
          "account_auth_schema",
          tokenHash,
          now - 1_000,
          now + 60_000,
        ],
      },
      {
        sql: `update accounts set identity_version = 2, updated_at = ? where id = ?`,
        params: [now + 1, "account_auth_schema"],
      },
    ]);

    const [state] = await worker.inspect([
      {
        sql: `select s.id, s.identity_version as session_version,
          a.identity_version as account_version,
          s.token_hash, s.revoked_at
          from instructor_sessions s join accounts a on a.id = s.account_id
          where s.id = ?`,
        params: ["session_auth_schema"],
      },
    ]);
    assert.deepEqual(state.results, [
      {
        id: "session_auth_schema",
        session_version: 1,
        account_version: 2,
        token_hash: tokenHash,
        revoked_at: null,
      },
    ]);
  },
);

test(
  "database uniqueness cannot merge a different issuer-subject identity by email",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const now = Date.now();
    const insert = (id, issuer, subject, email) => ({
      sql: `insert into accounts
        (id, auth_provider, auth_issuer, auth_subject, identity_version,
         primary_email, normalized_email, email_verified_at, status)
        values (?, 'oidc', ?, ?, 1, ?, ?, ?, 'active')`,
      params: [id, issuer, subject, email, email, now],
    });

    await worker.inspect([
      insert(
        "account_identity_one",
        "https://issuer.schema.test",
        "subject-one",
        "shared@example.test",
      ),
    ]);
    await assert.rejects(
      worker.inspect([
        insert(
          "account_identity_two",
          "https://issuer.schema.test",
          "subject-two",
          "shared@example.test",
        ),
      ]),
    );
    await assert.rejects(
      worker.inspect([
        insert(
          "account_identity_three",
          "https://issuer.schema.test",
          "subject-one",
          "different@example.test",
        ),
      ]),
    );

    const [accounts] = await worker.inspect([
      {
        sql: `select id, auth_issuer, auth_subject, normalized_email
          from accounts where auth_provider = 'oidc' order by id`,
      },
    ]);
    assert.deepEqual(accounts.results, [
      {
        id: "account_identity_one",
        auth_issuer: "https://issuer.schema.test",
        auth_subject: "subject-one",
        normalized_email: "shared@example.test",
      },
    ]);
  },
);
