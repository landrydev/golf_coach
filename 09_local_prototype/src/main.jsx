import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const FRAME_GROUPS = [
  { label: 'Acquisition', ids: ['ACQ-01', 'ACQ-02', 'ACQ-03', 'ACQ-04', 'ACQ-05', 'ACQ-06'] },
  { label: 'Instructor activation', ids: ['ACT-01', 'ACT-02', 'ACT-03', 'ACT-04', 'ACT-05', 'ACT-06', 'ACT-07', 'ACT-08', 'ACT-09', 'ACT-10'] },
  { label: 'Golfer roadmap', ids: ['GOL-01', 'GOL-02', 'GOL-03', 'GOL-04', 'GOL-05', 'GOL-06', 'GOL-07', 'GOL-08'] },
  { label: 'Alternate states', ids: ['ST-01', 'ST-02', 'ST-03', 'ST-04', 'ST-05', 'ST-06', 'ST-07', 'ST-08', 'ST-09', 'ST-10'] },
];

const TITLES = {
  'ACQ-01': 'Landing promise', 'ACQ-02': 'Problem and explanation', 'ACQ-03': 'Synthetic sample',
  'ACQ-04': 'Compatibility and preparation', 'ACQ-05': 'Solo pricing and FAQ', 'ACQ-06': 'Simulated signup',
  'ACT-01': 'Coach identity', 'ACT-02': 'Lesson package', 'ACT-03': 'First golfer',
  'ACT-04': 'Starting assessment', 'ACT-05': 'Development phases', 'ACT-06': 'Golfer preview',
  'ACT-07': 'Share review', 'ACT-08': 'Simulated success', 'ACT-09': 'Your roadmaps', 'ACT-10': 'Account concepts',
  'GOL-01': 'Private welcome', 'GOL-02': 'Desired outcome', 'GOL-03': 'Starting point',
  'GOL-04': 'Most important barriers', 'GOL-05': 'Development roadmap', 'GOL-06': 'Recommended first phase',
  'GOL-07': 'Coaching package', 'GOL-08': 'Clear next action',
  'ST-01': 'Sample media unavailable', 'ST-02': 'No logo', 'ST-03': 'Invalid package link',
  'ST-04': 'Optional evidence absent', 'ST-05': 'No recommendation', 'ST-06': 'Preview blocker',
  'ST-07': 'Share failed', 'ST-08': 'Seasonal pause', 'ST-09': 'Cancellation', 'ST-10': 'Unauthorized access',
};

const SEQUENTIAL_NEXT = {
  'ACQ-01': 'ACQ-03', 'ACQ-02': 'ACQ-03', 'ACQ-03': 'ACQ-04', 'ACQ-04': 'ACQ-05', 'ACQ-05': 'ACQ-06', 'ACQ-06': 'ACT-01',
  'ACT-01': 'ACT-02', 'ACT-02': 'ACT-03', 'ACT-03': 'ACT-04', 'ACT-04': 'ACT-05', 'ACT-05': 'ACT-06', 'ACT-06': 'ACT-07', 'ACT-07': 'ACT-08',
  'ACT-08': 'GOL-01', 'ACT-09': 'ACT-06', 'GOL-01': 'GOL-02', 'GOL-02': 'GOL-03', 'GOL-03': 'GOL-04', 'GOL-04': 'GOL-05',
  'GOL-05': 'GOL-06', 'GOL-06': 'GOL-07', 'GOL-07': 'GOL-08',
};

const CTA_LABELS = {
  'ACQ-01': 'See a sample roadmap', 'ACQ-02': 'See how the input becomes the roadmap', 'ACQ-03': 'Create one for a golfer',
  'ACQ-04': 'See pricing', 'ACQ-05': 'Start a 14-day trial', 'ACQ-06': 'Create my prototype account',
  'ACT-01': 'Save and set up my package', 'ACT-02': 'Save package and add my first golfer', 'ACT-03': 'Add the starting assessment',
  'ACT-04': 'Build the roadmap phases', 'ACT-05': 'Preview the golfer roadmap', 'ACT-06': 'Review sharing',
  'ACT-07': 'Simulate sharing', 'ACT-08': 'View prototype roadmap', 'ACT-09': "View Mark's roadmap",
  'GOL-01': 'See your goal', 'GOL-02': 'See your starting point', 'GOL-03': 'See the barriers',
  'GOL-04': 'See the development roadmap', 'GOL-05': 'Explore Phase 1', 'GOL-06': 'See the coaching package',
  'GOL-07': 'Review how to begin',
};

const NOTICE = 'Visual prototype — nothing will be created, saved, sent, booked, paused, cancelled, or charged.';
const SYNTHETIC = 'Fictional example. Maya Bennett, Mark Chen, all coaching content, prices, evidence, and outcomes are synthetic and are not customer results.';

function Button({ children, onClick, kind = 'primary', className = '' }) {
  return <button type="button" className={`button ${kind} ${className}`} onClick={onClick}>{children}</button>;
}

