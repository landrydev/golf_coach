import assert from "node:assert/strict";
import test from "node:test";
import {
  grantSyntheticGolferRecordConsent,
  grantSyntheticRoadmapSharingConsent,
  identityHeaders,
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";
import {
  createMediaUploadBody,
  MEDIA_UPLOAD_CONTENT_TYPE,
} from "../lib/media-upload-protocol.ts";

const coach = {
  email: "coach.a@example.test",
  name: "Coach Media Race",
};

const mediaPolicy = JSON.stringify({
  version: "synthetic-media-race-v1",
  maxBytes: 1_048_576,
  maxVideoDurationMs: 60_000,
  allowedMimeTypes: ["image/png", "text/csv"],
  accountMediaConsentRequired: false,
  golferMediaConsentRequired: false,
});

const consentRequiredMediaPolicy = JSON.stringify({
  version: "synthetic-media-consent-race-v1",
  maxBytes: 1_048_576,
  maxVideoDurationMs: 60_000,
  allowedMimeTypes: ["image/png"],
  accountMediaConsentRequired: true,
  golferMediaConsentRequired: false,
});

const mediaConsentPolicyVersion = "synthetic-media-use-v1";
const mediaConsentRegistry = JSON.stringify({
  media_use: {
    version: mediaConsentPolicyVersion,
    purposeDescription:
      "Synthetic authorization for private media race tests only.",
    subjectTypes: ["account"],
  },
});

for (const race of [
  {
    checkpoint: "media-upload-before-pending-commit",
    label: "before the pending insert",
    expectedPendingRows: 0,
    expectedObjects: 0,
  },
  {
    checkpoint: "media-upload-before-ready-commit",
    label: "after the verified R2 write",
    expectedPendingRows: 1,
    expectedObjects: 1,
  },
]) {
  test(
    `account media-consent withdrawal ${race.label} prevents a ready upload`,
    { timeout: 90_000 },
    async (context) => {
      const barrier = syntheticBarrier(race.checkpoint);
      const worker = await startD1Worker(
        {
          CONSENT_POLICY_REGISTRY_JSON: mediaConsentRegistry,
          MEDIA_UPLOAD_POLICY_JSON: consentRequiredMediaPolicy,
        },
        { concurrencyBarrier: barrier.handler },
      );
      context.after(() => worker.dispose());
      const granted = await grantAccountMediaConsent(worker);

      const pendingUpload = versionedPngWrite(
        worker,
        `consent-${race.checkpoint}.png`,
      );
      await barrier.reached;
      const pendingRows = await (await worker.database())
        .prepare(
          "select count(*) as count from media_assets where status = 'pending'",
        )
        .first();
      assert.equal(pendingRows.count, race.expectedPendingRows);
      assert.equal(
        (await (await worker.media()).list()).objects.length,
        race.expectedObjects,
      );

      const withdrawal = await jsonWrite(worker, "/api/consents", "POST", {
        action: "withdraw",
        purpose: "media_use",
        policyVersion: mediaConsentPolicyVersion,
        subjectType: "account",
        golferId: null,
        expectedCurrentRecordId: granted.id,
        evidenceReference: "synthetic-media-race-withdrawal",
      });
      await assertStatus(withdrawal, 201);
      barrier.release();

      await assertApiError(
        await pendingUpload,
        409,
        "current_consent_required",
      );
      const [assets, details, uploadAudits] = await worker.inspect([
        { sql: "select count(*) as count from media_assets" },
        { sql: "select count(*) as count from media_asset_details" },
        {
          sql: "select count(*) as count from audit_events where action in ('media.upload', 'media.upload_failed')",
        },
      ]);
      assert.equal(assets.results[0].count, 0);
      assert.equal(details.results[0].count, 0);
      assert.equal(uploadAudits.results[0].count, 0);
      assert.deepEqual((await (await worker.media()).list()).objects, []);
    },
  );
}

test(
  "late rejected-upload cleanup retains a private failed reference when R2 deletion is unconfirmed",
  { timeout: 90_000 },
  async (context) => {
    const fault = oneShotFault("media-next-upload-cleanup-delete");
    const worker = await startD1Worker(
      { MEDIA_UPLOAD_POLICY_JSON: mediaPolicy },
      { concurrencyBarrier: fault.handler },
    );
    context.after(() => worker.dispose());
    await createProfile(worker);
    const accountId = await accountIdFor(worker);
    fault.arm(accountId);

    const rejected = await versionedPngWrite(
      worker,
      "late-boundary-cleanup.png",
      new Uint8Array([0xff]),
    );
    await assertApiError(rejected, 502, "media_upload_cleanup_failed");
    const [assets, details, audits] = await worker.inspect([
      {
        sql: "select id, status, failure_code as failureCode, object_key as objectKey from media_assets where original_filename = 'late-boundary-cleanup.png'",
      },
      {
        sql: "select count(*) as count from media_asset_details",
      },
      {
        sql: "select action from audit_events where action in ('media.upload', 'media.upload_failed') order by action",
      },
    ]);
    assert.equal(assets.results.length, 1);
    const retained = assets.results[0];
    assert.equal(retained.status, "failed");
    assert.equal(retained.failureCode, "storage_cleanup_failed");
    assert.equal(details.results[0].count, 1);
    assert.deepEqual(audits.results, [{ action: "media.upload_failed" }]);
    assert.ok(await (await worker.media()).head(retained.objectKey));

    const privateRead = await worker.dispatch(`/api/media/${retained.id}`, {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(privateRead.status, 404);
    await assertStatus(
      await worker.dispatch(`/api/media/${retained.id}`, {
        method: "DELETE",
        headers: writeHeaders(coach.email, coach.name),
      }),
      204,
    );
    assert.equal(await (await worker.media()).head(retained.objectKey), null);
  },
);

test(
  "a deletion that claims first makes the raced attachment transaction fail closed",
  { timeout: 90_000 },
  async (context) => {
    const barrier = syntheticBarrier("media-attachment-before-commit");
    const worker = await startD1Worker(
      { MEDIA_UPLOAD_POLICY_JSON: mediaPolicy },
      { concurrencyBarrier: barrier.handler },
    );
    context.after(() => worker.dispose());
    await createProfile(worker);
    const asset = await uploadPng(worker, "delete-wins.png");

    const pendingAttachment = jsonWrite(worker, "/api/profile/media", "POST", {
      mediaAssetId: asset.id,
      role: "logo",
    });
    await barrier.reached;

    const deletion = await worker.dispatch(`/api/media/${asset.id}`, {
      method: "DELETE",
      headers: writeHeaders(coach.email, coach.name),
    });
    await assertStatus(deletion, 204);
    barrier.release();

    const attachment = await pendingAttachment;
    await assertApiError(attachment, 409, "media_asset_not_ready");
    const [state, references, audits] = await worker.inspect([
      {
        sql: "select status, failure_code as failureCode, object_key as objectKey from media_assets where id = ?",
        params: [asset.id],
      },
      {
        sql: "select count(*) as count from content_media_attachments where media_asset_id = ? and status = 'active'",
        params: [asset.id],
      },
      {
        sql: "select action, outcome from audit_events where target_id = ? and action in ('media.delete', 'media_attachment.created') order by action",
        params: [asset.id],
      },
    ]);
    assert.deepEqual(state.results[0], {
      status: "deleted",
      failureCode: null,
      objectKey: state.results[0].objectKey,
    });
    assert.equal(references.results[0].count, 0);
    assert.deepEqual(audits.results, [{ action: "media.delete", outcome: "success" }]);
    assert.equal(await (await worker.media()).head(state.results[0].objectKey), null);
  },
);

test(
  "an attachment that commits after deletion preflight prevents the stale delete claim",
  { timeout: 90_000 },
  async (context) => {
    const barrier = syntheticBarrier("media-delete-before-claim");
    const worker = await startD1Worker(
      { MEDIA_UPLOAD_POLICY_JSON: mediaPolicy },
      { concurrencyBarrier: barrier.handler },
    );
    context.after(() => worker.dispose());
    await createProfile(worker);
    const asset = await uploadPng(worker, "attachment-wins.png");

    const pendingDeletion = worker.dispatch(`/api/media/${asset.id}`, {
      method: "DELETE",
      headers: writeHeaders(coach.email, coach.name),
    });
    await barrier.reached;
    const attachment = await jsonWrite(worker, "/api/profile/media", "POST", {
      mediaAssetId: asset.id,
      role: "logo",
    });
    await assertStatus(attachment, 201);
    barrier.release();

    await assertApiError(await pendingDeletion, 409, "media_still_attached");
    const [state, references, deleteAudits] = await worker.inspect([
      {
        sql: "select status, object_key as objectKey from media_assets where id = ?",
        params: [asset.id],
      },
      {
        sql: "select count(*) as count from content_media_attachments where media_asset_id = ? and status = 'active'",
        params: [asset.id],
      },
      {
        sql: "select count(*) as count from audit_events where target_id = ? and action = 'media.delete' and outcome = 'success'",
        params: [asset.id],
      },
    ]);
    assert.equal(state.results[0].status, "ready");
    assert.equal(references.results[0].count, 1);
    assert.equal(deleteAudits.results[0].count, 0);
    assert.ok(await (await worker.media()).head(state.results[0].objectKey));
  },
);

test(
  "shared media final authorization cannot combine a new attachment with its invalidated capability",
  { timeout: 90_000 },
  async (context) => {
    const barrier = syntheticBarrier("shared-media-before-final-authorization");
    const worker = await startD1Worker(
      { MEDIA_UPLOAD_POLICY_JSON: mediaPolicy },
      { concurrencyBarrier: barrier.handler },
    );
    context.after(() => worker.dispose());
    await createProfile(worker);
    await grantSyntheticGolferRecordConsent(worker, coach);
    const workspace = await createWorkspace(worker, "Shared media race");
    await grantSyntheticRoadmapSharingConsent(worker, coach, workspace.golfer.id);
    const asset = await uploadPng(worker, "stale-capability.png");
    const publication = await publish(
      worker,
      workspace.plan.id,
      workspace.plan.revision,
      "Synthetic stale-media capability",
    );
    const session = await exchange(worker, tokenFromPublish(publication));

    const pendingRead = worker.dispatch(
      `/r/media/${asset.id}?context=${session.context}`,
      { headers: { cookie: session.cookie } },
    );
    await barrier.reached;
    const attachment = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/media`,
      "POST",
      {
        expectedRevision: workspace.plan.revision,
        mediaAssetId: asset.id,
        target: { kind: "assessment", id: workspace.assessment.id },
        role: "baseline",
        label: "Attachment that invalidates the old capability",
        sortOrder: 0,
      },
    );
    await assertStatus(attachment, 201);
    barrier.release();

    assert.equal((await pendingRead).status, 404);
    const [plan, share, attachmentState] = await worker.inspect([
      {
        sql: "select status, revision, published_revision as publishedRevision from development_plans where id = ?",
        params: [workspace.plan.id],
      },
      {
        sql: "select status from share_links where id = ?",
        params: [publication.share.id],
      },
      {
        sql: "select count(*) as count from content_media_attachments where plan_id = ? and media_asset_id = ? and status = 'active'",
        params: [workspace.plan.id, asset.id],
      },
    ]);
    assert.deepEqual(plan.results[0], {
      status: "draft",
      revision: workspace.plan.revision + 1,
      publishedRevision: null,
    });
    assert.equal(share.results[0].status, "revoked");
    assert.equal(attachmentState.results[0].count, 1);
  },
);

test(
  "a storage delete failure restores the asset and records only failure until a retry succeeds",
  { timeout: 90_000 },
  async (context) => {
    const fault = oneShotFault("media-next-storage-delete");
    const worker = await startD1Worker(
      { MEDIA_UPLOAD_POLICY_JSON: mediaPolicy },
      { concurrencyBarrier: fault.handler },
    );
    context.after(() => worker.dispose());
    await createProfile(worker);
    const asset = await uploadPng(worker, "delete-storage-failure.png");
    const accountId = await accountIdFor(worker);
    fault.arm(accountId);

    const failedDelete = await worker.dispatch(`/api/media/${asset.id}`, {
      method: "DELETE",
      headers: writeHeaders(coach.email, coach.name),
    });
    await assertApiError(failedDelete, 502, "media_delete_failed");
    const [failedState, failedAudits] = await worker.inspect([
      {
        sql: "select status, failure_code as failureCode, deleted_at as deletedAt, object_key as objectKey from media_assets where id = ?",
        params: [asset.id],
      },
      {
        sql: "select action, outcome from audit_events where target_id = ? and action like 'media.delete%' order by action",
        params: [asset.id],
      },
    ]);
    assert.deepEqual(failedState.results[0], {
      status: "ready",
      failureCode: null,
      deletedAt: null,
      objectKey: failedState.results[0].objectKey,
    });
    assert.deepEqual(failedAudits.results, [
      { action: "media.delete_failed", outcome: "failure" },
    ]);
    assert.ok(await (await worker.media()).head(failedState.results[0].objectKey));

    const retry = await worker.dispatch(`/api/media/${asset.id}`, {
      method: "DELETE",
      headers: writeHeaders(coach.email, coach.name),
    });
    await assertStatus(retry, 204);
    const [finalState, finalAudits] = await worker.inspect([
      {
        sql: "select status from media_assets where id = ?",
        params: [asset.id],
      },
      {
        sql: "select action, outcome from audit_events where target_id = ? and action like 'media.delete%' order by occurred_at, action",
        params: [asset.id],
      },
    ]);
    assert.equal(finalState.results[0].status, "deleted");
    assert.deepEqual(finalAudits.results, [
      { action: "media.delete_failed", outcome: "failure" },
      { action: "media.delete", outcome: "success" },
    ]);
    assert.equal(await (await worker.media()).head(failedState.results[0].objectKey), null);
  },
);

test(
  "launch import receipts and committed or withdrawn sessions retain their source media",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker({ MEDIA_UPLOAD_POLICY_JSON: mediaPolicy });
    context.after(() => worker.dispose());
    await createProfile(worker);
    await grantSyntheticGolferRecordConsent(worker, coach);
    const workspace = await createWorkspace(worker, "Launch source retention");
    const importSource = await uploadCsv(worker, "retained-import.csv");
    const sessionSource = await uploadCsv(worker, "retained-session.csv");
    const accountId = await accountIdFor(worker);
    const database = await worker.database();
    await database
      .prepare(
        `insert into launch_monitor_imports
          (id, account_id, plan_id, source_media_asset_id, status)
         values (?, ?, ?, ?, 'validated')`,
      )
      .bind("synthetic_retained_import", accountId, workspace.plan.id, importSource.id)
      .run();
    await database
      .prepare(
        `insert into launch_monitor_sessions
          (id, account_id, plan_id, source_media_asset_id, source_mode,
           session_date, device_source, coach_interpretation, limitations,
           representativeness, status, coach_approved_at)
         values (?, ?, ?, ?, 'manual', ?, ?, ?, ?, 'limited', 'committed', ?)`,
      )
      .bind(
        "synthetic_retained_session",
        accountId,
        workspace.plan.id,
        sessionSource.id,
        Date.now(),
        "Synthetic launch monitor",
        "Synthetic retained-source interpretation.",
        "Synthetic retained-source limitation.",
        Date.now(),
      )
      .run();

    for (const asset of [importSource, sessionSource]) {
      const deletion = await worker.dispatch(`/api/media/${asset.id}`, {
        method: "DELETE",
        headers: writeHeaders(coach.email, coach.name),
      });
      await assertApiError(deletion, 409, "media_still_attached");
    }
    const [states, audits] = await worker.inspect([
      {
        sql: "select id, status from media_assets where id in (?, ?) order by id",
        params: [importSource.id, sessionSource.id],
      },
      {
        sql: "select count(*) as count from audit_events where target_id in (?, ?) and action = 'media.delete' and outcome = 'success'",
        params: [importSource.id, sessionSource.id],
      },
    ]);
    assert.deepEqual(states.results.map((row) => row.status), ["ready", "ready"]);
    assert.equal(audits.results[0].count, 0);
  },
);

async function createProfile(worker) {
  const response = await jsonWrite(worker, "/api/profile", "PUT", {
    displayName: coach.name,
    businessName: "Synthetic Media Race Studio",
    professionalTitle: "Golf instructor",
    philosophy: "Synthetic concurrency evidence only.",
    contactEmail: coach.email,
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#1b4f40",
  });
  await assertStatus(response, 200);
}

async function createWorkspace(worker, label) {
  const response = await jsonWrite(worker, "/api/golfers", "POST", {
    adultEligibilityConfirmed: true,
    displayName: `${label} Golfer`,
    email: `${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, ".")}@example.test`,
    planTitle: `${label} roadmap`,
    coachingPackageId: null,
    goal: {
      statement: "Build a predictable contact window.",
      why: "Make target choices from a clearer pattern.",
      context: "Synthetic media-race fixture.",
    },
    assessment: {
      summary: "Contact varies with transition tempo.",
      strengths: "Clear awareness of strike feedback.",
      primaryPattern: "Strike location changes as tempo rises.",
      limitations: "One synthetic sample does not establish transfer.",
    },
    priority: {
      title: "Centered contact",
      rationale: "This is the narrowest observed synthetic constraint.",
    },
    phases: [1, 2, 3].map((number) => ({
      number,
      title: `Phase ${number}`,
      purpose: `Synthetic phase purpose ${number}.`,
      rationale: number === 1 ? "Establish the observed baseline first." : null,
      progressSignals: number === 1 ? ["Contact repeats in a reviewed set."] : [],
    })),
  });
  await assertStatus(response, 201);
  return response.json();
}

async function grantAccountMediaConsent(worker) {
  const current = await worker.dispatch(
    "/api/consents?subjectType=account",
    { headers: identityHeaders(coach.email, coach.name) },
  );
  await assertStatus(current, 200);
  const state = (await current.json()).consents.find(
    (item) => item.purpose === "media_use",
  );
  assert.equal(state.policy.configured, true);
  const grant = await jsonWrite(worker, "/api/consents", "POST", {
    action: "grant",
    purpose: "media_use",
    policyVersion: mediaConsentPolicyVersion,
    subjectType: "account",
    golferId: null,
    expectedCurrentRecordId: state.currentRecord?.id ?? null,
    evidenceReference: "synthetic-media-race-grant",
  });
  await assertStatus(grant, 201);
  return (await grant.json()).record;
}

async function versionedPngWrite(
  worker,
  filename,
  trailing = new Uint8Array(0),
) {
  const upload = await createMediaUploadBody(
    new File([pngBytes()], filename, { type: "image/png" }),
    {
      altText: `Synthetic ${filename} image`,
      caption: null,
      capturedAt: null,
      coachContext: null,
      durationMs: null,
      heightPixels: 1,
      orientation: "landscape",
      posterMediaAssetId: null,
      replacementForAssetId: null,
      replacementReason: null,
      transcript: null,
      viewLabel: null,
      widthPixels: 2,
    },
  );
  const body = new Blob([upload, trailing], {
    type: MEDIA_UPLOAD_CONTENT_TYPE,
  });
  return worker.dispatch("/api/media", {
    method: "POST",
    headers: {
      ...identityHeaders(coach.email, coach.name),
      "content-type": MEDIA_UPLOAD_CONTENT_TYPE,
      "idempotency-key": crypto.randomUUID(),
      origin: testOrigin,
      "sec-fetch-site": "same-origin",
    },
    body: await body.arrayBuffer(),
  });
}

async function uploadPng(worker, filename) {
  const form = new FormData();
  form.set("file", new File([pngBytes()], filename, { type: "image/png" }));
  form.set("altText", `Synthetic ${filename} image`);
  form.set("orientation", "landscape");
  form.set("widthPixels", "2");
  form.set("heightPixels", "1");
  return uploadedAsset(await multipartWrite(worker, form));
}

async function uploadCsv(worker, filename) {
  const form = new FormData();
  form.set(
    "file",
    new File(["Club Speed,Carry\n100,150\n"], filename, { type: "text/csv" }),
  );
  form.set("altText", `Synthetic ${filename} launch-monitor source`);
  form.set("orientation", "unknown");
  return uploadedAsset(await multipartWrite(worker, form));
}

async function uploadedAsset(response) {
  await assertStatus(response, 201);
  return (await response.json()).asset;
}

async function multipartWrite(worker, form) {
  const encoded = new Response(form);
  const contentType = encoded.headers.get("content-type");
  assert.ok(contentType?.startsWith("multipart/form-data; boundary="));
  return worker.dispatch("/api/media", {
    method: "POST",
    headers: {
      ...identityHeaders(coach.email, coach.name),
      "content-type": contentType,
      "idempotency-key": crypto.randomUUID(),
      origin: testOrigin,
      "sec-fetch-site": "same-origin",
    },
    body: await encoded.arrayBuffer(),
  });
}

async function publish(worker, planId, expectedRevision, recipient) {
  const response = await jsonWrite(worker, `/api/plans/${planId}/publish`, "POST", {
    confirmation: "reviewed_exact_golfer_view",
    expectedRevision,
    intendedRecipientContext: recipient,
    expiresInDays: 7,
  });
  await assertStatus(response, 201);
  return response.json();
}

async function exchange(worker, token) {
  const response = await worker.dispatch("/r/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: testOrigin,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ token }),
  });
  await assertStatus(response, 200);
  const body = await response.json();
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.match(body.sessionContext, /^[0-9a-f]{64}$/);
  assert.match(cookie ?? "", /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);
  return { context: body.sessionContext, cookie };
}

function tokenFromPublish(body) {
  const token = new URLSearchParams(new URL(body.share.url).hash.slice(1)).get("token");
  assert.ok(token);
  return token;
}

async function accountIdFor(worker) {
  const [result] = await worker.inspect([
    {
      sql: "select id from accounts where normalized_email = ?",
      params: [coach.email],
    },
  ]);
  assert.ok(result.results[0]?.id);
  return result.results[0].id;
}

function jsonWrite(worker, path, method, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}

function pngBytes() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01,
  ]);
}

function syntheticBarrier(expectedCheckpoint) {
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
      if (checkpoint !== expectedCheckpoint) return new Response("skipped");
      if (!observed) {
        observed = true;
        signalReached();
      }
      await released;
      return new Response("released");
    },
  };
}

function oneShotFault(expectedCheckpoint) {
  const armedScopes = new Set();
  return {
    arm: (scope) => armedScopes.add(scope),
    handler: async (request) => {
      const url = new URL(request.url);
      const checkpoint = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      const scope = url.searchParams.get("scope") ?? "";
      if (
        checkpoint !== expectedCheckpoint ||
        !armedScopes.delete(scope)
      ) {
        return new Response("continue");
      }
      return new Response("inject", {
        headers: { "x-roadmap-synthetic-fault": "inject" },
      });
    },
  };
}

async function assertApiError(response, status, code) {
  if (response.status !== status) {
    assert.equal(response.status, status, await response.text());
  }
  assert.equal((await response.json()).error.code, code);
}

async function assertStatus(response, expected) {
  if (response.status !== expected) {
    assert.equal(response.status, expected, await response.text());
  }
}
