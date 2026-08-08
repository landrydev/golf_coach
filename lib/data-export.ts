import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  assessments,
  auditEvents,
  coachingPackages,
  consentRecords,
  dataRequests,
  developmentPlans,
  evidenceItems,
  golferGoals,
  golferPlanResponses,
  golfers,
  instructorProfiles,
  lessons,
  mediaAssets,
  phasePriorities,
  phaseReviewEvidence,
  phaseReviews,
  planPhases,
  planPriorities,
  practiceItems,
  shareLinks,
  subscriptions,
} from "@/db/schema";
import { RequestError } from "@/lib/http";
import { newId } from "@/lib/tokens";

const EXPORT_VERSION = "roadmap-instructor-export.v1";
const MAX_COLLECTION_RECORDS = 250;
const MAX_TOTAL_RECORDS = 1_000;
const MAX_EXPORT_BYTES = 6 * 1024 * 1024;

export type InstructorDataExport = {
  kind: "download";
  body: string;
  byteSize: number;
  filename: string;
  recordCount: number;
  requestRecordId: string;
};

export type DeferredInstructorDataExport = {
  kind: "manual_request";
  created: boolean;
  request: {
    id: string;
    type: "export";
    status: "submitted" | "identity_verification_required" | "verified" | "in_progress";
    createdAt: number;
    updatedAt: number;
  };
};

/**
 * Build a bounded, tenant-scoped portability export from explicit column
 * allowlists. Security audit rows, billing-event rows, provider identifiers,
 * storage keys/hashes, and share-token fingerprints are intentionally absent.
 */
