import Link from "next/link";
import type { Metadata } from "next";
import { GolferRecordAccessBlocked } from "@/components/consent/GolferRecordAccessBlocked";
import { getCommandCentre, type CommandCentreTask } from "@/lib/command-centre";
import { golferRecordProcessingConsentCurrent } from "@/lib/consent-enforcement";
import { requirePageIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
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
  const commandCentre = await getCommandCentre(account.id);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Coaching command centre</span>
          <h1>{commandCentre.setup.complete ? `Welcome back, ${firstName}.` : `Let’s get your first roadmap ready, ${firstName}.`}</h1>
          <p>
            Start with the few coaching records that need attention. Counts describe stored
            Roadmap state only; they do not imply a message, booking, sale, or golfer outcome.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryButton} href="/app/golfers/new">
            Add a golfer
          </Link>
          <Link className={styles.secondaryButton} href="/app/golfers">
            Find a golfer
          </Link>
        </div>
      </header>

      <section className={styles.quickActions} aria-labelledby="quick-actions-heading">
        <div>
          <span className={styles.eyebrow}>Quick actions</span>
          <h2 id="quick-actions-heading">Start the next coaching task.</h2>
        </div>
        <ul className={styles.quickActionGrid}>
          {commandCentre.quickActions.map((action) => (
            <li key={action.id}>
              <Link className={styles.quickAction} href={action.href}>
                <strong>{action.label}</strong>
                <small>{action.detail}</small>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.setupPanel} aria-labelledby="setup-heading">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Persisted setup</span>
            <h2 id="setup-heading">
              {commandCentre.setup.complete
                ? "Your first-value path is complete."
                : "Continue from the next incomplete step."}
            </h2>
          </div>
          <span className={styles.status}>
            {commandCentre.setup.steps.filter(
              (step) => step.id !== "package" && step.state === "complete",
            ).length} of 4
            required steps
          </span>
        </div>
        <ol className={styles.setupSteps}>
          {commandCentre.setup.steps.map((step) => (
            <li data-state={step.state} key={step.id}>
              <span aria-hidden="true">
                {step.state === "complete" ? "✓" : step.state === "optional" ? "+" : "•"}
              </span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </div>
              <Link href={step.href}>
                {step.state === "complete"
                  ? "Review"
                  : step.state === "optional"
                    ? "Add optionally"
                    : step.state === "current"
                      ? "Continue"
                      : "Open"}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="attention-heading">
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Needs attention</span>
            <h2 id="attention-heading">Bounded coaching work, not vanity metrics.</h2>
          </div>
          <Link className={styles.textLink} href="/app/golfers?sort=attention">
            Open filtered golfer list
          </Link>
        </div>
        <div className={styles.taskGrid}>
          <TaskCard
            title="Incomplete roadmaps"
            count={commandCentre.incompleteDrafts.count}
            empty="No staged roadmaps are waiting for completion."
            items={commandCentre.incompleteDrafts.items}
            viewAllHref="/app/golfers?status=setup_incomplete&sort=recent"
          />
          <TaskCard
            title="Coach reviews"
            count={commandCentre.reviews.count}
            empty="No roadmap or phase-review drafts need a decision."
            items={commandCentre.reviews.items}
            viewAllHref="/app/golfers?review=needs_review"
          />
          <TaskCard
            title="Active practice"
            count={commandCentre.activePractice.count}
            empty="No active practice direction is stored."
            items={commandCentre.activePractice.items}
            viewAllHref="/app/golfers?phase=active&sort=recent"
          />
          <TaskCard
            title="Latest responses & check-ins"
            count={commandCentre.recentResponses.count}
            empty="No golfer response or practice check-in has been recorded through a private link."
            items={commandCentre.recentResponses.items}
            viewAllHref="/app/golfers?status=published&sort=recent"
          />
        </div>
      </section>

      <section className={styles.signalPanel} aria-labelledby="failure-signals-heading">
        <div>
          <span className={styles.eyebrow}>Stored failure signals</span>
          <h2 id="failure-signals-heading">Media and launch-data work that needs review</h2>
          <p className={styles.muted}>
            This list reports only failed or quarantined media and failed or mapping-required
            launch-data imports that Roadmap can prove exist.
          </p>
        </div>
        {commandCentre.failureSignals.items.length ? (
          <ul className={styles.compactList}>
            {commandCentre.failureSignals.items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
                <Link href={item.href}>
                  {item.kind === "launch_import" ? "Open coaching workspace" : "Open media library"}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyInline}>
            No failed media or launch-data import needs attention.
          </p>
        )}
      </section>
    </div>
  );
}

function TaskCard({
  title,
  count,
  empty,
  items,
  viewAllHref,
}: {
  title: string;
  count: number;
  empty: string;
  items: CommandCentreTask[];
  viewAllHref: string;
}) {
  return (
    <article className={styles.taskCard}>
      <div className={styles.taskCardHeader}>
        <h3>{title}</h3>
        <span aria-label={`${count} stored ${title.toLocaleLowerCase("en-CA")}`}>{count}</span>
      </div>
      {items.length ? (
        <ul className={styles.taskList}>
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.golferName}</strong>
                <span>{item.title}</span>
                <small>
                  {item.detail}
                  {item.occurredAt ? ` · ${formatDate(item.occurredAt)}` : ""}
                </small>
              </div>
              <Link href={item.href}>Open task</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyInline}>{empty}</p>
      )}
      {count > items.length ? (
        <Link className={styles.textLink} href={viewAllHref}>
          View all {count}
        </Link>
      ) : null}
    </article>
  );
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
