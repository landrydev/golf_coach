"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  clientMutationErrorMessage,
  requestClientMutation,
  requestClientRead,
} from "@/lib/client-mutation-recovery";
import {
  defaultMetricUnit,
  launchCsvMetricUnits,
  launchCsvStageFingerprint,
  validateLaunchCsvReview,
} from "@/lib/launch-csv-review";
import {
  clearCoachingWorkspaceRecordQuery,
  coachingWorkspaceFocusDomId,
  type CoachingWorkspaceFocus,
  type CoachingWorkspaceTab,
} from "@/lib/coaching-workspace-tab";
import styles from "../../coaching.module.css";

type Phase = { id: string; sequence?: number; title: string; status?: string };
type TimelineItem = {
  id: string;
  kind: string;
  occurredAt: number;
  title: string;
  summary: string | null;
  status: string;
};
type MediaAttachment = {
  attachment: { id: string; targetType: string; role: string; status: string };
  asset: {
    id: string;
    mediaKind: string;
    altText: string | null;
    caption: string | null;
    viewLabel?: string | null;
  };
};
type MediaAsset = {
  id: string;
  status: string;
  mediaKind: string;
  altText: string | null;
  caption: string | null;
  originalFilename?: string | null;
};
type DrillGuidance = {
  title: string;
  purpose: string;
  whenItFits: string;
  equipment: string[];
  setup: string;
  steps: string[];
  dosageOrCadence: string;
  feelOrCue: string | null;
  successCheck: string;
  commonMiss: string | null;
  stopOrAskRule: string;
  constraintOrAdaptation: string | null;
  progression: string | null;
  regression: string | null;
};
type PracticeSnapshot = DrillGuidance & {
  practiceItemId: string;
  drillTemplateId: string | null;
  drillTemplateVersion: number | null;
  wasCustomized: boolean;
  createdAt: number;
};
type PracticeRow = {
  assignment: {
    id: string;
    phaseId: string | null;
    title: string;
    status: string;
    dueAt: number | null;
    createdAt: number;
    retiredAt: number | null;
  };
  snapshot: PracticeSnapshot | null;
  lineage: {
    previous: {
      practiceItemId: string;
      replacedFromStatus: string;
      replacementPlanRevision: number;
      replacedAt: number;
    } | null;
    next: {
      practiceItemId: string;
      replacedFromStatus: string;
      replacementPlanRevision: number;
      replacedAt: number;
    } | null;
  };
  checkIns: Array<{
    id: string;
    completionStatus: string;
    perceivedDifficulty: string | null;
    confidenceRating: number | null;
    note: string | null;
    requestHelp: boolean;
    occurredAt: number;
  }>;
};
type Lesson = {
  id: string;
  title: string;
  purpose: string;
  status: string;
  phaseId: string | null;
  scheduledAt: number | null;
  occurredAt: number | null;
  coachObservation: string | null;
  golferLearning: string | null;
  takeaway: string | null;
  nextCheck: string | null;
  phaseConnection: string | null;
};
type Metric = {
  id: string;
  canonicalKey: string;
  displayName: string;
  numericValue: number;
  unit: string;
};
type ManualMetricDraft = {
  id: number;
  displayName: string;
  canonicalKey: string;
  numericValue: string;
  unit: string;
  direction: string;
};
type ManualMetricIssue = {
  metricId: number;
  message: string;
};
type LaunchSession = {
  id: string;
  lessonId: string | null;
  sourceMediaAssetId: string | null;
  status?: string;
  sessionDate: number;
  deviceSource: string;
  club: string | null;
  coachInterpretation: string;
  limitations: string;
  summaryMetrics: Metric[];
};
type EvidenceItem = {
  id: string;
  title: string;
  status: string;
  phaseId: string | null;
  lessonId: string | null;
  mediaAssetId: string | null;
  evidenceType: string;
  contextType: string;
  sourceLabel: string;
  observedAt: number | null;
  metricName: string | null;
  metricValue: number | null;
  metricUnit: string | null;
  interpretation: string;
  limitation: string;
};
type LaunchImport = {
  id: string;
  sourceMediaAssetId: string | null;
  status: string;
  totalRowCount: number;
  acceptedRowCount: number;
  rejectedRowCount: number;
  columnHeaders: string[];
  columnMappings: Record<string, string | null>;
  validationReport: Record<string, unknown>;
  reviewRows: string[][];
  acceptedRows: string[][];
  acceptedSourceRowNumbers: number[];
  rejectedRows: Array<{ row: number; reason: string }>;
  errorCode?: string | null;
};
type Comparison = {
  id: string;
  status?: string;
  title: string;
  baselineSessionId: string;
  currentSessionId: string;
  coachInterpretation: string;
  metrics: Array<{
    displayName: string;
    baselineValue: number;
    currentValue: number;
    delta: number;
    unit: string;
  }>;
};
type Milestone = {
  id: string;
  title: string;
  summary: string;
  status: string;
  occurredAt: number;
  phaseId: string | null;
};
type Review = {
  id: string;
  phaseId: string;
  title?: string;
  summary?: string;
  status: string;
};
type Source = {
  id: string;
  kind: string;
  title: string;
  summary?: string | null;
  occurredAt?: number;
};
type DrillChoice = DrillGuidance & {
  id: string;
  version: number;
};

const MAX_MANUAL_SUMMARY_METRICS = 12;

type Workspace = {
  revision: number;
  plan?: { revision: number };
  phases?: Phase[];
  drills?: DrillChoice[];
  drillTemplates?: DrillChoice[];
  mediaAssets?: MediaAsset[];
  mediaAttachments?: MediaAttachment[];
  practiceAssignments?: PracticeRow[];
  lessons?: Lesson[];
  assessment?: { id: string; title?: string | null } | null;
  evidenceItems?: EvidenceItem[];
  launchImports?: LaunchImport[];
  launchSessions?: LaunchSession[];
  launchComparisons?: Comparison[];
  milestones?: Milestone[];
  phaseReviews?: Review[];
  reviewCandidates?: Source[];
  reviewSources?: Array<{
    phaseReviewId: string;
    sourceType: string;
    sourceId: string;
  }>;
  phaseReviewSources?: Array<{
    phaseReviewId: string;
    sources: Array<{ sourceType: string; sourceId: string }>;
  }>;
  timeline?: TimelineItem[];
};

type Tab = CoachingWorkspaceTab;

