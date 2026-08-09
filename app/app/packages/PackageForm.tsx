"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clearKeyedAttempt,
  keyedAttemptBlockedMessage,
  keyedAttemptMutationDisposition,
  keyedAttemptReceiptBlockedMessage,
  loadKeyedAttempt,
  matchesCanonicalKeyedAttemptExternalUrl,
  matchesCanonicalKeyedAttemptOptionalText,
  matchesCanonicalKeyedAttemptText,
  persistKeyedAttempt,
  restoreFormControlValues,
  type KeyedAttemptRecord,
  type RestoredFormValue,
} from "@/lib/client-keyed-attempt-recovery";
import {
  activateClientRequestScope,
  beginOwnedClientRequest,
  createClientRequestOwnershipState,
  isClientRequestScopeActive,
  ownsClientRequest,
  retireClientRequestScope,
} from "@/lib/client-request-ownership";
import {
  clientMutationErrorMessage,
  isClientMutationOutcomeUnknown,
  requestClientMutation,
  requireClientMutationJson,
} from "@/lib/client-mutation-recovery";
import styles from "../workspace.module.css";

const ERROR_SUMMARY_ID = "package-form-error-summary";

export function PackageForm({ recoveryScope }: { recoveryScope: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const pendingAttemptRef = useRef<KeyedAttemptRecord | null>(null);
  const verifiedRecoveryScopeRef = useRef<string | null>(null);
  const requestOwnershipRef = useRef(createClientRequestOwnershipState());
  const [state, setState] = useState<
    "checking" | "idle" | "saving" | "recovery" | "blocked" | "saved" | "error"
  >("checking");
  const [message, setMessage] = useState("");
  const [restoredValues, setRestoredValues] = useState<
    Record<string, RestoredFormValue> | null
  >(null);

  useEffect(() => {
    const ownership = requestOwnershipRef.current;
    const scopeGeneration = activateClientRequestScope(
      ownership,
      recoveryScope,
    );
    const timeout = window.setTimeout(() => {
      if (
        !isClientRequestScopeActive(
          ownership,
          recoveryScope,
          scopeGeneration,
        )
      ) {
        return;
      }
      verifiedRecoveryScopeRef.current = recoveryScope;
      pendingAttemptRef.current = null;
      const loaded = loadKeyedAttempt(recoveryScope, "package_create");
      if (loaded.kind === "empty") {
        setState("idle");
        return;
      }
      if (loaded.kind === "blocked") {
        setState("blocked");
        setMessage(keyedAttemptBlockedMessage("package creation"));
        return;
      }
      const values = parsePackageAttempt(
        loaded.attempt.body,
        loaded.attempt.ui.priceText,
      );
      if (values === null) {
        setState("blocked");
        setMessage(keyedAttemptBlockedMessage("package creation"));
        return;
      }
      pendingAttemptRef.current = loaded.attempt;
      setRestoredValues(values);
      setState("recovery");
      setMessage(
        "This tab restored an unconfirmed package-creation attempt. Its fields are locked; retry sends the exact saved body and operation key.",
      );
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      retireClientRequestScope(
        ownership,
        recoveryScope,
        scopeGeneration,
      );
      verifiedRecoveryScopeRef.current = null;
      pendingAttemptRef.current = null;
    };
  }, [recoveryScope]);

  useEffect(() => {
    if (
      restoredValues !== null &&
      formRef.current !== null &&
      !restoreFormControlValues(formRef.current, restoredValues)
    ) {
      const timeout = window.setTimeout(() => {
        setState("blocked");
        setMessage(keyedAttemptBlockedMessage("package creation"));
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [restoredValues]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      state === "checking" ||
      state === "saving" ||
      state === "blocked" ||
      state === "saved" ||
      verifiedRecoveryScopeRef.current !== recoveryScope
    ) {
      return;
    }
    const requestOwner = beginOwnedClientRequest(
      requestOwnershipRef.current,
      recoveryScope,
    );
    if (!requestOwner) return;
    setState("saving");
    setMessage("");
    // React may clear SyntheticEvent.currentTarget once this synchronous turn
    // ends, so retain the concrete form before any await.
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const priceText = String(form.get("price") ?? "").trim();
    const price = priceText ? Number(priceText) : null;
    const priceCents = price !== null && Number.isFinite(price)
      ? Math.round(price * 100)
      : null;
    const payload = {
      title: form.get("title"),
      description: form.get("description"),
      priceCents,
      currency: priceCents === null ? undefined : "CAD",
      currentDetailsText: form.get("currentDetailsText"),
      inclusions: lineItems(form.get("inclusions")),
      cadence: form.get("cadence"),
      practiceExpectation: form.get("practiceExpectation"),
      evaluationDescription: form.get("evaluationDescription"),
      terms: form.get("terms"),
      externalActionUrl: form.get("externalActionUrl"),
      status: "active",
    };

    if (!pendingAttemptRef.current) {
      try {
        pendingAttemptRef.current = persistKeyedAttempt({
          accountScope: recoveryScope,
          operation: "package_create",
          key: crypto.randomUUID(),
          body: JSON.stringify(payload),
          ui: { priceText },
        });
      } catch {
        setState("blocked");
        setMessage(keyedAttemptBlockedMessage("package creation"));
        return;
      }
    }

    const attempt = pendingAttemptRef.current;
    try {
      const response = await requestClientMutation("/api/packages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.key,
        },
        body: attempt.body,
      });
      await requireClientMutationJson<PackageCreateResponse>(
        response,
        (value) => hasPackageCreateResponse(value, response.status, attempt.body),
        "The package could not be saved.",
      );
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
    } catch (error) {
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
      const disposition = keyedAttemptMutationDisposition(error);
      if (disposition === "reconcile_required") {
        setState("blocked");
        setMessage(keyedAttemptReceiptBlockedMessage("package creation"));
        return;
      }
      if (disposition === "definitive_failure") {
        if (!clearKeyedAttempt(attempt)) {
          setState("blocked");
          setMessage(keyedAttemptBlockedMessage("package creation"));
          return;
        }
        pendingAttemptRef.current = null;
      }
      const outcomeUnknown = isClientMutationOutcomeUnknown(error);
      setState(outcomeUnknown ? "recovery" : "error");
      setMessage(
        clientMutationErrorMessage(
          error,
          "the package was saved",
          "retry_same_attempt",
          "The package could not be saved.",
        ),
      );
      return;
    }

    if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
    if (!clearKeyedAttempt(attempt)) {
      setState("blocked");
      setMessage(
        "The package was confirmed, but this tab could not retire its saved recovery attempt. Reload and inspect the package list before doing anything else.",
      );
      return;
    }
    pendingAttemptRef.current = null;
    setState("saved");
    setMessage("Package saved. It can now be connected to a coaching phase.");
    try {
      formElement.reset();
    } catch {
      // The confirmed save remains successful if local form cleanup fails.
    }
    try {
      router.refresh();
    } catch {
      // A refresh failure does not make the already-confirmed save fail.
    }
  }

  const fieldsLocked =
    state === "checking" ||
    state === "saving" ||
    state === "recovery" ||
    state === "blocked" ||
    state === "saved";

  return (
    <form
      method="post"
      ref={formRef}
      className={styles.form}
      aria-describedby={ERROR_SUMMARY_ID}
      onSubmit={submit}
    >
      <section className={styles.formCard}>
        <fieldset
          className={styles.formSection}
          disabled={fieldsLocked}
        >
          <legend>Add a package you already sell</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.fullField}>
              Package name
              <input name="title" required maxLength={120} />
            </label>
            <label className={styles.fullField}>
              Why it fits
              <textarea name="description" required maxLength={1_500} />
            </label>
            <label className={styles.field}>
              Price in CAD (optional)
              <input name="price" type="number" min="0" max="100000" step="0.01" />
              <small>This is the instructor’s coaching-package price, not the Roadmap subscription.</small>
            </label>
            <label className={styles.field}>
              Current details when no price is shown
              <input
                name="currentDetailsText"
                maxLength={500}
                placeholder="Confirm current price with me"
              />
              <small>Provide either an exact price or an honest current-details message.</small>
            </label>
            <label className={styles.fullField}>
              Material inclusions — one per line
              <textarea
                name="inclusions"
                required
                maxLength={2_000}
                placeholder={"Four individual lessons\nWritten practice direction\nEnd-of-phase review"}
              />
              <small>List only what this package currently includes. Do not imply booking or payment has occurred.</small>
            </label>
            <label className={styles.field}>
              Cadence (optional)
              <input name="cadence" maxLength={300} placeholder="Four lessons over six to eight weeks" />
            </label>
            <label className={styles.fullField}>
              Practice expectation (optional)
              <textarea name="practiceExpectation" maxLength={1_000} />
            </label>
            <label className={styles.fullField}>
              Evaluation approach (optional)
              <textarea name="evaluationDescription" maxLength={1_000} />
            </label>
            <label className={styles.fullField}>
              Terms
              <textarea
                name="terms"
                required
                maxLength={1_500}
                placeholder="Sessions, expected window, expiry, rescheduling, and renewal terms."
              />
            </label>
            <label className={styles.fullField}>
              Existing HTTPS booking, purchase, or contact link
              <input name="externalActionUrl" type="url" required maxLength={2_048} />
              <small>Roadmap makes the handoff clear; it does not claim the external action completed.</small>
            </label>
          </div>
        </fieldset>
      </section>
      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={
          state === "error" || state === "recovery" || state === "blocked"
            ? message
            : ""
        }
        formRef={formRef}
        className={styles.errorStatus}
      />
      {state === "saved" && message ? (
        <div className={styles.formStatus} role="status">
          {message}
        </div>
      ) : null}
      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={
            state === "checking" ||
            state === "saving" ||
            state === "blocked" ||
            state === "saved"
          }
        >
          {state === "saving"
            ? "Saving…"
            : state === "recovery"
              ? "Retry exact saved attempt"
              : "Save package"}
        </button>
        {state === "recovery" || state === "blocked" ? (
          <>
            <Link className={styles.secondaryButton} href="/app/packages">
              Reload and inspect package list
            </Link>
            <Link className={styles.secondaryButton} href="/support">
              Contact support
            </Link>
          </>
        ) : null}
      </div>
    </form>
  );
}

type PackageCreateResponse = {
  package: Record<string, unknown> & { id: string };
  idempotentReplay: boolean;
};

function hasPackageCreateResponse(
  value: unknown,
  status: number,
  requestBody: string,
): value is PackageCreateResponse {
  const request = parsePackageRequestBody(requestBody);
  if (
    request === null ||
    !hasRequiredAndOnlyObjectKeys(value, ["package", "idempotentReplay"], []) ||
    typeof value.idempotentReplay !== "boolean" ||
    !(
      (status === 201 && value.idempotentReplay === false) ||
      (status === 200 && value.idempotentReplay === true)
    ) ||
    !hasRequiredAndOnlyObjectKeys(value.package, [
      "id",
      "title",
      "name",
      "description",
      "purpose",
      "fitDescription",
      "status",
      "priceCents",
      "priceAmountMinor",
      "currency",
      "currentDetailsText",
      "inclusions",
      "cadence",
      "practiceExpectation",
      "evaluationDescription",
      "terms",
      "termsSummary",
      "externalActionType",
      "externalActionLabel",
      "externalActionUrl",
      "isDefault",
      "createdAt",
      "updatedAt",
    ], []) ||
    !isSafeResponseId(value.package.id)
  ) {
    return false;
  }
  const packageValue = value.package;
  return (
    matchesCanonicalKeyedAttemptText(packageValue.title, request.title) &&
    matchesCanonicalKeyedAttemptText(packageValue.name, request.title) &&
    matchesCanonicalKeyedAttemptText(
      packageValue.description,
      request.description,
    ) &&
    matchesCanonicalKeyedAttemptText(packageValue.purpose, request.description) &&
    matchesCanonicalKeyedAttemptText(
      packageValue.fitDescription,
      request.description,
    ) &&
    packageValue.status === "active" &&
    packageValue.priceCents === request.priceCents &&
    packageValue.priceAmountMinor === request.priceCents &&
    packageValue.currency === (request.priceCents === null ? null : "CAD") &&
    matchesCanonicalKeyedAttemptOptionalText(
      packageValue.currentDetailsText,
      request.currentDetailsText,
    ) &&
    Array.isArray(packageValue.inclusions) &&
    packageValue.inclusions.length === request.inclusions.length &&
    packageValue.inclusions.every(
      (item, index) =>
        matchesCanonicalKeyedAttemptText(item, request.inclusions[index] ?? ""),
    ) &&
    matchesCanonicalKeyedAttemptOptionalText(packageValue.cadence, request.cadence) &&
    matchesCanonicalKeyedAttemptOptionalText(
      packageValue.practiceExpectation,
      request.practiceExpectation,
    ) &&
    matchesCanonicalKeyedAttemptOptionalText(
      packageValue.evaluationDescription,
      request.evaluationDescription,
    ) &&
    matchesCanonicalKeyedAttemptText(packageValue.terms, request.terms) &&
    matchesCanonicalKeyedAttemptText(packageValue.termsSummary, request.terms) &&
    packageValue.externalActionType === "booking" &&
    packageValue.externalActionLabel === "Continue to booking" &&
    matchesCanonicalKeyedAttemptExternalUrl(
      packageValue.externalActionUrl,
      request.externalActionUrl,
    ) &&
    packageValue.isDefault === false &&
    Number.isSafeInteger(packageValue.createdAt) &&
    (packageValue.createdAt as number) >= 0 &&
    Number.isSafeInteger(packageValue.updatedAt) &&
    (packageValue.updatedAt as number) >= (packageValue.createdAt as number)
  );
}

function isSafeResponseId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

function lineItems(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePackageAttempt(
  body: string,
  priceTextValue: unknown,
): Record<string, RestoredFormValue> | null {
  if (typeof priceTextValue !== "string") return null;
  const value = parsePackageRequestBody(body);
  if (value === null) return null;
  const parsedPrice = priceTextValue.trim() ? Number(priceTextValue) : null;
  const restoredPriceCents =
    parsedPrice !== null && Number.isFinite(parsedPrice)
      ? Math.round(parsedPrice * 100)
      : null;
  if (restoredPriceCents !== value.priceCents) return null;
  return {
    title: value.title,
    description: value.description,
    price: priceTextValue,
    currentDetailsText: value.currentDetailsText,
    inclusions: value.inclusions.join("\n"),
    cadence: value.cadence,
    practiceExpectation: value.practiceExpectation,
    evaluationDescription: value.evaluationDescription,
    terms: value.terms,
    externalActionUrl: value.externalActionUrl,
  };
}

type PackageAttemptBody = {
  title: string;
  description: string;
  priceCents: number | null;
  currency?: "CAD";
  currentDetailsText: string;
  inclusions: string[];
  cadence: string;
  practiceExpectation: string;
  evaluationDescription: string;
  terms: string;
  externalActionUrl: string;
  status: "active";
};

function parsePackageRequestBody(body: string): PackageAttemptBody | null {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  const requiredKeys = [
    "title",
    "description",
    "priceCents",
    "currentDetailsText",
    "inclusions",
    "cadence",
    "practiceExpectation",
    "evaluationDescription",
    "terms",
    "externalActionUrl",
    "status",
  ] as const;
  if (
    !hasRequiredAndOnlyObjectKeys(value, requiredKeys, ["currency"]) ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    !(
      value.priceCents === null ||
      (Number.isSafeInteger(value.priceCents) && (value.priceCents as number) >= 0)
    ) ||
    typeof value.currentDetailsText !== "string" ||
    !Array.isArray(value.inclusions) ||
    !value.inclusions.every((item) => typeof item === "string") ||
    typeof value.cadence !== "string" ||
    typeof value.practiceExpectation !== "string" ||
    typeof value.evaluationDescription !== "string" ||
    typeof value.terms !== "string" ||
    typeof value.externalActionUrl !== "string" ||
    value.status !== "active"
  ) {
    return null;
  }
  if (
    (value.priceCents === null
      ? Object.hasOwn(value, "currency")
      : value.currency !== "CAD")
  ) {
    return null;
  }
  return value as PackageAttemptBody;
}

function hasRequiredAndOnlyObjectKeys<K extends string, O extends string>(
  value: unknown,
  required: readonly K[],
  optional: readonly O[],
): value is Record<K, unknown> & Partial<Record<O, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value);
  const allowed = new Set<string>([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    actual.every((key) => allowed.has(key)) &&
    actual.length >= required.length &&
    actual.length <= required.length + optional.length
  );
}
