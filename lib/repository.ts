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
import {
  configuredGolferRecordProcessingRequirement,
  requireGolferRecordProcessingConsent,
} from "@/lib/consent-enforcement";
import {
  consentGrantTransactionGuard,
  currentConsentGrantsCondition,
  type ConsentGrantRequirement,
} from "@/lib/consent-repository";
import { pauseAtSyntheticConcurrencyBarrier } from "@/lib/synthetic-concurrency-barrier";

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
 * Resolve only a Worker-verified identity to its immutable local tenant. OIDC
 * sessions carry the server-selected account ID and never perform an email
 * lookup; the legacy Sites adapter remains email-keyed only for that explicit
 * staging mode.
 */
export async function getOrCreateAccountForIdentity(
  identity: RequestIdentity,
): Promise<AccountRecord> {
  const db = getDb();
  if (identity.source === "oidc") {
    if (!identity.accountId) {
      throw new RequestError(
        401,
        "authentication_required",
        "The verified account identity is unavailable.",
      );
    }
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, identity.accountId))
      .limit(1);
    if (
      !account ||
      account.authProvider !== "oidc" ||
      !account.authIssuer ||
      account.status !== "active"
    ) {
      throw new RequestError(
        403,
        "account_unavailable",
        "This account is not available for product access.",
      );
    }
    return account;
  }

  const normalizedEmail = normalizeIdentityEmail(identity.email);
  const provider = identity.source === "siwc" ? "siwc" : "development";

  const [existing] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.normalizedEmail, normalizedEmail))
    .limit(1);

  if (existing) {
    if (existing.authProvider === "oidc") {
      throw new RequestError(
        409,
        "identity_link_required",
        "This email is already attached to a different sign-in identity.",
      );
    }
    return reconcileExistingAccount(
      existing,
      provider,
      identity.email.trim(),
      identity.requestId,
    );
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
        requestId: identity.requestId,
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
    if (racedAccount.authProvider === "oidc") {
      throw new RequestError(
        409,
        "identity_link_required",
        "This email is already attached to a different sign-in identity.",
      );
    }
    return reconcileExistingAccount(
      racedAccount,
      provider,
      identity.email.trim(),
      identity.requestId,
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
  expectedUpdatedAt: number | null,
  requestId?: string,
): Promise<ProfileSaveResult> {
  const db = getDb();
  const existing = await getProfile(accountId);

  if (!existing) {
    if (expectedUpdatedAt !== null) {
      throw staleProfileUpdate();
    }
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

    await pauseAtSyntheticConcurrencyBarrier(
      "profile-create-after-write-before-response",
    );
    return {
      profile: profileViewFromInput(
        input,
        now.getTime(),
        now.getTime(),
      ),
      changedFields: [...PROFILE_MUTABLE_FIELDS],
      publicationImpact: emptyProfilePublicationImpact(false),
    };
  }

  const changedFields = PROFILE_MUTABLE_FIELDS.filter(
    (field) => existing[field] !== input[field],
  );
  if (
    expectedUpdatedAt === null ||
    existing.updatedAt !== expectedUpdatedAt
  ) {
    throw staleProfileUpdate();
  }
  if (changedFields.length === 0) {
    return {
      profile: existing,
      changedFields,
      publicationImpact: emptyProfilePublicationImpact(false),
    };
  }

  const impact = await getProfilePublicationImpact(accountId);
  await pauseAtSyntheticConcurrencyBarrier("profile-after-impact-preflight");
  const consentRequirements = impact.affectedPlans > 0
    ? await requireGolferRecordProcessingConsent(accountId)
    : configuredGolferRecordRequirementOrNull();
  const now = new Date(Math.max(Date.now(), existing.updatedAt + 1));
  const affectedPlanPredicate = and(
    eq(developmentPlans.accountId, accountId),
    ne(developmentPlans.status, "archived"),
  );

  try {
    await db.batch([
      linkedPlanMutationConsentGuard(
        accountId,
        consentRequirements,
        affectedPlanPredicate!,
      ),
      db
        .update(instructorProfiles)
        .set({
          // Make the observed profile timestamp a transactional compare-and-swap
          // sentinel. A lost race writes NULL to a NOT NULL field, aborting the
          // entire batch before any capability or plan can be left half-reset.
          displayName: sql<string>`case when ${instructorProfiles.updatedAt} = ${expectedUpdatedAt} then ${input.displayName} else null end`,
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
    const currentImpact = await getProfilePublicationImpact(accountId);
    if (currentImpact.affectedPlans > 0) {
      await requireGolferRecordProcessingConsent(accountId);
    }
    const current = await getProfile(accountId);
    if (!current || current.updatedAt !== expectedUpdatedAt) {
      throw staleProfileUpdate();
    }
    throw error;
  }

  await pauseAtSyntheticConcurrencyBarrier(
    "profile-update-after-write-before-response",
  );
  return {
    profile: profileViewFromInput(
      input,
      existing.setupCompletedAt ?? now.getTime(),
      now.getTime(),
    ),
    changedFields,
    publicationImpact: {
      invalidated: true,
      ...impact,
    },
  };
}

function staleProfileUpdate(): RequestError {
  return new RequestError(
    409,
    "stale_profile_update",
    "The coach profile changed after this page was loaded. Refresh before saving again.",
  );
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

function profileViewFromInput(
  input: SaveProfileInput,
  setupCompletedAt: number,
  updatedAt: number,
): ProfileView {
  const location = [input.city, input.provinceOrTerritory]
    .filter(Boolean)
    .join(", ");
  return {
    ...input,
    bio: input.philosophy,
    location: location || null,
    setupCompletedAt,
    updatedAt,
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

function linkedPlanMutationConsentGuard(
  accountId: string,
  requirements: readonly ConsentGrantRequirement[] | null,
  relevantPlanCondition: NonNullable<ReturnType<typeof and>>,
) {
  const consentCurrent = requirements
    ? currentConsentGrantsCondition(accountId, requirements)
    : sql`0 = 1`;
  // The account-row sentinel makes the preflight count informational only.
  // At commit time the batch may proceed iff no relevant live plan exists or
  // the exact configured golfer-record grant is still current. This preserves
  // zero-link setup while fencing a concurrent first plan plus withdrawal.
  return getDb()
    .update(accounts)
    .set({
      normalizedEmail: sql<string>`case when
        not exists (
          select 1 from ${developmentPlans}
          where ${relevantPlanCondition}
        )
        or ${consentCurrent}
        then ${accounts.normalizedEmail}
        else null
      end`,
    })
    .where(eq(accounts.id, accountId));
}

function configuredGolferRecordRequirementOrNull(): readonly ConsentGrantRequirement[] | null {
  try {
    return [configuredGolferRecordProcessingRequirement()];
  } catch {
    return null;
  }
}

export type OffsetPage<T> = {
  items: T[];
  offset: number;
  limit: number;
  hasMore: boolean;
};

type OffsetPageOptions = {
  offset?: number;
  limit?: number;
  includeArchived?: boolean;
};
const DEFAULT_LIST_PAGE_SIZE = 50;
const MAX_LIST_PAGE_SIZE = 100;

export async function listPackages(
  accountId: string,
  options: OffsetPageOptions = {},
): Promise<PackageView[]> {
  return (await listPackagesPage(accountId, options)).items;
}

export async function listPackagesPage(
  accountId: string,
  options: OffsetPageOptions = {},
): Promise<OffsetPage<PackageView>> {
  const { limit, offset } = boundedPageOptions(options);
  const db = getDb();
  const rows = await db
    .select()
    .from(coachingPackages)
    .where(eq(coachingPackages.accountId, accountId))
    .orderBy(
      desc(coachingPackages.isDefault),
      desc(coachingPackages.updatedAt),
      desc(coachingPackages.id),
    )
    .limit(limit + 1)
    .offset(offset);

  return {
    items: rows.slice(0, limit).map(mapPackage),
    limit,
    offset,
    hasMore: rows.length > limit,
  };
}

export async function listActivePackagesPage(
  accountId: string,
  options: OffsetPageOptions = {},
): Promise<OffsetPage<PackageView>> {
  const { limit, offset } = boundedPageOptions(options);
  const rows = await getDb()
    .select()
    .from(coachingPackages)
    .where(
      and(
        eq(coachingPackages.accountId, accountId),
        eq(coachingPackages.status, "active"),
      ),
    )
    .orderBy(
      desc(coachingPackages.isDefault),
      desc(coachingPackages.updatedAt),
      desc(coachingPackages.id),
    )
    .limit(limit + 1)
    .offset(offset);
  return {
    items: rows.slice(0, limit).map(mapPackage),
    limit,
    offset,
    hasMore: rows.length > limit,
  };
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

export type CoachingPackageCreationSubmission = {
  package: PackageView;
  created: boolean;
};

type CoachingPackageCreationReceipt = {
  packageId: string;
  inputFingerprint: string;
};

export async function createCoachingPackage(
  accountId: string,
  input: CreatePackageInput,
  idempotencyKey: string,
  requestId?: string,
): Promise<CoachingPackageCreationSubmission> {
  const db = getDb();
  const receiptKey = await coachingPackageReceiptKey(accountId, idempotencyKey);
  const inputFingerprint = await coachingPackageInputFingerprint(input);
  const existing = await getCoachingPackageCreationReceipt(
    accountId,
    receiptKey,
  );
  if (existing) {
    return replayCoachingPackageCreation(
      accountId,
      existing,
      inputFingerprint,
    );
  }

  const id = newId();
  const now = new Date();
  const creationGuard = db
    .update(accounts)
    .set({
      // Serialize package creation on the tenant row. If a concurrent request
      // has already committed this receipt, the NOT NULL constraint aborts the
      // complete batch before another package or audit event can be inserted.
      normalizedEmail: sql<string>`case when not exists (
        select 1 from ${auditEvents}
        where ${auditEvents.accountId} = ${accountId}
          and ${auditEvents.action} = 'coaching_package.created'
          and ${auditEvents.outcome} = 'success'
          and ${auditEvents.id} = ${receiptKey}
          and ${auditEvents.targetType} = 'coaching_package'
      ) then ${accounts.normalizedEmail} else null end`,
    })
    .where(eq(accounts.id, accountId));
  const insert = db.insert(coachingPackages).values({
    id,
    accountId,
    ...input,
    externalActionVerifiedAt: null,
    archivedAt: input.status === "archived" ? now : null,
    createdAt: now,
    updatedAt: now,
  });
  const audit = db.insert(auditEvents).values({
    id: receiptKey,
    accountId,
    actorType: "account",
    actorAccountId: accountId,
    action: "coaching_package.created",
    targetType: "coaching_package",
    targetId: id,
    outcome: "success",
    requestId: requestId ?? null,
    metadata: {
      inputFingerprint,
      status: input.status,
      hasPrice: input.priceAmountMinor !== null,
      externalActionType: input.externalActionType,
    },
  });

  try {
    if (input.isDefault && input.status === "active") {
      await db.batch([
        creationGuard,
        db
          .update(coachingPackages)
          .set({ isDefault: false, updatedAt: now })
          .where(eq(coachingPackages.accountId, accountId)),
        insert,
        audit,
      ]);
    } else {
      await db.batch([creationGuard, insert, audit]);
    }
  } catch (error) {
    const raced = await getCoachingPackageCreationReceipt(
      accountId,
      receiptKey,
    );
    if (raced) {
      return replayCoachingPackageCreation(
        accountId,
        raced,
        inputFingerprint,
      );
    }
    throw error;
  }

  const created = await getPackageById(accountId, id);
  if (!created) throw new Error("The saved coaching package could not be loaded.");
  return { package: created, created: true };
}

async function getCoachingPackageCreationReceipt(
  accountId: string,
  receiptKey: string,
): Promise<CoachingPackageCreationReceipt | null> {
  const db = getDb();
  const [event] = await db
    .select({ targetId: auditEvents.targetId, metadata: auditEvents.metadata })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.accountId, accountId),
        eq(auditEvents.id, receiptKey),
        eq(auditEvents.action, "coaching_package.created"),
        eq(auditEvents.outcome, "success"),
        eq(auditEvents.targetType, "coaching_package"),
      ),
    )
    .orderBy(asc(auditEvents.occurredAt))
    .limit(1);
  if (!event) return null;

  if (
    typeof event.targetId !== "string" ||
    typeof event.metadata?.inputFingerprint !== "string"
  ) {
    throw new RequestError(
      409,
      "idempotency_record_incomplete",
      "This creation key has already been used, but its original result cannot be replayed safely.",
    );
  }

  return {
    packageId: event.targetId,
    inputFingerprint: event.metadata.inputFingerprint,
  };
}

async function replayCoachingPackageCreation(
  accountId: string,
  receipt: CoachingPackageCreationReceipt,
  inputFingerprint: string,
): Promise<CoachingPackageCreationSubmission> {
  if (receipt.inputFingerprint !== inputFingerprint) {
    throw new RequestError(
      409,
      "idempotency_key_reused",
      "This save key was already used for different package details. Reload and try again.",
    );
  }

  const coachingPackage = await getPackageById(accountId, receipt.packageId);
  if (!coachingPackage) {
    throw new RequestError(
      409,
      "idempotency_record_incomplete",
      "This creation key has already been used, but its original result cannot be replayed safely.",
    );
  }
  return { package: coachingPackage, created: false };
}

async function coachingPackageReceiptKey(
  accountId: string,
  idempotencyKey: string,
): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      "coaching_package.create.receipt.v1",
      accountId,
      idempotencyKey,
    ]),
  );
}

async function coachingPackageInputFingerprint(
  input: CreatePackageInput,
): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      "coaching_package.create.payload.v1",
      input.name,
      input.purpose,
      input.fitDescription,
      input.status,
      input.currency,
      input.priceAmountMinor,
      input.currentDetailsText,
      input.inclusions,
      input.cadence,
      input.practiceExpectation,
      input.evaluationDescription,
      input.termsSummary,
      input.externalActionType,
      input.externalActionLabel,
      input.externalActionUrl,
      input.isDefault,
    ]),
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function updateCoachingPackage(
  accountId: string,
  packageId: string,
  input: CreatePackageInput,
  expectedUpdatedAt: number,
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
  if (existing.updatedAt !== expectedUpdatedAt) {
    throw stalePackageVersion();
  }

  const db = getDb();
  const now = new Date(Math.max(Date.now(), existing.updatedAt + 1));
  const impact = await getPackagePlanImpact(accountId, packageId);
  await pauseAtSyntheticConcurrencyBarrier("package-update-after-impact-preflight");
  const consentRequirements = impact.affectedPlans > 0
    ? await requireGolferRecordProcessingConsent(accountId)
    : configuredGolferRecordRequirementOrNull();
  const relevantPlanCondition = linkedNonArchivedPlanPredicate(
    accountId,
    packageId,
  );
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
      // The observed version is a transactional sentinel. A concurrent edit
      // writes NULL into this NOT NULL field and rolls back the entire D1
      // batch, including plan invalidation and the success audit.
      name: sql<string>`case when ${coachingPackages.updatedAt} = ${expectedUpdatedAt} then ${input.name} else null end`,
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

  try {
    await db.batch([
      linkedPlanMutationConsentGuard(
        accountId,
        consentRequirements,
        relevantPlanCondition!,
      ),
      ...(input.isDefault
        ? [
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
          ]
        : []),
      update,
      invalidation.revokeShares,
      invalidation.withdrawPlans,
      audit,
    ]);
  } catch (error) {
    const currentImpact = await getPackagePlanImpact(accountId, packageId);
    if (currentImpact.affectedPlans > 0) {
      await requireGolferRecordProcessingConsent(accountId);
    }
    const current = await getPackageById(accountId, packageId);
    if (!current || current.updatedAt !== expectedUpdatedAt) {
      throw stalePackageVersion();
    }
    throw error;
  }

  return {
    package: packageViewFromInput(existing, input, now.getTime()),
    affectedPlans: impact.affectedPlans,
    revokedShareLinks: impact.revokedShareLinks,
  };
}

