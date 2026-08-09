import assert from "node:assert/strict";
import test from "node:test";
import {
  identityHeaders,
  startD1Worker,
  testOrigin,
} from "./support/d1-worker.mjs";

const owner = {
  email: "coach.a@example.test",
  name: "Scheduler Operator",
};
const releaseId = "scheduler-heartbeat-test-release";

test(
  "disabled billing still records a successful scheduler heartbeat behind operator access",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker(
      {
        BILLING_CHECKOUT_ENABLED: "false",
        RELEASE_ID: releaseId,
      },
      { triggerHandlers: true },
    );
    context.after(() => worker.dispose());

    const anonymous = await worker.dispatch("/api/operations/health");
    assert.equal(anonymous.status, 401);
    assertPrivate(anonymous);

    const unknown = await worker.dispatch("/api/operations/health", {
      headers: identityHeaders(
        "not.allowed@example.test",
        "Unknown Instructor",
      ),
    });
    assert.equal(unknown.status, 403);
    assertPrivate(unknown);

    const before = await operationalHealth(worker);
    assert.equal(before.response.status, 503);
    assert.equal(before.body.status, "degraded");
    assert.equal(before.body.scheduler.state, "never_run");
    assert.equal(before.body.scheduler.stale, true);

    const scheduled = await worker.dispatchScheduled();
    assert.equal(scheduled.status, 200);

    const [stored] = await worker.inspect([
      {
        sql: `select scheduler_key, release_id, state, started_at,
          completed_at, billing_configured, considered_count, attempted_count,
          succeeded_count, failed_count, dead_letter_count, last_failure_code
          from scheduler_heartbeat`,
      },
    ]);
    assert.equal(stored.results.length, 1);
    assert.deepEqual(
      {
        scheduler_key: stored.results[0].scheduler_key,
        release_id: stored.results[0].release_id,
        state: stored.results[0].state,
        billing_configured: stored.results[0].billing_configured,
        considered_count: stored.results[0].considered_count,
        attempted_count: stored.results[0].attempted_count,
        succeeded_count: stored.results[0].succeeded_count,
        failed_count: stored.results[0].failed_count,
        dead_letter_count: stored.results[0].dead_letter_count,
        last_failure_code: stored.results[0].last_failure_code,
      },
      {
        scheduler_key: "billing_reconciliation",
        release_id: releaseId,
        state: "succeeded",
        billing_configured: 0,
        considered_count: 0,
        attempted_count: 0,
        succeeded_count: 0,
        failed_count: 0,
        dead_letter_count: 0,
        last_failure_code: null,
      },
    );
    assert.ok(stored.results[0].started_at > 0);
    assert.ok(stored.results[0].completed_at >= stored.results[0].started_at);

    const after = await operationalHealth(worker);
    assert.equal(after.response.status, 200);
    assert.equal(after.body.status, "ready");
    assert.equal(after.body.releaseId, releaseId);
    const { ageSeconds, ...schedulerWithoutAge } = after.body.scheduler;
    assert.ok(ageSeconds >= 0 && ageSeconds <= 5);
    assert.deepEqual(schedulerWithoutAge, {
      state: "succeeded",
      releaseId,
      releaseCurrent: true,
      startedAt: new Date(stored.results[0].started_at).toISOString(),
      completedAt: new Date(stored.results[0].completed_at).toISOString(),
      stale: false,
      billingConfigured: false,
      result: {
        considered: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        deadLetterCount: 0,
      },
      lastFailureCode: null,
    });
    assert.deepEqual(after.body.billingReconciliation, {
      deadLetterCount: 0,
      oldestDeadLetterAgeSeconds: null,
      overdueAccountCount: 0,
      overdueAccountCountIsLowerBound: false,
      oldestOverdueAgeSeconds: null,
    });
    assertSafeOperationalPayload(after.body);

    const publicHealth = await worker.dispatch("/api/health");
    const publicBody = await publicHealth.json();
    assert.equal(Object.hasOwn(publicBody, "scheduler"), false);
    assert.equal(Object.hasOwn(publicBody, "billingReconciliation"), false);
    assert.equal(JSON.stringify(publicBody).includes("deadLetter"), false);
    assert.equal(Object.hasOwn(publicBody, "application"), false);
    assert.doesNotMatch(
      JSON.stringify(publicBody),
      /writeControl|applicationWrites|APPLICATION_WRITE_MODE/i,
    );
  },
);

