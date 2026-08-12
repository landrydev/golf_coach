import assert from "node:assert/strict";
import test from "node:test";
import {
  identityHeaders,
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const operator = {
  email: "coach.a@example.test",
  name: "Coach Avery",
};
const nonOperator = {
  email: "coach.b@example.test",
  name: "Coach Blair",
};

test(
  "operator queue and dry-run detail are allowlisted, minimal, and tenant-scoped",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const operatorRequest = await submitReview(
      worker,
      operator,
      "correction",
      "Correct a private business-name value that must not appear in operator JSON.",
    );
    const otherRequest = await submitReview(
      worker,
      nonOperator,
      "access",
      "Review private records without echoing this text in operator JSON.",
    );
    assert.equal(operatorRequest.response.status, 201);
    assert.equal(otherRequest.response.status, 201);

    const packageResponse = await worker.dispatch("/api/packages", {
      method: "POST",
      headers: writeHeaders(operator.email, operator.name),
      body: JSON.stringify({
        title: "Operator inventory fixture",
        description: "A synthetic, non-commercial package.",
        priceCents: null,
        currency: null,
        currentDetailsText: "Contact the instructor for current details.",
        terms: "No transaction occurs.",
        inclusions: ["One synthetic fixture"],
        externalActionUrl: "https://booking.example.ca/operator-fixture",
        status: "draft",
        isDefault: false,
      }),
    });
    assert.equal(packageResponse.status, 201);

    const deniedQueue = await operatorGet(
      worker,
      "/api/operations/data-requests",
      nonOperator,
    );
    assert.equal(deniedQueue.response.status, 403);
    assert.equal(
      deniedQueue.body.error.code,
      "data_request_operator_access_denied",
    );
    assert.doesNotMatch(JSON.stringify(deniedQueue.body), /coach\.[ab]@/i);

    const queue = await operatorGet(
      worker,
      "/api/operations/data-requests",
      operator,
    );
    assert.equal(queue.response.status, 200);
    assert.equal(queue.body.requests.length, 2);
    assert.equal(queue.body.capabilities.fulfillmentAvailable, false);
    assert.equal(queue.body.capabilities.deletionAvailable, false);
    assert.equal(queue.body.capabilities.statusTransitionAvailable, true);
    assert.equal(
      queue.body.requests.every(
        (request) => request.capabilities.statusTransitionAvailable === true,
      ),
      true,
    );
    assert.notEqual(
      queue.body.requests[0].tenantReference,
      queue.body.requests[1].tenantReference,
    );
    assertNoPrivateOperatorData(queue.body);

    const [operatorDetail, otherDetail] = await Promise.all([
      operatorGet(
        worker,
        `/api/operations/data-requests/${operatorRequest.body.request.id}`,
        operator,
      ),
      operatorGet(
        worker,
        `/api/operations/data-requests/${otherRequest.body.request.id}`,
        operator,
      ),
    ]);
    assert.equal(operatorDetail.response.status, 200);
    assert.equal(otherDetail.response.status, 200);
    assert.equal(operatorDetail.body.inventory.kind, "dry_run");
    assert.equal(
      operatorDetail.body.inventory.destructiveActionsPerformed,
      false,
    );
    assert.equal(operatorDetail.body.capabilities.fulfillmentAvailable, false);
    assert.equal(operatorDetail.body.capabilities.deletionAvailable, false);
    assert.equal(
      operatorDetail.body.capabilities.statusTransitionAvailable,
      true,
    );
    assert.equal(
      operatorDetail.body.request.capabilities.statusTransitionAvailable,
      true,
    );
    assert.equal(operatorDetail.body.request.detailsProvided, true);
    assertNoPrivateOperatorData(operatorDetail.body);
    assertNoPrivateOperatorData(otherDetail.body);

    const operatorPackageCount = collectionCount(
      operatorDetail.body,
      "coaching_packages",
    );
    const otherPackageCount = collectionCount(
      otherDetail.body,
      "coaching_packages",
    );
    assert.equal(operatorPackageCount, 1);
    assert.equal(otherPackageCount, 0);

    const deniedCrossTenantDetail = await operatorGet(
      worker,
      `/api/operations/data-requests/${operatorRequest.body.request.id}`,
      nonOperator,
    );
    assert.equal(deniedCrossTenantDetail.response.status, 403);
    assert.doesNotMatch(
      JSON.stringify(deniedCrossTenantDetail.body),
      new RegExp(operatorRequest.body.request.id, "i"),
    );

    const audit = await worker.inspect([
      {
        sql: `select action, actor_reference, request_id, metadata
                from audit_events
               where action in ('data_request.operator_queue_viewed',
                                'data_request.operator_detail_viewed')
               order by occurred_at, id`,
      },
    ]);
    assert.equal(audit[0].results.length, 3);
    for (const event of audit[0].results) {
      assert.match(event.actor_reference, /^[a-f0-9]{64}$/);
      assert.match(event.request_id, /^[0-9a-f-]{36}$/);
      assertNoPrivateOperatorData(event);
    }
  },
);

