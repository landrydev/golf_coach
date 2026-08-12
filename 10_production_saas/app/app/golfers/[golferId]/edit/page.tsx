import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GolferRecordAccessBlocked } from "@/components/consent/GolferRecordAccessBlocked";
import { golferRecordProcessingConsentCurrent } from "@/lib/consent-enforcement";
import { requirePageIdentity } from "@/lib/identity";
import { getCoachPlanForGolfer } from "@/lib/plans";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import styles from "../../../workspace.module.css";
import { AuthoringStepNav } from "../../AuthoringStepNav";
import { PlanEditorForm } from "./PlanEditorForm";

export const metadata: Metadata = {
  title: "Edit golfer roadmap | Roadmap",
};

export const dynamic = "force-dynamic";

export default async function EditGolferPlanPage({
  params,
}: {
  params: Promise<{ golferId: string }>;
}) {
  const { golferId } = await params;
  const planPath = `/app/golfers/${encodeURIComponent(golferId)}`;
  const identity = await requirePageIdentity(`${planPath}/edit`);
  const account = await getOrCreateAccountForIdentity(identity);
  if (!(await golferRecordProcessingConsentCurrent(account.id))) {
    return <GolferRecordAccessBlocked />;
  }
  const model = await getCoachPlanForGolfer(account.id, golferId);
  if (!model) notFound();

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Edit golfer plan</span>
          <h1>Revise {model.golfer.displayName}&apos;s coaching roadmap.</h1>
          <p>
            Edit the coach-authored core, then review the exact golfer experience before
            publishing the new revision.
          </p>
        </div>
        <Link className={styles.secondaryButton} href={planPath}>
          Back to plan
        </Link>
      </header>

      <AuthoringStepNav
        current="goal"
        completed={[]}
        optional={["evidence", "package"]}
        links={{
          goal: "#authoring-goal",
          assessment: "#authoring-assessment",
          priority: "#authoring-priority",
          phases: "#authoring-phases",
          evidence: "#authoring-evidence",
          package: "#authoring-package",
          preview: `${planPath}#hub-roadmap`,
        }}
      />

      <div className={styles.notice} role="note" aria-label="Share access warning">
        <strong>Saving ends current share access.</strong>
        <span>
          Every active private link for this plan is revoked immediately. The revised plan
          returns to draft and requires a fresh review and publish step before anyone can
          access it again. Saving does not send a message automatically.
        </span>
      </div>

      <div className={styles.notice} role="note" aria-label="Privacy boundary">
        <strong>Adults-only, private coaching record.</strong>
        <span>
          Keep only information needed for this adult golfer&apos;s coaching plan. Do not add
          medical information, payment details, or unrelated personal history. Use factual
          observations and keep evidence limits explicit.
        </span>
      </div>

      <PlanEditorForm
        golferId={golferId}
        model={model}
        recoveryScope={account.id}
      />
    </div>
  );
}
