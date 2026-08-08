import {
  getSubscriptionForAccount,
  isOpenSubscription,
  type SubscriptionStatus,
} from "@/lib/billing-repository";
import { requirePageIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { billingConfigured, checkoutEnabled } from "@/lib/stripe";
import styles from "../workspace.module.css";

export const dynamic = "force-dynamic";

type BillingPageProps = {
  searchParams: Promise<{
    checkout?: string | string[];
    reconcile?: string | string[];
  }>;
};

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const [identity, query] = await Promise.all([
    requirePageIdentity("/app/billing"),
    searchParams,
  ]);
  const account = await getOrCreateAccountForIdentity(identity);
  const subscription = await getSubscriptionForAccount(account.id);
  const isConfigured = billingConfigured();
  const isCheckoutEnabled = checkoutEnabled();
  const hasOpenSubscription = subscription
    ? isOpenSubscription(subscription)
    : false;
  const canStartCheckout = isCheckoutEnabled && !hasOpenSubscription;
  const canOpenPortal = isConfigured && Boolean(subscription?.providerCustomerId);
  const checkoutReturn = firstValue(query.checkout);
  const returnNotice = checkoutReturnNotice(checkoutReturn);
  const reconciliationNotice = billingReconciliationNotice(
    firstValue(query.reconcile),
    subscription?.lastProviderSyncAt ?? null,
    account.timezone,
  );

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Plan &amp; billing</span>
          <h1>One focused workspace for an independent instructor.</h1>
          <p>
            Billing is handled by Stripe. Roadmap never receives or stores your full card
            number. You can review the exact amount and terms before any charge.
          </p>
        </div>
      </header>

      {returnNotice ? (
        <div className={styles.notice} role="status">
          <strong>{returnNotice.title}</strong>
          <span>{returnNotice.message}</span>
        </div>
      ) : null}

      {reconciliationNotice ? (
        <div className={styles.notice} role="status">
          <strong>{reconciliationNotice.title}</strong>
          <span>{reconciliationNotice.message}</span>
        </div>
      ) : null}

      {!isCheckoutEnabled ? (
        <div className={styles.notice} role="note">
          <strong>Price is not yet approved for a live charge.</strong>
          <span>
            Planning amounts remain pricing hypotheses. Checkout stays unavailable until the
            exact production price and policy are approved, configured, and explicitly enabled.
          </span>
        </div>
      ) : (
        <div className={styles.notice} role="note">
          <strong>Review the exact recurring amount before paying.</strong>
          <span>
            Stripe Checkout shows the configured price, cadence, tax treatment, and payment
            step. Returning from Checkout is not proof of payment; Stripe-confirmed state remains
            authoritative.
          </span>
        </div>
      )}

      <section className={styles.formCard}>
        <div className={styles.cardHeader}>
          <h2>Solo plan</h2>
          <span className={styles.status}>
            {subscription
              ? subscriptionStatusLabel(subscription.status)
              : "No subscription"}
          </span>
        </div>
        <p className={styles.muted}>
          One coach identity, coaching packages, private golfer roadmaps, living plan updates,
          controlled sharing, and account/data controls. Team accounts and coach-package
          transactions are outside this V1.
        </p>
        {subscription ? (
          <ul className={styles.list} aria-label="Current Stripe subscription state">
            <li>
              <div>
                <strong>Subscription status</strong>
                <span>
                  Latest provider-authoritative state synchronized from Stripe: {subscription.status.replace("_", " ")}.
                </span>
              </div>
            </li>
            <li>
              <div>
                <strong>Current billing period</strong>
                <span>{billingPeriodLabel(subscription, account.timezone)}</span>
              </div>
            </li>
            <li>
              <div>
                <strong>End-of-period cancellation</strong>
                <span>
                  {subscription.cancelAtPeriodEnd
                    ? "Scheduled according to the latest Stripe state."
                    : "Not scheduled according to the latest Stripe state."}
                </span>
              </div>
            </li>
          </ul>
        ) : (
          <p className={styles.muted}>
            No webhook-confirmed Stripe subscription is recorded for this account.
          </p>
        )}
        <div className={styles.actions} style={{ marginTop: "1.25rem" }}>
          <form action="/api/billing/checkout" method="post">
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={!canStartCheckout}
            >
              {hasOpenSubscription
                ? "Subscription already open"
                : "Review secure checkout"}
            </button>
          </form>
          <form action="/api/billing/portal" method="post">
            <button
              className={styles.secondaryButton}
              type="submit"
              disabled={!canOpenPortal}
            >
              Manage an existing subscription
            </button>
          </form>
          <form action="/api/billing/reconcile" method="post">
            <button
              className={styles.secondaryButton}
              type="submit"
              disabled={!isConfigured}
            >
              Refresh billing status
            </button>
          </form>
        </div>
        {isConfigured ? (
          <p className={styles.muted}>
            Refreshing reads only this account&apos;s existing Stripe references. It
            cannot start a charge, create a subscription, cancel service, or change a
            payment method.
          </p>
        ) : null}
        {!isConfigured ? (
          <p className={styles.muted}>No charge can be initiated from this environment.</p>
        ) : !isCheckoutEnabled && !hasOpenSubscription ? (
          <p className={styles.muted}>
            Billing is connected, but new Checkout sessions are disabled by release policy.
          </p>
        ) : !subscription?.providerCustomerId ? (
          <p className={styles.muted}>
            Billing management becomes available after Stripe creates and reports a customer.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function billingReconciliationNotice(
  value: string | null,
  lastProviderSyncAt: Date | null,
  timezone: string,
): {
  title: string;
  message: string;
} | null {
  switch (value) {
    case "refresh_review":
      return {
        title: "Review the saved billing status below.",
        message: lastProviderSyncAt
          ? `This account was last synchronized with Stripe ${formatBillingTimestamp(lastProviderSyncAt, timezone)}. This page notice is not proof of payment or a new subscription.`
          : "No synchronized subscription is saved for this account. This page notice is not proof of payment or a new subscription.",
      };
    case "refresh_in_progress":
      return {
        title: "A billing refresh is already in progress.",
        message:
          "Wait a few minutes, then refresh again. The saved billing status below remains available while the current check finishes.",
      };
    case "refresh_rate_limited":
      return {
        title: "Billing refresh is temporarily paused.",
        message:
          "Too many refreshes were requested. Wait before trying again; the saved billing status below has not been hidden.",
      };
    case "refresh_unavailable":
      return {
        title: "The billing refresh could not be confirmed.",
        message:
          "Review the saved billing status below and try again later. This message does not mean a payment or subscription change occurred.",
      };
    default:
      return null;
  }
}

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function checkoutReturnNotice(value: string | null): {
  title: string;
  message: string;
} | null {
  if (value === "complete") {
    return {
      title: "Checkout returned to this page.",
      message:
        "This redirect does not confirm payment or an active subscription. The status below changes only after a signed webhook or an explicit read-only Stripe refresh is safely applied.",
    };
  }
  if (value === "canceled") {
    return {
      title: "Checkout was canceled or closed.",
      message:
        "This return does not change billing state. The latest provider-authoritative Stripe state is shown below.",
    };
  }
  return null;
}

function subscriptionStatusLabel(status: SubscriptionStatus): string {
  const labels: Record<SubscriptionStatus, string> = {
    incomplete: "Setup incomplete",
    trialing: "Trialing",
    active: "Active",
    past_due: "Payment needs attention",
    paused: "Paused",
    canceled: "Canceled",
    unpaid: "Unpaid",
    ended: "Ended",
  };
  return labels[status];
}

function billingPeriodLabel(
  subscription: {
    currentPeriodStartsAt: Date | null;
    currentPeriodEndsAt: Date | null;
  },
  timezone: string,
): string {
  const start = subscription.currentPeriodStartsAt;
  const end = subscription.currentPeriodEndsAt;
  if (start && end) {
    return `${formatBillingDate(start, timezone)} to ${formatBillingDate(end, timezone)}.`;
  }
  if (end) return `Ends ${formatBillingDate(end, timezone)}.`;
  if (start) return `Started ${formatBillingDate(start, timezone)}.`;
  return "No current period has been reported by Stripe.";
}

function formatBillingDate(value: Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeZone: timezone,
  };
  try {
    return new Intl.DateTimeFormat("en-CA", options).format(value);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      ...options,
      timeZone: "UTC",
    }).format(value);
  }
}

function formatBillingTimestamp(value: Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  };
  try {
    return new Intl.DateTimeFormat("en-CA", options).format(value);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      ...options,
      timeZone: "UTC",
    }).format(value);
  }
}
