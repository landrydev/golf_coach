import assert from "node:assert/strict";
import { test } from "node:test";
import {
  grantSyntheticGolferRecordConsent,
  grantSyntheticRoadmapSharingConsent,
  identityHeaders,
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

const owner = {
  email: "lapsed.share.owner@example.test",
  name: "Coach Lapsed Share",
};
const otherTenant = {
  email: "other.share.tenant@example.test",
  name: "Coach Other Tenant",
};
const subscriptionBindings = {
  INSTRUCTOR_ACCESS_MODE: "subscription_required",
  SUBSCRIPTION_ACCESS_STATUSES: "active",
  STRIPE_CHECKOUT_PRICE_ID: "price_share_controls",
  STRIPE_RECOGNIZED_PRICE_IDS: "price_share_controls",
  SUBSCRIPTION_ENTITLEMENT_PRICE_IDS: "price_share_controls",
  SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS: "3600",
  OWNER_PRIVATE_ACCESS_PEPPER: "",
  OWNER_PRIVATE_EMAIL_DIGESTS: "",
};

test(
  "a lapsed owner can inventory and explicitly revoke only their tenant's live private capabilities",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker(subscriptionBindings);
    context.after(() => worker.dispose());

    await createProfile(worker, owner);
    await grantSyntheticGolferRecordConsent(worker, owner);
    await insertEligibleSubscription(worker, owner.email);
    const workspace = await createWorkspace(worker);
    await grantSyntheticRoadmapSharingConsent(
      worker,
      owner,
      workspace.golfer.id,
    );
    const publishResponse = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/publish`,
      owner,
      {
        confirmation: "reviewed_exact_golfer_view",
        expectedRevision: 1,
        intendedRecipientContext: "Synthetic lapsed-owner recipient",
        expiresInDays: 7,
      },
    );
    assert.equal(publishResponse.status, 201);
    const published = (await publishResponse.json()).share;
    const token = tokenFromShareUrl(published.url);

    const exchange = await worker.dispatch("/r/session", {
      method: "POST",
      headers: publicWriteHeaders(),
      body: JSON.stringify({ token }),
    });
    assert.equal(exchange.status, 200);
    const { sessionContext } = await exchange.json();
    const sessionCookie = exchange.headers.get("set-cookie")?.split(";", 1)[0];
    assert.match(sessionCookie, /^roadmap_share=/);

    await worker.inspect([
      {
        sql: "update subscriptions set status = 'canceled', updated_at = ? where provider_subscription_id = 'sub_share_controls'",
        params: [Date.now()],
      },
    ]);

    // Entitlement loss alone does not silently revoke a capability.
    const stillLive = await worker.dispatch("/r/session", {
      method: "POST",
      headers: publicWriteHeaders(),
      body: JSON.stringify({ token }),
    });
    assert.equal(stillLive.status, 200);

    const liveSessionInspection = await worker.inspect([
      {
        sql: "select count(*) as count from share_sessions where share_link_id = ? and revoked_at is null and expires_at > ?",
        params: [published.id, Date.now()],
      },
    ]);
    assert.equal(liveSessionInspection[0].results[0].count, 2);

    const ownerHeaders = identityHeaders(owner.email, owner.name);
    const inventoryResponse = await worker.dispatch("/api/account/shares", {
      headers: ownerHeaders,
    });
    assert.equal(inventoryResponse.status, 200);
    assert.match(inventoryResponse.headers.get("cache-control") ?? "", /no-store/);
    const inventory = await inventoryResponse.json();
    assert.equal(inventory.shares.length, 1);
    assert.deepEqual(Object.keys(inventory.shares[0]).sort(), [
      "accessCount",
      "activeSessionCount",
      "createdAt",
      "expiresAt",
      "id",
      "lastAccessedAt",
      "planRevision",
      "status",
    ]);
    assert.equal(inventory.shares[0].id, published.id);
    assert.equal(inventory.shares[0].status, "active");
    assert.equal(inventory.shares[0].activeSessionCount, 2);
    const minimized = JSON.stringify(inventory);
    assert.doesNotMatch(minimized, /Synthetic Lapsed Golfer|lapsed\.golfer|recipient/i);
    assert.equal(minimized.includes(token), false);
    assert.equal(minimized.includes(workspace.plan.id), false);

    const accountPage = await worker.dispatch("/app/settings/shares", {
      headers: { ...ownerHeaders, accept: "text/html" },
    });
    assert.equal(accountPage.status, 200);
    const accountPageBody = await accountPage.text();
    assert.match(accountPageBody, /Active private access/);
    assert.doesNotMatch(accountPageBody, /Synthetic Lapsed Golfer|lapsed\.golfer/i);

    for (const path of ["/api/golfers", `/api/shares/${published.id}`]) {
      const response = await worker.dispatch(path, {
        method: path.startsWith("/api/shares/") ? "DELETE" : "GET",
        headers: path.startsWith("/api/shares/")
          ? writeHeaders(owner.email, owner.name)
          : ownerHeaders,
        ...(path.startsWith("/api/shares/")
          ? { body: JSON.stringify({ reason: "Core path remains gated" }) }
          : {}),
      });
      assert.equal(response.status, 402, `${path} escaped the core boundary`);
      assert.equal((await response.json()).error.code, "subscription_required");
    }

    const otherInventory = await worker.dispatch("/api/account/shares", {
      headers: identityHeaders(otherTenant.email, otherTenant.name),
    });
    assert.equal(otherInventory.status, 200);
    assert.deepEqual(await otherInventory.json(), { shares: [] });
    const crossTenantRevoke = await jsonWrite(
      worker,
      `/api/account/shares/${published.id}`,
      otherTenant,
      { confirmation: "revoke_private_share_access" },
      "DELETE",
    );
    assert.equal(crossTenantRevoke.status, 404);
    assert.equal((await crossTenantRevoke.json()).error.code, "share_not_found");

    const explicitRevoke = await jsonWrite(
      worker,
      `/api/account/shares/${published.id}`,
      owner,
      { confirmation: "revoke_private_share_access" },
      "DELETE",
    );
    assert.equal(explicitRevoke.status, 204);

    const after = await worker.inspect([
      {
        sql: "select status, revoke_reason from share_links where id = ?",
        params: [published.id],
      },
      {
        sql: "select count(*) as count from share_sessions where share_link_id = ? and revoked_at is null",
        params: [published.id],
      },
      {
        sql: "select count(*) as count from audit_events where action = 'share.revoke' and target_id = ?",
        params: [published.id],
      },
    ]);
    assert.deepEqual(after[0].results[0], {
      status: "revoked",
      revoke_reason: "Revoked from account access controls",
    });
    assert.equal(after[1].results[0].count, 0);
    assert.equal(after[2].results[0].count, 1);

    const oldToken = await worker.dispatch("/r/session", {
      method: "POST",
      headers: publicWriteHeaders(),
      body: JSON.stringify({ token }),
    });
    assert.equal(oldToken.status, 404);
    const oldSession = await worker.dispatch(
      `/r/plan?context=${sessionContext}`,
      { headers: { accept: "text/html", cookie: sessionCookie } },
    );
    assert.equal(oldSession.status, 200);
    assert.match(await oldSession.text(), /Plan unavailable/);
  },
);

async function createProfile(worker, identity) {
  const response = await jsonWrite(worker, "/api/profile", identity, {
    displayName: identity.name,
    businessName: "Share Controls Golf",
    professionalTitle: "Golf instructor",
    philosophy: "Synthetic access-containment verification only.",
    contactEmail: identity.email,
    contactPhone: null,
    websiteUrl: "https://share-controls.example.ca",
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#176b55",
  }, "PUT");
  assert.equal(response.status, 200);
}

async function insertEligibleSubscription(worker, email) {
  await worker.inspect([
    {
      sql: `insert into billing_customers
        (provider, provider_customer_id, account_id)
        select 'stripe', 'cus_share_controls', id
          from accounts where normalized_email = ?`,
      params: [email],
    },
    {
      sql: `insert into subscriptions
        (id, account_id, provider, provider_customer_id,
         provider_subscription_id, provider_price_id, product_code, status,
         last_provider_sync_at)
        select 'subscription_share_controls', id, 'stripe', 'cus_share_controls',
               'sub_share_controls', 'price_share_controls', 'roadmap_solo',
               'active', ?
          from accounts where normalized_email = ?`,
      params: [Date.now(), email],
    },
  ]);
}

async function createWorkspace(worker) {
  const response = await jsonWrite(worker, "/api/golfers", owner, {
    adultEligibilityConfirmed: true,
    displayName: "Synthetic Lapsed Golfer",
    email: "lapsed.golfer@example.test",
    planTitle: "Lapsed Access Roadmap",
    goal: {
      statement: "Build a repeatable start line.",
      why: "Choose targets with confidence.",
      context: "Synthetic account-control verification.",
    },
    assessment: {
      summary: "Direction varies under representative pressure.",
      strengths: "Clear strike awareness.",
      primaryPattern: "Transition speed changes start direction.",
      limitations: "Evidence is limited to a synthetic assessment.",
    },
    priority: {
      title: "Stable start direction",
      rationale: "It is the narrowest observed constraint.",
    },
    phases: [1, 2, 3].map((number) => ({
      number,
      title: `Containment phase ${number}`,
      purpose: `Containment purpose ${number}.`,
      rationale: number === 1 ? "Establish the observed baseline first." : null,
      progressSignals:
        number === 1 ? ["Direction repeats in a coach-reviewed set."] : [],
    })),
  });
  assert.equal(response.status, 201);
  return response.json();
}

function jsonWrite(worker, path, identity, body, method = "POST") {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(identity.email, identity.name),
    body: JSON.stringify(body),
  });
}

function publicWriteHeaders() {
  return {
    "content-type": "application/json",
    origin: testOrigin,
    "sec-fetch-site": "same-origin",
  };
}

function tokenFromShareUrl(value) {
  const url = new URL(value);
  const token = new URLSearchParams(url.hash.slice(1)).get("token");
  assert.match(token, /^[A-Za-z0-9_-]{40,64}$/);
  return token;
}
