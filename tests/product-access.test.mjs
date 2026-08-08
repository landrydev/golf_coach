import assert from "node:assert/strict";
import { test } from "node:test";
import {
  identityHeaders,
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

const allowedOwner = {
  email: "coach.a@example.test",
  name: "Coach Avery",
};
const unknownInstructor = {
  email: "not.allowed@example.test",
  name: "Unknown Instructor",
};
const subscriptionStatuses = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
  "unpaid",
  "ended",
];
const subscriptionPolicyBindings = {
  STRIPE_CHECKOUT_PRICE_ID: "price_access_matrix",
  STRIPE_RECOGNIZED_PRICE_IDS:
    "price_access_matrix,price_historical_access",
  SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: "price_access_matrix",
  SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
};

test(
  "owner-private policy covers instructor HTML, RSC, and APIs while public boundaries remain separate",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const allowed = await worker.dispatch("/api/profile", {
      headers: identityHeaders(allowedOwner.email.toUpperCase(), allowedOwner.name),
    });
    assert.equal(allowed.status, 200);

    for (const path of ["/api/profile", "/api/golfers"]) {
      const denied = await worker.dispatch(path, {
        headers: identityHeaders(
          unknownInstructor.email,
          unknownInstructor.name,
        ),
      });
      assert.equal(denied.status, 403);
      assert.deepEqual(await denied.json(), {
        error: {
          code: "product_access_denied",
          message: "Product access is not available for this account.",
        },
      });
      assertPrivate(denied);
    }

    for (const path of ["/app", "/app.rsc", "/app/billing"]) {
      const denied = await worker.dispatch(path, {
        headers: {
          ...identityHeaders(
            unknownInstructor.email,
            unknownInstructor.name,
          ),
          accept: "text/html",
        },
      });
      assert.equal(denied.status, 403);
      const body = await denied.text();
      assert.match(body, /Access unavailable/);
      assert.doesNotMatch(body, /not\.allowed|owner_private|digest|pepper/i);
      assertPrivate(denied);
    }

    const anonymous = await worker.dispatch("/api/profile");
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await anonymous.json(), {
      error: {
        code: "authentication_required",
        message: "Sign in is required for this feature.",
      },
    });

    for (const path of ["/%61pp", "/%61pp.rsc", "/%61pi/profile"]) {
      const encodedDenied = await worker.dispatch(path, {
        headers: {
          ...identityHeaders(unknownInstructor.email, unknownInstructor.name),
          accept: "text/html,application/json",
        },
      });
      assert.equal(encodedDenied.status, 403, `${path} bypassed owner-private access`);
      assertPrivate(encodedDenied);
    }

    const shareSession = await worker.dispatch("/r/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({}),
    });
    assert.notEqual(shareSession.status, 403);
    assert.doesNotMatch(await shareSession.text(), /product_access_denied/);

    const golferRsc = await worker.dispatch("/r.rsc", {
      headers: { accept: "text/x-component" },
    });
    assertPrivate(golferRsc);
    assert.equal(golferRsc.headers.get("referrer-policy"), "no-referrer");

    const encodedGolfer = await worker.dispatch("/%72/plan", {
      headers: { accept: "text/html" },
    });
    assertPrivate(encodedGolfer);
    assert.equal(encodedGolfer.headers.get("referrer-policy"), "no-referrer");

    const webhook = await worker.dispatch("/api/billing/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.notEqual(webhook.status, 403);
    assert.notEqual((await webhook.json()).error.code, "product_access_denied");
  },
);

