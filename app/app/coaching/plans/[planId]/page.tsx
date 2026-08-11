import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/lib/identity";
import { getCoachPlan } from "@/lib/plans";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { RichCoachingWorkspace } from "./RichCoachingWorkspace";
import {
  coachingWorkspaceHref,
  resolveCoachingWorkspaceLocation,
} from "@/lib/coaching-workspace-tab";
import styles from "../../coaching.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Coaching workspace | Roadmap",
};

export default async function CoachingPlanWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    practiceId?: string | string[];
    checkInId?: string | string[];
    lessonId?: string | string[];
    attachmentId?: string | string[];
    importId?: string | string[];
  }>;
}) {
  const { planId } = await params;
  const initialLocation = resolveCoachingWorkspaceLocation(await searchParams);
  const identity = await requirePageIdentity(
    coachingWorkspaceHref(planId, initialLocation),
  );
  const account = await getOrCreateAccountForIdentity(identity);
  const model = await getCoachPlan(account.id, planId);
  if (!model) notFound();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Rich coaching workspace</span>
          <h1>{model.golfer.displayName}</h1>
          <p>
            Manage reusable drills, lesson lifecycle, evidence, media, launch-monitor data,
            reviews, and milestones without leaving this golfer record.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.buttonSecondary} href="/app/golfers">
            Back to golfers
          </Link>
          <Link className={styles.buttonSecondary} href="/app/media">Media library</Link>
        </div>
      </header>
      <RichCoachingWorkspace
        planId={model.plan.id}
        initialRevision={model.plan.revision}
        phases={model.phases.map((phase) => ({
          id: phase.id,
          title: phase.title,
          status: phase.status,
        }))}
        initialTab={initialLocation.tab}
        initialFocus={initialLocation.focus}
      />
    </div>
  );
}
