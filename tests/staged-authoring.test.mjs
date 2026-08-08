import assert from "node:assert/strict";
import test from "node:test";
import {
  identityHeaders,
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coachA = { email: "coach.a@example.test", name: "Coach Avery" };
const coachB = { email: "coach.b@example.test", name: "Coach Blake" };

test(
  "staged authoring is adult-attested, idempotent, tenant-scoped, resumable, and one-time completable",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const profile = await jsonWrite(worker, "/api/profile", "PUT", coachA, {
      displayName: coachA.name,
      contactEmail: coachA.email,
    });
    assert.equal(profile.status, 200);

    const unattested = await stageGolfer(
      worker,
      "stage-authoring-unattested-0001",
      { ...stagedPayload("Unattested Synthetic"), adultEligibilityConfirmed: false },
    );
    assert.equal(unattested.status, 400);
    assert.equal((await unattested.json()).error.code, "adult_confirmation_required");

    const firstPayload = stagedPayload("Jordan Staged");
    const idempotencyKey = "stage-authoring-retry-key-0001";
    const [firstAttempt, racingRetry] = await Promise.all([
      stageGolfer(worker, idempotencyKey, firstPayload),
      stageGolfer(worker, idempotencyKey, firstPayload),
    ]);
    assert.deepEqual(
      [firstAttempt.status, racingRetry.status].sort((left, right) => left - right),
      [200, 201],
    );
    const firstResult = await firstAttempt.json();
    const retryResult = await racingRetry.json();
    assert.equal(firstResult.golfer.id, retryResult.golfer.id);
    assert.equal(firstResult.plan.id, retryResult.plan.id);
    assert.equal(firstResult.goal.id, retryResult.goal.id);
    assert.equal(firstResult.authoringState, "staged");
    assert.equal(retryResult.authoringState, "staged");
    assert.notEqual(firstResult.idempotentReplay, retryResult.idempotentReplay);

    const keyReuse = await stageGolfer(worker, idempotencyKey, {
      ...firstPayload,
      planTitle: "Different plan title",
    });
    assert.equal(keyReuse.status, 409);
    assert.equal((await keyReuse.json()).error.code, "idempotency_key_reused");

    const stagedCounts = await worker.inspect([
      {
        sql: "select count(*) as count from golfers where id = ? and eligibility_status = 'adult_confirmed'",
        params: [firstResult.golfer.id],
      },
      {
        sql: "select count(*) as count from golfer_goals where plan_id = ?",
        params: [firstResult.plan.id],
      },
      {
        sql: "select count(*) as count from assessments where plan_id = ?",
        params: [firstResult.plan.id],
      },
      {
        sql: "select count(*) as count from plan_priorities where plan_id = ?",
        params: [firstResult.plan.id],
      },
      {
        sql: "select count(*) as count from plan_phases where plan_id = ?",
        params: [firstResult.plan.id],
      },
      {
        sql: "select count(*) as count from audit_events where account_id is not null and action = 'golfer_workspace.staged' and request_id = ?",
        params: [idempotencyKey],
      },
    ]);
    assert.deepEqual(
      stagedCounts.map((result) => result.results[0].count),
      [1, 1, 0, 0, 0, 1],
    );

    const resumePath = `/app/golfers/${firstResult.golfer.id}/complete`;
    const resumePage = await worker.dispatch(resumePath, {
      headers: identityHeaders(coachA.email, coachA.name),
    });
    assert.equal(resumePage.status, 200);
    const resumeHtml = await resumePage.text();
    assert.match(resumeHtml, /Resume staged roadmap/);
    assert.match(resumeHtml, /publication blocked/);
    assert.match(resumeHtml, /Build a truthful synthetic primary goal/);
    assert.match(resumeHtml, /staged-completion-form-error-summary/);

    const golfersPage = await worker.dispatch("/app/golfers", {
      headers: identityHeaders(coachA.email, coachA.name),
    });
    assert.equal(golfersPage.status, 200);
    const golfersHtml = await golfersPage.text();
    assert.match(golfersHtml, new RegExp(`${firstResult.golfer.id}/complete`));
    assert.match(golfersHtml, /setup incomplete/);

    const tenantPage = await worker.dispatch(resumePath, {
      headers: identityHeaders(coachB.email, coachB.name),
    });
    assert.equal(tenantPage.status, 404);
    const tenantCompletion = await completeGolfer(
      worker,
      coachB,
      firstResult.golfer.id,
      firstResult.plan.id,
      1,
      completionPayload(3),
    );
    assert.equal(tenantCompletion.status, 404);
    assert.equal((await tenantCompletion.json()).error.code, "golfer_not_found");

    const blockedPublish = await jsonWrite(
      worker,
      `/api/plans/${firstResult.plan.id}/publish`,
      "POST",
      coachA,
      {
        confirmation: "reviewed_exact_golfer_view",
        expectedRevision: 1,
        intendedRecipientContext: "Synthetic staged golfer",
        expiresInDays: 7,
      },
    );
    assert.equal(blockedPublish.status, 409);
    assert.equal((await blockedPublish.json()).error.code, "plan_not_ready");

    const completedThree = await completeGolfer(
      worker,
      coachA,
      firstResult.golfer.id,
      firstResult.plan.id,
      1,
      completionPayload(3),
    );
    assert.equal(completedThree.status, 200);
    const completedThreeResult = await completedThree.json();
    assert.equal(completedThreeResult.completed, true);
    assert.equal(completedThreeResult.plan.revision, 2);
    assert.equal(completedThreeResult.phases.length, 3);

    const duplicateCompletion = await completeGolfer(
      worker,
      coachA,
      firstResult.golfer.id,
      firstResult.plan.id,
      1,
      completionPayload(3),
    );
    assert.equal(duplicateCompletion.status, 409);
    assert.equal(
      (await duplicateCompletion.json()).error.code,
      "authoring_already_completed",
    );

    const coachingPackageResponse = await jsonWrite(
      worker,
      "/api/packages",
      "POST",
      coachA,
      {
        title: "Staged authoring package",
        description: "A synthetic package that fits the first coaching phase.",
        priceCents: 30_000,
        currency: "CAD",
        terms: "Synthetic local test terms; no booking or payment occurs.",
        inclusions: ["Three private lessons"],
        externalActionUrl: "https://booking.example.ca/staged-authoring",
        status: "active",
      },
    );
    assert.equal(coachingPackageResponse.status, 201);
    const coachingPackage = (await coachingPackageResponse.json()).package;

    const fourthStage = await stageGolfer(
      worker,
      "stage-authoring-four-phase-0002",
      stagedPayload("Morgan Four Phase"),
    );
    assert.equal(fourthStage.status, 201);
    const fourth = await fourthStage.json();
    const fourPhasePayload = completionPayload(4, coachingPackage.id);
    const [fourPhaseFirst, fourPhaseRace] = await Promise.all([
      completeGolfer(
        worker,
        coachA,
        fourth.golfer.id,
        fourth.plan.id,
        1,
        fourPhasePayload,
      ),
      completeGolfer(
        worker,
        coachA,
        fourth.golfer.id,
        fourth.plan.id,
        1,
        fourPhasePayload,
      ),
    ]);
    assert.deepEqual(
      [fourPhaseFirst.status, fourPhaseRace.status].sort((left, right) => left - right),
      [200, 409],
    );
    const fourPhaseBodies = await Promise.all([
      fourPhaseFirst.json(),
      fourPhaseRace.json(),
    ]);
    const winner = fourPhaseBodies.find((body) => body.completed === true);
    const loser = fourPhaseBodies.find((body) => body.error);
    assert.equal(winner.phases.length, 4);
    assert.equal(loser.error.code, "authoring_already_completed");

    const fourPhaseRows = await worker.inspect([
      {
        sql: "select count(*) as count from plan_phases where plan_id = ?",
        params: [fourth.plan.id],
      },
      {
        sql: "select coaching_package_id as packageId from plan_phases where plan_id = ? and sequence = 1",
        params: [fourth.plan.id],
      },
      {
        sql: "select count(*) as count from assessments where plan_id = ?",
        params: [fourth.plan.id],
      },
      {
        sql: "select count(*) as count from plan_priorities where plan_id = ?",
        params: [fourth.plan.id],
      },
    ]);
    assert.equal(fourPhaseRows[0].results[0].count, 4);
    assert.equal(fourPhaseRows[1].results[0].packageId, coachingPackage.id);
    assert.equal(fourPhaseRows[2].results[0].count, 1);
    assert.equal(fourPhaseRows[3].results[0].count, 1);

    const staleStageResponse = await stageGolfer(
      worker,
      "stage-authoring-stale-revision-0003",
      stagedPayload("Taylor Stale Revision"),
    );
    assert.equal(staleStageResponse.status, 201);
    const staleStage = await staleStageResponse.json();
    const identityUpdate = await jsonWrite(
      worker,
      `/api/golfers/${staleStage.golfer.id}`,
      "PUT",
      coachA,
      {
        displayName: "Taylor Revised Identity",
        preferredName: "Taylor",
        contactEmail: "taylor.revised@example.test",
        expectedPlanId: staleStage.plan.id,
        expectedPlanRevision: 1,
      },
    );
    assert.equal(identityUpdate.status, 200);

    const staleCompletion = await completeGolfer(
      worker,
      coachA,
      staleStage.golfer.id,
      staleStage.plan.id,
      1,
      completionPayload(3),
    );
    assert.equal(staleCompletion.status, 409);
    assert.equal((await staleCompletion.json()).error.code, "stale_plan_revision");

    const refreshedCompletion = await completeGolfer(
      worker,
      coachA,
      staleStage.golfer.id,
      staleStage.plan.id,
      2,
      completionPayload(3),
    );
    assert.equal(refreshedCompletion.status, 200);
    assert.equal((await refreshedCompletion.json()).plan.revision, 3);
  },
);

