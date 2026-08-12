import { writeHeaders } from "../tests/support/d1-worker.mjs";

const RICH_SCENARIOS = Object.freeze(["standard", "long-content"]);

export const FUNCTIONAL_QA_RICH_FIXTURE_HOOKS = Object.freeze([
  Object.freeze({
    name: "built-in-rich-coaching-v1",
    scenarios: RICH_SCENARIOS,
    seed: seedRichCoachingScenario,
  }),
]);

export const richFixtureHooks = FUNCTIONAL_QA_RICH_FIXTURE_HOOKS;
export default FUNCTIONAL_QA_RICH_FIXTURE_HOOKS;

/**
 * Seed browser-reviewable coaching depth exclusively through authenticated HTTP
 * routes. Swing media is deliberately excluded: Scenario B must exercise the
 * real browser upload, processing, attachment, playback, retry, and replacement
 * journey instead of inheriting a fabricated object-store record.
 */
export async function seedRichCoachingScenario(context) {
  const { fixture, helpers, identity, scenario, worker } = context;
  const workspace = fixture.workspace;
  if (!workspace?.plan?.id || !workspace.phases?.[0]?.id) {
    throw new Error(`Rich functional QA scenario ${scenario.id} requires a complete base workspace.`);
  }

  const planId = workspace.plan.id;
  const phaseId = workspace.phases[0].id;
  const longContent = scenario.id === "long-content";
  const initialShare = fixture.share ?? null;
  let current = await readJson(
    worker,
    identity,
    `/api/coaching/plans/${encodeURIComponent(planId)}/workspace`,
    200,
    `${scenario.id} starting workspace`,
  );
  let revision = positiveRevision(current.plan?.revision, `${scenario.id} starting workspace`);

  const roadmapResult = await writeJson(
    helpers,
    "/api/coaching/roadmaps",
    "POST",
    roadmapTemplatePayload(longContent),
    201,
    `${scenario.id} roadmap template`,
  );
  const roadmapTemplate = requiredObject(roadmapResult.template, "roadmap template");

  const drillResult = await writeJson(
    helpers,
    "/api/coaching/drills",
    "POST",
    drillTemplatePayload(longContent),
    201,
    `${scenario.id} drill template`,
  );
  const drillTemplate = requiredObject(drillResult.template, "drill template");

  const practiceResult = await writeJson(
    helpers,
    planRoute(planId, "practice"),
    "POST",
    {
      expectedRevision: revision,
      phaseId,
      drillTemplateId: requiredId(drillTemplate.id, "drill template"),
      customization: {
        dosageOrCadence: longContent
          ? "Three bounded sets of four synthetic repetitions, with a complete reset and written observation between sets."
          : "Three sets of four synthetic repetitions with a full reset between sets.",
        constraintOrAdaptation:
          "Use a comfortable club and stop if the task, feedback, or physical response becomes unclear.",
      },
      dueAt: "2026-08-14T18:00:00.000Z",
    },
    201,
    `${scenario.id} practice assignment`,
  );
  const practiceAssignmentId = requiredId(
    practiceResult.assignment?.id,
    "practice assignment",
  );
  revision = nextRevision(practiceResult, `${scenario.id} practice assignment`);

  const plannedLessonResult = await writeJson(
    helpers,
    planRoute(planId, "lessons"),
    "POST",
    {
      expectedRevision: revision,
      phaseId,
      title: longContent
        ? "Planned representative-transfer lesson with a deliberately descriptive synthetic title"
        : "Planned representative-transfer lesson",
      purpose:
        "Review the current contact window, preserve the golfer's stated priorities, and choose the next bounded evidence task.",
      status: "planned",
      scheduledAt: null,
      occurredAt: null,
      coachObservation: null,
      golferLearning: null,
      takeaway: null,
      nextCheck: "Confirm the representative target and ordinary playing tempo before the lesson.",
      phaseConnection: "This lesson remains connected to the current centered-contact phase.",
    },
    201,
    `${scenario.id} planned lesson`,
  );
  const plannedLessonId = requiredId(plannedLessonResult.lesson?.id, "planned lesson");
  revision = nextRevision(plannedLessonResult, `${scenario.id} planned lesson`);

  const scheduledLessonResult = await writeJson(
    helpers,
    planRoute(planId, "lessons"),
    "PATCH",
    {
      expectedRevision: revision,
      lessonId: plannedLessonId,
      nextStatus: "scheduled",
      scheduledAt: "2026-07-14T18:00:00.000Z",
      occurredAt: null,
      coachObservation: null,
      golferLearning: null,
      takeaway: null,
      nextCheck: "Repeat the representative set before changing the task.",
      phaseConnection: "This scheduled lesson remains connected to the active phase.",
      evidenceItemIds: [],
      launchSessionIds: [],
    },
    200,
    `${scenario.id} scheduled lesson transition`,
  );
  const completedLessonId = plannedLessonId;
  revision = nextRevision(scheduledLessonResult, `${scenario.id} scheduled lesson transition`);

  const baselineResult = await writeJson(
    helpers,
    planRoute(planId, "launch/sessions"),
    "POST",
    launchSessionPayload({
      revision,
      phaseId,
      lessonId: completedLessonId,
      date: "2026-07-14T19:00:00.000Z",
      label: "Synthetic baseline",
      values: { ballSpeed: 131.2, carry: 205, launchAngle: 14.1 },
      longContent,
    }),
    201,
    `${scenario.id} baseline launch session`,
  );
  const baselineSessionId = requiredId(baselineResult.session?.id, "baseline session");
  revision = nextRevision(baselineResult, `${scenario.id} baseline launch session`);

  const currentResult = await writeJson(
    helpers,
    planRoute(planId, "launch/sessions"),
    "POST",
    launchSessionPayload({
      revision,
      phaseId,
      lessonId: completedLessonId,
      date: "2026-08-04T19:00:00.000Z",
      label: "Synthetic current",
      values: { ballSpeed: 134.8, carry: 212, launchAngle: 14.8 },
      longContent,
    }),
    201,
    `${scenario.id} current launch session`,
  );
  const currentSessionId = requiredId(currentResult.session?.id, "current session");
  revision = nextRevision(currentResult, `${scenario.id} current launch session`);

  const [baselineDetails, currentDetails] = await Promise.all([
    readJson(
      worker,
      identity,
      `${planRoute(planId, "launch/sessions")}/${encodeURIComponent(baselineSessionId)}`,
      200,
      `${scenario.id} baseline launch details`,
    ),
    readJson(
      worker,
      identity,
      `${planRoute(planId, "launch/sessions")}/${encodeURIComponent(currentSessionId)}`,
      200,
      `${scenario.id} current launch details`,
    ),
  ]);
  const metricPairs = comparisonMetricPairs(
    baselineDetails.summaryMetrics,
    currentDetails.summaryMetrics,
  );

  const comparisonResult = await writeJson(
    helpers,
    planRoute(planId, "launch/comparisons"),
    "POST",
    {
      expectedRevision: revision,
      title: "Selected synthetic baseline and current values",
      baselineSessionId,
      currentSessionId,
      coachInterpretation:
        "The selected current values differ from the bounded baseline; the coach uses them only as context for the existing priority.",
      limitations:
        "These synthetic indoor summary values are a selected interface fixture, not a diagnosis, forecast, score claim, or proof of transfer.",
      nextEvidenceNeeded:
        "Repeat a representative coach-reviewed set under an ordinary target constraint.",
      metricPairs,
    },
    201,
    `${scenario.id} launch comparison`,
  );
  const comparisonId = requiredId(comparisonResult.comparison?.id, "launch comparison");
  revision = nextRevision(comparisonResult, `${scenario.id} launch comparison`);

  const evidenceResult = await writeJson(
    helpers,
    planRoute(planId, "evidence"),
    "POST",
    {
      expectedRevision: revision,
      phaseId,
      lessonId: completedLessonId,
      mediaAssetId: null,
      evidenceType: "comparison",
      contextType: "lesson",
      title: "Selected launch-monitor comparison context",
      claim: "The selected synthetic current values differ from the selected baseline values.",
      sourceLabel: "Coach-selected synthetic manual summary metrics",
      sourceType: "device",
      observedAt: "2026-08-04T19:30:00.000Z",
      comparisonRole: "standalone",
      comparisonGroupId: null,
      metricName: null,
      metricValue: null,
      metricUnit: null,
      valueText: "Synthetic comparison context only.",
      interpretation:
        "The bounded comparison supports continuing the current priority while gathering more representative evidence.",
      limitation:
        "Small synthetic samples and selected indoor conditions limit the conclusion.",
      maturity: "early_indication",
      nextEvidenceNeeded: "A representative coach-reviewed set under an ordinary target constraint.",
      isRepresentative: false,
    },
    201,
    `${scenario.id} comparison evidence`,
  );
  const evidenceId = requiredId(evidenceResult.evidence?.id, "comparison evidence");
  revision = nextRevision(evidenceResult, `${scenario.id} comparison evidence`);

  const completedLessonResult = await writeJson(
    helpers,
    planRoute(planId, "lessons"),
    "PATCH",
    {
      expectedRevision: revision,
      lessonId: completedLessonId,
      nextStatus: "completed",
      scheduledAt: "2026-07-14T18:00:00.000Z",
      occurredAt: "2026-08-04T19:15:00.000Z",
      coachObservation:
        "The selected synthetic sample showed a wider strike window when transition tempo increased.",
      golferLearning:
        "The synthetic golfer reported that the reset made the target decision easier to repeat.",
      takeaway:
        "Keep the comfortable tempo and use strike location as the immediate feedback signal.",
      nextCheck: "Repeat the representative set before changing the task.",
      phaseConnection: "This lesson establishes evidence for the current phase review.",
      evidenceItemIds: [evidenceId],
      launchSessionIds: [baselineSessionId, currentSessionId],
    },
    200,
    `${scenario.id} completed lesson transition`,
  );
  revision = nextRevision(completedLessonResult, `${scenario.id} completed lesson transition`);

  const reviewResult = await writeJson(
    helpers,
    planRoute(planId, "reviews"),
    "POST",
    {
      expectedRevision: revision,
      phaseId,
      transition: "continue",
      outcome: "partially_complete",
      originalPurpose: "Create a stable strike window at a comfortable, representative tempo.",
      baselineSummary: "The selected synthetic baseline showed a wider contact window.",
      workCompleted:
        "The synthetic golfer completed a lesson, assigned practice, and two manual launch-monitor summaries.",
      changeSummary:
        "The selected current sample was more predictable while the broader transfer question remains open.",
      reliabilityLabel: "Early indication in bounded synthetic evidence",
      limitations:
        "No real golfer, automated swing analysis, on-course outcome, or durable coaching result is represented.",
      golferContribution:
        "The synthetic golfer reported that the reset made the target decision easier to repeat.",
      coachConclusion:
        "Continue the current phase and gather one more representative coach-reviewed set.",
      remainingOpportunity:
        "Test the decision under an ordinary target constraint without adding speed.",
      independentPracticeAlternative:
        "Continue the documented bounded practice and use the stop-or-ask rule.",
      nextPhaseRationale: null,
      nextPhaseId: null,
      nextPriorityTitle: null,
      nextPriorityRationale: null,
      sources: [
        { kind: "lesson", id: completedLessonId },
        { kind: "practice", id: practiceAssignmentId },
        { kind: "launch_session", id: baselineSessionId },
        { kind: "launch_session", id: currentSessionId },
        { kind: "launch_comparison", id: comparisonId },
        { kind: "evidence", id: evidenceId },
      ],
    },
    201,
    `${scenario.id} phase review`,
  );
  const reviewId = requiredId(reviewResult.review?.id, "phase review");
  revision = nextRevision(reviewResult, `${scenario.id} phase review`);

  const milestoneResult = await writeJson(
    helpers,
    planRoute(planId, "milestones"),
    "POST",
    {
      expectedRevision: revision,
      phaseId,
      title: "First representative reset completed",
      summary:
        "A private synthetic milestone recording that the bounded reset and evidence review were completed.",
      occurredAt: "2026-08-04T20:00:00.000Z",
    },
    201,
    `${scenario.id} milestone`,
  );
  const milestoneId = requiredId(milestoneResult.milestone?.id, "milestone");
  revision = nextRevision(milestoneResult, `${scenario.id} milestone`);

  const publishedMilestoneResult = await writeJson(
    helpers,
    planRoute(planId, "milestones"),
    "PATCH",
    {
      expectedRevision: revision,
      milestoneId,
      nextStatus: "published",
    },
    200,
    `${scenario.id} published milestone`,
  );
  revision = nextRevision(publishedMilestoneResult, `${scenario.id} published milestone`);

  const timelineResult = await readJson(
    worker,
    identity,
    `${planRoute(planId, "timeline")}?limit=100`,
    200,
    `${scenario.id} rich timeline`,
  );
  const timelineKinds = new Set(
    Array.isArray(timelineResult.items)
      ? timelineResult.items.map((item) => item?.kind).filter(Boolean)
      : [],
  );
  for (const kind of [
    "lesson",
    "practice",
    "evidence",
    "launch_session",
    "phase_review",
    "milestone",
  ]) {
    if (!timelineKinds.has(kind)) {
      throw new Error(`${scenario.id} rich timeline did not include ${kind}.`);
    }
  }

  const replacementShare = await helpers.publishWorkspace(workspace, {
    expectedRevision: revision,
    recipient: `Synthetic ${scenario.id} rich functional QA golfer`,
    expiresInDays: 7,
  });
  fixture.token = replacementShare.token;
  fixture.share = replacementShare;
  fixture.rich = Object.freeze({
    version: "synthetic-rich-coaching-v1",
    initialShareId: initialShare?.id ?? null,
    roadmapTemplateId: requiredId(roadmapTemplate.id, "roadmap template"),
    drillTemplateId: requiredId(drillTemplate.id, "drill template"),
    practiceAssignmentId,
    plannedLessonId,
    completedLessonId,
    baselineSessionId,
    currentSessionId,
    comparisonId,
    evidenceId,
    reviewId,
    milestoneId,
    finalRevision: revision,
    timelineKinds: Object.freeze([...timelineKinds].sort()),
  });

  current = await readJson(
    worker,
    identity,
    `/api/coaching/plans/${encodeURIComponent(planId)}/workspace`,
    200,
    `${scenario.id} final workspace`,
  );
  if (positiveRevision(current.plan?.revision, `${scenario.id} final workspace`) !== revision) {
    throw new Error(`${scenario.id} rich fixture final revision changed unexpectedly.`);
  }
}

