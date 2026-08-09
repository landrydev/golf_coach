"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clientMutationErrorMessage,
  requestClientMutation,
} from "@/lib/client-mutation-recovery";
import {
  isProfileMutationResponse,
  profileMutationExpectedFromForm,
  requireExactClientMutationJson,
} from "@/lib/instructor-mutation-response-contracts";
import { requiresAuthoritativeMutationReload } from "@/lib/client-terminal-mutation";
import styles from "../workspace.module.css";

const ERROR_SUMMARY_ID = "profile-form-error-summary";

export function ProfileForm(props: {
  displayName: string;
  businessName?: string;
  professionalTitle?: string;
  philosophy?: string;
  contactEmail: string;
  contactPhone?: string;
  websiteUrl?: string;
  city?: string;
  provinceOrTerritory?: string;
  accentColor?: string;
  expectedUpdatedAt: number | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const mutationTerminalRef = useRef(false);
  const [state, setState] = useState<
    "idle" | "saving" | "saved" | "error" | "reload_required"
  >("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationTerminalRef.current) return;
    mutationTerminalRef.current = true;
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      ...Object.fromEntries(form.entries()),
      expectedUpdatedAt: props.expectedUpdatedAt,
    };
    const expectedProfile = profileMutationExpectedFromForm(
      payload,
      props.expectedUpdatedAt,
    );

    try {
      const response = await requestClientMutation("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await requireExactClientMutationJson(
        response,
        200,
        (value) => isProfileMutationResponse(value, expectedProfile),
        "Your profile could not be saved.",
      );
      setState("saved");
      setMessage(
        result.publicationImpact?.invalidated
          ? "Coach identity saved. Any existing private access was revoked. Review the affected golfer plans before publishing or sharing again."
          : "Coach identity saved.",
      );
    } catch (error) {
      const reloadRequired = requiresAuthoritativeMutationReload(error);
      if (!reloadRequired) mutationTerminalRef.current = false;
      setState(reloadRequired ? "reload_required" : "error");
      setMessage(
        clientMutationErrorMessage(
          error,
          "your coach identity was saved",
          "reload_before_retry",
          "Your profile could not be saved.",
        ),
      );
      return;
    }

    try {
      router.refresh();
    } catch {
      // A local refresh failure does not make the confirmed profile save fail.
    }
  }

  return (
    <form
      method="post"
      ref={formRef}
      className={styles.form}
      aria-describedby={ERROR_SUMMARY_ID}
      onSubmit={submit}
    >
      <section className={styles.formCard}>
        <fieldset
          className={styles.formSection}
          disabled={
            state === "saving" ||
            state === "saved" ||
            state === "reload_required"
          }
        >
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
              Professional title (optional)
              <input name="professionalTitle" maxLength={120} defaultValue={props.professionalTitle} />
            </label>
            <label className={styles.field}>
              Contact email
              <input name="contactEmail" type="email" required maxLength={254} defaultValue={props.contactEmail} />
            </label>
            <label className={styles.field}>
              Contact phone (optional)
              <input name="contactPhone" type="tel" maxLength={50} defaultValue={props.contactPhone} />
            </label>
            <label className={styles.field}>
              Website (optional)
              <input name="websiteUrl" type="url" maxLength={2048} defaultValue={props.websiteUrl} placeholder="https://coach.example.ca" />
            </label>
            <label className={styles.field}>
              City (optional)
              <input name="city" maxLength={100} defaultValue={props.city} placeholder="Calgary" />
            </label>
            <label className={styles.field}>
              Province or territory (optional)
              <input name="provinceOrTerritory" maxLength={100} defaultValue={props.provinceOrTerritory} placeholder="Alberta" />
            </label>
            <label className={styles.fullField}>
              Short coaching description (optional)
              <textarea name="philosophy" maxLength={700} defaultValue={props.philosophy} />
            </label>
            <label className={styles.field}>
              Accent colour
              <input name="accentColor" type="color" defaultValue={props.accentColor || "#1b4f40"} />
              <small>Choose a dark accent. Roadmap rejects colours that would make text hard to read.</small>
            </label>
          </div>
        </fieldset>
      </section>
      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={
          state === "error" || state === "reload_required" ? message : ""
        }
        formRef={formRef}
        className={styles.errorStatus}
      />
      {state === "saved" && message ? (
        <div className={styles.notice} role="status">
          <strong>{message}</strong>
          <span>
            Profile controls remain locked until the authoritative page reloads.
          </span>
          <a className={styles.secondaryButton} href="/app/settings">
            Reload confirmed coach identity
          </a>
        </div>
      ) : null}
      {state === "reload_required" ? (
        <div className={styles.notice} role="alert">
          <strong>Reload before making another profile change.</strong>
          <span>
            The submitted values are locked because Roadmap cannot yet prove whether the
            save committed.
          </span>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload and check coach identity
          </button>
        </div>
      ) : null}
      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={
            state === "saving" ||
            state === "saved" ||
            state === "reload_required"
          }
        >
          {state === "saving" ? "Saving…" : "Save coach identity"}
        </button>
      </div>
    </form>
  );
}