export async function archiveCoachingPackage(
  accountId: string,
  packageId: string,
  expectedUpdatedAt: number,
  requestId?: string,
): Promise<PackageLifecycleResult> {
  const existing = await getPackageById(accountId, packageId);
  if (!existing) {
    throw new RequestError(404, "package_not_found", "Coaching package not found.");
  }
  if (existing.status === "archived") {
    return { package: existing, affectedPlans: 0, revokedShareLinks: 0 };
  }
  if (existing.updatedAt !== expectedUpdatedAt) {
    throw stalePackageVersion();
  }

  const db = getDb();
  const now = new Date(Math.max(Date.now(), existing.updatedAt + 1));
  const impact = await getPackagePlanImpact(accountId, packageId);
  await pauseAtSyntheticConcurrencyBarrier("package-archive-after-impact-preflight");
  const consentRequirements = impact.affectedPlans > 0
    ? await requireGolferRecordProcessingConsent(accountId)
    : configuredGolferRecordRequirementOrNull();
  const relevantPlanCondition = linkedNonArchivedPlanPredicate(
    accountId,
    packageId,
  );
  const invalidation = packageInvalidationStatements(
    accountId,
    packageId,
    "linked package archived",
    now,
  );

  try {
    await db.batch([
      linkedPlanMutationConsentGuard(
        accountId,
        consentRequirements,
        relevantPlanCondition!,
      ),
      db
        .update(coachingPackages)
        .set({
          // Archive is also version-bound so an old confirmation cannot
          // silently retire a package whose facts changed in another tab.
          name: sql<string>`case when ${coachingPackages.updatedAt} = ${expectedUpdatedAt} then ${existing.name} else null end`,
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
  } catch (error) {
    const currentImpact = await getPackagePlanImpact(accountId, packageId);
    if (currentImpact.affectedPlans > 0) {
      await requireGolferRecordProcessingConsent(accountId);
    }
    const current = await getPackageById(accountId, packageId);
    if (!current || current.updatedAt !== expectedUpdatedAt) {
      throw stalePackageVersion();
    }
    throw error;
  }

  return {
    package: {
      ...existing,
      status: "archived",
      isDefault: false,
      updatedAt: now.getTime(),
    },
    affectedPlans: impact.affectedPlans,
    revokedShareLinks: impact.revokedShareLinks,
  };
}

function stalePackageVersion(): RequestError {
  return new RequestError(
    409,
    "stale_package_version",
    "This coaching package changed after the page was loaded. Reload before changing it again.",
  );
}

function packageViewFromInput(
  existing: PackageView,
  input: CreatePackageInput,
  updatedAt: number,
): PackageView {
  return {
    id: existing.id,
    title: input.name,
    name: input.name,
    description: input.fitDescription,
    purpose: input.purpose,
    fitDescription: input.fitDescription,
    status: input.status,
    priceCents: input.priceAmountMinor,
    priceAmountMinor: input.priceAmountMinor,
    currency: input.currency,
    currentDetailsText: input.currentDetailsText,
    inclusions: [...input.inclusions],
    cadence: input.cadence,
    practiceExpectation: input.practiceExpectation,
    evaluationDescription: input.evaluationDescription,
    terms: input.termsSummary,
    termsSummary: input.termsSummary,
    externalActionType: input.externalActionType,
    externalActionLabel: input.externalActionLabel,
    externalActionUrl: input.externalActionUrl,
    isDefault: input.isDefault,
    createdAt: existing.createdAt,
    updatedAt,
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

export async function listGolfers(
  accountId: string,
  options: OffsetPageOptions = {},
): Promise<GolferListItem[]> {
  return (await listGolfersPage(accountId, options)).items;
}

export async function listGolfersPage(
  accountId: string,
  options: OffsetPageOptions = {},
): Promise<OffsetPage<GolferListItem>> {
  await requireGolferRecordProcessingConsent(accountId);
  const { limit, offset } = boundedPageOptions(options);
  const visibleStatus = options.includeArchived === false
    ? inArray(golfers.status, ["active", "inactive", "deletion_pending"])
    : ne(golfers.status, "deleted");
  const db = getDb();
  const activityAt = sql<number>`max(
    ${golfers.updatedAt},
    coalesce((
      select max(candidate.updated_at)
      from development_plans candidate
      where candidate.account_id = ${accountId}
        and candidate.golfer_id = ${golfers.id}
    ), 0)
  )`;
  const idRows = await db
    .select({ id: golfers.id })
    .from(golfers)
    .where(and(eq(golfers.accountId, accountId), visibleStatus))
    .orderBy(desc(activityAt), desc(golfers.id))
    .limit(limit + 1)
    .offset(offset);
  const selectedIds = idRows.slice(0, limit).map((row) => row.id);
  if (selectedIds.length === 0) {
    return { items: [], limit, offset, hasMore: false };
  }

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
          visibleStatus,
          inArray(golfers.id, selectedIds),
        ),
      ),
    db
      .select({
        id: developmentPlans.id,
        golferId: developmentPlans.golferId,
        title: developmentPlans.title,
        status: developmentPlans.status,
        updatedAt: developmentPlans.updatedAt,
      })
      .from(developmentPlans)
      .where(
        and(
          eq(developmentPlans.accountId, accountId),
          inArray(developmentPlans.golferId, selectedIds),
          eq(
            developmentPlans.id,
            sql<string>`(
              select candidate.id
              from development_plans candidate
              where candidate.account_id = ${accountId}
                and candidate.golfer_id = ${developmentPlans.golferId}
              order by candidate.updated_at desc, candidate.id desc
              limit 1
            )`,
          ),
        ),
      ),
    Promise.resolve([] as Array<{ planId: string; value: number }>),
    Promise.resolve([] as Array<{ planId: string; value: number }>),
    Promise.resolve([] as Array<{ planId: string; value: number }>),
  ]);

  const planIds = planRows.map((plan) => plan.id);
  if (planIds.length > 0) {
    const [assessmentCounts, priorityCounts, phaseCounts] = await Promise.all([
      db
        .select({ planId: assessments.planId, value: count() })
        .from(assessments)
        .where(
          and(
            eq(assessments.accountId, accountId),
            inArray(assessments.planId, planIds),
          ),
        )
        .groupBy(assessments.planId),
      db
        .select({ planId: planPriorities.planId, value: count() })
        .from(planPriorities)
        .where(
          and(
            eq(planPriorities.accountId, accountId),
            inArray(planPriorities.planId, planIds),
          ),
        )
        .groupBy(planPriorities.planId),
      db
        .select({ planId: planPhases.planId, value: count() })
        .from(planPhases)
        .where(
          and(
            eq(planPhases.accountId, accountId),
            inArray(planPhases.planId, planIds),
          ),
        )
        .groupBy(planPhases.planId),
    ]);
    assessmentPlanRows.push(...assessmentCounts);
    priorityPlanRows.push(...priorityCounts);
    phasePlanRows.push(...phaseCounts);
  }

  const latestPlanByGolfer = new Map<string, (typeof planRows)[number]>();
  for (const plan of planRows) {
    if (!latestPlanByGolfer.has(plan.golferId)) {
      latestPlanByGolfer.set(plan.golferId, plan);
    }
  }
  const plansWithAssessment = new Set(
    assessmentPlanRows.filter((row) => row.value > 0).map((row) => row.planId),
  );
  const plansWithPriority = new Set(
    priorityPlanRows.filter((row) => row.value > 0).map((row) => row.planId),
  );
  const phaseCountByPlan = new Map(
    phasePlanRows.map((row) => [row.planId, row.value]),
  );
  const orderById = new Map(selectedIds.map((id, index) => [id, index]));

  const items = golferRows
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
    .sort(
      (left, right) =>
        (orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  return { items, limit, offset, hasMore: idRows.length > limit };
}

function boundedPageOptions(options: OffsetPageOptions): {
  limit: number;
  offset: number;
} {
  const limit = Number.isSafeInteger(options.limit)
    ? Math.min(Math.max(options.limit ?? DEFAULT_LIST_PAGE_SIZE, 1), MAX_LIST_PAGE_SIZE)
    : DEFAULT_LIST_PAGE_SIZE;
  const offset =
    Number.isSafeInteger(options.offset) && (options.offset ?? 0) >= 0
      ? options.offset ?? 0
      : 0;
  return { limit, offset };
}

export async function getWorkspaceSummary(
  accountId: string,
): Promise<WorkspaceSummary> {
  await requireGolferRecordProcessingConsent(accountId);
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
  requestId?: string,
): Promise<StagedGolferWorkspaceSubmission> {
  const consentRequirements = await requireGolferRecordProcessingConsent(accountId);
  const db = getDb();
  const receiptKey = await stagedGolferWorkspaceReceiptKey(
    accountId,
    idempotencyKey,
  );
  const existing = await getStagedWorkspaceByReceiptKey(
    accountId,
    receiptKey,
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
      consentGrantTransactionGuard(accountId, consentRequirements),
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
              and ${auditEvents.id} = ${receiptKey}
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
        id: receiptKey,
        accountId,
        actorType: "account",
        actorAccountId: accountId,
        action: "golfer_workspace.staged",
        targetType: "golfer",
        targetId: golferId,
        outcome: "success",
        requestId: requestId ?? null,
        metadata: {
          planId,
          eligibilityStatus: "adult_confirmed",
          coachingContentStored: false,
        },
      }),
    ]);
  } catch (error) {
    const raced = await getStagedWorkspaceByReceiptKey(
      accountId,
      receiptKey,
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
  await requireGolferRecordProcessingConsent(accountId);
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
    .orderBy(desc(developmentPlans.updatedAt), desc(developmentPlans.id))
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

async function getStagedWorkspaceByReceiptKey(
  accountId: string,
  receiptKey: string,
): Promise<StagedGolferWorkspaceView | null> {
  const db = getDb();
  const [event] = await db
    .select({ golferId: auditEvents.targetId })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.accountId, accountId),
        eq(auditEvents.id, receiptKey),
        eq(auditEvents.action, "golfer_workspace.staged"),
        eq(auditEvents.outcome, "success"),
        eq(auditEvents.targetType, "golfer"),
      ),
    )
    .orderBy(asc(auditEvents.occurredAt))
    .limit(1);
  return event?.golferId
    ? getStagedGolferWorkspace(accountId, event.golferId)
    : null;
}

