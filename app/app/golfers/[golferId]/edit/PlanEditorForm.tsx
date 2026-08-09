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
import { requiresAuthoritativeMutationReload } from "@/lib/client-terminal-mutation";
import {
  isPlanEditorMutationResponse,
  requireExactClientMutationJson,
} from "@/lib/instructor-mutation-response-contracts";
import type { PlanViewModel } from "@/components/plan/types";
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
      router.push(destination);
      router.refresh();
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
      <section className={styles.formCard}>
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
            <label className={styles.fullField}>
              Why it matters (optional)
              <textarea
                name="goalWhy"
                defaultValue={model.goal.why ?? ""}
                maxLength={1_000}
              />
            </label>
            <label className={styles.fullField}>
              Practical context and constraints (optional)
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
          </div>
        </fieldset>
      </section>

      <section className={styles.formCard}>
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

      <section className={styles.formCard}>
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

      <section className={styles.formCard}>
        <fieldset
          className={styles.formSection}
          disabled={isLocked}
        >
          <legend>{phases.length} directional development phases</legend>
          <p className={styles.muted}>
            Keep the existing {phases.length}-phase structure. Later phases are direction and may change as new evidence develops.
          </p>
          {phases.map((phase) => (
            <div className={styles.fieldGrid} key={phase.id}>
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
          ))}
        </fieldset>
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
