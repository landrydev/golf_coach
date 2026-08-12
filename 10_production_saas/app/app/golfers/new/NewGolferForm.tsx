"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import {
  clearKeyedAttempt,
  keyedAttemptBlockedMessage,
  keyedAttemptMutationDisposition,
  keyedAttemptRetryReadiness,
  keyedAttemptReceiptBlockedMessage,
  loadKeyedAttempt,
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
import { navigateToConfirmedDestination } from "@/lib/client-terminal-mutation";
import styles from "../../workspace.module.css";

type PackageOption = { id: string; name: string; fitDescription: string };
const ERROR_SUMMARY_ID = "new-golfer-form-error-summary";

export function NewGolferForm({
  packages,
  recoveryScope,
}: {
  packages: PackageOption[];
  recoveryScope: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const pendingAttemptRef = useRef<KeyedAttemptRecord | null>(null);
  const verifiedRecoveryScopeRef = useRef<string | null>(null);
  const requestOwnershipRef = useRef(createClientRequestOwnershipState());
  const [phaseCount, setPhaseCount] = useState<3 | 4>(4);
  const [status, setStatus] = useState<
    "checking" | "idle" | "saving" | "recovery" | "blocked" | "saved" | "error"
  >("checking");
  const [message, setMessage] = useState("");
  const [confirmedDestination, setConfirmedDestination] = useState<string | null>(null);
  const [restoredValues, setRestoredValues] = useState<
    Record<string, RestoredFormValue> | null
  >(null);
  const [recoveredPackageId, setRecoveredPackageId] = useState<string | null>(
    null,
  );

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
      const loaded = loadKeyedAttempt(recoveryScope, "golfer_full_create");
      if (loaded.kind === "empty") {
        setStatus("idle");
        return;
      }
      if (loaded.kind === "blocked") {
        setStatus("blocked");
        setMessage(
          keyedAttemptBlockedMessage("golfer workspace creation", loaded.reason),
        );
        return;
      }
      const restored = parseFullGolferAttempt(loaded.attempt.body);
      if (
        restored === null ||
        loaded.attempt.ui.phaseCount !== restored.phaseCount
      ) {
        setStatus("blocked");
        setMessage(keyedAttemptBlockedMessage("golfer workspace creation"));
        return;
      }
      pendingAttemptRef.current = loaded.attempt;
      setPhaseCount(restored.phaseCount);
      setRecoveredPackageId(restored.packageId);
      setRestoredValues(restored.values);
      setStatus("recovery");
      setMessage(
        "This tab restored an unconfirmed golfer creation attempt. Its fields are locked; retry sends the exact saved body and operation key.",
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
        setStatus("blocked");
        setMessage(keyedAttemptBlockedMessage("golfer workspace creation"));
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [phaseCount, restoredValues]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      status === "checking" ||
      status === "saving" ||
      status === "blocked" ||
      status === "saved" ||
      verifiedRecoveryScopeRef.current !== recoveryScope
    ) {
      return;
    }
    const requestOwner = beginOwnedClientRequest(
      requestOwnershipRef.current,
      recoveryScope,
    );
    if (!requestOwner) return;
    setStatus("saving");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const payload = {
      displayName: form.get("displayName"),
      email: form.get("email"),
      adultEligibilityConfirmed: form.get("adultEligibilityConfirmed") === "yes",
      planTitle: form.get("planTitle"),
      firstPhasePackageId: form.get("firstPhasePackageId") || null,
      goal: {
        statement: form.get("goalStatement"),
        why: form.get("goalWhy"),
        context: form.get("goalContext"),
      },
      assessment: {
        summary: form.get("assessmentSummary"),
        strengths: form.get("strengths"),
        primaryPattern: form.get("primaryPattern"),
        limitations: form.get("limitations"),
      },
      priority: {
        title: form.get("priorityTitle"),
        rationale: form.get("priorityRationale"),
      },
      phases: Array.from({ length: phaseCount }, (_, index) => index + 1).map((number) => ({
        number,
        title: form.get(`phase${number}Title`),
        purpose: form.get(`phase${number}Purpose`),
        rationale: form.get(`phase${number}Rationale`),
        progressSignals: lineItems(form.get(`phase${number}ProgressSignals`)),
      })),
    };

    if (!pendingAttemptRef.current) {
      try {
        pendingAttemptRef.current = persistKeyedAttempt({
          accountScope: recoveryScope,
          operation: "golfer_full_create",
          key: crypto.randomUUID(),
          body: JSON.stringify(payload),
          ui: { phaseCount },
        });
      } catch {
        setStatus("blocked");
        setMessage(keyedAttemptBlockedMessage("golfer workspace creation"));
        return;
      }
    }

    const attempt = pendingAttemptRef.current;
    const retryReadiness = keyedAttemptRetryReadiness(attempt);
    if (retryReadiness !== "ready") {
      if (retryReadiness === "expired") pendingAttemptRef.current = null;
      setStatus("blocked");
      setMessage(
        keyedAttemptBlockedMessage(
          "golfer workspace creation",
          retryReadiness === "expired" ? "expired" : undefined,
        ),
      );
      return;
    }
    try {
      const response = await requestClientMutation("/api/golfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.key,
        },
        body: attempt.body,
      });
      const result = await requireClientMutationJson<CreatedGolferResponse>(
        response,
        (value) => hasCreatedGolferResponse(value, response.status, attempt.body),
        "The golfer record could not be created.",
      );
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
      if (!clearKeyedAttempt(attempt)) {
        setStatus("blocked");
        setMessage(
          "The golfer workspace was confirmed, but this tab could not retire its saved recovery attempt. Reload and inspect the golfer list before doing anything else.",
        );
        return;
      }
      pendingAttemptRef.current = null;
      const destination =
        `/app/golfers/${encodeURIComponent(result.golfer.id)}`;
      setConfirmedDestination(destination);
      setStatus("saved");
      setMessage("Golfer workspace created.");
      try {
        navigateToConfirmedDestination(router, destination);
      } catch {
        // The server save is confirmed. Local navigation cannot undo it.
      }
    } catch (error) {
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
      const disposition = keyedAttemptMutationDisposition(error);
      if (disposition === "reconcile_required") {
        setStatus("blocked");
        setMessage(keyedAttemptReceiptBlockedMessage("golfer workspace creation"));
        return;
      }
      if (disposition === "definitive_failure") {
        if (!clearKeyedAttempt(attempt)) {
          setStatus("blocked");
          setMessage(keyedAttemptBlockedMessage("golfer workspace creation"));
          return;
        }
        pendingAttemptRef.current = null;
      }
      const outcomeUnknown = isClientMutationOutcomeUnknown(error);
      setStatus(outcomeUnknown ? "recovery" : "error");
      setMessage(
        clientMutationErrorMessage(
          error,
          "the golfer workspace was created",
          "retry_same_attempt",
          "The golfer record could not be created.",
        ),
      );
    }
  }

  const fieldsLocked =
    status === "checking" ||
    status === "saving" ||
    status === "recovery" ||
    status === "blocked" ||
    status === "saved";

  return (
    <form
      method="post"
      ref={formRef}
      className={styles.form}
      aria-describedby={ERROR_SUMMARY_ID}
      onSubmit={handleSubmit}
    >
      <section className={styles.formCard}>
        <fieldset
          className={styles.formSection}
          disabled={fieldsLocked}
        >
          <legend>Golfer and goal</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Golfer display name
              <input name="displayName" required maxLength={120} autoComplete="name" />
              <small>Use the name the golfer expects to see.</small>
            </label>
            <label className={styles.field}>
              Golfer email (optional)
              <input name="email" type="email" maxLength={254} autoComplete="email" />
              <small>Sharing remains a separate review step.</small>
            </label>
            <label className={styles.fullField}>
              Plan title
              <input
                name="planTitle"
                required
                maxLength={120}
                placeholder="Driver development roadmap"
              />
            </label>
            <label className={styles.fullField}>
              Desired outcome
              <textarea
                name="goalStatement"
                required
                maxLength={600}
                placeholder="What does the golfer want from their golf?"
              />
            </label>
            <label className={styles.fullField}>
              Why it matters (optional)
              <textarea name="goalWhy" maxLength={1_000} />
            </label>
            <label className={styles.fullField}>
              Practical context (optional)
              <textarea
                name="goalContext"
                maxLength={1_000}
                placeholder="Practice reality, upcoming play, constraints, or preferences."
              />
            </label>
            <label className={`${styles.fullField} ${styles.confirmRow}`}>
              <input
                name="adultEligibilityConfirmed"
                type="checkbox"
                value="yes"
                required
              />
              <span>
                I confirm this golfer is an adult and eligible for this initial product. I have
                a suitable basis to create this coaching record.
              </span>
            </label>
          </div>
        </fieldset>
      </section>

      <section className={styles.formCard}>
        <fieldset
          className={styles.formSection}
          disabled={fieldsLocked}
        >
          <legend>First coaching phase package</legend>
          <label className={styles.fullField}>
            Existing package (optional)
            <select name="firstPhasePackageId" defaultValue="">
              <option value="">No package attached — golfer can ask, wait, or practise independently</option>
              {recoveredPackageId &&
              !packages.some((coachingPackage) => coachingPackage.id === recoveredPackageId) ? (
                <option value={recoveredPackageId}>
                  Previously selected package (not in the current bounded list)
                </option>
              ) : null}
              {packages.map((coachingPackage) => (
                <option key={coachingPackage.id} value={coachingPackage.id}>
                  {coachingPackage.name}
                </option>
              ))}
            </select>
            <small>
              This links the recommendation to a package you already sell. Booking or payment
              still happens on your external service.
            </small>
          </label>
        </fieldset>
      </section>

      <section className={styles.formCard}>
        <fieldset
          className={styles.formSection}
          disabled={fieldsLocked}
        >
          <legend>Starting assessment</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.fullField}>
              Coach assessment summary
              <textarea
                name="assessmentSummary"
                required
                maxLength={2_000}
                placeholder="Describe the smallest set of observations needed to explain what comes first."
              />
            </label>
            <label className={styles.fullField}>
              Strengths to preserve
              <textarea name="strengths" required maxLength={1_500} />
            </label>
            <label className={styles.fullField}>
              Primary pattern
              <textarea
                name="primaryPattern"
                required
                maxLength={2_000}
                placeholder="Describe the narrow recurring pattern the roadmap addresses. Keep observation separate from interpretation."
              />
            </label>
            <label className={styles.fullField}>
              Evidence limits
              <textarea
                name="limitations"
                required
                maxLength={1_500}
                placeholder="State what was not observed, sample limitations, and what this assessment cannot predict."
              />
            </label>
          </div>
        </fieldset>
      </section>

      <section className={styles.formCard}>
        <fieldset
          className={styles.formSection}
          disabled={fieldsLocked}
        >
          <legend>Current priority</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Primary priority barrier
              <input name="priorityTitle" required maxLength={120} />
            </label>
            <label className={styles.fullField}>
              Why this comes first
              <textarea name="priorityRationale" required maxLength={1_500} />
            </label>
          </div>
        </fieldset>
      </section>

      <section className={styles.formCard}>
        <fieldset
          className={styles.formSection}
          disabled={fieldsLocked}
        >
          <legend>Directional development phases</legend>
          <p className={styles.muted}>
            Future phases are direction, not promises. They can change as evidence develops.
          </p>
          <label className={styles.field}>
            Number of phases
            <select
              name="phaseCount"
              value={phaseCount}
              onChange={(event) => setPhaseCount(event.target.value === "3" ? 3 : 4)}
            >
              <option value="3">3 directional phases</option>
              <option value="4">4 directional phases</option>
            </select>
          </label>
          {Array.from({ length: phaseCount }, (_, index) => index + 1).map((number) => (
            <div className={styles.fieldGrid} key={number}>
              <label className={styles.field}>
                Phase {number} title
                <input name={`phase${number}Title`} required maxLength={120} />
              </label>
              <label className={styles.field}>
                Phase {number} purpose
                <textarea name={`phase${number}Purpose`} required maxLength={700} />
              </label>
              <label className={styles.fullField}>
                {number === 1 ? "Why this phase leads" : `Why Phase ${number} follows (optional)`}
                <textarea
                  name={`phase${number}Rationale`}
                  required={number === 1}
                  maxLength={1_500}
                />
              </label>
              <label className={styles.fullField}>
                {number === 1 ? "Progress signals — one per line" : "Progress signals — one per line (optional)"}
                <textarea
                  name={`phase${number}ProgressSignals`}
                  required={number === 1}
                  maxLength={2_400}
                  placeholder={number === 1 ? "A repeatable observable signal\nA coach-reviewed on-course signal" : undefined}
                />
                <small>Use observable signals, not guaranteed outcomes or fixed timelines.</small>
              </label>
            </div>
          ))}
        </fieldset>
      </section>

      <FormErrorSummary
        id={ERROR_SUMMARY_ID}
        message={
          status === "error" || status === "recovery" || status === "blocked"
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
            status === "checking" ||
            status === "saving" ||
            status === "blocked" ||
            status === "saved"
          }
        >
          {status === "saving"
            ? "Saving…"
            : status === "recovery"
              ? "Retry exact saved attempt"
              : "Save draft and review"}
        </button>
        {confirmedDestination ? (
          <a className={styles.secondaryButton} href={confirmedDestination}>
            Open confirmed golfer workspace
          </a>
        ) : status === "recovery" || status === "blocked" ? (
          <>
            <Link className={styles.secondaryButton} href="/app/golfers">
              Reload and inspect golfer list
            </Link>
            <Link className={styles.secondaryButton} href="/support">
              Contact support
            </Link>
          </>
        ) : (
          <button className={styles.secondaryButton} type="button" onClick={() => router.back()}>
            Cancel
          </button>
        )}
      </div>
      {status === "saved" ? (
        <div className={styles.formStatus} role="status">
          {message}
        </div>
      ) : null}
    </form>
  );
}

