"use client";

import { useState } from "react";
import type { AccountDataRequestView } from "@/lib/repository";
import styles from "../../workspace.module.css";

const openDeletionStatuses = new Set<AccountDataRequestView["status"]>([
  "submitted",
  "identity_verification_required",
  "verified",
  "in_progress",
]);

export function DataRequestControls({
  initialRequests,
}: {
  initialRequests: AccountDataRequestView[];
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<"export" | "deletion" | null>(null);
  const [requests, setRequests] = useState(initialRequests);
  const openDeletionRequest = requests.find(
    (request) =>
      request.type === "deletion" && openDeletionStatuses.has(request.status),
  );

  async function downloadExport() {
    setBusy("export");
    setMessage("");
    setError(false);

    try {
      const response = await fetch("/api/data-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          result?.error?.message || "The JSON export could not be prepared.",
        );
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("application/json")) {
        throw new Error("The export response was not a JSON file.");
      }
      const file = await response.blob();
      if (file.size === 0 || file.size > 6 * 1024 * 1024) {
        throw new Error("The export response was outside the supported file size.");
      }

      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = safeFilename(response.headers.get("content-disposition"));
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      const historyRefreshed = await refreshRequestHistory();
      setError(!historyRefreshed);
      setMessage(
        historyRefreshed
          ? "Your tenant-scoped JSON export was prepared and downloaded. It does not include media file bytes or security secrets. The status history was refreshed."
          : "Your tenant-scoped JSON export was downloaded, but the on-page status history could not be refreshed. Reload this page to see the latest record.",
      );
    } catch (requestError) {
      setError(true);
      setMessage(
        requestError instanceof Error
          ? requestError.message
          : "The JSON export could not be prepared.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function refreshRequestHistory(): Promise<boolean> {
    try {
      const response = await fetch("/api/data-requests", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const result = (await response.json()) as {
        error?: { message?: string };
        requests?: AccountDataRequestView[];
      };
      if (!response.ok || !Array.isArray(result.requests)) return false;
      setRequests(result.requests);
      return true;
    } catch {
      return false;
    }
  }

  async function requestDeletionReview() {
    if (
      !window.confirm(
        "Submit an account deletion request for identity and retention review? This does not immediately delete data.",
      )
    ) {
      return;
    }

    setBusy("deletion");
    setMessage("");
    setError(false);
    try {
      const response = await fetch("/api/data-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "deletion" }),
      });
      const result = (await response.json()) as {
        error?: { message?: string };
        existing?: boolean;
        request?: AccountDataRequestView;
      };
      if (!response.ok) {
        throw new Error(result.error?.message || "The request could not be queued.");
      }
      if (!result.request) {
        throw new Error("The request was accepted without a readable status record.");
      }
      setRequests((current) => mergeRequest(current, result.request!));
      setMessage(
        result.existing
          ? "A deletion review is already open. No duplicate request was created, and no data has been irreversibly removed."
          : "Deletion review requested. Identity is not yet verified, and no data has been irreversibly removed.",
      );
    } catch (requestError) {
      setError(true);
      setMessage(
        requestError instanceof Error
          ? requestError.message
          : "The request could not be queued.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.form}>
      <section className={styles.formCard}>
        <div className={styles.cardHeader}>
          <h2>Export your account data</h2>
        </div>
        <p className={styles.muted}>
          Download a structured JSON copy of your coach profile, subscription state,
          packages, golfer records, roadmaps, consent records, and sharing status. Media
          metadata is listed, but file bytes are not included.
        </p>
        <div className={styles.actions} style={{ marginTop: "1rem" }}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={busy !== null}
            onClick={downloadExport}
          >
            {busy === "export" ? "Preparing…" : "Download JSON export"}
          </button>
        </div>
        <p className={styles.muted} style={{ marginTop: "0.8rem" }}>
          The export excludes private-link tokens and fingerprints, provider payloads and
          identifiers, internal storage keys and hashes, and security audit records.
        </p>
      </section>

      <section className={styles.formCard}>
        <div className={styles.cardHeader}>
          <h2>Request account deletion review</h2>
        </div>
        <p className={styles.muted}>
          Submit a request for identity and retention review. This action does not delete
          records. Exact retention periods and permitted exceptions remain unresolved, so
          destructive deletion is not automated here.
        </p>
        <div className={styles.actions} style={{ marginTop: "1rem" }}>
          <button
            className={styles.dangerButton}
            type="button"
            disabled={busy !== null || Boolean(openDeletionRequest)}
            onClick={requestDeletionReview}
          >
            {busy === "deletion"
              ? "Submitting…"
              : openDeletionRequest
                ? "Deletion review already open"
                : "Submit deletion review request"}
          </button>
        </div>
        {openDeletionRequest ? (
          <p className={styles.muted} style={{ marginTop: "0.8rem" }}>
            Current status: {statusLabel(openDeletionRequest.status)}. {" "}
            {statusExplanation(openDeletionRequest)}
          </p>
        ) : null}
      </section>

      <section className={styles.formCard} aria-labelledby="data-request-history-heading">
        <div className={styles.cardHeader}>
          <h2 id="data-request-history-heading">Recent data-request status</h2>
        </div>
        <p className={styles.muted}>
          These tenant-scoped records report workflow state only. They do not promise a
          deadline or imply that identity verification, disabling, or deletion occurred.
        </p>
        {requests.length > 0 ? (
          <ul className={styles.list}>
            {requests.map((request) => (
              <li key={request.id}>
                <div>
                  <strong>{requestTypeLabel(request.type)}</strong>
                  <small>Submitted {formatDate(request.createdAt)}</small>
                  <small>{statusExplanation(request)}</small>
                </div>
                <span className={styles.status}>{statusLabel(request.status)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted} style={{ marginTop: "1rem" }}>
            No export or deletion-review records have been created for this account.
          </p>
        )}
      </section>

      {message ? (
        <div
          className={error ? styles.errorStatus : styles.formStatus}
          role={error ? "alert" : "status"}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}

function mergeRequest(
  requests: AccountDataRequestView[],
  incoming: AccountDataRequestView,
): AccountDataRequestView[] {
  return [incoming, ...requests.filter((request) => request.id !== incoming.id)].sort(
    (left, right) => right.createdAt - left.createdAt,
  );
}

function requestTypeLabel(type: AccountDataRequestView["type"]): string {
  const labels: Record<AccountDataRequestView["type"], string> = {
    access: "Access request",
    export: "Workspace export",
    correction: "Correction request",
    deletion: "Account deletion review",
    restriction: "Restriction request",
    consent_withdrawal: "Consent-withdrawal request",
  };
  return labels[type];
}

function statusLabel(status: AccountDataRequestView["status"]): string {
  const labels: Record<AccountDataRequestView["status"], string> = {
    submitted: "Submitted",
    identity_verification_required: "Identity review required",
    verified: "Identity verified",
    in_progress: "Review in progress",
    fulfilled: "Fulfilled",
    denied: "Denied",
    canceled: "Canceled",
    failed: "Failed",
  };
  return labels[status];
}

function statusExplanation(request: AccountDataRequestView): string {
  if (
    request.type === "deletion" &&
    request.status === "identity_verification_required"
  ) {
    return "Identity has not yet been verified; nothing is scheduled or deleted.";
  }
  if (request.type === "deletion" && openDeletionStatuses.has(request.status)) {
    return "The review remains open; this status does not claim deletion.";
  }
  return `Last status update recorded ${formatDate(request.updatedAt)}.`;
}

function formatDate(epoch: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(epoch));
}

function safeFilename(contentDisposition: string | null): string {
  const candidate = /filename="([A-Za-z0-9._-]+)"/i.exec(
    contentDisposition ?? "",
  )?.[1];
  return candidate || "roadmap-data-export.json";
}
