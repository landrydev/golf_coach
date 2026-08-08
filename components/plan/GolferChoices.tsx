"use client";

import { useState } from "react";
import type { GolferResponseType } from "@/lib/plans";
import styles from "./plan.module.css";

type ChoiceProps = {
  coachName: string;
  coachEmail?: string | null;
  externalActionUrl?: string | null;
};

const CONFIRMATIONS: Record<GolferResponseType, string> = {
  ask_question:
    "Your question choice was recorded. Your email app will open next; Roadmap has not sent a message.",
  wait: "Review later was recorded. This is not a booking, payment, or message.",
  decline:
    "Not pursuing this option was recorded. Your private plan remains available while this link is valid.",
  request_reassessment:
    "A reassessment request was recorded for your coach to review. Roadmap has not sent a message.",
  independent_practice:
    "Independent practice was recorded. Use only the coach-authored direction in this plan and ask when anything is unclear.",
  external_action_opened:
    "The external coach action was recorded as opened. Roadmap does not know whether a booking or payment occurs there.",
};

export function GolferChoices({
  coachName,
  coachEmail,
  externalActionUrl,
}: ChoiceProps) {
  const [saving, setSaving] = useState<GolferResponseType | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function choose(responseType: GolferResponseType) {
    setSaving(responseType);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch("/r/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseType }),
      });
      const result = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          result.error?.message || "Your choice could not be recorded. Please try again.",
        );
      }

      setMessage(CONFIRMATIONS[responseType]);

      if (responseType === "ask_question" && coachEmail) {
        const subject = encodeURIComponent("Question about my Roadmap coaching plan");
        window.location.assign(`mailto:${coachEmail}?subject=${subject}`);
      }
      if (responseType === "external_action_opened" && externalActionUrl) {
        window.location.assign(externalActionUrl);
      }
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Your choice could not be recorded. Please try again.",
      );
    } finally {
      setSaving(null);
    }
  }

  const disabled = saving !== null;

  return (
    <div className={styles.choicePanel} aria-labelledby="golfer-choice-heading">
      <div>
        <span>Choose without pressure</span>
        <h3 id="golfer-choice-heading">What would you like to do next?</h3>
        <p>
          Roadmap records only the choice below for {coachName} to review. It does not send a
          message or treat an external visit as a sale.
        </p>
      </div>
      <div className={styles.choiceButtons}>
        {externalActionUrl ? (
          <button
            className={styles.primaryChoice}
            type="button"
            disabled={disabled}
            onClick={() => choose("external_action_opened")}
          >
            {saving === "external_action_opened"
              ? "Recording choice…"
              : "Continue to the coach’s external page"}
          </button>
        ) : null}
        {coachEmail ? (
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
