import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  grantSyntheticGolferRecordConsent,
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coachA = { email: "coach.a@example.test", name: "Coach Avery" };
const coachB = { email: "coach.b@example.test", name: "Coach Blake" };

test(
  "complete golfer authoring is retry-safe, tenant-scoped, and package-state independent after commit",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    for (const identity of [coachA, coachB]) {
      const profile = await jsonWrite(worker, "/api/profile", "PUT", identity, {
        displayName: identity.name,
        contactEmail: identity.email,
      });
      assert.equal(profile.status, 200);
      await grantSyntheticGolferRecordConsent(worker, identity);
    }

    const missingKeyHeaders = writeHeaders(coachA.email, coachA.name);
    delete missingKeyHeaders["idempotency-key"];
    const missingKey = await worker.dispatch("/api/golfers", {
      method: "POST",
      headers: missingKeyHeaders,
      body: JSON.stringify(golferPayload("Missing Key")),
    });
    assert.equal(missingKey.status, 400);
    assert.equal((await missingKey.json()).error.code, "idempotency_key_required");

    const payload = golferPayload("Jordan Retry Safe");
    const idempotencyKey = "full-authoring-racing-retry-0001";
    const [first, racingRetry] = await Promise.all([
      createGolfer(worker, coachA, idempotencyKey, payload),
      createGolfer(worker, coachA, idempotencyKey, payload),
    ]);
    assert.deepEqual(
      [first.status, racingRetry.status].sort((left, right) => left - right),
      [200, 201],
    );
    const createdRequestId = (first.status === 201 ? first : racingRetry).headers.get(
      "x-request-id",
    );
    const [firstBody, retryBody] = await Promise.all([
      first.json(),
      racingRetry.json(),
    ]);
    assert.equal(firstBody.golfer.id, retryBody.golfer.id);
    assert.equal(firstBody.plan.id, retryBody.plan.id);
    assert.equal(firstBody.goal.id, retryBody.goal.id);
    assert.equal(firstBody.assessment.id, retryBody.assessment.id);
    assert.equal(firstBody.priority.id, retryBody.priority.id);
    assert.deepEqual(
      firstBody.phases.map(({ id }) => id),
      retryBody.phases.map(({ id }) => id),
    );
    assert.deepEqual(
      [firstBody.idempotentReplay, retryBody.idempotentReplay].sort(),
      [false, true],
    );

    const changedPayload = await createGolfer(worker, coachA, idempotencyKey, {
      ...payload,
      planTitle: "A different roadmap must not reuse the key",
    });
    assert.equal(changedPayload.status, 409);
    assert.equal(
      (await changedPayload.json()).error.code,
      "idempotency_key_reused",
    );

    const sameKeyOtherTenant = await createGolfer(
      worker,
      coachB,
      idempotencyKey,
      payload,
    );
    assert.equal(sameKeyOtherTenant.status, 201);
    const tenantBBody = await sameKeyOtherTenant.json();
    assert.notEqual(tenantBBody.golfer.id, firstBody.golfer.id);

    const counts = await worker.inspect([
      {
        sql: "select count(*) as count from golfers where id = ?",
        params: [firstBody.golfer.id],
      },
      {
        sql: "select count(*) as count from development_plans where id = ? and golfer_id = ?",
        params: [firstBody.plan.id, firstBody.golfer.id],
      },
      {
        sql: "select count(*) as count from golfer_goals where plan_id = ?",
        params: [firstBody.plan.id],
      },
      {
        sql: "select count(*) as count from assessments where plan_id = ?",
        params: [firstBody.plan.id],
      },
      {
        sql: "select count(*) as count from plan_priorities where plan_id = ?",
        params: [firstBody.plan.id],
      },
      {
        sql: "select count(*) as count from plan_phases where plan_id = ?",
        params: [firstBody.plan.id],
      },
      {
        sql: "select count(*) as count from audit_events where account_id = (select account_id from golfers where id = ?) and action = 'golfer_workspace.created' and target_id = ?",
        params: [firstBody.golfer.id, firstBody.golfer.id],
      },
    ]);
    assert.deepEqual(
      counts.map((result) => result.results[0].count),
      [1, 1, 1, 1, 1, 3, 1],
    );

    const [receiptResult] = await worker.inspect([
      {
        sql: "select id, request_id, metadata from audit_events where action = 'golfer_workspace.created' and target_id = ?",
        params: [firstBody.golfer.id],
      },
    ]);
    assert.equal(receiptResult.results.length, 1);
    const receipt = receiptResult.results[0];
    assert.match(receipt.id, /^[a-f0-9]{64}$/);
    assert.match(receipt.request_id, /^[0-9a-f-]{36}$/i);
    assert.equal(receipt.request_id, createdRequestId);
    assert.notEqual(receipt.request_id, idempotencyKey);
    const receiptMetadata = JSON.parse(receipt.metadata);
    assert.match(receiptMetadata.inputFingerprint, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(receipt.metadata, /Jordan Retry Safe/i);
    assert.equal(JSON.stringify(receipt).includes(idempotencyKey), false);

    const packageResponse = await jsonWrite(
      worker,
      "/api/packages",
      "POST",
      coachA,
      {
        title: "Retry-safe external coaching package",
        description: "Synthetic package for idempotency verification.",
        priceCents: 32_000,
        currency: "CAD",
        terms: "Synthetic local test only; no purchase occurs.",
        inclusions: ["Three private lessons"],
        externalActionUrl: "https://booking.example.ca/retry-safe",
        status: "active",
      },
    );
    assert.equal(packageResponse.status, 201);
    const coachingPackage = (await packageResponse.json()).package;
    const packagedPayload = {
      ...golferPayload("Morgan Package Replay"),
      firstPhasePackageId: coachingPackage.id,
    };
    const packageKey = "full-authoring-package-replay-0002";
    const packagedCreation = await createGolfer(
      worker,
      coachA,
      packageKey,
      packagedPayload,
    );
    assert.equal(packagedCreation.status, 201);
    const packagedBody = await packagedCreation.json();

    const archived = await jsonWrite(
      worker,
      `/api/packages/${coachingPackage.id}`,
      "DELETE",
      coachA,
      { confirmation: "archive_package" },
    );
    assert.equal(archived.status, 200);

    const replayAfterArchive = await createGolfer(
      worker,
      coachA,
      packageKey,
      packagedPayload,
    );
    assert.equal(replayAfterArchive.status, 200);
    const replayAfterArchiveBody = await replayAfterArchive.json();
    assert.equal(replayAfterArchiveBody.idempotentReplay, true);
    assert.equal(replayAfterArchiveBody.golfer.id, packagedBody.golfer.id);
    assert.equal(replayAfterArchiveBody.plan.id, packagedBody.plan.id);
  },
);

