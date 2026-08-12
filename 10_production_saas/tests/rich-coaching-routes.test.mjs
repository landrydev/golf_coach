import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

const mutationRoutes = [
  "app/api/coaching/drills/route.ts",
  "app/api/coaching/drills/[drillId]/route.ts",
  "app/api/coaching/drills/[drillId]/duplicate/route.ts",
  "app/api/coaching/roadmaps/route.ts",
  "app/api/coaching/roadmaps/[roadmapId]/route.ts",
  "app/api/coaching/roadmaps/[roadmapId]/duplicate/route.ts",
  "app/api/plans/[planId]/coaching/media/route.ts",
  "app/api/plans/[planId]/coaching/practice/route.ts",
  "app/api/plans/[planId]/coaching/launch/imports/route.ts",
  "app/api/plans/[planId]/coaching/launch/sessions/route.ts",
  "app/api/plans/[planId]/coaching/launch/comparisons/route.ts",
  "app/api/plans/[planId]/coaching/reviews/route.ts",
  "app/api/plans/[planId]/coaching/evidence/route.ts",
  "app/api/plans/[planId]/coaching/lessons/route.ts",
  "app/api/plans/[planId]/coaching/milestones/route.ts",
];

test("rich coaching mutation routes share strict authenticated request handling", async () => {
  for (const path of mutationRoutes) {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, /coachRequest\(request, true\)/, `${path} requires same-origin authenticated context`);
    assert.match(source, /exactJson\(request, /, `${path} rejects unexpected JSON fields`);
    assert.match(source, /routeError\(/, `${path} returns the standard safe error envelope`);
    assert.doesNotMatch(source, /from ["']@\/db/, `${path} delegates writes to the domain layer`);
  }
});

test("plan mutations derive consent guards and expected revision server-side", async () => {
  const shared = await readFile(new URL("app/api/coaching/_shared.ts", root), "utf8");
  assert.match(shared, /requireGolferRecordProcessingConsent\(request\.accountId\)/);
  assert.match(shared, /expectedRevision: positiveInteger\(expectedRevision/);
  assert.match(shared, /"Cache-Control", "private, no-store"/);
  assert.match(shared, /client_account_id_not_allowed/);

  for (const path of mutationRoutes.filter((path) => path.includes("/plans/"))) {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, /planMutationContext\(/, `${path} binds tenant, consent, revision, and request ID`);
  }
});

test("rich coaching read routes return authenticated no-store views", async () => {
  const readRoutes = [
    "app/api/coaching/drills/route.ts",
    "app/api/coaching/roadmaps/route.ts",
    "app/api/plans/[planId]/coaching/media/route.ts",
    "app/api/plans/[planId]/coaching/practice/route.ts",
    "app/api/plans/[planId]/coaching/launch/imports/route.ts",
    "app/api/plans/[planId]/coaching/launch/sessions/route.ts",
    "app/api/plans/[planId]/coaching/launch/sessions/[sessionId]/route.ts",
    "app/api/plans/[planId]/coaching/launch/comparisons/route.ts",
    "app/api/plans/[planId]/coaching/launch/comparisons/[comparisonId]/route.ts",
    "app/api/plans/[planId]/coaching/reviews/[reviewId]/sources/route.ts",
    "app/api/plans/[planId]/coaching/milestones/route.ts",
    "app/api/plans/[planId]/coaching/timeline/route.ts",
  ];
  for (const path of readRoutes) {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, /coachRequest\(request\)/, `${path} requires coach authentication`);
    assert.match(source, /return json\(/, `${path} uses the no-store response helper`);
  }
});
