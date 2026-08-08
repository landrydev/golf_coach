import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cleanEmail, RequestError } from "../lib/http.ts";
import {
  buildCoachContactMailtoUri,
  isSafeMailtoAddress,
} from "../lib/mailto.ts";
import {
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

const validPlusTag = "coach+roadmap@example.ca";
const expectedMailto =
  "mailto:coach+roadmap@example.ca?subject=Question%20about%20my%20Roadmap%20coaching%20plan";

const ambiguousAddresses = [
  "coach@example.ca?subject=Injected",
  "coach@example.ca#fragment",
  "coach%0d%0a@example.ca",
  "coach%0D%0ABcc@example.ca",
  '"coach"@example.ca',
  "coach'quote@example.ca",
  "co\u0430ch@example.ca",
  "coach\uff20example.ca",
  "coach\u0000@example.ca",
  "coach\u001f@example.ca",
  "coach\u007f@example.ca",
  "coach\r\nBcc@example.ca",
];

test("safe mailto construction preserves plus tags and encodes its fixed subject", () => {
  assert.equal(cleanEmail("  Coach+Roadmap@Example.CA  "), validPlusTag);
  assert.equal(isSafeMailtoAddress(validPlusTag), true);
  assert.equal(buildCoachContactMailtoUri(validPlusTag), expectedMailto);
});

test("mailto validation rejects URI, header, control, quote, and Unicode ambiguities", () => {
  for (const address of ambiguousAddresses) {
    assert.equal(isSafeMailtoAddress(address), false, address);
    assert.equal(buildCoachContactMailtoUri(address), null, address);
    assert.throws(
      () => cleanEmail(address, "contactEmail"),
      (error) =>
        error instanceof RequestError &&
        error.status === 400 &&
        error.code === "invalid_field",
      address,
    );
  }
});

test("both plan contact surfaces use the centralized mailto builder", async () => {
  const [planView, golferChoices] = await Promise.all([
    readFile(new URL("../components/plan/PlanView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/plan/GolferChoices.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(
    planView,
    /const coachMailtoUri = buildCoachContactMailtoUri\(model\.coach\.contactEmail\);/,
  );
  assert.match(planView, /<a href=\{coachMailtoUri\}>/);
  assert.match(
    golferChoices,
    /const coachMailtoUri = buildCoachContactMailtoUri\(coachEmail\);/,
  );
  assert.match(golferChoices, /window\.location\.assign\(coachMailtoUri\);/);
  assert.doesNotMatch(planView, /`mailto:\$\{/);
  assert.doesNotMatch(golferChoices, /`mailto:\$\{/);
});

test(
  "coach profile writes reject ambiguous mailto addresses and retain a valid plus tag",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    for (const contactEmail of ambiguousAddresses) {
      const response = await saveProfile(worker, contactEmail);
      assert.equal(response.status, 400, contactEmail);
      assert.equal((await response.json()).error.code, "invalid_field", contactEmail);
    }

    const accepted = await saveProfile(worker, "Coach+Roadmap@Example.CA");
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).profile.contactEmail, validPlusTag);
  },
);

function saveProfile(worker, contactEmail) {
  return worker.dispatch("/api/profile", {
    method: "PUT",
    headers: writeHeaders("coach.a@example.test", "Coach Avery"),
    body: JSON.stringify({
      displayName: "Coach Avery",
      contactEmail,
    }),
  });
}
