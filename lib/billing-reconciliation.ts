import {
  applyStripeSubscriptionReconciliation,
  BillingRepositoryError,
  getSubscriptionForAccount,
  recordBillingReconciliationCheck,
  reserveStripeSubscriptionProjectionGeneration,
} from "@/lib/billing-repository";
import {
  BillingReconciliationRepositoryError,
  claimBillingReconciliation,
  completeBillingReconciliationCheck,
  failBillingReconciliation,
  type BillingReconciliationClaim,
} from "@/lib/billing-reconciliation-repository";
import {
  acquireBillingAccountOperationLease,
  assertBillingAccountOperationLease,
  BillingAccountOperationLeaseError,
  releaseBillingAccountOperationLeaseBestEffort,
  renewBillingAccountOperationLease,
  type BillingAccountOperationLeaseClaim,
} from "@/lib/billing-account-operation-lease";
import {
  CheckoutRepositoryError,
  expireCheckoutAttemptAfterProviderConfirmation,
  getBlockingCheckoutAttemptForAccount,
  markCheckoutAttemptCompletedPendingSync,
  recordCheckoutAttemptError,
  requireCheckoutAttemptForCompletion,
  type CheckoutAttemptRecord,
} from "@/lib/checkout-repository";
import { RequestError } from "@/lib/http";
import {
  billingConfigured,
  retrieveCheckoutSession,
  retrieveSubscription,
  validateCheckoutSessionForAttempt,
} from "@/lib/stripe";
import {
  parseStripeSubscriptionForReconciliation,
  StripeSubscriptionProjectionError,
} from "@/lib/stripe-subscription";

export type BillingReconciliationResult = Readonly<{
  result:
    | "no_local_billing_state"
    | "checkout_reserved"
    | "checkout_open"
    | "checkout_expired"
    | "subscription_reconciled";
  synchronized: boolean;
  checkoutAttemptCompleted: boolean;
}>;

/**
 * Reconcile only the authenticated account's existing local provider
 * references. This operation never creates a Checkout Session, customer,
 * subscription, charge, refund, cancellation, or Portal session.
 */
