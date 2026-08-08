import { and, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  assessments,
  auditEvents,
  coachingPackages,
  dataRequests,
  developmentPlans,
  golferGoals,
  golfers,
  instructorProfiles,
  phasePriorities,
  phaseReviews,
  planPhases,
  planPriorities,
  shareLinks,
} from "@/db/schema";
import { RequestError } from "@/lib/http";
import type { RequestIdentity } from "@/lib/identity";
import { newId } from "@/lib/tokens";

export type AccountRecord = typeof accounts.$inferSelect;

export type ProfileView = {
  displayName: string;
  businessName: string | null;
  professionalTitle: string | null;
  philosophy: string | null;
  bio: string | null;
  contactEmail: string;
  contactPhone: string | null;
  websiteUrl: string | null;
  provinceOrTerritory: string | null;
  city: string | null;
  location: string | null;
  accentColor: string | null;
  setupCompletedAt: number | null;
  updatedAt: number;
};

export type PackageView = {
  id: string;
  title: string;
  name: string;
  description: string;
  purpose: string;
  fitDescription: string;
  status: "draft" | "active" | "archived";
  priceCents: number | null;
  priceAmountMinor: number | null;
  currency: string | null;
  currentDetailsText: string | null;
  inclusions: string[];
  cadence: string | null;
  practiceExpectation: string | null;
  evaluationDescription: string | null;
  terms: string;
  termsSummary: string | null;
  externalActionType: "booking" | "purchase" | "contact" | "other";
  externalActionLabel: string;
  externalActionUrl: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
};

export type GolferListItem = {
  id: string;
  displayName: string;
  preferredName: string | null;
  contactEmail: string | null;
  status: "active" | "inactive" | "archived" | "deletion_pending" | "deleted";
  eligibilityStatus: "unconfirmed" | "adult_confirmed" | "ineligible";
  lastActivityAt: number | null;
  updatedAt: number;
  plan: {
    id: string;
    title: string;
    status: "draft" | "preview_ready" | "published" | "paused" | "completed" | "archived";
    updatedAt: number;
  } | null;
};

export type WorkspaceSummary = {
  activeGolfers: number;
  publishedPlans: number;
  plansAwaitingReview: number;
  activePackages: number;
  profileComplete: boolean;
};

/**
 * Resolve the authenticated dispatch identity to an immutable local tenant.
 * The caller never supplies an account ID; email normalization and ownership
 * happen entirely on the server.
 */
export async function getOrCreateAccountForIdentity(
  identity: RequestIdentity,
): Promise<AccountRecord> {
  const normalizedEmail = normalizeIdentityEmail(identity.email);
  const provider = identity.source === "siwc" ? "siwc" : "development";
  const db = getDb();

  const [existing] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.normalizedEmail, normalizedEmail))
    .limit(1);

  if (existing) {
    return reconcileExistingAccount(existing, provider, identity.email.trim());
  }

  const accountId = newId();
  const auditId = newId();
  const now = new Date();

  try {
    await db.batch([
      db.insert(accounts).values({
        id: accountId,
        authProvider: provider,
        authSubject: normalizedEmail,
        primaryEmail: identity.email.trim(),
        normalizedEmail,
        emailVerifiedAt: now,
        status: "active",
        lastSignedInAt: now,
      }),
      db.insert(auditEvents).values({
        id: auditId,
        accountId,
        actorType: "account",
        actorAccountId: accountId,
        action: "account.created",
        targetType: "account",
        targetId: accountId,
        outcome: "success",
        metadata: { identityProvider: provider },
      }),
    ]);
  } catch (error) {
    // A concurrent first request can win the unique normalized-email insert.
    // Re-read that canonical owner; otherwise preserve the original failure.
    const [racedAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.normalizedEmail, normalizedEmail))
      .limit(1);
    if (!racedAccount) throw error;
    return reconcileExistingAccount(
      racedAccount,
      provider,
      identity.email.trim(),
    );
  }

  const [created] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!created) {
    throw new Error("The authenticated account could not be loaded after creation.");
  }
  return created;
}

export async function getProfile(accountId: string): Promise<ProfileView | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(instructorProfiles)
    .where(eq(instructorProfiles.accountId, accountId))
    .limit(1);

  return row ? mapProfile(row) : null;
}

