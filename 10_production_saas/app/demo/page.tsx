import type { Metadata } from "next";
import Link from "next/link";
import { DemoAuthLink } from "./DemoAuthLink";
import { DemoExperience } from "./DemoExperience";
import styles from "./demo.module.css";

export const metadata: Metadata = {
  title: "Interactive synthetic roadmap | Roadmap",
  description: "Explore a resettable fictional coaching journey. No real golfer data or validated coaching claim is used.",
};

export default function DemoPage() {
  return (
    <main className={styles.page}>
      <header className={styles.publicHeader}>
        <Link href="/" prefetch={false}>Roadmap</Link>
        <DemoAuthLink>Sign in</DemoAuthLink>
      </header>
      <div className={styles.demoBanner} role="status">
        Interactive synthetic demo — fictional records, editable examples, no saved data
      </div>
      <DemoExperience />
    </main>
  );
}
