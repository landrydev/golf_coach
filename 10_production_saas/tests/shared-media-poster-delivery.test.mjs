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

const coach = { email: "coach.a@example.test", name: "Coach Poster" };
const otherCoach = { email: "coach.b@example.test", name: "Coach Other Tenant" };

const mediaPolicy = JSON.stringify({
  version: "synthetic-shared-poster-v1",
  maxBytes: 1_048_576,
  maxVideoDurationMs: 60_000,
  allowedMimeTypes: ["image/png", "video/mp4"],
  accountMediaConsentRequired: false,
  golferMediaConsentRequired: false,
});

test(
  "a published poster-linked video emits and streams its private poster only for the owning plan capability",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker({ MEDIA_UPLOAD_POLICY_JSON: mediaPolicy });
    context.after(() => worker.dispose());

    await assertStatus(
      await jsonWrite(worker, coach, "/api/profile", "PUT", {
        displayName: coach.name,
        businessName: "Synthetic Poster Studio",
        professionalTitle: "Golf instructor",
        philosophy: "Synthetic test records only.",
        contactEmail: coach.email,
        contactPhone: null,
        websiteUrl: null,
        city: "Calgary",
        provinceOrTerritory: "Alberta",
        accentColor: "#1b4f40",
      }),
      200,
    );
    await grantSyntheticGolferRecordConsent(worker, coach);

    const ownerWorkspace = await createWorkspace(worker, "Poster Owner");
    const otherPlanWorkspace = await createWorkspace(worker, "Other Plan");

    const posterResponse = await uploadPoster(worker);
    await assertStatus(posterResponse, 201);
    const poster = (await posterResponse.json()).asset;
    assert.equal(poster.status, "ready");
    assert.equal(poster.mediaKind, "image");

    const videoResponse = await uploadVideo(worker, poster.id);
    await assertStatus(videoResponse, 201);
    const video = (await videoResponse.json()).asset;
    assert.equal(video.status, "ready");
    assert.equal(video.mediaKind, "video");
    assert.equal(video.posterMediaAssetId, poster.id);

    const attachmentResponse = await jsonWrite(
      worker,
      coach,
      `/api/plans/${ownerWorkspace.plan.id}/coaching/media`,
      "POST",
      {
        expectedRevision: ownerWorkspace.plan.revision,
        mediaAssetId: video.id,
        target: { kind: "assessment", id: ownerWorkspace.assessment.id },
        role: "baseline",
        label: "Poster-linked baseline swing",
        coachContext: "Synthetic clip retained only for this exact roadmap.",
        sortOrder: 0,
      },
    );
    await assertStatus(attachmentResponse, 201);
    const attachment = await attachmentResponse.json();
    assert.equal(attachment.plan.revision, 2);

    await grantSyntheticRoadmapSharingConsent(
      worker,
      coach,
      ownerWorkspace.golfer.id,
    );
    await grantSyntheticRoadmapSharingConsent(
      worker,
      coach,
      otherPlanWorkspace.golfer.id,
    );

    const ownerShare = await publish(
      worker,
      ownerWorkspace.plan.id,
      attachment.plan.revision,
      "Synthetic poster owner",
    );
    const otherPlanShare = await publish(
      worker,
      otherPlanWorkspace.plan.id,
      otherPlanWorkspace.plan.revision,
      "Synthetic other-plan recipient",
    );
    const ownerSession = await exchange(worker, tokenFromPublish(ownerShare));
    const otherPlanSession = await exchange(worker, tokenFromPublish(otherPlanShare));

    const ownerPlanResponse = await worker.dispatch(
      `/r/plan?context=${encodeURIComponent(ownerSession.context)}`,
      { headers: { accept: "text/html", cookie: ownerSession.cookie } },
    );
    await assertStatus(ownerPlanResponse, 200);
    const ownerPlanHtml = await ownerPlanResponse.text();
    const sharedVideoUrl = sharedMediaUrl(video.id, ownerSession.context);
    const sharedPosterUrl = sharedMediaUrl(poster.id, ownerSession.context);
    assert.match(
      ownerPlanHtml,
      new RegExp(`poster="${escapeRegExp(sharedPosterUrl)}"`),
    );
    assert.match(ownerPlanHtml, new RegExp(`src="${escapeRegExp(sharedVideoUrl)}"`));
    assert.match(ownerPlanHtml, /Synthetic poster-linked swing/);
    assert.match(
      ownerPlanHtml,
      /Synthetic clip retained only for this exact roadmap\./,
    );

    const deliveredPoster = await worker.dispatch(sharedPosterUrl, {
      headers: { cookie: ownerSession.cookie },
    });
    await assertStatus(deliveredPoster, 200);
    assert.equal(deliveredPoster.headers.get("content-type"), "image/png");
    assert.equal(
      deliveredPoster.headers.get("cache-control"),
      "private, no-store, max-age=0",
    );
    assert.deepEqual(
      new Uint8Array(await deliveredPoster.arrayBuffer()),
      posterBytes(),
    );

    const otherPlanAttempt = await worker.dispatch(
      sharedMediaUrl(poster.id, otherPlanSession.context),
      { headers: { cookie: otherPlanSession.cookie } },
    );
    assert.equal(otherPlanAttempt.status, 404);

    const mismatchedCapabilityAttempt = await worker.dispatch(sharedPosterUrl, {
      headers: { cookie: otherPlanSession.cookie },
    });
    assert.equal(mismatchedCapabilityAttempt.status, 404);

    const otherTenantAttempt = await worker.dispatch(`/api/media/${poster.id}`, {
      headers: identityHeaders(otherCoach.email, otherCoach.name),
    });
    assert.equal(otherTenantAttempt.status, 404);
    assert.equal((await otherTenantAttempt.json()).error.code, "media_not_found");
  },
);

