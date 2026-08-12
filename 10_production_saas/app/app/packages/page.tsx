import { requirePageIdentity } from "@/lib/identity";
import type { Metadata } from "next";
import {
  getOrCreateAccountForIdentity,
  listPackagesPage,
} from "@/lib/repository";
import Link from "next/link";
import styles from "../workspace.module.css";
import { PackageForm } from "./PackageForm";
import { PackageLifecycleControls } from "./PackageLifecycleControls";
import { canAdvanceOffsetPage, MAX_PAGE_OFFSET } from "@/lib/pagination";

export const metadata: Metadata = {
  title: "Coaching packages | Roadmap",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const identity = await requirePageIdentity("/app/packages");
  const account = await getOrCreateAccountForIdentity(identity);
  const pageNumber = safePageNumber((await searchParams).page);
  const page = await listPackagesPage(account.id, {
    limit: PAGE_SIZE,
    offset: pageNumber * PAGE_SIZE,
  });
  const canAdvance = canAdvanceOffsetPage(page);
  const packages = page.items;

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
                <PackageLifecycleControls
                  key={`${item.id}:${item.updatedAt}`}
                  item={item}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {page.hasMore && !canAdvance ? (
        <div className={styles.notice} role="note">
          <strong>Package navigation reached its safe bound.</strong>
          <span>
            More package records exist, but this workspace does not generate an unusable
            next-page link. Archive or update older packages before continuing this list.
          </span>
        </div>
      ) : null}
      {pageNumber > 0 || canAdvance ? (
        <nav className={styles.actions} aria-label="Coaching package pages">
          {pageNumber > 0 ? (
            <Link
              className={styles.secondaryButton}
              href={pageNumber === 1 ? "/app/packages" : `/app/packages?page=${pageNumber - 1}`}
            >
              Previous packages
            </Link>
          ) : null}
          {canAdvance ? (
            <Link
              className={styles.secondaryButton}
              href={`/app/packages?page=${pageNumber + 1}`}
            >
              Next packages
            </Link>
          ) : null}
        </nav>
      ) : null}
      <PackageForm
        key={`package-create:${account.id}`}
        recoveryScope={account.id}
      />
    </div>
  );
}

function safePageNumber(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    parsed <= Math.floor(MAX_PAGE_OFFSET / PAGE_SIZE)
    ? parsed
    : 0;
}
