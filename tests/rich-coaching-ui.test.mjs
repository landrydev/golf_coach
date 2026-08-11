import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const drillPath = new URL("../app/app/coaching/drills/DrillLibrary.tsx", import.meta.url);
const workspacePath = new URL("../app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", import.meta.url);
const pagePath = new URL("../app/app/coaching/plans/[planId]/page.tsx", import.meta.url);
const tabPath = new URL("../lib/coaching-workspace-tab.ts", import.meta.url);
const golferHubPath = new URL("../app/app/golfers/[golferId]/page.tsx", import.meta.url);
const stagedCompletionPath = new URL("../app/app/golfers/[golferId]/complete/StagedCompletionForm.tsx", import.meta.url);
const stagedCompletionPagePath = new URL("../app/app/golfers/[golferId]/complete/page.tsx", import.meta.url);
const livingPlanFormsPath = new URL("../app/app/golfers/[golferId]/LivingPlanForms.tsx", import.meta.url);
const planContentRoutePath = new URL("../app/api/plans/[planId]/content/route.ts", import.meta.url);
const planViewPath = new URL("../components/plan/PlanView.tsx", import.meta.url);
const planAssemblyPath = new URL("../lib/plans.ts", import.meta.url);
const richDomainPath = new URL("../lib/rich-coaching.ts", import.meta.url);
const planContentPath = new URL("../lib/plan-content.ts", import.meta.url);
const mediaLibraryPath = new URL("../app/app/media/MediaLibrary.tsx", import.meta.url);
const mediaPolicyPath = new URL("../lib/media-policy.ts", import.meta.url);
const launchImportRoutePath = new URL("../app/api/plans/[planId]/coaching/launch/imports/route.ts", import.meta.url);

