"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clientMutationErrorMessage,
  requestClientMutation,
} from "@/lib/client-mutation-recovery";
import styles from "../../workspace.module.css";

const ERROR_SUMMARY_ID = "staged-golfer-form-error-summary";

export function StagedGolferForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyKeyRef = useRef("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    try {
      const response = await requestClientMutation("/api/golfers/staged", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          adultEligibilityConfirmed:
            form.get("adultEligibilityConfirmed") === "yes",
          displayName: form.get("displayName"),
          preferredName: form.get("preferredName"),
          email: form.get("email"),
          planTitle: form.get("planTitle"),
          goal: {
            statement: form.get("goalStatement"),
            why: form.get("goalWhy"),
            context: form.get("goalContext"),
          },
        }),
      });
      const result = (await response.json()) as {
        golfer?: { id?: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.golfer?.id) {
        throw new Error(
          result.error?.message || "The resumable golfer draft could not be saved.",
        );
      }
      router.push(
        `/app/golfers/${encodeURIComponent(result.golfer.id)}/complete`,
      );
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(
        clientMutationErrorMessage(
          error,
          "the resumable golfer draft was saved",
          "retry_same_attempt",
          "The resumable golfer draft could not be saved.",
        ),
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
          <legend>Save the real basics first</legend>
          <p className={styles.muted}>
            This creates a private, resumable record with no invented assessment,
            priority, phase, or package content. It cannot be previewed or published until
            you finish the coaching roadmap.
          </p>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Golfer display name
              <input name="displayName" required maxLength={120} autoComplete="name" />
            </label>
            <label className={styles.field}>
              Preferred name (optional)
              <input name="preferredName" maxLength={120} />
            </label>
            <label className={styles.fullField}>
              Contact email (optional)
              <input name="email" type="email" maxLength={254} autoComplete="email" />
              <small>Roadmap does not send a message or private link automatically.</small>
            </label>
            <label className={styles.fullField}>
              Plan title
              <input name="planTitle" required maxLength={120} />
            </label>
            <label className={styles.fullField}>
              Primary goal
              <textarea name="goalStatement" required maxLength={600} />
            </label>
            <label className={styles.fullField}>
              Why it matters (optional)
              <textarea name="goalWhy" maxLength={1_000} />
            </label>
            <label className={styles.fullField}>
              Practical context (optional)
              <textarea name="goalContext" maxLength={1_000} />
            </label>
            <label className={`${styles.fullField} ${styles.confirmRow}`}>
              <input
                name="adultEligibilityConfirmed"
                type="checkbox"
                value="yes"
                required
              />
              <span>
                I confirm this golfer is an adult and I have a suitable basis to create
                this private coaching record.
              </span>
            </label>
          </div>
        </fieldset>
      </section>
      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={state === "error" ? message : ""}
        formRef={formRef}
        className={styles.errorStatus}
      />
      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={state === "saving"}
        >
          {state === "saving" ? "Saving basics…" : "Save basics and continue"}
        </button>
      </div>
    </form>
  );
}
