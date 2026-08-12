"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clientMutationErrorMessage,
  requestClientMutation,
  requireClientMutationJson,
} from "@/lib/client-mutation-recovery";
import styles from "../../beta2.module.css";

const ERROR_SUMMARY_ID = "quick-lesson-update-error-summary";

export function QuickLessonUpdate({
  planId,
  planRevision,
  phaseId,
  phaseTitle,
  activePracticeId,
}: {
  planId: string;
  planRevision: number;
  phaseId: string;
  phaseTitle: string;
  activePracticeId?: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving") return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const changed = text(form, "changed");
    const practice = text(form, "practice");
    const attention = text(form, "attention");
    const cadence = text(form, "cadence") || "Two short, focused sets before the next lesson.";
    let revision = planRevision;
    setState("saving");
    setMessage("");

    try {
      if (activePracticeId) {
        const retireResponse = await requestClientMutation(
          `/api/plans/${encodeURIComponent(planId)}/coaching/practice`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedRevision: revision,
              practiceItemId: activePracticeId,
              nextStatus: "retired",
            }),
          },
        );
        revision = await responseRevision(retireResponse, revision);
      }

      const lessonResponse = await requestClientMutation(
        `/api/plans/${encodeURIComponent(planId)}/coaching/lessons`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: revision,
            phaseId,
            title: `Lesson update — ${new Intl.DateTimeFormat("en-CA", {
              month: "short",
              day: "numeric",
            }).format(new Date())}`,
            purpose: "Capture the meaningful coaching change and the next useful direction.",
            status: "completed",
            scheduledAt: null,
            occurredAt: new Date().toISOString(),
            coachObservation: changed,
            golferLearning: null,
            takeaway: changed,
            nextCheck: attention,
            phaseConnection: `Connected to ${phaseTitle}.`,
          }),
        },
      );
      revision = await responseRevision(lessonResponse, revision);

      const practiceResponse = await requestClientMutation(
        `/api/plans/${encodeURIComponent(planId)}/coaching/practice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: revision,
            phaseId,
            drillTemplateId: null,
            dueAt: null,
            customization: {
              title: practice.slice(0, 160),
              purpose: `Reinforce the lesson change: ${changed}`,
              whenItFits: "Use this before the next lesson or representative playing session.",
              equipment: [],
              setup: "Choose a comfortable club, a clear target, and a pace that lets the player notice the intended pattern.",
              steps: [practice],
              dosageOrCadence: cadence,
              feelOrCue: attention,
              successCheck: attention,
              commonMiss: null,
              stopOrAskRule: "Stop and ask the coach if the task, response, or intended pattern becomes unclear.",
              constraintOrAdaptation: null,
              progression: null,
              regression: "Reduce the speed, target pressure, or number of repetitions until the intention is clear again.",
            },
          }),
        },
      );
      await responseRevision(practiceResponse, revision);

      formElement.reset();
      setState("saved");
      setMessage("The lesson takeaway, next practice, and player journey are updated.");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(
        clientMutationErrorMessage(
          error,
          "the lesson update was saved",
          "reload_before_retry",
          "The update could not be confirmed. Reload the player before trying again.",
        ),
      );
    }
  }

  return (
    <form ref={formRef} className={styles.quickUpdate} method="post" aria-describedby={ERROR_SUMMARY_ID} onSubmit={submit}>
      <fieldset disabled={state === "saving"}>
        <legend>Sixty-second lesson update</legend>
        <div className={styles.quickUpdateGrid}>
          <label>
            What changed today?
            <textarea
              name="changed"
              required
              maxLength={2000}
              placeholder="The player found a start line they could recognize without steering the face."
            />
          </label>
          <label>
            What should the player practise next?
            <textarea
              name="practice"
              required
              maxLength={2000}
              placeholder="Hit three sets of four drives to a wide corridor, resetting fully between shots."
            />
          </label>
          <label>
            What should they pay attention to?
            <textarea
              name="attention"
              required
              maxLength={1000}
              placeholder="Notice whether the ball begins inside the chosen corridor before judging the curve."
            />
          </label>
          <label>
            Suggested amount
            <input
              name="cadence"
              maxLength={1000}
              placeholder="Three sets of four, twice before the next lesson"
            />
          </label>
        </div>
        <div className={styles.quickUpdateActions}>
          <button className={styles.primaryButton} type="submit">
            {state === "saving" ? "Saving…" : "Update player journey"}
          </button>
          <span className={styles.updateStatus} role="status">
            {state === "error" ? "" : message}
          </span>
        </div>
      </fieldset>
      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={state === "error" ? message : ""}
        formRef={formRef}
        className={styles.formError}
      />
    </form>
  );
}

async function responseRevision(response: Response, fallback: number): Promise<number> {
  const result = await requireClientMutationJson<{ plan: { revision: number } }>(
    response,
    (value): value is { plan: { revision: number } } =>
      Boolean(
        value &&
          typeof value === "object" &&
          "plan" in value &&
          value.plan &&
          typeof value.plan === "object" &&
          "revision" in value.plan &&
          Number.isSafeInteger(value.plan.revision),
      ),
    "The coaching update could not be saved.",
  );
  return result.plan.revision || fallback;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}
