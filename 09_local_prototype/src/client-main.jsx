import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './client.css';

const PRIMARY_NAV = [
  ['now', 'Now', '⌂'],
  ['practice', 'Practice', '◎'],
  ['evidence', 'Evidence', '↗'],
  ['lessons', 'Lessons', '▤'],
  ['roadmap', 'Roadmap', '◇'],
];

const SECONDARY_NAV = [
  ['goal', 'My goal', '○'],
  ['review', 'Phase review', '✓'],
  ['milestone', 'Milestone', '✦'],
];

const PHASES = [
  { id: 1, name: 'Start-Line Control', status: 'Current phase', purpose: 'Make initial direction more predictable at manageable speed.', evidence: 'Repeated controlled-practice start window', now: true },
  { id: 2, name: 'Playable Driver Pattern', status: 'Next direction', purpose: 'Reduce the severe right miss and build one recognizable stock pattern.', evidence: 'Mixed-speed and target evidence' },
  { id: 3, name: 'On-Course Transfer', status: 'Directional', purpose: 'Test the pattern across targets, pressure, and club-choice decisions.', evidence: 'On-course observation and decision context' },
  { id: 4, name: 'Scoring Consolidation', status: 'Directional', purpose: 'Compare driver penalties with approach and short-game evidence before choosing the next scoring priority.', evidence: 'Scoring and broader game evidence' },
];

const LESSONS = [
  { id: 1, status: 'Complete', title: 'Define the start window', date: 'August 6', summary: 'Establish a recognizable initial direction at comfortable speed.', observation: 'Mark could identify the intended window and reproduce it intermittently without adding speed.', takeaway: 'See the window first. Speed can wait.', next: 'Complete one controlled ten-ball set before lesson two.' },
  { id: 2, status: 'Complete', title: 'Hold the start window as speed returns', date: 'August 13', summary: 'Test whether initial direction stays recognizable from comfortable toward normal playing speed.', observation: 'The start pattern remained more predictable at moderate speed; severe right starts returned when speed increased quickly.', takeaway: 'Own the window before chasing speed.', next: 'Compare two new eight-to-ten-ball sets before deciding whether to widen speed.' },
  { id: 3, status: 'Next', title: 'Retest and decide the phase', date: 'Planned', summary: 'Review repeated practice evidence and decide whether the controlled objective is complete, extended, or revised.', observation: 'No lesson-three observation exists in this prototype.', takeaway: 'The evidence—not the schedule—will decide what follows.', next: 'Bring two practice sets and one honest on-course note.' },
];

function Tag({ children, tone = '' }) { return <span className={`client-tag ${tone}`}>{children}</span>; }
function Action({ children, onClick, kind = 'primary' }) { return <button className={`client-action ${kind}`} type="button" onClick={onClick}>{children}</button>; }
function SectionTitle({ eyebrow, title, intro }) { return <div className="section-heading"><span>{eyebrow}</span><h1>{title}</h1>{intro && <p>{intro}</p>}</div>; }

function AppShell({ view, setView, children, openProfile }) {
  return <div className="client-app">
    <a href="#client-main" className="client-skip">Skip to coaching plan</a>
    <div className="client-prototype-bar">ASSUMPTION-DRIVEN LOCAL PROTOTYPE — NOT APPROVED · FICTIONAL CLIENT JOURNEY</div>
    <aside className="client-sidebar">
      <button className="coach-brand" onClick={() => setView('now')}><span className="coach-mark">MB</span><span><strong>Bennett Golf Coaching</strong><small>Mark's coaching plan</small></span></button>
      <nav aria-label="Coaching plan">
        <div className="nav-label">Your journey</div>
        {PRIMARY_NAV.map(([id, label, icon]) => <button key={id} onClick={() => setView(id)} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined}><span aria-hidden="true">{icon}</span>{label}</button>)}
        <div className="nav-label secondary-label">More</div>
        {SECONDARY_NAV.map(([id, label, icon]) => <button key={id} onClick={() => setView(id)} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined}><span aria-hidden="true">{icon}</span>{label}</button>)}
      </nav>
      <button className="client-profile" onClick={openProfile}><span>MC</span><span><strong>Mark Chen</strong><small>Start-Line Control</small></span></button>
    </aside>
    <header className="client-mobile-header"><button className="mobile-brand" onClick={() => setView('now')}><span className="coach-mark">MB</span><strong>Bennett Golf Coaching</strong></button><button className="avatar-button" onClick={openProfile}>MC</button></header>
    <main id="client-main" className="client-main" tabIndex="-1">{children}</main>
    <nav className="client-bottom-nav" aria-label="Mobile coaching plan">{PRIMARY_NAV.map(([id,label,icon]) => <button key={id} onClick={()=>setView(id)} className={view===id?'active':''}><span>{icon}</span><small>{label}</small></button>)}</nav>
  </div>;
}

