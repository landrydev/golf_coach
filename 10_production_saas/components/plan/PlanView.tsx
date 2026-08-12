import styles from "./plan.module.css";
import type { PlanViewModel } from "./types";
import { GolferChoices } from "./GolferChoices";
import { CloseRoadmap } from "./CloseRoadmap";
import { PrintRoadmapButton } from "./PrintRoadmapButton";
import { PracticeCheckIn } from "./PracticeCheckIn";
import { PlanTimeline } from "./PlanTimeline";
import { PrivateBrandMark, PrivatePlanMedia } from "./PrivatePlanMedia";
import { safeCoachAccent } from "@/lib/colors";
import { buildCoachContactMailtoUri } from "@/lib/mailto";

type PlanViewProps = { model: PlanViewModel; sessionContext?: string; preview?: boolean; embedded?: boolean };

export function PlanView({ model, sessionContext, preview = false, embedded = false }: PlanViewProps) {
  const currentPhase = model.phases.find((phase) => phase.status === "active") ?? model.phases.find((phase) => phase.status === "paused") ?? [...model.phases].reverse().find((phase) => phase.status === "complete") ?? model.phases[0];
  const activePractice = model.plan.status === "completed" ? undefined : model.practiceItems.find((item) => item.status === "active") ?? model.practiceItems.find((item) => item.status !== "completed");
  const latestLesson = model.lessons.at(-1);
  const featuredMedia = (model.mediaItems ?? []).slice(-3).reverse();
  const featuredEvidence = model.evidenceItems.slice(-3).reverse();
  const accent = safeCoachAccent(model.coach.accentColor);
  const coachMailtoUri = buildCoachContactMailtoUri(model.coach.contactEmail);
  const ContentElement = embedded ? "div" : "main";
  const HeroHeading = embedded ? "h2" : "h1";
  const mediaUrl = (mediaAssetId: string) => preview
    ? `/api/media/${encodeURIComponent(mediaAssetId)}`
    : sessionContext
      ? `/r/media/${encodeURIComponent(mediaAssetId)}?context=${encodeURIComponent(sessionContext)}`
      : null;
  const coachLogoUrl = model.coach.logoMediaAssetId ? mediaUrl(model.coach.logoMediaAssetId) : null;
  const coachProfilePhotoUrl = model.coach.profilePhotoMediaAssetId ? mediaUrl(model.coach.profilePhotoMediaAssetId) : null;

  return (
    <div className={styles.plan} style={{ "--coach-accent": accent } as React.CSSProperties}>
      <a className={styles.skipLink} href="#plan-content">Skip to coaching plan</a>
      {preview ? <div className={styles.previewBanner} role="status">Coach preview — controls are disabled and record nothing. This is the exact private player story.</div> : null}

      <header className={styles.header}>
        <a className={styles.brand} href="#now" aria-label="Return to the opening">
          {coachLogoUrl ? <PrivateBrandMark src={coachLogoUrl} fallback={initials(model.coach.displayName)} /> : <span aria-hidden="true">{initials(model.coach.displayName)}</span>}
          <span><strong>{model.coach.businessName || model.coach.displayName}</strong><small>Coach-authored private development plan</small></span>
        </a>
        <div className={styles.headerTools}>
          <PrintRoadmapButton />
          {!preview && model.access ? <CloseRoadmap sessionContext={sessionContext ?? ""} /> : null}
        </div>
      </header>

      <nav className={styles.nav} aria-label="Roadmap chapters">
        <a href="#roadmap">Your plan</a><a href="#practice">This week</a><a href="#progress">Progress</a><a href="#review">Next step</a>
      </nav>

      <ContentElement id="plan-content">
        <section className={styles.hero} id="now">
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>{model.golfer.displayName}</span>
            <p className={styles.planTitle}>{model.plan.title}</p>
            <HeroHeading>Your roadmap to <em>{model.goal.statement}</em></HeroHeading>
            {model.goal.why ? <p className={styles.heroWhy}>{model.goal.why}</p> : null}
            <a className={styles.heroAction} href="#roadmap">See your plan <span aria-hidden="true">↓</span></a>
          </div>
          <aside className={styles.currentPriority}>
            <span>What matters now</span>
            <strong>{model.priority?.title || currentPhase?.title || model.plan.title}</strong>
            <p>{model.priority?.rationale || currentPhase?.purpose || "Your coach is preparing the first clear priority."}</p>
            {currentPhase ? <small>Phase {currentPhase.number} of {model.phases.length}</small> : null}
          </aside>
        </section>

        <section className={styles.storySection} id="goal">
          <div className={styles.chapterLabel}><span>01</span><strong>Where you are going</strong></div>
          <div className={styles.editorialCopy}>
            <h2>{model.goal.statement}</h2>
            {model.goal.context ? <p>{model.goal.context}</p> : null}
            <p className={styles.boundary}>This roadmap gives the coaching direction. It never guarantees a score, timeline, or permanent result.</p>
          </div>
        </section>

        <section className={styles.storySection} id="roadmap">
          <div className={styles.chapterLabel}><span>02</span><strong>Where you are starting</strong></div>
          <div className={styles.editorialCopy}>
            {model.assessment.strengths ? <div className={styles.strengthLead}><span>Strengths to protect</span><h2>{model.assessment.strengths}</h2></div> : null}
            <p className={styles.lede}>{model.assessment.summary}</p>
            {model.assessment.primaryPattern ? <blockquote><span>The pattern to change</span>{model.assessment.primaryPattern}</blockquote> : null}
            <details className={styles.quietDisclosure}><summary>What this assessment cannot yet prove</summary><p>{model.assessment.limitations || "The roadmap will evolve as more representative evidence develops."}</p></details>
          </div>
        </section>

        <section className={styles.pathSection} aria-labelledby="path-heading">
          <div className={styles.pathIntro}><span className={styles.kicker}>03 · Your path</span><h2 id="path-heading">A clear sequence, not a fixed prediction.</h2><p>Each phase creates the evidence needed to make the next good coaching decision.</p></div>
          <ol className={styles.phases}>
            {model.phases.map((phase) => (
              <li data-status={phase.status} key={phase.id}>
                <span className={styles.phaseNumber}>{String(phase.number).padStart(2, "0")}</span>
                <div className={styles.phaseCopy}>
                  <small>{phaseStatusLabel(phase.status)}</small><h3>{phase.title}</h3><p>{phase.purpose}</p>
                  {phase.progressSignals.length ? <ul>{phase.progressSignals.map((signal) => <li key={signal}>{signal}</li>)}</ul> : null}
                  {phase.rationale ? <details className={styles.quietDisclosure}><summary>Why this phase leads</summary><p>{phase.rationale}</p></details> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.weekSection} id="practice">
          <div className={styles.chapterLabel}><span>04</span><strong>This week</strong></div>
          <div className={styles.weekGrid}>
            <article className={styles.takeawayCard}>
              <span>Latest takeaway</span>
              <h2>{latestLesson?.takeaway || latestLesson?.summary || "Your coach will add the first lesson takeaway here."}</h2>
              {latestLesson?.coachObservation ? <p>{latestLesson.coachObservation}</p> : null}
              {latestLesson?.nextCheck ? <p><b>Pay attention to:</b> {latestLesson.nextCheck}</p> : null}
              {latestLesson?.happenedAt ? <small>{formatDate(latestLesson.happenedAt)}</small> : null}
            </article>
            {activePractice ? (
              <article className={styles.practiceCard}>
                <span>Your next practice</span><h2>{activePractice.title}</h2><p>{activePractice.instructions}</p>
                <b>{activePractice.dosage || "Follow the coach’s cadence notes."}</b>
                <details className={styles.screenOnlyDisclosure}><summary>Full practice guidance</summary><DrillGuidance item={activePractice} /></details>
                <div className={styles.printOnlyContent}><DrillGuidance item={activePractice} /></div>
                {model.access && !fmodel.plan.status.completed && !model.plan.status.archived ? <PracticeCheckIn planRevision={model.plan.revision} practiceId={activePractice.id} sessionContext={sessionContext ?? ""} /> : null}
              </article>
            ) : <Empty title="No separate practice task is active." body="The latest lesson still defines what to notice before the next coaching decision." />}
          </div>
        </section>

        <section className={styles.progressSection} id="progress">
          <div className={styles.progressHead}><span className={styles.kicker}>05 · Progress</span><h2>What is changing, and what that still does not prove.</h2></div>
          {model.milestones?.length ? <div className={styles.milestoneRow}>{model.milestones.slice(-3).reverse().map((milestone) => <article key={milestone.id}><span>{formatDate(milestone.occurredAt)}</span><h2>{milestone.title}</h2><p>{milestone.summary}</p></article>)}</div> : null}

          {model.launchComparisons?.length ? <div className={styles.comparisonGrid}>{model.launchComparisons.slice(-2).reverse().map((comparison) => <article key={comparison.id}><span>Measurement comparison</span><h3>{comparison.title}</h3><p>{comparison.coachInterpretation}</p>{comparison.metrics.map((metric) => <MetricComparison key={metric.displayName} metric={metric} />)}<details className={styles.quietDisclosure}><summary>Limitations and next evidence</summary><p>{comparison.limitations}</p>{comparison.nextEvidenceNeeded ? <p><b>Next estimated need:</b> {comparison.nextEvidenceNeeded}</p> : null}</details></article>)}</div> : null}

          {featuredMedia.length ? <div className={styles.mediaGallery} id="media">{featuredMedia.map((item) => <PrivatePlanMedia key={item.attachmentId} item={item} src={mediaUrl(item.mediaAssetId)!} />)}</div> : null}

          <p>This bounded view shows up to 8 items, prioritizing current-phase practice before the newest retained history.</p>
          <p className={styles.boundedNotice}>This bounded view shows up to 20 published items, prioritizing current-phase evidence before the most recently observed retained history.</p>

          {featuredEvidence.length ? <div className={styles.evidenceGrid} id="evidence">{featuredEvidence.map((item) => <article id={`evidence-${item.id}`} key={item.id}><span>{item.comparisonRole ? humanize(item.comparisonRole) : humanize(item.maturity)}</span><h3>{item.title}</h3><p>{item.summary}</p>{item.metricValue != null ? <strong>{item.metricName}: {formatMetricValue(item.metricValue))} {item.metricUnit}</strong> : item.valueText ? <strong>{item.valueText}</strong> : null}{item.nextEvidenceNeeded ? <p><b>Next evidence needed:</b> {item.nextEvidenceNeeded}</p> : null}<small>{item.sourceLabel}{item.isRepresentative ? " · Coach selected as representative of the recorded context" : ""}</small></article>)}</div> : null}

          {model.lessons.length ? <details className={styles.progressArchive} id="lessons"><summary>Lesson chapters and exact selected sources</summary><p className={styles.boundedNotice}>This bounded view shows up to 12 chapters, prioritizing the current phase before the newest retained history.</p>{model.lessons.slice().reverse().map((lesson) => <article key={lesson.id}><span>{lesson.happenedAt ? formatDate(lesson.happenedAt) : humanize(lesson.status || "lesson")}</span><h3>{lesson.title}</h3><p>{lesson.summary}</p>{lesson.coachObservation ? <p><b>Coach observation:</b> {lesson.coachObservation}</p> : null}{lesson.selectedEvidence.length ? <div><b>Selected evidence from this lesson</b><ul>{lesson.selectedEvidence.map((item) => <li id={`evidence-${item.id}`} key={item.id}>{item.title}: {item.summary}</li>)}</ul></div> : null}{lesson.selectedMeasurements.length ? <div><b>Selected measurement sessions from this lesson</b><ul>{lesson.selectedMeasurements.map((session) => <li id={`launch-session-${session.id}`} key={session.id}>{session.label}: {session.coachInterpretation}{session.metrics.length ? <ul>{session.metrics.map((metric) => <li key={`${session.id}:${metric.displayName}`}>{metric.displayName}: {formatMetricValue(metric.numericValue))} {metric.unit}</li>)}</ul> : null}</li>)}</ul></div> : null}</article>)}</details> : null}
        </section>

        <section className={styles.reviewSection} id="review">
          <div className={styles.chapterLabel}><span>06</span><strong>The next coaching decision</strong></div>
          <div className={styles.editorialCopy}>
            {model.phaseReview ? <article className={styles.reviewCard}><span>{model.phaseReview.reliabilityLabel}</span><h2>{model.phaseReview.summary}</h2><p><b>Original phase purpose:</b> {model.phaseReview.originalPurpose}</p><p>{model.phaseReview.coachConclusion}</p>{model.phaseReview.golferContribution ? <p><b>Player reflection:</b> {model.phaseReview.golferContribution}</p> : null}{model.phaseReview.remainingOpportunity ? <blockquote><span>What remains</span>{model.phaseReview.remainingOpportunity}</blockquote> : null}<details className={styles.quietDisclosure}><summary>Exact selected source records</summary><ul>{model.phaseReview.sources.map((source) => <li key={source.id}><b>{source.label}</b>{source.summary ? ` — ${source.summary}` : ""}</li>)}</ul></details></article> : <Empty title="This phase is still being built." body="A phase review appears when the coach has enough evidence to make the next decision honestly." />}

            {model.coachingPackage ? <article className={styles.packageCard}><span>Your coaching plan</span><h2>{model.coachingPackage.title}</h2><p>{model.coachingPackage.description}</p>{model.coachingPackage.inclusions.length ? <ul>{model.coachingPackage.inclusions.map((item) => <li key={item}>{item}</li>)}</ul> : null}<strong>{packageDisplayPrice(model.coachingPackage)}</strong>{!model.access && !preview ? <a href={model.coachingPackage.externalActionUrl} rel="external noopener noreferrer" target="_blank">Open the coach’s next-step page</a> : null}<small>Booking or payment happens on the coach’s external service and is not complete until that service confirms it.</small></article> : <div className={styles.choiceCard}><strong>No package is attached.</strong><p>The roadmap remains useful without a purchase recommendation.</p></div>}

            {model.access || preview ? <GolferChoices coachName={model.coach.displayName} coachEmail={model.coach.contactEmail} externalActionUrl={model.coachingPackage?.externalActionUrl} sessionContext={sessionContext} preview={preview} /> : coachMailtoUri ? <div className={styles.choiceLinks}><a href={coachMailtoUri}>Ask {model.coach.displayName}</a><span>Review later</span><span>Practise independently</span></div> : null}
          </div>
        </section>

        <section className={styles.coachNoteSection} id="coach-note">
          <div className={styles.chapterLabel}><span>07</span><strong>A note from your coach</strong></div>
          <div className={styles.coachNote}>
            <p>{coachClosingNote(model)}</p>
            <div>
              {coachProfilePhotoUrl ? <PrivateBrandMark className={styles.coachPortrait} fallback={initials(model.coach.displayName)} src={coachProfilePhotoUrl} /> : <span aria-hidden="true" className={styles.coachPortrait}>{initials(model.coach.displayName)}</span>}
              <span><strong>{model.coach.displayName}</strong><small>{model.coach.businessName || "Your coach"}</small></span>
            </div>
          </div>
        </section>

        {model.timeline?.length ? <details className={styles.timelineDisclosure} id="timeline"><summary>Complete coaching timeline</summary><PlanTimeline items={model.timeline} /></details> : null}
      </ContentElement>

      <footer className={styles.footer}>
        <div className={styles.coachSignature}>
          {coachProfilePhotoUrl ? <PrivateBrandMark className={styles.coachPortrait} fallback={initials(model.coach.displayName)} src={coachProfilePhotoUrl} /> : <span aria-hidden="true" className={styles.coachPortrait}>{initials(model.coach.displayName)}</span>}
          <div><strong>{model.coach.displayName}</strong><span>{model.coach.businessName || "Coach-authored private development plan"}</span></div>
        </div>
        <div><span>Updated {formatDate(model.plan.updatedAt)}</span>{model.access?.expiresAt ? <span>Access expires {formatDate(model.access.expiresAt)}</span> : null}</div>
      </footer>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) { return <div className={styles.emptyState}><strong>{title}</strong><p>{body}</p></div>; }

function DrillGuidance({ item }: { item: PlanViewModel["practiceItems"][number] }) {
  return <>{item.purpose ? <p><b>Purpose:</b> {item.purpose}</p> : null}{item.whenItFits ? <p><b>When it fits:</b> {item.whenItFits}</p> : null}{item.equipment?.length ? <p><b>Equipment:</b> {item.equipment.join(", ")}</p> : null}{item.setup ? <p><b>Setup:</b> {item.setup}</p> : null}{item.steps?.length ? <div><b>Steps</b><ol>{item.steps.map((step, index) => <li key={`${item.id}:step:${index}`}>{step}</li>)}</ol></div> : null}{item.feelOrCue ? <p><b>Feel or cue:</b> {item.feelOrCue}</p> : null}{item.commonMiss ? <p><b>Common miss:</b> {item.commonMiss}</p> : null}{item.stopOrAskRule ? <p><b>Stop and ask:</b> {item.stopOrAskRule}</p> : null}{item.constraintOrAdaptation ? <p><b>Adaptation:</b> {item.constraintOrAdaptation}</p> : null}{item.progression ? <p><b>Progression:</b> {item.progression}</p> : null}{item.regression ? <p><b>Regression:</b> {item.regression}</p> : null}<>;
}

function MetricComparison({ metric }: { metric: NonNullable<PlanViewModel["launchComparisons"]>[number]["metrics"][number] }) {
  const scale = Math.max(Math.abs(metric.baselineValue), Math.abs(metric.currentValue), 1);
  const baselineWidth = Math.max(3, (Math.abs(metric.baselineValue) / scale) * 100);
  const currentWidth = Math.max(3, (Math.abs(metric.currentValue) / scale) * 100);
  return <figure className={styles.metricComparison}><figcaption><strong>{metric.displayName}</strong><span>{metric.delta > 0 ? "+" : ""}{formatMetricValue(metric.delta)} {metric.unit}</span></figcaption><div><span>Then</span><p style={{ width: `${baselineWidth}%` }} /><b>{formatMetricValue(metric.baselineValue)}</b></div><div><span>Now</span><i style={{ width: `${currentWidth}%` }} /><b>{formatMetricValue(metric.currentValue)}</b></div></figure>;
}

function coachClosingNote(model: PlanViewModel): string {
  if (model.phaseReview?.coachConclusion) return model.phaseReview.coachConclusion;
  if (model.priority?.rationale) return `We are beginning with ${model.priority.title.toLowerCase()} because ${model.priority.rationale.charAt(0).toLowerCase()}${model.priority.rationale.slice(1)}`;
  const currentPhase = model.phases.find((phase) => phase.status === "active") ?? model.phases[0];
  return currentPhase
    ? `The plan is to keep ${currentPhase.title.toLowerCase()} simple, observable, and connected to the way you want to play.`
    : "We will keep this roadmap focused on the next useful coaching decision and adjust it as better evidence develops.";
}

function initials(value: string): string { return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatDate(value: number): string { return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value)); }
function formatMoney(value: number, currency: string): string { return new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "code" }).format(value / 100); }
function formatMetricValue(value: number): string { return new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }).format(value); }
function packageDisplayPrice(coachingPackage: NonNullable<PlanViewModel["coachingPackage"]>): string { return coachingPackage.priceCents != null && coachingPackage.currency && /^[A-Z]{3}$/.test(coachingPackage.currency) ? formatMoney(coachingPackage.priceCents, coachingPackage.currency) : coachingPackage.currentDetailsText || "Confirm current details with your coach"; }
function humanize(value: string): string { return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function phaseStatusLabel(status: string): string { return ({ active: "Current phase", paused: "Paused phase", complete: "Completed phase", planned: "Planned phase", revised: "Revised phase", canceled: "Cancelled phase" } as Record<string,string>)[status] ?? humanize(status); }
