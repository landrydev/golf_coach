import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  coachingPackages,
  developmentPlans,
  golferPlanResponses,
  golfers,
  instructorProfiles,
  launchMonitorImports,
  mediaAssets,
  practiceCheckIns,
  practiceItems,
} from "@/db/schema";
import { requireGolferRecordProcessingConsent } from "@/lib/consent-enforcement";
import { coachingWorkspaceHref } from "@/lib/coaching-workspace-tab";
import { MAX_PAGE_OFFSET } from "@/lib/pagination";
import { workspaceNextAction } from "@/lib/workspace-next-action";

export const GOLFER_DIRECTORY_PAGE_SIZE = 25;
export const COMMAND_CENTRE_ITEM_LIMIT = 4;

export const golferDirectoryStatuses = [
  "all",
  "setup_incomplete",
  "draft",
  "published",
  "paused",
  "completed",
  "archived",
  "deletion_pending",
] as const;
export const golferDirectoryPhases = [
  "all",
  "active",
  "paused",
  "planned",
  "complete",
  "no_phase",
] as const;
export const golferDirectoryReviews = [
  "all",
  "needs_review",
  "draft_review",
  "no_review",
] as const;
export const golferDirectorySorts = [
  "attention",
  "recent",
  "name",
  "phase",
] as const;

export type GolferDirectoryStatus = (typeof golferDirectoryStatuses)[number];
export type GolferDirectoryPhase = (typeof golferDirectoryPhases)[number];
export type GolferDirectoryReview = (typeof golferDirectoryReviews)[number];
export type GolferDirectorySort = (typeof golferDirectorySorts)[number];

export type GolferDirectoryQuery = {
  q: string;
  status: GolferDirectoryStatus;
  phase: GolferDirectoryPhase;
  review: GolferDirectoryReview;
  sort: GolferDirectorySort;
  page: number;
};

export type GolferDirectoryItem = {
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
  phase: {
    number: number;
    title: string;
    status: "planned" | "active" | "paused" | "complete" | "revised" | "canceled";
  } | null;
  needsReview: boolean;
  hasDraftReview: boolean;
};

type DirectoryPlanStatus = NonNullable<GolferDirectoryItem["plan"]>["status"];
type DirectoryPhaseStatus = NonNullable<GolferDirectoryItem["phase"]>["status"];

export type GolferDirectoryPage = {
  items: GolferDirectoryItem[];
  query: GolferDirectoryQuery;
  total: number;
  pageSize: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type SetupChecklistStep = {
  id: "identity" | "package" | "golfer" | "roadmap" | "share";
  label: string;
  detail: string;
  href: string;
  state: "complete" | "current" | "upcoming" | "optional";
};

export type CommandCentreTask = {
  id: string;
  golferId: string;
  golferName: string;
  title: string;
  detail: string;
  href: string;
  occurredAt?: number | null;
};

export type CommandCentreQuickAction = {
  id: "golfer" | "package" | "lesson" | "drill" | "media" | "evidence";
  label: string;
  detail: string;
  href: string;
};

export type CommandCentre = {
  setup: {
    complete: boolean;
    steps: SetupChecklistStep[];
  };
  incompleteDrafts: { count: number; items: CommandCentreTask[] };
  reviews: { count: number; items: CommandCentreTask[] };
  activePractice: { count: number; items: CommandCentreTask[] };
  recentResponses: { count: number; items: CommandCentreTask[] };
  quickActions: CommandCentreQuickAction[];
  failureSignals: {
    count: number;
    items: Array<{
      id: string;
      label: string;
      detail: string;
      kind: "media" | "launch_import";
      status: "failed" | "quarantined" | "mapping_required";
      href: string;
      occurredAt: number;
    }>;
  };
};

type SearchParamValue = string | string[] | undefined;

export function parseGolferDirectoryQuery(
  input: Record<string, SearchParamValue>,
): GolferDirectoryQuery {
  const q = single(input.q).trim().replace(/\s+/g, " ").slice(0, 80);
  return {
    q,
    status: oneOf(single(input.status), golferDirectoryStatuses, "all"),
    phase: oneOf(single(input.phase), golferDirectoryPhases, "all"),
    review: oneOf(single(input.review), golferDirectoryReviews, "all"),
    sort: oneOf(single(input.sort), golferDirectorySorts, "attention"),
    page: safePage(single(input.page)),
  };
}

export function golferDirectoryHref(
  query: GolferDirectoryQuery,
  overrides: Partial<GolferDirectoryQuery> = {},
): string {
  const next = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status !== "all") params.set("status", next.status);
  if (next.phase !== "all") params.set("phase", next.phase);
  if (next.review !== "all") params.set("review", next.review);
  if (next.sort !== "attention") params.set("sort", next.sort);
  if (next.page > 0) params.set("page", String(next.page));
  const suffix = params.toString();
  return suffix ? `/app/golfers?${suffix}` : "/app/golfers";
}