function NowView({ setView, askMaya }) {
  return <div>
    <div className="now-topline"><span>Monday, August 17</span><Tag tone="calm">Updated by Maya · today</Tag></div>
    <SectionTitle eyebrow="Welcome back, Mark" title="Keep the start window predictable before adding speed." intro="You are in Start-Line Control. Lesson 2 of 3 is complete, and your next useful step is one focused practice session." />
    <div className="now-grid">
      <article className="focus-card dark-card"><div className="card-overline">What matters now</div><h2>Own the window before chasing speed.</h2><p>Your recent practice sets show fewer severe right starts. That is an early practice signal, not course transfer.</p><Action onClick={() => setView('practice')}>Open this week's practice</Action><div className="card-foot">30–40 minutes · One session this week</div></article>
      <article className="phase-card"><div className="phase-card-head"><div><span>Current phase</span><h2>Start-Line Control</h2></div><div className="lesson-orbit"><strong>2</strong><span>of 3 lessons</span></div></div><div className="phase-track"><span/><span/><span className="future"/></div><p>Make the driver's initial direction more predictable at manageable speed before adding speed.</p><button onClick={() => setView('roadmap')}>See the full roadmap <span>→</span></button></article>
      <article className="coach-note-card"><div className="maya-row"><span className="maya-avatar">MB</span><div><strong>Maya's note</strong><small>Coach-approved · today</small></div></div><blockquote>“Your recent practice sets show fewer severe right starts. Keep the same window and speed this week; we will retest before changing the task.”</blockquote><button onClick={askMaya}>Ask Maya a question</button></article>
      <article className="evidence-card"><div className="card-overline">Latest meaningful evidence</div><h2>Early practice indication</h2><div className="score-comparison"><div><span>Assessment</span><strong>4 / 3 / 3</strong><small>Playable · Recoverable · Likely penalty</small></div><i>→</i><div><span>Current practice</span><strong>7 / 2 / 1</strong><small>Small controlled set</small></div></div><p>Improved at controlled speed. Full-speed and course transfer are not yet proven.</p><button onClick={() => setView('evidence')}>Review the evidence <span>→</span></button></article>
      <article className="goal-cue-card"><div><div className="card-overline">Your goal</div><h2>Break 90 more consistently</h2><p>Reduce driver penalty holes so the rest of your game can count.</p></div><button onClick={() => setView('goal')}>View goal</button></article>
      <article className="next-check-card"><div className="card-overline">Next check</div><h2>Repeat the pattern across two practice sets.</h2><p>Course transfer follows later. The third lesson will decide whether this phase closes, extends, or changes.</p><div className="mini-actions"><button onClick={() => setView('lessons')}>Read lesson 2</button><button onClick={() => setView('review')}>Preview phase review</button></div></article>
      <article className="journey-more-card"><div><div className="card-overline">Explore the whole plan</div><h2>Goal, phase review, and later milestone context</h2></div><div className="mini-actions"><button onClick={() => setView('goal')}>My goal</button><button onClick={() => setView('review')}>Phase review</button><button onClick={() => setView('milestone')}>Private milestone concept</button></div></article>
    </div>
  </div>;
}

