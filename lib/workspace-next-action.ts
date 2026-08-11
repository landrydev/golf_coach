import type { GolferListItem } from "./repository";

type WorkspaceActionGolfer = Pick<GolferListItem, "id" | "status"> & {
  plan: Pick<NonNullable<GolferListItem["plan"]>, "status" | "authoringComplete"> | null;
};

export type WorkspaceNextAction = {
  label: string;
  explanation: string;
  href: string;
};

export function workspaceNextAction(golfer: WorkspaceActionGolfer): WorkspaceNextAction {
  const golferHref = `/app/golfers/${encodeURIComponent(golfer.id)}`;
  if (golfer.status === "deletion_pending") {
    return {
      label: "Review data-request status",
      explanation: "A deletion review is open; no deletion is implied.",
      href: "/app/settings/data",
    };
  }
  if (golfer.status === "archived" || golfer.plan?.status === "archived") {
    return {
      label: "View archived record",
      explanation: "Read-only history; no new private access is available.",
      href: golfer.plan ? golferHref : `${golferHref}/recover`,
    };
  }
  if (!golfer.plan) {
    return {
      label: "Review record recovery options",
      explanation:
        "No roadmap is attached to this retained golfer record; review record-specific options before creating or changing another record.",
      href: `${golferHref}/recover`,
    };
  }
  if (golfer.plan.authoringComplete === false) {
    return {
      label: "Continue roadmap setup",
      explanation:
        "The saved identity, title, and goal are private; complete the real coaching content before review or publication.",
      href: `${golferHref}/complete`,
    };
  }

  const actions: Record<
    NonNullable<GolferListItem["plan"]>["status"],
    Omit<WorkspaceNextAction, "href">
  > = {
    draft: {
      label: "Review draft",
      explanation: "Resolve material blockers, then preview before sharing.",
    },
    preview_ready: {
      label: "Preview and publish",
      explanation: "Confirm the exact golfer view and intended recipient.",
    },
    published: {
      label: "Review live plan",
      explanation: "Check access, responses, and the next useful coaching update.",
    },
    paused: {
      label: "Review paused plan",
      explanation: "Confirm whether to continue, revise, or complete the phase.",
    },
    completed: {
      label: "Review completed plan",
      explanation: "Keep the final record truthful; completion is not an outcome guarantee.",
    },
    archived: {
      label: "View archived record",
      explanation: "Read-only history; no new private access is available.",
    },
  };
  return { ...actions[golfer.plan.status], href: golferHref };
}
