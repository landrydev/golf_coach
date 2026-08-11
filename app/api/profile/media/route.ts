import {
  assertExactObjectKeys,
  assertSameOrigin,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import {
  attachAccountMedia,
  withdrawAccountMediaAttachment,
} from "@/lib/rich-coaching";
import { requestCorrelationId } from "@/lib/request-correlation";

export async function POST(request: Request): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return noStore(authentication.response, requestId);
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const payload = asObject(await readJson<unknown>(request));
    assertExactObjectKeys(payload, ["mediaAssetId", "role"]);
    const role = enumValue(payload.role, "role", ["logo", "profile_photo"] as const);
    const mediaAssetId = opaqueId(payload.mediaAssetId, "mediaAssetId");
    const attachment = await attachAccountMedia({
      accountId: account.id,
      mediaAssetId,
      target: { kind: "profile" },
      role,
      requestId,
    });
    return Response.json(
      { attachment: { id: attachment.id, mediaAssetId, role } },
      {
        status: 201,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-ID": requestId,
        },
      },
    );
  } catch (error) {
    return noStore(errorResponse(error), requestId);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return noStore(authentication.response, requestId);
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const payload = asObject(await readJson<unknown>(request));
    assertExactObjectKeys(payload, ["attachmentId", "confirmation"]);
    if (payload.confirmation !== "remove_profile_media") {
      throw new RequestError(
        400,
        "confirmation_required",
        "Confirm that this branding media should be removed.",
      );
    }
    const attachmentId = opaqueId(payload.attachmentId, "attachmentId");
    await withdrawAccountMediaAttachment({
      accountId: account.id,
      attachmentId,
      requestId,
    });
    return Response.json(
      { withdrawn: true, attachmentId },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-ID": requestId,
        },
      },
    );
  } catch (error) {
    return noStore(errorResponse(error), requestId);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, "invalid_body", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function opaqueId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new RequestError(400, "invalid_field", `${field} is invalid.`);
  }
  return value;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  field: string,
  choices: T,
): T[number] {
  if (typeof value !== "string" || !(choices as readonly string[]).includes(value)) {
    throw new RequestError(400, "invalid_field", `${field} is invalid.`);
  }
  return value as T[number];
}

function noStore(response: Response, requestId: string): Response {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Request-ID", requestId);
  return response;
}