function roadmapTemplatePayload(longContent) {
  return {
    title: longContent
      ? "Editable long-form synthetic contact and representative-transfer roadmap"
      : "Editable synthetic contact roadmap",
    description: longContent
      ? "A deliberately detailed, editable example for responsive functional review. It demonstrates structure only and is not a diagnosis or universal coaching instruction."
      : "An editable synthetic example that demonstrates structure without making a diagnosis.",
    content: {
      goalPrompt: "Describe the golfer's stated outcome and why it matters in their own context.",
      assessmentPrompt: "Separate coach observation, golfer report, interpretation, and evidence limitations.",
      priorityPrompt: "Choose the narrowest useful priority and state why it is revisable.",
      phases: [
        {
          title: "Establish a representative baseline",
          purpose: "Observe a bounded starting window without promising an outcome.",
          rationale: "A useful comparison needs an explicit starting context and limitations.",
          progressSignals: ["A coach-reviewed representative set is recorded."],
        },
        {
          title: "Practice the current priority",
          purpose: "Use one bounded task, feedback signal, and stop-or-ask rule.",
          rationale: "The task stays connected to the observed priority.",
          progressSignals: ["The task and success check remain understandable."],
        },
        {
          title: "Review and decide",
          purpose: "Select the evidence actually considered and choose the next useful action.",
          rationale: "A review records the evidence boundary and preserves historical truth.",
          progressSignals: ["The coach records interpretation, limitations, and next evidence."],
        },
      ],
    },
    origin: "editable_example",
  };
}

