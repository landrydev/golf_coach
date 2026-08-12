import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  assessments,
  auditEvents,
  billingAccountOperationLeases,
  billingCheckoutAttempts,
  billingCustomers,
  billingEvents,
  billingReconciliationTargets,
  billingSubscriptionProjectionGenerations,
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
  shareSessions,
  subscriptions,
} from "@/db/schema";
import { RequestError } from "@/lib/http";
import {
  encodeDataRequestOperatorCursor,
  type DataRequestOperatorPageRequest,
} from "@/lib/data-request-operator-pagination";
import { newId } from "@/lib/tokens";

export const dataRequestOperatorReviewStatuses = [
  "submitted",
  "identity_verification_required",
  "verified",
  "in_progress",
] as const;

export type DataRequestOperatorReviewStatus =
  (typeof dataRequestOperatorReviewStatuses)[number];

export type DataRequestOperatorViewStatus =
  | DataRequestOperatorReviewStatus
  | "cancelled"
  | "denied"
  | "fulfilled"
  | "failed";

export const dataRequestOperatorTransitionExpectedStatuses = [
  "submitted",
] as const;
export type DataRequestOperatorTransitionExpectedStatus =
  (typeof dataRequestOperatorTransitionExpectedStatuses)[number];

export const dataRequestOperatorTransitionTargetStatuses = [
  "identity_verification_required",
] as const;
export type DataRequestOperatorTransitionTargetStatus =
  (typeof dataRequestOperatorTransitionTargetStatuses)[number];

export type DataRequestOperatorSummary = {
  id: string;
  tenantReference: string;
  type:
    | "access"
    | "export"
    | "correction"
    | "deletion"
    | "restriction"
    | "consent_withdrawal";
  status: DataRequestOperatorViewStatus;
  createdAt: number;
  updatedAt: number;
  capabilities: {
    statusTransitionAvailable: boolean;
  };
};

export type DataRequestOperatorQueue = {
  requests: DataRequestOperatorSummary[];
  hasMore: boolean;
  nextCursor: string | null;
  excludedOrphanCount: number;
  excludedFutureDatedCount: number;
};

export type DataRequestDryRunInventory = {
  kind: "dry_run";
  version: "roadmap.data_request_inventory.v1";
  capturedAt: number;
  destructiveActionsPerformed: false;
  collections: Array<{ category: string; recordCount: number }>;
  totalAccountScopedRecords: number;
  privateObjectReferences: {
    recordCount: number;
    declaredBytes: number;
  };
  excludedUnscopedOperationalCategories: [
    "abuse_rate_limits",
    "scheduler_heartbeat",
  ];
};

export type DataRequestOperatorDetail = {
  request: DataRequestOperatorSummary & {
    requestedByType:
      | "account"
      | "golfer"
      | "authorized_representative"
      | "support";
    detailsProvided: boolean;
    identityVerifiedAt: number | null;
    dueAt: number | null;
  };
  inventory: DataRequestDryRunInventory;
  capabilities: {
    statusTransitionAvailable: boolean;
    fulfillmentAvailable: false;
    deletionAvailable: false;
  };
};

export type DataRequestOperatorTransitionResult = {
  request: DataRequestOperatorSummary;
  receiptId: string;
  replayed: boolean;
  capabilities: {
    statusTransitionAvailable: false;
    fulfillmentAvailable: false;
    deletionAvailable: false;
  };
};

const activePersistedOperatorStatuses = [
  "submitted",
  "identity_verification_required",
  "verified",
  "in_progress",
] as const;

const INVENTORY_VERSION = "roadmap.data_request_inventory.v1" as const;
const TRANSITION_ACTION = "data_request.operator_status_transitioned";

