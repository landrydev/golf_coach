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
    const responseBarrier = syntheticConcurrentBarrier(
      "golfer-response-after-replay-preflight",
      4,
    );
    const worker = await startD1Worker(
      {},
      { concurrencyBarrier: responseBarrier.handler },
    );
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
    const exchangeBody = await exchangeResponse.json();
    assert.deepEqual(Object.keys(exchangeBody), ["sessionContext"]);
    assert.match(exchangeBody.sessionContext, /^[0-9a-f]{64}$/);
    const firstSessionContext = exchangeBody.sessionContext;
    const firstPlanPath = planPathForContext(firstSessionContext);
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
    assert.equal(
      await sessionContextForCookie(worker, firstSessionCookie),
      firstSessionContext,
    );

    const privatePlanResponse = await worker.dispatch(firstPlanPath, {
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

    const coachBProfileResponse = await jsonWrite(
      worker,
      "/api/profile",
      "PUT",
      coachB,
      {
        displayName: "Coach Bailey",
        businessName: "Boundary Golf Studio",
        professionalTitle: "Golf Instructor",
        philosophy: "Specific observations and practical next steps.",
        contactEmail: coachB.email,
        contactPhone: "+1 780 555 0102",
        websiteUrl: "https://coach-b.example.ca",
        city: "Edmonton",
        provinceOrTerritory: "Alberta",
        accentColor: "#315f74",
      },
    );
    assert.equal(coachBProfileResponse.status, 200);

    const secondGolferResponse = await jsonWrite(
      worker,
      "/api/golfers",
      "POST",
      coachB,
      {
        adultEligibilityConfirmed: true,
        displayName: "Morgan Isolated",
        email: "morgan@example.test",
        planTitle: "Morgan Flight Window Roadmap",
        goal: {
          statement: "Build a predictable start window with the scoring clubs.",
          why: "Choose targets with clearer evidence.",
          context: "Synthetic second-share isolation fixture.",
        },
        assessment: {
          summary: "Start direction varies under representative targets.",
          strengths: "Consistent setup and useful strike feedback.",
          primaryPattern: "Face direction varies as target pressure increases.",
          limitations: "The observation set is limited to one synthetic session.",
        },
        priority: {
          title: "Start-window calibration",
          rationale: "Direction is the narrowest observed constraint.",
        },
        phases: [
          {
            number: 1,
            title: "Calibrate direction",
            purpose: "Establish a repeatable start window.",
            rationale: "Begin with the directly observed directional variance.",
            progressSignals: ["Start direction repeats in a coach-reviewed set."],
          },
          {
            number: 2,
            title: "Vary trajectories",
            purpose: "Retain the start window across planned trajectories.",
            rationale: "Add trajectory only after direction stabilizes.",
            progressSignals: ["Planned trajectories retain the intended window."],
          },
          {
            number: 3,
            title: "Transfer to targets",
            purpose: "Use the window in representative target decisions.",
            rationale: "Transfer follows controlled calibration.",
            progressSignals: ["Target choices match the intended start window."],
          },
        ],
      },
    );
    assert.equal(secondGolferResponse.status, 201);
    const secondWorkspace = await secondGolferResponse.json();
    await grantSyntheticRoadmapSharingConsent(
      worker,
      coachB,
      secondWorkspace.golfer.id,
    );
    const secondPublishResponse = await jsonWrite(
      worker,
      `/api/plans/${secondWorkspace.plan.id}/publish`,
      "POST",
      coachB,
      {
        confirmation: "reviewed_exact_golfer_view",
        expectedRevision: 1,
        intendedRecipientContext: "Morgan Isolated, adult golfer",
        expiresInDays: 7,
      },
    );
    assert.equal(secondPublishResponse.status, 201);
    const secondShare = (await secondPublishResponse.json()).share;
    const secondToken = new URLSearchParams(
      new URL(secondShare.url).hash.slice(1),
    ).get("token");
    assert.ok(secondToken);
    const secondExchangeResponse = await jsonWrite(
      worker,
      "/r/session",
      "POST",
      null,
      { token: secondToken },
    );
    assert.equal(secondExchangeResponse.status, 200);
    const secondExchangeBody = await secondExchangeResponse.json();
    assert.match(secondExchangeBody.sessionContext, /^[0-9a-f]{64}$/);
    assert.notEqual(secondExchangeBody.sessionContext, firstSessionContext);
    const secondPlanPath = planPathForContext(
      secondExchangeBody.sessionContext,
    );
    const secondSessionCookie = browserCookieForPath(
      secondExchangeResponse.headers.get("set-cookie"),
      "/r/plan",
    );
    assert.match(secondSessionCookie, /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);

    const exactSecondPlan = await worker.dispatch(secondPlanPath, {
      headers: { accept: "text/html", cookie: secondSessionCookie },
    });
    const exactSecondHtml = await exactSecondPlan.text();
    assert.match(exactSecondHtml, /Morgan Isolated/);
    assert.match(exactSecondHtml, /Morgan Flight Window Roadmap/);
    assert.doesNotMatch(exactSecondHtml, /Jordan Synthetic/);

    for (const [crossedPath, crossedCookie, cookieSessionContext] of [
      [secondPlanPath, firstSessionCookie, firstSessionContext],
      [
        firstPlanPath,
        secondSessionCookie,
        secondExchangeBody.sessionContext,
      ],
    ]) {
      const crossedPlan = await worker.dispatch(crossedPath, {
        headers: { accept: "text/html", cookie: crossedCookie },
      });
      assert.equal(crossedPlan.status, 200);
      const crossedHtml = await crossedPlan.text();
      assertNeutralPlanHtml(crossedHtml);
      assert.equal(crossedHtml.includes(cookieSessionContext), false);
    }

    for (const invalidPlanPath of [
      "/r/plan",
      `/r/plan?context=${firstSessionContext.toUpperCase()}`,
      `/r/plan?context=${firstSessionContext}&context=${secondExchangeBody.sessionContext}`,
      `/r/plan?context=${firstSessionContext}&extra=1`,
    ]) {
      const invalidContextPlan = await worker.dispatch(invalidPlanPath, {
        headers: { accept: "text/html", cookie: firstSessionCookie },
      });
      assert.equal(invalidContextPlan.status, 200);
      assertNeutralPlanHtml(await invalidContextPlan.text());
    }

    const missingResponseKey = await worker.dispatch("/r/response", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
        cookie: firstSessionCookie,
      },
      body: JSON.stringify({
        responseType: "wait",
        sessionContext: firstSessionContext,
      }),
    });
    assert.equal(missingResponseKey.status, 400);
    assert.equal(
      (await missingResponseKey.json()).error.code,
      "idempotency_key_required",
    );

    for (const invalidKey of [
      "too-short",
      `${"A".repeat(19)}!`,
      `A${"b".repeat(128)}`,
    ]) {
      const invalidResponseKey = await golferResponse(
        worker,
        firstSessionCookie,
        invalidKey,
        "wait",
        firstSessionContext,
      );
      assert.equal(invalidResponseKey.status, 400);
      assert.equal(
        (await invalidResponseKey.json()).error.code,
        "idempotency_key_required",
      );
    }

    const responseOperationKey = "R".repeat(128);
    const golferChoice = await golferResponse(
      worker,
      firstSessionCookie,
      responseOperationKey,
      "wait",
      firstSessionContext,
    );
    assert.equal(golferChoice.status, 201);
    assertPrivateApiResponse(golferChoice);
    const golferChoiceBody = await golferChoice.json();
    assert.equal(golferChoiceBody.response.responseType, "wait");
    assert.equal(golferChoiceBody.idempotentReplay, false);

    const golferChoiceReplay = await golferResponse(
      worker,
      firstSessionCookie,
      responseOperationKey,
      "wait",
      firstSessionContext,
    );
    assert.equal(golferChoiceReplay.status, 200);
    const golferChoiceReplayBody = await golferChoiceReplay.json();
    assert.equal(golferChoiceReplayBody.idempotentReplay, true);
    assert.deepEqual(golferChoiceReplayBody.response, golferChoiceBody.response);

    const reusedResponseKey = await golferResponse(
      worker,
      firstSessionCookie,
      responseOperationKey,
      "decline",
      firstSessionContext,
    );
    assert.equal(reusedResponseKey.status, 409);
    assert.equal(
      (await reusedResponseKey.json()).error.code,
      "idempotency_key_reused",
    );

    const concurrentResponseKey = "C".repeat(20);
    responseBarrier.arm();
    const pendingConcurrentChoices = ["decline", "wait", "decline", "wait"].map(
      (responseType) =>
      golferResponse(
        worker,
        firstSessionCookie,
        concurrentResponseKey,
        responseType,
        firstSessionContext,
      ),
    );
    await responseBarrier.reached;
    responseBarrier.release();
    const concurrentChoices = await Promise.all(pendingConcurrentChoices);
    assert.deepEqual(
      concurrentChoices.map(({ status }) => status).sort(),
      [200, 201, 409, 409],
    );
    const concurrentChoiceBodies = await Promise.all(
      concurrentChoices.map((response) => response.json()),
    );
    const committedConcurrentChoices = concurrentChoiceBodies.filter(
      (body) => body.response,
    );
    assert.equal(
      new Set(committedConcurrentChoices.map(({ response }) => response.id)).size,
      1,
    );
    assert.deepEqual(
      committedConcurrentChoices
        .map(({ idempotentReplay }) => idempotentReplay)
        .sort(),
      [false, true],
    );
    assert.equal(
      new Set(
        committedConcurrentChoices.map(({ response }) => response.responseType),
      ).size,
      1,
    );
    assert.deepEqual(
      concurrentChoiceBodies
        .filter((body) => body.error)
        .map(({ error }) => error.code),
      ["idempotency_key_reused", "idempotency_key_reused"],
    );

    const [delayedCloseResponse, closeRetry] = await Promise.all(
      Array.from({ length: 2 }, () =>
        worker.dispatch("/r/session", {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            origin: testOrigin,
            "sec-fetch-site": "same-origin",
            cookie: browserCookieForPath(setCookie, "/r/session"),
          },
          body: JSON.stringify({ sessionContext: firstSessionContext }),
        }),
      ),
    );
    assert.deepEqual([delayedCloseResponse.status, closeRetry.status], [204, 204]);
    assertPrivateApiResponse(delayedCloseResponse);

    const closedSession = await worker.dispatch(firstPlanPath, {
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
    const reopenedBody = await reopenedExchange.json();
    assert.match(reopenedBody.sessionContext, /^[0-9a-f]{64}$/);
    const replacedSessionContext = reopenedBody.sessionContext;
    const replacedPlanPath = planPathForContext(replacedSessionContext);
    const reopenedSetCookie = reopenedExchange.headers.get("set-cookie");
    const replacedSessionCookie = browserCookieForPath(reopenedSetCookie, "/r/plan");
    assert.match(replacedSessionCookie, /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);

    // Model the browser applying the exchange-B response before the delayed
    // close-A response. The close response cannot clear the newer B cookie.
    assert.equal(delayedCloseResponse.headers.get("set-cookie"), null);
    assert.equal(closeRetry.headers.get("set-cookie"), null);
    const responseOrderSafePlan = await worker.dispatch(replacedPlanPath, {
      headers: { accept: "text/html", cookie: replacedSessionCookie },
    });
    assert.equal(responseOrderSafePlan.status, 200);
    assert.match(await responseOrderSafePlan.text(), /Jordan Synthetic/);

    const replacedSessionToken = replacedSessionCookie.split("=", 2)[1];
    assert.notEqual(replacedSessionToken, token);
    assert.notEqual(replacedSessionToken, firstSessionToken);
    assert.equal(
      await sessionContextForCookie(worker, replacedSessionCookie),
      replacedSessionContext,
    );

    const beforeContextMismatch = await worker.inspect([
      { sql: "select count(*) as count from golfer_plan_responses" },
      {
        sql: "select count(*) as count from audit_events where action = 'golfer.response_recorded'",
      },
    ]);
    const staleTabChoice = await golferResponse(
      worker,
      replacedSessionCookie,
      "stale-tab-response-operation-0001",
      "decline",
      firstSessionContext,
    );
    assert.equal(staleTabChoice.status, 409);
    assert.equal(
      (await staleTabChoice.json()).error.code,
      "share_session_changed",
    );
    const staleTabClose = await worker.dispatch("/r/session", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
        cookie: replacedSessionCookie,
      },
      body: JSON.stringify({ sessionContext: firstSessionContext }),
    });
    assert.equal(staleTabClose.status, 409);
    assert.equal(staleTabClose.headers.get("set-cookie"), null);
    assert.equal((await staleTabClose.json()).error.code, "share_session_changed");
    const afterContextMismatch = await worker.inspect([
      { sql: "select count(*) as count from golfer_plan_responses" },
      {
        sql: "select count(*) as count from audit_events where action = 'golfer.response_recorded'",
      },
    ]);
    assert.deepEqual(
      afterContextMismatch.map((result) => result.results[0].count),
      beforeContextMismatch.map((result) => result.results[0].count),
    );

    const invalidReplacement = await worker.dispatch("/r/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
        cookie: replacedSessionCookie,
      },
      body: JSON.stringify({ token: "x".repeat(43) }),
    });
    assert.equal(invalidReplacement.status, 404);
    assert.equal(invalidReplacement.headers.get("set-cookie"), null);
    const preservedPlan = await worker.dispatch(replacedPlanPath, {
      headers: { accept: "text/html", cookie: replacedSessionCookie },
    });
    assert.match(await preservedPlan.text(), /Jordan Synthetic/);
    const [preservedSession] = await worker.inspect([
      {
        sql: "select revoked_at from share_sessions where token_hash = ?",
        params: [shareSessionHash(replacedSessionToken)],
      },
    ]);
    assert.equal(preservedSession.results[0].revoked_at, null);

    let throttledReplacement = null;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const marker = String(attempt).padStart(2, "0");
      const response = await worker.dispatch("/r/session", {
        method: "POST",
        headers: {
          "cf-connecting-ip": "198.51.100.77",
          "content-type": "application/json",
          origin: testOrigin,
          "sec-fetch-site": "same-origin",
          cookie: replacedSessionCookie,
        },
        body: JSON.stringify({ token: `z${marker}${"x".repeat(40)}` }),
      });
      assert.equal(response.headers.get("set-cookie"), null);
      if (response.status === 429) {
        throttledReplacement = response;
        break;
      }
      assert.equal(response.status, 404);
    }
    assert.ok(throttledReplacement, "expected a retryable throttled exchange");
    const planAfterThrottle = await worker.dispatch(replacedPlanPath, {
      headers: { accept: "text/html", cookie: replacedSessionCookie },
    });
    assert.match(await planAfterThrottle.text(), /Jordan Synthetic/);
    const [sessionAfterThrottle] = await worker.inspect([
      {
        sql: "select revoked_at from share_sessions where token_hash = ?",
        params: [shareSessionHash(replacedSessionToken)],
      },
    ]);
    assert.equal(sessionAfterThrottle.results[0].revoked_at, null);

    const crossSessionChoice = await golferResponse(
      worker,
      replacedSessionCookie,
      responseOperationKey,
      "wait",
      replacedSessionContext,
    );
    assert.equal(crossSessionChoice.status, 201);
    const crossSessionChoiceBody = await crossSessionChoice.json();
    assert.equal(crossSessionChoiceBody.idempotentReplay, false);
    assert.notEqual(
      crossSessionChoiceBody.response.id,
      golferChoiceBody.response.id,
    );

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
    const replacementBody = await replacementExchange.json();
    assert.match(replacementBody.sessionContext, /^[0-9a-f]{64}$/);
    const activeSessionContext = replacementBody.sessionContext;
    const activePlanPath = planPathForContext(activeSessionContext);
    const replacementSetCookie = replacementExchange.headers.get("set-cookie");
    const activeSessionCookie = browserCookieForPath(replacementSetCookie, "/r/plan");
    assert.match(activeSessionCookie, /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);
    const activeSessionToken = activeSessionCookie.split("=", 2)[1];
    assert.notEqual(activeSessionToken, token);
    assert.notEqual(activeSessionToken, firstSessionToken);
    assert.notEqual(activeSessionToken, replacedSessionToken);
    assert.equal(
      await sessionContextForCookie(worker, activeSessionCookie),
      activeSessionContext,
    );

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
    const expiredSessionPlan = await worker.dispatch(activePlanPath, {
      headers: { accept: "text/html", cookie: activeSessionCookie },
    });
    assert.match(await expiredSessionPlan.text(), /Plan unavailable/);
    const expiredSessionChoice = await worker.dispatch("/r/response", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "expired-session-response-operation-0001",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
        cookie: activeSessionCookie,
      },
      body: JSON.stringify({
        responseType: "decline",
        sessionContext: activeSessionContext,
      }),
    });
    assert.equal(expiredSessionChoice.status, 404);

    const expiryRecoveryExchange = await worker.dispatch("/r/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
        cookie: activeSessionCookie,
      },
      body: JSON.stringify({ token }),
    });
    assert.equal(expiryRecoveryExchange.status, 200);
    const expiryRecoveryBody = await expiryRecoveryExchange.json();
    assert.match(expiryRecoveryBody.sessionContext, /^[0-9a-f]{64}$/);
    const linkExpirySessionContext = expiryRecoveryBody.sessionContext;
    const linkExpiryPlanPath = planPathForContext(linkExpirySessionContext);
    const expiryRecoverySetCookie = expiryRecoveryExchange.headers.get("set-cookie");
    const linkExpirySessionCookie = browserCookieForPath(
      expiryRecoverySetCookie,
      "/r/plan",
    );
    assert.match(linkExpirySessionCookie, /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);
    assert.equal(
      await sessionContextForCookie(worker, linkExpirySessionCookie),
      linkExpirySessionContext,
    );

    await worker.inspect([
      {
        sql: "update share_links set expires_at = ? where id = ?",
        params: [Date.now() - 1, share.id],
      },
    ]);
    const linkExpiredPlan = await worker.dispatch(linkExpiryPlanPath, {
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

    const revokedSession = await worker.dispatch(linkExpiryPlanPath, {
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
        "idempotency-key": "revoked-session-response-operation-0001",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
        cookie: linkExpirySessionCookie,
      },
      body: JSON.stringify({
        responseType: "decline",
        sessionContext: linkExpirySessionContext,
      }),
    });
    assert.equal(revokedChoice.status, 404);
    assert.equal((await revokedChoice.json()).error.code, "plan_unavailable");

    const endRevokedSession = await worker.dispatch("/r/session", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
        cookie: linkExpirySessionCookie,
      },
      body: JSON.stringify({ sessionContext: linkExpirySessionContext }),
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
        sql: "select id, response_type, external_outcome_observed from golfer_plan_responses where plan_id = ? order by occurred_at, id",
        params: [workspace.plan.id],
      },
      {
        sql: "select id, target_id, request_id, metadata from audit_events where action = 'golfer.response_recorded' and target_id = ? order by occurred_at, id",
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
    assert.equal(inspection[6].results.length, 3);
    assert.deepEqual(
      inspection[6].results.map(({ response_type }) => response_type).sort(),
      [
        committedConcurrentChoices[0].response.responseType,
        "wait",
        "wait",
      ].sort(),
    );
    assert.ok(
      inspection[6].results.every(
        ({ id, external_outcome_observed }) =>
          /^[0-9a-f]{64}$/.test(id) && external_outcome_observed === 0,
      ),
    );
    assert.equal(inspection[7].results.length, 3);
    const responseIds = new Set(inspection[6].results.map(({ id }) => id));
    for (const audit of inspection[7].results) {
      assert.match(audit.id, /^[0-9a-f]{64}$/);
      assert.equal(audit.target_id, workspace.plan.id);
      assert.match(audit.request_id, /^[0-9a-f-]{36}$/);
      const metadata = JSON.parse(audit.metadata);
      assert.match(metadata.inputFingerprint, /^[0-9a-f]{64}$/);
      assert.ok(responseIds.has(metadata.responseId));
      assert.equal(metadata.externalOutcomeObserved, false);
    }
    const persistedResponseEvidence = JSON.stringify([
      inspection[6].results,
      inspection[7].results,
    ]);
    assert.equal(persistedResponseEvidence.includes(responseOperationKey), false);
    assert.equal(persistedResponseEvidence.includes(concurrentResponseKey), false);
    assert.equal(inspection[8].results[0].count, 2);
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

function planPathForContext(sessionContext) {
  assert.match(sessionContext, /^[0-9a-f]{64}$/);
  return `/r/plan?context=${sessionContext}`;
}

function assertNeutralPlanHtml(html) {
  assert.match(html, /Plan unavailable/);
  assert.doesNotMatch(html, /Jordan Synthetic|Morgan Isolated/);
  assert.doesNotMatch(
    html,
    /Jordan Predictable Contact Roadmap|Morgan Flight Window Roadmap/,
  );
  assert.doesNotMatch(html, /Close roadmap|What would you like to do next/);
}

function golferResponse(
  worker,
  cookie,
  idempotencyKey,
  responseType,
  sessionContext,
) {
  return worker.dispatch("/r/response", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      origin: testOrigin,
      "sec-fetch-site": "same-origin",
      cookie,
    },
    body: JSON.stringify({ responseType, sessionContext }),
  });
}

