"use client";

import { useEffect, useState } from "react";
import styles from "./plan.module.css";

type LoadState = "loading" | "slow" | "ready" | "failed";

export function PrivatePlanMedia({
  src,
  mediaKind,
  mimeType,
  altText,
  transcript,
  posterSrc,
}: {
  src: string;
  mediaKind: "image" | "video" | "audio" | "document";
  mimeType: string;
  altText: string | null;
  transcript: string | null;
  posterSrc?: string | null;
}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (loadState !== "loading") return;
    const timeout = window.setTimeout(() => setLoadState("slow"), 12_000);
    return () => window.clearTimeout(timeout);
  }, [attempt, loadState]);

  function retry() {
    setAttempt((value) => value + 1);
    setLoadState("loading");
  }

  if (loadState === "failed") {
    return (
      <div className={styles.mediaUnavailable} role="status">
        <strong>Selected media could not load.</strong>
        <span>The caption and coach context remain available below.</span>
        <button type="button" onClick={retry}>
          Try loading again
        </button>
      </div>
    );
  }

  return (
    <div className={styles.mediaFrame} data-state={loadState}>
      {mediaKind === "video" ? (
        <video
          key={attempt}
          aria-label={altText || "Coach-selected private swing video"}
          controls
          playsInline
          preload="metadata"
          poster={posterSrc || undefined}
          onLoadedMetadata={() => setLoadState("ready")}
          onCanPlay={() => setLoadState("ready")}
          onError={() => setLoadState("failed")}
        >
          <source src={src} type={mimeType} />
          {transcript || "This browser cannot play the selected private video."}
        </video>
      ) : (
        // Private user media is deliberately not sent through a public optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={attempt}
          src={src}
          alt={altText || ""}
          loading="lazy"
          onLoad={() => setLoadState("ready")}
          onError={() => setLoadState("failed")}
        />
      )}
      {loadState === "loading" || loadState === "slow" ? (
        <div className={styles.mediaLoading} role="status">
          {loadState === "slow"
            ? "Media is taking longer to load. The text-first roadmap remains available."
            : "Loading selected private media..."}
        </div>
      ) : null}
    </div>
  );
}

export function PrivateBrandMark({
  src,
  fallback,
  className,
}: {
  src: string;
  fallback: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span aria-hidden="true" className={className} data-branding-fallback="true">
        {fallback}
      </span>
    );
  }
  // Private coach branding uses an authenticated or capability-bound media URL.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className} onError={() => setFailed(true)} />;
}
