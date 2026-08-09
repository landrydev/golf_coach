import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  identityHeaders,
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

    // The network rule uses aligned 60-second windows. Keep this atomicity
    // burst away from a real wall-clock rollover; otherwise a later request can
    // legitimately delete the expired prior-window network row while the
    // 5-minute capability window remains active, making the final inspection
    // time-dependent even though the enforced 12/8 response split is correct.
    const networkWindowOffset = Date.now() % 60_000;
    if (networkWindowOffset >= 30_000) {
      await delay(60_000 - networkWindowOffset + 50);
    }
    const stableNetworkWindowStartedAt =
      Math.floor(Date.now() / 60_000) * 60_000;

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
    assert.equal(
      Math.floor(Date.now() / 60_000) * 60_000,
      stableNetworkWindowStartedAt,
      "The concurrent atomicity fixture must remain within one network-limit window.",
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

test(
  "operator reads are independently bounded by pseudonymous identity and network",
  { timeout: 120_000 },
  async (context) => {
    const identityWorker = await startD1Worker();
    context.after(() => identityWorker.dispose());
    const operatorEmail = "coach.a@example.test";
    const identityResponses = [];
    for (let index = 1; index <= 31; index += 1) {
      identityResponses.push(
        await identityWorker.dispatch("/api/operations/data-requests", {
          headers: {
            ...identityHeaders(operatorEmail, "Coach Avery"),
            "cf-connecting-ip": `192.0.2.${index}`,
          },
        }),
      );
    }
    assert.deepEqual(
      identityResponses.map((response) => response.status),
      [...Array.from({ length: 30 }, () => 200), 429],
    );
    assert.equal(
      (await identityResponses[30].json()).error.code,
      "rate_limit_exceeded",
    );
    assert.ok(Number(identityResponses[30].headers.get("retry-after")) >= 1);

    const identityInspection = await identityWorker.inspect([
      {
        sql: `select scope, subject_key_hash, request_count
                from abuse_rate_limits
               where scope in ('data_request_operator_identity',
                               'data_request_operator_network')
               order by scope, subject_key_hash`,
      },
      {
        sql: `select actor_reference, metadata
                from audit_events
               where action = 'data_request.operator_queue_viewed'`,
      },
    ]);
    const identityRows = identityInspection[0].results.filter(
      (row) => row.scope === "data_request_operator_identity",
    );
    const identityNetworkRows = identityInspection[0].results.filter(
      (row) => row.scope === "data_request_operator_network",
    );
    assert.deepEqual(
      identityRows.map((row) => row.request_count),
      [31],
    );
    assert.equal(identityNetworkRows.length, 31);
    assert.equal(
      identityNetworkRows.every((row) => row.request_count === 1),
      true,
    );
    assert.equal(identityInspection[1].results.length, 30);
    assertPseudonymousOperatorEvidence(
      identityInspection,
      [
        operatorEmail,
        ...Array.from({ length: 31 }, (_, index) => `192.0.2.${index + 1}`),
      ],
    );

    const operatorDigests = [
      "ad983660ee984c51d7ff905082da25469c8a35d3c0998e7cfe5d410d62c2c22a",
      "93b6a4dfd63a6d88f7be18eb5e5fd2528af444e19d1dac773cb9e2e703a123d7",
      "3e19832424e8ae1fc4cac11ca9f4d6c8971f36b118ba047c94127b3c3b2e2a11",
    ];
    const networkWorker = await startD1Worker({
      DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: operatorDigests.join(","),
    });
    context.after(() => networkWorker.dispose());
    const identities = [
      ["coach.a@example.test", "Coach Avery"],
      ["coach.b@example.test", "Coach Blair"],
      ["atomic.coach@example.test", "Atomic Coach"],
    ];
    const sharedAddress = "198.51.100.77";
    const networkResponses = [];
    for (let round = 0; round < 20; round += 1) {
      for (const [email, name] of identities) {
        networkResponses.push(
          await networkWorker.dispatch("/api/operations/data-requests", {
            headers: {
              ...identityHeaders(email, name),
              "cf-connecting-ip": sharedAddress,
            },
          }),
        );
      }
    }
    networkResponses.push(
      await networkWorker.dispatch("/api/operations/data-requests", {
        headers: {
          ...identityHeaders(...identities[0]),
          "cf-connecting-ip": sharedAddress,
        },
      }),
    );
    assert.equal(
      networkResponses.slice(0, 60).every((response) => response.status === 200),
      true,
    );
    assert.equal(networkResponses[60].status, 429);
    assert.equal(
      (await networkResponses[60].json()).error.code,
      "rate_limit_exceeded",
    );

    const networkInspection = await networkWorker.inspect([
      {
        sql: `select scope, subject_key_hash, request_count
                from abuse_rate_limits
               where scope in ('data_request_operator_identity',
                               'data_request_operator_network')
               order by scope, request_count, subject_key_hash`,
      },
      {
        sql: `select actor_reference, metadata
                from audit_events
               where action = 'data_request.operator_queue_viewed'`,
      },
    ]);
    const sharedNetworkRows = networkInspection[0].results.filter(
      (row) => row.scope === "data_request_operator_network",
    );
    const sharedIdentityRows = networkInspection[0].results.filter(
      (row) => row.scope === "data_request_operator_identity",
    );
    assert.deepEqual(
      sharedNetworkRows.map((row) => row.request_count),
      [61],
    );
    assert.deepEqual(
      sharedIdentityRows.map((row) => row.request_count),
      [20, 20, 21],
    );
    assert.equal(networkInspection[1].results.length, 60);
    assertPseudonymousOperatorEvidence(networkInspection, [
      sharedAddress,
      ...identities.map(([email]) => email),
    ]);
  },
);

test("every selected high-risk route invokes its dedicated abuse-control scope", async () => {
  const routes = {
    "r/session": "shareExchangeNetwork|shareExchangeCapability|shareCloseNetwork|shareCloseSession",
    "r/response": "shareResponseNetwork|shareResponseCapability",
    "api/plans/[planId]/publish": "planPublishAccount",
    "api/plans/[planId]/publish/replace-inaccessible": "planPublishAccount",
    "api/plans/[planId]/publish/reissue": "planPublishAccount",
    "api/account/shares": "shareRevokeAccount",
    "api/account/shares/[shareId]": "shareRevokeAccount",
    "api/shares/[shareId]": "shareRevokeAccount",
    "api/billing/checkout": "billingCheckoutAccount",
    "api/billing/portal": "billingPortalAccount",
    "api/billing/reconcile": "billingReconcileAccount",
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

  const sessionRoute = await readFile(
    new URL("../app/r/session/route.ts", import.meta.url),
    "utf8",
  );
  const closeRoute = sessionRoute.slice(
    sessionRoute.indexOf("export async function DELETE"),
  );
  assert.match(
    closeRoute,
    /ABUSE_LIMITS\.shareCloseNetwork[\s\S]*readJson[\s\S]*ABUSE_LIMITS\.shareCloseSession[\s\S]*endShareSession/,
  );
});

test("every operator read and transition is limited before inventory or audit work", async () => {
  const [queueRoute, detailRoute, sharedRoute] = await Promise.all([
    readFile(
      new URL("../app/api/operations/data-requests/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/operations/data-requests/[requestId]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/operations/data-requests/_shared.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(sharedRoute, /ABUSE_LIMITS\.dataRequestOperatorNetwork/);
  assert.match(sharedRoute, /ABUSE_LIMITS\.dataRequestOperatorIdentity/);
  assert.match(sharedRoute, /enforceAbuseLimit\(/);
  assert.match(
    queueRoute,
    /parseDataRequestOperatorPage\(request\)[\s\S]*enforceDataRequestOperatorAbuseLimits\(request, operatorDigest\)[\s\S]*listDataRequestOperatorQueue\(/,
  );
  assert.match(
    detailRoute,
    /enforceDataRequestOperatorAbuseLimits\(request, operatorDigest\)[\s\S]*getDataRequestOperatorDetail\(/,
  );
  const patchSource = detailRoute.slice(
    detailRoute.indexOf("export async function PATCH"),
  );
  assert.match(
    patchSource,
    /enforceDataRequestOperatorAbuseLimits\(request, operatorDigest\)[\s\S]*validatedOperatorIdempotencyKey\(request\)[\s\S]*transitionDataRequestOperatorStatus\(/,
  );
});

function assertPseudonymousOperatorEvidence(inspection, rawValues) {
  const serialized = JSON.stringify(inspection);
  for (const value of rawValues) {
    assert.equal(serialized.includes(value), false);
  }
  for (const row of inspection[0].results) {
    assert.match(row.subject_key_hash, /^[0-9a-f]{64}$/);
  }
  for (const event of inspection[1].results) {
    assert.match(event.actor_reference, /^[0-9a-f]{64}$/);
  }
}
