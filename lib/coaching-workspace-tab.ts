export const COACHING_WORKSPACE_TABS = [
  "practice",
  "lessons",
  "evidence",
  "media",
  "launch",
  "reviews",
  "milestones",
  "timeline",
] as const;

export type CoachingWorkspaceTab = (typeof COACHING_WORKSPACE_TABS)[number];

export type CoachingWorkspaceFocus =
  | { kind: "practice"; practiceId: string; checkInId?: string }
  | { kind: "lesson"; lessonId: string }
  | { kind: "media"; attachmentId: string }
  | { kind: "launch_import"; importId: string };

export type CoachingWorkspaceLocation = {
  tab: CoachingWorkspaceTab;
  focus: CoachingWorkspaceFocus | null;
};

type SearchParamValue = string | string[] | undefined;

const RECORD_QUERY_KEYS = [
  "practiceId",
  "checkInId",
  "lessonId",
  "attachmentId",
  "importId",
] as const;

export function resolveCoachingWorkspaceTab(value: string | undefined): CoachingWorkspaceTab {
  return COACHING_WORKSPACE_TABS.includes(value as CoachingWorkspaceTab)
    ? (value as CoachingWorkspaceTab)
    : "practice";
}

export function resolveCoachingWorkspaceLocation(
  input: Record<string, SearchParamValue>,
): CoachingWorkspaceLocation {
  const tab = resolveCoachingWorkspaceTab(single(input.tab));
  if (tab === "practice") {
    const practiceId = boundedRecordId(single(input.practiceId));
    if (practiceId) {
      const checkInId = boundedRecordId(single(input.checkInId));
      return {
        tab,
        focus: checkInId
          ? { kind: "practice", practiceId, checkInId }
          : { kind: "practice", practiceId },
      };
    }
  }
  if (tab === "lessons") {
    const lessonId = boundedRecordId(single(input.lessonId));
    if (lessonId) return { tab, focus: { kind: "lesson", lessonId } };
  }
  if (tab === "media") {
    const attachmentId = boundedRecordId(single(input.attachmentId));
    if (attachmentId) return { tab, focus: { kind: "media", attachmentId } };
  }
  if (tab === "launch") {
    const importId = boundedRecordId(single(input.importId));
    if (importId) return { tab, focus: { kind: "launch_import", importId } };
  }
  return { tab, focus: null };
}

export function coachingWorkspaceHref(
  planId: string,
  location: {
    tab: CoachingWorkspaceTab;
    focus?: CoachingWorkspaceFocus | null;
  },
): string {
  const params = new URLSearchParams({ tab: location.tab });
  const focus = focusForTab(location.tab, location.focus ?? null);
  if (focus?.kind === "practice") {
    params.set("practiceId", focus.practiceId);
    if (focus.checkInId) params.set("checkInId", focus.checkInId);
  } else if (focus?.kind === "lesson") {
    params.set("lessonId", focus.lessonId);
  } else if (focus?.kind === "media") {
    params.set("attachmentId", focus.attachmentId);
  } else if (focus?.kind === "launch_import") {
    params.set("importId", focus.importId);
  }
  return `/app/coaching/plans/${encodeURIComponent(planId)}?${params.toString()}`;
}

export function coachingWorkspaceFocusDomId(focus: CoachingWorkspaceFocus): string {
  if (focus.kind === "practice") {
    return focus.checkInId
      ? `workspace-check-in-${focus.checkInId}`
      : `workspace-practice-${focus.practiceId}`;
  }
  if (focus.kind === "lesson") return `workspace-lesson-${focus.lessonId}`;
  if (focus.kind === "media") return `workspace-media-${focus.attachmentId}`;
  return `workspace-import-${focus.importId}`;
}

export function clearCoachingWorkspaceRecordQuery(url: URL): void {
  for (const key of RECORD_QUERY_KEYS) url.searchParams.delete(key);
}

function focusForTab(
  tab: CoachingWorkspaceTab,
  focus: CoachingWorkspaceFocus | null,
): CoachingWorkspaceFocus | null {
  if (!focus) return null;
  if (tab === "practice" && focus.kind === "practice") {
    const practiceId = boundedRecordId(focus.practiceId);
    if (!practiceId) return null;
    const checkInId = focus.checkInId ? boundedRecordId(focus.checkInId) : null;
    return checkInId
      ? { kind: "practice", practiceId, checkInId }
      : { kind: "practice", practiceId };
  }
  if (tab === "lessons" && focus.kind === "lesson") {
    const lessonId = boundedRecordId(focus.lessonId);
    return lessonId ? { kind: "lesson", lessonId } : null;
  }
  if (tab === "media" && focus.kind === "media") {
    const attachmentId = boundedRecordId(focus.attachmentId);
    return attachmentId ? { kind: "media", attachmentId } : null;
  }
  if (tab === "launch" && focus.kind === "launch_import") {
    const importId = boundedRecordId(focus.importId);
    return importId ? { kind: "launch_import", importId } : null;
  }
  return null;
}

function boundedRecordId(value: string): string | null {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value) ? value : null;
}

function single(value: SearchParamValue): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