test(
  "frozen or invalid write policy skips scheduled D1 and provider work",
  { timeout: 120_000 },
  async () => {
    const cases = [
      {
        label: "frozen",
        bindings: { APPLICATION_WRITE_MODE: "frozen" },
        runtimeOptions: {},
        expectedState: "frozen",
      },
      {
        label: "missing",
        bindings: {},
        runtimeOptions: { applicationWriteModeDefault: false },
        expectedState: "invalid",
      },
      {
        label: "padded",
        bindings: { APPLICATION_WRITE_MODE: " enabled " },
        runtimeOptions: {},
        expectedState: "invalid",
      },
    ];

    for (const testCase of cases) {
      let providerCalls = 0;
      const priceId = `price_write_control_${testCase.label}`;
      const worker = await startD1Worker(
        {
          BILLING_CHECKOUT_ENABLED: "false",
          RELEASE_ID: releaseId,
          STRIPE_CHECKOUT_PRICE_ID: priceId,
          STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS: "3600",
          STRIPE_RECOGNIZED_PRICE_IDS: priceId,
          STRIPE_SECRET_KEY: "sk_test_write_control_synthetic_only",
          STRIPE_WEBHOOK_SECRET: "whsec_write_control_synthetic_only",
          SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: priceId,
          SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
          ...testCase.bindings,
        },
        {
          triggerHandlers: true,
          outboundService: async () => {
            providerCalls += 1;
            return Response.json(
              { error: { code: "unexpected_provider_call" } },
              { status: 500 },
            );
          },
          ...testCase.runtimeOptions,
        },
      );
      try {
        const accountId = `account-write-control-${testCase.label}`;
        const customerId = `cus_write_control_${testCase.label}`;
        const subscriptionId = `sub_write_control_${testCase.label}`;
        const lastProviderSyncAt = Date.now() - 7_200_000;
        await worker.inspect([
          {
            sql: `insert into accounts (
              id, auth_provider, auth_subject, primary_email,
              normalized_email, status
            ) values (?, 'siwc', ?, ?, ?, 'active')`,
            params: [
              accountId,
              `write-control-${testCase.label}@example.test`,
              `write-control-${testCase.label}@example.test`,
              `write-control-${testCase.label}@example.test`,
            ],
          },
          {
            sql: `insert into billing_customers (
              provider, provider_customer_id, account_id
            ) values ('stripe', ?, ?)`,
            params: [customerId, accountId],
          },
          {
            sql: `insert into subscriptions (
              id, account_id, provider, provider_customer_id,
              provider_subscription_id, provider_price_id, product_code,
              status, billing_interval, currency, unit_amount_minor,
              last_provider_sync_at, projection_revision
            ) values (?, ?, 'stripe', ?, ?, ?, 'solo', 'active', 'month',
              'CAD', 7500, ?, 1)`,
            params: [
              `subscription-write-control-${testCase.label}`,
              accountId,
              customerId,
              subscriptionId,
              priceId,
              lastProviderSyncAt,
            ],
          },
        ]);

        const scheduled = await worker.dispatchScheduled();
        assert.equal(scheduled.status, 200);
        assert.equal(providerCalls, 0);

        const inspected = await worker.inspect([
          { sql: "select count(*) as count from scheduler_heartbeat" },
          {
            sql: "select count(*) as count from billing_reconciliation_targets",
          },
          { sql: "select count(*) as count from billing_events" },
          { sql: "select count(*) as count from audit_events" },
          {
            sql: `select projection_revision, last_provider_sync_at
              from subscriptions where account_id = ?`,
            params: [accountId],
          },
        ]);
        assert.deepEqual(
          inspected.slice(0, 4).map((result) => result.results[0].count),
          [0, 0, 0, 0],
        );
        assert.deepEqual(inspected[4].results, [
          {
            projection_revision: 1,
            last_provider_sync_at: lastProviderSyncAt,
          },
        ]);

        const health = await operationalHealth(worker);
        assert.equal(health.response.status, 503);
        assert.deepEqual(health.body.application.writeControl, {
          state: testCase.expectedState,
        });
        assert.equal(
          health.body.application.checks.applicationWritesEnabled,
          false,
        );
      } finally {
        await worker.dispose();
      }
    }
  },
);

