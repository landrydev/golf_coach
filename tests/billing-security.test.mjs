import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import { RequestError } from "../lib/http.ts";
import {
  identityHeaders,
  startD1Worker,
} from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const {
  billingConfigured,
  checkoutConfiguration,
  createBillingPortalSession,
  createCheckoutSession,
  verifyStripeEvent,
} = await import("../lib/stripe.ts");
const {
  billingPolicyConfigurationReady,
  readBillingPolicy,
  subscriptionProjectionRefreshIntervalSeconds,
} = await import("../lib/billing-policy.ts");

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const validBillingPolicyEnvironment = {
  STRIPE_CHECKOUT_PRICE_ID: "price_server_configured",
  STRIPE_RECOGNIZED_PRICE_IDS:
    "price_server_configured,price_historical_recognized",
  SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: "price_server_configured",
  SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
};
const billingPolicyEnvironmentKeys = Object.keys(
  validBillingPolicyEnvironment,
);

test("shared billing policy has no defaults and rejects inconsistent Price sets", () => {
  const policy = readBillingPolicy(validBillingPolicyEnvironment);
  assert.ok(policy);
  assert.equal(policy.checkoutPriceId, "price_server_configured");
  assert.deepEqual([...policy.recognizedPriceIds], [
    "price_server_configured",
    "price_historical_recognized",
  ]);
  assert.deepEqual([...policy.entitlementPriceIds], [
    "price_server_configured",
  ]);
  assert.equal(policy.maxProjectionAgeSeconds, 3600);
  assert.equal(subscriptionProjectionRefreshIntervalSeconds(3600), 1800);
  assert.equal(subscriptionProjectionRefreshIntervalSeconds(900), 450);
  assert.equal(
    billingPolicyConfigurationReady(validBillingPolicyEnvironment),
    true,
  );

  for (const invalidEnvironment of [
    { ...validBillingPolicyEnvironment, STRIPE_CHECKOUT_PRICE_ID: undefined },
    {
      ...validBillingPolicyEnvironment,
      STRIPE_CHECKOUT_PRICE_ID: "price_not_recognized",
    },
    {
      ...validBillingPolicyEnvironment,
      SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: "price_historical_recognized",
    },
    {
      ...validBillingPolicyEnvironment,
      STRIPE_RECOGNIZED_PRICE_IDS: "price_server_configured",
      SUBSCRIPTION_ENTITLEMENT_PRICE_IDS:
        "price_server_configured,price_unknown_entitlement",
    },
    {
      ...validBillingPolicyEnvironment,
      STRIPE_RECOGNIZED_PRICE_IDS:
        "price_server_configured,price_server_configured",
    },
    {
      ...validBillingPolicyEnvironment,
      STRIPE_RECOGNIZED_PRICE_IDS: "price_server_configured,",
    },
    {
      ...validBillingPolicyEnvironment,
      SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "0",
    },
    {
      ...validBillingPolicyEnvironment,
      SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "899",
    },
    {
      ...validBillingPolicyEnvironment,
      SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600.0",
    },
    {
      ...validBillingPolicyEnvironment,
      SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "31536001",
    },
  ]) {
    assert.equal(readBillingPolicy(invalidEnvironment), null);
    assert.equal(billingPolicyConfigurationReady(invalidEnvironment), false);
  }
});

test("billing readiness requires secrets and the complete shared policy", () => {
  const keys = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    ...billingPolicyEnvironmentKeys,
  ];
  const previous = captureEnvironment(keys);
  try {
    process.env.STRIPE_SECRET_KEY = "sk_test_ready_not_a_real_credential";
    process.env.STRIPE_WEBHOOK_SECRET =
      "whsec_ready_not_a_real_credential";
    applyEnvironment(validBillingPolicyEnvironment);
    assert.equal(billingConfigured(), true);

    delete process.env.SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS;
    assert.equal(billingConfigured(), false);
  } finally {
    restoreEnvironmentSnapshot(previous);
  }
});

