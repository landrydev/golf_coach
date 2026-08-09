import assert from "node:assert/strict";
import test from "node:test";
import {
  grantSyntheticGolferRecordConsent,
  grantSyntheticRoadmapSharingConsent,
  identityHeaders,
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = { email: "coach.a@example.test", name: "Coach Consent Fence" };

test(
  "required consent gates authoring and capabilities, and withdrawal revokes every live access path",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const profile = await jsonWrite(worker, "/api/profile", "PUT", {
      displayName: coach.name,
      contactEmail: coach.email,
    });
    assert.equal(profile.status, 200);

    const packageCreate = await jsonWrite(
      worker,
      "/api/packages",
      "POST",
      packagePayload("Unlinked setup package"),
    );
    assert.equal(packageCreate.status, 201);
    const coachingPackage = (await packageCreate.json()).package;
    const zeroPlanProfileUpdate = await jsonWrite(worker, "/api/profile", "PUT", {
      displayName: `${coach.name} Updated`,
      contactEmail: coach.email,
    });
    assert.equal(zeroPlanProfileUpdate.status, 200);

    const deniedCreate = await createGolfer(worker, "Pre-grant");
    await assertApiError(deniedCreate, 409, "current_consent_required");
    const deniedList = await worker.dispatch("/api/golfers", {
      headers: identityHeaders(coach.email, coach.name),
    });
    await assertApiError(deniedList, 409, "current_consent_required");

    await grantSyntheticGolferRecordConsent(worker, coach);
    const firstCreate = await createGolfer(
      worker,
      "Lifecycle One",
      coachingPackage.id,
    );
    assert.equal(firstCreate.status, 201);
    const first = await firstCreate.json();

    const missingSharing = await publish(worker, first.plan.id, first.plan.revision);
    await assertApiError(missingSharing, 409, "current_consent_required");

    await grantSyntheticRoadmapSharingConsent(worker, coach, first.golfer.id);
    const firstPublication = await publish(worker, first.plan.id, first.plan.revision);
    assert.equal(firstPublication.status, 201);
    const firstToken = tokenFromPublish(await firstPublication.json());

    // A same-version or older imported row with non-current policy text/version
    // becomes the latest state and must immediately disable an existing link.
    const sharingState = await currentPurpose(
      worker,
      { subjectType: "golfer", golferId: first.golfer.id },
      "roadmap_sharing",
    );
    const staleCreatedAt = sharingState.currentRecord.createdAt + 1;
    await worker.inspect([
      {
        sql: `insert into consent_records
          (id, account_id, golfer_id, subject_type, scope, status,
           policy_version, purpose_description, capture_method,
           recorded_by_account_id, granted_at, created_at)
          select 'stale_sharing_import', account_id, id, 'golfer',
                 'roadmap_sharing', 'granted', 'synthetic-roadmap-sharing-v0',
                 'Synthetic stale sharing import.', 'imported', account_id, ?, ?
            from golfers where id = ?`,
        params: [staleCreatedAt, staleCreatedAt, first.golfer.id],
      },
    ]);
    await assertApiError(await exchange(worker, firstToken), 404, "plan_unavailable");

    await grantSyntheticRoadmapSharingConsent(worker, coach, first.golfer.id);
    const firstExchange = await exchange(worker, firstToken);
    assert.equal(firstExchange.status, 200);
    const firstCookie = sessionCookie(firstExchange);
    const currentRead = await readSharedPlan(worker, firstCookie);
    assert.match(currentRead, /Lifecycle One Golfer/);

    const beforeWithdrawal = await currentPurpose(
      worker,
      { subjectType: "golfer", golferId: first.golfer.id },
      "roadmap_sharing",
    );
    const [racedRead, sharingWithdrawal] = await Promise.all([
      worker.dispatch("/r/plan", {
        headers: { accept: "text/html", cookie: firstCookie },
      }),
      withdraw(worker, beforeWithdrawal, {
        subjectType: "golfer",
        golferId: first.golfer.id,
      }),
    ]);
    assert.equal(racedRead.status, 200);
    assert.equal(sharingWithdrawal.status, 201);

    const [revokedLinks, revokedSessions] = await worker.inspect([
      {
        sql: "select status, revoke_reason from share_links where plan_id = ?",
        params: [first.plan.id],
      },
      {
        sql: `select revoked_at, revoke_reason from share_sessions
               where share_link_id in (select id from share_links where plan_id = ?)`,
        params: [first.plan.id],
      },
    ]);
    assert.deepEqual(revokedLinks.results, [
      {
        status: "revoked",
        revoke_reason: "roadmap sharing authorization withdrawn",
      },
    ]);
    assert.equal(revokedSessions.results.length, 1);
    assert.ok(revokedSessions.results[0].revoked_at);
    assert.equal(
      revokedSessions.results[0].revoke_reason,
      "roadmap sharing authorization withdrawn",
    );
    await assertApiError(await exchange(worker, firstToken), 404, "plan_unavailable");
    assert.match(await readSharedPlan(worker, firstCookie), /Plan unavailable/);
    await assertApiError(
      await recordResponse(worker, firstCookie),
      404,
      "plan_unavailable",
    );

    // Publishing and withdrawal serialize on the tenant row. Publish may win
    // first or lose, but once both settle no active capability may survive.
    const secondCreate = await createGolfer(worker, "Publish Race");
    assert.equal(secondCreate.status, 201);
    const second = await secondCreate.json();
    await grantSyntheticRoadmapSharingConsent(worker, coach, second.golfer.id);
    const secondSharing = await currentPurpose(
      worker,
      { subjectType: "golfer", golferId: second.golfer.id },
      "roadmap_sharing",
    );
    const [racedPublish, racedWithdrawal] = await Promise.all([
      publish(worker, second.plan.id, second.plan.revision),
      withdraw(worker, secondSharing, {
        subjectType: "golfer",
        golferId: second.golfer.id,
      }),
    ]);
    assert.ok([201, 409].includes(racedPublish.status));
    assert.equal(racedWithdrawal.status, 201);
    const [activeAfterRace] = await worker.inspect([
      {
        sql: "select count(*) as count from share_links where plan_id = ? and status = 'active'",
        params: [second.plan.id],
      },
    ]);
    assert.deepEqual(activeAfterRace.results, [{ count: 0 }]);

    // Token exchange uses the same transactional consent fence. If exchange
    // wins it creates a session that the following withdrawal revokes; if it
    // loses it returns the neutral unavailable response.
    const thirdCreate = await createGolfer(worker, "Exchange Race");
    assert.equal(thirdCreate.status, 201);
    const third = await thirdCreate.json();
    await grantSyntheticRoadmapSharingConsent(worker, coach, third.golfer.id);
    const thirdPublication = await publish(worker, third.plan.id, third.plan.revision);
    assert.equal(thirdPublication.status, 201);
    const thirdToken = tokenFromPublish(await thirdPublication.json());
    const thirdSharing = await currentPurpose(
      worker,
      { subjectType: "golfer", golferId: third.golfer.id },
      "roadmap_sharing",
    );
    const [racedExchange, exchangeWithdrawal] = await Promise.all([
      exchange(worker, thirdToken),
      withdraw(worker, thirdSharing, {
        subjectType: "golfer",
        golferId: third.golfer.id,
      }),
    ]);
    assert.ok([200, 404].includes(racedExchange.status));
    assert.equal(exchangeWithdrawal.status, 201);
    await assertApiError(await exchange(worker, thirdToken), 404, "plan_unavailable");
    if (racedExchange.status === 200) {
      assert.match(await readSharedPlan(worker, sessionCookie(racedExchange)), /Plan unavailable/);
    }

    const accountState = await currentPurpose(
      worker,
      { subjectType: "account" },
      "golfer_record",
    );
    const accountWithdrawal = await withdraw(worker, accountState, {
      subjectType: "account",
      golferId: null,
    });
    assert.equal(accountWithdrawal.status, 201);

    await assertApiError(
      await worker.dispatch("/api/golfers", {
        headers: identityHeaders(coach.email, coach.name),
      }),
      409,
      "current_consent_required",
    );
    await assertApiError(
      await jsonWrite(worker, `/api/golfers/${first.golfer.id}`, "PUT", {
        displayName: "Mutation must not commit",
        preferredName: null,
        contactEmail: null,
        expectedPlanId: first.plan.id,
        expectedPlanRevision: first.plan.revision,
      }),
      409,
      "current_consent_required",
    );
    await assertApiError(
      await jsonWrite(worker, "/api/profile", "PUT", {
        displayName: "Linked plan profile mutation must not commit",
        contactEmail: coach.email,
      }),
      409,
      "current_consent_required",
    );
    await assertApiError(
      await jsonWrite(
        worker,
        `/api/packages/${coachingPackage.id}`,
        "PUT",
        packagePayload("Linked plan package mutation must not commit"),
      ),
      409,
      "current_consent_required",
    );
    await assertApiError(
      await jsonWrite(
        worker,
        `/api/packages/${coachingPackage.id}`,
        "DELETE",
        { confirmation: "archive_package" },
      ),
      409,
      "current_consent_required",
    );
    const blockedDetail = await worker.dispatch(`/app/golfers/${first.golfer.id}`, {
      headers: {
        ...identityHeaders(coach.email, coach.name),
        accept: "text/html",
      },
    });
    assert.equal(blockedDetail.status, 200);
    const blockedHtml = await blockedDetail.text();
    assert.match(blockedHtml, /Golfer records are unavailable/);
    assert.doesNotMatch(blockedHtml, /Lifecycle One Golfer/);

    // Export and one-way archival are intentional narrow privacy exceptions.
    const exportResponse = await jsonWrite(worker, "/api/data-export", "POST", {});
    assert.equal(exportResponse.status, 200);
    const archiveResponse = await jsonWrite(
      worker,
      `/api/golfers/${first.golfer.id}`,
      "DELETE",
      { confirmation: "archive_golfer_and_revoke_access" },
    );
    assert.equal(archiveResponse.status, 204);
  },
);

