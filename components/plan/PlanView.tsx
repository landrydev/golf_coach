import styles from "./plan.module.css";
import type { PlanViewModel } from "./types";
import { GolferChoices } from "./GolferChoices";
import { CloseRoadmap } from "./CloseRoadmap";
import { safeCoachAccent } from "@/lib/colors";

export function PlanView({ model, preview = false }: { model: PlanViewModel; preview?: boolean }) {
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
          <span aria-hidden="true">{initials(model.coach.displayName)}</span>
          <strong>{model.coach.businessName || model.coach.displayName}</strong>
        </a>
        <div className={styles.headerTools}>
          <div className={styles.identity}>
            <span>Private coaching plan</span>
            <strong>{model.golfer.displayName}</strong>
          </div>
          {!preview && model.access ? <CloseRoadmap /> : null}
        </div>
      </header>
      <nav className={styles.nav} aria-label="Coaching plan sections">
        <a href="#now">Now</a>
        <a href="#goal">Goal</a>
        <a href="#roadmap">Roadmap</a>
        <a href="#lessons">Lessons</a>
        <a href="#practice">Practice</a>
        <a href="#evidence">Evidence</a>
        <a href="#review">Phase review</a>
      </nav>

      <main id="plan-content">
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
            <h1>{model.priority?.title || currentPhase?.title || model.plan.title}</h1>
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
            <p>Concise chapters preserve direction without becoming a transcript or media archive.</p>
          </div>
          {model.lessons.length ? (
            <div className={styles.cardGrid}>
              {model.lessons.map((lesson, index) => (
                <article className={styles.lessonCard} key={lesson.id}>
                  <div>
                    <span>Lesson {index + 1}</span>
                    {lesson.happenedAt ? <time>{formatDate(lesson.happenedAt)}</time> : null}
                  </div>
                  <h3>{lesson.title}</h3>
                  <p>{lesson.summary}</p>
                  {lesson.coachObservation ? (
                    <dl>
                      <dt>Coach observation</dt>
                      <dd>{lesson.coachObservation}</dd>
                    </dl>
                  ) : null}
                  {lesson.nextCheck ? (
                    <dl>
                      <dt>Next check</dt>
                      <dd>{lesson.nextCheck}</dd>
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
            <p>Practice is coach-authored and should match the current phase and available evidence.</p>
          </div>
          {model.practiceItems.length ? (
            <ol className={styles.practiceList}>
              {model.practiceItems.map((item, index) => (
                <li key={item.id}>
                  <span>{index + 1}</span>
                  <div>
                    <small>{item.status}</small>
                    <h3>{item.title}</h3>
                    <p>{item.instructions}</p>
                    {item.dosage ? <strong>{item.dosage}</strong> : null}
                    {item.successSignal ? <em>Look for: {item.successSignal}</em> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <Empty title="No practice task is published." body="Ask your coach what to do before adding unsourced or generic drills." />
          )}
        </section>

        <section className={styles.section} id="evidence">
          <div className={styles.sectionHeading}>
            <span>Progress evidence</span>
            <h2>Claims stay proportional to what was actually observed.</h2>
          </div>
          {model.evidenceItems.length ? (
            <div className={styles.cardGrid}>
              {model.evidenceItems.map((item) => (
                <article className={styles.evidenceCard} key={item.id}>
                  <div>
                    <span>{item.sourceLabel}</span>
                    {item.observedAt ? <time>{formatDate(item.observedAt)}</time> : null}
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <small>
                    {humanize(item.sourceType)} · {humanize(item.contextType)} · {humanize(item.maturity)}
                  </small>
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
              preview={preview}
            />
          ) : model.coach.contactEmail ? (
            <div className={styles.choiceLinks}>
              <a href={`mailto:${model.coach.contactEmail}`}>Ask {model.coach.displayName}</a>
              <span>Review later</span>
              <span>Request reassessment</span>
              <span>Practise independently</span>
              <span>Decline without losing the plan</span>
            </div>
          ) : null}
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <strong>{model.coach.businessName || model.coach.displayName}</strong>
          <span>Coach-authored private development plan</span>
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
