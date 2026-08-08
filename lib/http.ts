const MAX_JSON_BYTES = 64 * 1024;

export class RequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly headers?: HeadersInit,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

export function assertSameOrigin(request: Request): void {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  // Every browser mutation in this application is initiated by a same-origin
  // form submission or fetch. Failing closed when Origin is absent prevents
  // non-browser clients and legacy form paths from bypassing the CSRF boundary
  // merely by omitting both Fetch Metadata and Origin. Stripe's signed webhook
  // is intentionally the only mutating route that does not call this helper.
  if (!origin || origin !== url.origin) {
    throw new RequestError(403, "cross_origin_request", "Request origin is not allowed.");
  }
  if (fetchSite && fetchSite !== "same-origin") {
    throw new RequestError(403, "cross_site_request", "Cross-site request is not allowed.");
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new RequestError(415, "unsupported_media_type", "Expected application/json.");
  }

  const contentEncoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    throw new RequestError(
      415,
      "unsupported_content_encoding",
      "Encoded request bodies are not supported.",
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    throw new RequestError(413, "payload_too_large", "Request body is too large.");
  }

  const body = await readLimitedUtf8(request, MAX_JSON_BYTES);

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new RequestError(400, "invalid_json", "Request body is not valid JSON.");
  }
}

async function readLimitedUtf8(request: Request, maximumBytes: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel("request_body_too_large").catch(() => undefined);
        throw new RequestError(413, "payload_too_large", "Request body is too large.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RequestError(400, "invalid_body_encoding", "Request body is not valid UTF-8.");
  }
}

export function cleanText(
  value: unknown,
  field: string,
  options: { required?: boolean; max?: number } = {},
): string {
  if (typeof value !== "string") {
    if (options.required) {
      throw new RequestError(400, "invalid_field", `${field} is required.`);
    }
    return "";
  }

  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (options.required && !normalized) {
    throw new RequestError(400, "invalid_field", `${field} is required.`);
  }
  const max = options.max ?? 2_000;
  if (normalized.length > max) {
    throw new RequestError(400, "invalid_field", `${field} must be ${max} characters or fewer.`);
  }
  return normalized;
}

export function cleanEmail(value: unknown, field = "email"): string {
  const email = cleanText(value, field, { required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RequestError(400, "invalid_field", `${field} must be a valid email address.`);
  }
  return email;
}

export function cleanExternalUrl(value: unknown, field: string): string {
  const text = cleanText(value, field, { max: 2_048 });
  if (!text) return "";

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new RequestError(400, "invalid_field", `${field} must be a valid URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new RequestError(400, "invalid_field", `${field} must use https.`);
  }
  if (parsed.username || parsed.password) {
    throw new RequestError(
      400,
      "invalid_field",
      `${field} must not include embedded credentials.`,
    );
  }
  if (!isPublicHostname(parsed.hostname)) {
    throw new RequestError(
      400,
      "invalid_field",
      `${field} must use a public internet hostname.`,
    );
  }
  return parsed.toString();
}

export function isPublicHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname.length > 253 || !hostname.includes(".")) return false;

  // Coach actions are browser destinations, not infrastructure endpoints. A
  // domain requirement avoids ambiguous IPv4/IPv6 parsing and blocks literal
  // loopback, private, link-local, and documentation addresses by construction.
  if (hostname.includes(":") || /^\d+(?:\.\d+){3}$/.test(hostname)) return false;

  const blockedSuffixes = [
    "localhost",
    "local",
    "internal",
    "home.arpa",
    "test",
    "invalid",
    "example",
  ];
  if (
    blockedSuffixes.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    )
  ) {
    return false;
  }

  return hostname
    .split(".")
    .every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    );
}

export function errorResponse(error: unknown): Response {
  if (error instanceof RequestError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: error.headers },
    );
  }

  console.error("Unhandled request error", {
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return Response.json(
    { error: { code: "internal_error", message: "The request could not be completed." } },
    { status: 500 },
  );
}
