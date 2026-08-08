import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startD1Worker } from "./support/d1-worker.mjs";

const migrationUrl = new URL(
  "../drizzle/0009_cultured_namora.sql",
  import.meta.url,
);

test(
  "consent consistency migration preserves valid legacy rows and rejects contradictory imports",
  { timeout: 60_000 },
  async (context) => {
    await context.test("valid 0008 consent history and indexes survive the upgrade", async () => {
      const worker = await startD1Worker({}, { migrationThroughIndex: 8 });
      context.after(() => worker.dispose());
      const database = await worker.database();
      await seedAccount(database, "consent_upgrade_account");
      const rows = [
        ["legacy_granted", "granted", 1_000, null, null, null, 1_000],
        ["legacy_declined", "declined", null, 2_000, null, null, 2_000],
        ["legacy_withdrawn", "withdrawn", null, null, 3_000, null, 3_000],
        ["legacy_expired", "expired", null, null, null, 4_000, 4_000],
      ];
      for (const row of rows) await insertLegacyConsent(database, row);

      await applyConsentConsistencyMigration(database);

      const preserved = await database
        .prepare(
          `select id, status, granted_at, declined_at, withdrawn_at, expires_at,
                  created_at
             from consent_records order by created_at`,
        )
        .all();
      assert.deepEqual(
        preserved.results.map((row) => row.id),
        rows.map((row) => row[0]),
      );
      const indexes = await database.prepare("pragma index_list('consent_records')").all();
      const indexNames = new Set(indexes.results.map((row) => row.name));
      assert.equal(indexNames.has("consent_records_account_id_unique"), true);
      assert.equal(indexNames.has("consent_records_subject_scope_created_idx"), true);
      assert.equal(indexNames.has("consent_records_status_expires_idx"), true);

      await assert.rejects(
        insertImportedContradiction(database, "post_upgrade_contradiction"),
        /check constraint failed/i,
      );
    });

    await context.test("a contradictory imported 0008 row fails the upgrade atomically", async () => {
      const worker = await startD1Worker({}, { migrationThroughIndex: 8 });
      context.after(() => worker.dispose());
      const database = await worker.database();
      await seedAccount(database, "consent_conflict_account");
      await insertImportedContradiction(database, "legacy_contradiction");

      await assert.rejects(
        applyConsentConsistencyMigration(database),
        /check constraint failed/i,
      );
      const legacy = await database
        .prepare("select id, status, granted_at from consent_records")
        .all();
      assert.deepEqual(legacy.results, [
        { id: "legacy_contradiction", status: "granted", granted_at: null },
      ]);
      const temporaryTable = await database
        .prepare(
          `select count(*) as count from sqlite_master
            where type = 'table' and name = '__new_consent_records'`,
        )
        .first();
      assert.equal(temporaryTable.count, 0);
      const originalIndexes = await database
        .prepare("pragma index_list('consent_records')")
        .all();
      const originalIndexNames = new Set(originalIndexes.results.map((row) => row.name));
      assert.equal(originalIndexNames.has("consent_records_account_id_unique"), true);
      assert.equal(
        originalIndexNames.has("consent_records_subject_scope_created_idx"),
        true,
      );
      assert.equal(originalIndexNames.has("consent_records_status_expires_idx"), true);
      await database
        .prepare(
          `insert into consent_records (
            id, account_id, golfer_id, subject_type, scope, status,
            policy_version, purpose_description, capture_method,
            recorded_by_account_id, withdrawn_at, created_at
          ) select 'legacy_table_still_writable', id, null, 'account',
              'service_email', 'withdrawn', 'synthetic-legacy-v1',
              'Synthetic post-failure legacy write.', 'imported', id, 6000, 6000
            from accounts where id = 'consent_conflict_account'`,
        )
        .run();
      const usableRows = await database
        .prepare("select count(*) as count from consent_records")
        .first();
      assert.equal(usableRows.count, 2);
    });
  },
);

async function applyConsentConsistencyMigration(database) {
  const migration = await readFile(migrationUrl, "utf8");
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  return database.batch(statements.map((statement) => database.prepare(statement)));
}

function seedAccount(database, id) {
  const email = `${id}@example.test`;
  return database
    .prepare(
      `insert into accounts (
        id, auth_subject, primary_email, normalized_email,
        email_verified_at, status
      ) values (?, ?, ?, ?, ?, 'active')`,
    )
    .bind(id, `subject-${id}`, email, email, Date.now())
    .run();
}

function insertLegacyConsent(database, row) {
  return database
    .prepare(
      `insert into consent_records (
        id, account_id, golfer_id, subject_type, scope, status,
        policy_version, purpose_description, capture_method,
        recorded_by_account_id, granted_at, declined_at, withdrawn_at,
        expires_at, created_at
      ) values (?, 'consent_upgrade_account', null, 'account', 'service_email', ?,
        'synthetic-legacy-v1', 'Synthetic legacy migration fixture.', 'imported',
        'consent_upgrade_account', ?, ?, ?, ?, ?)`,
    )
    .bind(...row)
    .run();
}

function insertImportedContradiction(database, id) {
  return database
    .prepare(
      `insert into consent_records (
        id, account_id, golfer_id, subject_type, scope, status,
        policy_version, purpose_description, capture_method,
        recorded_by_account_id, granted_at, declined_at, withdrawn_at,
        expires_at, created_at
      ) select ?, id, null, 'account', 'golfer_record', 'granted',
          'synthetic-import-v1', 'Synthetic contradictory import fixture.',
          'imported', id, null, null, null, null, 5000
        from accounts limit 1`,
    )
    .bind(id)
    .run();
}
