import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  focusFormError,
  INVALID_FORM_CONTROL_SELECTOR,
} from "../components/forms/form-error-focus.ts";
import {
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

    for (const page of [
      { path: "/app/golfers/new", summaryId: "new-golfer-form-error-summary" },
      { path: "/app/settings", summaryId: "profile-form-error-summary" },
      { path: "/app/packages", summaryId: "package-form-error-summary" },
    ]) {
      const response = await worker.dispatch(page.path, { headers });
      assert.equal(response.status, 200, page.path);
      const html = await response.text();
      assert.match(
        html,
        new RegExp(`<form(?=[^>]*aria-describedby="${page.summaryId}")[^>]*>`, "i"),
        page.path,
      );
      assert.match(
        html,
        new RegExp(
          `<div(?=[^>]*id="${page.summaryId}")(?=[^>]*role="alert")(?=[^>]*tabindex="-1")[^>]*>`,
          "i",
        ),
        page.path,
      );
    }
  },
);
