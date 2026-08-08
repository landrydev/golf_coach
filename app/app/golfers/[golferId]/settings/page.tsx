import Link from "next/link";
import { notFound } from "next/navigation";
import { getCoachGolferRecord } from "@/lib/golfer-lifecycle";
import { requirePageIdentity } from "@/lib/identity";
import { getCoachPlanForGolfer } from "@/lib/plans";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import styles from "../../../workspace.module.css";
import { GolferSettingsForm } from "./GolferSettingsForm";

export const dynamic = "force-dynamic";

export default async function GolferSettingsPage({
  params,
}: {
  params: Promise<{ golferId: string }>;
}) {
  const { golferId } = await params;
  const identity = await requirePageIdentity(`/app/golfers/${encodeURIComponent(golferId)}/settings`);
  const account = await getOrCreateAccountForIdentity(identity);
  const [golfer, plan] = await Promise.all([
    getCoachGolferRecord(account.id, golferId),
    getCoachPlanForGolfer(account.id, golferId),
  ]);
  if (!golfer || !plan) notFound();

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Golfer settings</span>
          <h1>Correct or archive this private golfer record.</h1>
          <p>Only the signed-in instructor can change these details.</p>
        </div>
        <Link className={styles.secondaryButton} href={`/app/golfers/${encodeURIComponent(golferId)}`}>
          Back to plan
        </Link>
      </header>
      <GolferSettingsForm
        golferId={golfer.id}
        planId={plan.plan.id}
        planRevision={plan.plan.revision}
        displayName={golfer.displayName}
        preferredName={golfer.preferredName}
        contactEmail={golfer.contactEmail}
        status={golfer.status}
      />
    </div>
  );
}
