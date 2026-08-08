import {
  cleanExternalUrl,
  cleanText,
  RequestError,
} from "@/lib/http";
import type { CreatePackageInput } from "@/lib/repository";

const ACTION_TYPES = ["booking", "purchase", "contact", "other"] as const;
const PACKAGE_FIELDS = [
  "name",
  "title",
  "description",
  "purpose",
  "fitDescription",
  "status",
  "currency",
  "priceAmountMinor",
  "priceCents",
  "currentDetailsText",
  "inclusions",
  "cadence",
  "practiceExpectation",
  "evaluationDescription",
  "termsSummary",
  "terms",
  "externalActionType",
  "externalActionLabel",
  "externalActionUrl",
  "isDefault",
] as const;

export function parsePackageInput(
  value: unknown,
  options: {
    allowArchived?: boolean;
    defaultStatus?: "draft" | "active";
  } = {},
): CreatePackageInput {
  const payload = asObject(value);
  rejectClientAccountId(payload);
  assertOnlyFields(payload, PACKAGE_FIELDS);

  const description = optionalText(payload.description, "description", 1_500);
  const status = enumValue(
    payload.status ?? options.defaultStatus ?? "draft",
    "status",
    options.allowArchived
      ? (["draft", "active", "archived"] as const)
      : (["draft", "active"] as const),
  );
  const priceAmountMinor = optionalMoney(
    payload.priceAmountMinor ?? payload.priceCents,
    "priceCents",
  );
  const currencyText = optionalText(payload.currency, "currency", 3).toUpperCase();
  const currency = priceAmountMinor === null ? currencyText : currencyText || "CAD";
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    throw new RequestError(
      400,
      "invalid_field",
      "currency must be a three-letter currency code.",
    );
  }
  if (priceAmountMinor === null && currency) {
    throw new RequestError(
      400,
      "invalid_field",
      "currency must be omitted when priceCents is omitted.",
    );
  }

  const currentDetailsText = optionalText(
    payload.currentDetailsText,
    "currentDetailsText",
    500,
  );
  if (priceAmountMinor === null && !currentDetailsText) {
    throw new RequestError(
      400,
      "invalid_field",
      "Provide priceCents or currentDetailsText.",
    );
  }

  const externalActionType = enumValue(
    payload.externalActionType ?? "booking",
    "externalActionType",
    ACTION_TYPES,
  );
  const externalActionUrl = cleanExternalUrl(
    payload.externalActionUrl,
    "externalActionUrl",
  );
  if (!externalActionUrl) {
    throw new RequestError(
      400,
      "invalid_field",
      "externalActionUrl is required.",
    );
  }
  const parsedExternalUrl = new URL(externalActionUrl);
  if (parsedExternalUrl.username || parsedExternalUrl.password) {
    throw new RequestError(
      400,
      "invalid_field",
      "externalActionUrl must not contain embedded credentials.",
    );
  }

  const isDefault = optionalBoolean(payload.isDefault, "isDefault");
  if (isDefault && status !== "active") {
    throw new RequestError(
      400,
      "invalid_field",
      "Only an active package can be the default.",
    );
  }

  return {
    name: cleanText(payload.name ?? payload.title, "title", {
      required: true,
      max: 120,
    }),
    purpose: cleanText(payload.purpose ?? description, "purpose", {
      required: true,
      max: 1_500,
    }),
    fitDescription: cleanText(
      payload.fitDescription ?? description,
      "fitDescription",
      { required: true, max: 1_500 },
    ),
    status,
    currency: currency || null,
    priceAmountMinor,
    currentDetailsText: currentDetailsText || null,
    inclusions: textArray(payload.inclusions, "inclusions", 20, 200),
    cadence: optionalText(payload.cadence, "cadence", 300) || null,
    practiceExpectation:
      optionalText(payload.practiceExpectation, "practiceExpectation", 1_000) ||
      null,
    evaluationDescription:
      optionalText(
        payload.evaluationDescription,
        "evaluationDescription",
        1_000,
      ) || null,
    termsSummary: cleanText(
      payload.termsSummary ?? payload.terms,
      "terms",
      { required: true, max: 1_500 },
    ),
    externalActionType,
    externalActionLabel: cleanText(
      payload.externalActionLabel ?? defaultActionLabel(externalActionType),
      "externalActionLabel",
      { required: true, max: 120 },
    ),
    externalActionUrl,
    isDefault,
  };
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

function assertOnlyFields(
  payload: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unexpected = Object.keys(payload).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new RequestError(
      400,
      "unexpected_field",
      `Request contains unsupported field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`,
    );
  }
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") {
    throw new RequestError(400, "invalid_field", `${field} must be text.`);
  }
  return cleanText(value, field, { max });
}

function optionalMoney(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 10_000_000
  ) {
    throw new RequestError(
      400,
      "invalid_field",
      `${field} must be a whole number from 0 to 10000000.`,
    );
  }
  return value as number;
}

function optionalBoolean(value: unknown, field: string): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") {
    throw new RequestError(400, "invalid_field", `${field} must be true or false.`);
  }
  return value;
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
    cleanText(item, `${field}[${index}]`, {
      required: true,
      max: maxLength,
    }),
  );
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new RequestError(
      400,
      "invalid_field",
      `${field} must be one of: ${allowed.join(", ")}.`,
    );
  }
  return value as T[number];
}

function defaultActionLabel(action: (typeof ACTION_TYPES)[number]): string {
  if (action === "booking") return "Continue to booking";
  if (action === "purchase") return "Continue to purchase";
  if (action === "contact") return "Contact the coach";
  return "Continue to the coach's external page";
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
