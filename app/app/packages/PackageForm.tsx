"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import styles from "../workspace.module.css";

const ERROR_SUMMARY_ID = "package-form-error-summary";

export function PackageForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyKeyRef = useRef("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    // React may clear SyntheticEvent.currentTarget once this synchronous turn
    // ends, so retain the concrete form before any await.
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const priceText = String(form.get("price") ?? "").trim();
    const price = priceText ? Number(priceText) : null;
    const priceCents = price !== null && Number.isFinite(price)
      ? Math.round(price * 100)
      : null;
    const payload = {
      title: form.get("title"),
      description: form.get("description"),
      priceCents,
      currency: priceCents === null ? undefined : "CAD",
      currentDetailsText: form.get("currentDetailsText"),
      inclusions: lineItems(form.get("inclusions")),
      cadence: form.get("cadence"),
      practiceExpectation: form.get("practiceExpectation"),
      evaluationDescription: form.get("evaluationDescription"),
      terms: form.get("terms"),
      externalActionUrl: form.get("externalActionUrl"),
      status: "active",
    };

    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }
      const response = await fetch("/api/packages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        package?: { id?: unknown };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message || "The package could not be saved.");
      if (typeof result.package?.id !== "string") {
        throw new Error("The package save could not be confirmed. Retry to check its result.");
      }
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The package could not be saved.");
      return;
    }

    // The server result is definitive. Complete local cleanup before retiring
    // the retry key so an unexpected client-side reset failure cannot turn a
    // committed save into a fresh duplicate submission.
    formElement.reset();
    idempotencyKeyRef.current = "";
    setState("saved");
    setMessage("Package saved. It can now be connected to a coaching phase.");
    try {
      router.refresh();
    } catch {
      // A refresh failure does not make the already-confirmed save fail.
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
        <fieldset className={styles.formSection}>
          <legend>Add a package you already sell</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.fullField}>
              Package name
              <input name="title" required maxLength={120} />
            </label>
            <label className={styles.fullField}>
              Why it fits
              <textarea name="description" required maxLength={1_500} />
            </label>
            <label className={styles.field}>
              Price in CAD (optional)
              <input name="price" type="number" min="0" max="100000" step="0.01" />
              <small>This is the instructor’s coaching-package price, not the Roadmap subscription.</small>
            </label>
            <label className={styles.field}>
              Current details when no price is shown
              <input
                name="currentDetailsText"
                maxLength={500}
                placeholder="Confirm current price with me"
              />
              <small>Provide either an exact price or an honest current-details message.</small>
            </label>
            <label className={styles.fullField}>
              Material inclusions — one per line
              <textarea
                name="inclusions"
                required
                maxLength={2_000}
                placeholder={"Four individual lessons\nWritten practice direction\nEnd-of-phase review"}
              />
              <small>List only what this package currently includes. Do not imply booking or payment has occurred.</small>
            </label>
            <label className={styles.field}>
              Cadence (optional)
              <input name="cadence" maxLength={300} placeholder="Four lessons over six to eight weeks" />
            </label>
            <label className={styles.fullField}>
              Practice expectation (optional)
              <textarea name="practiceExpectation" maxLength={1_000} />
            </label>
            <label className={styles.fullField}>
              Evaluation approach (optional)
              <textarea name="evaluationDescription" maxLength={1_000} />
            </label>
            <label className={styles.fullField}>
              Terms
              <textarea
                name="terms"
                required
                maxLength={1_500}
                placeholder="Sessions, expected window, expiry, rescheduling, and renewal terms."
              />
            </label>
            <label className={styles.fullField}>
              Existing HTTPS booking, purchase, or contact link
              <input name="externalActionUrl" type="url" required maxLength={2_048} />
              <small>Roadmap makes the handoff clear; it does not claim the external action completed.</small>
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
      {state === "saved" && message ? (
        <div className={styles.formStatus} role="status">
          {message}
        </div>
      ) : null}
      <div className={styles.actions}>
        <button className={styles.primaryButton} type="submit" disabled={state === "saving"}>
          {state === "saving" ? "Saving…" : "Save package"}
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
