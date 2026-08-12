import assert from "node:assert/strict";
import test from "node:test";
import {
  SYNTHETIC_CONSENT_POLICY_VERSIONS,
  grantSyntheticGolferRecordConsent,
  identityHeaders,
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "coach.a@example.test",
  name: "Synthetic Launch Integrity Coach",
};

test(
  "launch import idempotency binds the key to stable normalized review data",
  { timeout: 90_000 },
  async (context) => {
    const barrier = syntheticBarrier("launch-import-before-guarded-stage", 2, false);
    const worker = await startD1Worker({}, { concurrencyBarrier: barrier.handler });
    context.after(() => {
      barrier.release();
      return worker.dispose();
    });
    await createProfile(worker);
    await grantSyntheticGolferRecordConsent(worker, coach);
    const workspace = await createWorkspace(worker, "Import fingerprint");

    const payload = importPayload({
      idempotencyKey: "synthetic-launch-import-replay-key-0001",
      validationReport: {
        filename: "synthetic.csv",
        nested: { beta: 2, alpha: 1 },
        version: "synthetic-review-v1",
      },
    });
    const first = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/imports`,
      "POST",
      payload,
    );
    assert.equal(first.status, 201, await first.clone().text());
    const firstId = (await first.json()).import.id;

    const replay = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/imports`,
      "POST",
      {
        ...payload,
        columnMappings: { Speed: "ball_speed", Carry: "carry_distance" },
        validationReport: {
          version: "synthetic-review-v1",
          nested: { alpha: 1, beta: 2 },
          filename: "synthetic.csv",
        },
      },
    );
    assert.equal(replay.status, 200, await replay.clone().text());
    assert.deepEqual(await replay.json(), {
      import: { id: firstId },
      replayed: true,
    });

    const changedReplay = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/imports`,
      "POST",
      {
        ...payload,
        validationReport: {
          ...payload.validationReport,
          filename: "different.csv",
        },
      },
    );
    await assertApiError(changedReplay, 409, "idempotency_key_reused");

    await worker.inspect([
      {
        sql: "update launch_monitor_imports set request_fingerprint = null where id = ?",
        params: [firstId],
      },
    ]);
    const legacyReplay = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/imports`,
      "POST",
      payload,
    );
    await assertApiError(legacyReplay, 409, "idempotency_key_reused");

    const raceKey = "synthetic-launch-import-race-key-0002";
    barrier.arm();
    const raceResponsesPromise = Promise.all([
      jsonWrite(
        worker,
        `/api/plans/${workspace.plan.id}/coaching/launch/imports`,
        "POST",
        importPayload({
          idempotencyKey: raceKey,
          validationReport: { marker: "race-a" },
        }),
      ),
      jsonWrite(
        worker,
        `/api/plans/${workspace.plan.id}/coaching/launch/imports`,
        "POST",
        importPayload({
          idempotencyKey: raceKey,
          validationReport: { marker: "race-b" },
        }),
      ),
    ]);
    await barrier.reached;
    barrier.release();
    const raceResponses = await raceResponsesPromise;
    assert.deepEqual(
      raceResponses.map(({ status }) => status).sort((left, right) => left - right),
      [201, 409],
    );
    const raceConflict = raceResponses.find(({ status }) => status === 409);
    assert.ok(raceConflict);
    await assertApiError(raceConflict, 409, "idempotency_key_reused");

    const list = await worker.dispatch(
      `/api/plans/${workspace.plan.id}/coaching/launch/imports?includeTerminal=true`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(list.status, 200, await list.clone().text());
    for (const item of (await list.json()).imports) {
      assert.equal(Object.hasOwn(item, "idempotencyKeyHash"), false);
      assert.equal(Object.hasOwn(item, "requestFingerprint"), false);
    }
  },
);

