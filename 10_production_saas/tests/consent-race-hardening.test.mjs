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

const coach = {
  email: "coach.a@example.test",
  name: "Deterministic Consent Race Coach",
};

test(
  "raw-token resolution revalidates the exact capability after assembly",
  { timeout: 90_000 },
  async (context) => {
    const barrier = syntheticBarrier("share-token-after-assembly");
    const worker = await startD1Worker(
      {},
      { concurrencyBarrier: barrier.handler },
    );
    context.after(() => worker.dispose());
    const fixture = await sharedPlanFixture(worker, "Token revoke race");

    const pendingExchange = exchange(worker, fixture.token);
    await barrier.reached;
    const revoke = await jsonWrite(
      worker,
      `/api/shares/${fixture.shareId}`,
      "DELETE",
      { reason: "deterministic explicit revoke during assembled read" },
    );
    assert.equal(revoke.status, 204);
    barrier.release();

    await assertApiError(await pendingExchange, 404, "plan_unavailable");
  },
);

for (const race of [
  {
    label: "profile invalidation",
    mutate: (worker, fixture) =>
      jsonWrite(worker, "/api/profile", "PUT", {
        displayName: "Changed During Assembly",
        businessName: "Changed private profile content",
        contactEmail: coach.email,
        expectedUpdatedAt: fixture.profileUpdatedAt,
      }),
  },
  {
    label: "package invalidation",
    mutate: (worker, fixture) =>
      jsonWrite(
        worker,
        `/api/packages/${fixture.packageId}`,
        "PUT",
        {
          ...packagePayload("Changed package during assembly"),
          expectedUpdatedAt: fixture.packageUpdatedAt,
        },
      ),
  },
  {
    label: "roadmap-sharing withdrawal",
    mutate: (worker, fixture) =>
      withdrawConsent(worker, fixture.sharingState, {
        subjectType: "golfer",
        golferId: fixture.golferId,
      }),
  },
]) {
  test(
    `session resolution returns neutral unavailable after deterministic ${race.label}`,
    { timeout: 90_000 },
    async (context) => {
      const barrier = syntheticBarrier("share-session-after-assembly");
      const worker = await startD1Worker(
        {},
        { concurrencyBarrier: barrier.handler },
      );
      context.after(() => worker.dispose());
      const fixture = await sharedPlanFixture(worker, race.label);
      const session = await exchange(worker, fixture.token);
      assert.equal(session.status, 200);
      const sessionBody = await session.json();
      assert.match(sessionBody.sessionContext, /^[0-9a-f]{64}$/);
      const cookie = sessionCookie(session);

      const pendingRead = worker.dispatch(
        `/r/plan?context=${sessionBody.sessionContext}`,
        {
        headers: { accept: "text/html", cookie },
        },
      );
      await barrier.reached;
      const mutation = await race.mutate(worker, fixture);
      assert.ok([200, 201].includes(mutation.status));
      barrier.release();

      const response = await pendingRead;
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /Plan unavailable/);
      assert.doesNotMatch(html, new RegExp(fixture.privateMarker));
      assert.doesNotMatch(html, /Deterministic Race Golf/);
    },
  );
}

