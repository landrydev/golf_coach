import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  identityHeaders,
  startD1Worker,
  syntheticBillingCommercialPolicyJson,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const { env } = await import("cloudflare:workers");
const { getDb } = await import("../db/index.ts");
const { accounts } = await import("../db/schema.ts");
const {
  BILLING_ACCOUNT_OPERATION_LEASE_MS,
  BillingAccountOperationLeaseError,
  acquireBillingAccountOperationLease,
  assertBillingAccountOperationLease,
  billingAccountOperationLeaseGuard,
  getBillingAccountOperationLease,
  releaseBillingAccountOperationLease,
  renewBillingAccountOperationLease,
} = await import("../lib/billing-account-operation-lease.ts");
const {
  expireStrandedCheckoutReservation,
  finalizeCheckoutAttemptOpen,
  reserveOrLoadCheckoutAttempt,
} = await import("../lib/checkout-repository.ts");

const BASE_TIME = Date.UTC(2026, 7, 8, 20, 0, 0);
const PRICE_ID = "price_account_lease_test";
const STRIPE_SECRET = "sk_test_account_lease_synthetic_only";
const stripeBindings = {
  STRIPE_SECRET_KEY: STRIPE_SECRET,
  STRIPE_WEBHOOK_SECRET: "whsec_account_lease_synthetic_only",
  STRIPE_CHECKOUT_PRICE_ID: PRICE_ID,
  STRIPE_RECOGNIZED_PRICE_IDS: PRICE_ID,
  SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: PRICE_ID,
  SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
  STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS: "3600",
  BILLING_COMMERCIAL_POLICY_JSON: syntheticBillingCommercialPolicyJson(PRICE_ID),
  INSTRUCTOR_ACCESS_MODE: "subscription_required",
  SUBSCRIPTION_ACCESS_STATUSES: "trialing,active",
  BILLING_CHECKOUT_ENABLED: "true",
};