export async function reconcileBillingAccount(input: {
  accountId: string;
  requestId?: string | null;
  automatic?: boolean;
}): Promise<BillingReconciliationResult> {
  if (!billingConfigured()) {
    throw new RequestError(
      503,
      "billing_not_configured",
      "Billing synchronization is not available yet.",
    );
  }

  let operationLease: BillingAccountOperationLeaseClaim | null = null;
  let attempt: CheckoutAttemptRecord | null = null;
  let reconciliationClaim: BillingReconciliationClaim | null = null;

  try {
    operationLease = await acquireBillingAccountOperationLease({
      accountId: input.accountId,
      operation: "reconciliation",
    });
    if (!operationLease) {
      throw billingOperationInProgress();
    }

    // The account-wide operation lease is acquired before either local state
    // read, so Checkout creation and reconciliation cannot independently
    // decide that it is safe to call Stripe for the same tenant.
    attempt = await getBlockingCheckoutAttemptForAccount(input.accountId);
    const subscription = await getSubscriptionForAccount(input.accountId);
    let providerSubscriptionId = subscription?.providerSubscriptionId ?? null;
    let expectedCustomerId = subscription?.providerCustomerId ?? null;
    let expectedPriceId = subscription?.providerPriceId ?? null;
    let checkoutCompletion: {
      attemptId: string;
      providerSessionId: string;
      providerCreatedAt: Date | null;
    } | null = null;

    if (attempt) {
      if (!attempt.providerSessionId) {
        return checked(input, {
          result: "checkout_reserved",
          synchronized: false,
          checkoutAttemptCompleted: false,
        });
      }

      reconciliationClaim = await claimBillingReconciliation({
        accountId: input.accountId,
        target: {
          kind: "checkout_attempt",
          checkoutAttemptId: attempt.id,
        },
      });
      if (!reconciliationClaim) {
        throw reconciliationInProgress();
      }

      operationLease = await renewBillingAccountOperationLease(operationLease);
      const session = validateCheckoutSessionForAttempt(
        await retrieveCheckoutSession(attempt.providerSessionId),
        attempt,
      );
      await assertBillingAccountOperationLease(operationLease);
      if (session.status === "expired") {
        const expiration = await expireCheckoutAttemptAfterProviderConfirmation({
          accountId: input.accountId,
          attemptId: attempt.id,
          providerSessionId: session.id,
          providerCreatedAt: session.createdAt,
          operationLease,
        });
        if (expiration.attempt.state === "expired") {
          await completeBillingReconciliationCheck({
            claim: reconciliationClaim,
            operationLease,
          });
          reconciliationClaim = null;
          return checked(input, {
            result: "checkout_expired",
            synchronized: true,
            checkoutAttemptCompleted: false,
          });
        }
        attempt = expiration.attempt;
        await completeBillingReconciliationCheck({
          claim: reconciliationClaim,
          operationLease,
        });
        reconciliationClaim = null;
      } else if (session.status === "open") {
        await completeBillingReconciliationCheck({
          claim: reconciliationClaim,
          operationLease,
        });
        reconciliationClaim = null;
        return checked(input, {
          result: "checkout_open",
          synchronized: false,
          checkoutAttemptCompleted: false,
        });
      } else {
        if (!session.providerCustomerId || !session.providerSubscriptionId) {
          throw new RequestError(
            502,
            "billing_provider_response_invalid",
            "Billing synchronization received an incomplete provider response.",
          );
        }
        const pending = await markCheckoutAttemptCompletedPendingSync({
          accountId: input.accountId,
          attemptId: attempt.id,
          providerSessionId: session.id,
          providerCreatedAt: session.createdAt,
          operationLease,
        });
        attempt = pending.attempt;
        providerSubscriptionId = session.providerSubscriptionId;
        expectedCustomerId = session.providerCustomerId;
        expectedPriceId = attempt.providerPriceId;
        checkoutCompletion = {
          attemptId: attempt.id,
          providerSessionId: session.id,
          providerCreatedAt: session.createdAt,
        };
      }
    }

    if (!providerSubscriptionId) {
      return checked(input, {
        result: "no_local_billing_state",
        synchronized: false,
        checkoutAttemptCompleted: false,
      });
    }

    if (!reconciliationClaim) {
      if (!subscription) {
        throw new BillingRepositoryError(
          "billing_reconciliation_target_missing",
          "The local billing reconciliation target is unavailable.",
        );
      }
      reconciliationClaim = await claimBillingReconciliation({
        accountId: input.accountId,
        target: {
          kind: "subscription",
          subscriptionId: subscription.id,
        },
      });
      if (!reconciliationClaim) {
        throw reconciliationInProgress();
      }
    }

    // Reserve before the provider read. A newer webhook or reconciliation can
    // therefore fence this response out of the terminal D1 batch.
    const projectionGeneration =
      await reserveStripeSubscriptionProjectionGeneration(
        providerSubscriptionId,
      );
    operationLease = await renewBillingAccountOperationLease(operationLease);
    const providerSubscription = await retrieveSubscription(providerSubscriptionId);
    const projection = parseStripeSubscriptionForReconciliation({
      subscription: providerSubscription,
      accountId: input.accountId,
      expectedSubscriptionId: providerSubscriptionId,
      expectedCustomerId,
      expectedPriceId,
      expectedCheckoutAttemptId: checkoutCompletion?.attemptId ?? null,
    });
    await assertBillingAccountOperationLease(operationLease);

    if (checkoutCompletion) {
      await requireCheckoutAttemptForCompletion({
        accountId: input.accountId,
        attemptId: checkoutCompletion.attemptId,
        providerSessionId: checkoutCompletion.providerSessionId,
        providerCustomerId: projection.providerCustomerId,
        providerPriceId: projection.providerPriceId,
      });
    }

    await applyStripeSubscriptionReconciliation({
      claim: reconciliationClaim,
      operationLease,
      projection,
      projectionGeneration,
      reconciledAt: new Date(),
      checkoutAttempt: checkoutCompletion,
      requestId: input.requestId,
    });
    // The atomic terminal batch is the commit proof. Do not perform a
    // fallible verification read after it: a read outage must never turn an
    // already-committed success into a reported and audited failure.
    return {
      result: "subscription_reconciled",
      synchronized: true,
      checkoutAttemptCompleted: Boolean(checkoutCompletion),
    };
  } catch (error) {
    if (attempt) {
      await recordAttemptErrorBestEffort(attempt.accountId, attempt.id, error);
    }
    if (reconciliationClaim && operationLease) {
      await failReconciliationBestEffort(
        reconciliationClaim,
        operationLease,
        error,
        input.automatic === true,
      );
    }
    await recordFailureBestEffort(input, error);
    throw asRequestError(error);
  } finally {
    if (operationLease) {
      await releaseBillingAccountOperationLeaseBestEffort(operationLease);
    }
  }
}

function billingOperationInProgress(): RequestError {
  return new RequestError(
    409,
    "billing_operation_in_progress",
    "Another billing operation is already in progress. Try again shortly.",
    { "Retry-After": "1" },
  );
}

