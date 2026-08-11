import {
  getSubscriptionForAccount,
  isOpenSubscription,
  type SubscriptionStatus,
} from "@/lib/billing-repository";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePageIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { billingConfigured, checkoutEnabled } from "@/lib/stripe";
import { configuredBillingCommercialPolicy } from "@/lib/billing-commercial-policy";
import { loadCommercialActivationReadiness } from "@/lib/commercial-activation";
import styles from "../workspace.module.css";

export const metadata: Metadata = {
  title: "Plan and billing | Roadmap",
};

export const dynamic = "force-dynamic";

type BillingPageProps = {
  searchParams: Promise<{
    checkout?: string | string[];
    portal?: string | string[];
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
  const commercialPolicy = configuredBillingCommercialPolicy();
  const commercialActivation = loadCommercialActivationReadiness();
  const isConfigured = billingConfigured();
  const isCheckoutEnabled = checkoutEnabled();
  const hasOpenSubscription = subscription
    ? isOpenSubscription(subscription)
    : false;
  const canStartCheckout = isCheckoutEnabled && !hasOpenSubscription;
  const canOpenPortal = isConfigured && Boolean(subscription?.providerCustomerId);
  const checkoutReturn = firstValue(query.checkout);
  const returnNotice = checkoutReturnNotice(checkoutReturn);
  const portalNotice = billingPortalNotice(firstValue(query.portal));
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

      {portalNotice ? (
        <div className={styles.notice} role="status">
          <strong>{portalNotice.title}</strong>
          <span>{portalNotice.message}</span>
        </div>
      ) : null}

      {!commercialPolicy ? (
        <div className={styles.notice} role="note">
          <strong>Price is not yet approved for a live charge.</strong>
          <span>
            Planning amounts remain pricing hypotheses. Checkout stays unavailable until the
            exact production price and policy are approved, configured, and explicitly enabled.
          </span>
        </div>
      ) : !isCheckoutEnabled ? (
        <div className={styles.notice} role="note">
          <strong>The exact offer is configured, but Checkout remains off.</strong>
          <span>
            No charge can start until the identity, Stripe, entitlement, and controlled
            activation checks below are complete and Checkout is explicitly enabled.
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
          controlled sharing, and account/data controls. This is the instructor&apos;s Roadmap
          SaaS subscription; it never represents a golfer&apos;s coaching-package purchase.
        </p>
        <div className={styles.notice} role="status">
          <strong>{subscriptionStateGuidance(subscription?.status ?? null).title}</strong>
          <span>{subscriptionStateGuidance(subscription?.status ?? null).message}</span>
        </div>
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
            {subscription.unitAmountMinor !== null && subscription.currency ? (
              <li>
                <div>
                  <strong>Provider-recorded recurring price</strong>
                  <span>
                    {formatProviderPrice(
                      subscription.unitAmountMinor,
                      subscription.currency,
                      subscription.billingInterval,
                    )}
                  </span>
                </div>
              </li>
            ) : null}
            {subscription.status === "trialing" ? (
              <li>
                <div>
                  <strong>Trial window</strong>
                  <span>
                    {subscription.trialEndsAt
                      ? `Stripe currently reports a trial end of ${formatBillingDate(subscription.trialEndsAt, account.timezone)}.`
                      : "Stripe has not reported a trial end date."}
                  </span>
                </div>
              </li>
            ) : null}
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

      {commercialPolicy ? (
        <section className={styles.formCard} style={{ marginTop: "1rem" }}>
          <div className={styles.cardHeader}>
            <h2>Configured Roadmap Solo terms</h2>
            <span className={styles.status}>{commercialPolicy.providerMode} mode</span>
          </div>
          <p className={styles.muted}>
            {formatCommercialPrice(commercialPolicy.amountMinor, commercialPolicy.billingInterval)}.
            These are Roadmap SaaS terms, not the instructor&apos;s golfer-facing coaching-package terms.
          </p>
          <ul className={styles.list} aria-label="Exact configured Roadmap commercial terms">
            {[
              ["Trial", commercialPolicy.trialTerms],
              ["Cancellation", commercialPolicy.cancellationTerms],
              ["Pause or resume", commercialPolicy.pauseResumeTerms],
              ["Tax", commercialPolicy.taxTerms],
              ["Refunds", commercialPolicy.refundTerms],
              ["Failed payment", commercialPolicy.failedPaymentTerms],
              ["Data after access ends", commercialPolicy.dataAfterEndTerms],
              ["Support", commercialPolicy.supportContact],
            ].map(([label, value]) => (
              <li key={label}>
                <div>
                  <strong>{label}</strong>
                  <span>{value}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.muted}>
            Policy {commercialPolicy.version} · approval reference {commercialPolicy.approvalReference}.
            Stripe Checkout remains the final provider display before any paid confirmation.
          </p>
        </section>
      ) : null}

      <section className={styles.formCard} style={{ marginTop: "1rem" }}>
        <div className={styles.cardHeader}>
          <h2>Commercial activation checklist</h2>
          <span className={styles.status}>
            {commercialActivation.status === "configuration_ready_external_activation_pending"
              ? "External activation pending"
              : "Controlled evidence required"}
          </span>
        </div>
        <p className={styles.muted}>
          <strong>
            {commercialActivation.status === "configuration_ready_external_activation_pending"
              ? "CONFIGURATION READY — EXTERNAL ACTIVATION PENDING."
              : "CONFIGURATION SUPPLIED — CONTROLLED EVIDENCE REQUIRED."}
          </strong>{" "}
          The candidate fails closed when an owner decision, provider account, or secret is
          absent. This checklist reports readiness categories only; it never displays secret
          values.
        </p>
        <ul className={styles.list} aria-label="Commercial activation dependencies">
          {commercialActivation.checks.map((check) => (
            <li key={check.id}>
              <div>
                <strong>{check.label}</strong>
                <span>{check.detail}</span>
              </div>
              <span className={styles.status}>{check.ready ? "Configured" : "Pending"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.formCard} style={{ marginTop: "1rem" }}>
        <div className={styles.cardHeader}>
          <h2>Roadmap billing and coaching packages are separate</h2>
        </div>
        <ul className={styles.list} aria-label="Separate payment paths">
          <li>
            <div>
              <strong>Roadmap SaaS subscription</strong>
              <span>
                Pays for this instructor workspace. Stripe Checkout, signed webhooks,
                reconciliation, and the Stripe Portal control this account state.
              </span>
            </div>
          </li>
          <li>
            <div>
              <strong>Your golfer coaching package</strong>
              <span>
                Uses the external booking, purchase, or contact link you choose. Roadmap does
                not charge the golfer or infer that an external click became a sale.
              </span>
            </div>
            <Link className={styles.textLink} href="/app/packages">
              Review coaching packages
            </Link>
          </li>
        </ul>
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
  if (value === "review_required") {
    return {
      title: "Checkout did not open.",
      message:
        "Review the saved billing status below before trying again. Another billing operation or provider-confirmed state may need to finish; this notice does not prove a charge or subscription change.",
    };
  }
  if (value === "rate_limited") {
    return {
      title: "Checkout is temporarily paused.",
      message:
        "Too many Checkout requests were made. Wait before trying again; no new Checkout should be inferred from this notice.",
    };
  }
  if (value === "unavailable") {
    return {
      title: "Checkout could not be opened.",
      message:
        "Review the saved billing status below and try again later. This notice is not proof that a charge or subscription was created.",
    };
  }
  return null;
}

function billingPortalNotice(value: string | null): {
  title: string;
  message: string;
} | null {
  if (value === "not_available") {
    return {
      title: "Billing management did not open.",
      message:
        "Review the saved billing status below. A billing profile or another provider state may not be available yet; no subscription change is implied.",
    };
  }
  if (value === "rate_limited") {
    return {
      title: "Billing management is temporarily paused.",
      message:
        "Too many billing-management requests were made. Wait before trying again; the saved billing status remains unchanged by this notice.",
    };
  }
  if (value === "unavailable") {
    return {
      title: "Billing management could not be opened.",
      message:
        "Review the saved billing status below and try again later. This notice does not claim a payment-method or subscription change.",
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

function subscriptionStateGuidance(status: SubscriptionStatus | null): {
  title: string;
  message: string;
} {
  const guidance: Record<SubscriptionStatus, { title: string; message: string }> = {
    incomplete: {
      title: "Subscription setup is incomplete.",
      message: "No active access is assumed. Open Stripe billing management when available or start a new Checkout only after the provider state is resolved.",
    },
    trialing: {
      title: "Stripe reports a trialing subscription.",
      message: "Workspace access and the transition after trial follow the exact configured entitlement and trial terms shown on this page.",
    },
    active: {
      title: "Stripe reports an active subscription.",
      message: "The period, price, and cancellation state below are the latest provider-authoritative projection saved for this account.",
    },
    past_due: {
      title: "Payment needs attention.",
      message: "Use Stripe billing management to review the payment method. Access consequences follow the configured failed-payment and entitlement policy; this page does not infer recovery.",
    },
    paused: {
      title: "Stripe reports the subscription as paused.",
      message: "Access and resumption follow the exact configured pause and entitlement policy. Use Stripe billing management when available.",
    },
    canceled: {
      title: "Stripe reports a canceled subscription.",
      message: "No future access or charge is inferred. Review the provider period and configured cancellation/data terms before starting another Checkout.",
    },
    unpaid: {
      title: "Stripe reports the subscription as unpaid.",
      message: "No payment recovery is assumed. Use Stripe billing management and review the configured failed-payment and access consequences.",
    },
    ended: {
      title: "The prior subscription has ended.",
      message: "No current paid access is assumed. Data availability and a new Checkout follow the configured ended-account policy.",
    },
  };
  return status
    ? guidance[status]
    : {
        title: "No Stripe subscription is recorded.",
        message: "No paid access or charge is assumed. Checkout remains unavailable unless every configured commercial dependency is ready.",
      };
}

function formatCommercialPrice(
  amountMinor: number,
  interval: "month" | "year",
): string {
  return `${new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    currencyDisplay: "code",
  }).format(amountMinor / 100)} every ${interval}`;
}

function formatProviderPrice(
  amountMinor: number,
  currency: string,
  interval: string | null,
): string {
  let amount: string;
  try {
    amount = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency.toUpperCase(),
      currencyDisplay: "code",
    }).format(amountMinor / 100);
  } catch {
    amount = `${currency.toUpperCase()} ${(amountMinor / 100).toFixed(2)}`;
  }
  return interval ? `${amount} every ${interval}.` : `${amount}.`;
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
