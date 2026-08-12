import Link from "next/link";
import type { Metadata } from "next";
import { requirePageIdentity } from "@/lib/identity";
import { listAccountActiveShareControls } from "@/lib/plans";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import styles from "../../workspace.module.css";
import { ShareAccessControls } from "./ShareAccessControls";

export const metadata: Metadata = {
  title: "Active private access | Roadmap",
};

export const dynamic = "force-dynamic";

export default async function ActiveShareControlsPage() {
  const identity = await requirePageIdentity("/app/settings/shares");
  const account = await getOrCreateAccountForIdentity(identity);
  const shares = await listAccountActiveShareControls(account.id);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Account controls</span>
          <h1>Contain private access without reopening the workspace.</h1>
          <p>
            You can inspect and revoke live private-access capabilities even when core
            golfer and plan features require an eligible subscription.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.secondaryButton} href="/app/settings">
            Back to settings
          </Link>
        </div>
      </header>
      <ShareAccessControls initialShares={shares} />
    </div>
  );
}
