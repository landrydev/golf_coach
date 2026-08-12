import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startD1Worker } from "./support/d1-worker.mjs";

const operatorMigrationUrl = new URL(
  "../drizzle/0008_reflective_mystique.sql",
  import.meta.url,
);
const closeMigrationUrl = new URL(
  "../drizzle/0010_steep_hemingway.sql",
  import.meta.url,
);

test(
  "operator abuse-scope migration preserves legacy counters and constraints",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({}, { migrationThroughIndex: 7 });
    context.after(() => worker.dispose());
    const database = await worker.database();
    const windowStartedAt = 1_786_202_000_000;
    const legacyRows = [
      ["share_exchange_network", "1".repeat(64), 7],
      ["billing_reconcile_account", "2".repeat(64), 3],
      ["data_request_account", "3".repeat(64), 2],
    ];
    for (const [scope, hash, requestCount] of legacyRows) {
      await insertCounter(database, {
        scope,
        hash,
        requestCount,
        windowStartedAt,
      });
    }

    await applyMigration(database, operatorMigrationUrl);

    const preserved = await database
      .prepare(
        `select scope, subject_key_hash, window_started_at,
                window_expires_at, request_count, last_request_at
           from abuse_rate_limits
          order by scope`,
      )
      .all();
    assert.deepEqual(
      preserved.results,
      [...legacyRows]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([scope, hash, requestCount]) => ({
          scope,
          subject_key_hash: hash,
          window_started_at: windowStartedAt,
          window_expires_at: windowStartedAt + 300_000,
          request_count: requestCount,
          last_request_at: windowStartedAt + 1_000,
        })),
    );

    await insertCounter(database, {
      scope: "data_request_operator_network",
      hash: "4".repeat(64),
      requestCount: 1,
      windowStartedAt,
    });
    await insertCounter(database, {
      scope: "data_request_operator_identity",
      hash: "5".repeat(64),
      requestCount: 1,
      windowStartedAt,
    });

    await assert.rejects(
      insertCounter(database, {
        scope: "unknown_operator_scope",
        hash: "6".repeat(64),
        requestCount: 1,
        windowStartedAt,
      }),
      /constraint failed/i,
    );
    await assert.rejects(
      insertCounter(database, {
        scope: "data_request_operator_network",
        hash: "raw-network-address",
        requestCount: 1,
        windowStartedAt,
      }),
      /constraint failed/i,
    );
    await assert.rejects(
      database
        .prepare(
          `insert into abuse_rate_limits (
             scope, subject_key_hash, window_started_at, window_expires_at,
             request_count, last_request_at
           ) values ('data_request_operator_identity', ?, ?, ?, 1, ?)`,
        )
        .bind(
          "7".repeat(64),
          windowStartedAt,
          windowStartedAt,
          windowStartedAt,
        )
        .run(),
      /constraint failed/i,
    );

    const indexes = await database
      .prepare("pragma index_list('abuse_rate_limits')")
      .all();
    assert.equal(
      indexes.results.some(
        (index) => index.name === "abuse_rate_limits_expires_idx",
      ),
      true,
    );
    const table = await database
      .prepare(
        "select sql from sqlite_master where type = 'table' and name = 'abuse_rate_limits'",
      )
      .first();
    assert.match(table.sql, /data_request_operator_network/);
    assert.match(table.sql, /data_request_operator_identity/);
    assert.match(table.sql, /abuse_rate_limits_hash_check/);
    assert.match(table.sql, /abuse_rate_limits_window_check/);
    assert.deepEqual(
      (await database.prepare("pragma foreign_key_check").all()).results,
      [],
    );
  },
);

test(
  "share-close abuse-scope migration preserves prior counters and constraints",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({}, { migrationThroughIndex: 9 });
    context.after(() => worker.dispose());
    const database = await worker.database();
    const windowStartedAt = 1_786_203_000_000;
    const priorRows = [
      ["share_exchange_network", "8".repeat(64), 4],
      ["data_request_operator_identity", "9".repeat(64), 2],
    ];
    for (const [scope, hash, requestCount] of priorRows) {
      await insertCounter(database, {
        scope,
        hash,
        requestCount,
        windowStartedAt,
      });
    }

    await applyMigration(database, closeMigrationUrl);

    const preserved = await database
      .prepare(
        `select scope, subject_key_hash, window_started_at,
                window_expires_at, request_count, last_request_at
           from abuse_rate_limits
          order by scope`,
      )
      .all();
    assert.deepEqual(
      preserved.results,
      [...priorRows]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([scope, hash, requestCount]) => ({
          scope,
          subject_key_hash: hash,
          window_started_at: windowStartedAt,
          window_expires_at: windowStartedAt + 300_000,
          request_count: requestCount,
          last_request_at: windowStartedAt + 1_000,
        })),
    );

    await insertCounter(database, {
      scope: "share_close_network",
      hash: "a".repeat(64),
      requestCount: 1,
      windowStartedAt,
    });
    await insertCounter(database, {
      scope: "share_close_session",
      hash: "b".repeat(64),
      requestCount: 1,
      windowStartedAt,
    });
    await assert.rejects(
      insertCounter(database, {
        scope: "unknown_close_scope",
        hash: "c".repeat(64),
        requestCount: 1,
        windowStartedAt,
      }),
      /constraint failed/i,
    );

    const table = await database
      .prepare(
        "select sql from sqlite_master where type = 'table' and name = 'abuse_rate_limits'",
      )
      .first();
    assert.match(table.sql, /share_close_network/);
    assert.match(table.sql, /share_close_session/);
    assert.deepEqual(
      (await database.prepare("pragma foreign_key_check").all()).results,
      [],
    );
  },
);

async function applyMigration(database, migrationUrl) {
  const migration = await readFile(migrationUrl, "utf8");
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  return database.batch(
    statements.map((statement) => database.prepare(statement)),
  );
}

function insertCounter(
  database,
  { scope, hash, requestCount, windowStartedAt },
) {
  return database
    .prepare(
      `insert into abuse_rate_limits (
         scope, subject_key_hash, window_started_at, window_expires_at,
         request_count, last_request_at
       ) values (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      scope,
      hash,
      windowStartedAt,
      windowStartedAt + 300_000,
      requestCount,
      windowStartedAt + 1_000,
    )
    .run();
}
