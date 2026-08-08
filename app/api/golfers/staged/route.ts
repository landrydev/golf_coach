import {
  assertSameOrigin,
  cleanEmail,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import {
  createStagedGolferWorkspace,
  getOrCreateAccountForIdentity,
  getProfile,
  type CreateStagedGolferWorkspaceInput,
} from "@/lib/repository";
import { newId } from "@/lib/tokens";

export async function POST(request: Request): Promise<Response> {
  const requestId = newId();
  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);
    const idempotencyKey = validatedIdempotencyKey(request);
    const payload = objectBody(await readJson<unknown>(request));
    rejectUnexpected(payload, [
      "adultEligibilityConfirmed",
      "displayName",
      "preferredName",
      "email",
      "planTitle",
      "goal",
    ]);
    if (payload.adultEligibilityConfirmed !== true) {
      throw new RequestError(
        400,
        "adult_confirmation_required",
        "Confirm that this golfer is an adult before saving the record.",
      );
    }

    const goal = objectField(payload.goal, "goal");
    rejectUnexpected(goal, ["statement", "why", "context"]);
    const account = await getOrCreateAccountForIdentity(auth.identity);
    if (!(await getProfile(account.id))) {
      throw new RequestError(
        409,
        "coach_profile_required",
        "Set your coach identity before creating a golfer roadmap.",
      );
    }

    const emailText = optionalText(payload.email, "email", 254);
    const input: CreateStagedGolferWorkspaceInput = {
      displayName: cleanText(payload.displayName, "displayName", {
        required: true,
        max: 120,
      }),
      preferredName: optionalText(payload.preferredName, "preferredName", 120) || null,
      contactEmail: emailText ? cleanEmail(emailText, "email") : null,
      planTitle: cleanText(payload.planTitle, "planTitle", {
        required: true,
        max: 120,
      }),
      goal: {
        desiredOutcome: cleanText(goal.statement, "goal.statement", {
          required: true,
          max: 600,
        }),
        whyItMatters: optionalText(goal.why, "goal.why", 1_000) || null,
        context: optionalText(goal.context, "goal.context", 1_000) || null,
      },
    };

    const submission = await createStagedGolferWorkspace(
      account.id,
      input,
      idempotencyKey,
    );
    const staged = submission.workspace;
    return json(
      {
        golfer: staged.golfer,
        plan: staged.plan,
        goal: staged.goal,
        authoringState: staged.authoringState,
        resumePath: `/app/golfers/${encodeURIComponent(staged.golfer.id)}/complete`,
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