export async function listDataRequestOperatorQueue(input: {
  operatorDigest: string;
  requestId: string;
  page: DataRequestOperatorPageRequest;
}): Promise<DataRequestOperatorQueue> {
  const db = getDb();
  const asOf = Date.now();
  const asOfDate = new Date(asOf);
  const cursorFilter = input.page.cursor
    ? or(
        lt(dataRequests.createdAt, new Date(input.page.cursor.createdAt)),
        and(
          eq(dataRequests.createdAt, new Date(input.page.cursor.createdAt)),
          lt(dataRequests.id, input.page.cursor.id),
        ),
      )
    : undefined;
  const [rows, orphanCountRows, futureDatedCountRows] = await db.batch([
    db
      .select({
        id: dataRequests.id,
        accountId: dataRequests.accountId,
        requestType: dataRequests.requestType,
        status: dataRequests.status,
        createdAt: dataRequests.createdAt,
        updatedAt: dataRequests.updatedAt,
      })
      .from(dataRequests)
      .where(
        and(
          inArray(dataRequests.status, activePersistedOperatorStatuses),
          isNotNull(dataRequests.accountId),
          lte(dataRequests.createdAt, asOfDate),
          cursorFilter,
        ),
      )
      .orderBy(desc(dataRequests.createdAt), desc(dataRequests.id))
      .limit(input.page.limit + 1),
    db
      .select({ value: count() })
      .from(dataRequests)
      .where(
        and(
          inArray(dataRequests.status, activePersistedOperatorStatuses),
          isNull(dataRequests.accountId),
        ),
      ),
    db
      .select({ value: count() })
      .from(dataRequests)
      .where(
        and(
          inArray(dataRequests.status, activePersistedOperatorStatuses),
          isNotNull(dataRequests.accountId),
          gt(dataRequests.createdAt, asOfDate),
        ),
      ),
  ]);

  const selected = rows.slice(0, input.page.limit);
  const mappedRequests = await Promise.all(
    selected.map(async (row) =>
      row.accountId
        ? mapOperatorSummary(row, await tenantReference(row.accountId))
        : null,
    ),
  );
  const requests = mappedRequests.filter(
    (request): request is DataRequestOperatorSummary => request !== null,
  );
  const hasMore = rows.length > input.page.limit;
  const last = hasMore ? selected.at(-1) : undefined;
  const nextCursor = last
    ? encodeDataRequestOperatorCursor({
        createdAt: last.createdAt.getTime(),
        id: last.id,
      })
    : null;
  const excludedOrphanCount = countValue(orphanCountRows);
  const excludedFutureDatedCount = countValue(futureDatedCountRows);

  // A queue response is released only after its authorized access event has
  // committed. Metadata is bounded and contains no identity or request text.
  await db.insert(auditEvents).values({
    id: newId(),
    accountId: null,
    actorType: "support",
    actorReference: input.operatorDigest,
    action: "data_request.operator_queue_viewed",
    targetType: "data_request_queue",
    targetId: null,
    outcome: "success",
    requestId: input.requestId,
    metadata: {
      returnedCount: requests.length,
      hasMore,
      pageLimit: input.page.limit,
      asOf,
      excludedOrphanCount,
      excludedFutureDatedCount,
    },
  });

  return {
    requests,
    hasMore,
    nextCursor,
    excludedOrphanCount,
    excludedFutureDatedCount,
  };
}

export async function getDataRequestOperatorDetail(input: {
  dataRequestId: string;
  operatorDigest: string;
  requestId: string;
}): Promise<DataRequestOperatorDetail> {
  const db = getDb();
  const [row] = await db
    .select({
      id: dataRequests.id,
      accountId: dataRequests.accountId,
      requestType: dataRequests.requestType,
      requestedByType: dataRequests.requestedByType,
      status: dataRequests.status,
      details: dataRequests.details,
      identityVerifiedAt: dataRequests.identityVerifiedAt,
      dueAt: dataRequests.dueAt,
      createdAt: dataRequests.createdAt,
      updatedAt: dataRequests.updatedAt,
    })
    .from(dataRequests)
    .where(eq(dataRequests.id, input.dataRequestId))
    .limit(1);

  if (!row) {
    throw new RequestError(
      404,
      "data_request_not_found",
      "Data request not found.",
    );
  }
  const status = toOperatorStatus(row.status);
  if (!row.accountId || !status) {
    throw new RequestError(
      409,
      "data_request_review_unavailable",
      "This data request is not available for non-destructive operator review.",
    );
  }

  const tenantRef = await tenantReference(row.accountId);
  const inventory = await loadDryRunInventory(row.accountId);

  await db.insert(auditEvents).values({
    id: newId(),
    accountId: row.accountId,
    actorType: "support",
    actorReference: input.operatorDigest,
    action: "data_request.operator_detail_viewed",
    targetType: "data_request",
    targetId: row.id,
    outcome: "success",
    requestId: input.requestId,
    metadata: {
      inventoryVersion: INVENTORY_VERSION,
      collectionCount: inventory.collections.length,
    },
  });

  return {
    request: {
      ...mapOperatorSummary(row, tenantRef),
      requestedByType: row.requestedByType,
      detailsProvided: Boolean(row.details?.trim()),
      identityVerifiedAt: toEpoch(row.identityVerifiedAt),
      dueAt: toEpoch(row.dueAt),
    },
    inventory,
    capabilities: {
      statusTransitionAvailable: statusTransitionAvailable(row.status),
      fulfillmentAvailable: false,
      deletionAvailable: false,
    },
  };
}

