import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { requireApiIdentity } from "@/lib/identity";
import {
  assertSameOrigin,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import { publishPlanAndCreateShare } from "@/lib/plans";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";

type PublishPayload = {
  intendedRecipientContext?: unknown;
  expiresInDays?: unknown;
  expectedRevision?: unknown;
  confirmation?: unknown;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  try {
    assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return authentication.response;
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const { planId } = await context.params;
    await enforceAbuseLimit(ABUSE_LIMITS.planPublishAccount, account.id);
    const payload = await readJson<PublishPayload>(request);
    if (payload.confirmation !== "reviewed_exact_golfer_view") {
      throw new RequestError(
        400,
        "review_confirmation_required",
        "Review and confirm the exact golfer view before publishing.",
      );
    }
    const intendedRecipientContext = cleanText(
      payload.intendedRecipientContext,
      "intendedRecipientContext",
      { required: true, max: 240 },
    );
    const expiresInDays = Number(payload.expiresInDays ?? 30);
    if (!Number.isSafeInteger(payload.expectedRevision) || (payload.expectedRevision as number) < 1) {
      throw new RequestError(
        400,
        "invalid_revision",
        "The reviewed plan revision is required before publishing.",
      );
    }
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    const result = await publishPlanAndCreateShare({
      accountId: account.id,
      planId,
      expectedRevision: payload.expectedRevision as number,
      intendedRecipientContext,
      expiresInDays,
      requestId,
    });
    const origin = shareOrigin(request);
    const shareUrl = `${origin.replace(/\/$/, "")}/r#token=${encodeURIComponent(result.rawToken)}`;

    return Response.json(
      {
        share: {
          id: result.shareId,
          url: shareUrl,
          expiresAt: result.expiresAt.toISOString(),
        },
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function shareOrigin(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  const candidate = configured || new URL(request.url).origin;
  let origin: URL;
  try {
    origin = new URL(candidate);
  } catch {
    throw new RequestError(
      503,
      "application_origin_invalid",
      "Private links are unavailable because the application origin is invalid.",
    );
  }

  const localDevelopment =
    process.env.NODE_ENV !== "production" &&
    origin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    (!configured && process.env.NODE_ENV === "production") ||
    (origin.protocol !== "https:" && !localDevelopment) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    !["", "/"].includes(origin.pathname)
  ) {
    throw new RequestError(
      503,
      "application_origin_invalid",
      "Private links are unavailable because the application origin is invalid.",
    );
  }

  return origin.origin;
}
