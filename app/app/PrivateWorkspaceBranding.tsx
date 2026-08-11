"use client";

import { useState } from "react";
import styles from "./app.module.css";

export function PrivateWorkspaceBrandImage({
  src,
  fallback,
  variant,
}: {
  src: string | null;
  fallback: string;
  variant: "logo" | "profile";
}) {
  const [failed, setFailed] = useState(false);
  const className = variant === "logo" ? styles.brandLogo : styles.accountPhoto;

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className={className}
        data-branding-fallback={variant}
      >
        {fallback}
      </span>
    );
  }

  return (
    // Authenticated workspace branding stays on the tenant-scoped private media route.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className={className}
      decoding="async"
      loading="lazy"
      src={src}
      onError={() => setFailed(true)}
    />
  );
}
