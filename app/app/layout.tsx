import Link from "next/link";
import type { Metadata } from "next";
import { chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { requirePageIdentity } from "@/lib/identity";
import styles from "./app.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Coach workspace | Roadmap",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ProductLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const identity = await requirePageIdentity("/app");
  const initials = identity.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={styles.productShell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>
      <aside aria-label="Coach workspace account" className={styles.sidebar}>
        <Link className={styles.wordmark} href="/app" aria-label="Roadmap home">
          Roadmap
          <span>Coach workspace</span>
        </Link>
        <nav className={styles.primaryNav} aria-label="Coach workspace">
          <Link href="/app">Overview</Link>
          <Link href="/app/golfers">Golfers</Link>
          <Link href="/app/packages">Packages</Link>
          <Link href="/app/billing">Plan &amp; billing</Link>
          <Link href="/app/settings">Settings</Link>
        </nav>
        <div className={styles.accountBlock}>
          <span className={styles.avatar} aria-hidden="true">
            {initials || "R"}
          </span>
          <div>
            <strong>{identity.displayName}</strong>
            <span>{identity.email}</span>
          </div>
          <a href={chatGPTSignOutPath("/")}>Sign out</a>
        </div>
      </aside>
      <div className={styles.mobileBar}>
        <Link href="/app">Roadmap</Link>
        <div className={styles.mobileAccount}>
          <span aria-hidden="true">{initials || "R"}</span>
          <a href={chatGPTSignOutPath("/")}>Sign out</a>
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
        <Link href="/app/packages">Packages</Link>
        <Link href="/app/billing">Billing</Link>
        <Link href="/app/settings">Settings</Link>
      </nav>
    </div>
  );
}
