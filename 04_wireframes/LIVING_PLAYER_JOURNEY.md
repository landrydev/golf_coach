# Living Player Journey

**CURRENT DRAFT STATUS:** Reconciled with Business Plan V2; complete text-based lifecycle specification  
**REAL-WORLD STATUS:** No drawn wireframes or longitudinal tests completed  
**AARON APPROVAL STATUS:** Review required after the conversion flow is validated  
**Depends on:** [POST_ASSESSMENT_ROADMAP.md](POST_ASSESSMENT_ROADMAP.md), [COACH_EFFORT_MODEL.md](../03_experience_strategy/COACH_EFFORT_MODEL.md)  
**Decision status:** [SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]

## Flow objective

Answer the golfer's recurring question:

> “What matters now, what has changed, and what should I do before the next lesson?”

The journey protects perceived value by showing that the purchased phase is active and coherent. It is not a dashboard, message feed, drill library, or exhaustive archive.

## Role in the self-serve business

`[SUPPORTED BY BUSINESS PLAN V2]` This flow is a candidate recurring-value layer after the solo instructor has completed the first-roadmap activation event. It must be maintainable through standard prompts and low coach/support effort; it cannot depend on concierge reporting or facility administration.

`[UNVALIDATED BUSINESS ASSUMPTION]` Ongoing journey updates will improve retention enough to justify continued subscription. Validate natural update frequency, instructor effort, golfer use, and whether a paused account should retain read-only access before placing this flow in the first product.

## Synthetic point in time

This specification imagines Mark Chen after lesson two of the fictional three-session **Start-Line Control Coaching Phase** with Maya Bennett:

- Mark completed two focused range practices.
- A current ten-ball practice set contains **7 playable, 2 recoverable, and 1 likely penalty** result, compared with **4 / 3 / 3** in the assessment.
- A second recent set is directionally similar but not identical.
- Maya considers this an early practice indication, not course transfer.
- Mark's latest round still included three right misses and two penalty situations.

All content is synthetic and illustrates states; it is not proof of coaching or product outcomes.

## Navigation model

[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]

The default destination is **Now**. Secondary destinations are **Practice**, **Evidence**, **Lessons**, and **Roadmap**. On mobile, use a compact, clearly labeled navigation pattern with no more than these five destinations. On desktop, a quiet chapter list may remain visible. History never becomes the landing view.

---

## Screen 1 — Journey home: What matters now

### Purpose and desired response

- **Screen purpose:** give Mark the ten-second orientation layer.
- **Golfer question:** “Where are we, what is the one priority, and what should I do next?”
- **Commercial purpose:** reduce buyer's remorse, reinforce continuity, and make current value visible.
- **Desired emotion:** remembered, oriented, supported.

### Information hierarchy and example content

1. Quiet goal cue: **“Break 90 more consistently by reducing driver penalty holes.”**
2. Phase status: **“Start-Line Control · Lesson 2 of 3 complete.”** Lesson count is context, not the phase identity.
3. Current priority: **“Keep the start window predictable before adding speed.”**
4. Maya's current note:

   > “Your recent practice sets show fewer severe right starts. That is an early practice signal, not course transfer. Keep the same window and speed this week; we will retest before changing the task.”

5. Latest meaningful evidence: **Assessment 4 / 3 / 3 → current practice 7 / 2 / 1**, labeled small-sample practice evidence.
6. Practice action: **one 30–40 minute start-window session before the next lesson.**
7. Next milestone: **repeat a coach-defined playable start pattern across two practice sets; course transfer follows later.**
8. Next session context, if known; otherwise “Review after your next practice set,” not an empty calendar.

### Actions and presence

- **Primary action:** “Open this week's practice.”
- **Secondary actions:** “Review the evidence,” “Read lesson 2,” and “View roadmap.”
- **Coach presence:** the current note and priority are Maya-approved; last updated date is visible.
- **Evidence required:** current priority and coach note; progress is optional if nothing meaningful changed.
- **Deliberately omitted:** score dashboard, streak, activity feed, every past clip, purchase/renewal action, congratulatory confetti.

