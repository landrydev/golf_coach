"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clearKeyedAttempt,
  keyedAttemptBlockedMessage,
  keyedAttemptMutationDisposition,
  keyedAttemptRetryReadiness,
  keyedAttemptReceiptBlockedMessage,
  loadKeyedAttempt,
  persistKeyedAttempt,
  type KeyedAttemptRecord,
} from "@/lib/client-keyed-attempt-recovery";
import {
  activateClientRequestScope,
  beginOwnedClientRequest,
  createClientRequestOwnershipState,
  isClientRequestScopeActive,
  ownsClientRequest,
  retireClientRequestScope,
  type ClientRequestOwner,
} from "@/lib/client-request-ownership";
import {
  clientMutationMalformedSuccess,
  clientMutationErrorMessage,
  isClientMutationOutcomeUnknown,
  requestClientMutation,
  requireClientMutationJson,
  requireClientMutationSuccess,
} from "@/lib/client-mutation-recovery";
import {
  isDataRequestEnvelope,
  isDataRequestListEnvelope,
  parseInstructorDataExport,
} from "@/lib/client-response-validation";
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
  recoveryScope,
}: {
  initialRequests: AccountDataRequestView[];
  recoveryScope: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const summaryOnlyRef = useRef<HTMLFormElement>(null);
  const deletionAttemptRef = useRef<KeyedAttemptRecord | null>(null);
  const manualReviewAttemptRef = useRef<KeyedAttemptRecord | null>(null);
  const verifiedRecoveryScopeRef = useRef<string | null>(null);
  const requestOwnershipRef = useRef(createClientRequestOwnershipState());
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [errorFocus, setErrorFocus] = useState<"form" | "summary">("summary");
  const [busy, setBusy] = useState<"export" | "deletion" | "manual" | null>(
    null,
  );
  const [reviewType, setReviewType] = useState<ManualReviewType>("access");
  const [reviewDetails, setReviewDetails] = useState("");
  const [reviewDetailsInvalid, setReviewDetailsInvalid] = useState(false);
  const [manualRecovery, setManualRecovery] = useState<RecoveryState>("checking");
  const [deletionRecovery, setDeletionRecovery] =
    useState<RecoveryState>("checking");
  const [exportRecoveryRequired, setExportRecoveryRequired] = useState(false);
  const [requests, setRequests] = useState(initialRequests);
  const openDeletionRequest = requests.find(
    (request) =>
      request.type === "deletion" && openDeletionStatuses.has(request.status),
  );

  useEffect(() => {
    const ownership = requestOwnershipRef.current;
    const scopeGeneration = activateClientRequestScope(
      ownership,
      recoveryScope,
    );
    const timeout = window.setTimeout(() => {
      if (
        !isClientRequestScopeActive(
          ownership,
          recoveryScope,
          scopeGeneration,
        )
      ) {
        return;
      }
      verifiedRecoveryScopeRef.current = recoveryScope;
      deletionAttemptRef.current = null;
      manualReviewAttemptRef.current = null;
      const manual = loadKeyedAttempt(
        recoveryScope,
        "data_request_manual_create",
      );
      if (manual.kind === "empty") {
        setManualRecovery("ready");
      } else if (manual.kind === "blocked") {
        setManualRecovery("blocked");
        setError(true);
        setMessage(
          keyedAttemptBlockedMessage("data-rights review", manual.reason),
        );
      } else {
        const restored = parseManualReviewAttempt(manual.attempt);
        if (restored === null) {
          setManualRecovery("blocked");
          setError(true);
          setMessage(keyedAttemptBlockedMessage("data-rights review"));
        } else {
          manualReviewAttemptRef.current = manual.attempt;
          setReviewType(restored.type);
          setReviewDetails(restored.details);
          setManualRecovery("retry");
          setError(true);
          setMessage(
            "This tab restored an unconfirmed data-rights review. Its type and details are locked; retry sends the exact saved body and operation key.",
          );
        }
      }

      const deletion = loadKeyedAttempt(
        recoveryScope,
        "data_request_deletion_create",
      );
      if (deletion.kind === "empty") {
        setDeletionRecovery("ready");
      } else if (deletion.kind === "blocked") {
        setDeletionRecovery("blocked");
        setError(true);
        setMessage(
          keyedAttemptBlockedMessage("account-deletion review", deletion.reason),
        );
      } else if (!isDeletionAttempt(deletion.attempt)) {
        setDeletionRecovery("blocked");
        setError(true);
        setMessage(keyedAttemptBlockedMessage("account-deletion review"));
      } else {
        deletionAttemptRef.current = deletion.attempt;
        setDeletionRecovery("retry");
        setError(true);
        setMessage(
          "This tab restored an unconfirmed account-deletion review request. Retry sends the exact saved body and operation key.",
        );
      }
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      retireClientRequestScope(
        ownership,
        recoveryScope,
        scopeGeneration,
      );
      verifiedRecoveryScopeRef.current = null;
      deletionAttemptRef.current = null;
      manualReviewAttemptRef.current = null;
    };
  }, [recoveryScope]);

  const anyRecoveryPending =
    exportRecoveryRequired ||
    manualRecovery === "checking" ||
    manualRecovery === "retry" ||
    manualRecovery === "blocked" ||
    deletionRecovery === "checking" ||
    deletionRecovery === "retry" ||
    deletionRecovery === "blocked";
  const showRecoveryActions =
    exportRecoveryRequired ||
    manualRecovery === "retry" ||
    manualRecovery === "blocked" ||
    deletionRecovery === "retry" ||
    deletionRecovery === "blocked";

  async function downloadExport() {
    if (
      anyRecoveryPending ||
      busy !== null ||
      verifiedRecoveryScopeRef.current !== recoveryScope
    ) {
      return;
    }
    const requestOwner = beginOwnedClientRequest(
      requestOwnershipRef.current,
      recoveryScope,
    );
    if (!requestOwner) return;
    setErrorFocus("summary");
    setReviewDetailsInvalid(false);
    setBusy("export");
    setMessage("");
    setError(false);

    let prepared:
      | {
          kind: "deferred";
          message?: string;
          request: AccountDataRequestView;
        }
      | {
          kind: "download";
          file: Blob;
          filename: string;
        };
    try {
      const response = await requestClientMutation("/api/data-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (response.status === 202) {
        const deferred = await requireClientMutationJson<{
          deferred: true;
          existing: boolean;
          message?: string;
          request: AccountDataRequestView;
        }>(
          response,
          isDeferredExportEnvelope,
          "The JSON export could not be prepared.",
        );
        prepared = { kind: "deferred", ...deferred };
      } else {
        await requireClientMutationSuccess(
          response,
          "The JSON export could not be prepared.",
        );
        if (response.status !== 200) {
          throw clientMutationMalformedSuccess(response);
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().startsWith("application/json")) {
          throw clientMutationMalformedSuccess(response);
        }
        let body: string;
        try {
          body = await response.text();
        } catch {
          throw clientMutationMalformedSuccess(response);
        }
        if (
          parseInstructorDataExport(
            body,
            response.headers.get("content-length"),
            recoveryScope,
          ) === null
        ) {
          throw clientMutationMalformedSuccess(response);
        }
        prepared = {
          kind: "download",
          file: new Blob([body], { type: "application/json; charset=utf-8" }),
          filename: safeFilename(response.headers.get("content-disposition")),
        };
      }
    } catch (requestError) {
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
      if (isClientMutationOutcomeUnknown(requestError)) {
        setExportRecoveryRequired(true);
      }
      setError(true);
      setMessage(
        clientMutationErrorMessage(
          requestError,
          "the export request completed",
          "reload_before_retry",
          "The JSON export could not be prepared.",
        ),
      );
      setBusy(null);
      return;
    }

    if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;

    if (prepared.kind === "deferred") {
      setRequests((current) => mergeRequest(current, prepared.request));
      setMessage(
        prepared.message ||
          "The workspace needs a manually prepared export. The request is recorded in status history.",
      );
      setBusy(null);
      return;
    }

    let objectUrl: string | null = null;
    let link: HTMLAnchorElement | null = null;
    let downloadStarted = false;
    try {
      objectUrl = URL.createObjectURL(prepared.file);
      link = document.createElement("a");
      link.href = objectUrl;
      link.download = prepared.filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      downloadStarted = true;
    } catch {
      // The started flag is set immediately after click returns. Cleanup
      // failures cannot relabel a confirmed browser handoff as not started.
    } finally {
      try {
        link?.remove();
      } catch {
        // Detached-link cleanup is best effort after the browser handoff.
      }
      if (objectUrl !== null) scheduleObjectUrlRevocation(objectUrl);
    }
    if (!downloadStarted) {
      setError(true);
      setMessage(
        "The export was prepared, but this browser could not start the download. Reload the page to check the recorded request before trying again.",
      );
      setBusy(null);
      return;
    }

    const historyRefreshed = await refreshRequestHistory(requestOwner);
    if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
    setError(!historyRefreshed);
    setMessage(
      historyRefreshed
        ? "Your tenant-scoped JSON export was prepared and the browser download was started. It does not include media file bytes or security secrets. The status history was refreshed."
        : "Your tenant-scoped JSON export download was started, but the on-page status history could not be refreshed. Reload this page to see the latest record.",
    );
    setBusy(null);
  }

  async function refreshRequestHistory(
    requestOwner: ClientRequestOwner,
  ): Promise<boolean> {
    try {
      const response = await requestClientMutation("/api/data-requests", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const result = await requireClientMutationJson<{
        requests: AccountDataRequestView[];
      }>(
        response,
        isDataRequestListEnvelope,
        "The request history could not be refreshed.",
      );
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) {
        return false;
      }
      setRequests(result.requests);
      return true;
    } catch {
      return false;
    }
  }

  async function requestDeletionReview() {
    if (
      deletionRecovery === "checking" ||
      deletionRecovery === "blocked" ||
      verifiedRecoveryScopeRef.current !== recoveryScope ||
      (deletionRecovery === "ready" &&
        (exportRecoveryRequired || manualRecovery !== "ready"))
    ) {
      return;
    }
    if (
      deletionRecovery !== "retry" &&
      !window.confirm(
        "Submit an account deletion request for identity and retention review? This does not immediately delete data.",
      )
    ) {
      return;
    }

    const requestOwner = beginOwnedClientRequest(
      requestOwnershipRef.current,
      recoveryScope,
    );
    if (!requestOwner) return;

    setErrorFocus("summary");
    setReviewDetailsInvalid(false);
    setBusy("deletion");
    setMessage("");
    setError(false);
    if (!deletionAttemptRef.current) {
      try {
        deletionAttemptRef.current = persistKeyedAttempt({
          accountScope: recoveryScope,
          operation: "data_request_deletion_create",
          key: crypto.randomUUID(),
          body: JSON.stringify({ type: "deletion" }),
          ui: {},
        });
        setDeletionRecovery("retry");
      } catch {
        setDeletionRecovery("blocked");
        setError(true);
        setMessage(keyedAttemptBlockedMessage("account-deletion review"));
        setBusy(null);
        return;
      }
    }
    const attempt = deletionAttemptRef.current;
    const retryReadiness = keyedAttemptRetryReadiness(attempt);
    if (retryReadiness !== "ready") {
      if (retryReadiness === "expired") deletionAttemptRef.current = null;
      setDeletionRecovery("blocked");
      setError(true);
      setMessage(
        keyedAttemptBlockedMessage(
          "account-deletion review",
          retryReadiness === "expired" ? "expired" : undefined,
        ),
      );
      setBusy(null);
      return;
    }
    try {
      const response = await requestClientMutation("/api/data-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.key,
        },
        body: attempt.body,
      });
      const result = await requireClientMutationJson<DataRequestCreateEnvelope>(
        response,
        (value) =>
          isDataRequestCreateEnvelope(value, response.status, "deletion"),
        "The request could not be queued.",
      );
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
      if (!clearKeyedAttempt(attempt)) {
        setDeletionRecovery("blocked");
        setError(true);
        setMessage(
          "The deletion review was confirmed, but this tab could not retire its saved recovery attempt. Reload and inspect request history before doing anything else.",
        );
        return;
      }
      deletionAttemptRef.current = null;
      setDeletionRecovery("ready");
      setRequests((current) => mergeRequest(current, result.request));
      setMessage(
        result.existing
          ? "A deletion review is already open. No duplicate request was created, and no data has been irreversibly removed."
          : "Deletion review requested. Identity is not yet verified, and no data has been irreversibly removed.",
      );
    } catch (requestError) {
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
      const disposition = keyedAttemptMutationDisposition(requestError);
      if (disposition === "reconcile_required") {
        setDeletionRecovery("blocked");
        setError(true);
        setMessage(keyedAttemptReceiptBlockedMessage("account-deletion review"));
        return;
      }
      if (disposition === "definitive_failure") {
        if (!clearKeyedAttempt(attempt)) {
          setDeletionRecovery("blocked");
          setError(true);
          setMessage(keyedAttemptBlockedMessage("account-deletion review"));
          return;
        }
        deletionAttemptRef.current = null;
        setDeletionRecovery("ready");
      } else {
        setDeletionRecovery("retry");
      }
      setError(true);
      setMessage(
        clientMutationErrorMessage(
          requestError,
          "the deletion review request was recorded",
          "retry_same_attempt",
          "The request could not be queued.",
        ),
      );
    } finally {
      if (ownsClientRequest(requestOwnershipRef.current, requestOwner)) {
        setBusy(null);
      }
    }
  }

  async function submitManualReview() {
    if (
      manualRecovery === "checking" ||
      manualRecovery === "blocked" ||
      verifiedRecoveryScopeRef.current !== recoveryScope ||
      (manualRecovery === "ready" &&
        (exportRecoveryRequired || deletionRecovery !== "ready"))
    ) {
      return;
    }
    setErrorFocus("form");
    const details = reviewDetails.trim();
    if (!details) {
      setReviewDetailsInvalid(true);
      setError(true);
      setMessage("Describe the data or outcome you want reviewed.");
      return;
    }

    const requestOwner = beginOwnedClientRequest(
      requestOwnershipRef.current,
      recoveryScope,
    );
    if (!requestOwner) return;

    setBusy("manual");
    setReviewDetailsInvalid(false);
    setMessage("");
    setError(false);
    if (!manualReviewAttemptRef.current) {
      try {
        manualReviewAttemptRef.current = persistKeyedAttempt({
          accountScope: recoveryScope,
          operation: "data_request_manual_create",
          key: crypto.randomUUID(),
          body: JSON.stringify({ type: reviewType, details }),
          ui: { reviewType, reviewDetails: details },
        });
        setManualRecovery("retry");
      } catch {
        setManualRecovery("blocked");
        setError(true);
        setMessage(keyedAttemptBlockedMessage("data-rights review"));
        setBusy(null);
        return;
      }
    }
    const attempt = manualReviewAttemptRef.current;
    const restored = parseManualReviewAttempt(attempt);
    if (restored === null) {
      setManualRecovery("blocked");
      setError(true);
      setMessage(keyedAttemptBlockedMessage("data-rights review"));
      setBusy(null);
      return;
    }
    const retryReadiness = keyedAttemptRetryReadiness(attempt);
    if (retryReadiness !== "ready") {
      if (retryReadiness === "expired") manualReviewAttemptRef.current = null;
      setManualRecovery("blocked");
      setError(true);
      setMessage(
        keyedAttemptBlockedMessage(
          "data-rights review",
          retryReadiness === "expired" ? "expired" : undefined,
        ),
      );
      setBusy(null);
      return;
    }
    try {
      const response = await requestClientMutation("/api/data-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.key,
        },
        body: attempt.body,
      });
      const result = await requireClientMutationJson<DataRequestCreateEnvelope>(
        response,
        (value) =>
          isDataRequestCreateEnvelope(value, response.status, restored.type),
        "The request could not be queued.",
      );
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
      if (!clearKeyedAttempt(attempt)) {
        setManualRecovery("blocked");
        setError(true);
        setMessage(
          "The data-rights review was confirmed, but this tab could not retire its saved recovery attempt. Reload and inspect request history before doing anything else.",
        );
        return;
      }
      manualReviewAttemptRef.current = null;
      setManualRecovery("ready");
      setRequests((current) => mergeRequest(current, result.request));
      setReviewDetails("");
      setMessage(
        `${requestTypeLabel(restored.type)} submitted for manual review. ` +
          "This records the request but does not claim that an outcome or deadline has been approved.",
      );
    } catch (requestError) {
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
      const disposition = keyedAttemptMutationDisposition(requestError);
      if (disposition === "reconcile_required") {
        setManualRecovery("blocked");
        setError(true);
        setMessage(keyedAttemptReceiptBlockedMessage("data-rights review"));
        return;
      }
      if (disposition === "definitive_failure") {
        if (!clearKeyedAttempt(attempt)) {
          setManualRecovery("blocked");
          setError(true);
          setMessage(keyedAttemptBlockedMessage("data-rights review"));
          return;
        }
        manualReviewAttemptRef.current = null;
        setManualRecovery("ready");
      } else {
        setManualRecovery("retry");
      }
      setError(true);
      setMessage(
        clientMutationErrorMessage(
          requestError,
          "the data-rights review request was recorded",
          "retry_same_attempt",
          "The request could not be queued.",
        ),
      );
    } finally {
      if (ownsClientRequest(requestOwnershipRef.current, requestOwner)) {
        setBusy(null);
      }
    }
  }

  return (
    <form
      method="post"
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
            disabled={busy !== null || anyRecoveryPending}
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
            disabled={busy !== null || anyRecoveryPending}
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
            disabled={busy !== null || anyRecoveryPending}
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
            disabled={
              busy !== null ||
              manualRecovery === "checking" ||
              manualRecovery === "blocked" ||
              (manualRecovery === "ready" &&
                (exportRecoveryRequired || deletionRecovery !== "ready"))
            }
            onClick={submitManualReview}
          >
            {busy === "manual"
              ? "Submitting..."
              : manualRecovery === "retry"
                ? "Retry same review request"
                : manualRecovery === "blocked"
                  ? "Reconciliation required"
                : "Submit review request"}
          </button>
        </div>
        {manualRecovery === "retry" || manualRecovery === "blocked" ? (
          <p className={styles.muted} role="note">
            The request type and details are locked so retry reuses the exact same
            operation key and payload. Inspect authoritative history before starting a
            different request; a blocked receipt requires support reconciliation.
          </p>
        ) : null}
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
            disabled={
              busy !== null ||
              (Boolean(openDeletionRequest) && deletionRecovery !== "retry") ||
              deletionRecovery === "checking" ||
              deletionRecovery === "blocked" ||
              (deletionRecovery === "ready" &&
                (exportRecoveryRequired || manualRecovery !== "ready"))
            }
            onClick={requestDeletionReview}
          >
            {busy === "deletion"
              ? "Submitting…"
              : deletionRecovery === "retry"
                ? "Retry exact deletion review"
                : deletionRecovery === "blocked"
                  ? "Reconciliation required"
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

      {showRecoveryActions ? (
        <div className={styles.actions} role="note">
          <Link className={styles.secondaryButton} href="/app/settings/data">
            Reload and inspect request history
          </Link>
          <Link className={styles.secondaryButton} href="/support">
            Contact support
          </Link>
        </div>
      ) : null}

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

function scheduleObjectUrlRevocation(objectUrl: string): void {
  try {
    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // The browser owns the download handoff; revocation is best effort.
      }
    }, 1_000);
  } catch {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Do not relabel a started download when cleanup is unavailable.
    }
  }
}