async function createWorkspace(worker, label) {
  const response = await jsonWrite(worker, coach, "/api/golfers", "POST", {
    adultEligibilityConfirmed: true,
    displayName: `${label} Golfer`,
    email: `${label.toLowerCase().replaceAll(" ", ".")}@example.test`,
    planTitle: `${label} roadmap`,
    coachingPackageId: null,
    goal: {
      statement: "Build a predictable contact window.",
      why: "Make target choices from a clearer pattern.",
      context: "Synthetic poster-delivery fixture.",
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

async function uploadPoster(worker) {
  const form = new FormData();
  form.set(
    "file",
    new File([posterBytes()], "synthetic-video-poster.png", { type: "image/png" }),
  );
  form.set("altText", "Synthetic address-position video poster");
  form.set("caption", "Synthetic video poster");
  form.set("orientation", "landscape");
  form.set("widthPixels", "2");
  form.set("heightPixels", "1");
  return multipartWrite(worker, form);
}

async function uploadVideo(worker, posterMediaAssetId) {
  const form = new FormData();
  form.set(
    "file",
    new File(
      [Uint8Array.from([0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 0, 0])],
      "synthetic-poster-linked-swing.mp4",
      { type: "video/mp4" },
    ),
  );
  form.set("altText", "Synthetic down-the-line swing video");
  form.set("caption", "Synthetic poster-linked swing");
  form.set("orientation", "landscape");
  form.set("widthPixels", "640");
  form.set("heightPixels", "360");
  form.set("durationMs", "1000");
  form.set("posterMediaAssetId", posterMediaAssetId);
  return multipartWrite(worker, form);
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

async function publish(worker, planId, expectedRevision, intendedRecipientContext) {
  const response = await jsonWrite(
    worker,
    coach,
    `/api/plans/${planId}/publish`,
    "POST",
    {
      confirmation: "reviewed_exact_golfer_view",
      expectedRevision,
      intendedRecipientContext,
      expiresInDays: 7,
    },
  );
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
  assert.match(body.sessionContext, /^[0-9a-f]{64}$/);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.match(cookie ?? "", /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);
  return { context: body.sessionContext, cookie };
}

function tokenFromPublish(body) {
  const token = new URLSearchParams(new URL(body.share.url).hash.slice(1)).get("token");
  assert.ok(token);
  return token;
}

function sharedMediaUrl(mediaAssetId, sessionContext) {
  return `/r/media/${encodeURIComponent(mediaAssetId)}?context=${encodeURIComponent(sessionContext)}`;
}

function jsonWrite(worker, identity, path, method, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(identity.email, identity.name),
    body: JSON.stringify(body),
  });
}

function posterBytes() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01,
  ]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertStatus(response, expected) {
  if (response.status !== expected) {
    assert.equal(response.status, expected, await response.text());
  }
}