export async function listGolferDirectory(
  accountId: string,
  query: GolferDirectoryQuery,
): Promise<GolferDirectoryPage> {
  await requireGolferRecordProcessingConsent(accountId);
  const db = getDb();
  const expressions = golferDirectoryExpressions(accountId);
  const where = directoryWhere(accountId, query, expressions);
  const offset = query.page * GOLFER_DIRECTORY_PAGE_SIZE;
  const order = directoryOrder(query.sort, expressions);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: golfers.id,
        displayName: golfers.displayName,
        preferredName: golfers.preferredName,
        contactEmail: golfers.contactEmail,
        status: golfers.status,
        eligibilityStatus: golfers.eligibilityStatus,
        lastActivityAt: golfers.lastActivityAt,
        updatedAt: golfers.updatedAt,
        authoringComplete: expressions.authoringComplete,
        phaseNumber: expressions.phaseNumber,
        phaseTitle: expressions.phaseTitle,
        phaseStatus: expressions.phaseStatus,
        needsReview: expressions.needsReview,
        hasDraftReview: expressions.hasDraftReview,
      })
      .from(golfers)
      .where(where)
      .orderBy(...order)
      .limit(GOLFER_DIRECTORY_PAGE_SIZE + 1)
      .offset(offset),
    db.select({ value: count() }).from(golfers).where(where),
  ]);

  const boundedRows = rows.slice(0, GOLFER_DIRECTORY_PAGE_SIZE);
  const selectedGolferIds = boundedRows.map((row) => row.id);
  const rankedPlans = db
    .select({
      id: developmentPlans.id,
      golferId: developmentPlans.golferId,
      title: developmentPlans.title,
      status: developmentPlans.status,
      updatedAt: developmentPlans.updatedAt,
      planRank: sql<number>`row_number() over (
        partition by ${developmentPlans.golferId}
        order by ${developmentPlans.updatedAt} desc, ${developmentPlans.id} desc
      )`.as("plan_rank"),
    })
    .from(developmentPlans)
    .where(
      and(
        eq(developmentPlans.accountId, accountId),
        inArray(developmentPlans.golferId, selectedGolferIds),
      ),
    )
    .as("ranked_directory_plans");
  const selectedPlans = selectedGolferIds.length
    ? await db
        .select({
          id: rankedPlans.id,
          golferId: rankedPlans.golferId,
          title: rankedPlans.title,
          status: rankedPlans.status,
          updatedAt: rankedPlans.updatedAt,
        })
        .from(rankedPlans)
        .where(eq(rankedPlans.planRank, 1))
    : [];
  const selectedPlansByGolferId = new Map(
    selectedPlans.map((plan) => [plan.golferId, plan]),
  );
  const items = boundedRows.map((row) =>
    directoryItem(row, selectedPlansByGolferId.get(row.id) ?? null),
  );
  return {
    items,
    query,
    total: Number(countRows[0]?.value ?? 0),
    pageSize: GOLFER_DIRECTORY_PAGE_SIZE,
    hasPrevious: query.page > 0,
    hasMore: rows.length > GOLFER_DIRECTORY_PAGE_SIZE,
  };
}

