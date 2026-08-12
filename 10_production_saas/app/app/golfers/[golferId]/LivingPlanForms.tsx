"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AuthoringDraftRecovery,
  type AuthoringDraftUiState,
} from "@/components/forms/AuthoringDraftRecovery";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  captureAuthoringDraftValues,
  clearAuthoringDraft,
  discardAuthoringDraft,
  persistAuthoringDraft,
  reconcileAuthoringDraft,
  restoreAuthoringDraftValues,
  type AuthoringDraftAction,
  type AuthoringDraftScope,
} from "@/lib/client-authoring-draft-recovery";
import {
  clientMutationErrorMessage,
  isClientMutationApiError,
  isClientMutationOutcomeUnknown,
  requestClientMutation,
} from "@/lib/client-mutation-recovery";
import {
  isPlanContentCreatedResponse,
  isPlanContentWithdrawnResponse,
  requireExactClientMutationJson,
  type PlanContentKind,
  type WithdrawablePlanContentKind,
} from "@/lib/instructor-mutation-response-contracts";
import styles from "../../workspace.module.css";

type PhaseOption = { id: string; number: number; title: string; purpose: string; status: string };
type ContentItem = { id: string; title: string };
type LivingPlanContentKind = Exclude<PlanContentKind, "review">;
const ERROR_SUMMARY_ID = "living-plan-forms-error-summary";
const CONTENT_KINDS: readonly LivingPlanContentKind[] = [
  "lesson",
  "practice",
  "evidence",
];

