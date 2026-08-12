import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { safeCoachAccent } from "@/lib/colors";
import { requirePageIdentity } from "@/lib/identity";
import { getProfileBrandingState } from "@/lib/media";
import { getOrCreateAccountForIdentity, getProfile } from "@/lib/repository";
import styles from "./app.module.css";
import { PrivateWorkspaceBrandImage } from "./PrivateWorkspaceBranding";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Coach workspace | Roadmap",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ProductLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const identity = await requirePageIdentity("/app");
  const account = await getOrCreateAccountForIdentity(identity);
  const [profile, branding] = await Promise.all([
    getProfile(account.id),
    getProfileBrandingState(account.id),
  ]);
  const coachName = profile?.displayName || identity.displayName;
  const businessName = profile?.businessName || coachName;
  const coachInitials = initials(coachName);
  const businessInitials = initials(businessName);
  const activeLogoId = activeBrandingAssetId(branding, "logo");
  const activeProfilePhotoId = activeBrandingAssetId(branding, "profile_photo");
  const privateMediaUrl = (mediaAssetId: string | null) =>
    mediaAssetId ? `/api/media/${encodeURIComponent(mediaAssetId)}` : null;
  const accent = safeCoachAccent(profile?.accentColor);

  return (
    <div className={styles.productShell} style={{ "--workspace-accent": accent } as CSSProperties}>
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <aside aria-label="Coach workspace" className={styles.sidebar}>
        <Link className={styles.wordmark} href="/app" aria-label={`${businessName} Roadmap home`}>
          <PrivateWorkspaceBrandImage fallback={businessInitials} src={privateMediaUrl(activeLogoId)} variant="logo" />
          <span className={styles.brandCopy}><strong>{businessName}</strong><small>Roadmap</small></span>
        </Link>
        <nav className={styles.primaryNav} aria-label="Primary coach navigation">
          <Link href="/app"><span aria-hidden="true">⌂</span>Home</Link>
          <Link href="/app/golfers"><span aria-hidden="true">◎</span>Players</Link>
          <Link href="/app/coaching/drills"><span aria-hidden="true">◇</span>Library</Link>
          <Link href="/app/settings"><span aria-hidden="true">○</span>Settings</Link>
        </nav>
        <div className={styles.sidebarNote}>
          <span>Make the coaching clear.</span>
          <p>Create the roadmap. Capture the lesson. Let Roadmap handle the structure.</p>
        </div>
        <div className={styles.accountBlock}>
          <PrivateWorkspaceBrandImage fallback={coachInitials} src={privateMediaUrl(activeProfilePhotoId)} variant="profile" />
          <div><strong>{coachName}</strong><span>{identity.email}</span></div>
          <form action="/auth/logout" method="post"><button type="submit">Sign out</button></form>
        </div>
      </aside>
      <div className={styles.mobileBar}>
        <Link className={styles.mobileBrand} href="/app">
          <PrivateWorkspaceBrandImage fallback={businessInitials} src={privateMediaUrl(activeLogoId)} variant="logo" />
          <span>{businessName}</span>
        </Link>
        <div className={styles.mobileAccount}>
          <PrivateWorkspaceBrandImage fallback={coachInitials} src={privateMediaUrl(activeProfilePhotoId)} variant="profile" />
          <form action="/auth/logout" method="post"><button type="submit">Sign out</button></form>
        </div>
      </div>
      <main className={styles.main} id="main-content">
        {identity.source === "development" ? <div className={styles.devBanner} role="status">Local product studio — synthetic data only.</div> : null}
        {children}
      </main>
      <nav className={styles.mobileNav} aria-label="Mobile coach navigation">
        <Link href="/app">Home</Link><Link href="/app/golfers">Players</Link><Link href="/app/coaching/drills">Library</Link><Link href="/app/settings">Settings</Link>
      </nav>
    </div>
  );
}

function initials(value: string): string {
  return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "R";
}

function activeBrandingAssetId(
  branding: Awaited<ReturnType<typeof getProfileBrandingState>>,
  role: "logo" | "profile_photo",
): string | null {
  const selectedId = role === "logo" ? branding.logoMediaAssetId : branding.profilePhotoMediaAssetId;
  return selectedId && branding.attachments.some((attachment) => attachment.role === role && attachment.mediaAssetId === selectedId) ? selectedId : null;
}