test("Checkout lifetime preserves Stripe's documented creation-time bounds", () => {
  const keys = [
    ...billingPolicyEnvironmentKeys,
    "STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS",
  ];
  const previous = captureEnvironment(keys);
  try {
    applyEnvironment(validBillingPolicyEnvironment);

    for (const lifetime of ["", "1800", "1859", "86401", "3600.0", "-1"]) {
      process.env.STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS = lifetime;
      assert.equal(checkoutConfiguration(), null);
    }

    for (const lifetime of ["1860", "3600", "86400"]) {
      process.env.STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS = lifetime;
      assert.deepEqual(checkoutConfiguration(), {
        priceId: "price_server_configured",
        sessionLifetimeSeconds: Number(lifetime),
      });
    }
  } finally {
    restoreEnvironmentSnapshot(previous);
  }
});

test(
  "health requires an explicit disabled flag or a fully configured enabled billing policy",
  { timeout: 120_000 },
  async () => {
    const configuredBilling = {
      STRIPE_SECRET_KEY: "sk_test_health_not_a_real_credential",
      STRIPE_WEBHOOK_SECRET: "whsec_health_not_a_real_credential",
      ...validBillingPolicyEnvironment,
      STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS: "3600",
    };
    const cases = [
      {
        name: "missing flag",
        bindings: {},
        expectedReady: false,
      },
      {
        name: "non-canonical flag",
        bindings: {
          ...configuredBilling,
          BILLING_CHECKOUT_ENABLED: " true ",
        },
        expectedReady: false,
      },
      {
        name: "explicitly disabled",
        bindings: { BILLING_CHECKOUT_ENABLED: "false" },
        expectedReady: true,
      },
      {
        name: "fully configured and enabled",
        bindings: {
          ...configuredBilling,
          BILLING_CHECKOUT_ENABLED: "true",
        },
        expectedReady: true,
      },
    ];

    for (const testCase of cases) {
      const worker = await startD1Worker(testCase.bindings);
      try {
        const response = await worker.dispatch("/api/operations/health", {
          headers: identityHeaders("coach.a@example.test", "Coach Avery"),
        });
        // Scheduler readiness remains degraded until its first hosted run;
        // this assertion targets the independently reported app readiness.
        assert.equal(response.status, 503, testCase.name);
        const body = await response.json();
        assert.equal(
          body.application.status,
          testCase.expectedReady ? "ready" : "degraded",
          testCase.name,
        );
        assert.equal(
          body.application.checks.billingCheckoutPolicy,
          testCase.expectedReady,
          testCase.name,
        );
        assert.equal(JSON.stringify(body).includes(" true "), false);
      } finally {
        await worker.dispose();
      }
    }
  },
);

test(
  "public liveness is cacheable and does not touch or disclose readiness dependencies",
  { timeout: 60_000 },
  async () => {
    const worker = await startD1Worker({
      BILLING_CHECKOUT_ENABLED: "malformed",
    });
    try {
      const response = await worker.dispatch("/api/health");
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control") ?? "", /max-age=30/);
      assert.deepEqual(await response.json(), {
        status: "live",
        releaseId: "unversioned",
      });
    } finally {
      await worker.dispose();
    }
  },
);

test("Stripe signatures authenticate the exact raw body within the replay window", async () => {
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const secret = "whsec_test_signature_only_not_a_real_credential";
  const now = 1_786_118_400;
  const event = {
    id: "evt_signature_test",
    type: "customer.subscription.updated",
    created: now,
    data: { object: { id: "sub_signature_test" } },
  };
  const rawBody = JSON.stringify(event);
  process.env.STRIPE_WEBHOOK_SECRET = secret;

  try {
    const signature = stripeSignature(secret, now, rawBody);
    const verified = await verifyStripeEvent(
      rawBody,
      `t=${now},v1=${"0".repeat(64)},v1=${signature}`,
      now,
    );
    assert.deepEqual(verified, event);

    await assert.rejects(
      verifyStripeEvent(
        `${rawBody} `,
        `t=${now},v1=${signature}`,
        now,
      ),
      (error) =>
        error instanceof RequestError &&
        error.status === 400 &&
        error.code === "invalid_signature",
    );

    const staleTimestamp = now - 301;
    await assert.rejects(
      verifyStripeEvent(
        rawBody,
        `t=${staleTimestamp},v1=${stripeSignature(secret, staleTimestamp, rawBody)}`,
        now,
      ),
      (error) =>
        error instanceof RequestError &&
        error.status === 400 &&
        error.code === "stale_signature",
    );

    await assert.rejects(
      verifyStripeEvent(rawBody, null, now),
      (error) =>
        error instanceof RequestError &&
        error.status === 400 &&
        error.code === "missing_signature",
    );
  } finally {
    restoreEnvironment("STRIPE_WEBHOOK_SECRET", previousSecret);
  }
});