function reconciliationInProgress(): RequestError {
  return new RequestError(
    409,
    "billing_reconciliation_in_progress",
    "Billing synchronization is already in progress. Try again shortly.",
    { "Retry-After": "60" },
  );
}

async function failReconciliationBestEffort(
  claim: BillingReconciliationClaim,
  operationLease: BillingAccountOperationLeaseClaim,
  error: unknown,
  automatic: boolean,
): Promise<void> {
  try {
    await failBillingReconciliation({
      claim,
      operationLease,
      errorCode: safeErrorCode(error),
      errorMessage: safeErrorMessage(error),
      automatic,
    });
  } catch {
    console.error("Billing reconciliation target failure could not be recorded", {
      reconciliationId: claim.reconciliationId,
      errorCode: safeErrorCode(error),
    });
  }
}

async function checked(
  input: { accountId: string; requestId?: string | null },
  result: BillingReconciliationResult,
): Promise<BillingReconciliationResult> {
  try {
    await recordBillingReconciliationCheck({
      accountId: input.accountId,
      result: result.result,
      outcome: "success",
      requestId: input.requestId,
    });
  } catch {
    // A supplemental observation must not reverse an already-committed
    // reconciliation target transition or turn a truthful result into a
    // failure audit.
    console.error("Billing reconciliation success could not be audited", {
      accountId: input.accountId,
      result: result.result,
    });
  }
  return result;
}

async function recordFailureBestEffort(
  input: { accountId: string; requestId?: string | null },
  error: unknown,
): Promise<void> {
  try {
    await recordBillingReconciliationCheck({
      accountId: input.accountId,
      result: "failed",
      outcome: "failure",
      errorCode: safeErrorCode(error),
      requestId: input.requestId,
    });
  } catch {
    console.error("Billing reconciliation failure could not be audited", {
      accountId: input.accountId,
      errorCode: safeErrorCode(error),
    });
  }
}

async function recordAttemptErrorBestEffort(
  accountId: string,
  attemptId: string,
  error: unknown,
): Promise<void> {
  try {
    await recordCheckoutAttemptError({
      accountId,
      attemptId,
      errorCode: safeErrorCode(error),
    });
  } catch {
    console.error("Checkout reconciliation error could not be recorded", {
      attemptId,
      errorCode: safeErrorCode(error),
    });
  }
}

function safeErrorCode(error: unknown): string {
  const code =
    error instanceof RequestError ||
    error instanceof BillingRepositoryError ||
    error instanceof BillingReconciliationRepositoryError ||
    error instanceof BillingAccountOperationLeaseError ||
    error instanceof CheckoutRepositoryError ||
    error instanceof StripeSubscriptionProjectionError
      ? error.code
      : "billing_reconciliation_failed";
  return /^[a-z][a-z0-9_]{0,63}$/.test(code)
    ? code
    : "billing_reconciliation_failed";
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof RequestError) return boundedMessage(error.message);
  if (error instanceof BillingRepositoryError) {
    return boundedMessage(error.safeMessage);
  }
  if (error instanceof BillingReconciliationRepositoryError) {
    return boundedMessage(error.safeMessage);
  }
  if (error instanceof BillingAccountOperationLeaseError) {
    return boundedMessage(error.safeMessage);
  }
  if (error instanceof CheckoutRepositoryError) {
    return boundedMessage(error.safeMessage);
  }
  if (error instanceof StripeSubscriptionProjectionError) {
    return boundedMessage(error.safeMessage);
  }
  return "Billing synchronization could not be completed.";
}

function boundedMessage(value: string): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return normalized.slice(0, 500) || "Billing synchronization failed.";
}

function asRequestError(error: unknown): RequestError {
  if (error instanceof RequestError) return error;
  if (error instanceof StripeSubscriptionProjectionError) {
    return new RequestError(502, error.code, error.safeMessage);
  }
  if (error instanceof BillingRepositoryError) {
    return new RequestError(503, error.code, error.safeMessage);
  }
  if (error instanceof BillingReconciliationRepositoryError) {
    const status =
      error.code === "billing_reconciliation_target_not_found" ? 404 : 503;
    return new RequestError(status, error.code, error.safeMessage);
  }
  if (error instanceof BillingAccountOperationLeaseError) {
    if (error.code === "billing_operation_lease_lost") {
      return new RequestError(
        409,
        error.code,
        error.safeMessage,
        { "Retry-After": "1" },
      );
    }
    return new RequestError(503, error.code, error.safeMessage);
  }
  if (error instanceof CheckoutRepositoryError) {
    return new RequestError(503, error.code, error.safeMessage);
  }
  return new RequestError(
    503,
    "billing_reconciliation_failed",
    "Billing synchronization could not be completed.",
  );
}