function GoalView({ setView }) {
  return <div className="reading-view">
    <SectionTitle eyebrow="My goal" title="Break 90 often enough that it no longer feels exceptional." intro="This is the outcome Mark and Maya use to judge priorities—not a guaranteed score or timeline." />
    <div className="goal-hero"><div className="goal-number"><span>Typical score</span><strong>94–101</strong><small>Self-reported starting context</small></div><blockquote>“I want competitive rounds with friends to feel enjoyable, without one or two driver holes deciding the day.”</blockquote></div>
    <div className="detail-grid three"><article><span>What gets in the way</span><h2>Three to five driver penalty shots</h2><p>Self-reported in a typical round. One or two holes can decide the day before Mark's iron play matters.</p></article><article><span>Practice reality</span><h2>One focused session most weeks</h2><p>30–45 minutes at the range plus a short pre-round rehearsal. No daily-practice assumption.</p></article><article><span>Playing context</span><h2>15–20 rounds per season</h2><p>Usually with friends, with two weekend trips ahead. Relevant context—not a pressure deadline.</p></article></div>
    <div className="honest-banner"><strong>Honest boundary</strong><p>This coaching plan supports the goal. It does not promise when Mark will break 90 or that one phase will eliminate every right miss.</p></div>
    <div className="page-actions"><Action onClick={() => setView('roadmap')}>See how the roadmap supports this goal</Action><Action kind="quiet" onClick={() => setView('now')}>Back to Now</Action></div>
  </div>;
}

