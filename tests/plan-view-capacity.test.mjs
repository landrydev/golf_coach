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

const coachA = { email: "coach.a@example.test", name: "Coach Capacity A" };
const coachB = { email: "coach.b@example.test", name: "Coach Capacity B" };

test(
  "coach and golfer plans use the same bounded current-phase snapshot and fail closed above the phase invariant",
  { timeout: 60_000 },
  async (context) => {
    const worker = await startD1Worker();
    context.after(() => worker.dispose());

    for (const identity of [coachA, coachB]) {
      const profile = await jsonWrite(worker, "/api/profile", "PUT", identity, {
        displayName: identity.name,
        contactEmail: identity.email,
      });
      assert.equal(profile.status, 200);
      await grantSyntheticGolferRecordConsent(worker, identity);
    }

    const createResponse = await jsonWrite(
      worker,
      "/api/golfers",
      "POST",
      coachA,
      golferPayload(),
    );
    assert.equal(createResponse.status, 201);
    const workspace = await createResponse.json();
    await grantSyntheticRoadmapSharingConsent(worker, coachA, workspace.golfer.id);
    const [currentPhase, historyPhase] = workspace.phases;
    assert.equal(currentPhase.status, "active");

    const accountInspection = await worker.inspect([
      {
        sql: "select account_id as accountId from golfers where id = ?",
        params: [workspace.golfer.id],
      },
    ]);
    const accountId = accountInspection[0].results[0].accountId;
    await insertOverCapacityHistory(worker, {
      accountId,
      planId: workspace.plan.id,
      currentPhaseId: currentPhase.id,
      historyPhaseId: historyPhase.id,
    });

    const coachPage = await worker.dispatch(
      `/app/golfers/${workspace.golfer.id}`,
      { headers: identityHeaders(coachA.email, coachA.name) },
    );
    assert.equal(coachPage.status, 200);
    const coachHtml = await coachPage.text();
    assertBoundedSnapshot(coachHtml);
    assertDocumentSemantics(coachHtml, "Golfer plan | Roadmap");

    const otherTenantPage = await worker.dispatch(
      `/app/golfers/${workspace.golfer.id}`,
      { headers: identityHeaders(coachB.email, coachB.name) },
    );
    assert.equal(otherTenantPage.status, 404);
    assert.doesNotMatch(await otherTenantPage.text(), /CAP-(?:LESSON|PRACTICE|EVIDENCE)-/);

    const publishResponse = await jsonWrite(
      worker,
      `/api/plans/${workspace.plan.id}/publish`,
      "POST",
      coachA,
      {
        confirmation: "reviewed_exact_golfer_view",
        expectedRevision: 1,
        intendedRecipientContext: "Synthetic capacity regression recipient",
        expiresInDays: 7,
      },
    );
    assert.equal(publishResponse.status, 201);
    const share = (await publishResponse.json()).share;
    const shareUrl = new URL(share.url);
    const rawShareToken = new URLSearchParams(shareUrl.hash.slice(1)).get("token");
    assert.ok(rawShareToken);

    const exchangeResponse = await jsonWrite(worker, "/r/session", "POST", null, {
      token: rawShareToken,
    });
    assert.equal(exchangeResponse.status, 200);
    const shareCookie = exchangeResponse.headers.get("set-cookie")?.split(";", 1)[0];
    assert.match(shareCookie ?? "", /^roadmap_share=[A-Za-z0-9_-]{40,64}$/);

    const golferPage = await worker.dispatch("/r/plan", {
      headers: { accept: "text/html", cookie: shareCookie },
    });
    assert.equal(golferPage.status, 200);
    const golferHtml = await golferPage.text();
    assertBoundedSnapshot(golferHtml);
    assertDocumentSemantics(golferHtml, "Private coaching plan | Roadmap");
    assert.doesNotMatch(golferHtml, /Coach Capacity B/);

    await insertExcessPhases(worker, {
      accountId,
      planId: workspace.plan.id,
    });

    const overPhaseCoachPage = await worker.dispatch(
      `/app/golfers/${workspace.golfer.id}`,
      { headers: identityHeaders(coachA.email, coachA.name) },
    );
    assert.equal(overPhaseCoachPage.status, 404);
    assert.doesNotMatch(
      await overPhaseCoachPage.text(),
      /CAP-(?:LESSON|PRACTICE|EVIDENCE)-/,
    );

    const overPhaseGolferPage = await worker.dispatch("/r/plan", {
      headers: { accept: "text/html", cookie: shareCookie },
    });
    assert.equal(overPhaseGolferPage.status, 200);
    const unavailableHtml = await overPhaseGolferPage.text();
    assert.match(unavailableHtml, /Plan unavailable/);
    assert.doesNotMatch(unavailableHtml, /CAP-(?:LESSON|PRACTICE|EVIDENCE)-/);

    const overPhaseExchange = await jsonWrite(worker, "/r/session", "POST", null, {
      token: rawShareToken,
    });
    assert.equal(overPhaseExchange.status, 404);
    assert.equal((await overPhaseExchange.json()).error.code, "plan_unavailable");
  },
);

