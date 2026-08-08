import Link from "next/link";
import { requirePageIdentity } from "@/lib/identity";
import styles from "../../workspace.module.css";
import { DataRequestControls } from "./DataRequestControls";

export const dynamic = "force-dynamic";

export default async function DataSettingsPage() {
  await requirePageIdentity("/app/settings/data");

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Data controls</span>
          <h1>Export your workspace or request a deletion review.</h1>
          <p>
            Export generation is authenticated, tenant-scoped, and audited without copying
            your content into the audit record. Deletion remains a reviewed request, not an
            automatic destructive action.
          </p>
        </div>
        <Link className={styles.secondaryButton} href="/app/settings">
          Back to settings
        </Link>
      </header>
      <DataRequestControls />
    </div>
  );
}