export async function createInstructorDataExport(input: {
  accountId: string;
  requestId?: string | null;
}): Promise<InstructorDataExport | DeferredInstructorDataExport> {
  const db = getDb();
  const [account] = await db
    .select({
      id: accounts.id,
      primaryEmail: accounts.primaryEmail,
      status: accounts.status,
      locale: accounts.locale,
      timezone: accounts.timezone,
      deletionScheduledAt: accounts.deletionScheduledAt,
      deletedAt: accounts.deletedAt,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
    })
    .from(accounts)
    .where(eq(accounts.id, input.accountId))
    .limit(1);
  if (!account) {
    throw new RequestError(404, "account_not_found", "Account not found.");
  }

  // Count first so an already-oversized tenant never materializes thousands of
  // large text rows just to discover that synchronous delivery is unsafe.
  if (await exceedsImmediateExportRecordBounds(input.accountId)) {
    return queueDeferredInstructorDataExport(input);
  }

  const [
    profileRows,
    subscriptionRows,
    mediaRows,
    packageRows,
    golferRows,
    planRows,
    goalRows,
    assessmentRows,
    priorityRows,
    phaseRows,
    phasePriorityRows,
    lessonRows,
    practiceRows,
    evidenceRows,
    reviewRows,
    reviewEvidenceRows,
    shareRows,
    responseRows,
    consentRows,
    requestRows,
  ] = await db.batch([
    db
      .select({
        displayName: instructorProfiles.displayName,
        businessName: instructorProfiles.businessName,
        professionalTitle: instructorProfiles.professionalTitle,
        philosophy: instructorProfiles.philosophy,
        contactEmail: instructorProfiles.contactEmail,
        contactPhone: instructorProfiles.contactPhone,
        websiteUrl: instructorProfiles.websiteUrl,
        provinceOrTerritory: instructorProfiles.provinceOrTerritory,
        city: instructorProfiles.city,
        accentColor: instructorProfiles.accentColor,
        logoMediaAssetId: instructorProfiles.logoMediaAssetId,
        profilePhotoMediaAssetId: instructorProfiles.profilePhotoMediaAssetId,
        setupCompletedAt: instructorProfiles.setupCompletedAt,
        createdAt: instructorProfiles.createdAt,
        updatedAt: instructorProfiles.updatedAt,
      })
      .from(instructorProfiles)
      .where(eq(instructorProfiles.accountId, input.accountId))
      .limit(1),
    db
      .select({
        id: subscriptions.id,
        productCode: subscriptions.productCode,
        status: subscriptions.status,
        billingInterval: subscriptions.billingInterval,
        currency: subscriptions.currency,
        unitAmountMinor: subscriptions.unitAmountMinor,
        trialStartsAt: subscriptions.trialStartsAt,
        trialEndsAt: subscriptions.trialEndsAt,
        currentPeriodStartsAt: subscriptions.currentPeriodStartsAt,
        currentPeriodEndsAt: subscriptions.currentPeriodEndsAt,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        cancelRequestedAt: subscriptions.cancelRequestedAt,
        canceledAt: subscriptions.canceledAt,
        pauseStartsAt: subscriptions.pauseStartsAt,
        pauseEndsAt: subscriptions.pauseEndsAt,
        endedAt: subscriptions.endedAt,
        createdAt: subscriptions.createdAt,
        updatedAt: subscriptions.updatedAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.accountId, input.accountId))
      .orderBy(asc(subscriptions.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: mediaAssets.id,
        status: mediaAssets.status,
        mediaKind: mediaAssets.mediaKind,
        mimeType: mediaAssets.mimeType,
        originalFilename: mediaAssets.originalFilename,
        byteSize: mediaAssets.byteSize,
        widthPixels: mediaAssets.widthPixels,
        heightPixels: mediaAssets.heightPixels,
        durationMs: mediaAssets.durationMs,
        altText: mediaAssets.altText,
        caption: mediaAssets.caption,
        transcript: mediaAssets.transcript,
        uploadedAt: mediaAssets.uploadedAt,
        processedAt: mediaAssets.processedAt,
        deletedAt: mediaAssets.deletedAt,
        createdAt: mediaAssets.createdAt,
        updatedAt: mediaAssets.updatedAt,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.accountId, input.accountId))
      .orderBy(asc(mediaAssets.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: coachingPackages.id,
        name: coachingPackages.name,
        purpose: coachingPackages.purpose,
        fitDescription: coachingPackages.fitDescription,
        status: coachingPackages.status,
        currency: coachingPackages.currency,
        priceAmountMinor: coachingPackages.priceAmountMinor,
        currentDetailsText: coachingPackages.currentDetailsText,
        inclusions: coachingPackages.inclusions,
        cadence: coachingPackages.cadence,
        practiceExpectation: coachingPackages.practiceExpectation,
        evaluationDescription: coachingPackages.evaluationDescription,
        termsSummary: coachingPackages.termsSummary,
        externalActionType: coachingPackages.externalActionType,
        externalActionLabel: coachingPackages.externalActionLabel,
        externalActionUrl: coachingPackages.externalActionUrl,
        externalActionVerifiedAt: coachingPackages.externalActionVerifiedAt,
        isDefault: coachingPackages.isDefault,
        archivedAt: coachingPackages.archivedAt,
        createdAt: coachingPackages.createdAt,
        updatedAt: coachingPackages.updatedAt,
      })
      .from(coachingPackages)
      .where(eq(coachingPackages.accountId, input.accountId))
      .orderBy(asc(coachingPackages.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: golfers.id,
        displayName: golfers.displayName,
        preferredName: golfers.preferredName,
        contactEmail: golfers.contactEmail,
        externalReference: golfers.externalReference,
        status: golfers.status,
        eligibilityStatus: golfers.eligibilityStatus,
        eligibilityConfirmedAt: golfers.eligibilityConfirmedAt,
        lastActivityAt: golfers.lastActivityAt,
        archivedAt: golfers.archivedAt,
        deletionScheduledAt: golfers.deletionScheduledAt,
        deletedAt: golfers.deletedAt,
        createdAt: golfers.createdAt,
        updatedAt: golfers.updatedAt,
      })
      .from(golfers)
      .where(eq(golfers.accountId, input.accountId))
      .orderBy(asc(golfers.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: developmentPlans.id,
        golferId: developmentPlans.golferId,
        title: developmentPlans.title,
        status: developmentPlans.status,
        revision: developmentPlans.revision,
        approvedRevision: developmentPlans.approvedRevision,
        publishedRevision: developmentPlans.publishedRevision,
        welcomeNote: developmentPlans.welcomeNote,
        assessmentContext: developmentPlans.assessmentContext,
        currentCoachNote: developmentPlans.currentCoachNote,
        currentCoachNoteAt: developmentPlans.currentCoachNoteAt,
        privateContextLabel: developmentPlans.privateContextLabel,
        coachApprovedAt: developmentPlans.coachApprovedAt,
        previewedAt: developmentPlans.previewedAt,
        publishedAt: developmentPlans.publishedAt,
        lastSharedAt: developmentPlans.lastSharedAt,
        pausedAt: developmentPlans.pausedAt,
        completedAt: developmentPlans.completedAt,
        archivedAt: developmentPlans.archivedAt,
        createdAt: developmentPlans.createdAt,
        updatedAt: developmentPlans.updatedAt,
      })
      .from(developmentPlans)
      .where(eq(developmentPlans.accountId, input.accountId))
      .orderBy(asc(developmentPlans.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: golferGoals.id,
        golferId: golferGoals.golferId,
        planId: golferGoals.planId,
        desiredOutcome: golferGoals.desiredOutcome,
        whyItMatters: golferGoals.whyItMatters,
        context: golferGoals.context,
        constraints: golferGoals.constraints,
        scoreOrHandicapContext: golferGoals.scoreOrHandicapContext,
        targetDate: golferGoals.targetDate,
        status: golferGoals.status,
        isPrimary: golferGoals.isPrimary,
        confirmedByGolferAt: golferGoals.confirmedByGolferAt,
        coachApprovedAt: golferGoals.coachApprovedAt,
        achievedAt: golferGoals.achievedAt,
        revisedAt: golferGoals.revisedAt,
        archivedAt: golferGoals.archivedAt,
        createdAt: golferGoals.createdAt,
        updatedAt: golferGoals.updatedAt,
      })
      .from(golferGoals)
      .where(eq(golferGoals.accountId, input.accountId))
      .orderBy(asc(golferGoals.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: assessments.id,
        planId: assessments.planId,
        title: assessments.title,
        status: assessments.status,
        assessedAt: assessments.assessedAt,
        context: assessments.context,
        startingPoint: assessments.startingPoint,
        strengthSummary: assessments.strengthSummary,
        primaryPattern: assessments.primaryPattern,
        limitations: assessments.limitations,
        coachApprovedAt: assessments.coachApprovedAt,
        supersededAt: assessments.supersededAt,
        archivedAt: assessments.archivedAt,
        createdAt: assessments.createdAt,
        updatedAt: assessments.updatedAt,
      })
      .from(assessments)
      .where(eq(assessments.accountId, input.accountId))
      .orderBy(asc(assessments.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: planPriorities.id,
        planId: planPriorities.planId,
        assessmentId: planPriorities.assessmentId,
        title: planPriorities.title,
        description: planPriorities.description,
        rationale: planPriorities.rationale,
        status: planPriorities.status,
        sortOrder: planPriorities.sortOrder,
        isCurrent: planPriorities.isCurrent,
        coachApprovedAt: planPriorities.coachApprovedAt,
        resolvedAt: planPriorities.resolvedAt,
        archivedAt: planPriorities.archivedAt,
        createdAt: planPriorities.createdAt,
        updatedAt: planPriorities.updatedAt,
      })
      .from(planPriorities)
      .where(eq(planPriorities.accountId, input.accountId))
      .orderBy(asc(planPriorities.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: planPhases.id,
        planId: planPhases.planId,
        coachingPackageId: planPhases.coachingPackageId,
        sequence: planPhases.sequence,
        title: planPhases.title,
        purpose: planPhases.purpose,
        rationale: planPhases.rationale,
        progressSignals: planPhases.progressSignals,
        expectations: planPhases.expectations,
        estimatedDuration: planPhases.estimatedDuration,
        status: planPhases.status,
        isRecommended: planPhases.isRecommended,
        coachApprovedAt: planPhases.coachApprovedAt,
        startedAt: planPhases.startedAt,
        pausedAt: planPhases.pausedAt,
        completedAt: planPhases.completedAt,
        revisedAt: planPhases.revisedAt,
        canceledAt: planPhases.canceledAt,
        createdAt: planPhases.createdAt,
        updatedAt: planPhases.updatedAt,
      })
      .from(planPhases)
      .where(eq(planPhases.accountId, input.accountId))
      .orderBy(asc(planPhases.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        phaseId: phasePriorities.phaseId,
        priorityId: phasePriorities.priorityId,
        sortOrder: phasePriorities.sortOrder,
        createdAt: phasePriorities.createdAt,
      })
      .from(phasePriorities)
      .where(eq(phasePriorities.accountId, input.accountId))
      .orderBy(asc(phasePriorities.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: lessons.id,
        planId: lessons.planId,
        phaseId: lessons.phaseId,
        sequence: lessons.sequence,
        title: lessons.title,
        status: lessons.status,
        purpose: lessons.purpose,
        coachObservation: lessons.coachObservation,
        golferLearning: lessons.golferLearning,
        takeaway: lessons.takeaway,
        nextCheck: lessons.nextCheck,
        phaseConnection: lessons.phaseConnection,
        scheduledAt: lessons.scheduledAt,
        occurredAt: lessons.occurredAt,
        coachApprovedAt: lessons.coachApprovedAt,
        completedAt: lessons.completedAt,
        canceledAt: lessons.canceledAt,
        archivedAt: lessons.archivedAt,
        createdAt: lessons.createdAt,
        updatedAt: lessons.updatedAt,
      })
      .from(lessons)
      .where(eq(lessons.accountId, input.accountId))
      .orderBy(asc(lessons.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: practiceItems.id,
        planId: practiceItems.planId,
        phaseId: practiceItems.phaseId,
        lessonId: practiceItems.lessonId,
        title: practiceItems.title,
        status: practiceItems.status,
        objective: practiceItems.objective,
        rationale: practiceItems.rationale,
        instructions: practiceItems.instructions,
        timeOrCadence: practiceItems.timeOrCadence,
        successCheck: practiceItems.successCheck,
        commonMistake: practiceItems.commonMistake,
        stopOrAskRule: practiceItems.stopOrAskRule,
        constraintNote: practiceItems.constraintNote,
        startsAt: practiceItems.startsAt,
        dueAt: practiceItems.dueAt,
        coachApprovedAt: practiceItems.coachApprovedAt,
        completedAt: practiceItems.completedAt,
        retiredAt: practiceItems.retiredAt,
        createdAt: practiceItems.createdAt,
        updatedAt: practiceItems.updatedAt,
      })
      .from(practiceItems)
      .where(eq(practiceItems.accountId, input.accountId))
      .orderBy(asc(practiceItems.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: evidenceItems.id,
        planId: evidenceItems.planId,
        assessmentId: evidenceItems.assessmentId,
        phaseId: evidenceItems.phaseId,
        lessonId: evidenceItems.lessonId,
        practiceItemId: evidenceItems.practiceItemId,
        mediaAssetId: evidenceItems.mediaAssetId,
        status: evidenceItems.status,
        evidenceType: evidenceItems.evidenceType,
        contextType: evidenceItems.contextType,
        title: evidenceItems.title,
        claim: evidenceItems.claim,
        sourceLabel: evidenceItems.sourceLabel,
        sourceType: evidenceItems.sourceType,
        observedAt: evidenceItems.observedAt,
        comparisonRole: evidenceItems.comparisonRole,
        comparisonGroupId: evidenceItems.comparisonGroupId,
        metricName: evidenceItems.metricName,
        metricValue: evidenceItems.metricValue,
        metricUnit: evidenceItems.metricUnit,
        valueText: evidenceItems.valueText,
        interpretation: evidenceItems.interpretation,
        limitation: evidenceItems.limitation,
        maturity: evidenceItems.maturity,
        nextEvidenceNeeded: evidenceItems.nextEvidenceNeeded,
        isRepresentative: evidenceItems.isRepresentative,
        coachApprovedAt: evidenceItems.coachApprovedAt,
        withdrawnAt: evidenceItems.withdrawnAt,
        archivedAt: evidenceItems.archivedAt,
        createdAt: evidenceItems.createdAt,
        updatedAt: evidenceItems.updatedAt,
      })
      .from(evidenceItems)
      .where(eq(evidenceItems.accountId, input.accountId))
      .orderBy(asc(evidenceItems.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: phaseReviews.id,
        planId: phaseReviews.planId,
        phaseId: phaseReviews.phaseId,
        nextPhaseId: phaseReviews.nextPhaseId,
        recommendedPackageId: phaseReviews.recommendedPackageId,
        status: phaseReviews.status,
        outcome: phaseReviews.outcome,
        originalPurpose: phaseReviews.originalPurpose,
        baselineSummary: phaseReviews.baselineSummary,
        workCompleted: phaseReviews.workCompleted,
        changeSummary: phaseReviews.changeSummary,
        reliabilityLabel: phaseReviews.reliabilityLabel,
        limitations: phaseReviews.limitations,
        golferContribution: phaseReviews.golferContribution,
        coachConclusion: phaseReviews.coachConclusion,
        remainingOpportunity: phaseReviews.remainingOpportunity,
        nextPhaseRationale: phaseReviews.nextPhaseRationale,
        independentPracticeAlternative: phaseReviews.independentPracticeAlternative,
        confirmedAt: phaseReviews.confirmedAt,
        sharedAt: phaseReviews.sharedAt,
        supersededAt: phaseReviews.supersededAt,
        createdAt: phaseReviews.createdAt,
        updatedAt: phaseReviews.updatedAt,
      })
      .from(phaseReviews)
      .where(eq(phaseReviews.accountId, input.accountId))
      .orderBy(asc(phaseReviews.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        phaseReviewId: phaseReviewEvidence.phaseReviewId,
        evidenceItemId: phaseReviewEvidence.evidenceItemId,
        sortOrder: phaseReviewEvidence.sortOrder,
        createdAt: phaseReviewEvidence.createdAt,
      })
      .from(phaseReviewEvidence)
      .where(eq(phaseReviewEvidence.accountId, input.accountId))
      .orderBy(asc(phaseReviewEvidence.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: shareLinks.id,
        planId: shareLinks.planId,
        status: shareLinks.status,
        scope: shareLinks.scope,
        planRevision: shareLinks.planRevision,
        intendedRecipientContext: shareLinks.intendedRecipientContext,
        expiresAt: shareLinks.expiresAt,
        lastAccessedAt: shareLinks.lastAccessedAt,
        accessCount: shareLinks.accessCount,
        revokedAt: shareLinks.revokedAt,
        revokeReason: shareLinks.revokeReason,
        createdAt: shareLinks.createdAt,
        updatedAt: shareLinks.updatedAt,
      })
      .from(shareLinks)
      .where(eq(shareLinks.accountId, input.accountId))
      .orderBy(asc(shareLinks.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: golferPlanResponses.id,
        planId: golferPlanResponses.planId,
        shareLinkId: golferPlanResponses.shareLinkId,
        responseType: golferPlanResponses.responseType,
        note: golferPlanResponses.note,
        externalOutcomeObserved: golferPlanResponses.externalOutcomeObserved,
        occurredAt: golferPlanResponses.occurredAt,
        createdAt: golferPlanResponses.createdAt,
      })
      .from(golferPlanResponses)
      .where(eq(golferPlanResponses.accountId, input.accountId))
      .orderBy(asc(golferPlanResponses.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: consentRecords.id,
        golferId: consentRecords.golferId,
        subjectType: consentRecords.subjectType,
        scope: consentRecords.scope,
        status: consentRecords.status,
        policyVersion: consentRecords.policyVersion,
        purposeDescription: consentRecords.purposeDescription,
        captureMethod: consentRecords.captureMethod,
        grantedAt: consentRecords.grantedAt,
        declinedAt: consentRecords.declinedAt,
        withdrawnAt: consentRecords.withdrawnAt,
        expiresAt: consentRecords.expiresAt,
        createdAt: consentRecords.createdAt,
      })
      .from(consentRecords)
      .where(eq(consentRecords.accountId, input.accountId))
      .orderBy(asc(consentRecords.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
    db
      .select({
        id: dataRequests.id,
        golferId: dataRequests.golferId,
        requestType: dataRequests.requestType,
        requestedByType: dataRequests.requestedByType,
        status: dataRequests.status,
        details: dataRequests.details,
        identityVerifiedAt: dataRequests.identityVerifiedAt,
        dueAt: dataRequests.dueAt,
        deletionScheduledAt: dataRequests.deletionScheduledAt,
        fulfilledAt: dataRequests.fulfilledAt,
        canceledAt: dataRequests.canceledAt,
        failedAt: dataRequests.failedAt,
        createdAt: dataRequests.createdAt,
        updatedAt: dataRequests.updatedAt,
      })
      .from(dataRequests)
      .where(eq(dataRequests.accountId, input.accountId))
      .orderBy(asc(dataRequests.createdAt))
      .limit(MAX_COLLECTION_RECORDS + 1),
  ]);

  const collections = {
    subscriptions: subscriptionRows,
    mediaAssets: mediaRows,
    coachingPackages: packageRows,
    golfers: golferRows,
    developmentPlans: planRows,
    goals: goalRows,
    assessments: assessmentRows,
    priorities: priorityRows,
    phases: phaseRows,
    phasePriorities: phasePriorityRows,
    lessons: lessonRows,
    practiceItems: practiceRows,
    evidenceItems: evidenceRows,
    phaseReviews: reviewRows,
    phaseReviewEvidence: reviewEvidenceRows,
    shareLinks: shareRows,
    golferResponses: responseRows,
    consentRecords: consentRows,
    dataRequests: requestRows,
  };
  const collectionSizes = Object.values(collections).map((rows) => rows.length);
  if (collectionSizes.some((size) => size > MAX_COLLECTION_RECORDS)) {
    return queueDeferredInstructorDataExport(input);
  }
  const recordCount =
    1 + profileRows.length + collectionSizes.reduce((sum, size) => sum + size, 0);
  if (recordCount > MAX_TOTAL_RECORDS) {
    return queueDeferredInstructorDataExport(input);
  }

  const generatedAt = new Date();
  const requestRecordId = newId();
  const document = {
    exportVersion: EXPORT_VERSION,
    generatedAt: generatedAt.toISOString(),
    requestRecordId,
    scope: "authenticated_instructor_workspace",
    notes: [
      "This file contains structured product records for the signed-in instructor account only.",
      "Media file bytes are not included; the export lists user-facing media metadata only.",
      "Security audit records, billing-event records, provider identifiers or payloads, storage keys or hashes, and private-link token fingerprints are excluded.",
    ],
    account,
    instructorProfile: profileRows[0] ?? null,
    ...collections,
  };
  const body = JSON.stringify(document, null, 2);
  const byteSize = new TextEncoder().encode(body).byteLength;
  if (byteSize > MAX_EXPORT_BYTES) {
    return queueDeferredInstructorDataExport(input);
  }

  await db.batch([
    db.insert(dataRequests).values({
      id: requestRecordId,
      accountId: input.accountId,
      golferId: null,
      requestType: "export",
      requestedByType: "account",
      status: "fulfilled",
      fulfilledAt: generatedAt,
    }),
    db.insert(auditEvents).values({
      id: newId(),
      accountId: input.accountId,
      actorType: "account",
      actorAccountId: input.accountId,
      action: "data_export.generated",
      targetType: "data_request",
      targetId: requestRecordId,
      outcome: "success",
      requestId: input.requestId ?? null,
      metadata: {
        exportVersion: EXPORT_VERSION,
        delivery: "inline_json_download",
        recordCount,
        byteSize,
      },
    }),
  ]);

  return {
    kind: "download",
    body,
    byteSize,
    filename: `roadmap-data-export-${generatedAt.toISOString().slice(0, 10)}.json`,
    recordCount,
    requestRecordId,
  };
}

async function exceedsImmediateExportRecordBounds(
  accountId: string,
): Promise<boolean> {
  const db = getDb();
  const countRows = await db.batch([
    db.select({ value: count() }).from(instructorProfiles).where(eq(instructorProfiles.accountId, accountId)),
    db.select({ value: count() }).from(subscriptions).where(eq(subscriptions.accountId, accountId)),
    db.select({ value: count() }).from(mediaAssets).where(eq(mediaAssets.accountId, accountId)),
    db.select({ value: count() }).from(coachingPackages).where(eq(coachingPackages.accountId, accountId)),
    db.select({ value: count() }).from(golfers).where(eq(golfers.accountId, accountId)),
    db.select({ value: count() }).from(developmentPlans).where(eq(developmentPlans.accountId, accountId)),
    db.select({ value: count() }).from(golferGoals).where(eq(golferGoals.accountId, accountId)),
    db.select({ value: count() }).from(assessments).where(eq(assessments.accountId, accountId)),
    db.select({ value: count() }).from(planPriorities).where(eq(planPriorities.accountId, accountId)),
    db.select({ value: count() }).from(planPhases).where(eq(planPhases.accountId, accountId)),
    db.select({ value: count() }).from(phasePriorities).where(eq(phasePriorities.accountId, accountId)),
    db.select({ value: count() }).from(lessons).where(eq(lessons.accountId, accountId)),
    db.select({ value: count() }).from(practiceItems).where(eq(practiceItems.accountId, accountId)),
    db.select({ value: count() }).from(evidenceItems).where(eq(evidenceItems.accountId, accountId)),
    db.select({ value: count() }).from(phaseReviews).where(eq(phaseReviews.accountId, accountId)),
    db.select({ value: count() }).from(phaseReviewEvidence).where(eq(phaseReviewEvidence.accountId, accountId)),
    db.select({ value: count() }).from(shareLinks).where(eq(shareLinks.accountId, accountId)),
    db.select({ value: count() }).from(golferPlanResponses).where(eq(golferPlanResponses.accountId, accountId)),
    db.select({ value: count() }).from(consentRecords).where(eq(consentRecords.accountId, accountId)),
    db.select({ value: count() }).from(dataRequests).where(eq(dataRequests.accountId, accountId)),
  ]);
  const collectionCounts = countRows.map((rows) => rows[0]?.value ?? 0);
  return (
    collectionCounts.some((value) => value > MAX_COLLECTION_RECORDS) ||
    1 + collectionCounts.reduce((total, value) => total + value, 0) >
      MAX_TOTAL_RECORDS
  );
}

const openDeferredExportStatuses = [
  "submitted",
  "identity_verification_required",
  "verified",
  "in_progress",
] as const;

async function queueDeferredInstructorDataExport(input: {
  accountId: string;
  requestId?: string | null;
}): Promise<DeferredInstructorDataExport> {
  const db = getDb();
  const existing = await getOpenDeferredExport(input.accountId);
  if (existing) return { kind: "manual_request", request: existing, created: false };

  const id = newId();
  try {
    await db.batch([
      db
        .update(accounts)
        .set({
          // Serialize the open fallback on the tenant row so ambiguous retries
          // cannot create duplicate manual-fulfilment work.
          normalizedEmail: sql<string>`case when not exists (
            select 1 from ${dataRequests}
            where ${dataRequests.accountId} = ${input.accountId}
              and ${dataRequests.requestType} = 'export'
              and ${dataRequests.requestedByType} = 'account'
              and ${dataRequests.status} in ('submitted', 'identity_verification_required', 'verified', 'in_progress')
          ) then ${accounts.normalizedEmail} else null end`,
        })
        .where(eq(accounts.id, input.accountId)),
      db.insert(dataRequests).values({
        id,
        accountId: input.accountId,
        golferId: null,
        requestType: "export",
        requestedByType: "account",
        status: "submitted",
        details:
          "Immediate tenant export exceeded the safe synchronous bounds and requires scoped manual fulfilment.",
      }),
      db.insert(auditEvents).values({
        id: newId(),
        accountId: input.accountId,
        actorType: "account",
        actorAccountId: input.accountId,
        action: "data_request.submitted",
        targetType: "data_request",
        targetId: id,
        outcome: "success",
        requestId: input.requestId ?? null,
        metadata: {
          requestType: "export",
          status: "submitted",
          reason: "immediate_export_bounds",
        },
      }),
    ]);
  } catch (error) {
    const raced = await getOpenDeferredExport(input.accountId);
    if (raced) {
      return { kind: "manual_request", request: raced, created: false };
    }
    throw error;
  }

  const created = await getOpenDeferredExport(input.accountId);
  if (!created || created.id !== id) {
    throw new Error("The deferred export request could not be loaded.");
  }
  return { kind: "manual_request", request: created, created: true };
}

async function getOpenDeferredExport(
  accountId: string,
): Promise<DeferredInstructorDataExport["request"] | null> {
  const [row] = await getDb()
    .select({
      id: dataRequests.id,
      status: dataRequests.status,
      createdAt: dataRequests.createdAt,
      updatedAt: dataRequests.updatedAt,
    })
    .from(dataRequests)
    .where(
      and(
        eq(dataRequests.accountId, accountId),
        eq(dataRequests.requestType, "export"),
        eq(dataRequests.requestedByType, "account"),
        inArray(dataRequests.status, openDeferredExportStatuses),
      ),
    )
    .orderBy(asc(dataRequests.createdAt))
    .limit(1);
  if (!row || !isOpenDeferredExportStatus(row.status)) return null;
  return row
    ? {
        id: row.id,
        type: "export",
        status: row.status,
        createdAt: row.createdAt.getTime(),
        updatedAt: row.updatedAt.getTime(),
      }
    : null;
}

function isOpenDeferredExportStatus(
  value: string,
): value is DeferredInstructorDataExport["request"]["status"] {
  return openDeferredExportStatuses.includes(
    value as DeferredInstructorDataExport["request"]["status"],
  );
}
