import { createInstructorDataExport } from "@/lib/data-export";
import {
  assertSameOrigin,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";
import { newId } from "@/lib/tokens";

export async function POST(request: Request): Promise<Response> {
  const requestId = newId();

  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response, requestId);

    const payload = asObject(await readJson<unknown>(request));
    rejectClientAccountId(payload);
    const account = await getOrCreateAccountForIdentity(auth.identity);
    await enforceAbuseLimit(ABUSE_LIMITS.dataExportAccount, account.id);
    const dataExport = await createInstructorDataExport({
      accountId: account.id,
      requestId,
    });

    return new Response(dataExport.body, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${dataExport.filename}"`,
        "Content-Length": String(dataExport.byteSize),
        "Content-Type": "application/json; charset=utf-8",
        Expires: "0",
        Pragma: "no-cache",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Request-ID": requestId,
      },
    });
  } catch (error) {
    return noStore(errorResponse(error), requestId);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(
      400,
      "invalid_body",
      "Request body must be an empty JSON object.",
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
  const unexpected = Object.keys(payload);
  if (unexpected.length > 0) {
    throw new RequestError(
      400,
      "unexpected_field",
      `Request contains unsupported field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`,
    );
  }
}

function noStore(response: Response, requestId: string): Response {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Request-ID", requestId);
  return response;
}
