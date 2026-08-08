import {
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
import { newId } from "@/lib/tokens";

const BODY_FIELDS = [
  "expectedRevision",
  "title",
  "goal",
  "assessment",
  "priority",
  "phases",
] as const;
const GOAL_FIELDS = ["statement", "why", "context"] as const;
const ASSESSMENT_FIELDS = ["summary", "strengths", "limitations"] as const;
const PRIORITY_FIELDS = ["title", "rationale"] as const;
const PHASE_FIELDS = ["number", "title", "purpose"] as const;

export async function PUT(
  request: Request,
  context: { params: Promise<{ planId: string }> },
): Promise<Response> {
  const requestId = newId();

  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);

    const payload = asObject(await readJson<unknown>(request), "body");
    rejectClientAccountId(payload);
    assertOnlyFields(payload, "body", BODY_FIELDS);

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
  assertOnlyFields(goal, "goal", GOAL_FIELDS);

  const assessment = asObject(payload.assessment, "assessment");
  assertOnlyFields(assessment, "assessment", ASSESSMENT_FIELDS);

  const priority = asObject(payload.priority, "priority");
  assertOnlyFields(priority, "priority", PRIORITY_FIELDS);

  if (!Array.isArray(payload.phases) || payload.phases.length !== 4) {
    throw new RequestError(
      400,
      "invalid_field",
      "phases must contain exactly four ordered phases.",
    );
  }

  const phases = payload.phases.map((value, index) => {
    const field = `phases[${index}]`;
    const phase = asObject(value, field);
    assertOnlyFields(phase, field, PHASE_FIELDS);
    const expectedNumber = index + 1;
    if (phase.number !== expectedNumber) {
      throw new RequestError(
        400,
        "invalid_field",
        `${field}.number must be ${expectedNumber}.`,
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
      strengths: optionalText(
        assessment.strengths,
        "assessment.strengths",
        1_500,
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

function assertOnlyFields(
  value: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new RequestError(
      400,
      "unexpected_field",
      `${field} contains unsupported field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`,
    );
  }
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") {
    throw new RequestError(400, "invalid_field", `${field} must be text.`);
  }
  return cleanText(value, field, { max });
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
