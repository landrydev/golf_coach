import Link from "next/link";
import type { Metadata } from "next";
import { GolferRecordAccessBlocked } from "@/components/consent/GolferRecordAccessBlocked";
import { golferRecordProcessingConsentCurrent } from "@/lib/consent-enforcement";
import { requirePageIdentity } from "@/lib/identity";
import {
  getOrCreateAccountForIdentity,
  listGolfersPage,
} from "@/lib/repository";
import { workspaceNextAction } from "@/lib/workspace-next-action";
import { canAdvanceOffsetPage, MAX_PAGE_OFFSET } from "@/lib/pagination";
import styles from "../workspace.module.css";

export const metadata: Metadata = {
  title: "Golfers | Roadmap",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function GolfersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const identity = await requirePageIdentity("/app/golfers");
  const account = await getOrCreateAccountForIdentity(identity);
  if (!(await golferRecordProcessingConsentCurrent(account.id))) {
    return <GolferRecordAccessBlocked />;
  }
  const pageNumber = safePageNumber((await searchParams).page);
  const page = await listGolfersPage(account.id, {
    limit: PAGE_SIZE,
    offset: pageNumber * PAGE_SIZE,
  });
  const canAdvance = canAdvanceOffsetPage(page);
  const golfers = page.items;
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

      {page.hasMore && !canAdvance ? (
        <div className={styles.notice} role="note">
          <strong>Record navigation reached its safe bound.</strong>
          <span>
            More golfer records exist, but this workspace does not generate an unusable
            next-page link. Archive or update older records before continuing this list.
          </span>
        </div>
      ) : null}

      {pageNumber > 0 || canAdvance ? (
        <nav className={styles.actions} aria-label="Golfer record pages">
          {pageNumber > 0 ? (
            <Link
              className={styles.secondaryButton}
              href={pageNumber === 1 ? "/app/golfers" : `/app/golfers?page=${pageNumber - 1}`}
            >
              Previous records
            </Link>
          ) : null}
          {canAdvance ? (
            <Link
              className={styles.secondaryButton}
              href={`/app/golfers?page=${pageNumber + 1}`}
            >
              Next records
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function safePageNumber(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    parsed <= Math.floor(MAX_PAGE_OFFSET / PAGE_SIZE)
    ? parsed
    : 0;
}
