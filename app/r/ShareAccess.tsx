"use client";

import { useEffect, useState } from "react";
import styles from "./share.module.css";

export function ShareAccess() {
  const [state, setState] = useState<"loading" | "missing" | "closed" | "error">("loading");

  useEffect(() => {
    let active = true;
    async function exchangeCapability() {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const token = fragment.get("token");
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
      if (!token) {
        try {
          const response = await fetch("/r/session", { method: "DELETE" });
          if (!response.ok) throw new Error("session_cleanup_failed");
          if (active) {
            const closed = new URLSearchParams(window.location.search).get("closed") === "1";
            setState(closed ? "closed" : "missing");
          }
        } catch {
          if (active) setState("error");
        }
        return;
      }

      try {
        const response = await fetch("/r/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = (await response.json()) as { redirectTo?: string };
        if (!response.ok || !payload.redirectTo) throw new Error("unavailable");
        window.location.replace(payload.redirectTo);
      } catch {
        if (active) setState("error");
      }
    }

    void exchangeCapability();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className={styles.shell}>
      <div className={styles.wordmark}>Roadmap</div>
      <section className={styles.card} aria-live="polite">
        {state === "loading" ? (
          <>
            <span>Private coaching plan</span>
            <h1>Opening your roadmap…</h1>
            <p>The private access link is being checked. No coaching details are shown until it is valid.</p>
          </>
        ) : null}
        {state === "missing" ? (
          <>
            <span>Access link needed</span>
            <h1>Open the complete private link from your coach.</h1>
            <p>The access code was not present. Ask the coach to resend or create a new link.</p>
          </>
        ) : null}
        {state === "closed" ? (
          <>
            <span>Roadmap closed</span>
            <h1>This private roadmap is no longer open on this browser.</h1>
            <p>Its local session has ended. The coach&apos;s original share link was not revoked.</p>
          </>
        ) : null}
        {state === "error" ? (
          <>
            <span>Plan unavailable</span>
            <h1>This private roadmap cannot be opened.</h1>
            <p>The link may be expired, revoked, replaced by a newer plan, or incomplete. No golfer information has been disclosed.</p>
          </>
        ) : null}
      </section>
    </main>
  );
}
