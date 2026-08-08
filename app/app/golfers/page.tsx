import Link from "next/link";
import { requirePageIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity, listGolfers } from "@/lib/repository";
import styles from "../workspace.module.css";

export const dynamic = "force-dynamic";

export default async function GolfersPage() {
  const identity = await requirePageIdentity("/app/golfers");
  const account = await getOrCreateAccountForIdentity(identity);
  const golfers = await listGolfers(account.id);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Golfers</span>
          <h1>Every roadmap stays tied to one golfer and one coach account.</h1>
          <p>
            Open a private draft, review the exact golfer view, or begin another assessment.
          </p>
        </div>
        <Link className={styles.primaryButton} href="/app/golfers/new">
          Add a golfer
        </Link>
      </header>

      {golfers.length ? (
        <section className={styles.panel}>
          <ul className={styles.list}>
            {golfers.map((golfer) => (
              <li key={golfer.id}>
                <div>
                  <strong>{golfer.preferredName || golfer.displayName}</strong>
                  <span>{golfer.plan?.title || "No development plan"}</span>
                  <small>
                    {golfer.contactEmail || "No sharing email stored"} · Updated{" "}
                    {new Date(golfer.updatedAt).toLocaleDateString("en-CA")}
                  </small>
                </div>
                <div>
                  <span className={styles.status}>{golfer.plan?.status || golfer.status}</span>
                  <Link className={styles.textLink} href={`/app/golfers/${golfer.id}`}>
                    Review plan
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className={styles.emptyState}>
          <h2>No golfer records yet.</h2>
          <p>Start with an adult golfer, a real assessment, and the smallest useful set of details.</p>
          <Link className={styles.primaryButton} href="/app/golfers/new">
            Create the first golfer record
          </Link>
        </div>
      )}
    </div>
  );
}