function drillTemplatePayload(longContent) {
  return {
    title: longContent
      ? "Editable representative centered-contact window with complete synthetic guidance"
      : "Editable centered-contact window",
    purpose:
      "Observe whether a comfortable-tempo strike window repeats without chasing speed or a promised result.",
    whenItFits:
      "Use only when it matches the coach-observed current priority and the golfer understands the feedback signal.",
    equipment: ["Comfortable club", "Representative target", "Strike-location feedback"],
    setup:
      "Choose one ordinary target, establish a comfortable setup, and confirm that the strike feedback is understandable.",
    steps: [
      "Make four swings at a comfortable tempo.",
      "Record only the agreed strike-location feedback.",
      "Reset fully before the next set.",
      "Stop if discomfort or uncertainty appears.",
    ],
    dosageOrCadence: "Three short sets with a complete reset between sets.",
    feelOrCue: "Comfortable tempo; no universal swing cue is prescribed.",
    successCheck:
      "The agreed strike window repeats in the coach-defined representative set.",
    commonMiss: "Adding speed or changing the target after one centered strike.",
    stopOrAskRule:
      "Stop and ask the coach if discomfort appears or the task, feedback, or purpose becomes unclear.",
    constraintOrAdaptation:
      "Shorten the set or use a more comfortable club while preserving the same observation question.",
    progression:
      "Only after coach review, add one ordinary target constraint without changing the feedback signal.",
    regression:
      "Return to a shorter comfortable-tempo set with a full reset between swings.",
  };
}

