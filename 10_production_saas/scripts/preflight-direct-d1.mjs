import { mkdtemp, lstat, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Miniflare } from "miniflare";
import {
  DirectPreflightContractError,
  PRIVATE_SUCCESSOR_EXPECTED_MIGRATION_TAGS,
  PREFLIGHT_BLOCKER_IDS,
  assertLocalOnlyPreflightInvocation,
  buildPrivateSuccessorManifest,
  buildPrivateSuccessorReadiness,
  sha256,
  writePrivateSuccessorManifest,
} from "./direct-operations-contract.mjs";

const EXPECTED_LATEST_MIGRATION = Object.freeze({
  index: 16,
  tag: "0016_handy_green_goblin",
});
const TEMP_DIRECTORY_PREFIX = "roadmap-private-successor-d1-";

const EXPECTED_INDEXES = Object.freeze({
  accounts_legacy_auth_identity_unique: {
    table: "accounts",
    unique: 1,
    partial: 1,
    columns: ["auth_provider", "auth_subject"],
  },
  accounts_oidc_auth_identity_unique: {
    table: "accounts",
    unique: 1,
    partial: 1,
    columns: ["auth_issuer", "auth_subject"],
  },
  accounts_id_identity_version_unique: {
    table: "accounts",
    unique: 1,
    partial: 0,
    columns: ["id", "identity_version"],
  },
  oidc_login_transactions_expiry_consumed_idx: {
    table: "oidc_login_transactions",
    unique: 0,
    partial: 0,
    columns: ["expires_at", "consumed_at"],
  },
  instructor_sessions_token_hash_unique: {
    table: "instructor_sessions",
    unique: 1,
    partial: 0,
    columns: ["token_hash"],
  },
  instructor_sessions_account_revoked_idx: {
    table: "instructor_sessions",
    unique: 0,
    partial: 0,
    columns: ["account_id", "revoked_at"],
  },
  instructor_sessions_expiry_revoked_idx: {
    table: "instructor_sessions",
    unique: 0,
    partial: 0,
    columns: ["expires_at", "revoked_at"],
  },
});

const EXPECTED_COLUMNS = Object.freeze({
  accounts: {
    auth_issuer: { type: "TEXT", notnull: 0, defaultValue: null, pk: 0 },
    identity_version: { type: "INTEGER", notnull: 1, defaultValue: "1", pk: 0 },
  },
  oidc_login_transactions: {
    state_hash: { type: "TEXT", notnull: 1, defaultValue: null, pk: 1 },
    sealed_payload: { type: "TEXT", notnull: 1, defaultValue: null, pk: 0 },
    payload_iv: { type: "TEXT", notnull: 1, defaultValue: null, pk: 0 },
    expires_at: { type: "INTEGER", notnull: 1, defaultValue: null, pk: 0 },
    consumed_at: { type: "INTEGER", notnull: 0, defaultValue: null, pk: 0 },
  },
  instructor_sessions: {
    id: { type: "TEXT", notnull: 1, defaultValue: null, pk: 1 },
    account_id: { type: "TEXT", notnull: 1, defaultValue: null, pk: 0 },
    identity_version: { type: "INTEGER", notnull: 1, defaultValue: null, pk: 0 },
    token_hash: { type: "TEXT", notnull: 1, defaultValue: null, pk: 0 },
    authenticated_at: { type: "INTEGER", notnull: 1, defaultValue: null, pk: 0 },
    expires_at: { type: "INTEGER", notnull: 1, defaultValue: null, pk: 0 },
    revoked_at: { type: "INTEGER", notnull: 0, defaultValue: null, pk: 0 },
  },
});

const EXPECTED_CONSTRAINT_NAMES = Object.freeze({
  accounts: ["accounts_auth_mapping_check", "accounts_identity_version_check"],
  oidc_login_transactions: [
    "oidc_login_transactions_state_hash_algorithm_check",
    "oidc_login_transactions_state_hash_check",
    "oidc_login_transactions_payload_algorithm_check",
    "oidc_login_transactions_payload_iv_check",
    "oidc_login_transactions_sealed_payload_check",
    "oidc_login_transactions_expiry_check",
    "oidc_login_transactions_consumed_check",
  ],
  instructor_sessions: [
    "instructor_sessions_token_hash_algorithm_check",
    "instructor_sessions_token_hash_check",
    "instructor_sessions_identity_version_check",
    "instructor_sessions_expiry_check",
    "instructor_sessions_authenticated_at_check",
    "instructor_sessions_revocation_check",
  ],
});

export function directD1PreflightPaths(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot);
  return Object.freeze({
    root,
    sourceMigrations: path.join(root, "drizzle"),
    packagedMigrations: path.join(root, "dist", ".openai", "drizzle"),
  });
}