export async function getCommandCentre(accountId: string): Promise<CommandCentre> {
  await requireGolferRecordProcessingConsent(accountId);
  const db = getDb();
  const incompleteQuery = parseGolferDirectoryQuery({
    status: "setup_incomplete",
    sort: "recent",
  });
  const reviewQuery = parseGolferDirectoryQuery({
    review: "needs_review",
    sort: "attention",
  });

  const [
    profileRows,
    packageRows,
    golferRows,
    completePlanRows,
    sharedPlanRows,
    incomplete,
    reviews,
    practiceRows,
    practiceCountRows,
    responseRows,
    responseCountRows,
    checkInRows,
    checkInCountRows,
    failureRows,
    failureCountRows,
    launchImportRows,
    launchImportCountRows,
    actionContextRows,
  ] = await Promise.all([
    db
      .select({ accountId: instructorProfiles.accountId })
      .from(instructorProfiles)
      .where(eq(instructorProfiles.accountId, accountId))
      .limit(1),
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
      .select({ value: count() })
      .from(golfers)
      .where(and(eq(golfers.accountId, accountId), ne(golfers.status, "deleted"))),
    db
      .select({ value: count() })
      .from(developmentPlans)
      .where(
        and(
          eq(developmentPlans.accountId, accountId),
          sql`exists (select 1 from assessments a where a.account_id = ${accountId} and a.plan_id = ${developmentPlans.id})`,
          sql`exists (select 1 from plan_priorities p where p.account_id = ${accountId} and p.plan_id = ${developmentPlans.id})`,
          sql`(select count(*) from plan_phases ph where ph.account_id = ${accountId} and ph.plan_id = ${developmentPlans.id}) in (3, 4)`,
        ),
      ),
    db
      .select({ value: count() })
      .from(developmentPlans)
      .where(
        and(
          eq(developmentPlans.accountId, accountId),
          isNotNull(developmentPlans.publishedRevision),
        ),
      ),
    listGolferDirectory(accountId, incompleteQuery),
    listGolferDirectory(accountId, reviewQuery),
    db
      .select({
        id: practiceItems.id,
        planId: practiceItems.planId,
        title: practiceItems.title,
        dueAt: practiceItems.dueAt,
        updatedAt: practiceItems.updatedAt,
        golferId: golfers.id,
        golferName: golfers.displayName,
      })
      .from(practiceItems)
      .innerJoin(
        developmentPlans,
        and(
          eq(developmentPlans.accountId, practiceItems.accountId),
          eq(developmentPlans.id, practiceItems.planId),
        ),
      )
      .innerJoin(
        golfers,
        and(
          eq(golfers.accountId, developmentPlans.accountId),
          eq(golfers.id, developmentPlans.golferId),
        ),
      )
      .where(
        and(
          eq(practiceItems.accountId, accountId),
          eq(practiceItems.status, "active"),
          ne(developmentPlans.status, "archived"),
          ne(golfers.status, "deleted"),
        ),
      )
      .orderBy(
        asc(sql`case when ${practiceItems.dueAt} is null then 1 else 0 end`),
        asc(practiceItems.dueAt),
        desc(practiceItems.updatedAt),
        asc(practiceItems.id),
      )
      .limit(COMMAND_CENTRE_ITEM_LIMIT),
    db
      .select({ value: count() })
      .from(practiceItems)
      .innerJoin(
        developmentPlans,
        and(
          eq(developmentPlans.accountId, practiceItems.accountId),
          eq(developmentPlans.id, practiceItems.planId),
        ),
      )
      .innerJoin(
        golfers,
        and(
          eq(golfers.accountId, developmentPlans.accountId),
          eq(golfers.id, developmentPlans.golferId),
        ),
      )
      .where(
        and(
          eq(practiceItems.accountId, accountId),
          eq(practiceItems.status, "active"),
          ne(developmentPlans.status, "archived"),
          ne(golfers.status, "deleted"),
        ),
      ),
    db
      .select({
        id: golferPlanResponses.id,
        responseType: golferPlanResponses.responseType,
        occurredAt: golferPlanResponses.occurredAt,
        golferId: golfers.id,
        golferName: golfers.displayName,
        planTitle: developmentPlans.title,
      })
      .from(golferPlanResponses)
      .innerJoin(
        developmentPlans,
        and(
          eq(developmentPlans.accountId, golferPlanResponses.accountId),
          eq(developmentPlans.id, golferPlanResponses.planId),
        ),
      )
      .innerJoin(
        golfers,
        and(
          eq(golfers.accountId, developmentPlans.accountId),
          eq(golfers.id, developmentPlans.golferId),
        ),
      )
      .where(
        and(
          eq(golferPlanResponses.accountId, accountId),
          ne(golfers.status, "deleted"),
        ),
      )
      .orderBy(desc(golferPlanResponses.occurredAt), desc(golferPlanResponses.id))
      .limit(COMMAND_CENTRE_ITEM_LIMIT),
    db
      .select({ value: count() })
      .from(golferPlanResponses)
      .innerJoin(
        developmentPlans,
        and(
          eq(developmentPlans.accountId, golferPlanResponses.accountId),
          eq(developmentPlans.id, golferPlanResponses.planId),
        ),
      )
      .innerJoin(
        golfers,
        and(
          eq(golfers.accountId, developmentPlans.accountId),
          eq(golfers.id, developmentPlans.golferId),
        ),
      )
      .where(
        and(
          eq(golferPlanResponses.accountId, accountId),
          ne(golfers.status, "deleted"),
        ),
      ),
    db
      .select({
        id: practiceCheckIns.id,
        planId: practiceCheckIns.planId,
        practiceItemId: practiceCheckIns.practiceItemId,
        completionStatus: practiceCheckIns.completionStatus,
        perceivedDifficulty: practiceCheckIns.perceivedDifficulty,
        confidenceRating: practiceCheckIns.confidenceRating,
        requestHelp: practiceCheckIns.requestHelp,
        occurredAt: practiceCheckIns.occurredAt,
        practiceTitle: practiceItems.title,
        golferId: golfers.id,
        golferName: golfers.displayName,
      })
      .from(practiceCheckIns)
      .innerJoin(
        practiceItems,
        and(
          eq(practiceItems.accountId, practiceCheckIns.accountId),
          eq(practiceItems.planId, practiceCheckIns.planId),
          eq(practiceItems.id, practiceCheckIns.practiceItemId),
        ),
      )
      .innerJoin(
        developmentPlans,
        and(
          eq(developmentPlans.accountId, practiceCheckIns.accountId),
          eq(developmentPlans.id, practiceCheckIns.planId),
        ),
      )
      .innerJoin(
        golfers,
        and(
          eq(golfers.accountId, developmentPlans.accountId),
          eq(golfers.id, developmentPlans.golferId),
        ),
      )
      .where(
        and(
          eq(practiceCheckIns.accountId, accountId),
          ne(developmentPlans.status, "archived"),
          ne(golfers.status, "deleted"),
        ),
      )
      .orderBy(desc(practiceCheckIns.occurredAt), desc(practiceCheckIns.id))
      .limit(COMMAND_CENTRE_ITEM_LIMIT),
    db
      .select({ value: count() })
      .from(practiceCheckIns)
      .innerJoin(
        developmentPlans,
        and(
          eq(developmentPlans.accountId, practiceCheckIns.accountId),
          eq(developmentPlans.id, practiceCheckIns.planId),
        ),
      )
      .innerJoin(
        golfers,
        and(
          eq(golfers.accountId, developmentPlans.accountId),
          eq(golfers.id, developmentPlans.golferId),
        ),
      )
      .where(
        and(
          eq(practiceCheckIns.accountId, accountId),
          ne(developmentPlans.status, "archived"),
          ne(golfers.status, "deleted"),
        ),
      ),
    db
      .select({
        id: mediaAssets.id,
        filename: mediaAssets.originalFilename,
        failureCode: mediaAssets.failureCode,
        status: mediaAssets.status,
        updatedAt: mediaAssets.updatedAt,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.accountId, accountId),
          inArray(mediaAssets.status, ["failed", "quarantined"]),
        ),
      )
      .orderBy(desc(mediaAssets.updatedAt), desc(mediaAssets.id))
      .limit(COMMAND_CENTRE_ITEM_LIMIT),
    db
      .select({ value: count() })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.accountId, accountId),
          inArray(mediaAssets.status, ["failed", "quarantined"]),
        ),
      ),
    db
      .select({
        id: launchMonitorImports.id,
        planId: launchMonitorImports.planId,
        status: launchMonitorImports.status,
        errorCode: launchMonitorImports.errorCode,
        totalRowCount: launchMonitorImports.totalRowCount,
        rejectedRowCount: launchMonitorImports.rejectedRowCount,
        updatedAt: launchMonitorImports.updatedAt,
        golferName: golfers.displayName,
      })
      .from(launchMonitorImports)
      .innerJoin(
        developmentPlans,
        and(
          eq(developmentPlans.accountId, launchMonitorImports.accountId),
          eq(developmentPlans.id, launchMonitorImports.planId),
        ),
      )
      .innerJoin(
        golfers,
        and(
          eq(golfers.accountId, developmentPlans.accountId),
          eq(golfers.id, developmentPlans.golferId),
        ),
      )
      .where(
        and(
          eq(launchMonitorImports.accountId, accountId),
          inArray(launchMonitorImports.status, ["failed", "mapping_required"]),
          ne(developmentPlans.status, "archived"),
          ne(golfers.status, "deleted"),
        ),
      )
      .orderBy(desc(launchMonitorImports.updatedAt), desc(launchMonitorImports.id))
      .limit(COMMAND_CENTRE_ITEM_LIMIT),
    db
      .select({ value: count() })
      .from(launchMonitorImports)
      .innerJoin(
        developmentPlans,
        and(
          eq(developmentPlans.accountId, launchMonitorImports.accountId),
          eq(developmentPlans.id, launchMonitorImports.planId),
        ),
      )
      .innerJoin(
        golfers,
        and(
          eq(golfers.accountId, developmentPlans.accountId),
          eq(golfers.id, developmentPlans.golferId),
        ),
      )
      .where(
        and(
          eq(launchMonitorImports.accountId, accountId),
          inArray(launchMonitorImports.status, ["failed", "mapping_required"]),
          ne(developmentPlans.status, "archived"),
          ne(golfers.status, "deleted"),
        ),
      ),
    db
      .select({
        planId: developmentPlans.id,
        golferName: golfers.displayName,
      })
      .from(developmentPlans)
      .innerJoin(
        golfers,
        and(
          eq(golfers.accountId, developmentPlans.accountId),
          eq(golfers.id, developmentPlans.golferId),
        ),
      )
      .where(
        and(
          eq(developmentPlans.accountId, accountId),
          inArray(developmentPlans.status, ["draft", "preview_ready", "published", "paused"]),
          eq(golfers.status, "active"),
          sql`exists (select 1 from assessments a where a.account_id = ${accountId} and a.plan_id = ${developmentPlans.id})`,
          sql`exists (select 1 from plan_priorities p where p.account_id = ${accountId} and p.plan_id = ${developmentPlans.id})`,
          sql`(select count(*) from plan_phases ph where ph.account_id = ${accountId} and ph.plan_id = ${developmentPlans.id}) in (3, 4)`,
        ),
      )
      .orderBy(desc(developmentPlans.updatedAt), desc(developmentPlans.id))
      .limit(1),
  ]);

  const profileComplete = profileRows.length === 1;
  const hasPackage = Number(packageRows[0]?.value ?? 0) > 0;
  const hasGolfer = Number(golferRows[0]?.value ?? 0) > 0;
  const hasCompletePlan = Number(completePlanRows[0]?.value ?? 0) > 0;
  const hasSharedPlan = Number(sharedPlanRows[0]?.value ?? 0) > 0;
  const recentActivity: CommandCentreTask[] = [
    ...responseRows.map((row) => ({
      id: `response:${row.id}`,
      golferId: row.golferId,
      golferName: row.golferName,
      title: responseLabel(row.responseType),
      detail: row.planTitle,
      href: `/app/golfers/${encodeURIComponent(row.golferId)}#golfer-responses-heading`,
      occurredAt: toEpoch(row.occurredAt),
    })),
    ...checkInRows.map((row) => ({
      id: `check-in:${row.id}`,
      golferId: row.golferId,
      golferName: row.golferName,
      title: practiceCheckInLabel(row.completionStatus, row.requestHelp),
      detail: practiceCheckInDetail({
        practiceTitle: row.practiceTitle,
        perceivedDifficulty: row.perceivedDifficulty,
        confidenceRating: row.confidenceRating,
      }),
      href: coachingWorkspaceHref(row.planId, {
        tab: "practice",
        focus: {
          kind: "practice",
          practiceId: row.practiceItemId,
          checkInId: row.id,
        },
      }),
      occurredAt: toEpoch(row.occurredAt),
    })),
  ]
    .sort(recentFirst)
    .slice(0, COMMAND_CENTRE_ITEM_LIMIT);
  const failureSignalItems: CommandCentre["failureSignals"]["items"] = [
    ...failureRows.map((row) => ({
      id: `media:${row.id}`,
      label: row.filename?.trim() || "Private media item",
      detail:
        row.status === "quarantined"
          ? "Quarantined; keep unavailable and review the recorded media status."
          : row.failureCode?.trim() || "Processing failed; review before retrying.",
      kind: "media" as const,
      status: row.status as "failed" | "quarantined",
      href: `/app/media#media-asset-${encodeURIComponent(row.id)}`,
      occurredAt: toEpoch(row.updatedAt),
    })),
    ...launchImportRows.map((row) => ({
      id: `launch-import:${row.id}`,
      label: `${row.golferName} · launch-data import`,
      detail: launchImportDetail(row),
      kind: "launch_import" as const,
      status: row.status as "failed" | "mapping_required",
      href: coachingWorkspaceHref(row.planId, {
        tab: "launch",
        focus: { kind: "launch_import", importId: row.id },
      }),
      occurredAt: toEpoch(row.updatedAt),
    })),
  ]
    .sort(recentFirst)
    .slice(0, COMMAND_CENTRE_ITEM_LIMIT);
  const actionContext = actionContextRows[0];
  const quickActions: CommandCentreQuickAction[] = [
    {
      id: "golfer",
      label: "New golfer",
      detail: "Start an adult golfer record and first roadmap.",
      href: "/app/golfers/new",
    },
    {
      id: "package",
      label: "Add package",
      detail: "Publish an external coaching offer or enquiry route.",
      href: "/app/packages",
    },
    {
      id: "drill",
      label: "New drill",
      detail: "Create a reusable private coaching drill.",
      href: "/app/coaching/drills",
    },
    {
      id: "media",
      label: "Upload media",
      detail: "Add a private file, then attach it to coaching work.",
      href: "/app/media#upload-media",
    },
  ];
  if (actionContext) {
    const planId = actionContext.planId;
    quickActions.splice(
      2,
      0,
      {
        id: "lesson",
        label: "New lesson",
        detail: `Plan or record a lesson for ${actionContext.golferName}.`,
        href: coachingWorkspaceHref(planId, { tab: "lessons" }),
      },
      {
        id: "evidence",
        label: "Add evidence",
        detail: `Record evidence and its limits for ${actionContext.golferName}.`,
        href: coachingWorkspaceHref(planId, { tab: "evidence" }),
      },
    );
  }

  return {
    setup: setupChecklist({
      profileComplete,
      hasPackage,
      hasGolfer,
      hasCompletePlan,
      hasSharedPlan,
    }),
    incompleteDrafts: {
      count: incomplete.total,
      items: incomplete.items.slice(0, COMMAND_CENTRE_ITEM_LIMIT).map((item) => {
        const action = workspaceNextAction(item);
        return {
          id: item.plan?.id ?? item.id,
          golferId: item.id,
          golferName: golferName(item),
          title: item.plan?.title ?? action.label,
          detail: action.explanation,
          href: action.href,
          occurredAt: item.updatedAt,
        };
      }),
    },
    reviews: {
      count: reviews.total,
      items: reviews.items.slice(0, COMMAND_CENTRE_ITEM_LIMIT).map((item) => ({
        id: item.plan?.id ?? item.id,
        golferId: item.id,
        golferName: golferName(item),
        title: item.plan?.title ?? "Roadmap review",
        detail: item.hasDraftReview
          ? "A phase review draft needs a coach decision."
          : "The roadmap is ready for coach preview and publication review.",
        href: `/app/golfers/${encodeURIComponent(item.id)}${
          item.hasDraftReview ? "#hub-reviews" : "#hub-roadmap"
        }`,
        occurredAt: item.updatedAt,
      })),
    },
    activePractice: {
      count: Number(practiceCountRows[0]?.value ?? 0),
      items: practiceRows.map((row) => ({
        id: row.id,
        golferId: row.golferId,
        golferName: row.golferName,
        title: row.title,
        detail: row.dueAt
          ? `Due ${formatShortDate(toEpoch(row.dueAt))}`
          : "Active practice direction with no fixed due date.",
        href: coachingWorkspaceHref(row.planId, {
          tab: "practice",
          focus: { kind: "practice", practiceId: row.id },
        }),
        occurredAt: toEpoch(row.updatedAt),
      })),
    },
    recentResponses: {
      count:
        Number(responseCountRows[0]?.value ?? 0) +
        Number(checkInCountRows[0]?.value ?? 0),
      items: recentActivity,
    },
    quickActions,
    failureSignals: {
      count:
        Number(failureCountRows[0]?.value ?? 0) +
        Number(launchImportCountRows[0]?.value ?? 0),
      items: failureSignalItems,
    },
  };
}