test(
  "missing or malformed release identity can never make scheduler health ready",
  { timeout: 60_000 },
  async () => {
    const cases = [
      { bindings: {}, expectedReleaseId: "unversioned" },
      {
        bindings: { RELEASE_ID: "release id with spaces" },
        expectedReleaseId: "invalid_release_id",
      },
    ];

    for (const testCase of cases) {
      const worker = await startD1Worker(
        {
          BILLING_CHECKOUT_ENABLED: "false",
          ...testCase.bindings,
        },
        { triggerHandlers: true },
      );
      try {
        assert.equal((await worker.dispatchScheduled()).status, 200);
        const health = await operationalHealth(worker);
        assert.equal(health.response.status, 503);
        assert.equal(health.body.status, "degraded");
        assert.equal(health.body.releaseId, testCase.expectedReleaseId);
        assert.equal(health.body.scheduler.releaseId, testCase.expectedReleaseId);
        assert.equal(health.body.scheduler.releaseCurrent, false);
        assertSafeOperationalPayload(health.body);
      } finally {
        await worker.dispose();
      }
    }
  },
);

test(
  "a completed sweep with failed work remains degraded before dead-lettering",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker(
      {
        BILLING_CHECKOUT_ENABLED: "false",
        RELEASE_ID: releaseId,
      },
      { triggerHandlers: true },
    );
    context.after(() => worker.dispose());
    assert.equal((await worker.dispatchScheduled()).status, 200);

    await worker.inspect([
      {
        sql: `update scheduler_heartbeat
                 set considered_count = 1,
                     attempted_count = 1,
                     succeeded_count = 0,
                     failed_count = 1,
                     dead_letter_count = 0
               where scheduler_key = 'billing_reconciliation'
                 and state = 'succeeded'`,
      },
    ]);

    const health = await operationalHealth(worker);
    assert.equal(health.response.status, 503);
    assert.equal(health.body.status, "degraded");
    assert.equal(health.body.scheduler.state, "succeeded");
    assert.equal(health.body.scheduler.releaseCurrent, true);
    assert.deepEqual(health.body.scheduler.result, {
      considered: 1,
      attempted: 1,
      succeeded: 0,
      failed: 1,
      deadLetterCount: 0,
    });
    assert.equal(health.body.billingReconciliation.deadLetterCount, 0);
    assertSafeOperationalPayload(health.body);
  },
);

