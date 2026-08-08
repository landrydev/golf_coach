import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coachA = { email: "coach.a@example.test", name: "Coach Avery" };
const coachB = { email: "coach.b@example.test", name: "Coach Blake" };

test("export checks conservative record counts before loading export collections", async () => {
  const source = await readFile(
    new URL("../lib/data-export.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /const MAX_COLLECTION_RECORDS = 250/);
  assert.match(source, /const MAX_TOTAL_RECORDS = 1_000/);
  const preflight = source.indexOf("await exceedsImmediateExportRecordBounds");
  const collectionLoad = source.indexOf("profileRows,");
  assert.ok(preflight >= 0 && preflight < collectionLoad);
});

test(
  "oversized synchronous exports create one durable tenant-scoped manual fallback",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    for (const identity of [coachA, coachB]) {
      const profile = await jsonWrite(worker, "/api/profile", "PUT", identity, {
        displayName: identity.name,
        contactEmail: identity.email,
      });
      assert.equal(profile.status, 200);
    }

    await worker.inspect([
      {
        sql: `with recursive seq(n) as (
                select 0
                union all select n + 1 from seq where n < 44
              ), numbered(n) as (
                select left_seq.n * 45 + right_seq.n + 1
                  from seq left_seq cross join seq right_seq
                 where left_seq.n * 45 + right_seq.n < 2001
              )
              insert into coaching_packages (
                id, account_id, name, purpose, fit_description, status,
                current_details_text, inclusions, terms_summary,
                external_action_type, external_action_label, external_action_url,
                is_default
              )
              select 'overflow_package_' || printf('%04d', numbered.n),
                     accounts.id,
                     'Overflow package ' || numbered.n,
                     'Synthetic portability capacity verification.',
                     'Synthetic fit description.',
                     'draft',
                     'Current details require coach confirmation.',
                     '[]',
                     'Synthetic terms.',
                     'contact',
                     'Contact coach',
                     'https://booking.example.ca/export-overflow',
                     0
                from numbered cross join accounts
               where accounts.normalized_email = ?`,
        params: [coachA.email],
      },
    ]);

    const first = await requestExport(worker, coachA);
    assert.equal(first.response.status, 202);
    assert.equal(first.body.deferred, true);
    assert.equal(first.body.existing, false);
    assert.equal(first.body.request.type, "export");
    assert.equal(first.body.request.status, "submitted");
    assert.match(first.body.message, /manual fulfilment/i);

    const retry = await requestExport(worker, coachA);
    assert.equal(retry.response.status, 202);
    assert.equal(retry.body.existing, true);
    assert.equal(retry.body.request.id, first.body.request.id);

    const otherTenant = await worker.dispatch("/api/data-export", {
      method: "POST",
      headers: writeHeaders(coachB.email, coachB.name),
      body: "{}",
    });
    assert.equal(otherTenant.status, 200);
    assert.match(
      otherTenant.headers.get("content-disposition") ?? "",
      /attachment; filename="roadmap-data-export-/,
    );
    const otherTenantBody = await otherTenant.json();
    assert.equal(otherTenantBody.account.primaryEmail, coachB.email);
    assert.deepEqual(otherTenantBody.coachingPackages, []);

    const inspection = await worker.inspect([
      {
        sql: `select count(*) as count, min(status) as status
                from data_requests
               where account_id = (select id from accounts where normalized_email = ?)
                 and request_type = 'export'
                 and status in ('submitted', 'identity_verification_required', 'verified', 'in_progress')`,
        params: [coachA.email],
      },
      {
        sql: `select count(*) as count,
                    json_extract(min(metadata), '$.reason') as reason
               from audit_events
              where account_id = (select id from accounts where normalized_email = ?)
                and action = 'data_request.submitted'
                and target_id = ?`,
        params: [coachA.email, first.body.request.id],
      },
      {
        sql: `select count(*) as count from data_requests
               where account_id = (select id from accounts where normalized_email = ?)
                 and request_type = 'export' and status = 'submitted'`,
        params: [coachB.email],
      },
    ]);
    assert.deepEqual(inspection[0].results, [{ count: 1, status: "submitted" }]);
    assert.deepEqual(inspection[1].results, [
      { count: 1, reason: "immediate_export_bounds" },
    ]);
    assert.deepEqual(inspection[2].results, [{ count: 0 }]);
  },
);

async function requestExport(worker, identity) {
  const response = await worker.dispatch("/api/data-export", {
    method: "POST",
    headers: writeHeaders(identity.email, identity.name),
    body: "{}",
  });
  return { response, body: await response.json() };
}

function jsonWrite(worker, path, method, identity, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(identity.email, identity.name),
    body: JSON.stringify(body),
  });
}