function golferDirectoryExpressions(accountId: string) {
  const planId = sql<string | null>`(
    select candidate.id
      from development_plans candidate
     where candidate.account_id = ${accountId}
       and candidate.golfer_id = ${golfers.id}
     order by candidate.updated_at desc, candidate.id desc
     limit 1
  )`;
  const planTitle = planField<string | null>(accountId, "title");
  const planStatus = planField<DirectoryPlanStatus | null>(accountId, "status");
  const planUpdatedAt = planField<number | null>(accountId, "updated_at");
  const phaseId = sql<string | null>`(
    select phase.id
      from plan_phases phase
     where phase.account_id = ${accountId}
       and phase.plan_id = ${planId}
       and phase.status in ('active', 'paused', 'planned', 'complete')
     order by case phase.status
       when 'active' then 0 when 'paused' then 1 when 'planned' then 2 else 3 end,
       phase.sequence asc,
       phase.id asc
     limit 1
  )`;
  const phaseNumber = sql<number | null>`(
    select phase.sequence from plan_phases phase
     where phase.account_id = ${accountId} and phase.id = ${phaseId} limit 1
  )`;
  const phaseTitle = sql<string | null>`(
    select phase.title from plan_phases phase
     where phase.account_id = ${accountId} and phase.id = ${phaseId} limit 1
  )`;
  const phaseStatus = sql<DirectoryPhaseStatus | null>`(
    select phase.status from plan_phases phase
     where phase.account_id = ${accountId} and phase.id = ${phaseId} limit 1
  )`;
  const authoringComplete = sql<number>`case when
    ${planId} is not null
    and exists (select 1 from assessments a where a.account_id = ${accountId} and a.plan_id = ${planId})
    and exists (select 1 from plan_priorities p where p.account_id = ${accountId} and p.plan_id = ${planId})
    and (select count(*) from plan_phases ph where ph.account_id = ${accountId} and ph.plan_id = ${planId}) in (3, 4)
    then 1 else 0 end`;
  const hasDraftReview = sql<number>`case when exists (
    select 1 from phase_reviews review
     where review.account_id = ${accountId}
       and review.plan_id = ${planId}
       and review.status = 'draft'
  ) then 1 else 0 end`;
  const needsReview = sql<number>`case when
    (${authoringComplete} = 1 and ${planStatus} in ('draft', 'preview_ready'))
    or ${hasDraftReview} = 1
    then 1 else 0 end`;
  const activityAt = sql<number>`max(
    ${golfers.updatedAt},
    coalesce(${planUpdatedAt}, 0)
  )`;
  return {
    planId,
    planTitle,
    planStatus,
    planUpdatedAt,
    authoringComplete,
    phaseNumber,
    phaseTitle,
    phaseStatus,
    hasDraftReview,
    needsReview,
    activityAt,
  };
}

