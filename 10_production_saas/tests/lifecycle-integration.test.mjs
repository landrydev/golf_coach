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

const coachA = {
  email: "lifecycle.coach@example.test",
  name: "Coach Lifecycle",
};
const coachB = {
  email: "other.tenant@example.test",
  name: "Other Tenant",
};

test(
  "production Worker enforces tenant-scoped package and golfer lifecycle invalidation",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    await createProfile(worker, coachA);
    await grantSyntheticGolferRecordConsent(worker, coachB);

    const packageOne = await createPackage(
      worker,
      coachA,
      packagePayload("Flight Window Series"),
    );
    const packageWorkspace = await createGolfer(
      worker,
      coachA,
      "Package Lifecycle Golfer",
      packageOne.id,
    );
    const packageShareOne = await publish(
      worker,
      coachA,
      packageWorkspace.plan.id,
      1,
      "Package lifecycle recipient",
    );

    const crossTenantPackageEdit = await jsonWrite(
      worker,
      `/api/packages/${packageOne.id}`,
      "PUT",
      coachB,
      {
        ...packagePayload("Cross-tenant mutation"),
        expectedUpdatedAt: packageOne.updatedAt,
      },
    );
    assert.equal(crossTenantPackageEdit.status, 404);
    assert.equal(
      (await crossTenantPackageEdit.json()).error.code,
      "package_not_found",
    );
    await assertShareAvailable(worker, packageShareOne.token);

    const packageEdit = await jsonWrite(
      worker,
      `/api/packages/${packageOne.id}`,
      "PUT",
      coachA,
      {
        ...packagePayload("Flight Window Series — revised"),
        expectedUpdatedAt: packageOne.updatedAt,
      },
    );
    assert.equal(packageEdit.status, 200);
    const packageEditResult = await packageEdit.json();
    assert.equal(packageEditResult.package.title, "Flight Window Series — revised");
    assert.equal(packageEditResult.affectedPlans, 1);
    assert.equal(packageEditResult.revokedShareLinks, 1);
    await assertShareUnavailable(worker, packageShareOne.token);

    const stalePackagePlanPublish = await publishResponse(
      worker,
      coachA,
      packageWorkspace.plan.id,
      1,
      "Stale package-linked revision",
    );
    assert.equal(stalePackagePlanPublish.status, 409);
    assert.equal(
      (await stalePackagePlanPublish.json()).error.code,
      "stale_plan_revision",
    );

    const packageShareTwo = await publish(
      worker,
      coachA,
      packageWorkspace.plan.id,
      2,
      "Re-reviewed package lifecycle recipient",
    );

    const crossTenantPackageArchive = await jsonWrite(
      worker,
      `/api/packages/${packageOne.id}`,
      "DELETE",
      coachB,
      {
        confirmation: "archive_package",
        expectedUpdatedAt: packageEditResult.package.updatedAt,
      },
    );
    assert.equal(crossTenantPackageArchive.status, 404);
    assert.equal(
      (await crossTenantPackageArchive.json()).error.code,
      "package_not_found",
    );
    await assertShareAvailable(worker, packageShareTwo.token);

    const packageArchive = await jsonWrite(
      worker,
      `/api/packages/${packageOne.id}`,
      "DELETE",
      coachA,
      {
        confirmation: "archive_package",
        expectedUpdatedAt: packageEditResult.package.updatedAt,
      },
    );
    assert.equal(packageArchive.status, 200);
    const packageArchiveResult = await packageArchive.json();
    assert.equal(packageArchiveResult.package.status, "archived");
    assert.equal(packageArchiveResult.affectedPlans, 1);
    assert.equal(packageArchiveResult.revokedShareLinks, 1);
    await assertShareUnavailable(worker, packageShareTwo.token);

    const packagePlanRevisionTwo = await publishResponse(
      worker,
      coachA,
      packageWorkspace.plan.id,
      2,
      "Pre-archive package revision",
    );
    assert.equal(packagePlanRevisionTwo.status, 409);
    assert.equal(
      (await packagePlanRevisionTwo.json()).error.code,
      "stale_plan_revision",
    );

    const archivedPackageEdit = await jsonWrite(
      worker,
      `/api/packages/${packageOne.id}`,
      "PUT",
      coachA,
      {
        ...packagePayload("Attempted archived-package edit"),
        expectedUpdatedAt: packageArchiveResult.package.updatedAt,
      },
    );
    assert.equal(archivedPackageEdit.status, 409);
    assert.equal((await archivedPackageEdit.json()).error.code, "package_archived");

    const packageTwo = await createPackage(
      worker,
      coachA,
      packagePayload("Identity Review Series", false),
    );
    const golferWorkspace = await createGolfer(
      worker,
      coachA,
      "Jordan Original",
      packageTwo.id,
    );
    const identityShare = await publish(
      worker,
      coachA,
      golferWorkspace.plan.id,
      1,
      "Jordan Original, adult golfer",
    );
    const identitySession = await assertShareAvailable(worker, identityShare.token);

    const crossTenantIdentityEdit = await jsonWrite(
      worker,
      `/api/golfers/${golferWorkspace.golfer.id}`,
      "PUT",
      coachB,
      identityPayload(golferWorkspace.plan.id, 1, "Cross-tenant name"),
    );
    assert.equal(crossTenantIdentityEdit.status, 404);
    assert.equal(
      (await crossTenantIdentityEdit.json()).error.code,
      "golfer_not_found",
    );
    await assertShareAvailable(worker, identityShare.token);

    const staleIdentityEdit = await jsonWrite(
      worker,
      `/api/golfers/${golferWorkspace.golfer.id}`,
      "PUT",
      coachA,
      identityPayload(golferWorkspace.plan.id, 2, "Stale identity change"),
    );
    assert.equal(staleIdentityEdit.status, 409);
    assert.equal(
      (await staleIdentityEdit.json()).error.code,
      "stale_plan_revision",
    );
    const unchangedPlan = await worker.dispatch(identitySession.planPath, {
      headers: { accept: "text/html", cookie: identitySession.cookie },
    });
    assert.equal(unchangedPlan.status, 200);
    const unchangedPlanHtml = await unchangedPlan.text();
    assert.match(unchangedPlanHtml, /Jordan Original/);
    assert.doesNotMatch(unchangedPlanHtml, /Stale identity change/);
    assert.doesNotMatch(unchangedPlanHtml, /Cross-tenant name/);

    const identityEdit = await jsonWrite(
      worker,
      `/api/golfers/${golferWorkspace.golfer.id}`,
      "PUT",
      coachA,
      identityPayload(golferWorkspace.plan.id, 1, "Jordan Corrected"),
    );
    assert.equal(identityEdit.status, 200);
    assert.deepEqual(await identityEdit.json(), { updated: true });

    const repeatedStaleIdentityEdit = await jsonWrite(
      worker,
      `/api/golfers/${golferWorkspace.golfer.id}`,
      "PUT",
      coachA,
      identityPayload(golferWorkspace.plan.id, 1, "Repeated stale change"),
    );
    assert.equal(repeatedStaleIdentityEdit.status, 409);
    assert.equal(
      (await repeatedStaleIdentityEdit.json()).error.code,
      "stale_plan_revision",
    );
    await assertShareUnavailable(worker, identityShare.token);
    await assertCookieUnavailable(worker, identitySession);

    const archiveShare = await publish(
      worker,
      coachA,
      golferWorkspace.plan.id,
      2,
      "Jordan Corrected, adult golfer",
    );
    const archiveSession = await assertShareAvailable(worker, archiveShare.token);

    const crossTenantGolferArchive = await jsonWrite(
      worker,
      `/api/golfers/${golferWorkspace.golfer.id}`,
      "DELETE",
      coachB,
      { confirmation: "archive_golfer_and_revoke_access" },
    );
    assert.equal(crossTenantGolferArchive.status, 404);
    assert.equal(
      (await crossTenantGolferArchive.json()).error.code,
      "golfer_not_found",
    );
    await assertShareAvailable(worker, archiveShare.token);

    const golferArchive = await jsonWrite(
      worker,
      `/api/golfers/${golferWorkspace.golfer.id}`,
      "DELETE",
      coachA,
      { confirmation: "archive_golfer_and_revoke_access" },
    );
    assert.equal(golferArchive.status, 204);
    assert.equal(await golferArchive.text(), "");
    await assertShareUnavailable(worker, archiveShare.token);
    await assertCookieUnavailable(worker, archiveSession);

    const archivedCoachView = await worker.dispatch(
      `/app/golfers/${golferWorkspace.golfer.id}`,
      {
        headers: {
          ...identityHeaders(coachA.email, coachA.name),
          accept: "text/html",
        },
      },
    );
    assert.equal(archivedCoachView.status, 200);
    const archivedCoachHtml = await archivedCoachView.text();
    assert.match(
      archivedCoachHtml,
      /This golfer record is archived|This plan is[^<]*archived/i,
    );
    assert.match(archivedCoachHtml, /read-only/i);
    assert.doesNotMatch(archivedCoachHtml, /Edit core roadmap/);
    assert.doesNotMatch(archivedCoachHtml, /Publish and create private link/);

    const archivedPlanEdit = await jsonWrite(
      worker,
      `/api/plans/${golferWorkspace.plan.id}`,
      "PUT",
      coachA,
      planEditPayload(2),
    );
    assert.equal(archivedPlanEdit.status, 409);
    assert.equal((await archivedPlanEdit.json()).error.code, "plan_not_editable");

    const archivedIdentityEdit = await jsonWrite(
      worker,
      `/api/golfers/${golferWorkspace.golfer.id}`,
      "PUT",
      coachA,
      identityPayload(golferWorkspace.plan.id, 2, "Archived identity change"),
    );
    assert.equal(archivedIdentityEdit.status, 409);
    assert.equal(
      (await archivedIdentityEdit.json()).error.code,
      "golfer_not_editable",
    );

    const archivedPublish = await publishResponse(
      worker,
      coachA,
      golferWorkspace.plan.id,
      2,
      "Archived plan recipient",
    );
    assert.equal(archivedPublish.status, 409);
    assert.equal((await archivedPublish.json()).error.code, "plan_not_publishable");

    const inspection = await worker.inspect([
      {
        sql: "select name, status, is_default, archived_at from coaching_packages where id = ? and account_id = (select id from accounts where normalized_email = ?)",
        params: [packageOne.id, coachA.email],
      },
      {
        sql: "select count(*) as count from coaching_packages where id = ? and account_id = (select id from accounts where normalized_email = ?)",
        params: [packageOne.id, coachB.email],
      },
      {
        sql: "select revision, approved_revision, published_revision, status from development_plans where id = ?",
        params: [packageWorkspace.plan.id],
      },
      {
        sql: "select status, plan_revision, revoke_reason from share_links where plan_id = ? order by created_at",
        params: [packageWorkspace.plan.id],
      },
      {
        sql: "select display_name, preferred_name, contact_email, status, archived_at from golfers where id = ? and account_id = (select id from accounts where normalized_email = ?)",
        params: [golferWorkspace.golfer.id, coachA.email],
      },
      {
        sql: "select count(*) as count from golfers where id = ? and account_id = (select id from accounts where normalized_email = ?)",
        params: [golferWorkspace.golfer.id, coachB.email],
      },
      {
        sql: "select revision, approved_revision, published_revision, status, archived_at from development_plans where id = ?",
        params: [golferWorkspace.plan.id],
      },
      {
        sql: "select status, plan_revision, revoke_reason from share_links where plan_id = ? order by created_at",
        params: [golferWorkspace.plan.id],
      },
      {
        sql: "select action from audit_events where target_id in (?, ?, ?) and action in ('coaching_package.updated', 'coaching_package.archived', 'golfer.identity_updated', 'golfer.archived') order by action",
        params: [packageOne.id, golferWorkspace.golfer.id, golferWorkspace.plan.id],
      },
    ]);

    assert.equal(inspection[0].results.length, 1);
    assert.deepEqual(
      {
        name: inspection[0].results[0].name,
        status: inspection[0].results[0].status,
        is_default: inspection[0].results[0].is_default,
      },
      {
        name: "Flight Window Series — revised",
        status: "archived",
        is_default: 0,
      },
    );
    assert.ok(inspection[0].results[0].archived_at);
    assert.equal(inspection[1].results[0].count, 0);
    assert.deepEqual(inspection[2].results[0], {
      revision: 3,
      approved_revision: null,
      published_revision: null,
      status: "draft",
    });
    assert.deepEqual(inspection[3].results, [
      {
        status: "revoked",
        plan_revision: 1,
        revoke_reason: "linked package updated",
      },
      {
        status: "revoked",
        plan_revision: 2,
        revoke_reason: "linked package archived",
      },
    ]);
    assert.equal(inspection[4].results.length, 1);
    assert.deepEqual(
      {
        display_name: inspection[4].results[0].display_name,
        preferred_name: inspection[4].results[0].preferred_name,
        contact_email: inspection[4].results[0].contact_email,
        status: inspection[4].results[0].status,
      },
      {
        display_name: "Jordan Corrected",
        preferred_name: "Jordan",
        contact_email: "jordan.corrected@example.test",
        status: "archived",
      },
    );
    assert.ok(inspection[4].results[0].archived_at);
    assert.equal(inspection[5].results[0].count, 0);
    assert.equal(inspection[6].results[0].revision, 2);
    assert.equal(inspection[6].results[0].approved_revision, 2);
    assert.equal(inspection[6].results[0].published_revision, 2);
    assert.equal(inspection[6].results[0].status, "archived");
    assert.ok(inspection[6].results[0].archived_at);
    assert.deepEqual(inspection[7].results, [
      {
        status: "revoked",
        plan_revision: 1,
        revoke_reason: "golfer identity revised",
      },
      {
        status: "revoked",
        plan_revision: 2,
        revoke_reason: "golfer archived",
      },
    ]);
    assert.deepEqual(inspection[8].results, [
      { action: "coaching_package.archived" },
      { action: "coaching_package.updated" },
      { action: "golfer.archived" },
      { action: "golfer.identity_updated" },
    ]);
  },
);

