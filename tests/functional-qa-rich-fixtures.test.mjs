import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createFunctionalQaFixtureRegistry,
  functionalQaWorkerBindings,
} from "../scripts/functional-qa-fixtures.mjs";
import {
  FUNCTIONAL_QA_RICH_FIXTURE_HOOKS,
} from "../scripts/functional-qa-rich-fixtures.mjs";
import {
  startD1Worker,
  writeHeaders,
} from "./support/d1-worker.mjs";

test("rich functional QA seeding is built in, bounded, and API-only", async () => {
  assert.equal(FUNCTIONAL_QA_RICH_FIXTURE_HOOKS.length, 1);
  assert.deepEqual(FUNCTIONAL_QA_RICH_FIXTURE_HOOKS[0].scenarios, [
    "standard",
    "long-content",
  ]);

  const [richSource, registrySource] = await Promise.all([
    readFile(new URL("../scripts/functional-qa-rich-fixtures.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/functional-qa-fixtures.mjs", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(richSource, /\.inspect\s*\(/);
  assert.doesNotMatch(richSource, /from ["']@\/db|from ["']\.\.\/db/);
  assert.match(richSource, /Scenario B must exercise the\s+\* real browser upload/);
  assert.match(
    registrySource,
    /\.\.\.richFixtureHooks,[\s\S]*\.\.\.FUNCTIONAL_QA_RICH_FIXTURE_HOOKS/,
    "optional external hooks remain supported and run before the final built-in republish",
  );
});

test(
  "standard and long-content fixtures expose deterministic rich coaching state through real routes",
  { timeout: 90_000 },
  async (context) => {
    const worker = await startD1Worker(functionalQaWorkerBindings());
    context.after(() => worker.dispose());
    const optionalHookCalls = [];
    const fixtures = createFunctionalQaFixtureRegistry({
      worker,
      richFixtureHooks: [
        {
          name: "optional-hook-preserved",
          scenarios: ["standard", "long-content"],
          async seed({ scenario }) {
            optionalHookCalls.push(scenario.id);
          },
        },
      ],
    });

    for (const scenarioId of ["standard", "long-content"]) {
      const fixture = await fixtures.get(scenarioId);
      assert.equal(fixture.rich.version, "synthetic-rich-coaching-v1");
      assert.ok(fixture.rich.finalRevision > fixture.workspace.plan.revision);
      assert.ok(fixture.token);

      const headers = writeHeaders(fixture.identity.email, fixture.identity.name);
      const planId = fixture.workspace.plan.id;
      const [roadmaps, drills, workspace, practice, sessions, comparisons, sources, milestones, timeline] =
        await Promise.all([
          getJson(worker, headers, "/api/coaching/roadmaps", 200),
          getJson(worker, headers, "/api/coaching/drills", 200),
          getJson(worker, headers, `/api/coaching/plans/${planId}/workspace`, 200),
          getJson(worker, headers, `/api/plans/${planId}/coaching/practice`, 200),
          getJson(worker, headers, `/api/plans/${planId}/coaching/launch/sessions`, 200),
          getJson(worker, headers, `/api/plans/${planId}/coaching/launch/comparisons`, 200),
          getJson(
            worker,
            headers,
            `/api/plans/${planId}/coaching/reviews/${fixture.rich.reviewId}/sources`,
            200,
          ),
          getJson(worker, headers, `/api/plans/${planId}/coaching/milestones`, 200),
          getJson(worker, headers, `/api/plans/${planId}/coaching/timeline?limit=100`, 200),
        ]);

      assert.ok(roadmaps.templates.some(({ id }) => id === fixture.rich.roadmapTemplateId));
      assert.ok(drills.templates.some(({ id }) => id === fixture.rich.drillTemplateId));
      assert.equal(workspace.plan.revision, fixture.rich.finalRevision);
      assert.equal(fixture.rich.plannedLessonId, fixture.rich.completedLessonId);
      assert.ok(workspace.lessons.some(({ id, status, coachObservation }) =>
        id === fixture.rich.completedLessonId &&
        status === "completed" &&
        /wider strike window/.test(coachObservation)));
      assert.ok(practice.assignments.some(({ assignment, snapshot }) =>
        assignment.id === fixture.rich.practiceAssignmentId &&
        assignment.status === "active" &&
        snapshot?.drillTemplateId === fixture.rich.drillTemplateId));
      assert.deepEqual(
        new Set(sessions.sessions.map(({ id }) => id)),
        new Set([fixture.rich.baselineSessionId, fixture.rich.currentSessionId]),
      );
      assert.ok(sessions.sessions.every(({ lessonId }) => lessonId === fixture.rich.completedLessonId));
      assert.ok(workspace.evidenceItems.some(({ id, lessonId, evidenceType }) =>
        id === fixture.rich.evidenceId &&
        lessonId === fixture.rich.completedLessonId &&
        evidenceType === "comparison"));
      assert.ok(comparisons.comparisons.some(({ id, metrics }) =>
        id === fixture.rich.comparisonId && metrics.length === 3));
      assert.deepEqual(
        sources.sources.map(({ sourceType }) => sourceType),
        [
          "lesson",
          "practice",
          "launch_session",
          "launch_session",
          "launch_comparison",
          "evidence",
        ],
      );
      assert.ok(milestones.milestones.some(({ id, status }) =>
        id === fixture.rich.milestoneId && status === "published"));
      assert.deepEqual(
        new Set(timeline.items.map(({ kind }) => kind)),
        new Set(fixture.rich.timelineKinds),
      );

      if (scenarioId === "standard") {
        const directoryResponse = await worker.dispatch("/app/golfers", {
          headers,
        });
        assert.equal(directoryResponse.status, 200);
        const directoryHtml = await directoryResponse.text();
        assert.match(directoryHtml, /Predictable contact roadmap/);
        assert.match(
          directoryHtml,
          new RegExp(
            `href="/app/golfers/${escapeRegExp(fixture.workspace.golfer.id)}"[^>]*>Review live plan</a>`,
          ),
        );
        assert.doesNotMatch(directoryHtml, /No development plan/);
        assert.doesNotMatch(
          directoryHtml,
          new RegExp(
            `/app/golfers/${escapeRegExp(fixture.workspace.golfer.id)}/complete`,
          ),
        );
      }

      const comparison = await getJson(
        worker,
        headers,
        `/api/plans/${planId}/coaching/launch/comparisons/${fixture.rich.comparisonId}`,
        200,
      );
      assert.deepEqual(
        comparison.comparison.metrics.map(({ displayName, unit, baselineValue, currentValue }) => ({
          displayName,
          unit,
          baselineValue,
          currentValue,
        })),
        [
          { displayName: "Ball Speed", unit: "mph", baselineValue: 131.2, currentValue: 134.8 },
          { displayName: "Carry", unit: "yd", baselineValue: 205, currentValue: 212 },
          { displayName: "Launch Angle", unit: "deg", baselineValue: 14.1, currentValue: 14.8 },
        ],
      );

      const exchange = await worker.dispatch("/r/session", {
        method: "POST",
        headers,
        body: JSON.stringify({ token: fixture.token }),
      });
      assert.equal(exchange.status, 200, `${scenarioId} final rich revision remains publishable`);
    }

    assert.deepEqual(optionalHookCalls, ["standard", "long-content"]);
  },
);

async function getJson(worker, headers, path, expectedStatus) {
  const response = await worker.dispatch(path, { method: "GET", headers });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  assert.equal(
    response.status,
    expectedStatus,
    `${path} returned ${response.status}: ${
      typeof body === "string" ? body : JSON.stringify(body)
    }`,
  );
  return body;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
