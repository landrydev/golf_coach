import assert from "node:assert/strict";
import test from "node:test";
import {
  identityHeaders,
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "coach.a@example.test",
  name: "Profile CAS Coach",
};

test(
  "profile updates reject stale sequential retries and commit one concurrent page version",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    const initialReadResponse = await worker.dispatch("/api/profile", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(initialReadResponse.status, 200);
    const initialRead = await initialReadResponse.json();
    assert.equal(initialRead.profile.setupCompletedAt, null);
    assert.equal(initialRead.expectedUpdatedAt, null);

    const initialResponse = await writeProfile(
      worker,
      profilePayload("Initial Coach", initialRead.expectedUpdatedAt),
    );
    assert.equal(initialResponse.status, 200);
    const initial = (await initialResponse.json()).profile;

    const winnerResponse = await writeProfile(
      worker,
      profilePayload("Sequential Winner", initial.updatedAt),
    );
    assert.equal(winnerResponse.status, 200);
    const winner = (await winnerResponse.json()).profile;
    assert.ok(winner.updatedAt > initial.updatedAt);

    const stale = await writeProfile(
      worker,
      profilePayload("Stale Sequential Loser", initial.updatedAt),
    );
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.code, "stale_profile_update");

    const staleSameState = await writeProfile(
      worker,
      profilePayload("Sequential Winner", initial.updatedAt),
    );
    assert.equal(staleSameState.status, 409);
    assert.equal(
      (await staleSameState.json()).error.code,
      "stale_profile_update",
    );

    const missingVersion = profilePayload("Sequential Winner", null);
    delete missingVersion.expectedUpdatedAt;
    const missing = await writeProfile(worker, missingVersion);
    assert.equal(missing.status, 409);
    assert.equal((await missing.json()).error.code, "stale_profile_update");

    const currentNoOpResponse = await writeProfile(
      worker,
      profilePayload("Sequential Winner", winner.updatedAt),
    );
    assert.equal(currentNoOpResponse.status, 200);
    const currentNoOp = await currentNoOpResponse.json();
    assert.deepEqual(currentNoOp.changedFields, []);
    assert.equal(currentNoOp.profile.updatedAt, winner.updatedAt);

    const concurrent = await Promise.all([
      writeProfile(
        worker,
        profilePayload("Concurrent A", winner.updatedAt),
      ),
      writeProfile(
        worker,
        profilePayload("Concurrent B", winner.updatedAt),
      ),
    ]);
    assert.deepEqual(
      concurrent.map((response) => response.status).sort(),
      [200, 409],
    );
    const concurrentWinner = concurrent.find((response) => response.status === 200);
    const concurrentLoser = concurrent.find((response) => response.status === 409);
    assert.ok(concurrentWinner);
    assert.ok(concurrentLoser);
    const finalProfile = (await concurrentWinner.json()).profile;
    assert.equal(
      (await concurrentLoser.json()).error.code,
      "stale_profile_update",
    );

    const [stored, audits] = await worker.inspect([
      {
        sql: "select display_name, updated_at from instructor_profiles where account_id = (select id from accounts where normalized_email = ?)",
        params: [coach.email],
      },
      {
        sql: "select count(*) as count from audit_events where account_id = (select id from accounts where normalized_email = ?) and action = 'profile.saved' and outcome = 'success'",
        params: [coach.email],
      },
    ]);
    assert.deepEqual(stored.results, [
      {
        display_name: finalProfile.displayName,
        updated_at: finalProfile.updatedAt,
      },
    ]);
    assert.deepEqual(audits.results, [{ count: 3 }]);
  },
);

test(
  "profile responses stay bound to their own committed write during a later update",
  { timeout: 60_000 },
  async (context) => {
    const barrier = oneShotSyntheticBarrier(
      "profile-update-after-write-before-response",
    );
    const worker = await startD1Worker(
      {},
      { concurrencyBarrier: barrier.handler },
    );
    context.after(() => worker.dispose());

    const createdResponse = await writeProfile(
      worker,
      profilePayload("Response Race Initial", null),
    );
    assert.equal(createdResponse.status, 200);
    const created = (await createdResponse.json()).profile;

    const firstPending = writeProfile(
      worker,
      profilePayload("Response Race First", created.updatedAt),
    );
    await barrier.reached;

    const readResponse = await worker.dispatch("/api/profile", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(readResponse.status, 200);
    const read = await readResponse.json();
    assert.equal(read.profile.displayName, "Response Race First");
    assert.equal(read.expectedUpdatedAt, read.profile.updatedAt);

    const secondResponse = await writeProfile(
      worker,
      profilePayload("Response Race Second", read.expectedUpdatedAt),
    );
    assert.equal(secondResponse.status, 200);
    const second = (await secondResponse.json()).profile;
    barrier.release();

    const firstResponse = await firstPending;
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.equal(first.profile.displayName, "Response Race First");
    assert.equal(first.profile.updatedAt, read.expectedUpdatedAt);
    assert.deepEqual(first.changedFields, ["displayName"]);
    assert.ok(second.updatedAt > first.profile.updatedAt);

    const finalReadResponse = await worker.dispatch("/api/profile", {
      headers: identityHeaders(coach.email, coach.name),
    });
    const finalRead = await finalReadResponse.json();
    assert.equal(finalRead.profile.displayName, "Response Race Second");
    assert.equal(finalRead.expectedUpdatedAt, second.updatedAt);
  },
);

function profilePayload(displayName, expectedUpdatedAt) {
  return {
    displayName,
    businessName: "Profile CAS Golf",
    professionalTitle: null,
    philosophy: "Synthetic profile concurrency verification only.",
    contactEmail: coach.email,
    contactPhone: null,
    websiteUrl: "https://profile-cas.example.ca/",
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#176b55",
    expectedUpdatedAt,
  };
}

function writeProfile(worker, body) {
  return worker.dispatch("/api/profile", {
    method: "PUT",
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}

function oneShotSyntheticBarrier(expectedCheckpoint) {
  let signalReached;
  let releaseBarrier;
  const reached = new Promise((resolve) => {
    signalReached = resolve;
  });
  const released = new Promise((resolve) => {
    releaseBarrier = resolve;
  });
  let observed = false;
  return {
    reached,
    release: () => releaseBarrier(),
    handler: async (request) => {
      const checkpoint = decodeURIComponent(
        new URL(request.url).pathname.split("/").at(-1) ?? "",
      );
      if (checkpoint !== expectedCheckpoint || observed) {
        return new Response("continued");
      }
      observed = true;
      signalReached();
      await released;
      return new Response("released");
    },
  };
}