async function createProfile(worker, identity) {
  const response = await jsonWrite(worker, "/api/profile", "PUT", identity, {
    displayName: identity.name,
    businessName: "Lifecycle Test Golf",
    professionalTitle: "Golf instructor",
    philosophy: "Synthetic lifecycle verification only.",
    contactEmail: identity.email,
    contactPhone: null,
    websiteUrl: "https://lifecycle.example.ca",
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#176b55",
  });
  assert.equal(response.status, 200);
  await grantSyntheticGolferRecordConsent(worker, identity);
}

async function createPackage(worker, identity, payload) {
  const response = await jsonWrite(
    worker,
    "/api/packages",
    "POST",
    identity,
    payload,
  );
  assert.equal(response.status, 201);
  return (await response.json()).package;
}

async function createGolfer(worker, identity, displayName, packageId) {
  const response = await jsonWrite(
    worker,
    "/api/golfers",
    "POST",
    identity,
    {
      adultEligibilityConfirmed: true,
      displayName,
      email: `${displayName.toLowerCase().replaceAll(" ", ".")}@example.test`,
      planTitle: `${displayName} roadmap`,
      coachingPackageId: packageId,
      goal: {
        statement: "Build a predictable ball-flight window.",
        why: "Choose targets with confidence.",
        context: "Synthetic local lifecycle verification.",
      },
      assessment: {
        summary: "Contact changes when transition speed increases.",
        strengths: "Clear strike awareness.",
        primaryPattern: "Start direction changes as transition speed increases.",
        limitations: "Start direction varies under representative pressure.",
      },
      priority: {
        title: "Stable start direction",
        rationale: "A stable window supports target decisions.",
      },
      phases: [
        {
          number: 1,
          title: "Calibrate",
          purpose: "Establish the baseline window.",
          rationale: "A trustworthy baseline must lead the roadmap.",
          progressSignals: ["The window repeats in a coach-reviewed set."],
        },
        { number: 2, title: "Build", purpose: "Repeat the window with changing clubs." },
        { number: 3, title: "Transfer", purpose: "Use the window for target decisions." },
        { number: 4, title: "Retain", purpose: "Verify the pattern under constraints." },
      ],
    },
  );
  assert.equal(response.status, 201);
  const workspace = await response.json();
  await grantSyntheticRoadmapSharingConsent(
    worker,
    identity,
    workspace.golfer.id,
  );
  return workspace;
}