test(
  "account billing operation leases serialize tenants and fence stale owners",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    const database = await worker.database();
    env.DB = database;
    context.after(async () => {
      delete env.DB;
      await worker.dispose();
    });
    await seedAccounts(database, ["account-lease-owner", "account-lease-other"]);

    const contenders = await Promise.all(
      Array.from({ length: 10 }, () =>
        acquireBillingAccountOperationLease({
          accountId: "account-lease-owner",
          operation: "checkout",
          now: new Date(BASE_TIME),
        }),
      ),
    );
    const [firstClaim] = contenders.filter(Boolean);
    assert.ok(firstClaim);
    assert.equal(contenders.filter(Boolean).length, 1);
    assert.equal(firstClaim.leaseGeneration, 1);
    assert.equal(
      firstClaim.leaseExpiresAt.getTime(),
      BASE_TIME + BILLING_ACCOUNT_OPERATION_LEASE_MS,
    );

    const otherClaim = await acquireBillingAccountOperationLease({
      accountId: "account-lease-other",
      operation: "reconciliation",
      now: new Date(BASE_TIME),
    });
    assert.ok(otherClaim);
    assert.equal(otherClaim.accountId, "account-lease-other");

    assert.equal(
      await releaseBillingAccountOperationLease(
        firstClaim,
        new Date(BASE_TIME + 1),
      ),
      true,
    );
    const idle = await getBillingAccountOperationLease("account-lease-owner");
    assert.equal(idle?.state, "idle");
    assert.equal(idle?.operation, null);
    assert.equal(idle?.leaseToken, null);
    assert.equal(idle?.leaseExpiresAt, null);

    const expiringClaim = await acquireBillingAccountOperationLease({
      accountId: "account-lease-owner",
      operation: "reconciliation",
      now: new Date(BASE_TIME + 2),
    });
    assert.ok(expiringClaim);
    assert.equal(expiringClaim.leaseGeneration, 2);
    const reclaimTime =
      BASE_TIME + 2 + BILLING_ACCOUNT_OPERATION_LEASE_MS;
    const reclaimed = await acquireBillingAccountOperationLease({
      accountId: "account-lease-owner",
      operation: "checkout",
      now: new Date(reclaimTime),
    });
    assert.ok(reclaimed);
    assert.equal(reclaimed.leaseGeneration, 3);
    assert.notEqual(reclaimed.leaseToken, expiringClaim.leaseToken);

    await assertLeaseError(
      assertBillingAccountOperationLease(
        expiringClaim,
        new Date(reclaimTime + 1),
      ),
      "billing_operation_lease_lost",
    );
    await assertLeaseError(
      renewBillingAccountOperationLease(
        expiringClaim,
        new Date(reclaimTime + 1),
      ),
      "billing_operation_lease_lost",
    );
    assert.equal(
      await releaseBillingAccountOperationLease(
        expiringClaim,
        new Date(reclaimTime + 1),
      ),
      false,
    );

    const db = getDb();
    await assert.rejects(
      db.batch([
        billingAccountOperationLeaseGuard(
          db,
          expiringClaim,
          new Date(reclaimTime + 1),
        ),
        db
          .update(accounts)
          .set({ locale: "fr-CA" })
          .where(eq(accounts.id, "account-lease-owner")),
      ]),
      /constraint failed|not null/i,
    );
    let account = await database
      .prepare("select locale from accounts where id = ?")
      .bind("account-lease-owner")
      .first();
    assert.equal(account.locale, "en-CA");

    const renewed = await renewBillingAccountOperationLease(
      reclaimed,
      new Date(reclaimTime + 2),
    );
    await db.batch([
      billingAccountOperationLeaseGuard(
        db,
        renewed,
        new Date(reclaimTime + 3),
      ),
      db
        .update(accounts)
        .set({ locale: "fr-CA" })
        .where(eq(accounts.id, "account-lease-owner")),
    ]);
    account = await database
      .prepare("select locale from accounts where id = ?")
      .bind("account-lease-owner")
      .first();
    assert.equal(account.locale, "fr-CA");

    const checkoutNow = new Date(reclaimTime + 4);
    const reservationInput = {
      accountId: "account-lease-owner",
      providerPriceId: PRICE_ID,
      applicationOrigin: testOrigin,
      providerCustomerId: null,
      customerEmail: "lease-owner@example.test",
      providerExpiresAt: new Date(checkoutNow.getTime() + 3_600_000),
      now: checkoutNow,
    };
    await assert.rejects(
      reserveOrLoadCheckoutAttempt({
        ...reservationInput,
        operationLease: firstClaim,
      }),
      (error) => error?.code === "checkout_attempt_persistence_failed",
    );
    let attempts = await database
      .prepare(
        "select count(*) as count from billing_checkout_attempts where account_id = ?",
      )
      .bind("account-lease-owner")
      .first();
    assert.equal(attempts.count, 0);

    const reservation = await reserveOrLoadCheckoutAttempt({
      ...reservationInput,
      operationLease: renewed,
    });
    assert.equal(reservation.created, true);
    await assert.rejects(
      finalizeCheckoutAttemptOpen({
        accountId: "account-lease-owner",
        attemptId: reservation.attempt.id,
        providerSessionId: "cs_stale_lease",
        providerCreatedAt: new Date(checkoutNow.getTime() + 1),
        operationLease: firstClaim,
        now: new Date(checkoutNow.getTime() + 2),
      }),
      (error) => error?.code === "checkout_attempt_persistence_failed",
    );
    let finalized = await database
      .prepare(
        `select state, provider_session_id from billing_checkout_attempts
        where id = ?`,
      )
      .bind(reservation.attempt.id)
      .first();
    assert.deepEqual(finalized, {
      state: "reserved",
      provider_session_id: null,
    });
    const staleAudit = await database
      .prepare(
        `select count(*) as count from audit_events
        where target_id = ? and action = 'billing.checkout_session_created'`,
      )
      .bind(reservation.attempt.id)
      .first();
    assert.equal(staleAudit.count, 0);

    await finalizeCheckoutAttemptOpen({
      accountId: "account-lease-owner",
      attemptId: reservation.attempt.id,
      providerSessionId: "cs_current_lease",
      providerCreatedAt: new Date(checkoutNow.getTime() + 1),
      operationLease: renewed,
      now: new Date(checkoutNow.getTime() + 2),
    });
    finalized = await database
      .prepare(
        `select state, provider_session_id from billing_checkout_attempts
        where id = ?`,
      )
      .bind(reservation.attempt.id)
      .first();
    assert.deepEqual(finalized, {
      state: "open",
      provider_session_id: "cs_current_lease",
    });

    await assertLeaseError(
      acquireBillingAccountOperationLease({
        accountId: "account-does-not-exist",
        operation: "checkout",
        now: new Date(BASE_TIME),
      }),
      "billing_operation_lease_account_not_found",
    );
  },
);