export async function loadExactPackagedMigrationBundle(projectRoot = process.cwd()) {
  const paths = directD1PreflightPaths(projectRoot);
  const [source, packaged] = await Promise.all([
    migrationFileMap(paths.sourceMigrations),
    migrationFileMap(paths.packagedMigrations),
  ]);
  if (source.size !== packaged.size) {
    throw preflightError(
      PREFLIGHT_BLOCKER_IDS.local.migrationParity,
      "Packaged migrations do not exactly match source migrations.",
    );
  }
  for (const [relativePath, sourceContents] of source) {
    const packagedContents = packaged.get(relativePath);
    if (!packagedContents || !sourceContents.equals(packagedContents)) {
      throw preflightError(
        PREFLIGHT_BLOCKER_IDS.local.migrationParity,
        "Packaged migrations do not exactly match source migrations.",
      );
    }
  }

  const journalContents = packaged.get("meta/_journal.json");
  let journal;
  try {
    journal = JSON.parse(journalContents?.toString("utf8") ?? "");
  } catch {
    throw invalidMigrationInventory();
  }
  assertMigrationJournal(journal, packaged);

  const migrations = journal.entries.map((entry) => {
    const relativePath = `${entry.tag}.sql`;
    return Object.freeze({
      index: entry.idx,
      tag: entry.tag,
      relativePath,
      sql: packaged.get(relativePath).toString("utf8"),
    });
  });
  const migrationInventory = [...packaged]
    .map(([relativePath, contents]) => ({
      relativePath,
      bytes: contents.byteLength,
      sha256: sha256Buffer(contents),
    }))
    .sort((left, right) =>
      left.relativePath < right.relativePath
        ? -1
        : left.relativePath > right.relativePath
          ? 1
          : 0,
    );

  return Object.freeze({
    migrationInventory: Object.freeze(migrationInventory),
    migrations: Object.freeze(migrations),
  });
}

export function splitMigrationStatements(sql) {
  if (typeof sql !== "string" || sql.trim().length === 0) {
    throw invalidMigrationInventory();
  }
  const statements = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (statements.length === 0 || statements.some((statement) => statement.includes("\0"))) {
    throw invalidMigrationInventory();
  }
  return statements;
}

/**
 * Apply only the checked packaged SQL to a newly-created temporary Miniflare
 * D1. No Wrangler process, provider credential, remote flag, or network client
 * is involved.
 */
export async function runIsolatedDirectD1Preflight({
  projectRoot = process.cwd(),
} = {}) {
  const bundle = await loadExactPackagedMigrationBundle(projectRoot);
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), TEMP_DIRECTORY_PREFIX));
  let miniflare;
  try {
    miniflare = new Miniflare({
      compatibilityDate: "2026-08-07",
      modules: true,
      script:
        'export default { fetch() { return new Response("local-only D1 preflight"); } };',
      d1Databases: { DB: "private-successor-preflight" },
      resourcePersistencePath: path.join(temporaryRoot, "resources"),
      telemetry: { enabled: false },
      logRequests: false,
    });
    const database = await miniflare.getD1Database("DB");
    const statements = bundle.migrations.flatMap(({ sql }) =>
      splitMigrationStatements(sql),
    );
    try {
      await database.batch(statements.map((statement) => database.prepare(statement)));
    } catch {
      throw preflightError(
        PREFLIGHT_BLOCKER_IDS.local.migrationApply,
        "Packaged migrations did not apply to the isolated local D1.",
      );
    }
    const inspection = await inspectMigration0011State(database);
    const localBlockers = validateMigration0011Inspection(inspection);
    return Object.freeze({
      migrationInventory: bundle.migrationInventory,
      localBlockers,
      inspectedLatestMigration: EXPECTED_LATEST_MIGRATION.tag,
    });
  } finally {
    if (miniflare) await miniflare.dispose();
    await removeOwnedTemporaryDirectory(temporaryRoot);
  }
}

export async function inspectMigration0011State(database) {
  const tables = ["accounts", "oidc_login_transactions", "instructor_sessions"];
  const tableSql = {};
  const columns = {};
  const indexes = {};
  const indexColumns = {};
  for (const table of tables) {
    const tableRow = await database
      .prepare("select sql from sqlite_master where type = 'table' and name = ?")
      .bind(table)
      .first();
    tableSql[table] = typeof tableRow?.sql === "string" ? tableRow.sql : null;
    columns[table] = await allRows(database, `pragma table_info('${table}')`);
    indexes[table] = await allRows(database, `pragma index_list('${table}')`);
  }
  for (const indexName of Object.keys(EXPECTED_INDEXES)) {
    indexColumns[indexName] = await allRows(
      database,
      `pragma index_info('${indexName}')`,
    );
  }
  const abuseRateLimitRow = await database
    .prepare(
      "select sql from sqlite_master where type = 'table' and name = 'abuse_rate_limits'",
    )
    .first();
  return {
    foreignKeysEnabled: await allRows(database, "pragma foreign_keys"),
    foreignKeyViolations: await allRows(database, "pragma foreign_key_check"),
    sessionForeignKeys: await allRows(
      database,
      "pragma foreign_key_list('instructor_sessions')",
    ),
    tableSql,
    columns,
    indexes,
    indexColumns,
    abuseRateLimitSql:
      typeof abuseRateLimitRow?.sql === "string" ? abuseRateLimitRow.sql : null,
  };
}

