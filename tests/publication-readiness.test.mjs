import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPublicationReady,
  publicationBlockers,
} from "../lib/publication-readiness.ts";
import {
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "coach.a@example.test",
  name: "Publication Readiness Coach",
};

function completeModel() {
  return {
    coach: { displayName: "Coach Avery" },
    golfer: { displayName: "Jordan" },
    plan: {
      id: "plan_1",
      title: "Jordan's roadmap",
      status: "draft",
      revision: 1,
      updatedAt: Date.now(),
    },
    goal: { statement: "Play with a repeatable start line" },
    assessment: {
      summary: "Observed strike and start-line variability.",
      strengths: "Clear awareness of strike feedback.",
      primaryPattern: "Face delivery varies when tempo accelerates.",
      limitations: "One indoor assessment; on-course transfer is not established.",
    },
    priority: {
      title: "Start-line control",
      rationale: "This is the narrowest observed barrier to the stated goal.",
    },
    phases: [1, 2, 3].map((number) => ({
      id: `phase_${number}`,
      number,
      title: `Phase ${number}`,
      purpose: `Directional purpose ${number}`,
      rationale: number === 1 ? "Establish a trustworthy baseline first." : null,
      progressSignals: number === 1 ? ["Start line is repeated in a coach-reviewed set."] : [],
      status: number === 1 ? "active" : "planned",
    })),
    lessons: [],
    practiceItems: [],
    evidenceItems: [],
    phaseReview: null,
    coachingPackage: {
      title: "Four-lesson block",
      description: "Fits the current priority without promising an outcome.",
      priceCents: 48000,
      currency: "CAD",
      terms: "Four sessions; rescheduling follows the coach's current policy.",
      inclusions: ["Four individual lessons", "Written practice direction"],
      externalActionUrl: "https://coach.example.ca/book",
    },
  };
}

test("complete three- and four-phase roadmap candidates are publishable", () => {
  const threePhase = completeModel();
  assert.deepEqual(publicationBlockers(threePhase), []);
  assert.doesNotThrow(() => assertPublicationReady(threePhase));

  const fourPhase = completeModel();
  fourPhase.phases.push({
    id: "phase_4",
    number: 4,
    title: "Phase 4",
    purpose: "Directional purpose 4",
    rationale: null,
    progressSignals: [],
    status: "planned",
  });
  assert.deepEqual(publicationBlockers(fourPhase), []);
});

test("publication readiness reports material content and external-action blockers", () => {
  const model = completeModel();
  model.assessment.strengths = "";
  model.assessment.primaryPattern = "";
  model.phases[0].rationale = null;
  model.phases[0].progressSignals = [];
  model.coachingPackage.inclusions = [];
  model.coachingPackage.externalActionUrl = "http://coach.example.test/book";

  assert.deepEqual(
    publicationBlockers(model).map((blocker) => blocker.code),
    [
      "assessment_strength",
      "assessment_pattern",
      "first_phase_rationale",
      "first_phase_signals",
      "package_inclusions",
      "package_action",
    ],
  );
  assert.throws(
    () => assertPublicationReady(model),
    (error) => error?.status === 409 && error?.code === "plan_not_ready",
  );
});

test("an intentional no-package state remains publishable", () => {
  const model = completeModel();
  model.coachingPackage = null;
  assert.deepEqual(publicationBlockers(model), []);
});

test(
  "server publication fails closed for missing limitations and non-public stored package URLs",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const profile = await writeJson(
      worker,
      "/api/profile",
      {
        displayName: coach.name,
        businessName: "Publication Readiness Golf",
        contactEmail: coach.email,
      },
      "PUT",
    );
    assert.equal(profile.status, 200);

    const packageResponse = await writeJson(worker, "/api/packages", {
      title: "Publication readiness series",
      description: "A synthetic package used only for publication guard verification.",
      priceCents: 48_000,
      currency: "CAD",
      terms: "Four synthetic sessions; no booking or payment occurs.",
      inclusions: ["Four individual lessons"],
      externalActionUrl: "https://coach.example.ca/book",
      status: "active",
    });
    assert.equal(packageResponse.status, 201);
    const coachingPackage = (await packageResponse.json()).package;
    assert.ok(coachingPackage?.id);

    const golferResponse = await writeJson(worker, "/api/golfers", {
      adultEligibilityConfirmed: true,
      displayName: "Jordan Publication Guard",
      planTitle: "Publication guard roadmap",
      firstPhasePackageId: coachingPackage.id,
      goal: {
        statement: "Build a predictable contact window.",
        why: "Choose targets with a clearer observed pattern.",
        context: "Synthetic publication-readiness verification only.",
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
    });
    assert.equal(golferResponse.status, 201);
    const workspace = await golferResponse.json();

    await worker.inspect([
      {
        sql: "update assessments set limitations = null where plan_id = ?",
        params: [workspace.plan.id],
      },
    ]);
    const missingLimitations = await publish(worker, workspace.plan.id);
    assert.equal(missingLimitations.status, 409);
    const missingLimitationsError = await missingLimitations.json();
    assert.equal(missingLimitationsError.error.code, "plan_not_ready");
    assert.match(missingLimitationsError.error.message, /evidence limits/i);

    await worker.inspect([
      {
        sql: "update assessments set limitations = ? where plan_id = ?",
        params: [
          "One synthetic sample cannot establish on-course transfer.",
          workspace.plan.id,
        ],
      },
    ]);

    for (const unsafeUrl of [
      "https://localhost/book",
      "https://10.0.0.1/book",
      "https://coach.example/book",
    ]) {
      await worker.inspect([
        {
          sql: "update coaching_packages set external_action_url = ? where id = ?",
          params: [unsafeUrl, coachingPackage.id],
        },
      ]);
      const unsafePackage = await publish(worker, workspace.plan.id);
      assert.equal(unsafePackage.status, 409, unsafeUrl);
      const unsafePackageError = await unsafePackage.json();
      assert.equal(unsafePackageError.error.code, "plan_not_ready", unsafeUrl);
      assert.match(unsafePackageError.error.message, /external package action/i);
    }

    await worker.inspect([
      {
        sql: "update coaching_packages set external_action_url = ? where id = ?",
        params: ["https://coach.example.ca/book", coachingPackage.id],
      },
    ]);
    const validPublication = await publish(worker, workspace.plan.id);
    assert.equal(validPublication.status, 201);
  },
);

function publish(worker, planId) {
  return writeJson(worker, `/api/plans/${planId}/publish`, {
    confirmation: "reviewed_exact_golfer_view",
    expectedRevision: 1,
    intendedRecipientContext: "Synthetic publication-readiness recipient",
    expiresInDays: 7,
  });
}

function writeJson(worker, path, body, method = "POST") {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}