function stagedPayload(displayName) {
  return {
    adultEligibilityConfirmed: true,
    displayName,
    preferredName: "",
    email: `${displayName.toLowerCase().replaceAll(/[^a-z0-9]+/g, ".")}@example.test`,
    planTitle: `${displayName} roadmap`,
    goal: {
      statement: "Build a truthful synthetic primary goal.",
      why: "Keep local verification grounded in authored facts.",
      context: "Synthetic staged-authoring test only.",
    },
  };
}

function completionPayload(phaseCount, firstPhasePackageId = null) {
  return {
    assessment: {
      summary: "A synthetic starting-point summary based on one observed session.",
      strengths: "Awareness of contact feedback is a strength to preserve.",
      primaryPattern: "Contact varies when transition tempo increases.",
      limitations: "One synthetic observation cannot predict on-course outcomes.",
    },
    priority: {
      title: "Centered contact",
      rationale: "A more stable strike pattern supports later directional choices.",
    },
    phases: Array.from({ length: phaseCount }, (_, index) => ({
      number: index + 1,
      title: `Phase ${index + 1}`,
      purpose: `Synthetic authored purpose for phase ${index + 1}.`,
      rationale:
        index === 0
          ? "The first phase establishes an observable base for later choices."
          : null,
      progressSignals:
        index === 0
          ? ["Centered contact appears in three of five constrained attempts."]
          : [],
    })),
    firstPhasePackageId,
  };
}

function stageGolfer(worker, idempotencyKey, body) {
  return worker.dispatch("/api/golfers/staged", {
    method: "POST",
    headers: {
      ...writeHeaders(coachA.email, coachA.name),
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function completeGolfer(
  worker,
  identity,
  golferId,
  planId,
  expectedRevision,
  body,
) {
  return worker.dispatch(`/api/golfers/${golferId}/complete`, {
    method: "POST",
    headers: writeHeaders(identity.email, identity.name),
    body: JSON.stringify({
      expectedPlanId: planId,
      expectedRevision,
      ...body,
    }),
  });
}

function jsonWrite(worker, path, method, identity, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(identity.email, identity.name),
    body: JSON.stringify(body),
  });
}
