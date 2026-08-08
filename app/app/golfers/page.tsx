import Link from "next/link";
import { requirePageIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity, listGolfers } from "@/lib/repository";
import { workspaceNextAction } from "@/lib/workspace-next-action";
import styles from "../workspace.module.css";

export const dynamic = "force-dynamic";

export default async function GolfersPage() {
  const identity = await requirePageIdentity("/app/golfers");
  const account = await getOrCreateAccountForIdentity(identity);
  const golfers = await listGolfers(account.id);
  const currentGolfers = golfers.filter((golfer) => golfer.status !== "archived");
  const archivedGolfers = golfers.filter((golfer) => golfer.status === "archived");

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

      {currentGolfers.length ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Current golfer records</h2>
          </div>
          <ul className={styles.list}>
            {currentGolfers.map((golfer) => (
              <li key={golfer.id}>
                <div>
                  <strong>{golfer.preferredName || golfer.displayName}</strong>
                  <span>{golfer.plan?.title || "No development plan"}</span>
                  <small>
                    {golfer.contactEmail || "No sharing email stored"} · Updated{" "}
                    {new Date(golfer.updatedAt).toLocaleDateString("en-CA")}
                  </small>
                  <small>{workspaceNextAction(golfer).explanation}</small>
                </div>
                <div>
                  <span className={styles.status}>
                    {golfer.plan && !golfer.plan.authoringComplete
                      ? "setup incomplete"
                      : golfer.plan?.status || golfer.status}
                  </span>
                  <Link
                    className={styles.textLink}
                    href={
                      golfer.plan && !golfer.plan.authoringComplete
                        ? `/app/golfers/${golfer.id}/complete`
                        : `/app/golfers/${golfer.id}`
                    }
                  >
                    {workspaceNextAction(golfer).label}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : archivedGolfers.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>No golfer records yet.</h2>
          <p>Start with an adult golfer, a real assessment, and the smallest useful set of details.</p>
          <Link className={styles.primaryButton} href="/app/golfers/new">
            Create the first golfer record
          </Link>
        </div>
      ) : null}

      {archivedGolfers.length ? (
        <section className={styles.panel} aria-labelledby="archived-golfers-heading">
          <div className={styles.panelHeader}>
            <h2 id="archived-golfers-heading">Archived golfer records</h2>
          </div>
          <p className={styles.muted}>
            Archived records are separated from current work. Archiving is not a deletion claim.
          </p>
          <ul className={styles.list}>
            {archivedGolfers.map((golfer) => (
              <li key={golfer.id}>
                <div>
                  <strong>{golfer.preferredName || golfer.displayName}</strong>
                  <span>{golfer.plan?.title || "No development plan"}</span>
                  <small>{workspaceNextAction(golfer).explanation}</small>
                </div>
                <div>
                  <span className={styles.status}>archived</span>
                  <Link
                    className={styles.textLink}
                    href={
                      golfer.plan && !golfer.plan.authoringComplete
                        ? `/app/golfers/${golfer.id}/complete`
                        : `/app/golfers/${golfer.id}`
                    }
                  >
                    {workspaceNextAction(golfer).label}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
