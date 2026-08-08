"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import styles from "../../../workspace.module.css";

const ERROR_SUMMARY_ID = "golfer-settings-form-error-summary";

export function GolferSettingsForm(props: {
  golferId: string;
  planId: string;
  planRevision: number;
  displayName: string;
  preferredName: string | null;
  contactEmail: string | null;
  status: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const summaryOnlyRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<"save" | "archive" | null>(null);
  const [errorFocus, setErrorFocus] = useState<"form" | "summary">("form");
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorFocus("form");
    setBusy("save");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/golfers/${encodeURIComponent(props.golferId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.get("displayName"),
          preferredName: form.get("preferredName"),
          contactEmail: form.get("contactEmail"),
          expectedPlanId: props.planId,
          expectedPlanRevision: props.planRevision,
        }),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message || "Golfer details could not be saved.");
      router.push(`/app/golfers/${encodeURIComponent(props.golferId)}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Golfer details could not be saved.");
      setBusy(null);
    }
  }

  async function archive() {
    if (!window.confirm("Archive this golfer and revoke every active private link?")) return;
    setErrorFocus("summary");
    setBusy("archive");
    setMessage("");
    try {
      const response = await fetch(`/api/golfers/${encodeURIComponent(props.golferId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "archive_golfer_and_revoke_access" }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: { message?: string } };
        throw new Error(result.error?.message || "The golfer could not be archived.");
      }
      router.push("/app/golfers");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The golfer could not be archived.");
      setBusy(null);
    }
  }

  return (
    <div className={styles.form}>
      {props.status === "active" ? (
      <form
        ref={formRef}
        className={styles.formCard}
        aria-describedby={ERROR_SUMMARY_ID}
        onSubmit={save}
      >
        <fieldset className={styles.formSection} disabled={busy !== null}>
          <legend>Golfer identity and contact</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Display name
              <input name="displayName" defaultValue={props.displayName} required maxLength={120} />
            </label>
            <label className={styles.field}>
              Preferred name (optional)
              <input name="preferredName" defaultValue={props.preferredName ?? ""} maxLength={120} />
            </label>
            <label className={styles.fullField}>
              Contact email (optional)
              <input name="contactEmail" type="email" defaultValue={props.contactEmail ?? ""} maxLength={254} />
              <small>Roadmap does not send the private link automatically.</small>
            </label>
          </div>
        </fieldset>
        <div className={styles.notice} role="note">
          <strong>Saving withdraws every published plan for this golfer.</strong>
          <span>Identity appears in the private view, so all active links are revoked and a fresh review is required.</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.primaryButton} type="submit" disabled={busy !== null}>
            {busy === "save" ? "Saving…" : "Save golfer details"}
          </button>
        </div>
      </form>
      ) : (
        <div className={styles.notice} role="note">
          <strong>This golfer is {props.status}.</strong>
          <span>Identity changes and new private access are unavailable in this state.</span>
        </div>
      )}

      {props.status === "active" ? <section className={styles.formCard}>
        <h2>Archive golfer</h2>
        <p className={styles.muted}>
          Archiving is reversible only through a future supported recovery process. It hides
          active work and immediately revokes private links; it is not a deletion claim.
        </p>
        <button className={styles.dangerButton} type="button" disabled={busy !== null} onClick={archive}>
          {busy === "archive" ? "Archiving…" : "Archive golfer and revoke access"}
        </button>
      </section> : null}
      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={message}
        formRef={errorFocus === "form" ? formRef : summaryOnlyRef}
        className={styles.errorStatus}
      />
    </div>
  );
}
