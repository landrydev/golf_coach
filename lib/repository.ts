import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
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
  shareSessions,
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

export type SaveProfileInput = {
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
};

export type ProfileSaveResult = {
  profile: ProfileView;
  changedFields: Array<keyof SaveProfileInput>;
  publicationImpact: {
    invalidated: boolean;
    affectedPlans: number;
    revokedShareLinks: number;
    revokedShareSessions: number;
  };
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
    authoringComplete: boolean;
  } | null;
};

export type WorkspaceSummary = {
  activeGolfers: number;
  publishedPlans: number;
  plansAwaitingReview: number;
  activePackages: number;
  profileComplete: boolean;
};

export type StagedGolferWorkspaceView = {
  golfer: {
    id: string;
    displayName: string;
    preferredName: string | null;
    contactEmail: string | null;
    status: "active" | "inactive" | "archived" | "deletion_pending" | "deleted";
    eligibilityStatus: "unconfirmed" | "adult_confirmed" | "ineligible";
  };
  plan: {
    id: string;
    title: string;
    status: "draft" | "preview_ready" | "published" | "paused" | "completed" | "archived";
    revision: number;
    approvedRevision: number | null;
    publishedRevision: number | null;
  };
  goal: {
    id: string;
    desiredOutcome: string;
    whyItMatters: string | null;
    context: string | null;
  } | null;
  authoringState: "staged" | "complete" | "invalid";
};

export type CreateStagedGolferWorkspaceInput = {
  displayName: string;
  preferredName: string | null;
  contactEmail: string | null;
  planTitle: string;
  goal: {
    desiredOutcome: string;
    whyItMatters: string | null;
    context: string | null;
  };
};

export type StagedGolferWorkspaceSubmission = {
  workspace: StagedGolferWorkspaceView;
  created: boolean;
};

export type CompleteStagedGolferWorkspaceInput = {
  accountId: string;
  golferId: string;
  expectedPlanId: string;
  expectedRevision: number;
  assessment: {
    startingPoint: string;
    strengthSummary: string;
    primaryPattern: string;
    limitations: string;
  };
  priority: {
    title: string;
    rationale: string;
  };
  phases: Array<{
    sequence: number;
    title: string;
    purpose: string;
    rationale: string | null;
    progressSignals: string[];
  }>;
  firstPhasePackageId: string | null;
  requestId?: string | null;
};