function RoadmapView({ selectedPhase, setSelectedPhase, setView }) {
  const phase = PHASES.find(p => p.id === selectedPhase);
  return <div>
    <SectionTitle eyebrow="Development roadmap" title="A four-phase path, adjusted as evidence develops." intro="Maya's sequence gives the work direction without turning future phases into promises or required purchases." />
    <div className="roadmap-layout"><ol className="roadmap-list">{PHASES.map(p => <li key={p.id}><button onClick={() => setSelectedPhase(p.id)} className={selectedPhase === p.id ? 'selected' : ''}><span className="roadmap-index">0{p.id}</span><span className="roadmap-line"/><span className="roadmap-copy"><small>{p.status}</small><strong>{p.name}</strong><em>{p.purpose}</em></span></button></li>)}</ol>
    <aside className="phase-detail"><Tag tone={phase.now ? 'current' : 'calm'}>{phase.status}</Tag><div className="phase-large-number">0{phase.id}</div><h2>{phase.name}</h2><p>{phase.purpose}</p><div className="detail-rule"><span>Evidence that would matter</span><strong>{phase.evidence}</strong></div>{phase.now ? <><div className="detail-rule"><span>Current priority</span><strong>Keep the start window predictable before adding speed.</strong></div><Action onClick={() => setView('lessons')}>Explore the current phase</Action></> : <p className="directional-note">Directional only. Maya may revise this phase as Mark's pattern and on-course evidence change.</p>}</aside></div>
    <div className="roadmap-boundary">Future phases may change as your pattern and on-course evidence change. No phase implies a guaranteed timeline, score, or purchase.</div>
  </div>;
}

function LessonsView({ lessonId, setLessonId, setView }) {
  const lesson = LESSONS.find(l => l.id === lessonId);
  return <div>
    <SectionTitle eyebrow="Lesson chapters" title="Every lesson adds one clear chapter to the phase." intro="The plan preserves what mattered without becoming a transcript, media archive, or generic drill library." />
    <div className="lesson-layout"><div className="lesson-list">{LESSONS.map(l => <button key={l.id} onClick={() => setLessonId(l.id)} className={lessonId === l.id ? 'selected' : ''}><span className="lesson-count">0{l.id}</span><span><small>{l.status} · {l.date}</small><strong>Lesson {l.id} — {l.title}</strong><em>{l.summary}</em></span></button>)}</div>
    <article className="lesson-detail"><div className="lesson-detail-top"><Tag tone={lesson.status === 'Complete' ? 'current' : 'calm'}>{lesson.status}</Tag><span>{lesson.date}</span></div><h2>Lesson {lesson.id} — {lesson.title}</h2><p className="lesson-purpose">{lesson.summary}</p><section><span>Maya's observation</span><p>{lesson.observation}</p></section><section className="takeaway"><span>Current takeaway</span><blockquote>“{lesson.takeaway}”</blockquote></section><section><span>Next check</span><p>{lesson.next}</p></section><p className="phase-connection">This chapter develops Start-Line Control. It does not yet prove a Playable Driver Pattern on course.</p><div className="page-actions"><Action onClick={() => setView('practice')}>Open practice prescription</Action><Action kind="quiet" onClick={() => setView('now')}>Return to Now</Action></div></article></div>
  </div>;
}

function PracticeView({ checks, toggleCheck, resetChecks, askMaya }) {
  const completed = checks.filter(Boolean).length;
  return <div className="reading-view">
    <SectionTitle eyebrow="This week's practice" title="Repeat a recognizable start window before increasing speed." intro="One focused 30–40 minute session this week. Quality matters more than total swings." />
    <div className="practice-meta"><div><span>Phase</span><strong>Start-Line Control</strong></div><div><span>Cadence</span><strong>3 small sets · Rest between sets</strong></div><div><span>Progress</span><strong>{completed} of 3 steps reviewed</strong></div></div>
    <div className="practice-layout"><ol className="practice-steps">{[
      ['Set the window','Use the start window Maya defined in lesson two. Begin at controlled speed.'],
      ['Build three small sets','Pause between sets. Record playable, recoverable, and likely-penalty starts.'],
      ['Earn the speed increase','Add speed only while the start window remains recognizable. Stop if it does not.']
    ].map(([title,body],i)=><li key={title} className={checks[i]?'checked':''}><button onClick={() => toggleCheck(i)} aria-pressed={checks[i]}><span>{checks[i]?'✓':i+1}</span><span><strong>{title}</strong><em>{body}</em></span></button></li>)}</ol>
    <aside className="practice-aside"><div className="practice-why"><span>Why this matters</span><p>A predictable initial direction is the foundation for reducing the severe right miss.</p></div><div className="success-check"><span>Success check</span><strong>Record the start outcome—not whether every shot was perfect.</strong><p>Playable / recoverable / likely penalty. This remains a small practice sample.</p></div><div className="stop-rule"><span>Stop or ask Maya when</span><p>The task no longer matches her explanation, discomfort occurs, or the severe miss repeats without understanding. Do not improvise more volume.</p></div><button onClick={askMaya}>Ask Maya to clarify</button></aside></div>
    <div className="practice-footer"><p>Prototype interaction only. Reviewing steps does not log practice, save a record, or notify Maya.</p>{completed > 0 && <button onClick={resetChecks}>Reset prototype checklist</button>}</div>
  </div>;
}

function EvidenceBars({ values, labels }) {
  const max = 8;
  return <div className="evidence-bars">{values.map((v,i)=><div key={labels[i]}><span>{labels[i]}</span><div className="bar-track"><i style={{width:`${v/max*100}%`}}/></div><strong>{v}</strong></div>)}</div>;
}

function EvidenceView({ evidenceMode, setEvidenceMode, setView }) {
  return <div>
    <SectionTitle eyebrow="Progress evidence" title="The severe right-start pattern appeared less often in two recent controlled practice sets." intro="Early practice indication · coach observed + small-sample outcome count." />
    <div className="segment-control" aria-label="Evidence view">{[['compare','Compare'],['current','Current'],['mixed','Practice + course']].map(([id,label])=><button key={id} onClick={()=>setEvidenceMode(id)} className={evidenceMode===id?'active':''}>{label}</button>)}</div>
    {evidenceMode === 'compare' && <div className="comparison-panels"><article><Tag>Assessment baseline</Tag><h2>4 playable / 3 recoverable / 3 likely penalty</h2><EvidenceBars values={[4,3,3]} labels={['Playable','Recoverable','Likely penalty']}/><p>Ten-ball assessment set at comfortable and increasing speed.</p></article><article className="current-evidence"><Tag tone="current">Current representative set</Tag><h2>7 playable / 2 recoverable / 1 likely penalty</h2><EvidenceBars values={[7,2,1]} labels={['Playable','Recoverable','Likely penalty']}/><p>One controlled ten-ball practice set. A second small set is directionally similar.</p></article></div>}
    {evidenceMode === 'current' && <article className="evidence-narrative"><div className="evidence-graphic"><span>Controlled-speed start window</span><strong>7 / 2 / 1</strong><small>Playable · Recoverable · Likely penalty</small></div><div><Tag tone="current">Early practice indication</Tag><h2>More predictable at controlled speed.</h2><blockquote>“Start direction is becoming more predictable at controlled speed.”</blockquote><p>— Maya Bennett, fictional coach interpretation</p></div></article>}
    {evidenceMode === 'mixed' && <div className="mixed-evidence"><article><span>What improved in practice</span><h2>Two small sets show fewer severe right starts.</h2><p>Mark can identify and repeat the intended start window more often at controlled speed.</p></article><article className="setback"><span>What has not transferred</span><h2>The latest round still included three right misses and two penalty situations.</h2><p>Golfer-reported. One difficult round does not erase the practice change, but the pattern is not course-ready.</p></article></div>}
    <div className="evidence-limit"><div><span>Maya's interpretation</span><strong>Start direction is becoming more predictable at controlled speed.</strong></div><div><span>What is not proven</span><strong>Full speed, varied targets, course transfer, or a lasting scoring change.</strong></div><div><span>Next evidence needed</span><strong>Another practice set and a later on-course check.</strong></div></div>
    <div className="page-actions"><Action onClick={() => setView('review')}>See what Maya wants checked next</Action><Action kind="quiet" onClick={() => setView('now')}>Return to Now</Action></div>
  </div>;
}

function ReviewView({ step, setStep, choose }) {
  return <div className="reading-view">
    <SectionTitle eyebrow="Phase review · Future synthetic state" title="What changed, what remains uncertain, and what should happen next?" intro="This preview imagines the review after Mark's third Start-Line Control session. No real phase has been completed." />
    <div className="review-tabs">{[['value','1 · Delivered value'],['next','2 · What follows'],['option','3 · Coaching option']].map(([id,label])=><button key={id} onClick={()=>setStep(id)} className={step===id?'active':''}>{label}</button>)}</div>
    {step==='value' && <div className="review-story"><Tag tone="current">Phase complete at the defined practice objective</Tag><h2>Start-Line Control</h2><p className="review-lead">Make the driver's initial direction more predictable at manageable speed before adding speed.</p><div className="review-grid"><article><span>Starting condition</span><strong>4 / 3 / 3 assessment set</strong><p>Best drives playable; severe right start present under speed.</p></article><article><span>Work completed</span><strong>3 coaching sessions · 2 focused practices</strong><p>Repeated start-window observation at controlled and increasing speed.</p></article><article><span>What changed</span><strong>Two controlled sets at 7 / 2 / 1</strong><p>Mark can explain and use the task; severe right starts appeared less often.</p></article><article><span>Reliability</span><strong>Repeated in controlled practice</strong><p>Full-speed and on-course reliability remain unproven.</p></article></div><blockquote>“The start-line objective is repeatable enough in controlled practice to close this phase. It is not yet a course-ready driver pattern.”</blockquote><Action onClick={()=>setStep('next')}>Review Maya's next-phase recommendation</Action></div>}
    {step==='next' && <div className="next-phase-story"><Tag>Remaining opportunity</Tag><h2>Turn a controlled start line into a playable driver pattern at normal speed and varied targets.</h2><div className="next-phase-card"><span>Recommended next phase</span><h3>Playable Driver Pattern</h3><p>Reduce the severe right miss while building one stock pattern Mark can recognize and use.</p><ul><li>Maintain the start window across varied speeds and targets.</li><li>Reduce severe right misses across mixed practice sets.</li><li>Begin testing on course without claiming scoring transfer.</li></ul></div><div className="independent-path"><span>Appropriate alternative</span><strong>Practise independently, then reassess.</strong><p>Two practice sets or four weeks, if Maya considers that safe and appropriate. No purchase is required to keep the completed review useful.</p></div><div className="page-actions"><Action onClick={()=>setStep('option')}>See the Playable Driver Pattern option</Action><Action kind="quiet" onClick={()=>choose('independent')}>Choose independent practice first</Action></div></div>}
    {step==='option' && <div className="renewal-option"><div className="option-summary"><Tag>Synthetic coach offer</Tag><h2>Playable Driver Pattern Coaching Phase</h2><div className="option-price">CAD $745</div><p>Four coaching sessions over an estimated seven to nine weeks. No automatic renewal.</p></div><div className="option-detail"><h3>Included</h3><ul><li>Four coaching sessions</li><li>One focused practice direction after each session</li><li>Mixed-speed and target evidence selected by Maya</li><li>One course-transfer check where feasible</li><li>End-of-phase review</li></ul><p>Repeated coached variation and review do not guarantee a score or eliminate every right miss.</p><div className="page-actions"><Action onClick={()=>choose('booking')}>Preview existing booking handoff</Action><Action kind="quiet" onClick={()=>choose('ask')}>Ask Maya</Action><Action kind="quiet" onClick={()=>choose('later')}>Review later</Action></div></div></div>}
  </div>;
}

function MilestoneView({ choose }) {
  return <div className="reading-view milestone-view">
    <SectionTitle eyebrow="Later private milestone concept · Synthetic" title="89 — your first sub-90 round in this journey." intro="This imagined future milestone is private by default and is not a real result, testimonial, or product outcome." />
    <div className="milestone-hero"><div className="score-89">89<span>Fictional recorded score</span></div><div><Tag tone="current">A milestone in your development journey</Tag><h2>Your driver stayed playable enough for your scoring strengths to count.</h2><blockquote>“It is one round, not proof that the pattern is permanent, but it is the on-course outcome we have been building toward.”</blockquote><p>— Maya Bennett, fictional coach recognition</p></div></div>
    <div className="milestone-evidence"><article><span>Before</span><strong>94–101</strong><p>Typical score · 3–5 self-reported driver penalties</p></article><i>→</i><article><span>This round</span><strong>89</strong><p>0 driver penalty shots reported by Mark</p></article></div>
    <div className="honest-banner"><strong>Evidence and limit</strong><p>A fictional scorecard supports 89. Penalty attribution is Mark-reported. This is one round and does not imply permanent scoring or driver-pattern change.</p></div>
    <div className="page-actions"><Action onClick={()=>choose('private')}>Save to my private journey</Action><Action kind="quiet" onClick={()=>choose('share')}>Choose whether to share</Action><Action kind="quiet" onClick={()=>choose('later')}>Not now</Action></div>
  </div>;
}

function Modal({ type, close }) {
  const copy = {
    profile: ['Mark Chen','Fictional golfer · 19 handicap · Start-Line Control','This prototype contains no real profile, account, access, or saved client record.'],
    ask: ['Ask Maya a question','Nothing will be composed or sent.','In a future approved experience, Mark could ask for clarification while keeping the current phase context.'],
    booking: ['Existing booking handoff preview','Nothing was booked or charged.','A real experience would leave Roadmap for Maya’s current booking or payment process after a clear warning.'],
    independent: ['Independent practice first','No renewal was selected.','Mark can practise the approved task and reassess after two practice sets or four weeks.'],
    later: ['Review later','No reminder was scheduled and nothing was saved.','There is no countdown, reservation, or price-pressure message.'],
    private: ['Private milestone preview','Nothing was saved.','The milestone remains valuable without sharing. Real private storage and access rules are not defined.'],
    share: ['Sharing remains off','Nothing is shared yet.','A future design would require granular selection, complete preview, audience rules, and qualified privacy review before any action.'],
  }[type] || ['Prototype action','Nothing happened.','This interaction is simulated.'];
  return <div className="client-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="client-modal"><Tag>Prototype only</Tag><h2 id="modal-title">{copy[0]}</h2><strong>{copy[1]}</strong><p>{copy[2]}</p><div className="modal-notice">Nothing was created, saved, sent, booked, shared, or charged.</div><Action onClick={close}>Return to the coaching plan</Action></div></div>;
}

function ClientApp() {
  const [view, setView] = useState('now');
  const [phase, setPhase] = useState(1);
  const [lesson, setLesson] = useState(2);
  const [checks, setChecks] = useState([false,false,false]);
  const [evidenceMode, setEvidenceMode] = useState('compare');
  const [reviewStep, setReviewStep] = useState('value');
  const [modal, setModal] = useState(null);
  const content = useMemo(() => ({
    now: <NowView setView={setView} askMaya={()=>setModal('ask')}/>,
    goal: <GoalView setView={setView}/>,
    roadmap: <RoadmapView selectedPhase={phase} setSelectedPhase={setPhase} setView={setView}/>,
    lessons: <LessonsView lessonId={lesson} setLessonId={setLesson} setView={setView}/>,
    practice: <PracticeView checks={checks} toggleCheck={i=>setChecks(c=>c.map((v,x)=>x===i?!v:v))} resetChecks={()=>setChecks([false,false,false])} askMaya={()=>setModal('ask')}/>,
    evidence: <EvidenceView evidenceMode={evidenceMode} setEvidenceMode={setEvidenceMode} setView={setView}/>,
    review: <ReviewView step={reviewStep} setStep={setReviewStep} choose={setModal}/>,
    milestone: <MilestoneView choose={setModal}/>,
  }), [view, phase, lesson, checks, evidenceMode, reviewStep]);
  return <AppShell view={view} setView={setView} openProfile={()=>setModal('profile')}>{content[view]}{modal && <Modal type={modal} close={()=>setModal(null)}/>}</AppShell>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><ClientApp/></React.StrictMode>);
