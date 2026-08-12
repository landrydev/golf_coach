"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AuthoringDraftRecovery,
  type AuthoringDraftUiState,
} from "@/components/forms/AuthoringDraftRecovery";
import {
  discardAuthoringDraft,
  reconcileAuthoringDraft,
  type AuthoringDraftScope,
} from "@/lib/client-authoring-draft-recovery";

/**
 * Makes an unknown-outcome staged-completion draft visible on its destination
 * page. The coach view does not expose the linked package's exact identifier,
 * so this resolver deliberately supplies no inferred applied state: a draft
 * not cleared by an exact success receipt remains diverged for explicit review.
 */
export function StagedCompletionDraftResolution({
  recoveryScope,
  planId,
  planRevision,
  noticeClassName,
  actionsClassName,
  buttonClassName,
}: {
  recoveryScope: string;
  planId: string;
  planRevision: number;
  noticeClassName?: string;
  actionsClassName?: string;
  buttonClassName?: string;
}) {
  const [state, setState] = useState<AuthoringDraftUiState>({ kind: "checking" });
  const scope = useMemo<AuthoringDraftScope>(
    () => ({
      accountScope: recoveryScope,
      resourceId: planId,
      action: "staged_plan_complete",
    }),
    [planId, recoveryScope],
  );
  const currentState = useMemo(
    () => ({
      authoringState: "complete",
      planId,
      revision: planRevision,
      exactPackageIdentityAvailable: false,
    }),
    [planId, planRevision],
  );

  useEffect(() => {
    let current = true;
    void reconcileAuthoringDraft({
      scope,
      currentRevision: planRevision,
      currentState,
    }).then((result) => {
      if (current) setState(result);
    });
    return () => {
      current = false;
    };
  }, [currentState, planRevision, scope]);

  return (
    <AuthoringDraftRecovery
      state={state}
      label="staged roadmap"
      noticeClassName={noticeClassName}
      actionsClassName={actionsClassName}
      buttonClassName={buttonClassName}
      onDiscard={() => {
        if (!discardAuthoringDraft(scope)) {
          setState({ kind: "blocked", reason: "unavailable" });
          return;
        }
        setState({ kind: "empty" });
      }}
    />
  );
}
