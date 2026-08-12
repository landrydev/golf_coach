import type { Metadata } from "next";
import { requirePageIdentity } from "@/lib/identity";
import { listMediaAssets } from "@/lib/media";
import { listDrillTemplates } from "@/lib/rich-coaching";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { DrillLibrary, type DrillTemplate } from "./DrillLibrary";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Drill library | Roadmap",
};

export default async function DrillLibraryPage() {
  const identity = await requirePageIdentity("/app/coaching/drills");
  const account = await getOrCreateAccountForIdentity(identity);
  const [templates, mediaAssets] = await Promise.all([
    listDrillTemplates({
      accountId: account.id,
      includeArchived: true,
      limit: 250,
    }),
    listMediaAssets(account.id, { limit: 200 }),
  ]);

  return (
    <DrillLibrary
      initialTemplates={templates as DrillTemplate[]}
      initialMediaAssets={mediaAssets.map((asset) => ({
        id: asset.id,
        status: asset.status,
        mediaKind: asset.mediaKind,
        title: asset.caption || asset.originalFilename || asset.altText || "Untitled media",
      }))}
    />
  );
}
