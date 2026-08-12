export type LaunchCsvReview = Readonly<{
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  mappings: Readonly<Record<string, string | null>>;
  units: Readonly<Record<string, string>>;
  unitConfirmed: Readonly<Record<string, boolean>>;
}>;

export type LaunchCsvMetric = Readonly<{
  canonicalKey: string;
  originalName: string;
  displayName: string;
  numericValue: number;
  unit: string;
  sourceColumn: string;
  direction: "unknown";
  golferFacing: true;
}>;

export function validateLaunchCsvReview(review: LaunchCsvReview) {
  const selected = selectedColumns(review);
  const mappingErrors: string[] = [];
  if (!selected.length) mappingErrors.push("Map at least one measurement column.");
  const canonicalKeys = selected.map((column) => column.canonicalKey);
  if (new Set(canonicalKeys).size !== canonicalKeys.length) {
    mappingErrors.push("Map each measurement type only once.");
  }
  for (const column of selected) {
    if (!column.unit) mappingErrors.push(`Enter the unit for ${column.header}.`);
    if (!review.unitConfirmed[column.header]) {
      mappingErrors.push(`Confirm the unit for ${column.header}.`);
    }
  }

  const rows: string[][] = [];
  const sourceRowNumbers: number[] = [];
  const rejected: Array<{ row: number; reason: string }> = [];
  if (mappingErrors.length) return { rows, sourceRowNumbers, rejected, mappingErrors };

  review.rows.forEach((sourceRow, index) => {
    const row = [...sourceRow];
    const invalid = selected.find((column) => {
      const raw = row[column.index]?.trim() ?? "";
      return raw === "" || !Number.isFinite(Number(raw));
    });
    if (!invalid) {
      rows.push(row);
      sourceRowNumbers.push(index + 2);
      return;
    }
    const raw = row[invalid.index]?.trim() ?? "";
    rejected.push({
      row: index + 2,
      reason: raw === "" ? `${invalid.header} is missing.` : `${invalid.header} is not numeric.`,
    });
  });
  return { rows, sourceRowNumbers, rejected, mappingErrors };
}

export function launchMetricsForRow(
  row: readonly string[],
  review: Pick<LaunchCsvReview, "headers" | "mappings" | "units">,
): LaunchCsvMetric[] {
  return selectedColumns(review).map((column) => {
    const raw = row[column.index]?.trim() ?? "";
    if (!raw || !Number.isFinite(Number(raw))) {
      throw new Error(`Reviewed row has no finite value for ${column.header}.`);
    }
    return {
      canonicalKey: column.canonicalKey,
      originalName: column.header,
      displayName: displayMetricName(column.canonicalKey),
      numericValue: Number(raw),
      unit: column.unit,
      sourceColumn: column.header,
      direction: "unknown",
      golferFacing: true,
    };
  });
}

export function summarizeLaunchCsvRows(
  rows: readonly (readonly string[])[],
  review: Pick<LaunchCsvReview, "headers" | "mappings" | "units">,
): LaunchCsvMetric[] {
  const metrics = rows.map((row) => launchMetricsForRow(row, review));
  if (!metrics.length) return [];
  return metrics[0]!.map((metric, index) => ({
    ...metric,
    numericValue:
      metrics.reduce((sum, row) => sum + row[index]!.numericValue, 0) /
      metrics.length,
  }));
}

export function launchCsvMetricUnits(
  review: Pick<LaunchCsvReview, "headers" | "mappings" | "units">,
): Record<string, string> {
  return Object.fromEntries(
    selectedColumns(review).map(({ header, unit }) => [header, unit]),
  );
}

export function launchCsvStageFingerprint(input: {
  headers: readonly string[];
  mappings: Readonly<Record<string, string | null>>;
  units: Readonly<Record<string, string>>;
  acceptedRows: readonly (readonly string[])[];
}): string {
  const serialized = JSON.stringify({
    headers: input.headers,
    mappings: orderedRecord(input.headers, input.mappings),
    units: orderedRecord(input.headers, input.units),
    acceptedRows: input.acceptedRows,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `launch-csv-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function defaultMetricUnit(canonicalKey: string): string {
  if (canonicalKey.includes("speed")) return "mph";
  if (canonicalKey.includes("distance")) return "yd";
  if (canonicalKey.includes("angle")) return "deg";
  if (canonicalKey === "spin_rate") return "rpm";
  return "ratio";
}

function selectedColumns(review: Pick<LaunchCsvReview, "headers" | "mappings" | "units">) {
  return review.headers.flatMap((header, index) => {
    const canonicalKey = review.mappings[header];
    return canonicalKey
      ? [{ header, index, canonicalKey, unit: (review.units[header] ?? "").trim() }]
      : [];
  });
}

function orderedRecord<T>(headers: readonly string[], record: Readonly<Record<string, T>>) {
  return Object.fromEntries(headers.map((header) => [header, record[header] ?? null]));
}

function displayMetricName(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
