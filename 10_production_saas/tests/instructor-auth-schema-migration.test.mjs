import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startD1Worker } from "./support/d1-worker.mjs";

const migrationUrl = new URL(
  "../drizzle/0011_stormy_shard.sql",
  import.meta.url,
);

test(
  "instructor-auth migration preserves legacy identities and enforces the OIDC session boundary",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({}, { migrationThroughIndex: 10 });
    context.after(() => worker.dispose());
    const database = await worker.database();

    await seedLegacyAccount(database, {
      id: "legacy_siwc",
      provider: "siwc",
      subject: "legacy-siwc@example.test",
    });
    await seedLegacyAccount(database, {
      id: "legacy_development",
      provider: "development",
      subject: "legacy-development@example.test",
    });
    await database
      .prepare(
        `insert into instructor_profiles (
          account_id, display_name, contact_email
        ) values ('legacy_siwc', 'Legacy Coach', 'legacy_siwc@example.test')`,
      )
      .run();
    await database
      .prepare(
        `insert into abuse_rate_limits (
          scope, subject_key_hash, window_started_at, window_expires_at,
          request_count, last_request_at
        ) values ('share_close_session', ?, 1000, 2000, 3, 1500)`,
      )
      .bind("a".repeat(64))
      .run();

    await applyMigration(database);

    const preservedAccounts = await database
      .prepare(
        `select id, auth_provider, auth_issuer, auth_subject, identity_version
           from accounts order by id`,
      )
      .all();
    assert.deepEqual(preservedAccounts.results, [
      {
        id: "legacy_development",
        auth_provider: "development",
        auth_issuer: null,
        auth_subject: "legacy-development@example.test",
        identity_version: 1,
      },
      {
        id: "legacy_siwc",
        auth_provider: "siwc",
        auth_issuer: null,
        auth_subject: "legacy-siwc@example.test",
        identity_version: 1,
      },
    ]);
    assert.deepEqual(
      await database
        .prepare(
          `select account_id, display_name from instructor_profiles
            where account_id = 'legacy_siwc'`,
        )
        .first(),
      { account_id: "legacy_siwc", display_name: "Legacy Coach" },
    );
    assert.deepEqual(
      await database
        .prepare(
          `select scope, request_count from abuse_rate_limits
             where subject_key_hash = ?`,
        )
        .bind("a".repeat(64))
        .first(),
      { scope: "share_close_session", request_count: 3 },
    );

    const accountIndexes = await indexNames(database, "accounts");
    assert.equal(accountIndexes.has("accounts_auth_identity_unique"), false);
    assert.equal(accountIndexes.has("accounts_legacy_auth_identity_unique"), true);
    assert.equal(accountIndexes.has("accounts_oidc_auth_identity_unique"), true);
    assert.equal(accountIndexes.has("accounts_id_identity_version_unique"), true);
    assert.equal(accountIndexes.has("accounts_normalized_email_unique"), true);

    const sessionIndexes = await indexNames(database, "instructor_sessions");
    assert.equal(sessionIndexes.has("instructor_sessions_token_hash_unique"), true);
    assert.equal(sessionIndexes.has("instructor_sessions_account_revoked_idx"), true);
    assert.equal(sessionIndexes.has("instructor_sessions_expiry_revoked_idx"), true);
    assert.equal(
      (await indexNames(database, "oidc_login_transactions")).has(
        "oidc_login_transactions_expiry_consumed_idx",
      ),
      true,
    );

    const sessionForeignKeys = await database
      .prepare("pragma foreign_key_list('instructor_sessions')")
      .all();
    assert.deepEqual(
      sessionForeignKeys.results
        .map((row) => ({
          from: row.from,
          to: row.to,
          table: row.table,
          on_delete: row.on_delete,
        }))
        .sort((left, right) => left.from.localeCompare(right.from)),
      [
        {
          from: "account_id",
          to: "id",
          table: "accounts",
          on_delete: "CASCADE",
        },
      ],
    );
    assert.deepEqual(
      (await database.prepare("pragma foreign_key_check").all()).results,
      [],
    );

    await context.test("OIDC issuer-subject and legacy identities remain disjoint", async () => {
      await insertOidcAccount(database, {
        id: "oidc_primary",
        issuer: "https://idp.example.test",
        subject: "provider-subject",
        email: "oidc-primary@example.test",
      });
      await insertOidcAccount(database, {
        id: "oidc_other_issuer",
        issuer: "https://other-idp.example.test",
        subject: "provider-subject",
        email: "oidc-other@example.test",
      });

      await assert.rejects(
        insertOidcAccount(database, {
          id: "oidc_duplicate",
          issuer: "https://idp.example.test",
          subject: "provider-subject",
          email: "oidc-duplicate@example.test",
        }),
        /unique constraint failed/i,
      );
      await assert.rejects(
        database
          .prepare(
            `insert into accounts (
              id, auth_provider, auth_issuer, auth_subject,
              primary_email, normalized_email, status
            ) values (?, 'oidc', null, ?, ?, ?, 'active')`,
          )
          .bind(
            "oidc_missing_issuer",
            "missing-issuer-subject",
            "missing-issuer@example.test",
            "missing-issuer@example.test",
          )
          .run(),
        /check constraint failed/i,
      );
      await assert.rejects(
        database
          .prepare(
            `insert into accounts (
              id, auth_provider, auth_issuer, auth_subject,
              primary_email, normalized_email, status
            ) values (?, 'siwc', ?, ?, ?, ?, 'active')`,
          )
          .bind(
            "legacy_with_issuer",
            "https://idp.example.test",
            "legacy-with-issuer",
            "legacy-with-issuer@example.test",
            "legacy-with-issuer@example.test",
          )
          .run(),
        /check constraint failed/i,
      );
      await assert.rejects(
        seedLegacyAccount(database, {
          id: "legacy_duplicate",
          provider: "siwc",
          subject: "legacy-siwc@example.test",
        }),
        /unique constraint failed/i,
      );
    });

    await context.test("transactions retain only constrained sealed state", async () => {
      const now = Date.now();
      await insertLoginTransaction(database, {
        stateHash: "c".repeat(64),
        now,
      });

      await assert.rejects(
        insertLoginTransaction(database, {
          stateHash: "not-a-state-hash",
          now,
        }),
        /check constraint failed/i,
      );
      await assert.rejects(
        insertLoginTransaction(database, {
          stateHash: "d".repeat(64),
          payloadIv: "invalid+base64url",
          now,
        }),
        /check constraint failed/i,
      );
      await assert.rejects(
        insertLoginTransaction(database, {
          stateHash: "e".repeat(64),
          sealedPayload: "",
          now,
        }),
        /check constraint failed/i,
      );
      await assert.rejects(
        insertLoginTransaction(database, {
          stateHash: "f".repeat(64),
          sealedPayload: "x".repeat(8193),
          now,
        }),
        /check constraint failed/i,
      );
      await assert.rejects(
        insertLoginTransaction(database, {
          stateHash: "0".repeat(64),
          stateHashAlgorithm: "sha256",
          now,
        }),
        /check constraint failed/i,
      );
      await assert.rejects(
        insertLoginTransaction(database, {
          stateHash: "1".repeat(64),
          payloadAlgorithm: "aes-cbc",
          now,
        }),
        /check constraint failed/i,
      );
      await assert.rejects(
        insertLoginTransaction(database, {
          stateHash: "2".repeat(64),
          expiresAt: now,
          now,
        }),
        /check constraint failed/i,
      );
      await assert.rejects(
        insertLoginTransaction(database, {
          stateHash: "3".repeat(64),
          consumedAt: now - 1,
          now,
        }),
        /check constraint failed/i,
      );

      const consume = await database
        .prepare(
          `update oidc_login_transactions
              set consumed_at = ?, updated_at = ?
            where state_hash = ? and consumed_at is null and expires_at > ?`,
        )
        .bind(now + 1, now + 1, "c".repeat(64), now)
        .run();
      assert.equal(consume.meta.changes, 1);
      const replay = await database
        .prepare(
          `update oidc_login_transactions
              set consumed_at = ?, updated_at = ?
            where state_hash = ? and consumed_at is null and expires_at > ?`,
        )
        .bind(now + 2, now + 2, "c".repeat(64), now)
        .run();
      assert.equal(replay.meta.changes, 0);
    });

    await context.test("sessions are hashed, revocable, and identity-version fenced", async () => {
      const now = Date.now();
      await insertInstructorSession(database, {
        id: "session_primary",
        accountId: "oidc_primary",
        tokenHash: "1".repeat(64),
        now,
      });

      await assert.rejects(
        insertInstructorSession(database, {
          id: "session_bad_version",
          accountId: "oidc_primary",
          identityVersion: 0,
          tokenHash: "2".repeat(64),
          now,
        }),
        /check constraint failed/i,
      );
      await assert.rejects(
        insertInstructorSession(database, {
          id: "session_bad_hash",
          accountId: "oidc_primary",
          tokenHash: "not-a-token-hash",
          now,
        }),
        /check constraint failed/i,
      );
      await assert.rejects(
        insertInstructorSession(database, {
          id: "session_bad_algorithm",
          accountId: "oidc_primary",
          tokenHash: "4".repeat(64),
          tokenHashAlgorithm: "sha256",
          now,
        }),
        /check constraint failed/i,
      );
      await assert.rejects(
        insertInstructorSession(database, {
          id: "session_bad_expiry",
          accountId: "oidc_primary",
          tokenHash: "5".repeat(64),
          expiresAt: now,
          now,
        }),
        /check constraint failed/i,
      );
      await assert.rejects(
        insertInstructorSession(database, {
          id: "session_future_authentication",
          accountId: "oidc_primary",
          tokenHash: "6".repeat(64),
          authenticatedAt: now + 1,
          now,
        }),
        /check constraint failed/i,
      );
      await assert.rejects(
        insertInstructorSession(database, {
          id: "session_missing_account",
          accountId: "missing_account",
          tokenHash: "7".repeat(64),
          now,
        }),
        /foreign key constraint failed/i,
      );
      await assert.rejects(
        insertInstructorSession(database, {
          id: "session_duplicate_hash",
          accountId: "oidc_primary",
          tokenHash: "1".repeat(64),
          now,
        }),
        /unique constraint failed/i,
      );
      await assert.rejects(
        insertInstructorSession(database, {
          id: "session_invalid_revocation",
          accountId: "oidc_primary",
          tokenHash: "3".repeat(64),
          revokedAt: now + 1,
          revokeReason: "   ",
          now,
        }),
        /check constraint failed/i,
      );
      await database
        .prepare(
          `update instructor_sessions
              set revoked_at = ?, revoke_reason = 'identity_remapped',
                  updated_at = ?
            where id = 'session_primary'`,
        )
        .bind(now + 1, now + 1)
        .run();
      await database
        .prepare(
          "update accounts set identity_version = 2 where id = 'oidc_primary'",
        )
        .run();
      assert.deepEqual(
        await database
          .prepare(
            `select s.identity_version as session_identity_version,
                    a.identity_version as account_identity_version,
                    s.revoked_at is not null as revoked
               from instructor_sessions s
               join accounts a on a.id = s.account_id
              where s.id = 'session_primary'`,
          )
          .first(),
        {
          session_identity_version: 1,
          account_identity_version: 2,
          revoked: 1,
        },
      );

      await database
        .prepare("delete from accounts where id = 'oidc_primary'")
        .run();
      assert.equal(
        (
          await database
            .prepare(
              "select count(*) as count from instructor_sessions where account_id = 'oidc_primary'",
            )
            .first()
        ).count,
        0,
      );
      assert.deepEqual(
        (await database.prepare("pragma foreign_key_check").all()).results,
        [],
      );
    });

    await database
      .prepare(
        `insert into abuse_rate_limits (
          scope, subject_key_hash, window_started_at, window_expires_at,
          request_count, last_request_at
        ) values ('auth_login_network', ?, 3000, 4000, 1, 3000),
                 ('auth_callback_network', ?, 3000, 4000, 1, 3000)`,
      )
      .bind("b".repeat(64), "c".repeat(64))
      .run();
  },
);

