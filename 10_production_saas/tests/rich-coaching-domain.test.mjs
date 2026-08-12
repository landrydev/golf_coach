import assert from "node:assert/strict";
import test from "node:test";
import {
  grantSyntheticGolferRecordConsent,
  grantSyntheticRoadmapSharingConsent,
  identityHeaders,
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "coach.a@example.test",
  name: "Coach Avery",
};

const mediaPolicy = JSON.stringify({
  version: "synthetic-rich-coaching-media-v1",
  maxBytes: 1_048_576,
  maxVideoDurationMs: 60_000,
  allowedMimeTypes: ["image/png", "video/mp4", "text/csv"],
  accountMediaConsentRequired: false,
  golferMediaConsentRequired: false,
});

const drillDraft = {
  title: "Start-line gate",
  purpose: "Calibrate a repeatable starting window.",
  whenItFits: "Use after the setup checkpoint is stable.",
  equipment: ["Two tees", "Seven iron"],
  setup: "Place the tees just wider than the clubhead.",
  steps: ["Make three rehearsal swings.", "Hit five shots through the gate."],
  dosageOrCadence: "Two sets of five shots.",
  feelOrCue: "Finish in balance.",
  successCheck: "Four of five shots start through the gate.",
  commonMiss: "The face starts left when tempo rises.",
  stopOrAskRule: "Stop if contact becomes uncomfortable.",
  constraintOrAdaptation: "Widen the gate for the first set.",
  progression: "Narrow the gate by one ball width.",
  regression: "Return to half swings.",
};

