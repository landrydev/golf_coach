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

type PlanViewProps = {
  model: PlanViewModel;
  sessionContext?: string;
  preview?: boolean;
  embedded?: boolean;
};

export function PlanView({
  model,
  sessionContext,
  preview = false,
  embedded = false,
}: PlanViewProps) {
  const currentPhase =
    model.phases.find((phase) => phase.status === "active") ??
    model.phases.find((phase) => phase.status === "paused") ??
    [...model.phases].reverse().find((phase) => phase.status === "complete") ??
    model.phases[0];
  const nextPractice =
    model.plan.status === "completed"
      ? undefined
      : model.practiceItems.find((item) => item.status !== "completed");
  const latestLesson = [...model.lessons].sort(
    (a, b) => (b.happenedAt ?? 0) - (a.happenedAt ?? 0),
  )[0];
  const accent = safeCoachAccent(model.coach.accentColor);
  const coachMailtoUri = buildCoachContactMailtoUri(model.coach.contactEmail);
  const ContentElement = embedded ? "div" : "main";
  const PriorityHeading = embedded ? "h2" : "h1";
  const mediaUrl = (mediaAssetId: string) =>
    preview
      ? `/api/media/${encodeURIComponent(mediaAssetId)}`
      : sessionContext
        ? `/r/media/${encodeURIComponent(mediaAssetId)}?context=${encodeURIComponent(sessionContext)}`
        : null;
  const coachLogoUrl = model.coach.logoMediaAssetId
    ? mediaUrl(model.coach.logoMediaAssetId)
    : null;
  const coachProfilePhotoUrl = model.coach.profilePhotoMediaAssetId
    ? mediaUrl(model.coach.profilePhotoMediaAssetId)
    : null;

  return (
    <div className={styles.plan} style={{ "--coach-accent": accent } as React.CSSProperties}>
      <a className={styles.skipLink} href="#plan-content">
        Skip to coaching plan
      </a>
      {preview ? (
        <div className={styles.previewBanner} role="status">
          Coach preview — content, order, and choices match the golfer view. Response and external-action controls are disabled and record nothing here.
        </div>
      ) : null}
      <header className={styles.header}>
        <a className={styles.brand} href="#now" aria-label="Return to current plan">
          {coachLogoUrl ? (
            <PrivateBrandMark
              src={coachLogoUrl}
              fallback={initials(model.coach.displayName)}
            />
          ) : (
            <span aria-hidden="true">{initials(model.coach.displayName)}</span>
          )}
          <strong>{model.coach.businessName || model.coach.displayName}</strong>
        </a>
        <div className={styles.headerTools}>
          <div className={styles.identity}>
            <span>Private coaching plan</span>
            <strong>{model.golfer.displayName}</strong>
          </div>
          <PrintRoadmapButton />
          {!preview && model.access ? (
            <CloseRoadmap sessionContext={sessionContext ?? ""} />
          ) : null}
        </div>
      </header>
      <nav className={styles.nav} aria-label="Coaching plan sections">
        <a href="#now">Now</a>
        <a href="#goal">Goal</a>
        <a href="#roadmap">Roadmap</a>
        <a href="#lessons">Lessons</a>
        <a href="#practice">Practice</a>
        <a href="#media">Media</a>
        <a href="#data">Data</a>
        <a href="#evidence">Evidence</a>
        <a href="#timeline">Timeline</a>
        <a href="#review">Phase review</a>
      </nav>

      <ContentElement id="plan-content">
        <section className={`${styles.section} ${styles.now}`} id="now">
          <div className={styles.sectionHeading}>
            <span>
              {model.plan.status === "completed"
                ? "Plan complete"
                : currentPhase?.status === "paused"
                  ? "Plan paused"
                  : "Now"}
              {currentPhase ? ` · Phase ${currentPhase.number}` : " · Plan setup"}
            </span>
            <PriorityHeading>
              {model.priority?.title || currentPhase?.title || model.plan.title}
            </PriorityHeading>
            <p>
              {model.priority?.rationale ||
                currentPhase?.rationale ||
                currentPhase?.purpose ||
                "Your coach is preparing the first clear priority for this plan."}
            </p>
          </div>
          <div className={styles.nowGrid}>
            <article className={styles.focusCard}>
              <span>
                {model.plan.status === "completed"
                  ? "Final coaching phase"
                  : currentPhase?.status === "paused"
                    ? "Paused coaching phase"
                    : "Current coaching phase"}
              </span>
              <strong>{currentPhase?.title || "Not selected yet"}</strong>
              <p>{currentPhase?.purpose || "Your coach will publish this after review."}</p>
            </article>
            <article className={styles.nextCard}>
              <span>{model.plan.status === "completed" ? "Plan outcome" : "Next useful action"}</span>
              <strong>
                {model.plan.status === "completed"
                  ? "Review the final phase record"
                  : nextPractice?.title || "Review the plan with your coach"}
              </strong>
              <p>
                {model.plan.status === "completed"
                  ? "This plan was completed by your coach. Completion records the coaching lifecycle; it does not guarantee a score or outcome."
                  : nextPractice?.dosage ||
                    nextPractice?.instructions ||
                    "Ask questions or wait before choosing a coaching package. There is no automatic renewal."}
              </p>
            </article>
          </div>
          {latestLesson?.takeaway ? (
            <blockquote className={styles.coachNote}>
              <span>{model.coach.displayName}&apos;s current takeaway</span>
              “{latestLesson.takeaway}”
            </blockquote>
          ) : null}
        </section>

        <section className={styles.section} id="goal">
          <div className={styles.sectionHeading}>
            <span>Your goal</span>
            <h2>{model.goal.statement}</h2>
            {model.goal.why ? <p>{model.goal.why}</p> : null}
          </div>
          <div className={styles.storyGrid}>
            {model.goal.context ? (
              <article>
                <span>Real-life context</span>
                <p>{model.goal.context}</p>
              </article>
            ) : null}
            <article>
              <span>Honest boundary</span>
              <p>
                This plan supports the goal. It does not guarantee a score, result, timeline,
                or permanent change.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.section} id="roadmap">
          <div className={styles.sectionHeading}>
            <span>Development roadmap</span>
            <h2>{model.plan.title}</h2>
            <p>
              A directional sequence authored by your coach. Later phases can change as new
              evidence develops.
            </p>
          </div>
          <div className={styles.assessmentCard}>
            <div>
              <span>Starting assessment</span>
              <p>{model.assessment.summary}</p>
            </div>
            {model.assessment.strengths ? (
              <div>
                <span>Strengths to preserve</span>
                <p>{model.assessment.strengths}</p>
              </div>
            ) : null}
            {model.assessment.primaryPattern ? (
              <div>
                <span>Primary pattern</span>
                <p>{model.assessment.primaryPattern}</p>
              </div>
            ) : null}
            <div className={styles.limits}>
              <span>Evidence limits</span>
              <p>
                {model.assessment.limitations.trim() ||
                  "No evidence limitations have been recorded yet."}
              </p>
            </div>
          </div>
          <ol className={styles.phases}>
            {model.phases.map((phase) => (
              <li data-status={phase.status} key={phase.id}>
                <span>{String(phase.number).padStart(2, "0")}</span>
                <div>
                  <small>{phaseStatusLabel(phase.status)}</small>
                  <strong>{phase.title}</strong>
                  <p>{phase.purpose}</p>
                  {phase.rationale ? (
                    <p className={styles.phaseDetail}>
                      <b>{phase.number === 1 ? "Why this phase leads: " : "Why this phase follows: "}</b>
                      {phase.rationale}
                    </p>
                  ) : null}
                  {phase.progressSignals.length ? (
                    <div className={styles.phaseSignals}>
                      <b>Progress signals</b>
                      <ul>
                        {phase.progressSignals.map((signal) => (
                          <li key={signal}>{signal}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {phase.expectations || phase.estimatedDuration ? (
                    <small className={styles.phaseMeta}>
                      {[phase.expectations, phase.estimatedDuration].filter(Boolean).join(" · ")}
                    </small>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section} id="lessons">
          <div className={styles.sectionHeading}>
            <span>Lesson chapters</span>
            <h2>What mattered, in the coach&apos;s words.</h2>
            <p>
              Concise chapters preserve direction without becoming a transcript or media archive.
              This bounded view shows up to 12 chapters, prioritizing the current phase before
              the newest retained history.
            </p>
          </div>
          {model.lessons.length ? (
            <div className={styles.cardGrid}>
              {model.lessons.map((lesson, index) => (
                <article className={styles.lessonCard} id={`lesson-${lesson.id}`} key={lesson.id}>
                  <div>
                    <span>Lesson {index + 1}</span>
                    {lesson.happenedAt ? <time>{formatDate(lesson.happenedAt)}</time> : null}
                  </div>
                  <h3>{lesson.title}</h3>
                  {lesson.status ? <small>{humanize(lesson.status)}</small> : null}
                  <p>{lesson.summary}</p>
                  {lesson.coachObservation ? (
                    <dl>
                      <dt>Coach observation</dt>
                      <dd>{lesson.coachObservation}</dd>
                    </dl>
                  ) : null}
                  {lesson.takeaway ? (
                    <dl>
                      <dt>Takeaway</dt>
                      <dd>{lesson.takeaway}</dd>
                    </dl>
                  ) : null}
                  {lesson.nextCheck ? (
                    <dl>
                      <dt>Next check</dt>
                      <dd>{lesson.nextCheck}</dd>
                    </dl>
                  ) : null}
                  {lesson.golferLearning ? (
                    <dl>
                      <dt>Golfer learning</dt>
                      <dd>{lesson.golferLearning}</dd>
                    </dl>
                  ) : null}
                  {lesson.phaseConnection ? (
                    <dl>
                      <dt>Phase connection</dt>
                      <dd>{lesson.phaseConnection}</dd>
                    </dl>
                  ) : null}
                  {lesson.selectedEvidence.length ? (
                    <dl>
                      <dt>Selected evidence from this lesson</dt>
                      <dd>
                        <ul>
                          {lesson.selectedEvidence.map((item) => (
                            <li key={item.id}>
                              <a href={`#evidence-${item.id}`}>{item.title}</a>
                              {` · ${humanize(item.evidenceType)} · ${item.summary}`}
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </dl>
                  ) : null}
                  {lesson.selectedMeasurements.length ? (
                    <dl>
                      <dt>Selected measurement sessions from this lesson</dt>
                      <dd>
                        <ul>
                          {lesson.selectedMeasurements.map((session) => (
                            <li id={`launch-session-${session.id}`} key={session.id}>
                              <strong>
                                {session.label} · {formatDate(session.sessionDate)}
                              </strong>
                              <p>{session.coachInterpretation}</p>
                              {session.metrics.length ? (
                                <small>
                                  {session.metrics
                                    .map(
                                      (metric) =>
                                        `${metric.displayName}: ${metric.numericValue} ${metric.unit}`,
                                    )
                                    .join(" · ")}
                                </small>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </dl>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <Empty title="No lesson chapter has been published yet." body="The roadmap remains useful before lesson history exists." />
          )}
        </section>

        <section className={styles.section} id="practice">
          <div className={styles.sectionHeading}>
            <span>Practice direction</span>
            <h2>One focused task before more complexity.</h2>
            <p>
              Practice is coach-authored and should match the current phase and available evidence.
              This bounded view shows up to 8 items, prioritizing current-phase direction before
              the newest retained history.
            </p>
          </div>
          {model.practiceItems.length ? (
            <ol className={styles.practiceList}>
              {model.practiceItems.map((item, index) => (
                <li id={`practice-${item.id}`} key={item.id}>
                  <span>{index + 1}</span>
                  <div>
                    <small>{item.status}</small>
                    <h3>{item.title}</h3>
                    <p>{item.instructions}</p>
                    {item.dosage ? <strong>{item.dosage}</strong> : null}
                    {item.successSignal ? <em>Look for: {item.successSignal}</em> : null}
                    {item.steps?.length || item.setup || item.equipment?.length ? (
                      <>
                        <details className={`${styles.drillDetails} ${styles.screenOnlyDisclosure}`}>
                          <summary>Full drill guidance</summary>
                          <DrillGuidance item={item} />
                        </details>
                        <div className={`${styles.drillDetails} ${styles.printOnlyContent}`}>
                          <b>Full drill guidance</b>
                          <DrillGuidance item={item} />
                        </div>
                      </>
                    ) : null}
                    {item.checkIns?.length ? (
                      <div className={styles.latestCheckIn}>
                        <span>Your latest recorded check-in</span>
                        <strong>{humanize(item.checkIns[0].completionStatus)}</strong>
                        <small>
                          {[
                            item.checkIns[0].perceivedDifficulty
                              ? `Difficulty: ${humanize(item.checkIns[0].perceivedDifficulty)}`
                              : null,
                            item.checkIns[0].confidenceRating
                              ? `Confidence: ${item.checkIns[0].confidenceRating}/5`
                              : null,
                            item.checkIns[0].requestHelp ? "Help requested" : null,
                          ].filter(Boolean).join(" · ")}
                        </small>
                        {item.checkIns[0].note ? <p>{item.checkIns[0].note}</p> : null}
                      </div>
                    ) : null}
                  {(item.status === "active" || item.status === "paused") &&
                  (model.access || preview) ? (
                    <PracticeCheckIn
                      practiceItemId={item.id}
                      sessionContext={sessionContext}
                      preview={preview}
                    />
                  ) : null}
                </div>
                </li>
              ))}
            </ol>
          ) : (
            <Empty title="No practice task is published." body="Ask your coach what to do before adding unsourced or generic drills." />
          )}
        </section>

        <section className={styles.section} id="media">
          <div className={styles.sectionHeading}>
            <span>Selected swing media</span>
            <h2>Clips and images chosen by your coach.</h2>
            <p>
              Nothing autoplays and Roadmap does not analyze the swing. Captions and coach
              context explain why each item belongs in this exact roadmap revision.
            </p>
          </div>
          {model.mediaItems?.length ? (
            <div className={styles.mediaGrid}>
              {model.mediaItems.map((item) => {
                const src = mediaUrl(item.mediaAssetId);
                return (
                  <article className={styles.mediaCard} id={`media-${item.mediaAssetId}`} key={item.attachmentId}>
                    {src && (item.mediaKind === "video" || item.mediaKind === "image") ? (
                      <PrivatePlanMedia
                        src={src}
                        mediaKind={item.mediaKind}
                        mimeType={item.mimeType}
                        altText={item.altText ?? null}
                        transcript={item.transcript ?? null}
                        posterSrc={
                          item.posterMediaAssetId
                            ? mediaUrl(item.posterMediaAssetId)
                            : null
                        }
                      />
                    ) : (
                      <div className={styles.mediaUnavailable} role="status">
                        Media unavailable on this connection
                      </div>
                    )}
                    <div>
                      <span>{humanize(item.role)} · {item.targetLabel}</span>
                      <h3>{item.caption || item.viewLabel || "Coach-selected media"}</h3>
                      {item.coachContext ? <p>{item.coachContext}</p> : null}
                      <small>
                        {[
                          item.viewLabel,
                          item.capturedAt ? formatDate(item.capturedAt) : null,
                          item.durationMs ? formatMediaDuration(item.durationMs) : null,
                        ].filter(Boolean).join(" · ")}
                      </small>
                      {item.transcript ? (
                        <>
                          <details className={`${styles.transcript} ${styles.screenOnlyDisclosure}`}>
                            <summary>Read transcript</summary>
                            <p>{item.transcript}</p>
                          </details>
                          <div className={`${styles.transcript} ${styles.printOnlyContent}`}>
                            <b>Transcript</b>
                            <p>{item.transcript}</p>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <Empty title="No media is selected for this revision." body="The complete text-first roadmap remains available on any connection." />
          )}
        </section>

        <section className={styles.section} id="data">
          <div className={styles.sectionHeading}>
            <span>Selected launch data</span>
            <h2>What changed, with the coach’s interpretation.</h2>
            <p>
              Only selected like-for-like metrics appear. Units are preserved exactly;
              missing values are never filled or converted.
            </p>
          </div>
          {model.launchComparisons?.length ? (
            <div className={styles.comparisonList}>
              {model.launchComparisons.map((comparison) => (
                <article className={styles.comparisonCard} id={`launch-comparison-${comparison.id}`} key={comparison.id}>
                  <div className={styles.comparisonNarrative}>
                    <span>Baseline / current</span>
                    <h3>{comparison.title}</h3>
                    <p>{comparison.coachInterpretation}</p>
                    <small>Limit: {comparison.limitations}</small>
                    {comparison.nextEvidenceNeeded ? <small>Next evidence: {comparison.nextEvidenceNeeded}</small> : null}
                  </div>
                  <div className={styles.metricList}>
                    {comparison.metrics.map((metric) => (
                      <MetricComparison key={`${comparison.id}:${metric.displayName}:${metric.unit}`} metric={metric} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty title="No launch-data comparison is published." body="Your roadmap does not need device data to remain complete and useful." />
          )}
        </section>

        <section className={styles.section} id="evidence">
          <div className={styles.sectionHeading}>
            <span>Progress evidence</span>
            <h2>Claims stay proportional to what was actually observed.</h2>
            <p>
              This bounded view shows up to 20 published items, prioritizing current-phase
              evidence before the most recently observed retained history.
            </p>
          </div>
          {model.evidenceItems.length ? (
            <div className={styles.cardGrid}>
              {model.evidenceItems.map((item) => (
                <article className={styles.evidenceCard} id={`evidence-${item.id}`} key={item.id}>
                  <div>
                    <span>{item.sourceLabel}</span>
                    {item.observedAt ? <time>{formatDate(item.observedAt)}</time> : null}
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  {item.lessonId ? (
                    <small>
                      Lesson association: {item.lessonTitle ? (
                        <a href={`#lesson-${item.lessonId}`}>{item.lessonTitle}</a>
                      ) : (
                        "Linked lesson"
                      )}
                    </small>
                  ) : null}
                  {item.metricName && item.metricValue !== null && item.metricValue !== undefined && item.metricUnit ? (
                    <strong>
                      {item.metricName}: {item.metricValue} {item.metricUnit}
                    </strong>
                  ) : null}
                  {item.valueText ? <p>{item.valueText}</p> : null}
                  <small>
                    {humanize(item.sourceType)} · {humanize(item.contextType)} · {humanize(item.maturity)}
                  </small>
                  {item.comparisonRole && item.comparisonRole !== "standalone" ? (
                    <small>
                      {humanize(item.comparisonRole)} comparison
                      {item.comparisonGroupId ? ` · Group ${item.comparisonGroupId}` : ""}
                    </small>
                  ) : null}
                  {item.isRepresentative ? <small>Coach selected as representative of the recorded context.</small> : null}
                  {item.limitations ? <small>Limit: {item.limitations}</small> : null}
                  {item.nextEvidenceNeeded ? (
                    <small>Next evidence needed: {item.nextEvidenceNeeded}</small>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <Empty title="No progress evidence is published." body="Absence of evidence is shown honestly; it is not filled with a prediction." />
          )}
        </section>

        <section className={styles.section} id="timeline">
          <div className={styles.sectionHeading}>
            <span>Coaching timeline</span>
            <h2>The journey, with history kept understandable.</h2>
            <p>
              Lessons, practice, check-ins, evidence, measurements, reviews, and private
              milestones are ordered by their recorded date. Use the filter when you need a
              narrower view.
            </p>
          </div>
          {model.milestones?.length ? (
            <div className={styles.milestoneGrid} aria-label="Selected milestones">
              {model.milestones.map((milestone) => (
                <article key={milestone.id}>
                  <span>Milestone · {formatDate(milestone.occurredAt)}</span>
                  <h3>{milestone.title}</h3>
                  <p>{milestone.summary}</p>
                </article>
              ))}
            </div>
          ) : null}
          {model.timeline?.length ? (
            <PlanTimeline items={model.timeline} />
          ) : (
            <Empty title="No timeline entries are published yet." body="The current roadmap remains the useful starting point." />
          )}
        </section>

        <section className={styles.section} id="review">
          <div className={styles.sectionHeading}>
            <span>Phase review</span>
            <h2>What changed, what remains uncertain, and what happens next?</h2>
          </div>
          {model.phaseReview ? (
            <div className={styles.reviewCard}>
              <strong>{model.phaseReview.summary}</strong>
              <div>
                <span>Original phase purpose</span>
                <p>{model.phaseReview.originalPurpose}</p>
              </div>
              {model.phaseReview.evidenceSummary ? (
                <div>
                  <span>Evidence considered</span>
                  <p>{model.phaseReview.evidenceSummary}</p>
                </div>
              ) : null}
              {model.phaseReview.sources.length ? (
                <div>
                  <span>Exact selected source records</span>
                  <ul>
                    {model.phaseReview.sources.map((source) => (
                      <li key={`${source.sourceType}:${source.id}`}>
                        <strong>{humanize(source.sourceType)}</strong>: {source.label}
                        {source.sourcePlanRevision ? (
                          <small> · reviewed at roadmap revision {source.sourcePlanRevision}</small>
                        ) : null}
                        {source.summary ? <p>{source.summary}</p> : null}
                        {source.associations.length ? (
                          <ul>
                            {source.associations.map((association) => (
                              <li key={association}>{association}</li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <span>Reliability</span>
                <p>{model.phaseReview.reliabilityLabel}</p>
              </div>
              {model.phaseReview.limitations ? (
                <div>
                  <span>What remains uncertain</span>
                  <p>{model.phaseReview.limitations}</p>
                </div>
              ) : null}
              {model.phaseReview.golferContribution ? (
                <div>
                  <span>Golfer contribution</span>
                  <p>{model.phaseReview.golferContribution}</p>
                </div>
              ) : null}
              <div>
                <span>Coach conclusion</span>
                <p>{model.phaseReview.coachConclusion}</p>
              </div>
              {model.phaseReview.remainingOpportunity ? (
                <div>
                  <span>Remaining opportunity</span>
                  <p>{model.phaseReview.remainingOpportunity}</p>
                </div>
              ) : null}
              {model.phaseReview.nextRecommendation ? (
                <div>
                  <span>Coach recommendation</span>
                  <p>{model.phaseReview.nextRecommendation}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <Empty title="This phase is not ready for review." body="A schedule alone does not prove that the phase objective is complete." />
          )}

          {model.coachingPackage ? (
            <article className={styles.packageCard}>
              <div>
                <span>Coach-recommended next option</span>
                <h3>{model.coachingPackage.title}</h3>
                <strong>
                  {packageDisplayPrice(model.coachingPackage)}
                </strong>
              </div>
              <div>
                <p>{model.coachingPackage.description}</p>
                {model.coachingPackage.inclusions.length ? (
                  <div className={styles.packageDetails}>
                    <strong>What is included</strong>
                    <ul>
                      {model.coachingPackage.inclusions.map((inclusion) => (
                        <li key={inclusion}>{inclusion}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {model.coachingPackage.cadence ? (
                  <small>Cadence: {model.coachingPackage.cadence}</small>
                ) : null}
                {model.coachingPackage.practiceExpectation ? (
                  <small>Practice expectation: {model.coachingPackage.practiceExpectation}</small>
                ) : null}
                {model.coachingPackage.evaluationDescription ? (
                  <small>Evaluation: {model.coachingPackage.evaluationDescription}</small>
                ) : null}
                <small>{model.coachingPackage.terms}</small>
                {!model.access && !preview ? (
                  <a
                    href={model.coachingPackage.externalActionUrl}
                    rel="external noopener noreferrer"
                    target="_blank"
                  >
                    Preview the coach&apos;s existing booking or purchase page
                  </a>
                ) : null}
                <p className={styles.externalNote}>
                  You will leave Roadmap. Booking or payment happens on the coach&apos;s external
                  service and is not complete until that service confirms it.
                </p>
              </div>
            </article>
          ) : (
            <div className={styles.choiceCard}>
              <strong>No package is attached to this plan.</strong>
              <p>You can ask the coach, wait, or continue practising independently.</p>
            </div>
          )}
          {model.access || preview ? (
            <GolferChoices
              coachName={model.coach.displayName}
              coachEmail={model.coach.contactEmail}
              externalActionUrl={model.coachingPackage?.externalActionUrl}
              sessionContext={sessionContext}
              preview={preview}
            />
          ) : coachMailtoUri ? (
            <div className={styles.choiceLinks}>
              <a href={coachMailtoUri}>Ask {model.coach.displayName}</a>
              <span>Review later</span>
              <span>Request reassessment</span>
              <span>Practise independently</span>
              <span>Decline without losing the plan</span>
            </div>
          ) : null}
        </section>
      </ContentElement>

      <footer className={styles.footer}>
        <div className={styles.coachSignature}>
          {coachProfilePhotoUrl ? (
            <PrivateBrandMark
              className={styles.coachPortrait}
              fallback={initials(model.coach.displayName)}
              src={coachProfilePhotoUrl}
            />
          ) : (
            <span aria-hidden="true" className={styles.coachPortrait}>
              {initials(model.coach.displayName)}
            </span>
          )}
          <div>
            <strong>{model.coach.businessName || model.coach.displayName}</strong>
            <span>Coach-authored private development plan</span>
          </div>
        </div>
        <div>
          <span>Updated {formatDate(model.plan.updatedAt)}</span>
          {model.access?.expiresAt ? <span>Access expires {formatDate(model.access.expiresAt)}</span> : null}
        </div>
      </footer>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.emptyState}>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function DrillGuidance({
  item,
}: {
  item: PlanViewModel["practiceItems"][number];
}) {
  return (
    <>
      {item.purpose ? <p><b>Purpose:</b> {item.purpose}</p> : null}
      {item.whenItFits ? <p><b>When it fits:</b> {item.whenItFits}</p> : null}
      {item.equipment?.length ? (
        <p><b>Equipment:</b> {item.equipment.join(", ")}</p>
      ) : null}
      {item.setup ? <p><b>Setup:</b> {item.setup}</p> : null}
      {item.steps?.length ? (
        <div>
          <b>Steps</b>
          <ol>
            {item.steps.map((step, stepIndex) => (
              <li key={`${item.id}:step:${stepIndex}`}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {item.feelOrCue ? <p><b>Feel or cue:</b> {item.feelOrCue}</p> : null}
      {item.commonMiss ? <p><b>Common miss:</b> {item.commonMiss}</p> : null}
      {item.stopOrAskRule ? <p><b>Stop and ask:</b> {item.stopOrAskRule}</p> : null}
      {item.constraintOrAdaptation ? <p><b>Adaptation:</b> {item.constraintOrAdaptation}</p> : null}
      {item.progression ? <p><b>Progression:</b> {item.progression}</p> : null}
      {item.regression ? <p><b>Regression:</b> {item.regression}</p> : null}
    </>
  );
}

function MetricComparison({
  metric,
}: {
  metric: NonNullable<PlanViewModel["launchComparisons"]>[number]["metrics"][number];
}) {
  const scale = Math.max(Math.abs(metric.baselineValue), Math.abs(metric.currentValue), 1);
  const baselineWidth = Math.max(3, (Math.abs(metric.baselineValue) / scale) * 100);
  const currentWidth = Math.max(3, (Math.abs(metric.currentValue) / scale) * 100);
  const delta = `${metric.delta > 0 ? "+" : ""}${formatMetricValue(metric.delta)} ${metric.unit}`;
  return (
    <figure className={styles.metricComparison}>
      <figcaption>
        <strong>{metric.displayName}</strong>
        <span>Change: {delta}</span>
      </figcaption>
      <div className={styles.metricBarRow}>
        <span>Baseline</span>
        <i style={{ width: `${baselineWidth}%` }} aria-hidden="true" />
        <b>{formatMetricValue(metric.baselineValue)} {metric.unit}</b>
      </div>
      <div className={styles.metricBarRow}>
        <span>Current</span>
        <i style={{ width: `${currentWidth}%` }} aria-hidden="true" />
        <b>{formatMetricValue(metric.currentValue)} {metric.unit}</b>
      </div>
      <p className={styles.srOnly}>
        {metric.displayName}: baseline {formatMetricValue(metric.baselineValue)} {metric.unit};
        current {formatMetricValue(metric.currentValue)} {metric.unit}; change {delta}.
      </p>
    </figure>
  );
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(value / 100);
}

function formatMetricValue(value: number): string {
  return new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }).format(value);
}

function formatMediaDuration(value: number): string {
  const seconds = Math.max(0, Math.round(value / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function packageDisplayPrice(
  coachingPackage: NonNullable<PlanViewModel["coachingPackage"]>,
): string {
  if (
    coachingPackage.priceCents != null &&
    coachingPackage.currency &&
    /^[A-Z]{3}$/.test(coachingPackage.currency)
  ) {
    return formatMoney(coachingPackage.priceCents, coachingPackage.currency);
  }

  return coachingPackage.currentDetailsText || "Confirm current details with your coach";
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function phaseStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Current phase",
    paused: "Paused phase",
    complete: "Completed phase",
    planned: "Planned phase",
    revised: "Revised phase",
    canceled: "Canceled phase",
  };
  return labels[status] ?? humanize(status);
}