test(
  "only an unissued past-due reservation expires locally and its audit is atomic",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    const database = await worker.database();
    env.DB = database;
    context.after(async () => {
      delete env.DB;
      await worker.dispose();
    });
    await seedAccounts(database, ["account-stranded", "account-issued"]);
    await insertCheckoutAttempt(database, {
      id: "attempt-stranded",
      accountId: "account-stranded",
      state: "reserved",
      providerSessionId: null,
      providerCreatedAt: null,
      createdAt: BASE_TIME - 7_200_000,
      expiresAt: BASE_TIME - 3_600_000,
    });
    await insertCheckoutAttempt(database, {
      id: "attempt-issued-open",
      accountId: "account-issued",
      state: "open",
      providerSessionId: "cs_issued_open",
      providerCreatedAt: BASE_TIME - 7_000_000,
      createdAt: BASE_TIME - 7_200_000,
      expiresAt: BASE_TIME - 3_600_000,
    });

    const expired = await expireStrandedCheckoutReservation({
      accountId: "account-stranded",
      requestId: "request-stranded-expiry",
      now: new Date(BASE_TIME),
    });
    assert.deepEqual(expired, {
      expired: true,
      attemptId: "attempt-stranded",
    });
    assert.deepEqual(
      await checkoutAttemptStates(database, "account-stranded"),
      [{ id: "attempt-stranded", state: "expired" }],
    );
    assert.deepEqual(await checkoutAttemptStates(database, "account-issued"), [
      { id: "attempt-issued-open", state: "open" },
    ]);
    const audit = await database
      .prepare(
        `select action, target_id, request_id, metadata
        from audit_events
        where action = 'billing.checkout_reservation_expired'`,
      )
      .first();
    assert.equal(audit.action, "billing.checkout_reservation_expired");
    assert.equal(audit.target_id, "attempt-stranded");
    assert.equal(audit.request_id, "request-stranded-expiry");
    assert.deepEqual(JSON.parse(audit.metadata), {
      provider: "stripe",
      requestVersion: 1,
      reason: "unissued_reservation_expired",
    });

    assert.deepEqual(
      await expireStrandedCheckoutReservation({
        accountId: "account-stranded",
        now: new Date(BASE_TIME + 1),
      }),
      { expired: false, attemptId: null },
    );
    const count = await database
      .prepare(
        `select count(*) as count from audit_events
        where action = 'billing.checkout_reservation_expired'`,
      )
      .first();
    assert.equal(count.count, 1);
  },
);

