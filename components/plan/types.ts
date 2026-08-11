export type PlanViewModel = {
  coach: {
    displayName: string;
    businessName?: string | null;
    contactEmail?: string | null;
    accentColor?: string | null;
    logoMediaAssetId?: string | null;
    profilePhotoMediaAssetId?: string | null;
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
    golferLearning?: string | null;
    phaseConnection?: string | null;
    status?: string;
    scheduledAt?: number | null;
    happenedAt?: number | null;
    selectedEvidence: Array<{
      id: string;
      title: string;
      evidenceType: string;
      summary: string;
    }>;
    selectedMeasurements: Array<{
      id: string;
      label: string;
      deviceSource: string;
      club?: string | null;
      sessionDate: number;
      coachInterpretation: string;
      metrics: Array<{
        displayName: string;
        numericValue: number;
        unit: string;
      }>;
    }>;
  }>;
  practiceItems: Array<{
    id: string;
    title: string;
    instructions: string;
    dosage?: string | null;
    successSignal?: string | null;
    status: string;
    purpose?: string | null;
    whenItFits?: string | null;
    equipment?: string[];
    setup?: string | null;
    steps?: string[];
    feelOrCue?: string | null;
    commonMiss?: string | null;
    stopOrAskRule?: string | null;
    constraintOrAdaptation?: string | null;
    progression?: string | null;
    regression?: string | null;
    dueAt?: number | null;
    checkIns?: Array<{
      id: string;
      completionStatus: "completed" | "not_completed";
      perceivedDifficulty?: string | null;
      confidenceRating?: number | null;
      note?: string | null;
      requestHelp: boolean;
      occurredAt: number;
    }>;
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
    evidenceType?: string;
    comparisonRole?: "standalone" | "baseline" | "current";
    comparisonGroupId?: string | null;
    metricName?: string | null;
    metricValue?: number | null;
    metricUnit?: string | null;
    valueText?: string | null;
    isRepresentative?: boolean;
    lessonId?: string | null;
    lessonTitle?: string | null;
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
    sources: Array<{
      id: string;
      sourceType: string;
      label: string;
      sourcePlanRevision?: number | null;
      summary?: string | null;
      associations: string[];
    }>;
  } | null;
  mediaItems?: Array<{
    attachmentId: string;
    mediaAssetId: string;
    mediaKind: "image" | "video" | "audio" | "document";
    mimeType: string;
    altText?: string | null;
    caption?: string | null;
    transcript?: string | null;
    widthPixels?: number | null;
    heightPixels?: number | null;
    durationMs?: number | null;
    capturedAt?: number | null;
    orientation?: string | null;
    viewLabel?: string | null;
    coachContext?: string | null;
    posterMediaAssetId?: string | null;
    targetType: string;
    targetLabel: string;
    role: string;
  }>;
  launchComparisons?: Array<{
    id: string;
    title: string;
    coachInterpretation: string;
    limitations: string;
    nextEvidenceNeeded?: string | null;
    metrics: Array<{
      displayName: string;
      unit: string;
      baselineValue: number;
      currentValue: number;
      delta: number;
    }>;
  }>;
  milestones?: Array<{
    id: string;
    title: string;
    summary: string;
    occurredAt: number;
  }>;
  timeline?: Array<{
    id: string;
    kind: string;
    title: string;
    summary?: string | null;
    status: string;
    occurredAt: number;
  }>;
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
