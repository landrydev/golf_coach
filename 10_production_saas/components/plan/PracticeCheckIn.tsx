"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  clientMutationErrorMessage,
  isClientMutationOutcomeUnknown,
  requestClientMutation,
  requireClientMutationJson,
} from "@/lib/client-mutation-recovery";
import styles from "./plan.module.css";

type StoredAttempt = Readonly<{ key: string; body: string }>;

export function PracticeCheckIn({
  practiceItemId,
  sessionContext,
  preview = false,
}: {
  practiceItemId: string;
  sessionContext?: string;
  preview?: boolean;
}) {
  const statusId = useId();
  const attemptRef = useRef<StoredAttempt | null>(null);
  const [ready, setReady] = useState(preview);
  const [state, setState] = useState<"idle" | "saving" | "uncertain" | "saved" | "error" | "blocked">(
    preview ? "idle" : "blocked",
  );
  const [message, setMessage] = useState("");
  const storageKey = `roadmap:practice-check-in:v1:${sessionContext ?? "missing"}:${practiceItemId}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (preview) return;
      if (!sessionContext) {
        setState("blocked");
        setMessage("Reload this private roadmap before recording practice.");
        setReady(true);
        return;
      }
      try {
        const stored = window.sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as unknown;
          if (!isStoredAttempt(parsed)) throw new Error("invalid pending attempt");
          attemptRef.current = parsed;
          setState("uncertain");
          setMessage("A previous check-in may already be recorded. Submit the same answers to retry that exact attempt safely.");
        } else {
          setState("idle");
        }
      } catch {
        setState("blocked");
        setMessage("Roadmap cannot safely preserve a retry in this browser tab, so check-in is unavailable.");
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [preview, sessionContext, storageKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || preview || !sessionContext || state === "saving" || state === "saved" || state === "blocked") return;
    const form = new FormData(event.currentTarget);
    const body = JSON.stringify({
      practiceItemId,
      sessionContext,
      completionStatus: form.get("completionStatus"),
      perceivedDifficulty: emptyToNull(form.get("perceivedDifficulty")),
      confidenceRating: numberOrNull(form.get("confidenceRating")),
      note: emptyToNull(form.get("note")),
      requestHelp: form.get("requestHelp") === "on",
    });
    let attempt = attemptRef.current;
    if (attempt && attempt.body !== body) {
      setState("blocked");
      setMessage("These answers differ from the unconfirmed attempt. Restore the original answers or reopen the private roadmap before recording another check-in.");
      return;
    }
    if (!attempt) {
      attempt = { key: `practice-${crypto.randomUUID()}`, body };
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(attempt));
      } catch {
        setState("blocked");
        setMessage("Roadmap could not preserve this attempt safely. No check-in was sent.");
        return;
      }
      attemptRef.current = attempt;
    }
    setState("saving");
    setMessage("Recording your bounded practice check-in…");
    try {
      const response = await requestClientMutation("/r/practice-check-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.key,
        },
        body: attempt.body,
      });
      await requireClientMutationJson(
        response,
        isCheckInResponse,
        "Your practice check-in could not be recorded.",
      );
      window.sessionStorage.removeItem(storageKey);
      attemptRef.current = null;
      setState("saved");
      setMessage("Check-in recorded for your coach. Roadmap did not send a chat message or claim a result.");
    } catch (error) {
      if (!isClientMutationOutcomeUnknown(error)) {
        try {
          window.sessionStorage.removeItem(storageKey);
          attemptRef.current = null;
        } catch {
          // A definitive response is authoritative even when storage cleanup fails.
        }
      }
      setState(isClientMutationOutcomeUnknown(error) ? "uncertain" : "error");
      setMessage(
        clientMutationErrorMessage(
          error,
          "your practice check-in was recorded",
          "retry_same_attempt",
          "Your practice check-in could not be recorded.",
        ),
      );
    }
  }

  return (
    <form className={styles.checkIn} method="post" onSubmit={submit} aria-describedby={statusId}>
      <fieldset disabled={preview || state === "saving" || state === "saved" || state === "blocked" || !ready}>
        <legend>Quick practice check-in</legend>
        <div className={styles.checkInChoices}>
          <label>
            <input required type="radio" name="completionStatus" value="completed" />
            Completed
          </label>
          <label>
            <input required type="radio" name="completionStatus" value="not_completed" />
            Not completed
          </label>
        </div>
        <div className={styles.checkInGrid}>
          <label>
            Difficulty (optional)
            <select name="perceivedDifficulty" defaultValue="">
              <option value="">Choose</option>
              <option value="very_easy">Very easy</option>
              <option value="easy">Easy</option>
              <option value="appropriate">About right</option>
              <option value="hard">Hard</option>
              <option value="very_hard">Very hard</option>
            </select>
          </label>
          <label>
            Confidence (optional)
            <select name="confidenceRating" defaultValue="">
              <option value="">Choose</option>
              <option value="1">1 — not confident</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5 — very confident</option>
            </select>
          </label>
        </div>
        <label>
          Short note (optional)
          <textarea name="note" maxLength={1000} rows={2} placeholder="What did you notice?" />
        </label>
        <label className={styles.helpChoice}>
          <input name="requestHelp" type="checkbox" />
          I would like help from my coach
        </label>
        <button type="submit">
          {preview ? "Preview only" : state === "saving" ? "Recording…" : state === "uncertain" ? "Retry same check-in" : "Record check-in"}
        </button>
      </fieldset>
      <p id={statusId} className={state === "error" || state === "blocked" || state === "uncertain" ? styles.checkInError : styles.checkInStatus} role={state === "error" || state === "blocked" ? "alert" : "status"}>
        {preview
          ? "The live private roadmap enables this form. Coach preview records nothing."
          : message}
      </p>
    </form>
  );
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isStoredAttempt(value: unknown): value is StoredAttempt {
  return Boolean(
    value &&
      typeof value === "object" &&
      "key" in value &&
      "body" in value &&
      typeof value.key === "string" &&
      /^practice-[0-9a-f-]{36}$/i.test(value.key) &&
      typeof value.body === "string" &&
      value.body.length <= 8_000,
  );
}

function isCheckInResponse(value: unknown): boolean {
  if (!value || typeof value !== "object" || !("checkIn" in value)) return false;
  const checkIn = value.checkIn;
  return Boolean(
    checkIn &&
      typeof checkIn === "object" &&
      "id" in checkIn &&
      typeof checkIn.id === "string" &&
      "occurredAt" in checkIn &&
      Number.isSafeInteger(checkIn.occurredAt),
  );
}
