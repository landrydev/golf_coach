import {
  CheckoutRepositoryError,
  expireStrandedCheckoutReservation,
  expireCheckoutAttemptAfterProviderConfirmation,
  finalizeCheckoutAttemptOpen,
  getCanonicalBillingCustomer,
  markCheckoutAttemptCompletedPendingSync,
  recordCheckoutAttemptError,
  reserveOrLoadCheckoutAttempt,
  type CheckoutAttemptRecord,
} from "@/lib/checkout-repository";
import {
  acquireBillingAccountOperationLease,
  assertBillingAccountOperationLease,
  BillingAccountOperationLeaseError,
  releaseBillingAccountOperationLeaseBestEffort,
  renewBillingAccountOperationLease,
  type BillingAccountOperationLeaseClaim,
} from "@/lib/billing-account-operation-lease";
import {
  getSubscriptionForAccount,
  isOpenSubscription,
} from "@/lib/billing-repository";
import { assertSameOrigin, errorResponse, RequestError } from "@/lib/http";
import { requireApiIdentity } from "@/lib/identity";
import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { ABUSE_LIMITS, enforceAbuseLimit } from "@/lib/rate-limit";
import {
  checkoutConfiguration,
  checkoutEnabled,
  createCheckoutSession,
  retrieveCustomerSubscriptionsForCheckout,
  retrieveCheckoutSession,
  validateCheckoutSessionForAttempt,
} from "@/lib/stripe";
import {
  applicationOrigin,
  billingRedirect,
  hostedBillingUrl,
  requestId,
} from "../_shared";

export async function POST(request: Request) {
  let operationLease: BillingAccountOperationLeaseClaim | null = null;
  try {
    assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return authentication.response;
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    await enforceAbuseLimit(ABUSE_LIMITS.billingCheckoutAccount, account.id);

    const configuration = checkoutConfiguration();
    if (!checkoutEnabled() || !configuration) {
      throw new RequestError(
        503,
        "billing_not_configured",
        "Billing is not available yet. No charge was made.",
      );
    }

    operationLease = await acquireCheckoutOperationLease(account.id);
    await expireStrandedCheckoutReservation({
      accountId: account.id,
      operationLease,
      requestId: requestId(request),
    });
    await assertNoOpenSubscription(account.id);

    const origin = applicationOrigin(request);
    const customer = await getCanonicalBillingCustomer(account.id);
    if (customer) {
      operationLease = await renewBillingAccountOperationLease(operationLease);
      const providerSubscriptions =
        await retrieveCustomerSubscriptionsForCheckout({
          accountId: account.id,
          customerId: customer.providerCustomerId,
        });
      await assertBillingAccountOperationLease(operationLease);
      if (
        providerSubscriptions.some(
          ({ status }) =>
            status !== "canceled" && status !== "incomplete_expired",
        )
      ) {
        throw new RequestError(
          409,
          "subscription_already_open",
          "This billing customer already has an open provider subscription. No new charge was started.",
        );
      }
    }
    const reserve = () => {
      const currentOperationLease = operationLease;
      if (!currentOperationLease) {
        throw new BillingAccountOperationLeaseError(
          "billing_operation_lease_lost",
          "The billing operation lease is no longer owned by this worker.",
        );
      }
      const now = new Date();
      const expiresAtSeconds =
        Math.floor(now.getTime() / 1_000) +
        configuration.sessionLifetimeSeconds;
      return reserveOrLoadCheckoutAttempt({
        accountId: account.id,
        providerPriceId: configuration.priceId,
        applicationOrigin: origin,
        providerCustomerId: customer?.providerCustomerId ?? null,
        customerEmail: account.primaryEmail,
        providerExpiresAt: new Date(expiresAtSeconds * 1_000),
        operationLease: currentOperationLease,
        now,
      });
    };

    let reservation = await reserve();
    for (let pass = 0; pass < 2; pass += 1) {
      const attempt = reservation.attempt;
      if (["completed_pending_sync", "quarantined"].includes(attempt.state)) {
        throw new RequestError(
          503,
          "checkout_reconciliation_required",
          "Checkout is awaiting billing reconciliation. No new charge was started.",
        );
      }
      // A reserved row has no provider object to reconcile. Never create one
      // from an obsolete frozen price after checkout policy changes.
      if (
        attempt.state === "reserved" &&
        attempt.providerPriceId !== configuration.priceId
      ) {
        throw new RequestError(
          409,
          "checkout_policy_changed",
          "Checkout configuration changed while an earlier attempt remained active. No new charge was started.",
        );
      }

      // Close the practical gap between reservation and provider access. The
      // repository also checks atomically on insert and before returning an
      // existing blocker; this fresh read prevents a known open subscription
      // from reaching another Stripe call or hosted-session redirect.
      await assertNoOpenSubscription(account.id);

      try {
        operationLease = await renewBillingAccountOperationLease(operationLease);
        const providerSession =
          attempt.state === "open" && attempt.providerSessionId
            ? await retrieveCheckoutSession(attempt.providerSessionId)
            : await createCheckoutSession({
                accountId: attempt.accountId,
                attemptId: attempt.id,
                idempotencyKey: attempt.idempotencyKey,
                priceId: attempt.providerPriceId,
                email: attempt.customerEmail,
                customerId: attempt.providerCustomerId,
                successUrl: `${attempt.applicationOrigin}/app/billing?checkout=complete`,
                cancelUrl: `${attempt.applicationOrigin}/app/billing?checkout=canceled`,
                expiresAtSeconds: Math.floor(
                  attempt.providerExpiresAt.getTime() / 1_000,
                ),
              });
        await assertBillingAccountOperationLease(operationLease);
        const validated = validateCheckoutSessionForAttempt(
          providerSession,
          attempt,
        );

        if (validated.status === "expired") {
          const expiration =
            await expireCheckoutAttemptAfterProviderConfirmation({
              accountId: account.id,
              attemptId: attempt.id,
              providerSessionId: validated.id,
              providerCreatedAt: validated.createdAt,
              operationLease,
              now: new Date(),
            });
          if (
            ["completed_pending_sync", "completed"].includes(
              expiration.attempt.state,
            )
          ) {
            throw new RequestError(
              409,
              "checkout_pending_sync",
              "Checkout completed and is awaiting signed billing confirmation. No new charge was started.",
            );
          }
          if (expiration.attempt.state === "expired" && pass === 0) {
            reservation = await reserve();
            continue;
          }
          throw new RequestError(
            503,
            "checkout_attempt_unavailable",
            "Checkout is temporarily unavailable. No new charge was started.",
          );
        }

        if (validated.status === "complete") {
          await markCheckoutAttemptCompletedPendingSync({
            accountId: account.id,
            attemptId: attempt.id,
            providerSessionId: validated.id,
            providerCreatedAt: validated.createdAt,
            operationLease,
            now: new Date(),
          });
          throw new RequestError(
            409,
            "checkout_pending_sync",
            "Checkout completed and is awaiting signed billing confirmation. No new charge was started.",
          );
        }

        // Open sessions are retrieved first so provider-confirmed completion
        // or expiry can still reconcile them. A still-open session for an old
        // price remains blocking but is never returned to the browser.
        if (attempt.providerPriceId !== configuration.priceId) {
          throw new RequestError(
            409,
            "checkout_policy_changed",
            "Checkout configuration changed while an earlier attempt remained active. No new charge was started.",
          );
        }

        if (attempt.state === "reserved") {
          const finalization = await finalizeCheckoutAttemptOpen({
            accountId: account.id,
            attemptId: attempt.id,
            providerSessionId: validated.id,
            providerCreatedAt: validated.createdAt,
            operationLease,
            requestId: requestId(request),
          });
          if (
            ["completed_pending_sync", "completed"].includes(
              finalization.attempt.state,
            )
          ) {
            throw new RequestError(
              409,
              "checkout_pending_sync",
              "Checkout completed and is awaiting signed billing confirmation. No new charge was started.",
            );
          }
        }

        if (!validated.url) {
          throw new RequestError(
            502,
            "billing_provider_response_invalid",
            "Billing is temporarily unavailable. No charge was made.",
          );
        }
        await assertNoOpenSubscription(account.id);
        await assertBillingAccountOperationLease(operationLease);
        return billingRedirect(hostedBillingUrl(validated.url));
      } catch (error) {
        await recordAttemptErrorBestEffort(
          attempt,
          safeAttemptErrorCode(error),
        );
        throw error;
      }
    }

    throw new RequestError(
      503,
      "checkout_attempt_unavailable",
      "Checkout is temporarily unavailable. No new charge was started.",
    );
  } catch (error) {
    return errorResponse(asRequestError(error));
  } finally {
    if (operationLease) {
      await releaseBillingAccountOperationLeaseBestEffort(operationLease);
    }
  }
}

