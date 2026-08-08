import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  grantSyntheticGolferRecordConsent,
  grantSyntheticRoadmapSharingConsent,
  identityHeaders,
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coachA = {
  email: "coach.a@example.test",
  name: "Coach Avery",
};
const coachB = {
  email: "coach.b@example.test",
  name: "Coach Bailey",
};

test(
  "production Worker completes the tenant-owned D1 plan sharing journey",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const unauthenticated = await worker.dispatch("/api/profile");
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).error.code, "authentication_required");
    assertPrivateApiResponse(unauthenticated);

    const missingSession = await worker.dispatch("/r/plan", {
      headers: { accept: "text/html" },
    });
    assert.equal(missingSession.status, 200);
    const missingSessionHtml = await missingSession.text();
    assert.match(missingSessionHtml, /Plan unavailable/);
    assertPrivateShareResponse(missingSession);

    const profileResponse = await jsonWrite(
      worker,
      "/api/profile",
      "PUT",
      coachA,
      {
        displayName: "Coach Avery",
        businessName: "Prairie Flight Golf",
        professionalTitle: "PGA of Canada Instructor",
        philosophy: "Clear decisions, measured progress, and sustainable practice.",
        contactEmail: coachA.email,
        contactPhone: "+1 403 555 0101",
        websiteUrl: "https://coach.example.ca",
        city: "Calgary",
        provinceOrTerritory: "Alberta",
        accentColor: "#176b55",
      },
    );
    assert.equal(profileResponse.status, 200);
    assertPrivateApiResponse(profileResponse);
    const profile = (await profileResponse.json()).profile;
    assert.equal(profile.displayName, "Coach Avery");
    assert.equal(profile.location, "Calgary, Alberta");
    await grantSyntheticGolferRecordConsent(worker, coachA);
    await grantSyntheticGolferRecordConsent(worker, coachB);

    const packageResponse = await jsonWrite(
      worker,
      "/api/packages",
      "POST",
      coachA,
      {
        title: "Momentum Coaching Series",
        description: "Four focused sessions for an adult golfer building repeatable contact.",
        priceCents: 48_000,
        currency: "CAD",
        terms: "Synthetic test package; no purchase or external communication occurs.",
        inclusions: ["Four private lessons", "Practice feedback"],
        externalActionUrl: "https://booking.example.ca/momentum",
        status: "active",
        isDefault: true,
      },
    );
    assert.equal(packageResponse.status, 201);
    assertPrivateApiResponse(packageResponse);
    const coachingPackage = (await packageResponse.json()).package;
    assert.ok(coachingPackage.id);
    assert.equal(coachingPackage.status, "active");

    const createdResponse = await jsonWrite(
      worker,
      "/api/golfers",
      "POST",
      coachA,
      {
        adultEligibilityConfirmed: true,
        displayName: "Jordan Synthetic",
        email: "jordan@example.test",
        planTitle: "Jordan Contact Roadmap",
        coachingPackageId: coachingPackage.id,
        goal: {
          statement: "Build predictable contact under normal playing pressure.",
          why: "Enjoy league rounds without compensating for a two-way miss.",
          context: "Synthetic assessment context for local verification only.",
        },
        assessment: {
          summary: "Contact location varies as tempo increases.",
          strengths: "Athletic setup and strong awareness of strike feedback.",
          primaryPattern: "Strike moves away from center as transition tempo increases.",
          limitations: "Low-point control becomes inconsistent late in the session.",
        },
        priority: {
          title: "Center-face strike control",
          rationale: "Stable contact supports every later speed and trajectory decision.",
        },
        phases: [
          {
            number: 1,
            title: "Calibrate contact",
            purpose: "Establish a repeatable low point and centered strike window.",
            rationale: "Contact is the narrowest observed foundation for later work.",
            progressSignals: ["Centered contact repeats in a coach-reviewed set."],
          },
          {
            number: 2,
            title: "Add trajectory",
            purpose: "Build predictable launch windows from the improved strike pattern.",
          },
          {
            number: 3,
            title: "Transfer to targets",
            purpose: "Connect mechanics to club and target decisions.",
          },
          {
            number: 4,
            title: "Pressure-proof the pattern",
            purpose: "Use representative constraints before independent maintenance.",
          },
        ],
      },
    );
    assert.equal(createdResponse.status, 201);
    assertPrivateApiResponse(createdResponse);
    const workspace = await createdResponse.json();
    await grantSyntheticRoadmapSharingConsent(worker, coachA, workspace.golfer.id);
    assert.equal(workspace.plan.revision, 1);
    assert.equal(workspace.phases.length, 4);

    const editPayload = {
      expectedRevision: 1,
      title: "Jordan Predictable Contact Roadmap",
      goal: {
        statement: "Build predictable contact through a full league round.",
        why: "Play confidently without guarding against a two-way miss.",
        context: "Local synthetic journey, revised after coach review.",
      },
        assessment: {
          summary: "Strike drifts toward the heel when transition tempo increases.",
          strengths: "Athletic setup and accurate strike awareness.",
          primaryPattern: "Heel contact appears as transition tempo increases.",
          limitations: "Low-point control varies after several full-speed swings.",
      },
      priority: {
        title: "Centered contact at playing tempo",
        rationale: "Contact stability is the foundation for trajectory and speed work.",
      },
      phases: [
        {
          number: 1,
          title: "Own centered contact",
          purpose: "Create a stable strike window at a controlled playing tempo.",
          rationale: "Centered contact remains the first observable barrier.",
          progressSignals: ["Centered contact repeats at a controlled playing tempo."],
        },
        {
          number: 2,
          title: "Shape trajectory",
          purpose: "Add predictable launch windows without losing contact quality.",
          rationale: null,
          progressSignals: [],
        },
        {
          number: 3,
          title: "Choose targets",
          purpose: "Transfer the pattern into representative club and target decisions.",
          rationale: null,
          progressSignals: [],
        },
        {
          number: 4,
          title: "Perform under pressure",
          purpose: "Validate the pattern with scored and time-constrained tasks.",
          rationale: null,
          progressSignals: [],
        },
      ],
    };
    const editResponse = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}`,
      "PUT",
      coachA,
      editPayload,
    );
    assert.equal(editResponse.status, 200);
    assert.equal((await editResponse.json()).plan.revision, 2);

    const staleEdit = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}`,
      "PUT",
      coachA,
      editPayload,
    );
    assert.equal(staleEdit.status, 409);
    assert.equal((await staleEdit.json()).error.code, "stale_plan_revision");

    const unauthenticatedEdit = await worker.dispatch(
      `/api/plans/${workspace.plan.id}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: testOrigin,
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ ...editPayload, expectedRevision: 2 }),
      },
    );
    assert.equal(unauthenticatedEdit.status, 401);

    const tenantBEdit = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}`,
      "PUT",
      coachB,
      { ...editPayload, expectedRevision: 2 },
    );
    assert.equal(tenantBEdit.status, 404);
    assert.equal((await tenantBEdit.json()).error.code, "plan_not_found");

    const tenantBGolfers = await worker.dispatch("/api/golfers", {
      headers: identityHeaders(coachB.email, coachB.name),
    });
    assert.equal(tenantBGolfers.status, 200);
    assert.deepEqual((await tenantBGolfers.json()).golfers, []);

    const publishResponse = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/publish`,
      "POST",
      coachA,
      {
        confirmation: "reviewed_exact_golfer_view",
        expectedRevision: 2,
        intendedRecipientContext: "Jordan Synthetic, adult golfer",
        expiresInDays: 7,
      },
    );
    assert.equal(publishResponse.status, 201);
    assertPrivateApiResponse(publishResponse);
    const share = (await publishResponse.json()).share;
    const shareUrl = new URL(share.url);
    assert.equal(shareUrl.origin, testOrigin);
    assert.equal(shareUrl.pathname, "/r");
    assert.equal(shareUrl.search, "");
    assert.match(shareUrl.hash, /^#token=[A-Za-z0-9_-]{40,64}$/);
    const token = new URLSearchParams(shareUrl.hash.slice(1)).get("token");
    assert.ok(token);

    const tenantBPublish = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/publish`,
      "POST",
      coachB,
      {
        confirmation: "reviewed_exact_golfer_view",
        expectedRevision: 2,
        intendedRecipientContext: "Cross-tenant attempt",
        expiresInDays: 7,
      },
    );
    assert.equal(tenantBPublish.status, 404);
    assert.equal((await tenantBPublish.json()).error.code, "plan_not_found");

    const exchangeResponse = await jsonWrite(
      worker,
      "/r/session",
      "POST",
      null,
      { token },
    );
    assert.equal(exchangeResponse.status, 200);
    assertPrivateApiResponse(exchangeResponse);
    assert.deepEqual(await exchangeResponse.json(), { redirectTo: "/r/plan" });
    const setCookie = exchangeResponse.headers.get("set-cookie");
    assert.match(setCookie, /^roadmap_share=[A-Za-z0-9_-]{40,64};/);
    assert.match(setCookie, /Path=\/r/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Secure/);
    const cookieMaxAge = Number(/Max-Age=(\d+)/i.exec(setCookie)?.[1]);
    assert.ok(cookieMaxAge > 43_100 && cookieMaxAge <= 43_200);
    const firstSessionCookie = browserCookieForPath(setCookie, "/r/plan");
    assert.match(firstSessionCookie, /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);
    assert.equal(browserCookieForPath(setCookie, "/api/share/response"), null);
    assert.equal(browserCookieForPath(setCookie, "/r/response"), firstSessionCookie);
    const firstSessionToken = firstSessionCookie.split("=", 2)[1];
    assert.notEqual(firstSessionToken, token);

    const privatePlanResponse = await worker.dispatch("/r/plan", {
      headers: { accept: "text/html", cookie: firstSessionCookie },
    });
    assert.equal(privatePlanResponse.status, 200);
    assertPrivateShareResponse(privatePlanResponse);
    const privatePlanHtml = await privatePlanResponse.text();
    assert.match(privatePlanHtml, /Jordan Synthetic/);
    assert.match(privatePlanHtml, /Jordan Predictable Contact Roadmap/);
    assert.match(privatePlanHtml, /Centered contact at playing tempo/);
    assert.match(privatePlanHtml, /Heel contact appears as transition tempo increases/);
    assert.match(privatePlanHtml, /Why this phase leads/);
    assert.match(privatePlanHtml, /Centered contact repeats at a controlled playing tempo/);
    assert.match(privatePlanHtml, /Momentum Coaching Series/);
    assert.match(privatePlanHtml, /Four private lessons/);
    assert.match(privatePlanHtml, /Practice feedback/);
    assert.match(privatePlanHtml, /Close roadmap/);
    assert.equal(privatePlanHtml.includes(token), false);
    assert.equal(privatePlanHtml.includes(firstSessionToken), false);
    assert.doesNotMatch(privatePlanHtml, /coach\.b@example\.test/i);

    const golferChoice = await worker.dispatch("/r/response", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
        cookie: browserCookieForPath(setCookie, "/r/response"),
      },
      body: JSON.stringify({ responseType: "wait" }),
    });
    assert.equal(golferChoice.status, 201);
    assertPrivateApiResponse(golferChoice);
    assert.equal((await golferChoice.json()).response.responseType, "wait");

    const [closeResponse, closeRetry] = await Promise.all(
      Array.from({ length: 2 }, () =>
        worker.dispatch("/r/session", {
          method: "DELETE",
          headers: {
            origin: testOrigin,
            "sec-fetch-site": "same-origin",
            cookie: browserCookieForPath(setCookie, "/r/session"),
          },
        }),
      ),
    );
    assert.deepEqual([closeResponse.status, closeRetry.status], [204, 204]);
    assertPrivateApiResponse(closeResponse);
    assert.match(closeResponse.headers.get("set-cookie") ?? "", /^roadmap_share=;/);
    assert.match(closeResponse.headers.get("set-cookie") ?? "", /Max-Age=0/i);

    const closedSession = await worker.dispatch("/r/plan", {
      headers: { accept: "text/html", cookie: firstSessionCookie },
    });
    assert.equal(closedSession.status, 200);
    const closedSessionHtml = await closedSession.text();
    assert.match(closedSessionHtml, /Plan unavailable/);
    assert.doesNotMatch(closedSessionHtml, /Jordan Synthetic/);

    const reopenedExchange = await jsonWrite(
      worker,
      "/r/session",
      "POST",
      null,
      { token },
    );
    assert.equal(reopenedExchange.status, 200);
    const reopenedSetCookie = reopenedExchange.headers.get("set-cookie");
    const replacedSessionCookie = browserCookieForPath(reopenedSetCookie, "/r/plan");
    assert.match(replacedSessionCookie, /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);
    const replacedSessionToken = replacedSessionCookie.split("=", 2)[1];
    assert.notEqual(replacedSessionToken, token);
    assert.notEqual(replacedSessionToken, firstSessionToken);

    const replacementExchange = await worker.dispatch("/r/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
        cookie: browserCookieForPath(reopenedSetCookie, "/r/session"),
      },
      body: JSON.stringify({ token }),
    });
    assert.equal(replacementExchange.status, 200);
    const replacementSetCookie = replacementExchange.headers.get("set-cookie");
    const activeSessionCookie = browserCookieForPath(replacementSetCookie, "/r/plan");
    assert.match(activeSessionCookie, /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);
    const activeSessionToken = activeSessionCookie.split("=", 2)[1];
    assert.notEqual(activeSessionToken, token);
    assert.notEqual(activeSessionToken, firstSessionToken);
    assert.notEqual(activeSessionToken, replacedSessionToken);

    const expiredSessionAt = Date.now() - 1_000;
    await worker.inspect([
      {
        sql: "update share_sessions set created_at = ?, expires_at = ? where token_hash = ?",
        params: [
          expiredSessionAt - 1,
          expiredSessionAt,
          shareSessionHash(activeSessionToken),
        ],
      },
    ]);
    const expiredSessionPlan = await worker.dispatch("/r/plan", {
      headers: { accept: "text/html", cookie: activeSessionCookie },
    });
    assert.match(await expiredSessionPlan.text(), /Plan unavailable/);
    const expiredSessionChoice = await worker.dispatch("/r/response", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
        cookie: activeSessionCookie,
      },
      body: JSON.stringify({ responseType: "decline" }),
    });
    assert.equal(expiredSessionChoice.status, 404);

    const expiryRecoveryExchange = await jsonWrite(
      worker,
      "/r/session",
      "POST",
      null,
      { token },
    );
    assert.equal(expiryRecoveryExchange.status, 200);
    const expiryRecoverySetCookie = expiryRecoveryExchange.headers.get("set-cookie");
    const linkExpirySessionCookie = browserCookieForPath(
      expiryRecoverySetCookie,
      "/r/plan",
    );
    assert.match(linkExpirySessionCookie, /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);

    await worker.inspect([
      {
        sql: "update share_links set expires_at = ? where id = ?",
        params: [Date.now() - 1, share.id],
      },
    ]);
    const linkExpiredPlan = await worker.dispatch("/r/plan", {
      headers: { accept: "text/html", cookie: linkExpirySessionCookie },
    });
    assert.match(await linkExpiredPlan.text(), /Plan unavailable/);
    const linkExpiredExchange = await jsonWrite(
      worker,
      "/r/session",
      "POST",
      null,
      { token },
    );
    assert.equal(linkExpiredExchange.status, 404);

    const tenantBRevoke = await jsonWrite(
      worker,
      `/api/shares/${share.id}`,
      "DELETE",
      coachB,
      { reason: "Cross-tenant attempt" },
    );
    assert.equal(tenantBRevoke.status, 404);
    assert.equal((await tenantBRevoke.json()).error.code, "share_not_found");

    const revokeResponse = await jsonWrite(
      worker,
      `/api/shares/${share.id}`,
      "DELETE",
      coachA,
      { reason: "Synthetic journey completed" },
    );
    assert.equal(revokeResponse.status, 204);
    assertPrivateApiResponse(revokeResponse);

    const revokedExchange = await jsonWrite(
      worker,
      "/r/session",
      "POST",
      null,
      { token },
    );
    assert.equal(revokedExchange.status, 404);
    assert.equal((await revokedExchange.json()).error.code, "plan_unavailable");

    const revokedSession = await worker.dispatch("/r/plan", {
      headers: { accept: "text/html", cookie: linkExpirySessionCookie },
    });
    assert.equal(revokedSession.status, 200);
    assertPrivateShareResponse(revokedSession);
    const revokedHtml = await revokedSession.text();
    assert.match(revokedHtml, /Plan unavailable/);
    assert.doesNotMatch(revokedHtml, /Jordan Synthetic/);

    const revokedChoice = await worker.dispatch("/r/response", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
        cookie: linkExpirySessionCookie,
      },
      body: JSON.stringify({ responseType: "decline" }),
    });
    assert.equal(revokedChoice.status, 404);
    assert.equal((await revokedChoice.json()).error.code, "plan_unavailable");

    const endRevokedSession = await worker.dispatch("/r/session", {
      method: "DELETE",
      headers: {
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
        cookie: linkExpirySessionCookie,
      },
    });
    assert.equal(endRevokedSession.status, 204);

    const inspection = await worker.inspect([
      {
        sql: "select normalized_email, auth_provider from accounts order by normalized_email",
      },
      {
        sql: "select count(*) as count from golfers where id = ? and account_id = (select id from accounts where normalized_email = ?)",
        params: [workspace.golfer.id, coachA.email],
      },
      {
        sql: "select revision, published_revision, status from development_plans where id = ?",
        params: [workspace.plan.id],
      },
      {
        sql: "select token_hash, token_hash_algorithm, status, plan_revision, access_count, revoked_at, revoke_reason from share_links where id = ?",
        params: [share.id],
      },
      {
        sql: "select token_hash, token_hash_algorithm, expires_at, access_count, revoked_at, revoke_reason from share_sessions where share_link_id = ? order by created_at",
        params: [share.id],
      },
      {
        sql: "select count(*) as count from audit_events where target_id in (?, ?) and outcome = 'success'",
        params: [workspace.golfer.id, workspace.plan.id],
      },
      {
        sql: "select response_type, external_outcome_observed from golfer_plan_responses where plan_id = ? order by occurred_at",
        params: [workspace.plan.id],
      },
      {
        sql: "select count(*) as count from audit_events where action = 'share.session_ended' and target_id in (select id from share_sessions where share_link_id = ?)",
        params: [share.id],
      },
    ]);
    assert.deepEqual(
      inspection[0].results,
      [
        { normalized_email: coachA.email, auth_provider: "siwc" },
        { normalized_email: coachB.email, auth_provider: "siwc" },
      ],
    );
    assert.equal(inspection[1].results[0].count, 1);
    assert.deepEqual(inspection[2].results[0], {
      revision: 2,
      published_revision: 2,
      status: "published",
    });
    const storedShare = inspection[3].results[0];
    assert.match(storedShare.token_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(storedShare.token_hash, token);
    assert.equal(storedShare.token_hash_algorithm, "hmac-sha256-v1");
    assert.equal(storedShare.status, "revoked");
    assert.equal(storedShare.plan_revision, 2);
    assert.equal(storedShare.access_count, 4);
    assert.ok(storedShare.revoked_at);
    assert.equal(storedShare.revoke_reason, "Synthetic journey completed");
    assert.equal(inspection[4].results.length, 4);
    for (const storedSession of inspection[4].results) {
      assert.match(storedSession.token_hash, /^[0-9a-f]{64}$/);
      assert.notEqual(storedSession.token_hash, token);
      assert.notEqual(storedSession.token_hash, firstSessionToken);
      assert.notEqual(storedSession.token_hash, replacedSessionToken);
      assert.notEqual(storedSession.token_hash, activeSessionToken);
      assert.equal(storedSession.token_hash_algorithm, "hmac-sha256-session-v1");
      assert.ok(storedSession.expires_at > 0);
      assert.ok(storedSession.revoked_at);
    }
    assert.deepEqual(
      inspection[4].results.map((row) => row.revoke_reason).sort(),
      [
        "closed by golfer",
        "replaced by a new share exchange",
        "share link revoked",
        "share link revoked",
      ],
    );
    assert.deepEqual(
      inspection[4].results.map((row) => row.access_count).sort(),
      [0, 0, 0, 0],
    );
    assert.ok(inspection[5].results[0].count >= 3);
    assert.deepEqual(inspection[6].results, [
      { response_type: "wait", external_outcome_observed: 0 },
    ]);
    assert.equal(inspection[7].results[0].count, 2);
  },
);