test("Stripe API requests use only server-provided billing configuration and route inputs", async () => {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.STRIPE_SECRET_KEY;
  const previousPolicy = captureEnvironment(billingPolicyEnvironmentKeys);
  const calls = [];
  process.env.STRIPE_SECRET_KEY = "sk_test_request_capture_not_a_real_credential";
  applyEnvironment(validBillingPolicyEnvironment);
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    const isPortal = String(input).endsWith("/billing_portal/sessions");
    return Response.json(
      isPortal
        ? { id: "bps_test", url: "https://billing.stripe.com/p/session" }
        : { id: "cs_test", url: "https://checkout.stripe.com/c/pay/session" },
    );
  };

  try {
    await createCheckoutSession({
      accountId: "account_server_owned",
      attemptId: "attempt_server_owned",
      idempotencyKey: "roadmap-checkout-v1-attempt_server_owned",
      priceId: "price_historical_recognized",
      email: "coach@example.ca",
      customerId: null,
      successUrl: "https://roadmap.example/app/billing?checkout=complete",
      cancelUrl: "https://roadmap.example/app/billing?checkout=canceled",
      expiresAtSeconds: 1_786_122_000,
      returnUrl: "https://attacker.example/return",
    });
    await createBillingPortalSession({
      customerId: "cus_server_owned",
      returnUrl: "https://roadmap.example/app/billing",
      accountId: "account_attacker_controlled",
    });

    assert.equal(calls.length, 2);
    const checkout = calls[0];
    assert.equal(checkout.input, "https://api.stripe.com/v1/checkout/sessions");
    assert.equal(checkout.init.method, "POST");
    assert.equal(
      checkout.init.headers.Authorization,
      "Bearer sk_test_request_capture_not_a_real_credential",
    );
    assert.equal(
      checkout.init.headers["Idempotency-Key"],
      "roadmap-checkout-v1-attempt_server_owned",
    );
    assert.ok(checkout.init.signal instanceof AbortSignal);
    const checkoutBody = new URLSearchParams(checkout.init.body);
    assert.equal(checkoutBody.get("mode"), "subscription");
    assert.equal(checkoutBody.get("client_reference_id"), "account_server_owned");
    assert.equal(
      checkoutBody.get("subscription_data[metadata][account_id]"),
      "account_server_owned",
    );
    assert.equal(
      checkoutBody.get("subscription_data[metadata][checkout_attempt_id]"),
      "attempt_server_owned",
    );
    assert.equal(checkoutBody.get("metadata[account_id]"), "account_server_owned");
    assert.equal(
      checkoutBody.get("metadata[checkout_attempt_id]"),
      "attempt_server_owned",
    );
    assert.equal(
      checkoutBody.get("line_items[0][price]"),
      "price_historical_recognized",
    );
    assert.equal(checkoutBody.get("line_items[0][quantity]"), "1");
    assert.equal(checkoutBody.get("expires_at"), "1786122000");
    assert.equal(
      checkoutBody.get("success_url"),
      "https://roadmap.example/app/billing?checkout=complete",
    );
    assert.equal(
      checkoutBody.get("cancel_url"),
      "https://roadmap.example/app/billing?checkout=canceled",
    );
    assert.equal(checkoutBody.get("priceId"), null);
    assert.equal(checkoutBody.get("returnUrl"), null);
    assert.equal(checkoutBody.get("after_expiration[recovery][enabled]"), null);

    const portal = calls[1];
    assert.equal(portal.input, "https://api.stripe.com/v1/billing_portal/sessions");
    assert.match(
      portal.init.headers["Idempotency-Key"],
      /^roadmap-portal-cus_server_owned-\d+$/,
    );
    assert.ok(portal.init.signal instanceof AbortSignal);
    const portalBody = new URLSearchParams(portal.init.body);
    assert.deepEqual([...portalBody.keys()].sort(), ["customer", "return_url"]);
    assert.equal(portalBody.get("customer"), "cus_server_owned");
    assert.equal(portalBody.get("return_url"), "https://roadmap.example/app/billing");
    assert.doesNotMatch(portal.init.body.toString(), /attacker/i);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnvironment("STRIPE_SECRET_KEY", previousSecret);
    restoreEnvironmentSnapshot(previousPolicy);
  }
});