function assertBoundedSnapshot(html) {
  assert.match(html, /bounded view shows up to 12 chapters/i);
  assert.match(html, /bounded view shows up to 8 items/i);
  assert.match(html, /bounded view shows up to 20 published items/i);

  assert.deepEqual(markers(html, "LESSON"), [
    "CAP-LESSON-01",
    "CAP-LESSON-02",
    ...numberedMarkers("LESSON", 6, 15),
  ]);
  assert.deepEqual(markers(html, "PRACTICE"), [
    "CAP-PRACTICE-01",
    "CAP-PRACTICE-02",
    ...numberedMarkers("PRACTICE", 5, 10),
  ]);
  assert.deepEqual(markers(html, "EVIDENCE"), [
    "CAP-EVIDENCE-01",
    "CAP-EVIDENCE-02",
    ...numberedMarkers("EVIDENCE", 5, 22),
  ]);
}

function assertDocumentSemantics(html, title) {
  assert.equal(html.match(/<main\b/gi)?.length ?? 0, 1, `${title}: one main landmark`);
  assert.equal(html.match(/<h1\b/gi)?.length ?? 0, 1, `${title}: one level-one heading`);
  assert.match(html, new RegExp(`<title>${escapeRegExp(title)}</title>`, "i"));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markers(html, kind) {
  return [...new Set(html.match(new RegExp(`CAP-${kind}-\\d{2}`, "g")) ?? [])].sort();
}

function numberedMarkers(kind, start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) =>
    `CAP-${kind}-${String(start + index).padStart(2, "0")}`,
  );
}