export function validateMigration0011Inspection(inspection) {
  let structureValid = Boolean(inspection && typeof inspection === "object");
  if (structureValid) {
    for (const [table, expectedColumns] of Object.entries(EXPECTED_COLUMNS)) {
      const actualByName = new Map(
        (inspection.columns?.[table] ?? []).map((column) => [column.name, column]),
      );
      for (const [name, expected] of Object.entries(expectedColumns)) {
        const actual = actualByName.get(name);
        structureValid &&=
          actual?.type?.toUpperCase() === expected.type &&
          Number(actual.notnull) === expected.notnull &&
          normalizedDefault(actual.dflt_value) === expected.defaultValue &&
          Number(actual.pk) === expected.pk;
      }
      const sql = inspection.tableSql?.[table];
      structureValid &&=
        typeof sql === "string" &&
        EXPECTED_CONSTRAINT_NAMES[table].every((name) => sql.includes(name));
    }
    for (const [name, expected] of Object.entries(EXPECTED_INDEXES)) {
      const index = (inspection.indexes?.[expected.table] ?? []).find(
        (candidate) => candidate.name === name,
      );
      const columns = (inspection.indexColumns?.[name] ?? [])
        .slice()
        .sort((left, right) => Number(left.seqno) - Number(right.seqno))
        .map((column) => column.name);
      structureValid &&=
        Number(index?.unique) === expected.unique &&
        Number(index?.partial) === expected.partial &&
        sameStrings(columns, expected.columns);
    }
    const sessionForeignKeys = inspection.sessionForeignKeys ?? [];
    structureValid &&=
      sessionForeignKeys.length === 1 &&
      sessionForeignKeys[0]?.table === "accounts" &&
      sessionForeignKeys[0]?.from === "account_id" &&
      sessionForeignKeys[0]?.to === "id" &&
      String(sessionForeignKeys[0]?.on_delete).toUpperCase() === "CASCADE";
    structureValid &&=
      typeof inspection.abuseRateLimitSql === "string" &&
      inspection.abuseRateLimitSql.includes("'auth_login_network'") &&
      inspection.abuseRateLimitSql.includes("'auth_callback_network'");
  }

  const foreignKeysValid =
    Array.isArray(inspection?.foreignKeysEnabled) &&
    inspection.foreignKeysEnabled.length === 1 &&
    Number(inspection.foreignKeysEnabled[0]?.foreign_keys) === 1 &&
    Array.isArray(inspection?.foreignKeyViolations) &&
    inspection.foreignKeyViolations.length === 0;
  return Object.freeze(
    [
      ...(structureValid ? [] : [PREFLIGHT_BLOCKER_IDS.local.migration0011]),
      ...(foreignKeysValid ? [] : [PREFLIGHT_BLOCKER_IDS.local.foreignKeys]),
    ].sort(),
  );
}

export async function executePrivateSuccessorPreflight({
  projectRoot = process.cwd(),
  argumentsList = [],
  environmentNames = [],
  writeManifest = true,
} = {}) {
  assertLocalOnlyPreflightInvocation({ argumentsList, environmentNames });
  const localResult = await runIsolatedDirectD1Preflight({ projectRoot });
  const readiness = buildPrivateSuccessorReadiness({
    containmentBlockers: [],
    localBlockers: localResult.localBlockers,
  });
  const manifest = buildPrivateSuccessorManifest({
    migrationInventory: localResult.migrationInventory,
    readiness,
  });
  const outputPath = writeManifest
    ? await writePrivateSuccessorManifest({ projectRoot, manifest })
    : null;
  return Object.freeze({
    localReady: readiness.local.ready,
    releaseReady: readiness.release.ready,
    outputPath,
    manifest,
  });
}

async function migrationFileMap(directory) {
  const details = await lstat(directory).catch(() => null);
  if (!details?.isDirectory() || details.isSymbolicLink()) {
    throw invalidMigrationInventory();
  }
  const files = new Map();
  await walkMigrationDirectory(directory, directory, files);
  if (files.size === 0) throw invalidMigrationInventory();
  return files;
}

