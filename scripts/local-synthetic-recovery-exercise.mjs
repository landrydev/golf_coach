import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import {
  identityHeaders,
  startD1Worker,
} from "../tests/support/d1-worker.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerEntry = resolve(
  projectRoot,
  "node_modules/wrangler/bin/wrangler.js",
);
const evidenceLabel =
  "LOCAL SYNTHETIC EVIDENCE \u2014 NOT HOSTED BACKUP/RESTORE EVIDENCE";
const baseTimestamp = 1_786_000_000_000;
const recoveryNormalizationTimestamp = baseTimestamp + 500_000;
const authoritativeLifecycleTables = [
  "accounts",
  "assessments",
  "audit_events",
  "billing_checkout_attempts",
  "billing_customers",
  "billing_events",
  "billing_reconciliation_targets",
  "billing_subscription_projection_generations",
  "coaching_packages",
  "consent_records",
  "data_requests",
  "development_plans",
  "evidence_items",
  "golfer_goals",
  "golfer_plan_responses",
  "golfers",
  "instructor_sessions",
  "instructor_profiles",
  "lessons",
  "media_assets",
  "phase_priorities",
  "phase_review_evidence",
  "phase_reviews",
  "plan_phases",
  "plan_priorities",
  "practice_items",
  "share_links",
  "share_sessions",
  "subscriptions",
];
const operationalStateTables = [
  "abuse_rate_limits",
  "billing_account_operation_leases",
  "oidc_login_transactions",
  "scheduler_heartbeat",
];
const coveredSchemaTables = [
  ...authoritativeLifecycleTables,
  ...operationalStateTables,
].sort();
const recoveryMutatedTables = new Set([
  "abuse_rate_limits",
  "accounts",
  "billing_account_operation_leases",
  "billing_events",
  "billing_reconciliation_targets",
  "instructor_sessions",
  "oidc_login_transactions",
  "scheduler_heartbeat",
]);
const expectedTableRowCounts = {
  abuse_rate_limits: 2,
  accounts: 2,
  assessments: 2,
  audit_events: 4,
  billing_account_operation_leases: 2,
  billing_checkout_attempts: 2,
  billing_customers: 2,
  billing_events: 2,
  billing_reconciliation_targets: 2,
  billing_subscription_projection_generations: 2,
  coaching_packages: 2,
  consent_records: 3,
  data_requests: 2,
  development_plans: 2,
  evidence_items: 2,
  golfer_goals: 2,
  golfer_plan_responses: 2,
  golfers: 2,
  instructor_sessions: 3,
  instructor_profiles: 2,
  lessons: 2,
  media_assets: 2,
  oidc_login_transactions: 2,
  phase_priorities: 2,
  phase_review_evidence: 1,
  phase_reviews: 1,
  plan_phases: 3,
  plan_priorities: 2,
  practice_items: 2,
  scheduler_heartbeat: 1,
  share_links: 3,
  share_sessions: 3,
  subscriptions: 2,
};
const WRANGLER_PARENT_ENV_ALLOWLIST =
  process.platform === "win32" ? ["SystemRoot", "WINDIR"] : [];