test(
  "scheduler health detects and drains actionable work beyond the 12-account sweep",
  { timeout: 120_000 },
  async (context) => {
    const priceId = "price_scheduler_backlog_test";
    const createdSeconds = Math.floor(Date.now() / 1_000) - 3_600;
    const expiresSeconds = createdSeconds + 24 * 60 * 60;
    const providerCalls = [];
    const worker = await startD1Worker(
      {
        BILLING_CHECKOUT_ENABLED: "false",
        RELEASE_ID: releaseId,
        STRIPE_SECRET_KEY: "sk_test_scheduler_backlog_synthetic_only",
        STRIPE_WEBHOOK_SECRET: "whsec_scheduler_backlog_synthetic_only",
        STRIPE_CHECKOUT_PRICE_ID: priceId,
        STRIPE_RECOGNIZED_PRICE_IDS: priceId,
        SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: priceId,
        SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
        STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS: "3600",
      },
      {
        triggerHandlers: true,
        outboundService: async (request) => {
          const path = new URL(request.url).pathname;
          const match = path.match(/^\/v1\/checkout\/sessions\/cs_backlog_(\d{2})$/);
          assert.ok(match, `unexpected provider path ${path}`);
          providerCalls.push(path);
          const suffix = match[1];
          return Response.json({
            id: `cs_backlog_${suffix}`,
            mode: "subscription",
            status: "open",
            url: null,
            client_reference_id: `backlog_account_${suffix}`,
            customer: null,
            subscription: null,
            created: createdSeconds,
            expires_at: expiresSeconds,
            metadata: {
              account_id: `backlog_account_${suffix}`,
              checkout_attempt_id: `backlog_attempt_${suffix}`,
              price_id: priceId,
            },
          });
        },
      },
    );
    context.after(() => worker.dispose());

    const overdueAt = Date.now() - 30 * 60 * 1_000;
    await worker.inspect([
      {
        sql: `with recursive sequence(n) as (
          select 1 union all select n + 1 from sequence where n < 13
        ) insert into accounts (
          id, auth_provider, auth_subject, primary_email, normalized_email,
          status, created_at, updated_at
        ) select printf('backlog_account_%02d', n), 'siwc',
          printf('backlog_subject_%02d', n),
          printf('backlog-%02d@example.test', n),
          printf('backlog-%02d@example.test', n),
          'active', ?, ? from sequence`,
        params: [overdueAt, overdueAt],
      },
      {
        sql: `with recursive sequence(n) as (
          select 1 union all select n + 1 from sequence where n < 13
        ) insert into billing_checkout_attempts (
          id, account_id, provider, state, request_version, idempotency_key,
          provider_price_id, application_origin, customer_email,
          provider_expires_at, provider_session_id, provider_created_at,
          created_at, updated_at
        ) select printf('backlog_attempt_%02d', n),
          printf('backlog_account_%02d', n), 'stripe', 'open', 1,
          printf('backlog-key-%02d', n), ?, ?,
          printf('backlog-%02d@example.test', n), ?,
          printf('cs_backlog_%02d', n), ?, ?, ? from sequence`,
        params: [
          priceId,
          testOrigin,
          expiresSeconds * 1_000,
          createdSeconds * 1_000,
          overdueAt,
          overdueAt,
        ],
      },
    ]);

    const boundedBacklog = await operationalHealth(worker);
    assert.equal(boundedBacklog.response.status, 503);
    assert.equal(boundedBacklog.body.scheduler.state, "never_run");
    assert.equal(
      boundedBacklog.body.billingReconciliation.overdueAccountCount,
      13,
    );
    assert.equal(
      boundedBacklog.body.billingReconciliation
        .overdueAccountCountIsLowerBound,
      true,
    );
    assert.ok(
      boundedBacklog.body.billingReconciliation.oldestOverdueAgeSeconds >=
        1_800,
    );
    assertSafeOperationalPayload(boundedBacklog.body);

    assert.equal((await worker.dispatchScheduled()).status, 200);
    assert.equal(providerCalls.length, 12);

    const backlogged = await operationalHealth(worker);
    assert.equal(backlogged.response.status, 503);
    assert.equal(backlogged.body.status, "degraded");
    assert.deepEqual(backlogged.body.scheduler.result, {
      considered: 12,
      attempted: 12,
      succeeded: 12,
      failed: 0,
      deadLetterCount: 0,
    });
    assert.equal(
      backlogged.body.billingReconciliation.overdueAccountCount,
      1,
    );
    assert.equal(
      backlogged.body.billingReconciliation.overdueAccountCountIsLowerBound,
      false,
    );
    assert.ok(
      backlogged.body.billingReconciliation.oldestOverdueAgeSeconds >= 1_800,
    );
    assertSafeOperationalPayload(backlogged.body);

    assert.equal((await worker.dispatchScheduled()).status, 200);
    assert.equal(providerCalls.length, 13);
    const drained = await operationalHealth(worker);
    assert.equal(drained.response.status, 200);
    assert.equal(drained.body.status, "ready");
    assert.deepEqual(drained.body.billingReconciliation, {
      deadLetterCount: 0,
      oldestDeadLetterAgeSeconds: null,
      overdueAccountCount: 0,
      overdueAccountCountIsLowerBound: false,
      oldestOverdueAgeSeconds: null,
    });
  },
);

