"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clientMutationErrorMessage,
  requestClientMutation,
} from "@/lib/client-mutation-recovery";
import styles from "../../workspace.module.css";

type ApiError = { error?: { message?: string } };
type PackageOption = { id: string; name: string; fitDescription: string };
const ERROR_SUMMARY_ID = "new-golfer-form-error-summary";

export function NewGolferForm({ packages }: { packages: PackageOption[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyKeyRef = useRef("");
  const [phaseCount, setPhaseCount] = useState<3 | 4>(4);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const payload = {
      displayName: form.get("displayName"),
      email: form.get("email"),
      adultEligibilityConfirmed: form.get("adultEligibilityConfirmed") === "yes",
      planTitle: form.get("planTitle"),
      firstPhasePackageId: form.get("firstPhasePackageId") || null,
      goal: {
        statement: form.get("goalStatement"),
        why: form.get("goalWhy"),
        context: form.get("goalContext"),
      },
      assessment: {
        summary: form.get("assessmentSummary"),
        strengths: form.get("strengths"),
        primaryPattern: form.get("primaryPattern"),
        limitations: form.get("limitations"),
      },
      priority: {
        title: form.get("priorityTitle"),
        rationale: form.get("priorityRationale"),
      },
      phases: Array.from({ length: phaseCount }, (_, index) => index + 1).map((number) => ({
        number,
        title: form.get(`phase${number}Title`),
        purpose: form.get(`phase${number}Purpose`),
        rationale: form.get(`phase${number}Rationale`),
        progressSignals: lineItems(form.get(`phase${number}ProgressSignals`)),
      })),
    };

    try {
      // Retain the key after ambiguous transport/server failures so an exact
      // retry cannot create a second golfer workspace. Successful navigation
      // unmounts the form and naturally starts a new intent with a new key.
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }
      const response = await requestClientMutation("/api/golfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ApiError & { golfer?: { id: string } };
      if (!response.ok || !result.golfer?.id) {
        throw new Error(result.error?.message || "The golfer record could not be created.");
      }
      router.push(`/app/golfers/${encodeURIComponent(result.golfer.id)}`);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(
        clientMutationErrorMessage(
          error,
          "the golfer workspace was created",
          "retry_same_attempt",
          "The golfer record could not be created.",
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
        <fieldset className={styles.formSection}>
          <legend>Golfer and goal</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Golfer display name
              <input name="displayName" required maxLength={120} autoComplete="name" />
              <small>Use the name the golfer expects to see.</small>
            </label>
            <label className={styles.field}>
              Golfer email (optional)
              <input name="email" type="email" maxLength={254} autoComplete="email" />
              <small>Sharing remains a separate review step.</small>
            </label>
            <label className={styles.fullField}>
              Plan title
              <input
                name="planTitle"
                required
                maxLength={120}
                placeholder="Driver development roadmap"
              />
            </label>
            <label className={styles.fullField}>
              Desired outcome
              <textarea
                name="goalStatement"
                required
                maxLength={600}
                placeholder="What does the golfer want from their golf?"
              />
            </label>
            <label className={styles.fullField}>
              Why it matters (optional)
              <textarea name="goalWhy" maxLength={1_000} />
            </label>
            <label className={styles.fullField}>
              Practical context (optional)
              <textarea
                name="goalContext"
                maxLength={1_000}
                placeholder="Practice reality, upcoming play, constraints, or preferences."
              />
            </label>
            <label className={`${styles.fullField} ${styles.confirmRow}`}>
              <input
                name="adultEligibilityConfirmed"
                type="checkbox"
                value="yes"
                required
              />
              <span>
                I confirm this golfer is an adult and eligible for this initial product. I have
                a suitable basis to create this coaching record.
              </span>
            </label>
          </div>
        </fieldset>
      </section>

      <section className={styles.formCard}>
        <fieldset className={styles.formSection}>
          <legend>First coaching phase package</legend>
          <label className={styles.fullField}>
            Existing package (optional)
            <select name="firstPhasePackageId" defaultValue="">
              <option value="">No package attached — golfer can ask, wait, or practise independently</option>
              {packages.map((coachingPackage) => (
                <option key={coachingPackage.id} value={coachingPackage.id}>
                  {coachingPackage.name}
                </option>
              ))}
            </select>
            <small>
              This links the recommendation to a package you already sell. Booking or payment
              still happens on your external service.
            </small>
          </label>
        </fieldset>
      </section>

      <section className={styles.formCard}>
        <fieldset className={styles.formSection}>
          <legend>Starting assessment</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.fullField}>
              Coach assessment summary
              <textarea
                name="assessmentSummary"
                required
                maxLength={2_000}
                placeholder="Describe the smallest set of observations needed to explain what comes first."
              />
            </label>
            <label className={styles.fullField}>
              Strengths to preserve
              <textarea name="strengths" required maxLength={1_500} />
            </label>
            <label className={styles.fullField}>
              Primary pattern
              <textarea
                name="primaryPattern"
                required
                maxLength={2_000}
                placeholder="Describe the narrow recurring pattern the roadmap addresses. Keep observation separate from interpretation."
              />
            </label>
            <label className={styles.fullField}>
              Evidence limits
              <textarea
                name="limitations"
                required
                maxLength={1_500}
                placeholder="State what was not observed, sample limitations, and what this assessment cannot predict."
              />
            </label>
          </div>
        </fieldset>
      </section>

      <section className={styles.formCard}>
        <fieldset className={styles.formSection}>
          <legend>Current priority</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Primary priority barrier
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
        <fieldset className={styles.formSection}>
          <legend>Directional development phases</legend>
          <p className={styles.muted}>
            Future phases are direction, not promises. They can change as evidence develops.
          </p>
          <label className={styles.field}>
            Number of phases
            <select
              name="phaseCount"
              value={phaseCount}
              onChange={(event) => setPhaseCount(event.target.value === "3" ? 3 : 4)}
            >
              <option value="3">3 directional phases</option>
              <option value="4">4 directional phases</option>
            </select>
          </label>
          {Array.from({ length: phaseCount }, (_, index) => index + 1).map((number) => (
            <div className={styles.fieldGrid} key={number}>
              <label className={styles.field}>
                Phase {number} title
                <input name={`phase${number}Title`} required maxLength={120} />
              </label>
              <label className={styles.field}>
                Phase {number} purpose
                <textarea name={`phase${number}Purpose`} required maxLength={700} />
              </label>
              <label className={styles.fullField}>
                {number === 1 ? "Why this phase leads" : `Why Phase ${number} follows (optional)`}
                <textarea
                  name={`phase${number}Rationale`}
                  required={number === 1}
                  maxLength={1_500}
                />
              </label>
              <label className={styles.fullField}>
                {number === 1 ? "Progress signals — one per line" : "Progress signals — one per line (optional)"}
                <textarea
                  name={`phase${number}ProgressSignals`}
                  required={number === 1}
                  maxLength={2_400}
                  placeholder={number === 1 ? "A repeatable observable signal\nA coach-reviewed on-course signal" : undefined}
                />
                <small>Use observable signals, not guaranteed outcomes or fixed timelines.</small>
              </label>
            </div>
          ))}
        </fieldset>
      </section>

      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={status === "error" ? message : ""}
        formRef={formRef}
        className={styles.errorStatus}
      />
      <div className={styles.actions}>
        <button className={styles.primaryButton} type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save draft and review"}
        </button>
        <button className={styles.secondaryButton} type="button" onClick={() => router.back()}>
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