type CreatedGolferResponse = {
  golfer: { id: string; displayName: string; status: "active" };
  plan: { id: string; title: string; status: "draft"; revision: 1 };
  goal: { id: string };
  assessment: { id: string };
  priority: { id: string };
  phases: Array<{
    id: string;
    number: number;
    title: string;
    purpose: string;
    status: "active" | "planned";
  }>;
  idempotentReplay: boolean;
};

function hasCreatedGolferResponse(
  value: unknown,
  status: number,
  requestBody: string,
): value is CreatedGolferResponse {
  const request = parseFullGolferAttempt(requestBody);
  if (
    request === null ||
    !hasExactObjectKeys(value, [
      "golfer",
      "plan",
      "goal",
      "assessment",
      "priority",
      "phases",
      "idempotentReplay",
    ]) ||
    typeof value.idempotentReplay !== "boolean" ||
    !(
      (status === 201 && value.idempotentReplay === false) ||
      (status === 200 && value.idempotentReplay === true)
    ) ||
    !hasExactObjectKeys(value.golfer, ["id", "displayName", "status"]) ||
    !isSafeResponseId(value.golfer.id) ||
    !matchesCanonicalKeyedAttemptText(
      value.golfer.displayName,
      request.values.displayName,
    ) ||
    value.golfer.status !== "active" ||
    !hasExactObjectKeys(value.plan, ["id", "title", "status", "revision"]) ||
    !isSafeResponseId(value.plan.id) ||
    !matchesCanonicalKeyedAttemptText(value.plan.title, request.values.planTitle) ||
    value.plan.status !== "draft" ||
    value.plan.revision !== 1 ||
    !hasIdentifierOnly(value.goal) ||
    !hasIdentifierOnly(value.assessment) ||
    !hasIdentifierOnly(value.priority) ||
    !Array.isArray(value.phases) ||
    value.phases.length !== request.phaseCount
  ) {
    return false;
  }
  return value.phases.every((phase, index) => {
    const number = index + 1;
    return (
      hasExactObjectKeys(phase, [
        "id",
        "number",
        "title",
        "purpose",
        "status",
      ]) &&
      isSafeResponseId(phase.id) &&
      phase.number === number &&
      matchesCanonicalKeyedAttemptText(
        phase.title,
        request.values[`phase${number}Title`],
      ) &&
      matchesCanonicalKeyedAttemptText(
        phase.purpose,
        request.values[`phase${number}Purpose`],
      ) &&
      phase.status === (number === 1 ? "active" : "planned")
    );
  });
}

