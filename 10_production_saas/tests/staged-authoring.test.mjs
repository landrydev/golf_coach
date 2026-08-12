import assert from "node:assert/strict";
import test from "node:test";
import {
  grantSyntheticGolferRecordConsent,
  grantSyntheticRoadmapSharingConsent,
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
    await grantSyntheticGolferRecordConsent(worker, coachA);
    await grantSyntheticGolferRecordConsent(worker, coachB);

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
    const createdRequestId = (
      firstAttempt.status === 201 ? firstAttempt : racingRetry
    ).headers.get("x-request-id");
    const firstResult = await firstAttempt.json();
    const retryResult = await racingRetry.json();
    await grantSyntheticRoadmapSharingConsent(worker, coachA, firstResult.golfer.id);
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
        sql: "select count(*) as count from audit_events where account_id is not null and action = 'golfer_workspace.staged' and target_id = ?",
        params: [firstResult.golfer.id],
      },
    ]);
    assert.deepEqual(
      stagedCounts.map((result) => result.results[0].count),
      [1, 1, 0, 0, 0, 1],
    );

    const [receiptResult] = await worker.inspect([
      {
        sql: "select id, request_id, metadata from audit_events where action = 'golfer_workspace.staged' and target_id = ?",
        params: [firstResult.golfer.id],
      },
    ]);
    assert.equal(receiptResult.results.length, 1);
    const receipt = receiptResult.results[0];
    assert.match(receipt.id, /^[a-f0-9]{64}$/);
    assert.match(receipt.request_id, /^[0-9a-f-]{36}$/i);
    assert.equal(receipt.request_id, createdRequestId);
    assert.equal(JSON.stringify(receipt).includes(idempotencyKey), false);

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
    assert.match(golfersHtml, /roadmap needed|Create the first roadmap/);

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

