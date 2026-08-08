"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "../workspace.module.css";

export function PackageForm() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
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
      terms: form.get("terms"),
      externalActionUrl: form.get("externalActionUrl"),
      status: "active",
    };

    try {
      const response = await fetch("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message || "The package could not be saved.");
      event.currentTarget.reset();
      setState("saved");
      setMessage("Package saved. It can now be connected to a coaching phase.");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The package could not be saved.");
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
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
      {message ? (
        <div className={state === "error" ? styles.errorStatus : styles.formStatus} role={state === "error" ? "alert" : "status"}>
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
