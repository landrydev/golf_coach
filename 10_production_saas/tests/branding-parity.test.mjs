import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  name: "Coach Branding",
};

const mediaPolicy = JSON.stringify({
  version: "synthetic-branding-parity-v1",
  maxBytes: 1_048_576,
  maxVideoDurationMs: 60_000,
  allowedMimeTypes: ["image/png"],
  accountMediaConsentRequired: false,
  golferMediaConsentRequired: false,
});

test(
  "saved branding uses private media consistently in the coach shell and exact golfer print document",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker({ MEDIA_UPLOAD_POLICY_JSON: mediaPolicy });
    context.after(() => worker.dispose());

    const profile = await jsonWrite(worker, "/api/profile", "PUT", {
      displayName: coach.name,
      businessName: "Synthetic North Star Golf",
      professionalTitle: "Golf instructor",
      philosophy: "Synthetic branding-parity fixture only.",
      contactEmail: coach.email,
      contactPhone: null,
      websiteUrl: null,
      city: "Calgary",
      provinceOrTerritory: "Alberta",
      accentColor: "#176b55",
    });
    assert.equal(profile.status, 200, await profile.clone().text());
    await grantSyntheticGolferRecordConsent(worker, coach);

    const logo = await uploadPng(
      worker,
      "synthetic-logo.png",
      "Synthetic North Star Golf logo",
      "Synthetic North Star Golf logo",
    );
    const photo = await uploadPng(
      worker,
      "synthetic-coach-photo.png",
      "Portrait of Coach Branding",
      "Coach Branding profile photo",
    );
    assert.equal(logo.status, 201, await logo.clone().text());
    assert.equal(photo.status, 201, await photo.clone().text());
    const logoId = (await logo.json()).asset.id;
    const photoId = (await photo.json()).asset.id;

    for (const [mediaAssetId, role] of [
      [logoId, "logo"],
      [photoId, "profile_photo"],
    ]) {
      const attached = await jsonWrite(worker, "/api/profile/media", "POST", {
        mediaAssetId,
        role,
      });
      assert.equal(attached.status, 201, await attached.clone().text());
    }

    const workspaceShell = await worker.dispatch("/app", {
      headers: { accept: "text/html", ...identityHeaders(coach.email, coach.name) },
    });
    assert.equal(workspaceShell.status, 200, await workspaceShell.clone().text());
    const workspaceHtml = await workspaceShell.text();
    assert.match(workspaceHtml, /--workspace-accent:#176b55/);
    assert.match(workspaceHtml, /Synthetic North Star Golf/);
    assert.match(workspaceHtml, new RegExp(`/api/media/${logoId}`));
    assert.match(workspaceHtml, new RegExp(`/api/media/${photoId}`));

    for (const mediaAssetId of [logoId, photoId]) {
      const ownedMedia = await worker.dispatch(`/api/media/${mediaAssetId}`, {
        headers: identityHeaders(coach.email, coach.name),
      });
      assert.equal(ownedMedia.status, 200);
      assert.equal(ownedMedia.headers.get("cache-control"), "private, no-store, max-age=0");
      const crossTenantMedia = await worker.dispatch(`/api/media/${mediaAssetId}`, {
        headers: identityHeaders("coach.b@example.test", "Other Synthetic Coach"),
      });
      assert.equal(crossTenantMedia.status, 404);
    }

    const golferResponse = await jsonWrite(worker, "/api/golfers", "POST", {
      adultEligibilityConfirmed: true,
      displayName: "Synthetic Branding Golfer",
      planTitle: "Synthetic branded roadmap",
      coachingPackageId: null,
      goal: {
        statement: "Build a predictable contact window.",
        why: "Make target choices with a clearer pattern.",
        context: "Synthetic branding parity only.",
      },
      assessment: {
        summary: "Contact varies with transition tempo.",
        strengths: "Clear awareness of strike feedback.",
        primaryPattern: "Strike location changes as tempo rises.",
        limitations: "One synthetic sample is not representative.",
      },
      priority: {
        title: "Centered contact",
        rationale: "This is the narrowest observed priority.",
      },
      phases: [
        {
          number: 1,
          title: "Calibrate",
          purpose: "Establish a baseline.",
          rationale: "Begin with the bounded observed priority.",
          progressSignals: ["A coach-reviewed contact window repeats."],
        },
        {
          number: 2,
          title: "Transfer",
          purpose: "Test representative targets.",
          rationale: "Transfer follows a reviewed baseline.",
          progressSignals: ["The pattern appears in a representative target set."],
        },
        {
          number: 3,
          title: "Retain",
          purpose: "Review under constraints.",
          rationale: "Retention remains conditional on later evidence.",
          progressSignals: ["The pattern remains observable under a reviewed constraint."],
        },
      ],
    });
    assert.equal(golferResponse.status, 201, await golferResponse.clone().text());
    const workspace = await golferResponse.json();
    await grantSyntheticRoadmapSharingConsent(worker, coach, workspace.golfer.id);

    const publication = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/publish`,
      "POST",
      {
        confirmation: "reviewed_exact_golfer_view",
        expectedRevision: 1,
        intendedRecipientContext: "Synthetic branding recipient",
        expiresInDays: 7,
      },
    );
    assert.equal(publication.status, 201, await publication.clone().text());
    const shareUrl = new URL((await publication.json()).share.url);
    const token = new URLSearchParams(shareUrl.hash.slice(1)).get("token");
    assert.ok(token);
    const exchange = await worker.dispatch("/r/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ token }),
    });
    assert.equal(exchange.status, 200, await exchange.clone().text());
    const sessionContext = (await exchange.json()).sessionContext;
    const cookie = exchange.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie);

    const golferPlan = await worker.dispatch(
      `/r/plan?context=${encodeURIComponent(sessionContext)}`,
      { headers: { accept: "text/html", cookie } },
    );
    assert.equal(golferPlan.status, 200, await golferPlan.clone().text());
    const golferHtml = await golferPlan.text();
    assert.match(golferHtml, /--coach-accent:#176b55/);
    assert.match(golferHtml, /Synthetic North Star Golf/);
    assert.match(
      golferHtml,
      new RegExp(`/r/media/${logoId}\\?context=${sessionContext}`),
    );
    assert.match(
      golferHtml,
      new RegExp(`/r/media/${photoId}\\?context=${sessionContext}`),
    );
    assert.match(golferHtml, /Coach-authored private development plan/);

    for (const mediaAssetId of [logoId, photoId]) {
      const sharedMedia = await worker.dispatch(
        `/r/media/${mediaAssetId}?context=${sessionContext}`,
        { headers: { cookie } },
      );
      assert.equal(sharedMedia.status, 200);
      assert.equal(sharedMedia.headers.get("cache-control"), "private, no-store, max-age=0");
    }
  },
);

test("branding images retain useful initial fallbacks and print-visible coach identity", async () => {
  const [workspaceLayout, workspaceBranding, privatePlanMedia, planView, planStyles] = await Promise.all([
    readFile(new URL("../app/app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app/PrivateWorkspaceBranding.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/plan/PrivatePlanMedia.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/plan/PlanView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/plan/plan.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(workspaceLayout, /Local development identity — production requires secure sign-in\./);
  assert.doesNotMatch(workspaceLayout, /â€”|Ã¢|Â/);
  assert.match(workspaceBranding, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(workspaceBranding, /data-branding-fallback=\{variant\}/);
  assert.match(privatePlanMedia, /data-branding-fallback="true"/);
  assert.match(planView, /coachProfilePhotoUrl[\s\S]*className=\{styles\.coachPortrait\}/);
  assert.match(planStyles, /@media print[\s\S]*\.coachPortrait[\s\S]*print-color-adjust: exact/);
});

async function jsonWrite(worker, path, method, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(coach.email, coach.name),
    body: JSON.stringify(body),
  });
}

async function uploadPng(worker, filename, altText, caption) {
  const form = new FormData();
  form.set("file", new File([pngBytes()], filename, { type: "image/png" }));
  form.set("altText", altText);
  form.set("caption", caption);
  form.set("orientation", "square");
  form.set("widthPixels", "2");
  form.set("heightPixels", "2");
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
    0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02,
  ]);
}