test("complete authoring form retains one client key across ambiguous retries", async () => {
  const source = await readFile(
    new URL("../app/app/golfers/new/NewGolferForm.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const idempotencyKeyRef = useRef\(""\)/);
  assert.match(source, /idempotencyKeyRef\.current = crypto\.randomUUID\(\)/);
  assert.match(source, /"Idempotency-Key": idempotencyKeyRef\.current/);
  assert.doesNotMatch(source, /finally\s*\{[^}]*idempotencyKeyRef\.current\s*=\s*""/s);
});

function createGolfer(worker, identity, idempotencyKey, body) {
  return worker.dispatch("/api/golfers", {
    method: "POST",
    headers: {
      ...writeHeaders(identity.email, identity.name),
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function jsonWrite(worker, path, method, identity, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(identity.email, identity.name),
    body: JSON.stringify(body),
  });
}

function golferPayload(displayName) {
  return {
    adultEligibilityConfirmed: true,
    displayName,
    email: `${displayName.toLowerCase().replaceAll(/[^a-z0-9]+/g, ".")}@example.test`,
    planTitle: `${displayName} roadmap`,
    goal: {
      statement: "Build a more predictable contact pattern.",
      why: "Make decisions from repeatable evidence.",
      context: "Synthetic retry-safety verification only.",
    },
    assessment: {
      summary: "Contact varies as transition tempo increases.",
      strengths: "The golfer notices strike-location feedback.",
      primaryPattern: "Strike location moves away from centre at higher tempo.",
      limitations: "One synthetic observation cannot predict playing outcomes.",
    },
    priority: {
      title: "Centred contact",
      rationale: "A stable strike pattern supports later directional choices.",
    },
    phases: Array.from({ length: 3 }, (_, index) => ({
      number: index + 1,
      title: `Phase ${index + 1}`,
      purpose: `Synthetic authored purpose for phase ${index + 1}.`,
      rationale:
        index === 0
          ? "The first phase establishes an observable base."
          : null,
      progressSignals:
        index === 0
          ? ["Centred contact appears in three of five constrained attempts."]
          : [],
    })),
  };
}
