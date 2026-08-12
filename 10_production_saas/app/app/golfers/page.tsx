import Link from "next/link";
import type { Metadata } from "next";
import { GolferRecordAccessBlocked } from "@/components/consent/GolferRecordAccessBlocked";
import {
  golferDirectoryHref,
  listGolferDirectory,
  parseGolferDirectoryQuery,
  type GolferDirectoryItem,
} from "@/lib/command-centre";
import { golferRecordProcessingConsentCurrent } from "@/lib/consent-enforcement";
import { requirePageIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { workspaceNextAction } from "@/lib/workspace-next-action";
import styles from "../workspace.module.css";

export const metadata: Metadata = {
  title: "Golfers | Roadmap",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function GolfersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const identity = await requirePageIdentity("/app/golfers");
  const account = await getOrCreateAccountForIdentity(identity);
  if (!(await golferRecordProcessingConsentCurrent(account.id))) {
    return <GolferRecordAccessBlocked />;
  }
  const query = parseGolferDirectoryQuery(await searchParams);
  const page = await listGolferDirectory(account.id, query);
  const filtersActive = Boolean(
    query.q || query.status !== "all" || query.phase !== "all" || query.review !== "all",
  );

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Golfer workspace</span>
          <h1>Find the golfer, then open the next coaching task.</h1>
          <p>
            Search and filters use only this coach account’s stored records. Roadmap remains a
            coaching workspace rather than a contact-management system.
          </p>
        </div>
        <Link className={styles.primaryButton} href="/app/golfers/new">
          Add a golfer
        </Link>
      </header>

      <form className={styles.filterPanel} method="get" action="/app/golfers" role="search">
        <div className={styles.searchField}>
          <label htmlFor="golfer-search">Search golfers</label>
          <input
            id="golfer-search"
            name="q"
            type="search"
            defaultValue={query.q}
            maxLength={80}
            placeholder="Name, email, or roadmap title"
          />
        </div>
        <label>
          Record status
          <select name="status" defaultValue={query.status}>
            <option value="all">All records</option>
            <option value="setup_incomplete">Setup incomplete</option>
            <option value="draft">Reviewable drafts</option>
            <option value="published">Published</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
            <option value="deletion_pending">Deletion review</option>
          </select>
        </label>
        <label>
          Current phase
          <select name="phase" defaultValue={query.phase}>
            <option value="all">All phase states</option>
            <option value="active">Active phase</option>
            <option value="paused">Paused phase</option>
            <option value="planned">Planned phase</option>
            <option value="complete">Completed phase</option>
            <option value="no_phase">No phase yet</option>
          </select>
        </label>
        <label>
          Review state
          <select name="review" defaultValue={query.review}>
            <option value="all">All review states</option>
            <option value="needs_review">Needs coach review</option>
            <option value="draft_review">Draft phase review</option>
            <option value="no_review">No draft phase review</option>
          </select>
        </label>
        <label>
          Sort
          <select name="sort" defaultValue={query.sort}>
            <option value="attention">Needs attention first</option>
            <option value="recent">Recently updated</option>
            <option value="name">Golfer name</option>
            <option value="phase">Phase order</option>
          </select>
        </label>
        <div className={styles.filterActions}>
          <button className={styles.primaryButton} type="submit">
            Apply
          </button>
          {filtersActive || query.sort !== "attention" ? (
            <Link className={styles.secondaryButton} href="/app/golfers">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <section className={styles.panel} aria-labelledby="golfer-results-heading">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Results</span>
            <h2 id="golfer-results-heading">
              {page.total === 1 ? "1 golfer record" : `${page.total} golfer records`}
            </h2>
          </div>
          {filtersActive ? <span className={styles.status}>Filtered</span> : null}
        </div>
        {page.items.length ? (
          <ul className={styles.directoryList}>
            {page.items.map((golfer) => (
              <GolferRow golfer={golfer} key={golfer.id} />
            ))}
          </ul>
        ) : (
          <div className={styles.emptyState}>
            <h2>{filtersActive ? "No golfers match these filters." : "No golfer records yet."}</h2>
            <p>
              {filtersActive
                ? "Clear one or more filters, or search with a shorter name or roadmap title."
                : "Start with an adult golfer, a real goal, and the smallest useful set of details."}
            </p>
            {filtersActive ? (
              <Link className={styles.secondaryButton} href="/app/golfers">
                Clear filters
              </Link>
            ) : (
              <Link className={styles.primaryButton} href="/app/golfers/new">
                Create the first golfer record
              </Link>
            )}
          </div>
        )}
      </section>

      {page.hasPrevious || page.hasMore ? (
        <nav className={styles.pagination} aria-label="Golfer record pages">
          <span>
            Page {query.page + 1} · showing up to {page.pageSize} records
          </span>
          <div className={styles.actions}>
            {page.hasPrevious ? (
              <Link
                className={styles.secondaryButton}
                rel="prev"
                href={golferDirectoryHref(query, { page: query.page - 1 })}
              >
                Previous records
              </Link>
            ) : null}
            {page.hasMore ? (
              <Link
                className={styles.secondaryButton}
                rel="next"
                href={golferDirectoryHref(query, { page: query.page + 1 })}
              >
                Next records
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function GolferRow({ golfer }: { golfer: GolferDirectoryItem }) {
  const action = workspaceNextAction(golfer);
  return (
    <li>
      <div className={styles.directoryIdentity}>
        <strong>{golfer.preferredName || golfer.displayName}</strong>
        <span>{golfer.plan?.title || "No development plan"}</span>
        <small>
          {golfer.contactEmail || "No sharing email stored"} · Updated {formatDate(golfer.updatedAt)}
        </small>
      </div>
      <div className={styles.directoryContext}>
        <span className={styles.status}>{recordStatus(golfer)}</span>
        <span>
          {golfer.phase
            ? `Phase ${golfer.phase.number}: ${golfer.phase.title} (${golfer.phase.status})`
            : "No current phase"}
        </span>
        {golfer.needsReview ? <strong>Coach review needed</strong> : null}
      </div>
      <div className={styles.directoryAction}>
        <small>{action.explanation}</small>
        <Link className={styles.textLink} href={action.href}>
          {action.label}
        </Link>
      </div>
    </li>
  );
}

function recordStatus(golfer: GolferDirectoryItem): string {
  if (golfer.status === "deletion_pending") return "deletion review";
  if (golfer.status === "archived" || golfer.plan?.status === "archived") return "archived";
  if (!golfer.plan || !golfer.plan.authoringComplete) return "setup incomplete";
  return golfer.plan?.status.replaceAll("_", " ") || golfer.status;
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