test(
  "rich coaching domain enforces tenant ownership, structured snapshots, and plan CAS",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({ MEDIA_UPLOAD_POLICY_JSON: mediaPolicy });
    context.after(() => worker.dispose());

    const profile = await jsonWrite(worker, "/api/profile", "PUT", {
      displayName: coach.name,
      businessName: "Synthetic Rich Golf",
      professionalTitle: "Golf instructor",
      philosophy: "Use bounded observations and explicit next checks.",
      contactEmail: coach.email,
      contactPhone: null,
      websiteUrl: null,
      city: "Calgary",
      provinceOrTerritory: "Alberta",
      accentColor: "#176b55",
    });
    assert.equal(profile.status, 200, await profile.clone().text());
    await grantSyntheticGolferRecordConsent(worker, coach);

    const drillResponse = await jsonWrite(worker, "/api/coaching/drills", "POST", drillDraft);
    assert.equal(drillResponse.status, 201, await drillResponse.clone().text());
    const drill = (await drillResponse.json()).template;
    assert.ok(drill.id);
    assert.equal(drill.version, 1);
    const favouriteDrill = await jsonWrite(
      worker,
      `/api/coaching/drills/${drill.id}`,
      "PATCH",
      { expectedVersion: 1, favourite: true },
    );
    assert.equal(favouriteDrill.status, 200, await favouriteDrill.clone().text());
    assert.equal((await favouriteDrill.json()).template.version, 2);
    const updatedDrill = await jsonWrite(
      worker,
      `/api/coaching/drills/${drill.id}`,
      "PUT",
      { ...drillDraft, title: "Start-line gate — revised", expectedVersion: 2 },
    );
    assert.equal(updatedDrill.status, 200, await updatedDrill.clone().text());
    assert.equal((await updatedDrill.json()).template.version, 3);
    const staleDrill = await jsonWrite(
      worker,
      `/api/coaching/drills/${drill.id}`,
      "PATCH",
      { expectedVersion: 2, favourite: false },
    );
    assert.equal(staleDrill.status, 409);

    const drillList = await worker.dispatch("/api/coaching/drills?search=start-line", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(drillList.status, 200, await drillList.clone().text());
    const listedDrills = (await drillList.json()).templates;
    assert.equal(listedDrills.length, 1);
    assert.equal(listedDrills[0].version, 3);
    assert.equal(listedDrills[0].isFavourite, true);
    assert.deepEqual(listedDrills[0].steps, drillDraft.steps);
    assert.deepEqual(listedDrills[0].equipment, drillDraft.equipment);

    const demoUpload = await uploadPng(
      worker,
      "synthetic-drill-demo.png",
      "Synthetic start-line gate demonstration",
      "Start-line gate demo",
    );
    assert.equal(demoUpload.status, 201, await demoUpload.clone().text());
    const demoAsset = (await demoUpload.json()).asset;
    const demoAttachmentResponse = await jsonWrite(
      worker,
      `/api/coaching/drills/${drill.id}/media`,
      "POST",
      {
        mediaAssetId: demoAsset.id,
        role: "demo",
        label: "Assigned drill demonstration",
        coachContext: "Use this synthetic image with the assigned setup steps.",
        sortOrder: 0,
      },
    );
    assert.equal(
      demoAttachmentResponse.status,
      201,
      await demoAttachmentResponse.clone().text(),
    );
    const sourceDemoAttachmentId = (await demoAttachmentResponse.json()).attachment.id;

    const roadmapContent = {
      goalPrompt: "Describe the playing outcome.",
      assessmentPrompt: "Record the bounded starting point.",
      priorityPrompt: "Select one current priority.",
      phases: [
        {
          title: "Calibrate",
          purpose: "Establish a repeatable strike window.",
          rationale: "Contact is the current limiting observation.",
          progressSignals: ["Coach-reviewed strike window repeats."],
        },
      ],
    };
    const roadmapResponse = await jsonWrite(worker, "/api/coaching/roadmaps", "POST", {
      title: "Four-phase contact roadmap",
      description: "An editable synthetic starting structure.",
      origin: "coach",
      content: roadmapContent,
    });
    assert.equal(roadmapResponse.status, 201, await roadmapResponse.clone().text());
    const roadmap = (await roadmapResponse.json()).template;
    const favouriteRoadmap = await jsonWrite(
      worker,
      `/api/coaching/roadmaps/${roadmap.id}`,
      "PATCH",
      { expectedVersion: 1, favourite: true },
    );
    assert.equal(favouriteRoadmap.status, 200, await favouriteRoadmap.clone().text());
    const updateRoadmap = await jsonWrite(
      worker,
      `/api/coaching/roadmaps/${roadmap.id}`,
      "PUT",
      {
        expectedVersion: 2,
        title: "Four-phase contact roadmap — revised",
        description: "A revised editable synthetic starting structure.",
        content: roadmapContent,
      },
    );
    assert.equal(updateRoadmap.status, 200, await updateRoadmap.clone().text());
    assert.equal((await updateRoadmap.json()).template.version, 3);
    const duplicateRoadmap = await jsonWrite(
      worker,
      `/api/coaching/roadmaps/${roadmap.id}/duplicate`,
      "POST",
      { expectedSourceVersion: 3, title: "Synthetic roadmap duplicate" },
    );
    assert.equal(duplicateRoadmap.status, 201, await duplicateRoadmap.clone().text());
    const duplicatedRoadmap = (await duplicateRoadmap.json()).template;
    const archiveRoadmap = await jsonWrite(
      worker,
      `/api/coaching/roadmaps/${duplicatedRoadmap.id}`,
      "DELETE",
      { expectedVersion: 1, confirmation: "archive_roadmap_template" },
    );
    assert.equal(archiveRoadmap.status, 200, await archiveRoadmap.clone().text());
    const roadmapList = await worker.dispatch("/api/coaching/roadmaps?search=four-phase", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(roadmapList.status, 200, await roadmapList.clone().text());
    assert.equal((await roadmapList.json()).templates.length, 1);

    const golferResponse = await jsonWrite(worker, "/api/golfers", "POST", {
      adultEligibilityConfirmed: true,
      displayName: "Golfer Synthetic Rich",
      email: "golfer.rich@example.test",
      planTitle: "Synthetic rich roadmap",
      coachingPackageId: null,
      goal: {
        statement: "Build predictable contact.",
        why: "Enjoy a repeatable playing pattern.",
        context: "Synthetic test context only.",
      },
      assessment: {
        summary: "Contact varies with transition tempo.",
        strengths: "Good awareness of strike location.",
        primaryPattern: "Strike moves heelward as tempo rises.",
        limitations: "Only one synthetic session observed.",
      },
      priority: {
        title: "Centered contact",
        rationale: "Contact supports later trajectory work.",
      },
      phases: [
        {
          number: 1,
          title: "Calibrate contact",
          purpose: "Establish a centered strike window.",
          rationale: "Start with the narrow observed constraint.",
          progressSignals: ["Centered contact repeats in a reviewed set."],
        },
        {
          number: 2,
          title: "Add trajectory",
          purpose: "Observe trajectory after contact becomes steadier.",
          rationale: "Keep the next phase explicitly conditional.",
          progressSignals: ["Trajectory window repeats in a reviewed set."],
        },
        {
          number: 3,
          title: "Transfer to targets",
          purpose: "Connect the pattern to representative target decisions.",
          rationale: "Transfer follows the earlier bounded checks.",
          progressSignals: ["Target decisions hold in a representative set."],
        },
      ],
    });
    assert.equal(golferResponse.status, 201, await golferResponse.clone().text());
    const workspace = await golferResponse.json();
    await grantSyntheticRoadmapSharingConsent(worker, coach, workspace.golfer.id);

    const assignmentResponse = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/practice`,
      "POST",
      {
        expectedRevision: 1,
        phaseId: workspace.phases[0].id,
        drillTemplateId: drill.id,
        customization: { dosageOrCadence: "Three sets of four shots." },
        dueAt: null,
      },
    );
    assert.equal(assignmentResponse.status, 201, await assignmentResponse.clone().text());
    const assignmentBody = await assignmentResponse.json();
    assert.equal(assignmentBody.plan.revision, 2);

    const [assignedMediaInspection] = await worker.inspect([
      {
        sql: `select id, plan_id as planId, practice_item_id as practiceItemId,
                     drill_template_id as drillTemplateId, media_asset_id as mediaAssetId,
                     target_type as targetType, attachment_role as attachmentRole,
                     label, coach_context as coachContext, status
                from content_media_attachments
               where account_id = ? and media_asset_id = ?
               order by case when plan_id is null then 0 else 1 end, id`,
        params: [workspace.plan.accountId ?? (await lookupAccountId(worker)), demoAsset.id],
      },
    ]);
    assert.equal(assignedMediaInspection.results.length, 2);
    assert.deepEqual(
      assignedMediaInspection.results.map((row) => ({
        planId: row.planId,
        practiceItemId: row.practiceItemId,
        drillTemplateId: row.drillTemplateId,
        mediaAssetId: row.mediaAssetId,
        targetType: row.targetType,
        attachmentRole: row.attachmentRole,
        label: row.label,
        coachContext: row.coachContext,
        status: row.status,
      })),
      [
        {
          planId: null,
          practiceItemId: null,
          drillTemplateId: drill.id,
          mediaAssetId: demoAsset.id,
          targetType: "drill",
          attachmentRole: "demo",
          label: "Assigned drill demonstration",
          coachContext: "Use this synthetic image with the assigned setup steps.",
          status: "active",
        },
        {
          planId: workspace.plan.id,
          practiceItemId: assignmentBody.assignment.id,
          drillTemplateId: null,
          mediaAssetId: demoAsset.id,
          targetType: "practice",
          attachmentRole: "demo",
          label: "Assigned drill demonstration",
          coachContext: "Use this synthetic image with the assigned setup steps.",
          status: "active",
        },
      ],
    );

    const assignmentsResponse = await worker.dispatch(
      `/api/plans/${workspace.plan.id}/coaching/practice`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(assignmentsResponse.status, 200, await assignmentsResponse.clone().text());
    const assignments = (await assignmentsResponse.json()).assignments;
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].snapshot.drillTemplateId, drill.id);
    assert.equal(assignments[0].snapshot.drillTemplateVersion, 3);
    assert.equal(assignments[0].snapshot.wasCustomized, true);
    assert.equal(assignments[0].snapshot.dosageOrCadence, "Three sets of four shots.");

    const staleAssignment = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/practice`,
      "POST",
      {
        expectedRevision: 1,
        phaseId: workspace.phases[0].id,
        drillTemplateId: drill.id,
        customization: null,
        dueAt: null,
      },
    );
    assert.equal(staleAssignment.status, 409);
    assert.equal((await staleAssignment.json()).error.code, "stale_plan_revision");

    const publishResponse = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/publish`,
      "POST",
      {
        confirmation: "reviewed_exact_golfer_view",
        expectedRevision: 2,
        intendedRecipientContext: "Synthetic adult golfer",
        expiresInDays: 7,
      },
    );
    assert.equal(publishResponse.status, 201, await publishResponse.clone().text());
    const shareUrl = new URL((await publishResponse.json()).share.url);
    const token = new URLSearchParams(shareUrl.hash.slice(1)).get("token");
    assert.ok(token);
    const exchangeResponse = await worker.dispatch("/r/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ token }),
    });
    assert.equal(exchangeResponse.status, 200, await exchangeResponse.clone().text());
    const sessionContext = (await exchangeResponse.json()).sessionContext;
    const cookie = exchangeResponse.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie);
    const golferPlan = await worker.dispatch(
      `/r/plan?context=${encodeURIComponent(sessionContext)}`,
      { headers: { accept: "text/html", cookie } },
    );
    assert.equal(golferPlan.status, 200, await golferPlan.clone().text());
    const golferPlanHtml = await golferPlan.text();
    assert.match(golferPlanHtml, /Start-line gate demo/);
    assert.match(golferPlanHtml, /Start-line gate/);
    assert.match(
      golferPlanHtml,
      /Use this synthetic image with the assigned setup steps\./,
    );
    assert.match(
      golferPlanHtml,
      new RegExp(`/r/media/${demoAsset.id}\\?context=${sessionContext}`),
    );
    const sharedDemo = await worker.dispatch(
      `/r/media/${encodeURIComponent(demoAsset.id)}?context=${encodeURIComponent(sessionContext)}`,
      { headers: { cookie } },
    );
    assert.equal(sharedDemo.status, 200, await sharedDemo.clone().text());
    assert.equal(sharedDemo.headers.get("content-type"), "image/png");
    const checkInPayload = {
      practiceItemId: assignments[0].assignment.id,
      sessionContext,
      completionStatus: "completed",
      perceivedDifficulty: "appropriate",
      confidenceRating: 4,
      note: "Synthetic check-in note; no real golfer is represented.",
      requestHelp: false,
    };
    const checkIn = await shareWrite(
      worker,
      "/r/practice-check-in",
      cookie,
      "rich-check-in-key-0001",
      checkInPayload,
    );
    assert.equal(checkIn.status, 201, await checkIn.clone().text());
    const firstCheckIn = await checkIn.json();
    assert.equal(firstCheckIn.idempotentReplay, false);
    const replay = await shareWrite(
      worker,
      "/r/practice-check-in",
      cookie,
      "rich-check-in-key-0001",
      checkInPayload,
    );
    assert.equal(replay.status, 200, await replay.clone().text());
    assert.equal((await replay.json()).checkIn.id, firstCheckIn.checkIn.id);

    const scheduledLesson = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/lessons`,
      "POST",
      {
        expectedRevision: 2,
        phaseId: workspace.phases[0].id,
        title: "Scheduled synthetic lesson",
        purpose: "Confirm persisted scheduling without implementing a booking system.",
        status: "scheduled",
        scheduledAt: "2026-09-01T18:00:00.000Z",
        occurredAt: null,
        coachObservation: null,
        golferLearning: null,
        takeaway: null,
        nextCheck: "Review the saved practice check-in.",
        phaseConnection: "Supports the first phase.",
      },
    );
    assert.equal(scheduledLesson.status, 201, await scheduledLesson.clone().text());
    const scheduledLessonBody = await scheduledLesson.json();
    assert.equal(scheduledLessonBody.plan.revision, 3);
    const revokedSession = await shareWrite(
      worker,
      "/r/practice-check-in",
      cookie,
      "rich-check-in-key-0002",
      checkInPayload,
    );
    assert.equal(revokedSession.status, 404);

    const assignmentsAfterCheckIn = await worker.dispatch(
      `/api/plans/${workspace.plan.id}/coaching/practice`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(assignmentsAfterCheckIn.status, 200);
    const updatedAssignments = (await assignmentsAfterCheckIn.json()).assignments;
    assert.equal(updatedAssignments[0].checkIns.length, 1);
    assert.equal(updatedAssignments[0].checkIns[0].confidenceRating, 4);

    const binaryCsvUpload = await uploadCsv(
      worker,
      "binary-polyglot.csv",
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("Carry,Ball Speed\n142.5,105.2\n")]),
    );
    assert.equal(binaryCsvUpload.status, 415, await binaryCsvUpload.clone().text());
    const sourceCsvUpload = await uploadCsv(
      worker,
      "synthetic-launch-source.csv",
      "Carry,Ball Speed\n142.5,105.2\n",
    );
    assert.equal(sourceCsvUpload.status, 201, await sourceCsvUpload.clone().text());
    const sourceCsvAsset = (await sourceCsvUpload.json()).asset;
    const sourceCsvDownload = await worker.dispatch(`/api/media/${sourceCsvAsset.id}`, {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(sourceCsvDownload.status, 200);
    assert.equal(sourceCsvDownload.headers.get("content-type"), "text/csv");
    assert.equal(sourceCsvDownload.headers.get("content-disposition"), "attachment");
    assert.equal(sourceCsvDownload.headers.get("x-content-type-options"), "nosniff");
    assert.match(await sourceCsvDownload.text(), /142\.5,105\.2/);

    const mappingRequired = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/imports`,
      "POST",
      {
        expectedRevision: 3,
        sourceMediaAssetId: sourceCsvAsset.id,
        columnHeaders: ["Carry", "Ball Speed"],
        columnMappings: { Carry: "carry_distance", "Ball Speed": null },
        validationReport: {
          version: "launch-csv-review-v1",
          filename: "synthetic-launch-source.csv",
          mappingErrors: ["Confirm the second mapping."],
          metricUnits: { Carry: "yd" },
          confirmedUnitColumns: ["Carry"],
        },
        reviewRows: [["142.5", "105.2"]],
        acceptedRows: [],
        acceptedSourceRowNumbers: [],
        rejectedRows: [],
        totalRowCount: 1,
        acceptedRowCount: 0,
        rejectedRowCount: 0,
        status: "mapping_required",
        errorCode: "csv_review_required",
        idempotencyKey: "rich-launch-import-mapping-required-0001",
      },
    );
    assert.equal(mappingRequired.status, 201, await mappingRequired.clone().text());
    const failedImport = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/imports`,
      "POST",
      {
        expectedRevision: 3,
        sourceMediaAssetId: null,
        columnHeaders: [],
        columnMappings: {},
        validationReport: {
          version: "launch-csv-review-v1",
          filename: "unreadable.csv",
          failure: "CSV could not be parsed.",
        },
        reviewRows: [],
        acceptedRows: [],
        acceptedSourceRowNumbers: [],
        rejectedRows: [],
        totalRowCount: 0,
        acceptedRowCount: 0,
        rejectedRowCount: 0,
        status: "failed",
        errorCode: "csv_parse_failed",
        idempotencyKey: "rich-launch-import-failed-0001",
      },
    );
    assert.equal(failedImport.status, 201, await failedImport.clone().text());

    const acceptedRows = [["142.5", "105.2"]];
    const importFingerprint = launchCsvFingerprint({
      headers: ["Carry", "Ball Speed"],
      mappings: { Carry: "carry_distance", "Ball Speed": "ball_speed" },
      units: { Carry: "yd", "Ball Speed": "mph" },
      acceptedRows,
    });
    const importPayload = {
      expectedRevision: 3,
      sourceMediaAssetId: sourceCsvAsset.id,
      columnHeaders: ["Carry", "Ball Speed"],
      columnMappings: { Carry: "carry_distance", "Ball Speed": "ball_speed" },
      validationReport: {
        version: "launch-csv-review-v1",
        result: "accepted",
        metricUnits: { Carry: "yd", "Ball Speed": "mph" },
        confirmedUnitColumns: ["Carry", "Ball Speed"],
        acceptedRowsFingerprint: importFingerprint,
      },
      reviewRows: acceptedRows,
      acceptedRows,
      acceptedSourceRowNumbers: [2],
      rejectedRows: [],
      totalRowCount: 1,
      acceptedRowCount: 1,
      rejectedRowCount: 0,
      status: "validated",
      errorCode: null,
      idempotencyKey: "rich-launch-import-0001",
    };
    const unconfirmedImport = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/imports`,
      "POST",
      {
        ...importPayload,
        validationReport: {
          ...importPayload.validationReport,
          confirmedUnitColumns: ["Carry"],
        },
        idempotencyKey: "rich-launch-import-unconfirmed-0001",
      },
    );
    assert.equal(unconfirmedImport.status, 400, await unconfirmedImport.clone().text());

    const stagedImport = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/imports`,
      "POST",
      importPayload,
    );
    assert.equal(stagedImport.status, 201, await stagedImport.clone().text());
    const importId = (await stagedImport.json()).import.id;
    const importReplay = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/imports`,
      "POST",
      importPayload,
    );
    assert.equal(importReplay.status, 200, await importReplay.clone().text());
    assert.equal((await importReplay.json()).replayed, true);
    const persistedImportsResponse = await worker.dispatch(
      `/api/plans/${workspace.plan.id}/coaching/launch/imports?includeTerminal=true`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(persistedImportsResponse.status, 200);
    const persistedImports = (await persistedImportsResponse.json()).imports;
    const persistedValidatedImport = persistedImports.find((item) => item.id === importId);
    assert.deepEqual(persistedValidatedImport.reviewRows, acceptedRows);
    assert.deepEqual(persistedValidatedImport.acceptedRows, acceptedRows);
    assert.deepEqual(persistedValidatedImport.acceptedSourceRowNumbers, [2]);
    assert.equal(persistedValidatedImport.sourceMediaAssetId, sourceCsvAsset.id);
    const persistedMappingRequired = persistedImports.find(
      (item) => item.status === "mapping_required",
    );
    assert.deepEqual(persistedMappingRequired.reviewRows, acceptedRows);
    assert.deepEqual(persistedMappingRequired.acceptedRows, []);
    const persistedFailedImport = persistedImports.find(
      (item) => item.status === "failed" && item.errorCode === "csv_parse_failed",
    );
    assert.ok(persistedFailedImport);
    assert.equal(persistedFailedImport.totalRowCount, 0);
    assert.equal(persistedFailedImport.acceptedRowCount, 0);
    assert.equal(persistedFailedImport.rejectedRowCount, 0);
    assert.deepEqual(persistedFailedImport.reviewRows, []);
    assert.deepEqual(persistedFailedImport.rejectedRows, []);

    const mismatchedSessionPayload = launchSessionPayload({
      expectedRevision: 3,
      phaseId: workspace.phases[0].id,
      importId,
      sourceMode: "csv_import",
      sessionDate: "2026-08-01T18:00:00.000Z",
      carry: 142.5,
      ballSpeed: 105.2,
    });
    mismatchedSessionPayload.stagedReviewFingerprint = "launch-csv-v1-deadbeef";
    const mismatchedSession = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/sessions`,
      "POST",
      mismatchedSessionPayload,
    );
    assert.equal(mismatchedSession.status, 409, await mismatchedSession.clone().text());

    const baselineSession = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/sessions`,
      "POST",
      launchSessionPayload({
        expectedRevision: 3,
        phaseId: workspace.phases[0].id,
        lessonId: scheduledLessonBody.lesson.id,
        importId,
        sourceMode: "csv_import",
        sessionDate: "2026-08-01T18:00:00.000Z",
        carry: 999,
        ballSpeed: 999,
        fingerprint: importFingerprint,
      }),
    );
    assert.equal(baselineSession.status, 201, await baselineSession.clone().text());
    const baselineSessionId = (await baselineSession.json()).session.id;

    const currentSession = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/sessions`,
      "POST",
      launchSessionPayload({
        expectedRevision: 4,
        phaseId: workspace.phases[0].id,
        importId: null,
        sourceMode: "manual",
        sessionDate: "2026-08-08T18:00:00.000Z",
        carry: 148.75,
        ballSpeed: 107.1,
      }),
    );
    assert.equal(currentSession.status, 201, await currentSession.clone().text());
    const currentSessionId = (await currentSession.json()).session.id;

    const sessionsResponse = await worker.dispatch(
      `/api/plans/${workspace.plan.id}/coaching/launch/sessions`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(sessionsResponse.status, 200);
    const sessions = (await sessionsResponse.json()).sessions;
    const baselineCarry = sessions
      .find((session) => session.id === baselineSessionId)
      .summaryMetrics.find((metric) => metric.metricDefinitionId && metric.displayName === "Carry Distance");
    const currentCarry = sessions
      .find((session) => session.id === currentSessionId)
      .summaryMetrics.find((metric) => metric.metricDefinitionId && metric.displayName === "Carry Distance");
    assert.ok(baselineCarry);
    assert.ok(currentCarry);
    assert.equal(baselineCarry.numericValue, 142.5);
    assert.equal(
      sessions.find((session) => session.id === baselineSessionId).sourceMediaAssetId,
      sourceCsvAsset.id,
    );

    const comparisonResponse = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/launch/comparisons`,
      "POST",
      {
        expectedRevision: 5,
        title: "Synthetic carry comparison",
        baselineSessionId,
        currentSessionId,
        coachInterpretation: "Carry increased in this bounded synthetic comparison.",
        limitations: "Two small synthetic samples do not establish a durable change.",
        nextEvidenceNeeded: "Repeat in a representative target set.",
        metricPairs: [
          {
            baselineMetricId: baselineCarry.id,
            currentMetricId: currentCarry.id,
            displayName: "Carry distance",
          },
        ],
      },
    );
    assert.equal(comparisonResponse.status, 201, await comparisonResponse.clone().text());
    const comparisonId = (await comparisonResponse.json()).comparison.id;
    const comparisonsResponse = await worker.dispatch(
      `/api/plans/${workspace.plan.id}/coaching/launch/comparisons`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(comparisonsResponse.status, 200);
    const comparisons = (await comparisonsResponse.json()).comparisons;
    assert.equal(comparisons[0].metrics[0].delta, 6.25);

    const milestoneResponse = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/milestones`,
      "POST",
      {
        expectedRevision: 6,
        phaseId: workspace.phases[0].id,
        title: "Synthetic contact checkpoint",
        summary: "A bounded checkpoint recorded after reviewed practice.",
        occurredAt: "2026-08-09T18:00:00.000Z",
      },
    );
    assert.equal(milestoneResponse.status, 201, await milestoneResponse.clone().text());
    const milestoneId = (await milestoneResponse.json()).milestone.id;
    const publishMilestone = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/milestones`,
      "PATCH",
      { expectedRevision: 7, milestoneId, nextStatus: "published" },
    );
    assert.equal(publishMilestone.status, 200, await publishMilestone.clone().text());

    const evidenceUpload = await uploadPng(
      worker,
      "synthetic-lesson-evidence.png",
      "Synthetic lesson evidence image",
      "Synthetic lesson evidence",
    );
    assert.equal(evidenceUpload.status, 201, await evidenceUpload.clone().text());
    const evidenceAsset = (await evidenceUpload.json()).asset;
    const mediaEvidence = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/evidence`,
      "POST",
      {
        expectedRevision: 8,
        phaseId: workspace.phases[0].id,
        lessonId: scheduledLessonBody.lesson.id,
        mediaAssetId: evidenceAsset.id,
        evidenceType: "media",
        contextType: "lesson",
        title: "Synthetic lesson media evidence",
        claim: "The selected synthetic image documents only this bounded fixture.",
        sourceLabel: "Coach-selected synthetic drill image",
        sourceType: "document",
        observedAt: "2026-08-09T18:30:00.000Z",
        comparisonRole: "standalone",
        comparisonGroupId: null,
        metricName: null,
        metricValue: null,
        metricUnit: null,
        valueText: "Synthetic media evidence; no real golfer is represented.",
        interpretation: "Use the image as contextual evidence for the recorded lesson only.",
        limitation: "This fixture image is not representative of a real golfer pattern.",
        maturity: "single_observation",
        nextEvidenceNeeded: "Capture a representative follow-up only with explicit consent.",
        isRepresentative: false,
      },
    );
    assert.equal(mediaEvidence.status, 201, await mediaEvidence.clone().text());
    const evidenceId = (await mediaEvidence.json()).evidence.id;
    const evidenceIds = [evidenceId];
    const additionalEvidenceTypes = [
      {
        evidenceType: "coach_observation",
        title: "Synthetic coach observation",
        sourceType: "coach_observed",
        valueText: "The coach recorded a bounded synthetic observation.",
      },
      {
        evidenceType: "golfer_report",
        title: "Synthetic golfer report",
        sourceType: "golfer_reported",
        valueText: "The synthetic golfer reported a clearer contact cue.",
      },
      {
        evidenceType: "measurement",
        title: "Synthetic measurement",
        sourceType: "device",
        metricName: "Carry window",
        metricValue: 143.5,
        metricUnit: "yd",
      },
      {
        evidenceType: "outcome_count",
        title: "Synthetic outcome count",
        sourceType: "coach_observed",
        metricName: "Target starts",
        metricValue: 4,
        metricUnit: "of 6",
      },
      {
        evidenceType: "comparison",
        title: "Synthetic comparison note",
        sourceType: "mixed",
        valueText: "The two explicitly selected sets were compared without causal inference.",
      },
      {
        evidenceType: "note",
        title: "Synthetic coaching note",
        sourceType: "document",
        valueText: "A bounded note retained for the exact lesson record.",
      },
    ];
    let nextEvidenceRevision = 9;
    for (const evidenceCase of additionalEvidenceTypes) {
      const evidenceResponse = await jsonWrite(
        worker,
        `/api/plans/${workspace.plan.id}/coaching/evidence`,
        "POST",
        {
          expectedRevision: nextEvidenceRevision,
          phaseId: workspace.phases[0].id,
          lessonId: null,
          mediaAssetId: null,
          evidenceType: evidenceCase.evidenceType,
          contextType: "other",
          title: evidenceCase.title,
          claim: "Synthetic runtime evidence-type coverage.",
          sourceLabel: evidenceCase.title,
          sourceType: evidenceCase.sourceType,
          observedAt: "2026-08-09T18:35:00.000Z",
          comparisonRole: "standalone",
          comparisonGroupId: null,
          metricName: evidenceCase.metricName ?? null,
          metricValue: evidenceCase.metricValue ?? null,
          metricUnit: evidenceCase.metricUnit ?? null,
          valueText: evidenceCase.valueText ?? null,
          interpretation: "Coach-authored synthetic interpretation only.",
          limitation: "Synthetic fixture; no real golfer or performance claim.",
          maturity: "single_observation",
          nextEvidenceNeeded: "Collect a consented representative follow-up.",
          isRepresentative: false,
        },
      );
      assert.equal(evidenceResponse.status, 201, await evidenceResponse.clone().text());
      evidenceIds.push((await evidenceResponse.json()).evidence.id);
      nextEvidenceRevision += 1;
    }

    const completedLesson = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/lessons`,
      "PATCH",
      {
        expectedRevision: 15,
        lessonId: scheduledLessonBody.lesson.id,
        nextStatus: "completed",
        scheduledAt: "2026-09-01T18:00:00.000Z",
        occurredAt: "2026-09-01T19:00:00.000Z",
        coachObservation: "Synthetic observation added after the scheduled lesson.",
        golferLearning: "Synthetic learning statement recorded by the coach.",
        takeaway: "Keep the bounded contact cue.",
        nextCheck: "Review a representative follow-up set.",
        phaseConnection: "This lesson supports the active contact phase.",
        evidenceItemIds: evidenceIds,
        launchSessionIds: [baselineSessionId],
      },
    );
    assert.equal(completedLesson.status, 200, await completedLesson.clone().text());

    const sourceFirstReview = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/reviews`,
      "POST",
      {
        expectedRevision: 16,
        phaseId: workspace.phases[0].id,
        transition: "continue",
        outcome: "partially_complete",
        originalPurpose: "Synthetic phase purpose.",
        baselineSummary: "Synthetic baseline summary.",
        workCompleted: "Synthetic work completed.",
        changeSummary: "Synthetic bounded change.",
        reliabilityLabel: "Early indication",
        limitations: "Synthetic fixture only.",
        golferContribution: "Synthetic golfer contribution statement.",
        coachConclusion: "Continue gathering evidence.",
        remainingOpportunity: "Test a representative follow-up.",
        nextPhaseRationale: null,
        independentPracticeAlternative: "Continue the bounded assigned drill.",
        nextPhaseId: null,
        nextPriorityTitle: null,
        nextPriorityRationale: null,
        sources: [
          { kind: "lesson", id: scheduledLessonBody.lesson.id },
          { kind: "practice", id: assignmentBody.assignment.id },
          { kind: "practice_check_in", id: firstCheckIn.checkIn.id },
          { kind: "media", id: demoAsset.id },
          { kind: "launch_session", id: baselineSessionId },
          { kind: "launch_comparison", id: comparisonId },
          { kind: "evidence", id: evidenceId },
        ],
      },
    );
    assert.equal(sourceFirstReview.status, 201, await sourceFirstReview.clone().text());
    const reviewId = (await sourceFirstReview.json()).review.id;
    const reviewSourceList = await worker.dispatch(
      `/api/plans/${workspace.plan.id}/coaching/reviews/${reviewId}/sources`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(reviewSourceList.status, 200);
    const selectedReviewSources = (await reviewSourceList.json()).sources;
    assert.deepEqual(
      selectedReviewSources.map((source) => source.sourceType),
      [
        "lesson",
        "practice",
        "practice_check_in",
        "media",
        "launch_session",
        "launch_comparison",
        "evidence",
      ],
    );
    const snapshottedLessonSource = selectedReviewSources.find(
      (source) => source.sourceType === "lesson",
    );
    assert.equal(snapshottedLessonSource.sourcePlanRevision, 16);
    assert.equal(
      snapshottedLessonSource.sourceSnapshot.lesson.coachObservation,
      "Synthetic observation added after the scheduled lesson.",
    );
    assert.deepEqual(
      snapshottedLessonSource.sourceSnapshot.evidence.map((item) => item.id).sort(),
      [...evidenceIds].sort(),
    );
    assert.deepEqual(
      snapshottedLessonSource.sourceSnapshot.launchSessions.map((session) => session.id),
      [baselineSessionId],
    );

    const correctedLesson = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/lessons`,
      "PATCH",
      {
        expectedRevision: 17,
        lessonId: scheduledLessonBody.lesson.id,
        nextStatus: "completed",
        scheduledAt: "2026-09-01T18:00:00.000Z",
        occurredAt: "2026-09-01T19:05:00.000Z",
        coachObservation: "Corrected current lesson observation after review.",
        golferLearning: "Corrected current learning statement after review.",
        takeaway: "Use the corrected current takeaway.",
        nextCheck: "Review the corrected follow-up association.",
        phaseConnection: "Corrected connection to the active phase.",
        evidenceItemIds: [evidenceIds.at(-1)],
        launchSessionIds: [currentSessionId],
      },
    );
    assert.equal(correctedLesson.status, 200, await correctedLesson.clone().text());

    const [lessonHistoryInspection] = await worker.inspect([
      {
        sql: `select source_plan_revision as sourcePlanRevision,
                     coach_observation as coachObservation,
                     evidence_item_ids as evidenceItemIds,
                     launch_session_ids as launchSessionIds
                from lesson_revision_snapshots
               where account_id = ? and plan_id = ? and lesson_id = ?
               order by source_plan_revision`,
        params: [await lookupAccountId(worker), workspace.plan.id, scheduledLessonBody.lesson.id],
      },
    ]);
    const correctionSnapshot = lessonHistoryInspection.results.find(
      (row) => row.sourcePlanRevision === 17,
    );
    assert.equal(
      correctionSnapshot.coachObservation,
      "Synthetic observation added after the scheduled lesson.",
    );
    assert.deepEqual(JSON.parse(correctionSnapshot.evidenceItemIds).sort(), [...evidenceIds].sort());
    assert.deepEqual(JSON.parse(correctionSnapshot.launchSessionIds), [baselineSessionId]);

    const richWorkspace = await worker.dispatch(
      `/api/coaching/plans/${workspace.plan.id}/workspace`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(richWorkspace.status, 200, await richWorkspace.clone().text());
    const richWorkspaceBody = await richWorkspace.json();
    const completedLessonRecord = richWorkspaceBody.lessons.find(
      (lesson) => lesson.id === scheduledLessonBody.lesson.id,
    );
    assert.equal(completedLessonRecord.status, "completed");
    assert.equal(
      completedLessonRecord.coachObservation,
      "Corrected current lesson observation after review.",
    );
    assert.equal(
      richWorkspaceBody.launchSessions.find((session) => session.id === currentSessionId).lessonId,
      scheduledLessonBody.lesson.id,
    );
    assert.equal(
      richWorkspaceBody.launchSessions.find((session) => session.id === baselineSessionId).lessonId,
      null,
    );
    assert.equal(
      richWorkspaceBody.evidenceItems.find((item) => item.id === evidenceId).evidenceType,
      "media",
    );
    assert.deepEqual(
      evidenceIds
        .map(
          (id) => richWorkspaceBody.evidenceItems.find((item) => item.id === id)?.evidenceType,
        )
        .sort(),
      [
        "coach_observation",
        "comparison",
        "golfer_report",
        "measurement",
        "media",
        "note",
        "outcome_count",
      ],
    );

    const timelineResponse = await worker.dispatch(
      `/api/plans/${workspace.plan.id}/coaching/timeline`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(timelineResponse.status, 200);
    const timelineKinds = new Set((await timelineResponse.json()).items.map((item) => item.kind));
    for (const kind of ["lesson", "practice", "practice_check_in", "launch_session", "phase_review", "milestone"]) {
      assert.equal(timelineKinds.has(kind), true, `timeline should include ${kind}`);
    }

    const finalPublish = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/publish`,
      "POST",
      {
        confirmation: "reviewed_exact_golfer_view",
        expectedRevision: 18,
        intendedRecipientContext: "Synthetic adult golfer after source-backed review",
        expiresInDays: 7,
      },
    );
    assert.equal(finalPublish.status, 201, await finalPublish.clone().text());
    const finalShareUrl = new URL((await finalPublish.json()).share.url);
    const finalToken = new URLSearchParams(finalShareUrl.hash.slice(1)).get("token");
    assert.ok(finalToken);
    const finalExchange = await worker.dispatch("/r/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ token: finalToken }),
    });
    assert.equal(finalExchange.status, 200, await finalExchange.clone().text());
    const finalSessionContext = (await finalExchange.json()).sessionContext;
    const finalCookie = finalExchange.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(finalCookie);
    const finalGolferPlan = await worker.dispatch(
      `/r/plan?context=${encodeURIComponent(finalSessionContext)}`,
      { headers: { accept: "text/html", cookie: finalCookie } },
    );
    assert.equal(finalGolferPlan.status, 200, await finalGolferPlan.clone().text());
    const finalGolferHtml = await finalGolferPlan.text();
    for (const expectedText of [
      "Corrected current lesson observation after review.",
      "Use the corrected current takeaway.",
      "Synthetic observation added after the scheduled lesson.",
      "Selected evidence from this lesson",
      "Synthetic lesson media evidence",
      "Synthetic golfer report",
      "Selected measurement sessions from this lesson",
      "Synthetic vendor-neutral source",
      "2026-08-01",
      "Carry Distance: 148.75 yd",
      "Exact selected source records",
      "Synthetic carry comparison",
    ]) {
      assert.match(finalGolferHtml, new RegExp(expectedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(
      finalGolferHtml,
      new RegExp(`/r/media/${evidenceAsset.id}\\?context=${finalSessionContext}`),
    );
    const sharedEvidenceMedia = await worker.dispatch(
      `/r/media/${encodeURIComponent(evidenceAsset.id)}?context=${encodeURIComponent(finalSessionContext)}`,
      { headers: { cookie: finalCookie } },
    );
    assert.equal(sharedEvidenceMedia.status, 200, await sharedEvidenceMedia.clone().text());
    const [activeEvidenceAttachment] = await worker.inspect([
      {
        sql: `select id, media_asset_id as mediaAssetId, target_type as targetType, status
                from content_media_attachments
               where account_id = ? and plan_id = ? and evidence_item_id = ?`,
        params: [await lookupAccountId(worker), workspace.plan.id, evidenceId],
      },
    ]);
    assert.deepEqual(activeEvidenceAttachment.results.map((row) => ({
      mediaAssetId: row.mediaAssetId,
      targetType: row.targetType,
      status: row.status,
    })), [{ mediaAssetId: evidenceAsset.id, targetType: "evidence", status: "active" }]);

    const withdrawEvidence = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/content`,
      "DELETE",
      {
        kind: "evidence",
        itemId: evidenceId,
        expectedRevision: 18,
        confirmation: "withdraw_plan_content",
      },
    );
    assert.equal(withdrawEvidence.status, 200, await withdrawEvidence.clone().text());
    const [withdrawnEvidenceState] = await worker.inspect([
      {
        sql: `select e.status as evidenceStatus, a.status as attachmentStatus,
                     p.revision, p.published_revision as publishedRevision
                from evidence_items e
                join content_media_attachments a
                  on a.account_id = e.account_id and a.evidence_item_id = e.id
                join development_plans p
                  on p.account_id = e.account_id and p.id = e.plan_id
               where e.account_id = ? and e.plan_id = ? and e.id = ?`,
        params: [await lookupAccountId(worker), workspace.plan.id, evidenceId],
      },
    ]);
    assert.deepEqual(withdrawnEvidenceState.results, [
      {
        evidenceStatus: "withdrawn",
        attachmentStatus: "withdrawn",
        revision: 19,
        publishedRevision: null,
      },
    ]);
    const withdrawnSharedMedia = await worker.dispatch(
      `/r/media/${encodeURIComponent(evidenceAsset.id)}?context=${encodeURIComponent(finalSessionContext)}`,
      { headers: { cookie: finalCookie } },
    );
    assert.equal(withdrawnSharedMedia.status, 404);

    const replacementDemoUpload = await uploadPng(
      worker,
      "synthetic-drill-demo-current.png",
      "Synthetic revised drill demonstration",
      "Revised source drill demo",
    );
    assert.equal(
      replacementDemoUpload.status,
      201,
      await replacementDemoUpload.clone().text(),
    );
    const replacementDemoAsset = (await replacementDemoUpload.json()).asset;
    const replaceSourceDemo = await jsonWrite(
      worker,
      `/api/coaching/drills/${drill.id}/media`,
      "POST",
      {
        mediaAssetId: replacementDemoAsset.id,
        role: "demo",
        label: "Revised source demonstration",
        coachContext: "This later library edit must not rewrite an existing assignment.",
        sortOrder: 0,
      },
    );
    assert.equal(replaceSourceDemo.status, 201, await replaceSourceDemo.clone().text());
    const [historicalMediaInspection, planAfterSourceEdit] = await worker.inspect([
      {
        sql: `select id, plan_id as planId, media_asset_id as mediaAssetId,
                     target_type as targetType, status
                from content_media_attachments
               where account_id = ? and (
                 id = ? or practice_item_id = ? or media_asset_id = ?
               )
               order by target_type, media_asset_id`,
        params: [await lookupAccountId(worker), sourceDemoAttachmentId, assignmentBody.assignment.id, replacementDemoAsset.id],
      },
      {
        sql: `select revision, approved_revision as approvedRevision,
                     published_revision as publishedRevision
                from development_plans where id = ?`,
        params: [workspace.plan.id],
      },
    ]);
    const historicalPracticeMedia = historicalMediaInspection.results.filter(
      (row) => row.targetType === "practice",
    );
    assert.deepEqual(historicalPracticeMedia, [
      {
        id: historicalPracticeMedia[0].id,
        planId: workspace.plan.id,
        mediaAssetId: demoAsset.id,
        targetType: "practice",
        status: "active",
      },
    ]);
    assert.equal(
      historicalMediaInspection.results.some(
        (row) => row.targetType === "practice" && row.mediaAssetId === replacementDemoAsset.id,
      ),
      false,
    );
    assert.equal(
      historicalMediaInspection.results.find((row) => row.id === sourceDemoAttachmentId)?.status,
      "withdrawn",
    );
    assert.equal(planAfterSourceEdit.results[0].revision, 20);
    assert.equal(planAfterSourceEdit.results[0].approvedRevision, null);
    assert.equal(planAfterSourceEdit.results[0].publishedRevision, null);

    const archiveDrill = await jsonWrite(
      worker,
      `/api/coaching/drills/${drill.id}`,
      "DELETE",
      { expectedVersion: 3, confirmation: "archive_drill_template" },
    );
    assert.equal(archiveDrill.status, 200, await archiveDrill.clone().text());
    const archivedDrills = await worker.dispatch("/api/coaching/drills?includeArchived=true", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(archivedDrills.status, 200);
    const archivedDrill = (await archivedDrills.json()).templates.find((item) => item.id === drill.id);
    assert.equal(archivedDrill.status, "archived");
    assert.equal(archivedDrill.version, 4);
    const preservedAssignments = await worker.dispatch(
      `/api/plans/${workspace.plan.id}/coaching/practice`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(preservedAssignments.status, 200);
    assert.equal(
      (await preservedAssignments.json()).assignments[0].snapshot.title,
      "Start-line gate — revised",
    );

    const [{ results: tables }, { results: foreignKeys }, { results: audits }] = await worker.inspect([
      {
        sql: `select name from sqlite_master where type = 'table' and name in (
          'drill_templates', 'practice_assignment_snapshots', 'practice_check_ins',
          'launch_monitor_sessions', 'launch_monitor_imports', 'launch_monitor_metrics',
          'content_media_attachments', 'phase_review_sources', 'milestones', 'roadmap_templates'
          , 'lesson_revision_snapshots'
        ) order by name`,
      },
      { sql: "pragma foreign_key_check" },
      {
        sql: `select action, metadata from audit_events where action in (
          'drill_template.created', 'practice.assigned',
          'launch_monitor.import_staged', 'launch_monitor.session_committed',
          'launch_monitor.comparison_created', 'milestone.created',
          'milestone.transitioned', 'lesson.revision_snapshotted', 'lesson.lifecycle_transitioned',
          'evidence.created', 'evidence.withdraw',
          'media_attachment.created', 'media_attachment.withdrawn',
          'phase_review.transition'
        ) order by action, occurred_at`,
      },
    ]);
    assert.equal(tables.length, 11);
    assert.deepEqual(foreignKeys, []);
    assert.ok(audits.length >= 11);
    const auditMetadata = audits.map((row) => row.metadata).join("\n");
    assert.equal(auditMetadata.includes(drillDraft.purpose), false);
    assert.equal(auditMetadata.includes(drillDraft.successCheck), false);
    assert.equal(auditMetadata.includes("142.5"), false);
    assert.equal(auditMetadata.includes("148.75"), false);
    assert.equal(auditMetadata.includes("bounded synthetic comparison"), false);
    const assignmentAudit = audits.find((row) => row.action === "practice.assigned");
    assert.equal(JSON.parse(assignmentAudit.metadata).mediaAttachmentCount, 1);
    assert.equal(audits.some((row) => row.action === "evidence.withdraw"), true);
    assert.equal(audits.some((row) => row.action === "lesson.revision_snapshotted"), true);
    assert.equal(
      audits.some(
        (row) =>
          row.action === "media_attachment.withdrawn" &&
          JSON.parse(row.metadata).evidenceId === evidenceId,
      ),
      true,
    );
  },
);

async function jsonWrite(worker, path, method, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}

async function shareWrite(worker, path, cookie, idempotencyKey, body) {
  return worker.dispatch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      origin: testOrigin,
      "sec-fetch-site": "same-origin",
      cookie,
    },
    body: JSON.stringify(body),
  });
}

function launchSessionPayload(input) {
  const metricDirection = input.direction ?? "unknown";
  const csvSourceColumn = (canonicalKey) =>
    input.sourceMode === "csv_import"
      ? canonicalKey === "carry_distance" ? "Carry" : "Ball Speed"
      : null;
  const metric = (canonicalKey, displayName, numericValue, unit, direction) => ({
    canonicalKey,
    originalName: displayName,
    displayName,
    numericValue,
    unit,
    sourceColumn: csvSourceColumn(canonicalKey),
    direction,
    golferFacing: true,
  });
  return {
    expectedRevision: input.expectedRevision,
    phaseId: input.phaseId,
    lessonId: input.lessonId ?? null,
    importId: input.importId,
    stagedReviewFingerprint:
      input.sourceMode === "csv_import"
        ? input.fingerprint ?? "launch-csv-v1-1234abcd"
        : null,
    sourceMediaAssetId: null,
    sourceMode: input.sourceMode,
    sessionDate: input.sessionDate,
    deviceSource: "Synthetic vendor-neutral source",
    club: "7 iron",
    environment: "Indoor synthetic fixture",
    conditions: "No real device or golfer data.",
    notes: null,
    coachInterpretation: "Review the bounded synthetic sample only.",
    limitations: "This fixture is not representative of real performance.",
    representativeness: "limited",
    nextEvidenceNeeded: "Collect a representative reviewed set.",
    summaryMetrics: [
      metric("carry_distance", "Carry Distance", input.carry, "yd", metricDirection),
      metric("ball_speed", "Ball Speed", input.ballSpeed, "mph", metricDirection),
    ],
    shots: [
      {
        sourceRowNumber: 1,
        label: "Synthetic shot 1",
        capturedAt: input.sessionDate,
        metrics: [
          metric("carry_distance", "Carry Distance", input.carry, "yd", metricDirection),
          metric("ball_speed", "Ball Speed", input.ballSpeed, "mph", metricDirection),
        ],
      },
    ],
  };
}

function launchCsvFingerprint({ headers, mappings, units, acceptedRows }) {
  const orderedRecord = (record) =>
    Object.fromEntries(headers.map((header) => [header, record[header] ?? null]));
  const serialized = JSON.stringify({
    headers,
    mappings: orderedRecord(mappings),
    units: orderedRecord(units),
    acceptedRows,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `launch-csv-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function uploadCsv(worker, filename, contents) {
  const form = new FormData();
  form.set("file", new File([contents], filename, { type: "text/csv" }));
  form.set("altText", `Private source CSV ${filename}`);
  form.set("caption", "Synthetic launch-data source document");
  form.set("orientation", "unknown");
  const multipart = new Response(form);
  const contentType = multipart.headers.get("content-type");
  assert.ok(contentType?.startsWith("multipart/form-data; boundary="));
  return worker.dispatch("/api/media", {
    method: "POST",
    headers: {
      ...identityHeaders(coach.email, coach.name),
      "content-type": contentType,
      origin: testOrigin,
      "sec-fetch-site": "same-origin",
    },
    body: await multipart.arrayBuffer(),
  });
}

async function uploadPng(worker, filename, altText, caption) {
  const form = new FormData();
  form.set("file", new File([pngBytes()], filename, { type: "image/png" }));
  form.set("altText", altText);
  form.set("caption", caption);
  form.set("orientation", "landscape");
  form.set("widthPixels", "2");
  form.set("heightPixels", "1");
  const multipart = new Response(form);
  const contentType = multipart.headers.get("content-type");
  assert.ok(contentType?.startsWith("multipart/form-data; boundary="));
  return worker.dispatch("/api/media", {
    method: "POST",
    headers: {
      ...identityHeaders(coach.email, coach.name),
      "content-type": contentType,
      origin: testOrigin,
      "sec-fetch-site": "same-origin",
    },
    body: await multipart.arrayBuffer(),
  });
}

function pngBytes() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01,
  ]);
}

async function lookupAccountId(worker) {
  const [result] = await worker.inspect([
    { sql: "select id from accounts where normalized_email = ?", params: [coach.email] },
  ]);
  return result.results[0].id;
}
