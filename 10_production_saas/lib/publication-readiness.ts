import type { PlanViewModel } from "../components/plan/types.ts";
import { isPublicHostname, RequestError } from "./http.ts";

export type PublicationBlocker = {
  code: string;
  message: string;
};

export function publicationBlockers(model: PlanViewModel): PublicationBlocker[] {
  const blockers: PublicationBlocker[] = [];
  const add = (code: string, message: string) => blockers.push({ code, message });

  if (!model.coach.displayName.trim()) add("coach_identity", "Coach identity is missing.");
  if (!model.golfer.displayName.trim()) add("golfer_identity", "Golfer identity is missing.");
  if (!model.goal.statement.trim()) add("goal", "The golfer goal is missing.");
  if (!model.assessment.summary.trim()) add("assessment", "The starting assessment is missing.");
  if (!model.assessment.strengths?.trim()) {
    add("assessment_strength", "Record at least one strength to preserve.");
  }
  if (!model.assessment.primaryPattern?.trim()) {
    add("assessment_pattern", "Record the primary observed pattern.");
  }
  if (!model.assessment.limitations.trim()) {
    add("assessment_limits", "Record the assessment and evidence limits.");
  }
  const lifecycleReviewCanReplaceCurrentPriority =
    ["paused", "completed"].includes(model.plan.status) &&
    Boolean(model.phaseReview);
  if (
    (!model.priority?.title.trim() || !model.priority.rationale.trim()) &&
    !lifecycleReviewCanReplaceCurrentPriority
  ) {
    add("priority", "Record the current priority barrier and why it comes first.");
  }

  if (![3, 4].includes(model.phases.length)) {
    add("phase_count", "The roadmap must contain three or four directional phases.");
  }
  if (model.phases.some((phase, index) => phase.number !== index + 1)) {
    add("phase_order", "Roadmap phases must be ordered consecutively from Phase 1.");
  }
  if (model.phases.some((phase) => !phase.title.trim() || !phase.purpose.trim())) {
    add("phase_content", "Every roadmap phase needs a title and purpose.");
  }
  const firstPhase = model.phases[0];
  if (!firstPhase?.rationale?.trim()) {
    add("first_phase_rationale", "Explain why the first phase leads the roadmap.");
  }
  if (!firstPhase || firstPhase.progressSignals.length === 0) {
    add("first_phase_signals", "Record at least one observable first-phase progress signal.");
  }

  const coachingPackage = model.coachingPackage;
  if (coachingPackage) {
    if (!coachingPackage.description.trim()) {
      add("package_fit", "Explain why the attached package fits this phase.");
    }
    if (coachingPackage.inclusions.length === 0) {
      add("package_inclusions", "List the material package inclusions.");
    }
    if (!coachingPackage.terms?.trim()) {
      add("package_terms", "Record the current package terms.");
    }
    if (
      coachingPackage.priceCents == null &&
      !coachingPackage.currentDetailsText?.trim()
    ) {
      add("package_price", "Record an exact package price or truthful current-details message.");
    }
    if (!isSafeExternalUrl(coachingPackage.externalActionUrl)) {
      add(
        "package_action",
        "Verify a public HTTPS external package action without embedded credentials.",
      );
    }
  }

  return blockers;
}

export function assertPublicationReady(model: PlanViewModel): void {
  const blockers = publicationBlockers(model);
  if (blockers.length === 0) return;

  const visible = blockers.slice(0, 3).map((blocker) => blocker.message).join(" ");
  const remainder = blockers.length - 3;
  throw new RequestError(
    409,
    "plan_not_ready",
    `${visible}${remainder > 0 ? ` ${remainder} more item${remainder === 1 ? "" : "s"} need review.` : ""}`,
  );
}

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      isPublicHostname(url.hostname)
    );
  } catch {
    return false;
  }
}
