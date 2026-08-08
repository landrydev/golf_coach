import {
  assertExactObjectKeys,
  assertSameOrigin,
  cleanEmail,
  cleanText,
  errorResponse,
  RequestError,
  readJson,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { requireGolferRecordProcessingConsent } from "@/lib/consent-enforcement";
import {
  createGolferWorkspace,
  getOrCreateAccountForIdentity,
  getProfile,
  listGolfersPage,
  type CreateGolferWorkspaceInput,
} from "@/lib/repository";
import {
  offsetPaginationMetadata,
  requestOffsetPage,
} from "@/lib/pagination";
import { requestCorrelationId } from "@/lib/request-correlation";

const GOLFER_FIELDS = [
  "adultEligibilityConfirmed",
  "displayName",
  "preferredName",
  "email",
  "externalReference",
  "planTitle",
  "goal",
  "assessment",
  "priority",
  "phases",
  "coachingPackageId",
  "firstPhasePackageId",
] as const;
const GOAL_FIELDS = [
  "statement",
  "desiredOutcome",
  "why",
  "whyItMatters",
  "context",
  "constraints",
  "scoreOrHandicapContext",
] as const;
const ASSESSMENT_FIELDS = [
  "title",
  "context",
  "summary",
  "startingPoint",
  "strengths",
  "strengthSummary",
  "primaryPattern",
  "limitations",
] as const;
const PRIORITY_FIELDS = ["title", "description", "rationale"] as const;
const PHASE_FIELDS = [
  "number",
  "sequence",
  "status",
  "title",
  "purpose",
  "rationale",
  "progressSignals",
  "expectations",
  "estimatedDuration",
] as const;

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response);
    const account = await getOrCreateAccountForIdentity(auth.identity);
    await requireGolferRecordProcessingConsent(account.id);
    const page = await listGolfersPage(account.id, requestOffsetPage(request));
    return json({
      golfers: page.items,
      pagination: offsetPaginationMetadata(page),
    });
  } catch (error) {
    return noStore(errorResponse(error));
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);
    const idempotencyKey = validatedIdempotencyKey(request);
    const payload = asObject(await readJson<unknown>(request));
    rejectClientAccountId(payload);
    assertExactObjectKeys(payload, GOLFER_FIELDS);
    if (payload.adultEligibilityConfirmed !== true) {
      throw new RequestError(
        400,
        "adult_confirmation_required",
        "Confirm that this golfer is an adult before creating the record.",
      );
    }

    const goal = nestedObject(payload.goal, "goal");
    assertExactObjectKeys(goal, GOAL_FIELDS, "goal");
    const assessment = nestedObject(payload.assessment, "assessment");
    assertExactObjectKeys(assessment, ASSESSMENT_FIELDS, "assessment");
    const priority = nestedObject(payload.priority, "priority");
    assertExactObjectKeys(priority, PRIORITY_FIELDS, "priority");
    const priorityRationale = cleanText(priority.rationale, "priority.rationale", {
      required: true,
      max: 1_500,
    });

    if (
      !Array.isArray(payload.phases) ||
      ![3, 4].includes(payload.phases.length)
    ) {
      throw new RequestError(
        400,
        "invalid_field",
        "phases must contain three or four ordered phases.",
      );
    }
    const phases = payload.phases.map((value, index) => {
      const phase = nestedObject(value, `phases[${index}]`);
      assertExactObjectKeys(phase, PHASE_FIELDS, `phases[${index}]`);
      const expectedNumber = index + 1;
      const suppliedNumber = phase.number ?? phase.sequence ?? expectedNumber;
      if (suppliedNumber !== expectedNumber) {
        throw new RequestError(
          400,
          "invalid_field",
          `phases[${index}].number must be ${expectedNumber}.`,
        );
      }
      const expectedStatus = index === 0 ? "active" : "planned";
      if (phase.status !== undefined && phase.status !== expectedStatus) {
        throw new RequestError(
          400,
          "invalid_field",
          `phases[${index}].status must be ${expectedStatus} when the plan is created.`,
        );
      }
      const rationale = optionalText(phase, "rationale", 1_500);
      const progressSignals = textArray(
        phase.progressSignals,
        `phases[${index}].progressSignals`,
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
        sequence: expectedNumber,
        title: cleanText(phase.title, `phases[${index}].title`, {
          required: true,
          max: 120,
        }),
        purpose: cleanText(phase.purpose, `phases[${index}].purpose`, {
          required: true,
          max: 700,
        }),
        rationale: rationale || null,
        progressSignals,
        expectations: optionalText(phase, "expectations", 1_000) || null,
        estimatedDuration:
          optionalText(phase, "estimatedDuration", 120) || null,
      };
    });

    const account = await getOrCreateAccountForIdentity(auth.identity);
    if (!(await getProfile(account.id))) {
      throw new RequestError(
        409,
        "coach_profile_required",
        "Set your coach identity before creating a golfer roadmap.",
      );
    }
    const firstPhasePackageId = optionalText(payload, "coachingPackageId", 64) ||
      optionalText(payload, "firstPhasePackageId", 64) ||
      null;
    const email = optionalText(payload, "email", 254);
    const assessmentSummary = cleanText(
      assessment.summary ?? assessment.startingPoint,
      "assessment.summary",
      { required: true, max: 2_000 },
    );
    const assessmentStrengths = cleanText(
      assessment.strengths ?? assessment.strengthSummary,
      "assessment.strengths",
      { required: true, max: 1_500 },
    );
    const assessmentPattern = cleanText(
      assessment.primaryPattern,
      "assessment.primaryPattern",
      { required: true, max: 2_000 },
    );
    const input: CreateGolferWorkspaceInput = {
      displayName: cleanText(payload.displayName, "displayName", {
        required: true,
        max: 120,
      }),
      preferredName: optionalText(payload, "preferredName", 120) || null,
      contactEmail: email ? cleanEmail(email, "email") : null,
      externalReference: optionalText(payload, "externalReference", 120) || null,
      planTitle: cleanText(payload.planTitle, "planTitle", {
        required: true,
        max: 120,
      }),
      goal: {
        desiredOutcome: cleanText(
          goal.statement ?? goal.desiredOutcome,
          "goal.statement",
          { required: true, max: 600 },
        ),
        whyItMatters: optionalText(goal, "why", 1_000) ||
          optionalText(goal, "whyItMatters", 1_000) ||
          null,
        context: optionalText(goal, "context", 1_000) || null,
        constraints: optionalText(goal, "constraints", 1_500) || null,
        scoreOrHandicapContext:
          optionalText(goal, "scoreOrHandicapContext", 240) || null,
      },
      assessment: {
        title: optionalText(assessment, "title", 120) || "Starting assessment",
        context: optionalText(assessment, "context", 1_000) || null,
        startingPoint: assessmentSummary,
        strengthSummary: assessmentStrengths,
        primaryPattern: assessmentPattern,
        limitations: cleanText(assessment.limitations, "assessment.limitations", {
          required: true,
          max: 1_500,
        }),
      },
      priority: {
        title: cleanText(priority.title, "priority.title", {
          required: true,
          max: 120,
        }),
        description:
          optionalText(priority, "description", 1_500) || priorityRationale,
        rationale: priorityRationale,
      },
      phases,
      firstPhasePackageId,
    };

    const submission = await createGolferWorkspace(
      account.id,
      input,
      idempotencyKey,
      requestId,
    );
    return json(
      {
        ...submission.workspace,
        idempotentReplay: !submission.created,
      },
      { status: submission.created ? 201 : 200, requestId },
    );
  } catch (error) {
    return noStore(errorResponse(error), requestId);
  }
}

function validatedIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{19,127}$/.test(value)) {
    throw new RequestError(
      400,
      "idempotency_key_required",
      "Provide a stable Idempotency-Key of 20 to 128 safe characters.",
    );
  }
  return value;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, "invalid_body", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function nestedObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, "invalid_field", `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalText(
  payload: Record<string, unknown>,
  field: string,
  max: number,
): string {
  const value = payload[field];
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
  if (value === undefined || value === null) return [];
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

function json(
  body: unknown,
  options: { status?: number; requestId?: string } = {},
): Response {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  if (options.requestId) headers.set("X-Request-ID", options.requestId);
  return Response.json(body, { status: options.status ?? 200, headers });
}

function noStore(response: Response, requestId?: string): Response {
  response.headers.set("Cache-Control", "private, no-store");
  if (requestId) response.headers.set("X-Request-ID", requestId);
  return response;
}
