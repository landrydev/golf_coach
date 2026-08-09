"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearGolferResponsePendingAttempt,
  createSerialClientTaskQueue,
  requestShareExchange,
} from "@/lib/client-recovery";
import styles from "./share.module.css";

type AccessState =
  | "loading"
  | "access_granted"
  | "missing"
  | "closed"
  | "unavailable"
  | "retryable_exchange";

type AccessGeneration = {
  id: number;
  token: string | null;
};

// Module scope keeps the queue across React remounts in this browsing context.
// Cross-tab cookie contention remains fail-closed through sessionContext; this
// queue guarantees same-tab successor exchanges write their cookie last.
const shareExchangeQueue = createSerialClientTaskQueue();

export function ShareAccess() {
  const [state, setState] = useState<AccessState>("loading");
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const active = useRef(false);
  const generationSequence = useRef(0);
  const currentGeneration = useRef<AccessGeneration | null>(null);
  const shareToken = useRef<string | null>(null);

  const fragmentBelongsTo = useCallback((expectedToken: string | null) => {
    try {
      const fragment = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      );
      return fragment.get("token") === expectedToken;
    } catch {
      return false;
    }
  }, []);

  const ownsGeneration = useCallback((generation: AccessGeneration) => {
    return (
      active.current &&
      currentGeneration.current === generation &&
      fragmentBelongsTo(generation.token)
    );
  }, [fragmentBelongsTo]);

  const runOwnedEffect = useCallback((
    generation: AccessGeneration,
    effect: () => void,
  ) => {
    if (!ownsGeneration(generation)) return false;
    effect();
    return true;
  }, [ownsGeneration]);

  const clearFragment = useCallback((
    generation: AccessGeneration,
    replacementPath?: string,
  ) => {
    return runOwnedEffect(generation, () => {
      try {
        window.history.replaceState(
          null,
          "",
          replacementPath ??
            `${window.location.pathname}${window.location.search}`,
        );
      } catch {
        // A definitive exchange remains definitive even when this browser
        // blocks history replacement. The fallback UI remains usable.
      }
    });
  }, [runOwnedEffect]);

  const exchangeCapability = useCallback(async (
    generation: AccessGeneration,
    token: string,
  ) => {
    const result = await requestShareExchange(token);
    if (result.kind === "retryable") {
      // Keep the capability in this tab so retry and reload remain possible
      // after a transient network, timeout, throttling, or service failure.
      runOwnedEffect(generation, () => setState("retryable_exchange"));
      return;
    }

    // Every browser-side effect is separately fenced. This covers an unmounted
    // exchange followed by a newer mount for the same token as well as a
    // same-document hash change to a different (or repeated) token.
    if (!ownsGeneration(generation)) return;
    if (result.kind === "success") {
      try {
        if (!runOwnedEffect(generation, clearGolferResponsePendingAttempt)) {
          return;
        }
      } catch {
        // The new server session remains authoritative if local storage is
        // unavailable. Continue with fragment scrubbing and navigation.
      }
      if (!runOwnedEffect(generation, () => setRedirectTo(result.redirectTo))) {
        return;
      }
      if (!runOwnedEffect(generation, () => setState("access_granted"))) return;
      if (!runOwnedEffect(generation, () => {
        shareToken.current = null;
      })) return;
      // Scrub the bearer to the verified context-bound destination before a
      // navigation call that a browser extension or embedded context could
      // silently suppress. No await occurs after the final ownership check.
      if (!clearFragment(generation, result.redirectTo)) return;
      try {
        window.location.replace(result.redirectTo);
      } catch {
        // The sensitive fragment is already gone and the native fallback link
        // points to the verified context-bound destination.
      }
      return;
    }

    if (!runOwnedEffect(generation, () => setState("unavailable"))) return;
    if (!runOwnedEffect(generation, () => {
      shareToken.current = null;
    })) return;
    clearFragment(generation);
  }, [clearFragment, ownsGeneration, runOwnedEffect]);

  const beginCurrentGeneration = useCallback(() => {
    if (!active.current) return;

    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = fragment.get("token");
    const generation = {
      id: generationSequence.current + 1,
      token,
    } satisfies AccessGeneration;
    generationSequence.current = generation.id;
    currentGeneration.current = generation;

    if (!runOwnedEffect(generation, () => {
      shareToken.current = token;
    })) return;
    if (!runOwnedEffect(generation, () => setRedirectTo(null))) return;

    if (token) {
      if (!runOwnedEffect(generation, () => setState("loading"))) return;
      void shareExchangeQueue
        .run(async () => {
          // Collapse stale queued generations before they can reach the
          // network. If a predecessor already wrote Set-Cookie, this newest
          // owned request observes and replaces it after the predecessor has
          // fully settled.
          if (!ownsGeneration(generation)) return;
          await exchangeCapability(generation, token);
        })
        .catch(() => undefined);
      return;
    }

    const closed =
      new URLSearchParams(window.location.search).get("closed") === "1";
    if (!runOwnedEffect(generation, () => {
      setState(closed ? "closed" : "missing");
    })) return;
    clearFragment(generation);
  }, [clearFragment, exchangeCapability, ownsGeneration, runOwnedEffect]);

  useEffect(() => {
    active.current = true;
    const kickoff = window.setTimeout(beginCurrentGeneration, 0);
    window.addEventListener("hashchange", beginCurrentGeneration);

    return () => {
      window.clearTimeout(kickoff);
      window.removeEventListener("hashchange", beginCurrentGeneration);
      active.current = false;
      generationSequence.current += 1;
      currentGeneration.current = null;
    };
  }, [beginCurrentGeneration]);

  function retry() {
    beginCurrentGeneration();
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
        {state === "access_granted" && redirectTo ? (
          <>
            <span>Access confirmed</span>
            <h1>Your private roadmap is ready.</h1>
            <p>
              Continue to the roadmap if this browser does not open it automatically.
            </p>
            <a href={redirectTo}>Open roadmap</a>
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
        {state === "retryable_exchange" ? (
          <>
            <span>Connection interrupted</span>
            <h1>Roadmap could not check the private link yet.</h1>
            <p>
              The access code remains in this browser tab so you can safely try the same
              link again. No coaching details have been disclosed.
            </p>
            <button type="button" onClick={retry}>
              Try again
            </button>
            <p className={styles.safetyNote}>
              Do not copy or share the address while its private access code is present.
            </p>
          </>
        ) : null}
      </section>
    </main>
  );
}