export type CompletedStagedGolferWorkspace = {
  golfer: { id: string; displayName: string };
  plan: { id: string; title: string; status: "draft"; revision: number };
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
  input: SaveProfileInput,
  requestId?: string,
): Promise<ProfileSaveResult> {
  const db = getDb();
  const existing = await getProfile(accountId);

  if (!existing) {
    const now = new Date();
    try {
      await db.batch([
        db.insert(instructorProfiles).values({
          accountId,
          ...input,
          setupCompletedAt: now,
          updatedAt: now,
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
            changedFields: [...PROFILE_MUTABLE_FIELDS],
            initialSetup: true,
            publicationInvalidated: false,
          },
        }),
      ]);
    } catch (error) {
      if (await getProfile(accountId)) {
        throw new RequestError(
          409,
          "stale_profile_update",
          "The coach profile changed while this save was in progress. Refresh before saving again.",
        );
      }
      throw error;
    }

    const profile = await getProfile(accountId);
    if (!profile) throw new Error("The saved profile could not be loaded.");
    return {
      profile,
      changedFields: [...PROFILE_MUTABLE_FIELDS],
      publicationImpact: emptyProfilePublicationImpact(false),
    };
  }

  const changedFields = PROFILE_MUTABLE_FIELDS.filter(
    (field) => existing[field] !== input[field],
  );
  if (changedFields.length === 0) {
    return {
      profile: existing,
      changedFields,
      publicationImpact: emptyProfilePublicationImpact(false),
    };
  }

  const impact = await getProfilePublicationImpact(accountId);
  const now = new Date(Math.max(Date.now(), existing.updatedAt + 1));
  const affectedPlanPredicate = and(
    eq(developmentPlans.accountId, accountId),
    ne(developmentPlans.status, "archived"),
  );

  try {
    await db.batch([
      db
        .update(instructorProfiles)
        .set({
          // Make the observed profile timestamp a transactional compare-and-swap
          // sentinel. A lost race writes NULL to a NOT NULL field, aborting the
          // entire batch before any capability or plan can be left half-reset.
          displayName: sql<string>`case when ${instructorProfiles.updatedAt} = ${existing.updatedAt} then ${input.displayName} else null end`,
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
        })
        .where(eq(instructorProfiles.accountId, accountId)),
      db
        .update(shareSessions)
        .set({
          revokedAt: now,
          revokeReason: PROFILE_SHARE_REVOKE_REASON,
          updatedAt: now,
        })
        .where(
          and(
            eq(shareSessions.accountId, accountId),
            isNull(shareSessions.revokedAt),
          ),
        ),
      db
        .update(shareLinks)
        .set({
          status: "revoked",
          revokedAt: now,
          revokeReason: PROFILE_SHARE_REVOKE_REASON,
          updatedAt: now,
        })
        .where(
          and(
            eq(shareLinks.accountId, accountId),
            eq(shareLinks.status, "active"),
          ),
        ),
      db
        .update(developmentPlans)
        .set({
          // Profile content is assembled before the publish batch. Bump every
          // non-archived plan, including drafts, so a publish that assembled
          // the old profile cannot win later with its stale expected revision.
          // Paused/completed lifecycle status remains truthful while approval
          // and publication markers are cleared for deliberate review.
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
        .where(affectedPlanPredicate),
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
          changedFields,
          publicationInvalidated: true,
          revocationScope: "all_active_account_shares_and_sessions",
          shareRevokeReason: PROFILE_SHARE_REVOKE_REASON,
          affectedPlansObservedBeforeCommit: impact.affectedPlans,
          activeShareLinksObservedBeforeCommit: impact.revokedShareLinks,
          activeShareSessionsObservedBeforeCommit: impact.revokedShareSessions,
          planReviewRequired: impact.affectedPlans > 0,
          stalePublicationFenced: true,
        },
      }),
    ]);
  } catch (error) {
    const current = await getProfile(accountId);
    if (!current || current.updatedAt !== existing.updatedAt) {
      throw new RequestError(
        409,
        "stale_profile_update",
        "The coach profile changed while this save was in progress. Refresh before saving again.",
      );
    }
    throw error;
  }

  const profile = await getProfile(accountId);
  if (!profile) throw new Error("The saved profile could not be loaded.");
  return {
    profile,
    changedFields,
    publicationImpact: {
      invalidated: true,
      ...impact,
    },
  };
}

const PROFILE_MUTABLE_FIELDS = [
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
] as const satisfies ReadonlyArray<keyof SaveProfileInput>;

const PROFILE_SHARE_REVOKE_REASON = "coach profile updated";

function emptyProfilePublicationImpact(
  invalidated: boolean,
): ProfileSaveResult["publicationImpact"] {
  return {
    invalidated,
    affectedPlans: 0,
    revokedShareLinks: 0,
    revokedShareSessions: 0,
  };
}