test("an expired grant denies mutation and a contradictory legacy grant is never effective", async (context) => {
  const worker = await startD1Worker({}, { migrationThroughIndex: 8 });
  context.after(() => worker.dispose());
  const profile = await jsonWrite(worker, "/api/profile", "PUT", {
    displayName: coach.name,
    contactEmail: coach.email,
  });
  assert.equal(profile.status, 200);
  const grant = await grantSyntheticGolferRecordConsent(worker, coach);

  await worker.inspect([
    {
      sql: "update consent_records set expires_at = granted_at + 1 where id = ?",
      params: [grant.id],
    },
  ]);
  await assertApiError(
    await createGolfer(worker, "Expired Boundary"),
    409,
    "current_consent_required",
  );

  await worker.inspect([
    {
      sql: "update consent_records set expires_at = null, granted_at = null where id = ?",
      params: [grant.id],
    },
  ]);
  const corruptState = await currentPurpose(
    worker,
    { subjectType: "account" },
    "golfer_record",
  );
  assert.equal(corruptState.effectiveGranted, false);
  await assertApiError(
    await createGolfer(worker, "Contradictory Import"),
    409,
    "current_consent_required",
  );
  const [golferCount] = await worker.inspect([
    { sql: "select count(*) as count from golfers" },
  ]);
  assert.deepEqual(golferCount.results, [{ count: 0 }]);
});

