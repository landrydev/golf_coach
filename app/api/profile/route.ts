import {
  assertExactObjectKeys,
  assertSameOrigin,
  cleanEmail,
  cleanExternalUrl,
  cleanText,
  errorResponse,
  RequestError,
  readJson,
} from "@/lib/http";
import { isAccessibleCoachAccent } from "@/lib/colors";
import { requireApiIdentity } from "@/lib/identity";
import {
  getOrCreateAccountForIdentity,
  getProfile,
  saveProfile,
} from "@/lib/repository";
import { requestCorrelationId } from "@/lib/request-correlation";

const PROFILE_FIELDS = [
  "displayName",
  "businessName",
  "professionalTitle",
  "philosophy",
  "bio",
  "contactEmail",
  "contactPhone",
  "websiteUrl",
  "city",
  "provinceOrTerritory",
  "location",
  "accentColor",
] as const;

export async function GET(): Promise<Response> {
  try {
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response);

    const account = await getOrCreateAccountForIdentity(auth.identity);
    const storedProfile = await getProfile(account.id);
    const profile =
      storedProfile ??
      {
        displayName: auth.identity.displayName,
        businessName: null,
        professionalTitle: null,
        philosophy: null,
        bio: null,
        contactEmail: account.primaryEmail,
        contactPhone: null,
        websiteUrl: null,
        provinceOrTerritory: null,
        city: null,
        location: null,
        accentColor: null,
        setupCompletedAt: null,
        updatedAt: account.updatedAt.getTime(),
      };

    return json({ profile });
  } catch (error) {
    return noStore(errorResponse(error));
  }
}

export async function PUT(request: Request): Promise<Response> {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const auth = await requireApiIdentity();
    if (auth.response) return noStore(auth.response);

    const payload = asObject(await readJson<unknown>(request));
    rejectClientAccountId(payload);
    assertExactObjectKeys(payload, PROFILE_FIELDS);
    const account = await getOrCreateAccountForIdentity(auth.identity);

    const displayName = cleanText(payload.displayName, "displayName", {
      required: true,
      max: 120,
    });
    const businessName = optionalText(payload, "businessName", 160);
    const professionalTitle = optionalText(payload, "professionalTitle", 120);
    const philosophy = Object.hasOwn(payload, "philosophy")
      ? optionalText(payload, "philosophy", 700)
      : optionalText(payload, "bio", 700);
    const contactEmail = cleanEmail(payload.contactEmail, "contactEmail");
    const contactPhone = optionalText(payload, "contactPhone", 50);
    const websiteText = optionalText(payload, "websiteUrl", 2_048);
    const websiteUrl = websiteText
      ? cleanExternalUrl(websiteText, "websiteUrl")
      : "";

    const suppliedCanonicalLocation =
      Object.hasOwn(payload, "city") ||
      Object.hasOwn(payload, "provinceOrTerritory");
    const city = suppliedCanonicalLocation
      ? optionalText(payload, "city", 100)
      : optionalText(payload, "location", 160);
    const provinceOrTerritory = suppliedCanonicalLocation
      ? optionalText(payload, "provinceOrTerritory", 100)
      : "";
    const accentColor = optionalText(payload, "accentColor", 7);
    if (accentColor && !/^#[0-9a-f]{6}$/i.test(accentColor)) {
      throw new RequestError(
        400,
        "invalid_field",
        "accentColor must be a six-digit hexadecimal colour.",
      );
    }
    if (accentColor && !isAccessibleCoachAccent(accentColor)) {
      throw new RequestError(
        400,
        "insufficient_colour_contrast",
        "accentColor must be dark enough for readable text on Roadmap's light surfaces.",
      );
    }

    const result = await saveProfile(
      account.id,
      {
        displayName,
        businessName: businessName || null,
        professionalTitle: professionalTitle || null,
        philosophy: philosophy || null,
        contactEmail,
        contactPhone: contactPhone || null,
        websiteUrl: websiteUrl || null,
        provinceOrTerritory: provinceOrTerritory || null,
        city: city || null,
        accentColor: accentColor || null,
      },
      requestId,
    );

    return json(result, { status: 200, requestId });
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
