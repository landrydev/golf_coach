import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startD1Worker } from "./support/d1-worker.mjs";

const migrationUrl = new URL(
  "../drizzle/0003_condemned_brood.sql",
  import.meta.url,
);

test(
  "billing migration backfills unambiguous ownership and rejects ambiguous legacy data",
  { timeout: 60_000 },
  async (context) => {
    await context.test("unambiguous sequential subscriptions upgrade intact", async () => {
      const worker = await startD1Worker(
        {},
        { migrationThroughIndex: 2 },
      );
      context.after(() => worker.dispose());
      const database = await worker.database();
      await seedAccount(database, "account_upgrade", "upgrade@example.test");
      await insertLegacySubscription(database, {
        id: "subscription_upgrade_old",
        accountId: "account_upgrade",
        customerId: "cus_upgrade",
        subscriptionId: "sub_upgrade_old",
        status: "canceled",
      });
      await insertLegacySubscription(database, {
        id: "subscription_upgrade_current",
        accountId: "account_upgrade",
        customerId: "cus_upgrade",
        subscriptionId: "sub_upgrade_current",
        status: "active",
      });
      await insertLegacyBillingEvent(database, {
        id: "billing_event_upgrade",
        accountId: "account_upgrade",
        subscriptionId: "subscription_upgrade_current",
        providerEventId: "evt_upgrade",
      });

      await applyBillingMigration(database);
      const customers = await database
        .prepare(
          "select provider_customer_id, account_id from billing_customers",
        )
        .all();
      assert.deepEqual(customers.results, [
        {
          provider_customer_id: "cus_upgrade",
          account_id: "account_upgrade",
        },
      ]);
      const subscriptions = await database
        .prepare(
          "select id, provider_customer_id, status from subscriptions order by id",
        )
        .all();
      assert.deepEqual(subscriptions.results, [
        {
          id: "subscription_upgrade_current",
          provider_customer_id: "cus_upgrade",
          status: "active",
        },
        {
          id: "subscription_upgrade_old",
          provider_customer_id: "cus_upgrade",
          status: "canceled",
        },
      ]);
      const linkedEvent = await database
        .prepare(
          "select account_id, subscription_id from billing_events where id = ?",
        )
        .bind("billing_event_upgrade")
        .first();
      assert.deepEqual(linkedEvent, {
        account_id: "account_upgrade",
        subscription_id: "subscription_upgrade_current",
      });
      const foreignKeyViolations = await database
        .prepare("pragma foreign_key_check")
        .all();
      assert.deepEqual(foreignKeyViolations.results, []);

      await seedAccount(database, "account_upgrade_other", "other@example.test");
      await assert.rejects(
        database
          .prepare(
            `insert into subscriptions (
              id, account_id, provider, provider_customer_id,
              provider_subscription_id, product_code, status
            ) values (?, ?, 'stripe', ?, ?, 'solo', 'canceled')`,
          )
          .bind(
            "subscription_cross_account_rejected",
            "account_upgrade_other",
            "cus_upgrade",
            "sub_cross_account_rejected",
          )
          .run(),
        /foreign key constraint failed/i,
      );
    });

    await context.test("ambiguous customer ownership rolls the migration back", async () => {
      const worker = await startD1Worker(
        {},
        { migrationThroughIndex: 2 },
      );
      context.after(() => worker.dispose());
      const database = await worker.database();
      await seedAccount(database, "account_conflict_a", "conflict.a@example.test");
      await seedAccount(database, "account_conflict_b", "conflict.b@example.test");
      await insertLegacySubscription(database, {
        id: "subscription_conflict_a",
        accountId: "account_conflict_a",
        customerId: "cus_conflicted",
        subscriptionId: "sub_conflict_a",
        status: "canceled",
      });
      await insertLegacySubscription(database, {
        id: "subscription_conflict_b",
        accountId: "account_conflict_b",
        customerId: "cus_conflicted",
        subscriptionId: "sub_conflict_b",
        status: "canceled",
      });

      await assert.rejects(
        applyBillingMigration(database),
        /unique constraint failed/i,
      );
      const table = await database
        .prepare(
          "select count(*) as count from sqlite_master where type = 'table' and name = 'billing_customers'",
        )
        .first();
      assert.equal(table.count, 0);
      const legacyRows = await database
        .prepare("select count(*) as count from subscriptions")
        .first();
      assert.equal(legacyRows.count, 2);
    });
  },
);

async function applyBillingMigration(database) {
  const migration = await readFile(migrationUrl, "utf8");
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  return database.batch(statements.map((statement) => database.prepare(statement)));
}

function seedAccount(database, id, email) {
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

function insertLegacySubscription(database, input) {
  return database
    .prepare(
      `insert into subscriptions (
        id, account_id, provider, provider_customer_id,
        provider_subscription_id, provider_price_id, product_code, status
      ) values (?, ?, 'stripe', ?, ?, 'price_legacy_upgrade', 'solo', ?)`,
    )
    .bind(
      input.id,
      input.accountId,
      input.customerId,
      input.subscriptionId,
      input.status,
    )
    .run();
}

function insertLegacyBillingEvent(database, input) {
  return database
    .prepare(
      `insert into billing_events (
        id, account_id, subscription_id, provider, provider_event_id,
        provider_event_type, status, payload_sha256
      ) values (?, ?, ?, 'stripe', ?, 'customer.subscription.updated',
        'processed', ?)`,
    )
    .bind(
      input.id,
      input.accountId,
      input.subscriptionId,
      input.providerEventId,
      "0".repeat(64),
    )
    .run();
}
