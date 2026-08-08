import {
  assertSameOrigin,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import {
  completeStagedGolferWorkspace,
  getOrCreateAccountForIdentity,
  getPackageById,
  type CompleteStagedGolferWorkspaceInput,
} from "@/lib/repository";
import { newId } from "@/lib/tokens";

export async function POST(
  request: Request,
  context: { params: Promise<{ golferId: string }> },
): Promise<Response> {
  const requestId = newId();
  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);
    const body = objectBody(await readJson<unknown>(request));
    rejectUnexpected(body, [
      "expectedPlanId",
      "expectedRevision",
      "assessment",
      "priority",
      "phases",
      "firstPhasePackageId",
    ]);
    if (
      !Number.isSafeInteger(body.expectedRevision) ||
      (body.expectedRevision as number) < 1
    ) {
      throw new RequestError(
        400,
        "invalid_revision",
        "expectedRevision must be a positive whole number.",
      );
    }

    const assessment = objectField(body.assessment, "assessment");
    rejectUnexpected(assessment, [
      "summary",
      "strengths",
      "primaryPattern",
      "limitations",
    ]);
    const priority = objectField(body.priority, "priority");
    rejectUnexpected(priority, ["title", "rationale"]);
    const phases = parsePhases(body.phases);
    const packageId = optionalText(
      body.firstPhasePackageId,
      "firstPhasePackageId",
      64,
    ) || null;

    const { golferId: routeGolferId } = await context.params;
    const account = await getOrCreateAccountForIdentity(auth.identity);
    if (packageId) {
      const coachingPackage = await getPackageById(account.id, packageId);
      if (!coachingPackage || coachingPackage.status !== "active") {
        throw new RequestError(
          400,
          "invalid_package",
          "The selected coaching package is unavailable.",
        );
      }
    }

    const input: CompleteStagedGolferWorkspaceInput = {
      accountId: account.id,
      golferId: cleanText(routeGolferId, "golferId", {
        required: true,
        max: 64,
      }),
      expectedPlanId: cleanText(body.expectedPlanId, "expectedPlanId", {
        required: true,
        max: 64,
      }),
      expectedRevision: body.expectedRevision as number,
      assessment: {
        startingPoint: cleanText(assessment.summary, "assessment.summary", {
          required: true,
          max: 2_000,
        }),
        strengthSummary: cleanText(
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
      firstPhasePackageId: packageId,
      requestId,
    };

    const completed = await completeStagedGolferWorkspace(input);
    return json(
      { completed: true, ...completed },
      { requestId },
    );
  } catch (error) {
    return noStore(errorResponse(error), requestId);
  }
}

function parsePhases(value: unknown): CompleteStagedGolferWorkspaceInput["phases"] {
  if (!Array.isArray(value) || ![3, 4].includes(value.length)) {
    throw new RequestError(
      400,
      "invalid_field",
      "phases must contain three or four ordered phases.",
    );
  }
  return value.map((rawPhase, index) => {
    const phase = objectField(rawPhase, `phases[${index}]`);
    rejectUnexpected(phase, [
      "number",
      "title",
      "purpose",
      "rationale",
      "progressSignals",
    ]);
    const sequence = index + 1;
    if (phase.number !== sequence) {
      throw new RequestError(
        400,
        "invalid_field",
        `phases[${index}].number must be ${sequence}.`,
      );
    }
    const rationale = optionalText(
      phase.rationale,
      `phases[${index}].rationale`,
      1_500,
    );
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
      sequence,
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
    };
  });
}

function objectBody(value: unknown): Record<string, unknown> {
  const body = objectField(value, "request body");
  if (Object.hasOwn(body, "accountId") || Object.hasOwn(body, "account_id")) {
    throw new RequestError(
      400,
      "client_account_id_not_allowed",
      "Account ownership comes from sign-in.",
    );
  }
  return body;
}

function objectField(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, "invalid_field", `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnexpected(value: Record<string, unknown>, allowed: string[]): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) {
    throw new RequestError(400, "unexpected_field", `Unsupported field: ${unexpected}.`);
  }
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null || value === "") return "";
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
    cleanText(item, `${field}[${index}]`, {
      required: true,
      max: maxLength,
    }),
  );
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
