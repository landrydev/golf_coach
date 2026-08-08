"use client";

import { useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import type { PlanShareSummary } from "@/lib/plans";
import styles from "../../workspace.module.css";

const ERROR_SUMMARY_ID = "publish-controls-error-summary";

export function PublishControls({
  planId,
  planRevision,
  golferName,
  blockers,
  initialShares,
}: {
  planId: string;
  planRevision: number;
  golferName: string;
  blockers: string[];
  initialShares: PlanShareSummary[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const summaryOnlyRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<"idle" | "publishing" | "ready" | "error">("idle");
  const [errorFocus, setErrorFocus] = useState<"form" | "summary">("form");
  const [message, setMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [shares, setShares] = useState(initialShares);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorFocus("form");
    setState("publishing");
    setMessage("");
    setShareUrl("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/plans/${encodeURIComponent(planId)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intendedRecipientContext: form.get("intendedRecipientContext"),
          expiresInDays: Number(form.get("expiresInDays")),
          expectedRevision: planRevision,
          confirmation: form.get("confirmation"),
        }),
      });
      const result = (await response.json()) as {
        share?: { id?: string; url?: string; expiresAt?: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.share?.url) {
        throw new Error(result.error?.message || "The private link could not be created.");
      }
      setShareUrl(result.share.url);
      setExpiresAt(result.share.expiresAt || "");
      if (result.share.id) {
        setShares((current) => [
          {
            id: result.share!.id!,
            status: "active",
            planRevision,
            createdAt: Date.now(),
            expiresAt: result.share?.expiresAt
              ? new Date(result.share.expiresAt).getTime()
              : null,
            lastAccessedAt: null,
            accessCount: 0,
          },
          ...current.map((share) =>
            share.status === "active" ? { ...share, status: "revoked" } : share,
          ),
        ]);
      }
      setState("ready");
      setMessage(
        "Private link created. Copy it now; Roadmap stores only a one-way fingerprint and cannot show this exact link again.",
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The private link could not be created.");
    }
  }

  async function revoke(shareId: string) {
    if (!window.confirm("Revoke this private access link now?")) return;
    setErrorFocus("summary");
    setRevokingId(shareId);
    setMessage("");
    try {
      const response = await fetch(`/api/shares/${encodeURIComponent(shareId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Revoked by instructor" }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: { message?: string } };
        throw new Error(result.error?.message || "The private link could not be revoked.");
      }
      setShares((current) =>
        current.map((share) =>
          share.id === shareId ? { ...share, status: "revoked" } : share,
        ),
      );
      if (shares.some((share) => share.id === shareId && share.status === "active")) {
        setShareUrl("");
      }
      setState("ready");
      setMessage("Private access revoked. An already-open page will fail its next authorization check.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The private link could not be revoked.");
    } finally {
      setRevokingId(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage("Private link copied.");
    } catch {
      setMessage("Copy was unavailable. Select and copy the complete link below.");
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
        className={styles.form}
        aria-describedby={ERROR_SUMMARY_ID}
        onSubmit={publish}
      >
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
            disabled={state === "publishing" || blockers.length > 0}
          >
            {state === "publishing"
              ? "Publishing…"
              : blockers.length
                ? "Resolve blockers before publishing"
                : "Publish and create private link"}
          </button>
        </div>
      </form>
      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={state === "error" ? message : ""}
        formRef={errorFocus === "form" ? formRef : summaryOnlyRef}
        className={styles.errorStatus}
      />
      {state !== "error" && message ? (
        <div className={styles.formStatus} role="status">
          {message}
        </div>
      ) : null}
      {shareUrl ? (
        <div className={styles.form} style={{ marginTop: "1rem" }}>
          <label className={styles.fullField}>
            Complete private link
            <textarea readOnly value={shareUrl} rows={3} onFocus={(event) => event.currentTarget.select()} />
            {expiresAt ? <small>Expires {new Date(expiresAt).toLocaleString("en-CA")}</small> : null}
          </label>
          <div className={styles.actions}>
            <button className={styles.secondaryButton} type="button" onClick={copyLink}>
              Copy private link
            </button>
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
                  disabled={revokingId !== null}
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
