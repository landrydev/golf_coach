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

const coach = {
  email: "coach.a@example.test",
  name: "Coach Practice Replacement",
};

const mediaPolicy = JSON.stringify({
  version: "synthetic-practice-replacement-media-v1",
  maxBytes: 1_048_576,
  maxVideoDurationMs: 60_000,
  allowedMimeTypes: ["image/png"],
  accountMediaConsentRequired: false,
  golferMediaConsentRequired: false,
});

const drillDraft = {
  title: "Synthetic assignment source marker",
  purpose: "Old immutable purpose marker.",
  whenItFits: "Use only after the synthetic setup observation.",
  equipment: ["Two synthetic tees", "Seven iron"],
  setup: "Place two tees wider than the clubhead.",
  steps: ["Make one rehearsal.", "Hit three synthetic shots."],
  dosageOrCadence: "Two sets of three shots.",
  feelOrCue: "Finish in balance.",
  successCheck: "Two of three shots begin inside the gate.",
  commonMiss: "Tempo increases before contact.",
  stopOrAskRule: "Stop and ask the coach if discomfort appears.",
  constraintOrAdaptation: "Start with half swings.",
  progression: "Narrow the gate by one ball width.",
  regression: "Widen the gate and rehearse without a ball.",
};

test(
  "assignment edits atomically replace snapshots while retaining history, media, CAS, and audit boundaries",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({ MEDIA_UPLOAD_POLICY_JSON: mediaPolicy });
    context.after(() => worker.dispose());

    const profile = await jsonWrite(worker, "/api/profile", "PUT", {
      displayName: coach.name,
      businessName: "Synthetic Replacement Golf",
      professionalTitle: "Golf instructor",
      philosophy: "Bounded synthetic observations only.",
      contactEmail: coach.email,
      contactPhone: null,
      websiteUrl: null,
      city: "Calgary",
      provinceOrTerritory: "Alberta",
      accentColor: "#176b55",
    });
    assert.equal(profile.status, 200, await profile.clone().text());
    await grantSyntheticGolferRecordConsent(worker, coach);

    const drillResponse = await jsonWrite(
      worker,
      "/api/coaching/drills",
      "POST",
      drillDraft,
    );
    assert.equal(drillResponse.status, 201, await drillResponse.clone().text());
    const drill = (await drillResponse.json()).template;

    const mediaResponse = await uploadPng(worker);
    assert.equal(mediaResponse.status, 201, await mediaResponse.clone().text());
    const mediaAsset = (await mediaResponse.json()).asset;
    const attached = await jsonWrite(
      worker,
      `/api/coaching/drills/${drill.id}/media`,
      "POST",
      {
        mediaAssetId: mediaAsset.id,
        role: "demo",
        label: "Synthetic immutable assignment demo",
        coachContext: "Visible with the saved assignment guidance.",
        sortOrder: 0,
      },
    );
    assert.equal(attached.status, 201, await attached.clone().text());

    const golferResponse = await jsonWrite(worker, "/api/golfers", "POST", {
      adultEligibilityConfirmed: true,
      displayName: "Synthetic Replacement Golfer",
      email: "golfer.practice-replacement@example.test",
      planTitle: "Synthetic replacement plan",
      coachingPackageId: null,
      goal: {
        statement: "Build a repeatable contact window.",
        why: "Support a bounded practice decision.",
        context: "Synthetic test context only.",
      },
      assessment: {
        summary: "Contact varied in one synthetic observation.",
        strengths: "Clear awareness of strike location.",
        primaryPattern: "Strike moved heelward as tempo increased.",
        limitations: "One synthetic observation is not representative.",
      },
      priority: {
        title: "Centered contact",
        rationale: "Contact is the current bounded priority.",
      },
      phases: [
        phase(1, "Calibrate"),
        phase(2, "Stabilize"),
        phase(3, "Transfer"),
      ],
    });
    assert.equal(golferResponse.status, 201, await golferResponse.clone().text());
    const workspace = await golferResponse.json();
    await grantSyntheticRoadmapSharingConsent(worker, coach, workspace.golfer.id);

    const assignmentResponse = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/practice`,
      "POST",
      {
        expectedRevision: 1,
        phaseId: workspace.phases[0].id,
        drillTemplateId: drill.id,
        customization: null,
        dueAt: "2026-09-05T00:00:00.000Z",
      },
    );
    assert.equal(assignmentResponse.status, 201, await assignmentResponse.clone().text());
    const assigned = await assignmentResponse.json();
    const originalId = assigned.assignment.id;
    assert.equal(assigned.plan.revision, 2);

    const templateEdit = await jsonWrite(
      worker,
      `/api/coaching/drills/${drill.id}`,
      "PUT",
      {
        ...drillDraft,
        title: "Mutable library edit marker",
        purpose: "Mutable library purpose must not leak into an assignment edit.",
        expectedVersion: 1,
      },
    );
    assert.equal(templateEdit.status, 200, await templateEdit.clone().text());

    const firstPublish = await publish(worker, workspace.plan.id, 2);
    const firstShare = await firstPublish.json();
    const firstSession = await exchangeShare(worker, firstShare.share.url);
    assert.ok(firstSession.cookie);

    const replacementResponse = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/practice`,
      "PATCH",
      {
        expectedRevision: 2,
        operation: "replace",
        practiceItemId: originalId,
        phaseId: workspace.phases[1].id,
        customization: {
          purpose: "Edited assignment purpose marker.",
          steps: ["Use the retained setup.", "Hit four edited synthetic shots."],
          dosageOrCadence: "Three sets of four shots.",
          successCheck: "Three of four shots begin inside the gate.",
        },
        dueAt: "2026-09-12T00:00:00.000Z",
      },
    );
    assert.equal(
      replacementResponse.status,
      200,
      await replacementResponse.clone().text(),
    );
    const replacement = await replacementResponse.json();
    const replacementId = replacement.replacement.id;
    assert.notEqual(replacementId, originalId);
    assert.equal(replacement.replacement.replacedPracticeItemId, originalId);
    assert.equal(replacement.plan.revision, 3);

    const staleReplay = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/coaching/practice`,
      "PATCH",
      {
        expectedRevision: 2,
        operation: "replace",
        practiceItemId: originalId,
        phaseId: workspace.phases[1].id,
        customization: { purpose: "This stale prose must never persist." },
        dueAt: null,
      },
    );
    assert.equal(staleReplay.status, 409, await staleReplay.clone().text());
    assert.equal((await staleReplay.json()).error.code, "stale_plan_revision");

    const assignmentsResponse = await worker.dispatch(
      `/api/plans/${workspace.plan.id}/coaching/practice?includeRetired=true`,
      { headers: identityHeaders(coach.email, coach.name) },
    );
    assert.equal(assignmentsResponse.status, 200, await assignmentsResponse.clone().text());
    const assignments = (await assignmentsResponse.json()).assignments;
    assert.equal(assignments.length, 2);
    const current = assignments.find(({ assignment }) => assignment.id === replacementId);
    const retained = assignments.find(({ assignment }) => assignment.id === originalId);
    assert.ok(current);
    assert.ok(retained);
    assert.equal(current.assignment.status, "active");
    assert.equal(current.assignment.phaseId, workspace.phases[1].id);
    assert.equal(current.snapshot.title, drillDraft.title);
    assert.equal(current.snapshot.purpose, "Edited assignment purpose marker.");
    assert.deepEqual(current.snapshot.steps, [
      "Use the retained setup.",
      "Hit four edited synthetic shots.",
    ]);
    assert.equal(current.snapshot.whenItFits, drillDraft.whenItFits);
    assert.equal(current.snapshot.drillTemplateId, drill.id);
    assert.equal(current.snapshot.drillTemplateVersion, 1);
    assert.equal(current.snapshot.wasCustomized, true);
    assert.deepEqual(current.lineage.previous, {
      practiceItemId: originalId,
      replacedFromStatus: "active",
      replacementPlanRevision: 3,
      replacedAt: current.lineage.previous.replacedAt,
    });
    assert.equal(current.lineage.next, null);
    assert.equal(retained.assignment.status, "retired");
    assert.equal(retained.snapshot.purpose, drillDraft.purpose);
    assert.deepEqual(retained.snapshot.steps, drillDraft.steps);
    assert.equal(retained.lineage.previous, null);
    assert.deepEqual(retained.lineage.next, {
      practiceItemId: replacementId,
      replacedFromStatus: "active",
      replacementPlanRevision: 3,
      replacedAt: retained.lineage.next.replacedAt,
    });

    const [state, mediaRows, lineageRows, audits, foreignKeys] = await worker.inspect([
      {
        sql: `select revision, status, approved_revision as approvedRevision,
                     published_revision as publishedRevision
                from development_plans where id = ?`,
        params: [workspace.plan.id],
      },
      {
        sql: `select practice_item_id as practiceItemId, media_asset_id as mediaAssetId,
                     target_type as targetType, status
                from content_media_attachments
               where plan_id = ? and target_type = 'practice'
               order by practice_item_id`,
        params: [workspace.plan.id],
      },
      {
        sql: `select replaced_practice_item_id as replacedPracticeItemId,
                     replacement_practice_item_id as replacementPracticeItemId,
                     replaced_status as replacedStatus,
                     replacement_plan_revision as replacementPlanRevision
                from practice_assignment_replacements where plan_id = ?`,
        params: [workspace.plan.id],
      },
      {
        sql: `select action, metadata from audit_events
               where action = 'practice.replaced' order by occurred_at`,
      },
      { sql: "pragma foreign_key_check" },
    ]);
    assert.deepEqual(state.results, [
      { revision: 3, status: "draft", approvedRevision: null, publishedRevision: null },
    ]);
    assert.deepEqual(
      mediaRows.results,
      [
        {
          practiceItemId: [originalId, replacementId].sort()[0],
          mediaAssetId: mediaAsset.id,
          targetType: "practice",
          status: "active",
        },
        {
          practiceItemId: [originalId, replacementId].sort()[1],
          mediaAssetId: mediaAsset.id,
          targetType: "practice",
          status: "active",
        },
      ],
    );
    assert.deepEqual(lineageRows.results, [
      {
        replacedPracticeItemId: originalId,
        replacementPracticeItemId: replacementId,
        replacedStatus: "active",
        replacementPlanRevision: 3,
      },
    ]);
    assert.equal(audits.results.length, 1);
    const auditMetadata = audits.results[0].metadata;
    assert.equal(auditMetadata.includes("Edited assignment purpose marker"), false);
    assert.equal(auditMetadata.includes("Hit four edited synthetic shots"), false);
    assert.equal(auditMetadata.includes("This stale prose must never persist"), false);
    assert.equal(JSON.parse(auditMetadata).mediaAttachmentCount, 1);
    assert.deepEqual(foreignKeys.results, []);

    const [revokedLinks] = await worker.inspect([
      {
        sql: "select status, revoke_reason as revokeReason from share_links where plan_id = ?",
        params: [workspace.plan.id],
      },
    ]);
    assert.deepEqual(revokedLinks.results, [
      { status: "revoked", revokeReason: "practice assignment replaced" },
    ]);
    const invalidatedGolferView = await worker.dispatch(
      `/r/plan?context=${encodeURIComponent(firstSession.sessionContext)}`,
      { headers: { cookie: firstSession.cookie } },
    );
    assert.equal(invalidatedGolferView.status, 200);
    const invalidatedHtml = await invalidatedGolferView.text();
    assert.match(invalidatedHtml, /This private roadmap cannot be opened\./);
    assert.doesNotMatch(invalidatedHtml, /Edited assignment purpose marker\./);

    const secondPublish = await publish(worker, workspace.plan.id, 3);
    const secondShare = await secondPublish.json();
    const secondSession = await exchangeShare(worker, secondShare.share.url);
    const golferView = await worker.dispatch(
      `/r/plan?context=${encodeURIComponent(secondSession.sessionContext)}`,
      { headers: { cookie: secondSession.cookie } },
    );
    assert.equal(golferView.status, 200, await golferView.clone().text());
    const html = await golferView.text();
    const practiceStart = html.indexOf('id="practice"');
    const practiceEnd = html.indexOf('id="media"', practiceStart);
    assert.ok(practiceStart >= 0 && practiceEnd > practiceStart);
    const practiceHtml = html.slice(practiceStart, practiceEnd);
    assert.match(practiceHtml, /Edited assignment purpose marker\./);
    assert.match(practiceHtml, /Hit four edited synthetic shots\./);
    assert.match(html, /Synthetic immutable assignment demo/);
    assert.doesNotMatch(practiceHtml, /Old immutable purpose marker\./);
    assert.doesNotMatch(practiceHtml, /Mutable library edit marker/);
  },
);

function phase(number, title) {
  return {
    number,
    title,
    purpose: `Synthetic purpose for ${title}.`,
    rationale: `Synthetic rationale for ${title}.`,
    progressSignals: [`Synthetic reviewed signal for ${title}.`],
  };
}

async function publish(worker, planId, expectedRevision) {
  const response = await jsonWrite(worker, `/api/plans/${planId}/publish`, "POST", {
    confirmation: "reviewed_exact_golfer_view",
    expectedRevision,
    intendedRecipientContext: "Synthetic adult golfer",
    expiresInDays: 7,
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response;
}

async function exchangeShare(worker, shareUrl) {
  const url = new URL(shareUrl);
  const token = new URLSearchParams(url.hash.slice(1)).get("token");
  assert.ok(token);
  const response = await worker.dispatch("/r/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: testOrigin,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ token }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  return {
    sessionContext: body.sessionContext,
    cookie: response.headers.get("set-cookie")?.split(";", 1)[0],
  };
}

async function jsonWrite(worker, path, method, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}

async function uploadPng(worker) {
  const form = new FormData();
  form.set(
    "file",
    new File([pngBytes()], "synthetic-assignment-demo.png", { type: "image/png" }),
  );
  form.set("altText", "Synthetic immutable assignment demo");
  form.set("caption", "Synthetic assignment media snapshot");
  form.set("orientation", "landscape");
  form.set("widthPixels", "2");
  form.set("heightPixels", "1");
  const multipart = new Response(form);
  const contentType = multipart.headers.get("content-type");
  assert.ok(contentType?.startsWith("multipart/form-data; boundary="));
  return worker.dispatch("/api/media", {
    method: "POST",
    headers: {
      ...identityHeaders(coach.email, coach.name),
      "content-type": contentType,
      origin: testOrigin,
      "sec-fetch-site": "same-origin",
    },
    body: await multipart.arrayBuffer(),
  });
}

function pngBytes() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01,
  ]);
}
