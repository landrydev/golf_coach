import Link from "next/link";
import type { Metadata } from "next";
import { ConsentPurposeControl } from "@/components/consent/ConsentPurposeControl";
import { listConsentCurrentState } from "@/lib/consent-repository";
import { requirePageIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity, getProfile, listActivePackagesPage } from "@/lib/repository";
import styles from "../../beta2.module.css";
import { QuickRoadmapForm } from "./QuickRoadmapForm";

export const metadata: Metadata = { title: "Create a roadmap | Roadmap" };
export const dynamic = "force-dynamic";

export default async function NewPlayerPage() {
  const identity = await requirePageIdentity("/app/golfers/new");
  const account = await getOrCreateAccountForIdentity(identity);
  const [consentStates, profile, packagePage] = await Promise.all([
    listConsentCurrentState(account.id, { type: "account", golferId: null }),
    getProfile(account.id),
    listActivePackagesPage(account.id, { limit: 100 }),
  ]);
  const golferRecordConsent = consentStates.find((state) => state.purpose === "golfer_record")!;

  if (!profile) {
    return <div className={styles.page}><div className={styles.empty}><span className={styles.eyebrow}>One small setup step</span><h1>Add the coach identity your player will recognize.</h1><p>Your name is enough to begin. Branding and packages remain optional.</p><Link className={styles.primaryButton} href="/app/settings">Set coach identity</Link></div></div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>New player roadmap</span><h1>Turn your assessment into a clear story.</h1><p>A focused conversation creates the player, the current priority, and the three-phase roadmap in one pass.</p></div>
        <div className={styles.headerActions}><Link className={styles.secondaryButton} href="/app/golfers">Back to players</Link></div>
      </header>

      {!golferRecordConsent.effectiveGranted ? (
        <div className={styles.empty}>
          <h2>Player records are currently off.</h2>
          <p>Record the configured authorization below before entering player information.</p>
          <ConsentPurposeControl heading="Player record processing" state={golferRecordConsent} subjectType="account" />
        </div>
      ) : (
        <QuickRoadmapForm
          key={`quick-roadmap:${account.id}`}
          packages={packagePage.items}
          recoveryScope={account.id}
        />
      )}

      {golferRecordConsent.effectiveGranted ? (
        <details className={styles.advanced}>
          <summary>Data and privacy control</summary>
          <div className={styles.notice}><ConsentPurposeControl heading="Player record processing" state={golferRecordConsent} subjectType="account" /></div>
        </details>
      ) : null}
    </div>
  );
}
