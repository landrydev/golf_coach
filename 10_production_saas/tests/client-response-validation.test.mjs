import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIENT_DATA_EXPORT_MAX_BYTES,
  isAccountDataRequestView,
  isConsentTransitionEnvelope,
  isDataRequestEnvelope,
  isDataRequestListEnvelope,
  parseInstructorDataExport,
} from "../lib/client-response-validation.ts";

const request = {
  id: "request_123",
  type: "access",
  status: "submitted",
  createdAt: 1_800_000_000_000,
  updatedAt: 1_800_000_000_001,
};

test("data-request acknowledgements validate every UI-consumed field", () => {
  assert.equal(isAccountDataRequestView(request), true);
  assert.equal(isDataRequestEnvelope({ request, existing: false }), true);
  assert.equal(isDataRequestListEnvelope({ requests: [request] }), true);

  for (const invalid of [
    { ...request, type: "unknown" },
    { ...request, status: "queued" },
    { ...request, createdAt: "today" },
    { ...request, updatedAt: request.createdAt - 1 },
    { id: request.id },
  ]) {
    assert.equal(isAccountDataRequestView(invalid), false);
  }
  assert.equal(isDataRequestEnvelope({ request, existing: "no" }), false);
  assert.equal(isDataRequestListEnvelope({ requests: [{ id: request.id }] }), false);
});

test("consent acknowledgements are complete and match the submitted transition", () => {
  const value = {
    record: {
      id: "consent_123",
      purpose: "roadmap_sharing",
      status: "granted",
      policyVersion: "policy-v1",
      purposeDescription: "Allow this roadmap to be shared.",
      captureMethod: "instructor_attested",
      grantedAt: 1_800_000_000_000,
      declinedAt: null,
      withdrawnAt: null,
      expiresAt: null,
      createdAt: 1_800_000_000_000,
    },
    replayed: false,
  };
  const expected = {
    action: "grant",
    policyVersion: "policy-v1",
    purpose: "roadmap_sharing",
  };
  assert.equal(isConsentTransitionEnvelope(value, expected), true);
  assert.equal(
    isConsentTransitionEnvelope(
      { ...value, record: { ...value.record, status: "withdrawn" } },
      expected,
    ),
    false,
  );
  assert.equal(
    isConsentTransitionEnvelope(
      { ...value, record: { ...value.record, policyVersion: "policy-v2" } },
      expected,
    ),
    false,
  );
  assert.equal(isConsentTransitionEnvelope({ record: value.record }, expected), false);
});

test("downloadable exports require the complete versioned tenant-scoped contract", () => {
  const value = validExport();
  const body = JSON.stringify(value);
  const length = String(new TextEncoder().encode(body).byteLength);
  assert.deepEqual(
    parseInstructorDataExport(body, length, value.account.id),
    value,
  );
  assert.deepEqual(
    parseInstructorDataExport(body, null, value.account.id),
    value,
  );

  assert.equal(parseInstructorDataExport("{", "1", value.account.id), null);
  assert.equal(
    parseInstructorDataExport(
      body,
      String(Number(length) + 1),
      value.account.id,
    ),
    null,
  );
  assert.equal(parseInstructorDataExport(body, length, "account_other"), null);
  const multibyteBody = JSON.stringify({
    ...value,
    notes: ["Tenant-scoped export — verified."],
  });
  assert.notEqual(multibyteBody.length, new TextEncoder().encode(multibyteBody).byteLength);
  assert.equal(
    parseInstructorDataExport(
      multibyteBody,
      String(multibyteBody.length),
      value.account.id,
    ),
    null,
  );
  assert.equal(
    parseInstructorDataExport(
      JSON.stringify({ ...value, exportVersion: "unexpected" }),
      null,
      value.account.id,
    ),
    null,
  );
  const missingCollection = { ...value };
  delete missingCollection.golfers;
  assert.equal(
    parseInstructorDataExport(
      JSON.stringify(missingCollection),
      null,
      value.account.id,
    ),
    null,
  );
  assert.equal(
    parseInstructorDataExport(
      "x".repeat(CLIENT_DATA_EXPORT_MAX_BYTES + 1),
      null,
      value.account.id,
    ),
    null,
  );
});

function validExport() {
  return {
    exportVersion: "roadmap-instructor-export.v1",
    generatedAt: "2027-01-02T03:04:05.000Z",
    requestRecordId: "request_export_123",
    scope: "authenticated_instructor_workspace",
    notes: ["Tenant-scoped export."],
    account: {
      id: "account_123",
      primaryEmail: "coach@example.test",
    },
    instructorProfile: null,
    subscriptions: [],
    mediaAssets: [],
    coachingPackages: [],
    golfers: [],
    developmentPlans: [],
    goals: [],
    assessments: [],
    priorities: [],
    phases: [],
    phasePriorities: [],
    lessons: [],
    practiceItems: [],
    evidenceItems: [],
    phaseReviews: [],
    phaseReviewEvidence: [],
    shareLinks: [],
    golferResponses: [],
    consentRecords: [],
    dataRequests: [],
  };
}