export function RichCoachingWorkspace({
  planId,
  initialRevision,
  phases: initialPhases,
  initialTab = "practice",
  initialFocus = null,
}: {
  planId: string;
  initialRevision: number;
  phases: Phase[];
  initialTab?: CoachingWorkspaceTab;
  initialFocus?: CoachingWorkspaceFocus | null;
}) {
  const [workspace, setWorkspace] = useState<Workspace>({
    revision: initialRevision,
    phases: initialPhases,
  });
  const [tab, setTab] = useState<Tab>(initialTab);
  const [focus, setFocus] = useState<CoachingWorkspaceFocus | null>(initialFocus);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const refresh = useCallback(async () => {
    const response = await requestClientRead(
      `/api/coaching/plans/${encodeURIComponent(planId)}/workspace`,
      { cache: "no-store" },
    );
    const body = await safeJson(response);
    if (!response.ok) throw new Error(apiMessage(body, response.status));
    const value = (body.workspace ?? body) as Workspace;
    const drillsResponse = await requestClientRead("/api/coaching/drills?limit=250", {
      cache: "no-store",
    });
    const drillsBody = drillsResponse.ok ? await safeJson(drillsResponse) : {};
    setWorkspace((current) => ({
      ...current,
      ...value,
      revision: value.plan?.revision ?? value.revision ?? current.revision,
      phases: value.phases ?? current.phases,
      drillTemplates:
        (drillsBody.templates as DrillChoice[] | undefined) ??
        value.drillTemplates ??
        current.drillTemplates,
    }));
  }, [planId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh()
        .catch((caught) => announceError(caught, setMessage, setIsError))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  useEffect(() => {
    if (loading || !focus || !focusMatchesTab(focus, tab)) return;
    const timeout = window.setTimeout(() => {
      const target = document.getElementById(coachingWorkspaceFocusDomId(focus));
      if (!target) return;
      const disclosure = target.closest("details");
      if (disclosure) disclosure.open = true;
      target.scrollIntoView({ block: "center" });
      target.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [focus, loading, tab]);

  async function mutate(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
    success: string,
  ) {
    setBusy(true);
    setIsError(false);
    setMessage("Saving…");
    try {
      const requestBody = JSON.stringify({
        expectedRevision: workspace.revision,
        ...body,
      });
      const requestedEndpoint = `/api/plans/${encodeURIComponent(planId)}/coaching${path}`;
      let response: Response;
      switch (`${method} ${path}`) {
          case "POST /practice":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/practice`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          case "PATCH /practice":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/practice`,
              { method: "PATCH", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          case "POST /lessons":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/lessons`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          case "PATCH /lessons":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/lessons`,
              { method: "PATCH", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          case "POST /evidence":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/evidence`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          case "POST /reviews":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/reviews`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          case "POST /media":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/media`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          case "DELETE /media":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/media`,
              { method: "DELETE", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          case "POST /launch/sessions":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/launch/sessions`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          case "POST /launch/imports":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/launch/imports`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          case "POST /launch/comparisons":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/launch/comparisons`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          case "POST /milestones":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/milestones`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          case "PATCH /milestones":
            response = await requestClientMutation(
              `/api/plans/${encodeURIComponent(planId)}/coaching/milestones`,
              { method: "PATCH", headers: { "Content-Type": "application/json" }, body: requestBody },
            );
            break;
          default:
            throw new Error(`Unsupported coaching mutation route: ${requestedEndpoint}`);
      }
      const payload = await safeJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, response.status));
      await refresh();
      setMessage(success);
      setIsError(false);
      return payload;
    } catch (caught) {
      const message = clientMutationErrorMessage(
        caught,
        "the coaching change was saved",
        "reload_before_retry",
        "The coaching change could not be saved.",
      );
      announceError(new Error(message), setMessage, setIsError);
      if (
        /revision|conflict|changed/i.test(message)
      ) {
        await refresh().catch(() => undefined);
      }
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  const phases = workspace.phases ?? initialPhases;
  const tabs: Array<[Tab, string, number | null]> = [
    ["practice", "Practice", workspace.practiceAssignments?.length ?? 0],
    ["lessons", "Lessons", workspace.lessons?.length ?? 0],
    ["evidence", "Evidence", workspace.evidenceItems?.length ?? 0],
    ["media", "Media", workspace.mediaAttachments?.length ?? 0],
    ["launch", "Launch data", workspace.launchSessions?.length ?? 0],
    ["reviews", "Review sources", workspace.phaseReviews?.length ?? 0],
    ["milestones", "Milestones", workspace.milestones?.length ?? 0],
    ["timeline", "Timeline", workspace.timeline?.length ?? 0],
  ];

  return (
    <>
      <nav className={styles.toolbar} aria-label="Rich coaching destinations">
        <div className={styles.actions}>
          {tabs.map(([value, label, count]) => (
            <button
              className={tab === value ? styles.button : styles.buttonSecondary}
              type="button"
              key={value}
              onClick={() => {
                setTab(value);
                setFocus(null);
                const url = new URL(window.location.href);
                url.searchParams.set("tab", value);
                clearCoachingWorkspaceRecordQuery(url);
                window.history.replaceState(null, "", url);
              }}
              aria-current={tab === value ? "page" : undefined}
            >
              {label}
              {count === null ? "" : ` (${count})`}
            </button>
          ))}
        </div>
        <span className={styles.badge}>Plan revision {workspace.revision}</span>
      </nav>

      {message ? (
        <div
          className={styles.status}
          data-error={isError}
          role={isError ? "alert" : "status"}
        >
          {message}
        </div>
      ) : null}
      {loading ? (
        <div className={styles.empty} role="status">
          Loading current coaching records…
        </div>
      ) : null}

      {!loading && tab === "practice" ? (
        <PracticePanel
          workspace={workspace}
          phases={phases}
          busy={busy}
          mutate={mutate}
        />
      ) : null}
      {!loading && tab === "lessons" ? (
        <LessonsPanel
          workspace={workspace}
          phases={phases}
          busy={busy}
          mutate={mutate}
        />
      ) : null}
      {!loading && tab === "evidence" ? (
        <EvidencePanel
          workspace={workspace}
          phases={phases}
          busy={busy}
          mutate={mutate}
        />
      ) : null}
      {!loading && tab === "media" ? (
        <MediaPanel workspace={workspace} busy={busy} mutate={mutate} />
      ) : null}
      {!loading && tab === "launch" ? (
        <LaunchPanel
          workspace={workspace}
          phases={phases}
          busy={busy}
          mutate={mutate}
        />
      ) : null}
      {!loading && tab === "reviews" ? (
        <ReviewsPanel workspace={workspace} busy={busy} mutate={mutate} />
      ) : null}
      {!loading && tab === "milestones" ? (
        <MilestonesPanel
          milestones={workspace.milestones ?? []}
          phases={phases}
          busy={busy}
          mutate={mutate}
        />
      ) : null}
      {!loading && tab === "timeline" ? (
        <TimelinePanel items={workspace.timeline ?? []} />
      ) : null}
    </>
  );
}

type JsonRecord = Record<string, unknown>;
type Mutate = (
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown>,
  success: string,
) => Promise<JsonRecord>;

function PracticePanel({
  workspace,
  phases,
  busy,
  mutate,
}: {
  workspace: Workspace;
  phases: Phase[];
  busy: boolean;
  mutate: Mutate;
}) {
  const drills = workspace.drillTemplates ?? workspace.drills ?? [];
  const assignments = workspace.practiceAssignments ?? [];
  const currentAssignments = assignments.filter(
    ({ assignment }) => assignment.status !== "retired",
  );
  const retainedAssignments = assignments.filter(
    ({ assignment }) => assignment.status === "retired",
  );
  const assignmentTitles = new Map(
    assignments.map(({ assignment }) => [assignment.id, assignment.title]),
  );
  const [selectedDrill, setSelectedDrill] = useState("");
  const [customize, setCustomize] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const selected = drills.find((drill) => drill.id === selectedDrill);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const customization = customize ? drillCustomizationFromForm(form) : null;
    await mutate(
      "/practice",
      "POST",
      {
        phaseId: text(form, "phaseId"),
        drillTemplateId: selectedDrill || null,
        customization,
        dueAt: dateOnlyOrNull(form, "dueAt"),
      },
      "Practice assignment added with its own saved drill snapshot.",
    );
    formElement.reset();
    setSelectedDrill("");
    setCustomize(false);
  }

  async function replace(
    event: FormEvent<HTMLFormElement>,
    row: PracticeRow,
  ) {
    event.preventDefault();
    if (!row.snapshot) return;
    const form = new FormData(event.currentTarget);
    await mutate(
      "/practice",
      "PATCH",
      {
        operation: "replace",
        practiceItemId: row.assignment.id,
        phaseId: text(form, "phaseId"),
        customization: drillCustomizationFromForm(form),
        dueAt: dateOnlyOrNull(form, "dueAt"),
      },
      "Edited guidance saved as a new assignment. The prior snapshot remains in history.",
    );
    setEditingId(null);
  }

  async function transition(id: string, nextStatus: string) {
    await mutate(
      "/practice",
      "PATCH",
      { practiceItemId: id, nextStatus },
      `Practice assignment moved to ${nextStatus}.`,
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="practice-heading">
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Bounded practice</span>
          <h2 id="practice-heading">Assign and manage drills</h2>
          <p>
            Reuse a library drill as a frozen snapshot, or customize its
            instructions for this golfer.
          </p>
        </div>
        <a className={styles.buttonSecondary} href="/app/coaching/drills">
          Open drill library
        </a>
      </div>
      <form method="post" className={styles.editor} onSubmit={assign}>
        <div className={styles.grid}>
          <Select
            label="Phase"
            name="phaseId"
            options={phases.map((phase) => [phase.id, phase.title])}
          />
          <label className={styles.field}>
            <span>Reusable drill</span>
            <select
              name="drillTemplateId"
              required={!customize}
              value={selectedDrill}
              onChange={(event) => setSelectedDrill(event.target.value)}
            >
              <option value="">Choose a drill</option>
              {drills.map((drill) => (
                <option value={drill.id} key={drill.id}>
                  {drill.title} · v{drill.version}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Due date (optional)</span>
            <input name="dueAt" type="date" />
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={customize}
              onChange={(event) => setCustomize(event.target.checked)}
            />
            Customize this assignment
          </label>
        </div>
        {customize ? (
          <DrillCustomization key={selected?.id ?? "blank-custom-drill"} seed={selected} />
        ) : null}
        <button className={styles.button} disabled={busy} type="submit">
          Assign drill
        </button>
      </form>
      <div className={styles.preview}>
        <h3>Current assignments</h3>
        {currentAssignments.length ? (
          <ul className={styles.list}>
            {currentAssignments.map(({ assignment, snapshot, checkIns, lineage }) => (
              <li
                className={styles.card}
                id={coachingWorkspaceFocusDomId({
                  kind: "practice",
                  practiceId: assignment.id,
                })}
                key={assignment.id}
                tabIndex={-1}
              >
                <div className={styles.cardHeader}>
                  <div>
                    <h3>{assignment.title}</h3>
                    <span className={styles.badge}>{assignment.status}</span>
                  </div>
                  {assignment.dueAt ? (
                    <span>Due {formatDate(assignment.dueAt)}</span>
                  ) : null}
                </div>
                {lineage.previous ? (
                  <p className={styles.muted}>
                    Edited replacement of {assignmentTitles.get(lineage.previous.practiceItemId) ?? "a retained assignment"}.
                    The earlier guidance and check-ins remain below in history.
                  </p>
                ) : null}
                <PracticeGuidance snapshot={snapshot} />
                <p>
                  {checkIns.length} golfer check-in
                  {checkIns.length === 1 ? "" : "s"}
                  {checkIns.some((item) => item.requestHelp)
                    ? " · help requested"
                    : ""}
                </p>
                {checkIns.length ? (
                  <details>
                    <summary>Review golfer check-ins</summary>
                    <ul className={styles.list}>
                      {checkIns.map((checkIn) => (
                        <li
                          className={styles.card}
                          id={coachingWorkspaceFocusDomId({
                            kind: "practice",
                            practiceId: assignment.id,
                            checkInId: checkIn.id,
                          })}
                          key={checkIn.id}
                          tabIndex={-1}
                        >
                          <div className={styles.cardHeader}>
                            <strong>{capitalize(checkIn.completionStatus)}</strong>
                            <time dateTime={new Date(checkIn.occurredAt).toISOString()}>
                              {formatDate(checkIn.occurredAt)}
                            </time>
                          </div>
                          <p>
                            {[
                              checkIn.perceivedDifficulty
                                ? `Difficulty: ${capitalize(checkIn.perceivedDifficulty)}`
                                : "Difficulty not provided",
                              checkIn.confidenceRating !== null
                                ? `Confidence: ${checkIn.confidenceRating}/5`
                                : "Confidence not provided",
                              checkIn.requestHelp ? "Help requested" : "No help requested",
                            ].join(" · ")}
                          </p>
                          {checkIn.note ? <p>{checkIn.note}</p> : <small>No note provided.</small>}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <div className={styles.actions}>
                  {snapshot && ["active", "paused"].includes(assignment.status) ? (
                    <button
                      className={styles.buttonSecondary}
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        setEditingId((current) =>
                          current === assignment.id ? null : assignment.id,
                        )
                      }
                    >
                      {editingId === assignment.id
                        ? "Cancel edited replacement"
                        : "Edit by replacement"}
                    </button>
                  ) : null}
                  {practiceTransitions(assignment.status).map((status) => (
                    <button
                      className={
                        status === "retired"
                          ? styles.buttonDanger
                          : styles.buttonSecondary
                      }
                      disabled={busy}
                      type="button"
                      key={status}
                      onClick={() => transition(assignment.id, status)}
                    >
                      {status === "active" ? "Resume" : capitalize(status)}
                    </button>
                  ))}
                </div>
                {editingId === assignment.id && snapshot ? (
                  <form
                    method="post"
                    className={styles.editor}
                    onSubmit={(event) =>
                      replace(event, { assignment, snapshot, checkIns, lineage })
                    }
                  >
                    <div className={styles.notice} role="note">
                      Saving creates a new immutable assignment and retires this one in
                      the same revision-fenced transaction. It does not edit the reusable
                      drill, prior guidance, media snapshot, evidence, or golfer check-ins.
                    </div>
                    <div className={styles.grid}>
                      <Select
                        label="Phase"
                        name="phaseId"
                        value={assignment.phaseId ?? ""}
                        options={phases.map((phase) => [phase.id, phase.title])}
                      />
                      <Input
                        optional
                        label="Due date"
                        name="dueAt"
                        type="date"
                        defaultValue={dateInputValue(assignment.dueAt)}
                      />
                    </div>
                    <DrillCustomization
                      key={`replace:${assignment.id}`}
                      seed={snapshot}
                    />
                    <button className={styles.button} disabled={busy} type="submit">
                      Save edited replacement
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No practice assignments yet.</p>
        )}
      </div>
      <div className={styles.preview}>
        <h3>Retained assignment history</h3>
        <p className={styles.muted}>
          Replaced and retired guidance remains read-only with its original
          golfer check-ins. It is never rewritten when a reusable drill changes.
        </p>
        {retainedAssignments.length ? (
          <ul className={styles.list}>
            {retainedAssignments.map(({ assignment, snapshot, checkIns, lineage }) => (
              <li className={styles.card} key={assignment.id}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3>{assignment.title}</h3>
                    <span className={styles.badge}>retained history</span>
                  </div>
                  <span>
                    Retired {formatDate(assignment.retiredAt ?? assignment.createdAt)}
                  </span>
                </div>
                {lineage.next ? (
                  <p className={styles.muted}>
                    Replaced by {assignmentTitles.get(lineage.next.practiceItemId) ?? "the current assignment"} on {formatDate(lineage.next.replacedAt)}.
                  </p>
                ) : (
                  <p className={styles.muted}>Retired without an edited replacement.</p>
                )}
                <PracticeGuidance snapshot={snapshot} history />
                <PracticeCheckIns assignmentId={assignment.id} checkIns={checkIns} />
              </li>
            ))}
          </ul>
        ) : (
          <p>No retained practice history yet.</p>
        )}
      </div>
    </section>
  );
}

function PracticeGuidance({
  snapshot,
  history = false,
}: {
  snapshot: PracticeSnapshot | null;
  history?: boolean;
}) {
  if (!snapshot) {
    return (
      <p className={styles.muted}>
        This legacy assignment has no structured guidance snapshot.
      </p>
    );
  }

  const optional = [
    ["Feel or cue", snapshot.feelOrCue],
    ["Common miss", snapshot.commonMiss],
    ["Constraint or adaptation", snapshot.constraintOrAdaptation],
    ["Progression", snapshot.progression],
    ["Regression", snapshot.regression],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <details>
      <summary>
        {history ? "View retained structured guidance" : "View saved structured guidance"}
      </summary>
      <div className={styles.card}>
        <p>
          <strong>Purpose:</strong> {snapshot.purpose}
        </p>
        <p>
          <strong>When it fits:</strong> {snapshot.whenItFits}
        </p>
        <p>
          <strong>Equipment:</strong> {snapshot.equipment.join(", ")}
        </p>
        <p>
          <strong>Setup:</strong> {snapshot.setup}
        </p>
        <strong>Steps</strong>
        <ol>
          {snapshot.steps.map((step, index) => (
            <li key={`${snapshot.practiceItemId}:step:${index}`}>{step}</li>
          ))}
        </ol>
        <p>
          <strong>Dosage or cadence:</strong> {snapshot.dosageOrCadence}
        </p>
        <p>
          <strong>Success check:</strong> {snapshot.successCheck}
        </p>
        <p>
          <strong>Stop or ask rule:</strong> {snapshot.stopOrAskRule}
        </p>
        {optional.map(([label, value]) => (
          <p key={label}>
            <strong>{label}:</strong> {value}
          </p>
        ))}
        <p className={styles.muted}>
          Saved {formatDate(snapshot.createdAt)}
          {snapshot.drillTemplateId
            ? ` from reusable drill version ${snapshot.drillTemplateVersion ?? "unknown"}`
            : " as assignment-only guidance"}
          {snapshot.wasCustomized ? " · customized for this assignment" : ""}.
        </p>
      </div>
    </details>
  );
}

function PracticeCheckIns({
  assignmentId,
  checkIns,
}: {
  assignmentId: string;
  checkIns: PracticeRow["checkIns"];
}) {
  if (!checkIns.length) return <p>No golfer check-ins were recorded.</p>;
  return (
    <details>
      <summary>
        Review {checkIns.length} retained golfer check-in
        {checkIns.length === 1 ? "" : "s"}
      </summary>
      <ul className={styles.list}>
        {checkIns.map((checkIn) => (
          <li
            className={styles.card}
            id={coachingWorkspaceFocusDomId({
              kind: "practice",
              practiceId: assignmentId,
              checkInId: checkIn.id,
            })}
            key={checkIn.id}
            tabIndex={-1}
          >
            <div className={styles.cardHeader}>
              <strong>{capitalize(checkIn.completionStatus)}</strong>
              <time dateTime={new Date(checkIn.occurredAt).toISOString()}>
                {formatDate(checkIn.occurredAt)}
              </time>
            </div>
            <p>
              {[
                checkIn.perceivedDifficulty
                  ? `Difficulty: ${capitalize(checkIn.perceivedDifficulty)}`
                  : "Difficulty not provided",
                checkIn.confidenceRating !== null
                  ? `Confidence: ${checkIn.confidenceRating}/5`
                  : "Confidence not provided",
                checkIn.requestHelp ? "Help requested" : "No help requested",
              ].join(" · ")}
            </p>
            {checkIn.note ? <p>{checkIn.note}</p> : <small>No note provided.</small>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function drillCustomizationFromForm(form: FormData): DrillGuidance {
  return {
    title: text(form, "title"),
    purpose: text(form, "purpose"),
    whenItFits: text(form, "whenItFits"),
    equipment: lines(form, "equipment"),
    setup: text(form, "setup"),
    steps: lines(form, "steps"),
    dosageOrCadence: text(form, "dosageOrCadence"),
    feelOrCue: nullable(form, "feelOrCue"),
    successCheck: text(form, "successCheck"),
    commonMiss: nullable(form, "commonMiss"),
    stopOrAskRule: text(form, "stopOrAskRule"),
    constraintOrAdaptation: nullable(form, "constraintOrAdaptation"),
    progression: nullable(form, "progression"),
    regression: nullable(form, "regression"),
  };
}

function dateInputValue(value: number | null) {
  return value === null ? "" : new Date(value).toISOString().slice(0, 10);
}

function DrillCustomization({ seed }: { seed?: DrillGuidance }) {
  return (
    <details open>
      <summary>Assignment-specific coaching detail</summary>
      <div className={styles.grid}>
        <Input label="Title" name="title" defaultValue={seed?.title} />
        <Area label="Purpose" name="purpose" defaultValue={seed?.purpose} />
        <Area label="When it fits" name="whenItFits" defaultValue={seed?.whenItFits} />
        <Area
          label="Equipment — one per line"
          name="equipment"
          defaultValue={seed?.equipment.join("\n")}
        />
        <Area label="Setup" name="setup" defaultValue={seed?.setup} />
        <Area
          label="Steps — one per line"
          name="steps"
          defaultValue={seed?.steps.join("\n")}
        />
        <Input
          label="Dosage or cadence"
          name="dosageOrCadence"
          defaultValue={seed?.dosageOrCadence}
        />
        <Area label="Success check" name="successCheck" defaultValue={seed?.successCheck} />
        <Area label="Stop or ask rule" name="stopOrAskRule" defaultValue={seed?.stopOrAskRule} />
        <Area optional label="Feel or cue" name="feelOrCue" defaultValue={seed?.feelOrCue ?? ""} />
        <Area optional label="Common miss" name="commonMiss" defaultValue={seed?.commonMiss ?? ""} />
        <Area
          optional
          label="Constraint or adaptation"
          name="constraintOrAdaptation"
          defaultValue={seed?.constraintOrAdaptation ?? ""}
        />
        <Area optional label="Progression" name="progression" defaultValue={seed?.progression ?? ""} />
        <Area optional label="Regression" name="regression" defaultValue={seed?.regression ?? ""} />
      </div>
    </details>
  );
}

function LessonsPanel({
  workspace,
  phases,
  busy,
  mutate,
}: {
  workspace: Workspace;
  phases: Phase[];
  busy: boolean;
  mutate: Mutate;
}) {
  const lessons = workspace.lessons ?? [];
  const evidenceItems = workspace.evidenceItems ?? [];
  const launchSessions = (workspace.launchSessions ?? []).filter(
    (session) => session.status === undefined || session.status === "committed",
  );
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const status = text(form, "status");
    await mutate(
      "/lessons",
      "POST",
      {
        phaseId: nullable(form, "phaseId"),
        title: text(form, "title"),
        purpose: text(form, "purpose"),
        status,
        scheduledAt:
          status === "scheduled" ? dateOrNull(form, "scheduledAt") : null,
        occurredAt:
          status === "completed" ? dateOrNull(form, "occurredAt") : null,
        coachObservation: nullable(form, "coachObservation"),
        golferLearning: nullable(form, "golferLearning"),
        takeaway: nullable(form, "takeaway"),
        nextCheck: nullable(form, "nextCheck"),
        phaseConnection: nullable(form, "phaseConnection"),
      },
      "Lesson record created.",
    );
    formElement.reset();
  }
  async function update(event: FormEvent<HTMLFormElement>, lesson: Lesson) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextStatus = text(form, "nextStatus");
    await mutate(
      "/lessons",
      "PATCH",
      {
        lessonId: lesson.id,
        nextStatus,
        scheduledAt: nextStatus === "planned" ? null : dateOrNull(form, "scheduledAt"),
        occurredAt: nextStatus === "completed" ? dateOrNull(form, "occurredAt") : null,
        coachObservation: nullable(form, "coachObservation"),
        golferLearning: nullable(form, "golferLearning"),
        takeaway: nullable(form, "takeaway"),
        nextCheck: nullable(form, "nextCheck"),
        phaseConnection: nullable(form, "phaseConnection"),
        evidenceItemIds: form.getAll("evidenceItemIds").map(String),
        launchSessionIds: form.getAll("launchSessionIds").map(String),
      },
      nextStatus === lesson.status
        ? "Lesson details and selected evidence updated."
        : `Lesson details saved and moved to ${nextStatus}.`,
    );
  }
  return (
    <section className={styles.panel} aria-labelledby="lessons-heading">
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Lesson lifecycle</span>
          <h2 id="lessons-heading">
            Plan, schedule, complete, cancel, or archive
          </h2>
          <p>
            A planned lesson can exist without pretending a booking occurred. Complete it only
            after adding the observed date and the coaching record you actually have.
          </p>
        </div>
      </div>
      <form method="post" className={styles.editor} onSubmit={create}>
        <div className={styles.grid}>
          <Input label="Lesson title" name="title" />
          <Area label="Purpose" name="purpose" />
          <Select
            optional
            label="Phase (optional)"
            name="phaseId"
            options={phases.map((phase) => [phase.id, phase.title])}
          />
          <Select
            label="Initial state"
            name="status"
            options={[
              ["planned", "Planned"],
              ["scheduled", "Scheduled"],
              ["completed", "Completed"],
            ]}
          />
          <label className={styles.field}>
            <span>Scheduled date and time</span>
            <input name="scheduledAt" type="datetime-local" />
          </label>
          <label className={styles.field}>
            <span>Completed date and time</span>
            <input name="occurredAt" type="datetime-local" />
          </label>
          <Area optional label="Coach observation" name="coachObservation" />
          <Area optional label="Golfer learning" name="golferLearning" />
          <Area optional label="Takeaway" name="takeaway" />
          <Area optional label="Next check" name="nextCheck" />
          <Area optional label="Phase connection" name="phaseConnection" />
        </div>
        <button className={styles.button} disabled={busy} type="submit">
          Create lesson
        </button>
      </form>
      <div className={styles.preview}>
        <h3>Lesson records</h3>
        {lessons.length ? (
          <ul className={styles.list}>
            {lessons.map((lesson) => (
              <li
                className={styles.card}
                id={coachingWorkspaceFocusDomId({
                  kind: "lesson",
                  lessonId: lesson.id,
                })}
                key={lesson.id}
                tabIndex={-1}
              >
                <div className={styles.cardHeader}>
                  <div>
                    <h3>{lesson.title}</h3>
                    <span className={styles.badge}>{lesson.status}</span>
                  </div>
                  <span>
                    {lesson.occurredAt
                      ? formatDate(lesson.occurredAt)
                      : lesson.scheduledAt
                        ? `Scheduled ${formatDate(lesson.scheduledAt)}`
                        : "Not scheduled"}
                  </span>
                </div>
                <p>{lesson.purpose}</p>
                {lesson.status === "archived" ? (
                  <p className={styles.muted}>Archived lesson records are read-only.</p>
                ) : (
                  <details>
                    <summary>Edit details, lifecycle, measurements, and evidence</summary>
                    <form
                      method="post"
                      className={styles.editor}
                      onSubmit={(event) => update(event, lesson)}
                    >
                      <div className={styles.grid}>
                        <Select
                          label="Save lesson as"
                          name="nextStatus"
                          value={lesson.status}
                          options={lessonStatusOptions(lesson.status)}
                        />
                        <label className={styles.field}>
                          <span>Scheduled date and time</span>
                          <input
                            name="scheduledAt"
                            type="datetime-local"
                            defaultValue={dateTimeLocal(lesson.scheduledAt)}
                          />
                        </label>
                        <label className={styles.field}>
                          <span>Completed date and time</span>
                          <input
                            name="occurredAt"
                            type="datetime-local"
                            defaultValue={dateTimeLocal(lesson.occurredAt)}
                          />
                        </label>
                        <Area
                          optional
                          label="Coach observation"
                          name="coachObservation"
                          defaultValue={lesson.coachObservation ?? ""}
                        />
                        <Area
                          optional
                          label="Golfer learning"
                          name="golferLearning"
                          defaultValue={lesson.golferLearning ?? ""}
                        />
                        <Area
                          optional
                          label="Takeaway"
                          name="takeaway"
                          defaultValue={lesson.takeaway ?? ""}
                        />
                        <Area
                          optional
                          label="Next check"
                          name="nextCheck"
                          defaultValue={lesson.nextCheck ?? ""}
                        />
                        <Area
                          optional
                          label="Connection to this phase"
                          name="phaseConnection"
                          defaultValue={lesson.phaseConnection ?? ""}
                        />
                      </div>
                      <fieldset>
                        <legend>Evidence records considered in this lesson</legend>
                        <p className={styles.muted}>
                          Select existing evidence or create a new observation, measurement, or
                          media record in the Evidence tab.
                        </p>
                        <div className={styles.checkGrid}>
                          {evidenceItems
                            .filter((item) => !item.lessonId || item.lessonId === lesson.id)
                            .map((item) => (
                              <label className={styles.checkbox} key={item.id}>
                                <input
                                  type="checkbox"
                                  name="evidenceItemIds"
                                  value={item.id}
                                  defaultChecked={item.lessonId === lesson.id}
                                />
                                <span>
                                  {item.title} <small>({item.evidenceType.replaceAll("_", " ")})</small>
                                </span>
                              </label>
                            ))}
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend>Launch-monitor measurement sessions</legend>
                        <div className={styles.checkGrid}>
                          {launchSessions
                            .filter((session) => !session.lessonId || session.lessonId === lesson.id)
                            .map((session) => (
                              <label className={styles.checkbox} key={session.id}>
                                <input
                                  type="checkbox"
                                  name="launchSessionIds"
                                  value={session.id}
                                  defaultChecked={session.lessonId === lesson.id}
                                />
                                <span>{sessionLabel(session)}</span>
                              </label>
                            ))}
                        </div>
                      </fieldset>
                      <button className={styles.button} disabled={busy} type="submit">
                        Save lesson record
                      </button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No lesson records yet.</p>
        )}
      </div>
    </section>
  );
}

function EvidencePanel({
  workspace,
  phases,
  busy,
  mutate,
}: {
  workspace: Workspace;
  phases: Phase[];
  busy: boolean;
  mutate: Mutate;
}) {
  const [evidenceType, setEvidenceType] = useState("coach_observation");
  const [contextType, setContextType] = useState("lesson");
  const evidenceItems = workspace.evidenceItems ?? [];
  const lessons = (workspace.lessons ?? []).filter((lesson) => lesson.status !== "archived");
  const readyMedia = (workspace.mediaAssets ?? []).filter((asset) => asset.status === "ready");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const metricValueText = text(form, "metricValue");
    await mutate(
      "/evidence",
      "POST",
      {
        phaseId: text(form, "phaseId"),
        lessonId: nullable(form, "lessonId"),
        mediaAssetId: evidenceType === "media" ? nullable(form, "mediaAssetId") : null,
        evidenceType,
        contextType,
        title: text(form, "title"),
        claim: nullable(form, "claim"),
        sourceLabel: text(form, "sourceLabel"),
        sourceType: text(form, "sourceType"),
        observedAt: dateOrNull(form, "observedAt"),
        comparisonRole: text(form, "comparisonRole"),
        comparisonGroupId: nullable(form, "comparisonGroupId"),
        metricName: nullable(form, "metricName"),
        metricValue: metricValueText ? Number(metricValueText) : null,
        metricUnit: nullable(form, "metricUnit"),
        valueText: nullable(form, "valueText"),
        interpretation: text(form, "interpretation"),
        limitation: text(form, "limitation"),
        maturity: text(form, "maturity"),
        nextEvidenceNeeded: nullable(form, "nextEvidenceNeeded"),
        isRepresentative: form.has("isRepresentative"),
      },
      "Evidence record created and available to lessons and phase reviews.",
    );
    formElement.reset();
    setEvidenceType("coach_observation");
    setContextType("lesson");
  }

  return (
    <section className={styles.panel} aria-labelledby="evidence-heading" id="evidence-create">
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Evidence record</span>
          <h2 id="evidence-heading">Record what was observed, measured, reported, or captured</h2>
          <p>
            Evidence stays explicit about its source, limitation, maturity, and whether it represents
            the golfer’s wider pattern. Media is selected from the ready media library.
          </p>
        </div>
      </div>
      <form method="post" className={styles.editor} onSubmit={create}>
        <div className={styles.grid}>
          <Select
            label="Evidence type"
            name="evidenceType"
            value={evidenceType}
            onChange={setEvidenceType}
            options={[
              ["coach_observation", "Coach observation"],
              ["golfer_report", "Golfer report"],
              ["measurement", "Measurement"],
              ["outcome_count", "Outcome count"],
              ["media", "Media"],
              ["comparison", "Comparison"],
              ["note", "Note"],
            ]}
          />
          <Select
            label="Context"
            name="contextType"
            value={contextType}
            onChange={setContextType}
            options={[
              ["lesson", "Lesson"],
              ["practice", "Practice"],
              ["assessment", "Assessment"],
              ["on_course", "On course"],
              ["phase_review", "Phase review"],
              ["other", "Other"],
            ]}
          />
          <Select
            label="Phase"
            name="phaseId"
            options={phases.map((phase) => [phase.id, phase.title])}
          />
          <Select
            optional={contextType !== "lesson"}
            label="Lesson"
            name="lessonId"
            options={lessons.map((lesson) => [lesson.id, lesson.title])}
          />
          {evidenceType === "media" ? (
            <Select
              label="Ready media asset"
              name="mediaAssetId"
              options={readyMedia.map((asset) => [
                asset.id,
                asset.caption || asset.altText || asset.originalFilename || `${asset.mediaKind} asset`,
              ])}
            />
          ) : null}
          <Input label="Evidence title" name="title" />
          <Input label="Source label" name="sourceLabel" />
          <Select
            label="Source type"
            name="sourceType"
            options={[
              ["coach_observed", "Coach observed"],
              ["golfer_reported", "Golfer reported"],
              ["device", "Device"],
              ["document", "Document"],
              ["mixed", "Mixed"],
            ]}
          />
          <label className={styles.field}>
            <span>Observed date and time (optional)</span>
            <input name="observedAt" type="datetime-local" />
          </label>
          <Area optional label="Bounded claim" name="claim" />
          <Area label="Interpretation" name="interpretation" />
          <Area label="Limitation" name="limitation" />
          <Select
            label="Evidence maturity"
            name="maturity"
            options={[
              ["single_observation", "Single observation"],
              ["early_indication", "Early indication"],
              ["repeated_practice", "Repeated practice"],
              ["on_course_observation", "On-course observation"],
              ["insufficient", "Insufficient"],
            ]}
          />
          <Area optional label="Next evidence needed" name="nextEvidenceNeeded" />
          <Input optional label="Metric name" name="metricName" />
          <Input optional label="Metric value" name="metricValue" type="number" step="any" />
          <Input optional label="Exact metric unit" name="metricUnit" />
          <Area optional label="Non-numeric value or context" name="valueText" />
          <Select
            label="Comparison role"
            name="comparisonRole"
            options={[
              ["standalone", "Standalone"],
              ["baseline", "Baseline"],
              ["current", "Current"],
            ]}
          />
          <Input optional label="Comparison group label" name="comparisonGroupId" />
        </div>
        <label className={styles.checkbox}>
          <input type="checkbox" name="isRepresentative" />
          This record is representative beyond this one observation
        </label>
        <button className={styles.button} disabled={busy} type="submit">
          Create evidence record
        </button>
      </form>
      <div className={styles.preview}>
        <h3>Available evidence</h3>
        {evidenceItems.length ? (
          <ul className={styles.list}>
            {evidenceItems.map((item) => (
              <li className={styles.card} key={item.id}>
                <div className={styles.cardHeader}>
                  <strong>{item.title}</strong>
                  <span className={styles.badge}>{item.evidenceType.replaceAll("_", " ")}</span>
                </div>
                <p>{item.interpretation}</p>
                <small>
                  {item.sourceLabel}
                  {item.metricValue !== null
                    ? ` · ${item.metricName}: ${item.metricValue} ${item.metricUnit}`
                    : ""}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p>No evidence records yet.</p>
        )}
      </div>
    </section>
  );
}

function MediaPanel({
  workspace,
  busy,
  mutate,
}: {
  workspace: Workspace;
  busy: boolean;
  mutate: Mutate;
}) {
  const assets = (workspace.mediaAssets ?? []).filter(
    (asset) => asset.status === "ready",
  );
  const attachments = workspace.mediaAttachments ?? [];
  const [targetKind, setTargetKind] = useState("assessment");
  const targetChoices = mediaTargetChoices(workspace, targetKind);
  async function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await mutate(
      "/media",
      "POST",
      {
        mediaAssetId: text(form, "mediaAssetId"),
        target: { kind: text(form, "targetKind"), id: text(form, "targetId") },
        role: text(form, "role"),
        label: nullable(form, "label"),
        coachContext: nullable(form, "coachContext"),
        sortOrder: Number(text(form, "sortOrder") || "0"),
      },
      "Media attached to this coaching context. Republish before the golfer can see it.",
    );
    formElement.reset();
  }
  async function withdraw(id: string) {
    if (
      !window.confirm(
        "Withdraw this attachment? The private source file remains in the media library.",
      )
    )
      return;
    await mutate(
      "/media",
      "DELETE",
      { attachmentId: id, confirmation: "withdraw_media_attachment" },
      "Media attachment withdrawn. Republish to update golfer access.",
    );
  }
  return (
    <section className={styles.panel} aria-labelledby="media-heading">
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Optional private media</span>
          <h2 id="media-heading">Attach, reuse, or withdraw</h2>
          <p>
            Uploading never publishes. Attaching never analyzes. Republish
            controls golfer visibility.
          </p>
        </div>
        <a className={styles.buttonSecondary} href="/app/media">
          Upload or manage files
        </a>
      </div>
      <form method="post" className={styles.editor} onSubmit={attach}>
        <div className={styles.grid}>
          <Select
            label="Media file"
            name="mediaAssetId"
            options={assets.map((asset) => [
              asset.id,
              asset.caption ||
                asset.originalFilename ||
                asset.altText ||
                "Untitled media",
            ])}
          />
          <Select
            label="Content type"
            name="targetKind"
            value={targetKind}
            onChange={setTargetKind}
            options={[
              ["assessment", "Assessment"],
              ["lesson", "Lesson"],
              ["practice", "Practice assignment"],
              ["evidence", "Evidence"],
              ["phase_review", "Phase review"],
            ]}
          />
        <Select
          key={targetKind}
          label={`${capitalize(targetKind)} record`}
            name="targetId"
            options={targetChoices}
          />
          <Select
            label="Role"
            name="role"
            options={[
              ["primary", "Primary"],
              ["supporting", "Supporting"],
              ["demo", "Demonstration"],
              ["baseline", "Baseline"],
              ["current", "Current"],
              ["source", "Review source"],
            ]}
          />
          <Input optional label="Golfer-facing label" name="label" />
          <Area optional label="Coach context" name="coachContext" />
          <label className={styles.field}>
            <span>Order</span>
            <input
              name="sortOrder"
              type="number"
              min="0"
              max="1000"
              defaultValue="0"
            />
          </label>
        </div>
        {!targetChoices.length ? (
          <div className={styles.notice} role="note">
            No {targetKind.replaceAll("_", " ")} record exists yet. Create that
            coaching record first, then return here to attach media.
          </div>
        ) : null}
        <button
          className={styles.button}
          disabled={busy || !assets.length || !targetChoices.length}
          type="submit"
        >
          Attach media
        </button>
        {!assets.length ? (
          <p className={styles.muted}>
            Upload a ready image or video in the media library first.
          </p>
        ) : null}
      </form>
      <div className={styles.preview}>
        <h3>Plan attachments</h3>
        {attachments.length ? (
          <ul className={styles.list}>
            {attachments.map(({ attachment, asset }) => (
              <li
                className={styles.card}
                id={coachingWorkspaceFocusDomId({
                  kind: "media",
                  attachmentId: attachment.id,
                })}
                key={attachment.id}
                tabIndex={-1}
              >
                <div className={styles.cardHeader}>
                  <div>
                    <h3>
                      {asset.caption || asset.altText || "Untitled media"}
                    </h3>
                    <span className={styles.badge}>
                      {attachment.targetType} · {attachment.role}
                    </span>
                  </div>
                  <span>{asset.mediaKind}</span>
                </div>
                <button
                  className={styles.buttonDanger}
                  disabled={busy || attachment.status !== "active"}
                  type="button"
                  onClick={() => withdraw(attachment.id)}
                >
                  Withdraw attachment
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No media is attached to this plan.</p>
        )}
      </div>
    </section>
  );
}

function LaunchPanel({
  workspace,
  phases,
  busy,
  mutate,
}: {
  workspace: Workspace;
  phases: Phase[];
  busy: boolean;
  mutate: Mutate;
}) {
  const sessions = workspace.launchSessions ?? [];
  const lessonChoices = (workspace.lessons ?? [])
    .filter((lesson) => lesson.status !== "archived")
    .map((lesson) => [lesson.id, lesson.title] as [string, string]);
  const imports = workspace.launchImports ?? [];
  const comparisons = workspace.launchComparisons ?? [];
  const documentChoices = (workspace.mediaAssets ?? [])
    .filter((asset) => asset.status === "ready" && asset.mediaKind === "document")
    .map((asset) => [
      asset.id,
      asset.caption || asset.originalFilename || asset.altText || "Untitled source document",
    ] as [string, string]);
  const [csv, setCsv] = useState<CsvReview | null>(null);
  const [stagedCsv, setStagedCsv] = useState<StagedCsvSnapshot | null>(null);
  const [csvSourceMediaAssetId, setCsvSourceMediaAssetId] = useState("");
  const [csvIssue, setCsvIssue] = useState("");
  const [excludeRejectedRows, setExcludeRejectedRows] = useState(false);
  const [baselineId, setBaselineId] = useState("");
  const [currentId, setCurrentId] = useState("");
  const [selectedPairKeys, setSelectedPairKeys] = useState<Set<string>>(
    new Set(),
  );
  const [manualMetrics, setManualMetrics] = useState<ManualMetricDraft[]>(() => [
    newManualMetricDraft(1),
  ]);
  const [manualMetricIssue, setManualMetricIssue] =
    useState<ManualMetricIssue | null>(null);
  const baseline = sessions.find((session) => session.id === baselineId);
  const current = sessions.find((session) => session.id === currentId);
  const comparable = comparableMetrics(baseline, current);
  const selectedComparable = comparable.filter((pair) =>
    selectedPairKeys.has(metricPairKey(pair)),
  );

  function chooseBaseline(value: string) {
    setBaselineId(value);
    const nextBaseline = sessions.find((session) => session.id === value);
    setSelectedPairKeys(
      defaultPairSelection(comparableMetrics(nextBaseline, current)),
    );
  }

  function chooseCurrent(value: string) {
    setCurrentId(value);
    const nextCurrent = sessions.find((session) => session.id === value);
    setSelectedPairKeys(
      defaultPairSelection(comparableMetrics(baseline, nextCurrent)),
    );
  }

  function updateManualMetric(
    metricId: number,
    patch: Partial<ManualMetricDraft>,
  ) {
    setManualMetrics((current) =>
      current.map((metric) =>
        metric.id === metricId ? { ...metric, ...patch } : metric,
      ),
    );
    if (manualMetricIssue) setManualMetricIssue(null);
  }

  function addManualMetric() {
    if (manualMetrics.length >= MAX_MANUAL_SUMMARY_METRICS) return;
    const nextId = Math.max(...manualMetrics.map((metric) => metric.id)) + 1;
    setManualMetrics((current) => [...current, newManualMetricDraft(nextId)]);
    setManualMetricIssue(null);
    window.requestAnimationFrame(() => {
      document.getElementById(manualMetricDisplayNameId(nextId))?.focus();
    });
  }

  function removeManualMetric(metricId: number) {
    if (manualMetrics.length === 1) return;
    setManualMetrics((current) =>
      current.filter((metric) => metric.id !== metricId),
    );
    setManualMetricIssue(null);
    window.requestAnimationFrame(() => {
      document.getElementById("add-manual-metric")?.focus();
    });
  }

  async function manual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const duplicate = duplicateManualMetric(manualMetrics);
    if (duplicate) {
      const canonicalKey = duplicate.canonicalKey.trim().toLowerCase();
      setManualMetricIssue({
        metricId: duplicate.id,
        message: `Canonical metric key “${canonicalKey}” is entered more than once. Use a unique key for each summary metric.`,
      });
      window.requestAnimationFrame(() => {
        document
          .getElementById(manualMetricCanonicalKeyId(duplicate.id))
          ?.focus();
      });
      return;
    }
    setManualMetricIssue(null);
    await mutate(
      "/launch/sessions",
      "POST",
      {
        phaseId: nullable(form, "phaseId"),
        lessonId: nullable(form, "lessonId"),
        importId: null,
        stagedReviewFingerprint: null,
        sourceMediaAssetId: nullable(form, "sourceMediaAssetId"),
        sourceMode: "manual",
        sessionDate: dateRequired(form, "sessionDate"),
        deviceSource: text(form, "deviceSource"),
        club: nullable(form, "club"),
        environment: nullable(form, "environment"),
        conditions: nullable(form, "conditions"),
        notes: nullable(form, "notes"),
        coachInterpretation: text(form, "coachInterpretation"),
        limitations: text(form, "limitations"),
        representativeness: text(form, "representativeness"),
        nextEvidenceNeeded: nullable(form, "nextEvidenceNeeded"),
        summaryMetrics: manualMetrics.map(manualMetricPayload),
        shots: [],
      },
      "Manual launch-monitor session committed with coach interpretation.",
    );
    formElement.reset();
    setManualMetrics([newManualMetricDraft(1)]);
    setManualMetricIssue(null);
  }

  function chooseCsv(file: File | undefined) {
    setStagedCsv(null);
    setCsvIssue("");
    if (!file) {
      setCsv(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setCsv(parseCsvReview(String(reader.result ?? ""), file.name));
      } catch (caught) {
        setCsv({
          filename: file.name,
          headers: [],
          rows: [],
          mappings: {},
          units: {},
          unitConfirmed: {},
          rejected: [
            {
              row: 0,
              reason:
                caught instanceof Error
                  ? caught.message
                  : "CSV could not be read.",
            },
          ],
        });
      }
    };
    reader.readAsText(file);
  }

  async function stageCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csv) return;
    const form = new FormData(event.currentTarget);
    const reviewRows = csv.headers.length
      ? csv.rows.map((row) => csv.headers.map((_, index) => (row[index] ?? "").trim()))
      : [];
    const review = { ...csv, rows: reviewRows };
    const validation = validateLaunchCsvReview(review);
    if (reviewRows.length > 1000) {
      setCsvIssue("This import has more than 1,000 accepted rows. Split the file before validation so final commit can match every accepted row.");
      return;
    }
    const allowPartial = excludeRejectedRows && validation.rows.length > 0;
    const confirmedMetricUnits = launchCsvMetricUnits(review);
    const status = !review.headers.length
      ? "failed"
      : validation.mappingErrors.length || (validation.rejected.length > 0 && !allowPartial)
        ? "mapping_required"
        : !validation.rows.length
          ? "failed"
          : "validated";
    const acceptedRows = status === "validated" ? validation.rows : [];
    const acceptedSourceRowNumbers = status === "validated" ? validation.sourceRowNumbers : [];
    const fingerprint = status === "validated" ? launchCsvStageFingerprint({
      headers: review.headers,
      mappings: review.mappings,
      units: confirmedMetricUnits,
      acceptedRows,
    }) : null;
    const payload = await mutate(
      "/launch/imports",
      "POST",
      {
        sourceMediaAssetId: nullable(form, "sourceMediaAssetId"),
        columnHeaders: review.headers,
        columnMappings: review.mappings,
        validationReport: {
          version: "launch-csv-review-v1",
          filename: review.filename,
          parseFailure: !review.headers.length ? review.rejected[0]?.reason ?? "CSV could not be parsed." : null,
          excludedRejectedRows: status === "validated" && allowPartial,
          mappingErrors: validation.mappingErrors,
          rejectedRows: validation.rejected,
          previewRows: reviewRows.slice(0, 3).map((row) => row.slice(0, 12)),
          metricUnits: confirmedMetricUnits,
          confirmedUnitColumns: review.headers.filter(
            (header) => review.mappings[header] && review.unitConfirmed[header],
          ),
          acceptedRowsFingerprint: fingerprint,
        },
        reviewRows,
        acceptedRows,
        acceptedSourceRowNumbers,
        rejectedRows: validation.rejected,
        totalRowCount: reviewRows.length,
        acceptedRowCount: acceptedRows.length,
        rejectedRowCount: validation.rejected.length,
        status,
        errorCode:
          status === "failed"
            ? review.headers.length
              ? "csv_no_accepted_rows"
              : "csv_parse_failed"
            : status === "mapping_required"
              ? "csv_review_required"
              : null,
        idempotencyKey: `launch-import-${status}-${Date.now()}`,
      },
      status === "validated"
        ? allowPartial
          ? "Mapping and units locked. Accepted rows are validated; listed rejected rows are excluded."
          : "Mapping, units, and reviewed rows validated and locked for final commit."
        : status === "mapping_required"
          ? "Draft mapping and row review saved. Continue from this receipt after refresh."
          : "Failed import report saved with its recoverable context.",
    );
    const importId = nestedId(payload, "import");
    if (!importId) {
      setCsvIssue("The import did not return a usable receipt. Save the review again.");
      return;
    }
    if (status !== "validated" || !fingerprint) {
      setStagedCsv(null);
      setCsvIssue(
        status === "mapping_required"
          ? validation.mappingErrors.join(" ") || "Review the rejected rows, then explicitly exclude or correct them before validation."
          : "No usable numeric rows were found. Correct the file and select it again.",
      );
      return;
    }
    setCsvIssue("");
    setStagedCsv({
      importId,
      filename: review.filename,
      headers: [...review.headers],
      mappings: { ...review.mappings },
      units: { ...confirmedMetricUnits },
      acceptedRows: acceptedRows.map((row) => [...row]),
      acceptedSourceRowNumbers: [...acceptedSourceRowNumbers],
      rejected: validation.rejected.map((row) => ({ ...row })),
      excludedRejectedRows: allowPartial,
      fingerprint,
    });
  }

  function resumeImport(importRow: LaunchImport) {
    const persistedUnits = stringRecord(importRow.validationReport.metricUnits);
    const confirmedColumns = new Set(
      stringList(importRow.validationReport.confirmedUnitColumns),
    );
    const filename =
      typeof importRow.validationReport.filename === "string"
        ? importRow.validationReport.filename
        : "Saved launch-data import";
    setCsvSourceMediaAssetId(importRow.sourceMediaAssetId ?? "");
    setExcludeRejectedRows(importRow.validationReport.excludedRejectedRows === true);
    setCsv({
      filename,
      headers: [...importRow.columnHeaders],
      rows: importRow.reviewRows.map((row) => [...row]),
      mappings: { ...importRow.columnMappings },
      units: persistedUnits,
      unitConfirmed: Object.fromEntries(
        importRow.columnHeaders.map((header) => [header, confirmedColumns.has(header)]),
      ),
      rejected: importRow.rejectedRows.map((row) => ({ ...row })),
    });
    if (importRow.status !== "validated") {
      setStagedCsv(null);
      setCsvIssue(
        importRow.status === "failed"
          ? "This saved import failed. Correct or replace the CSV, then save a new review."
          : "Saved mapping restored. Complete mapping and unit confirmation, then validate again.",
      );
      return;
    }
    const fingerprint = importRow.validationReport.acceptedRowsFingerprint;
    if (typeof fingerprint !== "string") {
      setStagedCsv(null);
      setCsvIssue("This validated receipt has no locked fingerprint and cannot be committed.");
      return;
    }
    setStagedCsv({
      importId: importRow.id,
      filename,
      headers: [...importRow.columnHeaders],
      mappings: { ...importRow.columnMappings },
      units: persistedUnits,
      acceptedRows: importRow.acceptedRows.map((row) => [...row]),
      acceptedSourceRowNumbers: [...importRow.acceptedSourceRowNumbers],
      rejected: importRow.rejectedRows.map((row) => ({ ...row })),
      excludedRejectedRows: importRow.validationReport.excludedRejectedRows === true,
      fingerprint,
    });
    setCsvIssue("");
  }

  async function commitCsv(importRow: LaunchImport) {
    if (!stagedCsv || importRow.id !== stagedCsv.importId) return;
    const persistedUnits = stringRecord(importRow.validationReport.metricUnits);
    const persistedFingerprint = importRow.validationReport.acceptedRowsFingerprint;
    const calculatedFingerprint = launchCsvStageFingerprint({
      headers: importRow.columnHeaders,
      mappings: importRow.columnMappings,
      units: persistedUnits,
      acceptedRows: importRow.acceptedRows,
    });
    if (
      typeof persistedFingerprint !== "string" ||
      persistedFingerprint !== stagedCsv.fingerprint ||
      calculatedFingerprint !== stagedCsv.fingerprint
    ) {
      setCsvIssue("The staged mapping or reviewed rows no longer match. Start revalidation before final commit.");
      return;
    }
    const form = document.getElementById(
      "csv-final-context",
    ) as HTMLFormElement | null;
    if (!form) return;
    const data = new FormData(form);
    await mutate(
      "/launch/sessions",
      "POST",
      {
        phaseId: nullable(data, "phaseId"),
        lessonId: nullable(data, "lessonId"),
        importId: importRow.id,
        stagedReviewFingerprint: stagedCsv.fingerprint,
        sourceMediaAssetId: importRow.sourceMediaAssetId,
        sourceMode: "csv_import",
        sessionDate: dateRequired(data, "sessionDate"),
        deviceSource: text(data, "deviceSource"),
        club: nullable(data, "club"),
        environment: nullable(data, "environment"),
        conditions: nullable(data, "conditions"),
        notes: nullable(data, "notes"),
        coachInterpretation: text(data, "coachInterpretation"),
        limitations: text(data, "limitations"),
        representativeness: text(data, "representativeness"),
        nextEvidenceNeeded: nullable(data, "nextEvidenceNeeded"),
        summaryMetrics: [],
        shots: [],
      },
      "Validated CSV rows committed as one launch-monitor session.",
    );
    setCsv(null);
    setStagedCsv(null);
    setCsvIssue("");
  }

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await mutate(
      "/launch/comparisons",
      "POST",
      {
        title: text(form, "title"),
        baselineSessionId: baselineId,
        currentSessionId: currentId,
        coachInterpretation: text(form, "coachInterpretation"),
        limitations: text(form, "limitations"),
        nextEvidenceNeeded: nullable(form, "nextEvidenceNeeded"),
        metricPairs: selectedComparable.map((pair) => ({
          baselineMetricId: pair.baseline.id,
          currentMetricId: pair.current.id,
          displayName: pair.current.displayName,
        })),
      },
      "Baseline/current comparison created from the selected exact metric/unit pairs.",
    );
    formElement.reset();
    setBaselineId("");
    setCurrentId("");
    setSelectedPairKeys(new Set());
  }

  return (
    <section className={styles.panel} aria-labelledby="launch-heading">
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Coach-interpreted evidence</span>
          <h2 id="launch-heading">Launch-monitor sessions and comparisons</h2>
          <p>
            Roadmap stores the measurements you enter. It does not diagnose,
            score, or infer swing mechanics.
          </p>
        </div>
      </div>
      <details open>
        <summary>Enter one manual session</summary>
        <form method="post" className={styles.editor} onSubmit={manual}>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Session date</span>
              <input required name="sessionDate" type="datetime-local" />
            </label>
            <Input label="Device or source" name="deviceSource" />
            <Input optional label="Club" name="club" />
            <Select
              optional
              label="Phase"
              name="phaseId"
              options={phases.map((phase) => [phase.id, phase.title])}
            />
            <Select
              optional
              label="Related lesson"
              name="lessonId"
              options={lessonChoices}
            />
            <Select
              optional
              label="Source CSV or document"
              name="sourceMediaAssetId"
              options={documentChoices}
            />
            <Input optional label="Environment" name="environment" />
            <Input optional label="Conditions" name="conditions" />
          </div>
          <section aria-labelledby="manual-metrics-heading">
            <div className={styles.sectionHeader}>
              <div>
                <h3 id="manual-metrics-heading">Summary metrics</h3>
                <p className={styles.muted} id="manual-metrics-help">
                  Add each individually recorded metric to this one session. Exact units
                  are stored as entered and are never converted or mixed.
                </p>
              </div>
              <span className={styles.badge} role="status">
                {manualMetrics.length} of {MAX_MANUAL_SUMMARY_METRICS}
              </span>
            </div>
            {manualMetricIssue ? (
              <p
                className={styles.status}
                data-error="true"
                id="manual-metric-issue"
                role="alert"
              >
                {manualMetricIssue.message}
              </p>
            ) : null}
            <div className={styles.manualMetricList}>
              {manualMetrics.map((metric, index) => (
                <fieldset
                  aria-describedby="manual-metrics-help"
                  className={styles.manualMetricSet}
                  key={metric.id}
                >
                  <legend>Summary metric {index + 1}</legend>
                  <div className={styles.grid}>
                    <Input
                      id={manualMetricDisplayNameId(metric.id)}
                      label="Metric name"
                      name={`manualMetricDisplayName-${metric.id}`}
                      onChange={(event) =>
                        updateManualMetric(metric.id, {
                          displayName: event.target.value,
                        })
                      }
                      placeholder="Club speed"
                      value={metric.displayName}
                    />
                    <Input
                      aria-describedby={
                        manualMetricIssue?.metricId === metric.id
                          ? "manual-metric-issue"
                          : undefined
                      }
                      aria-invalid={manualMetricIssue?.metricId === metric.id}
                      id={manualMetricCanonicalKeyId(metric.id)}
                      label="Canonical metric key"
                      name={`manualMetricCanonicalKey-${metric.id}`}
                      onChange={(event) =>
                        updateManualMetric(metric.id, {
                          canonicalKey: event.target.value,
                        })
                      }
                      pattern="[a-z0-9_]+"
                      placeholder="club_speed"
                      value={metric.canonicalKey}
                    />
                    <Input
                      label="Value"
                      name={`manualMetricValue-${metric.id}`}
                      onChange={(event) =>
                        updateManualMetric(metric.id, {
                          numericValue: event.target.value,
                        })
                      }
                      step="any"
                      type="number"
                      value={metric.numericValue}
                    />
                    <Input
                      label="Unit"
                      name={`manualMetricUnit-${metric.id}`}
                      onChange={(event) =>
                        updateManualMetric(metric.id, { unit: event.target.value })
                      }
                      placeholder="mph"
                      value={metric.unit}
                    />
                    <Select
                      label="Measurement direction"
                      name={`manualMetricDirection-${metric.id}`}
                      onChange={(value) =>
                        updateManualMetric(metric.id, { direction: value })
                      }
                      options={[
                        ["unknown", "Unknown (safest default)"],
                        ["higher", "Higher"],
                        ["lower", "Lower"],
                        ["target", "Target"],
                        ["context_only", "Context only"],
                      ]}
                      value={metric.direction}
                    />
                  </div>
                  {manualMetrics.length > 1 ? (
                    <button
                      className={styles.buttonDanger}
                      disabled={busy}
                      onClick={() => removeManualMetric(metric.id)}
                      type="button"
                    >
                      Remove summary metric {index + 1}
                    </button>
                  ) : null}
                </fieldset>
              ))}
            </div>
            <div className={styles.actions}>
              <button
                className={styles.buttonSecondary}
                disabled={
                  busy || manualMetrics.length >= MAX_MANUAL_SUMMARY_METRICS
                }
                id="add-manual-metric"
                onClick={addManualMetric}
                type="button"
              >
                Add metric
              </button>
              <span className={styles.muted}>
                Keep this quick-entry set bounded to the metrics that matter for the
                coach-reviewed comparison.
              </span>
            </div>
          </section>
          <div className={styles.grid}>
            <Select
              label="Representativeness"
              name="representativeness"
              options={[
                ["representative", "Representative"],
                ["limited", "Limited"],
                ["unknown", "Unknown"],
              ]}
            />
            <Area label="Coach interpretation" name="coachInterpretation" />
            <Area label="Limitations" name="limitations" />
            <Area
              optional
              label="Next evidence needed"
              name="nextEvidenceNeeded"
            />
            <Area optional label="Notes" name="notes" />
          </div>
          <button className={styles.button} disabled={busy} type="submit">
            Commit manual session
          </button>
          <p className={styles.muted}>
            Optional source files must first be uploaded as a ready CSV/document in the{" "}
            <a href="/app/media#upload-media">media library</a>.
          </p>
        </form>
      </details>
      <details>
        <summary>Import CSV with mapping and row review</summary>
        <div className={styles.editor}>
          <label className={styles.fieldFull}>
            <span>Launch-monitor CSV</span>
            <input
              accept=".csv,text/csv"
              type="file"
              onChange={(event) => {
                chooseCsv(event.target.files?.[0]);
                setExcludeRejectedRows(false);
              }}
            />
          </label>
          {csv && !stagedCsv ? (
            <form method="post" className={styles.editor} onSubmit={stageCsv}>
              <Select
                optional
                label="Uploaded source CSV or document"
                name="sourceMediaAssetId"
                value={csvSourceMediaAssetId}
                onChange={setCsvSourceMediaAssetId}
                options={documentChoices}
              />
              <p className={styles.muted}>
                This selection is optional. To retain the original file, upload it in the{" "}
                <a href="/app/media#upload-media">media library</a>, then select it here.
              </p>
              <CsvMapping review={csv} setReview={setCsv} />
              {validateLaunchCsvReview(csv).rejected.length ? (
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={excludeRejectedRows}
                    onChange={(event) =>
                      setExcludeRejectedRows(event.target.checked)
                    }
                  />
                  Exclude every listed rejected row and validate only the
                  accepted rows
                </label>
              ) : null}
              <button
                className={styles.button}
                disabled={
                  busy ||
                  csv.rows.length > 1000
                }
                type="submit"
              >
                {!csv.headers.length
                  ? "Save failed import report"
                  : validateLaunchCsvReview(csv).mappingErrors.length > 0 ||
                      (validateLaunchCsvReview(csv).rejected.length > 0 && !excludeRejectedRows)
                    ? "Save mapping-required review"
                    : "Stage mapping and validation report"}
              </button>
            </form>
          ) : null}
          {stagedCsv ? (
            <div className={styles.notice} role="status">
              <strong>Validated mapping locked.</strong>
              <p>
                {stagedCsv.acceptedRows.length} accepted row
                {stagedCsv.acceptedRows.length === 1 ? "" : "s"}; {stagedCsv.rejected.length}{" "}
                rejected row{stagedCsv.rejected.length === 1 ? "" : "s"}
                {stagedCsv.excludedRejectedRows ? " explicitly excluded" : ""}. Final commit
                will use this exact mapping, confirmed units, and reviewed row snapshot.
              </p>
              <dl>
                {stagedCsv.headers.flatMap((header) =>
                  stagedCsv.mappings[header]
                    ? [
                        <div key={header}>
                          <dt>{header}</dt>
                          <dd>
                            {stagedCsv.mappings[header]} · {stagedCsv.units[header]}
                          </dd>
                        </div>,
                      ]
                    : [],
                )}
              </dl>
              <button
                className={styles.buttonSecondary}
                type="button"
                onClick={() => {
                  setStagedCsv(null);
                  setCsvIssue("Mapping unlocked. Review and validate it again before final commit.");
                }}
              >
                Change mapping and revalidate
              </button>
            </div>
          ) : null}
          {csvIssue ? (
            <div className={styles.status} data-error="true" role="alert">
              {csvIssue}
            </div>
          ) : null}
          {stagedCsv && imports.some((item) => item.id === stagedCsv.importId && item.status === "validated") ? (
            <form
              method="post"
              className={styles.editor}
              id="csv-final-context"
              onSubmit={(event) => {
                event.preventDefault();
                const row = imports.find(
                  (item) => item.id === stagedCsv.importId && item.status === "validated",
                );
                if (row) void commitCsv(row);
              }}
            >
              <h3>Final commit context</h3>
              <div className={styles.grid}>
                <label className={styles.field}>
                  <span>Session date</span>
                  <input required name="sessionDate" type="datetime-local" />
                </label>
                <Input label="Device or source" name="deviceSource" />
                <Input optional label="Club" name="club" />
                <Select
                  optional
                  label="Phase"
                  name="phaseId"
                  options={phases.map((phase) => [phase.id, phase.title])}
                />
                <Select
                  optional
                  label="Related lesson"
                  name="lessonId"
                  options={lessonChoices}
                />
                <Input optional label="Environment" name="environment" />
                <Input optional label="Conditions" name="conditions" />
                <Select
                  label="Representativeness"
                  name="representativeness"
                  options={[
                    ["representative", "Representative"],
                    ["limited", "Limited"],
                    ["unknown", "Unknown"],
                  ]}
                />
                <Area label="Coach interpretation" name="coachInterpretation" />
                <Area label="Limitations" name="limitations" />
                <Area
                  optional
                  label="Next evidence needed"
                  name="nextEvidenceNeeded"
                />
                <Area optional label="Notes" name="notes" />
              </div>
              <button className={styles.button} disabled={busy} type="submit">
                Commit accepted rows
              </button>
            </form>
          ) : null}
        </div>
      </details>
      <details>
        <summary>Compare baseline and current sessions</summary>
        <form method="post" className={styles.editor} onSubmit={compare}>
          <div className={styles.grid}>
            <Select
              label="Baseline session"
              name="baselineSessionId"
              value={baselineId}
              onChange={chooseBaseline}
              options={sessions.map((session) => [
                session.id,
                sessionLabel(session),
              ])}
            />
            <Select
              label="Current session"
              name="currentSessionId"
              value={currentId}
              onChange={chooseCurrent}
              options={sessions.map((session) => [
                session.id,
                sessionLabel(session),
              ])}
            />
            <Input label="Comparison title" name="title" />
            <Area label="Coach interpretation" name="coachInterpretation" />
            <Area label="Limitations" name="limitations" />
            <Area
              optional
              label="Next evidence needed"
              name="nextEvidenceNeeded"
            />
          </div>
          {comparable.length ? (
            <fieldset>
              <legend>Select a small, decision-useful metric subset</legend>
              <p className={styles.muted}>
                {selectedComparable.length} of {comparable.length} exact
                metric/unit pairs selected.
              </p>
              <ul className={styles.list}>
                {comparable.map((pair) => {
                  const key = metricPairKey(pair);
                  return (
                    <li className={styles.card} key={key}>
                      <label className={styles.checkbox}>
                        <input
                          type="checkbox"
                          checked={selectedPairKeys.has(key)}
                          onChange={(event) =>
                            setSelectedPairKeys((currentKeys) => {
                              const next = new Set(currentKeys);
                              if (event.target.checked) next.add(key);
                              else next.delete(key);
                              return next;
                            })
                          }
                        />
                        <span>
                          <strong>{pair.current.displayName}</strong>
                          <br />
                          <small>
                            {pair.baseline.numericValue} →{" "}
                            {pair.current.numericValue} {pair.current.unit}
                          </small>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : (
            <p className={styles.muted}>
              Choose two sessions with at least one matching canonical metric
              and exact unit.
            </p>
          )}
          <button
            className={styles.button}
            disabled={
              busy || !selectedComparable.length || baselineId === currentId
            }
            type="submit"
          >
            Create comparison from {selectedComparable.length} selected
          </button>
        </form>
      </details>
      <div className={styles.preview}>
        <h3>Import receipts</h3>
        {imports.length ? (
          <ul className={styles.list}>
            {imports.map((importRow) => (
              <li
                className={styles.card}
                id={coachingWorkspaceFocusDomId({
                  kind: "launch_import",
                  importId: importRow.id,
                })}
                key={importRow.id}
                tabIndex={-1}
              >
                <div className={styles.cardHeader}>
                  <strong>Launch-data import</strong>
                  <span className={styles.badge}>{importRow.status.replaceAll("_", " ")}</span>
                </div>
                <p>
                  {importRow.acceptedRowCount} accepted of {importRow.totalRowCount} rows
                  {importRow.rejectedRowCount
                    ? ` · ${importRow.rejectedRowCount} rejected`
                    : " · no rejected rows"}
                </p>
                {importRow.errorCode ? (
                  <small>Error: {importRow.errorCode.replaceAll("_", " ")}</small>
                ) : null}
                {importRow.sourceMediaAssetId ? (
                  <a
                    href={`/api/media/${encodeURIComponent(importRow.sourceMediaAssetId)}`}
                    download
                  >
                    Open/download source document
                  </a>
                ) : (
                  <small>No source file attached; the saved row review remains available.</small>
                )}
                {importRow.status === "validated" ||
                importRow.status === "mapping_required" ||
                importRow.status === "failed" ? (
                  <button
                    className={styles.buttonSecondary}
                    disabled={busy}
                    type="button"
                    onClick={() => resumeImport(importRow)}
                  >
                    {importRow.status === "validated"
                      ? "Resume exact final commit"
                      : importRow.status === "mapping_required"
                        ? "Continue saved mapping review"
                        : "Review failed import"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No launch-data import receipts.</p>
        )}
        <h3>Committed sessions</h3>
        {sessions.length ? (
          <ul className={styles.list}>
            {sessions.map((session) => (
              <li className={styles.card} key={session.id}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3>{sessionLabel(session)}</h3>
                    <span className={styles.badge}>
                      {session.summaryMetrics.length} summary metric
                      {session.summaryMetrics.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <p>{session.coachInterpretation}</p>
                {session.sourceMediaAssetId ? (
                  <p>
                    <a
                      href={`/api/media/${encodeURIComponent(session.sourceMediaAssetId)}`}
                      download
                    >
                      Open/download committed source document
                    </a>
                  </p>
                ) : null}
                <dl>
                  {session.summaryMetrics.map((metric) => (
                    <div key={metric.id}>
                      <dt>{metric.displayName}</dt>
                      <dd>
                        {metric.numericValue} {metric.unit}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p>No committed sessions.</p>
        )}
        <h3>Comparisons</h3>
        {comparisons.length ? (
          <ul className={styles.list}>
            {comparisons.map((comparison) => (
              <li className={styles.card} key={comparison.id}>
                <h3>{comparison.title}</h3>
                <p>{comparison.coachInterpretation}</p>
                <ul>
                  {comparison.metrics.map((metric) => (
                    <li key={`${comparison.id}:${metric.displayName}`}>
                      {metric.displayName}: {metric.baselineValue} →{" "}
                      {metric.currentValue} {metric.unit} (
                      {metric.delta >= 0 ? "+" : ""}
                      {metric.delta})
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p>No baseline/current comparison yet.</p>
        )}
      </div>
    </section>
  );
}

type CsvReview = {
  filename: string;
  headers: string[];
  rows: string[][];
  mappings: Record<string, string | null>;
  units: Record<string, string>;
  unitConfirmed: Record<string, boolean>;
  rejected: Array<{ row: number; reason: string }>;
};

type StagedCsvSnapshot = {
  importId: string;
  filename: string;
  headers: string[];
  mappings: Record<string, string | null>;
  units: Record<string, string>;
  acceptedRows: string[][];
  acceptedSourceRowNumbers: number[];
  rejected: Array<{ row: number; reason: string }>;
  excludedRejectedRows: boolean;
  fingerprint: string;
};

function CsvMapping({
  review,
  setReview,
}: {
  review: CsvReview;
  setReview(value: CsvReview): void;
}) {
  const validation = validateLaunchCsvReview(review);
  return (
    <>
      <div className={styles.notice}>
        <strong>Review before commit:</strong> {review.rows.length} data row
        {review.rows.length === 1 ? "" : "s"}; {validation.rows.length}{" "}
        accepted; {validation.rejected.length} rejected.
      </div>
      <div className={styles.grid}>
        {review.headers.map((header) => {
          const mappedKey = review.mappings[header];
          return (
            <div className={styles.card} key={header}>
              <label className={styles.field}>
                <span>{header}</span>
                <select
                  value={mappedKey ?? ""}
                  onChange={(event) => {
                    const canonicalKey = event.target.value || null;
                    setReview({
                      ...review,
                      mappings: { ...review.mappings, [header]: canonicalKey },
                      units: {
                        ...review.units,
                        [header]: canonicalKey ? defaultMetricUnit(canonicalKey) : "",
                      },
                      unitConfirmed: { ...review.unitConfirmed, [header]: false },
                    });
                  }}
                >
                  <option value="">Do not import</option>
                  <option value="club_speed">Club speed</option>
                  <option value="ball_speed">Ball speed</option>
                  <option value="carry_distance">Carry distance</option>
                  <option value="total_distance">Total distance</option>
                  <option value="launch_angle">Launch angle</option>
                  <option value="spin_rate">Spin rate</option>
                  <option value="smash_factor">Smash factor</option>
                  <option value="attack_angle">Attack angle</option>
                </select>
              </label>
              {mappedKey ? (
                <>
                  <label className={styles.field}>
                    <span>Unit for {header}</span>
                    <input
                      required
                      maxLength={40}
                      value={review.units[header] ?? ""}
                      onChange={(event) =>
                        setReview({
                          ...review,
                          units: { ...review.units, [header]: event.target.value },
                          unitConfirmed: { ...review.unitConfirmed, [header]: false },
                        })
                      }
                    />
                  </label>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={Boolean(review.unitConfirmed[header])}
                      onChange={(event) =>
                        setReview({
                          ...review,
                          unitConfirmed: {
                            ...review.unitConfirmed,
                            [header]: event.target.checked,
                          },
                        })
                      }
                    />
                    I confirm {header} uses {review.units[header] || "the entered unit"}
                  </label>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      {validation.mappingErrors.length ? (
        <div className={styles.status} data-error="true" role="alert">
          <strong>Complete the mapping review.</strong>
          <ul>
            {validation.mappingErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {validation.rejected.length ? (
        <details open>
          <summary>Rejected rows ({validation.rejected.length})</summary>
          <ul>
            {validation.rejected.slice(0, 100).map((item) => (
              <li key={`${item.row}:${item.reason}`}>
                Row {item.row}: {item.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <details>
        <summary>Preview first 10 rows</summary>
        <div className={styles.preview}>
          {review.rows.slice(0, 10).map((row, index) => (
            <p key={index}>
              Row {index + 2}: {row.join(" · ")}
            </p>
          ))}
        </div>
      </details>
    </>
  );
}

function ReviewsPanel({
  workspace,
  busy,
  mutate,
}: {
  workspace: Workspace;
  busy: boolean;
  mutate: Mutate;
}) {
  const reviews = workspace.phaseReviews ?? [];
  const candidates = reviewSourceCandidates(workspace);
  const candidateLabels = new Map(
    candidates.map((source) => [`${source.kind}:${source.id}`, source.title]),
  );
  const reviewablePhases = (workspace.phases ?? []).filter(
    (phase) => !phase.status || phase.status === "active" || phase.status === "paused",
  );
  const [reviewedPhaseId, setReviewedPhaseId] = useState(reviewablePhases[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [transition, setTransition] = useState("continue");
  const [outcome, setOutcome] = useState("partially_complete");
  const [reviewIssue, setReviewIssue] = useState("");
  const activeReviewedPhaseId = reviewablePhases.some(
    (phase) => phase.id === reviewedPhaseId,
  )
    ? reviewedPhaseId
    : reviewablePhases[0]?.id ?? "";
  const reviewedPhase = (workspace.phases ?? []).find(
    (phase) => phase.id === activeReviewedPhaseId,
  );
  const immediateNextPhase = [...(workspace.phases ?? [])]
    .filter(
      (phase) =>
        phase.status === "planned" &&
        (reviewedPhase?.sequence === undefined ||
          phase.sequence === undefined ||
          phase.sequence > reviewedPhase.sequence),
    )
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))[0];

  function changeTransition(value: string) {
    setTransition(value);
    setOutcome(
      value === "pause"
        ? "paused"
        : value === "advance" || value === "complete_plan"
          ? "complete"
          : "partially_complete",
    );
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.size) {
      setReviewIssue("Select at least one owned source record before confirming the review.");
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const advancing = transition === "advance";
    await mutate(
      "/reviews",
      "POST",
      {
        phaseId: text(form, "phaseId"),
        transition,
        outcome,
        originalPurpose: text(form, "originalPurpose"),
        baselineSummary: text(form, "baselineSummary"),
        workCompleted: text(form, "workCompleted"),
        changeSummary: text(form, "changeSummary"),
        reliabilityLabel: text(form, "reliabilityLabel"),
        limitations: text(form, "limitations"),
        golferContribution: nullable(form, "golferContribution"),
        coachConclusion: text(form, "coachConclusion"),
        remainingOpportunity: nullable(form, "remainingOpportunity"),
        nextPhaseRationale: advancing ? nullable(form, "nextPhaseRationale") : null,
        independentPracticeAlternative: nullable(form, "independentPracticeAlternative"),
        nextPhaseId: advancing ? nullable(form, "nextPhaseId") : null,
        nextPriorityTitle: advancing ? nullable(form, "nextPriorityTitle") : null,
        nextPriorityRationale: advancing ? nullable(form, "nextPriorityRationale") : null,
        sources: candidates
          .filter((source) => selected.has(`${source.kind}:${source.id}`))
          .map((source) => ({ kind: source.kind, id: source.id })),
      },
      "Source-backed phase review confirmed and its transition saved atomically.",
    );
    formElement.reset();
    setSelected(new Set());
    setTransition("continue");
    setOutcome("partially_complete");
    setReviewIssue("");
  }
  return (
    <section className={styles.panel} aria-labelledby="review-heading">
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Source-first phase review</span>
          <h2 id="review-heading">Select the record first, then make the conclusion</h2>
          <p>
            Lessons, practice, check-ins, media, launch data, and evidence are selected explicitly.
            Roadmap does not infer a conclusion from them.
          </p>
        </div>
      </div>
      {candidates.length && reviewablePhases.length ? (
        <form method="post" className={styles.editor} onSubmit={create}>
          <Select
            label="Phase being reviewed"
            name="phaseId"
            value={activeReviewedPhaseId}
            onChange={setReviewedPhaseId}
            options={reviewablePhases.map((phase) => [phase.id, phase.title])}
          />
          <fieldset>
            <legend>1. Source records reviewed ({selected.size} selected)</legend>
            <ul className={styles.list}>
              {candidates.map((source) => {
                const key = `${source.kind}:${source.id}`;
                return (
                  <li className={styles.card} key={key}>
                    <label className={styles.checkbox}>
                      <input
                        checked={selected.has(key)}
                        type="checkbox"
                        onChange={(event) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(key);
                            else next.delete(key);
                            return next;
                          })
                        }
                      />
                      <span>
                        <strong>{source.title}</strong>
                        <br />
                        <small>
                          {source.kind.replaceAll("_", " ")}
                          {source.occurredAt
                            ? ` · ${formatDate(source.occurredAt)}`
                            : ""}
                        </small>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <fieldset>
            <legend>2. Coach-authored conclusion and transition</legend>
            <div className={styles.grid}>
              <Select
                label="Transition"
                name="transition"
                value={transition}
                onChange={changeTransition}
                options={[
                  ["continue", "Continue this phase"],
                  ["pause", "Pause this phase"],
                  ...(immediateNextPhase
                    ? ([["advance", "Advance to the next phase"]] as Array<[
                        string,
                        string,
                      ]>)
                    : []),
                  ["complete_plan", "Complete the plan"],
                ]}
              />
              <Select
                label="Outcome"
                name="outcome"
                value={outcome}
                onChange={setOutcome}
                options={reviewOutcomeOptions(transition)}
              />
              <Area label="Original phase purpose" name="originalPurpose" />
              <Area label="Baseline summary" name="baselineSummary" />
              <Area label="Work completed" name="workCompleted" />
              <Area label="Change summary" name="changeSummary" />
              <Input label="Reliability label" name="reliabilityLabel" />
              <Area label="Limitations" name="limitations" />
              <Area optional label="Golfer contribution" name="golferContribution" />
              <Area label="Coach conclusion" name="coachConclusion" />
              <Area optional label="Remaining opportunity" name="remainingOpportunity" />
              <Area
                optional
                label="Independent-practice alternative"
                name="independentPracticeAlternative"
              />
              {transition === "advance" ? (
                <>
                  <Select
                    label="Next planned phase"
                    name="nextPhaseId"
                    options={immediateNextPhase
                      ? [[immediateNextPhase.id, immediateNextPhase.title]]
                      : []}
                  />
                  {!immediateNextPhase ? (
                    <p className={styles.empty}>
                      No immediate next planned phase is available. Add or restore the next
                      roadmap phase before advancing.
                    </p>
                  ) : null}
                  <Area label="Why advance now" name="nextPhaseRationale" />
                  <Input label="New current priority" name="nextPriorityTitle" />
                  <Area label="Priority rationale" name="nextPriorityRationale" />
                </>
              ) : null}
            </div>
          </fieldset>
          {reviewIssue ? (
            <div className={styles.status} data-error="true" role="alert">
              {reviewIssue}
            </div>
          ) : null}
          <button className={styles.button} disabled={busy || !selected.size} type="submit">
            Confirm source-backed phase review
          </button>
        </form>
      ) : (
        <div className={styles.empty}>
          Add at least one coaching or evidence record and keep an active or paused phase before
          creating a phase review.
        </div>
      )}
      {reviews.length ? (
        <div className={styles.preview}>
          <h3>Confirmed review history</h3>
          <ul className={styles.list}>
            {reviews.map((review) => {
              const sources =
                (workspace.phaseReviewSources ?? []).find(
                  (entry) => entry.phaseReviewId === review.id,
                )?.sources ?? [];
              return (
                <li className={styles.card} key={review.id}>
                  <strong>{review.title || review.summary || "Phase review"}</strong>
                  <span className={styles.badge}>{review.status}</span>
                  <p>{sources.length} exact source record{sources.length === 1 ? "" : "s"}</p>
                  {sources.length ? (
                    <ul>
                      {sources.map((source) => (
                        <li key={`${source.sourceType}:${source.sourceId}`}>
                          {candidateLabels.get(`${source.sourceType}:${source.sourceId}`) ??
                            `${capitalize(source.sourceType)} record`}
                          {` · ${source.sourceType.replaceAll("_", " ")}`}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function MilestonesPanel({
  milestones,
  phases,
  busy,
  mutate,
}: {
  milestones: Milestone[];
  phases: Phase[];
  busy: boolean;
  mutate: Mutate;
}) {
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await mutate(
      "/milestones",
      "POST",
      {
        phaseId: nullable(form, "phaseId"),
        title: text(form, "title"),
        summary: text(form, "summary"),
        occurredAt: dateOnlyRequired(form, "occurredAt"),
      },
      "Private milestone created. Publish it explicitly when ready.",
    );
    formElement.reset();
  }
  async function transition(id: string, status: string) {
    if (
      status === "withdrawn" &&
      !window.confirm(
        "Withdraw this milestone from the next published roadmap?",
      )
    )
      return;
    await mutate(
      "/milestones",
      "PATCH",
      { milestoneId: id, nextStatus: status },
      status === "published"
        ? "Milestone approved for the next publication."
        : "Milestone withdrawn from golfer-visible content.",
    );
  }
  return (
    <section className={styles.panel} aria-labelledby="milestones-heading">
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Explicit progress moments</span>
          <h2 id="milestones-heading">
            Create, publish, or withdraw milestones
          </h2>
          <p>
            A milestone stays private until the coach approves it for
            publication.
          </p>
        </div>
      </div>
      <form method="post" className={styles.editor} onSubmit={create}>
        <div className={styles.grid}>
          <Input label="Milestone title" name="title" />
          <Select
            optional
            label="Phase (optional)"
            name="phaseId"
            options={phases.map((phase) => [phase.id, phase.title])}
          />
          <label className={styles.field}>
            <span>Occurred date</span>
            <input
              required
              name="occurredAt"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <Area label="What changed" name="summary" />
        </div>
        <button className={styles.button} disabled={busy} type="submit">
          Create private milestone
        </button>
      </form>
      <div className={styles.preview}>
        <h3>Milestone history</h3>
        {milestones.length ? (
          <ul className={styles.list}>
            {milestones.map((milestone) => (
              <li className={styles.card} key={milestone.id}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3>{milestone.title}</h3>
                    <span className={styles.badge}>{milestone.status}</span>
                  </div>
                  <span>{formatDate(milestone.occurredAt)}</span>
                </div>
                <p>{milestone.summary}</p>
                <div className={styles.actions}>
                  {milestone.status === "draft" ? (
                    <button
                      className={styles.button}
                      disabled={busy}
                      type="button"
                      onClick={() => transition(milestone.id, "published")}
                    >
                      Publish milestone
                    </button>
                  ) : null}
                  {milestone.status !== "withdrawn" ? (
                    <button
                      className={styles.buttonDanger}
                      disabled={busy}
                      type="button"
                      onClick={() => transition(milestone.id, "withdrawn")}
                    >
                      Withdraw
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No milestones yet.</p>
        )}
      </div>
    </section>
  );
}

function TimelinePanel({ items }: { items: TimelineItem[] }) {
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const kinds = [...new Set(items.map((item) => item.kind))].sort();
  const statuses = [...new Set(items.map((item) => item.status))].sort();
  const visible = items.filter(
    (item) =>
      (kind === "all" || item.kind === kind) &&
      (status === "all" || item.status === status) &&
      (!query.trim() ||
        `${item.title} ${item.summary ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())),
  );
  return (
    <section className={styles.panel} aria-labelledby="timeline-heading">
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Unified chronology</span>
          <h2 id="timeline-heading">Coaching timeline</h2>
          <p>
            Lessons, practice, check-ins, evidence, sessions, reviews, and
            milestones in one filterable history.
          </p>
        </div>
      </div>
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Search timeline</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Record type</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">All types</option>
            {kinds.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All states</option>
            {statuses.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {visible.length ? (
        <ol className={styles.list}>
          {visible.map((item) => (
            <li className={styles.card} key={`${item.kind}:${item.id}`}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.badge}>
                    {item.kind.replaceAll("_", " ")} · {item.status}
                  </span>
                  <h3>{item.title}</h3>
                </div>
                <time dateTime={new Date(item.occurredAt).toISOString()}>
                  {formatDate(item.occurredAt)}
                </time>
              </div>
              {item.summary ? <p>{item.summary}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.empty}>
          No timeline records match these filters.
        </div>
      )}
    </section>
  );
}

function Input({
  label,
  name,
  optional,
  ...props
}: {
  label: string;
  name: string;
  optional?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={styles.field}>
      <span>
        {label}
        {optional ? " (optional)" : ""}
      </span>
      <input required={!optional} name={name} {...props} />
    </label>
  );
}
function Area({
  label,
  name,
  optional,
  ...props
}: {
  label: string;
  name: string;
  optional?: boolean;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={styles.field}>
      <span>
        {label}
        {optional ? " (optional)" : ""}
      </span>
      <textarea required={!optional} name={name} {...props} />
    </label>
  );
}
function Select({
  label,
  name,
  options,
  optional,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: Array<[string, string]>;
  optional?: boolean;
  value?: string;
  onChange?(value: string): void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select
        required={!optional}
        name={name}
        value={onChange ? value : undefined}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        defaultValue={onChange ? undefined : (value ?? "")}
      >
        <option value="">{optional ? "None" : "Choose one"}</option>
        {options.map(([optionValue, title]) => (
          <option value={optionValue} key={optionValue}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}

function practiceTransitions(status: string) {
  return status === "active"
    ? ["paused", "completed", "retired"]
    : status === "paused"
      ? ["active", "completed", "retired"]
      : status === "completed"
        ? ["retired"]
        : [];
}
function lessonTransitions(status: string): string[] {
  return status === "planned"
    ? ["scheduled", "completed", "canceled", "archived"]
    : status === "scheduled"
      ? ["planned", "completed", "canceled", "archived"]
      : status === "completed"
        ? ["archived"]
        : status === "canceled"
          ? ["planned", "scheduled", "archived"]
          : [];
}
function lessonStatusOptions(status: string): Array<[string, string]> {
  return [status, ...lessonTransitions(status)].map((value) => [value, capitalize(value)]);
}
function reviewOutcomeOptions(transition: string): Array<[string, string]> {
  if (transition === "pause") return [["paused", "Paused"]];
  if (transition === "advance" || transition === "complete_plan") {
    return [["complete", "Complete"]];
  }
  return [
    ["partially_complete", "Partially complete"],
    ["revised", "Revised"],
    ["insufficient_evidence", "Insufficient evidence"],
    ["goal_changed", "Goal changed"],
  ];
}
function reviewSourceCandidates(workspace: Workspace): Source[] {
  const lessons: Source[] = (workspace.lessons ?? []).map((lesson) => ({
    id: lesson.id,
    kind: "lesson",
    title: lesson.title,
    summary: lesson.coachObservation || lesson.purpose,
    occurredAt: lesson.occurredAt ?? lesson.scheduledAt ?? undefined,
  }));
  const practices: Source[] = (workspace.practiceAssignments ?? []).flatMap((row) => [
    {
      id: row.assignment.id,
      kind: "practice",
      title: row.assignment.title,
      summary: `Practice assignment · ${row.assignment.status}`,
      occurredAt: row.assignment.dueAt ?? undefined,
    },
    ...row.checkIns.map((checkIn) => ({
      id: checkIn.id,
      kind: "practice_check_in",
      title: `${row.assignment.title} check-in`,
      summary: `${checkIn.completionStatus}${checkIn.requestHelp ? " · help requested" : ""}`,
      occurredAt: checkIn.occurredAt,
    })),
  ]);
  const media: Source[] = (workspace.mediaAttachments ?? [])
    .filter((item) => item.attachment.status === "active")
    .map((item) => ({
      id: item.asset.id,
      kind: "media",
      title: item.asset.caption || item.asset.altText || "Media record",
      summary: item.asset.viewLabel || item.asset.mediaKind,
    }));
  const sessions: Source[] = (workspace.launchSessions ?? [])
    .filter((session) => session.status === undefined || session.status === "committed")
    .map((session) => ({
      id: session.id,
      kind: "launch_session",
      title: sessionLabel(session),
      summary: session.coachInterpretation,
      occurredAt: session.sessionDate,
    }));
  const comparisons: Source[] = (workspace.launchComparisons ?? [])
    .filter((comparison) => comparison.status === undefined || comparison.status === "active")
    .map((comparison) => ({
      id: comparison.id,
      kind: "launch_comparison",
      title: comparison.title,
      summary: comparison.coachInterpretation,
    }));
  const evidence: Source[] = (workspace.evidenceItems ?? []).map((item) => ({
    id: item.id,
    kind: "evidence",
    title: item.title,
    summary: `${item.evidenceType.replaceAll("_", " ")} · ${item.interpretation}`,
    occurredAt: item.observedAt ?? undefined,
  }));
  const unique = new Map<string, Source>();
  for (const source of [...lessons, ...practices, ...media, ...sessions, ...comparisons, ...evidence]) {
    unique.set(`${source.kind}:${source.id}`, source);
  }
  return [...unique.values()];
}
function dateTimeLocal(value: number | null) {
  if (value === null) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function mediaTargetChoices(
  workspace: Workspace,
  kind: string,
): Array<[string, string]> {
  if (kind === "assessment")
    return workspace.assessment
      ? [
          [
            workspace.assessment.id,
            workspace.assessment.title || "Current assessment",
          ],
        ]
      : [];
  if (kind === "lesson")
    return (workspace.lessons ?? [])
      .filter((item) => item.status !== "archived")
      .map((item) => [item.id, item.title]);
  if (kind === "practice")
    return (workspace.practiceAssignments ?? [])
      .filter((item) => item.assignment.status !== "retired")
      .map((item) => [item.assignment.id, item.assignment.title]);
  if (kind === "evidence")
    return (workspace.evidenceItems ?? []).map((item) => [item.id, item.title]);
  if (kind === "phase_review")
    return (workspace.phaseReviews ?? [])
      .filter((item) => item.status !== "superseded")
      .map((item) => [item.id, item.title || item.summary || "Phase review"]);
  return [];
}
function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}
function nullable(form: FormData, name: string) {
  return text(form, name) || null;
}
function lines(form: FormData, name: string) {
  return text(form, name)
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}
function dateOrNull(form: FormData, name: string) {
  const value = text(form, name);
  return value ? new Date(value).toISOString() : null;
}
function dateOnlyOrNull(form: FormData, name: string) {
  const value = text(form, name);
  return value ? new Date(`${value}T12:00:00.000Z`).toISOString() : null;
}
function dateRequired(form: FormData, name: string) {
  const value = text(form, name);
  return new Date(value).toISOString();
}
function dateOnlyRequired(form: FormData, name: string) {
  const value = text(form, name);
  return new Date(`${value}T12:00:00.000Z`).toISOString();
}
function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}
function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: undefined,
    timeZone: "UTC",
  }).format(new Date(value));
}
function sessionLabel(session: LaunchSession) {
  return `${formatDate(session.sessionDate)} · ${session.deviceSource}${session.club ? ` · ${session.club}` : ""}`;
}
function newManualMetricDraft(id: number): ManualMetricDraft {
  return {
    id,
    displayName: "",
    canonicalKey: "",
    numericValue: "",
    unit: "",
    direction: "unknown",
  };
}
function manualMetricPayload(metric: ManualMetricDraft) {
  const displayName = metric.displayName.trim();
  return {
    canonicalKey: metric.canonicalKey.trim().toLowerCase(),
    originalName: displayName,
    displayName,
    numericValue: Number(metric.numericValue),
    unit: metric.unit.trim(),
    sourceColumn: null,
    direction: metric.direction,
    golferFacing: true,
  };
}
function duplicateManualMetric(metrics: ManualMetricDraft[]) {
  const canonicalKeys = new Set<string>();
  for (const metric of metrics) {
    const canonicalKey = metric.canonicalKey.trim().toLowerCase();
    if (canonicalKeys.has(canonicalKey)) return metric;
    canonicalKeys.add(canonicalKey);
  }
  return null;
}
function manualMetricDisplayNameId(metricId: number) {
  return `manual-metric-${metricId}-display-name`;
}
function manualMetricCanonicalKeyId(metricId: number) {
  return `manual-metric-${metricId}-canonical-key`;
}
function comparableMetrics(baseline?: LaunchSession, current?: LaunchSession) {
  if (!baseline || !current) return [];
  const currentByKey = new Map(
    current.summaryMetrics.map((metric) => [
      `${metric.canonicalKey}:${metric.unit}`,
      metric,
    ]),
  );
  return baseline.summaryMetrics.flatMap((metric) => {
    const currentMetric = currentByKey.get(
      `${metric.canonicalKey}:${metric.unit}`,
    );
    return currentMetric ? [{ baseline: metric, current: currentMetric }] : [];
  });
}
function metricPairKey(pair: { baseline: Metric; current: Metric }) {
  return `${pair.baseline.id}:${pair.current.id}`;
}
function defaultPairSelection(
  pairs: Array<{ baseline: Metric; current: Metric }>,
) {
  return new Set(pairs.slice(0, 4).map(metricPairKey));
}
function parseCsvReview(value: string, filename: string): CsvReview {
  const records = parseCsv(value);
  if (records.length < 2)
    throw new Error("The CSV must include a header and at least one data row.");
  const headers = records[0]!.map((item) => item.trim());
  if (!headers.every(Boolean) || new Set(headers).size !== headers.length)
    throw new Error("CSV column names must be present and unique.");
  const mappings = Object.fromEntries(
    headers.map((header) => [header, suggestedMapping(header)]),
  );
  return {
    filename,
    headers,
    rows: records.slice(1).filter((row) => row.some((cell) => cell.trim())),
    mappings,
    units: Object.fromEntries(
      headers.map((header) => [
        header,
        mappings[header] ? defaultMetricUnit(mappings[header]!) : "",
      ]),
    ),
    unitConfirmed: Object.fromEntries(headers.map((header) => [header, false])),
    rejected: [],
  };
}
function parseCsv(value: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quoted && character === '"' && value[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && value[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
function suggestedMapping(header: string) {
  const value = header.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const aliases: Record<string, string> = {
    club_speed: "club_speed",
    clubspeed: "club_speed",
    ball_speed: "ball_speed",
    ballspeed: "ball_speed",
    carry: "carry_distance",
    carry_distance: "carry_distance",
    total: "total_distance",
    total_distance: "total_distance",
    launch_angle: "launch_angle",
    spin: "spin_rate",
    spin_rate: "spin_rate",
    smash: "smash_factor",
    smash_factor: "smash_factor",
    attack_angle: "attack_angle",
  };
  return aliases[value] ?? null;
}
async function safeJson(response: Response): Promise<JsonRecord> {
  try {
    return (await response.json()) as JsonRecord;
  } catch {
    return {};
  }
}
function nestedId(body: JsonRecord, field: string): string | null {
  const value = body[field];
  return value && typeof value === "object" && "id" in value && typeof value.id === "string"
    ? value.id
    : null;
}
function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "string" ? [[key, entry]] : [],
    ),
  );
}
function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
function focusMatchesTab(
  focus: CoachingWorkspaceFocus,
  tab: CoachingWorkspaceTab,
): boolean {
  return (
    (focus.kind === "practice" && tab === "practice") ||
    (focus.kind === "lesson" && tab === "lessons") ||
    (focus.kind === "media" && tab === "media") ||
    (focus.kind === "launch_import" && tab === "launch")
  );
}
function apiMessage(body: JsonRecord, status: number) {
  const nested =
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
      ? body.error.message
      : null;
  return (
    nested ??
    (typeof body.error === "string"
      ? body.error
      : typeof body.message === "string"
        ? body.message
        : status === 409
          ? "This plan changed in another session. The latest revision is loading."
          : "The coaching change could not be saved.")
  );
}
function announceError(
  caught: unknown,
  setMessage: (value: string) => void,
  setIsError: (value: boolean) => void,
) {
  setIsError(true);
  setMessage(
    caught instanceof Error
      ? caught.message
      : "The coaching change could not be saved.",
  );
}
