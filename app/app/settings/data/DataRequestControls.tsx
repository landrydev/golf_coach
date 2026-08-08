"use client";

import { useState } from "react";
import styles from "../../workspace.module.css";

export function DataRequestControls() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<"export" | "deletion" | null>(null);

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
      setMessage(
        "Your tenant-scoped JSON export was prepared and downloaded. It does not include media file bytes or security secrets.",
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
        request?: { status?: string };
      };
      if (!response.ok) {
        throw new Error(result.error?.message || "The request could not be queued.");
      }
      setMessage("Deletion review requested. No data has been irreversibly removed.");
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
            disabled={busy !== null}
            onClick={requestDeletionReview}
          >
            {busy === "deletion" ? "Submitting…" : "Submit deletion review request"}
          </button>
        </div>
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

function safeFilename(contentDisposition: string | null): string {
  const candidate = /filename="([A-Za-z0-9._-]+)"/i.exec(
    contentDisposition ?? "",
  )?.[1];
  return candidate || "roadmap-data-export.json";
}
