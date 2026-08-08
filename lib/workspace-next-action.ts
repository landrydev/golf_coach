import type { GolferListItem } from "./repository";

export type WorkspaceNextAction = {
  label: string;
  explanation: string;
};

export function workspaceNextAction(golfer: GolferListItem): WorkspaceNextAction {
  if (golfer.status === "archived" || golfer.plan?.status === "archived") {
    return {
      label: "View archived record",
      explanation: "Read-only history; no new private access is available.",
    };
  }
  if (golfer.status === "deletion_pending") {
    return {
      label: "Review data-request status",
      explanation: "A deletion review is open; no deletion is implied.",
    };
  }
  if (!golfer.plan) {
    return {
      label: "Continue setup",
      explanation: "Complete the minimum goal and coach-authored roadmap.",
    };
  }
  if (golfer.plan.authoringComplete === false) {
    return {
      label: "Continue roadmap setup",
      explanation:
        "The saved identity, title, and goal are private; complete the real coaching content before review or publication.",
    };
  }

  const actions: Record<
    NonNullable<GolferListItem["plan"]>["status"],
    WorkspaceNextAction
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
  return actions[golfer.plan.status];
}
