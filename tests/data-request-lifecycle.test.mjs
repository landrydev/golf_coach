import assert from "node:assert/strict";
import { test } from "node:test";
import {
  identityHeaders,
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coachA = { email: "coach.a@example.test", name: "Coach Avery" };
const coachB = { email: "coach.b@example.test", name: "Coach Bailey" };

test(
  "deletion-review retries deduplicate atomically and status listings stay tenant-scoped",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const initialRace = await Promise.all(
      Array.from({ length: 6 }, () => submitDeletionReview(worker, coachA)),
    );
    const createdResults = initialRace.filter(
      (result) => result.response.status === 201,
    );
    const existingResults = initialRace.filter(
      (result) => result.response.status === 200,
    );
    assert.equal(createdResults.length, 1);
    assert.equal(existingResults.length, 5);

    const first = createdResults[0];
    assert.equal(first.body.existing, false);
    assert.equal(first.body.request.type, "deletion");
    assert.equal(first.body.request.status, "identity_verification_required");
    for (const result of existingResults) {
      assert.equal(result.body.existing, true);
      assert.equal(result.body.request.id, first.body.request.id);
    }

    const retry = await submitDeletionReview(worker, coachA);
    assert.equal(retry.response.status, 200);
    assert.equal(retry.body.existing, true);
    assert.equal(retry.body.request.id, first.body.request.id);

    const coachBBefore = await listRequests(worker, coachB);
    assert.equal(coachBBefore.response.status, 200);
    assert.deepEqual(coachBBefore.body.requests, []);

    const secondTenant = await submitDeletionReview(worker, coachB);
    assert.equal(secondTenant.response.status, 201);
    assert.notEqual(secondTenant.body.request.id, first.body.request.id);

    const [coachAList, coachBList] = await Promise.all([
      listRequests(worker, coachA),
      listRequests(worker, coachB),
    ]);
    assert.deepEqual(
      coachAList.body.requests.map((request) => request.id),
      [first.body.request.id],
    );
    assert.deepEqual(
      coachBList.body.requests.map((request) => request.id),
      [secondTenant.body.request.id],
    );
    assert.match(coachAList.response.headers.get("cache-control") ?? "", /no-store/i);

    const syntheticEpoch = Date.now() + 1_000;
    await worker.inspect(
      Array.from({ length: 26 }, (_, index) => ({
        sql: `insert into data_requests
                (id, account_id, request_type, requested_by_type, status, created_at, updated_at)
              select ?, id, 'export', 'account', 'fulfilled', ?, ?
                from accounts where normalized_email = ?`,
        params: [
          `crowded_export_${index}`,
          syntheticEpoch + index,
          syntheticEpoch + index,
          coachA.email,
        ],
      })),
    );
    const crowdedHistory = await listRequests(worker, coachA);
    assert.equal(crowdedHistory.body.requests.length, 26);
    assert.equal(crowdedHistory.body.requests[0].id, first.body.request.id);
    assert.equal(crowdedHistory.body.requests[0].status, "identity_verification_required");

    const page = await worker.dispatch("/app/settings/data", {
      headers: {
        ...identityHeaders(coachA.email, coachA.name),
        accept: "text/html",
      },
    });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Identity review required/);
    assert.match(html, /Identity has not yet been verified/);
    assert.match(html, /nothing is scheduled or deleted/);

    const inspection = await worker.inspect([
      {
        sql: `select count(*) as count,
                     min(status) as status,
                     max(identity_verified_at) as identity_verified_at,
                     max(deletion_scheduled_at) as deletion_scheduled_at,
                     max(fulfilled_at) as fulfilled_at
                from data_requests
               where account_id = (select id from accounts where normalized_email = ?)
                 and request_type = 'deletion'`,
        params: [coachA.email],
      },
      {
        sql: `select count(*) as count
                from audit_events
               where account_id = (select id from accounts where normalized_email = ?)
                 and action = 'data_request.submitted'
                 and target_id = ?`,
        params: [coachA.email, first.body.request.id],
      },
      {
        sql: `select status, deletion_scheduled_at
                from accounts
               where normalized_email = ?`,
        params: [coachA.email],
      },
    ]);

    assert.deepEqual(inspection[0].results, [
      {
        count: 1,
        status: "identity_verification_required",
        identity_verified_at: null,
        deletion_scheduled_at: null,
        fulfilled_at: null,
      },
    ]);
    assert.deepEqual(inspection[1].results, [{ count: 1 }]);
    assert.deepEqual(inspection[2].results, [
      { status: "active", deletion_scheduled_at: null },
    ]);
  },
);