async function stagedGolferWorkspaceReceiptKey(
  accountId: string,
  idempotencyKey: string,
): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      "golfer_workspace.stage.receipt.v1",
      accountId,
      idempotencyKey,
    ]),
  );
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
  const consentRequirements = await requireGolferRecordProcessingConsent(
    input.accountId,
  );
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
      consentGrantTransactionGuard(
        input.accountId,
        consentRequirements,
      ),
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

export type CreatedGolferWorkspaceSubmission = {
  workspace: CreatedGolferWorkspace;
  created: boolean;
};

type CreatedGolferWorkspaceIds = {
  golferId: string;
  planId: string;
  goalId: string;
  assessmentId: string;
  priorityId: string;
  phaseIds: string[];
};

type GolferWorkspaceCreationReceipt = {
  inputFingerprint: string;
  ids: CreatedGolferWorkspaceIds;
};

export async function createGolferWorkspace(
  accountId: string,
  input: CreateGolferWorkspaceInput,
  idempotencyKey: string,
  requestId?: string,
): Promise<CreatedGolferWorkspaceSubmission> {
  const consentRequirements = await requireGolferRecordProcessingConsent(accountId);
  const db = getDb();
  const receiptKey = await golferWorkspaceReceiptKey(accountId, idempotencyKey);
  const inputFingerprint = await golferWorkspaceInputFingerprint(accountId, input);
  const existing = await getGolferWorkspaceCreationReceipt(
    accountId,
    receiptKey,
  );
  if (existing) {
    assertMatchingGolferWorkspaceRetry(existing, inputFingerprint);
    return {
      workspace: buildCreatedGolferWorkspace(input, existing.ids),
      created: false,
    };
  }

  await assertCreationPackageAvailable(accountId, input.firstPhasePackageId);

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
  const packageGuard = input.firstPhasePackageId
    ? sql`exists (
        select 1 from ${coachingPackages}
        where ${coachingPackages.accountId} = ${accountId}
          and ${coachingPackages.id} = ${input.firstPhasePackageId}
          and ${coachingPackages.status} = 'active'
      )`
    : sql`1 = 1`;

  try {
    await db.batch([
      consentGrantTransactionGuard(accountId, consentRequirements),
      db
        .update(accounts)
        .set({
          // Serialize creation intent on the tenant row. A concurrent retry
          // or a package that became unavailable makes this non-null sentinel
          // fail, atomically rolling back every following insert.
          normalizedEmail: sql<string>`case when not exists (
            select 1 from ${auditEvents}
            where ${auditEvents.accountId} = ${accountId}
              and ${auditEvents.action} = 'golfer_workspace.created'
              and ${auditEvents.outcome} = 'success'
              and ${auditEvents.id} = ${receiptKey}
          ) and ${packageGuard} then ${accounts.normalizedEmail} else null end`,
        })
        .where(eq(accounts.id, accountId)),
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
      id: receiptKey,
      accountId,
      actorType: "account",
      actorAccountId: accountId,
      action: "golfer_workspace.created",
      targetType: "golfer",
      targetId: golferId,
      outcome: "success",
      requestId: requestId ?? null,
      metadata: {
        planId,
        goalId,
        assessmentId,
        priorityId,
        phaseIds,
        inputFingerprint,
        phaseCount: phaseRows.length,
        packageAttached: input.firstPhasePackageId !== null,
        eligibilityStatus: "adult_confirmed",
      },
      }),
    ]);
  } catch (error) {
    const raced = await getGolferWorkspaceCreationReceipt(
      accountId,
      receiptKey,
    );
    if (raced) {
      assertMatchingGolferWorkspaceRetry(raced, inputFingerprint);
      return {
        workspace: buildCreatedGolferWorkspace(input, raced.ids),
        created: false,
      };
    }
    await assertCreationPackageAvailable(accountId, input.firstPhasePackageId);
    throw error;
  }

  return {
    workspace: buildCreatedGolferWorkspace(input, {
      golferId,
      planId,
      goalId,
      assessmentId,
      priorityId,
      phaseIds,
    }),
    created: true,
  };
}

