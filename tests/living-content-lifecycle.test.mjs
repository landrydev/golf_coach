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
  "living plan content can be replaced or withdrawn with tenant and revision fences",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    for (const identity of [coachA, coachB]) {
      const profile = await jsonWrite(worker, "/api/profile", "PUT", identity, {
        displayName: identity.name,
        contactEmail: identity.email,
      });
      assert.equal(profile.status, 200);
    }

    const workspaceResponse = await jsonWrite(
      worker,
      "/api/golfers",
      "POST",
      coachA,
      golferPayload(),
    );
    assert.equal(workspaceResponse.status, 201);
    const workspace = await workspaceResponse.json();
    const phaseId = workspace.phases[0].id;

    const lesson = await addContent(worker, workspace.plan.id, coachA, {
      kind: "lesson",
      phaseId,
      expectedRevision: 1,
      title: "Contact calibration lesson",
      purpose: "Review the observable strike pattern without promising an outcome.",
      coachObservation: "Strike location varied as tempo increased.",
      takeaway: "Use a constrained tempo while collecting more evidence.",
      nextCheck: "Review five representative attempts next session.",
      phaseConnection: "This supports the current contact phase.",
      occurredAt: "2026-08-01",
    });
    assert.equal(lesson.status, 201);
    const lessonBody = await lesson.json();
    assert.equal(lessonBody.plan.revision, 2);

    const firstPractice = await addContent(worker, workspace.plan.id, coachA, {
      ...practicePayload("First practice direction"),
      phaseId,
      expectedRevision: 2,
    });
    assert.equal(firstPractice.status, 201);
    const firstPracticeBody = await firstPractice.json();

    const replacementPractice = await addContent(
      worker,
      workspace.plan.id,
      coachA,
      {
        ...practicePayload("Replacement practice direction"),
        phaseId,
        expectedRevision: 3,
      },
    );
    assert.equal(replacementPractice.status, 201);
    const replacementPracticeBody = await replacementPractice.json();

    const evidence = await addContent(worker, workspace.plan.id, coachA, {
      kind: "evidence",
      phaseId,
      expectedRevision: 4,
      evidenceType: "coach_observation",
      contextType: "practice",
      title: "Early strike-location evidence",
      claim: "Three constrained attempts finished near the intended strike window.",
      sourceLabel: "Synthetic coach observation",
      sourceType: "coach_observed",
      observedAt: "2026-08-02",
      interpretation: "This is an early indication worth checking again.",
      limitation: "The sample is too small and controlled to generalize to play.",
      maturity: "single_observation",
      nextEvidenceNeeded: "Repeat under a representative target constraint.",
    });
    assert.equal(evidence.status, 201);
    const evidenceBody = await evidence.json();
    assert.equal(evidenceBody.plan.revision, 5);

    const practiceState = await worker.inspect([
      {
        sql: "select id, status, retired_at as retiredAt from practice_items where plan_id = ? order by created_at",
        params: [workspace.plan.id],
      },
      {
        sql: `select action, target_id as targetId, request_id as requestId,
                    metadata, occurred_at as occurredAt
               from audit_events
              where action in ('practice.create', 'practice.retire')
                and target_id in (?, ?)
              order by occurred_at, rowid`,
        params: [firstPracticeBody.item.id, replacementPracticeBody.item.id],
      },
    ]);
    assert.equal(practiceState[0].results[0].id, firstPracticeBody.item.id);
    assert.equal(practiceState[0].results[0].status, "retired");
    assert.ok(practiceState[0].results[0].retiredAt);
    assert.equal(practiceState[0].results[1].id, replacementPracticeBody.item.id);
    assert.equal(practiceState[0].results[1].status, "active");

    const replacementRetirement = practiceState[1].results.find(
      ({ action }) => action === "practice.retire",
    );
    const replacementCreation = practiceState[1].results.find(
      ({ action, targetId }) =>
        action === "practice.create" && targetId === replacementPracticeBody.item.id,
    );
    assert.ok(replacementRetirement);
    assert.ok(replacementCreation);
    assert.equal(replacementRetirement.targetId, firstPracticeBody.item.id);
    assert.equal(replacementRetirement.requestId, replacementCreation.requestId);
    assert.equal(replacementRetirement.occurredAt, replacementCreation.occurredAt);
    assert.deepEqual(JSON.parse(replacementRetirement.metadata), {
      reason: "replaced_by_new_practice",
      relationship: "retired_target_replaced_by_practice_item",
      replacementPracticeItemId: replacementPracticeBody.item.id,
    });
    assert.doesNotMatch(
      JSON.stringify(replacementRetirement),
      /First practice direction|Replacement practice direction|coach\.a@example\.test/i,
    );

    const populatedPage = await worker.dispatch(
      `/app/golfers/${workspace.golfer.id}`,
      { headers: identityHeaders(coachA.email, coachA.name) },
    );
    assert.equal(populatedPage.status, 200);
    const populatedHtml = await populatedPage.text();
    assert.match(populatedHtml, /Correct or withdraw existing golfer-view content/);
    assert.doesNotMatch(populatedHtml, /First practice direction/);
    assert.match(populatedHtml, /Replacement practice direction/);
    assert.match(populatedHtml, /Early strike-location evidence/);

    const crossTenant = await withdrawContent(
      worker,
      workspace.plan.id,
      coachB,
      "lesson",
      lessonBody.item.id,
      5,
    );
    assert.equal(crossTenant.status, 404);
    assert.equal((await crossTenant.json()).error.code, "plan_not_found");

    const stale = await withdrawContent(
      worker,
      workspace.plan.id,
      coachA,
      "lesson",
      lessonBody.item.id,
      4,
    );
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.code, "stale_plan_revision");

    const archivedLesson = await withdrawContent(
      worker,
      workspace.plan.id,
      coachA,
      "lesson",
      lessonBody.item.id,
      5,
    );
    assert.equal(archivedLesson.status, 200);
    assert.equal((await archivedLesson.json()).plan.revision, 6);

    const withdrawnEvidence = await withdrawContent(
      worker,
      workspace.plan.id,
      coachA,
      "evidence",
      evidenceBody.item.id,
      6,
    );
    assert.equal(withdrawnEvidence.status, 200);

    const retiredPractice = await withdrawContent(
      worker,
      workspace.plan.id,
      coachA,
      "practice",
      replacementPracticeBody.item.id,
      7,
    );
    assert.equal(retiredPractice.status, 200);
    assert.equal((await retiredPractice.json()).plan.revision, 8);

    const repeatedRetirement = await withdrawContent(
      worker,
      workspace.plan.id,
      coachA,
      "practice",
      replacementPracticeBody.item.id,
      8,
    );
    assert.equal(repeatedRetirement.status, 409);
    assert.equal(
      (await repeatedRetirement.json()).error.code,
      "plan_content_already_withdrawn",
    );

    const finalState = await worker.inspect([
      {
        sql: "select status, archived_at as archivedAt from lessons where id = ?",
        params: [lessonBody.item.id],
      },
      {
        sql: "select status, retired_at as retiredAt from practice_items where id = ?",
        params: [replacementPracticeBody.item.id],
      },
      {
        sql: "select status, withdrawn_at as withdrawnAt from evidence_items where id = ?",
        params: [evidenceBody.item.id],
      },
      {
        sql: "select revision, status from development_plans where id = ?",
        params: [workspace.plan.id],
      },
      {
        sql: "select action from audit_events where target_id in (?, ?, ?) and action in ('lesson.archive', 'practice.retire', 'evidence.withdraw') order by action",
        params: [
          lessonBody.item.id,
          replacementPracticeBody.item.id,
          evidenceBody.item.id,
        ],
      },
    ]);
    assert.equal(finalState[0].results[0].status, "archived");
    assert.ok(finalState[0].results[0].archivedAt);
    assert.equal(finalState[1].results[0].status, "retired");
    assert.ok(finalState[1].results[0].retiredAt);
    assert.equal(finalState[2].results[0].status, "withdrawn");
    assert.ok(finalState[2].results[0].withdrawnAt);
    assert.deepEqual(finalState[3].results[0], { revision: 8, status: "draft" });
    assert.deepEqual(
      finalState[4].results.map(({ action }) => action),
      ["evidence.withdraw", "lesson.archive", "practice.retire"],
    );

    const finalPage = await worker.dispatch(`/app/golfers/${workspace.golfer.id}`, {
      headers: identityHeaders(coachA.email, coachA.name),
    });
    const finalHtml = await finalPage.text();
    assert.doesNotMatch(finalHtml, /Contact calibration lesson/);
    assert.doesNotMatch(finalHtml, /Replacement practice direction/);
    assert.doesNotMatch(finalHtml, /Early strike-location evidence/);
  },
);