export async function transitionDataRequestOperatorStatus(input: {
  dataRequestId: string;
  operatorDigest: string;
  idempotencyKey: string;
  expectedStatus: DataRequestOperatorTransitionExpectedStatus;
  expectedUpdatedAt: number;
  targetStatus: DataRequestOperatorTransitionTargetStatus;
  requestId: string;
}): Promise<DataRequestOperatorTransitionResult> {
  const receiptId = await transitionReceiptId(
    input.dataRequestId,
    input.idempotencyKey,
  );
  const inputFingerprint = await transitionInputFingerprint(input);
  const existingReceipt = await getTransitionReceipt(receiptId);
  if (existingReceipt) {
    return replayTransitionReceipt({
      receiptId,
      receipt: existingReceipt,
      input,
      inputFingerprint,
    });
  }

  const db = getDb();
  const [current] = await db
    .select({
      id: dataRequests.id,
      accountId: dataRequests.accountId,
      requestType: dataRequests.requestType,
      status: dataRequests.status,
      createdAt: dataRequests.createdAt,
      updatedAt: dataRequests.updatedAt,
    })
    .from(dataRequests)
    .where(eq(dataRequests.id, input.dataRequestId))
    .limit(1);

  if (!current) {
    throw new RequestError(
      404,
      "data_request_not_found",
      "Data request not found.",
    );
  }
  if (!current.accountId) {
    throw new RequestError(
      409,
      "data_request_tenant_unavailable",
      "This data request is not available for operator review.",
    );
  }

  const currentStatus = toOperatorReviewStatus(current.status);
  if (!currentStatus) {
    throw new RequestError(
      409,
      "data_request_review_unavailable",
      "Fulfillment and destructive processing are unavailable pending approved policy.",
    );
  }
  if (
    currentStatus !== input.expectedStatus ||
    current.updatedAt.getTime() !== input.expectedUpdatedAt
  ) {
    throw versionConflict();
  }
  if (
    currentStatus !== "submitted" ||
    input.targetStatus !== "identity_verification_required"
  ) {
    throw new RequestError(
      409,
      "data_request_transition_not_allowed",
      "That non-destructive review transition is not allowed.",
    );
  }

  const targetPersistedStatus = input.targetStatus;
  const resultUpdatedAt = Math.max(Date.now(), input.expectedUpdatedAt + 1);
  const resultDate = new Date(resultUpdatedAt);
  const expectedDate = new Date(input.expectedUpdatedAt);
  const tenantRef = await tenantReference(current.accountId);

  try {
    await db.batch([
      db
        .update(dataRequests)
        .set({
          // The NOT NULL status sentinel turns a stale version or a racing use
          // of this receipt into a transaction-wide failure instead of a
          // silent zero-row update followed by a misleading audit event.
          status: sql<DataRequestOperatorTransitionTargetStatus>`case
            when ${eq(dataRequests.status, input.expectedStatus)}
             and ${eq(dataRequests.updatedAt, expectedDate)}
             and not exists (
               select 1 from ${auditEvents}
               where ${auditEvents.id} = ${receiptId}
             )
            then ${targetPersistedStatus}
            else null
          end`,
          updatedAt: resultDate,
        })
        .where(
          and(
            eq(dataRequests.id, current.id),
            eq(dataRequests.accountId, current.accountId),
          ),
        ),
      db.insert(auditEvents).values({
        id: receiptId,
        accountId: current.accountId,
        actorType: "support",
        actorReference: input.operatorDigest,
        action: TRANSITION_ACTION,
        targetType: "data_request",
        targetId: current.id,
        outcome: "success",
        requestId: input.requestId,
        metadata: {
          inputFingerprint,
          fromStatus: currentStatus,
          toStatus: input.targetStatus,
          resultUpdatedAt,
          requestType: current.requestType,
          receiptKind: "operator_status_transition",
        },
      }),
      db
        .update(accounts)
        .set({
          // This final guard couples the target row and receipt to the tenant.
          // It also aborts the batch if a future destructive process removes
          // either side between the read and this transaction.
          normalizedEmail: sql<string>`case when exists (
            select 1 from ${dataRequests}
            where ${dataRequests.id} = ${current.id}
              and ${dataRequests.accountId} = ${current.accountId}
              and ${dataRequests.status} = ${targetPersistedStatus}
              and ${eq(dataRequests.updatedAt, resultDate)}
          ) and exists (
            select 1 from ${auditEvents}
            where ${auditEvents.id} = ${receiptId}
              and ${auditEvents.accountId} = ${current.accountId}
              and ${auditEvents.targetId} = ${current.id}
          ) then ${accounts.normalizedEmail} else null end`,
        })
        .where(eq(accounts.id, current.accountId)),
    ]);
  } catch (error) {
    const racedReceipt = await getTransitionReceipt(receiptId);
    if (racedReceipt) {
      return replayTransitionReceipt({
        receiptId,
        receipt: racedReceipt,
        input,
        inputFingerprint,
      });
    }

    const [latest] = await db
      .select({ status: dataRequests.status, updatedAt: dataRequests.updatedAt })
      .from(dataRequests)
      .where(eq(dataRequests.id, current.id))
      .limit(1);
    if (
      !latest ||
      latest.status !== current.status ||
      latest.updatedAt.getTime() !== input.expectedUpdatedAt
    ) {
      throw versionConflict();
    }
    throw error;
  }

  return {
    request: {
      id: current.id,
      tenantReference: tenantRef,
      type: current.requestType,
      status: input.targetStatus,
      createdAt: current.createdAt.getTime(),
      updatedAt: resultUpdatedAt,
      capabilities: {
        statusTransitionAvailable: false,
      },
    },
    receiptId,
    replayed: false,
    capabilities: {
      statusTransitionAvailable: false,
      fulfillmentAvailable: false,
      deletionAvailable: false,
    },
  };
}