### Responsive, states, access, and ethics

- **Mobile:** goal cue, phase, priority, practice action, then evidence and note; the first natural viewport should establish goal/phase/priority even if the action falls below.
- **Desktop:** current priority and practice may lead in a reading column with evidence adjacent; history remains secondary.
- **No meaningful progress:** replace the progress block with “No new evidence yet” and Maya's next observation plan; never manufacture a win.
- **Stale update:** show the actual update date and a neutral “Check with Maya” route; do not imply an active current prescription if it may be outdated.
- **Phase complete:** home shifts to the phase-review entry without erasing the last practice/history.
- **Error/unauthorized:** preserve no private content in errors; neutral retry/contact.
- **Accessibility:** heading-first focus, status announced in text, no colour-only progress categories, all cards follow meaningful reading order, 200% reflow.
- **Ethical risk:** using progress theatre to justify the package. Any evidence claim requires adjacent source, context, and limit.
- **Completion check:** golfer identifies goal, current phase, one priority, latest supported change/no-change, practice action, and next check within ten seconds to one minute.

---

## Screen 2 — Lesson chapter

### Purpose and desired response

- **Screen purpose:** preserve what lesson two meant without transcribing it.
- **Golfer question:** “What did we work on, what did Maya learn, and how does it connect to the phase?”
- **Commercial purpose:** make each session additive and reinforce delivery of the promised plan.
- **Desired emotion:** clear and able to remember.

### Information hierarchy and example content

1. Chapter title: **“Lesson 2 — Hold the start window as speed returns.”**
2. Purpose: **test whether Mark could preserve initial direction while moving from comfortable to normal playing speed.**
3. Coach observation: **the start pattern remained more predictable at moderate speed; severe right starts returned when speed increased quickly.**
4. What Mark learned: **increase speed only while the start window remains recognizable.**
5. Selected evidence: one representative moderate-speed clip and one high-speed miss, each with Maya's cue and text alternative.
6. Current takeaway: **“Own the window before chasing speed.”**
7. Practice prescription summary and link.
8. Next check: **compare two new eight-to-ten-ball sets before deciding whether to widen speed.**
9. Phase connection: **this lesson develops Start-Line Control; it does not yet prove a Playable Driver Pattern on course.**

### Actions and presence

- **Primary action:** “Open practice prescription.”
- **Secondary actions:** compare evidence; previous/next chapter; return to Now.
- **Coach presence:** purpose, observation, takeaway, and selection are explicitly Maya's.
- **Evidence required:** a coach observation; media optional.
- **Deliberately omitted:** full transcript, every swing, general notes unrelated to the phase, automated “great job,” purchase action.

### Responsive, states, access, and ethics

- **Mobile:** narrative first, selected media after the relevant observation, practice action last.
- **Desktop:** evidence may sit beside Maya's interpretation, but not as an uncaptioned gallery.
- **No media:** the chapter remains complete with observation, learning, takeaway, practice, and next check.
- **No change:** title and content state what was tested and what remains unresolved; a lesson can add understanding without claiming performance change.
- **Long coach note:** readable paragraphs; essential takeaway and limit never collapsed.
- **Error:** failed media retains description and chapter meaning.
- **Accessibility:** descriptive chapter heading, media captions/transcripts, keyboard controls, no autoplay, lesson navigation has clear labels.
- **Ethical risk:** retrofitting every lesson into a success story. Include unresolved or negative observations when material.
- **Completion check:** golfer can explain the lesson purpose, one observation, one takeaway, practice, and phase connection.

---

## Screen 3 — Practice prescription

### Purpose and desired response

- **Screen purpose:** make between-lesson work focused and realistically achievable.
- **Golfer question:** “What exactly should I do, why, and when should I stop or ask for help?”
- **Commercial purpose:** improve package engagement and make coach care visible between sessions.
- **Desired emotion:** capable, focused, free from guilt.

### Information hierarchy and example content