function packagePayload(title, isDefault = true) {
  return {
    title,
    description: "A synthetic coaching package used only for local lifecycle verification.",
    priceCents: 42_000,
    currency: "CAD",
    terms: "Synthetic local verification; no purchase or communication occurs.",
    inclusions: ["Four private lessons", "Practice review"],
    externalActionUrl: "https://booking.example.ca/lifecycle",
    status: "active",
    isDefault,
  };
}

function identityPayload(planId, revision, displayName) {
  return {
    expectedPlanId: planId,
    expectedPlanRevision: revision,
    displayName,
    preferredName: "Jordan",
    contactEmail: "jordan.corrected@example.test",
  };
}

function planEditPayload(expectedRevision) {
  return {
    expectedRevision,
    title: "Attempted archived plan edit",
    goal: {
      statement: "This edit must not be accepted.",
      why: "Archived plans are read-only.",
      context: "Synthetic lifecycle verification.",
    },
    assessment: {
      summary: "Archived assessment.",
      strengths: "Retained history.",
      primaryPattern: "Retained archived pattern.",
      limitations: "No mutation allowed.",
    },
    priority: {
      title: "Archived priority",
      rationale: "This content must remain unchanged.",
    },
    phases: [1, 2, 3, 4].map((number) => ({
      number,
      title: `Archived phase ${number}`,
      purpose: "This content must not be persisted.",
      rationale: number === 1 ? "Archived first-phase rationale." : null,
      progressSignals: number === 1 ? ["Archived signal."] : [],
    })),
  };
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

async function assertShareAvailable(worker, token) {
  const response = await jsonWrite(worker, "/r/session", "POST", null, {
    token,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.sessionContext, /^[0-9a-f]{64}$/);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.match(cookie ?? "", /^roadmap_share=/);
  return {
    cookie,
    planPath: `/r/plan?context=${body.sessionContext}`,
  };
}

async function assertShareUnavailable(worker, token) {
  const response = await jsonWrite(worker, "/r/session", "POST", null, {
    token,
  });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "plan_unavailable");
}

async function assertCookieUnavailable(worker, session) {
  const response = await worker.dispatch(session.planPath, {
    headers: { accept: "text/html", cookie: session.cookie },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Plan unavailable/);
  assert.doesNotMatch(html, /Jordan Corrected/);
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
