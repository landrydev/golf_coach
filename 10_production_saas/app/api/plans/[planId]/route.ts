import {
  assertExactObjectKeys,
  assertSameOrigin,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import {
  editCorePlan,
  type CorePlanEditInput,
} from "@/lib/plan-editor";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { requestCorrelationId } from "@/lib/request-correlation";

const BODY_FIELDS = [
  "expectedRevision",
  "title",
  "goal",
  "assessment",
  "priority",
  "phases",
] as const;
const GOAL_FIELDS = ["statement", "why", "context"] as const;
const ASSESSMENT_FIELDS = [
  "summary",
  "strengths",
  "primaryPattern",
  "limitations",
] as const;
const PRIORITY_FIELDS = ["title", "rationale"] as const;
const PHASE_FIELDS = [
  "number",
  "title",
  "purpose",
  "rationale",
  "progressSignals",
] as const;

export async function PUT(
  request: Request,
  context: { params: Promise<{ planId: string }> },
): Promise<Response> {
  const requestId = requestCorrelationId(request);

  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);

    const payload = asObject(await readJson<unknown>(request), "body");
    rejectClientAccountId(payload);
    assertExactObjectKeys(payload, BODY_FIELDS, "body");

    const changes = parseChanges(payload);
    const expectedRevision = integerValue(
      payload.expectedRevision,
      "expectedRevision",
      1,
      1_000_000,
    );
    const { planId: rawPlanId } = await context.params;
    const planId = cleanText(rawPlanId, "planId", {
      required: true,
      max: 64,
    });
    const account = await getOrCreateAccountForIdentity(auth.identity);
    const result = await editCorePlan({
      accountId: account.id,
      planId,
      expectedRevision,
      changes,
      requestId,
    });

    return json(result, requestId);
  } catch (error) {
    return noStore(errorResponse(error), requestId);
  }
}

function integerValue(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RequestError(
      400,
      "invalid_field",
      `${field} must be a whole number from ${minimum} to ${maximum}.`,
    );
  }
  return value as number;
}

function parseChanges(payload: Record<string, unknown>): CorePlanEditInput {
  const goal = asObject(payload.goal, "goal");
  assertExactObjectKeys(goal, GOAL_FIELDS, "goal");

  const assessment = asObject(payload.assessment, "assessment");
  assertExactObjectKeys(assessment, ASSESSMENT_FIELDS, "assessment");

  const priority = asObject(payload.priority, "priority");
  assertExactObjectKeys(priority, PRIORITY_FIELDS, "priority");

  if (!Array.isArray(payload.phases) || ![3, 4].includes(payload.phases.length)) {
    throw new RequestError(
      400,
      "invalid_field",
      "phases must contain three or four ordered phases.",
    );
  }

  const phases = payload.phases.map((value, index) => {
    const field = `phases[${index}]`;
    const phase = asObject(value, field);
    assertExactObjectKeys(phase, PHASE_FIELDS, field);
    const expectedNumber = index + 1;
    if (phase.number !== expectedNumber) {
      throw new RequestError(
        400,
        "invalid_field",
        `${field}.number must be ${expectedNumber}.`,
      );
    }

    const rationale = optionalText(
      phase.rationale,
      `${field}.rationale`,
      1_500,
    );
    const progressSignals = textArray(
      phase.progressSignals,
      `${field}.progressSignals`,
      10,
      240,
    );
    if (index === 0 && !rationale) {
      throw new RequestError(
        400,
        "invalid_field",
        "phases[0].rationale is required for the first phase.",
      );
    }
    if (index === 0 && progressSignals.length === 0) {
      throw new RequestError(
        400,
        "invalid_field",
        "phases[0].progressSignals must contain at least one observable signal.",
      );
    }

    return {
      number: expectedNumber,
      title: cleanText(phase.title, `${field}.title`, {
        required: true,
        max: 120,
      }),
      purpose: cleanText(phase.purpose, `${field}.purpose`, {
        required: true,
        max: 700,
      }),
      rationale: rationale || null,
      progressSignals,
    };
  });

  return {
    title: cleanText(payload.title, "title", { required: true, max: 120 }),
    goal: {
      statement: cleanText(goal.statement, "goal.statement", {
        required: true,
        max: 600,
      }),
      why: optionalText(goal.why, "goal.why", 1_000),
      context: optionalText(goal.context, "goal.context", 2_500),
    },
    assessment: {
      summary: cleanText(assessment.summary, "assessment.summary", {
        required: true,
        max: 2_000,
      }),
      strengths: cleanText(
        assessment.strengths,
        "assessment.strengths",
        { required: true, max: 1_500 },
      ),
      primaryPattern: cleanText(
        assessment.primaryPattern,
        "assessment.primaryPattern",
        { required: true, max: 2_000 },
      ),
      limitations: cleanText(
        assessment.limitations,
        "assessment.limitations",
        { required: true, max: 1_500 },
      ),
    },
    priority: {
      title: cleanText(priority.title, "priority.title", {
        required: true,
        max: 120,
      }),
      rationale: cleanText(priority.rationale, "priority.rationale", {
        required: true,
        max: 1_500,
      }),
    },
    phases,
  };
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(
      400,
      field === "body" ? "invalid_body" : "invalid_field",
      `${field} must be a JSON object.`,
    );
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") {
    throw new RequestError(400, "invalid_field", `${field} must be text.`);
  }
  return cleanText(value, field, { max });
}

function textArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new RequestError(
      400,
      "invalid_field",
      `${field} must contain at most ${maxItems} items.`,
    );
  }
  return value.map((item, index) =>
    cleanText(item, `${field}[${index}]`, { required: true, max: maxLength }),
  );
}

function rejectClientAccountId(payload: Record<string, unknown>): void {
  if (Object.hasOwn(payload, "accountId") || Object.hasOwn(payload, "account_id")) {
    throw new RequestError(
      400,
      "client_account_id_not_allowed",
      "accountId is assigned from the authenticated session.",
    );
  }
}

function json(body: unknown, requestId: string): Response {
  return Response.json(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Request-ID": requestId,
    },
  });
}

function noStore(response: Response, requestId: string): Response {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Request-ID", requestId);
  return response;
}
