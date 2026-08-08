import assert from "node:assert/strict";
import test from "node:test";
import {
  identityHeaders,
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

const PRICE_ID = "price_reconciliation_test";
const STRIPE_SECRET = "sk_test_reconciliation_synthetic_only";
const stripeBindings = {
  STRIPE_SECRET_KEY: STRIPE_SECRET,
  STRIPE_WEBHOOK_SECRET: "whsec_reconciliation_synthetic_only",
  STRIPE_CHECKOUT_PRICE_ID: PRICE_ID,
  STRIPE_RECOGNIZED_PRICE_IDS: PRICE_ID,
  SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: PRICE_ID,
  SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
  STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS: "3600",
  BILLING_CHECKOUT_ENABLED: "false",
};

test(
  "account reconciliation durably retries a failed provider read and applies current subscription state",
  { timeout: 60_000 },
  async (context) => {
    const identity = {
      email: "coach.a@example.test",
      name: "Coach Reconciliation",
    };
    const providerSubscriptionId = "sub_reconciliation_existing";
    const providerCustomerId = "cus_reconciliation_existing";
    let providerFails = true;
    let providerCalls = 0;
    const worker = await startD1Worker(stripeBindings, {
      outboundService: async (request) => {
        providerCalls += 1;
        const url = new URL(request.url);
        assert.equal(request.method, "GET");
        assert.equal(
          url.pathname,
          `/v1/subscriptions/${providerSubscriptionId}`,
        );
        assert.equal(
          request.headers.get("authorization"),
          `Bearer ${STRIPE_SECRET}`,
        );
        if (providerFails) {
          return Response.json(
            { error: { code: "synthetic_provider_failure" } },
            { status: 500 },
          );
        }
        return Response.json(
          stripeSubscription({
            id: providerSubscriptionId,
            customerId: providerCustomerId,
            status: "canceled",
            includeMetadata: false,
          }),
        );
      },
    });
    context.after(() => worker.dispose());

    const accountId = await createAccount(worker, identity);
    await seedSubscription(worker, {
      accountId,
      localSubscriptionId: "local_reconciliation_existing",
      providerSubscriptionId,
      providerCustomerId,
      status: "active",
    });

    const failed = await reconcile(worker, identity);
    assert.equal(failed.status, 502);
    assert.equal((await failed.json()).error.code, "billing_provider_error");
    let state = await inspectExistingSubscription(worker);
    assert.equal(state.subscription.status, "active");
    assert.equal(state.target.state, "failed");
    assert.equal(state.target.processing_attempts, 1);
    assert.equal(state.target.last_error_code, "billing_provider_error");
    assert.equal(state.target.lease_token, null);

    const browserFailure = await reconcileBrowser(worker, identity);
    assert.equal(browserFailure.status, 303);
    assert.equal(
      browserFailure.headers.get("location"),
      "/app/billing?reconcile=refresh_unavailable",
    );

    providerFails = false;
    const retried = await reconcile(worker, identity);
    assert.equal(retried.status, 303);
    assert.equal(
      retried.headers.get("location"),
      "/app/billing?reconcile=refresh_review",
    );
    assert.equal(providerCalls, 3);

    state = await inspectExistingSubscription(worker);
    assert.equal(state.subscription.status, "canceled");
    assert.equal(state.subscription.projection_revision, 2);
    assert.ok(state.subscription.last_provider_sync_at > 0);
    assert.equal(state.target.state, "succeeded");
    assert.equal(state.target.processing_attempts, 3);
    assert.equal(state.target.last_error_code, null);
    assert.equal(state.target.lease_token, null);
    assert.equal(state.auditCount, 1);
  },
);

test(
  "completed Checkout reconciliation is GET-only, tenant-scoped, and atomically completes the attempt",
  { timeout: 60_000 },
  async (context) => {
    const owner = {
      email: "coach.b@example.test",
      name: "Coach Completed Checkout",
    };
    const other = {
      email: "other.tenant@example.test",
      name: "Coach Other Tenant",
    };
    const attemptId = "attempt_reconciliation_completed";
    const sessionId = "cs_reconciliation_completed";
    const providerSubscriptionId = "sub_reconciliation_completed";
    const providerCustomerId = "cus_reconciliation_completed";
    const providerMethods = [];
    let ownerAccountId;
    let providerFails = true;
    let notifyCheckoutReadStarted;
    const checkoutReadStarted = new Promise((resolve) => {
      notifyCheckoutReadStarted = resolve;
    });
    let releaseCheckoutRead;
    const checkoutReadGate = new Promise((resolve) => {
      releaseCheckoutRead = resolve;
    });
    const createdSeconds = Math.floor(Date.now() / 1_000) - 60;
    const expiresSeconds = createdSeconds + 3_600;

    const worker = await startD1Worker(stripeBindings, {
      outboundService: async (request) => {
        const url = new URL(request.url);
        providerMethods.push(`${request.method} ${url.pathname}`);
        assert.equal(request.method, "GET");
        if (url.pathname === `/v1/checkout/sessions/${sessionId}`) {
          if (providerFails) {
            return Response.json(
              { error: { code: "synthetic_checkout_read_failure" } },
              { status: 500 },
            );
          }
          notifyCheckoutReadStarted();
          await checkoutReadGate;
          return Response.json({
            id: sessionId,
            mode: "subscription",
            status: "complete",
            url: null,
            client_reference_id: ownerAccountId,
            customer: providerCustomerId,
            subscription: providerSubscriptionId,
            created: createdSeconds,
            expires_at: expiresSeconds,
            metadata: {
              account_id: ownerAccountId,
              checkout_attempt_id: attemptId,
              price_id: PRICE_ID,
            },
          });
        }
        if (url.pathname === `/v1/subscriptions/${providerSubscriptionId}`) {
          return Response.json(
            stripeSubscription({
              id: providerSubscriptionId,
              customerId: providerCustomerId,
              status: "active",
              accountId: ownerAccountId,
              checkoutAttemptId: attemptId,
            }),
          );
        }
        return Response.json(
          { error: { code: "unexpected_test_request" } },
          { status: 500 },
        );
      },
    });
    context.after(() => worker.dispose());

    ownerAccountId = await createAccount(worker, owner);
    await createAccount(worker, other);
    await worker.inspect([
      {
        sql: `insert into billing_checkout_attempts (
          id, account_id, provider, state, request_version,
          idempotency_key, provider_price_id, application_origin,
          provider_customer_id, customer_email, provider_expires_at,
          provider_session_id, provider_created_at, created_at, updated_at
        ) values (?, ?, 'stripe', 'completed_pending_sync', 1, ?, ?, ?,
          null, ?, ?, ?, ?, ?, ?)`,
        params: [
          attemptId,
          ownerAccountId,
          `roadmap-checkout-v1-${attemptId}`,
          PRICE_ID,
          testOrigin,
          owner.email,
          expiresSeconds * 1_000,
          sessionId,
          createdSeconds * 1_000,
          createdSeconds * 1_000,
          createdSeconds * 1_000,
        ],
      },
    ]);

    const otherResult = await reconcile(worker, other);
    assert.equal(otherResult.status, 303);
    assert.equal(
      otherResult.headers.get("location"),
      "/app/billing?reconcile=refresh_review",
    );
    assert.deepEqual(providerMethods, []);

    const failedOwnerResult = await reconcile(worker, owner);
    assert.equal(failedOwnerResult.status, 502);
    assert.equal(
      (await failedOwnerResult.json()).error.code,
      "billing_provider_error",
    );
    const failedTarget = await worker.inspect([
      {
        sql: `select state, processing_attempts, last_error_code, lease_token
          from billing_reconciliation_targets where checkout_attempt_id = ?`,
        params: [attemptId],
      },
    ]);
    assert.deepEqual(failedTarget[0].results, [
      {
        state: "failed",
        processing_attempts: 1,
        last_error_code: "billing_provider_error",
        lease_token: null,
      },
    ]);

    providerFails = false;
    const ownerRequest = reconcile(worker, owner);
    await checkoutReadStarted;
    const concurrentResult = await reconcile(worker, owner);
    const browserConcurrentResult = await reconcileBrowser(worker, owner);
    releaseCheckoutRead();
    const ownerResult = await ownerRequest;

    assert.equal(concurrentResult.status, 409);
    assert.equal(concurrentResult.headers.get("retry-after"), "1");
    assert.equal(
      (await concurrentResult.json()).error.code,
      "billing_operation_in_progress",
    );
    assert.equal(browserConcurrentResult.status, 303);
    assert.equal(browserConcurrentResult.headers.get("retry-after"), null);
    assert.equal(
      browserConcurrentResult.headers.get("location"),
      "/app/billing?reconcile=refresh_in_progress",
    );
    assert.equal(ownerResult.status, 303);
    assert.equal(
      ownerResult.headers.get("location"),
      "/app/billing?reconcile=refresh_review",
    );
    assert.deepEqual(providerMethods, [
      `GET /v1/checkout/sessions/${sessionId}`,
      `GET /v1/checkout/sessions/${sessionId}`,
      `GET /v1/subscriptions/${providerSubscriptionId}`,
    ]);

    const inspected = await worker.inspect([
      {
        sql: `select state, provider_customer_id, completed_at,
          last_error_code from billing_checkout_attempts where id = ?`,
        params: [attemptId],
      },
      {
        sql: `select account_id, provider_customer_id,
          provider_subscription_id, provider_price_id, status,
          projection_revision from subscriptions`,
      },
      {
        sql: `select account_id, checkout_attempt_id, state,
          processing_attempts, lease_token, last_succeeded_at
          from billing_reconciliation_targets`,
      },
      {
        sql: `select count(*) as count from audit_events
          where action = 'billing.subscription_reconciled'`,
      },
    ]);
    assert.deepEqual(
      {
        ...inspected[0].results[0],
        completed_at: Boolean(inspected[0].results[0].completed_at),
      },
      {
        state: "completed",
        provider_customer_id: providerCustomerId,
        completed_at: true,
        last_error_code: null,
      },
    );
    assert.deepEqual(inspected[1].results, [
      {
        account_id: ownerAccountId,
        provider_customer_id: providerCustomerId,
        provider_subscription_id: providerSubscriptionId,
        provider_price_id: PRICE_ID,
        status: "active",
        projection_revision: 1,
      },
    ]);
    assert.deepEqual(
      inspected[2].results.map((row) => ({
        ...row,
        last_succeeded_at: Boolean(row.last_succeeded_at),
      })),
      [
        {
          account_id: ownerAccountId,
          checkout_attempt_id: attemptId,
          state: "succeeded",
          processing_attempts: 2,
          lease_token: null,
          last_succeeded_at: true,
        },
      ],
    );
    assert.equal(inspected[3].results[0].count, 1);
  },
);

test(
  "account reconciliation rate limits provider reads and gives browsers a recovery redirect",
  { timeout: 60_000 },
  async (context) => {
    const identity = {
      email: "coach.a@example.test",
      name: "Coach Reconciliation Rate",
    };
    const providerSubscriptionId = "sub_reconciliation_rate";
    const providerCustomerId = "cus_reconciliation_rate";
    let providerCalls = 0;
    const worker = await startD1Worker(stripeBindings, {
      outboundService: async (request) => {
        providerCalls += 1;
        const url = new URL(request.url);
        assert.equal(request.method, "GET");
        assert.equal(
          url.pathname,
          `/v1/subscriptions/${providerSubscriptionId}`,
        );
        return Response.json(
          stripeSubscription({
            id: providerSubscriptionId,
            customerId: providerCustomerId,
            status: "active",
            includeMetadata: false,
          }),
        );
      },
    });
    context.after(() => worker.dispose());

    const accountId = await createAccount(worker, identity);
    await seedSubscription(worker, {
      accountId,
      localSubscriptionId: "local_reconciliation_rate",
      providerSubscriptionId,
      providerCustomerId,
      status: "active",
    });

    const allowed = [];
    for (let index = 0; index < 6; index += 1) {
      allowed.push(await reconcile(worker, identity));
    }
    assert.deepEqual(
      allowed.map((response) => response.status),
      [303, 303, 303, 303, 303, 303],
    );
    for (const response of allowed) {
      assert.equal(
        response.headers.get("location"),
        "/app/billing?reconcile=refresh_review",
      );
    }

    const apiLimited = await reconcile(worker, identity);
    assert.equal(apiLimited.status, 429);
    assert.equal((await apiLimited.json()).error.code, "rate_limit_exceeded");
    const apiRetryAfter = Number(apiLimited.headers.get("retry-after"));
    assert.ok(Number.isInteger(apiRetryAfter));
    assert.ok(apiRetryAfter >= 1 && apiRetryAfter <= 15 * 60);

    const browserLimited = await reconcileBrowser(worker, identity);
    assert.equal(browserLimited.status, 303);
    assert.equal(
      browserLimited.headers.get("location"),
      "/app/billing?reconcile=refresh_rate_limited",
    );
    assert.equal(browserLimited.headers.get("retry-after"), null);
    assert.equal(providerCalls, 6);
  },
);

test(
  "open and expired Checkout checks terminalize their pre-provider leases",
  { timeout: 60_000 },
  async (context) => {
    const openIdentity = {
      email: "coach.a@example.test",
      name: "Coach Open Checkout",
    };
    const expiredIdentity = {
      email: "coach.b@example.test",
      name: "Coach Expired Checkout",
    };
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const sessions = new Map([
      [
        "cs_reconciliation_open",
        {
          accountId: null,
          attemptId: "attempt_reconciliation_open",
          status: "open",
          created: nowSeconds - 60,
          expires: nowSeconds + 3_540,
        },
      ],
      [
        "cs_reconciliation_expired",
        {
          accountId: null,
          attemptId: "attempt_reconciliation_expired",
          status: "expired",
          created: nowSeconds - 4_000,
          expires: nowSeconds - 400,
        },
      ],
    ]);
    let providerCalls = 0;
    const worker = await startD1Worker(stripeBindings, {
      outboundService: async (request) => {
        providerCalls += 1;
        const url = new URL(request.url);
        const sessionId = url.pathname.split("/").at(-1);
        const session = sessions.get(sessionId);
        assert.ok(session);
        assert.equal(request.method, "GET");
        return Response.json({
          id: sessionId,
          mode: "subscription",
          status: session.status,
          url:
            session.status === "open"
              ? `https://checkout.stripe.com/c/pay/${sessionId}`
              : null,
          client_reference_id: session.accountId,
          customer: null,
          subscription: null,
          created: session.created,
          expires_at: session.expires,
          metadata: {
            account_id: session.accountId,
            checkout_attempt_id: session.attemptId,
            price_id: PRICE_ID,
          },
        });
      },
    });
    context.after(() => worker.dispose());

    const openAccountId = await createAccount(worker, openIdentity);
    const expiredAccountId = await createAccount(worker, expiredIdentity);
    sessions.get("cs_reconciliation_open").accountId = openAccountId;
    sessions.get("cs_reconciliation_expired").accountId = expiredAccountId;
    await seedCheckoutAttempt(worker, {
      accountId: openAccountId,
      email: openIdentity.email,
      attemptId: "attempt_reconciliation_open",
      sessionId: "cs_reconciliation_open",
      createdSeconds: nowSeconds - 60,
      expiresSeconds: nowSeconds + 3_540,
    });
    await seedCheckoutAttempt(worker, {
      accountId: expiredAccountId,
      email: expiredIdentity.email,
      attemptId: "attempt_reconciliation_expired",
      sessionId: "cs_reconciliation_expired",
      createdSeconds: nowSeconds - 4_000,
      expiresSeconds: nowSeconds - 400,
    });

    const openResult = await reconcile(worker, openIdentity);
    const expiredResult = await reconcile(worker, expiredIdentity);
    assert.deepEqual(
      [openResult.status, expiredResult.status],
      [303, 303],
    );
    assert.equal(
      openResult.headers.get("location"),
      "/app/billing?reconcile=refresh_review",
    );
    assert.equal(
      expiredResult.headers.get("location"),
      "/app/billing?reconcile=refresh_review",
    );

    const inspection = await worker.inspect([
      {
        sql: `select attempt.id, attempt.state as attempt_state,
          target.state as target_state, target.processing_attempts,
          target.lease_token, target.last_error_code, target.last_succeeded_at
          from billing_checkout_attempts attempt
          join billing_reconciliation_targets target
            on target.checkout_attempt_id = attempt.id
          where attempt.id in (?, ?)
          order by attempt.id`,
        params: [
          "attempt_reconciliation_open",
          "attempt_reconciliation_expired",
        ],
      },
    ]);
    assert.deepEqual(
      inspection[0].results.map((row) => ({
        ...row,
        last_succeeded_at: Boolean(row.last_succeeded_at),
      })),
      [
        {
          id: "attempt_reconciliation_expired",
          attempt_state: "expired",
          target_state: "succeeded",
          processing_attempts: 1,
          lease_token: null,
          last_error_code: null,
          last_succeeded_at: true,
        },
        {
          id: "attempt_reconciliation_open",
          attempt_state: "open",
          target_state: "succeeded",
          processing_attempts: 1,
          lease_token: null,
          last_error_code: null,
          last_succeeded_at: true,
        },
      ],
    );
    assert.equal(providerCalls, 2);
  },
);

async function createAccount(worker, identity) {
  const response = await worker.dispatch("/api/profile", {
    headers: identityHeaders(identity.email, identity.name),
  });
  assert.equal(response.status, 200);
  const inspected = await worker.inspect([
    {
      sql: "select id from accounts where normalized_email = ?",
      params: [identity.email],
    },
  ]);
  return inspected[0].results[0].id;
}

async function seedSubscription(
  worker,
  {
    accountId,
    localSubscriptionId,
    providerSubscriptionId,
    providerCustomerId,
    status,
  },
) {
  await worker.inspect([
    {
      sql: `insert into billing_customers
        (provider, provider_customer_id, account_id)
        values ('stripe', ?, ?)`,
      params: [providerCustomerId, accountId],
    },
    {
      sql: `insert into subscriptions (
        id, account_id, provider, provider_customer_id,
        provider_subscription_id, provider_price_id, product_code,
        status, billing_interval, currency, unit_amount_minor,
        last_provider_sync_at, projection_revision
      ) values (?, ?, 'stripe', ?, ?, ?, 'solo', ?, 'month', 'CAD',
        7500, ?, 1)`,
      params: [
        localSubscriptionId,
        accountId,
        providerCustomerId,
        providerSubscriptionId,
        PRICE_ID,
        status,
        Date.now() - 7_200_000,
      ],
    },
  ]);
}

async function seedCheckoutAttempt(
  worker,
  {
    accountId,
    email,
    attemptId,
    sessionId,
    createdSeconds,
    expiresSeconds,
  },
) {
  await worker.inspect([
    {
      sql: `insert into billing_checkout_attempts (
        id, account_id, provider, state, request_version,
        idempotency_key, provider_price_id, application_origin,
        provider_customer_id, customer_email, provider_expires_at,
        provider_session_id, provider_created_at, created_at, updated_at
      ) values (?, ?, 'stripe', 'open', 1, ?, ?, ?,
        null, ?, ?, ?, ?, ?, ?)`,
      params: [
        attemptId,
        accountId,
        `roadmap-checkout-v1-${attemptId}`,
        PRICE_ID,
        testOrigin,
        email,
        expiresSeconds * 1_000,
        sessionId,
        createdSeconds * 1_000,
        createdSeconds * 1_000,
        createdSeconds * 1_000,
      ],
    },
  ]);
}

async function inspectExistingSubscription(worker) {
  const inspected = await worker.inspect([
    {
      sql: `select status, projection_revision, last_provider_sync_at
        from subscriptions where id = 'local_reconciliation_existing'`,
    },
    {
      sql: `select state, processing_attempts, last_error_code, lease_token
        from billing_reconciliation_targets
        where subscription_id = 'local_reconciliation_existing'`,
    },
    {
      sql: `select count(*) as count from audit_events
        where action = 'billing.subscription_reconciled'`,
    },
  ]);
  return {
    subscription: inspected[0].results[0],
    target: inspected[1].results[0],
    auditCount: inspected[2].results[0].count,
  };
}

function reconcile(worker, identity) {
  return worker.dispatch("/api/billing/reconcile", {
    method: "POST",
    redirect: "manual",
    headers: writeHeaders(identity.email, identity.name),
  });
}

function reconcileBrowser(worker, identity) {
  return worker.dispatch("/api/billing/reconcile", {
    method: "POST",
    redirect: "manual",
    headers: {
      ...writeHeaders(identity.email, identity.name),
      accept: "text/html,application/xhtml+xml",
      "sec-fetch-mode": "navigate",
    },
  });
}

function stripeSubscription({
  id,
  customerId,
  status,
  accountId,
  checkoutAttemptId,
  includeMetadata = true,
}) {
  const now = Math.floor(Date.now() / 1_000);
  return {
    id,
    customer: customerId,
    status,
    currency: "cad",
    cancel_at_period_end: status === "canceled",
    canceled_at: status === "canceled" ? now - 30 : null,
    ended_at: status === "canceled" ? now - 30 : null,
    trial_start: null,
    trial_end: null,
    metadata: includeMetadata
      ? {
          account_id: accountId,
          price_id: PRICE_ID,
          ...(checkoutAttemptId
            ? { checkout_attempt_id: checkoutAttemptId }
            : {}),
        }
      : {},
    items: {
      data: [
        {
          quantity: 1,
          current_period_start: now - 2_000,
          current_period_end: now + 2_000,
          price: {
            id: PRICE_ID,
            currency: "cad",
            unit_amount: 7_500,
            recurring: { interval: "month" },
          },
        },
      ],
    },
  };
}