test(
  "operator configuration fails closed independently of product access",
  { timeout: 90_000 },
  async (context) => {
    for (const bindings of [
      { DATA_REQUEST_OPERATOR_ACCESS_PEPPER: "" },
      { DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: "" },
      { DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: "invalid" },
    ]) {
      const worker = await startD1Worker(bindings);
      context.after(() => worker.dispose());
      const response = await worker.dispatch("/api/operations/data-requests", {
        headers: identityHeaders(operator.email, operator.name),
      });
      assert.equal(response.status, 503);
      assert.equal(
        (await response.json()).error.code,
        "data_request_operator_access_unavailable",
      );
    }
  },
);

test(
  "operator queue keysets cannot be starved by old, orphaned, or future-dated rows",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const seed = await submitReview(
      worker,
      operator,
      "access",
      "Synthetic pagination account seed.",
    );
    assert.equal(seed.response.status, 201);
    const accountInspection = await worker.inspect([
      {
        sql: "select account_id from data_requests where id = ?",
        params: [seed.body.request.id],
      },
    ]);
    const accountId = accountInspection[0].results[0].account_id;
    assert.equal(typeof accountId, "string");

    const oldCreatedAt = Date.now() - 60_000;
    const oldIds = Array.from(
      { length: 5 },
      (_, index) => `old_in_progress_${index}`,
    );
    const orphanId = "orphan_private_do_not_echo";
    const futureId = "future_private_do_not_echo";
    const verifiedId = "verified_read_only";
    const readOnlyRows = [
      [oldIds[0], "in_progress", "in_progress"],
      [verifiedId, "verified", "verified"],
      ["terminal_denied_read_only", "denied", "denied"],
      ["terminal_canceled_read_only", "canceled", "cancelled"],
      ["terminal_fulfilled_read_only", "fulfilled", "fulfilled"],
      ["terminal_failed_read_only", "failed", "failed"],
    ];
    await worker.inspect([
      ...oldIds.map((id) => ({
        sql: `insert into data_requests
                (id, account_id, request_type, requested_by_type, status,
                 created_at, updated_at)
              values (?, ?, 'restriction', 'support', 'in_progress', ?, ?)`,
        params: [id, accountId, oldCreatedAt, oldCreatedAt],
      })),
      {
        sql: `insert into data_requests
                (id, account_id, request_type, requested_by_type, status,
                 details, created_at, updated_at)
              values (?, null, 'access', 'support', 'submitted', ?, ?, ?)`,
        params: [
          orphanId,
          "Sensitive orphan detail that must not be operational evidence.",
          oldCreatedAt,
          oldCreatedAt,
        ],
      },
      {
        sql: `insert into data_requests
                (id, account_id, request_type, requested_by_type, status,
                 created_at, updated_at)
              values (?, ?, 'access', 'support', 'submitted', ?, ?)`,
        params: [
          futureId,
          accountId,
          Date.now() + 3_600_000,
          Date.now() + 3_600_000,
        ],
      },
      {
        sql: `insert into data_requests
                (id, account_id, request_type, requested_by_type, status,
                 identity_verified_at, created_at, updated_at)
              values (?, ?, 'access', 'support', 'verified', ?, ?, ?)`,
        params: [
          verifiedId,
          accountId,
          oldCreatedAt,
          oldCreatedAt,
          oldCreatedAt,
        ],
      },
      ...readOnlyRows.slice(2).map(([id, status]) => ({
        sql: `insert into data_requests
                (id, account_id, request_type, requested_by_type, status,
                 created_at, updated_at)
              values (?, ?, 'correction', 'support', ?, ?, ?)`,
        params: [id, accountId, status, oldCreatedAt, oldCreatedAt],
      })),
    ]);

    const newest = await submitReview(
      worker,
      operator,
      "correction",
      "The newest submitted request must appear on the first page.",
    );
    assert.equal(newest.response.status, 201);

    const seen = [];
    let path = "/api/operations/data-requests?limit=2";
    let pageNumber = 0;
    do {
      const page = await operatorGet(worker, path, operator);
      assert.equal(page.response.status, 200);
      assert.equal(page.body.excludedOrphanCount, 1);
      assert.equal(page.body.excludedFutureDatedCount, 1);
      assert.equal(page.body.requests.length <= 2, true);
      assert.equal(
        page.body.capabilities.statusTransitionAvailable,
        page.body.requests.some(
          (request) => request.status === "submitted",
        ),
      );
      for (const request of page.body.requests) {
        assert.equal(
          request.capabilities.statusTransitionAvailable,
          request.status === "submitted",
        );
      }
      assert.doesNotMatch(JSON.stringify(page.body), new RegExp(orphanId, "i"));
      assert.doesNotMatch(JSON.stringify(page.body), new RegExp(futureId, "i"));
      if (pageNumber === 0) {
        assert.equal(page.body.requests[0].id, newest.body.request.id);
      }
      seen.push(...page.body.requests.map((request) => request.id));
      if (page.body.hasMore) {
        assert.match(page.body.nextCursor, /^[A-Za-z0-9_-]+$/);
        assert.equal(page.body.nextCursor.length <= 512, true);
        path = `/api/operations/data-requests?limit=2&cursor=${encodeURIComponent(page.body.nextCursor)}`;
      } else {
        assert.equal(page.body.nextCursor, null);
        path = null;
      }
      pageNumber += 1;
      assert.equal(pageNumber <= 10, true, "pagination must terminate");
    } while (path);

    assert.deepEqual(
      [...seen].sort(),
      [seed.body.request.id, newest.body.request.id, verifiedId, ...oldIds].sort(),
    );
    assert.equal(new Set(seen).size, seen.length);

    for (const [readOnlyId, , apiStatus] of readOnlyRows) {
      const detail = await operatorGet(
        worker,
        `/api/operations/data-requests/${readOnlyId}`,
        operator,
      );
      assert.equal(detail.response.status, 200);
      assert.equal(detail.body.request.status, apiStatus);
      assert.equal(detail.body.capabilities.statusTransitionAvailable, false);
      assert.equal(
        detail.body.request.capabilities.statusTransitionAvailable,
        false,
      );

      const rejectedPatch = await patchRaw(
        worker,
        operator,
        readOnlyId,
        {
          expectedStatus: apiStatus,
          expectedUpdatedAt: oldCreatedAt,
          targetStatus: "identity_verification_required",
        },
        `operator-read-only-${readOnlyId}`,
      );
      assert.equal(rejectedPatch.response.status, 400);
      assert.equal(rejectedPatch.body.error.code, "invalid_field");
    }

    const auditInspection = await worker.inspect([
      {
        sql: `select metadata from audit_events
               where action = 'data_request.operator_queue_viewed'
               order by occurred_at, id`,
      },
    ]);
    assert.equal(auditInspection[0].results.length, pageNumber);
    for (const event of auditInspection[0].results) {
      const metadata = JSON.parse(event.metadata);
      assert.equal(metadata.excludedOrphanCount, 1);
      assert.equal(metadata.excludedFutureDatedCount, 1);
      assert.equal(Number.isSafeInteger(metadata.asOf), true);
      assertNoPrivateOperatorData(event);
      assert.doesNotMatch(JSON.stringify(event), new RegExp(orphanId, "i"));
      assert.doesNotMatch(JSON.stringify(event), new RegExp(futureId, "i"));
    }
  },
);