async function insertOverCapacityHistory(
  worker,
  { accountId, planId, currentPhaseId, historyPhaseId },
) {
  const baseTime = Date.UTC(2026, 7, 1);
  const queries = [];

  for (let sequence = 1; sequence <= 15; sequence += 1) {
    queries.push({
      sql: `insert into lessons (
        id, account_id, plan_id, phase_id, sequence, title, status, purpose,
        occurred_at, completed_at, coach_approved_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?)`,
      params: [
        `capacity-lesson-${sequence}`,
        accountId,
        planId,
        sequence <= 2 ? currentPhaseId : historyPhaseId,
        sequence,
        `CAP-LESSON-${String(sequence).padStart(2, "0")}`,
        `Bounded lesson purpose ${sequence}.`,
        baseTime + sequence,
        baseTime + sequence,
        baseTime + sequence,
        baseTime + sequence,
        baseTime + sequence,
      ],
    });
  }

  for (let sequence = 1; sequence <= 10; sequence += 1) {
    queries.push({
      sql: `insert into practice_items (
        id, account_id, plan_id, phase_id, title, status, objective, rationale,
        instructions, success_check, stop_or_ask_rule, coach_approved_at,
        completed_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        `capacity-practice-${sequence}`,
        accountId,
        planId,
        sequence <= 2 ? currentPhaseId : historyPhaseId,
        `CAP-PRACTICE-${String(sequence).padStart(2, "0")}`,
        sequence === 1 ? "active" : "completed",
        `Bounded practice objective ${sequence}.`,
        `Bounded practice rationale ${sequence}.`,
        JSON.stringify([`Bounded practice instruction ${sequence}.`]),
        `Bounded success signal ${sequence}.`,
        `Stop and ask rule ${sequence}.`,
        baseTime + sequence,
        sequence === 1 ? null : baseTime + sequence,
        baseTime + sequence,
        baseTime + sequence,
      ],
    });
  }

  for (let sequence = 1; sequence <= 22; sequence += 1) {
    queries.push({
      sql: `insert into evidence_items (
        id, account_id, plan_id, phase_id, status, evidence_type, context_type,
        title, claim, source_label, source_type, observed_at, interpretation,
        limitation, maturity, coach_approved_at, created_at, updated_at
      ) values (?, ?, ?, ?, 'published', 'coach_observation', 'practice', ?, ?, ?,
        'coach_observed', ?, ?, ?, 'single_observation', ?, ?, ?)`,
      params: [
        `capacity-evidence-${sequence}`,
        accountId,
        planId,
        sequence <= 2 ? currentPhaseId : historyPhaseId,
        `CAP-EVIDENCE-${String(sequence).padStart(2, "0")}`,
        `Bounded evidence claim ${sequence}.`,
        `Synthetic capacity source ${sequence}`,
        baseTime + sequence,
        `Bounded evidence interpretation ${sequence}.`,
        `Bounded evidence limitation ${sequence}.`,
        baseTime + sequence,
        baseTime + sequence,
        baseTime + sequence,
      ],
    });
  }

  await worker.inspect(queries);
}

async function insertExcessPhases(worker, { accountId, planId }) {
  await worker.inspect(
    [4, 5].map((sequence) => ({
      sql: `insert into plan_phases (
        id, account_id, plan_id, sequence, title, purpose, status
      ) values (?, ?, ?, ?, ?, ?, 'planned')`,
      params: [
        `capacity-phase-${sequence}`,
        accountId,
        planId,
        sequence,
        `Capacity phase ${sequence}`,
        `Capacity phase purpose ${sequence}.`,
      ],
    })),
  );
}

function jsonWrite(worker, path, method, identity, body) {
  const headers = identity
    ? writeHeaders(identity.email, identity.name)
    : {
        "content-type": "application/json",
        origin: testOrigin,
        "sec-fetch-site": "same-origin",
      };
  return worker.dispatch(path, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function golferPayload() {
  return {
    adultEligibilityConfirmed: true,
    displayName: "Jordan Capacity",
    email: "jordan.capacity@example.test",
    planTitle: "Jordan bounded capacity roadmap",
    goal: {
      statement: "Build a more predictable contact pattern.",
      why: "Use repeatable observations for the next decision.",
      context: "Synthetic capacity verification only.",
    },
    assessment: {
      summary: "Contact varies as transition tempo increases.",
      strengths: "The golfer notices strike-location feedback.",
      primaryPattern: "Strike location moves as tempo increases.",
      limitations: "One constrained observation cannot predict playing outcomes.",
    },
    priority: {
      title: "Current centred-contact priority",
      rationale: "This observable priority leads the bounded plan snapshot.",
    },
    phases: Array.from({ length: 3 }, (_, index) => ({
      number: index + 1,
      title: `Phase ${index + 1}`,
      purpose: `Synthetic purpose for phase ${index + 1}.`,
      rationale: index === 0 ? "This establishes an observable base." : null,
      progressSignals:
        index === 0
          ? ["Centred contact appears in three of five constrained attempts."]
          : [],
    })),
  };
}