async function createGolfer(worker, label, coachingPackageId = null) {
  return jsonWrite(worker, "/api/golfers", "POST", {
    adultEligibilityConfirmed: true,
    displayName: `${label} Golfer`,
    email: `${label.toLowerCase().replaceAll(" ", ".")}@example.test`,
    planTitle: `${label} roadmap`,
    coachingPackageId,
    goal: {
      statement: "Build a predictable contact window.",
      why: "Choose targets using a clearer pattern.",
      context: "Synthetic consent enforcement fixture.",
    },
    assessment: {
      summary: "Contact changes as transition tempo increases.",
      strengths: "Clear awareness of strike feedback.",
      primaryPattern: "Strike location changes at faster transition tempos.",
      limitations: "One synthetic sample does not establish transfer.",
    },
    priority: {
      title: "Centered contact",
      rationale: "This is the narrowest observed barrier to the stated goal.",
    },
    phases: [1, 2, 3].map((number) => ({
      number,
      title: `Phase ${number}`,
      purpose: `Synthetic phase purpose ${number}.`,
      rationale: number === 1 ? "Establish the observed baseline first." : null,
      progressSignals: number === 1 ? ["Contact repeats in a reviewed set."] : [],
    })),
  });
}

function packagePayload(title) {
  return {
    title,
    description: "Synthetic package used only for consent enforcement verification.",
    priceCents: 25_000,
    currency: "CAD",
    terms: "Synthetic fixture terms; no purchase or communication occurs.",
    inclusions: ["Two synthetic lessons"],
    externalActionUrl: "https://booking.example.ca/consent-enforcement",
    status: "active",
    isDefault: false,
  };
}

function publish(worker, planId, expectedRevision) {
  return jsonWrite(worker, `/api/plans/${planId}/publish`, "POST", {
    confirmation: "reviewed_exact_golfer_view",
    expectedRevision,
    intendedRecipientContext: "Synthetic consent enforcement recipient",
    expiresInDays: 7,
  });
}

function exchange(worker, token) {
  return worker.dispatch("/r/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: testOrigin,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ token }),
  });
}

function recordResponse(worker, cookie) {
  return worker.dispatch("/r/response", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
      origin: testOrigin,
      "sec-fetch-site": "same-origin",
      cookie,
    },
    body: JSON.stringify({ responseType: "wait" }),
  });
}

async function readSharedPlan(worker, cookie) {
  const response = await worker.dispatch("/r/plan", {
    headers: { accept: "text/html", cookie },
  });
  assert.equal(response.status, 200);
  return response.text();
}

async function currentPurpose(worker, subject, purpose) {
  const query = new URLSearchParams(subject).toString();
  const response = await worker.dispatch(`/api/consents?${query}`, {
    headers: identityHeaders(coach.email, coach.name),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return body.consents.find((state) => state.purpose === purpose);
}

function withdraw(worker, state, subject) {
  return jsonWrite(worker, "/api/consents", "POST", {
    action: "withdraw",
    purpose: state.purpose,
    policyVersion: state.currentRecord.policyVersion,
    subjectType: subject.subjectType,
    golferId: subject.golferId ?? null,
    expectedCurrentRecordId: state.currentRecord.id,
    evidenceReference: "synthetic-test-withdrawal",
  });
}

function jsonWrite(worker, path, method, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}

function tokenFromPublish(body) {
  const token = new URLSearchParams(new URL(body.share.url).hash.slice(1)).get("token");
  assert.ok(token);
  return token;
}

function sessionCookie(response) {
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.match(cookie ?? "", /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);
  return cookie;
}

async function assertApiError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal((await response.json()).error.code, code);
}
