"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  attemptExternalHandoffRecord,
  createGolferResponseAttemptRegistry,
  golferResponseRequiresSessionReload,
  requestGolferResponse,
  type GolferResponseAttemptRegistry,
  type ExplicitGolferResponseType,
} from "@/lib/client-recovery";
import {
  activateClientRequestScope,
  beginOwnedClientRequest,
  createClientRequestOwnershipState,
  isClientRequestScopeActive,
  ownsClientRequest,
  retireClientRequestScope,
} from "@/lib/client-request-ownership";
import { clientMutationReferenceMessage } from "@/lib/client-mutation-recovery";
import { buildCoachContactMailtoUri } from "@/lib/mailto";
import styles from "./plan.module.css";

type ChoiceProps = {
  coachName: string;
  coachEmail?: string | null;
  externalActionUrl?: string | null;
  sessionContext?: string;
  preview?: boolean;
};

type RecordedChoice = ExplicitGolferResponseType;

const CONFIRMATIONS: Record<RecordedChoice, string> = {
  ask_question:
    "Your question choice was recorded. Your email app will open next; Roadmap has not sent a message.",
  wait: "Review later was recorded. This is not a booking, payment, or message.",
  decline:
    "Not pursuing this option was recorded. Your private plan remains available while this link is valid.",
  request_reassessment:
    "A reassessment request was recorded for your coach to review. Roadmap has not sent a message.",
  independent_practice:
    "Independent practice was recorded. Use only the coach-authored direction in this plan and ask when anything is unclear.",
};

const OUTCOME_UNKNOWN_MESSAGE =
  "Roadmap could not confirm whether this choice was recorded. Check your connection, then retry the same choice on this page; Roadmap will reuse this attempt rather than add another response.";
const SAVING_MESSAGE =
  "Roadmap is recording this choice. Wait for confirmation before choosing another.";
const CLIENT_FAILURE_MESSAGE =
  "Your choice could not be recorded. Please try again.";
const BLOCKED_RECOVERY_MESSAGE =
  "Roadmap found an earlier response attempt that cannot be safely matched to this private session. To prevent a duplicate or a response on the wrong plan, choices will not be recorded. Close this roadmap or open a fresh private link from your coach.";
const SESSION_RELOAD_REQUIRED_MESSAGE =
  "This private plan session is no longer current. Choices are locked. Reload this roadmap to check its status, or open a complete private link from your coach.";

