import type { Metadata } from "next";
import { requirePageIdentity } from "@/lib/identity";
import { listRoadmapTemplates } from "@/lib/rich-coaching";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { RoadmapTemplateLibrary, type RoadmapTemplate } from "./RoadmapTemplateLibrary";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Roadmap templates | Roadmap" };

export default async function RoadmapTemplatesPage() {
  const identity = await requirePageIdentity("/app/coaching/roadmaps");
  const account = await getOrCreateAccountForIdentity(identity);
  const templates = await listRoadmapTemplates({ accountId: account.id, includeArchived: true, limit: 250 });
  return (
    <RoadmapTemplateLibrary
      initialTemplates={templates.map((template) => ({
        id: template.id,
        title: template.title,
        description: template.description,
        content: template.content as unknown as RoadmapTemplate["content"],
        origin: template.origin,
        status: template.status,
        isFavourite: template.isFavourite,
        version: template.version,
      }))}
    />
  );
}
