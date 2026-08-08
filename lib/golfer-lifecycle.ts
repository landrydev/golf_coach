import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditEvents,
  developmentPlans,
  golfers,
  shareLinks,
} from "@/db/schema";
import { RequestError } from "@/lib/http";
import { newId } from "@/lib/tokens";
import { requireGolferRecordProcessingConsent } from "@/lib/consent-enforcement";
import { consentGrantTransactionGuard } from "@/lib/consent-repository";

export type CoachGolferRecord = {
  id: string;
  displayName: string;
  preferredName: string | null;
  contactEmail: string | null;
  status: string;
};

export async function getCoachGolferRecord(
  accountId: string,
  golferId: string,
): Promise<CoachGolferRecord | null> {
  await requireGolferRecordProcessingConsent(accountId);
  const db = getDb();
  const [golfer] = await db
    .select({
      id: golfers.id,
      displayName: golfers.displayName,
      preferredName: golfers.preferredName,
      contactEmail: golfers.contactEmail,
      status: golfers.status,
    })
    .from(golfers)
    .where(and(eq(golfers.accountId, accountId), eq(golfers.id, golferId)))
    .limit(1);
  return golfer ?? null;
}

export async function updateGolferIdentity(input: {
  accountId: string;
  golferId: string;
  expectedPlanId: string;
  expectedPlanRevision: number;
  displayName: string;
  preferredName: string | null;
  contactEmail: string | null;
  requestId?: string | null;
}): Promise<void> {
  const consentRequirements = await requireGolferRecordProcessingConsent(
    input.accountId,
  );
  const db = getDb();
  const [golfer, planRows] = await Promise.all([
    getCoachGolferRecord(input.accountId, input.golferId),
    db
      .select({
        id: developmentPlans.id,
        revision: developmentPlans.revision,
        status: developmentPlans.status,
      })
      .from(developmentPlans)
      .where(
        and(
          eq(developmentPlans.accountId, input.accountId),
          eq(developmentPlans.golferId, input.golferId),
        ),
      ),
  ]);
  if (!golfer) throw new RequestError(404, "golfer_not_found", "Golfer not found.");
  if (golfer.status !== "active") {
    throw new RequestError(409, "golfer_not_editable", "Only an active golfer can be edited.");
  }
  const expectedPlan = planRows.find((plan) => plan.id === input.expectedPlanId);
  if (!expectedPlan || expectedPlan.revision !== input.expectedPlanRevision) {
    throw new RequestError(
      409,
      "stale_plan_revision",
      "This golfer plan changed after the page loaded. Refresh before saving identity changes.",
    );
  }
  if (!["draft", "preview_ready", "published", "paused"].includes(expectedPlan.status)) {
    throw new RequestError(
      409,
      "plan_not_editable",
      "Golfer identity cannot be changed through a completed or archived plan.",
    );
  }

  const now = new Date();
  try {
    await db.batch([
      consentGrantTransactionGuard(
        input.accountId,
        consentRequirements,
      ),
      db
        .update(golfers)
        .set({
          // Make the expected plan revision a transactional prerequisite for
          // every identity-side effect. A failed guard violates display_name's
          // NOT NULL constraint, which makes D1 roll back the whole batch.
          displayName: sql<string>`case when ${golfers.status} = 'active' and exists (
            select 1
            from ${developmentPlans}
            where ${developmentPlans.accountId} = ${input.accountId}
              and ${developmentPlans.id} = ${input.expectedPlanId}
              and ${developmentPlans.golferId} = ${input.golferId}
              and ${developmentPlans.revision} = ${input.expectedPlanRevision}
              and ${developmentPlans.status} in ('draft', 'preview_ready', 'published', 'paused')
          ) then ${input.displayName} else null end`,
          preferredName: input.preferredName,
          contactEmail: input.contactEmail,
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(and(eq(golfers.accountId, input.accountId), eq(golfers.id, input.golferId))),
      db
        .update(developmentPlans)
        .set({
          status: "draft",
          revision: sql`${developmentPlans.revision} + 1`,
          approvedRevision: null,
          publishedRevision: null,
          coachApprovedAt: null,
          previewedAt: null,
          publishedAt: null,
          lastSharedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(developmentPlans.accountId, input.accountId),
            eq(developmentPlans.golferId, input.golferId),
            inArray(developmentPlans.status, ["draft", "preview_ready", "published", "paused"]),
          ),
        ),
      db
        .update(shareLinks)
        .set({
          status: "revoked",
          revokedAt: now,
          revokeReason: "golfer identity revised",
          updatedAt: now,
        })
        .where(
          and(
            eq(shareLinks.accountId, input.accountId),
            inArray(shareLinks.planId, planRows.map((plan) => plan.id)),
            eq(shareLinks.status, "active"),
          ),
        ),
      db.insert(auditEvents).values({
        id: newId(),
        accountId: input.accountId,
        actorType: "account",
        actorAccountId: input.accountId,
        action: "golfer.identity_updated",
        targetType: "golfer",
        targetId: input.golferId,
        outcome: "success",
        requestId: input.requestId ?? null,
        metadata: {
          changedFields: ["displayName", "preferredName", "contactEmail"],
          affectedPlans: planRows.length,
          publicationWithdrawn: true,
        },
      }),
    ]);
  } catch (error) {
    await requireGolferRecordProcessingConsent(input.accountId);
    await rethrowGolferIdentityConflict(input, error);
  }
}

async function rethrowGolferIdentityConflict(
  input: {
    accountId: string;
    golferId: string;
    expectedPlanId: string;
    expectedPlanRevision: number;
  },
  error: unknown,
): Promise<never> {
  const db = getDb();
  const [golferRows, planRows] = await Promise.all([
    db
      .select({ status: golfers.status })
      .from(golfers)
      .where(and(eq(golfers.accountId, input.accountId), eq(golfers.id, input.golferId)))
      .limit(1),
    db
      .select({ revision: developmentPlans.revision, status: developmentPlans.status })
      .from(developmentPlans)
      .where(
        and(
          eq(developmentPlans.accountId, input.accountId),
          eq(developmentPlans.id, input.expectedPlanId),
          eq(developmentPlans.golferId, input.golferId),
        ),
      )
      .limit(1),
  ]);
  const golfer = golferRows[0];
  const plan = planRows[0];

  if (!golfer) {
    throw new RequestError(404, "golfer_not_found", "Golfer not found.");
  }
  if (golfer.status !== "active") {
    throw new RequestError(409, "golfer_not_editable", "Only an active golfer can be edited.");
  }
  if (!plan || plan.revision !== input.expectedPlanRevision) {
    throw new RequestError(
      409,
      "stale_plan_revision",
      "This golfer plan changed while identity updates were being saved. Refresh before retrying.",
    );
  }
  if (!["draft", "preview_ready", "published", "paused"].includes(plan.status)) {
    throw new RequestError(
      409,
      "plan_not_editable",
      "Golfer identity cannot be changed through a completed or archived plan.",
    );
  }
  throw error;
}

export async function archiveGolfer(input: {
  accountId: string;
  golferId: string;
  requestId?: string | null;
}): Promise<void> {
  const db = getDb();
  // Archival is a one-way restriction action, not an ordinary instructor read.
  // Read only the lifecycle fields required to make that privacy control work
  // after processing authorization has been withdrawn.
  const [golfer] = await db
    .select({ id: golfers.id, status: golfers.status })
    .from(golfers)
    .where(
      and(
        eq(golfers.accountId, input.accountId),
        eq(golfers.id, input.golferId),
      ),
    )
    .limit(1);
  if (!golfer) throw new RequestError(404, "golfer_not_found", "Golfer not found.");
  if (golfer.status === "deleted" || golfer.status === "deletion_pending") {
    throw new RequestError(409, "golfer_not_archivable", "This golfer cannot be archived.");
  }
  if (golfer.status === "archived") return;

  const planRows = await db
    .select({ id: developmentPlans.id })
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, input.accountId),
        eq(developmentPlans.golferId, input.golferId),
      ),
    );
  const now = new Date();
  const statements = [
    db
      .update(golfers)
      .set({ status: "archived" as const, archivedAt: now, updatedAt: now })
      .where(and(eq(golfers.accountId, input.accountId), eq(golfers.id, input.golferId))),
    db
      .update(developmentPlans)
      .set({ status: "archived" as const, archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(developmentPlans.accountId, input.accountId),
          eq(developmentPlans.golferId, input.golferId),
        ),
      ),
    ...(planRows.length
      ? [
          db
            .update(shareLinks)
            .set({
              status: "revoked" as const,
              revokedAt: now,
              revokeReason: "golfer archived",
              updatedAt: now,
            })
            .where(
              and(
                eq(shareLinks.accountId, input.accountId),
                inArray(shareLinks.planId, planRows.map((plan) => plan.id)),
                eq(shareLinks.status, "active"),
              ),
            ),
        ]
      : []),
    db.insert(auditEvents).values({
      id: newId(),
      accountId: input.accountId,
      actorType: "account" as const,
      actorAccountId: input.accountId,
      action: "golfer.archived",
      targetType: "golfer",
      targetId: input.golferId,
      outcome: "success" as const,
      requestId: input.requestId ?? null,
      metadata: { affectedPlans: planRows.length, shareAccessRevoked: true },
    }),
  ] as const;

  await db.batch(statements);
}