export async function saveProfile(
  accountId: string,
  input: {
    displayName: string;
    businessName: string | null;
    professionalTitle: string | null;
    philosophy: string | null;
    contactEmail: string;
    contactPhone: string | null;
    websiteUrl: string | null;
    provinceOrTerritory: string | null;
    city: string | null;
    accentColor: string | null;
  },
  requestId?: string,
): Promise<ProfileView> {
  const db = getDb();
  const now = new Date();
  const values = {
    accountId,
    ...input,
    setupCompletedAt: now,
    updatedAt: now,
  };

  await db.batch([
    db
      .insert(instructorProfiles)
      .values(values)
      .onConflictDoUpdate({
        target: instructorProfiles.accountId,
        set: {
          displayName: input.displayName,
          businessName: input.businessName,
          professionalTitle: input.professionalTitle,
          philosophy: input.philosophy,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          websiteUrl: input.websiteUrl,
          provinceOrTerritory: input.provinceOrTerritory,
          city: input.city,
          accentColor: input.accentColor,
          setupCompletedAt: sql`coalesce(${instructorProfiles.setupCompletedAt}, ${now.getTime()})`,
          updatedAt: now,
        },
      }),
    db.insert(auditEvents).values({
      id: newId(),
      accountId,
      actorType: "account",
      actorAccountId: accountId,
      action: "profile.saved",
      targetType: "instructor_profile",
      targetId: accountId,
      outcome: "success",
      requestId,
      metadata: {
        changedFields: [
          "displayName",
          "businessName",
          "professionalTitle",
          "philosophy",
          "contactEmail",
          "contactPhone",
          "websiteUrl",
          "provinceOrTerritory",
          "city",
          "accentColor",
        ],
      },
    }),
  ]);

  const profile = await getProfile(accountId);
  if (!profile) throw new Error("The saved profile could not be loaded.");
  return profile;
}

export async function listPackages(accountId: string): Promise<PackageView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(coachingPackages)
    .where(eq(coachingPackages.accountId, accountId))
    .orderBy(desc(coachingPackages.isDefault), desc(coachingPackages.updatedAt));

  return rows.map(mapPackage);
}

export async function getPackageById(
  accountId: string,
  packageId: string,
): Promise<PackageView | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(coachingPackages)
    .where(
      and(
        eq(coachingPackages.accountId, accountId),
        eq(coachingPackages.id, packageId),
      ),
    )
    .limit(1);
  return row ? mapPackage(row) : null;
}

export type CreatePackageInput = {
  name: string;
  purpose: string;
  fitDescription: string;
  status: "draft" | "active" | "archived";
  currency: string | null;
  priceAmountMinor: number | null;
  currentDetailsText: string | null;
  inclusions: string[];
  cadence: string | null;
  practiceExpectation: string | null;
  evaluationDescription: string | null;
  termsSummary: string;
  externalActionType: "booking" | "purchase" | "contact" | "other";
  externalActionLabel: string;
  externalActionUrl: string;
  isDefault: boolean;
};

export type PackageLifecycleResult = {
  package: PackageView;
  affectedPlans: number;
  revokedShareLinks: number;
};

export async function createCoachingPackage(
  accountId: string,
  input: CreatePackageInput,
  requestId?: string,
): Promise<PackageView> {
  const db = getDb();
  const id = newId();
  const now = new Date();
  const insert = db.insert(coachingPackages).values({
    id,
    accountId,
    ...input,
    externalActionVerifiedAt: null,
    archivedAt: input.status === "archived" ? now : null,
    updatedAt: now,
  });
  const audit = db.insert(auditEvents).values({
    id: newId(),
    accountId,
    actorType: "account",
    actorAccountId: accountId,
    action: "coaching_package.created",
    targetType: "coaching_package",
    targetId: id,
    outcome: "success",
    requestId,
    metadata: {
      status: input.status,
      hasPrice: input.priceAmountMinor !== null,
      externalActionType: input.externalActionType,
    },
  });

  if (input.isDefault && input.status === "active") {
    await db.batch([
      db
        .update(coachingPackages)
        .set({ isDefault: false, updatedAt: now })
        .where(eq(coachingPackages.accountId, accountId)),
      insert,
      audit,
    ]);
  } else {
    await db.batch([insert, audit]);
  }

  const created = await getPackageById(accountId, id);
  if (!created) throw new Error("The saved coaching package could not be loaded.");
  return created;
}

