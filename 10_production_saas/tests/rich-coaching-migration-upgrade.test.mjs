import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startD1Worker } from "./support/d1-worker.mjs";

const richMigrationUrl = new URL("../drizzle/0012_giant_rockslide.sql", import.meta.url);
const compatibilityMigrationUrl = new URL("../drizzle/0013_mature_alex_power.sql", import.meta.url);
const lessonHistoryMigrationUrl = new URL("../drizzle/0014_easy_electro.sql", import.meta.url);
const launchReviewMigrationUrl = new URL("../drizzle/0015_freezing_puma.sql", import.meta.url);
const practiceReplacementMigrationUrl = new URL(
  "../drizzle/0016_handy_green_goblin.sql",
  import.meta.url,
);

test(
  "rich coaching migration upgrades 0011 data without tenant or foreign-key loss",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({}, { migrationThroughIndex: 11 });
    context.after(() => worker.dispose());
    const database = await worker.database();
    await seedLegacyRichPlan(database);

    await applyMigration(database, richMigrationUrl);
    await applyMigration(database, compatibilityMigrationUrl);
    await applyMigration(database, lessonHistoryMigrationUrl);
    await seedPreLaunchReviewData(database);
    await applyMigration(database, launchReviewMigrationUrl);
    await applyMigration(database, practiceReplacementMigrationUrl);

    const lesson = await database
      .prepare("select id, status, title, scheduled_at, occurred_at from lessons where id = 'lesson_legacy'")
      .first();
    assert.deepEqual(lesson, {
      id: "lesson_legacy",
      status: "completed",
      title: "Legacy synthetic lesson",
      scheduled_at: 1_786_000_000_000,
      occurred_at: 1_786_000_100_000,
    });

    const snapshot = await database
      .prepare(
        `select practice_item_id, drill_template_id, drill_template_version,
                was_customized, title, purpose, steps, dosage_or_cadence,
                success_check, stop_or_ask_rule
           from practice_assignment_snapshots
          where practice_item_id = 'practice_legacy'`,
      )
      .first();
    assert.deepEqual(snapshot, {
      practice_item_id: "practice_legacy",
      drill_template_id: null,
      drill_template_version: null,
      was_customized: 1,
      title: "Legacy synthetic practice",
      purpose: "Repeat centered contact.",
      steps: JSON.stringify(["Rehearse", "Hit five shots"]),
      dosage_or_cadence: "Two sets",
      success_check: "Four centered strikes",
      stop_or_ask_rule: "Stop if discomfort appears",
    });

    const details = await database
      .prepare("select account_id, media_asset_id, orientation from media_asset_details")
      .all();
    assert.deepEqual(details.results, [
      { account_id: "account_legacy", media_asset_id: "media_legacy", orientation: "unknown" },
    ]);

    const attachments = await database
      .prepare(
        `select target_type, attachment_role, media_asset_id, status
           from content_media_attachments
          order by target_type`,
      )
      .all();
    assert.deepEqual(attachments.results, [
      {
        target_type: "evidence",
        attachment_role: "baseline",
        media_asset_id: "media_legacy",
        status: "active",
      },
      {
        target_type: "profile",
        attachment_role: "logo",
        media_asset_id: "media_legacy",
        status: "active",
      },
    ]);

    const reviewSource = await database
      .prepare(
        `select plan_id, phase_review_id, source_type, evidence_item_id, sort_order
           from phase_review_sources`,
      )
      .first();
    assert.deepEqual(reviewSource, {
      plan_id: "plan_legacy",
      phase_review_id: "review_legacy",
      source_type: "evidence",
      evidence_item_id: "evidence_legacy",
      sort_order: 0,
    });

    const committedImport = await database
      .prepare(
        `select id, status, accepted_row_count, review_rows, accepted_rows,
                accepted_source_row_numbers, rejected_rows, request_fingerprint
           from launch_monitor_imports
          where id = 'import_pre_0015'`,
      )
      .first();
    assert.deepEqual(committedImport, {
      id: "import_pre_0015",
      status: "committed",
      accepted_row_count: 1,
      review_rows: "[]",
      accepted_rows: "[]",
      accepted_source_row_numbers: "[]",
      rejected_rows: "[]",
      request_fingerprint: null,
    });
    await assert.rejects(
      database
        .prepare(
          `update launch_monitor_imports
              set request_fingerprint = ?
            where id = 'import_pre_0015'`,
        )
        .bind("z".repeat(64))
        .run(),
      /constraint failed/i,
    );
    assert.deepEqual(
      await database
        .prepare(
          `select id, import_id, source_mode, status
             from launch_monitor_sessions
            where id = 'session_pre_0015'`,
        )
        .first(),
      {
        id: "session_pre_0015",
        import_id: "import_pre_0015",
        source_mode: "csv_import",
        status: "committed",
      },
    );

    const reviewMediaTriggers = await database
      .prepare(
        `select name from sqlite_master
          where type = 'trigger' and name like 'phase_review_sources_media_plan_%'
          order by name`,
      )
      .all();
    assert.deepEqual(reviewMediaTriggers.results, [
      { name: "phase_review_sources_media_plan_insert" },
      { name: "phase_review_sources_media_plan_update" },
    ]);
    await database
      .prepare(
        `insert into phase_review_sources (
           id, account_id, plan_id, phase_review_id, media_asset_id,
           source_type, sort_order
         ) values (
           'review_media_attached', 'account_legacy', 'plan_legacy',
           'review_legacy', 'media_legacy', 'media', 1
         )`,
      )
      .run();
    await database
      .prepare(
        `insert into media_assets (
           id, account_id, storage_provider, object_key, status, media_kind,
           mime_type, byte_size, content_sha256, uploaded_at, processed_at
         ) values (
           'media_unattached', 'account_legacy', 'r2',
           'accounts/account_legacy/media_unattached', 'ready', 'image',
           'image/jpeg', 128, ?, ?, ?
         )`,
      )
      .bind("b".repeat(64), 1_785_100_000_000, 1_785_100_000_000)
      .run();
    await assert.rejects(
      database
        .prepare(
          `insert into phase_review_sources (
             id, account_id, plan_id, phase_review_id, media_asset_id,
             source_type, sort_order
           ) values (
             'review_media_unattached', 'account_legacy', 'plan_legacy',
             'review_legacy', 'media_unattached', 'media', 2
           )`,
        )
        .run(),
      /review media is not attached to plan/i,
    );

    await database
      .prepare(
        `insert into lessons (
           id, account_id, plan_id, phase_id, sequence, title, status,
           purpose, scheduled_at
         ) values (
           'lesson_scheduled', 'account_legacy', 'plan_legacy', 'phase_legacy',
           2, 'Scheduled synthetic lesson', 'scheduled',
           'Verify that scheduled is a real persisted lifecycle state.', ?
         )`,
      )
      .bind(1_786_100_000_000)
      .run();

    await assert.rejects(
      database
        .prepare(
          `insert into lessons (
             id, account_id, plan_id, sequence, title, status, purpose
           ) values (
             'lesson_invalid_status', 'account_legacy', 'plan_legacy', 3,
             'Invalid lesson', 'booked', 'Must fail the lifecycle check.'
           )`,
        )
        .run(),
      /constraint failed/i,
    );

    await assert.rejects(
      database
        .prepare(
          `insert into content_media_attachments (
             id, account_id, plan_id, media_asset_id, lesson_id,
             evidence_item_id, target_type, attachment_role
           ) values (
             'attachment_two_targets', 'account_legacy', 'plan_legacy',
             'media_legacy', 'lesson_legacy', 'evidence_legacy',
             'lesson', 'supporting'
           )`,
        )
        .run(),
      /constraint failed/i,
    );

    // The upgraded attachment model supports an immutable assignment-time
    // media copy without another polymorphic or cross-tenant reference. The
    // reusable drill attachment can later be withdrawn while the historical
    // plan/practice attachment remains independently active.
    await database
      .prepare(
        `insert into drill_templates (
           id, account_id, title, purpose, when_it_fits, equipment, setup,
           steps, dosage_or_cadence, success_check, stop_or_ask_rule
         ) values (
           'drill_legacy', 'account_legacy', 'Legacy reusable drill',
           'Preserve assignment context.', 'Use for the legacy practice.',
           ?, 'Synthetic setup.', ?, 'Two sets', 'Four centered strikes',
           'Stop if discomfort appears'
         )`,
      )
      .bind(JSON.stringify(["Two tees"]), JSON.stringify(["Rehearse", "Hit five shots"]))
      .run();
    await database.batch([
      database
        .prepare(
          `insert into content_media_attachments (
             id, account_id, media_asset_id, drill_template_id, target_type,
             attachment_role, label, coach_context, sort_order
           ) values (
             'drill_media_source_legacy', 'account_legacy', 'media_legacy',
             'drill_legacy', 'drill', 'demo', 'Legacy drill demo',
             'Synthetic reusable source context.', 0
           )`,
        ),
      database
        .prepare(
          `insert into content_media_attachments (
             id, account_id, plan_id, media_asset_id, practice_item_id,
             target_type, attachment_role, label, coach_context, sort_order
           ) values (
             'practice_media_snapshot_legacy', 'account_legacy', 'plan_legacy',
             'media_legacy', 'practice_legacy', 'practice', 'demo',
             'Legacy drill demo', 'Synthetic reusable source context.', 0
           )`,
        ),
    ]);
    await database
      .prepare(
        `update content_media_attachments
            set status = 'withdrawn', withdrawn_at = ?
          where id = 'drill_media_source_legacy'`,
      )
      .bind(1_786_150_000_000)
      .run();
    const assignmentMediaSnapshot = await database
      .prepare(
        `select id, plan_id, practice_item_id, drill_template_id,
                media_asset_id, target_type, attachment_role, status
           from content_media_attachments
          where id in ('drill_media_source_legacy', 'practice_media_snapshot_legacy')
          order by id`,
      )
      .all();
    assert.deepEqual(assignmentMediaSnapshot.results, [
      {
        id: "drill_media_source_legacy",
        plan_id: null,
        practice_item_id: null,
        drill_template_id: "drill_legacy",
        media_asset_id: "media_legacy",
        target_type: "drill",
        attachment_role: "demo",
        status: "withdrawn",
      },
      {
        id: "practice_media_snapshot_legacy",
        plan_id: "plan_legacy",
        practice_item_id: "practice_legacy",
        drill_template_id: null,
        media_asset_id: "media_legacy",
        target_type: "practice",
        attachment_role: "demo",
        status: "active",
      },
    ]);

    await database
      .prepare(
        `insert into golfers (
           id, account_id, display_name, status, eligibility_status
         ) values ('golfer_other_plan', 'account_legacy', 'Other synthetic golfer', 'active', 'adult_confirmed')`,
      )
      .run();
    await database
      .prepare(
        `insert into development_plans (
           id, account_id, golfer_id, title, status, revision
         ) values ('plan_other', 'account_legacy', 'golfer_other_plan', 'Other plan', 'draft', 1)`,
      )
      .run();
    await assert.rejects(
      database
        .prepare(
          `insert into content_media_attachments (
             id, account_id, plan_id, media_asset_id, lesson_id,
             target_type, attachment_role
           ) values (
             'attachment_wrong_plan', 'account_legacy', 'plan_other',
             'media_legacy', 'lesson_legacy', 'lesson', 'supporting'
           )`,
        )
        .run(),
      /foreign key constraint failed/i,
    );
    await assert.rejects(
      database
        .prepare(
          `insert into milestones (
             id, account_id, plan_id, phase_id, title, summary, occurred_at
           ) values (
             'milestone_wrong_plan', 'account_legacy', 'plan_other',
             'phase_legacy', 'Wrong plan milestone', 'Must fail.', ?
           )`,
        )
        .bind(1_786_200_000_000)
        .run(),
      /phase does not belong to plan/i,
    );

    await assert.rejects(
      database
        .prepare("update media_assets set object_key = 'overwritten/object' where id = 'media_legacy'")
        .run(),
      /metadata is immutable/i,
    );
    await database
      .prepare("update media_assets set status = 'quarantined' where id = 'media_legacy'")
      .run();

    const indexes = await database.prepare("pragma index_list('practice_check_ins')").all();
    assert.equal(
      indexes.results.some((row) => row.name === "practice_check_ins_plan_id_unique" && row.unique === 1),
      true,
    );
    assert.deepEqual((await database.prepare("pragma foreign_key_check").all()).results, []);
  },
);

