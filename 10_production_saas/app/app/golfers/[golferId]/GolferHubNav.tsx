import styles from "../../workspace.module.css";

type GolferHubNavProps = {
  lessons: number;
  practice: number;
  evidence: number;
  hasReview: boolean;
  hasShareHistory: boolean;
};

const destinations = [
  ["hub-overview", "Overview"],
  ["hub-roadmap", "Roadmap"],
  ["hub-lessons", "Lessons"],
  ["hub-practice", "Practice"],
  ["hub-media", "Media"],
  ["hub-evidence", "Data / Evidence"],
  ["hub-reviews", "Reviews"],
  ["hub-share", "Share"],
] as const;

export function GolferHubNav(props: GolferHubNavProps) {
  const counts: Record<(typeof destinations)[number][0], string | null> = {
    "hub-overview": null,
    "hub-roadmap": null,
    "hub-lessons": String(props.lessons),
    "hub-practice": String(props.practice),
    "hub-media": null,
    "hub-evidence": String(props.evidence),
    "hub-reviews": props.hasReview ? "1" : "0",
    "hub-share": props.hasShareHistory ? "active" : null,
  };

  return (
    <nav className={styles.hubNav} aria-label="Golfer workspace destinations">
      {destinations.map(([id, label]) => (
        <a href={`#${id}`} key={id}>
          <span>{label}</span>
          {counts[id] ? <small>{counts[id]}</small> : null}
        </a>
      ))}
    </nav>
  );
}