test("drill library exposes every real lifecycle mutation and structured field", async () => {
  const source = await readFile(drillPath, "utf8");
  assert.match(source, /\/api\/coaching\/drills/);
  assert.match(
    source,
    /requestClientMutation\(\s*`\/api\/coaching\/drills\/\$\{encodeURIComponent\(selected\.id\)\}`,[\s\S]+?method: "PUT"/,
  );
  assert.match(
    source,
    /requestClientMutation\("\/api\/coaching\/drills",\s*\{\s*method: "POST"/,
  );
  assert.match(source, /method: "PATCH"/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /\/duplicate/);
  for (const field of [
    "purpose", "whenItFits", "equipment", "setup", "steps", "dosageOrCadence",
    "feelOrCue", "successCheck", "commonMiss", "stopOrAskRule",
    "constraintOrAdaptation", "progression", "regression",
  ]) {
    assert.match(source, new RegExp(field), `missing drill field ${field}`);
  }
  assert.match(source, /Preview drill/);
  assert.match(source, /expectedVersion/);
  assert.match(source, /\/media/);
  assert.match(source, /withdraw_drill_media/);
});

test("drill media route enforces exact bodies and target-scoped withdrawal", async () => {
  const source = await readFile(new URL("../app/api/coaching/drills/[drillId]/media/route.ts", import.meta.url), "utf8");
  assert.match(source, /coachRequest\(request, true\)/);
  assert.match(source, /exactJson\(request/);
  assert.match(source, /eq\(contentMediaAttachments\.accountId, context\.accountId\)/);
  assert.match(source, /eq\(contentMediaAttachments\.drillTemplateId, drillId\)/);
  assert.match(source, /withdrawAccountMediaAttachment/);
  assert.match(source, /return json\(/);
  assert.match(source, /return routeError\(/);
});

test("roadmap template library uses versioned real lifecycle routes", async () => {
  const source = await readFile(new URL("../app/app/coaching/roadmaps/RoadmapTemplateLibrary.tsx", import.meta.url), "utf8");
  assert.match(source, /\/api\/coaching\/roadmaps/);
  assert.match(source, /expectedVersion/);
  assert.match(source, /expectedSourceVersion/);
  assert.match(source, /archive_roadmap_template/);
  assert.match(source, /Favourites only/);
  assert.match(source, /progressSignals/);
  assert.match(source, /never diagnoses\s+a golfer/);
});

test("roadmap templates populate bounded authoring structure without inventing golfer facts", async () => {
  const [form, page] = await Promise.all([
    readFile(stagedCompletionPath, "utf8"),
    readFile(stagedCompletionPagePath, "utf8"),
  ]);
  assert.match(page, /listRoadmapTemplates/);
  assert.match(page, /templates=\{compatibleRoadmapTemplates\}/);
  assert.match(form, /Start blank or apply a reusable roadmap template/);
  assert.match(form, /selectedTemplate\.content\.phases/);
  assert.match(form, /setFormValue\(formRef\.current, `phase\$\{index \+ 1\}Title`/);
  assert.match(form, /setFormValue\(formRef\.current, `phase\$\{index \+ 1\}Purpose`/);
  assert.match(form, /never supplies this[\s\S]*golfer/);
  assert.match(form, /Apply phase structure/);
});

test("structured evidence preserves exact scalar context and explicit comparison roles", async () => {
  const [form, route, view] = await Promise.all([
    readFile(livingPlanFormsPath, "utf8"),
    readFile(planContentRoutePath, "utf8"),
    readFile(planViewPath, "utf8"),
  ]);
  for (const field of [
    "evidenceType", "metricName", "metricValue", "metricUnit", "valueText",
    "comparisonRole", "comparisonGroupId", "isRepresentative",
  ]) {
    assert.match(form, new RegExp(`name=["']${field}["']`), `missing evidence control ${field}`);
    assert.match(route, new RegExp(field), `missing evidence route field ${field}`);
  }
  assert.match(route, /A numeric evidence value requires both its metric name and exact unit/);
  assert.match(route, /Baseline and current evidence require a shared comparison group label/);
  assert.match(form, /does not convert,[\s\S]*normalize, or interpret/);
  assert.match(view, /item\.metricValue/);
  assert.match(view, /item\.comparisonRole/);
});

test("media attachment controls expose labelled owned records and golfer-facing target labels", async () => {
  const [workspace, view] = await Promise.all([
    readFile(workspacePath, "utf8"),
    readFile(planViewPath, "utf8"),
  ]);
  assert.match(workspace, /mediaTargetChoices\(workspace, targetKind\)/);
  assert.match(workspace, /label=\{`\$\{capitalize\(targetKind\)\} record`\}/);
  assert.match(workspace, /options=\{targetChoices\}/);
  assert.match(workspace, /!targetChoices\.length/);
  assert.match(view, /item\.targetLabel/);
});

test("rich workspace uses consolidated refresh and revision-aware real API mutations", async () => {
  const source = await readFile(workspacePath, "utf8");
  assert.match(source, /\/api\/coaching\/plans\/\$\{encodeURIComponent\(planId\)\}\/workspace/);
  assert.match(source, /\/api\/plans\/\$\{encodeURIComponent\(planId\)\}\/coaching\$\{path\}/);
  assert.match(source, /expectedRevision: workspace\.revision/);
  assert.match(source, /await refresh\(\)/);
  assert.match(source, /revision\|conflict\|changed/);
  assert.match(source, /role=\{isError \? "alert" : "status"\}/);
});

test("rich workspace renders all bounded coaching surfaces", async () => {
  const [source, page] = await Promise.all([
    readFile(workspacePath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);
  for (const feature of [
    "Assign and manage drills",
    "Plan, schedule, complete, cancel, or archive",
    "Record what was observed, measured, reported, or captured",
    "Attach, reuse, or withdraw",
    "Launch-monitor sessions and comparisons",
    "Select the record first, then make the conclusion",
    "Create, publish, or withdraw milestones",
    "Coaching timeline",
  ]) {
    assert.match(source, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing surface ${feature}`);
  }
  assert.match(source, /Exclude every listed rejected row/);
  assert.match(source, /selectedComparable\.map/);
  assert.match(source, /metric\/unit pairs selected/);
  assert.match(source, /Roadmap stores the measurements you enter\. It does not diagnose/);
  assert.match(page, /Rich coaching workspace/);
  assert.match(page, /Media library/);
});

test("manual launch quick entry commits an accessible bounded multi-metric set", async () => {
  const [source, css] = await Promise.all([
    readFile(workspacePath, "utf8"),
    readFile(
      new URL("../app/app/coaching/coaching.module.css", import.meta.url),
      "utf8",
    ),
  ]);
  const maximumMatch = source.match(
    /const MAX_MANUAL_SUMMARY_METRICS = (\d+);/,
  );
  assert.ok(maximumMatch, "manual metric entry must have an explicit UI bound");
  const maximum = Number(maximumMatch[1]);
  assert.ok(maximum >= 3, "manual entry must support a small set of at least three metrics");
  assert.ok(maximum <= 64, "the UI bound must not exceed the API's 64-metric limit");

  assert.match(source, /useState<ManualMetricDraft\[\]>/);
  assert.match(source, /manualMetrics\.map\(\(metric, index\) => \(/);
  assert.match(source, /<fieldset[\s\S]*<legend>Summary metric \{index \+ 1\}<\/legend>/);
  assert.match(source, /manualMetrics\.length > 1[\s\S]*Remove summary metric \{index \+ 1\}/);
  assert.match(source, /id="add-manual-metric"[\s\S]*Add metric/);
  assert.match(source, /summaryMetrics: manualMetrics\.map\(manualMetricPayload\)/);
  assert.doesNotMatch(source, /summaryMetrics:\s*\[metric\]/);
  for (const preservedField of [
    "canonicalKey", "originalName", "displayName", "numericValue", "unit",
    "direction",
  ]) {
    assert.match(
      source,
      new RegExp(`${preservedField}:|${preservedField},`),
      `manual payload must preserve ${preservedField}`,
    );
  }
  assert.match(
    source,
    /formElement\.reset\(\);[\s\S]*setManualMetrics\(\[newManualMetricDraft\(1\)\]\)/,
  );
  assert.match(css, /\.manualMetricSet\s*\{/);
  assert.match(css, /\.manualMetricSet legend\s*\{/);
});

test("manual metric duplicate keys stop submission, announce the problem, and focus the duplicate", async () => {
  const source = await readFile(workspacePath, "utf8");
  const handlerStart = source.indexOf("async function manual(");
  const handlerEnd = source.indexOf("function chooseCsv", handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);
  assert.ok(
    handler.indexOf("duplicateManualMetric(manualMetrics)") <
      handler.indexOf("await mutate("),
    "duplicate validation must run before the network mutation",
  );
  assert.match(handler, /setManualMetricIssue\(\{/);
  assert.match(handler, /manualMetricCanonicalKeyId\(duplicate\.id\)/);
  assert.match(handler, /\.focus\(\)/);
  assert.match(handler, /return;[\s\S]*await mutate\(/);
  assert.match(source, /const canonicalKeys = new Set<string>\(\)/);
  assert.match(source, /canonicalKeys\.has\(canonicalKey\)/);
  assert.match(source, /id="manual-metric-issue"[\s\S]*role="alert"/);
  assert.match(source, /aria-invalid=\{manualMetricIssue\?\.metricId === metric\.id\}/);
  assert.match(source, /aria-describedby="manual-metrics-help"/);
});

test("workspace deep links, lesson enrichment, and source-first reviews use real contracts", async () => {
  const [source, page, tabs, golferHub, livingForms, lessonRoute, evidenceRoute, reviewRoute] = await Promise.all([
    readFile(workspacePath, "utf8"),
    readFile(pagePath, "utf8"),
    readFile(tabPath, "utf8"),
    readFile(golferHubPath, "utf8"),
    readFile(livingPlanFormsPath, "utf8"),
    readFile(new URL("../app/api/plans/[planId]/coaching/lessons/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/plans/[planId]/coaching/evidence/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/plans/[planId]/coaching/reviews/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /searchParams/);
  assert.match(page, /resolveCoachingWorkspaceLocation/);
  assert.match(page, /initialTab={initialLocation\.tab}/);
  assert.match(page, /initialFocus={initialLocation\.focus}/);
  assert.match(tabs, /"lessons"/);
  assert.match(tabs, /"evidence"/);
  assert.match(golferHub, /\?tab=evidence/);
  assert.match(golferHub, /\?tab=reviews/);
  assert.match(livingForms, /Open source-first review builder/);
  assert.match(livingForms, /\?tab=reviews/);
  assert.doesNotMatch(livingForms, /submit\(event, "review"\)/);
  assert.doesNotMatch(livingForms, /living_review_create/);
  assert.match(source, /POST \/evidence/);
  assert.match(source, /POST \/reviews/);
  for (const evidenceType of [
    "coach_observation",
    "golfer_report",
    "measurement",
    "outcome_count",
    "media",
    "comparison",
    "note",
  ]) {
    assert.match(source, new RegExp(`"${evidenceType}"`));
  }
  assert.match(source, /name="evidenceItemIds"/);
  assert.match(source, /name="launchSessionIds"/);
  assert.match(source, /lessonId: nullable\(form, "lessonId"\)/);
  assert.match(source, /lessonId: nullable\(data, "lessonId"\)/);
  assert.match(source, /Confirm source-backed phase review/);
  assert.match(lessonRoute, /"coachObservation"/);
  assert.match(lessonRoute, /"evidenceItemIds"/);
  assert.match(evidenceRoute, /"media"/);
  assert.match(evidenceRoute, /createEvidenceRecord/);
  assert.match(reviewRoute, /addPhaseReview/);
  assert.match(reviewRoute, /sourceArray\(body\.sources\)/);
  assert.match(source, /immediateNextPhase/);
  assert.match(source, /Review golfer check-ins/);
  assert.match(source, /perceivedDifficulty/);
  assert.match(source, /confidenceRating/);
  assert.match(source, /workspace\.phaseReviewSources/);
  assert.match(source, /exact source record/);
});

test("practice customization prefills the entire selected structured drill", async () => {
  const source = await readFile(workspacePath, "utf8");
  assert.match(source, /key=\{selected\?\.id \?\? "blank-custom-drill"\}/);
  for (const field of [
    "whenItFits", "equipment", "setup", "steps", "dosageOrCadence", "feelOrCue",
    "successCheck", "commonMiss", "stopOrAskRule", "constraintOrAdaptation",
    "progression", "regression",
  ]) {
    assert.match(
      source,
      new RegExp(`defaultValue=\\{seed\\?\\.${field}`),
      `missing full-drill prefill for ${field}`,
    );
  }
});

test("exact golfer view renders lesson associations and exact review sources", async () => {
  const [assembly, view] = await Promise.all([
    readFile(planAssemblyPath, "utf8"),
    readFile(planViewPath, "utf8"),
  ]);
  assert.match(assembly, /from\(phaseReviewSources\)/);
  assert.match(assembly, /selectedEvidence:/);
  assert.match(assembly, /selectedMeasurements:/);
  assert.match(assembly, /lessonId: item\.lessonId/);
  assert.match(assembly, /sources: selectedReviewSources/);
  assert.match(view, /Selected evidence from this lesson/);
  assert.match(view, /Selected measurement sessions from this lesson/);
  assert.match(view, /launch-session-\$\{session\.id\}/);
  assert.match(view, /evidence-\$\{item\.id\}/);
  assert.match(view, /Exact selected source records/);
  assert.match(view, /model\.phaseReview\.sources\.map/);
});

test("media evidence creates and withdraws its golfer-authorizing attachment atomically", async () => {
  const [richDomain, contentDomain] = await Promise.all([
    readFile(richDomainPath, "utf8"),
    readFile(planContentPath, "utf8"),
  ]);
  assert.match(richDomain, /db\.insert\(contentMediaAttachments\)\.values\(\{/);
  assert.match(richDomain, /evidenceItemId: evidenceId/);
  assert.match(richDomain, /targetType: "evidence"/);
  assert.match(richDomain, /action: "media_attachment\.created"/);
  assert.match(contentDomain, /eq\(contentMediaAttachments\.evidenceItemId, input\.itemId\)/);
  assert.match(contentDomain, /status: "withdrawn"/);
  assert.match(contentDomain, /"media_attachment\.withdrawn"/);
});

test("workspace controls remain touch-sized and collapse to one column on narrow screens", async () => {
  const css = await readFile(new URL("../app/app/coaching/coaching.module.css", import.meta.url), "utf8");
  assert.match(css, /min-height:\s*2\.75rem/);
  assert.match(css, /@media \(max-width: 580px\)/);
  assert.match(css, /\.grid \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /outline:\s*3px solid/);
});

test("CSV review receipts survive refresh and final commit is derived from persisted rows", async () => {
  const [workspace, route, domain, mediaLibrary, mediaPolicy] = await Promise.all([
    readFile(workspacePath, "utf8"),
    readFile(launchImportRoutePath, "utf8"),
    readFile(richDomainPath, "utf8"),
    readFile(mediaLibraryPath, "utf8"),
    readFile(mediaPolicyPath, "utf8"),
  ]);
  for (const field of [
    "reviewRows", "acceptedRows", "acceptedSourceRowNumbers", "rejectedRows",
  ]) {
    assert.match(route, new RegExp(`"${field}"`));
    assert.match(workspace, new RegExp(field));
    assert.match(domain, new RegExp(field));
  }
  assert.match(workspace, /function resumeImport/);
  assert.match(workspace, /Continue saved mapping review/);
  assert.match(workspace, /Review failed import/);
  assert.match(workspace, /Resume exact final commit/);
  assert.match(workspace, /summaryMetrics: \[\],[\s\S]*shots: \[\]/);
  assert.match(domain, /launchImportCommitData/);
  assert.match(domain, /summarizeLaunchCsvRows\(stagedImport\.acceptedRows/);
  assert.match(domain, /launchMetricsForRow\(row, review\)/);
  assert.match(workspace, /Open\/download source document/);
  assert.match(workspace, /Open\/download committed source document/);
  assert.match(workspace, /\/api\/media\/\$\{encodeURIComponent\(importRow\.sourceMediaAssetId\)\}/);
  assert.match(
    workspace,
    /label="Measurement direction"[\s\S]*options=\{\[\s*\["unknown", "Unknown \(safest default\)"\]/,
  );
  assert.match(mediaLibrary, /file\.type === "text\/csv"/);
  assert.match(mediaLibrary, /CSV \/ document/);
  assert.match(mediaPolicy, /new TextDecoder\("utf-8", \{ fatal: true \}\)/);
  assert.match(mediaPolicy, /<!doctype\|<html\|<script\|%PDF-\|MZ/);
});

test("lesson and review history snapshots are immutable and deterministically bounded", async () => {
  const [domain, planContent, assembly] = await Promise.all([
    readFile(richDomainPath, "utf8"),
    readFile(planContentPath, "utf8"),
    readFile(planAssemblyPath, "utf8"),
  ]);
  assert.match(domain, /db\.insert\(lessonRevisionSnapshots\)\.values/);
  assert.match(domain, /MAX_LESSON_ASSOCIATIONS_PER_TYPE \+ 1/);
  assert.match(domain, /lesson_history_snapshot_too_large/);
  assert.match(planContent, /maximumLessonSources = 12/);
  assert.match(planContent, /maximumLessonAssociations \+ 1/);
  assert.match(planContent, /review_source_snapshot_too_large/);
  assert.match(planContent, /sourcePlanRevision: context\.expectedRevision/);
  assert.match(planContent, /version: "lesson-review-source-v1"/);
  assert.match(assembly, /lessonReviewSourceSnapshot\(source\.sourceSnapshot\)/);
  assert.match(assembly, /sourcePlanRevision: source\.sourcePlanRevision/);
});
