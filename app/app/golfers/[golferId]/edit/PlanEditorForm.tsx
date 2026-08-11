"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AuthoringDraftRecovery,
  authoringDraftStateBlocksMutation,
  type AuthoringDraftUiState,
} from "@/components/forms/AuthoringDraftRecovery";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  canonicalAuthoringValues,
  captureAuthoringDraftValues,
  clearAuthoringDraft,
  discardAuthoringDraft,
  persistAuthoringDraft,
  reconcileAuthoringDraft,
  restoreAuthoringDraftValues,
  type AuthoringDraftScope,
} from "@/lib/client-authoring-draft-recovery";
import {
  clientMutationErrorMessage,
  requestClientMutation,
} from "@/lib/client-mutation-recovery";
import {
  navigateToConfirmedDestination,
  requiresAuthoritativeMutationReload,
} from "@/lib/client-terminal-mutation";
import {
  isPlanEditorMutationResponse,
  requireExactClientMutationJson,
} from "@/lib/instructor-mutation-response-contracts";
import type { PlanViewModel } from "@/components/plan/types";
import {
  AuthoringCandidatePreview,
  type AuthoringCandidate,
} from "../AuthoringCandidatePreview";
import styles from "../../../workspace.module.css";

const ERROR_SUMMARY_ID = "plan-editor-form-error-summary";