const SECRET_ENVIRONMENT_PROBES = [
  "CLOUDFLARE_API_TOKEN",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "SIWC_BYPASS_TOKEN",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

const objectFixtures = [
  {
    accountId: "acct-alpha",
    body: Buffer.from(
      "Synthetic recovery media for tenant alpha. No customer data.\n",
      "utf8",
    ),
    contentType: "text/plain; charset=utf-8",
    key: "private/acct-alpha/media/swing-note.txt",
    purpose: "media",
  },
  {
    accountId: "acct-alpha",
    body: Buffer.from(
      JSON.stringify({
        accountId: "acct-alpha",
        requestId: "request-alpha-export",
        synthetic: true,
      }),
      "utf8",
    ),
    contentType: "application/json",
    key: "private/acct-alpha/exports/request-alpha-export.json",
    purpose: "data_request_export",
  },
  {
    accountId: "acct-beta",
    body: Buffer.from(
      "Synthetic recovery media for tenant beta. No customer data.\n",
      "utf8",
    ),
    contentType: "text/plain; charset=utf-8",
    key: "private/acct-beta/media/tempo-note.txt",
    purpose: "media",
  },
].map((fixture) => ({
  ...fixture,
  byteSize: fixture.body.byteLength,
  sha256: sha256(fixture.body),
}));

const baseVerificationStatements = [
  "pragma foreign_key_check",
  `select
     (select count(*) from accounts) as accounts,
     (select count(*) from golfers) as golfers,
     (select count(*) from development_plans) as plans,
     (select count(*) from share_links) as share_links,
     (select count(*) from share_sessions) as share_sessions,
     (select count(*) from audit_events) as audit_events,
     (select count(*) from data_requests) as data_requests,
     (select count(*) from subscriptions) as subscriptions,
     (select count(*) from media_assets) as media_assets,
     (select count(*) from oidc_login_transactions) as oidc_login_transactions,
     (select count(*) from instructor_sessions) as instructor_sessions`,
  `select id, account_id, status, revision, approved_revision,
          published_revision
     from development_plans
    order by account_id, id`,
  `select id, account_id, plan_id, status, plan_revision,
          case when revoked_at is null then 0 else 1 end as is_revoked,
          revoke_reason
     from share_links
    order by account_id, id`,
  `select id, account_id, share_link_id,
          case when revoked_at is null then 0 else 1 end as is_revoked,
          revoke_reason
     from share_sessions
    order by account_id, id`,
  `select id, account_id, action, target_type, target_id, outcome,
          request_id, occurred_at
     from audit_events
    order by occurred_at, id`,
  `select id, account_id, golfer_id, request_type, requested_by_type,
          status, export_object_key, export_sha256,
          case when fulfilled_at is null then 0 else 1 end as is_fulfilled
     from data_requests
    order by account_id, id`,
  `select s.id, s.account_id, s.provider_customer_id,
          s.provider_subscription_id, s.provider_price_id, s.product_code,
          s.status, s.billing_interval, s.currency, s.unit_amount_minor,
          s.projection_revision, g.generation
     from subscriptions s
     join billing_subscription_projection_generations g
       on g.provider = s.provider
      and g.provider_subscription_id = s.provider_subscription_id
    order by s.account_id, s.id`,
  `select sum(violation_count) as violation_count
     from (
       select count(*) as violation_count
         from development_plans p
         join golfers g on g.id = p.golfer_id
        where g.account_id <> p.account_id
       union all
       select count(*)
         from share_links l
         join development_plans p on p.id = l.plan_id
        where p.account_id <> l.account_id
       union all
       select count(*)
         from share_sessions s
         join share_links l on l.id = s.share_link_id
        where l.account_id <> s.account_id
       union all
       select count(*)
         from data_requests r
         join golfers g on g.id = r.golfer_id
        where g.account_id <> r.account_id
       union all
       select count(*)
         from subscriptions s
         join billing_customers c
           on c.provider = s.provider
          and c.provider_customer_id = s.provider_customer_id
        where c.account_id <> s.account_id
     )`,
  `select id, account_id, object_key, status, byte_size, content_sha256
     from media_assets
    order by account_id, id`,
];

let workDirectory;
let sourceR2;
let restoredR2;
let restoredApplication;
const exerciseStartedAt = Date.now();

try {
  workDirectory = await mkdtemp(join(tmpdir(), "roadmap-recovery-exercise-"));
  const sourceProject = join(workDirectory, "d1-source");
  const restoredProject = join(workDirectory, "d1-restored");
  const sourceConfigPath = join(sourceProject, "wrangler.jsonc");
  const restoredConfigPath = join(restoredProject, "wrangler.jsonc");
  const snapshotPath = join(workDirectory, "d1-logical-snapshot.sql");
  const fixtureSqlPath = join(workDirectory, "synthetic-fixture.sql");
  const normalizationSqlPath = join(
    workDirectory,
    "post-restore-normalization.sql",
  );

  await Promise.all([
    mkdir(sourceProject, { recursive: true }),
    mkdir(restoredProject, { recursive: true }),
    mkdir(join(workDirectory, "subprocess-home"), { recursive: true }),
    mkdir(join(workDirectory, "subprocess-temp"), { recursive: true }),
    mkdir(join(workDirectory, "xdg-config"), { recursive: true }),
  ]);
  await assertWranglerEnvironmentIsolation(workDirectory);
  const localConfig = buildLocalConfig();
  await Promise.all([
    writeFile(sourceConfigPath, localConfig, "utf8"),
    writeFile(restoredConfigPath, localConfig, "utf8"),
  ]);

  const migrationPlan = await readMigrationPlan();
  for (const migrationPath of migrationPlan.paths) {
    await executeD1File(sourceConfigPath, migrationPath);
  }

  await writeFile(fixtureSqlPath, buildFixtureSql(), "utf8");
  await executeD1File(sourceConfigPath, fixtureSqlPath);
  const sourceState = await inspectD1(
    sourceConfigPath,
    migrationPlan.schemaTables,
  );
  assertRepresentativeState(sourceState);

  await runWrangler(
    [
      "d1",
      "export",
      "DB",
      "--config",
      sourceConfigPath,
      "--local",
      "--output",
      snapshotPath,
      "--no-schema",
      "--skip-confirmation",
    ],
    sourceProject,
  );

  const snapshot = await readFile(snapshotPath);
  assert.ok(snapshot.byteLength > 1_000, "D1 logical snapshot is unexpectedly small");

  for (const migrationPath of migrationPlan.paths) {
    await executeD1File(restoredConfigPath, migrationPath);
  }
  await executeD1File(restoredConfigPath, snapshotPath);
  const restoredState = await inspectD1(
    restoredConfigPath,
    migrationPlan.schemaTables,
  );
  assertRepresentativeState(restoredState);
  assert.deepEqual(
    restoredState,
    sourceState,
    "restored D1 invariants differ from the synthetic source",
  );

  const d1NegativeScenarios = await exerciseModifiedSnapshotDetection(
    workDirectory,
    migrationPlan,
    snapshot,
    sourceState,
  );
  const r2Result = await exerciseR2(workDirectory, restoredState);
  // Miniflare's local proxy layer is exercised one runtime group at a time.
  // Materialize only the already-verified synthetic restored objects, then
  // close both R2 exercise runtimes before booting the exact application.
  await disposeLocalRuntime(restoredR2);
  restoredR2 = undefined;
  await disposeLocalRuntime(sourceR2);
  sourceR2 = undefined;

  await writeFile(
    normalizationSqlPath,
    buildRecoveryNormalizationSql(),
    "utf8",
  );
  await executeD1File(restoredConfigPath, normalizationSqlPath);
  const normalizedState = await inspectD1(
    restoredConfigPath,
    migrationPlan.schemaTables,
  );
  assertRepresentativeState(normalizedState, { recoveryNormalized: true });
  assertNormalizationWasBounded(restoredState, normalizedState);
  const applicationResult = await exerciseRestoredApplication(
    snapshot,
    r2Result.applicationObjects,
  );

  const runtimeVersions = await readRuntimeVersions();
  const evidenceRecord = buildEvidenceRecord({
    durationMs: Date.now() - exerciseStartedAt,
    migrationPlan,
    negativeScenarios: [
      ...d1NegativeScenarios,
      ...r2Result.negativeScenarios,
    ],
    r2Result,
    runtimeVersions,
    snapshot,
    applicationResult,
  });
  assertPrivacySafeEvidenceRecord(evidenceRecord);

  console.log(evidenceLabel);
  console.log(
    `PASS D1: ${migrationPlan.paths.length} migrations applied to each isolated database, ${expectedTableRowCounts.accounts} tenants, ${coveredSchemaTables.length}/${migrationPlan.schemaTables.length} application tables covered, data snapshot ${snapshot.byteLength} bytes (${sha256(snapshot)}).`,
  );
  console.log(
    "PASS D1 invariants: every column of every populated application table, foreign keys, tenant ownership, lifecycle state, audit order, data-request state, and billing projections survived restore.",
  );
  console.log(
    "PASS post-restore normalization: every restored OIDC transaction was deleted, every restored instructor session was revoked and identity-version fenced, in-flight billing/scheduler work was made retry-safe, and expired rate-limit state was removed.",
  );
  console.log(
    `PASS local R2-compatible restore: ${r2Result.objectCount} private synthetic objects, ${r2Result.totalBytes} bytes, inventory and SHA-256 checks match D1 metadata.`,
  );
  console.log(
    "PASS restored application runtime: the exact built Worker booted against the normalized D1 snapshot and restored R2-compatible objects, then served authenticated profile, package, and workspace reads plus the expected degraded scheduler health state.",
  );
  console.log(
    `PASS negative integrity checks: ${evidenceRecord.negativeIntegrityScenarios.length} modified-snapshot, missing-object, and checksum-mismatch scenarios were detected.`,
  );
  console.log(
    `PASS subprocess isolation: Wrangler received generated HOME/config/temp values and only the ${WRANGLER_PARENT_ENV_ALLOWLIST.length ? WRANGLER_PARENT_ENV_ALLOWLIST.join("/") : "empty"} non-secret parent allowlist; secret-shaped probe variables were absent.`,
  );
  console.log(
    "Temporary exercise data remained isolated from hosted resources and is removed on exit. No RPO, RTO, hosted backup, or production restore claim is established.",
  );
  console.log(`RECOVERY_EVIDENCE_JSON ${JSON.stringify(evidenceRecord)}`);
} finally {
  // Miniflare teardown uses internal proxy clients. Dispose independently and
  // in dependency order so one instance cannot be torn down while another
  // instance is still finishing a proxied response or object copy.
  await disposeLocalRuntime(restoredApplication);
  await disposeLocalRuntime(restoredR2);
  await disposeLocalRuntime(sourceR2);
  if (workDirectory) {
    await rm(workDirectory, { force: true, recursive: true });
  }
}

async function disposeLocalRuntime(runtime) {
  if (!runtime) return;
  try {
    await runtime.dispose();
  } catch {
    // Cleanup must not replace the exercise's authoritative assertion error.
  }
}

async function readMigrationPlan() {
  const journal = JSON.parse(
    await readFile(resolve(projectRoot, "drizzle/meta/_journal.json"), "utf8"),
  );
  const entries = [...journal.entries].sort((left, right) => left.idx - right.idx);
  assert.ok(entries.length > 0, "migration journal is empty");
  entries.forEach((entry, index) => {
    assert.equal(entry.idx, index, "migration journal indexes must be contiguous");
  });
  const lastEntry = entries.at(-1);
  const snapshotName = `${lastEntry.tag.split("_", 1)[0]}_snapshot.json`;
  const snapshotModel = JSON.parse(
    await readFile(
      resolve(projectRoot, "drizzle/meta", snapshotName),
      "utf8",
    ),
  );
  const schemaTables = Object.values(snapshotModel.tables)
    .map((table) => {
      const columns = Object.values(table.columns).map((column) => ({
        name: column.name,
        primaryKey: column.primaryKey === true,
      }));
      const compositePrimaryKeyColumns = Object.values(
        table.compositePrimaryKeys ?? {},
      ).flatMap((primaryKey) => primaryKey.columns);
      const orderColumns = [
        ...new Set([
          ...columns
            .filter((column) => column.primaryKey)
            .map((column) => column.name),
          ...compositePrimaryKeyColumns,
        ]),
      ];
      return {
        columns: columns.map((column) => column.name),
        name: table.name,
        orderColumns:
          orderColumns.length > 0
            ? orderColumns
            : columns.map((column) => column.name),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  assert.deepEqual(
    schemaTables.map((table) => table.name),
    coveredSchemaTables,
    "every application schema table must be explicitly classified for recovery",
  );
  return {
    journalVersion: String(journal.version),
    lastMigrationTag: lastEntry.tag,
    paths: entries.map((entry) =>
      resolve(projectRoot, "drizzle", `${entry.tag}.sql`),
    ),
    schemaSnapshot: snapshotName,
    schemaTables,
  };
}

function buildLocalConfig() {
  return `${JSON.stringify(
    {
      name: "roadmap-local-synthetic-recovery",
      compatibility_date: "2026-08-07",
      d1_databases: [
        {
          binding: "DB",
          database_name: "roadmap-local-synthetic-recovery",
          database_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    },
    null,
    2,
  )}\n`;
}

async function executeD1File(configPath, filePath) {
  try {
    await runWrangler(
      [
        "d1",
        "execute",
        "DB",
        "--config",
        configPath,
        "--local",
        "--file",
        filePath,
        "--yes",
      ],
      dirname(configPath),
    );
  } catch (error) {
    throw new Error(
      `failed to apply ${relative(projectRoot, filePath)}: ${error.message}`,
      { cause: error },
    );
  }
}

async function inspectD1(configPath, schemaTables) {
  const operations = [];
  const verificationStatements = [
    ...baseVerificationStatements,
    ...buildCanonicalTableStateQueries(schemaTables),
  ];
  // Execute each read independently because Wrangler's local JSON output may
  // elide result sets from a multi-statement command.
  for (const statement of verificationStatements) {
    const output = await runWrangler(
      [
        "d1",
        "execute",
        "DB",
        "--config",
        configPath,
        "--local",
        "--command",
        statement,
        "--json",
      ],
      dirname(configPath),
    );
    const results = JSON.parse(output);
    assert.equal(results.length, 1, "unexpected D1 verification result count");
    operations.push(results[0]);
  }
  for (const operation of operations) {
    assert.equal(operation.success, true, "a D1 verification query failed");
  }
  return operations.map((operation) => operation.results);
}

function buildCanonicalTableStateQueries(schemaTables) {
  const tableBatches = [];
  for (let index = 0; index < schemaTables.length; index += 4) {
    tableBatches.push(schemaTables.slice(index, index + 4));
  }
  return tableBatches.map((tableBatch) =>
    buildCanonicalTableStateQuery(tableBatch),
  );
}

function buildCanonicalTableStateQuery(schemaTables) {
  return `${schemaTables
    .map((table) => {
      const tableIdentifier = sqlIdentifier(table.name);
      const rowExpression = `json_object(${table.columns
        .flatMap((column) => [sqlValue(column), sqlIdentifier(column)])
        .join(", ")})`;
      const orderExpression = table.orderColumns
        .map((column) => sqlIdentifier(column))
        .join(", ");
      return `select ${sqlValue(table.name)} as table_name,
        (select json_group_array(json(row_json))
           from (
             select ${rowExpression} as row_json
               from ${tableIdentifier}
              order by ${orderExpression}
           )) as rows_json`;
    })
    .join("\nunion all\n")}
order by table_name`;
}

function sqlIdentifier(identifier) {
  assert.match(identifier, /^[a-z][a-z0-9_]*$/u, "unsafe SQL identifier");
  return `"${identifier}"`;
}

function assertRepresentativeState(
  state,
  { recoveryNormalized = false } = {},
) {
  assert.deepEqual(state[0], [], "D1 foreign-key integrity check failed");
  assert.deepEqual(state[1], [
    {
      accounts: 2,
      golfers: 2,
      plans: 2,
      share_links: 3,
      share_sessions: 3,
      audit_events: 4,
      data_requests: 2,
      subscriptions: 2,
      media_assets: 2,
      oidc_login_transactions: recoveryNormalized ? 0 : 2,
      instructor_sessions: 3,
    },
  ]);
  assert.deepEqual(state[2], [
    {
      id: "plan-alpha",
      account_id: "acct-alpha",
      status: "published",
      revision: 3,
      approved_revision: 3,
      published_revision: 3,
    },
    {
      id: "plan-beta",
      account_id: "acct-beta",
      status: "published",
      revision: 2,
      approved_revision: 2,
      published_revision: 2,
    },
  ]);
  assert.deepEqual(state[3], [
    {
      id: "share-alpha-active",
      account_id: "acct-alpha",
      plan_id: "plan-alpha",
      status: "active",
      plan_revision: 3,
      is_revoked: 0,
      revoke_reason: null,
    },
    {
      id: "share-alpha-revoked",
      account_id: "acct-alpha",
      plan_id: "plan-alpha",
      status: "revoked",
      plan_revision: 2,
      is_revoked: 1,
      revoke_reason: "synthetic_rotation",
    },
    {
      id: "share-beta-active",
      account_id: "acct-beta",
      plan_id: "plan-beta",
      status: "active",
      plan_revision: 2,
      is_revoked: 0,
      revoke_reason: null,
    },
  ]);
  assert.deepEqual(state[4], [
    {
      id: "session-alpha-active",
      account_id: "acct-alpha",
      share_link_id: "share-alpha-active",
      is_revoked: 0,
      revoke_reason: null,
    },
    {
      id: "session-alpha-revoked",
      account_id: "acct-alpha",
      share_link_id: "share-alpha-revoked",
      is_revoked: 1,
      revoke_reason: "parent_capability_revoked",
    },
    {
      id: "session-beta-active",
      account_id: "acct-beta",
      share_link_id: "share-beta-active",
      is_revoked: 0,
      revoke_reason: null,
    },
  ]);
  assert.deepEqual(
    state[5].map((event) => event.id),
    ["audit-alpha-publish", "audit-alpha-revoke", "audit-beta-request", "audit-beta-billing"],
    "audit continuity/order changed",
  );
  assert.ok(
    state[5].every(
      (event, index, events) =>
        index === 0 || event.occurred_at > events[index - 1].occurred_at,
    ),
    "audit timestamps are not strictly increasing",
  );
  assert.deepEqual(
    state[6].map(({ id, account_id, request_type, status, is_fulfilled }) => ({
      id,
      account_id,
      request_type,
      status,
      is_fulfilled,
    })),
    [
      {
        id: "request-alpha-export",
        account_id: "acct-alpha",
        request_type: "export",
        status: "in_progress",
        is_fulfilled: 0,
      },
      {
        id: "request-beta-deletion",
        account_id: "acct-beta",
        request_type: "deletion",
        status: "fulfilled",
        is_fulfilled: 1,
      },
    ],
  );
  assert.deepEqual(
    state[7].map(
      ({ id, account_id, status, projection_revision, generation }) => ({
        id,
        account_id,
        status,
        projection_revision,
        generation,
      }),
    ),
    [
      {
        id: "subscription-alpha",
        account_id: "acct-alpha",
        status: "active",
        projection_revision: 4,
        generation: 4,
      },
      {
        id: "subscription-beta",
        account_id: "acct-beta",
        status: "paused",
        projection_revision: 7,
        generation: 7,
      },
    ],
  );
  assert.deepEqual(state[8], [{ violation_count: 0 }]);
  assert.equal(state[9].length, 2);

  const rowsByTable = canonicalRowsByTable(state);
  assert.deepEqual(
    [...rowsByTable.keys()].sort(),
    coveredSchemaTables,
    "canonical restore inspection did not return every covered table",
  );
  for (const [tableName, expectedCount] of Object.entries(
    expectedTableRowCounts,
  )) {
    const normalizedExpectedCount = recoveryNormalized
      ? tableName === "abuse_rate_limits"
        ? 1
        : tableName === "oidc_login_transactions"
          ? 0
          : expectedCount
      : expectedCount;
    assert.equal(
      rowsByTable.get(tableName).length,
      normalizedExpectedCount,
      `unexpected representative row count for ${tableName}`,
    );
  }

  const betaLease = findCanonicalRow(
    rowsByTable,
    "billing_account_operation_leases",
    "account_id",
    "acct-beta",
  );
  const betaEvent = findCanonicalRow(
    rowsByTable,
    "billing_events",
    "id",
    "billing-event-beta-processing",
  );
  const betaReconciliation = findCanonicalRow(
    rowsByTable,
    "billing_reconciliation_targets",
    "id",
    "reconciliation-beta-processing",
  );
  const scheduler = rowsByTable.get("scheduler_heartbeat")[0];
  const rateLimits = rowsByTable.get("abuse_rate_limits");
  const accounts = rowsByTable.get("accounts");
  const instructorSessions = rowsByTable.get("instructor_sessions");
  const oidcTransactions = rowsByTable.get("oidc_login_transactions");

  if (!recoveryNormalized) {
    assert.equal(betaLease.state, "held");
    assert.equal(betaLease.operation, "reconciliation");
    assert.ok(betaLease.lease_token);
    assert.ok(betaLease.lease_expires_at);
    assert.equal(betaEvent.status, "processing");
    assert.ok(betaEvent.lease_token);
    assert.ok(betaEvent.lease_expires_at);
    assert.equal(betaReconciliation.state, "processing");
    assert.ok(betaReconciliation.lease_token);
    assert.ok(betaReconciliation.lease_expires_at);
    assert.equal(scheduler.state, "running");
    assert.equal(scheduler.completed_at, null);
    assert.equal(rateLimits.length, 2);
    assert.ok(accounts.every((account) => account.identity_version === 1));
    assert.deepEqual(
      oidcTransactions.map(({ state_hash, consumed_at }) => ({
        state_hash,
        consumed_at,
      })),
      [
        { state_hash: "9".repeat(64), consumed_at: null },
        { state_hash: "a".repeat(64), consumed_at: baseTimestamp + 30 },
      ],
    );
    assert.deepEqual(
      instructorSessions.map(({ id, revoked_at, revoke_reason }) => ({
        id,
        revoked_at,
        revoke_reason,
      })),
      [
        { id: "auth-session-alpha-live", revoked_at: null, revoke_reason: null },
        {
          id: "auth-session-alpha-revoked",
          revoked_at: baseTimestamp + 40,
          revoke_reason: "synthetic_prior_revocation",
        },
        { id: "auth-session-beta-expired", revoked_at: null, revoke_reason: null },
      ],
    );
    return;
  }

  assert.deepEqual(
    {
      lastReleasedAt: betaLease.last_released_at,
      leaseExpiresAt: betaLease.lease_expires_at,
      leaseToken: betaLease.lease_token,
      operation: betaLease.operation,
      state: betaLease.state,
    },
    {
      lastReleasedAt: recoveryNormalizationTimestamp,
      leaseExpiresAt: null,
      leaseToken: null,
      operation: null,
      state: "idle",
    },
  );
  assert.deepEqual(
    {
      errorCode: betaEvent.last_error_code,
      leaseExpiresAt: betaEvent.lease_expires_at,
      leaseToken: betaEvent.lease_token,
      status: betaEvent.status,
    },
    {
      errorCode: "restore_recovered_inflight",
      leaseExpiresAt: null,
      leaseToken: null,
      status: "failed",
    },
  );
  assert.deepEqual(
    {
      errorCode: betaReconciliation.last_error_code,
      lastCompletedAt: betaReconciliation.last_completed_at,
      leaseExpiresAt: betaReconciliation.lease_expires_at,
      leaseToken: betaReconciliation.lease_token,
      nextAttemptAt: betaReconciliation.next_automatic_attempt_at,
      state: betaReconciliation.state,
    },
    {
      errorCode: "restore_recovered_inflight",
      lastCompletedAt: recoveryNormalizationTimestamp,
      leaseExpiresAt: null,
      leaseToken: null,
      nextAttemptAt: recoveryNormalizationTimestamp,
      state: "failed",
    },
  );
  assert.deepEqual(
    {
      completedAt: scheduler.completed_at,
      failureCode: scheduler.last_failure_code,
      state: scheduler.state,
    },
    {
      completedAt: recoveryNormalizationTimestamp,
      failureCode: "restore_inflight_interrupted",
      state: "failed",
    },
  );
  assert.equal(rateLimits.length, 1);
  assert.equal(rateLimits[0].scope, "billing_portal_account");
  assert.ok(
    rateLimits[0].window_expires_at > recoveryNormalizationTimestamp,
    "the active rate-limit window was not preserved",
  );
  assert.equal(oidcTransactions.length, 0);
  assert.ok(accounts.every((account) => account.identity_version === 2));
  assert.deepEqual(
    instructorSessions.map(
      ({ id, identity_version, revoked_at, revoke_reason }) => ({
        id,
        identity_version,
        revoked_at,
        revoke_reason,
      }),
    ),
    [
      {
        id: "auth-session-alpha-live",
        identity_version: 1,
        revoked_at: recoveryNormalizationTimestamp,
        revoke_reason: "restore_session_invalidation",
      },
      {
        id: "auth-session-alpha-revoked",
        identity_version: 1,
        revoked_at: baseTimestamp + 40,
        revoke_reason: "synthetic_prior_revocation",
      },
      {
        id: "auth-session-beta-expired",
        identity_version: 1,
        revoked_at: recoveryNormalizationTimestamp,
        revoke_reason: "restore_session_invalidation",
      },
    ],
  );
}

function canonicalRowsByTable(state) {
  const canonicalState = state.slice(baseVerificationStatements.length).flat();
  assert.equal(
    canonicalState.length,
    coveredSchemaTables.length,
    "canonical table-state result count changed",
  );
  return new Map(
    canonicalState.map(({ rows_json, table_name: tableName }) => {
      const rows = JSON.parse(rows_json);
      assert.ok(Array.isArray(rows), `canonical state is not an array: ${tableName}`);
      return [tableName, rows];
    }),
  );
}

function findCanonicalRow(rowsByTable, tableName, columnName, value) {
  const row = rowsByTable
    .get(tableName)
    .find((candidate) => candidate[columnName] === value);
  assert.ok(row, `missing representative ${tableName} row`);
  return row;
}

function assertNormalizationWasBounded(rawState, normalizedState) {
  const rawRows = canonicalRowsByTable(rawState);
  const normalizedRows = canonicalRowsByTable(normalizedState);
  for (const tableName of coveredSchemaTables) {
    if (recoveryMutatedTables.has(tableName)) continue;
    assert.deepEqual(
      normalizedRows.get(tableName),
      rawRows.get(tableName),
      `post-restore normalization unexpectedly changed ${tableName}`,
    );
  }
}

async function exerciseModifiedSnapshotDetection(
  root,
  migrationPlan,
  snapshot,
  sourceState,
) {
  const projectPath = join(root, "d1-modified-snapshot");
  const configPath = join(projectPath, "wrangler.jsonc");
  const modifiedSnapshotPath = join(projectPath, "modified-snapshot.sql");
  await mkdir(projectPath, { recursive: true });
  await Promise.all([
    writeFile(configPath, buildLocalConfig(), "utf8"),
    writeFile(
      modifiedSnapshotPath,
      `${snapshot.toString("utf8")}\nupdate development_plans
          set revision = revision + 1
        where id = 'plan-beta';\n`,
      "utf8",
    ),
  ]);
  for (const migrationPath of migrationPlan.paths) {
    await executeD1File(configPath, migrationPath);
  }
  await executeD1File(configPath, modifiedSnapshotPath);
  const modifiedState = await inspectD1(configPath, migrationPlan.schemaTables);
  assert.deepEqual(
    modifiedState[0],
    [],
    "modified-snapshot fixture unexpectedly broke foreign keys",
  );
  assert.throws(
    () =>
      assert.deepEqual(
        modifiedState,
        sourceState,
        "modified D1 snapshot was not detected",
      ),
    { name: "AssertionError" },
  );
  assert.throws(
    () => assertRepresentativeState(modifiedState),
    { name: "AssertionError" },
    "representative invariant checks accepted a modified snapshot",
  );
  return [
    {
      id: "d1_modified_snapshot_detected",
      passed: true,
    },
  ];
}

function buildRecoveryNormalizationStatements() {
  return [
    "delete from oidc_login_transactions",
    `update instructor_sessions
   set revoked_at = ${recoveryNormalizationTimestamp},
       revoke_reason = 'restore_session_invalidation',
       updated_at = ${recoveryNormalizationTimestamp}
 where revoked_at is null`,
    `update accounts
   set identity_version = identity_version + 1,
       updated_at = ${recoveryNormalizationTimestamp}`,
    `update billing_account_operation_leases
   set state = 'idle',
       operation = null,
       lease_token = null,
       lease_expires_at = null,
       last_released_at = ${recoveryNormalizationTimestamp},
       updated_at = ${recoveryNormalizationTimestamp}
 where state = 'held'`,
    `update billing_events
   set status = 'failed',
       lease_token = null,
       lease_expires_at = null,
       last_error_code = 'restore_recovered_inflight',
       last_error_message = 'Synthetic restore interrupted in-flight processing; retry required.',
       updated_at = ${recoveryNormalizationTimestamp}
 where status = 'processing'`,
    `update billing_reconciliation_targets
   set state = 'failed',
       lease_token = null,
       lease_expires_at = null,
       automatic_failure_count = max(automatic_failure_count, 1),
       next_automatic_attempt_at = ${recoveryNormalizationTimestamp},
       automatic_dead_lettered_at = null,
       last_error_code = 'restore_recovered_inflight',
       last_error_message = 'Synthetic restore interrupted in-flight reconciliation; retry required.',
       last_completed_at = ${recoveryNormalizationTimestamp},
       updated_at = ${recoveryNormalizationTimestamp}
 where state = 'processing'`,
    `update scheduler_heartbeat
   set state = 'failed',
       completed_at = ${recoveryNormalizationTimestamp},
       billing_configured = null,
       considered_count = null,
       attempted_count = null,
       succeeded_count = null,
       failed_count = null,
       dead_letter_count = null,
       last_failure_code = 'restore_inflight_interrupted',
       updated_at = ${recoveryNormalizationTimestamp}
 where state = 'running'`,
    `delete from abuse_rate_limits
 where window_expires_at <= ${recoveryNormalizationTimestamp}`,
  ];
}

function buildRecoveryNormalizationSql() {
  return `${buildRecoveryNormalizationStatements().join(";\n\n")};\n`;
}

async function readRuntimeVersions() {
  const [applicationPackage, miniflarePackage, wranglerPackage] =
    await Promise.all([
      readJson(resolve(projectRoot, "package.json")),
      readJson(resolve(projectRoot, "node_modules/miniflare/package.json")),
      readJson(resolve(projectRoot, "node_modules/wrangler/package.json")),
    ]);
  assert.equal(
    miniflarePackage.version,
    applicationPackage.devDependencies.miniflare,
    "installed Miniflare version differs from the exact declaration",
  );
  assert.equal(
    wranglerPackage.version,
    applicationPackage.devDependencies.wrangler,
    "installed Wrangler version differs from the exact declaration",
  );
  return {
    application: applicationPackage.version,
    miniflare: miniflarePackage.version,
    node: process.version,
    wrangler: wranglerPackage.version,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function buildEvidenceRecord({
  applicationResult,
  durationMs,
  migrationPlan,
  negativeScenarios,
  r2Result,
  runtimeVersions,
  snapshot,
}) {
  assert.ok(
    negativeScenarios.length >= 3 &&
      negativeScenarios.every((scenario) => scenario.passed === true),
    "all negative integrity scenarios must be detected before evidence is emitted",
  );
  const schemaTableNames = migrationPlan.schemaTables.map((table) => table.name);
  const intentionallyExcludedSchemaTables = schemaTableNames.filter(
    (tableName) => !coveredSchemaTables.includes(tableName),
  );
  assert.deepEqual(intentionallyExcludedSchemaTables, []);
  return {
    evidenceClass: evidenceLabel,
    status: "pass",
    versions: {
      ...runtimeVersions,
      migrationCount: migrationPlan.paths.length,
      migrationJournal: migrationPlan.journalVersion,
      migrationTip: migrationPlan.lastMigrationTag,
      schemaSnapshot: migrationPlan.schemaSnapshot,
    },
    duration: {
      localExerciseWallClockMs: durationMs,
      interpretation: "Local wall-clock observation only; not an RTO measurement.",
    },
    relationalCoverage: {
      authoritativeLifecycleTables,
      coveredSchemaTableCount: coveredSchemaTables.length,
      intentionallyExcludedSchemaTables,
      operationalStateTables,
      populatedSchemaTableCount: Object.values(expectedTableRowCounts).filter(
        (count) => count > 0,
      ).length,
      schemaTableCount: schemaTableNames.length,
    },
    postRestoreNormalization: {
      activeRateLimitWindowsPreserved: true,
      expiredRateLimitWindowsRemoved: true,
      inFlightAccountLeasesReleased: true,
      inFlightBillingEventLeasesClearedForRetry: true,
      inFlightReconciliationLeasesClearedForRetry: true,
      runningSchedulerMarkedInterrupted: true,
    },
    objectCoverage: {
      checksumAlgorithm: "sha256",
      objectCount: r2Result.objectCount,
      totalBytes: r2Result.totalBytes,
    },
    restoredApplicationRuntime: applicationResult,
    snapshot: {
      byteSize: snapshot.byteLength,
      checksumAlgorithm: "sha256",
      sha256: sha256(snapshot),
    },
    negativeIntegrityScenarios: negativeScenarios.map(({ id, passed }) => ({
      id,
      passed,
    })),
    subprocessIsolation: {
      parentEnvironmentAllowlist: WRANGLER_PARENT_ENV_ALLOWLIST,
      secretShapedVariablesForwarded: false,
    },
    limitations: [
      "Local synthetic data and local compatible runtimes only.",
      "No Sites, hosted D1, hosted R2, provider-native restore, production data, or customer data was exercised.",
      "No backup retention, deletion recovery, operator readiness, alert delivery, or successful hosted restore evidence is established.",
      "The observed duration is not an RTO measurement or commitment.",
      "The synthetic snapshot age is not an RPO measurement or commitment.",
    ],
  };
}

function assertPrivacySafeEvidenceRecord(evidenceRecord) {
  const serialized = JSON.stringify(evidenceRecord);
  const forbiddenFixtureValues = [
    ...new Set(
      objectFixtures.flatMap((fixture) => [fixture.accountId, fixture.key]),
    ),
    "alpha@synthetic.invalid",
    "beta@synthetic.invalid",
    "lease-synthetic",
    "request-alpha-export",
  ];
  for (const forbiddenValue of forbiddenFixtureValues) {
    assert.equal(
      serialized.includes(forbiddenValue),
      false,
      "JSON evidence contains a fixture identifier or private-object location",
    );
  }
}

async function exerciseRestoredApplication(snapshot, applicationObjects) {
  const authenticatedEmail = "alpha@synthetic.invalid";
  const authenticatedName = "Synthetic Instructor Alpha";
  const ownerPepper =
    "synthetic-restored-runtime-owner-pepper-only-2026-08-09";
  const ownerDigest = createHmac("sha256", ownerPepper)
    .update(authenticatedEmail)
    .digest("hex");

  restoredApplication = await startD1Worker({
    BILLING_CHECKOUT_ENABLED: "false",
    OWNER_PRIVATE_ACCESS_PEPPER: ownerPepper,
    OWNER_PRIVATE_EMAIL_DIGESTS: ownerDigest,
    RELEASE_ID: "release.synthetic.restore",
  });
  const applicationDatabase = await restoredApplication.database();
  await applicationDatabase.exec(snapshot.toString("utf8"));
  await applicationDatabase.batch(
    buildRecoveryNormalizationStatements().map((statement) =>
      applicationDatabase.prepare(statement),
    ),
  );

  const applicationBucket = await restoredApplication.media();
  for (const item of applicationObjects) {
    await applicationBucket.put(item.key, item.body, {
      customMetadata: item.customMetadata,
      httpMetadata: item.httpMetadata,
    });
  }
  const restoredInventory = applicationObjects.map((item) => ({
    customMetadata: item.customMetadata,
    httpMetadata: item.httpMetadata,
    key: item.key,
    sha256: item.sha256,
    size: item.size,
  }));
  assertR2InventoryMatches(
    await inventoryR2(applicationBucket),
    restoredInventory,
  );

  const headers = identityHeaders(authenticatedEmail, authenticatedName);
  const profileResponse = await restoredApplication.dispatch("/api/profile", {
    headers,
  });
  assert.equal(profileResponse.status, 200, "restored profile read failed");
  const profile = await profileResponse.json();
  assert.equal(profile.profile?.businessName, "Synthetic Alpha Coaching");

  const packagesResponse = await restoredApplication.dispatch("/api/packages", {
    headers,
  });
  assert.equal(packagesResponse.status, 200, "restored package read failed");
  const packages = await packagesResponse.json();
  assert.equal(packages.packages?.length, 1);

  const workspaceResponse = await restoredApplication.dispatch("/app", {
    headers: { ...headers, accept: "text/html" },
  });
  assert.equal(workspaceResponse.status, 200, "restored workspace boot failed");
  assert.match(
    workspaceResponse.headers.get("content-type") ?? "",
    /^text\/html\b/iu,
  );
  const workspaceBody = await workspaceResponse.text();
  assert.match(workspaceBody, /Synthetic Golfer Alpha/u);
  assert.match(workspaceBody, /Synthetic Alpha Roadmap/u);
  assert.doesNotMatch(workspaceBody, /Golfer records are unavailable\./u);

  const healthResponse = await restoredApplication.dispatch(
    "/api/operations/health",
    { headers },
  );
  assert.equal(
    healthResponse.status,
    503,
    "post-restore interrupted scheduler must keep operational health degraded",
  );
  const health = await healthResponse.json();
  assert.equal(health.application?.status, "ready");
  assert.equal(health.scheduler?.state, "failed");
  assert.equal(
    health.scheduler?.lastFailureCode,
    "restore_inflight_interrupted",
  );

  return {
    authenticatedProfileRead: true,
    authenticatedPackageRead: true,
    authenticatedWorkspaceRead: true,
    exactBuiltWorkerBooted: true,
    expectedInterruptedSchedulerDegradationObserved: true,
    restoredObjectInventoryVerified: true,
  };
}

async function exerciseR2(root, restoredState) {
  sourceR2 = createR2(join(root, "r2-source"), "synthetic-source-media");
  restoredR2 = createR2(join(root, "r2-restored"), "synthetic-restored-media");
  const sourceBucket = await sourceR2.getR2Bucket("MEDIA");
  const restoredBucket = await restoredR2.getR2Bucket("MEDIA");

  for (const fixture of objectFixtures) {
    await sourceBucket.put(fixture.key, fixture.body, {
      customMetadata: {
        accountId: fixture.accountId,
        evidenceClass: "local-synthetic-only",
        purpose: fixture.purpose,
      },
      httpMetadata: { contentType: fixture.contentType },
    });
  }

  const backupRoot = join(root, "r2-backup-copy");
  const sourceInventory = await snapshotR2(sourceBucket, backupRoot);
  const manifestPath = join(backupRoot, "inventory.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(sourceInventory, null, 2)}\n`,
    "utf8",
  );
  const storedManifest = JSON.parse(await readFile(manifestPath, "utf8"));

  assert.throws(
    () => assertR2InventoryMatches(sourceInventory.slice(1), sourceInventory),
    { name: "AssertionError" },
    "missing-object inventory fixture was not detected",
  );
  const checksumFixture = await readFile(
    safeObjectPath(backupRoot, storedManifest[0].key),
  );
  const corruptedChecksumFixture = Buffer.from(checksumFixture);
  corruptedChecksumFixture[0] ^= 0xff;
  assert.throws(
    () => assertObjectChecksum(corruptedChecksumFixture, storedManifest[0]),
    { name: "AssertionError" },
    "checksum-mismatch fixture was not detected",
  );

  for (const item of storedManifest) {
    const backupPath = safeObjectPath(backupRoot, item.key);
    const body = await readFile(backupPath);
    assertObjectChecksum(body, item);
    await restoredBucket.put(item.key, body, {
      customMetadata: item.customMetadata,
      httpMetadata: item.httpMetadata,
    });
  }

  const restoredInventory = await inventoryR2(restoredBucket);
  assertR2InventoryMatches(restoredInventory, sourceInventory);

  const expectedD1Objects = [
    ...restoredState[9].map((asset) => ({
      accountId: asset.account_id,
      byteSize: asset.byte_size,
      key: asset.object_key,
      purpose: "media",
      sha256: asset.content_sha256,
    })),
    ...restoredState[6]
      .filter((request) => request.export_object_key)
      .map((request) => ({
        accountId: request.account_id,
        key: request.export_object_key,
        purpose: "data_request_export",
        sha256: request.export_sha256,
      })),
  ].sort((left, right) => left.key.localeCompare(right.key));
  const inventoryByKey = new Map(
    restoredInventory.map((item) => [item.key, item]),
  );
  for (const expected of expectedD1Objects) {
    const actual = inventoryByKey.get(expected.key);
    assert.ok(actual, `D1 references missing private object: ${expected.key}`);
    assert.equal(actual.sha256, expected.sha256);
    assert.equal(actual.customMetadata.accountId, expected.accountId);
    assert.equal(actual.customMetadata.purpose, expected.purpose);
    if (expected.byteSize !== undefined) {
      assert.equal(actual.size, expected.byteSize);
    }
  }
  assert.equal(
    restoredInventory.length,
    expectedD1Objects.length,
    "private-object inventory contains an unreferenced synthetic object",
  );

  const applicationObjects = [];
  for (const item of restoredInventory) {
    const object = await restoredBucket.get(item.key);
    assert.ok(object, `restored application object disappeared: ${item.key}`);
    const body = Buffer.from(await object.arrayBuffer());
    assertObjectChecksum(body, item);
    applicationObjects.push({ ...item, body });
  }

  return {
    applicationObjects,
    negativeScenarios: [
      { id: "r2_missing_object_detected", passed: true },
      { id: "r2_checksum_mismatch_detected", passed: true },
    ],
    objectCount: restoredInventory.length,
    totalBytes: restoredInventory.reduce((total, item) => total + item.size, 0),
  };
}

function assertR2InventoryMatches(actual, expected) {
  assert.deepEqual(
    actual,
    expected,
    "restored R2-compatible inventory differs from source",
  );
}

function assertObjectChecksum(body, item) {
  assert.equal(sha256(body), item.sha256, `backup checksum mismatch: ${item.key}`);
}

function createR2(persistencePath, bucketName) {
  return new Miniflare({
    compatibilityDate: "2026-08-07",
    modules: true,
    r2Buckets: { MEDIA: bucketName },
    resourcePersistencePath: persistencePath,
    script: `export default { fetch() { return new Response("ok"); } };`,
  });
}

async function snapshotR2(bucket, backupRoot) {
  const inventory = await inventoryR2(bucket);
  for (const item of inventory) {
    const object = await bucket.get(item.key);
    assert.ok(object, `source object disappeared during snapshot: ${item.key}`);
    const body = Buffer.from(await object.arrayBuffer());
    assert.equal(sha256(body), item.sha256);
    const backupPath = safeObjectPath(backupRoot, item.key);
    await mkdir(dirname(backupPath), { recursive: true });
    await writeFile(backupPath, body);
  }
  return inventory;
}

async function inventoryR2(bucket) {
  const summaries = [];
  let cursor;
  do {
    const page = await bucket.list(cursor ? { cursor } : undefined);
    summaries.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const inventory = [];
  for (const summary of summaries.sort((left, right) =>
    left.key.localeCompare(right.key),
  )) {
    const object = await bucket.get(summary.key);
    assert.ok(object, `listed object could not be read: ${summary.key}`);
    const body = Buffer.from(await object.arrayBuffer());
    inventory.push({
      customMetadata: object.customMetadata ?? {},
      httpMetadata: {
        contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
      },
      key: summary.key,
      sha256: sha256(body),
      size: body.byteLength,
    });
  }
  return inventory;
}

function safeObjectPath(root, key) {
  assert.ok(key.length > 0, "object key is empty");
  assert.ok(!key.includes("\\"), "object key contains a backslash");
  const segments = key.split("/");
  assert.ok(
    segments.every((segment) => segment && segment !== "." && segment !== ".."),
    "object key contains an unsafe path segment",
  );
  const candidate = resolve(root, ...segments);
  const relativePath = relative(resolve(root), candidate);
  assert.ok(
    relativePath && !relativePath.startsWith(`..${sep}`) && relativePath !== "..",
    "object key resolves outside the backup root",
  );
  return candidate;
}

async function runWrangler(args, cwd = workDirectory) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [wranglerEntry, ...args], {
      cwd,
      env: buildWranglerEnvironment(workDirectory),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
        return;
      }
      reject(
        new Error(
          `local Wrangler command failed (${code}): ${stderr.trim() || stdout.trim()}`,
        ),
      );
    });
  });
}

function buildWranglerEnvironment(root, parentEnvironment = process.env) {
  const environment = {};
  for (const name of WRANGLER_PARENT_ENV_ALLOWLIST) {
    const value = parentEnvironment[name];
    if (typeof value === "string" && value.length > 0) {
      environment[name] = value;
    }
  }

  const subprocessHome = join(root, "subprocess-home");
  const subprocessTemp = join(root, "subprocess-temp");
  return {
    ...environment,
    CI: "1",
    FORCE_COLOR: "0",
    HOME: subprocessHome,
    NO_COLOR: "1",
    TEMP: subprocessTemp,
    TMP: subprocessTemp,
    TMPDIR: subprocessTemp,
    USERPROFILE: subprocessHome,
    WRANGLER_SEND_METRICS: "false",
    XDG_CONFIG_HOME: join(root, "xdg-config"),
  };
}

async function assertWranglerEnvironmentIsolation(root) {
  const probedParentEnvironment = {
    ...process.env,
    ...Object.fromEntries(
      SECRET_ENVIRONMENT_PROBES.map((name) => [
        name,
        `synthetic-parent-probe-${name.toLowerCase()}`,
      ]),
    ),
  };
  const childEnvironment = buildWranglerEnvironment(
    root,
    probedParentEnvironment,
  );
  for (const name of SECRET_ENVIRONMENT_PROBES) {
    assert.equal(
      Object.hasOwn(childEnvironment, name),
      false,
      `${name} must not be forwarded to the Wrangler subprocess`,
    );
  }

  const observed = await runEnvironmentProbe(childEnvironment);
  assert.deepEqual(
    observed,
    [],
    "a secret-shaped parent environment variable reached a child process",
  );
}

async function runEnvironmentProbe(environment) {
  const probeSource = `process.stdout.write(JSON.stringify(${JSON.stringify(
    SECRET_ENVIRONMENT_PROBES,
  )}.filter((name) => Object.hasOwn(process.env, name))))`;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["-e", probeSource], {
      cwd: workDirectory,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `subprocess environment self-check failed (${code}): ${stderr.trim()}`,
          ),
        );
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch (error) {
        reject(
          new Error("subprocess environment self-check returned invalid JSON", {
            cause: error,
          }),
        );
      }
    });
  });
}