async function acquireCheckoutOperationLease(
  accountId: string,
): Promise<BillingAccountOperationLeaseClaim> {
  // Preserve idempotent double-submit behavior when the first Checkout call
  // completes quickly, while keeping contention bounded and retryable. A
  // reconciliation that is waiting on Stripe continues to fail Checkout
  // closed after this short budget rather than allowing a stale projection to
  // create another provider session.
  const retryDelaysMs = [0, 20, 40, 80, 120] as const;
  for (const delayMs of retryDelaysMs) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const claim = await acquireBillingAccountOperationLease({
      accountId,
      operation: "checkout",
    });
    if (claim) return claim;
  }
  throw new RequestError(
    409,
    "billing_operation_in_progress",
    "Billing synchronization or Checkout is already in progress. No new charge was started.",
    { "Retry-After": "1" },
  );
}

async function assertNoOpenSubscription(accountId: string): Promise<void> {
  const subscription = await getSubscriptionForAccount(accountId);
  if (subscription && isOpenSubscription(subscription)) {
    throw new RequestError(
      409,
      "subscription_already_open",
      "This account already has an open subscription. Use billing management instead.",
    );
  }
}

async function recordAttemptErrorBestEffort(
  attempt: CheckoutAttemptRecord,
  errorCode: string,
): Promise<void> {
  try {
    await recordCheckoutAttemptError({
      accountId: attempt.accountId,
      attemptId: attempt.id,
      errorCode,
    });
  } catch {
    console.error("Checkout attempt error could not be recorded", {
      attemptId: attempt.id,
      errorCode,
    });
  }
}

function safeAttemptErrorCode(error: unknown): string {
  if (error instanceof RequestError && /^[a-z][a-z0-9_]{0,63}$/.test(error.code)) {
    return error.code;
  }
  if (
    error instanceof CheckoutRepositoryError &&
    /^[a-z][a-z0-9_]{0,63}$/.test(error.code)
  ) {
    return error.code;
  }
  if (
    error instanceof BillingAccountOperationLeaseError &&
    /^[a-z][a-z0-9_]{0,63}$/.test(error.code)
  ) {
    return error.code;
  }
  return "checkout_attempt_failed";
}

function asRequestError(error: unknown): unknown {
  if (error instanceof BillingAccountOperationLeaseError) {
    const status = error.code === "billing_operation_lease_lost" ? 409 : 503;
    return new RequestError(status, error.code, error.safeMessage, {
      "Retry-After": "1",
    });
  }
  if (!(error instanceof CheckoutRepositoryError)) return error;
  const status = error.code === "subscription_already_open" ? 409 : 503;
  return new RequestError(status, error.code, error.safeMessage);
}
