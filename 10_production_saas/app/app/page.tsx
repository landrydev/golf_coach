import Link from "next/link";
import type { Metadata } from "next";
import { GolferRecordAccessBlocked } from "@/components/consent/GolferRecordAccessBlocked";
import { getCommandCentre, type CommandCentreTask } from "@/lib/command-centre";
import { golferRecordProcessingConsentCurrent } from "@/lib/consent-enforcement";
import { requirePageIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import styles from "./beta2.module.css";

export const metadata: Metadata = { title: "Home | Roadmap" };
export const dynamic = "force-dynamic";

export default async function WorkspaceOverview() {
  const identity = await requirePageIdentity("/app");
  const firstName = identity.displayName.split(/\s+/)[0] || "Coach";
  const account = await getOrCreateAccountForIdentity(identity);
  if (!(await golferRecordProcessingConsentCurrent(account.id))) return <GolferRecordAccessBlocked />;
  const centre = await getCommandCentre(account.id);
  const resume = primaryResumeTask(centre);
  const attention = uniqueTasks([
    ...centre.incompleteDrafts.items,
    ...centre.reviews.items,
    ...centre.activePractice.items,
    ...centre.recentResponses.items,
  ]).slice(0, 6);
  const progress = centre.recentResponses.items.slice(0, 3);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Your coaching desk</span>
          <h1>Welcome back, {firstName}.</h1>
          <p>Roadmap keeps the plan clear and the follow-up light. Start with the one player who deserves your attention now.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.primaryButton} href="/app/golfers/new">Create a roadmap</Link>
          <Link className={styles.secondaryButton} href="/app/golfers">Open players</Link>
        </div>
      </header>

      <section className={styles.resumeCard} aria-labelledby="continue-heading">
        <div>
          <span className={styles.eyebrow}>Continue where you left off</span>
          <h2 id="continue-heading">{resume.title}</h2>
          <p>{resume.detail}</p>
          <Link className={styles.primaryButton} href={resume.href}>{resume.action}</Link>
        </div>
        <div className={styles.resumeAside}>
          <span>Roadmap principle</span>
          <strong>One clear priority beats a complete database.</strong>
          <small>Capture only what changes the player’s understanding or next action.</small>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="attention-heading">
        <div className={styles.sectionHeader}>
          <div><span className={styles.eyebrow}>Players needing attention</span><h2 id="attention-heading">Keep the journey moving.</h2><p>These are coaching moments, not system alerts.</p></div>
          <Link className={styles.textButton} href="/app/golfers?sort=attention">See every player</Link>
        </div>
        {attention.length ? (
          <div className={styles.attentionGrid}>
            {attention.map((item) => <AttentionCard key={item.id} item={item} />)}
          </div>
        ) : (
          <div className={styles.empty}><h2>Nothing urgent.</h2><p>Your active players have no unfinished roadmap, review, practice, or response waiting right now.</p><Link className={styles.secondaryButton} href="/app/golfers">Browse players</Link></div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="progress-heading">
        <div className={styles.sectionHeader}>
          <div><span className={styles.eyebrow}>Recent progress</span><h2 id="progress-heading">Small signals worth noticing.</h2></div>
        </div>
        {progress.length ? (
          <div className={styles.recentStrip}>
            {progress.map((item) => (
              <article key={item.id}>
                <time>{item.occurredAt ? formatDate(item.occurredAt) : "Recently"}</time>
                <strong>{item.golferName}</strong>
                <p>{item.title}. {item.detail}</p>
                <Link href={item.href}>Open player</Link>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}><h2>Progress will appear here.</h2><p>Player responses and practice check-ins become a calm recent-progress feed.</p></div>
        )}
      </section>
    </div>
  );
}

function AttentionCard({ item }: { item: CommandCentreTask }) {
  return (
    <Link className={styles.attentionCard} href={item.href}>
      <span className={styles.avatar} aria-hidden="true">{initials(item.golferName)}</span>
      <div><strong>{item.golferName}</strong><span>{item.title}</span><small>{item.detail}</small></div>
      <span className={styles.arrow} aria-hidden="true">→</span>
    </Link>
  );
}

function primaryResumeTask(centre: Awaited<ReturnType<typeof getCommandCentre>>) {
  if (!centre.setup.complete) {
    const step = centre.setup.steps.find((candidate) => candidate.state === "current") ?? centre.setup.steps.find((candidate) => candidate.state === "upcoming");
    if (step) return { title: step.label, detail: step.detail, href: step.href, action: "Continue setup" };
  }
  const task = centre.incompleteDrafts.items[0] ?? centre.reviews.items[0] ?? centre.recentResponses.items[0] ?? centre.activePractice.items[0];
  if (task) return { title: task.golferName, detail: `${task.title}. ${task.detail}`, href: task.href, action: "Open player" };
  return { title: "Create the next player roadmap", detail: "Turn the next assessment into a personal three-phase story in one focused pass.", href: "/app/golfers/new", action: "Create a roadmap" };
}

function uniqueTasks(items: CommandCentreTask[]): CommandCentreTask[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.golferId)) return false;
    seen.add(item.golferId);
    return true;
  });
}

function initials(value: string): string { return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatDate(value: number): string { return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value)); }
