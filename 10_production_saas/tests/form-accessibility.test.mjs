import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  focusFormError,
  INVALID_FORM_CONTROL_SELECTOR,
} from "../components/forms/form-error-focus.ts";
import {
  grantSyntheticGolferRecordConsent,
  grantSyntheticRoadmapSharingConsent,
  identityHeaders,
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const coach = {
  email: "coach.a@example.test",
  name: "Coach Avery",
};

test("form error focus prioritizes the first invalid control and falls back to the summary", () => {
  const focusOrder = [];
  const invalidControl = { focus: () => focusOrder.push("invalid-control") };
  const summary = { focus: () => focusOrder.push("error-summary") };
  const form = {
    querySelector(selector) {
      assert.equal(selector, INVALID_FORM_CONTROL_SELECTOR);
      return invalidControl;
    },
  };

  assert.equal(focusFormError(form, summary), "invalid-control");
  assert.deepEqual(focusOrder, ["invalid-control"]);

  form.querySelector = () => null;
  assert.equal(focusFormError(form, summary), "error-summary");
  assert.deepEqual(focusOrder, ["invalid-control", "error-summary"]);
  assert.equal(focusFormError(null, null), "none");
});

test("summary-only mutation errors bypass invalid controls from unrelated actions", () => {
  const focusOrder = [];
  const unrelatedForm = {
    querySelector: () => ({ focus: () => focusOrder.push("unrelated-control") }),
  };
  const summary = { focus: () => focusOrder.push("operation-summary") };

  assert.equal(focusFormError(null, summary), "error-summary");
  assert.deepEqual(focusOrder, ["operation-summary"]);
  assert.equal(focusFormError(unrelatedForm, summary), "invalid-control");
  assert.deepEqual(focusOrder, ["operation-summary", "unrelated-control"]);
});

test("client error summary runs the shared focus policy when a message appears", async () => {
  const source = await readFile(
    new URL("../components/forms/FormErrorSummary.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /^"use client";/);
  assert.match(source, /if \(message\) \{\s*focusFormError\(formRef\.current, summaryRef\.current\);/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-atomic="true"/);
  assert.match(source, /tabIndex=\{-1\}/);
});

test("long content can reflow and mobile focus targets clear the fixed workspace navigation", async () => {
  const [globalStyles, workspaceStyles, planStyles] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/app/workspace.module.css", import.meta.url), "utf8"),
    readFile(new URL("../components/plan/plan.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(globalStyles, /body\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(workspaceStyles, /(?:^|\n)\.page\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(planStyles, /(?:^|\n)\.plan\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(
    globalStyles,
    /@media \(max-width: 800px\)\s*\{\s*html\s*\{[^}]*scroll-padding-bottom:\s*4\.75rem;/s,
  );
});

test("first-party instructor mutation surfaces use the shared error summary without weakening success announcements", async () => {
  const surfaces = [
    {
      path: "../app/app/golfers/[golferId]/edit/PlanEditorForm.tsx",
      summaryId: "plan-editor-form-error-summary",
      describedBy: /aria-describedby=\{ERROR_SUMMARY_ID\}/g,
      associations: 1,
    },
    {
      path: "../app/app/golfers/[golferId]/PublishControls.tsx",
      summaryId: "publish-controls-error-summary",
      describedBy: /aria-describedby=\{ERROR_SUMMARY_ID\}/g,
      associations: 3,
      successStatus: true,
    },
    {
      path: "../app/app/golfers/[golferId]/settings/GolferSettingsForm.tsx",
      summaryId: "golfer-settings-form-error-summary",
      describedBy: /aria-describedby=\{ERROR_SUMMARY_ID\}/g,
      associations: 1,
    },
    {
      path: "../app/app/golfers/[golferId]/LivingPlanForms.tsx",
      summaryId: "living-plan-forms-error-summary",
      describedBy: /aria-describedby=\{ERROR_SUMMARY_ID\}/g,
      associations: 4,
      successStatus: true,
    },
    {
      path: "../app/app/golfers/[golferId]/complete/StagedCompletionForm.tsx",
      summaryId: "staged-completion-form-error-summary",
      describedBy: /aria-describedby=\{ERROR_SUMMARY_ID\}/g,
      associations: 1,
    },
    {
      path: "../app/app/packages/PackageLifecycleControls.tsx",
      summaryId: "lifecycle-error-summary",
      describedBy: /aria-describedby=\{errorSummaryId\}/g,
      associations: 1,
      successStatus: true,
    },
    {
      path: "../app/app/settings/data/DataRequestControls.tsx",
      summaryId: "data-request-controls-error-summary",
      describedBy: /aria-describedby=\{ERROR_SUMMARY_ID\}/g,
      associations: 1,
      successStatus: true,
    },
  ];

  for (const surface of surfaces) {
    const source = await readFile(new URL(surface.path, import.meta.url), "utf8");
    assert.match(source, /import \{ FormErrorSummary \} from "@\/components\/forms\/FormErrorSummary";/, surface.path);
    assert.match(source, /useRef<HTMLFormElement>\(null\)/, surface.path);
    assert.match(source, /<FormErrorSummary\s/, surface.path);
    assert.match(source, new RegExp(surface.summaryId), surface.path);
    assert.equal(
      source.match(surface.describedBy)?.length,
      surface.associations,
      `${surface.path} should associate every mutation form with its error summary`,
    );
    if (surface.successStatus) {
      assert.match(source, /role="status"/, `${surface.path} should retain a polite success status`);
    }
  }

  for (const surface of [
    {
      path: "../app/app/golfers/[golferId]/PublishControls.tsx",
      summaryActions: 1,
      focusRef:
        /formRef=\{\s*errorFocus === "form"\s*\? formRef\s*: errorFocus === "replacement"\s*\? replacementFormRef\s*: errorFocus === "reissue"\s*\? reissueFormRef\s*: summaryOnlyRef\s*\}/,
    },
    {
      path: "../app/app/golfers/[golferId]/settings/GolferSettingsForm.tsx",
      summaryActions: 1,
    },
    {
      path: "../app/app/packages/PackageLifecycleControls.tsx",
      summaryActions: 1,
    },
    {
      path: "../app/app/settings/data/DataRequestControls.tsx",
      summaryActions: 2,
    },
  ]) {
    const source = await readFile(new URL(surface.path, import.meta.url), "utf8");
    assert.match(source, /const summaryOnlyRef = useRef<HTMLFormElement>\(null\);/);
    assert.match(
      source,
      surface.focusRef ??
        /formRef=\{errorFocus === "form" \? formRef : summaryOnlyRef\}/,
    );
    assert.equal(
      source.match(/setErrorFocus\("summary"\)/g)?.length,
      surface.summaryActions,
      `${surface.path} should mark every non-form mutation as summary-only`,
    );
  }
});

test(
  "instructor forms render focusable alert summaries associated through aria-describedby",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());
    const headers = identityHeaders(coach.email, coach.name);

    const profileResponse = await worker.dispatch("/api/profile", {
      method: "PUT",
      headers: writeHeaders(coach.email, coach.name),
      body: JSON.stringify({
        displayName: coach.name,
        contactEmail: coach.email,
      }),
    });
    assert.equal(profileResponse.status, 200);
    await grantSyntheticGolferRecordConsent(worker, coach);

    const packageResponse = await worker.dispatch("/api/packages", {
      method: "POST",
      headers: writeHeaders(coach.email, coach.name),
      body: JSON.stringify({
        title: "Accessible coaching series",
        description: "A synthetic package used only to verify rendered form semantics.",
        priceCents: 25_000,
        currency: "CAD",
        terms: "Synthetic local test terms with no purchase or communication.",
        inclusions: ["Two private lessons"],
        externalActionUrl: "https://booking.example.ca/accessibility",
        status: "active",
      }),
    });
    assert.equal(packageResponse.status, 201);
    const coachingPackage = (await packageResponse.json()).package;
    assert.ok(coachingPackage?.id);

    const golferResponse = await worker.dispatch("/api/golfers", {
      method: "POST",
      headers: writeHeaders(coach.email, coach.name),
      body: JSON.stringify({
        adultEligibilityConfirmed: true,
        displayName: "Jordan Accessibility",
        email: "jordan.accessibility@example.test",
        planTitle: "Accessible coaching roadmap",
        firstPhasePackageId: coachingPackage.id,
        goal: {
          statement: "Build more predictable contact during ordinary rounds.",
          why: "Enjoy play with a clearer practice direction.",
          context: "Synthetic local form-accessibility verification only.",
        },
        assessment: {
          summary: "Contact varies as tempo increases.",
          strengths: "Clear awareness of strike feedback.",
          primaryPattern: "Strike location changes as tempo increases.",
          limitations: "One synthetic observation cannot predict on-course outcomes.",
        },
        priority: {
          title: "Centered contact",
          rationale: "A stable strike pattern supports later direction choices.",
        },
        phases: [1, 2, 3, 4].map((number) => ({
          number,
          title: `Phase ${number}`,
          purpose: `Synthetic directional purpose for phase ${number}.`,
          rationale: number === 1 ? "Establish the observed strike baseline first." : null,
          progressSignals: number === 1 ? ["Strike location repeats in a coach-reviewed set."] : [],
        })),
      }),
    });
    assert.equal(golferResponse.status, 201);
    const workspace = await golferResponse.json();
    await grantSyntheticRoadmapSharingConsent(worker, coach, workspace.golfer.id);
    assert.ok(workspace.golfer?.id);

    const stagedResponse = await worker.dispatch("/api/golfers/staged", {
      method: "POST",
      headers: {
        ...writeHeaders(coach.email, coach.name),
        "idempotency-key": "accessibility-staged-authoring-0001",
      },
      body: JSON.stringify({
        adultEligibilityConfirmed: true,
        displayName: "Taylor Accessibility Staged",
        preferredName: "Taylor",
        email: "taylor.accessibility@example.test",
        planTitle: "Accessible staged roadmap",
        goal: {
          statement: "Build a truthful staged accessibility goal.",
          why: "Verify the resumable form semantics.",
          context: "Synthetic local accessibility verification only.",
        },
      }),
    });
    assert.equal(stagedResponse.status, 201);
    const staged = await stagedResponse.json();

    const golferPath = `/app/golfers/${workspace.golfer.id}`;
    for (const page of [
      { path: "/app", title: "Coach overview | Roadmap", summaries: [] },
      { path: "/app/golfers", title: "Golfers | Roadmap", summaries: [] },
      {
        path: "/app/golfers/new",
        title: "Add a golfer | Roadmap",
        summaries: [["new-golfer-form-error-summary", 1]],
      },
      {
        path: "/app/settings",
        title: "Coach settings | Roadmap",
        summaries: [["profile-form-error-summary", 1]],
      },
      {
        path: "/app/packages",
        title: "Coaching packages | Roadmap",
        summaries: [
          ["package-form-error-summary", 1],
          [`package-${coachingPackage.id}-lifecycle-error-summary`, 1],
        ],
      },
      { path: "/app/billing", title: "Plan and billing | Roadmap", summaries: [] },
      {
        path: "/app/settings/data",
        title: "Data and privacy requests | Roadmap",
        summaries: [["data-request-controls-error-summary", 1]],
      },
      {
        path: golferPath,
        title: "Golfer plan | Roadmap",
        summaries: [
          ["living-plan-forms-error-summary", 3],
          ["publish-controls-error-summary", 1],
        ],
      },
      {
        path: `${golferPath}/edit`,
        title: "Edit golfer roadmap | Roadmap",
        summaries: [["plan-editor-form-error-summary", 1]],
      },
      {
        path: `${golferPath}/settings`,
        title: "Golfer settings | Roadmap",
        summaries: [["golfer-settings-form-error-summary", 1]],
      },
      {
        path: `/app/golfers/${staged.golfer.id}/complete`,
        title: "Complete golfer roadmap | Roadmap",
        summaries: [["staged-completion-form-error-summary", 1]],
      },
    ]) {
      const response = await worker.dispatch(page.path, { headers });
      assert.equal(response.status, 200, page.path);
      const html = await response.text();
      assert.match(
        html,
        new RegExp(`<title>${escapeRegExp(page.title)}</title>`, "i"),
        `${page.path}: document title`,
      );
      for (const [summaryId, associationCount] of page.summaries) {
        const associatedForms = html.match(
          new RegExp(`<form(?=[^>]*aria-describedby="${escapeRegExp(summaryId)}")[^>]*>`, "gi"),
        ) ?? [];
        assert.equal(associatedForms.length, associationCount, `${page.path}: ${summaryId}`);
        assert.match(
          html,
          new RegExp(
            `<div(?=[^>]*id="${escapeRegExp(summaryId)}")(?=[^>]*role="alert")(?=[^>]*tabindex="-1")[^>]*>`,
            "i",
          ),
          `${page.path}: ${summaryId}`,
        );
      }
    }
  },
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
