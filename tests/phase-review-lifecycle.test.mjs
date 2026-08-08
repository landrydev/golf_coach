import assert from "node:assert/strict";
import { test } from "node:test";
import {
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "phase.review.coach@example.test",
  name: "Coach Phase Review",
};

test(
  "stale and invalid reviews are no-ops before pause atomically invalidates publication",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const workspace = await createWorkspace(worker, "Pause Contract Golfer");
    const phase = workspace.phases[0];
    const share = await publish(worker, workspace.plan.id, 1, "Pause contract recipient");

    const stale = await postReview(
      worker,
      workspace.plan.id,
      reviewPayload(phase.id, 2, "pause", "paused"),
    );
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.code, "stale_plan_revision");

    const invalidCombinations = [
      reviewPayload(phase.id, 1, "continue", "complete"),
      reviewPayload(phase.id, 1, "pause", "partially_complete"),
      reviewPayload(phase.id, 1, "advance", "revised", {
        nextPhaseId: workspace.phases[1].id,
        nextPriorityTitle: "Next priority",
        nextPriorityRationale: "Required direction.",
        nextPhaseRationale: "Required phase rationale.",
      }),
      reviewPayload(phase.id, 1, "complete_plan", "paused"),
      reviewPayload(phase.id, 1, "continue", "revised", {
        nextPhaseId: workspace.phases[1].id,
        nextPriorityTitle: "Unexpected priority",
        nextPriorityRationale: "Must not be accepted.",
      }),
    ];
    for (const payload of invalidCombinations) {
      const invalid = await postReview(worker, workspace.plan.id, payload);
      assert.equal(invalid.status, 400);
      assert.match(
        (await invalid.json()).error.code,
        /^(?:invalid_review_outcome|unexpected_next_phase)$/,
      );
    }
    await assertShareAvailable(worker, share.token);

    const paused = await postReview(
      worker,
      workspace.plan.id,
      reviewPayload(phase.id, 1, "pause", "paused"),
    );
    assert.equal(paused.status, 201);
    assert.deepEqual((await paused.json()).plan, { revision: 2, status: "paused" });
    await assertShareUnavailable(worker, share.token);

    const inspection = await worker.inspect([
      {
        sql: "select revision, status, approved_revision, published_revision, paused_at from development_plans where id = ?",
        params: [workspace.plan.id],
      },
      {
        sql: "select status, is_recommended, paused_at, completed_at from plan_phases where id = ?",
        params: [phase.id],
      },
      {
        sql: "select status, is_current, resolved_at from plan_priorities where plan_id = ? order by sort_order",
        params: [workspace.plan.id],
      },
      {
        sql: "select status, outcome, next_phase_id, recommended_package_id from phase_reviews where plan_id = ? order by created_at",
        params: [workspace.plan.id],
      },
      {
        sql: "select status, plan_revision, revoke_reason from share_links where plan_id = ? order by created_at",
        params: [workspace.plan.id],
      },
      {
        sql: "select count(*) as count from audit_events where action = 'phase_review.transition' and target_id in (select id from phase_reviews where plan_id = ?)",
        params: [workspace.plan.id],
      },
    ]);

    assert.equal(inspection[0].results[0].revision, 2);
    assert.equal(inspection[0].results[0].status, "paused");
    assert.equal(inspection[0].results[0].approved_revision, null);
    assert.equal(inspection[0].results[0].published_revision, null);
    assert.ok(inspection[0].results[0].paused_at);
    assert.equal(inspection[1].results[0].status, "paused");
    assert.equal(inspection[1].results[0].is_recommended, 1);
    assert.ok(inspection[1].results[0].paused_at);
    assert.equal(inspection[1].results[0].completed_at, null);
    assert.deepEqual(inspection[2].results, [
      { status: "deferred", is_current: 0, resolved_at: null },
    ]);
    assert.deepEqual(inspection[3].results, [
      {
        status: "confirmed",
        outcome: "paused",
        next_phase_id: null,
        recommended_package_id: null,
      },
    ]);
    assert.deepEqual(inspection[4].results, [
      {
        status: "revoked",
        plan_revision: 1,
        revoke_reason: "phase review paused",
      },
    ]);
    assert.equal(inspection[5].results[0].count, 1);
  },
);

