import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ClientMutationOutcomeUnknownError,
  requireClientMutationJson,
} from "../lib/client-mutation-recovery.ts";
import { isShareMutationEnvelope } from "../lib/share-client-response.ts";
import {
  grantSyntheticGolferRecordConsent,
  grantSyntheticRoadmapSharingConsent,
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "atomic.coach@example.test",
  name: "Coach Atomic",
};

test(
  "invalid private-link origins fail before normal publish or replacement writes",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({ APP_URL: "https://roadmap.test/not-an-origin" });
    context.after(() => worker.dispose());

    for (const [path, body] of [
      [
        "/api/plans/unwritten-plan/publish",
        {
          confirmation: "reviewed_exact_golfer_view",
          expectedRevision: 1,
          intendedRecipientContext: "Synthetic recipient",
          expiresInDays: 7,
        },
      ],
      [
        "/api/plans/unwritten-plan/publish/replace-inaccessible",
        {
          confirmation: "replace_inaccessible_private_link",
          expectedRevision: 1,
          expectedShareId: "unwritten-share",
        },
      ],
      [
        "/api/plans/unwritten-plan/publish/reissue",
        {
          confirmation: "reissue_same_published_revision",
          expectedRevision: 1,
          expectedLastSharedAt: 1,
          expectedSourceShareId: "12345678-1234-4123-8123-123456789abc",
          expectedSourceStatus: "revoked",
          expectedSourceUpdatedAt: 1,
          expiresInDays: 7,
        },
      ],
    ]) {
      const response = await jsonWrite(worker, path, body);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, "application_origin_invalid");
    }

    const inspection = await worker.inspect([
      { sql: "select count(*) as count from accounts" },
      { sql: "select count(*) as count from development_plans" },
      { sql: "select count(*) as count from share_links" },
      { sql: "select count(*) as count from share_sessions" },
      { sql: "select count(*) as count from audit_events" },
    ]);
    assert.deepEqual(
      inspection.map((result) => result.results[0].count),
      [0, 0, 0, 0, 0],
    );
  },
);

