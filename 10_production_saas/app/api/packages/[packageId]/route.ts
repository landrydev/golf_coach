import {
  assertExactObjectKeys,
  assertSameOrigin,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { parsePackageUpdateInput } from "@/lib/package-input";
import {
  archiveCoachingPackage,
  getOrCreateAccountForIdentity,
  updateCoachingPackage,
} from "@/lib/repository";
import { requestCorrelationId } from "@/lib/request-correlation";

export async function PUT(
  request: Request,
  context: { params: Promise<{ packageId: string }> },
): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);
    const update = parsePackageUpdateInput(await readJson<unknown>(request));
    const packageId = await packageIdFrom(context);
    const account = await getOrCreateAccountForIdentity(auth.identity);
    const result = await updateCoachingPackage(
      account.id,
      packageId,
      update.input,
      update.expectedUpdatedAt,
      requestId,
    );
    return json(result, requestId);
  } catch (error) {
    return noStore(errorResponse(error), requestId);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ packageId: string }> },
): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);
    const payload = asObject(await readJson<unknown>(request));
    rejectClientAccountId(payload);
    assertExactObjectKeys(payload, ["confirmation", "expectedUpdatedAt"]);
    if (payload.confirmation !== "archive_package") {
      throw new RequestError(
        400,
        "archive_confirmation_required",
        "Confirm the package archive action.",
      );
    }
    if (
      !Number.isSafeInteger(payload.expectedUpdatedAt) ||
      (payload.expectedUpdatedAt as number) < 0
    ) {
      throw new RequestError(
        400,
        "invalid_field",
        "expectedUpdatedAt must be a non-negative whole number.",
      );
    }

    const packageId = await packageIdFrom(context);
    const account = await getOrCreateAccountForIdentity(auth.identity);
    const result = await archiveCoachingPackage(
      account.id,
      packageId,
      payload.expectedUpdatedAt as number,
      requestId,
    );
    return json(result, requestId);
  } catch (error) {
    return noStore(errorResponse(error), requestId);
  }
}

async function packageIdFrom(context: {
  params: Promise<{ packageId: string }>;
}): Promise<string> {
  const { packageId } = await context.params;
  return cleanText(packageId, "packageId", { required: true, max: 64 });
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(
      400,
      "invalid_body",
      "Request body must be a JSON object.",
    );
  }
  return value as Record<string, unknown>;
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
