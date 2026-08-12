import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacy notice | Roadmap",
  description: "How Roadmap handles instructor and golfer information.",
};

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">Roadmap</Link>
        <Link href="/support">Support</Link>
      </header>
      <main className={styles.main}>
        <span className={styles.eyebrow}>Privacy notice · working release · 7 August 2026</span>
        <h1>Use the smallest useful amount of golfer information.</h1>
        <p className={styles.lead}>
          Roadmap gives independent instructors a private place to turn their own coaching
          judgment into a development plan. This notice describes the current product design
          and the choices available to instructors and golfers.
        </p>
        <div className={styles.notice}>
          Roadmap is a working product name. The accountable operating entity, public privacy
          contact, exact provider regions, and final retention schedule must be published before
          general public availability. The current release must remain private until those details
          match the deployed service.
        </div>

        <section className={styles.section}>
          <h2>Information Roadmap handles</h2>
          <ul>
            <li>Instructor sign-in identity, profile, business identity, and account settings.</li>
            <li>Subscription identifiers and status from Stripe—not full card numbers.</li>
            <li>Adult golfer names, optional contact details, goals, constraints, and coaching context.</li>
            <li>Coach-authored assessments, phases, lessons, practice directions, evidence, and reviews.</li>
            <li>Private-link status, access counts, security/audit events, and data-request records.</li>
            <li>Optional media only when the product explicitly enables it and a suitable consent basis exists.</li>
          </ul>
          <p>Do not enter medical details, payment-card data, junior-golfer data, or unrelated personal history.</p>
        </section>

        <section className={styles.section}>
          <h2>Why it is used</h2>
          <p>
            Information is used to authenticate the instructor, isolate each instructor workspace,
            create and maintain the requested coaching plan, deliver a revocable private view,
            operate billing, protect the service, answer data requests, and recover from failures.
            It is not used to generate autonomous diagnoses, sell personal information, or train a
            Roadmap coaching model.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Instructor and golfer responsibilities</h2>
          <p>
            The instructor decides what coaching information to record and must have an appropriate
            basis to do so. The initial product is adults-only. A golfer can ask the instructor to
            correct plan content, revoke access, or relay an access/deletion concern to Roadmap.
            Private links are bearer credentials: recipients should not forward them.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Providers and disclosures</h2>
          <p>
            The selected implementation uses OpenAI Sites and Cloudflare infrastructure for the
            application, D1 database, object storage, and operational logs; dispatch-owned Sign in
            with ChatGPT for instructor identity; and Stripe for subscription checkout, invoices,
            and customer-portal actions. Information may also be disclosed when lawfully required
            or needed to protect users and the service. Final provider regions and contractual
            safeguards remain a pre-launch operating dependency.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Control, retention, and deletion</h2>
          <p>
            Instructors can create links that expire after 1, 7, 30, or 90 days and can revoke them
            sooner. Editing a plan automatically invalidates its earlier link. Signed-in instructors
            can request an export or account deletion from Settings. Requests are identity-checked;
            links are revoked before irreversible deletion begins. Exact operational retention,
            backup expiry, legal-hold, and billing-record periods must be published before general
            availability and then enforced by the production runbook.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Safeguards and incidents</h2>
          <p>
            Roadmap uses server-side tenant checks, private-by-default plans, short-lived HTTP-only
            share sessions, non-reversible token fingerprints, input limits, security headers,
            audit events, and least-privilege provider bindings. No safeguard eliminates all risk.
            Confirmed incidents follow the documented incident process and applicable notification
            requirements.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Access, correction, withdrawal, and questions</h2>
          <p>
            Instructors can use the in-product data controls. Golfers should begin with the coach
            named on their private plan because that coach can correct coaching content or revoke
            the link. For product-level requests, use the current controlled release support channel
            shown on the <Link href="/support">support page</Link>. A verified request record is kept
            so its disposition can be audited.
          </p>
          <p>
            Canadian privacy guidance emphasizes understandable purposes, limited collection,
            meaningful choices, access, correction, safeguards, and accountable handling. Roadmap’s
            operating entity still needs qualified advice on the laws applicable to its exact launch.
          </p>
        </section>
      </main>
      <footer className={styles.footer}>
        <span>Roadmap is a working product name.</span>
        <Link href="/terms">Terms</Link>
        <Link href="/support">Support</Link>
      </footer>
    </div>
  );
}