async function getProfilePublicationImpact(accountId: string) {
  const db = getDb();
  const [planRows, shareRows, sessionRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(developmentPlans)
      .where(
        and(
          eq(developmentPlans.accountId, accountId),
          ne(developmentPlans.status, "archived"),
        ),
      ),
    db
      .select({ value: count() })
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.accountId, accountId),
          eq(shareLinks.status, "active"),
        ),
      ),
    db
      .select({ value: count() })
      .from(shareSessions)
      .where(
        and(
          eq(shareSessions.accountId, accountId),
          isNull(shareSessions.revokedAt),
        ),
      ),
  ]);
  return {
    affectedPlans: planRows[0]?.value ?? 0,
    revokedShareLinks: shareRows[0]?.value ?? 0,
    revokedShareSessions: sessionRows[0]?.value ?? 0,
  };
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
  const [
    golferRows,
    planRows,
    assessmentPlanRows,
    priorityPlanRows,
    phasePlanRows,
  ] = await Promise.all([
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
    db
      .select({ planId: assessments.planId })
      .from(assessments)
      .where(eq(assessments.accountId, accountId)),
    db
      .select({ planId: planPriorities.planId })
      .from(planPriorities)
      .where(eq(planPriorities.accountId, accountId)),
    db
      .select({ planId: planPhases.planId })
      .from(planPhases)
      .where(eq(planPhases.accountId, accountId)),
  ]);

  const latestPlanByGolfer = new Map<string, (typeof planRows)[number]>();
  for (const plan of planRows) {
    if (!latestPlanByGolfer.has(plan.golferId)) {
      latestPlanByGolfer.set(plan.golferId, plan);
    }
  }
  const plansWithAssessment = new Set(assessmentPlanRows.map((row) => row.planId));
  const plansWithPriority = new Set(priorityPlanRows.map((row) => row.planId));
  const phaseCountByPlan = new Map<string, number>();
  for (const phase of phasePlanRows) {
    phaseCountByPlan.set(
      phase.planId,
      (phaseCountByPlan.get(phase.planId) ?? 0) + 1,
    );
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
              authoringComplete:
                plansWithAssessment.has(plan.id) &&
                plansWithPriority.has(plan.id) &&
                [3, 4].includes(phaseCountByPlan.get(plan.id) ?? 0),
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

export async function createStagedGolferWorkspace(
  accountId: string,
  input: CreateStagedGolferWorkspaceInput,
  idempotencyKey: string,
): Promise<StagedGolferWorkspaceSubmission> {
  const db = getDb();
  const existing = await getStagedWorkspaceByIdempotencyKey(
    accountId,
    idempotencyKey,
  );
  if (existing) {
    assertMatchingStagedRetry(existing, input);
    return { workspace: existing, created: false };
  }

  const now = new Date();
  const golferId = newId();
  const planId = newId();
  const goalId = newId();

  try {
    await db.batch([
      db
        .update(accounts)
        .set({
          // D1 batches serialize on this tenant row. The first request inserts
          // the canonical audit key; a concurrent retry then violates this
          // non-null sentinel and rolls its duplicate golfer, plan, and goal
          // back with no schema migration.
          normalizedEmail: sql<string>`case when not exists (
            select 1 from ${auditEvents}
            where ${auditEvents.accountId} = ${accountId}
              and ${auditEvents.action} = 'golfer_workspace.staged'
              and ${auditEvents.outcome} = 'success'
              and ${auditEvents.requestId} = ${idempotencyKey}
          ) then ${accounts.normalizedEmail} else null end`,
        })
        .where(eq(accounts.id, accountId)),
      db.insert(golfers).values({
        id: golferId,
        accountId,
        displayName: input.displayName,
        preferredName: input.preferredName,
        contactEmail: input.contactEmail,
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
        status: "active",
        isPrimary: true,
      }),
      db.insert(auditEvents).values({
        id: newId(),
        accountId,
        actorType: "account",
        actorAccountId: accountId,
        action: "golfer_workspace.staged",
        targetType: "golfer",
        targetId: golferId,
        outcome: "success",
        requestId: idempotencyKey,
        metadata: {
          planId,
          eligibilityStatus: "adult_confirmed",
          coachingContentStored: false,
        },
      }),
    ]);
  } catch (error) {
    const raced = await getStagedWorkspaceByIdempotencyKey(
      accountId,
      idempotencyKey,
    );
    if (!raced) throw error;
    assertMatchingStagedRetry(raced, input);
    return { workspace: raced, created: false };
  }

  const workspace: StagedGolferWorkspaceView = {
    golfer: {
      id: golferId,
      displayName: input.displayName,
      preferredName: input.preferredName,
      contactEmail: input.contactEmail,
      status: "active",
      eligibilityStatus: "adult_confirmed",
    },
    plan: {
      id: planId,
      title: input.planTitle,
      status: "draft",
      revision: 1,
      approvedRevision: null,
      publishedRevision: null,
    },
    goal: {
      id: goalId,
      desiredOutcome: input.goal.desiredOutcome,
      whyItMatters: input.goal.whyItMatters,
      context: input.goal.context,
    },
    authoringState: "staged",
  };
  return { workspace, created: true };
}

export async function getStagedGolferWorkspace(
  accountId: string,
  golferId: string,
): Promise<StagedGolferWorkspaceView | null> {
  const db = getDb();
  const [golfer] = await db
    .select()
    .from(golfers)
    .where(and(eq(golfers.accountId, accountId), eq(golfers.id, golferId)))
    .limit(1);
  if (!golfer) return null;

  const [plan] = await db
    .select()
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, accountId),
        eq(developmentPlans.golferId, golferId),
      ),
    )
    .orderBy(desc(developmentPlans.updatedAt))
    .limit(1);
  if (!plan) return null;

  const [goalRows, assessmentRows, priorityRows, phaseRows] = await Promise.all([
    db
      .select()
      .from(golferGoals)
      .where(
        and(
          eq(golferGoals.accountId, accountId),
          eq(golferGoals.planId, plan.id),
          eq(golferGoals.isPrimary, true),
          eq(golferGoals.status, "active"),
        ),
      )
      .orderBy(desc(golferGoals.updatedAt))
      .limit(1),
    db
      .select({ id: assessments.id })
      .from(assessments)
      .where(
        and(
          eq(assessments.accountId, accountId),
          eq(assessments.planId, plan.id),
        ),
      ),
    db
      .select({ id: planPriorities.id })
      .from(planPriorities)
      .where(
        and(
          eq(planPriorities.accountId, accountId),
          eq(planPriorities.planId, plan.id),
        ),
      ),
    db
      .select({ id: planPhases.id })
      .from(planPhases)
      .where(
        and(
          eq(planPhases.accountId, accountId),
          eq(planPhases.planId, plan.id),
        ),
      ),
  ]);

  const hasCompleteContent =
    assessmentRows.length > 0 &&
    priorityRows.length > 0 &&
    [3, 4].includes(phaseRows.length);
  const hasNoCompletionContent =
    assessmentRows.length === 0 &&
    priorityRows.length === 0 &&
    phaseRows.length === 0;
  const goal = goalRows[0];

  return {
    golfer: {
      id: golfer.id,
      displayName: golfer.displayName,
      preferredName: golfer.preferredName,
      contactEmail: golfer.contactEmail,
      status: golfer.status,
      eligibilityStatus: golfer.eligibilityStatus,
    },
    plan: {
      id: plan.id,
      title: plan.title,
      status: plan.status,
      revision: plan.revision,
      approvedRevision: plan.approvedRevision,
      publishedRevision: plan.publishedRevision,
    },
    goal: goal
      ? {
          id: goal.id,
          desiredOutcome: goal.desiredOutcome,
          whyItMatters: goal.whyItMatters,
          context: goal.context,
        }
      : null,
    authoringState:
      goal && hasCompleteContent
        ? "complete"
        : goal && hasNoCompletionContent
          ? "staged"
          : "invalid",
  };
}