function launchSessionPayload({
  revision,
  phaseId,
  lessonId,
  date,
  label,
  values,
  longContent,
}) {
  return {
    expectedRevision: revision,
    phaseId,
    lessonId,
    importId: null,
    sourceMediaAssetId: null,
    sourceMode: "manual",
    sessionDate: date,
    deviceSource: `${label} vendor-neutral manual entry`,
    club: "Synthetic 7 iron",
    environment: "Synthetic indoor functional-QA fixture",
    conditions:
      "Selected controlled interface-review conditions; no live device or real golfer is represented.",
    notes: longContent
      ? "The fixture deliberately preserves original values, exact units, selected golfer-facing fields, interpretation, and limitations without implying automated analysis."
      : "Selected synthetic summary values for functional browser review.",
    coachInterpretation:
      "Use the selected values only as bounded context for the coach-authored current priority.",
    limitations:
      "Synthetic selected indoor values cannot establish on-course transfer, predict a score, or diagnose a swing.",
    representativeness: "limited",
    nextEvidenceNeeded: "A coach-reviewed representative set under an ordinary target constraint.",
    summaryMetrics: metricSet(values, true),
    shots: [
      {
        sourceRowNumber: 1,
        label: `${label} representative shot one`,
        capturedAt: date,
        metrics: metricSet(
          {
            ballSpeed: values.ballSpeed - 0.8,
            carry: values.carry - 2,
            launchAngle: values.launchAngle - 0.3,
          },
          false,
        ),
      },
      {
        sourceRowNumber: 2,
        label: `${label} representative shot two`,
        capturedAt: date,
        metrics: metricSet(
          {
            ballSpeed: values.ballSpeed + 0.8,
            carry: values.carry + 2,
            launchAngle: values.launchAngle + 0.3,
          },
          false,
        ),
      },
    ],
  };
}