async function sessionContextForCookie(worker, cookie) {
  const rawSessionToken = cookie.split("=", 2)[1];
  const [inspection] = await worker.inspect([
    {
      sql: "select id, account_id, share_link_id from share_sessions where token_hash = ?",
      params: [shareSessionHash(rawSessionToken)],
    },
  ]);
  const session = inspection.results[0];
  assert.ok(session, "expected a stored share session for the browser cookie");
  return createHmac(
    "sha256",
    "synthetic-local-critical-journey-pepper-2026-08-07",
  )
    .update(
      JSON.stringify([
        "share-session-context-v1",
        session.account_id,
        session.share_link_id,
        session.id,
      ]),
    )
    .digest("hex");
}

function syntheticConcurrentBarrier(expectedCheckpoint, arrivalsRequired) {
  let signalReached;
  let releaseBarrier;
  const reached = new Promise((resolve) => {
    signalReached = resolve;
  });
  const released = new Promise((resolve) => {
    releaseBarrier = resolve;
  });
  let armed = false;
  let arrivals = 0;
  return {
    reached,
    arm: () => {
      armed = true;
    },
    release: () => releaseBarrier(),
    handler: async (request) => {
      const checkpoint = decodeURIComponent(
        new URL(request.url).pathname.split("/").at(-1) ?? "",
      );
      if (!armed || checkpoint !== expectedCheckpoint) {
        return new Response("skipped");
      }
      arrivals += 1;
      if (arrivals === arrivalsRequired) signalReached();
      await released;
      return new Response("released");
    },
  };
}
