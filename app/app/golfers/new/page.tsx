import Link from "next/link";
import type { Metadata } from "next";
import { ConsentPurposeControl } from "@/components/consent/ConsentPurposeControl";
import { listConsentCurrentState } from "@/lib/consent-repository";
import { requirePageIdentity } from "@/lib/identity";
import {
  getOrCreateAccountForIdentity,
  getProfile,
  listActivePackagesPage,
} from "@/lib/repository";
import styles from "../../workspace.module.css";
import { NewGolferForm } from "./NewGolferForm";
import { StagedGolferForm } from "./StagedGolferForm";

export const metadata: Metadata = {
  title: "Add a golfer | Roadmap",
};

export const dynamic = "force-dynamic";

export default async function NewGolferPage() {
  const identity = await requirePageIdentity("/app/golfers/new");
  const account = await getOrCreateAccountForIdentity(identity);
  const consentStates = await listConsentCurrentState(account.id, {
    type: "account",
    golferId: null,
  });
  const golferRecordConsent = consentStates.find(
    (state) => state.purpose === "golfer_record",
  )!;
  const profile = await getProfile(account.id);
  if (!profile) {
    return (
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <span className={styles.eyebrow}>Coach identity required</span>
            <h1>Set the name your golfer will recognize first.</h1>
            <p>
              A coach identity is required to render and review the exact private golfer
              experience. Your name is enough; branding remains optional.
            </p>
          </div>
        </header>
        <div className={styles.emptyState}>
          <h2>No golfer information has been collected.</h2>
          <p>Save your coach identity, then return here to create the private draft.</p>
          <Link className={styles.primaryButton} href="/app/settings">
            Set up coach identity
          </Link>
        </div>
      </div>
    );
  }
  const packagePage = await listActivePackagesPage(account.id, { limit: 100 });
  const packages = packagePage.items;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>New golfer roadmap</span>
          <h1>Start with the facts you know, then finish the coaching judgment.</h1>
          <p>
            Save the golfer, plan title, and primary goal now, then resume the assessment
            and phase sequence without losing the record. Nothing can be published until
            that real coaching content is complete.
          </p>
        </div>
        <Link className={styles.secondaryButton} href="/app/golfers">
          Back to golfers
        </Link>
      </header>
      <div className={styles.notice} role="note">
        <strong>Collect only what you need.</strong>
        <span>
          Do not add medical details, payment information, or unrelated personal history.
          Media is optional and requires a suitable consent basis.
        </span>
      </div>
      <ConsentPurposeControl
        heading="Golfer record processing"
        state={golferRecordConsent}
        subjectType="account"
      />
      {!golferRecordConsent.effectiveGranted ? (
        <div className={styles.emptyState}>
          <h2>Golfer collection is disabled.</h2>
          <p>
            Record the configured authorization above before entering or saving any golfer
            information.
          </p>
        </div>
      ) : (
        <>
      <StagedGolferForm
        key={`staged-golfer:${account.id}`}
        recoveryScope={account.id}
      />
      {packagePage.hasMore ? (
        <div className={styles.notice} role="note">
          <strong>Package selection is bounded.</strong>
          <span>
            Up to 100 active packages are available here, with your default first and then
            recent updates. Archive or update older package records from the package
            workspace before attaching one.
          </span>
        </div>
      ) : null}
      <div className={styles.notice} role="note">
        <strong>Prefer one complete authoring session?</strong>
        <span>
          The full-create form below remains available when you already have the complete
          assessment, current priority, and phase sequence.
        </span>
      </div>
      <NewGolferForm
        key={`full-golfer:${account.id}`}
        packages={packages}
        recoveryScope={account.id}
      />
        </>
      )}
    </div>
  );
}
