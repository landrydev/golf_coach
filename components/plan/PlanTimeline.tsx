"use client";

import { useMemo, useState } from "react";
import type { PlanViewModel } from "./types";
import styles from "./plan.module.css";

type TimelineItem = NonNullable<PlanViewModel["timeline"]>[number];

export function PlanTimeline({ items }: { items: readonly TimelineItem[] }) {
  const [filter, setFilter] = useState("all");
  const kinds = useMemo(
    () => [...new Set(items.map((item) => item.kind))],
    [items],
  );
  const visible = filter === "all" ? items : items.filter((item) => item.kind === filter);

  return (
    <div className={styles.timelineRegion}>
      <label className={styles.timelineFilter}>
        Show timeline entries
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All coaching activity</option>
          {kinds.map((kind) => (
            <option value={kind} key={kind}>
              {labelForKind(kind)}
            </option>
          ))}
        </select>
      </label>
      <ol className={styles.timeline} aria-live="polite">
        {visible.map((item) => (
          <li key={`${item.kind}:${item.id}`}>
            <span className={styles.timelineMarker} aria-hidden="true" />
            <div>
              <div className={styles.timelineMeta}>
                <span>{labelForKind(item.kind)}</span>
                <time dateTime={new Date(item.occurredAt).toISOString()}>
                  {formatDate(item.occurredAt)}
                </time>
              </div>
              <h3>{item.title}</h3>
              {item.summary ? <p>{item.summary}</p> : null}
              <small>Status: {humanize(item.status)}</small>
            </div>
          </li>
        ))}
      </ol>
      {!visible.length ? (
        <p className={styles.timelineEmpty}>No entries match this timeline filter.</p>
      ) : null}
    </div>
  );
}

function labelForKind(kind: string): string {
  const labels: Record<string, string> = {
    lesson: "Lesson",
    practice: "Practice assignment",
    practice_check_in: "Golfer check-in",
    evidence: "Evidence",
    launch_session: "Launch-monitor session",
    phase_review: "Phase review",
    milestone: "Milestone",
  };
  return labels[kind] ?? humanize(kind);
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
