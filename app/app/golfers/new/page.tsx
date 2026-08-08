import Link from "next/link";
import { requirePageIdentity } from "@/lib/identity";
import {
  getOrCreateAccountForIdentity,
  getProfile,
  listPackages,
} from "@/lib/repository";
import styles from "../../workspace.module.css";
import { NewGolferForm } from "./NewGolferForm";

export const dynamic = "force-dynamic";

export default async function NewGolferPage() {
  const identity = await requirePageIdentity("/app/golfers/new");
  const account = await getOrCreateAccountForIdentity(identity);
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
  const packages = (await listPackages(account.id)).filter(
    (coachingPackage) => coachingPackage.status === "active",
  );

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>New golfer roadmap</span>
          <h1>Capture the coaching judgment that makes the sequence credible.</h1>
          <p>
            Save a private draft first. You will preview the exact golfer experience and
            create a revocable share link only after review.
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
      <NewGolferForm packages={packages} />
    </div>
  );
}