test(
  "continue resumes a paused phase and priority while superseding its prior review",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const workspace = await createWorkspace(worker, "Continue Contract Golfer");
    const phase = workspace.phases[0];

    const pause = await postReview(
      worker,
      workspace.plan.id,
      reviewPayload(phase.id, 1, "pause", "paused"),
    );
    assert.equal(pause.status, 201);
    assert.deepEqual((await pause.json()).plan, { revision: 2, status: "paused" });

    const pausedShare = await publish(
      worker,
      workspace.plan.id,
      2,
      "Paused phase recipient",
    );
    await assertShareAvailable(worker, pausedShare.token);

    const continued = await postReview(
      worker,
      workspace.plan.id,
      reviewPayload(phase.id, 2, "continue", "revised"),
    );
    assert.equal(continued.status, 201);
    assert.deepEqual((await continued.json()).plan, { revision: 3, status: "draft" });
    await assertShareUnavailable(worker, pausedShare.token);

    const inspection = await worker.inspect([
      {
        sql: "select revision, status, approved_revision, published_revision, paused_at from development_plans where id = ?",
        params: [workspace.plan.id],
      },
      {
        sql: "select status, is_recommended, paused_at, completed_at from plan_phases where id = ?",
        params: [phase.id],
      },
      {
        sql: "select status, is_current, resolved_at from plan_priorities where plan_id = ? order by sort_order",
        params: [workspace.plan.id],
      },
      {
        sql: "select status, outcome from phase_reviews where plan_id = ? order by created_at",
        params: [workspace.plan.id],
      },
      {
        sql: "select status, plan_revision, revoke_reason from share_links where plan_id = ? order by created_at",
        params: [workspace.plan.id],
      },
    ]);

    assert.deepEqual(inspection[0].results[0], {
      revision: 3,
      status: "draft",
      approved_revision: null,
      published_revision: null,
      paused_at: null,
    });
    assert.deepEqual(inspection[1].results[0], {
      status: "active",
      is_recommended: 1,
      paused_at: null,
      completed_at: null,
    });
    assert.deepEqual(inspection[2].results, [
      { status: "active", is_current: 1, resolved_at: null },
    ]);
    assert.deepEqual(inspection[3].results, [
      { status: "superseded", outcome: "paused" },
      { status: "confirmed", outcome: "revised" },
    ]);
    assert.deepEqual(inspection[4].results, [
      {
        status: "revoked",
        plan_revision: 2,
        revoke_reason: "phase review continued",
      },
    ]);
  },
);

