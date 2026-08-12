const SAFE_ERROR_TYPES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "AbortError",
  "TimeoutError",
]);

/** Return a fixed diagnostic category without echoing a custom Error name. */
export function safeErrorType(error: unknown): string {
  if (error instanceof Error) {
    return SAFE_ERROR_TYPES.has(error.name) ? error.name : "Error";
  }
  return ["undefined", "boolean", "number", "string", "bigint", "symbol"]
    .includes(typeof error)
    ? typeof error
    : "unknown";
}