test(
  "canonical metric definitions are race-safe and reject conflicting metadata atomically",
  { timeout: 90_000 },
  async (context) => {
    const barrier = syntheticBarrier("launch-session-before-guarded-commit", 2);
    const worker = await startD1Worker({}, { concurrencyBarrier: barrier.handler });
    context.after(() => {
      barrier.release();
      return worker.dispose();
    });
    await createProfile(worker);
    await grantSyntheticGolferRecordConsent(worker, coach);
    const firstWorkspace = await createWorkspace(worker, "Metric race first");
    const secondWorkspace = await createWorkspace(worker, "Metric race second");
    const metricKey = "synthetic_atomic_carry";

    const responsesPromise = Promise.all([
      commitManualSession(worker, firstWorkspace, {
        canonicalKey: metricKey,
        displayName: "Synthetic atomic carry",
        direction: "higher",
      }),
      commitManualSession(worker, secondWorkspace, {
        canonicalKey: metricKey,
        displayName: "Synthetic atomic carry",
        direction: "higher",
      }),
    ]);
    await barrier.reached;
    barrier.release();
    const responses = await responsesPromise;
    for (const response of responses) {
      assert.equal(response.status, 201, await response.clone().text());
    }

    const [definitionCount, sessionCount, auditCount] = await worker.inspect([
      {
        sql: "select count(*) as count from launch_monitor_metric_definitions where canonical_key = ?",
        params: [metricKey],
      },
      {
        sql: "select count(*) as count from launch_monitor_sessions",
      },
      {
        sql: "select count(*) as count from audit_events where action = 'launch_monitor.session_committed'",
      },
    ]);
    assert.equal(definitionCount.results[0].count, 1);
    assert.equal(sessionCount.results[0].count, 2);
    assert.equal(auditCount.results[0].count, 2);

    const conflictResponse = await commitManualSession(
      worker,
      { ...firstWorkspace, plan: { ...firstWorkspace.plan, revision: 2 } },
      {
        canonicalKey: metricKey,
        displayName: "Conflicting carry label",
        direction: "higher",
      },
    );
    await assertApiError(conflictResponse, 409, "metric_definition_conflict");

    const [definition, firstPlan, sessionsAfter, auditsAfter] = await worker.inspect([
      {
        sql: "select display_name as displayName, direction from launch_monitor_metric_definitions where canonical_key = ?",
        params: [metricKey],
      },
      {
        sql: "select revision from development_plans where id = ?",
        params: [firstWorkspace.plan.id],
      },
      {
        sql: "select count(*) as count from launch_monitor_sessions",
      },
      {
        sql: "select count(*) as count from audit_events where action = 'launch_monitor.session_committed'",
      },
    ]);
    assert.deepEqual(definition.results, [
      { displayName: "Synthetic atomic carry", direction: "higher" },
    ]);
    assert.equal(firstPlan.results[0].revision, 2);
    assert.equal(sessionsAfter.results[0].count, 2);
    assert.equal(auditsAfter.results[0].count, 2);
  },
);

