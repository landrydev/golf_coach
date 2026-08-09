"use client";

import { useState } from "react";
import { clearGolferResponsePendingAttempt } from "@/lib/client-recovery";
import {
  clientMutationErrorMessage,
  requestClientMutation,
  requireClientMutationSuccess,
} from "@/lib/client-mutation-recovery";
import styles from "./plan.module.css";

export function CloseRoadmap({ sessionContext }: { sessionContext: string }) {
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function closeRoadmap() {
    setClosing(true);
    setMessage("");
    setError(false);
    try {
      const response = await requestClientMutation("/r/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionContext }),
        cache: "no-store",
        credentials: "same-origin",
      });
      await requireClientMutationSuccess(
        response,
        "The roadmap could not be closed. Please try again.",
        [204],
      );
    } catch (error) {
      setError(true);
      setMessage(
        clientMutationErrorMessage(
          error,
          "this roadmap session was closed",
          "retry_same_attempt",
          "The roadmap could not be closed. Please try again.",
        ),
      );
      setClosing(false);
      return;
    }

    // The server result is definitive. Browser-local cleanup or navigation can
    // still fail, but neither failure makes the close request unsuccessful.
    setClosed(true);
    setError(false);
    setMessage("This roadmap session is closed. Redirecting…");
    try {
      clearGolferResponsePendingAttempt();
    } catch {
      // The closed server session remains authoritative if local storage is
      // unavailable. The access-page navigation below is still safe.
    }
    try {
      window.location.replace("/r?closed=1");
    } catch {
      setMessage("This roadmap session is closed. Continue to the access page.");
    }
  }

  return (
    <div className={styles.closeControl}>
      <button type="button" disabled={closing || closed} onClick={closeRoadmap}>
        {closed ? "Roadmap closed" : closing ? "Closing roadmap…" : "Close roadmap"}
      </button>
      {message ? <span role={error ? "alert" : "status"}>{message}</span> : null}
      {closed ? <a href="/r?closed=1">Continue</a> : null}
    </div>
  );
}
