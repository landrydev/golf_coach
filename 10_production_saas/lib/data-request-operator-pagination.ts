import { RequestError } from "@/lib/http";

export type DataRequestOperatorCursor = {
  createdAt: number;
  id: string;
};

export type DataRequestOperatorPageRequest = {
  cursor: DataRequestOperatorCursor | null;
  limit: number;
};

const DEFAULT_PAGE_LIMIT = 50;
const MAXIMUM_PAGE_LIMIT = 100;
const MAXIMUM_CURSOR_LENGTH = 512;
const CURSOR_VERSION = 1;
const SAFE_OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function parseDataRequestOperatorPage(
  request: Request,
  now = Date.now(),
): DataRequestOperatorPageRequest {
  const search = new URL(request.url).searchParams;
  for (const key of search.keys()) {
    if (key !== "cursor" && key !== "limit") throw invalidQuery();
  }
  if (search.getAll("cursor").length > 1 || search.getAll("limit").length > 1) {
    throw invalidQuery();
  }

  const rawLimit = search.get("limit");
  let limit = DEFAULT_PAGE_LIMIT;
  if (rawLimit !== null) {
    if (!/^[1-9][0-9]{0,2}$/.test(rawLimit)) throw invalidQuery();
    limit = Number(rawLimit);
    if (limit > MAXIMUM_PAGE_LIMIT || String(limit) !== rawLimit) {
      throw invalidQuery();
    }
  }

  const rawCursor = search.get("cursor");
  return {
    cursor: rawCursor === null ? null : decodeCursor(rawCursor, now),
    limit,
  };
}

export function encodeDataRequestOperatorCursor(
  cursor: DataRequestOperatorCursor,
): string {
  if (
    !Number.isSafeInteger(cursor.createdAt) ||
    cursor.createdAt <= 0 ||
    !SAFE_OPAQUE_ID.test(cursor.id)
  ) {
    throw new Error("Cannot encode an invalid data-request operator cursor.");
  }
  const value = base64UrlEncode(
    JSON.stringify([CURSOR_VERSION, cursor.createdAt, cursor.id]),
  );
  if (value.length > MAXIMUM_CURSOR_LENGTH) {
    throw new Error("The data-request operator cursor exceeds its safe bound.");
  }
  return value;
}

function decodeCursor(
  value: string,
  now: number,
): DataRequestOperatorCursor {
  if (
    value.length < 4 ||
    value.length > MAXIMUM_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    value.length % 4 === 1 ||
    !Number.isSafeInteger(now) ||
    now <= 0
  ) {
    throw invalidCursor();
  }

  let decoded: string;
  try {
    decoded = base64UrlDecode(value);
  } catch {
    throw invalidCursor();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(decoded);
  } catch {
    throw invalidCursor();
  }
  if (
    !Array.isArray(payload) ||
    payload.length !== 3 ||
    payload[0] !== CURSOR_VERSION ||
    !Number.isSafeInteger(payload[1]) ||
    (payload[1] as number) <= 0 ||
    (payload[1] as number) > now ||
    typeof payload[2] !== "string" ||
    !SAFE_OPAQUE_ID.test(payload[2])
  ) {
    throw invalidCursor();
  }

  const cursor = { createdAt: payload[1] as number, id: payload[2] };
  if (encodeDataRequestOperatorCursor(cursor) !== value) {
    throw invalidCursor();
  }
  return cursor;
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard.padEnd(
    standard.length + ((4 - (standard.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function invalidQuery(): RequestError {
  return new RequestError(
    400,
    "invalid_operator_queue_query",
    "The operator queue query is invalid.",
  );
}

function invalidCursor(): RequestError {
  return new RequestError(
    400,
    "invalid_operator_queue_cursor",
    "The operator queue cursor is invalid or expired.",
  );
}
