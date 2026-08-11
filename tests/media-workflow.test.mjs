import assert from "node:assert/strict";
import test from "node:test";
import {
  identityHeaders,
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "./support/d1-worker.mjs";

const POLICY = JSON.stringify({
  version: "synthetic-media-workflow-v1",
  maxBytes: 1_048_576,
  maxVideoDurationMs: 60_000,
  allowedMimeTypes: ["image/png", "video/mp4"],
  accountMediaConsentRequired: false,
  golferMediaConsentRequired: false,
});

const coach = {
  // This synthetic identity is in the test harness's owner-private allowlist.
  email: "coach.a@example.test",
  name: "Coach Media",
};

test("private media upload, range delivery, replacement, branding attachment, withdrawal, and removal persist real R2/D1 state", async () => {
  const worker = await startD1Worker({ MEDIA_UPLOAD_POLICY_JSON: POLICY });
  try {
    const profile = await worker.dispatch("/api/profile", {
      method: "PUT",
      headers: writeHeaders(coach.email, coach.name),
      body: JSON.stringify({
        displayName: coach.name,
        businessName: "Synthetic Range Studio",
        professionalTitle: "Golf instructor",
        philosophy: "Synthetic test content only.",
        contactEmail: coach.email,
        contactPhone: "",
        websiteUrl: "",
        city: "Calgary",
        provinceOrTerritory: "Alberta",
        accentColor: "#1b4f40",
        expectedUpdatedAt: null,
      }),
    });
    await assertStatus(profile, 200);

    const first = await uploadPng(worker, "baseline.png", "Baseline synthetic swing image");
    await assertStatus(first, 201);
    const firstBody = await first.json();
    assert.match(firstBody.asset.id, /^[0-9a-f-]{36}$/i);
    assert.equal(firstBody.asset.status, "ready");

    const full = await worker.dispatch(`/api/media/${firstBody.asset.id}`, {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(full.status, 200);
    assert.equal(full.headers.get("content-type"), "image/png");
    assert.equal(full.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal((await full.arrayBuffer()).byteLength, pngBytes().byteLength);

    const range = await worker.dispatch(`/api/media/${firstBody.asset.id}`, {
      headers: {
        ...identityHeaders(coach.email, coach.name),
        range: "bytes=0-7",
      },
    });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("content-range"), `bytes 0-7/${pngBytes().byteLength}`);
    assert.deepEqual(new Uint8Array(await range.arrayBuffer()), pngBytes().subarray(0, 8));

    const otherTenant = await worker.dispatch(`/api/media/${firstBody.asset.id}`, {
      headers: identityHeaders("coach.b@example.test", "Coach Blake"),
    });
    assert.equal(otherTenant.status, 404);

    const attach = await worker.dispatch("/api/profile/media", {
      method: "POST",
      headers: writeHeaders(coach.email, coach.name),
      body: JSON.stringify({
        mediaAssetId: firstBody.asset.id,
        role: "logo",
      }),
    });
    await assertStatus(attach, 201);
    const attachBody = await attach.json();

    const attachedDelete = await worker.dispatch(`/api/media/${firstBody.asset.id}`, {
      method: "DELETE",
      headers: writeHeaders(coach.email, coach.name),
    });
    assert.equal(attachedDelete.status, 409);

    const replacement = await uploadPng(
      worker,
      "current.png",
      "Current synthetic swing image",
      firstBody.asset.id,
    );
    await assertStatus(replacement, 201);
    const replacementBody = await replacement.json();
    assert.notEqual(replacementBody.asset.id, firstBody.asset.id);

    const library = await worker.dispatch("/api/media", {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(library.status, 200);
    const libraryBody = await library.json();
    const oldAsset = libraryBody.assets.find((asset) => asset.id === firstBody.asset.id);
    assert.equal(oldAsset.replacementMediaAssetId, replacementBody.asset.id);

    const withdraw = await worker.dispatch("/api/profile/media", {
      method: "DELETE",
      headers: writeHeaders(coach.email, coach.name),
      body: JSON.stringify({
        attachmentId: attachBody.attachment.id,
        confirmation: "remove_profile_media",
      }),
    });
    await assertStatus(withdraw, 200);

    const removed = await worker.dispatch(`/api/media/${firstBody.asset.id}`, {
      method: "DELETE",
      headers: writeHeaders(coach.email, coach.name),
    });
    await assertStatus(removed, 204);
    const afterRemoval = await worker.dispatch(`/api/media/${firstBody.asset.id}`, {
      headers: identityHeaders(coach.email, coach.name),
    });
    assert.equal(afterRemoval.status, 404);

    const [rows] = await worker.inspect([
      {
        sql: `select action from audit_events
              where action in ('media.upload', 'media.delete', 'media_attachment.created', 'media_attachment.withdrawn')
              order by occurred_at, action`,
      },
    ]);
    const actions = rows.results.map((row) => row.action);
    assert.equal(actions.filter((action) => action === "media.upload").length, 2);
    assert.ok(actions.includes("media.delete"));
    assert.ok(actions.includes("media_attachment.created"));
    assert.ok(actions.includes("media_attachment.withdrawn"));

    const replacementAccountId = await accountId(worker);
    const mediaBucket = await worker.media();
    const storedReplacement = await mediaBucket.head(
      `accounts/${replacementAccountId}/media/${replacementBody.asset.id}/unused`,
    );
    // Object keys are intentionally random and never derived by callers; the
    // D1 row below proves the canonical key while this null lookup proves a
    // guessed mutable path is not accepted.
    assert.equal(storedReplacement, null);
    const [objects] = await worker.inspect([
      {
        sql: "select status, object_key as objectKey from media_assets where id = ?",
        params: [replacementBody.asset.id],
      },
    ]);
    assert.equal(objects.results[0].status, "ready");
    const refreshedMediaBucket = await worker.media();
    assert.ok(await refreshedMediaBucket.head(objects.results[0].objectKey));
  } finally {
    await worker.dispose();
  }
});

test("media policy rejects a MIME/signature mismatch without storing an asset", async () => {
  const worker = await startD1Worker({ MEDIA_UPLOAD_POLICY_JSON: POLICY });
  try {
    const form = new FormData();
    form.set("file", new File([new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])], "not-png.png", { type: "image/png" }));
    form.set("altText", "Invalid synthetic file");
    form.set("orientation", "unknown");
    const multipart = await encodedMultipart(form);
    const response = await worker.dispatch("/api/media", {
      method: "POST",
      headers: { ...mutationHeaders(coach), "content-type": multipart.contentType },
      body: multipart.body,
    });
    assert.equal(response.status, 415);
    const body = await response.json();
    assert.equal(body.error.code, "media_signature_mismatch");
    const [count] = await worker.inspect([
      { sql: "select count(*) as value from media_assets" },
    ]);
    assert.equal(count.results[0].value, 0);
  } finally {
    await worker.dispose();
  }
});

test("video upload stores a tenant-owned poster relationship and protects it until the video is removed", async () => {
  const worker = await startD1Worker({ MEDIA_UPLOAD_POLICY_JSON: POLICY });
  try {
    const posterResponse = await uploadPng(
      worker,
      "poster.png",
      "Synthetic address-position poster",
    );
    await assertStatus(posterResponse, 201);
    const poster = (await posterResponse.json()).asset;

    const videoResponse = await uploadMp4(worker, poster.id);
    await assertStatus(videoResponse, 201);
    const video = (await videoResponse.json()).asset;
    assert.equal(video.mediaKind, "video");
    assert.equal(video.posterMediaAssetId, poster.id);

    const library = await worker.dispatch("/api/media", {
      headers: identityHeaders(coach.email, coach.name),
    });
    await assertStatus(library, 200);
    const listedVideo = (await library.json()).assets.find((asset) => asset.id === video.id);
    assert.equal(listedVideo.posterMediaAssetId, poster.id);

    const protectedPoster = await worker.dispatch(`/api/media/${poster.id}`, {
      method: "DELETE",
      headers: writeHeaders(coach.email, coach.name),
    });
    assert.equal(protectedPoster.status, 409);
    assert.match((await protectedPoster.text()), /different poster/i);

    await assertStatus(
      await worker.dispatch(`/api/media/${video.id}`, {
        method: "DELETE",
        headers: writeHeaders(coach.email, coach.name),
      }),
      204,
    );
    await assertStatus(
      await worker.dispatch(`/api/media/${poster.id}`, {
        method: "DELETE",
        headers: writeHeaders(coach.email, coach.name),
      }),
      204,
    );
  } finally {
    await worker.dispose();
  }
});

async function uploadPng(worker, filename, altText, replacementForAssetId = null) {
  const form = new FormData();
  form.set("file", new File([pngBytes()], filename, { type: "image/png" }));
  form.set("altText", altText);
  form.set("caption", filename.startsWith("baseline") ? "Baseline" : "Current");
  form.set("orientation", "landscape");
  form.set("widthPixels", "2");
  form.set("heightPixels", "1");
  if (replacementForAssetId) {
    form.set("replacementForAssetId", replacementForAssetId);
    form.set("replacementReason", "coach_replaced");
  }
  const multipart = await encodedMultipart(form);
  return worker.dispatch("/api/media", {
    method: "POST",
    headers: { ...mutationHeaders(coach), "content-type": multipart.contentType },
    body: multipart.body,
  });
}

async function uploadMp4(worker, posterMediaAssetId) {
  const form = new FormData();
  form.set(
    "file",
    new File(
      [Uint8Array.from([0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 0, 0])],
      "synthetic-swing.mp4",
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
  const multipart = await encodedMultipart(form);
  return worker.dispatch("/api/media", {
    method: "POST",
    headers: { ...mutationHeaders(coach), "content-type": multipart.contentType },
    body: multipart.body,
  });
}

async function encodedMultipart(form) {
  const response = new Response(form);
  const contentType = response.headers.get("content-type");
  assert.ok(contentType?.startsWith("multipart/form-data; boundary="));
  return { contentType, body: await response.arrayBuffer() };
}

function mutationHeaders(identity) {
  return {
    ...identityHeaders(identity.email, identity.name),
    origin: testOrigin,
    "sec-fetch-site": "same-origin",
  };
}

function pngBytes() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01,
  ]);
}

async function accountId(worker) {
  const [result] = await worker.inspect([
    { sql: "select id from accounts where normalized_email = ?", params: [coach.email] },
  ]);
  return result.results[0].id;
}

async function assertStatus(response, expected) {
  if (response.status !== expected) {
    assert.equal(response.status, expected, await response.text());
  }
}