test(
  "advance selects only the exact next phase and creates its coach-authored current priority",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const workspace = await createWorkspace(worker, "Advance Contract Golfer");
    const currentPhase = workspace.phases[0];
    const nextPhase = workspace.phases[1];
    const share = await publish(worker, workspace.plan.id, 1, "Advance contract recipient");

    const missingDirection = await postReview(
      worker,
      workspace.plan.id,
      reviewPayload(currentPhase.id, 1, "advance", "complete", {
        nextPhaseId: nextPhase.id,
      }),
    );
    assert.equal(missingDirection.status, 400);
    assert.equal(
      (await missingDirection.json()).error.code,
      "next_phase_direction_required",
    );

    const skippedPhase = await postReview(
      worker,
      workspace.plan.id,
      reviewPayload(currentPhase.id, 1, "advance", "complete", {
        nextPhaseId: workspace.phases[2].id,
        nextPriorityTitle: "Trajectory start window",
        nextPriorityRationale: "Build the next representative pattern.",
        nextPhaseRationale: "Apply the calibrated strike to trajectory.",
      }),
    );
    assert.equal(skippedPhase.status, 409);
    assert.equal((await skippedPhase.json()).error.code, "next_phase_unavailable");
    await assertShareAvailable(worker, share.token);

    const advanced = await postReview(
      worker,
      workspace.plan.id,
      reviewPayload(currentPhase.id, 1, "advance", "complete", {
        nextPhaseId: nextPhase.id,
        nextPriorityTitle: "Trajectory start window",
        nextPriorityRationale: "Build the next representative pattern.",
        nextPhaseRationale: "Apply the calibrated strike to trajectory.",
      }),
    );
    assert.equal(advanced.status, 201);
    assert.deepEqual((await advanced.json()).plan, { revision: 2, status: "draft" });
    await assertShareUnavailable(worker, share.token);

    const inspection = await worker.inspect([
      {
        sql: "select revision, status, approved_revision, published_revision from development_plans where id = ?",
        params: [workspace.plan.id],
      },
      {
        sql: "select id, sequence, status, is_recommended, rationale, coach_approved_at, started_at, completed_at from plan_phases where plan_id = ? order by sequence",
        params: [workspace.plan.id],
      },
      {
        sql: "select id, title, rationale, status, sort_order, is_current, coach_approved_at, resolved_at from plan_priorities where plan_id = ? order by sort_order",
        params: [workspace.plan.id],
      },
      {
        sql: "select pp.phase_id, pp.priority_id, pp.sort_order from phase_priorities pp join plan_priorities p on p.account_id = pp.account_id and p.id = pp.priority_id where p.plan_id = ? order by p.sort_order",
        params: [workspace.plan.id],
      },
      {
        sql: "select status, outcome, phase_id, next_phase_id, recommended_package_id, next_phase_rationale from phase_reviews where plan_id = ?",
        params: [workspace.plan.id],
      },
      {
        sql: "select status, revoke_reason from share_links where plan_id = ?",
        params: [workspace.plan.id],
      },
    ]);

    assert.deepEqual(inspection[0].results[0], {
      revision: 2,
      status: "draft",
      approved_revision: null,
      published_revision: null,
    });
    const phases = inspection[1].results;
    assert.equal(phases.length, 4);
    assert.equal(phases[0].id, currentPhase.id);
    assert.equal(phases[0].status, "complete");
    assert.equal(phases[0].is_recommended, 0);
    assert.ok(phases[0].completed_at);
    assert.equal(phases[1].id, nextPhase.id);
    assert.equal(phases[1].status, "active");
    assert.equal(phases[1].is_recommended, 1);
    assert.equal(
      phases[1].rationale,
      "Apply the calibrated strike to trajectory.",
    );
    assert.ok(phases[1].coach_approved_at);
    assert.ok(phases[1].started_at);
    assert.deepEqual(
      phases.slice(2).map(({ sequence, status, is_recommended }) => ({
        sequence,
        status,
        is_recommended,
      })),
      [
        { sequence: 3, status: "planned", is_recommended: 0 },
        { sequence: 4, status: "planned", is_recommended: 0 },
      ],
    );

    const priorities = inspection[2].results;
    assert.equal(priorities.length, 2);
    assert.equal(priorities[0].status, "resolved");
    assert.equal(priorities[0].is_current, 0);
    assert.ok(priorities[0].resolved_at);
    assert.equal(priorities[1].title, "Trajectory start window");
    assert.equal(
      priorities[1].rationale,
      "Build the next representative pattern.",
    );
    assert.equal(priorities[1].status, "active");
    assert.equal(priorities[1].sort_order, 1);
    assert.equal(priorities[1].is_current, 1);
    assert.ok(priorities[1].coach_approved_at);
    assert.equal(priorities[1].resolved_at, null);
    assert.deepEqual(inspection[3].results, [
      { phase_id: currentPhase.id, priority_id: priorities[0].id, sort_order: 0 },
      { phase_id: nextPhase.id, priority_id: priorities[1].id, sort_order: 0 },
    ]);
    assert.deepEqual(inspection[4].results, [
      {
        status: "confirmed",
        outcome: "complete",
        phase_id: currentPhase.id,
        next_phase_id: nextPhase.id,
        recommended_package_id: null,
        next_phase_rationale: "Apply the calibrated strike to trajectory.",
      },
    ]);
    assert.deepEqual(inspection[5].results, [
      { status: "revoked", revoke_reason: "phase advanced" },
    ]);
  },
);

