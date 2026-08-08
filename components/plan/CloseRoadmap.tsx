"use client";

import { useState } from "react";
import styles from "./plan.module.css";

export function CloseRoadmap() {
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState("");

  async function closeRoadmap() {
    setClosing(true);
    setMessage("");
    try {
      const response = await fetch("/r/session", { method: "DELETE" });
      if (!response.ok) {
        throw new Error("The roadmap could not be closed. Please try again.");
      }
      window.location.replace("/r?closed=1");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The roadmap could not be closed. Please try again.",
      );
      setClosing(false);
    }
  }

  return (
    <div className={styles.closeControl}>
      <button type="button" disabled={closing} onClick={closeRoadmap}>
        {closing ? "Closing roadmap…" : "Close roadmap"}
      </button>
      {message ? <span role="alert">{message}</span> : null}
    </div>
  );
}
