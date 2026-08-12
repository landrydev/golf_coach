"use client";

import { useState } from "react";
import styles from "./demo.module.css";

type View = "now" | "practice" | "evidence" | "journey";

export function DemoExperience() {
  const [view, setView] = useState<View>("now");
  const [checkIn, setCheckIn] = useState<"none" | "completed" | "help">("none");
  const [comparison, setComparison] = useState<"baseline" | "current">("current");
  const [timelineFilter, setTimelineFilter] = useState("all");

  function reset() {
    setView("now");
    setCheckIn("none");
    setComparison("current");
    setTimelineFilter("all");
  }

  return (
    <div className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <span>Fictional golfer · Mark Chen</span>
          <h1>A calm view of what matters now.</h1>
          <p>
            This resettable example shows realistic coach-authored records across two phases.
            It does not prescribe instruction or promise improvement.
          </p>
        </div>
        <button type="button" onClick={reset}>Reset demo</button>
      </header>

      <nav className={styles.tabs} aria-label="Synthetic roadmap sections">
        {(["now", "practice", "evidence", "journey"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)}>
            {item === "now" ? "Now" : item === "practice" ? "Practice" : item === "evidence" ? "Media & data" : "Journey"}
          </button>
        ))}
      </nav>

      {view === "now" ? (
        <section className={styles.panel} aria-labelledby="demo-now-heading">
          <div className={styles.sectionHeading}>
            <span>Phase 2 of 3 · Current</span>
            <h2 id="demo-now-heading">Carry the contact pattern into variable targets.</h2>
            <p>
              Coach Rowan selected this priority after two lessons, two practice assignments,
              Mark’s check-in, one swing comparison, and a small launch-monitor sample.
            </p>
          </div>
          <div className={styles.nowGrid}>
            <article>
              <span>Current practice</span>
              <h3>Three-target start-line ladder</h3>
              <p>Two short sets of nine balls. Stop if the cue becomes forced.</p>
              <button type="button" onClick={() => setView("practice")}>Open drill</button>
            </article>
            <article>
              <span>Coach’s next check</span>
              <h3>Observe start line under a changed target.</h3>
              <p>No score or permanent-change claim is inferred from this practice sample.</p>
              <button type="button" onClick={() => setView("evidence")}>See selected evidence</button>
            </article>
          </div>
          <ol className={styles.phases}>
            <li data-state="complete"><b>01</b><div><small>Complete</small><strong>Establish a repeatable contact reference</strong></div></li>
            <li data-state="active"><b>02</b><div><small>Current</small><strong>Transfer the reference across targets</strong></div></li>
            <li><b>03</b><div><small>Planned</small><strong>Test the pattern in on-course decisions</strong></div></li>
          </ol>
        </section>
      ) : null}

      {view === "practice" ? (
        <section className={styles.panel} aria-labelledby="demo-practice-heading">
          <div className={styles.sectionHeading}>
            <span>Editable drill example · not universal instruction</span>
            <h2 id="demo-practice-heading">Three-target start-line ladder</h2>
            <p>Chosen by the fictional coach for this fictional phase. A real coach would customize or replace it.</p>
          </div>
          <div className={styles.drillGrid}>
            <div><b>Purpose</b><p>Notice whether the starting direction stays available as the target changes.</p></div>
            <div><b>Equipment</b><p>Seven iron, nine balls, three safe range targets.</p></div>
            <div><b>Setup</b><p>Use the same pre-shot reference; rotate targets every three balls.</p></div>
            <div><b>Dosage</b><p>Two sets. Pause between sets and note only the clearest pattern.</p></div>
            <div><b>Success check</b><p>At least one clear start-line read at each target—not a score promise.</p></div>
            <div><b>Stop / ask rule</b><p>Stop if discomfort appears or the cue becomes more important than the shot.</p></div>
          </div>
          <ol className={styles.steps}>
            <li>Choose a safe left, centre, and right target.</li>
            <li>Hit three shots to each, preserving the same preparation.</li>
            <li>Record which target made the start line easiest to read.</li>
          </ol>
          <div className={styles.demoCheckIn}>
            <strong>Try the bounded golfer check-in</strong>
            <div>
              <button type="button" aria-pressed={checkIn === "completed"} onClick={() => setCheckIn("completed")}>Completed · about right</button>
              <button type="button" aria-pressed={checkIn === "help"} onClick={() => setCheckIn("help")}>Not completed · request help</button>
            </div>
            <p role="status">{checkIn === "none" ? "No synthetic response selected." : checkIn === "completed" ? "Synthetic check-in recorded in this browser view only." : "Synthetic help request selected. Roadmap has not sent a message."}</p>
          </div>
        </section>
      ) : null}

      {view === "evidence" ? (
        <section className={styles.panel} aria-labelledby="demo-evidence-heading">
          <div className={styles.sectionHeading}>
            <span>Coach-selected evidence · exact units preserved</span>
            <h2 id="demo-evidence-heading">A small comparison, not a data dump.</h2>
            <p>Coach interpretation: this limited range sample supports checking start line again under variable targets.</p>
          </div>
          <div className={styles.mediaCompare}>
            <div className={styles.mediaFrame}>
              {/* Public synthetic SVGs contain no real golfer data. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={comparison === "baseline" ? "/synthetic-swing-baseline.svg" : "/synthetic-swing-current.svg"} alt={`${comparison === "baseline" ? "Baseline" : "Current"} abstract down-the-line synthetic swing illustration`} />
            </div>
            <div>
              <span>Synthetic swing-image pair</span>
              <h3>{comparison === "baseline" ? "Baseline · Apr 12" : "Current · May 24"}</h3>
              <p>Coach context: compare the setup reference only. Roadmap does not infer or diagnose a movement pattern.</p>
              <div className={styles.toggle}>
                <button type="button" aria-pressed={comparison === "baseline"} onClick={() => setComparison("baseline")}>Baseline</button>
                <button type="button" aria-pressed={comparison === "current"} onClick={() => setComparison("current")}>Current</button>
              </div>
            </div>
          </div>
          <div className={styles.metrics}>
            <article><span>Carry</span><strong>142 → 148 yd</strong><small>+6 yd · same stored unit</small></article>
            <article><span>Launch angle</span><strong>15.1 → 15.8°</strong><small>+0.7° · same stored unit</small></article>
            <article><span>Sample</span><strong>8 → 9 shots</strong><small>Limited synthetic range sets</small></article>
          </div>
          <p className={styles.limit}>Limitation: different days and small samples; this comparison is not proof of an on-course outcome.</p>
        </section>
      ) : null}

      {view === "journey" ? (
        <section className={styles.panel} aria-labelledby="demo-journey-heading">
          <div className={styles.sectionHeading}>
            <span>Living journey</span>
            <h2 id="demo-journey-heading">The evidence behind a phase decision.</h2>
          </div>
          <label className={styles.filter}>Filter entries
            <select value={timelineFilter} onChange={(event) => setTimelineFilter(event.target.value)}>
              <option value="all">All activity</option>
              <option value="lesson">Lessons</option>
              <option value="practice">Practice</option>
              <option value="evidence">Evidence and review</option>
            </select>
          </label>
          <ol className={styles.timeline}>
            {timeline.filter((item) => timelineFilter === "all" || item.group === timelineFilter).map((item) => (
              <li key={item.date + item.title}><time>{item.date}</time><div><small>{item.kind}</small><h3>{item.title}</h3><p>{item.summary}</p></div></li>
            ))}
          </ol>
          <article className={styles.review}>
            <span>Phase 1 review · advanced</span>
            <h3>Enough repeated evidence to change the next question.</h3>
            <p>Sources selected: lessons 1–2, practice assignments 1–2, golfer check-in, baseline/current image pair, and one limited launch session.</p>
            <small>Uncertainty retained: on-course transfer has not yet been observed.</small>
          </article>
        </section>
      ) : null}

      <footer className={styles.footer}>
        <p>This demo resets locally and saves nothing. A real private roadmap is coach-authored, access-controlled, and revocable.</p>
        <a href="/auth/login?return_to=%2Fapp">Open the real coach workspace</a>
      </footer>
    </div>
  );
}

const timeline = [
  { date: "Apr 12", group: "lesson", kind: "Lesson", title: "Starting assessment", summary: "Coach recorded the goal, starting point, strengths, and evidence limits." },
  { date: "Apr 18", group: "practice", kind: "Practice", title: "Low-tee contact gate", summary: "First assignment completed; the golfer reported appropriate difficulty." },
  { date: "May 03", group: "lesson", kind: "Lesson", title: "Contact reference follow-up", summary: "Golfer learning and the coach’s next check were retained." },
  { date: "May 10", group: "practice", kind: "Check-in", title: "Second assignment needed help", summary: "The bounded request-help state became selected review context." },
  { date: "May 24", group: "evidence", kind: "Media and data", title: "Current evidence recorded", summary: "Two selected metrics and a current synthetic swing image were paired with limitations." },
  { date: "May 26", group: "evidence", kind: "Phase review", title: "Advance to variable targets", summary: "The coach advanced the plan and published the next phase after review." },
];