async function applyMigration(database) {
  const migration = await readFile(migrationUrl, "utf8");
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  return database.batch(statements.map((statement) => database.prepare(statement)));
}

function seedLegacyAccount(database, { id, provider, subject }) {
  const email = `${id}@example.test`;
  return database
    .prepare(
      `insert into accounts (
        id, auth_provider, auth_subject, primary_email, normalized_email,
        email_verified_at, status
      ) values (?, ?, ?, ?, ?, ?, 'active')`,
    )
    .bind(id, provider, subject, email, email, Date.now())
    .run();
}

function insertOidcAccount(database, { id, issuer, subject, email }) {
  return database
    .prepare(
      `insert into accounts (
        id, auth_provider, auth_issuer, auth_subject, identity_version,
        primary_email, normalized_email, email_verified_at, status
      ) values (?, 'oidc', ?, ?, 1, ?, ?, ?, 'active')`,
    )
    .bind(id, issuer, subject, email, email, Date.now())
    .run();
}

function insertLoginTransaction(
  database,
  {
    stateHash,
    now,
    payloadIv = "0123456789abcdef",
    sealedPayload = "sealed-pkce-nonce-return-path",
    stateHashAlgorithm = "hmac-sha256-oidc-state-v1",
    payloadAlgorithm = "aes-256-gcm-v1",
    expiresAt = now + 10 * 60 * 1000,
    consumedAt = null,
  },
) {
  return database
    .prepare(
      `insert into oidc_login_transactions (
        state_hash, state_hash_algorithm, sealed_payload, payload_iv,
        payload_algorithm, expires_at, consumed_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stateHash,
      stateHashAlgorithm,
      sealedPayload,
      payloadIv,
      payloadAlgorithm,
      expiresAt,
      consumedAt,
      now,
      now,
    )
    .run();
}

function insertInstructorSession(
  database,
  {
    id,
    accountId,
    now,
    identityVersion = 1,
    tokenHash,
    tokenHashAlgorithm = "hmac-sha256-instructor-session-v1",
    authenticatedAt = now,
    expiresAt = now + 8 * 60 * 60 * 1000,
    revokedAt = null,
    revokeReason = null,
  },
) {
  return database
    .prepare(
      `insert into instructor_sessions (
        id, account_id, identity_version, token_hash, token_hash_algorithm,
        authenticated_at, expires_at, revoked_at, revoke_reason,
        created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      accountId,
      identityVersion,
      tokenHash,
      tokenHashAlgorithm,
      authenticatedAt,
      expiresAt,
      revokedAt,
      revokeReason,
      now,
      now,
    )
    .run();
}

async function indexNames(database, tableName) {
  const indexes = await database.prepare(`pragma index_list('${tableName}')`).all();
  return new Set(indexes.results.map((row) => row.name));
}