async function getStagedWorkspaceByIdempotencyKey(
  accountId: string,
  idempotencyKey: string,
): Promise<StagedGolferWorkspaceView | null> {
  const db = getDb();
  const [event] = await db
    .select({ golferId: auditEvents.targetId })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.accountId, accountId),
        eq(auditEvents.action, "golfer_workspace.staged"),
        eq(auditEvents.outcome, "success"),
        eq(auditEvents.requestId, idempotencyKey),
        eq(auditEvents.targetType, "golfer"),
      ),
    )
    .orderBy(asc(auditEvents.occurredAt))
    .limit(1);
  return event?.golferId
    ? getStagedGolferWorkspace(accountId, event.golferId)
    : null;
}

function assertMatchingStagedRetry(
  existing: StagedGolferWorkspaceView,
  input: CreateStagedGolferWorkspaceInput,
): void {
  const goal = existing.goal;
  const matches =
    existing.golfer.displayName === input.displayName &&
    existing.golfer.preferredName === input.preferredName &&
    existing.golfer.contactEmail === input.contactEmail &&
    existing.golfer.eligibilityStatus === "adult_confirmed" &&
    existing.plan.title === input.planTitle &&
    goal !== null &&
    goal.desiredOutcome === input.goal.desiredOutcome &&
    goal.whyItMatters === input.goal.whyItMatters &&
    goal.context === input.goal.context;
  if (!matches) {
    throw new RequestError(
      409,
      "idempotency_key_reused",
      "This save key was already used for different golfer details. Reload and try again.",
    );
  }
}

