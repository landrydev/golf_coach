"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clearKeyedAttempt,
  keyedAttemptBlockedMessage,
  keyedAttemptMutationDisposition,
  keyedAttemptReceiptBlockedMessage,
  loadKeyedAttempt,
  matchesCanonicalKeyedAttemptEmail,
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
import styles from "../../workspace.module.css";

const ERROR_SUMMARY_ID = "staged-golfer-form-error-summary";

export function StagedGolferForm({ recoveryScope }: { recoveryScope: string }) {
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
      const loaded = loadKeyedAttempt(recoveryScope, "golfer_staged_create");
      if (loaded.kind === "empty") {
        setState("idle");
        return;
      }
      if (loaded.kind === "blocked") {
        setState("blocked");
        setMessage(keyedAttemptBlockedMessage("resumable golfer creation"));
        return;
      }
      const values = parseStagedGolferAttempt(loaded.attempt.body);
      if (values === null) {
        setState("blocked");
        setMessage(keyedAttemptBlockedMessage("resumable golfer creation"));
        return;
      }
      pendingAttemptRef.current = loaded.attempt;
      setRestoredValues(values);
      setState("recovery");
      setMessage(
        "This tab restored an unconfirmed resumable-golfer attempt. Its fields are locked; retry sends the exact saved body and operation key.",
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
        setMessage(keyedAttemptBlockedMessage("resumable golfer creation"));
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
    const form = new FormData(event.currentTarget);
    const candidateBody = JSON.stringify({
      adultEligibilityConfirmed:
        form.get("adultEligibilityConfirmed") === "yes",
      displayName: form.get("displayName"),
      preferredName: form.get("preferredName"),
      email: form.get("email"),
      planTitle: form.get("planTitle"),
      goal: {
        statement: form.get("goalStatement"),
        why: form.get("goalWhy"),
        context: form.get("goalContext"),
      },
    });
    if (!pendingAttemptRef.current) {
      try {
        pendingAttemptRef.current = persistKeyedAttempt({
          accountScope: recoveryScope,
          operation: "golfer_staged_create",
          key: crypto.randomUUID(),
          body: candidateBody,
          ui: {},
        });
      } catch {
        setState("blocked");
        setMessage(keyedAttemptBlockedMessage("resumable golfer creation"));
        return;
      }
    }

    const attempt = pendingAttemptRef.current;
    try {
      const response = await requestClientMutation("/api/golfers/staged", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.key,
        },
        body: attempt.body,
      });
      const result = await requireClientMutationJson<StagedGolferResponse>(
        response,
        (value) => hasStagedGolferResponse(value, response.status, attempt.body),
        "The resumable golfer draft could not be saved.",
      );
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
      if (!clearKeyedAttempt(attempt)) {
        setState("blocked");
        setMessage(
          "The resumable golfer was confirmed, but this tab could not retire its saved recovery attempt. Reload and inspect the golfer list before doing anything else.",
        );
        return;
      }
      pendingAttemptRef.current = null;
      setState("saved");
      setMessage("Resumable golfer draft saved.");
      try {
        router.push(
          `/app/golfers/${encodeURIComponent(result.golfer.id)}/complete`,
        );
        router.refresh();
      } catch {
        // The confirmed server save remains successful if navigation fails.
      }
    } catch (error) {
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
      const disposition = keyedAttemptMutationDisposition(error);
      if (disposition === "reconcile_required") {
        setState("blocked");
        setMessage(keyedAttemptReceiptBlockedMessage("resumable golfer creation"));
        return;
      }
      if (disposition === "definitive_failure") {
        if (!clearKeyedAttempt(attempt)) {
          setState("blocked");
          setMessage(keyedAttemptBlockedMessage("resumable golfer creation"));
          return;
        }
        pendingAttemptRef.current = null;
      }
      const outcomeUnknown = isClientMutationOutcomeUnknown(error);
      setState(outcomeUnknown ? "recovery" : "error");
      setMessage(
        clientMutationErrorMessage(
          error,
          "the resumable golfer draft was saved",
          "retry_same_attempt",
          "The resumable golfer draft could not be saved.",
        ),
      );
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
          <legend>Save the real basics first</legend>
          <p className={styles.muted}>
            This creates a private, resumable record with no invented assessment,
            priority, phase, or package content. It cannot be previewed or published until
            you finish the coaching roadmap.
          </p>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Golfer display name
              <input name="displayName" required maxLength={120} autoComplete="name" />
            </label>
            <label className={styles.field}>
              Preferred name (optional)
              <input name="preferredName" maxLength={120} />
            </label>
            <label className={styles.fullField}>
              Contact email (optional)
              <input name="email" type="email" maxLength={254} autoComplete="email" />
              <small>Roadmap does not send a message or private link automatically.</small>
            </label>
            <label className={styles.fullField}>
              Plan title
              <input name="planTitle" required maxLength={120} />
            </label>
            <label className={styles.fullField}>
              Primary goal
              <textarea name="goalStatement" required maxLength={600} />
            </label>
            <label className={styles.fullField}>
              Why it matters (optional)
              <textarea name="goalWhy" maxLength={1_000} />
            </label>
            <label className={styles.fullField}>
              Practical context (optional)
              <textarea name="goalContext" maxLength={1_000} />
            </label>
            <label className={`${styles.fullField} ${styles.confirmRow}`}>
              <input
                name="adultEligibilityConfirmed"
                type="checkbox"
                value="yes"
                required
              />
              <span>
                I confirm this golfer is an adult and I have a suitable basis to create
                this private coaching record.
              </span>
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
            ? "Saving basics…"
            : state === "recovery"
              ? "Retry exact saved attempt"
              : "Save basics and continue"}
        </button>
        {state === "recovery" || state === "blocked" ? (
          <>
            <Link className={styles.secondaryButton} href="/app/golfers">
              Reload and inspect golfer list
            </Link>
            <Link className={styles.secondaryButton} href="/support">
              Contact support
            </Link>
          </>
        ) : null}
      </div>
      {state === "saved" ? (
        <div className={styles.formStatus} role="status">
          {message}
        </div>
      ) : null}
    </form>
  );
}