async function getGolferWorkspaceCreationReceipt(
  accountId: string,
  receiptKey: string,
): Promise<GolferWorkspaceCreationReceipt | null> {
  const db = getDb();
  const [event] = await db
    .select({ targetId: auditEvents.targetId, metadata: auditEvents.metadata })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.accountId, accountId),
        eq(auditEvents.id, receiptKey),
        eq(auditEvents.action, "golfer_workspace.created"),
        eq(auditEvents.outcome, "success"),
        eq(auditEvents.targetType, "golfer"),
      ),
    )
    .orderBy(asc(auditEvents.occurredAt))
    .limit(1);
  if (!event) return null;

  const metadata = event.metadata;
  const phaseIds = metadata?.phaseIds;
  if (
    typeof event.targetId !== "string" ||
    typeof metadata?.planId !== "string" ||
    typeof metadata.goalId !== "string" ||
    typeof metadata.assessmentId !== "string" ||
    typeof metadata.priorityId !== "string" ||
    typeof metadata.inputFingerprint !== "string" ||
    !Array.isArray(phaseIds) ||
    !phaseIds.every((phaseId): phaseId is string => typeof phaseId === "string")
  ) {
    throw new RequestError(
      409,
      "idempotency_record_incomplete",
      "This creation key has already been used, but its original result cannot be replayed safely.",
    );
  }

  return {
    inputFingerprint: metadata.inputFingerprint,
    ids: {
      golferId: event.targetId,
      planId: metadata.planId,
      goalId: metadata.goalId,
      assessmentId: metadata.assessmentId,
      priorityId: metadata.priorityId,
      phaseIds,
    },
  };
}

