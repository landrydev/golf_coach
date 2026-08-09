"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clientMutationErrorMessage,
  requestClientMutation,
} from "@/lib/client-mutation-recovery";
import styles from "../../workspace.module.css";

type PhaseOption = { id: string; number: number; title: string; purpose: string; status: string };
type ReviewTransition = "continue" | "pause" | "advance" | "complete_plan";
type ContentItem = { id: string; title: string };
type WithdrawableContentKind = "lesson" | "practice" | "evidence";
const ERROR_SUMMARY_ID = "living-plan-forms-error-summary";

export function LivingPlanForms({
  planId,
  planRevision,
  phases,
  lessons,
  practiceItems,
  evidenceItems,
}: {
  planId: string;
  planRevision: number;
  phases: PhaseOption[];
  lessons: ContentItem[];
  practiceItems: ContentItem[];
  evidenceItems: ContentItem[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [reviewTransition, setReviewTransition] = useState<ReviewTransition>("continue");
  const currentPhase =
    phases.find((phase) => phase.status === "active") ??
    phases.find((phase) => phase.status === "paused");
  const nextPhase = currentPhase
    ? phases.find((phase) => phase.number === currentPhase.number + 1 && phase.status === "planned")
    : undefined;
  const contentGroups: Array<{
    kind: WithdrawableContentKind;
    heading: string;
    action: string;
    items: ContentItem[];
  }> = [
    { kind: "lesson", heading: "Lesson chapters", action: "Archive", items: lessons },
    {
      kind: "practice",
      heading: "Current practice direction",
      action: "Retire",
      items: practiceItems,
    },
    { kind: "evidence", heading: "Published evidence", action: "Withdraw", items: evidenceItems },
  ];
  const hasPublishedContent = contentGroups.some((group) => group.items.length > 0);

  async function submit(event: FormEvent<HTMLFormElement>, kind: string) {
    event.preventDefault();
    formRef.current = event.currentTarget;
    setBusy(kind);
    setMessage("");
    setError(false);
    const form = event.currentTarget;
    const payload = {
      kind,
      ...Object.fromEntries(new FormData(form).entries()),
      expectedRevision: planRevision,
    };
    try {
      const response = await requestClientMutation(`/api/plans/${encodeURIComponent(planId)}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message || "The plan update could not be saved.");
      form.reset();
      setMessage(
        "Plan updated. Any previous share link was revoked; review the refreshed golfer view before publishing again.",
      );
      router.refresh();
    } catch (submitError) {
      setError(true);
      setMessage(
        clientMutationErrorMessage(
          submitError,
          "the plan update was saved",
          "reload_before_retry",
          "The plan update could not be saved.",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(
    event: FormEvent<HTMLFormElement>,
    kind: WithdrawableContentKind,
    itemId: string,
  ) {
    event.preventDefault();
    formRef.current = event.currentTarget;
    const operation = `withdraw:${kind}:${itemId}`;
    setBusy(operation);
    setMessage("");
    setError(false);
    try {
      const response = await requestClientMutation(
        `/api/plans/${encodeURIComponent(planId)}/content`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            itemId,
            expectedRevision: planRevision,
            confirmation: "withdraw_plan_content",
          }),
        },
      );
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(
          result.error?.message || "The plan content could not be withdrawn.",
        );
      }
      setMessage(
        "Content withdrawn from the golfer view. Previous access was revoked; add a corrected replacement if needed, then review before republishing.",
      );
      router.refresh();
    } catch (withdrawError) {
      setError(true);
      setMessage(
        clientMutationErrorMessage(
          withdrawError,
          "the plan content was withdrawn",
          "reload_before_retry",
          "The plan content could not be withdrawn.",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.formCard} aria-labelledby="living-plan-heading">
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.eyebrow}>Living plan updates</span>
          <h2 id="living-plan-heading">Add only the next useful chapter.</h2>
        </div>
      </div>
      <p className={styles.muted}>
        Every update creates a new plan revision and revokes previous access until you review
        and republish the exact golfer view.
      </p>

      <div className={styles.form} style={{ marginTop: "1rem" }}>
        <details>
          <summary>Add a completed lesson chapter</summary>
          <form
            className={styles.form}
            aria-describedby={ERROR_SUMMARY_ID}
            onSubmit={(event) => submit(event, "lesson")}
          >
            <PhaseSelect phases={phases} />
            <div className={styles.fieldGrid}>
              <Field name="title" label="Lesson title" required maxLength={160} />
              <Field name="occurredAt" label="Lesson date" type="date" required />
              <TextArea name="purpose" label="Purpose and concise summary" required maxLength={2_000} />
              <TextArea name="coachObservation" label="Coach observation" maxLength={2_000} />
              <TextArea name="takeaway" label="Current takeaway" maxLength={1_000} />
              <TextArea name="nextCheck" label="Next check" maxLength={1_000} />
              <TextArea name="phaseConnection" label="How this connects to the phase" maxLength={1_000} />
            </div>
            <Submit label="Save lesson chapter" waiting={busy === "lesson"} />
          </form>
        </details>

        <details>
          <summary>Add or replace the current practice direction</summary>
          <form
            className={styles.form}
            aria-describedby={ERROR_SUMMARY_ID}
            onSubmit={(event) => submit(event, "practice")}
          >
            <PhaseSelect phases={phases} />
            <div className={styles.fieldGrid}>
              <Field name="title" label="Practice title" required maxLength={160} />
              <Field name="timeOrCadence" label="Time or cadence" maxLength={500} />
              <TextArea name="objective" label="Objective" required maxLength={1_500} />
              <TextArea name="rationale" label="Why this task fits now" required maxLength={1_500} />
              <TextArea
                name="instructions"
                label="Practice steps — one per line"
                required
                maxLength={4_000}
              />
              <TextArea name="successCheck" label="What to look for" required maxLength={1_000} />
              <TextArea name="commonMistake" label="Common mistake (optional)" maxLength={1_000} />
              <TextArea name="stopOrAskRule" label="When to stop or ask" required maxLength={1_000} />
              <TextArea name="constraintNote" label="Constraint note (optional)" maxLength={1_000} />
            </div>
            <Submit label="Save practice direction" waiting={busy === "practice"} />
          </form>
        </details>

        <details>
          <summary>Add evidence with its limits</summary>
          <form
            className={styles.form}
            aria-describedby={ERROR_SUMMARY_ID}
            onSubmit={(event) => submit(event, "evidence")}
          >
            <PhaseSelect phases={phases} />
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                Evidence type
                <select name="evidenceType" defaultValue="coach_observation">
                  <option value="coach_observation">Coach observation</option>
                  <option value="golfer_report">Golfer report</option>
                  <option value="measurement">Measurement</option>
                  <option value="outcome_count">Outcome count</option>
                  <option value="comparison">Comparison</option>
                  <option value="note">Note</option>
                </select>
              </label>
              <label className={styles.field}>
                Context
                <select name="contextType" defaultValue="practice">
                  <option value="assessment">Assessment</option>
                  <option value="lesson">Lesson</option>
                  <option value="practice">Practice</option>
                  <option value="on_course">On course</option>
                  <option value="phase_review">Phase review</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <Field name="title" label="Evidence title" required maxLength={160} />
              <Field name="observedAt" label="Observed date (optional)" type="date" />
              <Field name="sourceLabel" label="Source label" required maxLength={300} />
              <label className={styles.field}>
                Source type
                <select name="sourceType" defaultValue="coach_observed">
                  <option value="coach_observed">Coach observed</option>
                  <option value="golfer_reported">Golfer reported</option>
                  <option value="device">Device</option>
                  <option value="document">Document</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              <TextArea name="claim" label="Narrow claim (optional)" maxLength={1_500} />
              <TextArea name="interpretation" label="Coach interpretation" required maxLength={2_000} />
              <TextArea name="limitation" label="Evidence limitation" required maxLength={1_500} />
              <label className={styles.field}>
                Evidence maturity
                <select name="maturity" defaultValue="single_observation">
                  <option value="single_observation">Single observation</option>
                  <option value="early_indication">Early indication</option>
                  <option value="repeated_practice">Repeated practice</option>
                  <option value="on_course_observation">On-course observation</option>
                  <option value="insufficient">Insufficient</option>
                </select>
              </label>
              <TextArea name="nextEvidenceNeeded" label="Next evidence needed (optional)" maxLength={1_000} />
            </div>
            <Submit label="Save evidence" waiting={busy === "evidence"} />
          </form>
        </details>

        <details>
          <summary>Complete a phase review and choose what happens next</summary>
          {currentPhase ? (
            <form
              className={styles.form}
              aria-describedby={ERROR_SUMMARY_ID}
              onSubmit={(event) => submit(event, "review")}
            >
              <input type="hidden" name="phaseId" value={currentPhase.id} />
              <p className={styles.muted}>
                Reviewing Phase {currentPhase.number} — {currentPhase.title}. Roadmap applies only
                the transition and outcome you select; it does not infer a result or recommend a package.
              </p>
              <label className={styles.field}>
                After this review
                <select
                  name="transition"
                  value={reviewTransition}
                  onChange={(event) => setReviewTransition(event.target.value as ReviewTransition)}
                >
                  <option value="continue">Continue this phase</option>
                  <option value="pause">Pause this phase and plan</option>
                  {nextPhase ? (
                    <option value="advance">Complete and advance to Phase {nextPhase.number}</option>
                  ) : null}
                  <option value="complete_plan">Complete this phase and the plan</option>
                </select>
              </label>
              {reviewTransition === "continue" ? (
                <label className={styles.field}>
                  Coach-assessed outcome
                  <select name="outcome" defaultValue="partially_complete">
                    <option value="partially_complete">Partially complete</option>
                    <option value="revised">Direction revised</option>
                    <option value="insufficient_evidence">Insufficient evidence</option>
                    <option value="goal_changed">Goal changed</option>
                  </select>
                </label>
              ) : (
                <input
                  type="hidden"
                  name="outcome"
                  value={reviewTransition === "pause" ? "paused" : "complete"}
                />
              )}
              <div className={styles.fieldGrid}>
                <TextArea name="originalPurpose" label="Original phase purpose" required maxLength={1_500} />
                <TextArea name="baselineSummary" label="Starting condition" required maxLength={1_500} />
                <TextArea name="workCompleted" label="Work completed" required maxLength={2_000} />
                <TextArea name="changeSummary" label="What changed" required maxLength={2_000} />
                <Field name="reliabilityLabel" label="Reliability label" required maxLength={500} />
                <TextArea name="limitations" label="What remains uncertain" required maxLength={1_500} />
                <TextArea name="golferContribution" label="Golfer contribution (optional)" maxLength={1_500} />
                <TextArea name="coachConclusion" label="Coach conclusion" required maxLength={2_000} />
                <TextArea name="remainingOpportunity" label="Remaining opportunity (optional)" maxLength={1_500} />
                {reviewTransition === "advance" && nextPhase ? (
                  <>
                    <input type="hidden" name="nextPhaseId" value={nextPhase.id} />
                    <Field
                      name="nextPriorityTitle"
                      label={`Current priority for Phase ${nextPhase.number}`}
                      required
                      maxLength={160}
                    />
                    <TextArea
                      name="nextPriorityRationale"
                      label="Why this is the next current priority"
                      required
                      maxLength={1_500}
                    />
                    <TextArea
                      name="nextPhaseRationale"
                      label={`Why Phase ${nextPhase.number} starts now`}
                      required
                      maxLength={1_500}
                    />
                  </>
                ) : (
                  <TextArea
                    name="nextPhaseRationale"
                    label="Future direction note (optional)"
                    maxLength={1_500}
                  />
                )}
                <TextArea
                  name="independentPracticeAlternative"
                  label="Independent-practice alternative (optional)"
                  maxLength={1_500}
                />
              </div>
              <Submit label="Save review and apply transition" waiting={busy === "review"} />
            </form>
          ) : (
            <p className={styles.muted} role="note">
              This plan has no active or paused phase available for review.
            </p>
          )}
        </details>

        {hasPublishedContent ? (
          <details>
            <summary>Correct or withdraw existing golfer-view content</summary>
            <p className={styles.muted}>
              Roadmap retains the historical record and removes the selected item from the
              golfer view. This control lists only the bounded current snapshot shown below;
              earlier retained history stays outside that share snapshot. To correct an included
              item, withdraw it and add a truthful replacement.
            </p>
            {contentGroups.map((group) =>
              group.items.length ? (
                <div key={group.kind}>
                  <h3>{group.heading}</h3>
                  <ul className={styles.list}>
                    {group.items.map((item) => {
                      const operation = `withdraw:${group.kind}:${item.id}`;
                      return (
                        <li key={item.id}>
                          <div>
                            <strong>{item.title}</strong>
                            <span>Currently included in the golfer view</span>
                          </div>
                          <form
                            ref={busy === operation ? formRef : undefined}
                            aria-describedby={ERROR_SUMMARY_ID}
                            onSubmit={(event) => withdraw(event, group.kind, item.id)}
                          >
                            <button
                              className={styles.secondaryButton}
                              type="submit"
                              disabled={busy !== null}
                            >
                              {busy === operation ? "Saving..." : `${group.action} item`}
                            </button>
                          </form>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null,
            )}
          </details>
        ) : null}
      </div>

      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={error ? message : ""}
        formRef={formRef}
        className={styles.errorStatus}
      />
      {!error && message ? (
        <div className={styles.formStatus} role="status">
          {message}
        </div>
      ) : null}
    </section>
  );
}

function PhaseSelect({ phases }: { phases: PhaseOption[] }) {
  return (
    <label className={styles.field}>
      Coaching phase
      <select name="phaseId" required defaultValue={phases.find((phase) => phase.status === "active")?.id || phases[0]?.id}>
        {phases.map((phase) => (
          <option value={phase.id} key={phase.id}>
            Phase {phase.number} — {phase.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field(props: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
}) {
  const { label, ...inputProps } = props;
  return (
    <label className={styles.field}>
      {label}
      <input {...inputProps} />
    </label>
  );
}

function TextArea(props: { name: string; label: string; required?: boolean; maxLength?: number }) {
  return (
    <label className={styles.fullField}>
      {props.label}
      <textarea name={props.name} required={props.required} maxLength={props.maxLength} />
    </label>
  );
}

function Submit({ label, waiting }: { label: string; waiting: boolean }) {
  return (
    <div className={styles.actions}>
      <button className={styles.primaryButton} type="submit" disabled={waiting}>
        {waiting ? "Saving…" : label}
      </button>
    </div>
  );
}