function planField<T>(accountId: string, field: "title" | "status" | "updated_at") {
  return sql<T>`(
    select candidate.${sql.raw(field)}
      from development_plans candidate
     where candidate.account_id = ${accountId}
       and candidate.golfer_id = ${golfers.id}
     order by candidate.updated_at desc, candidate.id desc
     limit 1
  )`;
}

type DirectoryExpressions = ReturnType<typeof golferDirectoryExpressions>;

function directoryWhere(
  accountId: string,
  query: GolferDirectoryQuery,
  expressions: DirectoryExpressions,
): SQL | undefined {
  const predicates: SQL[] = [
    sql`${golfers.accountId} = ${accountId}`,
    sql`${golfers.status} <> 'deleted'`,
  ];
  if (query.q) {
    const pattern = `%${escapeLike(query.q.toLocaleLowerCase("en-CA"))}%`;
    predicates.push(sql`(
      lower(${golfers.displayName}) like ${pattern} escape '\\'
      or lower(coalesce(${golfers.preferredName}, '')) like ${pattern} escape '\\'
      or lower(coalesce(${golfers.contactEmail}, '')) like ${pattern} escape '\\'
      or lower(coalesce(${expressions.planTitle}, '')) like ${pattern} escape '\\'
    )`);
  }
  switch (query.status) {
    case "setup_incomplete":
      predicates.push(sql`${expressions.authoringComplete} = 0`);
      break;
    case "draft":
      predicates.push(
        sql`${expressions.authoringComplete} = 1 and ${expressions.planStatus} in ('draft', 'preview_ready')`,
      );
      break;
    case "published":
    case "paused":
    case "completed":
      predicates.push(sql`${expressions.planStatus} = ${query.status}`);
      break;
    case "archived":
      predicates.push(
        sql`(${golfers.status} = 'archived' or ${expressions.planStatus} = 'archived')`,
      );
      break;
    case "deletion_pending":
      predicates.push(sql`${golfers.status} = 'deletion_pending'`);
      break;
    case "all":
      break;
  }
  switch (query.phase) {
    case "active":
    case "paused":
    case "planned":
    case "complete":
      predicates.push(sql`${expressions.phaseStatus} = ${query.phase}`);
      break;
    case "no_phase":
      predicates.push(sql`${expressions.phaseStatus} is null`);
      break;
    case "all":
      break;
  }
  switch (query.review) {
    case "needs_review":
      predicates.push(sql`${expressions.needsReview} = 1`);
      break;
    case "draft_review":
      predicates.push(sql`${expressions.hasDraftReview} = 1`);
      break;
    case "no_review":
      predicates.push(sql`${expressions.hasDraftReview} = 0`);
      break;
    case "all":
      break;
  }
  return and(...predicates);
}