function buildFixtureSql() {
  const [alphaMedia, alphaExport, betaMedia] = objectFixtures;
  const token = (character) => character.repeat(64);
  const value = sqlValue;
  return `
insert into accounts
  (id, auth_provider, auth_subject, primary_email, normalized_email,
   email_verified_at, status, locale, timezone, created_at, updated_at)
values
  ('acct-alpha', 'siwc', 'synthetic-subject-alpha', 'alpha@synthetic.invalid',
   'alpha@synthetic.invalid', ${baseTimestamp}, 'active', 'en-CA',
   'America/Edmonton', ${baseTimestamp}, ${baseTimestamp}),
  ('acct-beta', 'siwc', 'synthetic-subject-beta', 'beta@synthetic.invalid',
   'beta@synthetic.invalid', ${baseTimestamp + 1}, 'active', 'en-CA',
   'America/Toronto', ${baseTimestamp + 1}, ${baseTimestamp + 1});

insert into oidc_login_transactions
  (state_hash, sealed_payload, payload_iv, expires_at, consumed_at,
   created_at, updated_at)
values
  (${value(token("9"))}, 'synthetic-expired-sealed-payload',
   'abcdefghijklmnop', ${baseTimestamp + 100}, null,
   ${baseTimestamp + 10}, ${baseTimestamp + 10}),
  (${value(token("a"))}, 'synthetic-consumed-sealed-payload',
   'ponmlkjihgfedcba', ${baseTimestamp + 900_000},
   ${baseTimestamp + 30}, ${baseTimestamp + 20}, ${baseTimestamp + 30});

insert into instructor_sessions
  (id, account_id, identity_version, token_hash, authenticated_at,
   expires_at, revoked_at, revoke_reason, created_at, updated_at)
values
  ('auth-session-alpha-live', 'acct-alpha', 1, ${value(token("5"))},
   ${baseTimestamp + 10}, ${baseTimestamp + 900_000}, null, null,
   ${baseTimestamp + 10}, ${baseTimestamp + 10}),
  ('auth-session-alpha-revoked', 'acct-alpha', 1, ${value(token("6"))},
   ${baseTimestamp + 20}, ${baseTimestamp + 900_000},
   ${baseTimestamp + 40}, 'synthetic_prior_revocation',
   ${baseTimestamp + 20}, ${baseTimestamp + 40}),
  ('auth-session-beta-expired', 'acct-beta', 1, ${value(token("7"))},
   ${baseTimestamp + 10}, ${baseTimestamp + 100}, null, null,
   ${baseTimestamp + 10}, ${baseTimestamp + 10});

insert into media_assets
  (id, account_id, storage_provider, object_key, status, media_kind, mime_type,
   original_filename, byte_size, content_sha256, alt_text, uploaded_at,
   processed_at, created_at, updated_at)
values
  ('media-alpha', 'acct-alpha', 'r2', ${value(alphaMedia.key)}, 'ready',
   'document', ${value(alphaMedia.contentType)}, 'swing-note.txt',
   ${alphaMedia.byteSize}, ${value(alphaMedia.sha256)}, 'Synthetic recovery note',
   ${baseTimestamp + 10}, ${baseTimestamp + 11}, ${baseTimestamp + 9},
   ${baseTimestamp + 11}),
  ('media-beta', 'acct-beta', 'r2', ${value(betaMedia.key)}, 'ready',
   'document', ${value(betaMedia.contentType)}, 'tempo-note.txt',
   ${betaMedia.byteSize}, ${value(betaMedia.sha256)}, 'Synthetic recovery note',
   ${baseTimestamp + 12}, ${baseTimestamp + 13}, ${baseTimestamp + 11},
   ${baseTimestamp + 13});

insert into instructor_profiles
  (account_id, display_name, business_name, professional_title, philosophy,
   contact_email, province_or_territory, city, accent_color,
   logo_media_asset_id, profile_photo_media_asset_id, setup_completed_at,
   created_at, updated_at)
values
  ('acct-alpha', 'Synthetic Instructor Alpha', 'Synthetic Alpha Coaching',
   'Golf instructor', 'Synthetic evidence-led coaching.',
   'coach-alpha@synthetic.invalid', 'AB', 'Calgary', '#1A6B4A',
   'media-alpha', null, ${baseTimestamp + 14}, ${baseTimestamp + 14},
   ${baseTimestamp + 14}),
  ('acct-beta', 'Synthetic Instructor Beta', 'Synthetic Beta Coaching',
   'Golf instructor', 'Synthetic practice-led coaching.',
   'coach-beta@synthetic.invalid', 'ON', 'Ottawa', '#315A9A', null,
   'media-beta', ${baseTimestamp + 15}, ${baseTimestamp + 15},
   ${baseTimestamp + 15});

insert into golfers
  (id, account_id, display_name, status, eligibility_status,
   eligibility_confirmed_at, created_at, updated_at)
values
  ('golfer-alpha', 'acct-alpha', 'Synthetic Golfer Alpha', 'active',
   'adult_confirmed', ${baseTimestamp + 20}, ${baseTimestamp + 20},
   ${baseTimestamp + 20}),
  ('golfer-beta', 'acct-beta', 'Synthetic Golfer Beta', 'active',
   'adult_confirmed', ${baseTimestamp + 21}, ${baseTimestamp + 21},
   ${baseTimestamp + 21});

insert into consent_records
  (id, account_id, golfer_id, subject_type, scope, status, policy_version,
   purpose_description, capture_method, evidence_reference,
   recorded_by_account_id, granted_at, created_at)
values
  ('consent-alpha-account', 'acct-alpha', null, 'account', 'terms',
   'granted', 'synthetic-v1', 'Synthetic terms acceptance evidence.',
   'self_service', 'synthetic-terms-check', 'acct-alpha',
   ${baseTimestamp + 22}, ${baseTimestamp + 22}),
  ('consent-alpha-golfer-record', 'acct-alpha', null, 'account',
   'golfer_record', 'granted', 'synthetic-golfer-record-v1',
   'Synthetic authorization for test-only golfer records; no real person is represented.',
   'self_service', 'synthetic-golfer-record-check', 'acct-alpha',
   ${baseTimestamp + 23}, ${baseTimestamp + 23}),
  ('consent-beta-golfer', 'acct-beta', 'golfer-beta', 'golfer',
   'roadmap_sharing', 'granted', 'synthetic-v1',
   'Synthetic roadmap-sharing evidence.', 'instructor_attested',
   'synthetic-sharing-check', 'acct-beta', ${baseTimestamp + 24},
   ${baseTimestamp + 24});

insert into development_plans
  (id, account_id, golfer_id, title, status, revision, approved_revision,
   published_revision, private_context_label, coach_approved_at, previewed_at,
   published_at, last_shared_at, created_at, updated_at)
values
  ('plan-alpha', 'acct-alpha', 'golfer-alpha', 'Synthetic Alpha Roadmap',
   'published', 3, 3, 3, 'Private synthetic coaching roadmap',
   ${baseTimestamp + 30}, ${baseTimestamp + 31}, ${baseTimestamp + 32},
   ${baseTimestamp + 33}, ${baseTimestamp + 25}, ${baseTimestamp + 33}),
  ('plan-beta', 'acct-beta', 'golfer-beta', 'Synthetic Beta Roadmap',
   'published', 2, 2, 2, 'Private synthetic coaching roadmap',
   ${baseTimestamp + 34}, ${baseTimestamp + 35}, ${baseTimestamp + 36},
   ${baseTimestamp + 37}, ${baseTimestamp + 26}, ${baseTimestamp + 37});

insert into coaching_packages
  (id, account_id, name, purpose, fit_description, status, currency,
   price_amount_minor, current_details_text, inclusions, cadence,
   practice_expectation, evaluation_description, terms_summary,
   external_action_type, external_action_label, external_action_url,
   external_action_verified_at, is_default, created_at, updated_at)
values
  ('package-alpha', 'acct-alpha', 'Synthetic Alpha Series',
   'Build a repeatable synthetic routine.',
   'For the synthetic alpha roadmap.', 'active', 'CAD', 7500, null,
   '["Two synthetic lessons","One synthetic review"]', 'Biweekly',
   'Two short synthetic practices weekly.', 'Synthetic phase review.',
   'Synthetic terms only.', 'booking', 'Book synthetic follow-up',
   'https://synthetic.invalid/alpha-booking', ${baseTimestamp + 38}, 1,
   ${baseTimestamp + 38}, ${baseTimestamp + 38}),
  ('package-beta', 'acct-beta', 'Synthetic Beta Check-in',
   'Review synthetic tempo work.', 'For the synthetic beta roadmap.',
   'active', null, null, 'Contact the synthetic instructor for current details.',
   '["One synthetic check-in"]', 'Monthly',
   'Three synthetic rehearsals weekly.', 'Synthetic progress check.',
   'Synthetic terms only.', 'contact', 'Contact synthetic instructor',
   'https://synthetic.invalid/beta-contact', ${baseTimestamp + 39}, 1,
   ${baseTimestamp + 39}, ${baseTimestamp + 39});

insert into golfer_goals
  (id, account_id, golfer_id, plan_id, desired_outcome, why_it_matters,
   context, constraints, target_date, status, is_primary,
   confirmed_by_golfer_at, coach_approved_at, created_at, updated_at)
values
  ('goal-alpha', 'acct-alpha', 'golfer-alpha', 'plan-alpha',
   'Build a repeatable synthetic start line.',
   'Supports the synthetic alpha roadmap.', 'Synthetic practice context.',
   'Synthetic time constraint.', ${baseTimestamp + 5_000_000}, 'active', 1,
   ${baseTimestamp + 40}, ${baseTimestamp + 41}, ${baseTimestamp + 40},
   ${baseTimestamp + 41}),
  ('goal-beta', 'acct-beta', 'golfer-beta', 'plan-beta',
   'Build a repeatable synthetic tempo.',
   'Supports the synthetic beta roadmap.', 'Synthetic practice context.',
   null, ${baseTimestamp + 6_000_000}, 'active', 1,
   ${baseTimestamp + 42}, ${baseTimestamp + 43}, ${baseTimestamp + 42},
   ${baseTimestamp + 43});

insert into assessments
  (id, account_id, plan_id, title, status, assessed_at, context,
   starting_point, strength_summary, primary_pattern, limitations,
   coach_approved_at, created_at, updated_at)
values
  ('assessment-alpha', 'acct-alpha', 'plan-alpha',
   'Synthetic Alpha Baseline', 'confirmed', ${baseTimestamp + 44},
   'Synthetic assessment context.', 'Synthetic start-line baseline.',
   'Consistent synthetic setup.', 'Synthetic face-to-path pattern.',
   'Synthetic observations only.', ${baseTimestamp + 45},
   ${baseTimestamp + 44}, ${baseTimestamp + 45}),
  ('assessment-beta', 'acct-beta', 'plan-beta',
   'Synthetic Beta Baseline', 'confirmed', ${baseTimestamp + 46},
   'Synthetic assessment context.', 'Synthetic tempo baseline.',
   'Consistent synthetic finish.', 'Synthetic transition pattern.',
   'Synthetic observations only.', ${baseTimestamp + 47},
   ${baseTimestamp + 46}, ${baseTimestamp + 47});

insert into plan_priorities
  (id, account_id, plan_id, assessment_id, title, description, rationale,
   status, sort_order, is_current, coach_approved_at, created_at, updated_at)
values
  ('priority-alpha', 'acct-alpha', 'plan-alpha', 'assessment-alpha',
   'Synthetic start line', 'Train a synthetic start-line routine.',
   'Selected from the synthetic baseline.', 'active', 0, 1,
   ${baseTimestamp + 48}, ${baseTimestamp + 48}, ${baseTimestamp + 48}),
  ('priority-beta', 'acct-beta', 'plan-beta', 'assessment-beta',
   'Synthetic tempo', 'Train a synthetic tempo routine.',
   'Selected from the synthetic baseline.', 'active', 0, 1,
   ${baseTimestamp + 49}, ${baseTimestamp + 49}, ${baseTimestamp + 49});

insert into plan_phases
  (id, account_id, plan_id, coaching_package_id, sequence, title, purpose,
   rationale, progress_signals, expectations, estimated_duration, status,
   is_recommended, coach_approved_at, started_at, completed_at,
   created_at, updated_at)
values
  ('phase-alpha-one', 'acct-alpha', 'plan-alpha', 'package-alpha', 1,
   'Synthetic Alpha Foundation', 'Establish the synthetic routine.',
   'First synthetic phase.', '["Repeatable setup","Stable start line"]',
   'Complete two synthetic practices.', 'Two weeks', 'complete', 1,
   ${baseTimestamp + 50}, ${baseTimestamp + 51}, ${baseTimestamp + 60},
   ${baseTimestamp + 50}, ${baseTimestamp + 60}),
  ('phase-alpha-two', 'acct-alpha', 'plan-alpha', 'package-alpha', 2,
   'Synthetic Alpha Transfer', 'Transfer the synthetic routine.',
   'Second synthetic phase.', '["On-course synthetic observation"]',
   'Complete one synthetic transfer check.', 'Two weeks', 'active', 1,
   ${baseTimestamp + 52}, ${baseTimestamp + 61}, null,
   ${baseTimestamp + 52}, ${baseTimestamp + 61}),
  ('phase-beta-one', 'acct-beta', 'plan-beta', 'package-beta', 1,
   'Synthetic Beta Foundation', 'Establish synthetic tempo.',
   'First synthetic phase.', '["Stable synthetic tempo"]',
   'Complete three synthetic rehearsals.', 'Three weeks', 'active', 1,
   ${baseTimestamp + 53}, ${baseTimestamp + 54}, null,
   ${baseTimestamp + 53}, ${baseTimestamp + 54});

insert into phase_priorities
  (account_id, phase_id, priority_id, sort_order, created_at)
values
  ('acct-alpha', 'phase-alpha-one', 'priority-alpha', 0,
   ${baseTimestamp + 54}),
  ('acct-beta', 'phase-beta-one', 'priority-beta', 0,
   ${baseTimestamp + 55});

insert into lessons
  (id, account_id, plan_id, phase_id, sequence, title, status, purpose,
   coach_observation, golfer_learning, takeaway, next_check,
   phase_connection, scheduled_at, occurred_at, coach_approved_at,
   completed_at, created_at, updated_at)
values
  ('lesson-alpha', 'acct-alpha', 'plan-alpha', 'phase-alpha-one', 1,
   'Synthetic Alpha Lesson', 'completed', 'Observe synthetic start line.',
   'Synthetic setup remained stable.', 'Synthetic routine felt repeatable.',
   'Keep the synthetic cue short.', 'Review after two practices.',
   'Supports the synthetic foundation phase.', ${baseTimestamp + 55},
   ${baseTimestamp + 56}, ${baseTimestamp + 57}, ${baseTimestamp + 57},
   ${baseTimestamp + 55}, ${baseTimestamp + 57}),
  ('lesson-beta', 'acct-beta', 'plan-beta', 'phase-beta-one', 1,
   'Synthetic Beta Lesson', 'planned', 'Observe synthetic tempo.', null,
   null, null, 'Review at the synthetic check-in.',
   'Supports the synthetic tempo phase.', ${baseTimestamp + 70}, null,
   ${baseTimestamp + 58}, null, ${baseTimestamp + 58},
   ${baseTimestamp + 58});

insert into practice_items
  (id, account_id, plan_id, phase_id, lesson_id, title, status, objective,
   rationale, instructions, time_or_cadence, success_check, common_mistake,
   stop_or_ask_rule, constraint_note, starts_at, due_at, coach_approved_at,
   completed_at, created_at, updated_at)
values
  ('practice-alpha', 'acct-alpha', 'plan-alpha', 'phase-alpha-one',
   'lesson-alpha', 'Synthetic Alpha Start-Line Check', 'completed',
   'Repeat the synthetic setup.', 'Reinforces the synthetic priority.',
   '["Place a synthetic marker","Complete five rehearsals"]',
   'Twice weekly', 'Four of five synthetic starts match.',
   'Adding extra synthetic cues.', 'Stop if synthetic discomfort appears.',
   'Synthetic exercise only.', ${baseTimestamp + 58},
   ${baseTimestamp + 68}, ${baseTimestamp + 59}, ${baseTimestamp + 67},
   ${baseTimestamp + 58}, ${baseTimestamp + 67}),
  ('practice-beta', 'acct-beta', 'plan-beta', 'phase-beta-one',
   'lesson-beta', 'Synthetic Beta Tempo Check', 'active',
   'Repeat the synthetic tempo.', 'Reinforces the synthetic priority.',
   '["Count a synthetic cadence","Complete three rehearsals"]',
   'Three times weekly', 'Three synthetic rehearsals feel consistent.',
   'Rushing the synthetic transition.', 'Stop if synthetic discomfort appears.',
   null, ${baseTimestamp + 60}, ${baseTimestamp + 80},
   ${baseTimestamp + 61}, null, ${baseTimestamp + 60},
   ${baseTimestamp + 61});

insert into evidence_items
  (id, account_id, plan_id, assessment_id, phase_id, lesson_id,
   practice_item_id, media_asset_id, status, evidence_type, context_type,
   title, claim, source_label, source_type, observed_at, comparison_role,
   metric_name, metric_value, metric_unit, interpretation, limitation,
   maturity, next_evidence_needed, is_representative, coach_approved_at,
   created_at, updated_at)
values
  ('evidence-alpha', 'acct-alpha', 'plan-alpha', 'assessment-alpha',
   'phase-alpha-one', 'lesson-alpha', 'practice-alpha', 'media-alpha',
   'published', 'media', 'lesson', 'Synthetic Alpha Observation',
   'Synthetic start-line routine was repeated.', 'Synthetic coach note',
   'document', ${baseTimestamp + 62}, 'standalone', null, null, null,
   'Supports a synthetic early indication.', 'One synthetic observation only.',
   'early_indication', 'Observe a synthetic transfer attempt.', 1,
   ${baseTimestamp + 63}, ${baseTimestamp + 62}, ${baseTimestamp + 63}),
  ('evidence-beta', 'acct-beta', 'plan-beta', 'assessment-beta',
   'phase-beta-one', 'lesson-beta', 'practice-beta', null, 'published',
   'measurement', 'practice', 'Synthetic Beta Measurement',
   'Three synthetic rehearsals were recorded.', 'Synthetic golfer report',
   'golfer_reported', ${baseTimestamp + 64}, 'baseline',
   'synthetic_repetitions', 3, 'count',
   'Establishes a synthetic baseline.', 'Self-reported synthetic value.',
   'single_observation', 'Repeat the synthetic measurement.', 1,
   ${baseTimestamp + 65}, ${baseTimestamp + 64}, ${baseTimestamp + 65});

insert into phase_reviews
  (id, account_id, plan_id, phase_id, next_phase_id,
   recommended_package_id, status, outcome, original_purpose,
   baseline_summary, work_completed, change_summary, reliability_label,
   limitations, golfer_contribution, coach_conclusion,
   remaining_opportunity, next_phase_rationale,
   independent_practice_alternative, confirmed_at, shared_at,
   created_at, updated_at)
values
  ('review-alpha', 'acct-alpha', 'plan-alpha', 'phase-alpha-one',
   'phase-alpha-two', 'package-alpha', 'shared', 'complete',
   'Establish the synthetic routine.', 'Synthetic baseline was recorded.',
   'Synthetic lesson and practice completed.',
   'Synthetic routine became more repeatable.', 'Early synthetic indication.',
   'Only synthetic evidence was used.', 'Synthetic golfer note recorded.',
   'Advance to the synthetic transfer phase.',
   'Observe a synthetic on-course attempt.',
   'The next synthetic phase tests transfer.',
   'Continue the synthetic practice independently.',
   ${baseTimestamp + 66}, ${baseTimestamp + 67},
   ${baseTimestamp + 66}, ${baseTimestamp + 67});

insert into phase_review_evidence
  (account_id, phase_review_id, evidence_item_id, sort_order, created_at)
values
  ('acct-alpha', 'review-alpha', 'evidence-alpha', 0,
   ${baseTimestamp + 68});

insert into share_links
  (id, account_id, plan_id, token_hash, token_hash_algorithm, status, scope,
   plan_revision, intended_recipient_context, expires_at, access_count,
   revoked_at, revoke_reason, created_at, updated_at)
values
  ('share-alpha-active', 'acct-alpha', 'plan-alpha', ${value(token("a"))},
   'hmac-sha256-v1', 'active', 'golfer_plan_read', 3, 'Synthetic alpha recipient',
   ${baseTimestamp + 900000}, 2, null, null, ${baseTimestamp + 40},
   ${baseTimestamp + 42}),
  ('share-alpha-revoked', 'acct-alpha', 'plan-alpha', ${value(token("b"))},
   'hmac-sha256-v1', 'revoked', 'golfer_plan_read', 2,
   'Synthetic rotated alpha recipient', ${baseTimestamp + 800000}, 1,
   ${baseTimestamp + 50}, 'synthetic_rotation', ${baseTimestamp + 41},
   ${baseTimestamp + 50}),
  ('share-beta-active', 'acct-beta', 'plan-beta', ${value(token("c"))},
   'hmac-sha256-v1', 'active', 'golfer_plan_read', 2, 'Synthetic beta recipient',
   ${baseTimestamp + 900000}, 1, null, null, ${baseTimestamp + 43},
   ${baseTimestamp + 44});

insert into share_sessions
  (id, account_id, share_link_id, token_hash, token_hash_algorithm, expires_at,
   access_count, revoked_at, revoke_reason, created_at, updated_at)
values
  ('session-alpha-active', 'acct-alpha', 'share-alpha-active',
   ${value(token("d"))}, 'hmac-sha256-session-v1', ${baseTimestamp + 700000},
   2, null, null, ${baseTimestamp + 60}, ${baseTimestamp + 62}),
  ('session-alpha-revoked', 'acct-alpha', 'share-alpha-revoked',
   ${value(token("e"))}, 'hmac-sha256-session-v1', ${baseTimestamp + 700000},
   1, ${baseTimestamp + 70}, 'parent_capability_revoked',
   ${baseTimestamp + 61}, ${baseTimestamp + 70}),
  ('session-beta-active', 'acct-beta', 'share-beta-active',
   ${value(token("f"))}, 'hmac-sha256-session-v1', ${baseTimestamp + 700000},
   1, null, null, ${baseTimestamp + 63}, ${baseTimestamp + 64});

insert into golfer_plan_responses
  (id, account_id, plan_id, share_link_id, response_type, note,
   external_outcome_observed, occurred_at, created_at)
values
  ('response-alpha', 'acct-alpha', 'plan-alpha', 'share-alpha-active',
   'ask_question', 'Synthetic clarification requested.', 0,
   ${baseTimestamp + 71}, ${baseTimestamp + 71}),
  ('response-beta', 'acct-beta', 'plan-beta', 'share-beta-active',
   'independent_practice', 'Synthetic independent practice selected.', 0,
   ${baseTimestamp + 72}, ${baseTimestamp + 72});

insert into data_requests
  (id, account_id, golfer_id, request_type, requested_by_type,
   requester_contact_hash, status, identity_verified_at, due_at,
   export_object_key, export_sha256, export_expires_at,
   fulfilled_at, created_at, updated_at)
values
  ('request-alpha-export', 'acct-alpha', 'golfer-alpha', 'export', 'account',
   ${value(token("1"))}, 'in_progress', ${baseTimestamp + 80},
   ${baseTimestamp + 900000}, ${value(alphaExport.key)}, ${value(alphaExport.sha256)},
   ${baseTimestamp + 800000}, null, ${baseTimestamp + 79},
   ${baseTimestamp + 81}),
  ('request-beta-deletion', 'acct-beta', 'golfer-beta', 'deletion', 'golfer',
   ${value(token("2"))}, 'fulfilled', ${baseTimestamp + 82},
   ${baseTimestamp + 900000}, null, null, null, ${baseTimestamp + 84},
   ${baseTimestamp + 81}, ${baseTimestamp + 84});

insert into billing_customers
  (provider, provider_customer_id, account_id, created_at, updated_at)
values
  ('stripe', 'cus_synthetic_alpha', 'acct-alpha', ${baseTimestamp + 90},
   ${baseTimestamp + 90}),
  ('stripe', 'cus_synthetic_beta', 'acct-beta', ${baseTimestamp + 91},
   ${baseTimestamp + 91});

insert into billing_checkout_attempts
  (id, account_id, provider, state, request_version, idempotency_key,
   provider_price_id, application_origin, provider_customer_id,
   customer_email, provider_session_id, provider_created_at,
   provider_expires_at, completed_at, created_at, updated_at)
values
  ('checkout-alpha-completed', 'acct-alpha', 'stripe', 'completed', 1,
   'synthetic-checkout-alpha', 'price_synthetic_alpha',
   'https://synthetic.invalid', 'cus_synthetic_alpha',
   'alpha@synthetic.invalid', 'cs_synthetic_alpha', ${baseTimestamp + 92},
   ${baseTimestamp + 900_000}, ${baseTimestamp + 95},
   ${baseTimestamp + 92}, ${baseTimestamp + 95}),
  ('checkout-beta-open', 'acct-beta', 'stripe', 'open', 1,
   'synthetic-checkout-beta', 'price_synthetic_beta',
   'https://synthetic.invalid', 'cus_synthetic_beta',
   'beta@synthetic.invalid', 'cs_synthetic_beta', ${baseTimestamp + 93},
   ${baseTimestamp + 900_001}, null, ${baseTimestamp + 93},
   ${baseTimestamp + 94});

insert into billing_subscription_projection_generations
  (provider, provider_subscription_id, generation, created_at, updated_at)
values
  ('stripe', 'sub_synthetic_alpha', 4, ${baseTimestamp + 92},
   ${baseTimestamp + 96}),
  ('stripe', 'sub_synthetic_beta', 7, ${baseTimestamp + 93},
   ${baseTimestamp + 99});

insert into subscriptions
  (id, account_id, provider, provider_customer_id,
   provider_subscription_id, provider_price_id, product_code, status,
   billing_interval, currency, unit_amount_minor, current_period_starts_at,
   current_period_ends_at, cancel_at_period_end, pause_starts_at,
   last_provider_sync_at, projection_revision, created_at, updated_at)
values
  ('subscription-alpha', 'acct-alpha', 'stripe', 'cus_synthetic_alpha',
   'sub_synthetic_alpha', 'price_synthetic_alpha', 'roadmap_synthetic_v1',
   'active', 'month', 'cad', 1111, ${baseTimestamp + 90},
   ${baseTimestamp + 2592000000}, 0, null, ${baseTimestamp + 96}, 4,
   ${baseTimestamp + 90}, ${baseTimestamp + 96}),
  ('subscription-beta', 'acct-beta', 'stripe', 'cus_synthetic_beta',
   'sub_synthetic_beta', 'price_synthetic_beta', 'roadmap_synthetic_v1',
   'paused', 'month', 'cad', 2222, ${baseTimestamp + 91},
   ${baseTimestamp + 2592000001}, 0, ${baseTimestamp + 97},
   ${baseTimestamp + 99}, 7, ${baseTimestamp + 91}, ${baseTimestamp + 99});

insert into billing_events
  (id, account_id, subscription_id, provider, provider_event_id,
   provider_event_type, status, payload_sha256, provider_invoice_id,
   amount_minor, currency, event_occurred_at, received_at, processed_at,
   lease_token, lease_expires_at, last_attempt_at, processing_attempts,
   last_error_code, last_error_message, created_at, updated_at)
values
  ('billing-event-alpha-processed', 'acct-alpha', 'subscription-alpha',
   'stripe', 'evt_synthetic_alpha', 'customer.subscription.updated',
   'processed', ${value(token("7"))}, 'in_synthetic_alpha', 1111, 'cad',
   ${baseTimestamp + 100}, ${baseTimestamp + 101}, ${baseTimestamp + 103},
   null, null, ${baseTimestamp + 102}, 1, null, null,
   ${baseTimestamp + 101}, ${baseTimestamp + 103}),
  ('billing-event-beta-processing', 'acct-beta', 'subscription-beta',
   'stripe', 'evt_synthetic_beta', 'customer.subscription.updated',
   'processing', ${value(token("8"))}, 'in_synthetic_beta', 2222, 'cad',
   ${baseTimestamp + 104}, ${baseTimestamp + 105}, null,
   'lease-synthetic-event-beta', ${baseTimestamp + 900_000},
   ${baseTimestamp + 106}, 2, null, null,
   ${baseTimestamp + 105}, ${baseTimestamp + 106});

insert into billing_reconciliation_targets
  (id, account_id, provider, subscription_id, checkout_attempt_id, state,
   lease_token, lease_expires_at, last_attempt_at, processing_attempts,
   automatic_failure_count, next_automatic_attempt_at,
   automatic_dead_lettered_at, last_error_code, last_error_message,
   last_completed_at, last_succeeded_at, created_at, updated_at)
values
  ('reconciliation-alpha-succeeded', 'acct-alpha', 'stripe',
   'subscription-alpha', null, 'succeeded', null, null,
   ${baseTimestamp + 107}, 1, 0, null, null, null, null,
   ${baseTimestamp + 108}, ${baseTimestamp + 108},
   ${baseTimestamp + 107}, ${baseTimestamp + 108}),
  ('reconciliation-beta-processing', 'acct-beta', 'stripe', null,
   'checkout-beta-open', 'processing', 'lease-synthetic-reconcile-beta',
   ${baseTimestamp + 900_000}, ${baseTimestamp + 109}, 2, 0, null, null,
   null, null, null, null, ${baseTimestamp + 109},
   ${baseTimestamp + 109});

insert into billing_account_operation_leases
  (account_id, provider, state, operation, lease_token, lease_generation,
   lease_expires_at, last_acquired_at, last_released_at, created_at,
   updated_at)
values
  ('acct-alpha', 'stripe', 'idle', null, null, 2, null,
   ${baseTimestamp + 110}, ${baseTimestamp + 111}, ${baseTimestamp + 110},
   ${baseTimestamp + 111}),
  ('acct-beta', 'stripe', 'held', 'reconciliation',
   'lease-synthetic-account-beta', 3, ${baseTimestamp + 900_000},
   ${baseTimestamp + 112}, null, ${baseTimestamp + 111},
   ${baseTimestamp + 112});

insert into scheduler_heartbeat
  (scheduler_key, attempt_token, release_id, state, started_at,
   completed_at, billing_configured, considered_count, attempted_count,
   succeeded_count, failed_count, dead_letter_count, last_failure_code,
   updated_at)
values
  ('billing_reconciliation', 'attempt.synthetic.restore',
   'release.synthetic.restore', 'running', ${baseTimestamp + 113}, null,
   null, null, null, null, null, null, null, ${baseTimestamp + 113});

insert into abuse_rate_limits
  (scope, subject_key_hash, window_started_at, window_expires_at,
   request_count, last_request_at)
values
  ('share_exchange_network', ${value(token("3"))},
   ${baseTimestamp + 100}, ${baseTimestamp + 200}, 4,
   ${baseTimestamp + 150}),
  ('billing_portal_account', ${value(token("4"))},
   ${baseTimestamp + 400_000}, ${baseTimestamp + 900_000}, 2,
   ${baseTimestamp + 450_000});

insert into audit_events
  (id, account_id, actor_type, actor_account_id, actor_reference, action,
   target_type, target_id, outcome, request_id, metadata, occurred_at)
values
  ('audit-alpha-publish', 'acct-alpha', 'account', 'acct-alpha', null,
   'plan.published', 'development_plan', 'plan-alpha', 'success',
   'request-synthetic-001', '{"synthetic":true,"revision":3}',
   ${baseTimestamp + 100}),
  ('audit-alpha-revoke', 'acct-alpha', 'account', 'acct-alpha', null,
   'share.revoke', 'share_link', 'share-alpha-revoked', 'success',
   'request-synthetic-002', '{"synthetic":true,"reason":"rotation"}',
   ${baseTimestamp + 101}),
  ('audit-beta-request', 'acct-beta', 'support', null, 'synthetic-operator',
   'data_request.fulfilled', 'data_request', 'request-beta-deletion', 'success',
   'request-synthetic-003', '{"synthetic":true}', ${baseTimestamp + 102}),
  ('audit-beta-billing', 'acct-beta', 'billing_provider', null,
   'stripe-synthetic', 'billing.subscription_synced', 'subscription',
   'subscription-beta', 'success', 'request-synthetic-004',
   '{"synthetic":true,"projectionRevision":7}', ${baseTimestamp + 103});
`;
}

function sqlValue(input) {
  if (input === null || input === undefined) return "null";
  if (typeof input === "number") return String(input);
  return `'${String(input).replaceAll("'", "''")}'`;
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}
