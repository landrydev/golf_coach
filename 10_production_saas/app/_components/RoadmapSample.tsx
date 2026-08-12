const phases = [
  {
    number: "01",
    title: "Start-Line Control",
    body: "Make initial direction more predictable at manageable speed.",
    status: "Recommended now",
  },
  {
    number: "02",
    title: "Playable Driver Pattern",
    body: "Reduce the severe right miss and build one recognizable stock pattern.",
  },
  {
    number: "03",
    title: "On-Course Transfer",
    body: "Test the pattern across targets, pressure, and club-choice decisions.",
  },
  {
    number: "04",
    title: "Scoring Consolidation",
    body: "Compare driver penalties with the rest of the scoring evidence.",
  },
];

export function RoadmapSample() {
  return (
    <article className="sample-board" aria-label="Synthetic input and output example">
      <section className="coach-input" aria-labelledby="coach-input-heading">
        <div className="sample-panel-header">
          <span className="panel-number" aria-hidden="true">A</span>
          <div>
            <p className="panel-kicker">Coach provides</p>
            <h3 id="coach-input-heading">Maya’s assessment</h3>
          </div>
        </div>

        <dl className="input-list">
          <div>
            <dt>Desired outcome</dt>
            <dd>Break 90 often enough that it no longer feels exceptional.</dd>
          </div>
          <div>
            <dt>Strength to preserve</dt>
            <dd>Enough usable distance, with controlled-tempo mid-iron contact.</dd>
          </div>
          <div>
            <dt>Primary pattern</dt>
            <dd>
              At higher speed, the ball can start right and curve farther right.
              Aiming left and slowing down protects some misses but introduces pulls.
            </dd>
          </div>
        </dl>

        <div className="barriers-block">
          <p className="mini-label">Priority barriers</p>
          <ol>
            <li>Unpredictable start direction</li>
            <li>Protective aim-and-speed compensation</li>
            <li>Course transfer not yet proven</li>
          </ol>
        </div>

        <div className="evidence-note">
          <p className="mini-label">Evidence limit</p>
          <p>
            Ten shots are a small sample. No launch-monitor data was collected,
            and on-course penalty frequency is self-reported. This does not
            predict when Mark will break 90.
          </p>
        </div>
      </section>

      <section className="golfer-output" aria-labelledby="golfer-output-heading">
        <div className="sample-panel-header output-header">
          <span className="panel-number panel-number-light" aria-hidden="true">B</span>
          <div>
            <p className="panel-kicker">Golfer sees</p>
            <h3 id="golfer-output-heading">Mark’s development roadmap</h3>
          </div>
          <span className="private-label">Private view</span>
        </div>

        <div className="sample-goal">
          <p className="mini-label">The goal</p>
          <p className="sample-quote">
            “A clearer path to breaking 90—without one or two driver holes
            deciding the round.”
          </p>
        </div>

        <ol className="phase-list">
          {phases.map((phase) => (
            <li key={phase.number} className={phase.status ? "phase-active" : undefined}>
              <span className="phase-list-number">{phase.number}</span>
              <div>
                <div className="phase-title-row">
                  <h4>{phase.title}</h4>
                  {phase.status ? <span>{phase.status}</span> : null}
                </div>
                <p>{phase.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="package-connection">
          <div>
            <p className="mini-label">Connected package</p>
            <h4>Start-Line Control Coaching Phase</h4>
            <p>Three 50-minute sessions · estimated five to seven weeks</p>
          </div>
          <span className="package-arrow" aria-hidden="true">→</span>
        </div>

        <p className="directional-note">
          Future phases may change as Mark’s pattern and on-course evidence change.
        </p>
      </section>
    </article>
  );
}
