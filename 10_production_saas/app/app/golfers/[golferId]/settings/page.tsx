import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConsentPurposeControl } from "@/components/consent/ConsentPurposeControl";
import { GolferRecordAccessBlocked } from "@/components/consent/GolferRecordAccessBlocked";
import { golferRecordProcessingConsentCurrent } from "@/lib/consent-enforcement";
import { listConsentCurrentState } from "@/lib/consent-repository";
import { getCoachGolferRecord } from "@/lib/golfer-lifecycle";
import { requirePageIdentity } from "@/lib/identity";
import { getCoachPlanForGolfer } from "@/lib/plans";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import styles from "../../../workspace.module.css";
import { GolferSettingsForm } from "./GolferSettingsForm";

export const metadata: Metadata = {
  title: "Golfer settings | Roadmap",
};

export const dynamic = "force-dynamic";

export default async function GolferSettingsPage({
  params,
}: {
  params: Promise<{ golferId: string }>;
}) {
  const { golferId } = await params;
  const identity = await requirePageIdentity(`/app/golfers/${encodeURIComponent(golferId)}/settings`);
  const account = await getOrCreateAccountForIdentity(identity);
  if (!(await golferRecordProcessingConsentCurrent(account.id))) {
    return <GolferRecordAccessBlocked />;
  }
  const [golfer, plan, consentStates] = await Promise.all([
    getCoachGolferRecord(account.id, golferId),
    getCoachPlanForGolfer(account.id, golferId),
    listConsentCurrentState(account.id, { type: "golfer", golferId }),
  ]);
  if (!golfer || !plan) notFound();
  const roadmapSharingConsent = consentStates.find(
    (state) => state.purpose === "roadmap_sharing",
  )!;

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
      <ConsentPurposeControl
        heading="Private roadmap sharing"
        state={roadmapSharingConsent}
        subjectType="golfer"
        golferId={golferId}
      />
      <div style={{ height: "1rem" }} />
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
