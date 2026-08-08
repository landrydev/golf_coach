import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import {
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const INTERNAL_REQUEST_ID_HEADER = "x-roadmap-request-id";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const coach = { email: "coach.a@example.test", name: "Coach Avery" };

test("the Worker replaces client correlation claims before application routing", async () => {
  const {
    requestCorrelationId,
    withTrustedRequestCorrelation,
  } = await import("../lib/request-correlation.ts");
  const spoofedInternalId = "11111111-1111-4111-8111-111111111111";
  const boundaryId = "22222222-2222-4222-8222-222222222222";
  const incoming = new Request("https://roadmap.test/api/profile", {
    headers: {
      [INTERNAL_REQUEST_ID_HEADER]: spoofedInternalId,
      "x-request-id": "attacker-controlled-public-id",
    },
  });

  const trusted = withTrustedRequestCorrelation(incoming, boundaryId);
  assert.equal(trusted.headers.get(INTERNAL_REQUEST_ID_HEADER), boundaryId);
  assert.equal(trusted.headers.get("x-request-id"), null);
  assert.equal(requestCorrelationId(trusted), boundaryId);
  assert.equal(
    incoming.headers.get(INTERNAL_REQUEST_ID_HEADER),
    spoofedInternalId,
  );

  const directRequest = new Request("https://roadmap.test/api/profile", {
    headers: { [INTERNAL_REQUEST_ID_HEADER]: "not-a-uuid" },
  });
  const fallback = requestCorrelationId(directRequest);
  assert.match(fallback, UUID_V4);
  assert.equal(requestCorrelationId(directRequest), fallback);
});

test(
  "an audited mutation persists the boundary ID and errors deny spoofed IDs",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const spoofedInternalId = "33333333-3333-4333-8333-333333333333";

    const success = await worker.dispatch("/api/profile", {
      method: "PUT",
      headers: {
        ...writeHeaders(coach.email, coach.name),
        [INTERNAL_REQUEST_ID_HEADER]: spoofedInternalId,
        "x-request-id": "attacker-success-id",
        "cf-ray": "attacker-success-ray",
      },
      body: JSON.stringify({
        displayName: coach.name,
        contactEmail: coach.email,
      }),
    });
    assert.equal(success.status, 200);
    const successRequestId = success.headers.get("x-request-id");
    assert.match(successRequestId ?? "", UUID_V4);
    assert.notEqual(successRequestId, spoofedInternalId);
    assert.notEqual(successRequestId, "attacker-success-id");
    assert.notEqual(successRequestId, "attacker-success-ray");

    const [auditResult] = await worker.inspect([
      {
        sql: "select action, request_id from audit_events where action in ('account.created', 'profile.saved') order by action",
      },
    ]);
    assert.deepEqual(auditResult.results, [
      { action: "account.created", request_id: successRequestId },
      { action: "profile.saved", request_id: successRequestId },
    ]);

    const errorSpoofedInternalId =
      "44444444-4444-4444-8444-444444444444";
    const failure = await worker.dispatch("/api/profile", {
      method: "PUT",
      headers: {
        ...writeHeaders(coach.email, coach.name),
        [INTERNAL_REQUEST_ID_HEADER]: errorSpoofedInternalId,
        "x-request-id": "attacker-error-id",
        "cf-ray": "attacker-error-ray",
      },
      body: JSON.stringify({
        displayName: coach.name,
        contactEmail: "not-an-email",
      }),
    });
    assert.equal(failure.status, 400);
    assert.equal((await failure.json()).error.code, "invalid_field");
    const failureRequestId = failure.headers.get("x-request-id");
    assert.match(failureRequestId ?? "", UUID_V4);
    assert.notEqual(failureRequestId, errorSpoofedInternalId);
    assert.notEqual(failureRequestId, "attacker-error-id");
    assert.notEqual(failureRequestId, "attacker-error-ray");
    assert.notEqual(failureRequestId, successRequestId);
  },
);
