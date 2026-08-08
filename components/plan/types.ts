export type PlanViewModel = {
  coach: {
    displayName: string;
    businessName?: string | null;
    contactEmail?: string | null;
    accentColor?: string | null;
  };
  golfer: { displayName: string; status?: string };
  plan: {
    id: string;
    title: string;
    status: string;
    revision: number;
    updatedAt: number;
    publishedAt?: number | null;
  };
  goal: {
    statement: string;
    why?: string | null;
    context?: string | null;
  };
  assessment: {
    summary: string;
    strengths?: string | null;
    primaryPattern?: string | null;
    limitations: string;
  };
  priority?: {
    title: string;
    rationale: string;
  } | null;
  phases: Array<{
    id: string;
    number: number;
    title: string;
    purpose: string;
    rationale?: string | null;
    progressSignals: string[];
    expectations?: string | null;
    estimatedDuration?: string | null;
    status: string;
  }>;
  lessons: Array<{
    id: string;
    title: string;
    summary: string;
    coachObservation?: string | null;
    takeaway?: string | null;
    nextCheck?: string | null;
    happenedAt?: number | null;
  }>;
  practiceItems: Array<{
    id: string;
    title: string;
    instructions: string;
    dosage?: string | null;
    successSignal?: string | null;
    status: string;
  }>;
  evidenceItems: Array<{
    id: string;
    title: string;
    summary: string;
    sourceLabel: string;
    sourceType: string;
    contextType: string;
    maturity: string;
    limitations?: string | null;
    nextEvidenceNeeded?: string | null;
    observedAt?: number | null;
  }>;
  phaseReview?: {
    summary: string;
    originalPurpose: string;
    evidenceSummary?: string | null;
    reliabilityLabel: string;
    limitations?: string | null;
    golferContribution?: string | null;
    coachConclusion: string;
    remainingOpportunity?: string | null;
    nextRecommendation?: string | null;
    decisionStatus?: string | null;
  } | null;
  coachingPackage?: {
    title: string;
    description: string;
    priceCents?: number | null;
    currency?: string | null;
    currentDetailsText?: string | null;
    terms?: string | null;
    inclusions: string[];
    cadence?: string | null;
    practiceExpectation?: string | null;
    evaluationDescription?: string | null;
    externalActionUrl: string;
  } | null;
  access?: {
    expiresAt?: number | null;
    sharedAt?: number | null;
  };
};
