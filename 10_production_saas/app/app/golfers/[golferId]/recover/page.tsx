import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GolferRecordAccessBlocked } from "@/components/consent/GolferRecordAccessBlocked";
import { golferRecordProcessingConsentCurrent } from "@/lib/consent-enforcement";
import { getCoachGolferRecord } from "@/lib/golfer-lifecycle";
import { requirePageIdentity } from "@/lib/identity";
import {
  getOrCreateAccountForIdentity,
  getStagedGolferWorkspace,
  type GolferListItem,
} from "@/lib/repository";
import { workspaceNextAction } from "@/lib/workspace-next-action";
import styles from "../../../workspace.module.css";

export const metadata: Metadata = {
  title: "Golfer record recovery | Roadmap",
};

export const dynamic = "force-dynamic";

export default async function GolferRecordRecoveryPage({
  params,
}: {
  params: Promise<{ golferId: string }>;
}) {
  const { golferId } = await params;
  const encodedGolferId = encodeURIComponent(golferId);
  const returnTo = `/app/golfers/${encodedGolferId}/recover`;
  const identity = await requirePageIdentity(returnTo);
  const account = await getOrCreateAccountForIdentity(identity);
  if (!(await golferRecordProcessingConsentCurrent(account.id))) {
    return <GolferRecordAccessBlocked />;
  }

  const [golfer, staged] = await Promise.all([
    getCoachGolferRecord(account.id, golferId),
    getStagedGolferWorkspace(account.id, golferId),
  ]);
  if (!golfer) notFound();
  if (!isWorkspaceGolferStatus(golfer.status)) notFound();

  const action = workspaceNextAction({
    id: golfer.id,
    status: golfer.status,
    plan: staged
      ? {
          status: staged.plan.status,
          authoringComplete: staged.authoringState === "complete",
        }
      : null,
  });
  if (action.href !== returnTo) redirect(action.href);

  const archived = golfer.status === "archived";
  const golferName = golfer.preferredName || golfer.displayName;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Record-specific recovery</span>
          <h1>No roadmap is attached to {golferName}&apos;s retained record.</h1>
          <p>
            Roadmap found the tenant-owned golfer record, but no plan title, goal, assessment,
            or phase sequence exists to resume.
          </p>
        </div>
        <Link className={styles.secondaryButton} href="/app/golfers">
          Back to golfers
        </Link>
      </header>

      <div className={styles.notice} role="note">
        <strong>Roadmap will not invent the missing coaching content.</strong>
        <span>
          This page has not changed, restored, merged, or deleted the retained record.
          {archived
            ? " The archived record remains read-only."
            : " There is no safe in-place setup step to continue from this state."}
        </span>
      </div>

      <section className={styles.panel} aria-labelledby="recovery-options-heading">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Explicit next steps</span>
            <h2 id="recovery-options-heading">Choose based on what should happen next.</h2>
          </div>
        </div>
        <div className={styles.emptyState}>
          <h3>Create a distinct roadmap only for new coaching work.</h3>
          <p>
            This creates a separate golfer record. It does not repair, merge, or restore this
            retained record, so re-enter only details you have verified and expect both records
            to remain visible until a reviewed data action changes that.
          </p>
          <Link className={styles.primaryButton} href="/app/golfers/new">
            Create a distinct golfer roadmap
          </Link>
        </div>
        <div className={styles.emptyState}>
          <h3>Export the account record or open a deletion review.</h3>
          <p>
            The authenticated data-control surface shows stored request status and starts reviewed
            export or deletion actions. Opening it does not delete this golfer record.
          </p>
          <Link className={styles.secondaryButton} href="/app/settings/data">
            Open data controls
          </Link>
        </div>
      </section>
    </div>
  );
}

function isWorkspaceGolferStatus(
  value: string,
): value is GolferListItem["status"] {
  return ["active", "inactive", "archived", "deletion_pending", "deleted"].includes(
    value,
  );
}
