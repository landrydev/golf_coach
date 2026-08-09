import assert from "node:assert/strict";
import test from "node:test";
import {
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "coach.a@example.test",
  name: "Package CAS Coach",
};

test(
  "concurrent package edits commit exactly one version-bound result",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    await createProfile(worker);
    const created = await createPackage(worker, "Original package");

    const pending = ["Edit A", "Edit B"].map((name) =>
      updatePackage(worker, created, name),
    );
    const responses = await Promise.all(pending);
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [200, 409],
    );
    const winner = responses.find((response) => response.status === 200);
    const loser = responses.find((response) => response.status === 409);
    assert.ok(winner);
    assert.ok(loser);
    const winnerBody = await winner.json();
    assert.ok(["Edit A", "Edit B"].includes(winnerBody.package.name));
    assert.ok(winnerBody.package.updatedAt > created.updatedAt);
    assert.equal((await loser.json()).error.code, "stale_package_version");

    const [stored, audits] = await worker.inspect([
      {
        sql: "select name, updated_at from coaching_packages where id = ?",
        params: [created.id],
      },
      {
        sql: "select count(*) as count from audit_events where target_id = ? and action = 'coaching_package.updated' and outcome = 'success'",
        params: [created.id],
      },
    ]);
    assert.deepEqual(stored.results, [
      {
        name: winnerBody.package.name,
        updated_at: winnerBody.package.updatedAt,
      },
    ]);
    assert.deepEqual(audits.results, [{ count: 1 }]);
  },
);

test(
  "a stale edit and archive race cannot both claim the same package version",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    await createProfile(worker);
    const created = await createPackage(worker, "Archive race package");

    const pending = [
      updatePackage(worker, created, "Concurrent edit"),
      jsonWrite(
        worker,
        `/api/packages/${created.id}`,
        "DELETE",
        {
          confirmation: "archive_package",
          expectedUpdatedAt: created.updatedAt,
        },
      ),
    ];
    const responses = await Promise.all(pending);
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [200, 409],
    );
    const loser = responses.find((response) => response.status === 409);
    assert.ok(loser);
    assert.equal((await loser.json()).error.code, "stale_package_version");

    const [stored, audits] = await worker.inspect([
      {
        sql: "select name, status, updated_at from coaching_packages where id = ?",
        params: [created.id],
      },
      {
        sql: "select action from audit_events where target_id = ? and action in ('coaching_package.updated', 'coaching_package.archived') order by action",
        params: [created.id],
      },
    ]);
    assert.equal(stored.results.length, 1);
    assert.ok(stored.results[0].updated_at > created.updatedAt);
    assert.equal(audits.results.length, 1);
    assert.equal(
      stored.results[0].status === "archived",
      audits.results[0].action === "coaching_package.archived",
    );
  },
);

async function createPackage(worker, name) {
  const response = await jsonWrite(
    worker,
    "/api/packages",
    "POST",
    packagePayload(name),
  );
  assert.equal(response.status, 201);
  return (await response.json()).package;
}

async function createProfile(worker) {
  const response = await jsonWrite(worker, "/api/profile", "PUT", {
    displayName: coach.name,
    businessName: "Package CAS Golf",
    professionalTitle: "Golf instructor",
    philosophy: "Synthetic package concurrency verification only.",
    contactEmail: coach.email,
    contactPhone: null,
    websiteUrl: "https://package-cas.example.ca/",
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#176b55",
  });
  assert.equal(response.status, 200);
}

function updatePackage(worker, created, name) {
  return jsonWrite(
    worker,
    `/api/packages/${created.id}`,
    "PUT",
    {
      ...packagePayload(name),
      expectedUpdatedAt: created.updatedAt,
    },
  );
}

function packagePayload(name) {
  return {
    name,
    purpose: "Verify version-bound package updates.",
    fitDescription: "Synthetic concurrency verification only.",
    status: "active",
    currency: "CAD",
    priceAmountMinor: 12000,
    currentDetailsText: null,
    inclusions: ["One synthetic lesson"],
    cadence: "Weekly",
    practiceExpectation: "Synthetic practice",
    evaluationDescription: "Synthetic review",
    termsSummary: "Synthetic terms",
    externalActionType: "booking",
    externalActionLabel: "Continue to booking",
    externalActionUrl: "https://booking.example.ca/package",
    isDefault: false,
  };
}

function jsonWrite(worker, path, method, body, extraHeaders = {}) {
  return worker.dispatch(path, {
    method,
    headers: {
      ...writeHeaders(coach.email, coach.name),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}
