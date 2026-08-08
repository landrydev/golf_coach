"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "../workspace.module.css";

export function ProfileForm(props: {
  displayName: string;
  businessName?: string;
  location?: string;
  bio?: string;
  contactEmail: string;
  accentColor?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message || "Your profile could not be saved.");
      setState("saved");
      setMessage("Coach identity saved.");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Your profile could not be saved.");
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <section className={styles.formCard}>
        <fieldset className={styles.formSection}>
          <legend>Identity your golfers recognize</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Coach display name
              <input name="displayName" required maxLength={120} defaultValue={props.displayName} />
            </label>
            <label className={styles.field}>
              Business name (optional)
              <input name="businessName" maxLength={160} defaultValue={props.businessName} />
            </label>
            <label className={styles.field}>
              Contact email
              <input name="contactEmail" type="email" required maxLength={254} defaultValue={props.contactEmail} />
            </label>
            <label className={styles.field}>
              Canadian location (optional)
              <input name="location" maxLength={160} defaultValue={props.location} placeholder="Calgary, Alberta" />
            </label>
            <label className={styles.fullField}>
              Short coaching description (optional)
              <textarea name="bio" maxLength={700} defaultValue={props.bio} />
            </label>
            <label className={styles.field}>
              Accent colour
              <input name="accentColor" type="color" defaultValue={props.accentColor || "#1b4f40"} />
              <small>Choose a dark accent. Roadmap rejects colours that would make text hard to read.</small>
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
          {state === "saving" ? "Saving…" : "Save coach identity"}
        </button>
      </div>
    </form>
  );
}
