import assert from "node:assert/strict";
import { test } from "node:test";
import {
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "atomic.coach@example.test",
  name: "Coach Atomic",
};

test(
  "revisioned plan, golfer, and publish batches admit one concurrent winner",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    await createProfile(worker);

    const coreWorkspace = await createWorkspace(worker, "Core Race");
    const coreLabels = ["Alpha", "Bravo"];
    const coreResponses = await Promise.all(
      coreLabels.map((label) =>
        jsonWrite(
          worker,
          `/api/plans/${coreWorkspace.plan.id}`,
          "PUT",
          planEditPayload(1, label),
        ),
      ),
    );
    const coreWinner = await assertSingleWinner(coreResponses, coreLabels);

    const identityWorkspace = await createWorkspace(worker, "Identity Race");
    const identityShare = await publish(
      worker,
      identityWorkspace.plan.id,
      1,
      "Identity race recipient",
    );
    const identityLabels = ["Cedar", "Spruce"];
    const identityResponses = await Promise.all(
      identityLabels.map((label) =>
        jsonWrite(
          worker,
          `/api/golfers/${identityWorkspace.golfer.id}`,
          "PUT",
          identityPayload(identityWorkspace.plan.id, 1, label),
        ),
      ),
    );
    const identityWinner = await assertSingleWinner(identityResponses, identityLabels);

    const publishWorkspace = await createWorkspace(worker, "Publish Race");
    const publishLabels = ["First reviewed recipient", "Second reviewed recipient"];
    const publishResponses = await Promise.all(
      publishLabels.map((recipient) =>
        publishResponse(worker, publishWorkspace.plan.id, 1, recipient),
      ),
    );
    const publishStatuses = publishResponses.map((response) => response.status).sort();
    assert.deepEqual(publishStatuses, [201, 409]);
    const successfulPublish = publishResponses.find((response) => response.status === 201);
    const conflictedPublish = publishResponses.find((response) => response.status === 409);
    assert.ok(successfulPublish);
    assert.ok(conflictedPublish);
    assert.equal((await conflictedPublish.json()).error.code, "publish_conflict");
    const publishShare = (await successfulPublish.json()).share;

    const concurrentRevokeReasons = [
      "First concurrent terminal reason",
      "Second concurrent terminal reason",
    ];
    const concurrentRevokes = await Promise.all(
      concurrentRevokeReasons.map((reason) =>
        jsonWrite(worker, `/api/shares/${publishShare.id}`, "DELETE", { reason }),
      ),
    );
    assert.deepEqual(
      concurrentRevokes.map((response) => response.status),
      [204, 204],
    );
    const retryRevoke = await jsonWrite(
      worker,
      `/api/shares/${publishShare.id}`,
      "DELETE",
      { reason: "Retry must not replace terminal reason" },
    );
    assert.equal(retryRevoke.status, 204);

    const inspection = await worker.inspect([
      {
        sql: "select title, revision from development_plans where id = ?",
        params: [coreWorkspace.plan.id],
      },
      {
        sql: "select desired_outcome from golfer_goals where plan_id = ? and status = 'active' and is_primary = 1",
        params: [coreWorkspace.plan.id],
      },
      {
        sql: "select starting_point from assessments where plan_id = ? order by updated_at desc limit 1",
        params: [coreWorkspace.plan.id],
      },
      {
        sql: "select title from plan_priorities where plan_id = ? and status = 'active' and is_current = 1",
        params: [coreWorkspace.plan.id],
      },
      {
        sql: "select title from plan_phases where plan_id = ? order by sequence",
        params: [coreWorkspace.plan.id],
      },
      {
        sql: "select count(*) as count from audit_events where action = 'plan.core_edited' and target_id = ?",
        params: [coreWorkspace.plan.id],
      },
      {
        sql: "select display_name, preferred_name, contact_email from golfers where id = ?",
        params: [identityWorkspace.golfer.id],
      },
      {
        sql: "select revision from development_plans where id = ?",
        params: [identityWorkspace.plan.id],
      },
      {
        sql: "select status, revoke_reason from share_links where id = ?",
        params: [identityShare.id],
      },
      {
        sql: "select count(*) as count from audit_events where action = 'golfer.identity_updated' and target_id = ?",
        params: [identityWorkspace.golfer.id],
      },
      {
        sql: "select status, revoke_reason, revoked_at from share_links where id = ?",
        params: [publishShare.id],
      },
      {
        sql: "select count(*) as count from share_links where plan_id = ?",
        params: [publishWorkspace.plan.id],
      },
      {
        sql: "select count(*) as count from audit_events where action = 'plan.publish_and_share' and target_id = ?",
        params: [publishWorkspace.plan.id],
      },
      {
        sql: "select count(*) as count from audit_events where action = 'share.revoke' and target_id = ?",
        params: [publishShare.id],
      },
    ]);

    assert.deepEqual(inspection[0].results[0], {
      title: `${coreWinner} plan title`,
      revision: 2,
    });
    assert.equal(inspection[1].results[0].desired_outcome, `${coreWinner} goal`);
    assert.equal(inspection[2].results[0].starting_point, `${coreWinner} assessment`);
    assert.equal(inspection[3].results[0].title, `${coreWinner} priority`);
    assert.deepEqual(
      inspection[4].results.map((row) => row.title),
      [1, 2, 3, 4].map((number) => `${coreWinner} phase ${number}`),
    );
    assert.equal(inspection[5].results[0].count, 1);

    assert.deepEqual(inspection[6].results[0], {
      display_name: `${identityWinner} Golfer`,
      preferred_name: identityWinner,
      contact_email: `${identityWinner.toLowerCase()}@example.test`,
    });
    assert.equal(inspection[7].results[0].revision, 2);
    assert.deepEqual(inspection[8].results[0], {
      status: "revoked",
      revoke_reason: "golfer identity revised",
    });
    assert.equal(inspection[9].results[0].count, 1);

    assert.equal(inspection[10].results[0].status, "revoked");
    assert.ok(
      concurrentRevokeReasons.includes(inspection[10].results[0].revoke_reason),
    );
    assert.ok(inspection[10].results[0].revoked_at);
    assert.equal(inspection[11].results[0].count, 1);
    assert.equal(inspection[12].results[0].count, 1);
    assert.equal(inspection[13].results[0].count, 1);
  },
);

