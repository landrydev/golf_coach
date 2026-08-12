import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  grantSyntheticGolferRecordConsent,
  identityHeaders,
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = { email: "coach.a@example.test", name: "Coach Avery" };

test("instructor workspace source keeps the Beta 2 low-administration contracts visible", async () => {
  const [home, commandCentre, directory, player, roadmap, lessonUpdate, layout, styles] = await Promise.all([
    readFile(new URL("../app/app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/command-centre.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/app/golfers/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app/golfers/[golferId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app/golfers/new/QuickRoadmapForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app/golfers/[golferId]/QuickLessonUpdate.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app/beta2.module.css", import.meta.url), "utf8"),
  ]);

  for (const label of ["Continue where you left off", "Players needing attention", "Recent progress"]) {
    assert.match(home, new RegExp(label));
  }
  assert.match(home, /Create a roadmap/);
  assert.match(home, /Open players/);

  // The rich command-centre model remains tenant-scoped even though Beta 2 curates
  // it into a much smaller visible attention list.
  assert.match(commandCentre, /eq\(practiceCheckIns\.accountId, accountId\)/);
  assert.match(commandCentre, /eq\(launchMonitorImports\.accountId, accountId\)/);
  assert.match(commandCentre, /inArray\(launchMonitorImports\.status, \["failed", "mapping_required"\]\)/);
  assert.match(commandCentre, /\.slice\(0, COMMAND_CENTRE_ITEM_LIMIT\)/);
  assert.match(commandCentre, /coachingWorkspaceHref\(planId, \{ tab: "lessons" \}\)/);
  assert.match(commandCentre, /coachingWorkspaceHref\(planId, \{ tab: "evidence" \}\)/);

  for (const control of ["name=\"q\"", "name=\"status\"", "name=\"sort\""]) {
    assert.match(directory, new RegExp(control));
  }
  assert.match(directory, /name="phase"/);
  assert.match(directory, /name="review"/);
  assert.match(directory, /Every player, one clear journey/);

  for (const destination of ["Roadmap", "Today", "Progress", "Share"]) {
    assert.match(player, new RegExp(`>${destination}<`));
  }
  assert.match(player, /<QuickLessonUpdate/);
  assert.match(player, /<StagedCompletionDraftResolution/);
  assert.match(player, /Advanced coaching workspace/);
  assert.match(player, /\?tab=evidence/);
  assert.match(player, /\?tab=reviews/);

  for (const step of ["The outcome", "Your read", "The path", "The first commitment"]) {
    assert.match(roadmap, new RegExp(step));
  }
  assert.match(roadmap, /Build the foundation/);
  assert.match(roadmap, /Make it reliable/);
  assert.match(roadmap, /Transfer it to play/);
  assert.match(roadmap, /No package recommendation yet/);

  for (const prompt of ["What changed today", "What should the player practise next", "What should they pay attention to"]) {
    assert.match(lessonUpdate, new RegExp(prompt));
  }

  for (const label of ["Home", "Players", "Library", "Settings"]) {
    assert.match(layout, new RegExp(`>${label}<`));
  }
  assert.doesNotMatch(layout, />Plan &amp; billing<|>Media<|>Packages</);
  assert.match(styles, /\.playerNav\s*\{/);
  assert.match(styles, /\.conversationStep\s*\{/);
  assert.match(styles, /\.quickUpdate\s*\{/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});

test(
  "golfer directory renders server-side search, latest-plan actions, and stable pagination for thirty records",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const profile = await worker.dispatch("/api/profile", {
      method: "PUT",
      headers: writeHeaders(coach.email, coach.name),
      body: JSON.stringify({ displayName: coach.name, contactEmail: coach.email }),
    });
    assert.equal(profile.status, 200);
    await grantSyntheticGolferRecordConsent(worker, coach);

    await worker.inspect([
      {
        sql: `with recursive seq(n) as (
                select 1 union all select n + 1 from seq where n < 30
              )
              insert into golfers (
                id, account_id, display_name, preferred_name, contact_email,
                status, eligibility_status, last_activity_at, updated_at
              )
              select 'ux_golfer_' || printf('%03d', seq.n), accounts.id,
                     'UX Golfer ' || printf('%03d', seq.n),
                     null,
                     'golfer' || printf('%03d', seq.n) || '@example.test',
                     'active', 'adult_confirmed',
                     1786190000000 + seq.n, 1786190000000 + seq.n
                from seq cross join accounts
               where accounts.normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `with recursive seq(n) as (
                select 1 union all select n + 1 from seq where n < 30
              )
              insert into development_plans (
                id, account_id, golfer_id, title, status, revision, updated_at
              )
              select 'ux_plan_' || printf('%03d', seq.n), accounts.id,
                     'ux_golfer_' || printf('%03d', seq.n),
                     'UX Plan ' || printf('%03d', seq.n), 'draft', 1,
                     1786190000000 + seq.n
                from seq cross join accounts
               where accounts.normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `insert into plan_phases (
                id, account_id, plan_id, sequence, title, purpose,
                progress_signals, status, is_recommended, updated_at
              )
              select 'ux_phase_030', accounts.id, 'ux_plan_030', 1,
                     'Current phase', 'Synthetic filter evidence.', '[]',
                     'active', 1, 1786190000030
               from accounts where normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `insert into assessments (
                id, account_id, plan_id, title, status, starting_point,
                strength_summary, primary_pattern, updated_at
              )
              select 'ux_assessment_030', accounts.id, 'ux_plan_030',
                     'Synthetic assessment', 'confirmed', 'Synthetic starting point.',
                     'Synthetic strength.', 'Synthetic pattern.', 1786190000031
                from accounts where normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `insert into plan_priorities (
                id, account_id, plan_id, assessment_id, title, description,
                status, sort_order, is_current, updated_at
              )
              select 'ux_priority_030', accounts.id, 'ux_plan_030',
                     'ux_assessment_030', 'Synthetic priority',
                     'Synthetic priority description.', 'active', 0, 1,
                     1786190000032
                from accounts where normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `insert into plan_phases (
                id, account_id, plan_id, sequence, title, purpose,
                progress_signals, status, is_recommended, updated_at
              )
              select 'ux_phase_030_' || seq.sequence, accounts.id, 'ux_plan_030',
                     seq.sequence, 'Planned phase ' || seq.sequence,
                     'Synthetic phase purpose.', '[]', 'planned', 0,
                     1786190000030 + seq.sequence
                from accounts
                cross join (select 2 as sequence union all select 3) seq
               where accounts.normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `insert into launch_monitor_imports (
                id, account_id, plan_id, status, total_row_count,
                accepted_row_count, rejected_row_count, updated_at
              )
              select 'ux_launch_import_030', accounts.id, 'ux_plan_030',
                     'mapping_required', 4, 2, 2, 1786190000040
               from accounts where normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `insert into launch_monitor_imports (
                id, account_id, plan_id, status, total_row_count,
                accepted_row_count, rejected_row_count, error_code, updated_at
              )
              select 'ux_launch_import_failed_030', accounts.id, 'ux_plan_030',
                     'failed', 0, 0, 0, 'csv_parser_error', 1786190000039
                from accounts where normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `insert into practice_items (
                id, account_id, plan_id, phase_id, title, status, objective,
                rationale, instructions, success_check, stop_or_ask_rule,
                updated_at
              )
              select 'ux_practice_030', accounts.id, 'ux_plan_030',
                     'ux_phase_030', 'Synthetic tempo practice', 'active',
                     'Synthetic objective.', 'Synthetic rationale.',
                     '["Synthetic step."]', 'Synthetic success check.',
                     'Stop and ask the coach.', 1786190000041
                from accounts where normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `insert into share_links (
                id, account_id, plan_id, token_hash, status, scope,
                plan_revision, intended_recipient_context, created_at, updated_at
              )
              select 'ux_share_030', accounts.id, 'ux_plan_030',
                     'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                     'active', 'golfer_plan_read', 1,
                     'Synthetic adult golfer fixture.', 1786190000042, 1786190000042
                from accounts where normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `insert into share_sessions (
                id, account_id, share_link_id, token_hash, expires_at,
                created_at, updated_at
              )
              select 'ux_share_session_030', accounts.id, 'ux_share_030',
                     'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                     1789000000000, 1786190000043, 1786190000043
                from accounts where normalized_email = ?`,
        params: [coach.email],
      },
      {
        sql: `insert into practice_check_ins (
                id, account_id, plan_id, practice_item_id, share_link_id,
                share_session_id, idempotency_key_hash, input_fingerprint,
                completion_status, perceived_difficulty, confidence_rating,
                request_help, occurred_at
              )
              select 'ux_check_in_030', accounts.id, 'ux_plan_030',
                     'ux_practice_030', 'ux_share_030', 'ux_share_session_030',
                     'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
                     'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
                     'completed', 'hard', 4, 1, 1786190000050
                from accounts where normalized_email = ?`,
        params: [coach.email],
      },
    ]);

    const overview = await worker.dispatch("/app", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(overview.status, 200);
    const overviewHtml = await overview.text();
    assert.match(overviewHtml, /Welcome back/);
    assert.match(overviewHtml, /Continue where you left off/);
    assert.match(overviewHtml, /Players needing attention/);
    assert.match(overviewHtml, /Recent progress/);
    assert.match(overviewHtml, /Open player|Continue setup|Create a roadmap/);
    assert.match(overviewHtml, /Practice completed|help requested|Synthetic tempo practice/);

    const first = await worker.dispatch("/app/golfers?sort=name", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(first.status, 200);
    const firstHtml = await first.text();
    assert.match(firstHtml, /UX Golfer 001/);
    assert.match(firstHtml, /UX Golfer 025/);
    assert.doesNotMatch(firstHtml, /UX Golfer 026/);
    assert.match(firstHtml, /Next records/);

    const second = await worker.dispatch("/app/golfers?sort=name&page=1", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(second.status, 200);
    const secondHtml = await second.text();
    assert.match(secondHtml, /UX Golfer 026/);
    assert.match(secondHtml, /UX Golfer 030/);
    assert.doesNotMatch(secondHtml, /UX Golfer 025/);
    assert.match(secondHtml, /Previous records/);

    const searched = await worker.dispatch("/app/golfers?q=golfer030%40example.test", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(searched.status, 200);
    const searchHtml = await searched.text();
    assert.match(searchHtml, /UX Golfer 030/);
    assert.match(searchHtml, /UX Plan 030/);
    assert.match(searchHtml, /Review draft/);
    assert.match(
      searchHtml,
      /href="\/app\/golfers\/ux_golfer_030"[^>]*>Review draft(?:\s*→)?<\/a>/,
    );
    assert.doesNotMatch(searchHtml, /No development plan/);
    assert.doesNotMatch(searchHtml, /Continue setup/);
    assert.doesNotMatch(searchHtml, /\/app\/golfers\/ux_golfer_030\/complete/);
    assert.doesNotMatch(searchHtml, /UX Golfer 029/);

    const filtered = await worker.dispatch("/app/golfers?status=setup_incomplete&sort=name", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(filtered.status, 200);
    assert.match(await filtered.text(), /29 players/);

    const phaseFiltered = await worker.dispatch("/app/golfers?phase=active", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(phaseFiltered.status, 200);
    const phaseHtml = await phaseFiltered.text();
    assert.match(phaseHtml, /UX Golfer 030/);
    assert.doesNotMatch(phaseHtml, /UX Golfer 029/);

    const reviewFiltered = await worker.dispatch("/app/golfers?review=no_review", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(reviewFiltered.status, 200);
    assert.match(await reviewFiltered.text(), /30 players/);
  },
);
