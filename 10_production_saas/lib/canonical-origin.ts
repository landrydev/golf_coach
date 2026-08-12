export type ApplicationOriginResolution =
  | Readonly<{
      ok: true;
      origin: string;
      source: "configured" | "local_test_fallback";
    }>
  | Readonly<{
      ok: false;
      code: "application_origin_not_configured" | "application_origin_invalid";
    }>;

export type CanonicalRequestDecision =
  | Readonly<{ action: "allow"; origin: string }>
  | Readonly<{ action: "redirect"; location: string }>
  | Readonly<{
      action: "reject";
      status: 421 | 503;
      code:
        | "non_canonical_origin"
        | "application_origin_not_configured"
        | "application_origin_invalid";
    }>;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const RESERVED_TEST_SUFFIXES = [".test", ".example", ".invalid"];

export function resolveApplicationOrigin(
  configuredValue: string | undefined,
  requestUrl: URL,
): ApplicationOriginResolution {
  const configured = configuredValue?.trim();
  if (!configured) {
    if (isExplicitLocalOrTestOrigin(requestUrl)) {
      return {
        ok: true,
        origin: requestUrl.origin,
        source: "local_test_fallback",
      };
    }
    return { ok: false, code: "application_origin_not_configured" };
  }

  const origin = parseConfiguredApplicationOrigin(configured);
  return origin
    ? { ok: true, origin, source: "configured" }
    : { ok: false, code: "application_origin_invalid" };
}

export function evaluateCanonicalRequest(
  request: Request,
  configuredValue: string | undefined,
  normalizedApplicationPath: string,
): CanonicalRequestDecision {
  const requestUrl = new URL(request.url);
  const resolved = resolveApplicationOrigin(configuredValue, requestUrl);
  if (!resolved.ok) {
    return { action: "reject", status: 503, code: resolved.code };
  }

  const suppliedHostHeader = request.headers.get("host");
  const suppliedHost = suppliedHostHeader
    ? normalizeHostHeader(suppliedHostHeader, requestUrl.protocol)
    : null;
  const hostMatchesRequest = suppliedHost === requestUrl.host.toLowerCase();
  const safeLocalTestAdapterHost = suppliedHost
    ? isSafeLocalTestAdapterHost(suppliedHost, new URL(resolved.origin))
    : false;
  if (
    suppliedHostHeader &&
    (!suppliedHost || (!hostMatchesRequest && !safeLocalTestAdapterHost))
  ) {
    return {
      action: "reject",
      status: 421,
      code: "non_canonical_origin",
    };
  }

  if (requestUrl.origin === resolved.origin) {
    return { action: "allow", origin: resolved.origin };
  }

  if (canRedirectPublicRead(request.method, normalizedApplicationPath)) {
    return {
      action: "redirect",
      location: `${resolved.origin}${requestUrl.pathname}${requestUrl.search}`,
    };
  }

  return {
    action: "reject",
    status: 421,
    code: "non_canonical_origin",
  };
}

function parseConfiguredApplicationOrigin(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const localHttp =
    parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  if (
    (parsed.protocol !== "https:" && !localHttp) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.hostname.endsWith(".")
  ) {
    return null;
  }

  // Reject URL-parser normalization tricks in configuration. A configured
  // application URL is an exact origin, with only an optional trailing slash.
  if (value !== parsed.origin && value !== `${parsed.origin}/`) return null;
  return parsed.origin;
}

function isExplicitLocalOrTestOrigin(value: URL): boolean {
  if (value.protocol !== "http:" && value.protocol !== "https:") return false;
  const hostname = value.hostname.toLowerCase();
  return (
    LOOPBACK_HOSTS.has(hostname) ||
    RESERVED_TEST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

function isSafeLocalTestAdapterHost(suppliedHost: string, canonicalUrl: URL): boolean {
  if (!isExplicitLocalOrTestOrigin(canonicalUrl)) return false;
  return (
    suppliedHost === "localhost" ||
    suppliedHost.startsWith("localhost:") ||
    suppliedHost === "127.0.0.1" ||
    suppliedHost.startsWith("127.0.0.1:") ||
    suppliedHost === "[::1]" ||
    suppliedHost.startsWith("[::1]:")
  );
}

function normalizeHostHeader(value: string, protocol: string): string | null {
  const host = value.trim();
  if (!host || !/^[\x21-\x7e]+$/.test(host) || /[\\/@,?#]/.test(host)) return null;
  try {
    return new URL(`${protocol}//${host}`).host.toLowerCase();
  } catch {
    return null;
  }
}

function canRedirectPublicRead(method: string, applicationPath: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  return !["/api", "/app", "/r"].some(
    (prefix) => applicationPath === prefix || applicationPath.startsWith(`${prefix}/`),
  );
}
