"use client";

import styles from "./workspace.module.css";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <section className={styles.formCard} aria-labelledby="workspace-error-heading">
      <div className={styles.errorStatus} role="alert">
        <strong id="workspace-error-heading">This workspace view could not be loaded.</strong>
        <span>
          Your last confirmed action may still have completed. Reload the latest state before
          repeating a publish, billing, or data request.
        </span>
      </div>
      <div className={styles.actions} style={{ marginTop: "1rem" }}>
        <button className={styles.primaryButton} type="button" onClick={reset}>
          Try again
        </button>
        <a className={styles.secondaryButton} href="/support">
          Support guidance
        </a>
      </div>
    </section>
  );
}