function hasIdentifierOnly(value: unknown): value is { id: string } {
  return hasExactObjectKeys(value, ["id"]) && isSafeResponseId(value.id);
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

function parseFullGolferAttempt(body: string): {
  phaseCount: 3 | 4;
  packageId: string | null;
  values: Record<string, RestoredFormValue>;
} | null {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (
    !hasExactObjectKeys(value, [
      "displayName",
      "email",
      "adultEligibilityConfirmed",
      "planTitle",
      "firstPhasePackageId",
      "goal",
      "assessment",
      "priority",
      "phases",
    ]) ||
    typeof value.displayName !== "string" ||
    typeof value.email !== "string" ||
    typeof value.adultEligibilityConfirmed !== "boolean" ||
    typeof value.planTitle !== "string" ||
    !(
      value.firstPhasePackageId === null ||
      typeof value.firstPhasePackageId === "string"
    ) ||
    !hasExactStringObject(value.goal, ["statement", "why", "context"]) ||
    !hasExactStringObject(value.assessment, [
      "summary",
      "strengths",
      "primaryPattern",
      "limitations",
    ]) ||
    !hasExactStringObject(value.priority, ["title", "rationale"]) ||
    !Array.isArray(value.phases) ||
    (value.phases.length !== 3 && value.phases.length !== 4)
  ) {
    return null;
  }

  const values: Record<string, RestoredFormValue> = {
    displayName: value.displayName,
    email: value.email,
    adultEligibilityConfirmed: value.adultEligibilityConfirmed,
    planTitle: value.planTitle,
    firstPhasePackageId: value.firstPhasePackageId ?? "",
    goalStatement: value.goal.statement,
    goalWhy: value.goal.why,
    goalContext: value.goal.context,
    assessmentSummary: value.assessment.summary,
    strengths: value.assessment.strengths,
    primaryPattern: value.assessment.primaryPattern,
    limitations: value.assessment.limitations,
    priorityTitle: value.priority.title,
    priorityRationale: value.priority.rationale,
  };
  for (let index = 0; index < value.phases.length; index += 1) {
    const phase = value.phases[index];
    if (
      !hasExactObjectKeys(phase, [
        "number",
        "title",
        "purpose",
        "rationale",
        "progressSignals",
      ]) ||
      phase.number !== index + 1 ||
      typeof phase.title !== "string" ||
      typeof phase.purpose !== "string" ||
      typeof phase.rationale !== "string" ||
      !Array.isArray(phase.progressSignals) ||
      !phase.progressSignals.every((signal) => typeof signal === "string")
    ) {
      return null;
    }
    const number = index + 1;
    values[`phase${number}Title`] = phase.title;
    values[`phase${number}Purpose`] = phase.purpose;
    values[`phase${number}Rationale`] = phase.rationale;
    values[`phase${number}ProgressSignals`] = phase.progressSignals.join("\n");
  }
  return {
    phaseCount: value.phases.length,
    packageId: value.firstPhasePackageId,
    values,
  };
}

function hasExactStringObject<K extends string>(
  value: unknown,
  keys: readonly K[],
): value is Record<K, string> {
  return (
    hasExactObjectKeys(value, keys) &&
    keys.every((key) => typeof value[key] === "string")
  );
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
