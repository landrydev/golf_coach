import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { requireApiIdentity } from "@/lib/identity";
import { assertSameOrigin, errorResponse, RequestError } from "@/lib/http";
import { deleteUnattachedMediaAsset, loadMediaObject } from "@/lib/media";
import { requestCorrelationId } from "@/lib/request-correlation";

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  return readMedia(request, context, false);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  return readMedia(request, context, true);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  const requestId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return authentication.response;
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const { mediaId } = await context.params;
    await deleteUnattachedMediaAsset({ accountId: account.id, mediaAssetId: mediaId, requestId });
    return new Response(null, { status: 204, headers: { "X-Request-ID": requestId } });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("X-Request-ID", requestId);
    return response;
  }
}

async function readMedia(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
  head: boolean,
) {
  try {
    const authentication = await requireApiIdentity();
    if (authentication.response) return authentication.response;
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const { mediaId } = await context.params;
    const requestedRange = request.headers.get("range");
    const full = await loadMediaObject(account.id, mediaId, undefined);
    if (!full) throw new RequestError(404, "media_not_found", "Media was not found.");
    const range = requestedRange ? parseRange(requestedRange, full.object.size) : null;
    if (requestedRange && !range) {
      return new Response(null, {
        status: 416,
        headers: mediaHeaders(full.asset.mimeType, full.object.size, {
          "Content-Range": `bytes */${full.object.size}`,
        }),
      });
    }
    const loaded = range
      ? await loadMediaObject(account.id, mediaId, {
          offset: range.start,
          length: range.end - range.start + 1,
        })
      : full;
    if (!loaded) throw new RequestError(404, "media_not_found", "Media was not found.");
    const length = range ? range.end - range.start + 1 : loaded.object.size;
    const headers = mediaHeaders(loaded.asset.mimeType, length, {
      ...(range
        ? { "Content-Range": `bytes ${range.start}-${range.end}/${full.object.size}` }
        : {}),
    });
    return new Response(head ? null : loaded.object.body, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function parseRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size < 1) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

function mediaHeaders(
  contentType: string,
  contentLength: number,
  extra: Record<string, string> = {},
) {
  return {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": contentType === "text/csv" ? "attachment" : "inline",
    "Content-Length": String(contentLength),
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    ...extra,
  };
}