function directoryOrder(
  sort: GolferDirectorySort,
  expressions: DirectoryExpressions,
): SQL[] {
  switch (sort) {
    case "recent":
      return [desc(expressions.activityAt), desc(golfers.id)];
    case "name":
      return [
        asc(sql`lower(coalesce(${golfers.preferredName}, ${golfers.displayName}))`),
        asc(golfers.id),
      ];
    case "phase":
      return [
        asc(sql`case when ${expressions.phaseNumber} is null then 1 else 0 end`),
        asc(expressions.phaseNumber),
        asc(sql`lower(coalesce(${golfers.preferredName}, ${golfers.displayName}))`),
        asc(golfers.id),
      ];
    case "attention":
      return [
        desc(expressions.needsReview),
        asc(expressions.authoringComplete),
        desc(expressions.activityAt),
        desc(golfers.id),
      ];
  }
}

function directoryItem(
  row: {
    id: string;
    displayName: string;
    preferredName: string | null;
    contactEmail: string | null;
    status: GolferDirectoryItem["status"];
    eligibilityStatus: GolferDirectoryItem["eligibilityStatus"];
    lastActivityAt: Date | null;
    updatedAt: Date;
    authoringComplete: number;
    phaseNumber: number | null;
    phaseTitle: string | null;
    phaseStatus: DirectoryPhaseStatus | null;
    needsReview: number;
    hasDraftReview: number;
  },
  selectedPlan: {
    id: string;
    golferId: string;
    title: string;
    status: DirectoryPlanStatus;
    updatedAt: Date;
  } | null,
): GolferDirectoryItem {
  const plan =
    selectedPlan?.golferId === row.id
    ? {
        id: selectedPlan.id,
        title: selectedPlan.title,
        status: selectedPlan.status,
        updatedAt: toEpoch(selectedPlan.updatedAt),
        authoringComplete: Boolean(row.authoringComplete),
      }
    : null;
  return {
    id: row.id,
    displayName: row.displayName,
    preferredName: row.preferredName,
    contactEmail: row.contactEmail,
    status: row.status,
    eligibilityStatus: row.eligibilityStatus,
    lastActivityAt: row.lastActivityAt ? toEpoch(row.lastActivityAt) : null,
    updatedAt: Math.max(toEpoch(row.updatedAt), plan?.updatedAt ?? 0),
    plan,
    phase:
      row.phaseNumber && row.phaseTitle && row.phaseStatus
        ? {
            number: row.phaseNumber,
            title: row.phaseTitle,
            status: row.phaseStatus,
          }
        : null,
    needsReview: Boolean(row.needsReview),
    hasDraftReview: Boolean(row.hasDraftReview),
  };
}

