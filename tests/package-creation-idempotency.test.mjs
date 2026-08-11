import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coachA = { email: "coach.a@example.test", name: "Coach Avery" };
const coachB = { email: "coach.b@example.test", name: "Coach Blake" };

test(
  "package creation is race-safe, replayable, payload-bound, and tenant-scoped",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const missingKeyHeaders = writeHeaders(coachA.email, coachA.name);
    delete missingKeyHeaders["idempotency-key"];
    const missingKey = await worker.dispatch("/api/packages", {
      method: "POST",
      headers: missingKeyHeaders,
      body: JSON.stringify(packagePayload()),
    });
    assert.equal(missingKey.status, 400);
    assert.equal((await missingKey.json()).error.code, "idempotency_key_required");

    const invalidKey = await createPackage(
      worker,
      coachA,
      "too-short",
      packagePayload(),
    );
    assert.equal(invalidKey.status, 400);
    assert.equal((await invalidKey.json()).error.code, "idempotency_key_required");

    const payload = packagePayload();
    const idempotencyKey = "package-creation-racing-retry-0001";
    const [first, racingRetry] = await Promise.all([
      createPackage(worker, coachA, idempotencyKey, payload),
      createPackage(worker, coachA, idempotencyKey, payload),
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
    assert.equal(firstBody.package.id, retryBody.package.id);
    assert.deepEqual(
      [firstBody.idempotentReplay, retryBody.idempotentReplay].sort(),
      [false, true],
    );
    assert.equal(firstBody.package.createdAt, firstBody.package.updatedAt);
    assert.equal(retryBody.package.createdAt, retryBody.package.updatedAt);

    const sequentialReplay = await createPackage(
      worker,
      coachA,
      idempotencyKey,
      payload,
    );
    assert.equal(sequentialReplay.status, 200);
    const sequentialReplayBody = await sequentialReplay.json();
    assert.equal(sequentialReplayBody.idempotentReplay, true);
    assert.equal(sequentialReplayBody.package.id, firstBody.package.id);

    const normalizedReplay = await createPackage(
      worker,
      coachA,
      idempotencyKey,
      { ...payload, title: `  ${payload.title}  ` },
    );
    assert.equal(normalizedReplay.status, 200);
    assert.equal((await normalizedReplay.json()).package.id, firstBody.package.id);

    const changedPayload = await createPackage(
      worker,
      coachA,
      idempotencyKey,
      { ...payload, terms: "Different terms must use a new creation key." },
    );
    assert.equal(changedPayload.status, 409);
    assert.equal(
      (await changedPayload.json()).error.code,
      "idempotency_key_reused",
    );

    const sameKeyOtherTenant = await createPackage(
      worker,
      coachB,
      idempotencyKey,
      payload,
    );
    assert.equal(sameKeyOtherTenant.status, 201);
    const otherTenantRequestId = sameKeyOtherTenant.headers.get("x-request-id");
    const tenantBBody = await sameKeyOtherTenant.json();
    assert.equal(tenantBBody.idempotentReplay, false);
    assert.notEqual(tenantBBody.package.id, firstBody.package.id);

    const inspection = await worker.inspect([
      {
        sql: `select count(*) as count from coaching_packages
          where account_id = (select id from accounts where normalized_email = ?)`,
        params: [coachA.email],
      },
      {
        sql: `select count(*) as count from coaching_packages
          where account_id = (select id from accounts where normalized_email = ?)`,
        params: [coachB.email],
      },
      {
        sql: `select count(*) as count from coaching_packages
          where id = ? and status = 'active' and is_default = 1`,
        params: [firstBody.package.id],
      },
      {
        sql: `select id, request_id, metadata from audit_events
          where account_id = (select id from accounts where normalized_email = ?)
            and action = 'coaching_package.created'
            and target_type = 'coaching_package'`,
        params: [coachA.email],
      },
      {
        sql: `select id, request_id, metadata from audit_events
          where account_id = (select id from accounts where normalized_email = ?)
            and action = 'coaching_package.created'
            and target_type = 'coaching_package'`,
        params: [coachB.email],
      },
    ]);
    assert.equal(inspection[0].results[0].count, 1);
    assert.equal(inspection[1].results[0].count, 1);
    assert.equal(inspection[2].results[0].count, 1);
    assert.equal(inspection[3].results.length, 1);
    assert.equal(inspection[4].results.length, 1);

    const receipt = inspection[3].results[0];
    const otherTenantReceipt = inspection[4].results[0];
    assert.notEqual(receipt.request_id, idempotencyKey);
    assert.match(receipt.id, /^[a-f0-9]{64}$/);
    assert.match(otherTenantReceipt.id, /^[a-f0-9]{64}$/);
    assert.notEqual(otherTenantReceipt.id, receipt.id);
    assert.match(receipt.request_id, /^[0-9a-f-]{36}$/i);
    assert.match(otherTenantReceipt.request_id, /^[0-9a-f-]{36}$/i);
    assert.equal(receipt.request_id, createdRequestId);
    assert.equal(otherTenantReceipt.request_id, otherTenantRequestId);
    const metadata = JSON.parse(receipt.metadata);
    assert.match(metadata.inputFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(metadata.status, "active");
    assert.equal(metadata.hasPrice, true);
    assert.equal(metadata.externalActionType, "booking");
    assert.equal(Object.hasOwn(metadata, "name"), false);
    assert.equal(Object.hasOwn(metadata, "externalActionUrl"), false);
    assert.equal(Object.hasOwn(metadata, "requestCorrelationId"), false);
    assert.equal(JSON.stringify([receipt, otherTenantReceipt]).includes(idempotencyKey), false);
  },
);

test("package creation pins created and updated timestamps to one instant", async () => {
  const repositorySource = await readFile(
    new URL("../lib/repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    repositorySource,
    /db\.insert\(coachingPackages\)\.values\(\{[\s\S]*?createdAt: now,[\s\S]*?updatedAt: now,[\s\S]*?\}\);/,
  );
});

test("package form persists one exact client attempt until reconciliation", async () => {
  const source = await readFile(
    new URL("../app/app/packages/PackageForm.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /pendingAttemptRef = useRef<KeyedAttemptRecord/);
  assert.match(source, /persistKeyedAttempt\([\s\S]*key: crypto\.randomUUID\(\)/);
  assert.match(source, /"Idempotency-Key": attempt\.key/);
  assert.match(source, /body: attempt\.body/);
  assert.match(source, /@\/lib\/client-mutation-recovery/);

  const assignment = source.indexOf("pendingAttemptRef.current = persistKeyedAttempt");
  const capturedForm = source.indexOf("const formElement = event.currentTarget");
  const request = source.indexOf('requestClientMutation("/api/packages"');
  const confirmed = source.indexOf("hasPackageCreateResponse");
  const clear = source.indexOf(
    "clearKeyedAttempt(attempt)",
    request,
  );
  const formReset = source.indexOf("formElement.reset()");
  assert.ok(capturedForm >= 0 && capturedForm < request);
  assert.ok(assignment >= 0 && assignment < request);
  assert.ok(request < confirmed);
  assert.ok(confirmed < clear);
  assert.ok(clear < formReset);
  assert.doesNotMatch(
    source,
    /finally\s*\{[^}]*clearKeyedAttempt/s,
  );
  assert.doesNotMatch(source, /event\.currentTarget\.reset\(\)/);
});

function createPackage(worker, identity, idempotencyKey, body) {
  return worker.dispatch("/api/packages", {
    method: "POST",
    headers: {
      ...writeHeaders(identity.email, identity.name),
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function packagePayload() {
  return {
    title: "Retry-safe coaching package",
    description: "Synthetic package for ambiguous retry verification.",
    priceCents: 32_000,
    currency: "CAD",
    terms: "Synthetic local test only; no booking or purchase occurs.",
    inclusions: ["Three private lessons", "Written practice direction"],
    cadence: "Three lessons over six weeks",
    practiceExpectation: "Two short practice sessions between lessons.",
    evaluationDescription: "Review observed contact and start-line evidence.",
    externalActionUrl: "https://booking.example.ca/retry-safe-package",
    status: "active",
    isDefault: true,
  };
}