test(
  "a lost publish acknowledgement can be replaced once with old links and sessions revoked",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    await createProfileAndConsents(worker);
    const workspace = await createWorkspace(worker);

    // Treat this successful response as an acknowledgement the browser did not
    // retain. The raw token is read only to prove that its capability and an
    // issued session are invalidated by the explicit recovery action.
    const publishResponse = await publish(worker, workspace.plan.id);
    const firstReceipt = await publishResponse.json();
    assert.deepEqual(firstReceipt.intent, {
      operation: "plan.publish_and_share",
      expiresInDays: 7,
    });
    const firstShare = firstReceipt.share;
    assertAuthoritativeShareReceipt(firstShare, workspace.plan.id, 1, 7);
    const firstToken = tokenFromShareUrl(firstShare.url);
    const exchange = await worker.dispatch("/r/session", {
      method: "POST",
      headers: publicWriteHeaders(),
      body: JSON.stringify({ token: firstToken }),
    });
    assert.equal(exchange.status, 200);
    const { sessionContext } = await exchange.json();
    const sessionCookie = exchange.headers.get("set-cookie")?.split(";", 1)[0];
    assert.match(sessionCookie, /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);

    const recovered = await replaceShare(
      worker,
      workspace.plan.id,
      firstShare.id,
    );
    assert.equal(recovered.status, 201);
    const recoveredReceipt = await recovered.json();
    assert.deepEqual(recoveredReceipt.intent, {
      operation: "share.replace_inaccessible_link",
      sourceShareId: firstShare.id,
    });
    const recoveredShare = recoveredReceipt.share;
    assert.notEqual(recoveredShare.id, firstShare.id);
    assert.notEqual(tokenFromShareUrl(recoveredShare.url), firstToken);
    assert.equal(recoveredShare.expiresAt, firstShare.expiresAt);

    const oldTokenExchange = await worker.dispatch("/r/session", {
      method: "POST",
      headers: publicWriteHeaders(),
      body: JSON.stringify({ token: firstToken }),
    });
    assert.equal(oldTokenExchange.status, 404);
    const oldSessionPlan = await worker.dispatch(
      `/r/plan?context=${sessionContext}`,
      { headers: { accept: "text/html", cookie: sessionCookie } },
    );
    assert.equal(oldSessionPlan.status, 200);
    assert.match(await oldSessionPlan.text(), /Plan unavailable/);

    const afterRecovery = await worker.inspect([
      {
        sql: "select id, status, revoke_reason, intended_recipient_context, expires_at from share_links where plan_id = ? order by created_at, id",
        params: [workspace.plan.id],
      },
      {
        sql: "select revoked_at, revoke_reason from share_sessions where share_link_id = ?",
        params: [firstShare.id],
      },
      {
        sql: "select revision, published_revision from development_plans where id = ?",
        params: [workspace.plan.id],
      },
      {
        sql: "select action, target_id, metadata from audit_events where action = 'share.replace_inaccessible_link' and target_id = ?",
        params: [workspace.plan.id],
      },
    ]);
    assert.equal(afterRecovery[0].results.length, 2);
    assert.equal(
      afterRecovery[0].results.filter((row) => row.status === "active").length,
      1,
    );
    const oldLink = afterRecovery[0].results.find((row) => row.id === firstShare.id);
    const newLink = afterRecovery[0].results.find(
      (row) => row.id === recoveredShare.id,
    );
    assert.equal(oldLink.status, "revoked");
    assert.equal(oldLink.revoke_reason, "replaced after inaccessible-link recovery");
    assert.equal(newLink.status, "active");
    assert.equal(
      newLink.intended_recipient_context,
      "Synthetic golfer — private roadmap",
    );
    assert.equal(newLink.expires_at, oldLink.expires_at);
    assert.ok(afterRecovery[1].results[0].revoked_at);
    assert.equal(
      afterRecovery[1].results[0].revoke_reason,
      "share link replaced after inaccessible-link recovery",
    );
    assert.deepEqual(afterRecovery[2].results[0], {
      revision: 1,
      published_revision: 1,
    });
    assert.equal(afterRecovery[3].results.length, 1);
    const recoveryAudit = JSON.parse(afterRecovery[3].results[0].metadata);
    assert.equal(recoveryAudit.previousShareId, firstShare.id);
    assert.equal(recoveryAudit.replacementShareId, recoveredShare.id);
    assert.equal(recoveryAudit.planRevision, 1);

    const concurrent = await Promise.all([
      replaceShare(worker, workspace.plan.id, recoveredShare.id),
      replaceShare(worker, workspace.plan.id, recoveredShare.id),
    ]);
    assert.deepEqual(
      concurrent.map((response) => response.status).sort(),
      [201, 409],
    );
    const winner = concurrent.find((response) => response.status === 201);
    const loser = concurrent.find((response) => response.status === 409);
    assert.ok(winner);
    assert.ok(loser);
    assert.match(
      (await loser.json()).error.code,
      /^share_replacement_(?:conflict|unavailable)$/,
    );
    const winnerShare = (await winner.json()).share;

    const finalInspection = await worker.inspect([
      {
        sql: "select id, status from share_links where plan_id = ? order by created_at, id",
        params: [workspace.plan.id],
      },
      {
        sql: "select count(*) as count from audit_events where action = 'share.replace_inaccessible_link' and target_id = ?",
        params: [workspace.plan.id],
      },
      {
        sql: "select revision, published_revision from development_plans where id = ?",
        params: [workspace.plan.id],
      },
    ]);
    assert.equal(finalInspection[0].results.length, 3);
    assert.deepEqual(
      finalInspection[0].results.filter((row) => row.status === "active"),
      [{ id: winnerShare.id, status: "active" }],
    );
    assert.equal(finalInspection[1].results[0].count, 2);
    assert.deepEqual(finalInspection[2].results[0], {
      revision: 1,
      published_revision: 1,
    });
  },
);

