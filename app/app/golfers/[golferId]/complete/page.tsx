import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GolferRecordAccessBlocked } from "@/components/consent/GolferRecordAccessBlocked";
import { golferRecordProcessingConsentCurrent } from "@/lib/consent-enforcement";
import { requirePageIdentity } from "@/lib/identity";
import {
  listRoadmapTemplates,
  type RoadmapTemplateContent,
} from "@/lib/rich-coaching";
import {
  getOrCreateAccountForIdentity,
  getStagedGolferWorkspace,
  listActivePackagesPage,
} from "@/lib/repository";
import styles from "../../../workspace.module.css";
import { AuthoringStepNav } from "../../AuthoringStepNav";
import { StagedCompletionForm } from "./StagedCompletionForm";

export const metadata: Metadata = {
  title: "Complete golfer roadmap | Roadmap",
};

export const dynamic = "force-dynamic";

export default async function CompleteStagedGolferPage({
  params,
}: {
  params: Promise<{ golferId: string }>;
}) {
  const { golferId } = await params;
  const returnTo = `/app/golfers/${encodeURIComponent(golferId)}/complete`;
  const identity = await requirePageIdentity(returnTo);
  const account = await getOrCreateAccountForIdentity(identity);
  if (!(await golferRecordProcessingConsentCurrent(account.id))) {
    return <GolferRecordAccessBlocked />;
  }
  const staged = await getStagedGolferWorkspace(account.id, golferId);
  if (!staged) notFound();
  if (staged.authoringState === "complete") {
    redirect(`/app/golfers/${encodeURIComponent(golferId)}`);
  }

  const resumable =
    staged.authoringState === "staged" &&
    staged.goal !== null &&
    staged.golfer.status === "active" &&
    staged.golfer.eligibilityStatus === "adult_confirmed" &&
    staged.plan.status === "draft" &&
    staged.plan.approvedRevision === null &&
    staged.plan.publishedRevision === null;
  const packagePage = await listActivePackagesPage(account.id, { limit: 100 });
  const packages = packagePage.items;
  const roadmapTemplates = await listRoadmapTemplates({
    accountId: account.id,
    limit: 100,
  });
  const compatibleRoadmapTemplates = roadmapTemplates.flatMap((template) => {
    const content = template.content as RoadmapTemplateContent;
    if (content.phases.length !== 3 && content.phases.length !== 4) return [];
    return [{
      id: template.id,
      title: template.title,
      description: template.description,
      isFavourite: template.isFavourite,
      origin: template.origin,
      content,
    }];
  });

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Resume staged roadmap</span>
          <h1>
            Finish {staged.golfer.preferredName || staged.golfer.displayName}&apos;s
            coach-authored draft.
          </h1>
          <p>
            The golfer identity, plan title, and primary goal are already saved. Add only
            real assessment and sequencing judgment; Roadmap has not filled gaps with
            placeholder coaching content.
          </p>
        </div>
        <Link className={styles.secondaryButton} href="/app/golfers">
          Back to golfers
        </Link>
      </header>

      <AuthoringStepNav
        current="assessment"
        completed={["goal"]}
        optional={["evidence", "package"]}
        links={{
          goal: "#saved-basics-heading",
          assessment: "#authoring-assessment",
          priority: "#authoring-priority",
          phases: "#authoring-phases",
          evidence: "#authoring-evidence",
          package: "#authoring-package",
          preview: "#authoring-preview",
        }}
      />

      <section className={styles.panel} aria-labelledby="saved-basics-heading">
        <div className={styles.panelHeader}>
          <h2 id="saved-basics-heading">Saved basics</h2>
          <span className={styles.status}>publication blocked</span>
        </div>
        <dl>
          <div>
            <dt>Plan</dt>
            <dd>{staged.plan.title}</dd>
          </div>
          <div>
            <dt>Primary goal</dt>
            <dd>{staged.goal?.desiredOutcome || "Goal record unavailable"}</dd>
          </div>
        </dl>
        <p className={styles.muted}>
          This staged record cannot be previewed, published, or shared until the assessment,
          priority, and three-or-four-phase roadmap are saved atomically below.
        </p>
      </section>

      {resumable ? (
        <>
          {packagePage.hasMore ? (
            <div className={styles.notice} role="note">
              <strong>Package selection is bounded.</strong>
              <span>
                Up to 100 active packages are available here, with your default first and
                then recent updates. Archive or update older package records before
                attaching one.
              </span>
            </div>
          ) : null}
          <StagedCompletionForm
            golferId={staged.golfer.id}
            golferName={staged.golfer.preferredName || staged.golfer.displayName}
            planTitle={staged.plan.title}
            goalStatement={staged.goal?.desiredOutcome || ""}
            planId={staged.plan.id}
            expectedRevision={staged.plan.revision}
            recoveryScope={account.id}
            packages={packages.map((coachingPackage) => ({
              id: coachingPackage.id,
              name: coachingPackage.name,
              fitDescription: coachingPackage.fitDescription,
            }))}
            templates={compatibleRoadmapTemplates}
          />
        </>
      ) : (
        <div className={styles.errorStatus} role="alert">
          <strong>This staged roadmap cannot be resumed safely.</strong>
          <span>
            Its ownership, adult eligibility, lifecycle, or partial-content state changed.
            No new coaching content was stored. Return to the golfer list and review the
            record before trying again.
          </span>
        </div>
      )}
    </div>
  );
}
