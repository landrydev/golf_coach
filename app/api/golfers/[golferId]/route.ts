import { archiveGolfer, updateGolferIdentity } from "@/lib/golfer-lifecycle";
import {
  assertSameOrigin,
  cleanEmail,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { newId } from "@/lib/tokens";

export async function PUT(
  request: Request,
  context: { params: Promise<{ golferId: string }> },
) {
  const requestId = newId();
  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return auth.response;
    const body = objectBody(await readJson<unknown>(request));
    rejectUnexpected(body, [
      "displayName",
      "preferredName",
      "contactEmail",
      "expectedPlanId",
      "expectedPlanRevision",
    ]);
    const { golferId } = await context.params;
    const account = await getOrCreateAccountForIdentity(auth.identity);
    const emailText = optionalText(body.contactEmail, "contactEmail", 254);
    if (!Number.isSafeInteger(body.expectedPlanRevision) || (body.expectedPlanRevision as number) < 1) {
      throw new RequestError(400, "invalid_field", "expectedPlanRevision must be a positive whole number.");
    }
    await updateGolferIdentity({
      accountId: account.id,
      golferId: cleanText(golferId, "golferId", { required: true, max: 64 }),
      expectedPlanId: cleanText(body.expectedPlanId, "expectedPlanId", { required: true, max: 64 }),
      expectedPlanRevision: body.expectedPlanRevision as number,
      displayName: cleanText(body.displayName, "displayName", { required: true, max: 120 }),
      preferredName: optionalText(body.preferredName, "preferredName", 120) || null,
      contactEmail: emailText ? cleanEmail(emailText, "contactEmail") : null,
      requestId,
    });
    return Response.json(
      { updated: true },
      { headers: { "Cache-Control": "private, no-store", "X-Request-ID": requestId } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ golferId: string }> },
) {
  const requestId = newId();
  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return auth.response;
    const body = objectBody(await readJson<unknown>(request));
    rejectUnexpected(body, ["confirmation"]);
    if (body.confirmation !== "archive_golfer_and_revoke_access") {
      throw new RequestError(400, "confirmation_required", "Confirm golfer archival and access revocation.");
    }
    const { golferId } = await context.params;
    const account = await getOrCreateAccountForIdentity(auth.identity);
    await archiveGolfer({
      accountId: account.id,
      golferId: cleanText(golferId, "golferId", { required: true, max: 64 }),
      requestId,
    });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store", "X-Request-ID": requestId },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, "invalid_body", "Request body must be a JSON object.");
  }
  if (Object.hasOwn(value, "accountId") || Object.hasOwn(value, "account_id")) {
    throw new RequestError(400, "client_account_id_not_allowed", "Account ownership comes from sign-in.");
  }
  return value as Record<string, unknown>;
}

function rejectUnexpected(value: Record<string, unknown>, allowed: string[]) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) {
    throw new RequestError(400, "unexpected_field", `Unsupported field: ${unexpected[0]}.`);
  }
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null || value === "") return "";
  return cleanText(value, field, { max });
}
