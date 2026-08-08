import { getOrCreateAccountForIdentity } from "@/lib/repository";
import { requireApiIdentity } from "@/lib/identity";
import {
  assertSameOrigin,
  cleanText,
  errorResponse,
  readJson,
  RequestError,
} from "@/lib/http";
import {
  addCompletedLesson,
  addEvidenceItem,
  addPhaseReview,
  addPracticeItem,
} from "@/lib/plan-content";

type ContentPayload = Record<string, unknown> & { kind?: unknown; phaseId?: unknown };

export async function POST(
  request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  try {
    assertSameOrigin(request);
    const authentication = await requireApiIdentity();
    if (authentication.response) return authentication.response;
    const account = await getOrCreateAccountForIdentity(authentication.identity);
    const { planId } = await context.params;
    const payload = await readJson<ContentPayload>(request);
    const kind = cleanText(payload.kind, "kind", { required: true, max: 40 });
    const phaseId = cleanText(payload.phaseId, "phaseId", { required: true, max: 80 });
    const expectedRevision = positiveInteger(payload.expectedRevision, "expectedRevision");
    const mutationContext = {
      accountId: account.id,
      planId,
      expectedRevision,
      requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
    };
    let id: string;
    let planStatus: "draft" | "paused" | "completed" | null = null;

    if (kind === "lesson") {
      id = await addCompletedLesson(mutationContext, {
        phaseId,
        title: required(payload.title, "title", 160),
        purpose: required(payload.purpose, "purpose", 2_000),
        coachObservation: optional(payload.coachObservation, "coachObservation", 2_000),
        takeaway: optional(payload.takeaway, "takeaway", 1_000),
        nextCheck: optional(payload.nextCheck, "nextCheck", 1_000),
        phaseConnection: optional(payload.phaseConnection, "phaseConnection", 1_000),
        occurredAt: parseDate(payload.occurredAt, "occurredAt", true)!,
      });
    } else if (kind === "practice") {
      const instructionsText = required(payload.instructions, "instructions", 4_000);
      const instructions = instructionsText
        .split(/\n+/)
        .map((value) => value.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
        .filter(Boolean);
      if (instructions.length < 1 || instructions.length > 12) {
        throw new RequestError(400, "invalid_instructions", "Provide 1 to 12 practice steps.");
      }
      id = await addPracticeItem(mutationContext, {
        phaseId,
        title: required(payload.title, "title", 160),
        objective: required(payload.objective, "objective", 1_500),
        rationale: required(payload.rationale, "rationale", 1_500),
        instructions,
        timeOrCadence: optional(payload.timeOrCadence, "timeOrCadence", 500),
        successCheck: required(payload.successCheck, "successCheck", 1_000),
        commonMistake: optional(payload.commonMistake, "commonMistake", 1_000),
        stopOrAskRule: required(payload.stopOrAskRule, "stopOrAskRule", 1_000),
        constraintNote: optional(payload.constraintNote, "constraintNote", 1_000),
      });
    } else if (kind === "evidence") {
      const evidenceType = enumValue(payload.evidenceType, "evidenceType", [
        "coach_observation",
        "golfer_report",
        "measurement",
        "outcome_count",
        "comparison",
        "note",
      ] as const);
      const contextType = enumValue(payload.contextType, "contextType", [
        "assessment",
        "lesson",
        "practice",
        "on_course",
        "phase_review",
        "other",
      ] as const);
      const sourceType = enumValue(payload.sourceType, "sourceType", [
        "coach_observed",
        "golfer_reported",
        "device",
        "document",
        "mixed",
      ] as const);
      const maturity = enumValue(payload.maturity, "maturity", [
        "single_observation",
        "early_indication",
        "repeated_practice",
        "on_course_observation",
        "insufficient",
      ] as const);
      id = await addEvidenceItem(mutationContext, {
        phaseId,
        evidenceType,
        contextType,
        title: required(payload.title, "title", 160),
        claim: optional(payload.claim, "claim", 1_500),
        sourceLabel: required(payload.sourceLabel, "sourceLabel", 300),
        sourceType,
        observedAt: parseDate(payload.observedAt, "observedAt", false),
        interpretation: required(payload.interpretation, "interpretation", 2_000),
        limitation: required(payload.limitation, "limitation", 1_500),
        maturity,
        nextEvidenceNeeded: optional(payload.nextEvidenceNeeded, "nextEvidenceNeeded", 1_000),
      });
    } else if (kind === "review") {
      const transition = enumValue(payload.transition, "transition", [
        "continue",
        "pause",
        "advance",
        "complete_plan",
      ] as const);
      const outcome = enumValue(payload.outcome, "outcome", [
        "complete",
        "partially_complete",
        "paused",
        "revised",
        "insufficient_evidence",
        "goal_changed",
      ] as const);
      const review = await addPhaseReview(mutationContext, {
        phaseId,
        transition,
        outcome,
        originalPurpose: required(payload.originalPurpose, "originalPurpose", 1_500),
        baselineSummary: required(payload.baselineSummary, "baselineSummary", 1_500),
        workCompleted: required(payload.workCompleted, "workCompleted", 2_000),
        changeSummary: required(payload.changeSummary, "changeSummary", 2_000),
        reliabilityLabel: required(payload.reliabilityLabel, "reliabilityLabel", 500),
        limitations: required(payload.limitations, "limitations", 1_500),
        golferContribution: optional(payload.golferContribution, "golferContribution", 1_500),
        coachConclusion: required(payload.coachConclusion, "coachConclusion", 2_000),
        remainingOpportunity: optional(payload.remainingOpportunity, "remainingOpportunity", 1_500),
        nextPhaseRationale: optional(payload.nextPhaseRationale, "nextPhaseRationale", 1_500),
        independentPracticeAlternative: optional(
          payload.independentPracticeAlternative,
          "independentPracticeAlternative",
          1_500,
        ),
        nextPhaseId: optional(payload.nextPhaseId, "nextPhaseId", 80),
        nextPriorityTitle: optional(payload.nextPriorityTitle, "nextPriorityTitle", 160),
        nextPriorityRationale: optional(
          payload.nextPriorityRationale,
          "nextPriorityRationale",
          1_500,
        ),
      });
      id = review.id;
      planStatus = review.planStatus;
    } else {
      throw new RequestError(400, "invalid_kind", "Unsupported plan content type.");
    }

    return Response.json(
      {
        item: { id, kind },
        plan: {
          revision: expectedRevision + 1,
          ...(planStatus ? { status: planStatus } : {}),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new RequestError(400, "invalid_field", `${field} must be a positive integer.`);
  }
  return value;
}

function required(value: unknown, field: string, max: number): string {
  return cleanText(value, field, { required: true, max });
}

function optional(value: unknown, field: string, max: number): string | null {
  return cleanText(value, field, { max }) || null;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  const text = required(value, field, 80);
  if (!allowed.includes(text)) {
    throw new RequestError(400, "invalid_field", `${field} is not allowed.`);
  }
  return text as T[number];
}

function parseDate(value: unknown, field: string, requiredValue: boolean): Date | null {
  const text = cleanText(value, field, { required: requiredValue, max: 40 });
  if (!text) return null;
  const date = new Date(`${text}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new RequestError(400, "invalid_field", `${field} must be a valid date.`);
  }
  if (date.getTime() > Date.now() + 86_400_000) {
    throw new RequestError(400, "invalid_field", `${field} cannot be in the future.`);
  }
  return date;
}