function Tag({ children, tone = 'quiet' }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

function Notice({ compact = false }) {
  return <div className={`prototype-notice ${compact ? 'compact' : ''}`} role="note">{compact ? 'Prototype only · No real account or action' : NOTICE}</div>;
}

function Section({ title, children, className = '' }) {
  return <section className={`content-section ${className}`}><h2>{title}</h2>{children}</section>;
}

function List({ items, ordered = false }) {
  const El = ordered ? 'ol' : 'ul';
  return <El className="clean-list">{items.map((item, index) => <li key={index}>{item}</li>)}</El>;
}

function DataField({ label, value, note }) {
  return <div className="data-field"><span className="field-label">{label}</span><div className="field-value">{value}</div>{note && <small>{note}</small>}</div>;
}

function Phase({ number, title, text, current }) {
  return <li className={`phase ${current ? 'current' : ''}`}>
    <span className="phase-number">{String(number).padStart(2, '0')}</span>
    <div><div className="phase-title">{title} {current && <Tag tone="success">Recommended now</Tag>}</div><p>{text}</p></div>
  </li>;
}

function FakeMedia({ unavailable = false }) {
  return <div className={`fake-media ${unavailable ? 'unavailable' : ''}`} role="img" aria-label={unavailable ? 'Sample media unavailable' : 'Abstract fictional driver clip placeholder'}>
    <div className="media-grid" />
    <div className="media-label">{unavailable ? 'Media unavailable' : 'Fictional clip · Playable start'}</div>
    <p>{unavailable ? 'The complete text assessment remains available.' : 'Abstract placeholder — not real swing evidence'}</p>
  </div>;
}

function Landing({ go }) {
  return <>
    <div className="hero-grid">
      <div>
        <div className="eyebrow">For independent golf instructors across Canada</div>
        <h1>Sell the plan, not another hour.</h1>
        <p className="lead">Turn an assessment into a personalized, coach-branded development roadmap that helps a golfer understand what comes first, why it matters, and which lesson package fits—using the coaching tools and methods you already trust.</p>
        <div className="actions"><Button onClick={() => go('ACQ-03')}>See a sample roadmap</Button><Button kind="secondary" onClick={() => go('ACQ-06')}>Start a 14-day trial</Button></div>
        <p className="reassurance">No sales call. No setup fee. No new coaching methodology. Start with one real assessment and one current lesson package.</p>
      </div>
      <div className="roadmap-preview" aria-label="Mark's fictional roadmap preview">
        <Tag>Fictional sample</Tag><div className="preview-brand">Bennett Golf Coaching</div><h2>Mark's development roadmap</h2>
        <div className="preview-row"><span>Goal</span><strong>Break 90 more consistently</strong></div>
        <div className="preview-row"><span>Starting point</span><strong>Driver start direction</strong></div>
        <div className="preview-row"><span>First phase</span><strong>Start-Line Control</strong></div>
        <div className="preview-row"><span>Connected package</span><strong>3 coaching sessions</strong></div>
        <small>{SYNTHETIC}</small>
      </div>
    </div>
  </>;
}

function Acquisition({ id, go }) {
  if (id === 'ACQ-01') return <Landing go={go} />;
  if (id === 'ACQ-02') return <>
    <div className="eyebrow">How it works</div><h1>A good assessment can still end with an unclear next step.</h1>
    <p className="lead">The instructor may see the pattern clearly, while the golfer leaves with separate notes, clips, numbers, and advice—and no persuasive picture of why structured coaching should continue.</p>
    <p className="callout">Roadmap turns the instructor's existing evidence into one clear development story and an appropriate first-phase recommendation.</p>
    <div className="step-grid">
      <article><span>01</span><h2>Add your coaching judgment</h2><p>Record the golfer's goal, your starting assessment, the priority barriers, and only the evidence that helps explain the decision.</p></article>
      <article><span>02</span><h2>Shape the development roadmap</h2><p>Define three or four directional phases, choose what comes first, and connect it to a lesson package you already sell.</p></article>
      <article><span>03</span><h2>Preview and share</h2><p>Review exactly what the golfer will receive, then direct them to your existing booking, purchase, or contact process.</p></article>
    </div>
  </>;
  if (id === 'ACQ-03') return <>
    <div className="eyebrow">Fictional sample · Mark Chen</div><h1>From “my driver costs me the round” to a credible first phase.</h1>
    <p className="lead">Maya's assessment identifies usable distance, an unpredictable right-start pattern, and a protective compensation. The roadmap explains why start direction comes first and how a three-session phase supports that work.</p>
    <div className="sample-grid"><FakeMedia /><div className="mapping">
      <div><span>Coach provides</span><strong>Goal and why it matters</strong><em>Golfer sees</em><p>A personal outcome that leads the story</p></div>
      <div><span>Coach provides</span><strong>Strength, pattern, and barriers</strong><em>Golfer sees</em><p>An honest starting point with evidence limits</p></div>
      <div><span>Coach provides</span><strong>Three or four directional phases</strong><em>Golfer sees</em><p>A credible path without a guaranteed timeline</p></div>
      <div><span>Coach provides</span><strong>First-phase rationale and current package</strong><em>Golfer sees</em><p>A clear recommendation, terms, and next choices</p></div>
    </div></div>
    <p className="reassurance">The standard flow asks for short coach-owned judgments. Video, launch-monitor data, custom design, and a founder-built report are not required.</p>
  </>;
  if (id === 'ACQ-04') return <>
    <div className="eyebrow">Compatibility</div><h1>Keep the tools and coaching method that already work.</h1>
    <div className="two-column"><Section title="Works above"><List items={['Your assessment and lesson workflow','Swing video or video-analysis tools','Launch-monitor measurements when useful','Booking and payment links','Email, text, or your normal client communication']} /></Section>
    <Section title="Does not replace"><List items={['Your coaching judgment or methodology','Booking or payment processing','Swing analysis','Client messaging','A complete CRM or academy-management system']} /></Section></div>
    <Section title="You need three things for the first roadmap." className="soft-panel"><List ordered items={["A golfer's desired outcome.",'Your starting assessment and most important barriers.','One current lesson package and the link or contact route you already use.']} /><p>A logo, swing video, launch data, measurements, and detailed biography can be skipped.</p></Section>
  </>;
  if (id === 'ACQ-05') return <>
    <div className="eyebrow">Simple starting point</div><h1>One plan for an independent instructor.</h1>
    <div className="pricing-layout"><article className="price-card"><Tag tone="attention">Working price hypothesis</Tag><h2>Solo Instructor</h2><div className="price">CAD $75 <small>/ month per instructor</small></div><div className="classification">[PRICING HYPOTHESIS — REQUIRES VALIDATION]</div>
      <List items={['One coach identity with standard branding','Standard roadmap templates and prompts','Unlimited roadmaps and active golfer records for ordinary solo use','One or more current package links','Golfer preview and sharing concept','Progress and renewal deliverables when validated']} />
      <p>No setup fee. No sales call. No long contract. Cancel month to month under the displayed prototype policy.</p>
      <p>Try the complete first-roadmap flow for 14 days. No card in this prototype. Continuing to a paid plan requires an explicit choice.</p>
      <div className="season-line"><strong>CAD $15/month read-only pause for up to six months</strong><span>[PRICING HYPOTHESIS — REQUIRES VALIDATION]</span></div>
      <small>Prototype policy only. Exact access, billing, retention, golfer-link, reminder, and resume behavior is not approved.</small>
    </article><div className="faq"><h2>Frequently asked</h2>{[
      ['What will this help me sell?','It helps a golfer understand why a structured first coaching phase and its connected lesson package make sense after an assessment. It does not guarantee a sale.'],
      ['Do I have to change my coaching method?','No. You provide and approve the goal, assessment, barriers, phases, evidence, progress signals, and package fit. The product organizes your judgment; it does not diagnose or coach the golfer.'],
      ['Do I need a launch monitor or swing video?','No. A concise coach-observation version must remain credible.'],
      ['Does Roadmap handle booking or payment?','No. Add the existing booking, purchase, or contact link you already use.'],
      ['Can I cancel when my season ends?','The initial concept is month to month with easy cancellation and an optional read-only seasonal pause. Exact policy and data access still require review.']
    ].map(([q,a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></div>
  </>;
  return <>
    <Notice compact /><div className="eyebrow">Start with one assessment and one package</div><h1>Create your first golfer roadmap</h1>
    <p className="lead">You can skip optional branding, video, and measurements.</p>
    <div className="form-grid"><DataField label="Your name" value="Maya Bennett" note="Required"/><DataField label="Work email" value="maya@example.invalid" note="Synthetic invalid-domain address"/><DataField label="Create a password" value="••••••••••••" note="Visual state only"/><DataField label="How did you hear about Roadmap?" value="Instructor community" note="Optional"/></div>
    <p className="legal-note">By continuing in this visual prototype, you acknowledge that no account, trial, or legal agreement is created. Live terms and privacy language require separate review.</p>
    <p className="classification">[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month after the candidate trial, only after an explicit paid choice</p>
  </>;
}

const coachFields = [
  ['Coach display name','Maya Bennett','Required'],['Business name','Bennett Golf Coaching','Optional'],['Role','Independent golf instructor','Optional'],['Contact label','Ask Maya a question','Required for fictional path'],['Logo','No logo added','Optional · safe text identity'],['Brand accent','Evergreen','Optional constrained choice']
];
const packageFields = [
  ['Package name','Start-Line Control Coaching Phase','Required'],['Purpose','Establish, practise, and review a more predictable driver start line before adding speed or course variability.','Required'],['Includes','Three 50-minute sessions; one focused practice direction after each session; selected evidence; end-of-phase review.','Required'],['Price','CAD $595 plus applicable tax','[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]'],['Timing','Estimated five to seven weeks','Optional'],['Current terms',"Use within eight weeks; 24 hours' notice for rescheduling.",'Fictional prototype terms'],['Next-action label',"Continue to Maya's booking page",'Required'],['Existing link','https://example.invalid/start-line-control','Synthetic non-operational link']
];

function Activation({ id, go, setStatus }) {
  if (id === 'ACT-01') return <><div className="eyebrow">Setup 1 of 5 · Coach identity</div><h1>Start with the identity your golfer should recognize.</h1><p className="lead">Your name is enough to continue. A logo and accent colour are optional, and the standard presentation remains complete without them.</p><div className="form-grid">{coachFields.map(([l,v,n])=><DataField key={l} label={l} value={v} note={n}/>)}</div><div className="identity-preview"><span>Golfer identity preview</span><strong>Prepared for Mark Chen by Maya Bennett</strong><p>Bennett Golf Coaching</p></div></>;
  if (id === 'ACT-02') return <><div className="eyebrow">Setup 2 of 5 · Lesson package</div><h1>Connect the first coaching phase to a package you already sell.</h1><p className="lead">Roadmap presents your recommendation. Your existing booking, purchase, or contact process handles the next step.</p><div className="form-grid">{packageFields.map(([l,v,n])=><DataField key={l} label={l} value={v} note={n}/>)}</div><p className="boundary">No payment or booking happens in Roadmap. The prototype stops before any external transaction.</p></>;
  if (id === 'ACT-03') return <><div className="eyebrow">Setup 3 of 5 · First golfer</div><h1>Begin with the outcome that should guide the roadmap.</h1><p className="lead">Add only the golfer information needed to make the roadmap personal and understandable.</p><div className="form-grid"><DataField label="Golfer display name" value="Mark Chen" note="Required synthetic identity"/><DataField label="Desired outcome" value="Break 90 often enough that it no longer feels exceptional." note="Required"/><DataField label="Why it matters" value="Competitive rounds with friends should feel enjoyable without one or two driver holes deciding the day." note="Optional but included"/><DataField label="Typical score" value="94–101" note="Optional self-reported context"/><DataField label="Practice reality" value="One focused 30–45 minute range session most weeks plus a short pre-round rehearsal." note="Optional"/><DataField label="Upcoming context" value="Two weekend trips in the next three months." note="Optional · never urgency"/></div><p className="boundary">Synthetic prototype data only. Live consent, identity, access, retention, and deletion rules require qualified review.</p></>;
  if (id === 'ACT-04') return <><div className="eyebrow">Setup 4 of 5 · Starting assessment</div><h1>Capture the few observations that explain what comes first.</h1><Section title="Strength"><p>Mark's best drives provide enough usable distance for his scoring goal, and his controlled-tempo mid-iron contact is a strength to preserve.</p></Section><Section title="Primary pattern"><p>At comfortable speed, several drives start in a usable window. As speed rises, the ball can start right and curve farther right. Aiming left and slowing down protects some right misses but introduces pulls.</p></Section><div className="two-column"><Section title="Priority barriers"><List ordered items={['Unpredictable start direction','Protective aim-and-speed compensation','Course transfer not yet proven']} /></Section><Section title="Optional evidence"><List items={['Coach observation during the assessment','Two fictional representative clips','Ten-ball note: 4 playable · 3 recoverable · 3 likely penalty','Golfer report: 3–5 driver penalty shots in a typical round']} /></Section></div><p className="boundary">Ten shots are a small sample. No launch-monitor data was collected. On-course penalty frequency is self-reported. This evidence does not predict when Mark will break 90.</p></>;
  if (id === 'ACT-05') return <><div className="eyebrow">Setup 5 of 5 · Development phases</div><h1>Show the sequence, then make the first phase clear.</h1><ol className="phase-list"><Phase number={1} title="Start-Line Control" current text="Make initial direction more predictable at manageable speed."/><Phase number={2} title="Playable Driver Pattern" text="Reduce the severe right miss and develop one recognizable stock pattern."/><Phase number={3} title="On-Course Transfer" text="Test the pattern across targets, pressure, and club-choice decisions."/><Phase number={4} title="Scoring Consolidation" text="Compare driver penalties with approach and short-game evidence before choosing the next scoring priority."/></ol><div className="two-column"><Section title="Why the first phase leads"><p>A more predictable start gives Maya and Mark a stable pattern to evaluate before speed and course variability are added.</p></Section><Section title="Progress signals"><List items={['Mark can explain the task in his own words.',"More shots begin within Maya's defined start window across repeated controlled sets.",'Severe right starts occur less often in that context.']} /></Section></div><div className="package-strip"><strong>Start-Line Control Coaching Phase · Three sessions</strong><span>[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW] CAD $595 plus applicable tax</span></div><p className="reassurance">Future phases may change as Mark's pattern and on-course evidence change.</p></>;
  if (id === 'ACT-06') return <><div className="eyebrow">Golfer preview · Complete for prototype review</div><h1>Review exactly what Mark will receive.</h1><div className="preview-review"><div><h2>Review checklist</h2><List items={['Goal and personal reason confirmed','Strength, pattern, evidence, and limitations reviewed','Barrier order and four directional phases reviewed','Start-Line Control selected and explained','Package price, terms, and existing action reviewed','Question, wait, and independent-practice choices present']} /><p>Logo and launch-monitor data are not included. The roadmap remains complete.</p><label className="confirm"><input type="checkbox" defaultChecked /> I have reviewed the coaching judgments, package facts, and next-action wording shown in this prototype.</label><div className="edit-links"><button onClick={()=>go('ACT-03')}>Edit golfer goal</button><button onClick={()=>go('ACT-04')}>Edit assessment</button><button onClick={()=>go('ACT-05')}>Edit phases</button><button onClick={()=>go('ACT-02')}>Edit package</button></div></div><div className="mini-roadmap"><Tag>Exact golfer preview</Tag><h2>Mark's development roadmap</h2><p>A clearer path to breaking 90—without one or two driver holes deciding the round.</p><button type="button" onClick={()=>go('GOL-01')}>Open full preview</button></div></div></>;
  if (id === 'ACT-07') return <><Notice compact/><div className="eyebrow">Share review</div><h1>Review the recipient and roadmap before sharing.</h1><div className="share-card"><DataField label="Recipient" value="Mark Chen"/><DataField label="Context" value="Private post-assessment roadmap"/><DataField label="Simulated channel" value="Email link"/><Section title="What Mark receives"><p>Goal, starting point, barriers, four-phase roadmap, recommended first phase, coaching package, and next-step choices.</p></Section></div><p className="boundary">This visual prototype does not create a link or define live access duration. Real consent, delivery, correction, revocation, retention, and deletion behavior requires policy approval.</p></>;
  if (id === 'ACT-08') return <div className="success-state"><div className="success-mark">✓</div><Tag tone="success">Prototype share complete</Tag><h1>Mark's roadmap is ready in this prototype.</h1><p className="lead">Nothing was sent. In the intended experience, Mark would receive the approved private roadmap and could continue to Maya's existing booking page, ask a question, wait, or practise independently.</p><p className="boundary">This status does not mean Mark viewed the roadmap, purchased a package, booked a lesson, or generated revenue.</p><Button kind="secondary" onClick={()=>go('ACT-09')}>Return to my roadmaps</Button></div>;
  if (id === 'ACT-09') return <><div className="eyebrow">Prototype trial · 11 days shown for concept only</div><h1>Your roadmaps</h1><article className="roadmap-card"><Tag tone="success">Simulated share complete</Tag><h2>Mark Chen</h2><p>Driver development roadmap</p><dl><div><dt>Package</dt><dd>Start-Line Control Coaching Phase</dd></div><div><dt>Last updated</dt><dd>Today · synthetic</dd></div></dl><Button onClick={()=>go('ACT-06')}>View roadmap</Button></article><div className="actions"><Button kind="secondary" onClick={()=>setStatus('A fresh preset draft is ready. Nothing was created or saved.')}>Create another roadmap</Button><Button kind="ghost" onClick={()=>go('ACT-10')}>Review account and season options</Button></div></>;
  return <><Notice compact/><div className="eyebrow">Account concepts only</div><h1>Choose what should happen when your season changes.</h1><div className="account-grid"><article><Tag tone="success">Active plan</Tag><div className="price small">CAD $75/month</div><div className="classification">[PRICING HYPOTHESIS — REQUIRES VALIDATION]</div><p>Full prototype access. Month-to-month concept. No long contract.</p><Button kind="secondary" onClick={()=>setStatus('The fictional account remains active. Nothing changed or was charged.')}>Keep active plan</Button></article><article><Tag tone="attention">Read-only pause</Tag><div className="price small">CAD $15/month</div><div className="classification">[PRICING HYPOTHESIS — REQUIRES VALIDATION] · up to six months</div><p>Keep fictional identity, package, and roadmaps visible, then resume through one clear action. Exact behavior is unresolved.</p><Button onClick={()=>go('ST-08')}>Review pause</Button></article><article><Tag tone="error">Cancel</Tag><h2>Stop future prototype billing</h2><p>Exact access, retention, link, export, deletion, refund, and reactivation behavior is unresolved.</p><Button kind="danger" onClick={()=>go('ST-09')}>Review cancellation</Button></article></div></>;
}

const golferFrameData = {
  'GOL-01': { eyebrow:'Private coaching roadmap', title:'A clearer path to breaking 90—without one or two driver holes deciding the round.', intro:'Prepared for Mark Chen by Maya Bennett.', quote:'Mark, you said the frustrating part is not a lack of good drives; it is not knowing when the big right miss will appear. This roadmap explains what I saw, why start direction comes first, and the coaching phase I recommend.' },
  'GOL-02': { eyebrow:'What you want from your golf', title:'Break 90 often enough that it no longer feels exceptional.', quote:'You want competitive rounds with friends to feel enjoyable, without three to five driver penalty shots deciding the day.' },
  'GOL-03': { eyebrow:'Your starting point', title:'You already have enough usable distance. Predictability is the issue.', quote:'At comfortable speed, several drives were playable. When speed increased, the ball often started right and curved farther right. Aiming left and slowing down sometimes protected against that miss, but also produced a pull.' },
  'GOL-04': { eyebrow:'What comes first', title:'Three barriers matter; one comes first.' },
  'GOL-05': { eyebrow:"Maya's recommended sequence", title:'A four-phase path, adjusted as evidence develops.' },
  'GOL-06': { eyebrow:'Recommended first phase', title:'Start-Line Control', quote:'You do not need a perfect driver swing to move toward breaking 90. A more predictable start gives us a playable pattern to build on and a clearer way to judge whether the change is transferring.' },
  'GOL-07': { eyebrow:"Maya's recommended coaching option", title:'Start-Line Control Coaching Phase' },
  'GOL-08': { eyebrow:'Your decision', title:'Choose what feels right for your next step.' },
};

function Golfer({ id, chooseOutcome }) {
  const f = golferFrameData[id];
  return <article className="golfer-story">
    <div className="golfer-kicker">Mark's development roadmap <span>·</span> Prepared by Maya Bennett</div>
    <div className="eyebrow">{f.eyebrow}</div><h1>{f.title}</h1>
    {id === 'GOL-01' && <><p className="coach-byline">{f.intro}</p><blockquote>{f.quote}</blockquote><p>Driver assessment · August 2026</p><p className="reassurance">Directional plan; it may change as we gather evidence.</p></>}
    {id === 'GOL-02' && <><blockquote>{f.quote}</blockquote><dl className="context-list"><div><dt>Typical score</dt><dd>94–101</dd></div><div><dt>Playing context</dt><dd>15–20 rounds per season; two weekend trips ahead</dd></div><div><dt>Practice reality</dt><dd>One focused 30–45 minute range session most weeks</dd></div></dl><p className="boundary">This roadmap supports that goal; it does not guarantee a score or timeline.</p></>}
    {id === 'GOL-03' && <><div className="strength-grid"><div><span>Playable best drives</span><p>Sufficient length for Mark's scoring goal.</p></div><div><span>Controlled-tempo mid-irons</span><p>Solid contact provides a scoring strength to preserve.</p></div></div><blockquote>{f.quote}</blockquote><div className="evidence-layout"><FakeMedia/><div><h2>Selected evidence</h2><List items={['Two fictional representative clips with text descriptions','Ten-ball note: 4 playable · 3 recoverable · 3 likely penalty','Golfer report: 3–5 driver penalty shots in a typical round']} /></div></div><p className="boundary">Ten shots are a small assessment sample. No launch-monitor data was collected. On-course penalty count is Mark-reported. This does not predict when Mark will break 90.</p></>}
    {id === 'GOL-04' && <><ol className="barrier-list"><li><span>01</span><div><h2>Unpredictable start direction</h2><p>At speed, the ball can begin too far right before curvature has a chance to be managed.</p></div></li><li><span>02</span><div><h2>Protective compensation</h2><p>Aiming left and slowing down avoids some right misses but creates a two-way pattern.</p></div></li><li><span>03</span><div><h2>Course transfer not yet proven</h2><p>A range change must hold under targets, pressure, and club-choice decisions before it can support scoring.</p></div></li></ol><p className="callout">Start direction comes first because it gives us a stable pattern to evaluate before adding speed or course variability.</p><p>We are not rebuilding every full-swing detail or prioritizing short game yet. Scoring evidence will decide that later.</p></>}
    {id === 'GOL-05' && <><ol className="phase-list"><Phase number={1} title="Start-Line Control" current text="Make initial direction more predictable at manageable speed."/><Phase number={2} title="Playable Driver Pattern" text="Reduce the severe right miss and develop a repeatable stock shot."/><Phase number={3} title="On-Course Transfer" text="Test the pattern across targets, pressure, and club choices."/><Phase number={4} title="Scoring Consolidation" text="Compare driver penalties with approach and short-game evidence before choosing the next scoring priority."/></ol><p className="boundary">Future phases may change as your pattern and on-course evidence change.</p></>}
    {id === 'GOL-06' && <><p className="lead">Make the driver's initial direction more predictable before adding speed.</p><blockquote>{f.quote}</blockquote><div className="two-column"><Section title="How we will recognize progress"><List items={['Mark can explain the setup/face-control task in his own words.',"More shots begin within Maya's defined start window across repeated practice samples.",'The severe right-start pattern appears less often before the work moves to the course.']} /></Section><Section title="Your commitment"><p>One 30–45 minute focused practice most weeks plus a short pre-round rehearsal.</p><h3>Outside this phase</h3><p>No promise to break 90, no full-swing rebuild, and no assumption that range progress has transferred to scoring.</p></Section></div><p className="reassurance">Review evidence after the third coaching session and choose continue, revise, pause, or independent practice.</p></>}
    {id === 'GOL-07' && <><div className="package-recommendation"><div><Tag>Synthetic coaching price</Tag><div className="price">CAD $595</div><p>Three focused sessions give us enough coaching and repeated evidence to establish, practise, and review the start-line pattern without promising a scoring result.</p></div><div><h2>Included</h2><List items={['Three coaching sessions over an estimated five to seven weeks','One focused practice direction after each session','Selected video or observation evidence when useful','A private roadmap that carries the phase context','An end-of-phase review and next-step recommendation']} /></div></div><div className="terms"><strong>Fictional current terms</strong><span>Three 50-minute sessions · Use within eight weeks · 24 hours' notice for rescheduling · No automatic renewal</span></div><p>Evaluation: repeated start-window evidence plus honest course-transfer status. Completion: review → continue, revise, pause, or practise independently.</p><div className="edit-links"><button onClick={()=>chooseOutcome('ask')}>Ask Maya a question</button><button onClick={()=>chooseOutcome('wait')}>I want to think about it</button></div></>}
    {id === 'GOL-08' && <><p className="lead">This prototype will not book, charge, or send anything.</p><div className="choice-grid"><button onClick={()=>chooseOutcome('continue')}><strong>Begin Start-Line Control</strong><span>Preview Maya's existing booking or payment handoff. Your place is not reserved.</span></button><button onClick={()=>chooseOutcome('ask')}><strong>Ask Maya a question</strong><span>Keep this roadmap context with your simulated message.</span></button><button onClick={()=>chooseOutcome('wait')}><strong>Review this later</strong><span>No countdown or price-pressure message.</span></button><button onClick={()=>chooseOutcome('practice')}><strong>Practise independently for now</strong><span>Use the assessment takeaway Maya approved.</span></button></div></>}
  </article>;
}

const STATE_COPY = {
  'ST-01': ['The visual sample is unavailable.','You can still review the complete fictional goal, assessment, roadmap, package, and next steps in text.','Open text sample'],
  'ST-02': ['Your name is enough to continue.','Roadmap will use the standard text identity until you add a logo.','Continue without a logo'],
  'ST-03': ['This link is not ready.','Nothing has been validated or shared. Edit the link or use a direct contact route for the prototype.','Edit link'],
  'ST-04': ['A coach observation can carry this assessment.','Video, launch data, and measurements are optional. Match the strength of the claim to the evidence available.','Continue without media'],
  'ST-05': ['One more observation is needed.','Maya does not yet have enough confidence to connect a structured phase to a package. No package recommendation will be shown.','Arrange a follow-up conversation'],
  'ST-06': ['Review one item before sharing.','The first-phase rationale is missing. Optional logo and media omissions do not block the roadmap.','Add the rationale'],
  'ST-07': ['Nothing was sent.','The prototype draft is unchanged. Review the recipient or return to the roadmap before trying the simulated action again.','Review sharing'],
  'ST-08': ['Review the read-only pause concept.','The concept preserves fictional content for up to six months at the labelled pricing hypothesis. Nothing will be paused in this prototype.','Simulate pause'],
  'ST-09': ['Review cancellation before leaving.','This prototype cannot define live billing or data consequences. Nothing will be cancelled.','Simulate cancellation'],
  'ST-10': ['This roadmap is not available.','No golfer, goal, coach note, evidence, or package information is shown. Check the intended private route or contact the coach.','Try again'],
};
const STATE_RECOVERY = {'ST-01':'ACQ-03','ST-02':'ACT-02','ST-03':'ACT-02','ST-04':'ACT-05','ST-05':'ACT-04','ST-06':'ACT-05','ST-07':'ACT-07','ST-08':'ACT-10','ST-09':'ACT-10','ST-10':'ACQ-01'};

function AlternateState({ id, go, setStatus }) {
  const [title, body, action] = STATE_COPY[id];
  const dangerous = id === 'ST-09';
  const noPersonal = id === 'ST-10';
  return <div className={`state-screen ${dangerous ? 'danger-state' : ''}`}>
    <div className="state-icon" aria-hidden="true">{noPersonal ? '◌' : id === 'ST-07' ? '!' : 'i'}</div>
    <Tag tone={dangerous ? 'error' : 'attention'}>{TITLES[id]}</Tag><h1>{title}</h1><p className="lead">{body}</p>
    {id === 'ST-01' && <FakeMedia unavailable />}
    {id === 'ST-08' && <div className="price-state"><strong>CAD $15/month · up to six months</strong><span>[PRICING HYPOTHESIS — REQUIRES VALIDATION]</span><p>Fictional coach identity, package, and roadmaps remain read-only. A later resume would restore the next useful action.</p></div>}
    {id === 'ST-09' && <p className="boundary">Access, data retention, golfer links, export, deletion, refunds, and reactivation remain unresolved. No exit is obstructed in this concept.</p>}
    <div className="actions"><Button kind={dangerous ? 'danger' : 'primary'} onClick={()=>{ if(id==='ST-08') setStatus('Nothing was paused. The fictional account remains active.'); if(id==='ST-09') setStatus('Nothing was cancelled or charged.'); go(STATE_RECOVERY[id]); }}>{action}</Button>{id === 'ST-03' && <Button kind="secondary" onClick={()=>go('ACT-02')}>Use direct contact route</Button>}</div>
  </div>;
}

function DecisionOutcome({ type, onClose, go }) {
  const content = {
    continue: ['Booking handoff preview','You would leave Roadmap for Maya’s existing booking or payment page. Nothing was booked or charged.','Return to your roadmap'],
    ask: ['Question path preview','A future message could keep the roadmap context. Nothing was composed or sent.','Return to your choices'],
    wait: ['Review later','No countdown, reservation, or price-pressure message appears. Nothing was saved and no reminder was scheduled.','Return to your choices'],
    practice: ['Independent practice for now','Use Maya’s approved assessment takeaway and ask for clarification if anything is unclear. No follow-up was scheduled.','Return to your choices'],
  }[type];
  return <div className="outcome-overlay" role="dialog" aria-modal="true" aria-labelledby="outcome-title"><div className="outcome-card"><Tag>Neutral prototype outcome</Tag><h2 id="outcome-title">{content[0]}</h2><p>{content[1]}</p><Notice compact/><div className="actions"><Button onClick={onClose}>{content[2]}</Button>{type==='continue' && <Button kind="secondary" onClick={()=>go('GOL-08')}>Ask Maya instead</Button>}</div></div></div>;
}

function ReviewerPanel({ current, open, setOpen, go }) {
  return <aside className={`reviewer-panel ${open ? 'open' : ''}`} aria-label="Reviewer frame controls">
    <button className="reviewer-toggle" type="button" onClick={()=>setOpen(!open)} aria-expanded={open}>{open ? 'Close frame map' : 'Open frame map'}</button>
    {open && <div className="reviewer-inner"><div className="reviewer-heading"><span>Reviewer controls</span><small>Separate from participant UI</small></div>{FRAME_GROUPS.map(group=><section key={group.label}><h2>{group.label}</h2><div className="frame-buttons">{group.ids.map(id=><button key={id} className={current===id?'active':''} onClick={()=>go(id)} aria-current={current===id?'page':undefined}><span>{id}</span><small>{TITLES[id]}</small></button>)}</div></section>)}</div>}
  </aside>;
}

function App() {
  const initial = useMemo(() => {
    const id = window.location.hash.replace('#','').toUpperCase();
    return TITLES[id] ? id : 'ACQ-01';
  }, []);
  const [current, setCurrent] = useState(initial);
  const [history, setHistory] = useState([]);
  const [reviewerOpen, setReviewerOpen] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [status, setStatus] = useState('');
  const headingRef = useRef(null);
  const group = current.split('-')[0];
  const isGolfer = group === 'GOL';
  const next = SEQUENTIAL_NEXT[current];

  const go = (id) => {
    if (!TITLES[id]) return;
    setHistory(prev => [...prev, current]);
    setCurrent(id); setOutcome(null); setReviewerOpen(false); setStatus('');
    window.location.hash = id;
  };
  const back = () => {
    const prior = history.at(-1) || (isGolfer ? 'ACT-08' : 'ACQ-01');
    setHistory(prev => prev.slice(0,-1)); setCurrent(prior); setOutcome(null); setStatus('');
    window.location.hash = prior;
  };
  const restart = () => { setHistory([]); setCurrent('ACQ-01'); setOutcome(null); setStatus(''); window.location.hash='ACQ-01'; };

  useEffect(() => { requestAnimationFrame(() => headingRef.current?.focus()); }, [current]);

  return <div className={`app-shell ${isGolfer ? 'golfer-mode' : 'utility-mode'}`}>
    <a className="skip-link" href="#main">Skip to main content</a>
    <div className="approval-banner">ASSUMPTION-DRIVEN LOCAL PROTOTYPE — NOT APPROVED</div>
    <header className="site-header"><button className="wordmark" onClick={()=>go('ACQ-01')}>Roadmap<span>Coach-branded golf development roadmaps</span></button><nav aria-label="Primary"><button onClick={()=>go('ACQ-02')}>How it works</button><button onClick={()=>go('ACQ-03')}>Sample roadmap</button><button onClick={()=>go('ACQ-05')}>Pricing</button></nav><div className="account-meta">{isGolfer ? 'Private roadmap' : group==='ACT' ? 'Maya Bennett · Prototype trial' : 'For solo instructors'}</div></header>
    <Notice />
    <div className="frame-meta"><span>{current}</span><span>{TITLES[current]}</span><span>CONCEPT · ASSUMPTION-DRIVEN · NOT APPROVED</span></div>
    <main id="main" className="main-content" tabIndex="-1" ref={headingRef}>
      {group === 'ACQ' && <Acquisition id={current} go={go}/>} {group === 'ACT' && <Activation id={current} go={go} setStatus={setStatus}/>} {group === 'GOL' && <Golfer id={current} chooseOutcome={setOutcome}/>} {group === 'ST' && <AlternateState id={current} go={go} setStatus={setStatus}/>} 
      {status && <div className="status-message" role="status">{status}</div>}
      <div className="flow-actions">
        {current !== 'ACQ-01' && <Button kind="ghost" onClick={back}>Back</Button>}
        {next && <Button onClick={()=>go(next)}>{CTA_LABELS[current]}</Button>}
        {current === 'ACQ-01' && <Button kind="ghost" onClick={()=>go('ACQ-02')}>How it works</Button>}
        {current === 'ACT-10' && <Button kind="ghost" onClick={()=>go('ACT-09')}>Keep active plan</Button>}
      </div>
    </main>
    <footer><div><strong>Roadmap</strong><span>Local synthetic prototype · No real data or operations</span></div><div className="footer-actions"><button onClick={()=>{restart(); setStatus('Prototype closed. Nothing was saved.');}}>Close prototype</button><button onClick={restart}>Restart prototype</button><button onClick={()=>setReviewerOpen(true)}>Frame map</button></div></footer>
    <ReviewerPanel current={current} open={reviewerOpen} setOpen={setReviewerOpen} go={go}/>
    {outcome && <DecisionOutcome type={outcome} onClose={()=>setOutcome(null)} go={go}/>} 
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