test(
  "practice replacement audits are atomic across concurrent and stale retries",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const profile = await jsonWrite(worker, "/api/profile", "PUT", coachA, {
      displayName: coachA.name,
      contactEmail: coachA.email,
    });
    assert.equal(profile.status, 200);

    const workspaceResponse = await jsonWrite(
      worker,
      "/api/golfers",
      "POST",
      coachA,
      golferPayload(),
    );
    assert.equal(workspaceResponse.status, 201);
    const workspace = await workspaceResponse.json();
    const phaseId = workspace.phases[0].id;

    const firstPractice = await addContent(worker, workspace.plan.id, coachA, {
      ...practicePayload("Initial concurrency practice"),
      phaseId,
      expectedRevision: 1,
    });
    assert.equal(firstPractice.status, 201);
    const firstPracticeBody = await firstPractice.json();

    const candidates = [
      practicePayload("Concurrent replacement alpha"),
      practicePayload("Concurrent replacement beta"),
    ];
    const responses = await Promise.all(
      candidates.map((candidate) =>
        addContent(worker, workspace.plan.id, coachA, {
          ...candidate,
          phaseId,
          expectedRevision: 2,
        }),
      ),
    );
    assert.deepEqual(
      responses.map(({ status }) => status).sort((left, right) => left - right),
      [201, 409],
    );
    const winnerIndex = responses.findIndex(({ status }) => status === 201);
    const loser = responses.find(({ status }) => status === 409);
    assert.notEqual(winnerIndex, -1);
    assert.ok(loser);
    const winner = await responses[winnerIndex].json();
    assert.equal((await loser.json()).error.code, "stale_plan_revision");

    const staleRetry = await addContent(worker, workspace.plan.id, coachA, {
      ...candidates[winnerIndex],
      phaseId,
      expectedRevision: 2,
    });
    assert.equal(staleRetry.status, 409);
    assert.equal((await staleRetry.json()).error.code, "stale_plan_revision");

    const state = await worker.inspect([
      {
        sql: "select id, title, status from practice_items where plan_id = ? order by created_at, id",
        params: [workspace.plan.id],
      },
      {
        sql: `select action, target_id as targetId, request_id as requestId,
                    metadata, occurred_at as occurredAt
               from audit_events
              where action in ('practice.create', 'practice.retire')
                and target_id in (?, ?)
              order by occurred_at, rowid`,
        params: [firstPracticeBody.item.id, winner.item.id],
      },
      {
        sql: "select revision from development_plans where id = ?",
        params: [workspace.plan.id],
      },
    ]);

    assert.equal(state[0].results.length, 2);
    assert.deepEqual(
      state[0].results.map(({ status }) => status).sort(),
      ["active", "retired"],
    );
    assert.equal(
      state[0].results.find(({ status }) => status === "retired").id,
      firstPracticeBody.item.id,
    );
    assert.equal(
      state[0].results.find(({ status }) => status === "active").id,
      winner.item.id,
    );
    assert.equal(state[2].results[0].revision, 3);

    const retirements = state[1].results.filter(
      ({ action }) => action === "practice.retire",
    );
    const creations = state[1].results.filter(
      ({ action }) => action === "practice.create",
    );
    assert.equal(retirements.length, 1);
    assert.equal(creations.length, 2);
    const replacementCreation = creations.find(
      ({ targetId }) => targetId === winner.item.id,
    );
    assert.ok(replacementCreation);
    assert.equal(retirements[0].targetId, firstPracticeBody.item.id);
    assert.equal(retirements[0].requestId, replacementCreation.requestId);
    assert.equal(retirements[0].occurredAt, replacementCreation.occurredAt);
    assert.deepEqual(JSON.parse(retirements[0].metadata), {
      reason: "replaced_by_new_practice",
      relationship: "retired_target_replaced_by_practice_item",
      replacementPracticeItemId: winner.item.id,
    });
    assert.doesNotMatch(
      JSON.stringify(retirements),
      /Initial concurrency practice|Concurrent replacement|coach\.a@example\.test/i,
    );
  },
);

