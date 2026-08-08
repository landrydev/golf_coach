import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const drizzleRoot = new URL("../drizzle/", import.meta.url);

async function loadDatabaseSources() {
  const [schema, journal, directory] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    readdir(drizzleRoot, { withFileTypes: true }),
  ]);
  const sqlNames = directory
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  const sqlParts = await Promise.all(
    sqlNames.map((name) => readFile(new URL(name, drizzleRoot), "utf8")),
  );
  return { schema, journal: JSON.parse(journal), sqlNames, migration: sqlParts.join("\n") };
}

function captures(source, expression) {
  return [...source.matchAll(expression)].map((match) => match[1]).sort();
}

function unique(values) {
  return [...new Set(values)].sort();
}

test("the migration journal, SQL files, and schema table set agree", async () => {
  const { schema, journal, sqlNames, migration } = await loadDatabaseSources();
  assert.equal(journal.dialect, "sqlite");

  const journalSqlNames = journal.entries
    .map((entry) => `${entry.tag}.sql`)
    .sort();
  assert.deepEqual(sqlNames, journalSqlNames);

  const schemaTables = captures(
    schema,
    /export const\s+\w+\s*=\s*sqliteTable\(\s*"([^"]+)"/g,
  );
  const migrationTables = unique(
    captures(migration, /CREATE TABLE `([^`]+)`/g).filter(
      // Migration-only rebuild and link-preservation tables are deliberately
      // dropped before the migration commits and are not domain schema.
      (name) => !name.startsWith("__"),
    ),
  );
  assert.ok(schemaTables.length >= 20, "expected the production domain schema");
  assert.deepEqual(migrationTables, schemaTables);

  const schemaIndexes = captures(
    schema,
    /\b(?:uniqueIndex|index)\("([^"]+)"\)/g,
  );
  const migrationIndexes = unique(
    captures(migration, /CREATE (?:UNIQUE )?INDEX `([^`]+)`/g),
  );
  assert.deepEqual(migrationIndexes, schemaIndexes);

  const schemaChecks = captures(schema, /\bcheck\(\s*"([^"]+)"/g);
  const migrationChecks = unique(
    captures(migration, /CONSTRAINT "([^"]+)" CHECK/g),
  );
  assert.deepEqual(migrationChecks, schemaChecks);

  for (const entry of journal.entries) {
    const snapshotName = `${String(entry.idx).padStart(4, "0")}_snapshot.json`;
    await assert.doesNotReject(
      readFile(new URL(`../drizzle/meta/${snapshotName}`, import.meta.url)),
    );
  }
  await assert.doesNotReject(readFile(new URL("../drizzle.config.ts", import.meta.url)));
  await assert.doesNotReject(readFile(new URL("../db/index.ts", import.meta.url)));
  assert.equal(projectRoot.protocol, "file:");
});

test("tenant ownership and lifecycle constraints are present in the migration", async () => {
  const { migration } = await loadDatabaseSources();
  const compact = migration.replace(/\s+/g, " ");

  assert.match(compact, /accounts_normalized_email_unique/);
  assert.match(compact, /accounts_normalized_email_check/);
  assert.match(
    compact,
    /FOREIGN KEY \(`account_id`,`golfer_id`\) REFERENCES `golfers`\(`account_id`,`id`\)/,
  );
  assert.match(
    compact,
    /FOREIGN KEY \(`account_id`,`plan_id`\) REFERENCES `development_plans`\(`account_id`,`id`\)/,
  );
  assert.match(
    compact,
    /FOREIGN KEY \(`account_id`,`coaching_package_id`\) REFERENCES `coaching_packages`\(`account_id`,`id`\)/,
  );
  assert.match(compact, /golfers_external_reference_unique/);
  assert.match(compact, /coaching_packages_one_default_per_account/);
  assert.match(compact, /plan_phases_one_active_per_plan/);
  assert.match(compact, /golfer_goals_one_primary_per_plan/);
  assert.match(
    compact,
    /eligibility_status[^;]+adult_confirmed[^;]+ineligible/i,
  );
  assert.match(
    compact,
    /data_requests_type_check[^;]+export[^;]+deletion/i,
  );
  assert.match(compact, /audit_events_metadata_json_check/);
});

test("share verifiers are hashed at rest and constrained to the selected algorithm", async () => {
  const { schema, migration } = await loadDatabaseSources();
  const combined = `${schema}\n${migration}`;

  assert.match(migration, /CREATE UNIQUE INDEX `share_links_token_hash_unique`/);
  assert.match(migration, /token_hash_algorithm[^\n]+DEFAULT 'hmac-sha256-v1'/);
  assert.match(
    migration,
    /length\("share_links"\."token_hash"\) = 64[^\n]+not glob '\*\[\^0-9a-f\]\*'/,
  );
  assert.doesNotMatch(combined, /\b(?:raw_token|token_raw|share_token)\b/i);
  assert.match(schema, /The URL bearer token is returned once and never persisted/);
});

test("share sessions are tenant-scoped, short-lived records with only peppered token fingerprints", async () => {
  const { schema, migration } = await loadDatabaseSources();
  const combined = `${schema}\n${migration}`;

  assert.match(migration, /CREATE TABLE `share_sessions`/);
  assert.match(
    migration,
    /FOREIGN KEY \(`account_id`,`share_link_id`\) REFERENCES `share_links`\(`account_id`,`id`\)/,
  );
  assert.match(migration, /CREATE UNIQUE INDEX `share_sessions_token_hash_unique`/);
  assert.match(migration, /token_hash_algorithm[^\n]+DEFAULT 'hmac-sha256-session-v1'/);
  assert.match(migration, /share_sessions_expiry_check/);
  assert.match(migration, /share_sessions_revocation_check/);
  assert.match(
    migration,
    /length\("share_sessions"\."token_hash"\) = 64[^\n]+not glob '\*\[\^0-9a-f\]\*'/,
  );
  assert.doesNotMatch(combined, /share_sessions[^;]+(?:raw_token|session_token|share_verifier)/i);
  assert.match(schema, /domain-separated, peppered HMAC-SHA-256 fingerprint/);
});

test("abuse counters contain only constrained digests and expiring fixed windows", async () => {
  const { schema, migration } = await loadDatabaseSources();
  const combined = `${schema}\n${migration}`;

  assert.match(migration, /CREATE TABLE `abuse_rate_limits`/);
  assert.match(
    migration,
    /PRIMARY KEY\(`scope`, `subject_key_hash`, `window_started_at`\)/,
  );
  assert.match(migration, /abuse_rate_limits_expires_idx/);
  assert.match(migration, /abuse_rate_limits_hash_check/);
  assert.match(migration, /abuse_rate_limits_window_check/);
  assert.doesNotMatch(combined, /abuse_rate_limits[^;]+(?:raw_ip|ip_address|raw_token)/i);
  assert.match(schema, /Raw identifiers are never/);
});