async function jsonWrite(worker, path, method, identity, body) {
  const headers = identity
    ? writeHeaders(identity.email, identity.name)
    : {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
      };
  return worker.dispatch(path, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function shareSessionHash(rawSessionToken) {
  return createHmac(
    "sha256",
    "synthetic-local-critical-journey-pepper-2026-08-07",
  )
    .update(`share-session-v1:${rawSessionToken}`)
    .digest("hex");
}

function assertPrivateApiResponse(response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  assert.match(cacheControl, /private/i);
  assert.match(cacheControl, /no-store/i);
  assert.match(cacheControl, /max-age=0/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}

function assertPrivateShareResponse(response) {
  assertPrivateApiResponse(response);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("x-robots-tag"),
    "noindex, nofollow, noarchive",
  );
}

function browserCookieForPath(setCookie, requestPath) {
  if (!setCookie) return null;
  const parts = setCookie.split(";").map((part) => part.trim());
  const cookiePath =
    parts.find((part) => part.toLowerCase().startsWith("path="))?.slice(5) ?? "/";
  const pathMatches =
    requestPath === cookiePath ||
    (requestPath.startsWith(cookiePath) &&
      (cookiePath.endsWith("/") || requestPath.charAt(cookiePath.length) === "/"));
  return pathMatches ? parts[0] : null;
}
