"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ConsentCurrentState,
  ConsentSubjectType,
} from "@/lib/consent-repository";
import styles from "@/app/app/workspace.module.css";

export function ConsentPurposeControl({
  heading,
  state: initialState,
  subjectType,
  golferId = null,
}: {
  heading: string;
  state: ConsentCurrentState;
  subjectType: ConsentSubjectType;
  golferId?: string | null;
}) {
  const router = useRouter();
  const idempotency = useRef<{ key: string; intent: string } | null>(null);
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const configured =
    state.policy.configured &&
    Boolean(state.policy.version) &&
    Boolean(state.policy.purposeDescription);
  const canWithdraw = state.withdrawalAvailable;

  async function transition(action: "grant" | "withdraw") {
    const policyVersion = action === "withdraw"
      ? state.currentRecord?.policyVersion
      : state.policy.version;
    if (busy || !policyVersion || (action === "grant" && !configured)) return;

    setBusy(true);
    setMessage("");
    setFailed(false);
    const intent = [
      action,
      state.purpose,
      state.currentRecord?.id ?? "none",
      policyVersion,
    ].join(":");
    if (idempotency.current?.intent !== intent) {
      idempotency.current = { key: crypto.randomUUID(), intent };
    }

    try {
      const response = await fetch("/api/consents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotency.current.key,
        },
        body: JSON.stringify({
          action,
          purpose: state.purpose,
          policyVersion,
          subjectType,
          golferId,
          expectedCurrentRecordId: state.currentRecord?.id ?? null,
          evidenceReference: null,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | {
            record?: ConsentCurrentState["currentRecord"];
            error?: { message?: string };
          }
        | null;
      if (!response.ok || !result?.record) {
        throw new Error(
          result?.error?.message || "The authorization choice could not be recorded.",
        );
      }

      setState((current) => ({
        ...current,
        currentRecord: result.record ?? null,
        effectiveGranted: action === "grant",
        withdrawalAvailable: action === "grant",
      }));
      setMessage(
        action === "grant"
          ? "Authorization recorded."
          : "Authorization withdrawn. Related access is now disabled.",
      );
      idempotency.current = null;
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "The authorization choice could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.formCard} aria-labelledby={`${state.purpose}-consent-heading`}>
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.eyebrow}>Authorization control</span>
          <h2 id={`${state.purpose}-consent-heading`}>{heading}</h2>
        </div>
      </div>
      {canWithdraw && !state.effectiveGranted ? (
        <div className={styles.notice} role="status">
          <strong>Existing recorded authorization</strong>
          <span>{state.currentRecord?.purposeDescription}</span>
          <span>Policy version: {state.currentRecord?.policyVersion}</span>
          <button
            className={styles.dangerButton}
            type="button"
            disabled={busy}
            onClick={() => void transition("withdraw")}
          >
            {busy ? "Recording..." : "Withdraw existing authorization"}
          </button>
        </div>
      ) : null}
      {configured ? (
        <>
          <p>{state.policy.purposeDescription}</p>
          <p className={styles.muted}>Policy version: {state.policy.version}</p>
          <p className={styles.muted}>
            Current state: {state.effectiveGranted ? "authorized" : "not authorized"}
          </p>
          <button
            className={state.effectiveGranted ? styles.dangerButton : styles.primaryButton}
            type="button"
            disabled={busy}
            onClick={() => void transition(state.effectiveGranted ? "withdraw" : "grant")}
          >
            {busy
              ? "Recording..."
              : state.effectiveGranted
                ? "Withdraw authorization"
                : "Record authorization"}
          </button>
        </>
      ) : canWithdraw ? (
        <div className={styles.notice} role="status">
          <strong>New authorization is unavailable.</strong>
          <span>
            No approved current policy description and version are configured. The existing
            authorization can still be withdrawn above.
          </span>
        </div>
      ) : (
        <div className={styles.notice} role="status">
          <strong>Authorization is unavailable.</strong>
          <span>
            No approved policy description and version are configured for this action, so it
            remains disabled.
          </span>
        </div>
      )}
      {message ? (
        <p role={failed ? "alert" : "status"} className={styles.muted}>
          {message}
        </p>
      ) : null}
    </section>
  );
}
