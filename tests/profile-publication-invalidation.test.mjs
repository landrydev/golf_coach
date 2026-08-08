import assert from "node:assert/strict";
import { test } from "node:test";
import {
  identityHeaders,
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coachA = {
  email: "lifecycle.coach@example.test",
  name: "Profile Publication Coach A",
};
const coachB = {
  email: "other.tenant@example.test",
  name: "Profile Publication Coach B",
};

test(
  "material coach profile changes revoke raw and issued-session access until deliberate republish",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const originalProfile = profilePayload(coachA, {
      displayName: "Coach Before",
      businessName: "Before Flight Golf",
      contactEmail: "before@example.test",
      accentColor: "#176b55",
    });
    await saveProfile(worker, coachA, originalProfile);
    const workspaceA = await createGolfer(worker, coachA, "Profile Golfer A");
    const shareA = await publish(
      worker,
      coachA,
      workspaceA.plan.id,
      1,
      "Profile publication recipient A",
    );
    const cookieA = await exchange(worker, shareA.token);
    const originalHtml = await renderPlan(worker, cookieA);
    assert.match(originalHtml, /Before Flight Golf/);
    assert.doesNotMatch(originalHtml, /After Flight Golf/);

    await saveProfile(
      worker,
      coachB,
      profilePayload(coachB, { businessName: "Other Tenant Golf" }),
    );
    const workspaceB = await createGolfer(worker, coachB, "Profile Golfer B");
    const shareB = await publish(
      worker,
      coachB,
      workspaceB.plan.id,
      1,
      "Profile publication recipient B",
    );
    const cookieB = await exchange(worker, shareB.token);

    const changedProfile = profilePayload(coachA, {
      displayName: "Coach After",
      businessName: "After Flight Golf",
      contactEmail: "after@example.test",
      accentColor: "#1b4f40",
    });
    const updateResponse = await jsonWrite(
      worker,
      "/api/profile",
      "PUT",
      coachA,
      changedProfile,
    );
    assert.equal(updateResponse.status, 200);
    const update = await updateResponse.json();
    assert.deepEqual(update.changedFields, [
      "displayName",
      "businessName",
      "contactEmail",
      "accentColor",
    ]);
    assert.deepEqual(update.publicationImpact, {
      invalidated: true,
      affectedPlans: 1,
      revokedShareLinks: 1,
      revokedShareSessions: 1,
    });

    await assertRawCapabilityUnavailable(worker, shareA.token);
    const revokedSessionHtml = await renderPlan(worker, cookieA);
    assert.match(revokedSessionHtml, /Plan unavailable/);
    assert.doesNotMatch(revokedSessionHtml, /Before Flight Golf/);
    assert.doesNotMatch(revokedSessionHtml, /After Flight Golf/);

    const otherTenantHtml = await renderPlan(worker, cookieB);
    assert.match(otherTenantHtml, /Other Tenant Golf/);
    assert.doesNotMatch(otherTenantHtml, /Plan unavailable/);
    const secondOtherTenantCookie = await exchange(worker, shareB.token);
    assert.match(await renderPlan(worker, secondOtherTenantCookie), /Other Tenant Golf/);

    const staleRepublish = await publishResponse(
      worker,
      coachA,
      workspaceA.plan.id,
      1,
      "Stale profile publication revision",
    );
    assert.equal(staleRepublish.status, 409);
    assert.equal((await staleRepublish.json()).error.code, "stale_plan_revision");

    const replacementShare = await publish(
      worker,
      coachA,
      workspaceA.plan.id,
      2,
      "Profile publication recipient A after review",
    );
    const replacementCookie = await exchange(worker, replacementShare.token);
    const replacementHtml = await renderPlan(worker, replacementCookie);
    assert.match(replacementHtml, /After Flight Golf/);
    assert.doesNotMatch(replacementHtml, /Before Flight Golf/);

    const noOpResponse = await jsonWrite(
      worker,
      "/api/profile",
      "PUT",
      coachA,
      changedProfile,
    );
    assert.equal(noOpResponse.status, 200);
    const noOp = await noOpResponse.json();
    assert.deepEqual(noOp.changedFields, []);
    assert.deepEqual(noOp.publicationImpact, {
      invalidated: false,
      affectedPlans: 0,
      revokedShareLinks: 0,
      revokedShareSessions: 0,
    });
    assert.match(await renderPlan(worker, replacementCookie), /After Flight Golf/);

    const inspection = await worker.inspect([
      {
        sql: "select revision, status, approved_revision, published_revision from development_plans where id = ?",
        params: [workspaceA.plan.id],
      },
      {
        sql: "select status, revoke_reason from share_links where id = ?",
        params: [shareA.id],
      },
      {
        sql: "select revoked_at, revoke_reason from share_sessions where share_link_id = ? order by created_at limit 1",
        params: [shareA.id],
      },
      {
        sql: "select metadata from audit_events where account_id = (select id from accounts where normalized_email = ?) and action = 'profile.saved' and json_extract(metadata, '$.publicationInvalidated') = 1 order by occurred_at desc, rowid desc limit 1",
        params: [coachA.email],
      },
      {
        sql: "select status from share_links where id = ?",
        params: [shareB.id],
      },
      {
        sql: "select revoked_at from share_sessions where share_link_id = ? order by created_at",
        params: [shareB.id],
      },
    ]);

    assert.deepEqual(inspection[0].results, [
      {
        revision: 2,
        status: "published",
        approved_revision: 2,
        published_revision: 2,
      },
    ]);
    assert.deepEqual(inspection[1].results, [
      { status: "revoked", revoke_reason: "coach profile updated" },
    ]);
    assert.equal(inspection[2].results.length, 1);
    assert.ok(inspection[2].results[0].revoked_at);
    assert.equal(
      inspection[2].results[0].revoke_reason,
      "coach profile updated",
    );
    assert.equal(inspection[3].results.length, 1);
    const auditMetadata = JSON.parse(inspection[3].results[0].metadata);
    assert.equal(auditMetadata.publicationInvalidated, true);
    assert.equal(
      auditMetadata.revocationScope,
      "all_active_account_shares_and_sessions",
    );
    assert.equal(auditMetadata.planReviewRequired, true);
    assert.equal(auditMetadata.stalePublicationFenced, true);
    assert.equal(auditMetadata.activeShareLinksObservedBeforeCommit, 1);
    assert.equal(auditMetadata.activeShareSessionsObservedBeforeCommit, 1);
    assert.deepEqual(inspection[4].results, [{ status: "active" }]);
    assert.equal(inspection[5].results.length, 2);
    assert.ok(inspection[5].results.every((row) => row.revoked_at === null));
  },
);

