"use client";

import { useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clientMutationMalformedSuccess,
  clientMutationErrorMessage,
  isClientMutationOutcomeUnknown,
  requestClientMutation,
  requireClientMutationJson,
  requireClientMutationSuccess,
} from "@/lib/client-mutation-recovery";
import type { PlanShareSummary } from "@/lib/plans";
import {
  isShareMutationEnvelope,
  type ShareMutationEnvelope,
} from "@/lib/share-client-response";
import { ShareQrCode } from "@/components/share/ShareQrCode";
import styles from "../../workspace.module.css";

const ERROR_SUMMARY_ID = "publish-controls-error-summary";

type RevealedShare = Readonly<{
  shareId: string;
  url: string;
  expiresAt: string;
}>;

export function PublishControls({
  planId,
  planRevision,
  golferName,
  blockers,
  initialShares,
  publishedRevision,
  lastSharedAt,
}: {
  planId: string;
  planRevision: number;
  golferName: string;
  blockers: string[];
  initialShares: PlanShareSummary[];
  publishedRevision: number | null;
  lastSharedAt: number | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const replacementFormRef = useRef<HTMLFormElement>(null);
  const reissueFormRef = useRef<HTMLFormElement>(null);
  const summaryOnlyRef = useRef<HTMLFormElement>(null);
  const shareMutationInFlightRef = useRef(false);
  const [state, setState] = useState<
    | "idle"
    | "publishing"
    | "replacing"
    | "reissuing"
    | "ready"
    | "error"
    | "reconcile_required"
  >("idle");
  const [errorFocus, setErrorFocus] = useState<
    "form" | "replacement" | "reissue" | "summary"
  >("form");
  const [message, setMessage] = useState("");
  const [revealedShare, setRevealedShare] = useState<RevealedShare | null>(
    null,
  );
  const [shares, setShares] = useState(initialShares);
  const [publishedRevisionState, setPublishedRevisionState] = useState(
    publishedRevision,
  );
  const [lastSharedAtState, setLastSharedAtState] = useState(lastSharedAt);
  const [historyRequiresReload, setHistoryRequiresReload] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const activeCurrentShare = shares.find(
    (share) => share.planRevision === planRevision && share.status === "active",
  );
  const replacementAvailable = Boolean(
    activeCurrentShare && revealedShare?.shareId !== activeCurrentShare.id,
  );
  const currentRevisionPublished = publishedRevisionState === planRevision;
  const reissueSource = shares.find(
    (share) =>
      share.planRevision === planRevision &&
      (share.status === "revoked" || share.status === "expired"),
  );
  const reissueAvailable = Boolean(
    currentRevisionPublished &&
      !activeCurrentShare &&
      reissueSource &&
      lastSharedAtState !== null &&
      !historyRequiresReload,
  );
  const reconciliationRequired = state === "reconcile_required";
  const shareMutationPending =
    state === "publishing" ||
    state === "replacing" ||
    state === "reissuing" ||
    revokingId !== null;

  function startShareMutation(): boolean {
    if (shareMutationInFlightRef.current || reconciliationRequired) return false;
    shareMutationInFlightRef.current = true;
    return true;
  }

  function finishShareMutation(): void {
    shareMutationInFlightRef.current = false;
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeCurrentShare || currentRevisionPublished || !startShareMutation()) return;
    setErrorFocus("form");
    setState("publishing");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const expiresInDays = Number(form.get("expiresInDays"));

    let result: ShareMutationEnvelope;
    try {
      const response = await requestClientMutation(`/api/plans/${encodeURIComponent(planId)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intendedRecipientContext: form.get("intendedRecipientContext"),
          expiresInDays,
          expectedRevision: planRevision,
          confirmation: form.get("confirmation"),
        }),
      });
      if (response.ok && response.status !== 201) {
        throw clientMutationMalformedSuccess(response);
      }
      result = await requireClientMutationJson<ShareMutationEnvelope>(
        response,
        (value) =>
          isShareMutationEnvelope(
            value,
            window.location.origin,
            planId,
            planRevision,
            {
              operation: "plan.publish_and_share",
              expiresInDays,
            },
          ),
        "The private link could not be created.",
      );
    } catch (error) {
      setState(
        isClientMutationOutcomeUnknown(error) ? "reconcile_required" : "error",
      );
      setMessage(
        clientMutationErrorMessage(
          error,
          "the private link was created",
          "reload_before_retry",
          "The private link could not be created.",
        ),
      );
      finishShareMutation();
      return;
    }

    setRevealedShare({
      shareId: result.share.id,
      url: result.share.url,
      expiresAt: result.share.expiresAt || "",
    });
    addReplacementShare(result.share);
    setPublishedRevisionState(planRevision);
    setState("ready");
    setMessage(
      "Private link created. Copy it now; Roadmap stores only a one-way fingerprint and cannot show this exact link again.",
    );
    finishShareMutation();
  }

  async function replaceInaccessibleLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startShareMutation()) return;
    setErrorFocus("replacement");
    setMessage("");
    const sourceShare = activeCurrentShare;
    if (!sourceShare) {
      setState("error");
      setMessage("The active sharing record changed. Reload before replacing a link.");
      finishShareMutation();
      return;
    }
    const form = new FormData(event.currentTarget);
    setState("replacing");

    let result: ShareMutationEnvelope;
    try {
      const response = await requestClientMutation(
        `/api/plans/${encodeURIComponent(planId)}/publish/replace-inaccessible`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: planRevision,
            expectedShareId: sourceShare.id,
            confirmation: form.get("replacementConfirmation"),
          }),
        },
      );
      if (response.ok && response.status !== 201) {
        throw clientMutationMalformedSuccess(response);
      }
      result = await requireClientMutationJson<ShareMutationEnvelope>(
        response,
        (value) =>
          isShareMutationEnvelope(
            value,
            window.location.origin,
            planId,
            planRevision,
            {
              operation: "share.replace_inaccessible_link",
              sourceShareId: sourceShare.id,
            },
          ),
        "The inaccessible private link could not be replaced.",
      );
    } catch (error) {
      setState(
        isClientMutationOutcomeUnknown(error) ? "reconcile_required" : "error",
      );
      setMessage(
        clientMutationErrorMessage(
          error,
          "the inaccessible private link was replaced",
          "reload_before_retry",
          "The inaccessible private link could not be replaced.",
        ),
      );
      finishShareMutation();
      return;
    }

    setRevealedShare({
      shareId: result.share.id,
      url: result.share.url,
      expiresAt: result.share.expiresAt || "",
    });
    addReplacementShare(result.share);
    setState("ready");
    setMessage(
      "Replacement private link created. The previously active link and all of its open sessions were revoked. Copy this new one-time link now.",
    );
    finishShareMutation();
  }

  async function reissueSameRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startShareMutation()) return;
    setErrorFocus("reissue");
    setMessage("");
    const sourceShare = reissueSource;
    const observedLastSharedAt = lastSharedAtState;
    if (
      !reissueAvailable ||
      !sourceShare ||
      (sourceShare.status !== "revoked" && sourceShare.status !== "expired") ||
      observedLastSharedAt === null
    ) {
      setState("error");
      setMessage("The sharing history changed. Reload before reissuing access.");
      finishShareMutation();
      return;
    }
    const sourceStatus = sourceShare.status;
    const form = new FormData(event.currentTarget);
    const expiresInDays = Number(form.get("reissueExpiresInDays"));
    setState("reissuing");

    let result: ShareMutationEnvelope;
    try {
      const response = await requestClientMutation(
        `/api/plans/${encodeURIComponent(planId)}/publish/reissue`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: planRevision,
            expectedLastSharedAt: observedLastSharedAt,
            expectedSourceShareId: sourceShare.id,
            expectedSourceStatus: sourceStatus,
            expectedSourceUpdatedAt: sourceShare.updatedAt,
            expiresInDays,
            confirmation: form.get("reissueConfirmation"),
          }),
        },
      );
      if (response.ok && response.status !== 201) {
        throw clientMutationMalformedSuccess(response);
      }
      result = await requireClientMutationJson<ShareMutationEnvelope>(
        response,
        (value) =>
          isShareMutationEnvelope(
            value,
            window.location.origin,
            planId,
            planRevision,
            {
              operation: "share.reissue_same_revision",
              sourceShareId: sourceShare.id,
              sourceStatus,
              sourceUpdatedAt: sourceShare.updatedAt,
              expiresInDays,
            },
          ),
        "Private access could not be reissued.",
      );
    } catch (error) {
      setState(
        isClientMutationOutcomeUnknown(error) ? "reconcile_required" : "error",
      );
      setMessage(
        clientMutationErrorMessage(
          error,
          "private access was reissued",
          "reload_before_retry",
          "Private access could not be reissued.",
        ),
      );
      finishShareMutation();
      return;
    }

    setRevealedShare({
      shareId: result.share.id,
      url: result.share.url,
      expiresAt: result.share.expiresAt || "",
    });
    addReplacementShare(result.share);
    setState("ready");
    setMessage(
      "Private access reissued for the same published revision. Prior sessions and residual links were revoked. Copy this new one-time link now.",
    );
    finishShareMutation();
  }

  function addReplacementShare(share: ShareMutationEnvelope["share"]) {
    setShares((current) => [
      {
        id: share.id,
        status: share.status,
        planRevision: share.planRevision,
        createdAt: new Date(share.createdAt).getTime(),
        updatedAt: new Date(share.updatedAt).getTime(),
        expiresAt: share.expiresAt ? new Date(share.expiresAt).getTime() : null,
        lastAccessedAt: share.lastAccessedAt,
        accessCount: share.accessCount,
      },
      ...current.map((existing) =>
        existing.status === "active"
          ? { ...existing, status: "revoked" as const }
          : existing,
      ),
    ]);
    setLastSharedAtState(new Date(share.createdAt).getTime());
    setHistoryRequiresReload(false);
  }

  async function revoke(shareId: string) {
    if (shareMutationInFlightRef.current || reconciliationRequired) return;
    if (!window.confirm("Revoke this private access link now?")) return;
    if (!startShareMutation()) return;
    setErrorFocus("summary");
    setRevokingId(shareId);
    setMessage("");
    try {
      const response = await requestClientMutation(`/api/shares/${encodeURIComponent(shareId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Revoked by instructor" }),
      });
      await requireClientMutationSuccess(
        response,
        "The private link could not be revoked.",
        [204],
      );
    } catch (error) {
      setState(
        isClientMutationOutcomeUnknown(error) ? "reconcile_required" : "error",
      );
      setMessage(
        clientMutationErrorMessage(
          error,
          "the private link was revoked",
          "reload_before_retry",
          "The private link could not be revoked.",
        ),
      );
      setRevokingId(null);
      finishShareMutation();
      return;
    }

    setShares((current) =>
      current.map((share) =>
        share.id === shareId
          ? { ...share, status: "revoked" as const }
          : share,
      ),
    );
    setRevealedShare((current) =>
      current?.shareId === shareId ? null : current,
    );
    setState("ready");
    setHistoryRequiresReload(true);
    setMessage(
      "Private access revoked. An already-open page will fail its next authorization check. Reload the authoritative history before reissuing access.",
    );
    setRevokingId(null);
    finishShareMutation();
  }

  async function copyLink() {
    if (!revealedShare || shareMutationInFlightRef.current) return;
    try {
      await navigator.clipboard.writeText(revealedShare.url);
      setMessage("Private link copied.");
    } catch {
      setMessage("Copy was unavailable. Select and copy the complete link below.");
    }
  }

  async function copyPreparedMessage() {
    if (!revealedShare || shareMutationInFlightRef.current) return;
    const preparedMessage = `Hi ${golferName}, your private coaching roadmap is ready to review: ${revealedShare.url}\n\nRoadmap did not send this message automatically. Please keep the link private and contact me if you have questions.`;
    try {
      await navigator.clipboard.writeText(preparedMessage);
      setMessage("Prepared message copied. Roadmap has not sent it.");
    } catch {
      setMessage("Copy was unavailable. Select and copy the prepared message below.");
    }
  }

  return (
    <section className={styles.formCard} aria-labelledby="publish-heading">
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.eyebrow}>Publish &amp; share</span>
          <h2 id="publish-heading">Review the exact golfer view before creating access.</h2>
        </div>
      </div>
      {blockers.length ? (
        <div className={styles.notice} role="note">
          <strong>Resolve these material blockers before publishing.</strong>
          <ul>
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <form
        ref={formRef}
        method="post"
        className={styles.form}
        aria-describedby={ERROR_SUMMARY_ID}
        onSubmit={publish}
      >
        <fieldset
          className={styles.formSection}
          disabled={
            shareMutationPending ||
            reconciliationRequired ||
            Boolean(activeCurrentShare) ||
            currentRevisionPublished
          }
        >
          <legend>Private link details</legend>
          <label className={styles.fullField}>
          Intended recipient and context
          <input
            name="intendedRecipientContext"
            defaultValue={`${golferName} — private golfer roadmap`}
            required
            maxLength={240}
          />
          <small>Confirm who should receive this exact private view. Roadmap does not send it automatically.</small>
          </label>
          <label className={styles.field}>
          Link expiry
          <select name="expiresInDays" defaultValue="30">
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
          <small>You can revoke access sooner from the sharing record.</small>
          </label>
          <label className={styles.confirmRow}>
          <input
            name="confirmation"
            type="checkbox"
            value="reviewed_exact_golfer_view"
            required
          />
          <span>
            I reviewed the exact goal, assessment, evidence limits, phase sequence, package
            facts, and external-action wording shown below.
          </span>
          </label>
          <div className={styles.actions}>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={blockers.length > 0}
            >
              {state === "publishing"
                ? "Publishing…"
                : activeCurrentShare
                  ? "Current revision already has private access"
                  : currentRevisionPublished
                    ? "Current revision is already published"
                  : blockers.length
                    ? "Resolve blockers before publishing"
                    : "Publish and create private link"}
            </button>
          </div>
        </fieldset>
      </form>
      {replacementAvailable ? (
        <form
          ref={replacementFormRef}
          method="post"
          className={styles.form}
          aria-labelledby="replace-inaccessible-link-heading"
          aria-describedby={ERROR_SUMMARY_ID}
          onSubmit={replaceInaccessibleLink}
        >
          <fieldset
            className={styles.formSection}
            disabled={
              shareMutationPending ||
              reconciliationRequired
            }
          >
            <legend>Inaccessible-link replacement</legend>
            <div className={styles.notice} role="note">
            <strong id="replace-inaccessible-link-heading">
              Cannot access the one-time link shown after publishing?
            </strong>
            <span>
              Reload and inspect the sharing record first if a publish response was lost.
              Roadmap stores only a one-way fingerprint, so it cannot recover the old link.
              This action revokes the currently active link and every open session, then
              creates one replacement with the same recipient context and expiry.
            </span>
            </div>
            <label className={styles.confirmRow}>
            <input
              name="replacementConfirmation"
              type="checkbox"
              value="replace_inaccessible_private_link"
              required
            />
            <span>
              I cannot access the current private link and understand that replacing it
              immediately invalidates that link and its open sessions.
            </span>
            </label>
            <div className={styles.actions}>
              <button className={styles.dangerButton} type="submit">
                {state === "replacing"
                  ? "Replacing inaccessible link…"
                  : "Revoke and replace inaccessible link"}
              </button>
            </div>
          </fieldset>
        </form>
      ) : null}
      {reissueAvailable && reissueSource ? (
        <form
          ref={reissueFormRef}
          method="post"
          className={styles.form}
          aria-labelledby="same-revision-reissue-heading"
          aria-describedby={ERROR_SUMMARY_ID}
          onSubmit={reissueSameRevision}
        >
          <fieldset
            className={styles.formSection}
            disabled={
              shareMutationPending ||
              reconciliationRequired ||
              blockers.length > 0
            }
          >
            <legend>Same-revision access reissue</legend>
            <div className={styles.notice} role="note">
              <strong id="same-revision-reissue-heading">
                The latest link for this published revision is {reissueSource.status}.
              </strong>
              <span>
                Reissuing does not republish or change the golfer view. It creates one new
                private capability with a newly selected expiry and invalidates residual
                sessions and inactive link state from the observed history.
              </span>
            </div>
            <label className={styles.field}>
              New link expiry
              <select name="reissueExpiresInDays" defaultValue="30">
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </select>
              <small>The new expiry starts only if this exact history record still matches.</small>
            </label>
            <label className={styles.confirmRow}>
              <input
                name="reissueConfirmation"
                type="checkbox"
                value="reissue_same_published_revision"
                required
              />
              <span>
                I reviewed revision {planRevision} and sharing record reference{" "}
                {reissueSource.id.slice(-8).toUpperCase()}, and I intend to create one new
                private link without changing the published content.
              </span>
            </label>
            <div className={styles.actions}>
              <button className={styles.primaryButton} type="submit">
                {state === "reissuing"
                  ? "Reissuing private access…"
                  : "Reissue private access"}
              </button>
            </div>
          </fieldset>
        </form>
      ) : null}
      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={
          state === "error" || state === "reconcile_required" ? message : ""
        }
        formRef={
          errorFocus === "form"
            ? formRef
            : errorFocus === "replacement"
              ? replacementFormRef
              : errorFocus === "reissue"
                ? reissueFormRef
                : summaryOnlyRef
        }
        className={styles.errorStatus}
      />
      {reconciliationRequired ? (
        <div className={styles.notice} role="alert">
          <strong>Reload is required before another sharing change.</strong>
          <span>
            The last response did not prove whether the server committed. Publishing,
            replacement, reissue, and revocation remain locked until this page reloads the
            authoritative sharing record.
          </span>
          <div className={styles.actions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload sharing record
            </button>
          </div>
        </div>
      ) : null}
      {historyRequiresReload && !reconciliationRequired ? (
        <div className={styles.notice} role="note">
          <strong>Reload to use the new terminal sharing record.</strong>
          <span>
            Revocation succeeded, but its authoritative history timestamp was not inferred
            from this browser. Reissue remains unavailable until a reload reads that value.
          </span>
          <div className={styles.actions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload sharing record
            </button>
          </div>
        </div>
      ) : null}
      {state !== "error" && state !== "reconcile_required" && message ? (
        <div className={styles.formStatus} role="status">
          {message}
        </div>
      ) : null}
      {revealedShare && !reconciliationRequired && !shareMutationPending ? (
        <div className={styles.form} style={{ marginTop: "1rem" }}>
          <label className={styles.fullField}>
            Complete private link
            <textarea readOnly value={revealedShare.url} rows={3} onFocus={(event) => event.currentTarget.select()} />
            {revealedShare.expiresAt ? <small>Expires {new Date(revealedShare.expiresAt).toLocaleString("en-CA")}</small> : null}
          </label>
          <div className={styles.actions}>
            <button className={styles.secondaryButton} type="button" onClick={copyLink}>
              Copy private link
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={copyPreparedMessage}
            >
              Copy prepared message
            </button>
          </div>
          <div className={styles.gridTwo}>
            <div className={styles.card}>
              <span className={styles.eyebrow}>Scan on a phone</span>
              <ShareQrCode value={revealedShare.url} />
              <small>
                This QR code contains the same private link above. Share it only with the
                intended golfer.
              </small>
            </div>
            <label className={styles.fullField}>
              Prepared message
              <textarea
                readOnly
                rows={7}
                value={`Hi ${golferName}, your private coaching roadmap is ready to review: ${revealedShare.url}\n\nRoadmap did not send this message automatically. Please keep the link private and contact me if you have questions.`}
                onFocus={(event) => event.currentTarget.select()}
              />
              <small>
                Copy and send this through your usual communication tool. Roadmap records no
                delivery claim.
              </small>
            </label>
          </div>
        </div>
      ) : null}
      {shares.length ? (
        <div className={styles.form} style={{ marginTop: "1.5rem" }}>
          <h3>Private access history</h3>
          <p className={styles.muted}>
            A link is not a delivered message or a confirmed read. “Opened” means only that
            the capability reached Roadmap successfully.
          </p>
          {shares.map((share) => (
            <div className={styles.notice} key={share.id}>
              <div>
                <strong>{share.status === "active" ? "Active private link" : `Link ${share.status}`}</strong>
                <span>
                  Created {new Date(share.createdAt).toLocaleString("en-CA")}
                  {share.expiresAt
                    ? ` · expires ${new Date(share.expiresAt).toLocaleString("en-CA")}`
                    : ""}
                  {share.lastAccessedAt
                    ? ` · last opened ${new Date(share.lastAccessedAt).toLocaleString("en-CA")}`
                    : " · not opened"}
                </span>
              </div>
              {share.status === "active" ? (
                <button
                  className={styles.dangerButton}
                  type="button"
                  disabled={shareMutationPending || reconciliationRequired}
                  onClick={() => revoke(share.id)}
                >
                  {revokingId === share.id ? "Revoking…" : "Revoke access"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
