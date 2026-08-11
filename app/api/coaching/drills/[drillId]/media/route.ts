import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contentMediaAttachments,
  drillTemplates,
  mediaAssetDetails,
  mediaAssets,
} from "@/db/schema";
import { RequestError } from "@/lib/http";
import {
  attachAccountMedia,
  withdrawAccountMediaAttachment,
} from "@/lib/rich-coaching";
import {
  coachRequest,
  enumValue,
  exactJson,
  json,
  nonNegativeInteger,
  optionalText,
  requiredText,
  routeError,
} from "../../../_shared";

const DRILL_MEDIA_ROLES = ["primary", "supporting", "demo", "poster", "source"] as const;

export async function GET(
  request: Request,
  route: { params: Promise<{ drillId: string }> },
) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const { drillId: rawDrillId } = await route.params;
    const drillId = requiredText(rawDrillId, "drillId", 200);
    await requireOwnedDrill(context.accountId, drillId);
    const rows = await getDb()
      .select({ attachment: contentMediaAttachments, asset: mediaAssets, details: mediaAssetDetails })
      .from(contentMediaAttachments)
      .innerJoin(
        mediaAssets,
        and(
          eq(mediaAssets.accountId, contentMediaAttachments.accountId),
          eq(mediaAssets.id, contentMediaAttachments.mediaAssetId),
        ),
      )
      .leftJoin(
        mediaAssetDetails,
        and(
          eq(mediaAssetDetails.accountId, mediaAssets.accountId),
          eq(mediaAssetDetails.mediaAssetId, mediaAssets.id),
        ),
      )
      .where(
        and(
          eq(contentMediaAttachments.accountId, context.accountId),
          eq(contentMediaAttachments.drillTemplateId, drillId),
          eq(contentMediaAttachments.targetType, "drill"),
          eq(contentMediaAttachments.status, "active"),
        ),
      )
      .orderBy(asc(contentMediaAttachments.sortOrder), asc(contentMediaAttachments.createdAt));
    return json({
      attachments: rows.map(({ attachment, asset, details }) => ({
        attachment: {
          id: attachment.id,
          role: attachment.attachmentRole,
          label: attachment.label,
          coachContext: attachment.coachContext,
          sortOrder: attachment.sortOrder,
          status: attachment.status,
        },
        asset: {
          id: asset.id,
          status: asset.status,
          mediaKind: asset.mediaKind,
          mimeType: asset.mimeType,
          altText: asset.altText,
          caption: asset.caption,
          transcript: asset.transcript,
          durationMs: asset.durationMs,
          viewLabel: details?.viewLabel ?? null,
        },
      })),
    }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function POST(
  request: Request,
  route: { params: Promise<{ drillId: string }> },
) {
  const context = await coachRequest(request, true);
  if (context instanceof Response) return context;
  try {
    const { drillId: rawDrillId } = await route.params;
    const drillId = requiredText(rawDrillId, "drillId", 200);
    const body = await exactJson(request, [
      "mediaAssetId", "role", "label", "coachContext", "sortOrder",
    ]);
    const result = await attachAccountMedia({
      accountId: context.accountId,
      mediaAssetId: requiredText(body.mediaAssetId, "mediaAssetId", 200),
      target: { kind: "drill", id: drillId },
      role: enumValue(body.role, "role", DRILL_MEDIA_ROLES),
      label: optionalText(body.label, "label", 300),
      coachContext: optionalText(body.coachContext, "coachContext", 1_500),
      sortOrder: nonNegativeInteger(body.sortOrder, "sortOrder"),
      requestId: context.requestId,
    });
    return json({ attachment: { id: result.id } }, context.requestId, 201);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function DELETE(
  request: Request,
  route: { params: Promise<{ drillId: string }> },
) {
  const context = await coachRequest(request, true);
  if (context instanceof Response) return context;
  try {
    const { drillId: rawDrillId } = await route.params;
    const drillId = requiredText(rawDrillId, "drillId", 200);
    const body = await exactJson(request, ["attachmentId", "confirmation"]);
    if (body.confirmation !== "withdraw_drill_media") {
      throw new RequestError(400, "confirmation_required", "Confirm drill media withdrawal.");
    }
    const attachmentId = requiredText(body.attachmentId, "attachmentId", 200);
    const [owned] = await getDb()
      .select({ id: contentMediaAttachments.id })
      .from(contentMediaAttachments)
      .where(
        and(
          eq(contentMediaAttachments.accountId, context.accountId),
          eq(contentMediaAttachments.id, attachmentId),
          eq(contentMediaAttachments.drillTemplateId, drillId),
          eq(contentMediaAttachments.targetType, "drill"),
          eq(contentMediaAttachments.status, "active"),
        ),
      )
      .limit(1);
    if (!owned) throw new RequestError(404, "media_attachment_not_found", "Active drill media attachment not found.");
    await withdrawAccountMediaAttachment({
      accountId: context.accountId,
      attachmentId,
      requestId: context.requestId,
    });
    return json({ withdrawn: true, attachmentId }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

async function requireOwnedDrill(accountId: string, drillId: string) {
  const [drill] = await getDb()
    .select({ id: drillTemplates.id })
    .from(drillTemplates)
    .where(and(eq(drillTemplates.accountId, accountId), eq(drillTemplates.id, drillId)))
    .limit(1);
  if (!drill) throw new RequestError(404, "drill_template_not_found", "Drill template not found.");
}
