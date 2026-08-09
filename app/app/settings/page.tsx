import { requirePageIdentity } from "@/lib/identity";
import type { Metadata } from "next";
import { getOrCreateAccountForIdentity, getProfile } from "@/lib/repository";
import styles from "../workspace.module.css";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = {
  title: "Coach settings | Roadmap",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const identity = await requirePageIdentity("/app/settings");
  const account = await getOrCreateAccountForIdentity(identity);
  const profile = await getProfile(account.id);

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
