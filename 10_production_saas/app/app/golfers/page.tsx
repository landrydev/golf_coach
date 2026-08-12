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
import styles from "../beta2.module.css";

export const metadata: Metadata = { title: "Players | Roadmap" };
export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;

export default async function PlayersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const identity = await requirePageIdentity("/app/golfers");
  const account = await getOrCreateAccountForIdentity(identity);
  if (!(await golferRecordProcessingConsentCurrent(account.id))) return <GolferRecordAccessBlocked />;
  const query = parseGolferDirectoryQuery(await searchParams);
  const page = await listGolferDirectory(account.id, query);
  const filtersActive = Boolean(query.q || query.status !== "all" || query.sort !== "attention");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>Players</span><h1>Every player, one clear journey.</h1><p>Open the person, see what matters now, and capture only the next meaningful coaching update.</p></div>
        <div className={styles.headerActions}><Link className={styles.primaryButton} href="/app/golfers/new">Create a roadmap</Link></div>
      </header>

      <form className={styles.filterBar} method="get" action="/app/golfers" role="search">
        <label>Search players<input name="q" type="search" defaultValue={query.q} maxLength={80} placeholder="Player or roadmap" /></label>
        <label>Show<select name="status" defaultValue={query.status}>
          <option value="all">All players</option>
          <option value="setup_incomplete">Needs a roadmap</option>
          <option value="published">Shared</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select></label>
        <label>Order<select name="sort" defaultValue={query.sort}>
          <option value="attention">Needs attention</option>
          <option value="recent">Recently updated</option>
          <option value="name">Player name</option>
          <option value="phase">Journey phase</option>
        </select></label>
        <div className={styles.headerActions}>
          <input type="hidden" name="phase" value={query.phase} />
          <input type="hidden" name="review" value={query.review} />
          <button className={styles.primaryButton} type="submit">Apply</button>
          {filtersActive ? <Link className={styles.secondaryButton} href="/app/golfers">Clear</Link> : null}
        </div>
      </form>

      <section aria-labelledby="players-heading">
        <div className={styles.sectionHeader}>
          <div><span className={styles.eyebrow}>Your roster</span><h2 id="players-heading">{page.total === 1 ? "1 player" : `${page.total} players`}</h2></div>
        </div>
        {page.items.length ? (
          <div className={styles.playerGrid}>{page.items.map((player) => <PlayerCard player={player} key={player.id} />)}</div>
        ) : (
          <div className={styles.empty}><h2>{filtersActive ? "No players match." : "Your first player starts here."}</h2><p>{filtersActive ? "Clear a filter or try a shorter search." : "Create a personal roadmap from the next assessment in one focused conversation."}</p><Link className={styles.primaryButton} href={filtersActive ? "/app/golfers" : "/app/golfers/new"}>{filtersActive ? "Clear filters" : "Create a roadmap"}</Link></div>
        )}
      </section>

      {page.hasPrevious || page.hasMore ? (
        <nav className={styles.sectionHeader} aria-label="Player pages">
          <span>{`Page ${query.page + 1}`}</span>
          <div className={styles.headerActions}>
            {page.hasPrevious ? <Link className={styles.secondaryButton} rel="prev" href={golferDirectoryHref(query, { page: query.page - 1 })}>Previous records</Link> : null}
            {page.hasMore ? <Link className={styles.secondaryButton} rel="next" href={golferDirectoryHref(query, { page: query.page + 1 })}>Next records</Link> : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function PlayerCard({ player }: { player: GolferDirectoryItem }) {
  const action = workspaceNextAction(player);
  const displayName = player.preferredName || player.displayName;
  const focus = player.phase ? `Phase ${player.phase.number}: ${player.phase.title}` : player.plan?.authoringComplete ? "Roadmap ready for the next coaching moment" : "Create the first roadmap";
  return (
    <article className={styles.playerCard}>
      <div className={styles.playerCardTop}>
        <div className={styles.playerIdentity}><span className={styles.avatar} aria-hidden="true">{initials(displayName)}</span><div><strong>{displayName}</strong><span>{player.plan?.title || "No roadmap yet"}</span></div></div>
        <span className={styles.pill}>{recordStatus(player)}</span>
      </div>
      <div className={styles.playerFocus}><span>What matters now</span><strong>{focus}</strong></div>
      <div className={styles.playerCardFooter}><small>{action.explanation}</small><Link className={styles.textButton} href={action.href}>{action.label} →</Link></div>
    </article>
  );
}

function recordStatus(player: GolferDirectoryItem): string {
  if (player.status === "deletion_pending") return "review";
  if (player.status === "archived" || player.plan?.status === "archived") return "archived";
  if (!player.plan || !player.plan.authoringComplete) return "roadmap needed";
  if (player.needsReview) return "review due";
  return player.plan.status.replaceAll("_", " ");
}
function initials(value: string): string { return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
