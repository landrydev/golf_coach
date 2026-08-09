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

type SharedPlanPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SharedPlanPage({ searchParams }: SharedPlanPageProps) {
  const expectedSessionContext = exactSessionContext(await searchParams);
  const cookieStore = await cookies();
  const token = cookieStore.get("roadmap_share")?.value;
  const resolved =
    token && expectedSessionContext
      ? await resolveShareSession(token, expectedSessionContext)
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

  return (
    <PlanView
      model={resolved.model}
      sessionContext={resolved.sessionContext}
    />
  );
}

function exactSessionContext(
  searchParams: Record<string, string | string[] | undefined>,
): string | null {
  const keys = Object.keys(searchParams);
  if (keys.length !== 1 || keys[0] !== "context") return null;
  const context = searchParams.context;
  return typeof context === "string" && /^[0-9a-f]{64}$/.test(context)
    ? context
    : null;
}