1. Objective: **“Repeat a recognizable start window before increasing speed.”**
2. Why it matters: **a predictable initial direction is the foundation for reducing the severe right miss.**
3. Maya's synthetic task: **three small sets of driver shots at controlled speed, using the start window Maya defined in the lesson.** The product does not invent the task.
4. Time/cadence: **one 30–40 minute session this week; rest between sets.**
5. Success check: **record playable / recoverable / likely-penalty start outcomes; quality matters more than total swings.**
6. Common mistake: **adding speed after one good shot instead of repeating the window.**
7. Stop/ask rule: **stop if the task no longer matches Maya's explanation, discomfort occurs, or the severe miss repeats without understanding; ask Maya rather than improvising more volume.**
8. Optional coach demonstration clip with caption and text steps.

### Actions and presence

- **Primary action:** “Review the three-step task.” In a prototype, no completion tracking is required.
- **Secondary action:** “Ask Maya a question”; return to Now.
- **Coach presence:** every task, dosage, success check, and stop rule is coach-authored/approved.
- **Evidence required:** none to view; the task connects to the active phase.
- **Deliberately omitted:** streaks, points, leaderboards, guilt notifications, large drill library, automatic prescription changes.

### Responsive, states, access, and ethics

- **Mobile:** objective, why, steps, success, stop rule; video is optional and never blocks understanding.
- **Desktop:** keep a focused instruction sheet; do not add analytics or unrelated drills to fill space.
- **Limited practice time:** Maya may approve a shorter task; show the real constraint without a “missed” state.
- **Not completed:** use neutral language; no red failure status or shame.
- **Unclear prescription:** primary action becomes “Ask Maya to clarify”; do not let the interface reinterpret coaching.
- **Accessibility:** numbered text steps, captions/transcript, no gesture-only interaction, large enough controls, printable/readable at zoom.
- **Ethical risk:** the platform prescribing method or exploiting compliance. Coach ownership and no-guilt language are mandatory.
- **Completion check:** golfer can state objective, method, amount, success check, common mistake, and stop/ask rule.

---

## Screen 4 — Progress evidence

### Purpose and desired response

- **Screen purpose:** make a supported change visible and explain its maturity.
- **Golfer question:** “What has changed, how do we know, and what is not yet proven?”
- **Commercial purpose:** demonstrate accumulated value honestly.
- **Desired emotion:** encouraged and accurately informed.

### Information hierarchy and example content

1. Claim: **“The severe right-start pattern appeared less often in two recent controlled practice sets.”**
2. Evidence label: **Early practice indication · coach observed + small-sample outcome count.**
3. Comparison:
   - Assessment: **4 playable / 3 recoverable / 3 likely penalty**.
   - Current representative set: **7 playable / 2 recoverable / 1 likely penalty**.
4. Selected before/current clip comparison with synchronized meaning but independent controls.
5. Maya's interpretation: **“Start direction is becoming more predictable at controlled speed.”**
6. Limitation: **small practice samples; not yet reliable at full speed or transferred to the course.**
7. Next evidence needed: **another practice set and a later on-course check.**

### Actions and presence

- **Primary action:** “See what Maya wants checked next.”
- **Secondary:** inspect clips, switch to text comparison, return to Now.
- **Coach presence:** Maya selects representative evidence and owns the interpretation.
- **Evidence required:** source, date/context, comparison basis, explanation, and limit. If these are absent, do not show a progress claim.
- **Deliberately omitted:** percentage improvement, trend line from two points, best-ever celebration, rank, guaranteed scoring implication.

### Responsive, states, access, and ethics

- **Mobile:** claim and label first; text comparison before media; clips stacked with explicit Baseline/Current labels.
- **Desktop:** side-by-side media is allowed with equivalent sequential keyboard order and text comparison.
- **No video/data:** use a coach-observed progress statement with lower-confidence label and explain the next check; no empty comparison shell.
- **Mixed evidence:** show both practice improvement and on-course setback in one honest view rather than selecting the flattering result.
- **No change:** label “No reliable change yet” with what is being checked next.
- **Accessibility:** full text comparison, independent controls, captions, no autoplay, motion-free equivalence, chart not required.
- **Ethical risk:** cherry-picking or false precision. Evidence and limitations must be adjacent and the coach must approve representation.
- **Completion check:** golfer can explain the change, evidence source, maturity level, limitation, and next proof needed.

