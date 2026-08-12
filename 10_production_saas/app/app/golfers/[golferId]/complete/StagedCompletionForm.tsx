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
import {
  navigateToConfirmedDestination,
  requiresAuthoritativeMutationReload,
} from "@/lib/client-terminal-mutation";
import {
  isStagedCompletionMutationResponse,
  requireExactClientMutationJson,
} from "@/lib/instructor-mutation-response-contracts";
import {
  AuthoringCandidatePreview,
  type AuthoringCandidate,
} from "../AuthoringCandidatePreview";
import styles from "../../../workspace.module.css";

type PackageOption = {
  id: string;
  name: string;
  fitDescription: string;
};

type TemplateOption = {
  id: string;
  title: string;
  description: string;
  isFavourite: boolean;
  origin: "coach" | "editable_example";
  content: {
    goalPrompt?: string | null;
    assessmentPrompt?: string | null;
    priorityPrompt?: string | null;
    phases: ReadonlyArray<{
      title: string;
      purpose: string;
      rationale?: string | null;
      progressSignals: readonly string[];
    }>;
  };
};

const ERROR_SUMMARY_ID = "staged-completion-form-error-summary";

export function StagedCompletionForm({
  golferId,
  golferName,
  planTitle,
  goalStatement,
  planId,
  expectedRevision,
  packages,
  templates,
  recoveryScope,
}: {
  golferId: string;
  golferName: string;
  planTitle: string;
  goalStatement: string;
  planId: string;
  expectedRevision: number;
  packages: PackageOption[];
  templates: TemplateOption[];
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
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [phaseNotice, setPhaseNotice] = useState("");
  const [candidatePreview, setCandidatePreview] =
    useState<AuthoringCandidate | null>(null);
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
      availableTemplateIds: templates.map((item) => item.id).sort(),
    }),
    [expectedRevision, packages, planId, templates],
  );
  const isLocked =
    state === "saving" ||
    state === "reload_required" ||
    state === "saved" ||
    authoringDraftStateBlocksMutation(draftRecovery);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;

  function applySelectedTemplate() {
    if (!selectedTemplate || !formRef.current || isLocked) return;
    const count = selectedTemplate.content.phases.length;
    if (count !== 3 && count !== 4) return;
    flushSync(() => setPhaseCount(count));
    for (const [index, phase] of selectedTemplate.content.phases.entries()) {
      setFormValue(formRef.current, `phase${index + 1}Title`, phase.title);
      setFormValue(formRef.current, `phase${index + 1}Purpose`, phase.purpose);
    }
    const firstPhase = selectedTemplate.content.phases[0];
    setFormValue(formRef.current, "firstPhaseRationale", firstPhase.rationale ?? "");
    setFormValue(
      formRef.current,
      "firstPhaseProgressSignals",
      firstPhase.progressSignals.join("\n"),
    );
    setPhaseNotice(
      `${selectedTemplate.title} applied. Review and reorder every phase for this golfer.`,
    );
  }

  function moveLaterPhase(number: number, direction: -1 | 1) {
    const target = number + direction;
    const form = formRef.current;
    if (!form || isLocked || number <= 1 || target <= 1 || target > phaseCount) return;
    swapFormValues(form, `phase${number}Title`, `phase${target}Title`);
    swapFormValues(form, `phase${number}Purpose`, `phase${target}Purpose`);
    setPhaseNotice(`Phases ${number} and ${target} were reordered in this draft.`);
  }

  function duplicatePhase(number: number) {
    const form = formRef.current;
    if (!form || isLocked || phaseCount !== 3) return;
    const title = formValue(form, `phase${number}Title`);
    const purpose = formValue(form, `phase${number}Purpose`);
    flushSync(() => setPhaseCount(4));
    setFormValue(form, "phase4Title", title);
    setFormValue(form, "phase4Purpose", purpose);
    setPhaseNotice(
      `Phase ${number} was duplicated into Phase 4. Edit the copy before completing the roadmap.`,
    );
  }

  async function saveAndReturnLater() {
    const form = formRef.current;
    if (!form || isLocked || authoringDraftStateBlocksMutation(draftRecovery)) return;
    const values = captureAuthoringDraftValues(form);
    if (!values) {
      setState("error");
      setMessage("The staged roadmap draft could not be captured safely.");
      return;
    }
    const saved = await persistAuthoringDraft({
      scope: draftScope,
      baseRevision: expectedRevision,
      baseState: authoritativeDraftState,
      values,
      ui: { phaseCount },
    });
    if (saved.kind === "blocked") {
      setDraftRecovery(saved);
      setState("error");
      setMessage(
        "Roadmap could not safely preserve this draft in the browser tab. Stay on this page and copy any needed text before leaving.",
      );
      return;
    }
    router.push("/app/golfers");
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
      golferName,
      planTitle,
      goalStatement,
      assessmentSummary: values.assessmentSummary ?? "",
      priorityTitle: values.priorityTitle ?? "",
      priorityRationale: values.priorityRationale ?? "",
      phases: Array.from({ length: phaseCount }, (_, index) => {
        const number = index + 1;
        return {
          number,
          title: values[`phase${number}Title`] ?? "",
          purpose: values[`phase${number}Purpose`] ?? "",
          rationale: number === 1 ? values.firstPhaseRationale ?? "" : "",
          progressSignals:
            number === 1
              ? splitLines(values.firstPhaseProgressSignals ?? "")
              : [],
        };
      }),
    });
  }

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
      navigateToConfirmedDestination(router, destination);
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
      <div className={styles.saveState} role="status" aria-live="polite">
        {completionSaveStateLabel(state, draftRecovery)}
      </div>
      <section className={styles.formCard} aria-labelledby="roadmap-template-heading">
        <h2 id="roadmap-template-heading">Start blank or apply a reusable roadmap template</h2>
        <p className={styles.muted}>
          A template can fill the directional phase structure. It never supplies this
          golfer&apos;s assessment, priority, or diagnosis; those remain your judgment.
        </p>
        {templates.length ? (
          <div className={styles.fieldGrid}>
            <label className={styles.fullField}>
              Coach-owned template
              <select
                value={selectedTemplateId}
                disabled={isLocked}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
              >
                <option value="">Start with blank phases</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.isFavourite ? "Favourite — " : ""}{template.title} ({template.content.phases.length} phases)
                  </option>
                ))}
              </select>
            </label>
            {selectedTemplate ? (
              <div className={styles.fullField} role="note">
                <strong>{selectedTemplate.title}</strong>
                <p>{selectedTemplate.description}</p>
                <small>
                  {selectedTemplate.origin === "editable_example"
                    ? "Editable example — review every field before saving."
                    : "Your saved coach template — review it for this golfer before saving."}
                </small>
              </div>
            ) : null}
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={isLocked || !selectedTemplate}
              onClick={applySelectedTemplate}
            >
              Apply phase structure
            </button>
          </div>
        ) : (
          <p className={styles.muted}>
            No compatible three- or four-phase templates are saved. Continue blank or
            create one from the Roadmap templates library.
          </p>
        )}
      </section>
      <section className={styles.formCard} id="authoring-assessment">
        <fieldset
          className={styles.formSection}
          disabled={isLocked}
        >
          <legend>Starting assessment</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.fullField}>
              Starting assessment summary
              <textarea name="assessmentSummary" required maxLength={2_000} />
              {selectedTemplate?.content.assessmentPrompt ? (
                <small>Template prompt: {selectedTemplate.content.assessmentPrompt}</small>
              ) : null}
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

      <section className={styles.formCard} id="authoring-priority">
        <fieldset
          className={styles.formSection}
          disabled={isLocked}
        >
          <legend>Current priority</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Priority title
              <input name="priorityTitle" required maxLength={120} />
              {selectedTemplate?.content.priorityPrompt ? (
                <small>Template prompt: {selectedTemplate.content.priorityPrompt}</small>
              ) : null}
            </label>
            <label className={styles.fullField}>
              Why this comes first
              <textarea name="priorityRationale" required maxLength={1_500} />
            </label>
          </div>
        </fieldset>
      </section>

      <section className={styles.formCard} id="authoring-phases">
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
            timelines. Choose three or four before writing: switching to three hides any
            unsaved Phase 4 fields.
          </p>
          {Array.from({ length: phaseCount }, (_, index) => {
            const number = index + 1;
            return (
              <div className={styles.phaseAuthoringCard} key={number}>
                <div className={styles.cardHeader}>
                  <h3>Phase {number}</h3>
                  <div className={styles.actions} aria-label={`Phase ${number} structure controls`}>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={number <= 2}
                      onClick={() => moveLaterPhase(number, -1)}
                    >
                      Move up
                    </button>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={number === 1 || number >= phaseCount}
                      onClick={() => moveLaterPhase(number, 1)}
                    >
                      Move down
                    </button>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={phaseCount === 4}
                      onClick={() => duplicatePhase(number)}
                    >
                      Duplicate as Phase 4
                    </button>
                  </div>
                </div>
                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    Phase {number} title
                    <input name={`phase${number}Title`} required maxLength={120} />
                  </label>
                  <label className={styles.fullField}>
                    Phase {number} purpose
                    <textarea name={`phase${number}Purpose`} required maxLength={700} />
                  </label>
                </div>
              </div>
            );
          })}
          {phaseNotice ? (
            <p className={styles.formStatus} role="status">
              {phaseNotice}
            </p>
          ) : null}
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

      <section className={styles.formCard} id="authoring-evidence">
        <h2>Evidence details are optional at setup</h2>
        <p className={styles.muted}>
          Complete the text-first roadmap now. After it is saved, the golfer hub provides
          a direct Evidence destination for lessons, observations, and later review notes.
        </p>
      </section>

      <section className={styles.formCard} id="authoring-package">
        <details className={styles.optionalFields}>
          <summary>Optional first-phase package</summary>
          <fieldset className={styles.formSection} disabled={isLocked}>
            <legend className={styles.muted}>Commercial context does not block coaching.</legend>
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
        </details>
      </section>

      <section className={styles.formCard} id="authoring-preview">
        <h2>Preview this unsaved golfer-view candidate</h2>
        <p className={styles.muted}>
          Refresh the candidate after edits to review the exact words and phase order a
          golfer will see. Completing the draft then unlocks the full shared renderer for
          media, activity, print, and private-delivery review; it does not publish access.
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
        ) : (
          <p className={styles.muted} role="status">
            No candidate is shown yet. Draft fields stay local until you explicitly save.
          </p>
        )}
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
          onClick={() => void saveAndReturnLater()}
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