export async function completeStagedGolferWorkspace(
  input: CompleteStagedGolferWorkspaceInput,
): Promise<CompletedStagedGolferWorkspace> {
  const db = getDb();
  const staged = await getStagedGolferWorkspace(input.accountId, input.golferId);
  assertStagedCompletionState(staged, input);

  if (input.firstPhasePackageId) {
    const coachingPackage = await getPackageById(
      input.accountId,
      input.firstPhasePackageId,
    );
    if (!coachingPackage || coachingPackage.status !== "active") {
      throw new RequestError(
        409,
        "invalid_package",
        "The selected coaching package is no longer available.",
      );
    }
  }

  const now = new Date();
  const assessmentId = newId();
  const priorityId = newId();
  const phaseIds = input.phases.map(() => newId());
  const phaseRows = input.phases.map((phase, index) => ({
    id: phaseIds[index],
    accountId: input.accountId,
    planId: input.expectedPlanId,
    coachingPackageId: index === 0 ? input.firstPhasePackageId : null,
    sequence: phase.sequence,
    title: phase.title,
    purpose: phase.purpose,
    rationale: phase.rationale,
    progressSignals: phase.progressSignals,
    status: index === 0 ? ("active" as const) : ("planned" as const),
    isRecommended: index === 0,
  }));
  const packageGuard = input.firstPhasePackageId
    ? sql`exists (
        select 1 from ${coachingPackages}
        where ${coachingPackages.accountId} = ${input.accountId}
          and ${coachingPackages.id} = ${input.firstPhasePackageId}
          and ${coachingPackages.status} = 'active'
      )`
    : sql`1 = 1`;

  try {
    await db.batch([
      db
        .update(developmentPlans)
        .set({
          // The non-null title is the transactional CAS sentinel. Any stale,
          // duplicate, ineligible, cross-tenant, or partially completed state
          // makes this statement fail and rolls back every following insert.
          title: sql<string>`case when
            ${developmentPlans.revision} = ${input.expectedRevision}
            and ${developmentPlans.status} = 'draft'
            and ${developmentPlans.approvedRevision} is null
            and ${developmentPlans.publishedRevision} is null
            and exists (
              select 1 from ${golfers}
              where ${golfers.accountId} = ${input.accountId}
                and ${golfers.id} = ${input.golferId}
                and ${golfers.status} = 'active'
                and ${golfers.eligibilityStatus} = 'adult_confirmed'
            )
            and exists (
              select 1 from ${golferGoals}
              where ${golferGoals.accountId} = ${input.accountId}
                and ${golferGoals.planId} = ${input.expectedPlanId}
                and ${golferGoals.golferId} = ${input.golferId}
                and ${golferGoals.status} = 'active'
                and ${golferGoals.isPrimary} = 1
            )
            and not exists (
              select 1 from ${assessments}
              where ${assessments.accountId} = ${input.accountId}
                and ${assessments.planId} = ${input.expectedPlanId}
            )
            and not exists (
              select 1 from ${planPriorities}
              where ${planPriorities.accountId} = ${input.accountId}
                and ${planPriorities.planId} = ${input.expectedPlanId}
            )
            and not exists (
              select 1 from ${planPhases}
              where ${planPhases.accountId} = ${input.accountId}
                and ${planPhases.planId} = ${input.expectedPlanId}
            )
            and ${packageGuard}
          then ${developmentPlans.title} else null end`,
          revision: sql`${developmentPlans.revision} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(developmentPlans.accountId, input.accountId),
            eq(developmentPlans.id, input.expectedPlanId),
            eq(developmentPlans.golferId, input.golferId),
          ),
        ),
      db
        .update(golfers)
        .set({ lastActivityAt: now, updatedAt: now })
        .where(
          and(
            eq(golfers.accountId, input.accountId),
            eq(golfers.id, input.golferId),
          ),
        ),
      db.insert(assessments).values({
        id: assessmentId,
        accountId: input.accountId,
        planId: input.expectedPlanId,
        title: "Starting assessment",
        status: "draft",
        assessedAt: now,
        startingPoint: input.assessment.startingPoint,
        strengthSummary: input.assessment.strengthSummary,
        primaryPattern: input.assessment.primaryPattern,
        limitations: input.assessment.limitations,
      }),
      db.insert(planPriorities).values({
        id: priorityId,
        accountId: input.accountId,
        planId: input.expectedPlanId,
        assessmentId,
        title: input.priority.title,
        description: input.priority.rationale,
        rationale: input.priority.rationale,
        status: "active",
        sortOrder: 0,
        isCurrent: true,
      }),
      db.insert(planPhases).values(phaseRows),
      db.insert(phasePriorities).values({
        accountId: input.accountId,
        phaseId: phaseIds[0],
        priorityId,
        sortOrder: 0,
      }),
      db.insert(auditEvents).values({
        id: newId(),
        accountId: input.accountId,
        actorType: "account",
        actorAccountId: input.accountId,
        action: "golfer_workspace.authoring_completed",
        targetType: "development_plan",
        targetId: input.expectedPlanId,
        outcome: "success",
        requestId: input.requestId ?? null,
        metadata: {
          previousRevision: input.expectedRevision,
          completedRevision: input.expectedRevision + 1,
          phaseCount: phaseRows.length,
          packageAttached: input.firstPhasePackageId !== null,
        },
      }),
    ]);
  } catch (error) {
    await rethrowStagedCompletionConflict(input, error);
  }

  return {
    golfer: {
      id: input.golferId,
      displayName: staged.golfer.displayName,
    },
    plan: {
      id: input.expectedPlanId,
      title: staged.plan.title,
      status: "draft",
      revision: input.expectedRevision + 1,
    },
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

function assertStagedCompletionState(
  staged: StagedGolferWorkspaceView | null,
  input: Pick<
    CompleteStagedGolferWorkspaceInput,
    "expectedPlanId" | "expectedRevision"
  >,
): asserts staged is StagedGolferWorkspaceView {
  if (!staged) {
    throw new RequestError(404, "golfer_not_found", "Golfer not found.");
  }
  if (staged.plan.id !== input.expectedPlanId) {
    throw new RequestError(
      409,
      "stale_staged_workspace",
      "This golfer's staged roadmap changed. Refresh before completing it.",
    );
  }
  if (staged.authoringState === "complete") {
    throw new RequestError(
      409,
      "authoring_already_completed",
      "This staged roadmap was already completed. Open the current draft instead.",
    );
  }
  if (staged.authoringState !== "staged" || !staged.goal) {
    throw new RequestError(
      409,
      "staged_workspace_not_completable",
      "This roadmap is not in a safe resumable authoring state.",
    );
  }
  if (staged.plan.revision !== input.expectedRevision) {
    throw new RequestError(
      409,
      "stale_plan_revision",
      "This staged roadmap changed after the page loaded. Refresh before completing it.",
    );
  }
  if (
    staged.golfer.status !== "active" ||
    staged.golfer.eligibilityStatus !== "adult_confirmed" ||
    staged.plan.status !== "draft" ||
    staged.plan.approvedRevision !== null ||
    staged.plan.publishedRevision !== null
  ) {
    throw new RequestError(
      409,
      "staged_workspace_not_completable",
      "This roadmap is not in a safe resumable authoring state.",
    );
  }
}

async function rethrowStagedCompletionConflict(
  input: CompleteStagedGolferWorkspaceInput,
  error: unknown,
): Promise<never> {
  const latest = await getStagedGolferWorkspace(input.accountId, input.golferId);
  try {
    assertStagedCompletionState(latest, input);
  } catch (conflict) {
    throw conflict;
  }
  if (input.firstPhasePackageId) {
    const coachingPackage = await getPackageById(
      input.accountId,
      input.firstPhasePackageId,
    );
    if (!coachingPackage || coachingPackage.status !== "active") {
      throw new RequestError(
        409,
        "invalid_package",
        "The selected coaching package is no longer available.",
      );
    }
  }
  throw error;
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

export type AccountDataRequestType =
  | "access"
  | "export"
  | "correction"
  | "deletion"
  | "restriction"
  | "consent_withdrawal";

export type AccountDataRequestView = {
  id: string;
  type: AccountDataRequestType;
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
  updatedAt: number;
};

export type AccountDataRequestSubmission = {
  request: AccountDataRequestView;
  created: boolean;
};

const openAccountDeletionStatuses = [
  "submitted",
  "identity_verification_required",
  "verified",
  "in_progress",
] as const;

export async function listAccountDataRequests(
  accountId: string,
): Promise<AccountDataRequestView[]> {
  const db = getDb();
  const [rows, openDeletion] = await Promise.all([
    db
      .select({
        id: dataRequests.id,
        requestType: dataRequests.requestType,
        status: dataRequests.status,
        createdAt: dataRequests.createdAt,
        updatedAt: dataRequests.updatedAt,
      })
      .from(dataRequests)
      .where(eq(dataRequests.accountId, accountId))
      .orderBy(desc(dataRequests.createdAt))
      .limit(25),
    getOpenAccountDeletionRequest(accountId),
  ]);

  const mapped = rows.map(mapAccountDataRequest);
  return openDeletion && !mapped.some((request) => request.id === openDeletion.id)
    ? [openDeletion, ...mapped]
    : mapped;
}

export async function createAccountDataRequest(
  accountId: string,
  input: { type: AccountDataRequestType; details: string | null },
  requestId?: string,
): Promise<AccountDataRequestSubmission> {
  const db = getDb();

  if (input.type === "deletion") {
    const existing = await getOpenAccountDeletionRequest(accountId);
    if (existing) return { request: existing, created: false };
  }

  const id = newId();
  const status =
    input.type === "deletion"
      ? ("identity_verification_required" as const)
      : ("submitted" as const);

  const requestInsert = db.insert(dataRequests).values({
    id,
    accountId,
    golferId: null,
    requestType: input.type,
    requestedByType: "account",
    status,
    details: input.details,
  });
  const auditInsert = db.insert(auditEvents).values({
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
  });

  try {
    if (input.type === "deletion") {
      await db.batch([
        db
          .update(accounts)
          .set({
            // Use the account's non-null normalized email as a transactional
            // sentinel. Concurrent D1 batches serialize: the first inserts the
            // open request; a loser then observes it, violates NOT NULL, and
            // rolls back its request and audit without requiring a migration
            // that could fail on historical duplicate rows.
            normalizedEmail: sql<string>`case when not exists (
              select 1 from ${dataRequests}
              where ${dataRequests.accountId} = ${accountId}
                and ${dataRequests.requestType} = 'deletion'
                and ${dataRequests.requestedByType} = 'account'
                and ${dataRequests.status} in ('submitted', 'identity_verification_required', 'verified', 'in_progress')
            ) then ${accounts.normalizedEmail} else null end`,
          })
          .where(eq(accounts.id, accountId)),
        requestInsert,
        auditInsert,
      ]);
    } else {
      await db.batch([requestInsert, auditInsert]);
    }
  } catch (error) {
    // The account-row sentinel is the concurrency boundary. If two retries
    // race, return the canonical open request created by the winner. D1 batch
    // atomicity ensures the losing request did not leave a duplicate audit.
    if (input.type === "deletion") {
      const existing = await getOpenAccountDeletionRequest(accountId);
      if (existing) return { request: existing, created: false };
    }
    throw error;
  }

  const [created] = await db
    .select({
      id: dataRequests.id,
      requestType: dataRequests.requestType,
      status: dataRequests.status,
      createdAt: dataRequests.createdAt,
      updatedAt: dataRequests.updatedAt,
    })
    .from(dataRequests)
    .where(and(eq(dataRequests.accountId, accountId), eq(dataRequests.id, id)))
    .limit(1);
  if (!created) {
    throw new Error("The submitted data request could not be loaded.");
  }

  return { request: mapAccountDataRequest(created), created: true };
}

async function getOpenAccountDeletionRequest(
  accountId: string,
): Promise<AccountDataRequestView | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: dataRequests.id,
      requestType: dataRequests.requestType,
      status: dataRequests.status,
      createdAt: dataRequests.createdAt,
      updatedAt: dataRequests.updatedAt,
    })
    .from(dataRequests)
    .where(
      and(
        eq(dataRequests.accountId, accountId),
        eq(dataRequests.requestType, "deletion"),
        eq(dataRequests.requestedByType, "account"),
        inArray(dataRequests.status, openAccountDeletionStatuses),
      ),
    )
    .orderBy(desc(dataRequests.createdAt))
    .limit(1);

  return row ? mapAccountDataRequest(row) : null;
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

function mapAccountDataRequest(row: {
  id: string;
  requestType: AccountDataRequestView["type"];
  status: AccountDataRequestView["status"];
  createdAt: Date;
  updatedAt: Date;
}): AccountDataRequestView {
  return {
    id: row.id,
    type: row.requestType,
    status: row.status,
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
