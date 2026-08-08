"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestShareExchange } from "@/lib/client-recovery";
import styles from "./share.module.css";

type AccessState =
  | "loading"
  | "missing"
  | "closed"
  | "unavailable"
  | "retryable_exchange"
  | "retryable_cleanup";

export function ShareAccess() {
  const [state, setState] = useState<AccessState>("loading");
  const active = useRef(true);
  const shareToken = useRef<string | null>(null);

  const clearFragment = useCallback(() => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  const closeMissingSession = useCallback(async () => {
    try {
      const response = await fetch("/r/session", { method: "DELETE" });
      if (!response.ok) throw new Error("session_cleanup_failed");
      if (active.current) {
        const closed = new URLSearchParams(window.location.search).get("closed") === "1";
        setState(closed ? "closed" : "missing");
      }
    } catch {
      if (active.current) setState("retryable_cleanup");
    }
  }, []);

  const exchangeCapability = useCallback(async (token: string) => {
    const result = await requestShareExchange(token);
    if (!active.current) return;

    if (result.kind === "retryable") {
      // Keep the capability in this tab so retry and reload remain possible
      // after a transient network, timeout, throttling, or service failure.
      setState("retryable_exchange");
      return;
    }

    clearFragment();
    shareToken.current = null;
    if (result.kind === "success") {
      window.location.replace(result.redirectTo);
      return;
    }
    setState("unavailable");
  }, [clearFragment]);

  useEffect(() => {
    active.current = true;
    const kickoff = window.setTimeout(() => {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const token = fragment.get("token");
      shareToken.current = token;

      if (token) {
        void exchangeCapability(token);
      } else {
        clearFragment();
        void closeMissingSession();
      }
    }, 0);

    return () => {
      window.clearTimeout(kickoff);
      active.current = false;
    };
  }, [clearFragment, closeMissingSession, exchangeCapability]);

  function retry() {
    setState("loading");
    const token = shareToken.current;
    if (token) {
      void exchangeCapability(token);
    } else {
      void closeMissingSession();
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.wordmark}>Roadmap</div>
      <section
        className={styles.card}
        aria-busy={state === "loading"}
        aria-live="polite"
      >
        {state === "loading" ? (
          <>
            <span>Private coaching plan</span>
            <h1>Opening your roadmap…</h1>
            <p>
              The private access link is being checked. No coaching details are shown until
              it is valid.
            </p>
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
            <p>
              Its local session has ended. The coach&apos;s original share link was not
              revoked.
            </p>
          </>
        ) : null}
        {state === "unavailable" ? (
          <>
            <span>Plan unavailable</span>
            <h1>This private roadmap cannot be opened.</h1>
            <p>
              The link may be expired, revoked, replaced by a newer plan, or incomplete. No
              golfer information has been disclosed. Ask the coach to send a current link.
            </p>
          </>
        ) : null}
        {state === "retryable_exchange" || state === "retryable_cleanup" ? (
          <>
            <span>Connection interrupted</span>
            <h1>Roadmap could not check the private link yet.</h1>
            <p>
              {state === "retryable_exchange"
                ? "The access code remains in this browser tab so you can safely try the same link again. No coaching details have been disclosed."
                : "Roadmap could not finish closing the previous local session. You can safely try again."}
            </p>
            <button type="button" onClick={retry}>
              Try again
            </button>
            {state === "retryable_exchange" ? (
              <p className={styles.safetyNote}>
                Do not copy or share the address while its private access code is present.
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