export async function updateCoachingPackage(
  accountId: string,
  packageId: string,
  input: CreatePackageInput,
  requestId?: string,
): Promise<PackageLifecycleResult> {
  if (input.status === "archived") {
    throw new RequestError(
      400,
      "invalid_package_status",
      "Use the archive action to archive a coaching package.",
    );
  }
  const existing = await getPackageById(accountId, packageId);
  if (!existing) {
    throw new RequestError(404, "package_not_found", "Coaching package not found.");
  }
  if (existing.status === "archived") {
    throw new RequestError(
      409,
      "package_archived",
      "Archived packages cannot be edited or restored here.",
    );
  }

  const db = getDb();
  const now = new Date();
  const impact = await getPackagePlanImpact(accountId, packageId);
  const invalidation = packageInvalidationStatements(
    accountId,
    packageId,
    "linked package updated",
    now,
  );
  const update = db
    .update(coachingPackages)
    .set({
      ...input,
      externalActionVerifiedAt: null,
      archivedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(coachingPackages.accountId, accountId),
        eq(coachingPackages.id, packageId),
        ne(coachingPackages.status, "archived"),
      ),
    );
  const audit = db.insert(auditEvents).values({
    id: newId(),
    accountId,
    actorType: "account",
    actorAccountId: accountId,
    action: "coaching_package.updated",
    targetType: "coaching_package",
    targetId: packageId,
    outcome: "success",
    requestId,
    metadata: {
      previousStatus: existing.status,
      status: input.status,
      hasPrice: input.priceAmountMinor !== null,
      externalActionType: input.externalActionType,
      affectedPlans: impact.affectedPlans,
      revokedShareLinks: impact.revokedShareLinks,
      planReviewRequired: impact.affectedPlans > 0,
      changedFields: [
        "name",
        "purpose",
        "fitDescription",
        "status",
        "priceOrCurrentDetails",
        "termsSummary",
        "externalAction",
        "packageDetails",
        "isDefault",
      ],
    },
  });

  if (input.isDefault) {
    await db.batch([
      db
        .update(coachingPackages)
        .set({ isDefault: false, updatedAt: now })
        .where(
          and(
            eq(coachingPackages.accountId, accountId),
            eq(coachingPackages.isDefault, true),
            ne(coachingPackages.id, packageId),
          ),
        ),
      update,
      invalidation.revokeShares,
      invalidation.withdrawPlans,
      audit,
    ]);
  } else {
    await db.batch([
      update,
      invalidation.revokeShares,
      invalidation.withdrawPlans,
      audit,
    ]);
  }

  const updated = await getPackageById(accountId, packageId);
  if (!updated) throw new Error("The updated coaching package could not be loaded.");
  return {
    package: updated,
    affectedPlans: impact.affectedPlans,
    revokedShareLinks: impact.revokedShareLinks,
  };
}

export async function archiveCoachingPackage(
  accountId: string,
  packageId: string,
  requestId?: string,
): Promise<PackageLifecycleResult> {
  const existing = await getPackageById(accountId, packageId);
  if (!existing) {
    throw new RequestError(404, "package_not_found", "Coaching package not found.");
  }
  if (existing.status === "archived") {
    return { package: existing, affectedPlans: 0, revokedShareLinks: 0 };
  }

  const db = getDb();
  const now = new Date();
  const impact = await getPackagePlanImpact(accountId, packageId);
  const invalidation = packageInvalidationStatements(
    accountId,
    packageId,
    "linked package archived",
    now,
  );

  await db.batch([
    db
      .update(coachingPackages)
      .set({
        status: "archived",
        isDefault: false,
        externalActionVerifiedAt: null,
        archivedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(coachingPackages.accountId, accountId),
          eq(coachingPackages.id, packageId),
          ne(coachingPackages.status, "archived"),
        ),
      ),
    invalidation.revokeShares,
    invalidation.withdrawPlans,
    db.insert(auditEvents).values({
      id: newId(),
      accountId,
      actorType: "account",
      actorAccountId: accountId,
      action: "coaching_package.archived",
      targetType: "coaching_package",
      targetId: packageId,
      outcome: "success",
      requestId,
      metadata: {
        previousStatus: existing.status,
        status: "archived",
        affectedPlans: impact.affectedPlans,
        revokedShareLinks: impact.revokedShareLinks,
        planReviewRequired: impact.affectedPlans > 0,
        externalActionMadeUnavailable: true,
      },
    }),
  ]);

  const archived = await getPackageById(accountId, packageId);
  if (!archived) throw new Error("The archived coaching package could not be loaded.");
  return {
    package: archived,
    affectedPlans: impact.affectedPlans,
    revokedShareLinks: impact.revokedShareLinks,
  };
}

