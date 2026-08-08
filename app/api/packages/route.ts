import {
  assertSameOrigin,
  errorResponse,
  RequestError,
  readJson,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { parsePackageInput } from "@/lib/package-input";
import {
  createCoachingPackage,
  getOrCreateAccountForIdentity,
  listPackagesPage,
} from "@/lib/repository";
import {
  offsetPaginationMetadata,
  requestOffsetPage,
} from "@/lib/pagination";
import { requestCorrelationId } from "@/lib/request-correlation";

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response);
    const account = await getOrCreateAccountForIdentity(auth.identity);
    const page = await listPackagesPage(account.id, requestOffsetPage(request));
    return json({
      packages: page.items,
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
    const input = parsePackageInput(await readJson<unknown>(request), {
      allowArchived: true,
      defaultStatus: "draft",
    });
    const account = await getOrCreateAccountForIdentity(auth.identity);
    const submission = await createCoachingPackage(
      account.id,
      input,
      idempotencyKey,
      requestId,
    );
    return json(
      {
        package: submission.package,
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