async function loadDryRunInventory(
  accountId: string,
): Promise<DataRequestDryRunInventory> {
  const db = getDb();
  const countRows = await db.batch([
    db.select({ value: count() }).from(accounts).where(eq(accounts.id, accountId)),
    db.select({ value: count() }).from(instructorProfiles).where(eq(instructorProfiles.accountId, accountId)),
    db.select({ value: count() }).from(mediaAssets).where(eq(mediaAssets.accountId, accountId)),
    db.select({ value: count() }).from(billingCustomers).where(eq(billingCustomers.accountId, accountId)),
    db
      .select({ value: count() })
      .from(billingSubscriptionProjectionGenerations)
      .innerJoin(
        subscriptions,
        and(
          eq(
            billingSubscriptionProjectionGenerations.provider,
            subscriptions.provider,
          ),
          eq(
            billingSubscriptionProjectionGenerations.providerSubscriptionId,
            subscriptions.providerSubscriptionId,
          ),
        ),
      )
      .where(eq(subscriptions.accountId, accountId)),
    db.select({ value: count() }).from(billingCheckoutAttempts).where(eq(billingCheckoutAttempts.accountId, accountId)),
    db.select({ value: count() }).from(subscriptions).where(eq(subscriptions.accountId, accountId)),
    db.select({ value: count() }).from(billingEvents).where(eq(billingEvents.accountId, accountId)),
    db.select({ value: count() }).from(billingReconciliationTargets).where(eq(billingReconciliationTargets.accountId, accountId)),
    db.select({ value: count() }).from(billingAccountOperationLeases).where(eq(billingAccountOperationLeases.accountId, accountId)),
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
    db.select({ value: count() }).from(shareSessions).where(eq(shareSessions.accountId, accountId)),
    db.select({ value: count() }).from(golferPlanResponses).where(eq(golferPlanResponses.accountId, accountId)),
    db.select({ value: count() }).from(consentRecords).where(eq(consentRecords.accountId, accountId)),
    db.select({ value: count() }).from(auditEvents).where(eq(auditEvents.accountId, accountId)),
    db.select({ value: count() }).from(dataRequests).where(eq(dataRequests.accountId, accountId)),
    db
      .select({
        recordCount: count(),
        declaredBytes: sql<number>`coalesce(sum(${mediaAssets.byteSize}), 0)`,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.accountId, accountId)),
    db
      .select({ recordCount: count() })
      .from(dataRequests)
      .where(
        and(
          eq(dataRequests.accountId, accountId),
          sql`${dataRequests.exportObjectKey} is not null`,
        ),
      ),
  ]);

  const categories = [
    "accounts",
    "instructor_profiles",
    "media_assets",
    "billing_customers",
    "billing_subscription_projection_generations",
    "billing_checkout_attempts",
    "subscriptions",
    "billing_events",
    "billing_reconciliation_targets",
    "billing_account_operation_leases",
    "coaching_packages",
    "golfers",
    "development_plans",
    "golfer_goals",
    "assessments",
    "plan_priorities",
    "plan_phases",
    "phase_priorities",
    "lessons",
    "practice_items",
    "evidence_items",
    "phase_reviews",
    "phase_review_evidence",
    "share_links",
    "share_sessions",
    "golfer_plan_responses",
    "consent_records",
    "audit_events",
    "data_requests",
  ].map((category, index) => ({
    category,
    recordCount: countValue(countRows[index]),
  }));
  const mediaReferences = countRows[29]?.[0] as
    | { recordCount?: number; declaredBytes?: number | string }
    | undefined;
  const exportReferences = countRows[30]?.[0] as
    | { recordCount?: number }
    | undefined;
  const mediaReferenceCount = inventoryNonNegativeInteger(
    mediaReferences?.recordCount,
  );
  const exportReferenceCount = inventoryNonNegativeInteger(
    exportReferences?.recordCount,
  );

  return {
    kind: "dry_run",
    version: INVENTORY_VERSION,
    capturedAt: Date.now(),
    destructiveActionsPerformed: false,
    collections: categories,
    totalAccountScopedRecords: categories.reduce(
      (total, item) => total + item.recordCount,
      0,
    ),
    privateObjectReferences: {
      recordCount: mediaReferenceCount + exportReferenceCount,
      declaredBytes: inventoryNonNegativeInteger(
        mediaReferences?.declaredBytes,
      ),
    },
    excludedUnscopedOperationalCategories: [
      "abuse_rate_limits",
      "scheduler_heartbeat",
    ],
  };
}