test(
  "subscription mode preserves account controls and gates core routes by the explicit latest status",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker({
      INSTRUCTOR_ACCESS_MODE: "subscription_required",
      SUBSCRIPTION_ACCESS_STATUSES: "active",
      ...subscriptionPolicyBindings,
      OWNER_PRIVATE_ACCESS_PEPPER: "",
      OWNER_PRIVATE_EMAIL_DIGESTS: "",
    });
    context.after(() => worker.dispose());
    const headers = identityHeaders(allowedOwner.email, allowedOwner.name);

    for (const path of [
      "/api/profile",
      "/app/billing",
      "/app/settings",
      "/app/settings/data.rsc",
    ]) {
      const response = await worker.dispatch(path, { headers });
      assert.equal(response.status, 200, `${path} should remain reachable`);
      if (path === "/app/billing") {
        const policy = response.headers.get("content-security-policy") ?? "";
        assert.match(
          policy,
          /form-action 'self' https:\/\/checkout\.stripe\.com https:\/\/billing\.stripe\.com/,
        );
        assert.match(policy, /connect-src 'self'/);
        assert.match(policy, /frame-src 'none'/);
      }
    }
    const dataExport = await worker.dispatch("/api/data-export", {
      method: "POST",
      headers: writeHeaders(allowedOwner.email, allowedOwner.name),
      body: "{}",
    });
    assert.equal(dataExport.status, 200);

    for (const path of ["/api/golfers", "/app", "/app/golfers.rsc"]) {
      const response = await worker.dispatch(path, { headers });
      assert.equal(response.status, 402, `${path} should require a subscription`);
      assertPrivate(response);
      const policy = response.headers.get("content-security-policy") ?? "";
      assert.match(policy, /form-action 'self'/);
      assert.doesNotMatch(policy, /checkout\.stripe\.com|billing\.stripe\.com/);
    }

    await insertSubscription(worker, "active");
    assert.equal(
      (await worker.dispatch("/api/golfers", { headers })).status,
      200,
    );

    for (const status of subscriptionStatuses.filter(
      (value) => value !== "active",
    )) {
      await setSubscriptionStatus(worker, status);
      const response = await worker.dispatch("/api/golfers", { headers });
      assert.equal(response.status, 402, `${status} is not configured as eligible`);
      assert.deepEqual(await response.json(), {
        error: {
          code: "subscription_required",
          message: "An eligible subscription is required for this feature.",
        },
      });
    }
  },
);

test(
  "every supported status is accepted only when it is explicitly configured",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker({
      INSTRUCTOR_ACCESS_MODE: "subscription_required",
      SUBSCRIPTION_ACCESS_STATUSES: subscriptionStatuses.join(","),
      ...subscriptionPolicyBindings,
      OWNER_PRIVATE_ACCESS_PEPPER: "",
      OWNER_PRIVATE_EMAIL_DIGESTS: "",
    });
    context.after(() => worker.dispose());
    const headers = identityHeaders(allowedOwner.email, allowedOwner.name);

    await worker.dispatch("/api/profile", { headers });
    await insertSubscription(worker, "active");
    for (const status of subscriptionStatuses) {
      await setSubscriptionStatus(worker, status);
      const response = await worker.dispatch("/api/golfers", { headers });
      assert.equal(response.status, 200, `${status} should be explicitly eligible`);
    }
  },
);

test(
  "subscription access distinguishes explicit Price ineligibility from an uncertain provider projection",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker({
      INSTRUCTOR_ACCESS_MODE: "subscription_required",
      SUBSCRIPTION_ACCESS_STATUSES: "active",
      ...subscriptionPolicyBindings,
      SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "900",
      OWNER_PRIVATE_ACCESS_PEPPER: "",
      OWNER_PRIVATE_EMAIL_DIGESTS: "",
    });
    context.after(() => worker.dispose());
    const headers = identityHeaders(allowedOwner.email, allowedOwner.name);

    await worker.dispatch("/api/profile", { headers });
    await insertSubscription(worker, "active");
    assert.equal(
      (await worker.dispatch("/api/golfers", { headers })).status,
      200,
    );

    await setSubscriptionProjection(
      worker,
      "price_historical_access",
      Date.now(),
    );
    await assertCoreDecision(worker, headers, 402, "subscription_required");

    await setSubscriptionProjection(worker, null, Date.now());
    await assertCoreDecision(worker, headers, 503, "product_access_unavailable");

    await setSubscriptionProjection(
      worker,
      "price_not_in_recognized_policy",
      Date.now(),
    );
    await assertCoreDecision(worker, headers, 503, "product_access_unavailable");

    await setSubscriptionProjection(worker, "price_access_matrix", null);
    await assertCoreDecision(worker, headers, 503, "product_access_unavailable");

    await setSubscriptionProjection(
      worker,
      "price_access_matrix",
      Date.now() - 901_000,
    );
    await assertCoreDecision(worker, headers, 503, "product_access_unavailable");

    await setSubscriptionProjection(
      worker,
      "price_access_matrix",
      Date.now() + 60_000,
    );
    await assertCoreDecision(worker, headers, 503, "product_access_unavailable");

    await setSubscriptionProjection(worker, "price_access_matrix", Date.now());
    assert.equal(
      (await worker.dispatch("/api/golfers", { headers })).status,
      200,
    );
  },
);

