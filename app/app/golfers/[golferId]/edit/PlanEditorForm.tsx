"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clientMutationErrorMessage,
  requestClientMutation,
} from "@/lib/client-mutation-recovery";
import type { PlanViewModel } from "@/components/plan/types";
import styles from "../../../workspace.module.css";

type EditResponse = {
  plan?: {
    id?: string;
    status?: string;
    revision?: number;
  };
  revokedShareLinks?: number;
  error?: { message?: string };
};

const ERROR_SUMMARY_ID = "plan-editor-form-error-summary";

export function PlanEditorForm({
  golferId,
  model,
}: {
  golferId: string;
  model: PlanViewModel;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const orderedPhases = Array.from(
    { length: model.phases.length },
    (_, index) => index + 1,
  ).map((number) =>
    model.phases.find((phase) => phase.number === number),
  );

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
    setState("saving");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const payload = {
      expectedRevision: model.plan.revision,
      title: form.get("title"),
      goal: {
        statement: form.get("goalStatement"),
        why: form.get("goalWhy"),
        context: form.get("goalContext"),
      },
      assessment: {
        summary: form.get("assessmentSummary"),
        strengths: form.get("assessmentStrengths"),
        primaryPattern: form.get("assessmentPrimaryPattern"),
        limitations: form.get("assessmentLimitations"),
      },
      priority: {
        title: form.get("priorityTitle"),
        rationale: form.get("priorityRationale"),
      },
      phases: phases.map((phase) => ({
        number: phase.number,
        title: form.get(`phase${phase.number}Title`),
        purpose: form.get(`phase${phase.number}Purpose`),
        rationale: form.get(`phase${phase.number}Rationale`),
        progressSignals: lineItems(
          form.get(`phase${phase.number}ProgressSignals`),
        ),
      })),
    };

    try {
      const response = await requestClientMutation(
        `/api/plans/${encodeURIComponent(model.plan.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as EditResponse;
      if (!response.ok || result.plan?.status !== "draft") {
        throw new Error(result.error?.message || "The plan changes could not be saved.");
      }

      router.push(`/app/golfers/${encodeURIComponent(golferId)}`);
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(
        clientMutationErrorMessage(
          error,
          "the plan changes were saved",
          "reload_before_retry",
          "The plan changes could not be saved.",
        ),
      );
    }
  }

  return (
    <form
      ref={formRef}
      className={styles.form}
      aria-describedby={ERROR_SUMMARY_ID}
      onSubmit={handleSubmit}
    >
      <section className={styles.formCard}>
        <fieldset className={styles.formSection} disabled={state === "saving"}>
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
        <fieldset className={styles.formSection} disabled={state === "saving"}>
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
        <fieldset className={styles.formSection} disabled={state === "saving"}>
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
        <fieldset className={styles.formSection} disabled={state === "saving"}>
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
        message={state === "error" ? message : ""}
        formRef={formRef}
        className={styles.errorStatus}
      />
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
          disabled={state === "saving"}
        >
          {state === "saving" ? "Saving new draft…" : "Save as a new draft revision"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={state === "saving"}
          onClick={() => router.back()}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function lineItems(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}