type TransitionReceipt = {
  accountId: string | null;
  actorReference: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
};

async function getTransitionReceipt(
  receiptId: string,
): Promise<TransitionReceipt | null> {
  const db = getDb();
  const [event] = await db
    .select({
      accountId: auditEvents.accountId,
      action: auditEvents.action,
      actorType: auditEvents.actorType,
      actorReference: auditEvents.actorReference,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      outcome: auditEvents.outcome,
      metadata: auditEvents.metadata,
    })
    .from(auditEvents)
    .where(eq(auditEvents.id, receiptId))
    .limit(1);
  if (!event) return null;

  if (
    event.action !== TRANSITION_ACTION ||
    event.actorType !== "support" ||
    event.targetType !== "data_request" ||
    event.outcome !== "success"
  ) {
    throw incompleteReceipt();
  }
  return event;
}

async function replayTransitionReceipt(input: {
  receiptId: string;
  receipt: TransitionReceipt;
  input: {
    dataRequestId: string;
    operatorDigest: string;
  };
  inputFingerprint: string;
}): Promise<DataRequestOperatorTransitionResult> {
  const metadata = input.receipt.metadata;
  if (
    input.receipt.actorReference !== input.input.operatorDigest ||
    input.receipt.targetId !== input.input.dataRequestId ||
    metadata?.inputFingerprint !== input.inputFingerprint
  ) {
    throw new RequestError(
      409,
      "idempotency_key_reused",
      "This idempotency key was already used for a different operator transition.",
    );
  }

  const status = transitionTargetStatusValue(metadata.toStatus);
  const fromStatus = transitionExpectedStatusValue(metadata.fromStatus);
  const updatedAt = safeNonNegativeInteger(metadata.resultUpdatedAt);
  if (!status || !fromStatus || updatedAt === 0) throw incompleteReceipt();

  const db = getDb();
  const [request] = await db
    .select({
      id: dataRequests.id,
      accountId: dataRequests.accountId,
      requestType: dataRequests.requestType,
      createdAt: dataRequests.createdAt,
    })
    .from(dataRequests)
    .where(eq(dataRequests.id, input.input.dataRequestId))
    .limit(1);
  if (
    !request?.accountId ||
    input.receipt.accountId !== request.accountId
  ) {
    throw incompleteReceipt();
  }

  return {
    request: {
      id: request.id,
      tenantReference: await tenantReference(request.accountId),
      type: request.requestType,
      status,
      createdAt: request.createdAt.getTime(),
      updatedAt,
      capabilities: {
        statusTransitionAvailable: false,
      },
    },
    receiptId: input.receiptId,
    replayed: true,
    capabilities: {
      statusTransitionAvailable: false,
      fulfillmentAvailable: false,
      deletionAvailable: false,
    },
  };
}

