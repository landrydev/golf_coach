import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConsentPurposeControl } from "@/components/consent/ConsentPurposeControl";
import { StagedCompletionDraftResolution } from "@/components/forms/StagedCompletionDraftResolution";
import { PlanView } from "@/components/plan/PlanView";
import { listConsentCurrentState } from "@/lib/consent-repository";
import { requirePageIdentity } from "@/lib/identity";
import {
  getCoachPlanForGolfer,
  getPlanSharingState,
  listPlanResponses,
  type GolferResponseType,
} from "@/lib/plans";
import { publicationBlockers } from "@/lib/publication-readiness";
import {
  getOrCreateAccountForIdentity,
  getStagedGolferWorkspace,
  type StagedGolferWorkspaceView,
} from "@/lib/repository";
import { coachingWorkspaceHref } from "@/lib/coaching-workspace-tab";
import styles from "../../workspace.module.css";
import { GolferHubNav } from "./GolferHubNav";
import { LivingPlanForms } from "./LivingPlanForms";
import { PublishControls } from "./PublishControls";

export const metadata: Metadata = {
  title: "Golfer plan | Roadmap",
};

export const dynamic = "force-dynamic";

export default async function GolferPlanPage({
  params,
}: {
  params: Promise<{ golferId: string }>;
}) {
  const { golferId } = await params;
  const identity = await requirePageIdentity(`/app/golfers/${encodeURIComponent(golferId)}`);
  const account = await getOrCreateAccountForIdentity(identity);
  const accountConsentStates = await listConsentCurrentState(account.id, {
    type: "account",
    golferId: null,
  });
  const golferRecordConsent = accountConsentStates.find(
    (state) => state.purpose === "golfer_record",
  );
  if (!golferRecordConsent?.effectiveGranted) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <h1>Golfer records are unavailable.</h1>
          <p>
            A current configured golfer-record authorization is required before ordinary
            instructor access can resume.
          </p>
          <Link className={styles.primaryButton} href="/app/settings/data">
            Open data controls
          </Link>
        </div>
      </div>
    );
  }
  const model = await getCoachPlanForGolfer(account.id, golferId);
  if (!model) {
    const staged = await getStagedGolferWorkspace(account.id, golferId);
    if (
      staged &&
      (staged.golfer.status === "archived" || staged.plan.status === "archived")
    ) {
      return <ArchivedIncompleteRoadmap staged={staged} />;
    }
    notFound();
  }
  const [sharingState, responses, golferConsentStates] = await Promise.all([
    getPlanSharingState(account.id, model.plan.id),
    listPlanResponses(account.id, model.plan.id),
    listConsentCurrentState(account.id, { type: "golfer", golferId }),
  ]);
  const roadmapSharingConsent = golferConsentStates.find(
    (state) => state.purpose === "roadmap_sharing",
  )!;
  const golferArchived = model.golfer.status === "archived";
  const editable =
    !golferArchived && !["completed", "archived"].includes(model.plan.status);
  const publishable = !golferArchived && model.plan.status !== "archived";
  const blockers = publicationBlockers(model);
  const activePractice = model.practiceItems.find((item) => item.status === "active");
  const latestLesson = model.lessons.at(-1);
  const latestMediaAttachment = model.mediaItems?.at(-1);
  const practiceWorkspaceHref = coachingWorkspaceHref(model.plan.id, {
    tab: "practice",
    focus: activePractice
      ? { kind: "practice", practiceId: activePractice.id }
      : null,
  });
  const lessonWorkspaceHref = coachingWorkspaceHref(model.plan.id, {
    tab: "lessons",
    focus: latestLesson
      ? { kind: "lesson", lessonId: latestLesson.id }
      : null,
  });
  const mediaWorkspaceHref = coachingWorkspaceHref(model.plan.id, {
    tab: "media",
    focus: latestMediaAttachment
      ? { kind: "media", attachmentId: latestMediaAttachment.attachmentId }
      : null,
  });

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader} id="hub-overview">
        <div>
          <span className={styles.eyebrow}>Golfer coaching hub</span>
          <h1>{model.golfer.displayName}</h1>
          <p>
            Move between the current roadmap, living coaching records, exact golfer preview,
            and private sharing without losing the next useful action.
          </p>
        </div>
        <div className={styles.actions}>
          {editable ? (
            <Link className={styles.primaryButton} href={`/app/golfers/${encodeURIComponent(golferId)}/edit`}>
              Edit roadmap
            </Link>
          ) : null}
          {editable ? (
            <Link className={styles.secondaryButton} href={practiceWorkspaceHref}>
              Open coaching workspace
            </Link>
          ) : null}
          <Link className={styles.secondaryButton} href={`/app/golfers/${encodeURIComponent(golferId)}/settings`}>
            Golfer settings
          </Link>
          <Link className={styles.secondaryButton} href="/app/golfers">
            Back to golfers
          </Link>
        </div>
      </header>

      <GolferHubNav
        lessons={model.lessons.length}
        practice={model.practiceItems.length}
        evidence={model.evidenceItems.length}
        hasReview={Boolean(model.phaseReview)}
        hasShareHistory={sharingState.shares.length > 0}
      />

      <section className={styles.hubSummary} aria-label="Golfer workspace summary">
        <article>
          <span>Roadmap state</span>
          <strong>{model.plan.status.replaceAll("_", " ")}</strong>
          <small>Revision {model.plan.revision}</small>
        </article>
        <article>
          <span>Current practice</span>
          <strong>{activePractice?.title || "None active"}</strong>
          <small>{activePractice?.dosage || "Add only when it helps the current phase."}</small>
        </article>
        <article>
          <span>Latest recorded choice</span>
          <strong>{responses[0] ? responseLabel(responses[0].responseType) : "No response"}</strong>
          <small>Roadmap does not infer delivery, booking, payment, or outcome.</small>
        </article>
      </section>

      <StagedCompletionDraftResolution
        recoveryScope={account.id}
        planId={model.plan.id}
        planRevision={model.plan.revision}
        noticeClassName={styles.notice}
        actionsClassName={styles.actions}
        buttonClassName={styles.secondaryButton}
      />

      {!editable ? (
        <div className={styles.notice} role="note">
          <strong>
            {golferArchived
              ? "This golfer record is archived."
              : `This plan is ${model.plan.status}.`}
          </strong>
          <span>
            Its retained coach preview is read-only.
            {golferArchived
              ? " New updates and private access are unavailable in this state."
              : model.plan.status === "completed"
                ? " You may still publish this exact final revision for the golfer."
                : " Archived plans cannot create new private access."}
          </span>
        </div>
      ) : null}

      <section className={styles.hubSection} id="hub-roadmap" aria-labelledby="hub-roadmap-heading">
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Roadmap</span>
            <h2 id="hub-roadmap-heading">Review the exact golfer experience.</h2>
            <p>
              This uses the same renderer and content order as the private golfer view.
              Preview controls record nothing and do not open the external package action.
            </p>
          </div>
          {editable ? (
            <Link className={styles.secondaryButton} href={`/app/golfers/${encodeURIComponent(golferId)}/edit#authoring-goal`}>
              Edit core roadmap
            </Link>
          ) : null}
        </div>
        <details className={styles.previewDisclosure} open>
          <summary>Open exact preview for revision {model.plan.revision}</summary>
          <div className={styles.previewCanvas}>
            <PlanView model={model} preview embedded />
          </div>
        </details>
      </section>

      <div className={styles.hubDestinationGrid}>
        <section className={styles.hubDestination} id="hub-lessons" aria-labelledby="hub-lessons-heading">
          <span className={styles.eyebrow}>Lessons</span>
          <h2 id="hub-lessons-heading">{model.lessons.length} retained chapter{model.lessons.length === 1 ? "" : "s"}</h2>
          <p>{latestLesson ? `Latest: ${latestLesson.title}` : "No lesson chapter is stored yet."}</p>
          {editable ? (
            <Link href={lessonWorkspaceHref}>
              {latestLesson ? "Review latest lesson" : "Plan or record a lesson"}
            </Link>
          ) : null}
        </section>
        <section className={styles.hubDestination} id="hub-practice" aria-labelledby="hub-practice-heading">
          <span className={styles.eyebrow}>Practice</span>
          <h2 id="hub-practice-heading">{activePractice ? "One active direction" : "No active direction"}</h2>
          <p>{activePractice?.title || "Assign a bounded task only when it supports the current phase."}</p>
          {editable ? (
            <Link href={practiceWorkspaceHref}>
              {activePractice ? "Review active practice" : "Open practice workspace"}
            </Link>
          ) : null}
        </section>
        <section className={styles.hubDestination} id="hub-media" aria-labelledby="hub-media-heading">
          <span className={styles.eyebrow}>Private coaching media</span>
          <h2 id="hub-media-heading">Private media library</h2>
          <p>
            Upload privately, then attach a file to a specific lesson, practice assignment,
            evidence item, assessment, or phase review in this golfer&rsquo;s coaching workspace.
          </p>
          <a href="/app/media">Open media library</a>
          {editable ? <Link href={mediaWorkspaceHref}>Manage golfer attachments</Link> : null}
        </section>
        <section className={styles.hubDestination} id="hub-evidence" aria-labelledby="hub-evidence-heading">
          <span className={styles.eyebrow}>Data / evidence</span>
          <h2 id="hub-evidence-heading">{model.evidenceItems.length} evidence item{model.evidenceItems.length === 1 ? "" : "s"}</h2>
          <p>Add bounded observations, launch-monitor measurements, and explicit coach interpretation.</p>
          {editable ? <a href={`/app/coaching/plans/${encodeURIComponent(model.plan.id)}?tab=evidence`}>Open evidence workspace</a> : null}
        </section>
        <section className={styles.hubDestination} id="hub-reviews" aria-labelledby="hub-reviews-heading">
          <span className={styles.eyebrow}>Reviews</span>
          <h2 id="hub-reviews-heading">{model.phaseReview ? "Current phase review retained" : "No phase review yet"}</h2>
          <p>{model.phaseReview?.summary || "Build a review only from evidence the coach actually considered."}</p>
          {editable ? <a href={`/app/coaching/plans/${encodeURIComponent(model.plan.id)}?tab=reviews`}>Select review sources</a> : null}
        </section>
      </div>

      {editable ? (
        <section className={styles.hubSection} id="living-content-editor" aria-labelledby="living-content-heading">
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Living coaching records</span>
              <h2 id="living-content-heading">Add the next useful chapter.</h2>
              <p>Lesson, practice, evidence, and review mutations retain their existing recovery controls.</p>
            </div>
          </div>
          <LivingPlanForms
            key={`${model.plan.id}:${model.plan.revision}`}
            planId={model.plan.id}
            planRevision={model.plan.revision}
            planStatus={model.plan.status}
            recoveryScope={account.id}
            phases={model.phases}
            lessons={model.lessons}
            practiceItems={model.practiceItems}
            evidenceItems={model.evidenceItems}
          />
        </section>
      ) : null}

      <section className={styles.hubSection} id="hub-share" aria-labelledby="hub-share-heading">
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Share</span>
            <h2 id="hub-share-heading">Private access for one reviewed revision.</h2>
            <p>
              Publishing creates revocable access; Roadmap still does not send a message
              automatically.
            </p>
          </div>
        </div>
        <ConsentPurposeControl
          heading="Private roadmap sharing"
          state={roadmapSharingConsent}
          subjectType="golfer"
          golferId={golferId}
        />
        {publishable && roadmapSharingConsent.effectiveGranted ? (
          <PublishControls
            planId={model.plan.id}
            planRevision={model.plan.revision}
            golferName={model.golfer.displayName}
            blockers={blockers.map((blocker) => blocker.message)}
            initialShares={sharingState.shares}
            publishedRevision={sharingState.publishedRevision}
            lastSharedAt={sharingState.lastSharedAt}
          />
        ) : null}
      </section>

      <section className={styles.hubSection} aria-labelledby="golfer-responses-heading">
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Golfer choices</span>
            <h2 id="golfer-responses-heading">Recorded response history</h2>
            <p>
              An external-page open is not evidence of a booking, payment, sale, or coaching
              outcome. Question and reassessment choices do not send a message.
            </p>
          </div>
        </div>
        {responses.length ? (
          <ul className={styles.compactList}>
            {responses.map((response) => (
              <li key={response.id}>
                <div>
                  <strong>{responseLabel(response.responseType)}</strong>
                  <small>{new Date(response.occurredAt).toLocaleString("en-CA")}</small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyInline}>No golfer choice has been recorded for this plan.</p>
        )}
      </section>
    </div>
  );
}

