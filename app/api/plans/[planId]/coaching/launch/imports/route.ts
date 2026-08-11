import { listLaunchMonitorImports, stageLaunchMonitorImport } from "@/lib/rich-coaching";
import { assertExactObjectKeys, RequestError } from "@/lib/http";
import {
  coachRequest, enumValue, exactJson, json, nonNegativeInteger,
  objectBody, optionalText, planMutationContext, positiveInteger, recordValue, routeError, stringArray,
} from "@/app/api/coaching/_shared";

export async function GET(request: Request, route: { params: Promise<{ planId: string }> }) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const { planId } = await route.params;
    const url = new URL(request.url);
    const limitText = url.searchParams.get("limit");
    const imports = await listLaunchMonitorImports({
      accountId: context.accountId,
      planId,
      includeTerminal: url.searchParams.get("includeTerminal") === "true",
      limit: limitText ? positiveInteger(Number(limitText), "limit") : undefined,
    });
    return json({ imports }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function POST(request: Request, route: { params: Promise<{ planId: string }> }) {
  const requestContext = await coachRequest(request, true);
  if (requestContext instanceof Response) return requestContext;
  try {
    const { planId } = await route.params;
    const body = await exactJson(request, [
      "expectedRevision", "sourceMediaAssetId", "columnHeaders", "columnMappings",
      "validationReport", "reviewRows", "acceptedRows", "acceptedSourceRowNumbers", "rejectedRows",
      "totalRowCount", "acceptedRowCount", "rejectedRowCount",
      "status", "errorCode", "idempotencyKey",
    ]);
    const rawMappings = recordValue(body.columnMappings, "columnMappings");
    const columnMappings: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(rawMappings)) {
      columnMappings[key] = value === null || value === "" ? null : optionalText(value, `columnMappings.${key}`, 80);
    }
    const result = await stageLaunchMonitorImport(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      {
        sourceMediaAssetId: optionalText(body.sourceMediaAssetId, "sourceMediaAssetId", 200),
        columnHeaders: stringArray(body.columnHeaders, "columnHeaders", 200),
        columnMappings,
        validationReport: recordValue(body.validationReport, "validationReport"),
        reviewRows: csvRows(body.reviewRows, "reviewRows", 1_000),
        acceptedRows: csvRows(body.acceptedRows, "acceptedRows", 1_000),
        acceptedSourceRowNumbers: integerArray(
          body.acceptedSourceRowNumbers,
          "acceptedSourceRowNumbers",
          1_000,
        ),
        rejectedRows: rejectedRowArray(body.rejectedRows, 1_000),
        totalRowCount: nonNegativeInteger(body.totalRowCount, "totalRowCount"),
        acceptedRowCount: nonNegativeInteger(body.acceptedRowCount, "acceptedRowCount"),
        rejectedRowCount: nonNegativeInteger(body.rejectedRowCount, "rejectedRowCount"),
        status: enumValue(body.status, "status", ["mapping_required", "validated", "failed"] as const),
        errorCode: optionalText(body.errorCode, "errorCode", 120),
        idempotencyKey: optionalText(body.idempotencyKey, "idempotencyKey", 200),
      },
    );
    return json({ import: { id: result.id }, replayed: result.replayed }, requestContext.requestId, result.replayed ? 200 : 201);
  } catch (error) {
    return routeError(error, requestContext.requestId);
  }
}

function csvRows(value: unknown, field: string, maximum: number): string[][] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new RequestError(400, "invalid_field", `${field} must contain at most ${maximum} rows.`);
  }
  return value.map((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw new RequestError(400, "invalid_field", `${field}[${rowIndex}] must be an array.`);
    }
    return row.map((cell, columnIndex) => {
      if (typeof cell !== "string" || cell.length > 160) {
        throw new RequestError(
          400,
          "invalid_field",
          `${field}[${rowIndex}][${columnIndex}] must be text no longer than 160 characters.`,
        );
      }
      return cell;
    });
  });
}

function integerArray(value: unknown, field: string, maximum: number): number[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new RequestError(400, "invalid_field", `${field} must contain at most ${maximum} values.`);
  }
  return value.map((entry, index) => nonNegativeInteger(entry, `${field}[${index}]`));
}

function rejectedRowArray(value: unknown, maximum: number): Array<{ row: number; reason: string }> {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new RequestError(400, "invalid_field", `rejectedRows must contain at most ${maximum} values.`);
  }
  return value.map((entry, index) => {
    const row = objectBody(entry, `rejectedRows[${index}]`);
    assertExactObjectKeys(row, ["row", "reason"]);
    return {
      row: nonNegativeInteger(row.row, `rejectedRows[${index}].row`),
      reason: optionalText(row.reason, `rejectedRows[${index}].reason`, 500) ?? "",
    };
  });
}
