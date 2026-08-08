import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

const testAddress = "2001:db8::42";

test(
  "D1 atomically limits concurrent capability guesses without storing raw subjects",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const rawGuess = "synthetic-private-capability-guess";

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        worker.dispatch("/r/session", {
          method: "POST",
          headers: {
            "cf-connecting-ip": testAddress,
            "content-type": "application/json",
            origin: testOrigin,
            "sec-fetch-site": "same-origin",
          },
          body: JSON.stringify({ token: rawGuess }),
        }),
      ),
    );

    assert.equal(responses.filter((response) => response.status === 404).length, 12);
    assert.equal(responses.filter((response) => response.status === 429).length, 8);
    for (const response of responses.filter((item) => item.status === 429)) {
      const retryAfter = Number(response.headers.get("retry-after"));
      assert.ok(Number.isInteger(retryAfter));
      assert.ok(retryAfter >= 1 && retryAfter <= 300);
      assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
      assert.deepEqual(await response.json(), {
        error: {
          code: "rate_limit_exceeded",
          message: "Too many requests. Try again after the indicated delay.",
        },
      });
    }

    const inspection = await worker.inspect([
      {
        sql: "select scope, subject_key_hash, request_count, window_started_at, window_expires_at from abuse_rate_limits order by scope",
      },
    ]);
    const rows = inspection[0].results;
    assert.deepEqual(
      rows.map((row) => row.scope),
      ["share_exchange_capability", "share_exchange_network"],
    );
    assert.deepEqual(
      rows.map((row) => row.request_count),
      [20, 20],
    );
    for (const row of rows) {
      assert.match(row.subject_key_hash, /^[0-9a-f]{64}$/);
      assert.ok(row.window_expires_at > row.window_started_at);
    }
    const persisted = JSON.stringify(rows);
    assert.doesNotMatch(persisted, new RegExp(rawGuess, "i"));
    assert.equal(persisted.includes(testAddress), false);
  },
);

test(
  "authenticated exports are bounded per account and return a truthful retry delay",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const headers = {
      ...writeHeaders("limit.test@example.test", "Limit Test Coach"),
      "cf-connecting-ip": "192.0.2.42",
    };

    const responses = [];
    for (let index = 0; index < 4; index += 1) {
      responses.push(
        await worker.dispatch("/api/data-export", {
          method: "POST",
          headers,
          body: "{}",
        }),
      );
    }

    assert.deepEqual(
      responses.map((response) => response.status),
      [200, 200, 200, 429],
    );
    const retryAfter = Number(responses[3].headers.get("retry-after"));
    assert.ok(Number.isInteger(retryAfter));
    assert.ok(retryAfter >= 1 && retryAfter <= 3_600);
    assert.equal((await responses[3].json()).error.code, "rate_limit_exceeded");

    const inspection = await worker.inspect([
      {
        sql: "select scope, subject_key_hash, request_count from abuse_rate_limits where scope = 'data_export_account'",
      },
      {
        sql: "select count(*) as count from data_requests where request_type = 'export' and identity_verified_at is not null",
      },
    ]);
    assert.equal(inspection[0].results.length, 1);
    assert.match(inspection[0].results[0].subject_key_hash, /^[0-9a-f]{64}$/);
    assert.equal(inspection[0].results[0].request_count, 4);
    assert.doesNotMatch(
      JSON.stringify(inspection[0].results),
      /limit\.test@example\.test/i,
    );
    assert.equal(inspection[1].results[0].count, 0);
  },
);

test("every selected high-risk route invokes its dedicated abuse-control scope", async () => {
  const routes = {
    "r/session": "shareExchangeNetwork|shareExchangeCapability",
    "r/response": "shareResponseNetwork|shareResponseCapability",
    "api/plans/[planId]/publish": "planPublishAccount",
    "api/shares/[shareId]": "shareRevokeAccount",
    "api/billing/checkout": "billingCheckoutAccount",
    "api/billing/portal": "billingPortalAccount",
    "api/data-export": "dataExportAccount",
    "api/data-requests": "dataRequestAccount",
  };

  for (const [route, expectedScopes] of Object.entries(routes)) {
    const source = await readFile(
      new URL(`../app/${route}/route.ts`, import.meta.url),
      "utf8",
    );
    assert.match(source, /enforceAbuseLimit\(/);
    for (const scope of expectedScopes.split("|")) {
      assert.match(source, new RegExp(`ABUSE_LIMITS\\.${scope}`));
    }
  }
});
