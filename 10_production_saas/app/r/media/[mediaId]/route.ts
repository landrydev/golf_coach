import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { configuredRoadmapAccessRequirements } from "@/lib/consent-enforcement";
import {
  configuredConsentGrantRequirement,
  parseConsentPolicyRegistry,
} from "@/lib/consent-repository";
import {
  loadSharedMediaObject,
} from "@/lib/media";
import { readMediaUploadPolicy } from "@/lib/media-policy";
import { resolveShareSession } from "@/lib/plans";

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  return readSharedMedia(request, context, false);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  return readSharedMedia(request, context, true);
}

async function readSharedMedia(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
  head: boolean,
) {
  const unavailable = () =>
    new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  try {
    const url = new URL(request.url);
    const contextValues = url.searchParams.getAll("context");
    if (
      [...url.searchParams.keys()].some((key) => key !== "context") ||
      contextValues.length !== 1 ||
      !/^[0-9a-f]{64}$/.test(contextValues[0] ?? "")
    ) {
      return unavailable();
    }
    const token = (await cookies()).get("roadmap_share")?.value;
    const resolved = token
      ? await resolveShareSession(token, contextValues[0])
      : null;
    if (!resolved) return unavailable();
    const policy = readMediaUploadPolicy(env.MEDIA_UPLOAD_POLICY_JSON);
    if (!policy) return unavailable();
    const registry = parseConsentPolicyRegistry();
    const requirements = [
      ...configuredRoadmapAccessRequirements(resolved.golferId, registry),
      ...(policy.accountMediaConsentRequired
        ? [
            configuredConsentGrantRequirement(
              { type: "account", golferId: null },
              "media_use",
              registry,
            ),
          ]
        : []),
      ...(policy.golferMediaConsentRequired
        ? [
            configuredConsentGrantRequirement(
              { type: "golfer", golferId: resolved.golferId },
              "media_use",
              registry,
            ),
          ]
        : []),
    ];
    const { mediaId } = await context.params;
    const capability = {
      accountId: resolved.accountId,
      golferId: resolved.golferId,
      planId: resolved.planId,
      planRevision: resolved.planRevision,
      shareId: resolved.shareId,
      linkTokenHash: resolved.linkTokenHash,
      sessionId: resolved.sessionId,
      sessionTokenHash: resolved.sessionTokenHash,
      requirements,
    };
    const full = await loadSharedMediaObject(capability, mediaId, undefined);
    if (!full) return unavailable();
    const requestedRange = request.headers.get("range");
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
      ? await loadSharedMediaObject(capability, mediaId, {
          offset: range.start,
          length: range.end - range.start + 1,
        })
      : full;
    if (!loaded) return unavailable();
    const length = range ? range.end - range.start + 1 : loaded.object.size;
    return new Response(head ? null : loaded.object.body, {
      status: range ? 206 : 200,
      headers: mediaHeaders(loaded.asset.mimeType, length, {
        ...(range
          ? { "Content-Range": `bytes ${range.start}-${range.end}/${full.object.size}` }
          : {}),
      }),
    });
  } catch {
    return unavailable();
  }
}

function parseRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size < 1) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0
      ? { start: Math.max(0, size - suffix), end: size - 1 }
      : null;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start < size &&
    end >= start
    ? { start, end: Math.min(end, size - 1) }
    : null;
}

function mediaHeaders(
  contentType: string,
  contentLength: number,
  extra: Record<string, string> = {},
) {
  return {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": "inline",
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