function setupChecklist(input: {
  profileComplete: boolean;
  hasPackage: boolean;
  hasGolfer: boolean;
  hasCompletePlan: boolean;
  hasSharedPlan: boolean;
}): CommandCentre["setup"] {
  const required = [
    input.profileComplete,
    input.hasGolfer,
    input.hasCompletePlan,
    input.hasSharedPlan,
  ];
  const currentRequiredIndex = required.findIndex((value) => !value);
  const requiredState = (index: number, complete: boolean) =>
    complete
      ? "complete" as const
      : currentRequiredIndex === index
        ? "current" as const
        : "upcoming" as const;
  const steps: SetupChecklistStep[] = [
    {
      id: "identity",
      label: "Coach identity",
      detail: input.profileComplete
        ? "Saved and ready for the golfer view."
        : "Add the name and contact route golfers should recognize.",
      href: "/app/settings",
      state: requiredState(0, input.profileComplete),
    },
    {
      id: "package",
      label: "Current package",
      detail: input.hasPackage
        ? "An active external coaching option is available."
        : "Optional: connect an existing booking or purchase route later.",
      href: "/app/packages",
      state: input.hasPackage ? "complete" : "optional",
    },
    {
      id: "golfer",
      label: "First golfer",
      detail: input.hasGolfer
        ? "A private adult-golfer record is saved."
        : "Save the golfer and goal first; complete coaching judgment next.",
      href: "/app/golfers/new",
      state: requiredState(1, input.hasGolfer),
    },
    {
      id: "roadmap",
      label: "Complete roadmap",
      detail: input.hasCompletePlan
        ? "A three- or four-phase roadmap is ready for review."
        : "Add assessment, priority, and directional phases.",
      href: input.hasGolfer
        ? "/app/golfers?status=setup_incomplete"
        : "/app/golfers/new",
      state: requiredState(2, input.hasCompletePlan),
    },
    {
      id: "share",
      label: "Review and share",
      detail: input.hasSharedPlan
        ? "At least one exact revision has been deliberately published."
        : "Preview the exact golfer view before creating private access.",
      href: input.hasCompletePlan
        ? "/app/golfers?review=needs_review"
        : "/app/golfers?status=setup_incomplete",
      state: requiredState(3, input.hasSharedPlan),
    },
  ];
  return {
    complete: currentRequiredIndex === -1,
    steps,
  };
}