function setFormValue(form: HTMLFormElement, name: string, value: string) {
  const control = form.elements.namedItem(name);
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    control.value = value;
  }
}

function formValue(form: HTMLFormElement, name: string): string {
  const control = form.elements.namedItem(name);
  return control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
    ? control.value
    : "";
}

function swapFormValues(form: HTMLFormElement, left: string, right: string) {
  const leftValue = formValue(form, left);
  const rightValue = formValue(form, right);
  setFormValue(form, left, rightValue);
  setFormValue(form, right, leftValue);
}

function completionSaveStateLabel(
  state: "idle" | "saving" | "saved" | "error" | "reload_required",
  recovery: AuthoringDraftUiState,
): string {
  if (state === "saving") return "Saving the complete roadmap draft and validating the response…";
  if (state === "saved") return "Saved. The confirmed roadmap is ready to open.";
  if (state === "reload_required") return "Authoritative state changed. Reload is required before another save.";
  if (state === "error") return "Not saved. Your recoverable draft remains in this browser tab when available.";
  if (recovery.kind === "checking") return "Checking this browser tab for a recoverable draft…";
  if (recovery.kind === "restored") return "Recovered draft loaded. Changes are not saved to Roadmap yet.";
  return "Changes are local until you complete the roadmap draft. Safe browser-tab recovery is enabled.";
}