test(
  "operational health exposes only the aggregate dead-letter count and age",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker(
      {
        BILLING_CHECKOUT_ENABLED: "false",
        RELEASE_ID: releaseId,
      },
      { triggerHandlers: true },
    );
    context.after(() => worker.dispose());
    assert.equal((await worker.dispatchScheduled()).status, 200);

    const profile = await worker.dispatch("/api/profile", {
      headers: identityHeaders(owner.email, owner.name),
    });
    assert.equal(profile.status, 200);
    const [account] = await worker.inspect([
      {
        sql: "select id from accounts where normalized_email = ?",
        params: [owner.email],
      },
    ]);
    const accountId = account.results[0].id;
    const deadLetteredAt = Date.now() - 120_000;
    const createdAt = deadLetteredAt - 60_000;
    await worker.inspect([
      {
        sql: `insert into billing_checkout_attempts (
          id, account_id, provider, state, request_version, idempotency_key,
          provider_price_id, application_origin, provider_customer_id,
          customer_email, provider_session_id, provider_created_at,
          provider_expires_at, created_at, updated_at
        ) values (?, ?, 'stripe', 'open', 1, ?, ?, ?, null, ?, ?, ?, ?, ?, ?)`,
        params: [
          "attempt_operational_dead_letter",
          accountId,
          "roadmap-checkout-v1-operational-dead-letter",
          "price_operational_health",
          testOrigin,
          owner.email,
          "cs_operational_dead_letter",
          createdAt,
          createdAt + 3_600_000,
          createdAt,
          createdAt,
        ],
      },
      {
        sql: `insert into billing_reconciliation_targets (
          id, account_id, provider, checkout_attempt_id, state,
          lease_token, lease_expires_at, last_attempt_at, processing_attempts,
          automatic_failure_count, next_automatic_attempt_at,
          automatic_dead_lettered_at, last_error_code, last_error_message,
          last_completed_at, last_succeeded_at, created_at, updated_at
        ) values (?, ?, 'stripe', ?, 'failed', null, null, ?, 8, 8, null,
          ?, 'provider_read_failed', ?, ?, null, ?, ?)`,
        params: [
          "reconciliation_operational_dead_letter",
          accountId,
          "attempt_operational_dead_letter",
          deadLetteredAt,
          deadLetteredAt,
          "private provider detail must never leave D1",
          deadLetteredAt,
          createdAt,
          deadLetteredAt,
        ],
      },
    ]);

    const health = await operationalHealth(worker);
    assert.equal(health.response.status, 503);
    assert.equal(health.body.status, "degraded");
    assert.equal(health.body.billingReconciliation.deadLetterCount, 1);
    assert.ok(
      health.body.billingReconciliation.oldestDeadLetterAgeSeconds >= 120,
    );
    assert.equal(health.body.scheduler.result.deadLetterCount, 0);
    assertSafeOperationalPayload(health.body);
  },
);

