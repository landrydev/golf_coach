"use client";

import { useRef, useState } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clientMutationErrorMessage,
  isClientMutationOutcomeUnknown,
  requestClientMutation,
  requireClientMutationSuccess,
} from "@/lib/client-mutation-recovery";
import type { AccountActiveShareControl } from "@/lib/plans";
import styles from "../../workspace.module.css";

const ERROR_SUMMARY_ID = "share-access-controls-error-summary";

export function ShareAccessControls({
  initialShares,
}: {
  initialShares: AccountActiveShareControl[];
}) {
  const mutationInFlight = useRef(false);
  const summaryOnlyRef = useRef<HTMLFormElement>(null);
  const [shares, setShares] = useState(initialShares);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);

  async function revoke(shareId: string) {
    if (mutationInFlight.current || reconciliationRequired) return;
    if (
      !window.confirm(
        "Revoke this private link and every active browser session opened from it?",
      )
    ) {
      return;
    }

    mutationInFlight.current = true;
    setRevokingId(shareId);
    setMessage("");
    setHasError(false);
    try {
      const response = await requestClientMutation(
        `/api/account/shares/${encodeURIComponent(shareId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation: "revoke_private_share_access",
          }),
        },
      );
      await requireClientMutationSuccess(
        response,
        "Private access could not be revoked.",
        [204],
      );
    } catch (error) {
      const unknown = isClientMutationOutcomeUnknown(error);
      setHasError(true);
      setReconciliationRequired(unknown);
      setMessage(
        clientMutationErrorMessage(
          error,
          "private access was revoked",
          "reload_before_retry",
          "Private access could not be revoked.",
        ),
      );
      setRevokingId(null);
      mutationInFlight.current = false;
      return;
    }

    setShares((current) => current.filter((share) => share.id !== shareId));
    setHasError(false);
    setMessage(
      "Private access revoked. Every active session beneath that link is now invalid.",
    );
    setRevokingId(null);
    mutationInFlight.current = false;
  }

  return (
    <section className={styles.formCard} aria-labelledby="active-share-controls-heading">
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.eyebrow}>Access containment</span>
          <h1 id="active-share-controls-heading">Active private access</h1>
          <p>
            These are capability records only. This page does not reveal golfer or plan
            content, recipient details, or the one-time private links.
          </p>
        </div>
      </div>

      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={hasError ? message : ""}
        formRef={summaryOnlyRef}
        className={styles.errorStatus}
      />

      {reconciliationRequired ? (
        <div className={styles.notice} role="alert">
          <strong>Reload before making another access change.</strong>
          <span>
            The last response did not prove whether the server committed. Active-access
            controls remain locked until this page reloads the tenant-scoped inventory.
          </span>
          <div className={styles.actions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload active access
            </button>
          </div>
        </div>
      ) : message && !hasError ? (
        <div className={styles.formStatus} role="status">
          {message}
        </div>
      ) : null}

      {shares.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>No active private access</h2>
          <p>No live private link currently grants golfer-roadmap access.</p>
        </div>
      ) : (
        <div className={styles.form}>
          {shares.map((share) => {
            const reference = share.id.slice(-8).toUpperCase();
            return (
              <div className={styles.notice} key={share.id}>
                <div>
                  <strong>Private access reference {reference}</strong>
                  <span>
                    Published revision {share.planRevision} · created{" "}
                    {new Date(share.createdAt).toLocaleString("en-CA")}
                    {share.expiresAt === null
                      ? " · no recorded link expiry"
                      : ` · expires ${new Date(share.expiresAt).toLocaleString("en-CA")}`}
                  </span>
                  <span>
                    {share.lastAccessedAt === null
                      ? "Not opened"
                      : `Last opened ${new Date(share.lastAccessedAt).toLocaleString("en-CA")}`}
                    {` · ${share.accessCount} link access${share.accessCount === 1 ? "" : "es"}`}
                    {` · ${share.activeSessionCount} active session${share.activeSessionCount === 1 ? "" : "s"}`}
                  </span>
                </div>
                <button
                  className={styles.dangerButton}
                  type="button"
                  disabled={revokingId !== null || reconciliationRequired}
                  aria-label={`Revoke private access reference ${reference}`}
                  onClick={() => revoke(share.id)}
                >
                  {revokingId === share.id ? "Revoking…" : "Revoke link and sessions"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
