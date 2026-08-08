"use client";

import { useRef, useState } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import type {
  AccountDataRequestType,
  AccountDataRequestView,
} from "@/lib/repository";
import styles from "../../workspace.module.css";

const ERROR_SUMMARY_ID = "data-request-controls-error-summary";

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
  const formRef = useRef<HTMLFormElement>(null);
  const summaryOnlyRef = useRef<HTMLFormElement>(null);
  const deletionIdempotencyKeyRef = useRef("");
  const manualReviewIdempotencyRef = useRef<{
    key: string;
    intent: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [errorFocus, setErrorFocus] = useState<"form" | "summary">("summary");
  const [busy, setBusy] = useState<"export" | "deletion" | "manual" | null>(
    null,
  );
  const [reviewType, setReviewType] = useState<ManualReviewType>("access");
  const [reviewDetails, setReviewDetails] = useState("");
  const [reviewDetailsInvalid, setReviewDetailsInvalid] = useState(false);
  const [requests, setRequests] = useState(initialRequests);
  const openDeletionRequest = requests.find(
    (request) =>
      request.type === "deletion" && openDeletionStatuses.has(request.status),
  );

  async function downloadExport() {
    setErrorFocus("summary");
    setReviewDetailsInvalid(false);
    setBusy("export");
    setMessage("");
    setError(false);

    try {
      const response = await fetch("/api/data-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (response.status === 202) {
        const deferred = (await response.json()) as {
          message?: string;
          request?: AccountDataRequestView;
        };
        if (!deferred.request) {
          throw new Error("The deferred export was accepted without a readable status record.");
        }
        setRequests((current) => mergeRequest(current, deferred.request!));
        setMessage(
          deferred.message ||
            "The workspace needs a manually prepared export. The request is recorded in status history.",
        );
        return;
      }
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

    setErrorFocus("summary");
    setReviewDetailsInvalid(false);
    setBusy("deletion");
    setMessage("");
    setError(false);
    let definitiveOutcome = false;
    try {
      if (!deletionIdempotencyKeyRef.current) {
        deletionIdempotencyKeyRef.current = crypto.randomUUID();
      }
      const response = await fetch("/api/data-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": deletionIdempotencyKeyRef.current,
        },
        body: JSON.stringify({ type: "deletion" }),
      });
      const result = (await response.json()) as {
        error?: { message?: string };
        existing?: boolean;
        request?: AccountDataRequestView;
      } | null;
      if (!response.ok) {
        definitiveOutcome = true;
        throw new Error(result?.error?.message || "The request could not be queued.");
      }
      if (!result?.request) {
        throw new Error("The request was accepted without a readable status record.");
      }
      definitiveOutcome = true;
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
      if (definitiveOutcome) deletionIdempotencyKeyRef.current = "";
      setBusy(null);
    }
  }

  async function submitManualReview() {
    setErrorFocus("form");
    const details = reviewDetails.trim();
    if (!details) {
      setReviewDetailsInvalid(true);
      setError(true);
      setMessage("Describe the data or outcome you want reviewed.");
      return;
    }

    setBusy("manual");
    setReviewDetailsInvalid(false);
    setMessage("");
    setError(false);
    const intent = JSON.stringify([reviewType, details]);
    if (manualReviewIdempotencyRef.current?.intent !== intent) {
      manualReviewIdempotencyRef.current = {
        key: crypto.randomUUID(),
        intent,
      };
    }
    let definitiveOutcome = false;
    try {
      const response = await fetch("/api/data-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": manualReviewIdempotencyRef.current.key,
        },
        body: JSON.stringify({ type: reviewType, details }),
      });
      const result = (await response.json()) as {
        error?: { message?: string };
        request?: AccountDataRequestView;
      } | null;
      if (!response.ok) {
        definitiveOutcome = true;
        throw new Error(result?.error?.message || "The request could not be queued.");
      }
      if (!result?.request) {
        throw new Error("The request was accepted without a readable status record.");
      }
      definitiveOutcome = true;
      setRequests((current) => mergeRequest(current, result.request!));
      setReviewDetails("");
      setMessage(
        `${requestTypeLabel(reviewType)} submitted for manual review. ` +
          "This records the request but does not claim that an outcome or deadline has been approved.",
      );
    } catch (requestError) {
      setError(true);
      setMessage(
        requestError instanceof Error
          ? requestError.message
          : "The request could not be queued.",
      );
    } finally {
      if (definitiveOutcome) manualReviewIdempotencyRef.current = null;
      setBusy(null);
    }
  }

  return (
    <form
      ref={formRef}
      className={styles.form}
      aria-describedby={ERROR_SUMMARY_ID}
      onSubmit={(event) => event.preventDefault()}
    >
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
          <h2>Request a data-rights review</h2>
        </div>
        <p className={styles.muted} id="data-rights-review-help">
          Record an access, correction, processing-restriction, or consent-withdrawal
          request for manual identity and scope review. Submission does not promise a
          deadline or automatically change any record or consent state.
        </p>
        <label className={styles.field} htmlFor="data-rights-review-type">
          <span>Request type</span>
          <select
            id="data-rights-review-type"
            value={reviewType}
            disabled={busy !== null}
            aria-describedby="data-rights-review-help"
            onChange={(event) =>
              setReviewType(event.target.value as ManualReviewType)
            }
          >
            <option value="access">Access review</option>
            <option value="correction">Correction review</option>
            <option value="restriction">Processing-restriction review</option>
            <option value="consent_withdrawal">Consent-withdrawal review</option>
          </select>
        </label>
        <label className={styles.field} htmlFor="data-rights-review-details">
          <span>What should be reviewed?</span>
          <textarea
            id="data-rights-review-details"
            value={reviewDetails}
            maxLength={1_000}
            aria-required="true"
            disabled={busy !== null}
            aria-invalid={reviewDetailsInvalid}
            aria-describedby={`data-rights-review-help ${ERROR_SUMMARY_ID}`}
            onChange={(event) => {
              setReviewDetails(event.target.value);
              if (reviewDetailsInvalid) setReviewDetailsInvalid(false);
            }}
          />
        </label>
        <div className={styles.actions}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={busy !== null}
            onClick={submitManualReview}
          >
            {busy === "manual" ? "Submitting..." : "Submit review request"}
          </button>
        </div>
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
            No data-request records have been created for this account.
          </p>
        )}
      </section>

      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={error ? message : ""}
        formRef={errorFocus === "form" ? formRef : summaryOnlyRef}
        className={styles.errorStatus}
      />
      {!error && message ? (
        <div className={styles.formStatus} role="status">
          {message}
        </div>
      ) : null}
    </form>
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

type ManualReviewType = Exclude<
  AccountDataRequestType,
  "export" | "deletion"
>;

function requestTypeLabel(type: AccountDataRequestType): string {
  const labels: Record<AccountDataRequestType, string> = {
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
  if (
    request.type !== "export" &&
    request.type !== "deletion" &&
    request.status === "submitted"
  ) {
    return "The request is recorded for manual review; no outcome or deadline is claimed.";
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
