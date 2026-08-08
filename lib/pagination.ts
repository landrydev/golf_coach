import { RequestError } from "./http.ts";

export const MAX_PAGE_OFFSET = 100_000;

export type OffsetPaginationMetadata = {
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
  truncated: boolean;
};

export function requestOffsetPage(
  request: Request,
  options: { defaultLimit?: number; maxLimit?: number; maxOffset?: number } = {},
): { limit: number; offset: number } {
  const url = new URL(request.url);
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit = options.maxLimit ?? 100;
  const maxOffset = options.maxOffset ?? MAX_PAGE_OFFSET;
  return {
    limit: integerParameter(
      url.searchParams.get("limit"),
      "limit",
      defaultLimit,
      1,
      maxLimit,
    ),
    offset: integerParameter(
      url.searchParams.get("offset"),
      "offset",
      0,
      0,
      maxOffset,
    ),
  };
}

export function offsetPaginationMetadata(page: {
  limit: number;
  offset: number;
  hasMore: boolean;
}): OffsetPaginationMetadata {
  const canAdvance = canAdvanceOffsetPage(page);
  return {
    limit: page.limit,
    offset: page.offset,
    hasMore: canAdvance,
    nextOffset: canAdvance ? page.offset + page.limit : null,
    truncated: page.hasMore && !canAdvance,
  };
}

export function canAdvanceOffsetPage(page: {
  limit: number;
  offset: number;
  hasMore: boolean;
}): boolean {
  return (
    page.hasMore &&
    Number.isSafeInteger(page.limit) &&
    page.limit > 0 &&
    Number.isSafeInteger(page.offset) &&
    page.offset >= 0 &&
    page.offset + page.limit <= MAX_PAGE_OFFSET
  );
}

function integerParameter(
  value: string | null,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) {
    throw invalidPagination(field, minimum, maximum);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw invalidPagination(field, minimum, maximum);
  }
  return parsed;
}

function invalidPagination(
  field: string,
  minimum: number,
  maximum: number,
): RequestError {
  return new RequestError(
    400,
    "invalid_pagination",
    `${field} must be a whole number from ${minimum} through ${maximum}.`,
  );
}
