import { requirePageIdentity } from "@/lib/identity";
import type { Metadata } from "next";
import { getOrCreateAccountForIdentity, getProfile } from "@/lib/repository";
import { getProfileBrandingState, listMediaAssets } from "@/lib/media";
import styles from "../workspace.module.css";
import { ProfileForm } from "./ProfileForm";
import { BrandingMediaForm } from "./BrandingMediaForm";

export const metadata: Metadata = {
  title: "Coach settings | Roadmap",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const identity = await requirePageIdentity("/app/settings");
  const account = await getOrCreateAccountForIdentity(identity);
  const [profile, mediaAssets, branding] = await Promise.all([
    getProfile(account.id),
    listMediaAssets(account.id),
    getProfileBrandingState(account.id),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Settings</span>
          <h1>Your name is enough to begin.</h1>
          <p>
            Keep branding restrained and recognizable. The golfer’s goal, your judgment,
            and the evidence hierarchy remain more important than decoration.
          </p>
        </div>
      </header>
      <ProfileForm
        key={profile?.updatedAt ?? "new-profile"}
        displayName={profile?.displayName || identity.displayName}
        businessName={profile?.businessName || undefined}
        professionalTitle={profile?.professionalTitle || undefined}
        philosophy={profile?.philosophy || undefined}
        contactEmail={profile?.contactEmail || identity.email}
        contactPhone={profile?.contactPhone || undefined}
        websiteUrl={profile?.websiteUrl || undefined}
        city={profile?.city || undefined}
        provinceOrTerritory={profile?.provinceOrTerritory || undefined}
        accentColor={profile?.accentColor || undefined}
        expectedUpdatedAt={profile?.updatedAt ?? null}
      />

      <BrandingMediaForm
        accentColor={profile?.accentColor || "#1b4f40"}
        businessName={profile?.businessName || profile?.displayName || identity.displayName}
        assets={mediaAssets
          .filter((asset) => asset.status === "ready" && asset.mediaKind === "image")
          .map((asset) => ({
            id: asset.id,
            label: asset.caption || asset.originalFilename || asset.altText || "Untitled image",
            altText: asset.altText || "",
            url: `/api/media/${encodeURIComponent(asset.id)}`,
          }))}
        current={{
          logo: branding.logoMediaAssetId
            ? {
                mediaAssetId: branding.logoMediaAssetId,
                attachmentId:
                  branding.attachments.find(
                    (item) => item.role === "logo" && item.mediaAssetId === branding.logoMediaAssetId,
                  )?.id ?? null,
              }
            : null,
          profilePhoto: branding.profilePhotoMediaAssetId
            ? {
                mediaAssetId: branding.profilePhotoMediaAssetId,
                attachmentId:
                  branding.attachments.find(
                    (item) =>
                      item.role === "profile_photo" &&
                      item.mediaAssetId === branding.profilePhotoMediaAssetId,
                  )?.id ?? null,
              }
            : null,
        }}
      />

      <section className={styles.formCard} style={{ marginTop: "1rem" }}>
        <div className={styles.cardHeader}>
          <h2>Packages and Roadmap billing</h2>
        </div>
        <p className={styles.muted}>
          Your golfer-facing coaching packages and your Roadmap SaaS subscription are
          separate. Roadmap never processes the golfer&apos;s coaching-package payment.
        </p>
        <div className={styles.actions} style={{ marginTop: "1rem" }}>
          <a className={styles.secondaryButton} href="/app/packages">
            Manage coaching packages
          </a>
          <a className={styles.primaryButton} href="/app/billing">
            Review Roadmap plan and billing
          </a>
        </div>
      </section>

      <section className={styles.formCard} style={{ marginTop: "1rem" }}>
        <div className={styles.cardHeader}>
          <h2>Privacy and account controls</h2>
        </div>
        <p className={styles.muted}>
          Authenticated JSON exports download directly. Deletion can only be submitted for
          identity and retention review; nothing is removed automatically.
        </p>
        <div className={styles.actions} style={{ marginTop: "1rem" }}>
          <a className={styles.secondaryButton} href="/app/settings/shares">
            Review or revoke active private access
          </a>
          <a className={styles.secondaryButton} href="/app/settings/data">
            Export data or request deletion review
          </a>
        </div>
      </section>
    </div>
  );
}