function mapOperatorSummary(
  row: {
    id: string;
    requestType: DataRequestOperatorSummary["type"];
    status: string;
    createdAt: Date;
    updatedAt: Date;
  },
  tenantRef: string,
): DataRequestOperatorSummary {
  const status = toOperatorStatus(row.status);
  if (!status) {
    throw new RequestError(
      409,
      "data_request_review_unavailable",
      "This data request is not available for non-destructive operator review.",
    );
  }
  return {
    id: row.id,
    tenantReference: tenantRef,
    type: row.requestType,
    status,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    capabilities: {
      statusTransitionAvailable: statusTransitionAvailable(status),
    },
  };
}

function toOperatorStatus(value: string): DataRequestOperatorViewStatus | null {
  if (value === "canceled") return "cancelled";
  if (value === "denied") return "denied";
  if (value === "fulfilled") return "fulfilled";
  if (value === "failed") return "failed";
  return toOperatorReviewStatus(value);
}

function toOperatorReviewStatus(
  value: unknown,
): DataRequestOperatorReviewStatus | null {
  return typeof value === "string" &&
    (dataRequestOperatorReviewStatuses as readonly string[]).includes(value)
    ? (value as DataRequestOperatorReviewStatus)
    : null;
}

function transitionExpectedStatusValue(
  value: unknown,
): DataRequestOperatorTransitionExpectedStatus | null {
  return value === "submitted" ? value : null;
}

function transitionTargetStatusValue(
  value: unknown,
): DataRequestOperatorTransitionTargetStatus | null {
  return value === "identity_verification_required" ? value : null;
}

function statusTransitionAvailable(value: string): boolean {
  return value === "submitted";
}

function countValue(rows: unknown): number {
  const value = (rows as Array<{ value?: unknown }> | undefined)?.[0]?.value;
  return inventoryNonNegativeInteger(value);
}

function inventoryNonNegativeInteger(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (
    typeof parsed !== "number" ||
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new RequestError(
      503,
      "data_request_inventory_unavailable",
      "The data-request inventory is temporarily unavailable.",
    );
  }
  return parsed;
}

function safeNonNegativeInteger(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" &&
    Number.isSafeInteger(parsed) &&
    parsed >= 0
    ? parsed
    : 0;
}

function toEpoch(value: Date | null): number | null {
  return value ? value.getTime() : null;
}

async function tenantReference(accountId: string): Promise<string> {
  return sha256Hex(JSON.stringify(["data_request.tenant_reference.v1", accountId]));
}

async function transitionReceiptId(
  dataRequestId: string,
  idempotencyKey: string,
): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      "data_request.operator_transition.receipt.v1",
      dataRequestId,
      idempotencyKey,
    ]),
  );
}

async function transitionInputFingerprint(input: {
  dataRequestId: string;
  operatorDigest: string;
  expectedStatus: DataRequestOperatorTransitionExpectedStatus;
  expectedUpdatedAt: number;
  targetStatus: DataRequestOperatorTransitionTargetStatus;
}): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      "data_request.operator_transition.payload.v1",
      input.dataRequestId,
      input.operatorDigest,
      input.expectedStatus,
      input.expectedUpdatedAt,
      input.targetStatus,
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

function versionConflict(): RequestError {
  return new RequestError(
    409,
    "data_request_version_conflict",
    "The data request changed. Refresh its detail before retrying.",
  );
}

function incompleteReceipt(): RequestError {
  return new RequestError(
    409,
    "idempotency_record_incomplete",
    "This transition key has already been used, but its result cannot be replayed safely.",
  );
}