test("Stripe transport failures are bounded and return a safe provider error", async () => {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.STRIPE_SECRET_KEY;
  const previousPolicy = captureEnvironment(billingPolicyEnvironmentKeys);
  process.env.STRIPE_SECRET_KEY = "sk_test_transport_not_a_real_credential";
  applyEnvironment({
    STRIPE_CHECKOUT_PRICE_ID: "price_transport_test",
    STRIPE_RECOGNIZED_PRICE_IDS: "price_transport_test",
    SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: "price_transport_test",
    SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
  });
  globalThis.fetch = async () => {
    throw new DOMException("request timed out", "TimeoutError");
  };

  try {
    await assert.rejects(
      createCheckoutSession({
        accountId: "account_transport",
        attemptId: "attempt_transport",
        idempotencyKey: "roadmap-checkout-v1-attempt_transport",
        priceId: "price_transport_test",
        email: "coach@example.ca",
        customerId: null,
        successUrl: "https://roadmap.example/app/billing?checkout=complete",
        cancelUrl: "https://roadmap.example/app/billing?checkout=canceled",
        expiresAtSeconds: 1_786_122_000,
      }),
      (error) =>
        error instanceof RequestError &&
        error.status === 502 &&
        error.code === "billing_provider_error" &&
        !/secret|timeout/i.test(error.message),
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnvironment("STRIPE_SECRET_KEY", previousSecret);
    restoreEnvironmentSnapshot(previousPolicy);
  }
});

test("Checkout, Portal, and reconciliation routes keep billing identity and provider references server-controlled", async () => {
  const [checkout, portal, reconciliation, shared] = await Promise.all([
    readFile(projectFile("app/api/billing/checkout/route.ts"), "utf8"),
    readFile(projectFile("app/api/billing/portal/route.ts"), "utf8"),
    readFile(projectFile("app/api/billing/reconcile/route.ts"), "utf8"),
    readFile(projectFile("app/api/billing/_shared.ts"), "utf8"),
  ]);

  for (const route of [checkout, portal, reconciliation]) {
    assert.match(route, /assertSameOrigin\(request\)/);
    assert.match(route, /requireApiIdentity\(\)/);
    assert.match(route, /getOrCreateAccountForIdentity\(authentication\.identity\)/);
    assert.doesNotMatch(route, /request\.(?:json|text|formData)\s*\(/);
    assert.doesNotMatch(route, /readJson\s*</);
  }

  assert.match(checkout, /checkoutEnabled\(\)/);
  assert.match(portal, /billingConfigured\(\)/);
  assert.match(checkout, /accountId:\s*account\.id/);
  assert.match(checkout, /customerEmail:\s*account\.primaryEmail/);
  assert.match(checkout, /getCanonicalBillingCustomer\(account\.id\)/);
  assert.match(
    checkout,
    /providerCustomerId:\s*customer\?\.providerCustomerId \?\? null/,
  );
  assert.match(checkout, /idempotencyKey:\s*attempt\.idempotencyKey/);
  assert.match(checkout, /priceId:\s*attempt\.providerPriceId/);
  assert.ok(
    checkout.includes(
      "successUrl: `${attempt.applicationOrigin}/app/billing?checkout=complete`",
    ),
  );
  assert.ok(
    checkout.includes(
      "cancelUrl: `${attempt.applicationOrigin}/app/billing?checkout=canceled`",
    ),
  );
  assert.match(portal, /getCanonicalBillingCustomer\(account\.id\)/);
  assert.match(portal, /customerId:\s*customer\.providerCustomerId/);
  assert.ok(portal.includes("returnUrl: `${origin}/app/billing`"));
  assert.match(reconciliation, /reconcileBillingAccount\(\{/);
  assert.match(reconciliation, /accountId:\s*account\.id/);
  assert.match(reconciliation, /reconcile=refresh_review/);
  assert.match(reconciliation, /browserRecoveryRedirect\(request, error\)/);
  assert.doesNotMatch(
    reconciliation,
    /providerSubscriptionId|providerCustomerId|providerSessionId|priceId/,
  );
  assert.match(shared, /process\.env\.APP_URL/);
  assert.match(shared, /status:\s*303/);
});

test("billing-event receipt and replay handling preserve durable idempotency invariants", async () => {
  const [repository, webhook, schema] = await Promise.all([
    readFile(projectFile("lib/billing-repository.ts"), "utf8"),
    readFile(projectFile("app/api/billing/webhook/route.ts"), "utf8"),
    readFile(projectFile("db/schema.ts"), "utf8"),
  ]);

  assert.match(
    schema,
    /uniqueIndex\("billing_events_provider_event_unique"\)[\s\S]*?table\.provider,[\s\S]*?table\.providerEventId/,
  );
  assert.match(repository, /\.onConflictDoNothing\(\)/);
  assert.match(repository, /eq\(billingEvents\.providerEventId, input\.providerEventId\)/);
  assert.match(
    repository,
    /event\.payloadSha256 === input\.payloadSha256[\s\S]*?event\.providerEventType === input\.providerEventType/,
  );
  assert.match(repository, /status:\s*"processed"/);
  assert.match(repository, /status:\s*"ignored"/);
  assert.match(repository, /status:\s*"failed"/);
  assert.match(schema, /leaseToken:\s*text\("lease_token"\)/);
  assert.match(schema, /leaseExpiresAt:\s*timestamp\("lease_expires_at"\)/);
  assert.match(schema, /lastAttemptAt:\s*timestamp\("last_attempt_at"\)/);
  assert.match(schema, /updatedAt:\s*updatedAt\(\)/);
  assert.match(repository, /processingAttempts:\s*sql`\$\{billingEvents\.processingAttempts\} \+ 1`/);
  assert.match(repository, /inArray\(billingEvents\.status, \["received", "failed"\]\)/);
  assert.match(repository, /eq\(billingEvents\.status, "processing"\)/);
  assert.match(repository, /const leaseToken = newId\(\)/);
  assert.match(repository, /leaseExpiresAt = new Date\(now\.getTime\(\) \+ BILLING_EVENT_LEASE_MS\)/);
  assert.match(repository, /lt\(billingEvents\.leaseExpiresAt, now\)/);
  assert.match(repository, /lastAttemptAt:\s*now/);
  assert.match(repository, /\.returning\(\{ id: billingEvents\.id \}\)/);
  assert.match(repository, /\? \{ eventId, leaseToken, leaseExpiresAt \}[\s\S]*?: null/);
  assert.match(webhook, /claim = await markBillingEventProcessing\(receipt\.id\)/);
  assert.match(webhook, /if \(!claim\)[\s\S]*?return processingInProgress\(\)/);
  assert.match(webhook, /function processingInProgress\([\s\S]*?status:\s*503/);
  assert.match(webhook, /"Retry-After":\s*"60"/);
  assert.doesNotMatch(repository, /(?:rawBody|rawPayload|payloadBody)\s*:/);

  const ignore = sourceBlock(
    repository,
    "export async function ignoreBillingEvent",
    "export async function failBillingEvent",
  );
  const failure = sourceBlock(
    repository,
    "export async function failBillingEvent",
    "export async function applyStripeSubscriptionEvent",
  );
  const apply = sourceBlock(
    repository,
    "export async function applyStripeSubscriptionEvent",
    "function billingEventLeaseGuard",
  );
  for (const terminalMutation of [ignore, failure]) {
    assert.match(terminalMutation, /claim:\s*BillingEventClaim/);
    assert.match(terminalMutation, /db\.batch\(\[\s*billingEventLeaseGuard\(db, input\.claim, now\)/);
    assert.match(terminalMutation, /leaseToken:\s*null/);
    assert.match(terminalMutation, /leaseExpiresAt:\s*null/);
    assert.match(
      terminalMutation,
      /eq\(billingEvents\.leaseToken, input\.claim\.leaseToken\)/,
    );
  }
  assert.match(apply, /kind:\s*"event"/);
  assert.match(apply, /generationFencedBillingEventLeaseGuard\(/);
  assert.match(apply, /db\.batch\(\[\s*terminalGuard/);
  assert.match(apply, /leaseToken:\s*null/);
  assert.match(apply, /leaseExpiresAt:\s*null/);
  assert.match(
    apply,
    /eq\(billingEvents\.leaseToken, terminalContext\.claim\.leaseToken\)/,
  );
  assert.match(
    repository,
    /function billingEventLeaseGuard[\s\S]*?status\} = 'processing'[\s\S]*?leaseToken\} = \$\{claim\.leaseToken\}[\s\S]*?leaseExpiresAt\} > \$\{now\.getTime\(\)\}[\s\S]*?else null/,
  );

  const receiptIndex = webhook.indexOf("await receiveBillingEvent(");
  const dispatchIndex = webhook.indexOf("SUPPORTED_EVENT_TYPES.has(event.type)");
  assert.ok(receiptIndex >= 0 && dispatchIndex > receiptIndex);
  assert.match(
    webhook,
    /received\.duplicate[\s\S]*?\["processed", "ignored"\]\.includes\(received\.event\.status\)[\s\S]*?return acknowledge/,
  );
  assert.match(webhook, /event_integrity_conflict/);
  assert.match(webhook, /await failBillingEvent\(/);
});

test(
  "an active billing-event lease returns a retryable 503 without stealing ownership",
  { timeout: 60_000 },
  async (context) => {
    const webhookSecret = "whsec_active_lease_synthetic_test_only";
    const worker = await startD1Worker({
      STRIPE_WEBHOOK_SECRET: webhookSecret,
    });
    context.after(() => worker.dispose());

    const timestamp = Math.floor(Date.now() / 1_000);
    const rawBody = JSON.stringify({
      id: "evt_active_lease_test",
      type: "customer.subscription.updated",
      created: timestamp,
      data: { object: { id: "sub_active_lease_test" } },
    });
    const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
    const now = Date.now();
    const leaseExpiresAt = now + 5 * 60 * 1_000;

    await worker.inspect([
      {
        sql: `insert into billing_events (
          id, provider, provider_event_id, provider_event_type, status,
          payload_sha256, event_occurred_at, received_at, processed_at,
          lease_token, lease_expires_at, last_attempt_at, processing_attempts,
          created_at, updated_at
        ) values (?, 'stripe', ?, ?, 'processing', ?, ?, ?, null, ?, ?, ?, 1, ?, ?)`,
        params: [
          "billing_event_active_lease_test",
          "evt_active_lease_test",
          "customer.subscription.updated",
          payloadSha256,
          timestamp * 1_000,
          now,
          "lease_owner_active_test",
          leaseExpiresAt,
          now,
          now,
          now,
        ],
      },
    ]);

    const response = await worker.dispatch("/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${stripeSignature(
          webhookSecret,
          timestamp,
          rawBody,
        )}`,
      },
      body: rawBody,
    });

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.equal(
      (await response.json()).error.code,
      "billing_event_processing_in_progress",
    );

    await assert.rejects(
      worker.inspect([
        {
          sql: `update billing_events
            set provider_event_id = case
              when status = 'processing'
                and lease_token = ?
                and lease_expires_at > ?
              then provider_event_id
              else null
            end
            where id = ?`,
          params: [
            "stale_lease_owner_test",
            now,
            "billing_event_active_lease_test",
          ],
        },
        {
          sql: `insert into audit_events
            (id, actor_type, action, target_type, target_id, outcome)
            values (?, 'billing_provider', ?, 'billing_event', ?, 'success')`,
          params: [
            "audit_stale_lease_owner_test",
            "billing.stale_lease_owner_effect",
            "billing_event_active_lease_test",
          ],
        },
      ]),
      /D1 inspection failed/,
    );

    const inspection = await worker.inspect([
      {
        sql: `select status, lease_token, lease_expires_at, processing_attempts
          from billing_events where id = ?`,
        params: ["billing_event_active_lease_test"],
      },
      {
        sql: "select count(*) as count from audit_events where id = ?",
        params: ["audit_stale_lease_owner_test"],
      },
    ]);
    assert.deepEqual(inspection[0].results, [
      {
        status: "processing",
        lease_token: "lease_owner_active_test",
        lease_expires_at: leaseExpiresAt,
        processing_attempts: 1,
      },
    ]);
    assert.equal(inspection[1].results[0].count, 0);
  },
);

test("built webhook rejects declared and streamed bodies beyond 256 KiB before persistence", async () => {
  const declared = await fetchBuiltApp("/api/billing/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(256 * 1024 + 1),
    },
    body: "{}",
  });
  assert.equal(declared.status, 413);
  assert.deepEqual(await declared.json(), {
    error: {
      code: "payload_too_large",
      message: "The webhook body is too large.",
    },
  });

  const streamed = await fetchBuiltApp("/api/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(256 * 1024 + 1),
  });
  assert.equal(streamed.status, 413);
  assert.equal((await streamed.json()).error.code, "payload_too_large");
});

test("shared Stripe status mapping is an explicit allowlist with a fail-closed default", async () => {
  const [projection, schema] = await Promise.all([
    readFile(projectFile("lib/stripe-subscription.ts"), "utf8"),
    readFile(projectFile("db/schema.ts"), "utf8"),
  ]);
  const mapping = sourceBlock(
    projection,
    "function mapSubscriptionStatus",
    "function objectValue",
  );

  for (const status of [
    "incomplete",
    "trialing",
    "active",
    "past_due",
    "paused",
    "canceled",
    "unpaid",
  ]) {
    assert.match(mapping, new RegExp(`case \\"${status}\\":`));
  }
  assert.match(mapping, /case "incomplete_expired":[\s\S]*?return "ended"/);
  assert.match(mapping, /default:[\s\S]*?subscription_status_unsupported/);
  assert.match(mapping, /throw invalid/);
  assert.doesNotMatch(mapping, /as SubscriptionStatus/);
  assert.match(
    schema,
    /export const subscriptionStatuses = \[[\s\S]*?"ended",[\s\S]*?\] as const/,
  );
});

test("billing page treats Checkout returns as context, never payment proof", async () => {
  const page = await readFile(projectFile("app/app/billing/page.tsx"), "utf8");

  assert.match(page, /value === "complete"/);
  assert.match(page, /value === "canceled"/);
  assert.match(page, /This redirect does not confirm payment or an active subscription\./);
  assert.match(page, /signed webhook or an explicit read-only Stripe refresh/);
  assert.match(page, /This return does not change billing state\./);
  assert.match(page, /getSubscriptionForAccount\(account\.id\)/);
  assert.match(page, /Latest provider-authoritative state synchronized from Stripe/);
  assert.match(page, /Price is not yet approved for a live charge\./);
  assert.match(page, /Planning amounts remain pricing hypotheses/);
  assert.match(page, /disabled=\{!canOpenPortal\}/);
  assert.match(page, /action="\/api\/billing\/reconcile"/);
  assert.match(page, /cannot start a charge, create a subscription, cancel service/);
  assert.match(page, /subscription\?\.lastProviderSyncAt/);
  assert.match(page, /This page notice is not proof of payment or a new subscription/);
  assert.doesNotMatch(page, /Billing status refreshed from Stripe\./);
  assert.doesNotMatch(
    page,
    /The account now shows the latest provider-authoritative subscription state\./,
  );
  assert.doesNotMatch(page, /(?:payment|purchase) (?:was |is )?(?:successful|confirmed)/i);
});

function stripeSignature(secret, timestamp, rawBody) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

function sourceBlock(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `missing source block ${start}`);
  return source.slice(startIndex, endIndex);
}

function restoreEnvironment(name, previousValue) {
  if (previousValue === undefined) delete process.env[name];
  else process.env[name] = previousValue;
}

function captureEnvironment(names) {
  return new Map(names.map((name) => [name, process.env[name]]));
}

function applyEnvironment(values) {
  for (const [name, value] of Object.entries(values)) {
    process.env[name] = value;
  }
}

function restoreEnvironmentSnapshot(snapshot) {
  for (const [name, value] of snapshot) restoreEnvironment(name, value);
}

async function fetchBuiltApp(path, init) {
  const workerUrl = projectFile("dist/server/index.js");
  workerUrl.searchParams.set(
    "billing-test",
    `${process.pid}-${Date.now()}-${Math.random()}`,
  );
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(new URL(path, "https://roadmap.example"), init),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}