function responseLabel(value: string): string {
  const labels: Record<string, string> = {
    ask_question: "Question path opened",
    wait: "Review later recorded",
    decline: "Not pursuing this option",
    request_reassessment: "Reassessment requested",
    independent_practice: "Independent practice chosen",
    external_action_opened: "External coach action opened",
  };
  return labels[value] ?? "Golfer choice recorded";
}

function practiceCheckInLabel(completionStatus: string, requestHelp: boolean): string {
  const state = completionStatus === "completed"
    ? "Practice completed"
    : "Practice not completed";
  return requestHelp ? `${state} · help requested` : state;
}

function practiceCheckInDetail(input: {
  practiceTitle: string;
  perceivedDifficulty: string | null;
  confidenceRating: number | null;
}): string {
  const detail = [input.practiceTitle];
  if (input.perceivedDifficulty) {
    detail.push(formatStoredChoice(input.perceivedDifficulty));
  }
  if (input.confidenceRating) {
    detail.push(`confidence ${input.confidenceRating} of 5`);
  }
  return detail.join(" · ");
}

function launchImportDetail(input: {
  status: string;
  errorCode: string | null;
  totalRowCount: number;
  rejectedRowCount: number;
}): string {
  if (input.status === "mapping_required") {
    return input.rejectedRowCount > 0
      ? `${input.rejectedRowCount} of ${input.totalRowCount} rows are currently rejected; mapping or correction is required. Open the workspace and select Launch data.`
      : `Column mapping is required before ${input.totalRowCount} staged rows can be validated. Open the workspace and select Launch data.`;
  }
  return input.errorCode?.trim()
    ? `Import failed: ${formatStoredChoice(input.errorCode)}. Open the workspace and select Launch data.`
    : "Import failed. Open the workspace and select Launch data before retrying.";
}

function formatStoredChoice(value: string): string {
  return value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function recentFirst(
  left: { id: string; occurredAt?: number | null },
  right: { id: string; occurredAt?: number | null },
): number {
  return (right.occurredAt ?? 0) - (left.occurredAt ?? 0) ||
    right.id.localeCompare(left.id, "en-CA");
}

function golferName(item: Pick<GolferDirectoryItem, "preferredName" | "displayName">) {
  return item.preferredName || item.displayName;
}

function single(value: SearchParamValue): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function oneOf<const T extends readonly string[]>(
  value: string,
  choices: T,
  fallback: T[number],
): T[number] {
  return choices.includes(value as T[number]) ? value as T[number] : fallback;
}

function safePage(value: string): number {
  if (!/^\d+$/.test(value)) return 0;
  const page = Number(value);
  const maximum = Math.floor(MAX_PAGE_OFFSET / GOLFER_DIRECTORY_PAGE_SIZE);
  return Number.isSafeInteger(page) && page >= 0 && page <= maximum ? page : 0;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function toEpoch(value: Date | number | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatShortDate(value: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
