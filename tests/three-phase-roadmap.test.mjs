import assert from "node:assert/strict";
import test from "node:test";
import {
  grantSyntheticGolferRecordConsent,
  grantSyntheticRoadmapSharingConsent,
  identityHeaders,
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "coach.a@example.test",
  name: "Coach Three Phase",
};

test(
  "a three-phase roadmap can be created, edited, published, advanced, and completed",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const profile = await worker.dispatch("/api/profile", {
      method: "PUT",
      headers: writeHeaders(coach.email, coach.name),
      body: JSON.stringify({
        displayName: coach.name,
        businessName: "Three Phase Golf",
        contactEmail: coach.email,
      }),
    });
    assert.equal(profile.status, 200);
    await grantSyntheticGolferRecordConsent(worker, coach);

    const create = await worker.dispatch("/api/golfers", {
      method: "POST",
      headers: writeHeaders(coach.email, coach.name),
      body: JSON.stringify({
        adultEligibilityConfirmed: true,
        displayName: "Jordan Three Phase",
        planTitle: "Three-phase contact roadmap",
        goal: {
          statement: "Build a predictable contact window.",
          why: "Choose targets without guarding against two misses.",
        },
        assessment: {
          summary: "Strike location varies as transition tempo rises.",
          strengths: "Clear awareness of contact feedback.",
          primaryPattern: "Heel contact appears at faster transition tempos.",
          limitations: "One synthetic indoor sample does not establish on-course transfer.",
        },
        priority: {
          title: "Centered contact at playing tempo",
          rationale: "This is the narrowest observed barrier to the stated goal.",
        },
        phases: [
          {
            number: 1,
            title: "Calibrate contact",
            purpose: "Establish the current strike window.",
            rationale: "A trustworthy strike baseline must lead the roadmap.",
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
      }),
    });
    assert.equal(create.status, 201);
    const workspace = await create.json();
    await grantSyntheticRoadmapSharingConsent(worker, coach, workspace.golfer.id);
    assert.equal(workspace.phases.length, 3);

    const edit = await worker.dispatch(`/api/plans/${workspace.plan.id}`, {
      method: "PUT",
      headers: writeHeaders(coach.email, coach.name),
      body: JSON.stringify({
        expectedRevision: 1,
        title: "Reviewed three-phase contact roadmap",
        goal: {
          statement: "Build a predictable contact window through an ordinary round.",
          why: "Choose targets with a clear pattern.",
          context: "Synthetic three-phase verification only.",
        },
        assessment: {
          summary: "Heel contact appears as transition tempo rises.",
          strengths: "Clear strike awareness and stable setup.",
          primaryPattern: "Heel contact correlates with faster transition tempo in this sample.",
          limitations: "The sample remains synthetic and does not prove on-course transfer.",
        },
        priority: {
          title: "Centered contact at playing tempo",
          rationale: "The observed contact pattern remains the first barrier.",
        },
        phases: [1, 2, 3].map((number) => ({
          number,
          title: ["Own contact", "Transfer to targets", "Retain under constraints"][number - 1],
          purpose: `Reviewed purpose ${number}.`,
          rationale: number === 1 ? "The strike baseline remains the first dependency." : null,
          progressSignals: number === 1 ? ["Centered contact repeats at playing tempo."] : [],
        })),
      }),
    });
    assert.equal(edit.status, 200);
    const edited = await edit.json();
    assert.equal(edited.plan.revision, 2);

    const phaseId = workspace.phases[0].id;
    const lesson = await postContent(worker, workspace.plan.id, {
      kind: "lesson",
      phaseId,
      expectedRevision: 2,
      title: "Contact calibration lesson",
      occurredAt: "2026-08-01",
      purpose: "Review the observed strike window at a controlled tempo.",
      coachObservation: "Centered contact repeated in the final synthetic set.",
      takeaway: "Keep the same target and tempo cue.",
      nextCheck: "Recheck at playing tempo.",
      phaseConnection: "This tests the first-phase progress signal.",
    });
    assert.equal(lesson.status, 201);
    assert.equal((await lesson.json()).plan.revision, 3);

    const practice = await postContent(worker, workspace.plan.id, {
      kind: "practice",
      phaseId,
      expectedRevision: 3,
      title: "Centered-contact window",
      objective: "Repeat the current contact window without adding speed.",
      rationale: "The task stays within the observed first-phase priority.",
      instructions: "Choose one target.\nRecord strike location after each set.",
      timeOrCadence: "Two short sets before the next lesson.",
      successCheck: "The golfer can identify the contact window accurately.",
      stopOrAskRule: "Stop and ask the coach if contact feedback is unclear.",
    });
    assert.equal(practice.status, 201);
    assert.equal((await practice.json()).plan.revision, 4);

    const evidence = await postContent(worker, workspace.plan.id, {
      kind: "evidence",
      phaseId,
      expectedRevision: 4,
      evidenceType: "coach_observation",
      contextType: "lesson",
      title: "Centered contact in final set",
      claim: "Centered contact repeated in the final synthetic set.",
      sourceLabel: "Coach-observed lesson set",
      sourceType: "coach_observed",
      observedAt: "2026-08-01",
      interpretation: "This is an early indication within one controlled context.",
      limitation: "No on-course or longitudinal transfer is established.",
      maturity: "early_indication",
      nextEvidenceNeeded: "Repeat at playing tempo and then on course.",
    });
    assert.equal(evidence.status, 201);
    assert.equal((await evidence.json()).plan.revision, 5);

    const preview = await worker.dispatch(
      `/app/golfers/${workspace.golfer.id}`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(preview.status, 200);
    const html = await preview.text();
    assert.match(html, /Three-phase contact roadmap|Reviewed three-phase contact roadmap/i);
    assert.match(html, /Retain under constraints/i);
    assert.doesNotMatch(html, /Perform under pressure/i);
    assert.match(html, /controls are disabled and record nothing/i);
    assert.match(html, /Contact calibration lesson/i);
    assert.match(html, /Centered-contact window/i);
    assert.match(html, /Coach-observed lesson set/i);
    assert.match(html, /Early Indication/i);
    assert.match(html, /Repeat at playing tempo and then on course/i);

    const publish = await worker.dispatch(
      `/api/plans/${workspace.plan.id}/publish`,
      {
        method: "POST",
        headers: writeHeaders(coach.email, coach.name),
        body: JSON.stringify({
          confirmation: "reviewed_exact_golfer_view",
          expectedRevision: 5,
          intendedRecipientContext: "Jordan Three Phase — private golfer roadmap",
          expiresInDays: 7,
        }),
      },
    );
    assert.equal(publish.status, 201);
    assert.ok((await publish.json()).share?.url);

    const advanceToSecond = await postContent(worker, workspace.plan.id, {
      kind: "review",
      phaseId: workspace.phases[0].id,
      expectedRevision: 5,
      transition: "advance",
      outcome: "complete",
      originalPurpose: "Establish a trustworthy contact baseline.",
      baselineSummary: "Strike location varied as transition tempo increased.",
      workCompleted: "A lesson, practice direction, and bounded evidence record were completed.",
      changeSummary: "Centered contact repeated in the coach-reviewed synthetic set.",
      reliabilityLabel: "Early repeated-practice indication",
      limitations: "On-course transfer remains unobserved.",
      golferContribution: "The golfer reported clearer strike feedback.",
      coachConclusion: "The first phase has enough bounded evidence to advance.",
      remainingOpportunity: "Verify the pattern against representative targets.",
      nextPhaseId: workspace.phases[1].id,
      nextPriorityTitle: "Transfer contact to target decisions",
      nextPriorityRationale: "The contact baseline now needs representative target context.",
      nextPhaseRationale: "Phase 2 starts because the first-phase signal repeated in its defined context.",
    });
    assert.equal(advanceToSecond.status, 201);
    assert.deepEqual((await advanceToSecond.json()).plan, {
      revision: 6,
      status: "draft",
    });

    const advanceToThird = await postContent(worker, workspace.plan.id, {
      kind: "review",
      phaseId: workspace.phases[1].id,
      expectedRevision: 6,
      transition: "advance",
      outcome: "complete",
      originalPurpose: "Use the contact window for representative target decisions.",
      baselineSummary: "The contact baseline existed only in a constrained practice context.",
      workCompleted: "The coach reviewed target choices across a synthetic representative set.",
      changeSummary: "Target choices stayed aligned with the observed contact window.",
      reliabilityLabel: "Coach-observed contextual indication",
      limitations: "Competitive and longitudinal contexts remain unobserved.",
      coachConclusion: "The roadmap can move to retention under constraints.",
      remainingOpportunity: "Review whether the pattern persists under ordinary constraints.",
      nextPhaseId: workspace.phases[2].id,
      nextPriorityTitle: "Retain the target pattern under constraints",
      nextPriorityRationale: "Retention is the remaining directional question in this roadmap.",
      nextPhaseRationale: "Phase 3 starts after the target-choice pattern was coach-reviewed.",
    });
    assert.equal(advanceToThird.status, 201);
    assert.deepEqual((await advanceToThird.json()).plan, {
      revision: 7,
      status: "draft",
    });

    const completePlan = await postContent(worker, workspace.plan.id, {
      kind: "review",
      phaseId: workspace.phases[2].id,
      expectedRevision: 7,
      transition: "complete_plan",
      outcome: "complete",
      originalPurpose: "Review the target pattern under representative constraints.",
      baselineSummary: "Retention under constraints had not yet been reviewed.",
      workCompleted: "The coach reviewed the synthetic pattern across the final constrained set.",
      changeSummary: "The golfer retained the bounded target pattern in the reviewed context.",
      reliabilityLabel: "Coach-observed synthetic completion signal",
      limitations: "This synthetic test does not establish a real-world golf outcome.",
      golferContribution: "The golfer chose to conclude this roadmap cycle.",
      coachConclusion: "The three directional phases are complete for this roadmap cycle.",
      remainingOpportunity: "A future assessment can start a new roadmap if the golfer chooses.",
      independentPracticeAlternative: "Continue the bounded contact-window check independently.",
    });
    assert.equal(completePlan.status, 201);
    assert.deepEqual((await completePlan.json()).plan, {
      revision: 8,
      status: "completed",
    });

    const completedPreview = await worker.dispatch(
      `/app/golfers/${workspace.golfer.id}`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(completedPreview.status, 200);
    const completedHtml = await completedPreview.text();
    assert.match(completedHtml, /This plan is completed/i);
    assert.match(completedHtml, /three directional phases are complete/i);
    assert.doesNotMatch(completedHtml, /Add a completed lesson chapter/i);

    const finalPublish = await worker.dispatch(
      `/api/plans/${workspace.plan.id}/publish`,
      {
        method: "POST",
        headers: writeHeaders(coach.email, coach.name),
        body: JSON.stringify({
          confirmation: "reviewed_exact_golfer_view",
          expectedRevision: 8,
          intendedRecipientContext: "Jordan Three Phase — completed private roadmap",
          expiresInDays: 7,
        }),
      },
    );
    assert.equal(finalPublish.status, 201);
    assert.ok((await finalPublish.json()).share?.url);
  },
);

function postContent(worker, planId, body) {
  return worker.dispatch(`/api/plans/${planId}/content`, {
    method: "POST",
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}
