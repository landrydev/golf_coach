"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
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
}: {
  golferId: string;
  planId: string;
  expectedRevision: number;
  packages: PackageOption[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [phaseCount, setPhaseCount] = useState<3 | 4>(4);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const phases = Array.from({ length: phaseCount }, (_, index) => {
      const number = index + 1;
      return {
        number,
        title: form.get(`phase${number}Title`),
        purpose: form.get(`phase${number}Purpose`),
        rationale: number === 1 ? form.get("firstPhaseRationale") : null,
        progressSignals:
          number === 1
            ? splitLines(String(form.get("firstPhaseProgressSignals") ?? ""))
            : [],
      };
    });

    try {
      const response = await fetch(
        `/api/golfers/${encodeURIComponent(golferId)}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedPlanId: planId,
            expectedRevision,
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
            phases,
            firstPhasePackageId: form.get("firstPhasePackageId") || null,
          }),
        },
      );
      const result = (await response.json()) as {
        completed?: boolean;
        error?: { message?: string };
      };
      if (!response.ok || result.completed !== true) {
        throw new Error(
          result.error?.message || "The staged roadmap could not be completed.",
        );
      }
      router.push(`/app/golfers/${encodeURIComponent(golferId)}`);
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The staged roadmap could not be completed.",
      );
    }
  }

  return (
    <form
      ref={formRef}
      className={styles.form}
      aria-describedby={ERROR_SUMMARY_ID}
      onSubmit={submit}
    >
      <section className={styles.formCard}>
        <fieldset className={styles.formSection} disabled={state === "saving"}>
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
        <fieldset className={styles.formSection} disabled={state === "saving"}>
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
        <fieldset className={styles.formSection} disabled={state === "saving"}>
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
        <fieldset className={styles.formSection} disabled={state === "saving"}>
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
        message={state === "error" ? message : ""}
        formRef={formRef}
        className={styles.errorStatus}
      />
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
          disabled={state === "saving"}
        >
          {state === "saving" ? "Completing draft…" : "Complete roadmap draft"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={state === "saving"}
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