test(
  "revoked and expired history can reissue the exact published revision with a new bounded expiry",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    await createProfileAndConsents(worker);

    const revokedWorkspace = await createWorkspace(worker);
    const revokedPublish = await publish(worker, revokedWorkspace.plan.id);
    const revokedShare = (await revokedPublish.json()).share;
    const revokedToken = tokenFromShareUrl(revokedShare.url);
    const revokedExchange = await exchangeShare(worker, revokedToken);
    const revokedCookie = revokedExchange.headers.get("set-cookie")?.split(";", 1)[0];
    const revokedContext = (await revokedExchange.json()).sessionContext;
    const revoke = await jsonWrite(
      worker,
      `/api/shares/${revokedShare.id}`,
      { reason: "Explicitly revoked before same-revision reissue" },
      "DELETE",
    );
    assert.equal(revoke.status, 204);
    const revokedObservation = await observeReissueSource(
      worker,
      revokedWorkspace.plan.id,
    );
    assert.equal(revokedObservation.expectedSourceStatus, "revoked");

    const revokedReissue = await reissueShare(
      worker,
      revokedWorkspace.plan.id,
      revokedObservation,
      30,
    );
    assert.equal(revokedReissue.status, 201);
    const revokedReceipt = await revokedReissue.json();
    assert.deepEqual(revokedReceipt.intent, {
      operation: "share.reissue_same_revision",
      sourceShareId: revokedObservation.expectedSourceShareId,
      sourceStatus: revokedObservation.expectedSourceStatus,
      sourceUpdatedAt: revokedObservation.expectedSourceUpdatedAt,
      expiresInDays: 30,
    });
    const revokedReplacement = revokedReceipt.share;
    assertAuthoritativeShareReceipt(
      revokedReplacement,
      revokedWorkspace.plan.id,
      1,
      30,
    );
    assert.notEqual(revokedReplacement.id, revokedShare.id);
    assert.notEqual(tokenFromShareUrl(revokedReplacement.url), revokedToken);
    assert.ok(
      Date.parse(revokedReplacement.expiresAt) -
        Date.parse(revokedReplacement.createdAt) ===
        30 * 86_400_000,
    );
    assert.equal(
      (await exchangeShare(worker, revokedToken)).status,
      404,
    );
    const oldRevokedSession = await worker.dispatch(
      `/r/plan?context=${revokedContext}`,
      { headers: { accept: "text/html", cookie: revokedCookie } },
    );
    assert.match(await oldRevokedSession.text(), /Plan unavailable/);

    const expiredWorkspace = await createWorkspace(worker);
    const expiredPublish = await publish(worker, expiredWorkspace.plan.id);
    const expiredShare = (await expiredPublish.json()).share;
    const expiredToken = tokenFromShareUrl(expiredShare.url);
    const expiredExchange = await exchangeShare(worker, expiredToken);
    assert.equal(expiredExchange.status, 200);
    await worker.inspect([
      {
        sql: "update share_links set expires_at = ? where id = ?",
        params: [Date.now() - 1_000, expiredShare.id],
      },
    ]);
    const expiredObservation = await observeReissueSource(
      worker,
      expiredWorkspace.plan.id,
    );
    assert.equal(expiredObservation.expectedSourceStatus, "expired");

    const concurrent = await Promise.all([
      reissueShare(worker, expiredWorkspace.plan.id, expiredObservation, 7),
      reissueShare(worker, expiredWorkspace.plan.id, expiredObservation, 7),
    ]);
    assert.deepEqual(
      concurrent.map((response) => response.status).sort(),
      [201, 409],
    );
    const expiredWinner = concurrent.find((response) => response.status === 201);
    assert.ok(expiredWinner);
    const expiredReceipt = await expiredWinner.json();
    assert.deepEqual(expiredReceipt.intent, {
      operation: "share.reissue_same_revision",
      sourceShareId: expiredObservation.expectedSourceShareId,
      sourceStatus: expiredObservation.expectedSourceStatus,
      sourceUpdatedAt: expiredObservation.expectedSourceUpdatedAt,
      expiresInDays: 7,
    });
    const expiredReplacement = expiredReceipt.share;
    assertAuthoritativeShareReceipt(
      expiredReplacement,
      expiredWorkspace.plan.id,
      1,
      7,
    );
    assert.equal(
      Date.parse(expiredReplacement.expiresAt) -
        Date.parse(expiredReplacement.createdAt),
      7 * 86_400_000,
    );

    const inspection = await worker.inspect([
      {
        sql: "select id, status, revoke_reason, token_hash, token_hash_algorithm from share_links where plan_id = ? order by created_at, id",
        params: [expiredWorkspace.plan.id],
      },
      {
        sql: "select count(*) as count from share_sessions where share_link_id = ? and revoked_at is null",
        params: [expiredShare.id],
      },
      {
        sql: "select last_shared_at from development_plans where id = ?",
        params: [expiredWorkspace.plan.id],
      },
      {
        sql: "select metadata from audit_events where action = 'share.reissue_same_revision' and target_id = ?",
        params: [expiredWorkspace.plan.id],
      },
    ]);
    assert.equal(inspection[0].results.length, 2);
    assert.deepEqual(
      inspection[0].results.filter((row) => row.status === "active").map((row) => row.id),
      [expiredReplacement.id],
    );
    const terminalExpiredSource = inspection[0].results.find(
      (row) => row.id === expiredShare.id,
    );
    assert.equal(terminalExpiredSource.status, "revoked");
    assert.equal(
      terminalExpiredSource.revoke_reason,
      "superseded by same-revision reissue",
    );
    for (const row of inspection[0].results) {
      assert.match(row.token_hash, /^[0-9a-f]{64}$/);
      assert.equal(row.token_hash_algorithm, "hmac-sha256-v1");
      assert.equal(row.token_hash.includes(expiredToken), false);
    }
    assert.equal(inspection[1].results[0].count, 0);
    assert.equal(
      inspection[2].results[0].last_shared_at,
      Date.parse(expiredReplacement.createdAt),
    );
    assert.equal(inspection[3].results.length, 1);
    const audit = JSON.parse(inspection[3].results[0].metadata);
    assert.deepEqual(audit, {
      sourceShareId: expiredShare.id,
      sourceObservedStatus: "expired",
      replacementShareId: expiredReplacement.id,
      expiresAt: expiredReplacement.expiresAt,
      expiryDays: 7,
      planRevision: 1,
    });
  },
);

