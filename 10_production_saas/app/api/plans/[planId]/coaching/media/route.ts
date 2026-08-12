import { assertExactObjectKeys, RequestError } from "@/lib/http";
import {
  attachPlanMedia,
  listPlanMediaAttachments,
  withdrawPlanMediaAttachment,
  type AttachmentRole,
  type PlanMediaAttachmentTarget,
} from "@/lib/rich-coaching";
import {
  coachRequest,
  enumValue,
  exactJson,
  json,
  nonNegativeInteger,
  objectBody,
  optionalText,
  planMutationContext,
  requiredText,
  routeError,
} from "@/app/api/coaching/_shared";

const TARGET_KINDS = ["assessment", "lesson", "practice", "evidence", "phase_review"] as const;
const ROLES = ["primary", "supporting", "demo", "baseline", "current", "poster", "source"] as const;

export async function GET(request: Request, route: { params: Promise<{ planId: string }> }) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const { planId } = await route.params;
    const url = new URL(request.url);
    const targetKind = url.searchParams.get("targetKind");
    const targetId = url.searchParams.get("targetId");
    if (Boolean(targetKind) !== Boolean(targetId)) {
      throw new RequestError(400, "invalid_target_filter", "targetKind and targetId must be provided together.");
    }
    const target = targetKind && targetId
      ? { kind: enumValue(targetKind, "targetKind", TARGET_KINDS), id: targetId }
      : null;
    const attachments = await listPlanMediaAttachments({
      accountId: context.accountId,
      planId,
      target,
      includeWithdrawn: url.searchParams.get("includeWithdrawn") === "true",
    });
    return json({ attachments }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function POST(request: Request, route: { params: Promise<{ planId: string }> }) {
  const requestContext = await coachRequest(request, true);
  if (requestContext instanceof Response) return requestContext;
  try {
    const { planId } = await route.params;
    const body = await exactJson(request, [
      "expectedRevision", "mediaAssetId", "target", "role", "label", "coachContext", "sortOrder",
    ]);
    const target = mediaTarget(body.target);
    const result = await attachPlanMedia(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      {
        mediaAssetId: requiredText(body.mediaAssetId, "mediaAssetId", 200),
        target,
        role: enumValue(body.role, "role", ROLES) as AttachmentRole,
        label: optionalText(body.label, "label", 300),
        coachContext: optionalText(body.coachContext, "coachContext", 1_500),
        sortOrder: body.sortOrder === undefined ? 0 : nonNegativeInteger(body.sortOrder, "sortOrder"),
      },
    );
    return json({ attachment: { id: result.id }, plan: { revision: result.revision } }, requestContext.requestId, 201);
  } catch (error) {
    return routeError(error, requestContext.requestId);
  }
}

export async function DELETE(request: Request, route: { params: Promise<{ planId: string }> }) {
  const requestContext = await coachRequest(request, true);
  if (requestContext instanceof Response) return requestContext;
  try {
    const { planId } = await route.params;
    const body = await exactJson(request, ["expectedRevision", "attachmentId", "confirmation"]);
    if (body.confirmation !== "withdraw_media_attachment") {
      throw new RequestError(400, "confirmation_required", "Confirm media attachment withdrawal.");
    }
    const result = await withdrawPlanMediaAttachment(
      await planMutationContext(requestContext, planId, body.expectedRevision),
      { attachmentId: requiredText(body.attachmentId, "attachmentId", 200) },
    );
    return json({ withdrawn: true, plan: { revision: result.revision } }, requestContext.requestId);
  } catch (error) {
    return routeError(error, requestContext.requestId);
  }
}

function mediaTarget(value: unknown): PlanMediaAttachmentTarget {
  const target = objectBody(value, "target");
  assertExactObjectKeys(target, ["kind", "id"]);
  return {
    kind: enumValue(target.kind, "target.kind", TARGET_KINDS),
    id: requiredText(target.id, "target.id", 200),
  };
}
