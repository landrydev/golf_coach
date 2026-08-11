import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startD1Worker } from "./support/d1-worker.mjs";

const migrationUrl = new URL(
  "../drizzle/0016_handy_green_goblin.sql",
  import.meta.url,
);

test(
  "0016 upgrades an existing 0015 database with tenant-safe immutable replacement lineage",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({}, { migrationThroughIndex: 15 });
    context.after(() => worker.dispose());
    const database = await worker.database();
    await seedPreReplacementData(database);
    await applyMigration(database, migrationUrl);

    const preserved = await database
      .prepare(
        `select p.id, p.status, s.title, s.purpose, s.steps
           from practice_items p
           join practice_assignment_snapshots s
             on s.account_id = p.account_id
            and s.plan_id = p.plan_id
            and s.practice_item_id = p.id
          where p.id = 'practice_before_0016'`,
      )
      .first();
    assert.deepEqual(preserved, {
      id: "practice_before_0016",
      status: "active",
      title: "Pre-0016 structured assignment",
      purpose: "Preserve this immutable purpose.",
      steps: JSON.stringify(["Retain this step."]),
    });

    await database
      .prepare(
        `insert into practice_items (
           id, account_id, plan_id, phase_id, title, status, objective,
           rationale, instructions, time_or_cadence, success_check,
           stop_or_ask_rule
         ) values (
           'practice_after_0016', 'account_upgrade', 'plan_upgrade',
           'phase_upgrade', 'Post-0016 replacement', 'active',
           'Edited purpose.', 'Edited rationale.', ?, 'Three sets',
           'Three reviewed repetitions', 'Stop and ask if discomfort appears'
         )`,
      )
      .bind(JSON.stringify(["Use the edited step."]))
      .run();
    await database
      .prepare(
        `insert into practice_assignment_replacements (
           account_id, plan_id, replaced_practice_item_id,
           replacement_practice_item_id, replaced_status,
           replacement_plan_revision
         ) values (
           'account_upgrade', 'plan_upgrade', 'practice_before_0016',
           'practice_after_0016', 'active', 5
         )`,
      )
      .run();

    const lineage = await database
      .prepare(
        `select account_id, plan_id, replaced_practice_item_id,
                replacement_practice_item_id, replaced_status,
                replacement_plan_revision
           from practice_assignment_replacements`,
      )
      .all();
    assert.deepEqual(lineage.results, [
      {
        account_id: "account_upgrade",
        plan_id: "plan_upgrade",
        replaced_practice_item_id: "practice_before_0016",
        replacement_practice_item_id: "practice_after_0016",
        replaced_status: "active",
        replacement_plan_revision: 5,
      },
    ]);

    await assert.rejects(
      database
        .prepare(
          `update practice_assignment_replacements
              set replacement_plan_revision = 6
            where replaced_practice_item_id = 'practice_before_0016'`,
        )
        .run(),
      /replacement lineage is immutable/i,
    );
    await assert.rejects(
      database
        .prepare(
          `delete from practice_assignment_replacements
            where replaced_practice_item_id = 'practice_before_0016'`,
        )
        .run(),
      /replacement lineage is immutable/i,
    );
    await assert.rejects(
      database.prepare("delete from practice_items where id = 'practice_before_0016'").run(),
      /replacement lineage is immutable/i,
    );

    await database
      .prepare(
        `insert into practice_items (
           id, account_id, plan_id, phase_id, title, status, objective,
           rationale, instructions, success_check, stop_or_ask_rule
         ) values (
           'practice_other', 'account_upgrade', 'plan_upgrade',
           'phase_upgrade', 'Other same-plan practice', 'active',
           'Other purpose.', 'Other rationale.', ?, 'Other success.',
           'Other stop rule.'
         )`,
      )
      .bind(JSON.stringify(["Other step."]))
      .run();
    await assert.rejects(
      database
        .prepare(
          `insert into practice_assignment_replacements (
             account_id, plan_id, replaced_practice_item_id,
             replacement_practice_item_id, replaced_status,
             replacement_plan_revision
           ) values (
             'account_upgrade', 'plan_upgrade', 'practice_other',
             'practice_after_0016', 'active', 6
           )`,
        )
        .run(),
      /unique constraint failed/i,
    );
    await assert.rejects(
      database
        .prepare(
          `insert into practice_assignment_replacements (
             account_id, plan_id, replaced_practice_item_id,
             replacement_practice_item_id, replaced_status,
             replacement_plan_revision
           ) values (
             'account_upgrade', 'plan_upgrade', 'practice_other',
             'practice_other', 'active', 6
           )`,
        )
        .run(),
      /check constraint failed/i,
    );
    await assert.rejects(
      database
        .prepare(
          `insert into practice_assignment_replacements (
             account_id, plan_id, replaced_practice_item_id,
             replacement_practice_item_id, replaced_status,
             replacement_plan_revision
           ) values (
             'account_upgrade', 'plan_upgrade', 'practice_other',
             'practice_other_plan', 'active', 6
           )`,
        )
        .run(),
      /foreign key constraint failed/i,
    );

    const triggers = await database
      .prepare(
        `select name from sqlite_master
          where type = 'trigger'
            and name like 'practice_assignment_replacements_immutable_%'
          order by name`,
      )
      .all();
    assert.deepEqual(triggers.results, [
      { name: "practice_assignment_replacements_immutable_delete" },
      { name: "practice_assignment_replacements_immutable_update" },
    ]);
    assert.deepEqual((await database.prepare("pragma foreign_key_check").all()).results, []);

    // Direct history deletion is forbidden, while the intentional owning-plan
    // cascade remains available for a future account/data-deletion workflow.
    await database.prepare("delete from development_plans where id = 'plan_upgrade'").run();
    assert.equal(
      (
        await database
          .prepare("select count(*) as count from practice_assignment_replacements")
          .first()
      ).count,
      0,
    );
    assert.deepEqual((await database.prepare("pragma foreign_key_check").all()).results, []);

    await database
      .prepare(
        `insert into practice_items (
           id, account_id, plan_id, phase_id, title, status, objective,
           rationale, instructions, success_check, stop_or_ask_rule
         ) values (
           'practice_other_plan_next', 'account_upgrade', 'plan_other',
           'phase_other', 'Other-plan replacement', 'active', 'Next purpose.',
           'Next rationale.', ?, 'Next success.', 'Next stop rule.'
         )`,
      )
      .bind(JSON.stringify(["Next step."]))
      .run();
    await database
      .prepare(
        `insert into practice_assignment_replacements (
           account_id, plan_id, replaced_practice_item_id,
           replacement_practice_item_id, replaced_status,
           replacement_plan_revision
         ) values (
           'account_upgrade', 'plan_other', 'practice_other_plan',
           'practice_other_plan_next', 'active', 2
         )`,
      )
      .run();
    await database.prepare("delete from accounts where id = 'account_upgrade'").run();
    assert.equal(
      (
        await database
          .prepare("select count(*) as count from practice_assignment_replacements")
          .first()
      ).count,
      0,
    );
    assert.deepEqual((await database.prepare("pragma foreign_key_check").all()).results, []);
  },
);

