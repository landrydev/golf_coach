import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerEntry = resolve(
  projectRoot,
  "node_modules/wrangler/bin/wrangler.js",
);
const evidenceLabel =
  "LOCAL SYNTHETIC EVIDENCE — NOT HOSTED BACKUP/RESTORE EVIDENCE";
const baseTimestamp = 1_786_000_000_000;
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

const verificationStatements = [
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
     (select count(*) from media_assets) as media_assets`,
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

try {
  workDirectory = await mkdtemp(join(tmpdir(), "roadmap-recovery-exercise-"));
  const sourceProject = join(workDirectory, "d1-source");
  const restoredProject = join(workDirectory, "d1-restored");
  const sourceConfigPath = join(sourceProject, "wrangler.jsonc");
  const restoredConfigPath = join(restoredProject, "wrangler.jsonc");
  const snapshotPath = join(workDirectory, "d1-logical-snapshot.sql");
  const fixtureSqlPath = join(workDirectory, "synthetic-fixture.sql");

  await Promise.all([
    mkdir(sourceProject, { recursive: true }),
    mkdir(restoredProject, { recursive: true }),
    mkdir(join(workDirectory, "subprocess-home"), { recursive: true }),
    mkdir(join(workDirectory, "subprocess-temp"), { recursive: true }),
    mkdir(join(workDirectory, "xdg-config"), { recursive: true }),
  ]);
  await assertWranglerEnvironmentIsolation(workDirectory);
  const localConfig = `${JSON.stringify(
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
  await Promise.all([
    writeFile(sourceConfigPath, localConfig, "utf8"),
    writeFile(restoredConfigPath, localConfig, "utf8"),
  ]);

  const migrationPaths = await readMigrationPaths();
  for (const migrationPath of migrationPaths) {
    await executeD1File(sourceConfigPath, migrationPath);
  }

  await writeFile(fixtureSqlPath, buildFixtureSql(), "utf8");
  await executeD1File(sourceConfigPath, fixtureSqlPath);
  const sourceState = await inspectD1(sourceConfigPath);
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

  for (const migrationPath of migrationPaths) {
    await executeD1File(restoredConfigPath, migrationPath);
  }
  await executeD1File(restoredConfigPath, snapshotPath);
  const restoredState = await inspectD1(restoredConfigPath);
  assertRepresentativeState(restoredState);
  assert.deepEqual(
    restoredState,
    sourceState,
    "restored D1 invariants differ from the synthetic source",
  );

  const r2Result = await exerciseR2(workDirectory, restoredState);

  console.log(evidenceLabel);
  console.log(
    `PASS D1: ${migrationPaths.length} migrations applied to each isolated database, ${sourceState[1][0].accounts} tenants, data snapshot ${snapshot.byteLength} bytes (${sha256(snapshot)}).`,
  );
  console.log(
    "PASS D1 invariants: tenant ownership, published plans, active/revoked capabilities and sessions, audit order, data-request state, and billing projections survived restore.",
  );
  console.log(
    `PASS local R2-compatible restore: ${r2Result.objectCount} private synthetic objects, ${r2Result.totalBytes} bytes, inventory and SHA-256 checks match D1 metadata.`,
  );
  console.log(
    `PASS subprocess isolation: Wrangler received generated HOME/config/temp values and only the ${WRANGLER_PARENT_ENV_ALLOWLIST.length ? WRANGLER_PARENT_ENV_ALLOWLIST.join("/") : "empty"} non-secret parent allowlist; secret-shaped probe variables were absent.`,
  );
  console.log(
    "Temporary exercise data was isolated from hosted resources and removed. No RPO, RTO, hosted backup, or production restore claim is established.",
  );
} finally {
  await Promise.allSettled([sourceR2?.dispose(), restoredR2?.dispose()]);
  if (workDirectory) {
    await rm(workDirectory, { force: true, recursive: true });
  }
}

async function readMigrationPaths() {
  const journal = JSON.parse(
    await readFile(resolve(projectRoot, "drizzle/meta/_journal.json"), "utf8"),
  );
  const entries = [...journal.entries].sort((left, right) => left.idx - right.idx);
  assert.ok(entries.length > 0, "migration journal is empty");
  entries.forEach((entry, index) => {
    assert.equal(entry.idx, index, "migration journal indexes must be contiguous");
  });
  return entries.map((entry) =>
    resolve(projectRoot, "drizzle", `${entry.tag}.sql`),
  );
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

async function inspectD1(configPath) {
  const operations = [];
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

function assertRepresentativeState(state) {
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

  for (const item of storedManifest) {
    const backupPath = safeObjectPath(backupRoot, item.key);
    const body = await readFile(backupPath);
    assert.equal(sha256(body), item.sha256, `backup checksum mismatch: ${item.key}`);
    await restoredBucket.put(item.key, body, {
      customMetadata: item.customMetadata,
      httpMetadata: item.httpMetadata,
    });
  }

  const restoredInventory = await inventoryR2(restoredBucket);
  assert.deepEqual(
    restoredInventory,
    sourceInventory,
    "restored R2-compatible inventory differs from source",
  );

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

  return {
    objectCount: restoredInventory.length,
    totalBytes: restoredInventory.reduce((total, item) => total + item.size, 0),
  };
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