function ArchivedIncompleteRoadmap({
  staged,
}: {
  staged: StagedGolferWorkspaceView;
}) {
  const golferName = staged.golfer.preferredName || staged.golfer.displayName;
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Golfer coaching hub</span>
          <h1>{golferName}</h1>
          <p>
            This retained roadmap is incomplete and archived. Roadmap shows only the coaching
            facts that were actually saved.
          </p>
        </div>
        <Link className={styles.secondaryButton} href="/app/golfers">
          Back to golfers
        </Link>
      </header>
      <div className={styles.notice} role="note">
        <strong>This golfer record is archived.</strong>
        <span>
          The retained snapshot is read-only. Missing assessment, priority, or phase content
          cannot be completed here, and no new private access is available.
        </span>
      </div>
      <section className={styles.panel} aria-labelledby="archived-roadmap-summary-heading">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Retained roadmap snapshot</span>
            <h2 id="archived-roadmap-summary-heading">{staged.plan.title}</h2>
          </div>
          <span className={styles.status}>archived · read-only</span>
        </div>
        <dl>
          <div>
            <dt>Primary goal</dt>
            <dd>{staged.goal?.desiredOutcome || "No primary goal is retained."}</dd>
          </div>
          <div>
            <dt>Completion state</dt>
            <dd>
              {staged.authoringState === "staged"
                ? "Assessment, priority, and phases were not saved."
                : "The retained core content is incomplete or inconsistent."}
            </dd>
          </div>
        </dl>
      </section>
      <div className={styles.actions}>
        <Link className={styles.secondaryButton} href="/app/settings/data">
          Open data controls
        </Link>
      </div>
    </div>
  );
}

function responseLabel(responseType: GolferResponseType): string {
  const labels: Record<GolferResponseType, string> = {
    ask_question: "Question path opened",
    wait: "Review later",
    decline: "Not pursuing this option",
    request_reassessment: "Reassessment requested",
    independent_practice: "Independent practice chosen",
    external_action_opened: "External coach action opened",
  };
  return labels[responseType];
}