for (const operation of [
  {
    label: "profile update",
    checkpoint: "profile-after-impact-preflight",
    auditAction: "profile.saved",
    expectedSuccessAudits: 1,
    start: (worker, fixture) =>
      jsonWrite(worker, "/api/profile", "PUT", {
        displayName: "Forbidden raced profile",
        businessName: "Must not commit",
        contactEmail: coach.email,
        expectedUpdatedAt: fixture.profileUpdatedAt,
      }),
    assertUnchanged: async (worker, fixture) => {
      const [profile] = await worker.inspect([
        {
          sql: "select display_name, business_name from instructor_profiles where account_id = ?",
          params: [fixture.accountId],
        },
      ]);
      assert.deepEqual(profile.results, [
        {
          display_name: "Deterministic Race Coach",
          business_name: "Deterministic Race Golf",
        },
      ]);
    },
  },
  {
    label: "package update",
    checkpoint: "package-update-after-impact-preflight",
    auditAction: "coaching_package.updated",
    expectedSuccessAudits: 0,
    start: (worker, fixture) =>
      jsonWrite(
        worker,
        `/api/packages/${fixture.packageId}`,
        "PUT",
        {
          ...packagePayload("Forbidden raced package update"),
          expectedUpdatedAt: fixture.packageUpdatedAt,
        },
      ),
    assertUnchanged: assertOriginalPackage,
  },
  {
    label: "package archive",
    checkpoint: "package-archive-after-impact-preflight",
    auditAction: "coaching_package.archived",
    expectedSuccessAudits: 0,
    start: (worker, fixture) =>
      jsonWrite(
        worker,
        `/api/packages/${fixture.packageId}`,
        "DELETE",
        {
          confirmation: "archive_package",
          expectedUpdatedAt: fixture.packageUpdatedAt,
        },
      ),
    assertUnchanged: assertOriginalPackage,
  },
]) {
  test(
    `transaction-time consent fence blocks ${operation.label} after a concurrent first link and withdrawal`,
    { timeout: 90_000 },
    async (context) => {
      const barrier = syntheticBarrier(operation.checkpoint);
      const worker = await startD1Worker(
        {},
        { concurrencyBarrier: barrier.handler },
      );
      context.after(() => worker.dispose());
      const fixture = await zeroPlanFixture(worker);
      const accountState = await currentPurpose(
        worker,
        { subjectType: "account" },
        "golfer_record",
      );

      const pendingMutation = operation.start(worker, fixture);
      await barrier.reached;
      const workspaceResponse = await createGolfer(
        worker,
        `${operation.label} first link`,
        fixture.packageId,
      );
      assert.equal(workspaceResponse.status, 201);
      const racedWorkspace = await workspaceResponse.json();
      const withdrawal = await withdrawConsent(worker, accountState, {
        subjectType: "account",
        golferId: null,
      });
      assert.equal(withdrawal.status, 201);
      barrier.release();

      await assertApiError(
        await pendingMutation,
        409,
        "current_consent_required",
      );
      await operation.assertUnchanged(worker, fixture);
      const [linkedPlan, planState, successAudits] = await worker.inspect([
        {
          sql: `select count(*) as count
                  from development_plans p
                 where p.account_id = ?
                   and p.status <> 'archived'
                   and exists (
                     select 1 from plan_phases ph
                      where ph.account_id = p.account_id
                        and ph.plan_id = p.id
                        and ph.coaching_package_id = ?
                   )`,
          params: [fixture.accountId, fixture.packageId],
        },
        {
          sql: "select revision, status from development_plans where account_id = ? and id = ?",
          params: [fixture.accountId, racedWorkspace.plan.id],
        },
        {
          sql: "select count(*) as count from audit_events where account_id = ? and action = ? and outcome = 'success'",
          params: [fixture.accountId, operation.auditAction],
        },
      ]);
      assert.deepEqual(linkedPlan.results, [{ count: 1 }]);
      assert.deepEqual(planState.results, [{ revision: 1, status: "draft" }]);
      assert.deepEqual(successAudits.results, [
        { count: operation.expectedSuccessAudits },
      ]);
    },
  );
}

test(
  "profile and package setup remain usable without consent while no plan is linked",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({ CONSENT_POLICY_REGISTRY_JSON: "{}" });
    context.after(() => worker.dispose());
    const initialProfile = await saveProfile(worker, {
      displayName: "Zero Link Coach",
      businessName: "Zero Link Golf",
    });
    assert.equal(initialProfile.status, 200);
    const initialProfileBody = await initialProfile.json();
    const profileUpdate = await saveProfile(worker, {
      displayName: "Zero Link Coach Updated",
      businessName: "Zero Link Golf Updated",
      expectedUpdatedAt: initialProfileBody.profile.updatedAt,
    });
    assert.equal(profileUpdate.status, 200);

    const firstPackage = await createPackage(worker, "Zero link package one");
    const secondPackage = await createPackage(worker, "Zero link package two");
    const packageUpdate = await jsonWrite(
      worker,
      `/api/packages/${firstPackage.id}`,
      "PUT",
      {
        ...packagePayload("Zero link package one updated"),
        expectedUpdatedAt: firstPackage.updatedAt,
      },
    );
    assert.equal(packageUpdate.status, 200);
    const packageArchive = await jsonWrite(
      worker,
      `/api/packages/${secondPackage.id}`,
      "DELETE",
      {
        confirmation: "archive_package",
        expectedUpdatedAt: secondPackage.updatedAt,
      },
    );
    assert.equal(packageArchive.status, 200);
  },
);

