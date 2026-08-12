import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "Terms of use | Roadmap" };

export default function TermsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">Roadmap</Link>
        <Link href="/support">Support</Link>
      </header>
      <main className={styles.main}>
        <span className={styles.eyebrow}>Terms of use · working release · 7 August 2026</span>
        <h1>Roadmap organizes coach judgment; it does not replace it.</h1>
        <p className={styles.lead}>
          These working-release terms define the product boundary for the private production
          candidate. Final contracting identity, governing-law text, price, tax, refund, and service
          commitments must be published before a paid public release.
        </p>
        <div className={styles.notice}>
          No public price or charge is approved by these terms. The exact Canadian-dollar amount,
          billing interval, trial if any, cancellation consequences, and refund policy must be shown
          before checkout is enabled.
        </div>

        <section className={styles.section}>
          <h2>Who may use Roadmap</h2>
          <p>
            The initial service is for individual independent golf instructors in Canada working
            with adults. Team/facility accounts and junior-golfer records are not supported. The
            instructor must provide accurate account information and protect access to their signed-in
            session.
          </p>
        </section>
        <section className={styles.section}>
          <h2>Coach responsibility</h2>
          <p>
            The instructor owns and approves the coaching judgment, plan sequence, evidence
            interpretation, package facts, and external action link. Roadmap does not autonomously
            diagnose a swing, prescribe coaching, guarantee an outcome, or verify that a package is
            appropriate. The instructor must keep claims proportional to evidence and correct errors.
          </p>
        </section>
        <section className={styles.section}>
          <h2>Golfer choice and external actions</h2>
          <p>
            Golfers may ask questions, wait, decline, or practise independently. A coaching-package
            link leaves Roadmap for the instructor’s existing service. Roadmap does not claim that a
            booking, purchase, message, or payment occurred unless the responsible external service
            confirms it. Coach-package transactions are between the instructor and golfer.
          </p>
        </section>
        <section className={styles.section}>
          <h2>Acceptable use</h2>
          <p>Users must not:</p>
          <ul>
            <li>record junior-golfer data, medical information, payment-card data, or unlawful content;</li>
            <li>misrepresent evidence, results, qualifications, package terms, or another person’s identity;</li>
            <li>share access links beyond the intended recipient or attempt to cross account boundaries;</li>
            <li>probe, disrupt, automate abuse of, or bypass service security and rate limits; or</li>
            <li>use Roadmap for spam, deceptive sales pressure, autonomous diagnosis, or guaranteed-result claims.</li>
          </ul>
        </section>
        <section className={styles.section}>
          <h2>Subscriptions and cancellation</h2>
          <p>
            Roadmap’s SaaS subscription is separate from an instructor’s coaching packages. Stripe
            hosts checkout and the customer portal. Once enabled, the exact price, tax handling,
            renewal, failed-payment, cancellation, refund, and data-access consequences shown at
            checkout and in the portal govern that subscription. The application does not add a
            hidden charge for an instructor&apos;s external coaching package.
          </p>
        </section>
        <section className={styles.section}>
          <h2>Availability, changes, and ending use</h2>
          <p>
            Instructors can export or request deletion of their workspace and can revoke golfer
            links. Roadmap may restrict use needed to protect people, data, or the service. Material
            product, privacy, or subscription changes require clear notice appropriate to the change;
            unvalidated commercial outcomes are never promises.
          </p>
        </section>
        <section className={styles.section}>
          <h2>Questions</h2>
          <p>
            Use the <Link href="/support">support page</Link>. These working terms are not a substitute
            for qualified review of the final operating entity, jurisdiction, insurance, consumer,
            tax, privacy, and contracting obligations.
          </p>
        </section>
      </main>
      <footer className={styles.footer}>
        <span>Roadmap is a working product name.</span>
        <Link href="/privacy">Privacy</Link>
        <Link href="/support">Support</Link>
      </footer>
    </div>
  );
}
