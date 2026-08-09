"use client";

import { useId, useState } from "react";
import {
  attemptExternalHandoffRecord,
  createGolferResponseAttemptRegistry,
  requestGolferResponse,
} from "@/lib/client-recovery";
import { buildCoachContactMailtoUri } from "@/lib/mailto";
import type { GolferResponseType } from "@/lib/plans";
import styles from "./plan.module.css";

type ChoiceProps = {
  coachName: string;
  coachEmail?: string | null;
  externalActionUrl?: string | null;
  preview?: boolean;
};

type RecordedChoice = Exclude<GolferResponseType, "external_action_opened">;

const CONFIRMATIONS: Record<RecordedChoice, string> = {
  ask_question:
    "Your question choice was recorded. Your email app will open next; Roadmap has not sent a message.",
  wait: "Review later was recorded. This is not a booking, payment, or message.",
  decline:
    "Not pursuing this option was recorded. Your private plan remains available while this link is valid.",
  request_reassessment:
    "A reassessment request was recorded for your coach to review. Roadmap has not sent a message.",
  independent_practice:
    "Independent practice was recorded. Use only the coach-authored direction in this plan and ask when anything is unclear.",
};

const OUTCOME_UNKNOWN_MESSAGE =
  "Roadmap could not confirm whether this choice was recorded. Check your connection, then retry the same choice on this page; Roadmap will reuse this attempt rather than add another response.";

export function GolferChoices({
  coachName,
  coachEmail,
  externalActionUrl,
  preview = false,
}: ChoiceProps) {
  const externalHandoffNoteId = useId();
  const [attemptRegistry] = useState(() =>
    createGolferResponseAttemptRegistry(),
  );
  const [saving, setSaving] = useState<RecordedChoice | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const coachMailtoUri = buildCoachContactMailtoUri(coachEmail);

  async function choose(responseType: RecordedChoice) {
    if (preview) return;
    setSaving(responseType);
    setMessage("");
    setIsError(false);

    try {
      const attemptKey = attemptRegistry.keyFor(responseType);
      const result = await requestGolferResponse(responseType, attemptKey);
      attemptRegistry.settle(responseType, attemptKey, result.kind);

      if (result.kind === "outcome_unknown") {
        setIsError(true);
        setMessage(OUTCOME_UNKNOWN_MESSAGE);
        return;
      }
      if (result.kind === "rejected") {
        setIsError(true);
        setMessage(result.message);
        return;
      }

      setMessage(CONFIRMATIONS[responseType]);

      if (responseType === "ask_question" && coachMailtoUri) {
        window.location.assign(coachMailtoUri);
      }
    } catch {
      setIsError(true);
      setMessage(OUTCOME_UNKNOWN_MESSAGE);
    } finally {
      setSaving(null);
    }
  }

  const disabled = preview || saving !== null;

  return (
    <div className={styles.choicePanel} aria-labelledby="golfer-choice-heading">
      <div>
        <span>Choose without pressure</span>
        <h3 id="golfer-choice-heading">What would you like to do next?</h3>
        <p>
          {preview
            ? `Preview only: these are the choices the golfer will receive. Controls are disabled and nothing is recorded for ${coachName}.`
            : `Roadmap records only the choice below for ${coachName} to review. It does not send a message or treat an external visit as a sale.`}
        </p>
      </div>
      <div className={styles.choiceButtons}>
        {externalActionUrl && preview ? (
          <button
            className={styles.primaryChoice}
            type="button"
            disabled
          >
            Continue to the coach’s external page
          </button>
        ) : null}
        {externalActionUrl && !preview ? (
          <a
            aria-describedby={externalHandoffNoteId}
            className={styles.primaryChoice}
            href={externalActionUrl}
            rel="external noreferrer"
            onClick={() => attemptExternalHandoffRecord()}
          >
            Continue to the coach’s external page
          </a>
        ) : null}
        {coachMailtoUri ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => choose("ask_question")}
          >
            Ask {coachName} a question
          </button>
        ) : null}
        <button type="button" disabled={disabled} onClick={() => choose("wait")}>
          Review later
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => choose("request_reassessment")}
        >
          Request reassessment
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => choose("independent_practice")}
        >
          Practise independently
        </button>
        <button type="button" disabled={disabled} onClick={() => choose("decline")}>
          Not pursuing this option
        </button>
      </div>
      {externalActionUrl && !preview ? (
        <p id={externalHandoffNoteId} className={styles.externalTrackingNote}>
          This link always opens the coach&apos;s external service. Roadmap makes a
          best-effort record that you opened it, but a tracking or network failure will not
          block the handoff. Booking or payment is complete only when the external service
          confirms it.
        </p>
      ) : null}
      {message ? (
        <p
          className={isError ? styles.choiceError : styles.choiceStatus}
          role={isError ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
