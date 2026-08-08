import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

    const raceKeys = Array.from(
      { length: 6 },
      (_, index) => `deletion-review-race-key-000${index}`,
    );
    const initialRace = await Promise.all(
      raceKeys.map(async (idempotencyKey) => ({
        ...(await submitDeletionReview(worker, coachA, idempotencyKey)),
        idempotencyKey,
      })),
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

    const retry = await submitDeletionReview(
      worker,
      coachA,
      "deletion-open-request-alias-0001",
    );
    assert.equal(retry.response.status, 200);
    assert.equal(retry.body.existing, true);
    assert.equal(retry.body.request.id, first.body.request.id);

    const aliasKey = existingResults[0].idempotencyKey;
    const aliasReplay = await submitDeletionReview(worker, coachA, aliasKey);
    assert.equal(aliasReplay.response.status, 200);
    assert.equal(aliasReplay.body.existing, true);
    assert.equal(aliasReplay.body.request.id, first.body.request.id);

    const changedAliasPayload = await submitDataReview(
      worker,
      coachA,
      "access",
      "A deletion alias key cannot be rebound to this access request.",
      aliasKey,
    );
    assert.equal(changedAliasPayload.response.status, 409);
    assert.equal(
      changedAliasPayload.body.error.code,
      "idempotency_key_reused",
    );

    const coachBBefore = await listRequests(worker, coachB);
    assert.equal(coachBBefore.response.status, 200);
    assert.deepEqual(coachBBefore.body.requests, []);

    const secondTenant = await submitDeletionReview(worker, coachB, aliasKey);
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
        sql: `select count(*) as count
                from audit_events
               where account_id = (select id from accounts where normalized_email = ?)
                 and action = 'data_request.idempotency_alias'`,
        params: [coachA.email],
      },
      {
        sql: `select id, request_id, metadata
                from audit_events
               where account_id = (select id from accounts where normalized_email = ?)
                 and action in ('data_request.submitted', 'data_request.idempotency_alias')
               order by action, request_id`,
        params: [coachA.email],
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
    assert.deepEqual(inspection[2].results, [{ count: 6 }]);
    assert.equal(inspection[3].results.length, 7);
    for (const receipt of inspection[3].results) {
      assert.match(receipt.id, /^[a-f0-9]{64}$/);
      assert.match(receipt.request_id, /^[0-9a-f-]{36}$/);
      assert.equal(raceKeys.includes(receipt.id), false);
      const metadata = JSON.parse(receipt.metadata);
      assert.match(metadata.inputFingerprint, /^[a-f0-9]{64}$/);
      assert.equal(metadata.requestCorrelationId, receipt.request_id);
      assert.equal(Object.hasOwn(metadata, "details"), false);
    }
    assert.deepEqual(inspection[4].results, [
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
      ["export", null],
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
    assert.equal(inspection[0].results.length, 5);
    for (const row of inspection[0].results) {
      assert.equal(row.status, "submitted");
      if (row.request_type === "export") assert.equal(row.details, null);
      else assert.ok(row.details.length > 0);
      assert.equal(row.identity_verified_at, null);
      assert.equal(row.deletion_scheduled_at, null);
      assert.equal(row.fulfilled_at, null);
    }
    assert.deepEqual(inspection[1].results, [{ count: 5 }]);

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

test(
  "non-deletion data-request keys are required, race-safe, payload-bound, and tenant-scoped",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const missingKeyHeaders = writeHeaders(coachA.email, coachA.name);
    delete missingKeyHeaders["idempotency-key"];
    const missingKey = await worker.dispatch("/api/data-requests", {
      method: "POST",
      headers: missingKeyHeaders,
      body: JSON.stringify({
        type: "access",
        details: "Please review my profile records.",
      }),
    });
    assert.equal(missingKey.status, 400);
    assert.equal((await missingKey.json()).error.code, "idempotency_key_required");

    const invalidKey = await submitDataReview(
      worker,
      coachA,
      "access",
      "Please review my profile records.",
      "too-short",
    );
    assert.equal(invalidKey.response.status, 400);
    assert.equal(invalidKey.body.error.code, "idempotency_key_required");

    const idempotencyKey = "account-data-request-racing-key-0001";
    const details = "Please review access to my profile and plan records.";
    const [first, racingRetry] = await Promise.all([
      submitDataReview(worker, coachA, "access", details, idempotencyKey),
      submitDataReview(worker, coachA, "access", details, idempotencyKey),
    ]);
    assert.deepEqual(
      [first.response.status, racingRetry.response.status].sort(
        (left, right) => left - right,
      ),
      [200, 201],
    );
    assert.equal(first.body.request.id, racingRetry.body.request.id);
    assert.deepEqual(
      [first.body.existing, racingRetry.body.existing].sort(),
      [false, true],
    );

    const sequentialReplay = await submitDataReview(
      worker,
      coachA,
      "access",
      details,
      idempotencyKey,
    );
    assert.equal(sequentialReplay.response.status, 200);
    assert.equal(sequentialReplay.body.existing, true);
    assert.equal(sequentialReplay.body.request.id, first.body.request.id);

    const normalizedReplay = await submitDataReview(
      worker,
      coachA,
      "access",
      `  ${details}  `,
      idempotencyKey,
    );
    assert.equal(normalizedReplay.response.status, 200);
    assert.equal(normalizedReplay.body.request.id, first.body.request.id);

    const changedDetails = await submitDataReview(
      worker,
      coachA,
      "access",
      "Please review a different set of records.",
      idempotencyKey,
    );
    assert.equal(changedDetails.response.status, 409);
    assert.equal(changedDetails.body.error.code, "idempotency_key_reused");

    const changedType = await submitDataReview(
      worker,
      coachA,
      "correction",
      details,
      idempotencyKey,
    );
    assert.equal(changedType.response.status, 409);
    assert.equal(changedType.body.error.code, "idempotency_key_reused");

    const sameKeyOtherTenant = await submitDataReview(
      worker,
      coachB,
      "access",
      details,
      idempotencyKey,
    );
    assert.equal(sameKeyOtherTenant.response.status, 201);
    assert.notEqual(sameKeyOtherTenant.body.request.id, first.body.request.id);

    const inspection = await worker.inspect([
      {
        sql: `select count(*) as count from data_requests
               where account_id = (select id from accounts where normalized_email = ?)`,
        params: [coachA.email],
      },
      {
        sql: `select count(*) as count from data_requests
               where account_id = (select id from accounts where normalized_email = ?)`,
        params: [coachB.email],
      },
      {
        sql: `select id, target_id, request_id, metadata from audit_events
               where account_id = (select id from accounts where normalized_email = ?)
                 and action = 'data_request.submitted'`,
        params: [coachA.email],
      },
    ]);
    assert.deepEqual(inspection[0].results, [{ count: 1 }]);
    assert.deepEqual(inspection[1].results, [{ count: 1 }]);
    assert.equal(inspection[2].results.length, 1);
    const receipt = inspection[2].results[0];
    assert.equal(receipt.id, first.body.request.id);
    assert.equal(receipt.target_id, first.body.request.id);
    assert.match(receipt.id, /^[a-f0-9]{64}$/);
    assert.notEqual(receipt.id, idempotencyKey);
    assert.match(receipt.request_id, /^[0-9a-f-]{36}$/);
    assert.notEqual(receipt.request_id, receipt.id);
    const metadata = JSON.parse(receipt.metadata);
    assert.match(metadata.inputFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(metadata.requestCorrelationId, receipt.request_id);
    assert.equal(Object.hasOwn(metadata, "details"), false);
  },
);

test("data-request controls retain retry keys only while the result is ambiguous", async () => {
  const source = await readFile(
    new URL(
      "../app/app/settings/data/DataRequestControls.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /const deletionIdempotencyKeyRef = useRef\(""\)/);
  assert.match(source, /const manualReviewIdempotencyRef = useRef</);
  assert.equal(source.match(/"Idempotency-Key":/g)?.length, 2);
  assert.match(
    source,
    /"Idempotency-Key": deletionIdempotencyKeyRef\.current/,
  );
  assert.match(
    source,
    /"Idempotency-Key": manualReviewIdempotencyRef\.current\.key/,
  );
  assert.match(source, /const intent = JSON\.stringify\(\[reviewType, details\]\)/);
  assert.match(
    source,
    /if \(definitiveOutcome\) deletionIdempotencyKeyRef\.current = ""/,
  );
  assert.match(
    source,
    /if \(definitiveOutcome\) manualReviewIdempotencyRef\.current = null/,
  );
  assert.doesNotMatch(
    source,
    /finally\s*\{\s*deletionIdempotencyKeyRef\.current = ""/s,
  );
  assert.doesNotMatch(
    source,
    /finally\s*\{\s*manualReviewIdempotencyRef\.current = null/s,
  );
});

async function submitDeletionReview(
  worker,
  identity,
  idempotencyKey = crypto.randomUUID(),
) {
  const response = await worker.dispatch("/api/data-requests", {
    method: "POST",
    headers: {
      ...writeHeaders(identity.email, identity.name),
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ type: "deletion" }),
  });
  return { response, body: await response.json() };
}

async function submitDataReview(
  worker,
  identity,
  type,
  details,
  idempotencyKey = crypto.randomUUID(),
) {
  const response = await worker.dispatch("/api/data-requests", {
    method: "POST",
    headers: {
      ...writeHeaders(identity.email, identity.name),
      "idempotency-key": idempotencyKey,
    },
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