test(
  "an old-profile preview cannot publish its stale draft revision after profile save",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    await saveProfile(
      worker,
      coachA,
      profilePayload(coachA, {
        displayName: "Preview Coach Before",
        businessName: "Preview Before Golf",
      }),
    );
    const workspace = await createGolfer(
      worker,
      coachA,
      "Profile Interleaving Golfer",
    );

    // Deterministically model the dangerous ordering: the coach has already
    // assembled/reviewed revision 1 with the old profile, then profile save
    // commits before that reviewed revision attempts its publish transaction.
    const oldPreview = await worker.dispatch(
      `/app/golfers/${workspace.golfer.id}`,
      { headers: identityHeaders(coachA.email, coachA.name) },
    );
    assert.equal(oldPreview.status, 200);
    const oldPreviewHtml = await oldPreview.text();
    assert.match(oldPreviewHtml, /Preview Before Golf/);
    assert.doesNotMatch(oldPreviewHtml, /Preview After Golf/);

    const profileUpdate = await jsonWrite(
      worker,
      "/api/profile",
      "PUT",
      coachA,
      profilePayload(coachA, {
        displayName: "Preview Coach After",
        businessName: "Preview After Golf",
      }),
    );
    assert.equal(profileUpdate.status, 200);
    assert.deepEqual((await profileUpdate.json()).publicationImpact, {
      invalidated: true,
      affectedPlans: 1,
      revokedShareLinks: 0,
      revokedShareSessions: 0,
    });

    const stalePublish = await publishResponse(
      worker,
      coachA,
      workspace.plan.id,
      1,
      "Old-profile preview recipient",
    );
    assert.equal(stalePublish.status, 409);
    assert.equal((await stalePublish.json()).error.code, "stale_plan_revision");

    const [planState] = await worker.inspect([
      {
        sql: "select revision, status, approved_revision, published_revision from development_plans where id = ?",
        params: [workspace.plan.id],
      },
    ]);
    assert.deepEqual(planState.results, [
      {
        revision: 2,
        status: "draft",
        approved_revision: null,
        published_revision: null,
      },
    ]);

    const reviewedReplacement = await publish(
      worker,
      coachA,
      workspace.plan.id,
      2,
      "Reviewed new-profile recipient",
    );
    const replacementCookie = await exchange(worker, reviewedReplacement.token);
    const replacementHtml = await renderPlan(worker, replacementCookie);
    assert.match(replacementHtml, /Preview After Golf/);
    assert.doesNotMatch(replacementHtml, /Preview Before Golf/);
  },
);