async function seedPreReplacementData(database) {
  await database
    .prepare(
      `insert into accounts (
         id, auth_provider, auth_subject, primary_email, normalized_email,
         email_verified_at, status
       ) values (
         'account_upgrade', 'development', 'upgrade-subject',
         'upgrade@example.test', 'upgrade@example.test', ?, 'active'
       )`,
    )
    .bind(1_786_000_000_000)
    .run();
  await database.batch([
    database.prepare(
      `insert into golfers (
         id, account_id, display_name, status, eligibility_status
       ) values (
         'golfer_upgrade', 'account_upgrade', 'Upgrade synthetic golfer',
         'active', 'adult_confirmed'
       )`,
    ),
    database.prepare(
      `insert into golfers (
         id, account_id, display_name, status, eligibility_status
       ) values (
         'golfer_other_plan', 'account_upgrade', 'Other synthetic golfer',
         'active', 'adult_confirmed'
       )`,
    ),
  ]);
  await database.batch([
    database.prepare(
      `insert into development_plans (
         id, account_id, golfer_id, title, status, revision
       ) values (
         'plan_upgrade', 'account_upgrade', 'golfer_upgrade',
         'Upgrade synthetic plan', 'draft', 4
       )`,
    ),
    database.prepare(
      `insert into development_plans (
         id, account_id, golfer_id, title, status, revision
       ) values (
         'plan_other', 'account_upgrade', 'golfer_other_plan',
         'Other synthetic plan', 'draft', 1
       )`,
    ),
  ]);
  await database.batch([
    database.prepare(
      `insert into plan_phases (
         id, account_id, plan_id, sequence, title, purpose, status
       ) values (
         'phase_upgrade', 'account_upgrade', 'plan_upgrade', 1,
         'Upgrade phase', 'Preserve this phase.', 'active'
       )`,
    ),
    database.prepare(
      `insert into plan_phases (
         id, account_id, plan_id, sequence, title, purpose, status
       ) values (
         'phase_other', 'account_upgrade', 'plan_other', 1,
         'Other phase', 'Preserve this phase.', 'active'
       )`,
    ),
  ]);
  await database
    .prepare(
      `insert into practice_items (
         id, account_id, plan_id, phase_id, title, status, objective,
         rationale, instructions, time_or_cadence, success_check,
         stop_or_ask_rule
       ) values (
         'practice_before_0016', 'account_upgrade', 'plan_upgrade',
         'phase_upgrade', 'Pre-0016 structured assignment', 'active',
         'Preserve this immutable purpose.', 'Preserve this rationale.', ?,
         'Two sets', 'Two reviewed repetitions',
         'Stop and ask if discomfort appears'
       )`,
    )
    .bind(JSON.stringify(["Retain this step."]))
    .run();
  await database
    .prepare(
      `insert into practice_assignment_snapshots (
         account_id, plan_id, practice_item_id, was_customized, title,
         purpose, when_it_fits, equipment, setup, steps,
         dosage_or_cadence, success_check, stop_or_ask_rule
       ) values (
         'account_upgrade', 'plan_upgrade', 'practice_before_0016', 1,
         'Pre-0016 structured assignment',
         'Preserve this immutable purpose.', 'Preserve this fit.', ?,
         'Preserve this setup.', ?, 'Two sets',
         'Two reviewed repetitions', 'Stop and ask if discomfort appears'
       )`,
    )
    .bind(JSON.stringify(["Two tees"]), JSON.stringify(["Retain this step."]))
    .run();
  await database
    .prepare(
      `insert into practice_items (
         id, account_id, plan_id, phase_id, title, status, objective,
         rationale, instructions, success_check, stop_or_ask_rule
       ) values (
         'practice_other_plan', 'account_upgrade', 'plan_other',
         'phase_other', 'Cross-plan target', 'active', 'Other purpose.',
         'Other rationale.', ?, 'Other success.', 'Other stop rule.'
       )`,
    )
    .bind(JSON.stringify(["Other step."]))
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