type StagedGolferResponse = {
  golfer: {
    id: string;
    displayName: string;
    preferredName: string | null;
    contactEmail: string | null;
    status: "active";
    eligibilityStatus: "adult_confirmed";
  };
  plan: {
    id: string;
    title: string;
    status: "draft";
    revision: 1;
    approvedRevision: null;
    publishedRevision: null;
  };
  goal: {
    id: string;
    desiredOutcome: string;
    whyItMatters: string | null;
    context: string | null;
  };
  authoringState: "staged";
  resumePath: string;
  idempotentReplay: boolean;
};

function hasStagedGolferResponse(
  value: unknown,
  status: number,
  requestBody: string,
): value is StagedGolferResponse {
  const request = parseStagedGolferAttempt(requestBody);
  if (
    request === null ||
    !hasExactObjectKeys(value, [
      "golfer",
      "plan",
      "goal",
      "authoringState",
      "resumePath",
      "idempotentReplay",
    ]) ||
    typeof value.idempotentReplay !== "boolean" ||
    !(
      (status === 201 && value.idempotentReplay === false) ||
      (status === 200 && value.idempotentReplay === true)
    ) ||
    value.authoringState !== "staged" ||
    !hasExactObjectKeys(value.golfer, [
      "id",
      "displayName",
      "preferredName",
      "contactEmail",
      "status",
      "eligibilityStatus",
    ]) ||
    !isSafeResponseId(value.golfer.id) ||
    !matchesCanonicalKeyedAttemptText(
      value.golfer.displayName,
      request.displayName,
    ) ||
    !matchesCanonicalKeyedAttemptOptionalText(
      value.golfer.preferredName,
      request.preferredName,
    ) ||
    !matchesCanonicalKeyedAttemptEmail(value.golfer.contactEmail, request.email) ||
    value.golfer.status !== "active" ||
    value.golfer.eligibilityStatus !== "adult_confirmed" ||
    !hasExactObjectKeys(value.plan, [
      "id",
      "title",
      "status",
      "revision",
      "approvedRevision",
      "publishedRevision",
    ]) ||
    !isSafeResponseId(value.plan.id) ||
    !matchesCanonicalKeyedAttemptText(value.plan.title, request.planTitle) ||
    value.plan.status !== "draft" ||
    value.plan.revision !== 1 ||
    value.plan.approvedRevision !== null ||
    value.plan.publishedRevision !== null ||
    !hasExactObjectKeys(value.goal, [
      "id",
      "desiredOutcome",
      "whyItMatters",
      "context",
    ]) ||
    !isSafeResponseId(value.goal.id) ||
    !matchesCanonicalKeyedAttemptText(
      value.goal.desiredOutcome,
      request.goalStatement,
    ) ||
    !matchesCanonicalKeyedAttemptOptionalText(
      value.goal.whyItMatters,
      request.goalWhy,
    ) ||
    !matchesCanonicalKeyedAttemptOptionalText(
      value.goal.context,
      request.goalContext,
    ) ||
    value.resumePath !==
      `/app/golfers/${encodeURIComponent(value.golfer.id)}/complete`
  ) {
    return false;
  }
  return true;
}

function isSafeResponseId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

function parseStagedGolferAttempt(
  body: string,
): Record<string, RestoredFormValue> | null {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (
    !hasExactObjectKeys(value, [
      "adultEligibilityConfirmed",
      "displayName",
      "preferredName",
      "email",
      "planTitle",
      "goal",
    ]) ||
    typeof value.adultEligibilityConfirmed !== "boolean" ||
    typeof value.displayName !== "string" ||
    typeof value.preferredName !== "string" ||
    typeof value.email !== "string" ||
    typeof value.planTitle !== "string" ||
    !hasExactObjectKeys(value.goal, ["statement", "why", "context"]) ||
    typeof value.goal.statement !== "string" ||
    typeof value.goal.why !== "string" ||
    typeof value.goal.context !== "string"
  ) {
    return null;
  }
  return {
    adultEligibilityConfirmed: value.adultEligibilityConfirmed,
    displayName: value.displayName,
    preferredName: value.preferredName,
    email: value.email,
    planTitle: value.planTitle,
    goalStatement: value.goal.statement,
    goalWhy: value.goal.why,
    goalContext: value.goal.context,
  };
}

function hasExactObjectKeys<K extends string>(
  value: unknown,
  keys: readonly K[],
): value is Record<K, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}