test(
  "subscription access never turns authenticated customers into operators",
  { timeout: 60_000 },
  async (context) => {
    const priceId = "price_operator_boundary_test";
    const worker = await startD1Worker({
      INSTRUCTOR_ACCESS_MODE: "subscription_required",
      SUBSCRIPTION_ACCESS_STATUSES: "active",
      STRIPE_CHECKOUT_PRICE_ID: priceId,
      STRIPE_RECOGNIZED_PRICE_IDS: priceId,
      SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: priceId,
      SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
      BILLING_CHECKOUT_ENABLED: "false",
      RELEASE_ID: releaseId,
    });
    context.after(() => worker.dispose());

    const customer = await worker.dispatch("/api/operations/health", {
      headers: identityHeaders(
        "not.allowed@example.test",
        "Authenticated Customer",
      ),
    });
    assert.equal(customer.status, 403);
    assert.equal((await customer.json()).error.code, "operator_access_denied");
    assertPrivate(customer);

    const operator = await operationalHealth(worker);
    assert.equal(operator.response.status, 503);
    assert.equal(operator.body.scheduler.state, "never_run");
  },
);

test(
  "a sweep exception is persisted as a safe failed heartbeat and remains fail-closed",
  { timeout: 60_000 },
  async (context) => {
    const priceId = "price_scheduler_failure_test";
    const worker = await startD1Worker(
      {
        BILLING_CHECKOUT_ENABLED: "false",
        RELEASE_ID: releaseId,
        STRIPE_SECRET_KEY: "sk_test_scheduler_failure_synthetic_only",
        STRIPE_WEBHOOK_SECRET: "whsec_scheduler_failure_synthetic_only",
        STRIPE_CHECKOUT_PRICE_ID: priceId,
        STRIPE_RECOGNIZED_PRICE_IDS: priceId,
        SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: priceId,
        SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
        STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS: "3600",
      },
      { triggerHandlers: true },
    );
    context.after(() => worker.dispose());
    await worker.inspect([
      {
        sql: `alter table billing_checkout_attempts
          rename to billing_checkout_attempts_unavailable`,
      },
    ]);

    let failedClosed = false;
    try {
      const scheduled = await worker.dispatchScheduled();
      failedClosed = scheduled.status >= 500;
    } catch {
      failedClosed = true;
    }
    assert.equal(failedClosed, true);

    const [stored] = await worker.inspect([
      {
        sql: `select state, release_id, completed_at, last_failure_code,
          billing_configured, considered_count, attempted_count,
          succeeded_count, failed_count, dead_letter_count
          from scheduler_heartbeat`,
      },
    ]);
    assert.deepEqual(stored.results, [
      {
        state: "failed",
        release_id: releaseId,
        completed_at: stored.results[0].completed_at,
        last_failure_code: "billing_reconciliation_sweep_failed",
        billing_configured: null,
        considered_count: null,
        attempted_count: null,
        succeeded_count: null,
        failed_count: null,
        dead_letter_count: null,
      },
    ]);
    assert.ok(stored.results[0].completed_at > 0);

    const health = await operationalHealth(worker);
    assert.equal(health.response.status, 503);
    assert.equal(health.body.scheduler.state, "failed");
    assert.equal(
      health.body.scheduler.lastFailureCode,
      "billing_reconciliation_sweep_failed",
    );
    assert.equal(health.body.scheduler.result, null);
    assert.deepEqual(health.body.billingReconciliation, {
      deadLetterCount: 0,
      oldestDeadLetterAgeSeconds: null,
      overdueAccountCount: null,
      overdueAccountCountIsLowerBound: null,
      oldestOverdueAgeSeconds: null,
    });
    assertSafeOperationalPayload(health.body);
  },
);

async function operationalHealth(worker) {
  const response = await worker.dispatch("/api/operations/health", {
    headers: identityHeaders(owner.email, owner.name),
  });
  assertPrivate(response);
  return { response, body: await response.json() };
}

function assertPrivate(response) {
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("x-robots-tag"),
    "noindex, nofollow, noarchive",
  );
}

function assertSafeOperationalPayload(body) {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    owner.email,
    "private provider detail",
    "sk_test_",
    "whsec_",
    "pepper",
    "accountId",
    "providerSession",
  ]) {
    assert.equal(
      serialized.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `operational payload exposed ${forbidden}`,
    );
  }
}