async function seedLegacyRichPlan(database) {
  await database
    .prepare(
      `insert into accounts (
         id, auth_provider, auth_subject, primary_email, normalized_email,
         email_verified_at, status
       ) values (
         'account_legacy', 'development', 'legacy-subject',
         'legacy@example.test', 'legacy@example.test', ?, 'active'
       )`,
    )
    .bind(1_785_000_000_000)
    .run();
  await database
    .prepare(
      `insert into media_assets (
         id, account_id, storage_provider, object_key, status, media_kind,
         mime_type, byte_size, content_sha256, uploaded_at, processed_at
       ) values (
         'media_legacy', 'account_legacy', 'r2',
         'accounts/account_legacy/media_legacy', 'ready', 'image',
         'image/jpeg', 128, ?, ?, ?
       )`,
    )
    .bind("a".repeat(64), 1_785_000_000_000, 1_785_000_000_000)
    .run();
  await database
    .prepare(
      `insert into instructor_profiles (
         account_id, display_name, contact_email, logo_media_asset_id
       ) values (
         'account_legacy', 'Legacy Synthetic Coach',
         'legacy@example.test', 'media_legacy'
       )`,
    )
    .run();
  await database
    .prepare(
      `insert into golfers (
         id, account_id, display_name, status, eligibility_status
       ) values (
         'golfer_legacy', 'account_legacy', 'Legacy Synthetic Golfer',
         'active', 'adult_confirmed'
       )`,
    )
    .run();
  await database
    .prepare(
      `insert into development_plans (
         id, account_id, golfer_id, title, status, revision
       ) values (
         'plan_legacy', 'account_legacy', 'golfer_legacy',
         'Legacy synthetic plan', 'draft', 3
       )`,
    )
    .run();
  await database
    .prepare(
      `insert into plan_phases (
         id, account_id, plan_id, sequence, title, purpose, status
       ) values (
         'phase_legacy', 'account_legacy', 'plan_legacy', 1,
         'Legacy phase', 'Preserve this phase.', 'active'
       )`,
    )
    .run();
  await database
    .prepare(
      `insert into lessons (
         id, account_id, plan_id, phase_id, sequence, title, status,
         purpose, scheduled_at, occurred_at, completed_at
       ) values (
         'lesson_legacy', 'account_legacy', 'plan_legacy', 'phase_legacy', 1,
         'Legacy synthetic lesson', 'completed', 'Preserve this lesson.', ?, ?, ?
       )`,
    )
    .bind(1_786_000_000_000, 1_786_000_100_000, 1_786_000_100_000)
    .run();
  await database
    .prepare(
      `insert into practice_items (
         id, account_id, plan_id, phase_id, lesson_id, title, status,
         objective, rationale, instructions, time_or_cadence,
         success_check, common_mistake, stop_or_ask_rule, constraint_note
       ) values (
         'practice_legacy', 'account_legacy', 'plan_legacy', 'phase_legacy',
         'lesson_legacy', 'Legacy synthetic practice', 'active',
         'Repeat centered contact.', 'Support the current priority.', ?,
         'Two sets', 'Four centered strikes', 'Rushing transition',
         'Stop if discomfort appears', 'Use half swings if needed'
       )`,
    )
    .bind(JSON.stringify(["Rehearse", "Hit five shots"]))
    .run();
  await database
    .prepare(
      `insert into evidence_items (
         id, account_id, plan_id, phase_id, lesson_id, practice_item_id,
         media_asset_id, status, evidence_type, context_type, title, claim,
         source_label, source_type, comparison_role, interpretation,
         limitation, maturity, is_representative
       ) values (
         'evidence_legacy', 'account_legacy', 'plan_legacy', 'phase_legacy',
         'lesson_legacy', 'practice_legacy', 'media_legacy', 'published',
         'media', 'lesson', 'Legacy synthetic evidence',
         'Strike window narrowed in this set.', 'Coach-captured synthetic image',
         'coach_observed', 'baseline', 'Early bounded indication only.',
         'One synthetic set is not representative.', 'single_observation', 0
       )`,
    )
    .run();
  await database
    .prepare(
      `insert into phase_reviews (
         id, account_id, plan_id, phase_id, status, outcome,
         original_purpose, baseline_summary, work_completed, change_summary,
         reliability_label, limitations, coach_conclusion
       ) values (
         'review_legacy', 'account_legacy', 'plan_legacy', 'phase_legacy',
         'confirmed', 'partially_complete', 'Preserve contact purpose.',
         'Initial contact varied.', 'Completed the saved assignment.',
         'Contact narrowed in one set.', 'Early indication',
         'One set only.', 'Continue gathering representative evidence.'
       )`,
    )
    .run();
  await database
    .prepare(
      `insert into phase_review_evidence (
         account_id, phase_review_id, evidence_item_id, sort_order
       ) values (
         'account_legacy', 'review_legacy', 'evidence_legacy', 0
       )`,
    )
    .run();
}