test(
  "same-revision reissue loses cleanly to concurrent revocation and plan editing",
  { timeout: 120_000 },
  async () => {
    await runReissueRace("revoke");
    await runReissueRace("edit");
  },
);

test("malformed or ambiguous share acknowledgements never validate as displayable links", async () => {
  const planId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const planRevision = 3;
  const expectedIntent = {
    operation: "plan.publish_and_share",
    expiresInDays: 7,
  };
  const valid = {
    intent: expectedIntent,
    share: {
      id: "12345678-1234-4123-8123-123456789abc",
      url: `${testOrigin}/r#token=${"a".repeat(43)}`,
      planId,
      planRevision,
      status: "active",
      createdAt: "2026-08-09T12:00:00.000Z",
      updatedAt: "2026-08-09T12:00:00.000Z",
      expiresAt: "2026-08-16T12:00:00.000Z",
      lastAccessedAt: null,
      accessCount: 0,
    },
  };
  assert.equal(
    isShareMutationEnvelope(
      valid,
      testOrigin,
      planId,
      planRevision,
      expectedIntent,
    ),
    true,
  );

  for (const invalid of [
    { ...valid, intent: { ...valid.intent, expiresInDays: 30 } },
    {
      ...valid,
      intent: {
        operation: "share.replace_inaccessible_link",
        sourceShareId: valid.share.id,
      },
    },
    { ...valid, share: { ...valid.share, id: "not-an-id" } },
    { ...valid, share: { ...valid.share, url: "https://attacker.example/r#token=" + "a".repeat(43) } },
    { ...valid, share: { ...valid.share, url: `${testOrigin}/r#token=partial` } },
    {
      ...valid,
      share: {
        ...valid.share,
        url: valid.share.url.replace("https://", "HTTPS://"),
      },
    },
    { ...valid, share: { ...valid.share, planId: crypto.randomUUID() } },
    { ...valid, share: { ...valid.share, planRevision: 4 } },
    { ...valid, share: { ...valid.share, status: "revoked" } },
    { ...valid, share: { ...valid.share, createdAt: "not-a-date" } },
    {
      ...valid,
      share: {
        ...valid.share,
        updatedAt: "2026-08-09T11:59:59.999Z",
      },
    },
    { ...valid, share: { ...valid.share, expiresAt: "not-a-date" } },
    {
      ...valid,
      share: {
        ...valid.share,
        expiresAt: "2026-08-17T12:00:00.000Z",
      },
    },
    { ...valid, share: { ...valid.share, lastAccessedAt: valid.share.createdAt } },
    { ...valid, share: { ...valid.share, accessCount: 1 } },
    { ...valid, committed: true },
    { intent: valid.intent, share: { url: valid.share.url } },
  ]) {
    assert.equal(
      isShareMutationEnvelope(
        invalid,
        testOrigin,
        planId,
        planRevision,
        expectedIntent,
      ),
      false,
    );
    await assert.rejects(
      requireClientMutationJson(
        new Response(JSON.stringify(invalid), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
        (value) =>
          isShareMutationEnvelope(
            value,
            testOrigin,
            planId,
            planRevision,
            expectedIntent,
          ),
        "fallback",
      ),
      (error) =>
        error instanceof ClientMutationOutcomeUnknownError &&
        error.reason === "malformed_success_response",
    );
  }

  assert.equal(
    isShareMutationEnvelope(
      valid,
      `${testOrigin}/`,
      planId,
      planRevision,
      expectedIntent,
    ),
    false,
  );
  const canonicalHttpsOrigin = "https://roadmap.example";
  const canonicalHttpsEnvelope = {
    ...valid,
    share: {
      ...valid.share,
      url: `${canonicalHttpsOrigin}/r#token=${"a".repeat(43)}`,
    },
  };
  assert.equal(
    isShareMutationEnvelope(
      canonicalHttpsEnvelope,
      "https://roadmap.example:443",
      planId,
      planRevision,
      expectedIntent,
    ),
    false,
  );

  const replacementIntent = {
    operation: "share.replace_inaccessible_link",
    sourceShareId: valid.share.id,
  };
  const replacementEnvelope = { ...valid, intent: replacementIntent };
  assert.equal(
    isShareMutationEnvelope(
      replacementEnvelope,
      testOrigin,
      planId,
      planRevision,
      replacementIntent,
    ),
    true,
  );
  assert.equal(
    isShareMutationEnvelope(
      replacementEnvelope,
      testOrigin,
      planId,
      planRevision,
      { ...replacementIntent, sourceShareId: crypto.randomUUID() },
    ),
    false,
  );

  const reissueIntent = {
    operation: "share.reissue_same_revision",
    sourceShareId: valid.share.id,
    sourceStatus: "revoked",
    sourceUpdatedAt: 1_786_276_800_000,
    expiresInDays: 7,
  };
  const reissueEnvelope = { ...valid, intent: reissueIntent };
  assert.equal(
    isShareMutationEnvelope(
      reissueEnvelope,
      testOrigin,
      planId,
      planRevision,
      reissueIntent,
    ),
    true,
  );
  for (const mismatchedIntent of [
    { ...reissueIntent, sourceShareId: crypto.randomUUID() },
    { ...reissueIntent, sourceStatus: "expired" },
    { ...reissueIntent, sourceUpdatedAt: reissueIntent.sourceUpdatedAt + 1 },
    { ...reissueIntent, expiresInDays: 30 },
  ]) {
    assert.equal(
      isShareMutationEnvelope(
        reissueEnvelope,
        testOrigin,
        planId,
        planRevision,
        mismatchedIntent,
      ),
      false,
    );
  }
  assert.equal(
    isShareMutationEnvelope(
      {
        ...canonicalHttpsEnvelope,
        share: {
          ...canonicalHttpsEnvelope.share,
          url: `https://roadmap.example:443/r#token=${"a".repeat(43)}`,
        },
      },
      canonicalHttpsOrigin,
      planId,
      planRevision,
      expectedIntent,
    ),
    false,
  );
  assert.equal(
    isShareMutationEnvelope(
      {
        ...canonicalHttpsEnvelope,
        share: {
          ...canonicalHttpsEnvelope.share,
          url: `https://user@roadmap.example/r#token=${"a".repeat(43)}`,
        },
      },
      canonicalHttpsOrigin,
      planId,
      planRevision,
      expectedIntent,
    ),
    false,
  );
  assert.equal(
    isShareMutationEnvelope(
      canonicalHttpsEnvelope,
      "https://user@roadmap.example",
      planId,
      planRevision,
      expectedIntent,
    ),
    false,
  );

  const source = await readFile(
    fileURLToPath(
      new URL(
        "../app/app/golfers/[golferId]/PublishControls.tsx",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  assert.match(source, /isClientMutationOutcomeUnknown\(error\)[\s\S]*"reconcile_required"/);
  assert.match(source, /Reload sharing record/);
  assert.match(source, /reconciliationRequired/);
  assert.match(source, /allowedSuccessStatuses|\[204\]/);
  assert.match(source, /shareMutationInFlightRef\.current/);
  assert.match(source, /shareMutationPending \|\| reconciliationRequired/);
  assert.match(
    source,
    /setRevealedShare\(\(current\) =>[\s\S]*current\?\.shareId === shareId \? null : current/,
  );
});

async function createProfileAndConsents(worker) {
  const profile = await jsonWrite(worker, "/api/profile", {
    displayName: coach.name,
    businessName: "Recovery Test Golf",
    professionalTitle: "Golf instructor",
    philosophy: "Synthetic private-link recovery verification only.",
    contactEmail: coach.email,
    contactPhone: null,
    websiteUrl: "https://recovery.example.ca",
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#176b55",
  }, "PUT");
  assert.equal(profile.status, 200);
  await grantSyntheticGolferRecordConsent(worker, coach);
}

async function createWorkspace(worker) {
  const response = await jsonWrite(worker, "/api/golfers", {
    adultEligibilityConfirmed: true,
    displayName: "Synthetic Recovery Golfer",
    email: "recovery.golfer@example.test",
    planTitle: "Recovery Roadmap",
    goal: {
      statement: "Build a predictable start window.",
      why: "Choose targets with confidence.",
      context: "Synthetic recovery verification.",
    },
    assessment: {
      summary: "Start direction changes under representative pressure.",
      strengths: "Clear strike awareness.",
      primaryPattern: "Direction varies as transition speed increases.",
      limitations: "Evidence is limited to a synthetic assessment.",
    },
    priority: {
      title: "Stable start direction",
      rationale: "Direction is the narrowest observed constraint.",
    },
    phases: [1, 2, 3].map((number) => ({
      number,
      title: `Recovery phase ${number}`,
      purpose: `Recovery purpose ${number}.`,
      rationale: number === 1 ? "Establish the observed baseline first." : null,
      progressSignals:
        number === 1 ? ["Direction repeats in a coach-reviewed set."] : [],
    })),
  });
  assert.equal(response.status, 201);
  const workspace = await response.json();
  await grantSyntheticRoadmapSharingConsent(worker, coach, workspace.golfer.id);
  return workspace;
}

function publish(worker, planId) {
  return jsonWrite(worker, `/api/plans/${planId}/publish`, {
    confirmation: "reviewed_exact_golfer_view",
    expectedRevision: 1,
    intendedRecipientContext: "Synthetic golfer — private roadmap",
    expiresInDays: 7,
  });
}

function replaceShare(worker, planId, expectedShareId) {
  return jsonWrite(
    worker,
    `/api/plans/${planId}/publish/replace-inaccessible`,
    {
      confirmation: "replace_inaccessible_private_link",
      expectedRevision: 1,
      expectedShareId,
    },
  );
}

function reissueShare(worker, planId, observation, expiresInDays) {
  return jsonWrite(worker, `/api/plans/${planId}/publish/reissue`, {
    confirmation: "reissue_same_published_revision",
    expectedRevision: 1,
    expectedLastSharedAt: observation.expectedLastSharedAt,
    expectedSourceShareId: observation.expectedSourceShareId,
    expectedSourceStatus: observation.expectedSourceStatus,
    expectedSourceUpdatedAt: observation.expectedSourceUpdatedAt,
    expiresInDays,
  });
}

async function observeReissueSource(worker, planId) {
  const inspection = await worker.inspect([
    {
      sql: `select id, status, expires_at, updated_at
              from share_links
             where plan_id = ? and plan_revision = 1
             order by created_at desc, id desc
             limit 1`,
      params: [planId],
    },
    {
      sql: "select last_shared_at from development_plans where id = ?",
      params: [planId],
    },
  ]);
  const source = inspection[0].results[0];
  assert.ok(source);
  const effectiveStatus =
    source.status === "active" &&
    source.expires_at !== null &&
    source.expires_at <= Date.now()
      ? "expired"
      : source.status;
  assert.match(effectiveStatus, /^(?:revoked|expired)$/);
  return {
    expectedLastSharedAt: inspection[1].results[0].last_shared_at,
    expectedSourceShareId: source.id,
    expectedSourceStatus: effectiveStatus,
    expectedSourceUpdatedAt: source.updated_at,
  };
}

async function exchangeShare(worker, token) {
  return worker.dispatch("/r/session", {
    method: "POST",
    headers: publicWriteHeaders(),
    body: JSON.stringify({ token }),
  });
}

function assertAuthoritativeShareReceipt(
  share,
  planId,
  planRevision,
  expiresInDays,
) {
  assert.deepEqual(Object.keys(share).sort(), [
    "accessCount",
    "createdAt",
    "expiresAt",
    "id",
    "lastAccessedAt",
    "planId",
    "planRevision",
    "status",
    "updatedAt",
    "url",
  ]);
  assert.equal(share.planId, planId);
  assert.equal(share.planRevision, planRevision);
  assert.equal(share.status, "active");
  assert.equal(share.updatedAt, share.createdAt);
  assert.equal(share.lastAccessedAt, null);
  assert.equal(share.accessCount, 0);
  assert.equal(share.createdAt, share.updatedAt);
  assert.equal(new Date(share.createdAt).toISOString(), share.createdAt);
  assert.equal(new Date(share.expiresAt).toISOString(), share.expiresAt);
  assert.equal(
    Date.parse(share.expiresAt) - Date.parse(share.createdAt),
    expiresInDays * 86_400_000,
  );
}

async function runReissueRace(kind) {
  const barrier = createCheckpointBarrier(
    "share-reissue-after-source-observation",
  );
  const worker = await startD1Worker(
    {},
    { concurrencyBarrier: barrier.handler },
  );
  try {
    await createProfileAndConsents(worker);
    const workspace = await createWorkspace(worker);
    const published = await publish(worker, workspace.plan.id);
    const source = (await published.json()).share;

    if (kind === "revoke") {
      await worker.inspect([
        {
          sql: "update share_links set expires_at = ? where id = ?",
          params: [Date.now() - 1_000, source.id],
        },
      ]);
    } else {
      const revoke = await jsonWrite(
        worker,
        `/api/shares/${source.id}`,
        { reason: "Prepare terminal history for edit race" },
        "DELETE",
      );
      assert.equal(revoke.status, 204);
    }

    const observation = await observeReissueSource(worker, workspace.plan.id);
    const pendingReissue = reissueShare(
      worker,
      workspace.plan.id,
      observation,
      7,
    );
    await barrier.reached;

    if (kind === "revoke") {
      const revoke = await jsonWrite(
        worker,
        `/api/shares/${source.id}`,
        { reason: "Concurrent explicit revocation wins" },
        "DELETE",
      );
      assert.equal(revoke.status, 204);
    } else {
      const edit = await jsonWrite(
        worker,
        `/api/plans/${workspace.plan.id}`,
        planEditPayload(1),
        "PUT",
      );
      assert.equal(edit.status, 200);
    }

    barrier.release();
    const result = await pendingReissue;
    assert.equal(result.status, 409);
    assert.match(
      (await result.json()).error.code,
      kind === "edit"
        ? /^stale_plan_revision$/
        : /^share_reissue_(?:conflict|live_link_exists)$/,
    );
    const inspection = await worker.inspect([
      {
        sql: "select count(*) as count from share_links where plan_id = ? and status = 'active' and (expires_at is null or expires_at > ?)",
        params: [workspace.plan.id, Date.now()],
      },
      {
        sql: "select count(*) as count from audit_events where action = 'share.reissue_same_revision' and target_id = ?",
        params: [workspace.plan.id],
      },
    ]);
    assert.equal(inspection[0].results[0].count, 0);
    assert.equal(inspection[1].results[0].count, 0);
  } finally {
    barrier.release();
    await worker.dispose();
  }
}

function createCheckpointBarrier(checkpoint) {
  let markReached;
  let releaseBarrier;
  const reached = new Promise((resolve) => {
    markReached = resolve;
  });
  const released = new Promise((resolve) => {
    releaseBarrier = resolve;
  });
  let held = false;
  return {
    reached,
    release: () => releaseBarrier(),
    handler: async (request) => {
        if (!new URL(request.url).pathname.endsWith(`/${checkpoint}`) || held) {
          return new Response("not-held");
        }
        held = true;
        markReached();
        await released;
        return new Response("released");
    },
  };
}

function planEditPayload(expectedRevision) {
  return {
    expectedRevision,
    title: "Edited during reissue race",
    goal: {
      statement: "Build an edited start window.",
      why: "Verify the revision fence.",
      context: "Synthetic reissue/edit race.",
    },
    assessment: {
      summary: "The plan changed during reissue.",
      strengths: "Revision fencing remains visible.",
      primaryPattern: "Concurrent edit changes the exact view.",
      limitations: "Synthetic concurrency evidence only.",
    },
    priority: {
      title: "Edited priority",
      rationale: "The reissue must lose to changed content.",
    },
    phases: [1, 2, 3].map((number) => ({
      number,
      title: `Edited phase ${number}`,
      purpose: `Edited purpose ${number}.`,
      rationale: number === 1 ? "Re-establish the changed baseline." : null,
      progressSignals:
        number === 1 ? ["Changed direction repeats in a reviewed set."] : [],
    })),
  };
}

function jsonWrite(worker, path, body, method = "POST") {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}

function publicWriteHeaders() {
  return {
    "content-type": "application/json",
    origin: testOrigin,
    "sec-fetch-site": "same-origin",
  };
}

function tokenFromShareUrl(value) {
  const url = new URL(value);
  const token = new URLSearchParams(url.hash.slice(1)).get("token");
  assert.match(token, /^[A-Za-z0-9_-]{40,64}$/);
  return token;
}