test(
  "operator review marker is CAS-fenced, replay-safe, and never attests verification",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const first = await submitReview(
      worker,
      operator,
      "access",
      "Review access to my synthetic account records.",
    );
    assert.equal(first.response.status, 201);
    const initial = first.body.request;
    const stableKey = "operator-transition-stable-key-0001";

    const verificationRequired = await transition(
      worker,
      operator,
      initial,
      "identity_verification_required",
      stableKey,
    );
    assert.equal(verificationRequired.response.status, 200);
    assert.equal(verificationRequired.body.replayed, false);
    assert.equal(
      verificationRequired.body.request.status,
      "identity_verification_required",
    );
    assert.equal(
      verificationRequired.body.capabilities.statusTransitionAvailable,
      false,
    );
    assert.equal(
      verificationRequired.body.request.capabilities.statusTransitionAvailable,
      false,
    );
    assert.equal(verificationRequired.body.capabilities.fulfillmentAvailable, false);
    assert.equal(verificationRequired.body.capabilities.deletionAvailable, false);
    assert.match(verificationRequired.body.receiptId, /^[a-f0-9]{64}$/);
    assert.notEqual(
      verificationRequired.body.receiptId,
      verificationRequired.response.headers.get("x-request-id"),
    );

    const replay = await transition(
      worker,
      operator,
      initial,
      "identity_verification_required",
      stableKey,
    );
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.receiptId, verificationRequired.body.receiptId);
    assert.equal(
      replay.body.request.updatedAt,
      verificationRequired.body.request.updatedAt,
    );
    assert.equal(replay.body.capabilities.statusTransitionAvailable, false);

    const changedPayload = await patchRaw(
      worker,
      operator,
      initial.id,
      {
        expectedStatus: "submitted",
        expectedUpdatedAt: initial.updatedAt + 1,
        targetStatus: "identity_verification_required",
      },
      stableKey,
    );
    assert.equal(changedPayload.response.status, 409);
    assert.equal(changedPayload.body.error.code, "idempotency_key_reused");

    const raceSeed = await submitReview(
      worker,
      operator,
      "restriction",
      "Review a synthetic processing restriction.",
    );
    const [firstMarker, secondMarker] = await Promise.all([
      transition(
        worker,
        operator,
        raceSeed.body.request,
        "identity_verification_required",
        "operator-race-require-verification-0001",
      ),
      transition(
        worker,
        operator,
        raceSeed.body.request,
        "identity_verification_required",
        "operator-race-second-marker-000001",
      ),
    ]);
    assert.deepEqual(
      [firstMarker.response.status, secondMarker.response.status].sort(
        (left, right) => left - right,
      ),
      [200, 409],
    );
    const raceLoser =
      firstMarker.response.status === 409 ? firstMarker : secondMarker;
    assert.equal(raceLoser.body.error.code, "data_request_version_conflict");

    const firstSharedTarget = await submitReview(
      worker,
      operator,
      "correction",
      "Review a second synthetic correction target.",
    );
    const secondSharedTarget = await submitReview(
      worker,
      nonOperator,
      "export",
      null,
    );
    const sharedKey = "operator-cross-target-shared-key-0001";
    const [firstTarget, secondTarget] = await Promise.all([
      transition(
        worker,
        operator,
        firstSharedTarget.body.request,
        "identity_verification_required",
        sharedKey,
      ),
      transition(
        worker,
        operator,
        secondSharedTarget.body.request,
        "identity_verification_required",
        sharedKey,
      ),
    ]);
    assert.equal(firstTarget.response.status, 200);
    assert.equal(secondTarget.response.status, 200);
    assert.notEqual(firstTarget.body.receiptId, secondTarget.body.receiptId);

    for (const [index, unsupportedStatus] of [
      "submitted",
      "verified",
      "in_progress",
      "denied",
      "cancelled",
      "fulfilled",
      "failed",
    ].entries()) {
      const unsupported = await patchRaw(
        worker,
        operator,
        firstSharedTarget.body.request.id,
        {
          expectedStatus: "submitted",
          expectedUpdatedAt: firstSharedTarget.body.request.updatedAt,
          targetStatus: unsupportedStatus,
        },
        `operator-unsupported-terminal-${index}-0001`,
      );
      assert.equal(unsupported.response.status, 400);
      assert.equal(unsupported.body.error.code, "invalid_field");
    }

    for (const [index, readOnlyStatus] of [
      "identity_verification_required",
      "verified",
      "in_progress",
      "denied",
      "cancelled",
      "fulfilled",
      "failed",
    ].entries()) {
      const unsupported = await patchRaw(
        worker,
        operator,
        firstSharedTarget.body.request.id,
        {
          expectedStatus: readOnlyStatus,
          expectedUpdatedAt: firstSharedTarget.body.request.updatedAt,
          targetStatus: "identity_verification_required",
        },
        `operator-unsupported-existing-state-${index}-0001`,
      );
      assert.equal(unsupported.response.status, 400);
      assert.equal(unsupported.body.error.code, "invalid_field");
    }

    const overposted = await patchRaw(
      worker,
      operator,
      firstSharedTarget.body.request.id,
      {
        expectedStatus: "submitted",
        expectedUpdatedAt: firstSharedTarget.body.request.updatedAt,
        targetStatus: "identity_verification_required",
        operatorApproved: true,
      },
      "operator-overposting-rejection-key-0001",
    );
    assert.equal(overposted.response.status, 400);
    assert.equal(overposted.body.error.code, "unexpected_field");

    const crossOrigin = await worker.dispatch(
      `/api/operations/data-requests/${firstSharedTarget.body.request.id}`,
      {
        method: "PATCH",
        headers: {
          ...identityHeaders(operator.email, operator.name),
          "content-type": "application/json",
          "idempotency-key": "operator-cross-origin-rejection-0001",
          origin: "https://attacker.invalid",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({
          expectedStatus: "submitted",
          expectedUpdatedAt: firstSharedTarget.body.request.updatedAt,
          targetStatus: "identity_verification_required",
        }),
      },
    );
    assert.equal(crossOrigin.status, 403);

    const deleteAttempt = await worker.dispatch(
      `/api/operations/data-requests/${firstSharedTarget.body.request.id}`,
      {
        method: "DELETE",
        headers: writeHeaders(operator.email, operator.name),
        body: "{}",
      },
    );
    assert.equal(deleteAttempt.status >= 400, true);

    const inspection = await worker.inspect([
      {
        sql: `select e.id, e.target_id, e.actor_reference, e.request_id,
                     e.metadata, d.id as request_exists
                from audit_events e
                left join data_requests d on d.id = e.target_id
               where e.action = 'data_request.operator_status_transitioned'
               order by e.occurred_at, e.id`,
      },
      {
        sql: `select count(*) as count
                from data_requests
               where fulfilled_at is not null
                  or deletion_scheduled_at is not null`,
      },
      {
        sql: `select count(*) as count
                from data_requests
               where identity_verified_at is not null
                  or status in ('verified', 'in_progress')`,
      },
    ]);
    assert.equal(inspection[0].results.length, 4);
    for (const event of inspection[0].results) {
      assert.match(event.id, /^[a-f0-9]{64}$/);
      assert.match(event.actor_reference, /^[a-f0-9]{64}$/);
      assert.match(event.request_id, /^[0-9a-f-]{36}$/);
      assert.notEqual(event.id, event.request_id);
      assert.equal(event.request_exists, event.target_id);
      const metadata = JSON.parse(event.metadata);
      assert.match(metadata.inputFingerprint, /^[a-f0-9]{64}$/);
      assert.equal(metadata.receiptKind, "operator_status_transition");
      assert.equal(metadata.fromStatus, "submitted");
      assert.equal(metadata.toStatus, "identity_verification_required");
      assertNoPrivateOperatorData(event);
    }
    assert.deepEqual(inspection[1].results, [{ count: 0 }]);
    assert.deepEqual(inspection[2].results, [{ count: 0 }]);
  },
);