function assertMatchingGolferWorkspaceRetry(
  receipt: GolferWorkspaceCreationReceipt,
  inputFingerprint: string,
): void {
  if (receipt.inputFingerprint !== inputFingerprint) {
    throw new RequestError(
      409,
      "idempotency_key_reused",
      "This save key was already used for different golfer details. Reload and try again.",
    );
  }
}

async function assertCreationPackageAvailable(
  accountId: string,
  packageId: string | null,
): Promise<void> {
  if (!packageId) return;
  const coachingPackage = await getPackageById(accountId, packageId);
  if (!coachingPackage || coachingPackage.status !== "active") {
    throw new RequestError(
      400,
      "invalid_package",
      "The selected coaching package is unavailable.",
    );
  }
}

function buildCreatedGolferWorkspace(
  input: CreateGolferWorkspaceInput,
  ids: CreatedGolferWorkspaceIds,
): CreatedGolferWorkspace {
  if (ids.phaseIds.length !== input.phases.length) {
    throw new RequestError(
      409,
      "idempotency_record_incomplete",
      "This creation key has already been used, but its original result cannot be replayed safely.",
    );
  }
  return {
    golfer: {
      id: ids.golferId,
      displayName: input.displayName,
      status: "active",
    },
    plan: {
      id: ids.planId,
      title: input.planTitle,
      status: "draft",
      revision: 1,
    },
    goal: { id: ids.goalId },
    assessment: { id: ids.assessmentId },
    priority: { id: ids.priorityId },
    phases: input.phases.map((phase, index) => ({
      id: ids.phaseIds[index],
      number: phase.sequence,
      title: phase.title,
      purpose: phase.purpose,
      status: index === 0 ? "active" : "planned",
    })),
  };
}

