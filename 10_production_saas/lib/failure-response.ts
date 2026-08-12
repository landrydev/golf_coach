export type FailureResponseDetails = {
  status: number;
  code: string;
  message: string;
  heading: string;
  title?: string;
  retryAfter?: string;
  links?: readonly {
    href: `/${string}`;
    label: string;
  }[];
};

const PROGRAMMATIC_PATHS = new Set(["/r/response", "/r/session"]);

/**
 * Return HTML only for a real, top-level browser navigation. An Accept header
 * by itself is not enough: fetch clients routinely send broad Accept values,
 * and RSC requests can target the same logical application path as a document.
 */
export function isTopLevelDocumentNavigation(
  request: Request,
  applicationPath: string,
): boolean {
  if (
    applicationPath === "/api" ||
    applicationPath.startsWith("/api/") ||
    applicationPath.startsWith("/_next/") ||
    applicationPath.startsWith("/__vinext/") ||
    PROGRAMMATIC_PATHS.has(applicationPath) ||
    isRscRequest(request)
  ) {
    return false;
  }

  return (
    request.headers.get("sec-fetch-dest")?.trim().toLowerCase() ===
      "document" &&
    request.headers.get("sec-fetch-mode")?.trim().toLowerCase() ===
      "navigate" &&
    acceptsHtmlDocument(request)
  );
}

export function failureResponseForRequest(
  request: Request,
  applicationPath: string,
  details: FailureResponseDetails,
): Response {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Accept, Sec-Fetch-Dest, Sec-Fetch-Mode",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });
  if (details.retryAfter) headers.set("Retry-After", details.retryAfter);

  if (!isTopLevelDocumentNavigation(request, applicationPath)) {
    return Response.json(
      { error: { code: details.code, message: details.message } },
      { status: details.status, headers },
    );
  }

  headers.set("Content-Type", "text/html; charset=utf-8");
  const links = (details.links ?? [])
    .map(
      ({ href, label }) =>
        `<p><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></p>`,
    )
    .join("");
  const title = details.title ?? details.heading;
  return new Response(
    `<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | Roadmap</title></head><body><main><h1>${escapeHtml(details.heading)}</h1><p>${escapeHtml(details.message)}</p>${links}</main></body></html>`,
    { status: details.status, headers },
  );
}

function acceptsHtmlDocument(request: Request): boolean {
  return (request.headers.get("accept") ?? "")
    .split(",")
    .some((range) => {
      const [rawType, ...parameters] = range.split(";");
      const mediaType = rawType.trim().toLowerCase();
      if (mediaType !== "text/html" && mediaType !== "application/xhtml+xml") {
        return false;
      }
      return !parameters.some((parameter) => {
        const [name, value] = parameter.split("=", 2).map((item) => item.trim());
        return name.toLowerCase() === "q" && Number(value) === 0;
      });
    });
}

function isRscRequest(request: Request): boolean {
  if (request.headers.get("rsc")?.trim() === "1") return true;
  if (request.headers.has("next-router-state-tree")) return true;
  if (
    (request.headers.get("accept") ?? "")
      .split(",")
      .some(
        (value) =>
          value.trim().split(";", 1)[0].toLowerCase() === "text/x-component",
      )
  ) {
    return true;
  }

  const url = new URL(request.url);
  if (url.searchParams.has("_rsc")) return true;
  let pathname = url.pathname;
  for (let pass = 0; pass < 8; pass += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return false;
    }
    if (decoded === pathname) break;
    pathname = decoded;
  }
  pathname = pathname.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
  return pathname.toLowerCase().endsWith(".rsc");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