async function getPackagePlanImpact(accountId: string, packageId: string) {
  const db = getDb();
  const [planCountRows, shareCountRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(developmentPlans)
      .where(linkedNonArchivedPlanPredicate(accountId, packageId)),
    db
      .select({ value: count() })
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.accountId, accountId),
          eq(shareLinks.status, "active"),
          inArray(
            shareLinks.planId,
            linkedNonArchivedPlanIds(accountId, packageId),
          ),
        ),
      ),
  ]);
  return {
    affectedPlans: planCountRows[0]?.value ?? 0,
    revokedShareLinks: shareCountRows[0]?.value ?? 0,
  };
}

function packageInvalidationStatements(
  accountId: string,
  packageId: string,
  reason: string,
  now: Date,
) {
  const db = getDb();
  return {
    revokeShares: db
      .update(shareLinks)
      .set({
        status: "revoked",
        revokedAt: now,
        revokeReason: reason,
        updatedAt: now,
      })
      .where(
        and(
          eq(shareLinks.accountId, accountId),
          eq(shareLinks.status, "active"),
          inArray(
            shareLinks.planId,
            linkedNonArchivedPlanIds(accountId, packageId),
          ),
        ),
      ),
    withdrawPlans: db
      .update(developmentPlans)
      .set({
        status: sql`case when ${developmentPlans.status} in ('published', 'preview_ready') then 'draft' else ${developmentPlans.status} end`,
        revision: sql`${developmentPlans.revision} + 1`,
        approvedRevision: null,
        publishedRevision: null,
        coachApprovedAt: null,
        previewedAt: null,
        publishedAt: null,
        lastSharedAt: null,
        updatedAt: now,
      })
      .where(linkedNonArchivedPlanPredicate(accountId, packageId)),
  };
}

function linkedNonArchivedPlanIds(accountId: string, packageId: string) {
  const db = getDb();
  return db
    .select({ id: developmentPlans.id })
    .from(developmentPlans)
    .where(linkedNonArchivedPlanPredicate(accountId, packageId));
}

function linkedNonArchivedPlanPredicate(accountId: string, packageId: string) {
  const db = getDb();
  const phasePlanIds = db
    .select({ id: planPhases.planId })
    .from(planPhases)
    .where(
      and(
        eq(planPhases.accountId, accountId),
        eq(planPhases.coachingPackageId, packageId),
      ),
    );
  const reviewPlanIds = db
    .select({ id: phaseReviews.planId })
    .from(phaseReviews)
    .where(
      and(
        eq(phaseReviews.accountId, accountId),
        eq(phaseReviews.recommendedPackageId, packageId),
      ),
    );
  return and(
    eq(developmentPlans.accountId, accountId),
    ne(developmentPlans.status, "archived"),
    or(
      inArray(developmentPlans.id, phasePlanIds),
      inArray(developmentPlans.id, reviewPlanIds),
    ),
  );
}