async function golferWorkspaceReceiptKey(
  accountId: string,
  idempotencyKey: string,
): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      "golfer_workspace.create.receipt.v1",
      accountId,
      idempotencyKey,
    ]),
  );
}

async function golferWorkspaceInputFingerprint(
  accountId: string,
  input: CreateGolferWorkspaceInput,
): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      "golfer_workspace.create.payload.v1",
      accountId,
      input,
    ]),
  );
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

type AccountDataRequestInput = {
  type: AccountDataRequestType;
  details: string | null;
};

type AccountDataRequestReceipt = {
  dataRequestId: string;
  inputFingerprint: string;
};

const accountDataRequestReceiptActions = [
  "data_request.submitted",
  "data_request.idempotency_alias",
] as const;

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
  input: AccountDataRequestInput,
  idempotencyKey: string,
  requestId?: string,
): Promise<AccountDataRequestSubmission> {
  const receiptKey = await accountDataRequestReceiptKey(
    accountId,
    idempotencyKey,
  );
  const inputFingerprint = await accountDataRequestInputFingerprint(
    accountId,
    input,
  );
  const existingReceipt = await getAccountDataRequestReceipt(
    accountId,
    receiptKey,
  );
  if (existingReceipt) {
    return replayAccountDataRequest(
      accountId,
      existingReceipt,
      inputFingerprint,
    );
  }

  // Deletion has a second, independent idempotency boundary: only one open
  // account deletion review may exist. A bounded retry loop lets a losing
  // concurrent creator persist its own key as an alias to that canonical
  // request, while still binding the key to this exact normalized payload.
  let lastError: unknown;
  const attempts = input.type === "deletion" ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (input.type === "deletion") {
      const openDeletion = await getOpenAccountDeletionRequest(accountId);
      if (openDeletion) {
        try {
          await persistAccountDeletionIdempotencyAlias(
            accountId,
            openDeletion,
            receiptKey,
            inputFingerprint,
            requestId,
          );
          return { request: openDeletion, created: false };
        } catch (error) {
          lastError = error;
          const racedReceipt = await getAccountDataRequestReceipt(
            accountId,
            receiptKey,
          );
          if (racedReceipt) {
            return replayAccountDataRequest(
              accountId,
              racedReceipt,
              inputFingerprint,
            );
          }
          continue;
        }
      }
    }

    try {
      return await persistNewAccountDataRequest(
        accountId,
        input,
        receiptKey,
        inputFingerprint,
        requestId,
      );
    } catch (error) {
      lastError = error;
      const racedReceipt = await getAccountDataRequestReceipt(
        accountId,
        receiptKey,
      );
      if (racedReceipt) {
        return replayAccountDataRequest(
          accountId,
          racedReceipt,
          inputFingerprint,
        );
      }
      if (input.type !== "deletion") throw error;
    }
  }

  if (lastError) throw lastError;
  throw new Error("The submitted data request could not be persisted.");
}

