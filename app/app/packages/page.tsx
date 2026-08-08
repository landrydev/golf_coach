import { requirePageIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity, listPackages } from "@/lib/repository";
import styles from "../workspace.module.css";
import { PackageForm } from "./PackageForm";
import { PackageLifecycleControls } from "./PackageLifecycleControls";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const identity = await requirePageIdentity("/app/packages");
  const account = await getOrCreateAccountForIdentity(identity);
  const packages = await listPackages(account.id);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Coaching packages</span>
          <h1>Connect the phase to a package you already offer.</h1>
          <p>
            Roadmap explains the recommendation and then sends the golfer to your existing
            booking, purchase, or contact route. It does not process coach-package payments.
          </p>
        </div>
      </header>
      <div className={styles.notice} role="note">
        <strong>Package facts can affect private golfer plans.</strong>
        <span>
          Editing or archiving a linked package creates a new withdrawn plan revision,
          clears publication approval, and revokes active links until you review and publish
          again. Roadmap never treats an external click as a booking, purchase, or sale.
        </span>
      </div>
      {packages.length ? (
        <section className={styles.panel} style={{ marginBottom: "1rem" }}>
          <div className={styles.panelHeader}>
            <h2>Current packages</h2>
          </div>
          <ul className={styles.list}>
            {packages.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                  <small>
                    {item.priceCents != null && item.currency
                      ? new Intl.NumberFormat("en-CA", {
                          style: "currency",
                          currency: item.currency,
                          currencyDisplay: "code",
                        }).format(item.priceCents / 100)
                      : item.currentDetailsText || "Price details not set"}{" "}
                    · {item.terms || "Terms not set"}
                  </small>
                </div>
                <span className={styles.status}>{item.status}</span>
                <PackageLifecycleControls item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <PackageForm />
    </div>
  );
}