export function GolferChoices({
  coachName,
  coachEmail,
  externalActionUrl,
  sessionContext,
  preview = false,
}: ChoiceProps) {
  const externalHandoffNoteId = useId();
  const responseStatusId = useId();
  const attemptRegistry = useRef<GolferResponseAttemptRegistry | null>(null);
  const confirmedQuestionHandoffRef = useRef(false);
  const requestOwnershipRef = useRef(createClientRequestOwnershipState());
  const [recoveryReady, setRecoveryReady] = useState(preview);
  const [recoveryBlocked, setRecoveryBlocked] = useState(!preview && !sessionContext);
  const [sessionReloadRequired, setSessionReloadRequired] = useState(false);
  const [saving, setSaving] = useState<RecordedChoice | null>(null);
  const [pendingChoice, setPendingChoice] = useState<RecordedChoice | null>(null);
  const [confirmedQuestionHandoff, setConfirmedQuestionHandoff] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const coachMailtoUri = buildCoachContactMailtoUri(coachEmail);
  const responseScope = preview
    ? "preview"
    : `session:${sessionContext ?? "missing"}`;

  useEffect(() => {
    const ownership = requestOwnershipRef.current;
    const scopeGeneration = activateClientRequestScope(
      ownership,
      responseScope,
    );
    confirmedQuestionHandoffRef.current = false;
    const restoration = window.setTimeout(() => {
      if (
        !isClientRequestScopeActive(
          ownership,
          responseScope,
          scopeGeneration,
        )
      ) {
        return;
      }
      setConfirmedQuestionHandoff(false);
      setPendingChoice(null);
      setRecoveryBlocked(false);
      setSessionReloadRequired(false);
      setIsError(false);
      setMessage("");
      if (!preview) {
        if (!sessionContext) {
          setRecoveryBlocked(true);
          setIsError(true);
          setMessage(BLOCKED_RECOVERY_MESSAGE);
        } else {
          const registry = createGolferResponseAttemptRegistry(sessionContext);
          attemptRegistry.current = registry;
          const recovery = registry.recovery();
          if (recovery.kind === "blocked") {
            setRecoveryBlocked(true);
            setIsError(true);
            setMessage(BLOCKED_RECOVERY_MESSAGE);
          } else if (recovery.kind === "pending") {
            setPendingChoice(recovery.attempt.responseType);
            setIsError(true);
            setMessage(OUTCOME_UNKNOWN_MESSAGE);
          }
        }
      }
      setRecoveryReady(true);
    }, 0);
    return () => {
      window.clearTimeout(restoration);
      retireClientRequestScope(
        ownership,
        responseScope,
        scopeGeneration,
      );
      attemptRegistry.current = null;
      confirmedQuestionHandoffRef.current = false;
    };
  }, [preview, responseScope, sessionContext]);

  async function choose(responseType: RecordedChoice) {
    if (
      preview ||
      (responseType === "ask_question" &&
        confirmedQuestionHandoffRef.current)
    ) {
      return;
    }
    const registry = attemptRegistry.current;
    if (!registry || recoveryBlocked || sessionReloadRequired) return;
    const unresolved = registry.pending();
    if (unresolved && unresolved.responseType !== responseType) return;
    const requestOwner = beginOwnedClientRequest(
      requestOwnershipRef.current,
      responseScope,
    );
    if (!requestOwner) return;
    setSaving(responseType);
    setMessage("");
    setIsError(false);
    let mailtoHandoffUri: string | null = null;

    try {
      const attemptKey = registry.keyFor(responseType);
      setPendingChoice(responseType);
      const result = await requestGolferResponse(
        responseType,
        attemptKey,
        sessionContext ?? "",
      );
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
      registry.settle(responseType, attemptKey, result.kind);
      if (registry.recovery().kind === "blocked") {
        setRecoveryBlocked(true);
        setIsError(true);
        setMessage(BLOCKED_RECOVERY_MESSAGE);
        return;
      }
      setPendingChoice(registry.pending()?.responseType ?? null);

      if (result.kind === "outcome_unknown") {
        setIsError(true);
        setMessage(
          clientMutationReferenceMessage(
            OUTCOME_UNKNOWN_MESSAGE,
            result.requestId,
          ),
        );
        return;
      }
      if (result.kind === "rejected") {
        setIsError(true);
        if (golferResponseRequiresSessionReload(result)) {
          setSessionReloadRequired(true);
          setMessage(
            clientMutationReferenceMessage(
              SESSION_RELOAD_REQUIRED_MESSAGE,
              result.requestId,
            ),
          );
        } else {
          setMessage(
            clientMutationReferenceMessage(result.message, result.requestId),
          );
        }
        return;
      }

      if (responseType === "ask_question" && coachMailtoUri) {
        confirmedQuestionHandoffRef.current = true;
        setConfirmedQuestionHandoff(true);
        mailtoHandoffUri = coachMailtoUri;
      }
      setMessage(
        responseType === "ask_question" && !coachMailtoUri
          ? "Your earlier question choice was confirmed. Coach contact is not currently available, so Roadmap did not open an email app or send a message."
          : CONFIRMATIONS[responseType],
      );
    } catch {
      if (!ownsClientRequest(requestOwnershipRef.current, requestOwner)) return;
      const recovery = registry.recovery();
      if (recovery.kind === "blocked") {
        setRecoveryBlocked(true);
      }
      const pending = registry.pending();
      setPendingChoice(pending?.responseType ?? null);
      setIsError(true);
      setMessage(
        recovery.kind === "blocked"
          ? BLOCKED_RECOVERY_MESSAGE
          : pending
            ? OUTCOME_UNKNOWN_MESSAGE
            : CLIENT_FAILURE_MESSAGE,
      );
    } finally {
      if (ownsClientRequest(requestOwnershipRef.current, requestOwner)) {
        setSaving(null);
      }
    }

    if (
      mailtoHandoffUri &&
      ownsClientRequest(requestOwnershipRef.current, requestOwner)
    ) {
      try {
        window.location.assign(mailtoHandoffUri);
      } catch {
        setMessage(
          "Your question choice was recorded. Roadmap could not open your email app automatically; use the email link below. Roadmap has not sent a message.",
        );
      }
    }
  }

  function choiceDisabled(responseType: RecordedChoice): boolean {
    return (
      preview ||
      !recoveryReady ||
      recoveryBlocked ||
      sessionReloadRequired ||
      saving !== null ||
      (responseType === "ask_question" && confirmedQuestionHandoff) ||
      (pendingChoice !== null && pendingChoice !== responseType)
    );
  }

  function choiceDescription(responseType: RecordedChoice): string | undefined {
    return pendingChoice === responseType ? responseStatusId : undefined;
  }

  const statusMessage = saving ? SAVING_MESSAGE : message;

  return (
    <div className={styles.choicePanel} aria-labelledby="golfer-choice-heading">
      <div>
        <span>Choose without pressure</span>
        <h3 id="golfer-choice-heading">What would you like to do next?</h3>
        <p>
          {preview
            ? `Preview only: these are the choices the golfer will receive. Controls are disabled and nothing is recorded for ${coachName}.`
            : `Roadmap records only the choice below for ${coachName} to review. It does not send a message or treat an external visit as a sale.`}
        </p>
      </div>
      <div
        className={styles.choiceButtons}
        aria-busy={!recoveryReady || saving !== null}
      >
        {externalActionUrl && preview ? (
          <button
            className={styles.primaryChoice}
            type="button"
            disabled
          >
            Continue to the coach’s external page
          </button>
        ) : null}
        {externalActionUrl && !preview ? (
          <a
            aria-describedby={externalHandoffNoteId}
            className={styles.primaryChoice}
            href={externalActionUrl}
            rel="external noreferrer"
            onClick={() => {
              if (
                sessionContext &&
                recoveryReady &&
                !recoveryBlocked &&
                !sessionReloadRequired &&
                pendingChoice === null &&
                saving === null
              ) {
                attemptExternalHandoffRecord(sessionContext);
              }
            }}
          >
            Continue to the coach’s external page
          </a>
        ) : null}
        {coachMailtoUri || pendingChoice === "ask_question" ? (
          <button
            type="button"
            aria-describedby={choiceDescription("ask_question")}
            disabled={choiceDisabled("ask_question")}
            onClick={() => choose("ask_question")}
          >
            {confirmedQuestionHandoff
              ? "Question choice recorded"
              : coachMailtoUri
              ? `Ask ${coachName} a question`
              : "Resolve earlier question choice"}
          </button>
        ) : null}
        {confirmedQuestionHandoff && coachMailtoUri ? (
          <a href={coachMailtoUri} aria-describedby={responseStatusId}>
            Open your email app
          </a>
        ) : null}
        <button
          type="button"
          aria-describedby={choiceDescription("wait")}
          disabled={choiceDisabled("wait")}
          onClick={() => choose("wait")}
        >
          Review later
        </button>
        <button
          type="button"
          aria-describedby={choiceDescription("request_reassessment")}
          disabled={choiceDisabled("request_reassessment")}
          onClick={() => choose("request_reassessment")}
        >
          Request reassessment
        </button>
        <button
          type="button"
          aria-describedby={choiceDescription("independent_practice")}
          disabled={choiceDisabled("independent_practice")}
          onClick={() => choose("independent_practice")}
        >
          Practise independently
        </button>
        <button
          type="button"
          aria-describedby={choiceDescription("decline")}
          disabled={choiceDisabled("decline")}
          onClick={() => choose("decline")}
        >
          Not pursuing this option
        </button>
      </div>
      {externalActionUrl && !preview ? (
        <p id={externalHandoffNoteId} className={styles.externalTrackingNote}>
          {!recoveryReady ||
          recoveryBlocked ||
          sessionReloadRequired ||
          pendingChoice !== null
            ? "This link still opens the coach's external service, but Roadmap will not add a tracking record while response recovery is unresolved. The handoff is never blocked."
            : "This link always opens the coach's external service. Roadmap makes a best-effort record that you opened it, but a tracking or network failure will not block the handoff. Booking or payment is complete only when the external service confirms it."}
        </p>
      ) : null}
      {statusMessage ? (
        <p
          id={responseStatusId}
          className={isError ? styles.choiceError : styles.choiceStatus}
          role={isError && !saving ? "alert" : "status"}
          aria-atomic="true"
          aria-live={isError && !saving ? "assertive" : "polite"}
        >
          {statusMessage}
        </p>
      ) : null}
      {sessionReloadRequired ? (
        <p className={styles.choiceStatus}>
          <a href="">Reload roadmap status</a>{" "}
          <a href="/r">Open the private-link access page</a>
        </p>
      ) : null}
    </div>
  );
}