async function persistNewAccountDataRequest(
  accountId: string,
  input: AccountDataRequestInput,
  receiptKey: string,
  inputFingerprint: string,
  requestId?: string,
): Promise<AccountDataRequestSubmission> {
  const db = getDb();
  const status =
    input.type === "deletion"
      ? ("identity_verification_required" as const)
      : ("submitted" as const);
  const noReceipt = sql`not exists (
    select 1 from ${auditEvents}
    where ${auditEvents.id} = ${receiptKey}
  )`;
  const creationAllowed =
    input.type === "deletion"
      ? sql`${noReceipt} and not exists (
          select 1 from ${dataRequests}
          where ${dataRequests.accountId} = ${accountId}
            and ${dataRequests.requestType} = 'deletion'
            and ${dataRequests.requestedByType} = 'account'
            and ${dataRequests.status} in ('submitted', 'identity_verification_required', 'verified', 'in_progress')
        )`
      : noReceipt;

  await db.batch([
    db
      .update(accounts)
      .set({
        // Every account data-request creation serializes on the tenant row.
        // The NOT NULL sentinel aborts the complete batch when another request
        // has already committed this receipt (or an open deletion exists).
        normalizedEmail: sql<string>`case when ${creationAllowed}
          then ${accounts.normalizedEmail} else null end`,
      })
      .where(eq(accounts.id, accountId)),
    db.insert(dataRequests).values({
      // The receipt hash is tenant-scoped and deterministic, so the primary
      // key supplies an additional race boundary without exposing the raw key.
      id: receiptKey,
      accountId,
      golferId: null,
      requestType: input.type,
      requestedByType: "account",
      status,
      details: input.details,
    }),
    db.insert(auditEvents).values({
      // The audit primary key is the durable receipt identity. requestId stays
      // reserved for the actual HTTP correlation identifier.
      id: receiptKey,
      accountId,
      actorType: "account",
      actorAccountId: accountId,
      action: "data_request.submitted",
      targetType: "data_request",
      targetId: receiptKey,
      outcome: "success",
      requestId,
      metadata: {
        inputFingerprint,
        requestType: input.type,
        status,
        ...(requestId ? { requestCorrelationId: requestId } : {}),
      },
    }),
  ]);

  const created = await getAccountDataRequestById(accountId, receiptKey);
  if (!created) {
    throw new Error("The submitted data request could not be loaded.");
  }
  return { request: created, created: true };
}

