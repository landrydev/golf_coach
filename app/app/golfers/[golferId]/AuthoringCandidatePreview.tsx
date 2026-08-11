import styles from "../../workspace.module.css";

export type AuthoringCandidate = {
  golferName: string;
  planTitle: string;
  goalStatement: string;
  assessmentSummary: string;
  priorityTitle: string;
  priorityRationale: string;
  phases: ReadonlyArray<{
    number: number;
    title: string;
    purpose: string;
    rationale: string;
    progressSignals: readonly string[];
  }>;
};

export function AuthoringCandidatePreview({
  candidate,
}: {
  candidate: AuthoringCandidate;
}) {
  return (
    <div className={styles.authoringCandidate} aria-label="Unsaved golfer-view candidate">
      <div className={styles.authoringCandidateBar}>
        <span>Roadmap</span>
        <small>Unsaved candidate · not shared</small>
      </div>
      <header className={styles.authoringCandidateHero}>
        <span>{candidate.golferName}&apos;s coaching roadmap</span>
        <h3>{candidate.planTitle || "Untitled roadmap"}</h3>
        <p>{candidate.goalStatement || "Add the golfer's goal to preview it here."}</p>
      </header>
      <nav className={styles.authoringCandidateNav} aria-label="Candidate golfer sections">
        <span>Now</span>
        <span>Goal</span>
        <span>Roadmap</span>
      </nav>
      <section className={styles.authoringCandidateNow}>
        <small>NOW</small>
        <strong>{candidate.priorityTitle || "Current priority"}</strong>
        <p>{candidate.priorityRationale || "Add why this priority comes first."}</p>
      </section>
      <section className={styles.authoringCandidateSection}>
        <small>COACH ASSESSMENT</small>
        <p>{candidate.assessmentSummary || "Add the assessment summary."}</p>
      </section>
      <section className={styles.authoringCandidateSection}>
        <small>DIRECTIONAL ROADMAP</small>
        <ol>
          {candidate.phases.map((phase) => (
            <li key={phase.number}>
              <span>Phase {phase.number}</span>
              <strong>{phase.title || "Untitled phase"}</strong>
              <p>{phase.purpose || "Add the purpose of this phase."}</p>
              {phase.rationale ? <small>{phase.rationale}</small> : null}
              {phase.progressSignals.length ? (
                <ul>
                  {phase.progressSignals.map((signal, index) => (
                    <li key={`${phase.number}-${index}`}>{signal}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      <footer className={styles.authoringCandidateFooter}>
        This preview uses the exact draft words and phase order currently in the form.
        Save the revision before checking media, activity, print, and private delivery.
      </footer>
    </div>
  );
}
