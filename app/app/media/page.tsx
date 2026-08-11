import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import { requirePageIdentity } from "@/lib/identity";
import { listMediaAssets } from "@/lib/media";
import { readMediaUploadPolicy } from "@/lib/media-policy";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { MediaLibrary } from "./MediaLibrary";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Media library | Roadmap",
};

export default async function MediaLibraryPage() {
  const identity = await requirePageIdentity("/app/media");
  const account = await getOrCreateAccountForIdentity(identity);
  const [assets, policy] = await Promise.all([
    listMediaAssets(account.id),
    Promise.resolve(readMediaUploadPolicy(env.MEDIA_UPLOAD_POLICY_JSON)),
  ]);

  return (
    <MediaLibrary
      initialAssets={assets}
      configuration={
        policy
          ? {
              ready: true,
              maxBytes: policy.maxBytes,
              maxVideoDurationMs: policy.maxVideoDurationMs,
              allowedMimeTypes: policy.allowedMimeTypes,
            }
          : { ready: false }
      }
    />
  );
}
