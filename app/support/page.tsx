import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "Support | Roadmap" };

export default function SupportPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">Roadmap</Link>
        <Link href="/app">Open the app</Link>
      </header>
      <main className={styles.main}>
        <span className={styles.eyebrow}>Support</span>
        <h1>Start with the owner of the information or action.</h1>
        <p className={styles.lead}>
          Roadmap separates coaching questions, account/data requests, subscription actions, and
          security incidents so each reaches the right owner.
        </p>
        <div className={styles.notice}>
          A staffed public support address and response schedule are not configured yet. The current
          deployment must remain a controlled private release until the accountable operator publishes
          and exercises that channel.
        </div>
        <section className={styles.section}>
          <h2>For instructors</h2>
          <ul>
            <li>Profile, golfer, package, and plan changes: use the signed-in workspace.</li>
            <li>Subscription or invoices: use Plan &amp; billing, then Stripe’s customer portal.</li>
            <li>Export or deletion: Settings → Export or delete data.</li>
            <li>Lost sign-in access or a suspected incident: use the owner’s controlled release channel immediately.</li>
          </ul>
          <Link href="/app">Open the instructor workspace</Link>
        </section>
        <section className={styles.section}>
          <h2>For golfers</h2>
          <p>
            Contact the coach named on the private plan for coaching questions, content corrections,
            package details, or a new/revoked link. External booking and coach-package payments belong
            to that coach’s service. For a Roadmap-level access or deletion concern, ask the coach to
            open a verified data request while the public privacy channel is being established.
          </p>
        </section>
        <section className={styles.section}>
          <h2>Before reporting an issue</h2>
          <p>
            Record the time, page, expected result, and any non-sensitive error text. Never send a
            password, card number, production secret, full private link, or unrelated golfer details.
            A confirmed security or privacy incident follows the production incident runbook.
          </p>
        </section>
      </main>
      <footer className={styles.footer}>
        <span>Roadmap is a working product name.</span>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </footer>
    </div>
  );
}
