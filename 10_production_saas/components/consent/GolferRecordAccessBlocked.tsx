import Link from "next/link";
import styles from "@/app/app/workspace.module.css";

export function GolferRecordAccessBlocked() {
  return (
    <div className={styles.page}>
      <div className={styles.emptyState}>
        <h1>Golfer records are unavailable.</h1>
        <p>
          A current configured golfer-record authorization is required before ordinary
          instructor access can resume.
        </p>
        <Link className={styles.primaryButton} href="/app/settings/data">
          Open data controls
        </Link>
      </div>
    </div>
  );
}