test(
  "provider-active reconciliation blocks a second Checkout and stale reservations recover",
  { timeout: 60_000 },
  async (context) => {
    let releaseProviderRead;
    let markProviderReadStarted;
    const providerReadStarted = new Promise((resolve) => {
      markProviderReadStarted = resolve;
    });
    const providerReadGate = new Promise((resolve) => {
      releaseProviderRead = resolve;
    });
    let checkoutPosts = 0;
    let providerAccountId = null;
    const providerSubscriptionId = "sub_account_lease_active";
    const providerCustomerId = "cus_account_lease_active";

    const worker = await startD1Worker(stripeBindings, {
      outboundService: async (request) => {
        const url = new URL(request.url);
        assert.equal(
          request.headers.get("authorization"),
          `Bearer ${STRIPE_SECRET}`,
        );
        if (
          request.method === "GET" &&
          url.pathname === "/v1/subscriptions"
        ) {
          assert.equal(url.searchParams.get("customer"), providerCustomerId);
          assert.equal(url.searchParams.get("status"), "all");
          assert.equal(url.searchParams.get("limit"), "100");
          return Response.json({
            object: "list",
            has_more: false,
            data: [
              stripeSubscription({
                id: providerSubscriptionId,
                customerId: providerCustomerId,
                accountId: providerAccountId,
                status: "active",
              }),
            ],
          });
        }
        if (
          request.method === "GET" &&
          url.pathname === `/v1/subscriptions/${providerSubscriptionId}`
        ) {
          markProviderReadStarted();
          await providerReadGate;
          return Response.json(
            stripeSubscription({
              id: providerSubscriptionId,
              customerId: providerCustomerId,
              accountId: providerAccountId,
              status: "active",
            }),
          );
        }
        if (
          request.method === "POST" &&
          url.pathname === "/v1/checkout/sessions"
        ) {
          checkoutPosts += 1;
          const parameters = new URLSearchParams(await request.text());
          return Response.json({
            id: `cs_recovered_${checkoutPosts}`,
            mode: "subscription",
            status: "open",
            url: `https://checkout.stripe.com/c/pay/cs_recovered_${checkoutPosts}`,
            client_reference_id: parameters.get("client_reference_id"),
            customer: null,
            subscription: null,
            created: Math.floor(Date.now() / 1_000),
            expires_at: Number(parameters.get("expires_at")),
            metadata: {
              account_id: parameters.get("metadata[account_id]"),
              checkout_attempt_id: parameters.get("metadata[checkout_attempt_id]"),
              price_id: parameters.get("metadata[price_id]"),
            },
          });
        }
        return Response.json(
          { error: { code: "unexpected_test_request" } },
          { status: 500 },
        );
      },
    });
    context.after(() => worker.dispose());

    const reconciliationIdentity = {
      email: "coach.a@example.test",
      name: "Lease Reconciliation",
    };
    providerAccountId = await createAccount(worker, reconciliationIdentity);
    await seedLocalSubscription(worker, {
      accountId: providerAccountId,
      localSubscriptionId: "subscription_account_lease_local",
      providerSubscriptionId,
      providerCustomerId,
      status: "canceled",
    });

    // This is the sequential stale-projection case, independent of race
    // ordering: local says canceled, Stripe says active, and Checkout must use
    // a GET-only customer subscription preflight before any provider POST.
    const sequentiallyBlocked = await checkout(worker, reconciliationIdentity);
    assert.equal(sequentiallyBlocked.status, 409);
    assert.equal(
      (await sequentiallyBlocked.json()).error.code,
      "subscription_already_open",
    );
    assert.equal(checkoutPosts, 0);

    const reconciliation = reconcile(worker, reconciliationIdentity);
    await providerReadStarted;
    const blockedCheckout = await checkout(worker, reconciliationIdentity);
    assert.equal(blockedCheckout.status, 409);
    assert.equal(
      (await blockedCheckout.json()).error.code,
      "billing_operation_in_progress",
    );
    assert.equal(blockedCheckout.headers.get("retry-after"), "1");
    assert.equal(checkoutPosts, 0);

    releaseProviderRead();
    const reconciled = await reconciliation;
    assert.equal(reconciled.status, 303);
    const afterReconciliation = await checkout(worker, reconciliationIdentity);
    assert.equal(afterReconciliation.status, 409);
    assert.equal(
      (await afterReconciliation.json()).error.code,
      "subscription_already_open",
    );
    assert.equal(checkoutPosts, 0);

    const strandedIdentity = {
      email: "coach.b@example.test",
      name: "Lease Stranded",
    };
    const strandedAccountId = await createAccount(worker, strandedIdentity);
    const now = Date.now();
    await worker.inspect([
      {
        sql: `insert into billing_checkout_attempts (
          id, account_id, provider, state, request_version,
          idempotency_key, provider_price_id, application_origin,
          customer_email, provider_expires_at, created_at, updated_at
        ) values (?, ?, 'stripe', 'reserved', 1, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          "attempt-route-stranded",
          strandedAccountId,
          "roadmap-checkout-v1-attempt-route-stranded",
          PRICE_ID,
          testOrigin,
          strandedIdentity.email,
          now - 3_600_000,
          now - 7_200_000,
          now - 7_200_000,
        ],
      },
    ]);
    const recovered = await checkout(worker, strandedIdentity);
    assert.equal(recovered.status, 303);
    assert.equal(
      recovered.headers.get("location"),
      "https://checkout.stripe.com/c/pay/cs_recovered_1",
    );
    assert.equal(checkoutPosts, 1);
    const recoveryState = await worker.inspect([
      {
        sql: `select state, count(*) as count
          from billing_checkout_attempts
          where account_id = ?
          group by state order by state`,
        params: [strandedAccountId],
      },
      {
        sql: `select count(*) as count from audit_events
          where account_id = ?
            and action = 'billing.checkout_reservation_expired'`,
        params: [strandedAccountId],
      },
    ]);
    assert.deepEqual(recoveryState[0].results, [
      { state: "expired", count: 1 },
      { state: "open", count: 1 },
    ]);
    assert.equal(recoveryState[1].results[0].count, 1);
  },
);

async function seedAccounts(database, accountIds) {
  await database.batch(
    accountIds.map((accountId, index) => {
      const email = `account-lease-${index}@example.test`;
      return database
        .prepare(
          `insert into accounts (
            id, auth_provider, auth_subject, primary_email,
            normalized_email, email_verified_at, status,
            created_at, updated_at
          ) values (?, 'siwc', ?, ?, ?, ?, 'active', ?, ?)`,
        )
        .bind(
          accountId,
          `subject-${accountId}`,
          email,
          email,
          BASE_TIME,
          BASE_TIME,
          BASE_TIME,
        );
    }),
  );
}

async function insertCheckoutAttempt(database, input) {
  await database
    .prepare(
      `insert into billing_checkout_attempts (
        id, account_id, provider, state, request_version,
        idempotency_key, provider_price_id, application_origin,
        customer_email, provider_session_id, provider_created_at,
        provider_expires_at, created_at, updated_at
      ) values (?, ?, 'stripe', ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.accountId,
      input.state,
      `roadmap-checkout-v1-${input.id}`,
      PRICE_ID,
      testOrigin,
      `${input.id}@example.test`,
      input.providerSessionId,
      input.providerCreatedAt,
      input.expiresAt,
      input.createdAt,
      input.createdAt,
    )
    .run();
}

async function checkoutAttemptStates(database, accountId) {
  const result = await database
    .prepare(
      `select id, state from billing_checkout_attempts
      where account_id = ? order by id`,
    )
    .bind(accountId)
    .all();
  return result.results;
}

async function assertLeaseError(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof BillingAccountOperationLeaseError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

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

async function seedLocalSubscription(worker, input) {
  await worker.inspect([
    {
      sql: `insert into billing_customers
        (provider, provider_customer_id, account_id)
        values ('stripe', ?, ?)`,
      params: [input.providerCustomerId, input.accountId],
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
        input.localSubscriptionId,
        input.accountId,
        input.providerCustomerId,
        input.providerSubscriptionId,
        PRICE_ID,
        input.status,
        Date.now() - 7_200_000,
      ],
    },
  ]);
}

function reconcile(worker, identity) {
  return worker.dispatch("/api/billing/reconcile", {
    method: "POST",
    redirect: "manual",
    headers: writeHeaders(identity.email, identity.name),
  });
}

function checkout(worker, identity) {
  return worker.dispatch("/api/billing/checkout", {
    method: "POST",
    redirect: "manual",
    headers: writeHeaders(identity.email, identity.name),
  });
}

function stripeSubscription({ id, customerId, accountId, status }) {
  const now = Math.floor(Date.now() / 1_000);
  return {
    id,
    object: "subscription",
    customer: customerId,
    status,
    currency: "cad",
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    trial_start: null,
    trial_end: null,
    metadata: {
      account_id: accountId,
      price_id: PRICE_ID,
    },
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
