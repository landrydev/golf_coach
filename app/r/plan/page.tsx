import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PlanView } from "@/components/plan/PlanView";
import { resolveShareSession } from "@/lib/plans";
import styles from "../share.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Private coaching plan | Roadmap",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SharedPlanPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("roadmap_share")?.value;
  const resolved = token ? await resolveShareSession(token) : null;

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