---

## Screen 5 — Setback or plateau

### Purpose and desired response

- **Screen purpose:** replace normal progress framing when recent performance creates legitimate doubt.
- **Golfer question:** “Maya, did the plan fail, and what should I do now?”
- **Commercial purpose:** preserve trust through honesty rather than silence or manufactured positivity.
- **Desired emotion:** seen, steadied, and clear about the next manageable action.

### Information hierarchy and example content

1. Acknowledgement: **“Your latest round included three right misses and two penalty situations.”**
2. What we know: **practice start direction was more predictable at controlled speed across two small sets.**
3. What remains uncertain: **the change has not transferred reliably to full speed or the course.**
4. What remains stable: **Mark can identify the intended start window and reproduce it in controlled practice more often than at assessment.**
5. Maya's interpretation:

   > “One difficult round does not erase the practice change, but it does show we should not call the pattern course-ready. We will hold the phase objective and reduce variability before retesting.”

6. Next action: **one controlled start-window session; no speed increase this week.**
7. Reassessment: **at the third coaching session, compare repeated practice evidence and decide whether the phase is complete, extended, or revised.**

### Actions and presence

- **Primary action:** “Review the adjusted practice.”
- **Secondary:** “Ask Maya a question”; review prior evidence; return to roadmap.
- **Coach presence:** first-person interpretation and reassessment decision.
- **Evidence required:** golfer-reported round result is labeled; practice evidence and limits remain visible.
- **Deliberately omitted:** celebration, blame, lost-progress warning, automatic extra-package recommendation, shame about practice.

### Responsive, states, access, and ethics

- **Mobile/desktop:** linear narrative in the exact order acknowledgement → known → uncertain → stable → response → reassessment; do not bury uncertainty.
- **No reliable stable evidence:** say so and move to observation/reassessment; do not invent a positive.
- **Repeated setback:** show roadmap review is underway; no automatic escalation or purchase.
- **Coach unavailable:** state the note date and provide a contact route; do not present an outdated adjustment as current.
- **Accessibility:** calm plain language, no danger colour as sole meaning, headings make the reasoning sequence navigable, no animation.
- **Ethical risk:** exploiting frustration to retain or upsell. No commercial action belongs on this state.
- **Completion check:** golfer can state what happened, what it proves/does not prove, what remains stable, next action, and reassessment point.

## Cross-flow states

- **No active phase:** show the last phase review and a neutral route to the roadmap; do not display a fake current task.
- **Paused coaching:** state who paused, when, and what guidance remains current; no loss framing.
- **Goal revised:** show the new confirmed goal and why the roadmap will be reconsidered.
- **History empty:** on the first day, the roadmap and first practice direction carry the experience; do not show empty lesson/evidence modules.
- **Unauthorized/error:** reveal no private content, media, or status; retry/contact only.

## Specification completion checklist

- [x] Journey home, lesson chapter, practice prescription, progress evidence, and setback state fully specified.
- [x] Each screen defines purpose, golfer/commercial question, emotion, hierarchy, realistic content, actions, coach presence, evidence, omissions, responsive behaviour, edge states, accessibility, ethics, and completion test.
- [x] One current priority leads; history is secondary.
- [x] Synthetic progress and setback are explicitly fictional and evidence-limited.
- [x] Recurring-value and low-support role under Business Plan V2 is stated.
- [ ] Low-fidelity frames drawn for mobile, tablet, and desktop.
- [ ] Coach effort directly timed for all recurring inputs.
- [ ] Representative longitudinal comprehension/trust testing completed.
- [ ] Aaron approves exact frames and scope after the first wedge is validated.

The text specification is complete; downstream design and validation remain deliberately not started.