export function LivingPlanForms({
  planId,
  planRevision,
  planStatus,
  recoveryScope,
  phases,
  lessons,
  practiceItems,
  evidenceItems,
}: {
  planId: string;
  planRevision: number;
  planStatus: string;
  recoveryScope: string;
  phases: PhaseOption[];
  lessons: ContentItem[];
  practiceItems: ContentItem[];
  evidenceItems: ContentItem[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const authoringFormRefs = useRef<Partial<Record<LivingPlanContentKind, HTMLFormElement>>>({});
  const mutationInFlightRef = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [draftRecoveries, setDraftRecoveries] = useState<
    Record<LivingPlanContentKind, AuthoringDraftUiState>
  >({
    lesson: { kind: "checking" },
    practice: { kind: "checking" },
    evidence: { kind: "checking" },
  });
  const draftScopes = useMemo<Record<LivingPlanContentKind, AuthoringDraftScope>>(
    () => ({
      lesson: livingDraftScope(recoveryScope, planId, "lesson"),
      practice: livingDraftScope(recoveryScope, planId, "practice"),
      evidence: livingDraftScope(recoveryScope, planId, "evidence"),
    }),
    [planId, recoveryScope],
  );
  const authoritativeDraftState = useMemo(
    () => ({
      planId,
      revision: planRevision,
      status: planStatus,
      phases: phases.map(({ id, number, status }) => ({ id, number, status })),
      lessons: lessons.map(({ id, title }) => ({ id, title })),
      practiceItems: practiceItems.map(({ id, title }) => ({ id, title })),
      evidenceItems: evidenceItems.map(({ id, title }) => ({ id, title })),
    }),
    [evidenceItems, lessons, phases, planId, planRevision, planStatus, practiceItems],
  );
  const contentGroups: Array<{
    kind: WithdrawablePlanContentKind;
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

  useEffect(() => {
    let current = true;
    void Promise.all(
      CONTENT_KINDS.map(async (kind) => [
        kind,
        await reconcileAuthoringDraft({
          scope: draftScopes[kind],
          currentRevision: planRevision,
          currentState: authoritativeDraftState,
        }),
      ] as const),
    ).then((entries) => {
      if (current) {
        setDraftRecoveries(Object.fromEntries(entries) as Record<LivingPlanContentKind, AuthoringDraftUiState>);
      }
    });
    return () => {
      current = false;
    };
  }, [authoritativeDraftState, draftScopes, planRevision]);

  function actionCanMutate(kind?: LivingPlanContentKind): boolean {
    return CONTENT_KINDS.every((candidate) => {
      const recovery = draftRecoveries[candidate];
      if (recovery.kind === "empty" || recovery.kind === "applied") return true;
      return candidate === kind && recovery.kind === "restored";
    });
  }

  function startMutation(kind?: LivingPlanContentKind): boolean {
    if (
      mutationInFlightRef.current ||
      busy !== null ||
      reloadRequired ||
      !actionCanMutate(kind)
    ) {
      return false;
    }
    mutationInFlightRef.current = true;
    return true;
  }

  function handleMutationFailure(failure: unknown): void {
    const authoritativeReloadRequired =
      isClientMutationOutcomeUnknown(failure) ||
      (isClientMutationApiError(failure) && failure.status === 409);
    if (authoritativeReloadRequired) {
      setReloadRequired(true);
    } else {
      mutationInFlightRef.current = false;
    }
    setError(true);
    setBusy(null);
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
    kind: LivingPlanContentKind,
  ) {
    event.preventDefault();
    if (!startMutation(kind)) return;
    formRef.current = event.currentTarget;
    setBusy(kind);
    setMessage("");
    setError(false);
    const form = event.currentTarget;
    const values = captureAuthoringDraftValues(form);
    if (!values) {
      mutationInFlightRef.current = false;
      setBusy(null);
      setError(true);
      setMessage("The living-plan draft could not be captured safely. No request was sent.");
      return;
    }
    const savedDraft = await persistAuthoringDraft({
      scope: draftScopes[kind],
      baseRevision: planRevision,
      baseState: authoritativeDraftState,
      values,
      ui: {},
    });
    if (savedDraft.kind === "blocked") {
      mutationInFlightRef.current = false;
      setDraftRecoveries((current) => ({ ...current, [kind]: savedDraft }));
      setBusy(null);
      setError(true);
      setMessage(
        "Roadmap could not safely preserve this living-plan draft in the browser tab. No request was sent.",
      );
      return;
    }
    setDraftRecoveries((current) => ({
      ...current,
      [kind]: { kind: "restored" },
    }));
    const payload = {
      kind,
      ...values,
      expectedRevision: planRevision,
    };
    try {
      const response = await requestClientMutation(`/api/plans/${encodeURIComponent(planId)}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await requireExactClientMutationJson(
        response,
        201,
        (value) =>
          isPlanContentCreatedResponse(value, {
            kind,
            revision: planRevision + 1,
          }),
        "The plan update could not be saved.",
      );
      clearAuthoringDraft(savedDraft.draft);
    } catch (submitError) {
      handleMutationFailure(submitError);
      setMessage(
        clientMutationErrorMessage(
          submitError,
          "the plan update was saved",
          "reload_before_retry",
          "The plan update could not be saved.",
        ),
      );
      return;
    }

    try {
      form.reset();
    } catch {
      // The confirmed plan update remains successful if local cleanup fails.
    }
    setMessage(
      "Plan updated. Any previous share link was revoked; review the refreshed golfer view before publishing again.",
    );
    setReloadRequired(true);
    setBusy(null);
    try {
      router.refresh();
    } catch {
      // The confirmed plan update remains successful if refresh fails.
    }
  }

  async function withdraw(
    event: FormEvent<HTMLFormElement>,
    kind: WithdrawablePlanContentKind,
    itemId: string,
    itemTitle: string,
  ) {
    event.preventDefault();
    if (
      mutationInFlightRef.current ||
      busy !== null ||
      reloadRequired ||
      !actionCanMutate()
    ) return;
    if (
      !window.confirm(
        `Withdraw the exact ${kind} item "${itemTitle}" from this golfer view? This creates plan revision ${planRevision + 1} and revokes current private access.`,
      )
    ) {
      return;
    }
    if (!startMutation()) return;
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
      await requireExactClientMutationJson(
        response,
        200,
        (value) =>
          isPlanContentWithdrawnResponse(value, {
            itemId,
            kind,
            revision: planRevision + 1,
          }),
        "The plan content could not be withdrawn.",
      );
    } catch (withdrawError) {
      handleMutationFailure(withdrawError);
      setMessage(
        clientMutationErrorMessage(
          withdrawError,
          "the plan content was withdrawn",
          "reload_before_retry",
          "The plan content could not be withdrawn.",
        ),
      );
      return;
    }

    setMessage(
      "Content withdrawn from the golfer view. Previous access was revoked; add a corrected replacement if needed, then review before republishing.",
    );
    setReloadRequired(true);
    setBusy(null);
    try {
      router.refresh();
    } catch {
      // The confirmed withdrawal remains successful if refresh fails.
    }
  }

  function renderDraftRecovery(kind: LivingPlanContentKind, label: string) {
    const recovery = draftRecoveries[kind];
    return (
      <AuthoringDraftRecovery
        state={recovery}
        label={label}
        noticeClassName={styles.notice}
        actionsClassName={styles.actions}
        buttonClassName={styles.secondaryButton}
        onRestore={() => {
          if (recovery.kind !== "unchanged") {
            setDraftRecoveries((current) => ({
              ...current,
              [kind]: { kind: "blocked", reason: "invalid" },
            }));
            return;
          }
          const form = authoringFormRefs.current[kind];
          if (!form || !restoreAuthoringDraftValues(form, recovery.draft.envelope.values)) {
            setDraftRecoveries((current) => ({
              ...current,
              [kind]: { kind: "blocked", reason: "invalid" },
            }));
            return;
          }
          setDraftRecoveries((current) => ({
            ...current,
            [kind]: { kind: "restored" },
          }));
        }}
        onDiscard={() => {
          const reload = recovery.kind === "blocked" || recovery.kind === "diverged";
          if (!discardAuthoringDraft(draftScopes[kind])) {
            setDraftRecoveries((current) => ({
              ...current,
              [kind]: { kind: "blocked", reason: "unavailable" },
            }));
            return;
          }
          setDraftRecoveries((current) => ({
            ...current,
            [kind]: { kind: "empty" },
          }));
          if (reload) window.location.reload();
        }}
      />
    );
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

      <fieldset
        disabled={reloadRequired || busy !== null}
        style={{ border: 0, margin: 0, minInlineSize: 0, padding: 0 }}
      >
      <div className={styles.form} style={{ marginTop: "1rem" }}>
        <details>
          <summary>Add a completed lesson chapter</summary>
          {renderDraftRecovery("lesson", "lesson chapter")}
          <form
            ref={(element) => {
              if (element) authoringFormRefs.current.lesson = element;
              else delete authoringFormRefs.current.lesson;
            }}
            className={styles.form}
            aria-describedby={ERROR_SUMMARY_ID}
            method="post"
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
            <Submit
              label="Save lesson chapter"
              waiting={busy === "lesson"}
              locked={!actionCanMutate("lesson")}
            />
          </form>
        </details>

        <details>
          <summary>Add or replace the current practice direction</summary>
          {renderDraftRecovery("practice", "practice direction")}
          <form
            ref={(element) => {
              if (element) authoringFormRefs.current.practice = element;
              else delete authoringFormRefs.current.practice;
            }}
            className={styles.form}
            aria-describedby={ERROR_SUMMARY_ID}
            method="post"
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
            <Submit
              label="Save practice direction"
              waiting={busy === "practice"}
              locked={!actionCanMutate("practice")}
            />
          </form>
        </details>

        <details>
          <summary>Add evidence with its limits</summary>
          {renderDraftRecovery("evidence", "evidence")}
          <form
            ref={(element) => {
              if (element) authoringFormRefs.current.evidence = element;
              else delete authoringFormRefs.current.evidence;
            }}
            className={styles.form}
            aria-describedby={ERROR_SUMMARY_ID}
            method="post"
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
            <details className={styles.optionalFields}>
              <summary>Optional structured value or baseline/current role</summary>
              <div className={styles.fieldGrid}>
                <Field
                  name="metricName"
                  label="Metric name (optional)"
                  maxLength={160}
                />
                <Field
                  name="metricValue"
                  label="Numeric value (optional)"
                  type="number"
                  step="any"
                />
                <Field
                  name="metricUnit"
                  label="Exact unit (required with a numeric value)"
                  maxLength={80}
                />
                <TextArea
                  name="valueText"
                  label="Non-numeric value or result text (optional)"
                  maxLength={1_000}
                />
                <label className={styles.field}>
                  Comparison role
                  <select name="comparisonRole" defaultValue="standalone">
                    <option value="standalone">Standalone</option>
                    <option value="baseline">Baseline</option>
                    <option value="current">Current</option>
                  </select>
                </label>
                <Field
                  name="comparisonGroupId"
                  label="Shared comparison group label (baseline/current only)"
                  maxLength={80}
                />
                <label className={styles.field}>
                  Representative of the context recorded?
                  <select name="isRepresentative" defaultValue="false">
                    <option value="false">No or not established</option>
                    <option value="true">Yes — coach selected</option>
                  </select>
                </label>
              </div>
              <p className={styles.muted}>
                Roadmap preserves the exact number and unit you enter. It does not convert,
                normalize, or interpret a device value automatically.
              </p>
            </details>
            <Submit
              label="Save evidence"
              waiting={busy === "evidence"}
              locked={!actionCanMutate("evidence")}
            />
          </form>
        </details>

        <details>
          <summary>Complete a source-backed phase review</summary>
          <p className={styles.muted}>
            Phase conclusions now begin by selecting the exact lessons, practice, check-ins,
            media, launch data, and evidence the coach reviewed.
          </p>
          <Link
            className={styles.secondaryButton}
            href={`/app/coaching/plans/${encodeURIComponent(planId)}?tab=reviews`}
          >
            Open source-first review builder
          </Link>
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
                            method="post"
                            onSubmit={(event) =>
                              withdraw(event, group.kind, item.id, item.title)
                            }
                          >
                            <button
                              className={styles.secondaryButton}
                              type="submit"
                              disabled={busy !== null || !actionCanMutate()}
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
      </fieldset>

      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={error ? message : ""}
        formRef={formRef}
        className={styles.errorStatus}
      />
      {reloadRequired ? (
        <div className={styles.notice} role="alert">
          <strong>Reload before making another living-plan change.</strong>
          <span>
            All plan mutation controls are locked until the authoritative revision and
            sharing state are loaded.
          </span>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload and check plan state
          </button>
        </div>
      ) : null}
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
  step?: number | "any";
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

function Submit({
  label,
  waiting,
  locked,
}: {
  label: string;
  waiting: boolean;
  locked: boolean;
}) {
  return (
    <div className={styles.actions}>
      <button className={styles.primaryButton} type="submit" disabled={waiting || locked}>
        {waiting ? "Saving…" : label}
      </button>
    </div>
  );
}

function livingDraftScope(
  accountScope: string,
  planId: string,
  kind: LivingPlanContentKind,
): AuthoringDraftScope {
  const actions: Record<LivingPlanContentKind, AuthoringDraftAction> = {
    lesson: "living_lesson_create",
    practice: "living_practice_create",
    evidence: "living_evidence_create",
  };
  return { accountScope, resourceId: planId, action: actions[kind] };
}