test(
  "missing or invalid policy configuration fails closed and health reveals only readiness",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({
      INSTRUCTOR_ACCESS_MODE: "subscription_required",
      SUBSCRIPTION_ACCESS_STATUSES: "active,unknown_status",
      ...subscriptionPolicyBindings,
    });
    context.after(() => worker.dispose());
    const headers = identityHeaders(allowedOwner.email, allowedOwner.name);

    for (const path of ["/api/profile", "/api/golfers", "/app/billing"]) {
      const response = await worker.dispatch(path, { headers });
      assert.equal(response.status, 503);
      assertPrivate(response);
    }

    const health = await worker.dispatch("/api/health");
    assert.equal(health.status, 503);
    const body = await health.json();
    assert.equal(body.checks.instructorAccessPolicy, false);
    assert.equal(JSON.stringify(body).includes("unknown_status"), false);
    assert.equal(JSON.stringify(body).includes("subscription_required"), false);
    assert.equal(JSON.stringify(body).includes("OWNER_PRIVATE"), false);
  },
);

async function insertSubscription(
  worker,
  status,
  {
    priceId = "price_access_matrix",
    lastProviderSyncAt = Date.now(),
  } = {},
) {
  await worker.inspect([
    {
      sql: `insert or ignore into billing_customers
        (provider, provider_customer_id, account_id)
        select 'stripe', 'cus_access_matrix', id
          from accounts where normalized_email = ?`,
      params: [allowedOwner.email],
    },
    {
      sql: `insert into subscriptions
        (id, account_id, provider, provider_customer_id,
         provider_subscription_id, provider_price_id, product_code, status,
         last_provider_sync_at)
        select 'sub_access_matrix', id, 'stripe', 'cus_access_matrix',
               'stripe_sub_access_matrix', ?, 'roadmap_solo', ?, ?
          from accounts where normalized_email = ?`,
      params: [priceId, status, lastProviderSyncAt, allowedOwner.email],
    },
  ]);
}

async function setSubscriptionStatus(worker, status) {
  await worker.inspect([
    {
      sql: "update subscriptions set status = ?, updated_at = (cast((julianday('now') - 2440587.5) * 86400000 as integer)) where id = 'sub_access_matrix'",
      params: [status],
    },
  ]);
}

async function setSubscriptionProjection(worker, priceId, lastProviderSyncAt) {
  await worker.inspect([
    {
      sql: `update subscriptions
               set provider_price_id = ?, last_provider_sync_at = ?,
                   updated_at = (cast((julianday('now') - 2440587.5) * 86400000 as integer))
             where id = 'sub_access_matrix'`,
      params: [priceId, lastProviderSyncAt],
    },
  ]);
}

async function assertCoreDecision(worker, headers, status, code) {
  const response = await worker.dispatch("/api/golfers", { headers });
  assert.equal(response.status, status);
  assert.equal((await response.json()).error.code, code);
  assertPrivate(response);
}

function assertPrivate(response) {
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  assert.equal(
    response.headers.get("x-robots-tag"),
    "noindex, nofollow, noarchive",
  );
}