test(
  "complete_plan cancels future phases and its final completed revision remains shareable",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const workspace = await createWorkspace(worker, "Completion Contract Golfer");
    const currentPhase = workspace.phases[0];
    const initialShare = await publish(
      worker,
      workspace.plan.id,
      1,
      "Completion contract recipient",
    );

    const completed = await postReview(
      worker,
      workspace.plan.id,
      reviewPayload(currentPhase.id, 1, "complete_plan", "complete"),
    );
    assert.equal(completed.status, 201);
    assert.deepEqual((await completed.json()).plan, {
      revision: 2,
      status: "completed",
    });
    await assertShareUnavailable(worker, initialShare.token);

    const finalShare = await publish(
      worker,
      workspace.plan.id,
      2,
      "Final completed roadmap recipient",
    );
    const finalCookie = await assertShareAvailable(worker, finalShare.token);
    const finalPlan = await worker.dispatch("/r/plan", {
      headers: { accept: "text/html", cookie: finalCookie },
    });
    assert.equal(finalPlan.status, 200);
    const finalPlanHtml = await finalPlan.text();
    assert.match(finalPlanHtml, /Completion Contract Golfer/);

    const postCompletionMutation = await postReview(
      worker,
      workspace.plan.id,
      reviewPayload(currentPhase.id, 2, "continue", "revised"),
    );
    assert.equal(postCompletionMutation.status, 409);
    assert.equal(
      (await postCompletionMutation.json()).error.code,
      "plan_not_editable",
    );
    await assertShareAvailable(worker, finalShare.token);

    const inspection = await worker.inspect([
      {
        sql: "select revision, status, approved_revision, published_revision, completed_at from development_plans where id = ?",
        params: [workspace.plan.id],
      },
      {
        sql: "select sequence, status, is_recommended, completed_at, canceled_at from plan_phases where plan_id = ? order by sequence",
        params: [workspace.plan.id],
      },
      {
        sql: "select status, is_current, resolved_at from plan_priorities where plan_id = ? order by sort_order",
        params: [workspace.plan.id],
      },
      {
        sql: "select status, outcome, next_phase_id, recommended_package_id from phase_reviews where plan_id = ?",
        params: [workspace.plan.id],
      },
      {
        sql: "select status, plan_revision, revoke_reason from share_links where plan_id = ? order by created_at",
        params: [workspace.plan.id],
      },
    ]);

    assert.equal(inspection[0].results[0].revision, 2);
    assert.equal(inspection[0].results[0].status, "completed");
    assert.equal(inspection[0].results[0].approved_revision, 2);
    assert.equal(inspection[0].results[0].published_revision, 2);
    assert.ok(inspection[0].results[0].completed_at);
    const phases = inspection[1].results;
    assert.equal(phases[0].status, "complete");
    assert.equal(phases[0].is_recommended, 0);
    assert.ok(phases[0].completed_at);
    assert.equal(phases[0].canceled_at, null);
    assert.deepEqual(
      phases.slice(1).map(({ sequence, status, is_recommended }) => ({
        sequence,
        status,
        is_recommended,
      })),
      [
        { sequence: 2, status: "canceled", is_recommended: 0 },
        { sequence: 3, status: "canceled", is_recommended: 0 },
        { sequence: 4, status: "canceled", is_recommended: 0 },
      ],
    );
    for (const phase of phases.slice(1)) assert.ok(phase.canceled_at);
    assert.equal(inspection[2].results[0].status, "resolved");
    assert.equal(inspection[2].results[0].is_current, 0);
    assert.ok(inspection[2].results[0].resolved_at);
    assert.deepEqual(inspection[3].results, [
      {
        status: "confirmed",
        outcome: "complete",
        next_phase_id: null,
        recommended_package_id: null,
      },
    ]);
    assert.deepEqual(inspection[4].results, [
      {
        status: "revoked",
        plan_revision: 1,
        revoke_reason: "plan completed",
      },
      { status: "active", plan_revision: 2, revoke_reason: null },
    ]);
  },
);

