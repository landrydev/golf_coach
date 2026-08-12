import assert from "node:assert/strict";
import test from "node:test";
import {
  identityHeaders,
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coachA = { email: "coach.a@example.test", name: "Coach Avery" };
const coachB = { email: "coach.b@example.test", name: "Coach Bailey" };
const registry = JSON.stringify({
  golfer_record: {
    version: "synthetic-v1",
    purposeDescription: "Synthetic golfer-record purpose used only by this local test.",
    subjectTypes: ["account"],
  },
  service_email: {
    version: "synthetic-v2",
    purposeDescription: "Synthetic service-email purpose used only by this local test.",
    subjectTypes: ["account"],
  },
  optional_analytics: {
    version: "synthetic-v1",
    purposeDescription: "Synthetic optional-analytics purpose used only by this local test.",
    subjectTypes: ["account"],
  },
  roadmap_sharing: {
    version: "synthetic-v1",
    purposeDescription: "Synthetic roadmap-sharing purpose used only by this local test.",
    subjectTypes: ["golfer"],
  },
});

test(
  "consent transitions are tenant-scoped, immutable, replay-safe, versioned, and audit-minimized",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker({ CONSENT_POLICY_REGISTRY_JSON: registry });
    context.after(() => worker.dispose());

    const initial = await getCurrent(worker, coachA);
    assert.equal(initial.response.status, 200);
    assert.equal(initial.body.policyRegistry.state, "ready");
    assert.equal(initial.body.consents.length, 7);
    assert.equal(initial.body.consents.every((item) => !item.effectiveGranted), true);
    assert.equal(
      initial.body.consents.find((item) => item.purpose === "media_use").policy.configured,
      false,
    );

    const overposted = await transition(
      worker,
      coachA,
      "consent-overposting-key-0001",
      {
        action: "grant",
        purpose: "optional_analytics",
        policyVersion: "synthetic-v1",
        subjectType: "account",
        golferId: null,
        expectedCurrentRecordId: null,
        evidenceReference: null,
        operatorApproved: true,
      },
    );
    assert.equal(overposted.response.status, 400);
    assert.equal(overposted.body.error.code, "unexpected_field");

    const historicalId = "synthetic-historical-consent-v1";
    // A predecessor ahead of the wall clock exercises the same-millisecond
    // ordering boundary deterministically: every append must still advance by
    // exactly one millisecond rather than relying on hash ordering.
    const historicalEpoch = Date.now() + 60_000;
    await worker.inspect([
      {
        sql: `insert into consent_records
          (id, account_id, golfer_id, subject_type, scope, status,
           policy_version, purpose_description, capture_method,
           recorded_by_account_id, granted_at, created_at)
          select ?, id, null, 'account', 'service_email', 'granted',
                 'synthetic-v1', 'Synthetic superseded test purpose.',
                 'self_service', id, ?, ?
            from accounts where normalized_email = ?`,
        params: [historicalId, historicalEpoch, historicalEpoch, coachA.email],
      },
    ]);

    const replacementKey = "consent-replacement-key-0001";
    const replacement = await transition(worker, coachA, replacementKey, {
      action: "grant",
      purpose: "service_email",
      policyVersion: "synthetic-v2",
      subjectType: "account",
      golferId: null,
      expectedCurrentRecordId: historicalId,
      evidenceReference: null,
    });
    assert.equal(replacement.response.status, 201);
    assert.equal(replacement.body.replayed, false);
    assert.equal(replacement.body.record.status, "granted");
    assert.equal(replacement.body.record.policyVersion, "synthetic-v2");
    assert.notEqual(replacement.body.record.id, historicalId);
    assert.equal(replacement.body.record.createdAt, historicalEpoch + 1);

    const replay = await transition(worker, coachA, replacementKey, {
      action: "grant",
      purpose: "service_email",
      policyVersion: "synthetic-v2",
      subjectType: "account",
      golferId: null,
      expectedCurrentRecordId: historicalId,
      evidenceReference: null,
    });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.record.id, replacement.body.record.id);

    const rebound = await transition(worker, coachA, replacementKey, {
      action: "grant",
      purpose: "optional_analytics",
      policyVersion: "synthetic-v1",
      subjectType: "account",
      golferId: null,
      expectedCurrentRecordId: null,
      evidenceReference: null,
    });
    assert.equal(rebound.response.status, 409);
    assert.equal(rebound.body.error.code, "idempotency_key_reused");

    const staleVersion = await transition(
      worker,
      coachA,
      "consent-stale-policy-key-001",
      {
        action: "grant",
        purpose: "optional_analytics",
        policyVersion: "synthetic-v0",
        subjectType: "account",
        golferId: null,
        expectedCurrentRecordId: null,
        evidenceReference: null,
      },
    );
    assert.equal(staleVersion.response.status, 409);
    assert.equal(staleVersion.body.error.code, "stale_consent_policy");

    const staleState = await transition(
      worker,
      coachA,
      "consent-stale-state-key-0001",
      {
        action: "withdraw",
        purpose: "service_email",
        policyVersion: "synthetic-v2",
        subjectType: "account",
        golferId: null,
        expectedCurrentRecordId: historicalId,
        evidenceReference: null,
      },
    );
    assert.equal(staleState.response.status, 409);
    assert.equal(staleState.body.error.code, "stale_consent_state");

    const withdrawalKey = "consent-withdrawal-key-0001";
    const withdrawal = await transition(worker, coachA, withdrawalKey, {
      action: "withdraw",
      purpose: "service_email",
      policyVersion: "synthetic-v2",
      subjectType: "account",
      golferId: null,
      expectedCurrentRecordId: replacement.body.record.id,
      evidenceReference: "synthetic-withdrawal-reference",
    });
    assert.equal(withdrawal.response.status, 201);
    assert.equal(withdrawal.body.record.status, "withdrawn");
    assert.equal(
      withdrawal.body.record.createdAt,
      replacement.body.record.createdAt + 1,
    );

    const concurrent = await Promise.all(
      ["consent-concurrent-grant-key-01", "consent-concurrent-grant-key-02"].map(
        (key) =>
          transition(worker, coachA, key, {
            action: "grant",
            purpose: "optional_analytics",
            policyVersion: "synthetic-v1",
            subjectType: "account",
            golferId: null,
            expectedCurrentRecordId: null,
            evidenceReference: null,
          }),
      ),
    );
    assert.deepEqual(
      concurrent.map((result) => result.response.status).sort(),
      [201, 409],
    );
    assert.ok(
      ["stale_consent_state", "consent_already_current"].includes(
        concurrent.find((result) => result.response.status === 409).body.error.code,
      ),
    );

    const withdrawnState = await getCurrent(worker, coachA);
    const serviceEmail = withdrawnState.body.consents.find(
      (item) => item.purpose === "service_email",
    );
    assert.equal(serviceEmail.currentRecord.id, withdrawal.body.record.id);
    assert.equal(serviceEmail.currentRecord.status, "withdrawn");
    assert.equal(serviceEmail.effectiveGranted, false);

    const sameVersionDifferentTextId = "consent-same-version-text-mismatch";
    const textMismatchEpoch = Date.now() - 1_000;
    await worker.inspect([
      {
        sql: `insert into consent_records
          (id, account_id, golfer_id, subject_type, scope, status,
           policy_version, purpose_description, capture_method,
           recorded_by_account_id, granted_at, created_at)
          select ?, id, null, 'account', 'golfer_record', 'granted',
                 'synthetic-v1', 'Synthetic text that does not match the configured entry.',
                 'imported', id, ?, ?
            from accounts where normalized_email = ?`,
        params: [
          sameVersionDifferentTextId,
          textMismatchEpoch,
          textMismatchEpoch,
          coachA.email,
        ],
      },
    ]);
    const textMismatchRead = await worker.dispatch("/api/golfers", {
      headers: identityHeaders(coachA.email, coachA.name),
    });
    assert.equal(textMismatchRead.status, 409);
    assert.equal((await textMismatchRead.json()).error.code, "current_consent_required");

    const golferRecordGrant = await transition(
      worker,
      coachA,
      "consent-golfer-record-key-0001",
      {
        action: "grant",
        purpose: "golfer_record",
        policyVersion: "synthetic-v1",
        subjectType: "account",
        golferId: null,
        expectedCurrentRecordId: sameVersionDifferentTextId,
        evidenceReference: "synthetic-test-fixture",
      },
    );
    assert.equal(golferRecordGrant.response.status, 201);

    const profile = await worker.dispatch("/api/profile", {
      method: "PUT",
      headers: writeHeaders(coachA.email, coachA.name),
      body: JSON.stringify({ displayName: coachA.name, contactEmail: coachA.email }),
    });
    assert.equal(profile.status, 200);
    const staged = await worker.dispatch("/api/golfers/staged", {
      method: "POST",
      headers: {
        ...writeHeaders(coachA.email, coachA.name),
        "idempotency-key": "consent-tenant-golfer-key-001",
      },
      body: JSON.stringify(stagedGolferPayload()),
    });
    assert.equal(staged.status, 201);
    const stagedBody = await staged.json();
    const crossTenantRead = await getCurrent(worker, coachB, {
      subjectType: "golfer",
      golferId: stagedBody.golfer.id,
    });
    assert.equal(crossTenantRead.response.status, 404);
    assert.equal(crossTenantRead.body.error.code, "consent_subject_not_found");

    const crossTenantGrant = await transition(
      worker,
      coachB,
      "consent-cross-tenant-key-001",
      {
        action: "grant",
        purpose: "roadmap_sharing",
        policyVersion: "synthetic-v1",
        subjectType: "golfer",
        golferId: stagedBody.golfer.id,
        expectedCurrentRecordId: null,
        evidenceReference: "synthetic-attestation-reference",
      },
    );
    assert.equal(crossTenantGrant.response.status, 404);
    assert.equal(crossTenantGrant.body.error.code, "consent_subject_not_found");

    const [history, audits, crossTenantRecords, concurrentRecords] = await worker.inspect([
      {
        sql: `select id, status, policy_version, purpose_description,
                     granted_at, withdrawn_at
                from consent_records
               where account_id = (select id from accounts where normalized_email = ?)
                 and subject_type = 'account' and scope = 'service_email'
               order by created_at, id`,
        params: [coachA.email],
      },
      {
        sql: `select action, request_id, metadata, actor_reference,
                     ip_address_hash
               from audit_events
               where account_id = (select id from accounts where normalized_email = ?)
                 and action in ('consent.granted', 'consent.replaced', 'consent.withdrawn')
                 and target_id in (
                   select id from consent_records
                    where account_id = (select id from accounts where normalized_email = ?)
                      and scope = 'service_email'
                 )
               order by occurred_at, id`,
        params: [coachA.email, coachA.email],
      },
      {
        sql: `select count(*) as count from consent_records
               where account_id = (select id from accounts where normalized_email = ?)
                 and golfer_id = ?`,
        params: [coachB.email, stagedBody.golfer.id],
      },
      {
        sql: `select count(*) as records,
                     (select count(*) from audit_events
                       where account_id = a.id
                         and action = 'consent.granted') as audits
                from accounts a
                left join consent_records c
                  on c.account_id = a.id and c.scope = 'optional_analytics'
               where a.normalized_email = ?`,
        params: [coachA.email],
      },
    ]);
    assert.equal(history.results.length, 3);
    assert.deepEqual(
      history.results.map((row) => row.status),
      ["granted", "granted", "withdrawn"],
    );
    assert.equal(history.results[0].purpose_description, "Synthetic superseded test purpose.");
    assert.equal(
      history.results[1].purpose_description,
      "Synthetic service-email purpose used only by this local test.",
    );
    assert.equal(history.results[0].withdrawn_at, null);
    assert.equal(history.results[1].withdrawn_at, null);
    assert.ok(history.results[2].withdrawn_at);

    assert.deepEqual(
      audits.results.map((row) => row.action),
      ["consent.replaced", "consent.withdrawn"],
    );
    assert.deepEqual(
      new Set(audits.results.map((row) => row.request_id)),
      new Set([
        replacement.response.headers.get("x-request-id"),
        withdrawal.response.headers.get("x-request-id"),
      ]),
    );
    for (const row of audits.results) {
      assert.match(row.request_id, /^[0-9a-f-]{36}$/);
      assert.equal(row.actor_reference, null);
      assert.equal(row.ip_address_hash, null);
      const metadata = JSON.parse(row.metadata);
      assert.deepEqual(Object.keys(metadata), ["inputFingerprint"]);
      assert.match(metadata.inputFingerprint, /^[a-f0-9]{64}$/);
      const serialized = JSON.stringify(metadata);
      assert.doesNotMatch(serialized, /Synthetic|service_email|withdrawal-reference|key-0001|coach\.a/i);
    }
    assert.deepEqual(crossTenantRecords.results, [{ count: 0 }]);
    assert.deepEqual(concurrentRecords.results, [{ records: 1, audits: 1 }]);
  },
);

