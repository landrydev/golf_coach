"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import {
  AuthoringDraftRecovery,
  authoringDraftStateBlocksMutation,
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
  type AuthoringDraftScope,
} from "@/lib/client-authoring-draft-recovery";
import {
  clientMutationErrorMessage,
  requestClientMutation,
} from "@/lib/client-mutation-recovery";
import { requiresAuthoritativeMutationReload } from "@/lib/client-terminal-mutation";
import {
  isStagedCompletionMutationResponse,
  requireExactClientMutationJson,
} from "@/lib/instructor-mutation-response-contracts";
import styles from "../../../workspace.module.css";

type PackageOption = {
  id: string;
  name: string;
  fitDescription: string;
};

const ERROR_SUMMARY_ID = "staged-completion-form-error-summary";

export function StagedCompletionForm({
  golferId,
  planId,
  expectedRevision,
  packages,
  recoveryScope,
}: {
  golferId: string;
  planId: string;
  expectedRevision: number;
  packages: PackageOption[];
  recoveryScope: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const mutationTerminalRef = useRef(false);
  const [phaseCount, setPhaseCount] = useState<3 | 4>(4);
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
      resourceId: planId,
      action: "staged_plan_complete",
    }),
    [planId, recoveryScope],
  );
  const authoritativeDraftState = useMemo(
    () => ({
      authoringState: "staged",
      planId,
      revision: expectedRevision,
      availablePackageIds: packages.map((item) => item.id).sort(),
    }),
    [expectedRevision, packages, planId],
  );
  const isLocked =
    state === "saving" ||
    state === "reload_required" ||
    state === "saved" ||
    authoringDraftStateBlocksMutation(draftRecovery);

  useEffect(() => {
    let current = true;
    void reconcileAuthoringDraft({
      scope: draftScope,
      currentRevision: expectedRevision,
      currentState: authoritativeDraftState,
    }).then((result) => {
      if (current) setDraftRecovery(result);
    });
    return () => {
      current = false;
    };
  }, [authoritativeDraftState, draftScope, expectedRevision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
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
      setMessage("The staged roadmap draft could not be captured safely. No request was sent.");
      return;
    }
    const savedDraft = await persistAuthoringDraft({
      scope: draftScope,
      baseRevision: expectedRevision,
      baseState: authoritativeDraftState,
      values,
      ui: { phaseCount },
    });
    if (savedDraft.kind === "blocked") {
      mutationTerminalRef.current = false;
      setDraftRecovery(savedDraft);
      setState("error");
      setMessage(
        "Roadmap could not safely preserve this staged roadmap draft in the browser tab. No request was sent.",
      );
      return;
    }
    const phases = Array.from({ length: phaseCount }, (_, index) => {
      const number = index + 1;
      return {
        number,
        title: values[`phase${number}Title`],
        purpose: values[`phase${number}Purpose`],
        rationale: number === 1 ? values.firstPhaseRationale : null,
        progressSignals:
          number === 1
            ? splitLines(values.firstPhaseProgressSignals ?? "")
            : [],
      };
    });

    let destination: string | null = null;
    try {
      const response = await requestClientMutation(
        `/api/golfers/${encodeURIComponent(golferId)}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedPlanId: planId,
            expectedRevision,
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
            phases,
            firstPhasePackageId: values.firstPhasePackageId || null,
          }),
        },
      );
      await requireExactClientMutationJson(
        response,
        200,
        (value) =>
          isStagedCompletionMutationResponse(value, {
            golferId,
            planId,
            revision: expectedRevision + 1,
            phaseCount,
          }),
        "The staged roadmap could not be completed.",
      );
      destination = `/app/golfers/${encodeURIComponent(golferId)}`;
      setConfirmedDestination(destination);
      setState("saved");
      setMessage("Staged roadmap completed.");
      clearAuthoringDraft(savedDraft.draft);
    } catch (error) {
      const reloadRequired = requiresAuthoritativeMutationReload(error);
      if (!reloadRequired) mutationTerminalRef.current = false;
      setState(reloadRequired ? "reload_required" : "error");
      setMessage(
        clientMutationErrorMessage(
          error,
          "the staged roadmap was completed",
          "reload_before_retry",
          "The staged roadmap could not be completed.",
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
      // The confirmed completion remains successful if navigation fails.
    }
  }

  return (
    <form
      ref={formRef}
      className={styles.form}
      aria-describedby={ERROR_SUMMARY_ID}
      method="post"
      onSubmit={submit}
    >
      <AuthoringDraftRecovery
        state={draftRecovery}
        label="staged roadmap"
        noticeClassName={styles.notice}
        actionsClassName={styles.actions}
        buttonClassName={styles.secondaryButton}
        onRestore={() => {
          if (draftRecovery.kind !== "unchanged" || !formRef.current) {
            setDraftRecovery({ kind: "blocked", reason: "invalid" });
            return;
          }
          const restoredPhaseCount = draftRecovery.draft.envelope.ui.phaseCount;
          if (restoredPhaseCount !== 3 && restoredPhaseCount !== 4) {
            setDraftRecovery({ kind: "blocked", reason: "invalid" });
            return;
          }
          flushSync(() => setPhaseCount(restoredPhaseCount));
          if (
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
          <legend>Starting assessment</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.fullField}>
              Starting assessment summary
              <textarea name="assessmentSummary" required maxLength={2_000} />
            </label>
            <label className={styles.fullField}>
              Strengths to preserve
              <textarea name="assessmentStrengths" required maxLength={1_500} />
            </label>
            <label className={styles.fullField}>
              Primary observed pattern
              <textarea name="assessmentPrimaryPattern" required maxLength={2_000} />
              <small>State a coaching observation, not a medical diagnosis or guarantee.</small>
            </label>
            <label className={styles.fullField}>
              Evidence and assessment limits
              <textarea name="assessmentLimitations" required maxLength={1_500} />
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
              Priority title
              <input name="priorityTitle" required maxLength={120} />
            </label>
            <label className={styles.fullField}>
              Why this comes first
              <textarea name="priorityRationale" required maxLength={1_500} />
            </label>
          </div>
        </fieldset>
      </section>

      <section className={styles.formCard}>
        <fieldset
          className={styles.formSection}
          disabled={isLocked}
        >
          <legend>Directional phases</legend>
          <label className={styles.field}>
            Number of phases
            <select
              value={phaseCount}
              onChange={(event) => setPhaseCount(Number(event.target.value) as 3 | 4)}
            >
              <option value={3}>3 phases</option>
              <option value={4}>4 phases</option>
            </select>
          </label>
          <p className={styles.muted}>
            These phases are coach-authored direction, not promised outcomes or fixed
            timelines.
          </p>
          {Array.from({ length: phaseCount }, (_, index) => {
            const number = index + 1;
            return (
              <div className={styles.fieldGrid} key={number}>
                <label className={styles.field}>
                  Phase {number} title
                  <input name={`phase${number}Title`} required maxLength={120} />
                </label>
                <label className={styles.fullField}>
                  Phase {number} purpose
                  <textarea name={`phase${number}Purpose`} required maxLength={700} />
                </label>
              </div>
            );
          })}
          <div className={styles.fieldGrid}>
            <label className={styles.fullField}>
              Why Phase 1 leads the roadmap
              <textarea name="firstPhaseRationale" required maxLength={1_500} />
            </label>
            <label className={styles.fullField}>
              Observable Phase 1 progress signals — one per line
              <textarea name="firstPhaseProgressSignals" required maxLength={2_409} />
              <small>Use observable checks; do not promise a score or permanent change.</small>
            </label>
          </div>
        </fieldset>
      </section>

      <section className={styles.formCard}>
        <fieldset
          className={styles.formSection}
          disabled={isLocked}
        >
          <legend>Optional first-phase package</legend>
          <label className={styles.fullField}>
            Existing active package
            <select name="firstPhasePackageId" defaultValue="">
              <option value="">No package attached</option>
              {packages.map((coachingPackage) => (
                <option key={coachingPackage.id} value={coachingPackage.id}>
                  {coachingPackage.name}
                </option>
              ))}
            </select>
            <small>
              A package remains optional. Roadmap does not infer a purchase, booking, or
              golfer commitment.
            </small>
          </label>
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
          <strong>Reload before completing or changing this staged roadmap.</strong>
          <span>
            The draft fields are locked until Roadmap reloads the authoritative completion
            state.
          </span>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload and check staged roadmap
          </button>
        </div>
      ) : null}
      <div className={styles.notice} role="note">
        <strong>Completion creates the first reviewable draft.</strong>
        <span>
          It still does not publish, share, message, book, or charge. You must review the
          exact golfer view separately before creating private access.
        </span>
      </div>
      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={isLocked}
        >
          {state === "saving" ? "Completing draft…" : "Complete roadmap draft"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={isLocked}
          onClick={() => router.push("/app/golfers")}
        >
          Save and return later
        </button>
      </div>
    </form>
  );
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
