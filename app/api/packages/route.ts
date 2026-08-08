import {
  assertSameOrigin,
  errorResponse,
  readJson,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { parsePackageInput } from "@/lib/package-input";
import {
  createCoachingPackage,
  getOrCreateAccountForIdentity,
  listPackages,
} from "@/lib/repository";
import { newId } from "@/lib/tokens";

export async function GET(): Promise<Response> {
  try {
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response);
    const account = await getOrCreateAccountForIdentity(auth.identity);
    return json({ packages: await listPackages(account.id) });
  } catch (error) {
    return noStore(errorResponse(error));
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = newId();
  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);
    const input = parsePackageInput(await readJson<unknown>(request), {
      allowArchived: true,
      defaultStatus: "draft",
    });
    const account = await getOrCreateAccountForIdentity(auth.identity);
    const coachingPackage = await createCoachingPackage(
      account.id,
      input,
      requestId,
    );
    return json({ package: coachingPackage }, { status: 201, requestId });
  } catch (error) {
    return noStore(errorResponse(error), requestId);
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