async function walkMigrationDirectory(root, directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
    if (entry.isSymbolicLink()) throw invalidMigrationInventory();
    if (entry.isDirectory()) {
      if (relativePath !== "meta") throw invalidMigrationInventory();
      await walkMigrationDirectory(root, absolutePath, files);
      continue;
    }
    if (
      !entry.isFile() ||
      !/^(?:[0-9]{4}_[A-Za-z0-9_]+\.sql|meta\/(?:_journal|[0-9]{4}_snapshot)\.json)$/.test(
        relativePath,
      )
    ) {
      throw invalidMigrationInventory();
    }
    const contents = await readFile(absolutePath);
    if (contents.byteLength === 0) throw invalidMigrationInventory();
    files.set(relativePath, contents);
  }
}

function assertMigrationJournal(journal, packaged) {
  if (
    !journal ||
    journal.dialect !== "sqlite" ||
    !Array.isArray(journal.entries) ||
    journal.entries.length !== EXPECTED_LATEST_MIGRATION.index + 1
  ) {
    throw invalidMigrationInventory();
  }
  const tags = new Set();
  for (let index = 0; index < journal.entries.length; index += 1) {
    const entry = journal.entries[index];
    if (
      entry?.idx !== index ||
      typeof entry.tag !== "string" ||
      !new RegExp(`^${String(index).padStart(4, "0")}_[A-Za-z0-9_]+$`).test(entry.tag) ||
      entry.tag !== PRIVATE_SUCCESSOR_EXPECTED_MIGRATION_TAGS[index] ||
      tags.has(entry.tag) ||
      !packaged.has(`${entry.tag}.sql`) ||
      !packaged.has(`meta/${String(index).padStart(4, "0")}_snapshot.json`)
    ) {
      throw invalidMigrationInventory();
    }
    tags.add(entry.tag);
    try {
      const snapshot = JSON.parse(
        packaged
          .get(`meta/${String(index).padStart(4, "0")}_snapshot.json`)
          .toString("utf8"),
      );
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new Error("invalid snapshot");
      }
    } catch {
      throw invalidMigrationInventory();
    }
  }
  const latest = journal.entries.at(-1);
  if (
    latest.idx !== EXPECTED_LATEST_MIGRATION.index ||
    latest.tag !== EXPECTED_LATEST_MIGRATION.tag
  ) {
    throw invalidMigrationInventory();
  }
  const expectedPaths = [
    ...PRIVATE_SUCCESSOR_EXPECTED_MIGRATION_TAGS.map((tag) => `${tag}.sql`),
    ...PRIVATE_SUCCESSOR_EXPECTED_MIGRATION_TAGS.map(
      (_tag, index) => `meta/${String(index).padStart(4, "0")}_snapshot.json`,
    ),
    "meta/_journal.json",
  ].sort();
  if (!sameStrings([...packaged.keys()].sort(), expectedPaths)) {
    throw invalidMigrationInventory();
  }
}

async function allRows(database, sql) {
  const result = await database.prepare(sql).all();
  return Array.isArray(result.results) ? result.results : [];
}

function normalizedDefault(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return /^\(?1\)?$/.test(normalized) ? "1" : normalized;
}

function sha256Buffer(value) {
  return sha256(value);
}

async function removeOwnedTemporaryDirectory(temporaryRoot) {
  const resolvedRoot = path.resolve(temporaryRoot);
  const resolvedSystemTemp = path.resolve(tmpdir());
  if (
    !resolvedRoot.startsWith(`${resolvedSystemTemp}${path.sep}`) ||
    !path.basename(resolvedRoot).startsWith(TEMP_DIRECTORY_PREFIX)
  ) {
    throw new Error("Refusing to remove an unowned preflight temporary directory.");
  }
  await rm(resolvedRoot, { recursive: true, force: true });
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalidMigrationInventory() {
  return preflightError(
    PREFLIGHT_BLOCKER_IDS.local.migrationInventory,
    "The packaged migration inventory is invalid.",
  );
}

function preflightError(blockerId, message) {
  return new DirectPreflightContractError(blockerId, message);
}

async function main() {
  try {
    const result = await executePrivateSuccessorPreflight({
      projectRoot: process.cwd(),
      argumentsList: process.argv.slice(2),
      environmentNames: Object.keys(process.env),
    });
    if (!result.localReady) {
      process.stderr.write("Private-successor local D1 preflight failed closed.\n");
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      "Private-successor local D1 preflight passed; provider and release readiness remain blocked.\n",
    );
  } catch (error) {
    const blockerId =
      error instanceof DirectPreflightContractError
        ? error.blockerId
        : PREFLIGHT_BLOCKER_IDS.local.migrationApply;
    process.stderr.write(`Private-successor local D1 preflight failed: ${blockerId}.\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
