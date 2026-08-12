export const BROWSER_SHARE_EXCHANGE_MEDIA_TYPE =
  "application/vnd.roadmap.share-exchange+json";

export function browserUnavailableShareExchangeResponse(
  headers: Pick<Headers, "get">,
  requestId: string,
): Response | null {
  if (!acceptsBrowserUnavailableEnvelope(headers)) return null;

  return Response.json(
    { outcome: "unavailable" },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Accept",
        "X-Request-ID": requestId,
      },
    },
  );
}

export function isUnavailableShareExchangePayload(
  payload: unknown,
): payload is { outcome: "unavailable" } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  return (
    Object.keys(candidate).length === 1 &&
    candidate.outcome === "unavailable"
  );
}

function acceptsBrowserUnavailableEnvelope(
  headers: Pick<Headers, "get">,
): boolean {
  return (headers.get("accept") ?? "")
    .split(",")
    .some((range) => {
      const [rawMediaType, ...parameters] = range.split(";");
      if (
        rawMediaType.trim().toLowerCase() !==
        BROWSER_SHARE_EXCHANGE_MEDIA_TYPE
      ) {
        return false;
      }
      return !parameters.some((parameter) => {
        const [name, value] = parameter.split("=", 2).map((item) => item.trim());
        return name.toLowerCase() === "q" && Number(value) === 0;
      });
    });
}