export async function listGolfers(accountId: string): Promise<GolferListItem[]> {
  const db = getDb();
  const [golferRows, planRows] = await Promise.all([
    db
      .select()
      .from(golfers)
      .where(
        and(
          eq(golfers.accountId, accountId),
          ne(golfers.status, "deleted"),
        ),
      )
      .orderBy(desc(golfers.updatedAt)),
    db
      .select({
        id: developmentPlans.id,
        golferId: developmentPlans.golferId,
        title: developmentPlans.title,
        status: developmentPlans.status,
        updatedAt: developmentPlans.updatedAt,
      })
      .from(developmentPlans)
      .where(eq(developmentPlans.accountId, accountId))
      .orderBy(desc(developmentPlans.updatedAt)),
  ]);

  const latestPlanByGolfer = new Map<string, (typeof planRows)[number]>();
  for (const plan of planRows) {
    if (!latestPlanByGolfer.has(plan.golferId)) {
      latestPlanByGolfer.set(plan.golferId, plan);
    }
  }

  return golferRows
    .map((golfer) => {
      const plan = latestPlanByGolfer.get(golfer.id);
      const planUpdatedAt = plan ? toRequiredEpoch(plan.updatedAt) : null;
      return {
        id: golfer.id,
        displayName: golfer.displayName,
        preferredName: golfer.preferredName,
        contactEmail: golfer.contactEmail,
        status: golfer.status,
        eligibilityStatus: golfer.eligibilityStatus,
        lastActivityAt: toEpoch(golfer.lastActivityAt),
        updatedAt: Math.max(
          toRequiredEpoch(golfer.updatedAt),
          planUpdatedAt ?? 0,
        ),
        plan: plan
          ? {
              id: plan.id,
              title: plan.title,
              status: plan.status,
              updatedAt: planUpdatedAt!,
            }
          : null,
      };
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function getWorkspaceSummary(
  accountId: string,
): Promise<WorkspaceSummary> {
  const db = getDb();
  const [activeGolferRows, publishedPlanRows, reviewPlanRows, activePackageRows, profileRows] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(golfers)
        .where(
          and(eq(golfers.accountId, accountId), eq(golfers.status, "active")),
        ),
      db
        .select({ value: count() })
        .from(developmentPlans)
        .where(
          and(
            eq(developmentPlans.accountId, accountId),
            eq(developmentPlans.status, "published"),
          ),
        ),
      db
        .select({ value: count() })
        .from(developmentPlans)
        .where(
          and(
            eq(developmentPlans.accountId, accountId),
            inArray(developmentPlans.status, ["draft", "preview_ready"]),
          ),
        ),
      db
        .select({ value: count() })
        .from(coachingPackages)
        .where(
          and(
            eq(coachingPackages.accountId, accountId),
            eq(coachingPackages.status, "active"),
          ),
        ),
      db
        .select({ accountId: instructorProfiles.accountId })
        .from(instructorProfiles)
        .where(eq(instructorProfiles.accountId, accountId))
        .limit(1),
    ]);

  return {
    activeGolfers: activeGolferRows[0]?.value ?? 0,
    publishedPlans: publishedPlanRows[0]?.value ?? 0,
    plansAwaitingReview: reviewPlanRows[0]?.value ?? 0,
    activePackages: activePackageRows[0]?.value ?? 0,
    profileComplete: profileRows.length === 1,
  };
}

export type CreateGolferWorkspaceInput = {
  displayName: string;
  preferredName: string | null;
  contactEmail: string | null;
  externalReference: string | null;
  planTitle: string;
  goal: {
    desiredOutcome: string;
    whyItMatters: string | null;
    context: string | null;
    constraints: string | null;
    scoreOrHandicapContext: string | null;
  };
  assessment: {
    title: string;
    context: string | null;
    startingPoint: string;
    strengthSummary: string;
    primaryPattern: string;
    limitations: string;
  };
  priority: {
    title: string;
    description: string;
    rationale: string;
  };
  phases: Array<{
    sequence: number;
    title: string;
    purpose: string;
    rationale: string | null;
    progressSignals: string[];
    expectations: string | null;
    estimatedDuration: string | null;
  }>;
  firstPhasePackageId: string | null;
};

export type CreatedGolferWorkspace = {
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
};

export async function createGolferWorkspace(
  accountId: string,
  input: CreateGolferWorkspaceInput,
  requestId?: string,
): Promise<CreatedGolferWorkspace> {
  const db = getDb();
  const now = new Date();
  const golferId = newId();
  const planId = newId();
  const goalId = newId();
  const assessmentId = newId();
  const priorityId = newId();
  const phaseIds = input.phases.map(() => newId());
  const phaseRows = input.phases.map((phase, index) => ({
    id: phaseIds[index],
    accountId,
    planId,
    coachingPackageId: index === 0 ? input.firstPhasePackageId : null,
    sequence: phase.sequence,
    title: phase.title,
    purpose: phase.purpose,
    rationale: phase.rationale,
    progressSignals: phase.progressSignals,
    expectations: phase.expectations,
    estimatedDuration: phase.estimatedDuration,
    status: index === 0 ? ("active" as const) : ("planned" as const),
    isRecommended: index === 0,
  }));

  await db.batch([
    db.insert(golfers).values({
      id: golferId,
      accountId,
      displayName: input.displayName,
      preferredName: input.preferredName,
      contactEmail: input.contactEmail,
      externalReference: input.externalReference,
      status: "active",
      eligibilityStatus: "adult_confirmed",
      eligibilityConfirmedAt: now,
      lastActivityAt: now,
    }),
    db.insert(developmentPlans).values({
      id: planId,
      accountId,
      golferId,
      title: input.planTitle,
      status: "draft",
      revision: 1,
    }),
    db.insert(golferGoals).values({
      id: goalId,
      accountId,
      golferId,
      planId,
      desiredOutcome: input.goal.desiredOutcome,
      whyItMatters: input.goal.whyItMatters,
      context: input.goal.context,
      constraints: input.goal.constraints,
      scoreOrHandicapContext: input.goal.scoreOrHandicapContext,
      status: "active",
      isPrimary: true,
    }),
    db.insert(assessments).values({
      id: assessmentId,
      accountId,
      planId,
      title: input.assessment.title,
      status: "draft",
      assessedAt: now,
      context: input.assessment.context,
      startingPoint: input.assessment.startingPoint,
      strengthSummary: input.assessment.strengthSummary,
      primaryPattern: input.assessment.primaryPattern,
      limitations: input.assessment.limitations,
    }),
    db.insert(planPriorities).values({
      id: priorityId,
      accountId,
      planId,
      assessmentId,
      title: input.priority.title,
      description: input.priority.description,
      rationale: input.priority.rationale,
      status: "active",
      sortOrder: 0,
      isCurrent: true,
    }),
    db.insert(planPhases).values(phaseRows),
    db.insert(phasePriorities).values({
      accountId,
      phaseId: phaseIds[0],
      priorityId,
      sortOrder: 0,
    }),
    db.insert(auditEvents).values({
      id: newId(),
      accountId,
      actorType: "account",
      actorAccountId: accountId,
      action: "golfer_workspace.created",
      targetType: "golfer",
      targetId: golferId,
      outcome: "success",
      requestId,
      metadata: {
        planId,
        phaseCount: phaseRows.length,
        packageAttached: input.firstPhasePackageId !== null,
        eligibilityStatus: "adult_confirmed",
      },
    }),
  ]);

  return {
    golfer: { id: golferId, displayName: input.displayName, status: "active" },
    plan: { id: planId, title: input.planTitle, status: "draft", revision: 1 },
    goal: { id: goalId },
    assessment: { id: assessmentId },
    priority: { id: priorityId },
    phases: phaseRows.map((phase) => ({
      id: phase.id,
      number: phase.sequence,
      title: phase.title,
      purpose: phase.purpose,
      status: phase.status,
    })),
  };
}

export type AccountDataRequestView = {
  id: string;
  type: "export" | "deletion";
  status:
    | "submitted"
    | "identity_verification_required"
    | "verified"
    | "in_progress"
    | "fulfilled"
    | "denied"
    | "canceled"
    | "failed";
  createdAt: number;
};

export async function createAccountDataRequest(
  accountId: string,
  input: { type: "export" | "deletion"; details: string | null },
  requestId?: string,
): Promise<AccountDataRequestView> {
  const db = getDb();
  const id = newId();
  const status =
    input.type === "deletion"
      ? ("identity_verification_required" as const)
      : ("submitted" as const);

  await db.batch([
    db.insert(dataRequests).values({
      id,
      accountId,
      golferId: null,
      requestType: input.type,
      requestedByType: "account",
      status,
      details: input.details,
    }),
    db.insert(auditEvents).values({
      id: newId(),
      accountId,
      actorType: "account",
      actorAccountId: accountId,
      action: "data_request.submitted",
      targetType: "data_request",
      targetId: id,
      outcome: "success",
      requestId,
      metadata: { requestType: input.type, status },
    }),
  ]);

  const [created] = await db
    .select({
      id: dataRequests.id,
      requestType: dataRequests.requestType,
      status: dataRequests.status,
      createdAt: dataRequests.createdAt,
    })
    .from(dataRequests)
    .where(and(eq(dataRequests.accountId, accountId), eq(dataRequests.id, id)))
    .limit(1);
  if (!created || !["export", "deletion"].includes(created.requestType)) {
    throw new Error("The submitted data request could not be loaded.");
  }

  return {
    id: created.id,
    type: created.requestType as "export" | "deletion",
    status: created.status,
    createdAt: toRequiredEpoch(created.createdAt),
  };
}

async function reconcileExistingAccount(
  account: AccountRecord,
  provider: "siwc" | "development",
  primaryEmail: string,
): Promise<AccountRecord> {
  if (["suspended", "deletion_pending", "deleted"].includes(account.status)) {
    throw new RequestError(
      403,
      "account_unavailable",
      "This account is not available for product access.",
    );
  }

  const shouldActivate = account.status === "pending_verification";
  const shouldUpgradeProvider =
    provider === "siwc" && account.authProvider !== "siwc";
  if (!shouldActivate && !shouldUpgradeProvider) return account;

  const db = getDb();
  const now = new Date();
  await db.batch([
    db
      .update(accounts)
      .set({
        authProvider: shouldUpgradeProvider ? "siwc" : account.authProvider,
        authSubject: shouldUpgradeProvider
          ? account.normalizedEmail
          : account.authSubject,
        primaryEmail: shouldUpgradeProvider ? primaryEmail : account.primaryEmail,
        status: "active",
        emailVerifiedAt: account.emailVerifiedAt ?? now,
        lastSignedInAt: now,
        updatedAt: now,
      })
      .where(eq(accounts.id, account.id)),
    db.insert(auditEvents).values({
      id: newId(),
      accountId: account.id,
      actorType: "account",
      actorAccountId: account.id,
      action: shouldActivate ? "account.activated" : "identity.mapping_updated",
      targetType: "account",
      targetId: account.id,
      outcome: "success",
      metadata: { identityProvider: provider },
    }),
  ]);

  const [updated] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, account.id))
    .limit(1);
  if (!updated) throw new Error("The authenticated account could not be loaded.");
  return updated;
}