test(
  "missing or malformed policy configuration keeps every purpose ungranted and blocks grants",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({ CONSENT_POLICY_REGISTRY_JSON: "not-json" });
    context.after(() => worker.dispose());

    const current = await getCurrent(worker, coachA);
    assert.equal(current.response.status, 200);
    assert.equal(current.body.policyRegistry.state, "invalid");
    assert.equal(current.body.consents.length, 7);
    assert.equal(current.body.consents.every((item) => !item.effectiveGranted), true);
    assert.equal(current.body.consents.every((item) => !item.policy.configured), true);

    const blocked = await transition(
      worker,
      coachA,
      "consent-missing-policy-key-001",
      {
        action: "grant",
        purpose: "optional_analytics",
        policyVersion: "synthetic-v1",
        subjectType: "account",
        golferId: null,
        expectedCurrentRecordId: null,
        evidenceReference: null,
      },
    );
    assert.equal(blocked.response.status, 503);
    assert.equal(blocked.body.error.code, "consent_policy_unavailable");
  },
);

test(
  "withdrawal remains available when the policy registry is unavailable",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({ CONSENT_POLICY_REGISTRY_JSON: "" });
    context.after(() => worker.dispose());
    await getCurrent(worker, coachA);
    const historicalId = "synthetic-withdrawable-consent";
    const epoch = Date.now() - 1_000;
    await worker.inspect([
      {
        sql: `insert into consent_records
          (id, account_id, golfer_id, subject_type, scope, status,
           policy_version, purpose_description, capture_method,
           recorded_by_account_id, granted_at, created_at)
          select ?, id, null, 'account', 'service_email', 'granted',
                 'synthetic-unavailable-v1', 'Synthetic historical test purpose.',
                 'self_service', id, ?, ?
            from accounts where normalized_email = ?`,
        params: [historicalId, epoch, epoch, coachA.email],
      },
    ]);

    const withdrawal = await transition(
      worker,
      coachA,
      "consent-no-config-withdraw-001",
      {
        action: "withdraw",
        purpose: "service_email",
        policyVersion: "synthetic-unavailable-v1",
        subjectType: "account",
        golferId: null,
        expectedCurrentRecordId: historicalId,
        evidenceReference: null,
      },
    );
    assert.equal(withdrawal.response.status, 201);
    assert.equal(withdrawal.body.record.status, "withdrawn");
    const current = await getCurrent(worker, coachA);
    assert.equal(current.body.policyRegistry.state, "missing");
    assert.equal(
      current.body.consents.find((item) => item.purpose === "service_email").effectiveGranted,
      false,
    );
  },
);

async function getCurrent(worker, identity, subject = { subjectType: "account" }) {
  const query = new URLSearchParams(subject).toString();
  const response = await worker.dispatch(`/api/consents?${query}`, {
    headers: identityHeaders(identity.email, identity.name),
  });
  return { response, body: await response.json() };
}

async function transition(worker, identity, idempotencyKey, body) {
  const response = await worker.dispatch("/api/consents", {
    method: "POST",
    headers: {
      ...writeHeaders(identity.email, identity.name),
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

function stagedGolferPayload() {
  return {
    adultEligibilityConfirmed: true,
    displayName: "Synthetic Consent Golfer",
    preferredName: "",
    email: "synthetic.consent.golfer@example.test",
    planTitle: "Synthetic consent roadmap",
    goal: {
      statement: "Create a tenant-owned synthetic subject.",
      why: "Exercise local tenant isolation only.",
      context: "No real person or consent is represented.",
    },
  };
}