export function PlanEditorForm({
  golferId,
  model,
  recoveryScope,
}: {
  golferId: string;
  model: PlanViewModel;
  recoveryScope: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const mutationTerminalRef = useRef(false);
  const [state, setState] = useState<
    "idle" | "saving" | "saved" | "error" | "reload_required"
  >("idle");
  const [message, setMessage] = useState("");
  const [confirmedDestination, setConfirmedDestination] = useState<string | null>(null);
  const [phaseNotice, setPhaseNotice] = useState("");
  const [candidatePreview, setCandidatePreview] =
    useState<AuthoringCandidate | null>(null);
  const [draftRecovery, setDraftRecovery] =
    useState<AuthoringDraftUiState>({ kind: "checking" });
  const draftScope = useMemo<AuthoringDraftScope>(
    () => ({
      accountScope: recoveryScope,
      resourceId: model.plan.id,
      action: "plan_core_edit",
    }),
    [model.plan.id, recoveryScope],
  );
  const authoritativeDraftState = useMemo(
    () => canonicalAuthoringValues(planEditorDraftValues(model)),
    [model],
  );
  const isLocked =
    state === "saving" ||
    state === "reload_required" ||
    state === "saved" ||
    authoringDraftStateBlocksMutation(draftRecovery);
  const orderedPhases = Array.from(
    { length: model.phases.length },
    (_, index) => index + 1,
  ).map((number) =>
    model.phases.find((phase) => phase.number === number),
  );

  useEffect(() => {
    let current = true;
    void reconcileAuthoringDraft({
      scope: draftScope,
      currentRevision: model.plan.revision,
      currentState: authoritativeDraftState,
    }).then((result) => {
      if (current) setDraftRecovery(result);
    });
    return () => {
      current = false;
    };
  }, [authoritativeDraftState, draftScope, model.plan.revision]);

  if (
    !model.priority ||
    ![3, 4].includes(model.phases.length) ||
    orderedPhases.some((phase) => phase === undefined)
  ) {
    return (
      <section className={styles.formCard} aria-labelledby="structure-error-heading">
        <div className={styles.errorStatus} role="alert">
          <strong id="structure-error-heading">This plan cannot be edited here yet.</strong>{" "}
          Its stored roadmap must contain three or four consecutively numbered phases. No changes were made.
        </div>
      </section>
    );
  }

  const phases = orderedPhases as PlanViewModel["phases"];

  function moveLaterPhase(number: number, direction: -1 | 1) {
    const target = number + direction;
    const form = formRef.current;
    if (
      !form ||
      isLocked ||
      number <= 1 ||
      target <= 1 ||
      target > phases.length
    ) {
      return;
    }
    for (const suffix of ["Title", "Purpose", "Rationale", "ProgressSignals"]) {
      swapFormValues(form, `phase${number}${suffix}`, `phase${target}${suffix}`);
    }
    setPhaseNotice(`Phases ${number} and ${target} were reordered in this draft.`);
  }

  function refreshCandidatePreview() {
    const form = formRef.current;
    if (!form) return;
    const values = captureAuthoringDraftValues(form);
    if (!values) {
      setState("error");
      setMessage("The candidate preview could not read this draft safely.");
      return;
    }
    setCandidatePreview({
      golferName: model.golfer.displayName,
      planTitle: values.title ?? "",
      goalStatement: values.goalStatement ?? "",
      assessmentSummary: values.assessmentSummary ?? "",
      priorityTitle: values.priorityTitle ?? "",
      priorityRationale: values.priorityRationale ?? "",
      phases: phases.map((phase) => ({
        number: phase.number,
        title: values[`phase${phase.number}Title`] ?? "",
        purpose: values[`phase${phase.number}Purpose`] ?? "",
        rationale: values[`phase${phase.number}Rationale`] ?? "",
        progressSignals: lineItems(values[`phase${phase.number}ProgressSignals`]),
      })),
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationTerminalRef.current) return;
    if (authoringDraftStateBlocksMutation(draftRecovery)) return;
    mutationTerminalRef.current = true;
    setState("saving");
    setMessage("");

    const values = captureAuthoringDraftValues(event.currentTarget);
    if (!values) {
      mutationTerminalRef.current = false;
      setState("error");
      setMessage("The plan draft could not be captured safely. No request was sent.");
      return;
    }
    const savedDraft = await persistAuthoringDraft({
      scope: draftScope,
      baseRevision: model.plan.revision,
      baseState: authoritativeDraftState,
      appliedState: canonicalAuthoringValues(values),
      values,
      ui: { phaseCount: model.phases.length },
    });
    if (savedDraft.kind === "blocked") {
      mutationTerminalRef.current = false;
      setDraftRecovery(savedDraft);
      setState("error");
      setMessage(
        "Roadmap could not safely preserve this plan draft in the browser tab. No request was sent.",
      );
      return;
    }

    const payload = {
      expectedRevision: model.plan.revision,
      title: values.title,
      goal: {
        statement: values.goalStatement,
        why: values.goalWhy,
        context: values.goalContext,
      },
      assessment: {
        summary: values.assessmentSummary,
        strengths: values.assessmentStrengths,
        primaryPattern: values.assessmentPrimaryPattern,
        limitations: values.assessmentLimitations,
      },
      priority: {
        title: values.priorityTitle,
        rationale: values.priorityRationale,
      },
      phases: phases.map((phase) => ({
        number: phase.number,
        title: values[`phase${phase.number}Title`],
        purpose: values[`phase${phase.number}Purpose`],
        rationale: values[`phase${phase.number}Rationale`],
        progressSignals: lineItems(
          values[`phase${phase.number}ProgressSignals`],
        ),
      })),
    };

    let destination: string | null = null;
    try {
      const response = await requestClientMutation(
        `/api/plans/${encodeURIComponent(model.plan.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      await requireExactClientMutationJson(
        response,
        200,
        (value) =>
          isPlanEditorMutationResponse(value, {
            planId: model.plan.id,
            revision: model.plan.revision + 1,
          }),
        "The plan changes could not be saved.",
      );
      destination = `/app/golfers/${encodeURIComponent(golferId)}`;
      setConfirmedDestination(destination);
      setState("saved");
      setMessage("Plan changes saved.");
      clearAuthoringDraft(savedDraft.draft);
    } catch (error) {
      const reloadRequired = requiresAuthoritativeMutationReload(error);
      if (!reloadRequired) mutationTerminalRef.current = false;
      setState(reloadRequired ? "reload_required" : "error");
      setMessage(
        clientMutationErrorMessage(
          error,
          "the plan changes were saved",
          "reload_before_retry",
          "The plan changes could not be saved.",
        ),
      );
      if (!reloadRequired) setDraftRecovery({ kind: "restored" });
      return;
    }

    if (!destination) return;
    try {
      navigateToConfirmedDestination(router, destination);
    } catch {
      // The confirmed plan save remains successful if navigation fails.
    }
  }

  return (
    <form
      ref={formRef}
      className={styles.form}
      aria-describedby={ERROR_SUMMARY_ID}
      method="post"
      onSubmit={handleSubmit}
    >
      <AuthoringDraftRecovery
        state={draftRecovery}
        label="plan edit"
        noticeClassName={styles.notice}
        actionsClassName={styles.actions}
        buttonClassName={styles.secondaryButton}
        onRestore={() => {
          if (
            draftRecovery.kind !== "unchanged" ||
            !formRef.current ||
            !restoreAuthoringDraftValues(
              formRef.current,
              draftRecovery.draft.envelope.values,
            )
          ) {
            setDraftRecovery({ kind: "blocked", reason: "invalid" });
            return;
          }
          setDraftRecovery({ kind: "restored" });
        }}
        onDiscard={() => {
          const reload =
            draftRecovery.kind === "blocked" || draftRecovery.kind === "diverged";
          if (!discardAuthoringDraft(draftScope)) {
            setDraftRecovery({ kind: "blocked", reason: "unavailable" });
            return;
          }
          setDraftRecovery({ kind: "empty" });
          if (reload) window.location.reload();
        }}
      />
      <div className={styles.saveState} role="status" aria-live="polite">
        {editorSaveStateLabel(state, draftRecovery)}
      </div>
      <section className={styles.formCard} id="authoring-goal">
        <fieldset
          className={styles.formSection}
          disabled={isLocked}
        >
          <legend>Plan and primary goal</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.fullField}>
              Plan title
              <input
                name="title"
                defaultValue={model.plan.title}
                required
                maxLength={120}
              />
            </label>
            <label className={styles.fullField}>
              Desired outcome
              <textarea
                name="goalStatement"
                defaultValue={model.goal.statement}
                required
                maxLength={600}
              />
              <small>
                Use the golfer&apos;s intended outcome. Do not promise a score, timeline, or
                permanent change.
              </small>
            </label>
            <details className={styles.optionalFields}>
              <summary>Optional goal context</summary>
              <label className={styles.fullField}>
                Why it matters
                <textarea
                  name="goalWhy"
                  defaultValue={model.goal.why ?? ""}
                  maxLength={1_000}
                />
              </label>
              <label className={styles.fullField}>
                Practical context and constraints
                <textarea
                  name="goalContext"
                  defaultValue={model.goal.context ?? ""}
                  maxLength={2_500}
                />
                <small>
                  Keep only context needed for coaching. Do not add medical, payment, or
                  unrelated personal information.
                </small>
              </label>
            </details>
          </div>
        </fieldset>
      </section>

      <section className={styles.formCard} id="authoring-assessment">
        <fieldset
          className={styles.formSection}
          disabled={isLocked}
        >
          <legend>Starting assessment</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.fullField}>
              Coach assessment summary
              <textarea
                name="assessmentSummary"
                defaultValue={model.assessment.summary}
                required
                maxLength={2_000}
              />
              <small>
                Describe observed coaching evidence; do not diagnose a health condition or
                present an inference as fact.
              </small>
            </label>
            <label className={styles.fullField}>
              Strengths to preserve
              <textarea
                name="assessmentStrengths"
                defaultValue={model.assessment.strengths ?? ""}
                required
                maxLength={1_500}
              />
            </label>
            <label className={styles.fullField}>
              Primary pattern
              <textarea
                name="assessmentPrimaryPattern"
                defaultValue={model.assessment.primaryPattern ?? ""}
                required
                maxLength={2_000}
              />
            </label>
            <label className={styles.fullField}>
              Evidence limits
              <textarea
                name="assessmentLimitations"
                defaultValue={model.assessment.limitations}
                required
                maxLength={1_500}
              />
              <small>
                State what was not observed and what this assessment cannot establish.
              </small>
            </label>
          </div>
        </fieldset>
      </section>

      <section className={styles.formCard} id="authoring-priority">
        <fieldset
          className={styles.formSection}
          disabled={isLocked}
        >
          <legend>Current priority</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Primary priority barrier
              <input
                name="priorityTitle"
                defaultValue={model.priority?.title ?? ""}
                required
                maxLength={120}
              />
            </label>
            <label className={styles.fullField}>
              Why this comes first
              <textarea
                name="priorityRationale"
                defaultValue={model.priority?.rationale ?? ""}
                required
                maxLength={1_500}
              />
            </label>
          </div>
        </fieldset>
      </section>

      <section className={styles.formCard} id="authoring-phases">
        <fieldset
          className={styles.formSection}
          disabled={isLocked}
        >
          <legend>{phases.length} directional development phases</legend>
          <p className={styles.muted}>
            Keep the existing {phases.length}-phase structure for this revision. Phase count
            is fixed here so every stored phase remains explicit and consecutive; start a
            new roadmap if the structure itself must change. Later phases are direction and
            may change as new evidence develops.
          </p>
          {phases.map((phase) => (
            <div className={styles.phaseAuthoringCard} key={phase.id}>
              <div className={styles.cardHeader}>
                <h3>Phase {phase.number}</h3>
                <div className={styles.actions} aria-label={`Phase ${phase.number} order controls`}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={phase.number <= 2}
                    onClick={() => moveLaterPhase(phase.number, -1)}
                  >
                    Move up
                  </button>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={phase.number === 1 || phase.number >= phases.length}
                    onClick={() => moveLaterPhase(phase.number, 1)}
                  >
                    Move down
                  </button>
                </div>
              </div>
              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                Phase {phase.number} title
                <input
                  name={`phase${phase.number}Title`}
                  defaultValue={phase.title}
                  required
                  maxLength={120}
                />
              </label>
              <label className={styles.field}>
                Phase {phase.number} purpose
                <textarea
                  name={`phase${phase.number}Purpose`}
                  defaultValue={phase.purpose}
                  required
                  maxLength={700}
                />
              </label>
              <label className={styles.fullField}>
                {phase.number === 1
                  ? "Why this phase leads"
                  : `Why Phase ${phase.number} follows (optional)`}
                <textarea
                  name={`phase${phase.number}Rationale`}
                  defaultValue={phase.rationale ?? ""}
                  required={phase.number === 1}
                  maxLength={1_500}
                />
              </label>
              <label className={styles.fullField}>
                {phase.number === 1
                  ? "Progress signals — one per line"
                  : "Progress signals — one per line (optional)"}
                <textarea
                  name={`phase${phase.number}ProgressSignals`}
                  defaultValue={phase.progressSignals.join("\n")}
                  required={phase.number === 1}
                  maxLength={2_400}
                />
                <small>Use observable signals, not guaranteed outcomes or fixed timelines.</small>
                </label>
              </div>
            </div>
          ))}
          {phaseNotice ? (
            <p className={styles.formStatus} role="status">
              {phaseNotice}
            </p>
          ) : null}
        </fieldset>
      </section>

      <section className={styles.formCard} id="authoring-evidence">
        <h2>Evidence and coaching activity</h2>
        <p className={styles.muted}>
          Core roadmap edits stay text-first. Use the golfer hub&apos;s Evidence, Lessons,
          and Practice destinations to record supporting activity without blocking this save.
        </p>
        <a className={styles.secondaryButton} href={`/app/golfers/${encodeURIComponent(golferId)}#hub-evidence`}>
          Open evidence destination
        </a>
      </section>

      <section className={styles.formCard} id="authoring-package">
        <h2>Package context is optional</h2>
        <p className={styles.muted}>
          Package management is separate from the coach-authored core and does not block
          an edit, review, or text-first roadmap.
        </p>
        <a className={styles.secondaryButton} href="/app/packages">
          Manage packages
        </a>
      </section>

      <section className={styles.formCard} id="authoring-preview">
        <h2>Preview this unsaved golfer-view candidate</h2>
        <p className={styles.muted}>
          Refresh after editing to review the exact words and phase order before saving.
          Saving creates a new draft revision and revokes current access; the full shared
          renderer remains available before any new publish action.
        </p>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={isLocked}
          onClick={refreshCandidatePreview}
        >
          Refresh golfer preview
        </button>
        {candidatePreview ? (
          <AuthoringCandidatePreview candidate={candidatePreview} />
        ) : null}
        <a className={styles.secondaryButton} href={`/app/golfers/${encodeURIComponent(golferId)}#hub-roadmap`}>
          Open current exact preview
        </a>
      </section>

      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={
          state === "error" || state === "reload_required" ? message : ""
        }
        formRef={formRef}
        className={styles.errorStatus}
      />
      {state === "saved" ? (
        <div className={styles.formStatus} role="status">
          {message}
          {confirmedDestination ? (
            <a className={styles.secondaryButton} href={confirmedDestination}>
              Open the confirmed roadmap
            </a>
          ) : null}
        </div>
      ) : null}
      {state === "reload_required" ? (
        <div className={styles.notice} role="alert">
          <strong>Reload before editing this plan again.</strong>
          <span>
            The draft controls are locked until the authoritative revision is loaded.
          </span>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload and check plan revision
          </button>
        </div>
      ) : null}
      <div className={styles.notice} role="note">
        <strong>This save revokes current private links.</strong>
        <span>
          You must review and publish this new draft revision before sharing fresh access.
        </span>
      </div>
      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={isLocked}
        >
          {state === "saving" ? "Saving new draft…" : "Save as a new draft revision"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={isLocked}
          onClick={() => router.back()}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function lineItems(value: string | undefined): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formValue(form: HTMLFormElement, name: string): string {
  const control = form.elements.namedItem(name);
  return control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
    ? control.value
    : "";
}

function setFormValue(form: HTMLFormElement, name: string, value: string) {
  const control = form.elements.namedItem(name);
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    control.value = value;
  }
}

function swapFormValues(form: HTMLFormElement, left: string, right: string) {
  const leftValue = formValue(form, left);
  const rightValue = formValue(form, right);
  setFormValue(form, left, rightValue);
  setFormValue(form, right, leftValue);
}

function editorSaveStateLabel(
  state: "idle" | "saving" | "saved" | "error" | "reload_required",
  recovery: AuthoringDraftUiState,
): string {
  if (state === "saving") return "Saving a new draft revision and validating the response…";
  if (state === "saved") return "Saved. The confirmed roadmap revision is ready to open.";
  if (state === "reload_required") return "Authoritative plan state changed. Reload before another edit.";
  if (state === "error") return "Not saved. Your recoverable draft remains in this browser tab when available.";
  if (recovery.kind === "checking") return "Checking this browser tab for a recoverable plan draft…";
  if (recovery.kind === "restored") return "Recovered draft loaded. Changes are not saved to Roadmap yet.";
  return "Changes are local until you save a new draft revision. Safe browser-tab recovery is enabled.";
}

function planEditorDraftValues(model: PlanViewModel): Record<string, string> {
  return {
    title: model.plan.title,
    goalStatement: model.goal.statement,
    goalWhy: model.goal.why ?? "",
    goalContext: model.goal.context ?? "",
    assessmentSummary: model.assessment.summary,
    assessmentStrengths: model.assessment.strengths ?? "",
    assessmentPrimaryPattern: model.assessment.primaryPattern ?? "",
    assessmentLimitations: model.assessment.limitations,
    priorityTitle: model.priority?.title ?? "",
    priorityRationale: model.priority?.rationale ?? "",
    ...Object.fromEntries(
      model.phases.flatMap((phase) => [
        [`phase${phase.number}Title`, phase.title],
        [`phase${phase.number}Purpose`, phase.purpose],
        [`phase${phase.number}Rationale`, phase.rationale ?? ""],
        [`phase${phase.number}ProgressSignals`, phase.progressSignals.join("\n")],
      ]),
    ),
  };
}
