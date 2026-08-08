import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import { RequestError } from "../lib/http.ts";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const {
  createBillingPortalSession,
  createCheckoutSession,
  verifyStripeEvent,
} = await import("../lib/stripe.ts");

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

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
  const previousPrice = process.env.STRIPE_SOLO_PRICE_ID;
  const calls = [];
  process.env.STRIPE_SECRET_KEY = "sk_test_request_capture_not_a_real_credential";
  process.env.STRIPE_SOLO_PRICE_ID = "price_server_configured";
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
      email: "coach@example.ca",
      customerId: null,
      successUrl: "https://roadmap.example/app/billing?checkout=complete",
      cancelUrl: "https://roadmap.example/app/billing?checkout=canceled",
      priceId: "price_attacker_controlled",
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
    assert.match(
      checkout.init.headers["Idempotency-Key"],
      /^roadmap-checkout-account_server_owned-\d+$/,
    );
    assert.ok(checkout.init.signal instanceof AbortSignal);
    const checkoutBody = new URLSearchParams(checkout.init.body);
    assert.equal(checkoutBody.get("mode"), "subscription");
    assert.equal(checkoutBody.get("client_reference_id"), "account_server_owned");
    assert.equal(
      checkoutBody.get("subscription_data[metadata][account_id]"),
      "account_server_owned",
    );
    assert.equal(checkoutBody.get("metadata[account_id]"), "account_server_owned");
    assert.equal(checkoutBody.get("line_items[0][price]"), "price_server_configured");
    assert.equal(checkoutBody.get("line_items[0][quantity]"), "1");
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
    restoreEnvironment("STRIPE_SOLO_PRICE_ID", previousPrice);
  }
});

test("Stripe transport failures are bounded and return a safe provider error", async () => {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.STRIPE_SECRET_KEY;
  const previousPrice = process.env.STRIPE_SOLO_PRICE_ID;
  process.env.STRIPE_SECRET_KEY = "sk_test_transport_not_a_real_credential";
  process.env.STRIPE_SOLO_PRICE_ID = "price_transport_test";
  globalThis.fetch = async () => {
    throw new DOMException("request timed out", "TimeoutError");
  };

  try {
    await assert.rejects(
      createCheckoutSession({
        accountId: "account_transport",
        email: "coach@example.ca",
        customerId: null,
        successUrl: "https://roadmap.example/app/billing?checkout=complete",
        cancelUrl: "https://roadmap.example/app/billing?checkout=canceled",
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
    restoreEnvironment("STRIPE_SOLO_PRICE_ID", previousPrice);
  }
});

test("Checkout and Portal route sources keep identity, price, account, and return URLs server-controlled", async () => {
  const [checkout, portal, shared] = await Promise.all([
    readFile(projectFile("app/api/billing/checkout/route.ts"), "utf8"),
    readFile(projectFile("app/api/billing/portal/route.ts"), "utf8"),
    readFile(projectFile("app/api/billing/_shared.ts"), "utf8"),
  ]);

  for (const route of [checkout, portal]) {
    assert.match(route, /assertSameOrigin\(request\)/);
    assert.match(route, /requireApiIdentity\(\)/);
    assert.match(route, /getOrCreateAccountForIdentity\(authentication\.identity\)/);
    assert.doesNotMatch(route, /request\.(?:json|text|formData)\s*\(/);
    assert.doesNotMatch(route, /readJson\s*</);
  }

  assert.match(checkout, /checkoutEnabled\(\)/);
  assert.match(portal, /billingConfigured\(\)/);
  assert.match(checkout, /accountId:\s*account\.id/);
  assert.match(checkout, /email:\s*account\.primaryEmail/);
  assert.match(checkout, /customerId:\s*existing\?\.providerCustomerId/);
  assert.ok(
    checkout.includes(
      "successUrl: `${origin}/app/billing?checkout=complete`",
    ),
  );
  assert.ok(
    checkout.includes(
      "cancelUrl: `${origin}/app/billing?checkout=canceled`",
    ),
  );
  assert.match(portal, /customerId:\s*subscription\.providerCustomerId/);
  assert.ok(portal.includes("returnUrl: `${origin}/app/billing`"));
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
  assert.match(repository, /processingAttempts:\s*sql`\$\{billingEvents\.processingAttempts\} \+ 1`/);
  assert.match(repository, /inArray\(billingEvents\.status, \["received", "failed"\]\)/);
  assert.match(repository, /eq\(billingEvents\.status, "processing"\)/);
  assert.match(repository, /lt\(billingEvents\.processedAt, staleBefore\)/);
  assert.match(repository, /\.returning\(\{ id: billingEvents\.id \}\)/);
  assert.match(webhook, /const claimed = await markBillingEventProcessing\(receipt\.id\)/);
  assert.match(webhook, /if \(!claimed\)[\s\S]*?acknowledge\("processing", true\)/);
  assert.doesNotMatch(repository, /(?:rawBody|rawPayload|payloadBody)\s*:/);

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

test("webhook status mapping is an explicit allowlist with a fail-closed default", async () => {
  const [webhook, schema] = await Promise.all([
    readFile(projectFile("app/api/billing/webhook/route.ts"), "utf8"),
    readFile(projectFile("db/schema.ts"), "utf8"),
  ]);
  const mapping = sourceBlock(
    webhook,
    "function mapSubscriptionStatus",
    "function requireAccountOwnership",
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
  assert.match(mapping, /throw new WebhookProcessingError/);
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
  assert.match(page, /only after a signed Stripe webhook is processed/);
  assert.match(page, /This return does not change billing state\./);
  assert.match(page, /getSubscriptionForAccount\(account\.id\)/);
  assert.match(page, /Latest state accepted from a signed Stripe webhook/);
  assert.match(page, /Price is not yet approved for a live charge\./);
  assert.match(page, /Planning amounts remain pricing hypotheses/);
  assert.match(page, /disabled=\{!canOpenPortal\}/);
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