test(
  "planless and equal-timestamp plan reads stay deterministic across resume, hub, and directory",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const profile = await jsonWrite(worker, "/api/profile", "PUT", coachA, {
      displayName: coachA.name,
      contactEmail: coachA.email,
    });
    assert.equal(profile.status, 200);
    await grantSyntheticGolferRecordConsent(worker, coachA);
    const tenantProfile = await jsonWrite(worker, "/api/profile", "PUT", coachB, {
      displayName: coachB.name,
      contactEmail: coachB.email,
    });
    assert.equal(tenantProfile.status, 200);
    await grantSyntheticGolferRecordConsent(worker, coachB);

    await worker.inspect([
      {
        sql: `insert into golfers (
                id, account_id, display_name, contact_email, status,
                eligibility_status, eligibility_confirmed_at, created_at, updated_at
              )
              select 'planless_directory_control', id, 'Planless Directory Control',
                     'planless.directory.control@example.test', 'active',
                     'adult_confirmed', 1786435200000, 1786435200000, 1786435200000
                from accounts where normalized_email = ?`,
        params: [coachA.email],
      },
      {
        sql: `insert into golfers (
                id, account_id, display_name, contact_email, status,
                eligibility_status, eligibility_confirmed_at, archived_at,
                created_at, updated_at
              )
              select 'archived_incomplete_control', id, 'Archived Incomplete Control',
                     'archived.incomplete.control@example.test', 'archived',
                     'adult_confirmed', 1786435200000, 1786435200000,
                     1786435200000, 1786435200002
                from accounts where normalized_email = ?`,
        params: [coachA.email],
      },
      {
        sql: `insert into development_plans (
                id, account_id, golfer_id, title, status, revision,
                archived_at, created_at, updated_at
              )
              select 'archived_incomplete_plan', id, 'archived_incomplete_control',
                     'Archived Incomplete Roadmap', 'archived', 1,
                     1786435200000, 1786435200000, 1786435200002
                from accounts where normalized_email = ?`,
        params: [coachA.email],
      },
      {
        sql: `insert into golfer_goals (
                id, account_id, golfer_id, plan_id, desired_outcome,
                status, is_primary, created_at, updated_at
              )
              select 'archived_incomplete_goal', id, 'archived_incomplete_control',
                     'archived_incomplete_plan', 'Retained archived goal.',
                     'active', 1, 1786435200000, 1786435200002
                from accounts where normalized_email = ?`,
        params: [coachA.email],
      },
      {
        sql: `insert into golfers (
                id, account_id, display_name, contact_email, status,
                eligibility_status, eligibility_confirmed_at, deletion_scheduled_at,
                created_at, updated_at
              )
              select 'deletion_pending_planless_control', id,
                     'Deletion Pending Planless Control',
                     'deletion.pending.planless.control@example.test', 'deletion_pending',
                     'adult_confirmed', 1786435200000, 1786521600000,
                     1786435200000, 1786435200001
                from accounts where normalized_email = ?`,
        params: [coachA.email],
      },
      {
        sql: `insert into data_requests (
                id, account_id, golfer_id, request_type, requested_by_type,
                status, details, identity_verified_at, due_at, created_at, updated_at
              )
              select 'deletion_pending_request_control', id,
                     'deletion_pending_planless_control', 'deletion', 'account',
                     'in_progress', 'Synthetic deletion-status control.',
                     1786435200000, 1789113600000, 1786435200000, 1786435200001
                from accounts where normalized_email = ?`,
        params: [coachA.email],
      },
    ]);
    const planlessPage = await worker.dispatch(
      "/app/golfers?q=planless.directory.control%40example.test",
      { headers: identityHeaders(coachA.email, coachA.name) },
    );
    assert.equal(planlessPage.status, 200);
    const planlessHtml = await planlessPage.text();
    assert.match(planlessHtml, /Planless Directory Control/);
    assert.match(planlessHtml, /No roadmap yet/);
    assert.match(
      planlessHtml,
      /href="\/app\/golfers\/planless_directory_control\/recover"[^>]*>Review record recovery options<\/a>/,
    );
    assert.doesNotMatch(
      planlessHtml,
      /\/app\/golfers\/planless_directory_control\/complete/,
    );
    assert.doesNotMatch(planlessHtml, /Tie-break .* winner roadmap/);
    const recordRecovery = await worker.dispatch(
      "/app/golfers/planless_directory_control/recover",
      { headers: identityHeaders(coachA.email, coachA.name) },
    );
    assert.equal(recordRecovery.status, 200);
    const recordRecoveryHtml = await recordRecovery.text();
    assert.match(recordRecoveryHtml, /No roadmap is attached/);
    assert.match(recordRecoveryHtml, /Create a distinct golfer roadmap/);
    assert.match(recordRecoveryHtml, /Open data controls/);
    const tenantBlockedRecovery = await worker.dispatch(
      "/app/golfers/planless_directory_control/recover",
      { headers: identityHeaders(coachB.email, coachB.name) },
    );
    assert.equal(tenantBlockedRecovery.status, 404);

    const archivedPage = await worker.dispatch(
      "/app/golfers?q=archived.incomplete.control%40example.test&status=archived",
      { headers: identityHeaders(coachA.email, coachA.name) },
    );
    assert.equal(archivedPage.status, 200);
    const archivedHtml = await archivedPage.text();
    assert.match(archivedHtml, /Archived Incomplete Roadmap/);
    assert.match(
      archivedHtml,
      /href="\/app\/golfers\/archived_incomplete_control"[^>]*>View archived record<\/a>/,
    );
    assert.doesNotMatch(
      archivedHtml,
      /\/app\/golfers\/archived_incomplete_control\/(?:complete|recover)/,
    );
    const archivedHub = await worker.dispatch(
      "/app/golfers/archived_incomplete_control",
      { headers: identityHeaders(coachA.email, coachA.name) },
    );
    assert.equal(archivedHub.status, 200);
    const archivedHubHtml = await archivedHub.text();
    assert.match(archivedHubHtml, /Archived Incomplete Roadmap/);
    assert.match(archivedHubHtml, /archived[^<]*read-only/i);

    const deletionPendingPage = await worker.dispatch(
      "/app/golfers?q=deletion.pending.planless.control%40example.test&status=deletion_pending",
      { headers: identityHeaders(coachA.email, coachA.name) },
    );
    assert.equal(deletionPendingPage.status, 200);
    const deletionPendingHtml = await deletionPendingPage.text();
    assert.match(deletionPendingHtml, /Deletion Pending Planless Control/);
    assert.match(
      deletionPendingHtml,
      /href="\/app\/settings\/data"[^>]*>Review data-request status<\/a>/,
    );
    assert.doesNotMatch(
      deletionPendingHtml,
      /\/app\/golfers\/deletion_pending_planless_control\/(?:complete|recover)/,
    );
    const dataControls = await worker.dispatch("/app/settings/data", {
      headers: identityHeaders(coachA.email, coachA.name),
    });
    assert.equal(dataControls.status, 200);
    assert.match(await dataControls.text(), /Review in progress/);

    const commandCentrePage = await worker.dispatch("/app", {
      headers: identityHeaders(coachA.email, coachA.name),
    });
    assert.equal(commandCentrePage.status, 200);
    const commandCentreHtml = await commandCentrePage.text();
    assert.match(commandCentreHtml, /Planless Directory Control/);
    assert.match(commandCentreHtml, /Archived Incomplete Control/);
    assert.match(commandCentreHtml, /Deletion Pending Planless Control/);
    assert.match(commandCentreHtml, /Review record recovery options/);
    assert.match(
      commandCentreHtml,
      /href="\/app\/golfers\/planless_directory_control\/recover"[^>]*>Open task<\/a>/,
    );
    assert.match(
      commandCentreHtml,
      /href="\/app\/golfers\/archived_incomplete_control"[^>]*>Open task<\/a>/,
    );
    assert.match(
      commandCentreHtml,
      /href="\/app\/settings\/data"[^>]*>Open task<\/a>/,
    );
    assert.doesNotMatch(
      commandCentreHtml,
      /\/app\/golfers\/(?:planless_directory_control|archived_incomplete_control|deletion_pending_planless_control)\/complete/,
    );

    const stagedResponse = await stageGolfer(
      worker,
      "latest-plan-tie-staged-0001",
      stagedPayload("Staged Tie Golfer"),
    );
    assert.equal(stagedResponse.status, 201);
    const staged = await stagedResponse.json();
    const stagedWinnerPlanId = "zzzz_latest_staged_plan";
    const stagedWinnerTitle = "Tie-break staged winner roadmap";
    const stagedWinnerGoal = "Tie-break staged winner goal.";
    await worker.inspect([
      clonePlanQuery(staged.plan.id, stagedWinnerPlanId, stagedWinnerTitle),
      cloneGoalQuery(
        staged.plan.id,
        stagedWinnerPlanId,
        "zzzz_latest_staged_goal",
        stagedWinnerGoal,
      ),
    ]);

    const resumePage = await worker.dispatch(
      `/app/golfers/${staged.golfer.id}/complete`,
      { headers: identityHeaders(coachA.email, coachA.name) },
    );
    assert.equal(resumePage.status, 200);
    const resumeHtml = await resumePage.text();
    assert.match(resumeHtml, new RegExp(escapeRegExp(stagedWinnerTitle)));
    assert.match(resumeHtml, new RegExp(escapeRegExp(stagedWinnerGoal)));
    assert.doesNotMatch(
      resumeHtml,
      new RegExp(escapeRegExp(staged.plan.title)),
    );
    const stagedDirectory = await worker.dispatch(
      `/app/golfers?q=${encodeURIComponent(stagedWinnerTitle)}&status=setup_incomplete`,
      { headers: identityHeaders(coachA.email, coachA.name) },
    );
    assert.equal(stagedDirectory.status, 200);
    const stagedDirectoryHtml = await stagedDirectory.text();
    assert.match(
      stagedDirectoryHtml,
      new RegExp(escapeRegExp(stagedWinnerTitle)),
    );
    assert.match(
      stagedDirectoryHtml,
      new RegExp(
        `href="/app/golfers/${escapeRegExp(staged.golfer.id)}/complete"[^>]*>Continue roadmap setup</a>`,
      ),
    );
    assert.doesNotMatch(
      stagedDirectoryHtml,
      new RegExp(escapeRegExp(staged.plan.title)),
    );

    const coachResponse = await stageGolfer(
      worker,
      "latest-plan-tie-coach-0002",
      stagedPayload("Coach Tie Golfer"),
    );
    assert.equal(coachResponse.status, 201);
    const coach = await coachResponse.json();
    await grantSyntheticRoadmapSharingConsent(worker, coachA, coach.golfer.id);
    const completed = await completeGolfer(
      worker,
      coachA,
      coach.golfer.id,
      coach.plan.id,
      1,
      completionPayload(3),
    );
    assert.equal(completed.status, 200);

    const coachWinnerPlanId = "zzzz_latest_coach_plan";
    const coachWinnerTitle = "Tie-break coach winner roadmap";
    const coachWinnerGoal = "Tie-break coach winner goal.";
    const coachWinnerAssessmentId = "zzzz_latest_coach_assessment";
    await worker.inspect([
      clonePlanQuery(coach.plan.id, coachWinnerPlanId, coachWinnerTitle),
      cloneGoalQuery(
        coach.plan.id,
        coachWinnerPlanId,
        "zzzz_latest_coach_goal",
        coachWinnerGoal,
      ),
      {
        sql: `insert into assessments (
                id, account_id, plan_id, title, status, assessed_at, context,
                starting_point, strength_summary, primary_pattern, limitations,
                coach_approved_at, superseded_at, archived_at, created_at, updated_at
              )
              select ?, account_id, ?, title, status, assessed_at, context,
                     starting_point, strength_summary, primary_pattern, limitations,
                     coach_approved_at, superseded_at, archived_at, created_at, updated_at
                from assessments where plan_id = ? limit 1`,
        params: [coachWinnerAssessmentId, coachWinnerPlanId, coach.plan.id],
      },
      {
        sql: `insert into plan_priorities (
                id, account_id, plan_id, assessment_id, title, description,
                rationale, status, sort_order, is_current, coach_approved_at,
                resolved_at, archived_at, created_at, updated_at
              )
              select ?, account_id, ?, ?, title, description,
                     rationale, status, sort_order, is_current, coach_approved_at,
                     resolved_at, archived_at, created_at, updated_at
                from plan_priorities
               where plan_id = ? and is_current = 1 limit 1`,
        params: [
          "zzzz_latest_coach_priority",
          coachWinnerPlanId,
          coachWinnerAssessmentId,
          coach.plan.id,
        ],
      },
      {
        sql: `insert into plan_phases (
                id, account_id, plan_id, coaching_package_id, sequence, title,
                purpose, rationale, progress_signals, expectations,
                estimated_duration, status, is_recommended, coach_approved_at,
                started_at, paused_at, completed_at, revised_at, canceled_at,
                created_at, updated_at
              )
              select ? || printf('%02d', sequence), account_id, ?, null, sequence,
                     title, purpose, rationale, progress_signals, expectations,
                     estimated_duration, status, is_recommended, coach_approved_at,
                     started_at, paused_at, completed_at, revised_at, canceled_at,
                     created_at, updated_at
                from plan_phases where plan_id = ?`,
        params: [
          "zzzz_latest_coach_phase_",
          coachWinnerPlanId,
          coach.plan.id,
        ],
      },
    ]);

    const [tieRows] = await worker.inspect([
      {
        sql: `select id, updated_at as updatedAt
                from development_plans
               where golfer_id = ?
               order by updated_at desc, id desc`,
        params: [coach.golfer.id],
      },
    ]);
    assert.deepEqual(
      tieRows.results.map(({ id }) => id),
      [coachWinnerPlanId, coach.plan.id],
    );
    assert.equal(tieRows.results[0].updatedAt, tieRows.results[1].updatedAt);

    const hubPage = await worker.dispatch(`/app/golfers/${coach.golfer.id}`, {
      headers: identityHeaders(coachA.email, coachA.name),
    });
    assert.equal(hubPage.status, 200);
    const hubHtml = await hubPage.text();
    assert.match(hubHtml, new RegExp(escapeRegExp(coachWinnerTitle)));
    assert.match(hubHtml, new RegExp(escapeRegExp(coachWinnerGoal)));
    assert.doesNotMatch(hubHtml, new RegExp(escapeRegExp(coach.plan.title)));

    const directoryPage = await worker.dispatch(
      `/app/golfers?q=${encodeURIComponent(coachWinnerTitle)}&status=draft&phase=active&review=needs_review`,
      { headers: identityHeaders(coachA.email, coachA.name) },
    );
    assert.equal(directoryPage.status, 200);
    const directoryHtml = await directoryPage.text();
    assert.match(directoryHtml, new RegExp(escapeRegExp(coachWinnerTitle)));
    assert.match(
      directoryHtml,
      new RegExp(
        `href="/app/golfers/${escapeRegExp(coach.golfer.id)}"[^>]*>Review draft</a>`,
      ),
    );
    assert.doesNotMatch(
      directoryHtml,
      new RegExp(`/app/golfers/${escapeRegExp(coach.golfer.id)}/complete`),
    );
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

function clonePlanQuery(sourcePlanId, targetPlanId, title) {
  return {
    sql: `insert into development_plans (
            id, account_id, golfer_id, title, status, revision,
            approved_revision, published_revision, welcome_note,
            assessment_context, current_coach_note, current_coach_note_at,
            private_context_label, coach_approved_at, previewed_at,
            published_at, last_shared_at, paused_at, completed_at, archived_at,
            created_at, updated_at
          )
          select ?, account_id, golfer_id, ?, 'draft', revision,
                 null, null, welcome_note, assessment_context, current_coach_note,
                 current_coach_note_at, private_context_label, null, null,
                 null, null, null, null, null, created_at, updated_at
            from development_plans where id = ?`,
    params: [targetPlanId, title, sourcePlanId],
  };
}

function cloneGoalQuery(sourcePlanId, targetPlanId, targetGoalId, desiredOutcome) {
  return {
    sql: `insert into golfer_goals (
            id, account_id, golfer_id, plan_id, desired_outcome, why_it_matters,
            context, constraints, score_or_handicap_context, target_date, status,
            is_primary, confirmed_by_golfer_at, coach_approved_at, achieved_at,
            revised_at, archived_at, created_at, updated_at
          )
          select ?, account_id, golfer_id, ?, ?, why_it_matters,
                 context, constraints, score_or_handicap_context, target_date,
                 'active', 1, confirmed_by_golfer_at, coach_approved_at, null,
                 null, null, created_at, updated_at
            from golfer_goals where plan_id = ? and is_primary = 1 limit 1`,
    params: [targetGoalId, targetPlanId, desiredOutcome, sourcePlanId],
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