async function persistAccountDeletionIdempotencyAlias(
  accountId: string,
  openDeletion: AccountDataRequestView,
  receiptKey: string,
  inputFingerprint: string,
  requestId?: string,
): Promise<void> {
  const db = getDb();
  await db.batch([
    db
      .update(accounts)
      .set({
        // Confirm the canonical deletion is still open and serialize the alias
        // receipt against every other use of this idempotency key.
        normalizedEmail: sql<string>`case when not exists (
          select 1 from ${auditEvents}
          where ${auditEvents.id} = ${receiptKey}
        ) and exists (
          select 1 from ${dataRequests}
          where ${dataRequests.accountId} = ${accountId}
            and ${dataRequests.id} = ${openDeletion.id}
            and ${dataRequests.requestType} = 'deletion'
            and ${dataRequests.requestedByType} = 'account'
            and ${dataRequests.status} in ('submitted', 'identity_verification_required', 'verified', 'in_progress')
        ) then ${accounts.normalizedEmail} else null end`,
      })
      .where(eq(accounts.id, accountId)),
    db.insert(auditEvents).values({
      // One deterministic, minimized technical receipt preserves payload-bound
      // replay for a distinct key that aliases the already-open deletion.
      id: receiptKey,
      accountId,
      actorType: "account",
      actorAccountId: accountId,
      action: "data_request.idempotency_alias",
      targetType: "data_request",
      targetId: openDeletion.id,
      outcome: "success",
      requestId,
      metadata: {
        inputFingerprint,
        requestType: "deletion",
        receiptKind: "open_deletion_alias",
        ...(requestId ? { requestCorrelationId: requestId } : {}),
      },
    }),
  ]);
}

async function getAccountDataRequestReceipt(
  accountId: string,
  receiptKey: string,
): Promise<AccountDataRequestReceipt | null> {
  const db = getDb();
  const [event] = await db
    .select({
      accountId: auditEvents.accountId,
      action: auditEvents.action,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      outcome: auditEvents.outcome,
      metadata: auditEvents.metadata,
    })
    .from(auditEvents)
    .where(eq(auditEvents.id, receiptKey))
    .limit(1);
  if (!event) return null;

  if (
    event.accountId !== accountId ||
    !accountDataRequestReceiptActions.includes(
      event.action as (typeof accountDataRequestReceiptActions)[number],
    ) ||
    event.outcome !== "success" ||
    event.targetType !== "data_request" ||
    typeof event.targetId !== "string" ||
    typeof event.metadata?.inputFingerprint !== "string"
  ) {
    throw new RequestError(
      409,
      "idempotency_record_incomplete",
      "This data-request key has already been used, but its original result cannot be replayed safely.",
    );
  }
  return {
    dataRequestId: event.targetId,
    inputFingerprint: event.metadata.inputFingerprint,
  };
}

async function replayAccountDataRequest(
  accountId: string,
  receipt: AccountDataRequestReceipt,
  inputFingerprint: string,
): Promise<AccountDataRequestSubmission> {
  if (receipt.inputFingerprint !== inputFingerprint) {
    throw new RequestError(
      409,
      "idempotency_key_reused",
      "This submission key was already used for a different data request. Review status and try again with a new key.",
    );
  }

  const request = await getAccountDataRequestById(
    accountId,
    receipt.dataRequestId,
  );
  if (!request) {
    throw new RequestError(
      409,
      "idempotency_record_incomplete",
      "This data-request key has already been used, but its original result cannot be replayed safely.",
    );
  }
  return { request, created: false };
}

async function getAccountDataRequestById(
  accountId: string,
  dataRequestId: string,
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
        eq(dataRequests.id, dataRequestId),
      ),
    )
    .limit(1);
  return row ? mapAccountDataRequest(row) : null;
}

async function accountDataRequestReceiptKey(
  accountId: string,
  idempotencyKey: string,
): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      "account_data_request.create.receipt.v1",
      accountId,
      idempotencyKey,
    ]),
  );
}

async function accountDataRequestInputFingerprint(
  accountId: string,
  input: AccountDataRequestInput,
): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      "account_data_request.create.payload.v1",
      accountId,
      input.type,
      input.details,
    ]),
  );
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
  requestId: string,
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
      requestId,
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
