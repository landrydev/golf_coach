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

export default async function ProductLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
    <div
      className={styles.productShell}
      style={{ "--workspace-accent": accent } as CSSProperties}
    >
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>
      <aside aria-label="Coach workspace account" className={styles.sidebar}>
        <Link className={styles.wordmark} href="/app" aria-label={`${businessName} Roadmap home`}>
          <PrivateWorkspaceBrandImage
            fallback={businessInitials}
            src={privateMediaUrl(activeLogoId)}
            variant="logo"
          />
          <span className={styles.brandCopy}>
            <strong>{businessName}</strong>
            <small>Roadmap coach workspace</small>
          </span>
        </Link>
        <nav className={styles.primaryNav} aria-label="Coach workspace">
          <Link href="/app">Overview</Link>
          <Link href="/app/golfers">Golfers</Link>
          <Link href="/app/coaching/drills">Drill library</Link>
          <Link href="/app/coaching/roadmaps">Roadmap templates</Link>
          <Link href="/app/media">Media</Link>
          <Link href="/app/packages">Packages</Link>
          <Link href="/app/billing">Plan &amp; billing</Link>
          <Link href="/app/settings">Settings</Link>
        </nav>
        <div className={styles.accountBlock}>
          <PrivateWorkspaceBrandImage
            fallback={coachInitials}
            src={privateMediaUrl(activeProfilePhotoId)}
            variant="profile"
          />
          <div>
            <strong>{coachName}</strong>
            <span>{identity.email}</span>
          </div>
          <form action="/auth/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <div className={styles.mobileBar}>
        <Link className={styles.mobileBrand} href="/app" aria-label={`${businessName} Roadmap home`}>
          <PrivateWorkspaceBrandImage
            fallback={businessInitials}
            src={privateMediaUrl(activeLogoId)}
            variant="logo"
          />
          <span>{businessName}</span>
        </Link>
        <div className={styles.mobileAccount}>
          <PrivateWorkspaceBrandImage
            fallback={coachInitials}
            src={privateMediaUrl(activeProfilePhotoId)}
            variant="profile"
          />
          <form action="/auth/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </div>
      </div>
      <main className={styles.main} id="main-content">
        {identity.source === "development" ? (
          <div className={styles.devBanner} role="status">
            Local development identity — production requires secure sign-in.
          </div>
        ) : null}
        {children}
      </main>
      <nav className={styles.mobileNav} aria-label="Mobile coach workspace">
        <Link href="/app">Overview</Link>
        <Link href="/app/golfers">Golfers</Link>
        <Link href="/app/coaching/drills">Drills</Link>
        <Link href="/app/media">Media</Link>
        <Link href="/app/settings">Settings</Link>
      </nav>
    </div>
  );
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "R";
}

function activeBrandingAssetId(
  branding: Awaited<ReturnType<typeof getProfileBrandingState>>,
  role: "logo" | "profile_photo",
): string | null {
  const selectedId = role === "logo"
    ? branding.logoMediaAssetId
    : branding.profilePhotoMediaAssetId;
  return selectedId && branding.attachments.some(
    (attachment) =>
      attachment.role === role && attachment.mediaAssetId === selectedId,
  )
    ? selectedId
    : null;
}