test(
  "authenticated accounts can record each non-destructive data-rights review without mutating data",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const submissions = [
      ["access", "Please review access to all profile and coaching-plan records."],
      ["correction", "Please review the spelling of my business name."],
      ["restriction", "Please review restricting use of the listed contact number."],
      ["consent_withdrawal", "Please review withdrawal of optional product messaging consent."],
    ];

    for (const [type, details] of submissions) {
      const result = await submitDataReview(worker, coachA, type, details);
      assert.equal(result.response.status, 201);
      assert.equal(result.body.existing, false);
      assert.equal(result.body.request.type, type);
      assert.equal(result.body.request.status, "submitted");
    }

    const missingDetails = await submitDataReview(worker, coachA, "correction", "");
    assert.equal(missingDetails.response.status, 400);
    assert.equal(missingDetails.body.error.code, "invalid_field");
    assert.match(missingDetails.body.error.message, /details is required/i);

    const unsupported = await submitDataReview(
      worker,
      coachA,
      "automated_erasure",
      "Do something unsupported.",
    );
    assert.equal(unsupported.response.status, 400);
    assert.equal(unsupported.body.error.code, "invalid_field");

    const [coachAList, coachBList] = await Promise.all([
      listRequests(worker, coachA),
      listRequests(worker, coachB),
    ]);
    assert.equal(coachAList.response.status, 200);
    assert.deepEqual(
      new Set(coachAList.body.requests.map((request) => request.type)),
      new Set(submissions.map(([type]) => type)),
    );
    assert.deepEqual(coachBList.body.requests, []);

    const inspection = await worker.inspect([
      {
        sql: `select request_type, status, details,
                     identity_verified_at, deletion_scheduled_at, fulfilled_at
                from data_requests
               where account_id = (select id from accounts where normalized_email = ?)
               order by request_type`,
        params: [coachA.email],
      },
      {
        sql: `select count(*) as count
                from audit_events
               where account_id = (select id from accounts where normalized_email = ?)
                 and action = 'data_request.submitted'`,
        params: [coachA.email],
      },
    ]);
    assert.equal(inspection[0].results.length, 4);
    for (const row of inspection[0].results) {
      assert.equal(row.status, "submitted");
      assert.ok(row.details.length > 0);
      assert.equal(row.identity_verified_at, null);
      assert.equal(row.deletion_scheduled_at, null);
      assert.equal(row.fulfilled_at, null);
    }
    assert.deepEqual(inspection[1].results, [{ count: 4 }]);

    const page = await worker.dispatch("/app/settings/data", {
      headers: {
        ...identityHeaders(coachA.email, coachA.name),
        accept: "text/html",
      },
    });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Request a data-rights review/);
    assert.match(html, /Processing-restriction review/);
    assert.match(html, /no outcome or deadline is claimed/i);
  },
);

async function submitDeletionReview(worker, identity) {
  const response = await worker.dispatch("/api/data-requests", {
    method: "POST",
    headers: writeHeaders(identity.email, identity.name),
    body: JSON.stringify({ type: "deletion" }),
  });
  return { response, body: await response.json() };
}

async function submitDataReview(worker, identity, type, details) {
  const response = await worker.dispatch("/api/data-requests", {
    method: "POST",
    headers: writeHeaders(identity.email, identity.name),
    body: JSON.stringify({ type, details }),
  });
  return { response, body: await response.json() };
}

async function listRequests(worker, identity) {
  const response = await worker.dispatch("/api/data-requests", {
    headers: identityHeaders(identity.email, identity.name),
  });
  return { response, body: await response.json() };
}