async function createWorkspace(worker, golferName) {
  const profile = await jsonWrite(worker, "/api/profile", "PUT", {
    displayName: coach.name,
    businessName: "Phase Review Test Golf",
    professionalTitle: "Golf instructor",
    philosophy: "Synthetic phase-transition verification only.",
    contactEmail: coach.email,
    contactPhone: null,
    websiteUrl: "https://phase-review.example.test",
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#176b55",
  });
  assert.equal(profile.status, 200);

  const response = await jsonWrite(worker, "/api/golfers", "POST", {
    adultEligibilityConfirmed: true,
    displayName: golferName,
    planTitle: `${golferName} roadmap`,
    goal: {
      statement: "Build a reliable target window.",
      why: "Make decisions with representative evidence.",
      context: "Synthetic local D1 transition verification.",
    },
    assessment: {
      summary: "Start direction varies under changing constraints.",
      strengths: "Clear strike awareness.",
      limitations: "The pattern is not yet reliable on course.",
    },
    priority: {
      title: "Stable start window",
      rationale: "A stable window supports the next phase decision.",
    },
    phases: [
      { number: 1, title: "Calibrate", purpose: "Establish the starting window." },
      { number: 2, title: "Build", purpose: "Repeat the pattern across clubs." },
      { number: 3, title: "Transfer", purpose: "Use the pattern for target decisions." },
      { number: 4, title: "Retain", purpose: "Verify the pattern under constraints." },
    ],
  });
  assert.equal(response.status, 201);
  return response.json();
}

function reviewPayload(phaseId, expectedRevision, transition, outcome, overrides = {}) {
  return {
    kind: "review",
    phaseId,
    expectedRevision,
    transition,
    outcome,
    originalPurpose: "Establish the current phase purpose.",
    baselineSummary: "The synthetic baseline showed variable start direction.",
    workCompleted: "The golfer completed representative constrained practice.",
    changeSummary: "The observed window became more predictable.",
    reliabilityLabel: "Repeated in synthetic practice evidence",
    limitations: "No real-world or on-course validation is claimed.",
    golferContribution: "The golfer reported increased clarity.",
    coachConclusion: "The transition follows the recorded synthetic evidence.",
    remainingOpportunity: "Validate the decision under broader constraints.",
    independentPracticeAlternative: "Continue the documented practice safely.",
    ...overrides,
  };
}

function postReview(worker, planId, payload) {
  return jsonWrite(worker, `/api/plans/${planId}/content`, "POST", payload);
}

async function publish(worker, planId, revision, recipient) {
  const response = await jsonWrite(
    worker,
    `/api/plans/${planId}/publish`,
    "POST",
    {
      confirmation: "reviewed_exact_golfer_view",
      expectedRevision: revision,
      intendedRecipientContext: recipient,
      expiresInDays: 7,
    },
  );
  assert.equal(response.status, 201);
  const share = (await response.json()).share;
  const token = new URLSearchParams(new URL(share.url).hash.slice(1)).get("token");
  assert.ok(token);
  return { ...share, token };
}

async function assertShareAvailable(worker, token) {
  const response = await jsonWrite(worker, "/api/share/session", "POST", { token });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.match(cookie ?? "", /^roadmap_share=/);
  return cookie;
}

async function assertShareUnavailable(worker, token) {
  const response = await jsonWrite(worker, "/api/share/session", "POST", { token });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "plan_unavailable");
}

function jsonWrite(worker, path, method, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}