function metricSet(values, golferFacing) {
  return [
    metric("ball_speed", "Ball Speed", values.ballSpeed, "mph", "higher", golferFacing),
    metric("carry", "Carry", values.carry, "yd", "context_only", golferFacing),
    metric("launch_angle", "Launch Angle", values.launchAngle, "deg", "target", golferFacing),
  ];
}

function metric(canonicalKey, displayName, numericValue, unit, direction, golferFacing) {
  return {
    canonicalKey,
    originalName: displayName,
    displayName,
    numericValue,
    unit,
    sourceColumn: null,
    direction,
    golferFacing,
  };
}

function comparisonMetricPairs(baselineMetrics, currentMetrics) {
  if (!Array.isArray(baselineMetrics) || !Array.isArray(currentMetrics)) {
    throw new Error("Launch session details did not include summary metrics.");
  }
  const currentByDefinition = new Map(
    currentMetrics.map((metric) => [metric.metricDefinitionId, metric]),
  );
  const pairs = baselineMetrics.map((baseline) => {
    const current = currentByDefinition.get(baseline.metricDefinitionId);
    if (!current || current.unit !== baseline.unit || !baseline.isGolferFacing || !current.isGolferFacing) {
      throw new Error(`Launch comparison metric ${baseline.displayName ?? "unknown"} is incompatible.`);
    }
    return {
      baselineMetricId: requiredId(baseline.id, "baseline metric"),
      currentMetricId: requiredId(current.id, "current metric"),
      displayName: baseline.displayName,
    };
  });
  if (pairs.length !== 3) {
    throw new Error(`Expected three selected comparison metrics; received ${pairs.length}.`);
  }
  return pairs;
}

function planRoute(planId, suffix) {
  return `/api/plans/${encodeURIComponent(planId)}/coaching/${suffix}`;
}

async function writeJson(helpers, path, method, body, expectedStatus, label) {
  const response = await helpers.jsonWrite(path, method, body);
  return responseJson(response, expectedStatus, label);
}

async function readJson(worker, identity, path, expectedStatus, label) {
  const response = await worker.dispatch(path, {
    method: "GET",
    headers: writeHeaders(identity.email, identity.name),
  });
  return responseJson(response, expectedStatus, label);
}

async function responseJson(response, expectedStatus, label) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (response.status !== expectedStatus) {
    throw new Error(
      `${label} returned ${response.status}; expected ${expectedStatus}: ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`,
    );
  }
  return body;
}

function nextRevision(result, label) {
  return positiveRevision(result.plan?.revision, label);
}

function positiveRevision(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} did not return a positive plan revision.`);
  }
  return value;
}

function requiredId(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} did not return an identifier.`);
  }
  return value;
}

function requiredObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} did not return an object.`);
  }
  return value;
}
