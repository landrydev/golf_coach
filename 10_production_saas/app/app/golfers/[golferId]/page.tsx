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
import styles from "../../beta2.module.css";
import { PublishControls } from "./PublishControls";
import { QuickLessonUpdate } from "./QuickLessonUpdate";

export const metadata: Metadata = { title: "Golfer plan | Roadmap" };
export const dynamic = "force-dynamic";

export default async function PlayerJourneyPage({ params }: { params: Promise<{ golferId: string }> }) {
  const { golferId } = await params;
  const identity = await requirePageIdentity(`/app/golfers/${encodeURIComponent(golferId)}`);
  const account = await getOrCreateAccountForIdentity(identity);
  const accountConsentStates = await listConsentCurrentState(account.id, { type: "account", golferId: null });
  const golferRecordConsent = accountConsentStates.find((state) => state.purpose === "golfer_record");
  if (!golferRecordConsent?.effectiveGranted) {
    return <div className={styles.page}><div className={styles.empty}><h1>Golfer records are unavailable.</h1><p>Restore the player-record authorization before opening this journey.</p><Link className={styles.primaryButton} href="/app/settings/data">Open data controls</Link></div></div>;
  }

  const model = await getCoachPlanForGolfer(account.id, golferId);
  if (!model) {
    const staged = await getStagedGolferWorkspace(account.id, golferId);
    if (staged && (staged.golfer.status === "archived" || staged.plan.status === "archived")) return <ArchivedIncompleteRoadmap staged={staged} />;
    notFound();
  }

  const [sharingState, responses, golferConsentStates] = await Promise.all([
    getPlanSharingState(account.id, model.plan.id),
    listPlanResponses(account.id, model.plan.id),
    listConsentCurrentState(account.id, { type: "golfer", golferId }),
  ]);
  const roadmapSharingConsent = golferConsentStates.find((state) => state.purpose === "roadmap_sharing")!;
  const golferArchived = model.golfer.status === "archived";
  const editable = !golferArchived && !["completed", "archived"].includes(model.plan.status);
  const publishable = !golferArchived && model.plan.status !== "archived";
  const blockers = publicationBlockers(model);
  const currentPhase = model.phases.find((phase) => phase.status === "active") ?? model.phases.find((phase) => phase.status === "paused") ?? model.phases[0];
  const activePractice = model.practiceItems.find((item) => item.status === "active");
  const latestLesson = model.lessons.at(-1);
  const latestMediaAttachment = model.mediaItems?.at(-1);
  const practiceWorkspaceHref = coachingWorkspaceHref(model.plan.id, {
    tab: "practice",
    focus: activePractice ? { kind: "practice", practiceId: activePractice.id } : null,
  });
  const lessonWorkspaceHref = coachingWorkspaceHref(model.plan.id, {
    tab: "lessons",
    focus: latestLesson ? { kind: "lesson", lessonId: latestLesson.id } : null,
  });
  const mediaWorkspaceHref = coachingWorkspaceHref(model.plan.id, {
    tab: "media",
    focus: latestMediaAttachment
      ? { kind: "media", attachmentId: latestMediaAttachment.attachmentId }
      : null,
  });
  const coachingBase = `/app/coaching/plans/${encodeURIComponent(model.plan.id)}`;

  return (
    <div className={styles.page}>
      <header className={styles.playerHero}>
        <div><span className={styles.eyebrow}>Player journey</span><h1>{model.golfer.displayName}</h1><strong className={styles.planTitle}>{model.plan.title}</strong><p>{model.goal.statement}</p></div>
        <div className={styles.headerActions}>
          {editable ? <Link className={styles.primaryButton} href={`/app/golfers/${encodeURIComponent(golferId)}/edit`}>Edit roadmap</Link> : null}
          <Link className={styles.secondaryButton} href="/app/golfers">All players</Link>
        </div>
      </header>

      <nav className={styles.playerNav} aria-label="Player journey sections">
        <a href="#roadmap">Roadmap</a><a href="#today">Today</a><a href="#progress">Progress</a><a href="#share">Share</a>
      </nav>

      <section className={styles.playerOverview} id="roadmap">
        <article className={styles.focusPanel}>
          <span className={styles.eyebrow}>What matters now</span>
          <h2>{model.priority?.title || currentPhase?.title || model.plan.title}</h2>
          <p>{model.priority?.rationale || currentPhase?.purpose || "Choose the first clear priority."}</p>
          <small>{currentPhase ? `Phase ${currentPhase.number} of ${model.phases.length} · ${currentPhase.title}` : "Roadmap setup"}</small>
        </article>
        <article className={styles.todayPanel}>
          <span className={styles.eyebrow}>Latest coaching note</span>
          <h2>{latestLesson?.takeaway || "The roadmap is ready for its first lesson chapter."}</h2>
          <p>{activePractice ? `Current practice: ${activePractice.title}` : "No separate practice task is required until the next lesson creates one."}</p>
          {editable ? <a className={styles.textButton} href="#today">Record today’s lesson</a> : null}
        </article>
      </section>

      <StagedCompletionDraftResolution
        recoveryScope={account.id}
        planId={model.plan.id}
        planRevision={model.plan.revision}
        noticeClassName={styles.notice}
        actionsClassName={styles.headerActions}
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

      <section className={styles.section} aria-labelledby="preview-heading">
        <div className={styles.sectionHeader}>
          <div><span className={styles.eyebrow}>Exact player preview</span><h2 id="preview-heading">The story your player receives.</h2><p>Roadmap uses the same private renderer below. Preview controls record nothing.</p></div>
        </div>
        <div className={styles.previewShell}><PlanView model={model} preview embedded /></div>
      </section>

      <section className={styles.section} id="today" aria-labelledby="today-heading">
        <div className={styles.sectionHeader}><div><span className={styles.eyebrow}>Today</span><h2 id="today-heading">Keep the journey alive in sixty seconds.</h2><p>One update creates the lesson takeaway, the next practice direction, and the new timeline chapter.</p></div></div>
        <article className={styles.todayPanel}>
          {editable && currentPhase ? (
            <QuickLessonUpdate
              key={`${model.plan.id}:${model.plan.revision}`}
              planId={model.plan.id}
              planRevision={model.plan.revision}
              phaseId={currentPhase.id}
              phaseTitle={currentPhase.title}
              activePracticeId={activePractice?.id}
            />
          ) : <p>This retained journey is read-only.</p>}
        </article>
      </section>

      <section className={styles.section} id="progress" aria-labelledby="progress-heading">
        <div className={styles.sectionHeader}><div><span className={styles.eyebrow}>Progress</span><h2 id="progress-heading">Curate the evidence, not the administration.</h2><p>The private player view selects the strongest lessons, practice, media, measurements, milestones, and review language.</p></div></div>
        <div className={styles.secondaryGrid}>
          <article className={styles.secondaryCard}><span className={styles.eyebrow}>Lesson chapters</span><h3>{model.lessons.length || "None yet"}</h3><p>{latestLesson?.title || "The sixty-second update creates the first chapter."}</p>{editable ? <Link href={lessonWorkspaceHref}>Open lesson history</Link> : null}</article>
          <article className={styles.secondaryCard}><span className={styles.eyebrow}>Selected evidence</span><h3>{model.evidenceItems.length + (model.mediaItems?.length ?? 0)} items</h3><p>Media and measurements remain optional context inside the player story.</p>{editable ? <Link href={`/app/coaching/plans/${encodeURIComponent(model.plan.id)}?tab=evidence`}>Add advanced evidence</Link> : null}</article>
          <article className={styles.secondaryCard}><span className={styles.eyebrow}>Phase reflection</span><h3>{model.phaseReview ? "Review retained" : "Not due yet"}</h3><p>{model.phaseReview?.coachConclusion || "Reflect when the phase has enough evidence to support a real decision."}</p>{editable ? <Link href={`${coachingBase}?tab=reviews`}>Open phase review</Link> : null}</article>
        </div>
        <details className={styles.advanced}>
          <summary>Advanced coaching workspace</summary>
          <div className={styles.secondaryGrid}>
            <article className={styles.secondaryCard}><span>Lessons</span><small>{model.lessons.length}</small></article>
            <article className={styles.secondaryCard}><span>Practice</span><small>{activePractice ? 1 : 0}</small><p>{activePractice?.title || "None active"}</p></article>
            <article className={styles.secondaryCard}><span>Data / Evidence</span><small>{model.evidenceItems.length}</small></article>
          </div>
          <div className={styles.secondaryGrid}>
            <article className={styles.secondaryCard}><h3>Practice and drills</h3><p>Manage multiple assignments, reusable drills, check-ins, and lifecycle history.</p><Link href={practiceWorkspaceHref}>Open practice tools</Link></article>
            <article className={styles.secondaryCard}><h3>Media and launch data</h3><p>Upload private media, map CSV data, compare selected metrics, and attach context.</p><Link href={mediaWorkspaceHref}>Open media tools</Link><Link href={`${coachingBase}?tab=launch`}>Open launch data</Link></article>
            <article className={styles.secondaryCard}><h3>Timeline and milestones</h3><p>Review the complete generated coaching history and publish selected milestones.</p><Link href={`${coachingBase}?tab=timeline`}>Open timeline</Link></article>
            <article className={styles.secondaryCard}><h3>Roadmap history and corrections</h3><p>Correct or withdraw existing golfer-view content without turning ordinary lesson follow-up into administration.</p><Link href={`${coachingBase}?tab=timeline`}>Review published content</Link></article>
          </div>
        </details>
      </section>

      <section className={styles.section} id="share" aria-labelledby="share-heading">
        <div className={styles.sectionHeader}><div><span className={styles.eyebrow}>Share</span><h2 id="share-heading">One private link to the reviewed story.</h2><p>Preview, publish, copy, or revoke. Roadmap never claims it sent a message, booked a lesson, or processed a package payment.</p></div></div>
        <article className={styles.sharePanel}>
          <ConsentPurposeControl heading="Private roadmap sharing" state={roadmapSharingConsent} subjectType="golfer" golferId={golferId} />
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
        </article>
        {responses.length ? (
          <details className={styles.advanced}><summary>Player response history</summary><ul>{responses.map((response) => <li key={response.id}>{responseLabel(response.responseType)} · {new Date(response.occurredAt).toLocaleString("en-CA")}</li>)}</ul></details>
        ) : null}
      </section>
    </div>
  );
}

function ArchivedIncompleteRoadmap({ staged }: { staged: StagedGolferWorkspaceView }) {
  const playerName = staged.golfer.preferredName || staged.golfer.displayName;
  return <div className={styles.page}><div className={styles.empty}><span className={styles.eyebrow}>Archived player · {playerName}</span><h1>{staged.plan.title}</h1><p>This archived roadmap is retained as a read-only snapshot.</p>{staged.goal?.desiredOutcome ? <p>{staged.goal.desiredOutcome}</p> : null}<Link className={styles.secondaryButton} href="/app/golfers">Back to players</Link></div></div>;
}

function responseLabel(responseType: GolferResponseType): string {
  const labels: Record<GolferResponseType, string> = {
    ask_question: "Question path opened", wait: "Review later", decline: "Not pursuing this option",
    request_reassessment: "Reassessment requested", independent_practice: "Independent practice chosen",
    external_action_opened: "External coach action opened",
  };
  return labels[responseType];
}
