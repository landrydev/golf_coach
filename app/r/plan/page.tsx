import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { PlanView } from "@/components/plan/PlanView";
import { resolveShareToken } from "@/lib/plans";
import styles from "../share.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Private coaching plan | Roadmap",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SharedPlanPage() {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const token = cookieStore.get("roadmap_share")?.value;
  const resolved = token
    ? await resolveShareToken(token, {
        recordAccess: true,
        requestId: requestHeaders.get("cf-ray") ?? crypto.randomUUID(),
      })
    : null;

  if (!resolved) {
    return (
      <main className={styles.shell}>
        <div className={styles.wordmark}>Roadmap</div>
        <section className={styles.card}>
          <span>Plan unavailable</span>
          <h1>This private roadmap cannot be opened.</h1>
          <p>
            The session may be missing, expired, revoked, or replaced by a newer plan. Open
            the complete link from your coach or ask for a new one.
          </p>
          <a href="/r">Check another private link</a>
        </section>
      </main>
    );
  }

  return <PlanView model={resolved.model} />;
}