async function assertSingleWinner(responses, labels) {
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  const winnerIndex = responses.findIndex((response) => response.status === 200);
  const loser = responses.find((response) => response.status === 409);
  assert.notEqual(winnerIndex, -1);
  assert.ok(loser);
  assert.equal((await loser.json()).error.code, "stale_plan_revision");
  return labels[winnerIndex];
}

async function createProfile(worker) {
  const response = await jsonWrite(worker, "/api/profile", "PUT", {
    displayName: coach.name,
    businessName: "Atomic Test Golf",
    professionalTitle: "Golf instructor",
    philosophy: "Synthetic concurrency verification only.",
    contactEmail: coach.email,
    contactPhone: null,
    websiteUrl: "https://atomic.example.ca",
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#176b55",
  });
  assert.equal(response.status, 200);
}

async function createWorkspace(worker, label) {
  const response = await jsonWrite(worker, "/api/golfers", "POST", {
    adultEligibilityConfirmed: true,
    displayName: `${label} Golfer`,
    email: `${label.toLowerCase().replaceAll(" ", ".")}@example.test`,
    planTitle: `${label} Roadmap`,
    goal: {
      statement: "Build a predictable ball-flight window.",
      why: "Choose targets with confidence.",
      context: "Synthetic local concurrency verification.",
    },
    assessment: {
      summary: "Contact changes when transition speed increases.",
      strengths: "Clear strike awareness.",
      limitations: "Start direction varies under representative pressure.",
    },
    priority: {
      title: "Stable start direction",
      rationale: "A stable window supports target decisions.",
    },
    phases: [1, 2, 3, 4].map((number) => ({
      number,
      title: `Initial phase ${number}`,
      purpose: `Initial purpose ${number}.`,
    })),
  });
  assert.equal(response.status, 201);
  return response.json();
}

function planEditPayload(expectedRevision, label) {
  return {
    expectedRevision,
    title: `${label} plan title`,
    goal: {
      statement: `${label} goal`,
      why: `${label} why`,
      context: `${label} context`,
    },
    assessment: {
      summary: `${label} assessment`,
      strengths: `${label} strengths`,
      limitations: `${label} limitations`,
    },
    priority: {
      title: `${label} priority`,
      rationale: `${label} priority rationale`,
    },
    phases: [1, 2, 3, 4].map((number) => ({
      number,
      title: `${label} phase ${number}`,
      purpose: `${label} phase purpose ${number}`,
    })),
  };
}

function identityPayload(planId, revision, label) {
  return {
    expectedPlanId: planId,
    expectedPlanRevision: revision,
    displayName: `${label} Golfer`,
    preferredName: label,
    contactEmail: `${label.toLowerCase()}@example.test`,
  };
}

async function publish(worker, planId, revision, recipient) {
  const response = await publishResponse(worker, planId, revision, recipient);
  assert.equal(response.status, 201);
  return (await response.json()).share;
}

function publishResponse(worker, planId, revision, recipient) {
  return jsonWrite(worker, `/api/plans/${planId}/publish`, "POST", {
    confirmation: "reviewed_exact_golfer_view",
    expectedRevision: revision,
    intendedRecipientContext: recipient,
    expiresInDays: 7,
  });
}

function jsonWrite(worker, path, method, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}
