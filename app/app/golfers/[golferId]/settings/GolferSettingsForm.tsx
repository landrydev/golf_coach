"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clientMutationErrorMessage,
  requestClientMutation,
  requireClientMutationSuccess,
} from "@/lib/client-mutation-recovery";
import { requiresAuthoritativeMutationReload } from "@/lib/client-terminal-mutation";
import {
  isGolferUpdatedResponse,
  requireExactClientMutationJson,
} from "@/lib/instructor-mutation-response-contracts";
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
  const mutationTerminalRef = useRef(false);
  const [busy, setBusy] = useState<"save" | "archive" | null>(null);
  const [errorFocus, setErrorFocus] = useState<"form" | "summary">("form");
  const [message, setMessage] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false);
  const [confirmedDestination, setConfirmedDestination] = useState<string | null>(null);
  const isLocked =
    busy !== null || reloadRequired || confirmedDestination !== null;
  const golferDestination = `/app/golfers/${encodeURIComponent(props.golferId)}`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationTerminalRef.current) return;
    mutationTerminalRef.current = true;
    setErrorFocus("form");
    setBusy("save");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await requestClientMutation(`/api/golfers/${encodeURIComponent(props.golferId)}`, {
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
      await requireExactClientMutationJson(
        response,
        200,
        isGolferUpdatedResponse,
        "Golfer details could not be saved.",
      );
    } catch (error) {
      const authoritativeReloadRequired =
        requiresAuthoritativeMutationReload(error);
      if (authoritativeReloadRequired) {
        setReloadRequired(true);
      } else {
        mutationTerminalRef.current = false;
      }
      setMessage(
        clientMutationErrorMessage(
          error,
          "the golfer details were saved",
          "reload_before_retry",
          "Golfer details could not be saved.",
        ),
      );
      setBusy(null);
      return;
    }

    const destination = golferDestination;
    setConfirmedDestination(destination);
    setMessage("Golfer details saved. Open the authoritative golfer view to continue.");
    setBusy(null);
    try {
      router.push(destination);
      router.refresh();
    } catch {
      // The confirmed edit remains terminal; the native destination stays available.
    }
  }

  async function archive() {
    if (mutationTerminalRef.current) return;
    if (!window.confirm("Archive this golfer and revoke every active private link?")) return;
    mutationTerminalRef.current = true;
    setErrorFocus("summary");
    setBusy("archive");
    setMessage("");
    try {
      const response = await requestClientMutation(`/api/golfers/${encodeURIComponent(props.golferId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "archive_golfer_and_revoke_access" }),
      });
      await requireClientMutationSuccess(
        response,
        "The golfer could not be archived.",
        [204],
      );
    } catch (error) {
      const authoritativeReloadRequired =
        requiresAuthoritativeMutationReload(error);
      if (authoritativeReloadRequired) {
        setReloadRequired(true);
      } else {
        mutationTerminalRef.current = false;
      }
      setMessage(
        clientMutationErrorMessage(
          error,
          "the golfer was archived and private access was revoked",
          "reload_before_retry",
          "The golfer could not be archived.",
        ),
      );
      setBusy(null);
      return;
    }

    const destination = golferDestination;
    setConfirmedDestination(destination);
    setMessage(
      "Golfer archived and private access revoked. Open the authoritative archived golfer state to continue.",
    );
    setBusy(null);
    try {
      router.push(destination);
      router.refresh();
    } catch {
      // The confirmed archive remains terminal; the native destination stays available.
    }
  }

  return (
    <div className={styles.form}>
      {props.status === "active" ? (
      <form
        method="post"
        ref={formRef}
        className={styles.formCard}
        aria-describedby={ERROR_SUMMARY_ID}
        onSubmit={save}
      >
        <fieldset
          className={styles.formSection}
          disabled={isLocked}
        >
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
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={isLocked}
          >
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
        <button
          className={styles.dangerButton}
          type="button"
          disabled={isLocked}
          onClick={archive}
        >
          {busy === "archive" ? "Archiving…" : "Archive golfer and revoke access"}
        </button>
      </section> : null}
      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={confirmedDestination ? "" : message}
        formRef={errorFocus === "form" ? formRef : summaryOnlyRef}
        className={styles.errorStatus}
      />
      {confirmedDestination ? (
        <div className={styles.formStatus} role="status">
          <span>{message}</span>
          <a className={styles.secondaryButton} href={confirmedDestination}>
            Continue to confirmed state
          </a>
        </div>
      ) : null}
      {reloadRequired ? (
        <div className={styles.notice} role="alert">
          <strong>Reload before changing or archiving this golfer.</strong>
          <span>
            All mutation controls are locked until the authoritative golfer state is loaded.
          </span>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload and check golfer state
          </button>
        </div>
      ) : null}
    </div>
  );
}