async function sharedPlanFixture(worker, label) {
  const fixture = await zeroPlanFixture(worker);
  const workspaceResponse = await createGolfer(
    worker,
    label,
    fixture.packageId,
  );
  assert.equal(workspaceResponse.status, 201);
  const workspace = await workspaceResponse.json();
  await grantSyntheticRoadmapSharingConsent(worker, coach, workspace.golfer.id);
  const sharingState = await currentPurpose(
    worker,
    { subjectType: "golfer", golferId: workspace.golfer.id },
    "roadmap_sharing",
  );
  const publication = await jsonWrite(
    worker,
    `/api/plans/${workspace.plan.id}/publish`,
    "POST",
    {
      confirmation: "reviewed_exact_golfer_view",
      expectedRevision: workspace.plan.revision,
      intendedRecipientContext: "Synthetic deterministic race recipient",
      expiresInDays: 7,
    },
  );
  assert.equal(publication.status, 201);
  const published = await publication.json();
  return {
    ...fixture,
    golferId: workspace.golfer.id,
    planId: workspace.plan.id,
    shareId: published.share.id,
    token: tokenFromPublish(published),
    sharingState,
    privateMarker: `${label} Golfer`,
  };
}

async function zeroPlanFixture(worker) {
  const profile = await saveProfile(worker, {
    displayName: "Deterministic Race Coach",
    businessName: "Deterministic Race Golf",
  });
  assert.equal(profile.status, 200);
  const profileBody = await profile.json();
  const accountId = profileBody.profile ? await accountIdFor(worker) : null;
  assert.ok(accountId);
  const coachingPackage = await createPackage(worker, "Original race package");
  await grantSyntheticGolferRecordConsent(worker, coach);
  return {
    accountId,
    profileUpdatedAt: profileBody.profile.updatedAt,
    packageId: coachingPackage.id,
    packageUpdatedAt: coachingPackage.updatedAt,
  };
}

async function accountIdFor(worker) {
  const [account] = await worker.inspect([
    {
      sql: "select id from accounts where normalized_email = ?",
      params: [coach.email],
    },
  ]);
  return account.results[0]?.id ?? null;
}

function saveProfile(worker, overrides = {}) {
  return jsonWrite(worker, "/api/profile", "PUT", {
    displayName: "Deterministic Race Coach",
    businessName: "Deterministic Race Golf",
    contactEmail: coach.email,
    ...overrides,
  });
}

async function createPackage(worker, title) {
  const response = await jsonWrite(
    worker,
    "/api/packages",
    "POST",
    packagePayload(title),
  );
  assert.equal(response.status, 201);
  return (await response.json()).package;
}

function createGolfer(worker, label, coachingPackageId) {
  return jsonWrite(worker, "/api/golfers", "POST", {
    adultEligibilityConfirmed: true,
    displayName: `${label} Golfer`,
    email: `${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, ".")}@example.test`,
    planTitle: `${label} private roadmap`,
    coachingPackageId,
    goal: {
      statement: "Build a predictable contact window.",
      why: "Choose targets using a clearer pattern.",
      context: "Synthetic deterministic race fixture.",
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
      progressSignals:
        number === 1 ? ["Contact repeats in a reviewed set."] : [],
    })),
  });
}

function packagePayload(title) {
  return {
    title,
    description: "Synthetic package for deterministic concurrency verification.",
    priceCents: 25_000,
    currency: "CAD",
    terms: "Synthetic terms; no purchase or communication occurs.",
    inclusions: ["Two synthetic lessons"],
    externalActionUrl: "https://booking.example.ca/deterministic-race",
    status: "active",
    isDefault: false,
  };
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

function sessionCookie(response) {
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.match(cookie ?? "", /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);
  return cookie;
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

function withdrawConsent(worker, state, subject) {
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
  const token = new URLSearchParams(new URL(body.share.url).hash.slice(1)).get(
    "token",
  );
  assert.ok(token);
  return token;
}

async function assertApiError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal((await response.json()).error.code, code);
}

async function assertOriginalPackage(worker, fixture) {
  const [coachingPackage] = await worker.inspect([
    {
      sql: "select name, status from coaching_packages where account_id = ? and id = ?",
      params: [fixture.accountId, fixture.packageId],
    },
  ]);
  assert.deepEqual(coachingPackage.results, [
    { name: "Original race package", status: "active" },
  ]);
}

function syntheticBarrier(expectedCheckpoint) {
  let signalReached;
  let releaseBarrier;
  const reached = new Promise((resolve) => {
    signalReached = resolve;
  });
  const released = new Promise((resolve) => {
    releaseBarrier = resolve;
  });
  let observed = false;
  return {
    reached,
    release: () => releaseBarrier(),
    handler: async (request) => {
      const checkpoint = decodeURIComponent(
        new URL(request.url).pathname.split("/").at(-1) ?? "",
      );
      if (checkpoint !== expectedCheckpoint) return new Response("skipped");
      if (!observed) {
        observed = true;
        signalReached();
      }
      await released;
      return new Response("released");
    },
  };
}
