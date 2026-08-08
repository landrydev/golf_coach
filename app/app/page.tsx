import Link from "next/link";
import type { Metadata } from "next";
import { GolferRecordAccessBlocked } from "@/components/consent/GolferRecordAccessBlocked";
import { golferRecordProcessingConsentCurrent } from "@/lib/consent-enforcement";
import { requirePageIdentity } from "@/lib/identity";
import {
  getOrCreateAccountForIdentity,
  getWorkspaceSummary,
  listGolfers,
} from "@/lib/repository";
import { workspaceNextAction } from "@/lib/workspace-next-action";
import styles from "./workspace.module.css";

export const metadata: Metadata = {
  title: "Coach overview | Roadmap",
};

export const dynamic = "force-dynamic";

export default async function WorkspaceOverview() {
  const identity = await requirePageIdentity("/app");
  const firstName = identity.displayName.split(/\s+/)[0] || "Coach";
  const account = await getOrCreateAccountForIdentity(identity);
  if (!(await golferRecordProcessingConsentCurrent(account.id))) {
    return <GolferRecordAccessBlocked />;
  }
  const [summary, recentGolfers] = await Promise.all([
    getWorkspaceSummary(account.id),
    listGolfers(account.id, { limit: 5, includeArchived: false }),
  ]);
  const recent = recentGolfers
    .filter((golfer) => golfer.status !== "archived");

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Coach workspace</span>
          <h1>Welcome, {firstName}. Start with one golfer and one clear phase.</h1>
          <p>
            Your workspace keeps the coaching judgment yours and turns it into a private,
            understandable development story for the golfer.
          </p>
        </div>
        <Link className={styles.primaryButton} href="/app/golfers/new">
          Add a golfer
        </Link>
      </header>

      <section className={styles.metrics} aria-label="Workspace summary">
        <article className={styles.metric}>
          <span>Active golfers</span>
          <strong>{summary.activeGolfers}</strong>
          <small>{summary.activeGolfers ? "Current coaching records" : "No live records yet"}</small>
        </article>
        <article className={styles.metric}>
          <span>Published plans</span>
          <strong>{summary.publishedPlans}</strong>
          <small>Private by default</small>
        </article>
        <article className={styles.metric}>
          <span>Plans awaiting review</span>
          <strong>{summary.plansAwaitingReview}</strong>
          <small>{summary.plansAwaitingReview ? "Review before sharing" : "Nothing waiting"}</small>
        </article>
        <article className={styles.metric}>
          <span>Account</span>
          <strong>{summary.profileComplete ? "Ready" : "Setup"}</strong>
          <small>{summary.profileComplete ? `${summary.activePackages} active package${summary.activePackages === 1 ? "" : "s"}` : "Complete the steps below"}</small>
        </article>
      </section>

      <div className={styles.gridTwo}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Recent golfers</h2>
            <Link className={styles.textLink} href="/app/golfers">
              View all
            </Link>
          </div>
          {recent.length ? (
            <ul className={styles.list}>
              {recent.map((golfer) => (
                <li key={golfer.id}>
                  <div>
                    <strong>{golfer.preferredName || golfer.displayName}</strong>
                    <span>{golfer.plan?.title || "No plan yet"}</span>
                    <small>{workspaceNextAction(golfer).explanation}</small>
                    <small>Updated {new Date(golfer.updatedAt).toLocaleDateString("en-CA")}</small>
                  </div>
                  <div>
                    <span className={styles.status}>{golfer.plan?.status || golfer.status}</span>
                    <Link className={styles.textLink} href={`/app/golfers/${golfer.id}`}>
                      {workspaceNextAction(golfer).label}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.emptyState}>
              <h2>Your first roadmap starts with a real assessment.</h2>
              <p>
                Add only the details needed to explain the golfer’s goal, your starting
                assessment, what comes first, and why.
              </p>
              <Link className={styles.primaryButton} href="/app/golfers/new">
                Create the first golfer record
              </Link>
            </div>
          )}
        </section>

        <aside aria-labelledby="ready-to-share-title" className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 id="ready-to-share-title">Ready-to-share checklist</h2>
          </div>
          <ol className={styles.steps}>
            <li>
              <b>1</b>
              <div>
                <strong>Set your coach identity</strong>
                <span>Your name is enough; branding is optional.</span>
              </div>
            </li>
            <li>
              <b>2</b>
              <div>
                <strong>Add a current package</strong>
                <span>Roadmap links to your existing booking or purchase route.</span>
              </div>
            </li>
            <li>
              <b>3</b>
              <div>
                <strong>Build and review one plan</strong>
                <span>Nothing is shared until you approve the exact golfer view.</span>
              </div>
            </li>
          </ol>
          <div className={styles.actions} style={{ marginTop: "1.25rem" }}>
            <Link className={styles.secondaryButton} href="/app/settings">
              Set up coach identity
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