function mapProfile(row: typeof instructorProfiles.$inferSelect): ProfileView {
  const location = [row.city, row.provinceOrTerritory].filter(Boolean).join(", ");
  return {
    displayName: row.displayName,
    businessName: row.businessName,
    professionalTitle: row.professionalTitle,
    philosophy: row.philosophy,
    bio: row.philosophy,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    websiteUrl: row.websiteUrl,
    provinceOrTerritory: row.provinceOrTerritory,
    city: row.city,
    location: location || null,
    accentColor: row.accentColor,
    setupCompletedAt: toEpoch(row.setupCompletedAt),
    updatedAt: toRequiredEpoch(row.updatedAt),
  };
}

function mapPackage(row: typeof coachingPackages.$inferSelect): PackageView {
  return {
    id: row.id,
    title: row.name,
    name: row.name,
    description: row.fitDescription,
    purpose: row.purpose,
    fitDescription: row.fitDescription,
    status: row.status,
    priceCents: row.priceAmountMinor,
    priceAmountMinor: row.priceAmountMinor,
    currency: row.currency,
    currentDetailsText: row.currentDetailsText,
    inclusions: row.inclusions,
    cadence: row.cadence,
    practiceExpectation: row.practiceExpectation,
    evaluationDescription: row.evaluationDescription,
    terms: row.termsSummary ?? "",
    termsSummary: row.termsSummary,
    externalActionType: row.externalActionType,
    externalActionLabel: row.externalActionLabel,
    externalActionUrl: row.externalActionUrl,
    isDefault: row.isDefault,
    createdAt: toRequiredEpoch(row.createdAt),
    updatedAt: toRequiredEpoch(row.updatedAt),
  };
}

function normalizeIdentityEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new RequestError(
      401,
      "invalid_identity",
      "The authenticated identity did not include a valid email address.",
    );
  }
  return normalized;
}

function toEpoch(value: Date | null): number | null {
  return value ? value.getTime() : null;
}

function toRequiredEpoch(value: Date): number {
  return value.getTime();
}
