import assert from "node:assert/strict";
import test from "node:test";
import {
  identityHeaders,
  startD1Worker,
  syntheticBillingCommercialPolicyJson,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "coach.a@example.test",
  name: "Coach Checkout",
};
const stripeConfiguration = {
  STRIPE_SECRET_KEY: "sk_test_synthetic_checkout_integration_only",
  STRIPE_WEBHOOK_SECRET: "whsec_synthetic_checkout_integration_only",
  STRIPE_CHECKOUT_PRICE_ID: "price_checkout_integration",
  STRIPE_RECOGNIZED_PRICE_IDS: "price_checkout_integration",
  SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: "price_checkout_integration",
  SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
  STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS: "3600",
  BILLING_COMMERCIAL_POLICY_JSON: syntheticBillingCommercialPolicyJson(
    "price_checkout_integration",
  ),
  INSTRUCTOR_ACCESS_MODE: "subscription_required",
  SUBSCRIPTION_ACCESS_STATUSES: "trialing,active",
  BILLING_CHECKOUT_ENABLED: "true",
};

test(
  "concurrent Checkout requests share one durable provider attempt and resume it",
  { timeout: 60_000 },
  async (context) => {
    const posts = [];
    const gets = [];
    const sessionsByKey = new Map();
    const sessionsById = new Map();
    const worker = await startD1Worker(stripeConfiguration, {
      outboundService: async (request) => {
        const url = new URL(request.url);
        assert.equal(
          request.headers.get("authorization"),
          `Bearer ${stripeConfiguration.STRIPE_SECRET_KEY}`,
        );
        if (request.method === "POST" && url.pathname === "/v1/checkout/sessions") {
          const key = request.headers.get("idempotency-key");
          const body = await request.text();
          assert.ok(key?.startsWith("roadmap-checkout-v1-"));
          posts.push({ key, body });

          const prior = sessionsByKey.get(key);
          if (prior) {
            assert.equal(body, prior.body);
            return Response.json(prior.session);
          }
          const parameters = new URLSearchParams(body);
          const session = {
            id: "cs_checkout_integration",
            mode: "subscription",
            status: "open",
            url: "https://checkout.stripe.com/c/pay/cs_checkout_integration",
            created: Math.floor(Date.now() / 1_000),
            expires_at: Number(parameters.get("expires_at")),
            client_reference_id: parameters.get("client_reference_id"),
            customer: null,
            subscription: null,
            metadata: {
              account_id: parameters.get("metadata[account_id]"),
              checkout_attempt_id: parameters.get(
                "metadata[checkout_attempt_id]",
              ),
              price_id: parameters.get("metadata[price_id]"),
            },
          };
          sessionsByKey.set(key, { body, session });
          sessionsById.set(session.id, session);
          return Response.json(session);
        }
        if (request.method === "GET" && url.pathname.startsWith("/v1/checkout/sessions/")) {
          const sessionId = decodeURIComponent(url.pathname.split("/").at(-1));
          gets.push(sessionId);
          const session = sessionsById.get(sessionId);
          return session
            ? Response.json(session)
            : Response.json({ error: { code: "resource_missing" } }, { status: 404 });
        }
        return Response.json(
          { error: { code: "unexpected_test_request" } },
          { status: 500 },
        );
      },
    });
    context.after(() => worker.dispose());

    const profile = await worker.dispatch("/api/profile", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(profile.status, 200);

    const concurrent = await Promise.all([
      checkout(worker),
      checkout(worker),
    ]);
    assert.deepEqual(
      concurrent.map((response) => response.status),
      [303, 303],
    );
    assert.deepEqual(
      new Set(concurrent.map((response) => response.headers.get("location"))).size,
      1,
    );
    assert.equal(
      concurrent[0].headers.get("location"),
      "https://checkout.stripe.com/c/pay/cs_checkout_integration",
    );
    assert.ok(posts.length >= 1 && posts.length <= 2);
    assert.equal(new Set(posts.map(({ key }) => key)).size, 1);
    assert.equal(new Set(posts.map(({ body }) => body)).size, 1);

    const persisted = await worker.inspect([
      {
        sql: `select id, state, provider_session_id, idempotency_key,
          provider_price_id, application_origin, provider_expires_at
          from billing_checkout_attempts`,
      },
      {
        sql: `select count(*) as count from audit_events
          where action = 'billing.checkout_session_created'`,
      },
      {
        sql: `select metadata from audit_events
          where action = 'billing.checkout_session_created'`,
      },
    ]);
    assert.equal(persisted[0].results.length, 1);
    const attempt = persisted[0].results[0];
    assert.equal(attempt.state, "open");
    assert.equal(attempt.provider_session_id, "cs_checkout_integration");
    assert.ok(attempt.idempotency_key.startsWith("roadmap-checkout-v1-"));
    assert.equal(attempt.provider_price_id, "price_checkout_integration");
    assert.equal(attempt.application_origin, testOrigin);
    assert.ok(attempt.provider_expires_at > Date.now());
    assert.equal(persisted[1].results[0].count, 1);
    const audit = JSON.stringify(persisted[2].results);
    assert.doesNotMatch(audit, /checkout\.stripe\.com|roadmap-checkout-v1-/);
    assert.doesNotMatch(audit, /cs_checkout_integration/);

    const postCountBeforeResume = posts.length;
    const resumed = await checkout(worker);
    assert.equal(resumed.status, 303);
    assert.equal(
      resumed.headers.get("location"),
      "https://checkout.stripe.com/c/pay/cs_checkout_integration",
    );
    assert.equal(posts.length, postCountBeforeResume);
    // The account-wide operation lease serializes the overlapping second
    // request behind the creator. It then revalidates the persisted session
    // provider-authoritatively, as does this explicit later resume.
    assert.deepEqual(gets, [
      "cs_checkout_integration",
      "cs_checkout_integration",
    ]);
  },
);

test(
  "Checkout reconciliation stays provider-authoritative and fails closed",
  { timeout: 60_000 },
  async (context) => {
    const harness = await startMutableCheckoutHarness();
    context.after(() => harness.worker.dispose());

    await context.test(
      "past-due provider-open attempts remain usable and completion stays blocking",
      async () => {
        const identity = {
          email: "coach.a@example.test",
          name: "Coach Expiry Open",
        };
        await createProfile(harness.worker, identity);
        const first = await checkoutAs(harness.worker, identity);
        assert.equal(first.status, 303);
        const session = harness.sessions.at(-1);
        assert.ok(session);
        await makeAttemptLocallyPastDue(harness.worker, session);

        const postCount = harness.posts.length;
        const stillOpen = await checkoutAs(harness.worker, identity);
        assert.equal(stillOpen.status, 303);
        assert.equal(stillOpen.headers.get("location"), session.url);
        assert.equal(harness.posts.length, postCount);
        assert.equal(
          await attemptState(harness.worker, session.id),
          "open",
        );

        session.status = "complete";
        session.url = null;
        const completed = await checkoutAs(harness.worker, identity);
        assert.equal(completed.status, 409);
        assert.equal(
          (await completed.json()).error.code,
          "checkout_pending_sync",
        );
        assert.equal(harness.posts.length, postCount);
        const persisted = await harness.worker.inspect([
          {
            sql: `select state, provider_session_id, provider_created_at,
              provider_expires_at from billing_checkout_attempts
              where provider_session_id = ?`,
            params: [session.id],
          },
          {
            sql: `select count(*) as count from billing_checkout_attempts
              where account_id = (
                select account_id from billing_checkout_attempts
                where provider_session_id = ?
              )`,
            params: [session.id],
          },
        ]);
        assert.equal(persisted[0].results[0].state, "completed_pending_sync");
        assert.equal(persisted[0].results[0].provider_session_id, session.id);
        assert.equal(
          persisted[0].results[0].provider_created_at,
          session.created * 1_000,
        );
        assert.equal(persisted[1].results[0].count, 1);
      },
    );

    await context.test(
      "provider error or invalidity after local expiry never unlocks a replacement",
      async () => {
        const identity = {
          email: "coach.b@example.test",
          name: "Coach Expiry Error",
        };
        await createProfile(harness.worker, identity);
        const first = await checkoutAs(harness.worker, identity);
        assert.equal(first.status, 303);
        const session = harness.sessions.at(-1);
        assert.ok(session);
        await makeAttemptLocallyPastDue(harness.worker, session);
        const postCount = harness.posts.length;

        harness.getBehavior.set(session.id, "error");
        const providerError = await checkoutAs(harness.worker, identity);
        assert.equal(providerError.status, 502);
        assert.equal(
          (await providerError.json()).error.code,
          "billing_provider_error",
        );
        assert.equal(await attemptState(harness.worker, session.id), "open");
        assert.equal(harness.posts.length, postCount);

        harness.getBehavior.set(session.id, "invalid");
        const invalidProvider = await checkoutAs(harness.worker, identity);
        assert.equal(invalidProvider.status, 502);
        assert.equal(
          (await invalidProvider.json()).error.code,
          "billing_provider_response_invalid",
        );
        assert.equal(await attemptState(harness.worker, session.id), "open");
        assert.equal(harness.posts.length, postCount);
        assert.equal(
          await attemptCountForSessionAccount(harness.worker, session.id),
          1,
        );
      },
    );

    await context.test(
      "only validated provider expiry unlocks one current-price replacement",
      async () => {
        const identity = {
          email: "atomic.coach@example.test",
          name: "Coach Provider Expired",
        };
        await createProfile(harness.worker, identity);
        const first = await checkoutAs(harness.worker, identity);
        assert.equal(first.status, 303);
        const expiredSession = harness.sessions.at(-1);
        assert.ok(expiredSession);
        expiredSession.status = "expired";
        expiredSession.url = null;
        const postCount = harness.posts.length;

        const replacement = await checkoutAs(harness.worker, identity);
        assert.equal(replacement.status, 303);
        assert.equal(harness.posts.length, postCount + 1);
        const replacementSession = harness.sessions.at(-1);
        assert.ok(replacementSession);
        assert.notEqual(replacementSession.id, expiredSession.id);
        assert.equal(
          replacement.headers.get("location"),
          replacementSession.url,
        );

        const attempts = await harness.worker.inspect([
          {
            sql: `select state, provider_session_id, provider_price_id,
              idempotency_key from billing_checkout_attempts
              where account_id = (
                select account_id from billing_checkout_attempts
                where provider_session_id = ?
              ) order by created_at`,
            params: [expiredSession.id],
          },
        ]);
        assert.deepEqual(
          attempts[0].results.map(({ state }) => state),
          ["expired", "open"],
        );
        assert.deepEqual(
          attempts[0].results.map(({ provider_session_id }) =>
            provider_session_id,
          ),
          [expiredSession.id, replacementSession.id],
        );
        assert.ok(
          attempts[0].results.every(
            ({ provider_price_id }) =>
              provider_price_id === stripeConfiguration.STRIPE_CHECKOUT_PRICE_ID,
          ),
        );
        assert.equal(
          new Set(
            attempts[0].results.map(({ idempotency_key }) => idempotency_key),
          ).size,
          2,
        );
      },
    );

    await context.test(
      "frozen price drift cannot create or redirect but can reconcile expiry",
      async () => {
        const identity = {
          email: "lifecycle.coach@example.test",
          name: "Coach Price Drift",
        };
        await createProfile(harness.worker, identity);
        const first = await checkoutAs(harness.worker, identity);
        assert.equal(first.status, 303);
        const session = harness.sessions.at(-1);
        assert.ok(session);
        const oldPrice = "price_historical_frozen";
        session.metadata.price_id = oldPrice;
        await harness.worker.inspect([
          {
            sql: `update billing_checkout_attempts
              set provider_price_id = ? where provider_session_id = ?`,
            params: [oldPrice, session.id],
          },
        ]);
        const postCount = harness.posts.length;

        const blockedOpen = await checkoutAs(harness.worker, identity);
        assert.equal(blockedOpen.status, 409);
        assert.equal(
          (await blockedOpen.json()).error.code,
          "checkout_policy_changed",
        );
        assert.equal(await attemptState(harness.worker, session.id), "open");
        assert.equal(harness.posts.length, postCount);

        session.status = "expired";
        session.url = null;
        const reconciled = await checkoutAs(harness.worker, identity);
        assert.equal(reconciled.status, 303);
        assert.equal(harness.posts.length, postCount + 1);
        assert.equal(await attemptState(harness.worker, session.id), "expired");

        const reservedIdentity = {
          email: "other.tenant@example.test",
          name: "Coach Reserved Price Drift",
        };
        await createProfile(harness.worker, reservedIdentity);
        const seeded = await checkoutAs(harness.worker, reservedIdentity);
        assert.equal(seeded.status, 303);
        const reservedSession = harness.sessions.at(-1);
        assert.ok(reservedSession);
        await harness.worker.inspect([
          {
            sql: `update billing_checkout_attempts
              set state = 'reserved', provider_session_id = null,
                provider_created_at = null, provider_price_id = ?
              where provider_session_id = ?`,
            params: [oldPrice, reservedSession.id],
          },
        ]);
        const postsBeforeReservedRetry = harness.posts.length;
        const blockedReserved = await checkoutAs(
          harness.worker,
          reservedIdentity,
        );
        assert.equal(blockedReserved.status, 409);
        assert.equal(
          (await blockedReserved.json()).error.code,
          "checkout_policy_changed",
        );
        assert.equal(harness.posts.length, postsBeforeReservedRetry);
      },
    );
  },
);

function checkout(worker) {
  return checkoutAs(worker, coach);
}

function checkoutAs(worker, identity) {
  return worker.dispatch("/api/billing/checkout", {
    method: "POST",
    redirect: "manual",
    headers: writeHeaders(identity.email, identity.name),
  });
}

async function createProfile(worker, identity) {
  const response = await worker.dispatch("/api/profile", {
    headers: identityHeaders(identity.email, identity.name),
  });
  assert.equal(response.status, 200);
}

async function startMutableCheckoutHarness() {
  const posts = [];
  const gets = [];
  const sessions = [];
  const sessionsByKey = new Map();
  const sessionsById = new Map();
  const getBehavior = new Map();
  const worker = await startD1Worker(stripeConfiguration, {
    outboundService: async (request) => {
      const url = new URL(request.url);
      assert.equal(
        request.headers.get("authorization"),
        `Bearer ${stripeConfiguration.STRIPE_SECRET_KEY}`,
      );
      if (
        request.method === "POST" &&
        url.pathname === "/v1/checkout/sessions"
      ) {
        const key = request.headers.get("idempotency-key");
        const body = await request.text();
        assert.ok(key?.startsWith("roadmap-checkout-v1-"));
        posts.push({ key, body });
        const prior = sessionsByKey.get(key);
        if (prior) {
          assert.equal(body, prior.body);
          return Response.json(prior.session);
        }
        const parameters = new URLSearchParams(body);
        const sequence = sessions.length + 1;
        const session = {
          id: `cs_mutable_checkout_${sequence}`,
          mode: "subscription",
          status: "open",
          url: `https://checkout.stripe.com/c/pay/cs_mutable_checkout_${sequence}`,
          created: Math.floor(Date.now() / 1_000) - 7_200,
          expires_at: Number(parameters.get("expires_at")),
          client_reference_id: parameters.get("client_reference_id"),
          customer: null,
          subscription: null,
          metadata: {
            account_id: parameters.get("metadata[account_id]"),
            checkout_attempt_id: parameters.get(
              "metadata[checkout_attempt_id]",
            ),
            price_id: parameters.get("metadata[price_id]"),
          },
        };
        sessions.push(session);
        sessionsByKey.set(key, { body, session });
        sessionsById.set(session.id, session);
        return Response.json(session);
      }
      if (
        request.method === "GET" &&
        url.pathname.startsWith("/v1/checkout/sessions/")
      ) {
        const sessionId = decodeURIComponent(url.pathname.split("/").at(-1));
        gets.push(sessionId);
        const session = sessionsById.get(sessionId);
        if (getBehavior.get(sessionId) === "error") {
          return Response.json(
            { error: { code: "synthetic_provider_failure" } },
            { status: 500 },
          );
        }
        if (!session) {
          return Response.json(
            { error: { code: "resource_missing" } },
            { status: 404 },
          );
        }
        if (getBehavior.get(sessionId) === "invalid") {
          return Response.json({
            ...session,
            metadata: {
              ...session.metadata,
              checkout_attempt_id: "tampered-attempt-id",
            },
          });
        }
        return Response.json(session);
      }
      return Response.json(
        { error: { code: "unexpected_test_request" } },
        { status: 500 },
      );
    },
  });
  return { worker, posts, gets, sessions, getBehavior };
}

async function makeAttemptLocallyPastDue(worker, session) {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const attemptCreatedAt = (nowSeconds - 10_800) * 1_000;
  const providerExpiresAt = (nowSeconds - 3_600) * 1_000;
  assert.ok(session.created * 1_000 > attemptCreatedAt);
  assert.ok(session.created * 1_000 < providerExpiresAt);
  session.expires_at = providerExpiresAt / 1_000;
  await worker.inspect([
    {
      sql: `update billing_checkout_attempts
        set created_at = ?, provider_expires_at = ?
        where provider_session_id = ?`,
      params: [attemptCreatedAt, providerExpiresAt, session.id],
    },
  ]);
}

async function attemptState(worker, sessionId) {
  const result = await worker.inspect([
    {
      sql: "select state from billing_checkout_attempts where provider_session_id = ?",
      params: [sessionId],
    },
  ]);
  return result[0].results[0]?.state ?? null;
}

async function attemptCountForSessionAccount(worker, sessionId) {
  const result = await worker.inspect([
    {
      sql: `select count(*) as count from billing_checkout_attempts
        where account_id = (
          select account_id from billing_checkout_attempts
          where provider_session_id = ?
        )`,
      params: [sessionId],
    },
  ]);
  return result[0].results[0].count;
}
