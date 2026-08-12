import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  launchCsvStageFingerprint,
  launchCsvMetricUnits,
  launchMetricsForRow,
  summarizeLaunchCsvRows,
  validateLaunchCsvReview,
} from "../lib/launch-csv-review.ts";

function review(overrides = {}) {
  return {
    headers: ["Club Speed", "Carry"],
    rows: [["101.5", "245"], ["", "250"]],
    mappings: { "Club Speed": "club_speed", Carry: "carry_distance" },
    units: { "Club Speed": "mph", Carry: "yd" },
    unitConfirmed: { "Club Speed": true, Carry: true },
    ...overrides,
  };
}

test("blank CSV measurements remain missing and are rejected instead of becoming zero", () => {
  const result = validateLaunchCsvReview(review());
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rejected, [{ row: 3, reason: "Club Speed is missing." }]);
  assert.equal(launchMetricsForRow(result.rows[0], review())[0].numericValue, 101.5);
});

test("each mapped metric requires an explicit confirmed unit", () => {
  const missing = validateLaunchCsvReview(review({ units: { "Club Speed": "", Carry: "yd" } }));
  assert.ok(missing.mappingErrors.includes("Enter the unit for Club Speed."));
  const unconfirmed = validateLaunchCsvReview(review({ unitConfirmed: { "Club Speed": false, Carry: true } }));
  assert.ok(unconfirmed.mappingErrors.includes("Confirm the unit for Club Speed."));
});

test("row metrics and summaries preserve the coach-confirmed units", () => {
  const source = review({ rows: [["100", "240"], ["104", "250"]] });
  const validated = validateLaunchCsvReview(source);
  const summary = summarizeLaunchCsvRows(validated.rows, source);
  assert.deepEqual(summary.map(({ numericValue, unit }) => ({ numericValue, unit })), [
    { numericValue: 102, unit: "mph" },
    { numericValue: 245, unit: "yd" },
  ]);
});

test("the staged unit contract contains only mapped measurement columns", () => {
  const source = review({
    headers: ["Club Speed", "Carry", "Notes"],
    rows: [["100", "240", "Good strike"]],
    mappings: { "Club Speed": "club_speed", Carry: "carry_distance", Notes: null },
    units: { "Club Speed": "mph", Carry: "yd", Notes: "" },
    unitConfirmed: { "Club Speed": true, Carry: true, Notes: false },
  });
  assert.deepEqual(launchCsvMetricUnits(source), {
    "Club Speed": "mph",
    Carry: "yd",
  });
});

test("stage fingerprint changes for mapping, unit, or accepted-row drift", () => {
  const source = review();
  const acceptedRows = validateLaunchCsvReview(source).rows;
  const baseline = launchCsvStageFingerprint({ ...source, acceptedRows });
  assert.notEqual(baseline, launchCsvStageFingerprint({ ...source, units: { ...source.units, Carry: "m" }, acceptedRows }));
  assert.notEqual(baseline, launchCsvStageFingerprint({ ...source, mappings: { ...source.mappings, Carry: null }, acceptedRows }));
  assert.notEqual(baseline, launchCsvStageFingerprint({ ...source, acceptedRows: [["99", "240"]] }));
});

test("CSV session contract binds final commit to the persisted staged review", async () => {
  const [route, domain, workspace] = await Promise.all([
    readFile(new URL("../app/api/plans/[planId]/coaching/launch/sessions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/rich-coaching.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /"stagedReviewFingerprint"/);
  assert.match(domain, /assertValidatedLaunchImportReview/);
  assert.match(domain, /confirmedUnitColumns/);
  assert.match(domain, /launchImportCommitData/);
  assert.match(domain, /acceptedRows: launchMonitorImports\.acceptedRows/);
  assert.match(domain, /acceptedSourceRowNumbers: launchMonitorImports\.acceptedSourceRowNumbers/);
  assert.match(domain, /lockedCsv\?\.summaryMetrics \?\? input\.summaryMetrics/);
  assert.match(domain, /lockedCsv\?\.shots \?\? input\.shots/);
  assert.match(domain, /launch_import_row_count_mismatch/);
  assert.match(domain, /launch_import_review_mismatch/);
  assert.match(workspace, /importRow\.columnMappings/);
  assert.match(workspace, /Change mapping and revalidate/);
  assert.match(workspace, /stagedReviewFingerprint: stagedCsv\.fingerprint/);
  assert.match(workspace, /summaryMetrics: \[\]/);
  assert.match(workspace, /shots: \[\]/);
});