async function submitReview(worker, identity, type, details) {
  const response = await worker.dispatch("/api/data-requests", {
    method: "POST",
    headers: {
      ...writeHeaders(identity.email, identity.name),
      "idempotency-key": `data-request-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({ type, details }),
  });
  return { response, body: await response.json() };
}

async function operatorGet(worker, path, identity) {
  const response = await worker.dispatch(path, {
    headers: identityHeaders(identity.email, identity.name),
  });
  return { response, body: await response.json() };
}

async function transition(
  worker,
  identity,
  request,
  targetStatus,
  idempotencyKey,
) {
  return patchRaw(
    worker,
    identity,
    request.id,
    {
      expectedStatus: request.status,
      expectedUpdatedAt: request.updatedAt,
      targetStatus,
    },
    idempotencyKey,
  );
}

async function patchRaw(
  worker,
  identity,
  requestId,
  body,
  idempotencyKey,
) {
  const response = await worker.dispatch(
    `/api/operations/data-requests/${requestId}`,
    {
      method: "PATCH",
      headers: {
        ...writeHeaders(identity.email, identity.name),
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
    },
  );
  return { response, body: await response.json() };
}

function collectionCount(detail, category) {
  return detail.inventory.collections.find(
    (item) => item.category === category,
  )?.recordCount;
}

function assertNoPrivateOperatorData(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /coach\.[ab]@example\.test/i);
  assert.doesNotMatch(serialized, /private business-name|private records/i);
  assert.doesNotMatch(serialized, /object_key|primary_email|normalized_email/i);
}