async function seedPreLaunchReviewData(database) {
  await database
    .prepare(
      `insert into launch_monitor_imports (
         id, account_id, plan_id, source_media_asset_id, status,
         column_headers, column_mappings, validation_report,
         total_row_count, accepted_row_count, rejected_row_count,
         committed_at, created_at, updated_at
       ) values (
         'import_pre_0015', 'account_legacy', 'plan_legacy', 'media_legacy',
         'committed', ?, ?, ?, 1, 1, 0, ?, ?, ?
       )`,
    )
    .bind(
      JSON.stringify(["Carry"]),
      JSON.stringify({ Carry: "carry_distance" }),
      JSON.stringify({ version: "synthetic-pre-0015" }),
      1_786_300_000_000,
      1_786_200_000_000,
      1_786_300_000_000,
    )
    .run();
  await database
    .prepare(
      `insert into launch_monitor_sessions (
         id, account_id, plan_id, phase_id, lesson_id, import_id,
         source_media_asset_id, source_mode, session_date, device_source,
         coach_interpretation, limitations, representativeness, status,
         coach_approved_at, created_at, updated_at
       ) values (
         'session_pre_0015', 'account_legacy', 'plan_legacy', 'phase_legacy',
         'lesson_legacy', 'import_pre_0015', 'media_legacy', 'csv_import', ?,
         'Synthetic pre-0015 monitor', 'Preserve this committed session.',
         'Synthetic upgrade fixture only.', 'limited', 'committed', ?, ?, ?
       )`,
    )
    .bind(
      1_786_300_000_000,
      1_786_300_000_000,
      1_786_300_000_000,
      1_786_300_000_000,
    )
    .run();
}

async function applyMigration(database, migrationUrl) {
  const migration = await readFile(migrationUrl, "utf8");
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  return database.batch(statements.map((statement) => database.prepare(statement)));
}