function isDeferredExportEnvelope(value: unknown): value is {
  deferred: true;
  existing: boolean;
  message: string;
  request: AccountDataRequestView;
} {
  return (
    hasExactObjectKeys(value, [
      "deferred",
      "existing",
      "request",
      "message",
    ]) &&
    isDataRequestEnvelope(value) &&
    value.deferred === true &&
    typeof value.existing === "boolean" &&
    typeof value.message === "string" &&
    value.message.trim().length > 0 &&
    value.request.type === "export"
  );
}

type RecoveryState = "checking" | "ready" | "retry" | "blocked";

type DataRequestCreateEnvelope = {
  request: AccountDataRequestView;
  existing: boolean;
};

function isDataRequestCreateEnvelope(
  value: unknown,
  status: number,
  expectedType: AccountDataRequestType,
): value is DataRequestCreateEnvelope {
  return (
    hasExactObjectKeys(value, ["request", "existing"]) &&
    isDataRequestEnvelope(value) &&
    typeof value.existing === "boolean" &&
    value.request.type === expectedType &&
    ((status === 201 && value.existing === false) ||
      (status === 200 && value.existing === true))
  );
}

function parseManualReviewAttempt(
  attempt: KeyedAttemptRecord,
): { type: ManualReviewType; details: string } | null {
  let value: unknown;
  try {
    value = JSON.parse(attempt.body);
  } catch {
    return null;
  }
  if (
    !hasExactObjectKeys(value, ["type", "details"]) ||
    !isManualReviewType(value.type) ||
    typeof value.details !== "string" ||
    !value.details ||
    value.details.length > 1_000 ||
    attempt.ui.reviewType !== value.type ||
    attempt.ui.reviewDetails !== value.details
  ) {
    return null;
  }
  return { type: value.type, details: value.details };
}

function isDeletionAttempt(attempt: KeyedAttemptRecord): boolean {
  try {
    const value: unknown = JSON.parse(attempt.body);
    return hasExactObjectKeys(value, ["type"]) && value.type === "deletion";
  } catch {
    return false;
  }
}

function isManualReviewType(value: unknown): value is ManualReviewType {
  return (
    value === "access" ||
    value === "correction" ||
    value === "restriction" ||
    value === "consent_withdrawal"
  );
}

function hasExactObjectKeys<K extends string>(
  value: unknown,
  keys: readonly K[],
): value is Record<K, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
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
