"use client";

import {
  authoringDraftReviewText,
  type AuthoringDraftReconciliation,
} from "@/lib/client-authoring-draft-recovery";

export type AuthoringDraftUiState =
  | AuthoringDraftReconciliation
  | Readonly<{ kind: "checking" }>
  | Readonly<{ kind: "restored" }>;

export function AuthoringDraftRecovery({
  state,
  label,
  onRestore,
  onDiscard,
  noticeClassName,
  actionsClassName,
  buttonClassName,
}: {
  state: AuthoringDraftUiState;
  label: string;
  onRestore?: () => void;
  onDiscard: () => void;
  noticeClassName?: string;
  actionsClassName?: string;
  buttonClassName?: string;
}) {
  if (state.kind === "empty") return null;
  if (state.kind === "restored") {
    return (
      <p role="status">
        The saved {label} draft was restored for review. It has not been submitted.
      </p>
    );
  }
  if (state.kind === "checking") {
    return <p role="status">Checking this tab for a saved {label} draft…</p>;
  }
  if (state.kind === "applied") {
    return (
      <div className={noticeClassName} role="status">
        <strong>The saved {label} draft is already reflected in this revision.</strong>
        <span>Roadmap cleared the matched recovery copy from this browser tab.</span>
      </div>
    );
  }
  if (state.kind === "blocked") {
    return (
      <div className={noticeClassName} role="alert">
        <strong>Draft recovery is unavailable.</strong>
        <span>
          Roadmap could not verify this tab&apos;s recovery storage, so it will not restore
          or submit this form. You may explicitly discard the unusable local record and
          reload the authoritative page.
        </span>
        <div className={actionsClassName}>
          <button className={buttonClassName} type="button" onClick={onDiscard}>
            Discard local recovery record
          </button>
        </div>
      </div>
    );
  }

  const diverged = state.kind === "diverged";
  const reviewText = authoringDraftReviewText(state.draft, label);
  return (
    <div className={noticeClassName} role={diverged ? "alert" : "status"}>
      <strong>
        {diverged
          ? `The saved ${label} draft differs from the authoritative revision.`
          : `A saved ${label} draft is available in this tab.`}
      </strong>
      <span>
        {diverged
          ? "Roadmap will not restore or replay it over newer plan state. Review or copy it before deciding whether to discard it."
          : "The server is still at the draft's base revision. Restore it explicitly or discard it; Roadmap will never submit it automatically."}
      </span>
      <details>
        <summary>Review and copy the saved draft</summary>
        <label>
          Saved draft text
          <textarea readOnly rows={12} value={reviewText} />
        </label>
        <button
          className={buttonClassName}
          type="button"
          onClick={() => downloadReviewText(reviewText)}
        >
          Download saved draft
        </button>
      </details>
      <div className={actionsClassName}>
        {!diverged && onRestore ? (
          <button className={buttonClassName} type="button" onClick={onRestore}>
            Restore saved draft for review
          </button>
        ) : null}
        <button className={buttonClassName} type="button" onClick={onDiscard}>
          Discard saved draft
        </button>
      </div>
    </div>
  );
}

export function authoringDraftStateBlocksMutation(
  state: AuthoringDraftUiState,
): boolean {
  return !["empty", "applied", "restored"].includes(state.kind);
}

function downloadReviewText(value: string): void {
  let url: string | null = null;
  let link: HTMLAnchorElement | null = null;
  try {
    url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
    link = document.createElement("a");
    link.href = url;
    link.download = "roadmap-saved-draft.txt";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
  } catch {
    // The read-only review field remains available for manual copy.
  } finally {
    link?.remove();
    const urlToRevoke = url;
    if (urlToRevoke) {
      window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 0);
    }
  }
}