function addContent(worker, planId, identity, body) {
  return jsonWrite(worker, `/api/plans/${planId}/content`, "POST", identity, body);
}

function withdrawContent(worker, planId, identity, kind, itemId, expectedRevision) {
  return jsonWrite(worker, `/api/plans/${planId}/content`, "DELETE", identity, {
    kind,
    itemId,
    expectedRevision,
    confirmation: "withdraw_plan_content",
  });
}

function jsonWrite(worker, path, method, identity, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(identity.email, identity.name),
    body: JSON.stringify(body),
  });
}

function practicePayload(title) {
  return {
    kind: "practice",
    title,
    objective: "Collect a small repeatable contact sample.",
    rationale: "The current evidence supports a constrained contact task.",
    instructions: "Choose one target\nMake five constrained attempts\nRecord strike location",
    timeOrCadence: "Ten minutes, twice before the next review",
    successCheck: "At least three attempts finish near the intended strike window.",
    commonMistake: "Increasing speed before recording the baseline.",
    stopOrAskRule: "Stop if discomfort appears or the task is unclear.",
    constraintNote: "This is practice direction, not an outcome promise.",
  };
}

function golferPayload() {
  return {
    adultEligibilityConfirmed: true,
    displayName: "Jordan Living Content",
    email: "jordan.living@example.test",
    planTitle: "Jordan living roadmap",
    goal: {
      statement: "Build a more predictable contact pattern.",
      why: "Make decisions from repeatable evidence.",
      context: "Synthetic lifecycle verification only.",
    },
    assessment: {
      summary: "Contact varies as transition tempo increases.",
      strengths: "The golfer notices strike-location feedback.",
      primaryPattern: "Strike moves away from centre at higher tempo.",
      limitations: "One observation cannot predict playing outcomes.",
    },
    priority: {
      title: "Centred contact",
      rationale: "A stable strike pattern supports later choices.",
    },
    phases: Array.from({ length: 3 }, (_, index) => ({
      number: index + 1,
      title: `Phase ${index + 1}`,
      purpose: `Synthetic purpose for phase ${index + 1}.`,
      rationale: index === 0 ? "This establishes an observable base." : null,
      progressSignals:
        index === 0
          ? ["Centred contact appears in three of five constrained attempts."]
          : [],
    })),
  };
}