test(
  "multi-definition launch sessions stay within D1 statement binding limits",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    await createProfile(worker);
    await grantSyntheticGolferRecordConsent(worker, coach);
    const workspace = await createWorkspace(worker, "Metric binding budget");
    const definitions = [
      ["ball_speed", "Ball Speed", "mph", "higher"],
      ["carry", "Carry", "yd", "context_only"],
      ["launch_angle", "Launch Angle", "deg", "target"],
    ];
    const metrics = (offset, golferFacing) => definitions.map(
      ([canonicalKey, displayName, unit, direction], index) => ({
        canonicalKey,
        originalName: displayName,
        displayName,
        numericValue: 100 + index + offset,
        unit,
        sourceColumn: null,
        direction,
        golferFacing,
      }),
    );
    const response = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/sessions`,
      "POST",
      {
        expectedRevision: 1,
        phaseId: workspace.phases[0].id,
        lessonId: null,
        importId: null,
        stagedReviewFingerprint: null,
        sourceMediaAssetId: null,
        sourceMode: "manual",
        sessionDate: "2026-08-10T18:00:00.000Z",
        deviceSource: "Synthetic three-definition source",
        club: "7 iron",
        environment: "Indoor synthetic fixture",
        conditions: "No real device or golfer data.",
        notes: null,
        coachInterpretation: "Review only the bounded synthetic values.",
        limitations: "This fixture is not representative of real performance.",
        representativeness: "limited",
        nextEvidenceNeeded: "Collect another reviewed synthetic set.",
        summaryMetrics: metrics(0, true),
        shots: [
          {
            sourceRowNumber: 1,
            label: "Synthetic shot one",
            capturedAt: "2026-08-10T18:00:00.000Z",
            metrics: metrics(-1, false),
          },
          {
            sourceRowNumber: 2,
            label: "Synthetic shot two",
            capturedAt: "2026-08-10T18:00:01.000Z",
            metrics: metrics(1, false),
          },
        ],
      },
    );
    assert.equal(response.status, 201, await response.clone().text());

    const [definitionsStored, metricsStored, sessionsStored, plan] = await worker.inspect([
      { sql: "select count(*) as count from launch_monitor_metric_definitions" },
      { sql: "select count(*) as count from launch_monitor_metrics" },
      { sql: "select count(*) as count from launch_monitor_sessions" },
      {
        sql: "select revision from development_plans where id = ?",
        params: [workspace.plan.id],
      },
    ]);
    assert.equal(definitionsStored.results[0].count, 3);
    assert.equal(metricsStored.results[0].count, 9);
    assert.equal(sessionsStored.results[0].count, 1);
    assert.equal(plan.results[0].revision, 2);
  },
);

for (const race of [
  {
    label: "plan revision",
    expectedCode: "stale_plan_revision",
    mutate: (worker, workspace) =>
      jsonWrite(
        worker,
        `/api/plans/${workspace.plan.id}/coaching/lessons`,
        "POST",
        {
          expectedRevision: 1,
          phaseId: workspace.phases[0].id,
          title: "Synthetic concurrent lesson",
          purpose: "Advance the plan revision while the launch commit is paused.",
          status: "planned",
          scheduledAt: null,
          occurredAt: null,
          coachObservation: null,
          golferLearning: null,
          takeaway: null,
          nextCheck: null,
          phaseConnection: "Synthetic CAS test only.",
        },
      ),
  },
  {
    label: "consent withdrawal",
    expectedCode: "current_consent_required",
    mutate: (worker, _workspace, consent) =>
      jsonWrite(worker, "/api/consents", "POST", {
        action: "withdraw",
        purpose: "golfer_record",
        policyVersion: SYNTHETIC_CONSENT_POLICY_VERSIONS.golferRecord,
        subjectType: "account",
        golferId: null,
        expectedCurrentRecordId: consent.id,
        evidenceReference: "synthetic-launch-atomicity-withdrawal",
      }),
  },
]) {
  test(
    `${race.label} loss leaves no launch definition, session, or success audit`,
    { timeout: 90_000 },
    async (context) => {
      const barrier = syntheticBarrier("launch-session-before-guarded-commit");
      const worker = await startD1Worker({}, { concurrencyBarrier: barrier.handler });
      context.after(() => {
        barrier.release();
        return worker.dispose();
      });
      await createProfile(worker);
      const consent = await grantSyntheticGolferRecordConsent(worker, coach);
      const workspace = await createWorkspace(worker, `Atomic ${race.label}`);
      const metricKey = `synthetic_${race.label.replaceAll(" ", "_")}_metric`;

      const pending = commitManualSession(worker, workspace, {
        canonicalKey: metricKey,
        displayName: `Synthetic ${race.label} metric`,
        direction: "unknown",
      });
      await barrier.reached;
      const mutation = await race.mutate(worker, workspace, consent);
      assert.ok([200, 201].includes(mutation.status), await mutation.clone().text());
      barrier.release();

      await assertApiError(await pending, 409, race.expectedCode);
      const [definitions, sessions, audits] = await worker.inspect([
        {
          sql: "select count(*) as count from launch_monitor_metric_definitions where canonical_key = ?",
          params: [metricKey],
        },
        {
          sql: "select count(*) as count from launch_monitor_sessions",
        },
        {
          sql: "select count(*) as count from audit_events where action = 'launch_monitor.session_committed'",
        },
      ]);
      assert.equal(definitions.results[0].count, 0);
      assert.equal(sessions.results[0].count, 0);
      assert.equal(audits.results[0].count, 0);
    },
  );
}

async function createProfile(worker) {
  const response = await jsonWrite(worker, "/api/profile", "PUT", {
    displayName: coach.name,
    businessName: "Synthetic Launch Integrity Golf",
    professionalTitle: "Golf instructor",
    philosophy: "Use bounded synthetic evidence and atomic commits.",
    contactEmail: coach.email,
    contactPhone: null,
    websiteUrl: null,
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#176b55",
  });
  assert.equal(response.status, 200, await response.clone().text());
}

async function createWorkspace(worker, label) {
  const slug = label.toLowerCase().replaceAll(" ", ".");
  const response = await jsonWrite(worker, "/api/golfers", "POST", {
    adultEligibilityConfirmed: true,
    displayName: `${label} Golfer`,
    email: `${slug}@example.test`,
    planTitle: `${label} roadmap`,
    coachingPackageId: null,
    goal: {
      statement: "Build a predictable synthetic evidence window.",
      why: "Verify launch data integrity.",
      context: "Synthetic test context only.",
    },
    assessment: {
      summary: "Synthetic observations vary between bounded samples.",
      strengths: "Clear synthetic test setup.",
      primaryPattern: "A synthetic pattern for transaction testing.",
      limitations: "No real golfer or device data is represented.",
    },
    priority: {
      title: "Atomic launch evidence",
      rationale: "The test isolates consent and CAS transaction boundaries.",
    },
    phases: [1, 2, 3].map((number) => ({
      number,
      title: `Synthetic phase ${number}`,
      purpose: `Synthetic bounded purpose ${number}.`,
      rationale: number === 1 ? "Start with an explicit synthetic baseline." : null,
      progressSignals: number === 1 ? ["A reviewed synthetic sample persists atomically."] : [],
    })),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

function importPayload({ idempotencyKey, validationReport }) {
  return {
    expectedRevision: 1,
    sourceMediaAssetId: null,
    columnHeaders: ["Carry", "Speed"],
    columnMappings: { Carry: "carry_distance", Speed: "ball_speed" },
    validationReport,
    reviewRows: [["140", "104"]],
    acceptedRows: [],
    acceptedSourceRowNumbers: [],
    rejectedRows: [],
    totalRowCount: 1,
    acceptedRowCount: 0,
    rejectedRowCount: 0,
    status: "mapping_required",
    errorCode: "synthetic_review_required",
    idempotencyKey,
  };
}

function commitManualSession(worker, workspace, metric) {
  return jsonWrite(
    worker,
    `/api/plans/${workspace.plan.id}/coaching/launch/sessions`,
    "POST",
    {
      expectedRevision: workspace.plan.revision ?? 1,
      phaseId: workspace.phases[0].id,
      lessonId: null,
      importId: null,
      stagedReviewFingerprint: null,
      sourceMediaAssetId: null,
      sourceMode: "manual",
      sessionDate: "2026-08-10T18:00:00.000Z",
      deviceSource: "Synthetic vendor-neutral source",
      club: "7 iron",
      environment: "Indoor synthetic fixture",
      conditions: "No real device or golfer data.",
      notes: null,
      coachInterpretation: "Review the bounded synthetic sample only.",
      limitations: "This fixture is not representative of real performance.",
      representativeness: "limited",
      nextEvidenceNeeded: "Collect another reviewed synthetic set.",
      summaryMetrics: [
        {
          canonicalKey: metric.canonicalKey,
          originalName: metric.displayName,
          displayName: metric.displayName,
          numericValue: 140,
          unit: "yd",
          sourceColumn: null,
          direction: metric.direction,
          golferFacing: true,
        },
      ],
      shots: [],
    },
  );
}

function jsonWrite(worker, path, method, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}

async function assertApiError(response, status, code) {
  assert.equal(response.status, status, await response.clone().text());
  assert.equal((await response.json()).error.code, code);
}

function syntheticBarrier(
  expectedCheckpoint,
  minimumArrivals = 1,
  initiallyArmed = true,
) {
  let signalReached;
  let releaseBarrier;
  const reached = new Promise((resolve) => {
    signalReached = resolve;
  });
  const released = new Promise((resolve) => {
    releaseBarrier = resolve;
  });
  let arrivals = 0;
  let armed = initiallyArmed;
  return {
    reached,
    arm: () => {
      armed = true;
    },
    release: () => releaseBarrier(),
    handler: async (request) => {
      const checkpoint = decodeURIComponent(
        new URL(request.url).pathname.split("/").at(-1) ?? "",
      );
      if (checkpoint !== expectedCheckpoint || !armed) {
        return new Response("skipped");
      }
      arrivals += 1;
      if (arrivals === minimumArrivals) signalReached();
      await released;
      return new Response("released");
    },
  };
}