test(
  "profile invalidation preserves paused and completed lifecycle status while clearing publication",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const before = profilePayload(coachA, {
      businessName: "Lifecycle Profile Before Golf",
    });
    await saveProfile(worker, coachA, before);
    const pausedWorkspace = await createGolfer(
      worker,
      coachA,
      "Profile Paused Golfer",
    );
    const completedWorkspace = await createGolfer(
      worker,
      coachA,
      "Profile Completed Golfer",
    );
    const pausedShare = await publish(
      worker,
      coachA,
      pausedWorkspace.plan.id,
      1,
      "Paused profile recipient",
    );
    const completedShare = await publish(
      worker,
      coachA,
      completedWorkspace.plan.id,
      1,
      "Completed profile recipient",
    );

    await worker.inspect([
      {
        sql: "update development_plans set status = 'paused' where id = ?",
        params: [pausedWorkspace.plan.id],
      },
      {
        sql: "update development_plans set status = 'completed' where id = ?",
        params: [completedWorkspace.plan.id],
      },
    ]);

    const update = await jsonWrite(
      worker,
      "/api/profile",
      "PUT",
      coachA,
      { ...before, businessName: "Lifecycle Profile After Golf" },
    );
    assert.equal(update.status, 200);
    assert.deepEqual((await update.json()).publicationImpact, {
      invalidated: true,
      affectedPlans: 2,
      revokedShareLinks: 2,
      revokedShareSessions: 0,
    });

    await assertRawCapabilityUnavailable(worker, pausedShare.token);
    await assertRawCapabilityUnavailable(worker, completedShare.token);
    const [states] = await worker.inspect([
      {
        sql: "select id, revision, status, approved_revision, published_revision, coach_approved_at, previewed_at, published_at, last_shared_at from development_plans where id in (?, ?) order by id",
        params: [pausedWorkspace.plan.id, completedWorkspace.plan.id],
      },
    ]);
    assert.equal(states.results.length, 2);
    const byId = new Map(states.results.map((row) => [row.id, row]));
    assertPlanReset(byId.get(pausedWorkspace.plan.id), "paused");
    assertPlanReset(byId.get(completedWorkspace.plan.id), "completed");
  },
);

function profilePayload(identity, overrides = {}) {
  return {
    displayName: identity.name,
    businessName: "Profile Publication Golf",
    professionalTitle: "Golf instructor",
    philosophy: "Synthetic profile-publication verification only.",
    contactEmail: identity.email,
    contactPhone: null,
    websiteUrl: "https://profile-publication.example.ca",
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#176b55",
    ...overrides,
  };
}

async function saveProfile(worker, identity, payload) {
  const response = await jsonWrite(
    worker,
    "/api/profile",
    "PUT",
    identity,
    payload,
  );
  assert.equal(response.status, 200);
  return response.json();
}

async function createGolfer(worker, identity, displayName) {
  const response = await jsonWrite(
    worker,
    "/api/golfers",
    "POST",
    identity,
    {
      adultEligibilityConfirmed: true,
      displayName,
      planTitle: `${displayName} roadmap`,
      goal: {
        statement: "Build a predictable contact window.",
        why: "Choose targets with a clearer pattern.",
        context: "Synthetic profile-publication verification.",
      },
      assessment: {
        summary: "Contact varies as transition tempo increases.",
        strengths: "Clear awareness of strike feedback.",
        primaryPattern: "Strike location changes at faster transition tempos.",
        limitations: "One synthetic sample cannot establish on-course transfer.",
      },
      priority: {
        title: "Centered contact",
        rationale: "This is the narrowest observed barrier to the stated goal.",
      },
      phases: [
        {
          number: 1,
          title: "Calibrate contact",
          purpose: "Establish the current strike window.",
          rationale: "A trustworthy baseline must lead the roadmap.",
          progressSignals: ["Centered contact repeats in a coach-reviewed set."],
        },
        {
          number: 2,
          title: "Transfer to targets",
          purpose: "Use the strike window for representative target decisions.",
        },
        {
          number: 3,
          title: "Retain under constraints",
          purpose: "Review the pattern under representative constraints.",
        },
      ],
    },
  );
  assert.equal(response.status, 201);
  return response.json();
}

async function publish(worker, identity, planId, revision, recipient) {
  const response = await publishResponse(
    worker,
    identity,
    planId,
    revision,
    recipient,
  );
  assert.equal(response.status, 201);
  const share = (await response.json()).share;
  const url = new URL(share.url);
  const token = new URLSearchParams(url.hash.slice(1)).get("token");
  assert.ok(token);
  return { ...share, token };
}

function publishResponse(worker, identity, planId, revision, recipient) {
  return jsonWrite(
    worker,
    `/api/plans/${planId}/publish`,
    "POST",
    identity,
    {
      confirmation: "reviewed_exact_golfer_view",
      expectedRevision: revision,
      intendedRecipientContext: recipient,
      expiresInDays: 7,
    },
  );
}

async function exchange(worker, token) {
  const response = await jsonWrite(worker, "/r/session", "POST", null, {
    token,
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.match(cookie ?? "", /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);
  return cookie;
}

async function renderPlan(worker, cookie) {
  const response = await worker.dispatch("/r/plan", {
    headers: { accept: "text/html", cookie },
  });
  assert.equal(response.status, 200);
  return response.text();
}

async function assertRawCapabilityUnavailable(worker, token) {
  const response = await jsonWrite(worker, "/r/session", "POST", null, {
    token,
  });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "plan_unavailable");
}

function jsonWrite(worker, path, method, identity, body) {
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

function assertPlanReset(row, status) {
  assert.ok(row);
  assert.equal(row.revision, 2);
  assert.equal(row.status, status);
  for (const field of [
    "approved_revision",
    "published_revision",
    "coach_approved_at",
    "previewed_at",
    "published_at",
    "last_shared_at",
  ]) {
    assert.equal(row[field], null, `${status} plan should clear ${field}`);
  }
}
