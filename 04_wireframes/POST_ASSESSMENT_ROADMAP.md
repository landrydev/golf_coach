# Post-Assessment Roadmap and Package Recommendation

**CURRENT DRAFT STATUS:** Golfer flow reconciled with Business Plan V2; complete text-based specification  
**REAL-WORLD STATUS:** No drawn wireframes or tests completed  
**AARON APPROVAL STATUS:** `AUTH-001` permits assumption-driven visual preparation using this flow; coaching realism and exact frames still require review  
**Depends on:** [WIREFRAME_WORKPLAN.md](WIREFRAME_WORKPLAN.md), [SELF_SERVE_INSTRUCTOR_ACTIVATION.md](SELF_SERVE_INSTRUCTOR_ACTIVATION.md), [SYNTHETIC_GOLFER_PROFILE.md](../06_prototype/SYNTHETIC_GOLFER_PROFILE.md)  
**Decision status:** [SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]

## Flow objective

After a real assessment, help the golfer answer:

> “Does this coach understand my game and goal, have a credible plan, and make the right first coaching package clear without pressuring me?”

[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW] The recommended reveal works both in person and as a private follow-up. The coach should preferably introduce the roadmap live or by a short personal message; the artifact must still make sense without a second verbal sales explanation.

## Role in the self-serve product

`[SUPPORTED BY BUSINESS PLAN V2]` This is the golfer-facing result created through [SELF_SERVE_INSTRUCTOR_ACTIVATION.md](SELF_SERVE_INSTRUCTOR_ACTIVATION.md). A product prospect sees a realistic synthetic version before signup; an instructor then supplies the coach-owned content, previews this exact order, and shares it without mandatory onboarding.

The instructor's account, subscription, trial, or support state must not appear as pressure in the golfer experience. The roadmap remains useful whether the golfer buys, asks, waits, or declines. External purchase, booking, or contact actions remain instructor-owned.

## Canonical flow

```text
1. Private welcome
→ 2. Desired outcome
→ 3. Starting point
→ 4. Most important barriers
→ 5. Development roadmap
→ 6. Recommended first phase
→ 7. Coaching-package recommendation
→ 8. Clear next action
```

Use the fully fictional scenario in [SYNTHETIC_GOLFER_PROFILE.md](../06_prototype/SYNTHETIC_GOLFER_PROFILE.md): Mark Chen, coached by fictional independent instructor Maya Bennett. All example prices, observations, and outcomes are simulated content, not customer or market evidence.

## Shared flow shell

- **Persistent identity:** “Mark's development roadmap” and “Prepared by Maya Bennett” remain visible but quiet.
- **Progress:** “Step 2 of 8” plus the current section name; do not frame progress as urgency.
- **Navigation:** Back, Continue, close/return later. Direct section navigation may appear after first completion but must not let a new viewer jump to price without context by default.
- **Primary action style:** one clear action per step; the final commercial action is visually prominent only after the package rationale.
- **Secondary action:** a visible “Ask Maya a question” path appears from the package onward. A wait/independent-practice choice appears at the final decision.
- **Privacy cue:** private roadmap context is visible near identity; never imply public sharing.
- **Platform identity:** secondary footer attribution only, if used at all.

---

## Screen 1 — Private welcome

### Purpose and desired response

- **Screen purpose:** establish ownership, coach presence, assessment context, and personal care.
- **Golfer question:** “Is this really for me, and what will it help me understand?”
- **Commercial purpose:** earn attention and trust before any diagnosis or sale.
- **Desired emotion:** recognized, private, curious.

### Information hierarchy and example content

1. Quiet private label: **“Private coaching roadmap.”**
2. Coach identity: **“Prepared for Mark Chen by Maya Bennett.”**
3. Personal headline: **“A clearer path to breaking 90—without one or two driver holes deciding the round.”**
4. Coach note:

   > “Mark, you said the frustrating part is not a lack of good drives; it is not knowing when the big right miss will appear. This roadmap explains what I saw, why start direction comes first, and the coaching phase I recommend.”

5. Context: **Driver assessment · August 2026** and “Directional plan; it may change as we gather evidence.”

### Actions and presence

- **Primary action:** “See your goal.”
- **Secondary action:** “Close and return later.”
- **Coach presence:** coach name, short note, restrained portrait or signature only if authentic and accessible.
- **Evidence required:** golfer-confirmed goal cue and assessment date/context; no performance proof is needed yet.
- **Deliberately omitted:** price, purchase action, technical findings, coach biography, testimonial, platform features, navigation dashboard.

### Responsive, states, access, and ethics

- **Mobile:** single column; identity and headline fit the first natural scroll; action follows the note.
- **Desktop:** use a quiet reading column with coach identity adjacent, not a marketing hero split.
- **Limited/empty:** if no personal coach note exists, use a short factual introduction; never insert generic praise. If goal is unconfirmed, state “Your coach is confirming the goal before making a recommendation” and stop the flow.
- **Error/unauthorized:** show no name, goal, coach note, or assessment detail; provide a neutral retry/contact action.
- **Accessibility:** page title receives initial focus; decorative portrait has empty alternative text; meaningful signature/name is text; privacy label is not colour-only.
- **Ethical risk:** premature selling or false intimacy. The screen passes only if every personal statement comes from confirmed assessment context.
- **Completion check:** golfer can say who prepared it, why it exists, and what personal goal it will address.

---

## Screen 2 — Mark's desired outcome

### Purpose and desired response

- **Screen purpose:** anchor all later coaching and commercial content to Mark's own outcome and constraints.
- **Golfer question:** “Did Maya hear what I actually want from my golf?”
- **Commercial purpose:** connect the future package to a meaningful outcome rather than swing work or hours.
- **Desired emotion:** understood and personally invested.

### Information hierarchy and example content

1. Eyebrow: **“What you want from your golf.”**
2. Goal headline: **“Break 90 often enough that it no longer feels exceptional.”**
3. Why it matters:

   > “You want competitive rounds with friends to feel enjoyable, without three to five driver penalty shots deciding the day.”

4. Context strip:
   - Typical score: **94–101**.
   - Playing context: **15–20 rounds per season; two weekend trips ahead**.
   - Practice reality: **one focused 30–45 minute range session most weeks**.
5. Honest framing: **“This roadmap supports that goal; it does not guarantee a score or timeline.”**

### Actions and presence

- **Primary action:** “See your starting point.”
- **Secondary action:** Back; “This goal is not quite right” opens a non-destructive question-to-coach state in the prototype.
- **Coach presence:** a short confirmation line, “This is the outcome we will use to judge priorities,” attributed to Maya.
- **Evidence required:** Mark-reported goal, scores, penalty estimate, schedule, and practice availability; label self-reported facts.
- **Deliberately omitted:** swing diagnosis, package, countdown to trips, promised handicap change, multiple equal goals.

### Responsive, states, access, and ethics

- **Mobile:** goal headline first; context becomes a short vertical list rather than stat cards.
- **Desktop:** goal and personal reason may sit beside a narrow context column; reading order remains goal → reason → constraints → disclaimer.
- **Limited/empty:** omit handicap or upcoming context if unknown; do not display empty labels. If “why it matters” is missing, show the confirmed goal only and flag coach follow-up before a final recommendation.
- **Error:** preserve no partially edited personal facts in an error message; offer retry or contact.
- **Accessibility:** do not rely on oversized display type alone; facts have text labels; correction control has a descriptive name and focus state.
- **Ethical risk:** converting an aspirational score into a guarantee or urgency device. The trip is context, never a deadline used to pressure purchase.
- **Completion check:** golfer can retell the goal, personal reason, and practice constraint and recognizes them as self-reported/confirmed.

---

## Screen 3 — Starting point

### Purpose and desired response

- **Screen purpose:** demonstrate that the coach understands both usable strengths and the priority pattern, with evidence quality visible.
- **Golfer question:** “What did Maya actually see, and does the explanation make sense?”
- **Commercial purpose:** establish coaching credibility and the factual basis for a structured recommendation.
- **Desired emotion:** honestly understood, not judged or overwhelmed.

### Information hierarchy and example content

1. Headline: **“You already have enough usable distance. Predictability is the issue.”**
2. Strengths:
   - **Playable best drives:** sufficient length for Mark's scoring goal.
   - **Controlled-tempo mid-irons:** solid contact provides a scoring strength to preserve.
3. Coach summary:

   > “At comfortable speed, several drives were playable. When speed increased, the ball often started right and curved farther right. Aiming left and slowing down sometimes protected against that miss, but also produced a pull.”

4. Selected evidence:
   - Two representative clips: “Playable start” and “Right-start miss,” each with a text description and coach cue.
   - Ten-ball note: **4 playable · 3 recoverable · 3 likely penalty**.
   - Golfer report: **3–5 driver penalty shots in a typical round**.
5. Evidence limits:
   - ten shots are a small assessment sample;
   - no launch-monitor data was collected;
   - on-course penalty count is Mark-reported;
   - this does not predict when Mark will break 90.

### Actions and presence

- **Primary action:** “See the barriers.”
- **Secondary action:** inspect each evidence item; Back; “Ask about this assessment.”
- **Coach presence:** interpretation and clip cues are attributed to Maya; the interface does not diagnose.
- **Evidence required:** at minimum a coach observation. Video and measurement are optional.
- **Deliberately omitted:** every swing, elite comparison, red “fault” labels, unexplained launch metrics, before/after claim, phase or price.

### Responsive, states, access, and ethics

- **Mobile:** coach summary leads; evidence items appear one at a time after their interpretation; clips use accessible play controls and text alternatives.
- **Desktop:** one selected clip may sit beside its explanation; never show a gallery grid that competes with the conclusion.
- **No video:** remove media controls entirely and use coach observation plus ten-ball note; state “No video was needed for this recommendation.”
- **No measurements:** omit the evidence count and avoid an empty chart; observation can carry the story.
- **Conflicting/limited evidence:** state the conflict (“range pattern and round report do not yet align”) and move the conclusion to “working hypothesis.”
- **Error:** a failed clip never removes the text description or evidence limit; retry is secondary to reading the conclusion.
- **Accessibility:** captions/transcript for spoken media, full keyboard controls, no autoplay, text table for the ten-ball result, no colour-only playable/recoverable/penalty categories.
- **Ethical risk:** cherry-picking or making Mark feel broken. Show representative clips selected by the coach, acknowledge strengths, and keep sample limits adjacent.
- **Completion check:** golfer can explain one strength, the priority pattern, the evidence source, and at least one limitation.

---

## Screen 4 — Most important barriers

### Purpose and desired response

- **Screen purpose:** turn the gap into a manageable order of work and explain what is deliberately deferred.
- **Golfer question:** “What stands between today and my goal, and why not fix everything at once?”
- **Commercial purpose:** show why a structured phase is more credible than an isolated tip without inflating problems.
- **Desired emotion:** calm, oriented, capable.

### Information hierarchy and example content

1. Headline: **“Three barriers matter; one comes first.”**
2. Priority 1 — **Unpredictable start direction**: “At speed, the ball can begin too far right before curvature has a chance to be managed.”
3. Priority 2 — **Protective compensation**: “Aiming left and slowing down avoids some right misses but creates a two-way pattern.”
4. Priority 3 — **Course transfer not yet proven**: “A range change must hold under targets, pressure, and club-choice decisions before it can support scoring.”
5. Coach rationale: **“Start direction comes first because it gives us a stable pattern to evaluate before adding speed or course variability.”**
6. Deferred work: **“We are not rebuilding every full-swing detail or prioritizing short game yet. Scoring evidence will decide that later.”**

### Actions and presence

- **Primary action:** “See the development roadmap.”
- **Secondary action:** Back; optional “Why this order?” disclosure if the rationale needs more context.
- **Coach presence:** Maya owns barrier selection, order, and deferred work.
- **Evidence required:** each barrier traces to the starting point, goal, or explicit uncertainty.
- **Deliberately omitted:** an exhaustive problem list, severity scores, predicted lesson count, package, fear-based scoring loss.

### Responsive, states, access, and ethics

- **Mobile:** numbered vertical sequence; Priority 1 visually leads without making later barriers look like failures.
- **Desktop:** use a simple ordered path, not a horizontal diagram requiring left-to-right precision; rationale stays near Priority 1.
- **Limited data:** show two barriers if only two are defensible. Never pad to three.
- **Uncertain priority:** label the first phase as a coach hypothesis and state what the first session will test before a full package recommendation; a no-recommendation state is valid.
- **Error:** narrative remains available if an evidence link fails.
- **Accessibility:** numbered headings express order independent of colour/position; disclosure is keyboard operable and does not hide essential reasoning.
- **Ethical risk:** exaggerating the gap to justify more sessions. Every barrier must be goal-relevant, evidence-linked, and coach-approved.
- **Completion check:** golfer can name the first barrier, explain why it leads, and say what is not being addressed yet.

---

## Screen 5 — Development roadmap

### Purpose and desired response

- **Screen purpose:** show a credible directional sequence with enough future context to support continuity, not a rigid promise.
- **Golfer question:** “Does Maya have a plan beyond the next lesson?”
- **Commercial purpose:** create the phase structure that supports initial package value and later earned renewal.
- **Desired emotion:** confident in the coach's plan and comfortable with uncertainty.

### Information hierarchy and example content

1. Headline: **“A four-phase path, adjusted as evidence develops.”**
2. Phase 1 — **Start-Line Control** *(recommended now)*: make initial direction more predictable at manageable speed.
3. Phase 2 — **Playable Driver Pattern**: reduce the severe right miss and develop a repeatable stock shot.
4. Phase 3 — **On-Course Transfer**: test the pattern across targets, pressure, and club choices.
5. Phase 4 — **Scoring Consolidation**: compare driver penalties with approach and short-game evidence before choosing the next scoring priority.
6. Directional disclaimer: **“Future phases may change as your pattern and on-course evidence change.”**

### Actions and presence

- **Primary action:** “Explore Phase 1.”
- **Secondary action:** inspect a future phase in read-only disclosure; Back.
- **Coach presence:** “Maya's recommended sequence” and a one-sentence rationale.
- **Evidence required:** Phase 1 is evidence-backed; later phases are explicitly directional recommendations.
- **Deliberately omitted:** guaranteed dates, percentage-complete bars, locked future purchases, detailed drills, phase prices, artificial achievement badges.

### Responsive, states, access, and ethics

- **Mobile:** vertical ordered chapters; current/recommended badge includes text; future phases collapsed to purpose only.
- **Desktop:** may use a restrained horizontal-to-vertical editorial path if keyboard/zoom order stays linear; no dashboard cards.
- **Limited data:** three phases are acceptable; never invent a fourth. If sequence is uncertain, show Phase 1 plus “Later priorities will be set after review.”
- **Revised roadmap:** show current version date and a plain explanation of what evidence changed, preserving prior history later.
- **Error:** no motion-dependent sequence; phase content remains readable.
- **Accessibility:** semantic ordered sequence, visible focus, current status not colour-only, reduced-motion equivalent for any reveal, 200% reflow to one column.
- **Ethical risk:** presenting a forecast as a guaranteed path or implying later purchases are required. The disclaimer and future-detail restraint are mandatory.
- **Completion check:** golfer can name the four phases, explain Phase 1's place, and state that later phases may change.

---

## Screen 6 — Recommended first phase

### Purpose and desired response

- **Screen purpose:** explain the immediate coaching objective, coach rationale, golfer commitment, success signals, and exclusions before price.
- **Golfer question:** “Why does Start-Line Control come first, and what would progress look like?”
- **Commercial purpose:** turn the roadmap into a bounded, meaningful unit of coaching that can support a package.
- **Desired emotion:** focused and realistic.

### Information hierarchy and example content

1. Label: **“Recommended first phase.”**
2. Phase title: **“Start-Line Control.”**
3. Objective: **“Make the driver's initial direction more predictable before adding speed.”**
4. Coach rationale:

   > “You do not need a perfect driver swing to move toward breaking 90. A more predictable start gives us a playable pattern to build on and a clearer way to judge whether the change is transferring.”

5. Three progress signals:
   - Mark can explain the setup/face-control task in his own words.
   - More shots begin within Maya's defined start window across repeated practice samples.
   - The severe right-start pattern appears less often before the work moves to the course.
6. Golfer commitment: **one 30–45 minute focused practice most weeks plus a short pre-round rehearsal.**
7. Outside this phase: **no promise to break 90, no full-swing rebuild, and no assumption that range progress has transferred to scoring.**
8. Completion approach: **review evidence after the third coaching session and choose continue, revise, pause, or independent practice.**

### Actions and presence

- **Primary action:** “See the coaching package.”
- **Secondary action:** Back; “Ask Maya about the phase.”
- **Coach presence:** first-person rationale and progress definitions are explicitly coach-approved.
- **Evidence required:** traces to the starting pattern and barrier order; progress signals are future checks, not claims.
- **Deliberately omitted:** price until the phase is understood, drill library, guaranteed outcome/timeline, technical methodology detail.

### Responsive, states, access, and ethics

- **Mobile:** objective and rationale lead; progress signals and commitment follow as short sections; action after exclusions.
- **Desktop:** may pair “Coach's rationale” with “How we will recognize progress,” keeping the reading order and equal prominence.
- **Limited evidence:** use “working first phase” and explain the first session's reassessment; do not show a package if the coach cannot justify it.
- **Low practice availability:** state the constraint and adjust expectations or recommendation; never shame.
- **Accessibility:** progress signals are text, not only icons; expandable technical detail is optional and keyboard operable; no time pressure.
- **Ethical risk:** turning progress signals into guarantees or implying effort failure. Use conditional language and distinguish coach role from golfer commitment.
- **Completion check:** golfer can explain why the phase comes first, what they will contribute, how progress is checked, and what is not promised.

---

## Screen 7 — Coaching-package recommendation

### Purpose and desired response

- **Screen purpose:** present one complete, phase-linked offer with transparent terms.
- **Golfer question:** “What exactly am I being asked to buy, why does it fit, and what will happen at the end?”
- **Commercial purpose:** convert the assessment by making the appropriate coaching container easy to evaluate.
- **Desired emotion:** informed, confident, unpressured.

### Information hierarchy and example content

1. Label: **“Maya's recommended coaching option.”**
2. Package: **“Start-Line Control Coaching Phase.”**
3. Price: **CAD $595** *(synthetic pricing hypothesis)*.
4. Fit explanation: **“Three focused sessions give us enough coaching and repeated evidence to establish, practise, and review the start-line pattern without promising a scoring result.”**
5. Includes:
   - three coaching sessions over an estimated five to seven weeks;
   - one focused practice direction after each session;
   - selected video or observation evidence when useful;
   - a private roadmap that carries the phase context; and
   - an end-of-phase review and next-step recommendation.
6. Important terms for prototype: session length and cancellation/rescheduling terms shown as clearly marked synthetic placeholders to be replaced by a real instructor's current terms before testing a real offer.
7. Evaluation: repeated start-window evidence plus honest course-transfer status.
8. Completion: **review → continue, revise, pause, or practise independently**; no automatic renewal.

### Actions and presence

- **Primary action:** “Review how to begin.”
- **Secondary action:** “Ask Maya a question”; “I want to think about it.”; Back.
- **Coach presence:** recommendation and fit are attributed to Maya; business terms are visibly instructor-owned.
- **Evidence required:** direct connection to Phase 1, not conversion popularity or discount claims.
- **Deliberately omitted:** “most popular” badge, crossed-out price, countdown, package grid, platform upsell, payment simulation.

### Responsive, states, access, and ethics

- **Mobile:** package name, price, fit, inclusions, terms, evaluation, completion, then actions in that order; persistent action may appear only after the content has been encountered and must not obscure alternatives.
- **Desktop:** a restrained package summary may sit beside the phase connection; the commercial panel must not visually outweigh the coach rationale.
- **Long/changed terms:** terms reflow; any change requires current review. Never truncate price or material restrictions.
- **Package unavailable:** keep the recommendation explanation and show “Contact Maya about timing” rather than a dead action.
- **Price missing:** block the primary begin action; do not use “contact for price” in the tested first offer.
- **Accessibility:** price and currency read as text; inclusions use semantic list; actions have distinct names; alternatives receive visible focus and sufficient prominence; 200% zoom uses one column.
- **Ethical risk:** hiding terms or making the recommended option feel mandatory. The wait/question paths and no-auto-renewal statement are required.
- **Completion check:** golfer can state package name, price, inclusions, phase fit, evaluation, what happens at completion, and how to ask or wait.

---

## Screen 8 — Clear next action

### Purpose and desired response

- **Screen purpose:** let the golfer choose an appropriate next step and understand the external handoff without simulating a purchase.
- **Golfer question:** “What can I do now, and what happens if I am not ready?”
- **Commercial purpose:** reduce friction after a clear recommendation while preserving autonomy and recovery.
- **Desired emotion:** in control and certain about consequences.

### Information hierarchy and example content

1. Headline: **“Choose what feels right for your next step.”**
2. Recommended path: **“Begin Start-Line Control”** — “Continue to Maya's existing booking or payment page. Your place is not reserved until you complete that separate process.”
3. Question path: **“Ask Maya a question”** — “Keep this roadmap context with your message.”
4. Wait path: **“Review this later”** — “No countdown or price-pressure message; access remains subject to future approved retention rules.”
5. Independent path: **“Practise independently for now”** — “Use the assessment takeaway Maya approved; ask for clarification if anything is unclear.”
6. Reassurance: **“This prototype will not book, charge, or send anything.”**

### Actions and presence

- **Primary action:** “Continue to Maya's booking page” in the intended real experience; in prototype, “Preview booking handoff.”
- **Secondary actions:** ask, wait, practise independently; Back to package.
- **Coach presence:** route labels and expectations use Maya's contact context; no platform sales copy.
- **Evidence required:** none beyond the approved recommendation; the action must match a current instructor route.
- **Deliberately omitted:** transaction confirmation, saved payment, artificial reservation, countdown, repeated modal, referral.

### Responsive, states, access, and ethics

- **Mobile and desktop:** recommendation leads, but all paths appear in the same decision region without requiring a hidden menu; no swipe gesture is required.
- **External route unavailable:** plain message, “Maya's booking page is unavailable. Ask Maya about timing,” with contact action and roadmap still readable.
- **User chooses wait/independent practice:** confirm the choice neutrally; do not trigger guilt or a persuasive modal.
- **Error:** state what did not happen; never imply payment or message was completed; retry and contact are available.
- **Unauthorized:** no personal content; neutral return/contact.
- **Accessibility:** warn before external navigation, logical focus order, no automatic redirect, no time limit, clear status announcement after a choice.
- **Ethical risk:** using friction or visual hierarchy to hide non-purchase choices. Expert review must compare prominence, focus order, and wording.
- **Completion check:** golfer can identify what happens on every path and can leave or defer without pressure.

---

## Cross-flow state rules

### Limited-data version

The minimum credible conversion story uses: confirmed goal, coach observation, one strength, one priority barrier, a three-phase directional roadmap, justified first phase, current package facts, and clear action. Video, launch-monitor data, handicap, and on-course statistics are optional. Missing evidence must reduce claim strength, not create empty components.

### No recommendation

If goal, evidence, or coach confidence is insufficient, the flow ends after the starting point with:

> “Maya needs one more observation before recommending a structured phase.”

The primary action becomes “Arrange a follow-up conversation.” No package appears.

### Setback content

The first conversion story normally describes a starting condition, not progress. If recent poor performance is emotionally central, acknowledge it without treating it as proof or a sales trigger; use the setback pattern in [ETHICAL_SALES_AND_TRUST_RULES.md](../03_experience_strategy/ETHICAL_SALES_AND_TRUST_RULES.md).

### Privacy and errors

No personal information appears before authorization. Errors never reveal names, goals, scores, media thumbnails, price choices, or coach messages. A neutral retry and coach contact route are available.

## Global ethical and accessibility audit

- [ ] Goal precedes diagnosis and price.
- [ ] Strengths balance limitations.
- [ ] Every material claim has a source and limit.
- [ ] Coach owns the assessment, phases, and recommendation.
- [ ] Future phases are directional, not guaranteed.
- [ ] Package purpose, CAD $595 price, inclusions, terms, evaluation, and completion are visible.
- [ ] Question, wait, decline/independent, failure, and no-recommendation paths are real.
- [ ] No urgency, scarcity, shame, fear, popularity, or hidden term.
- [ ] Full meaning works without video, measurements, colour, sound, or motion.
- [ ] Keyboard, focus, media alternatives, reduced motion, reflow, 200% zoom, and error announcements are specified.
- [ ] Mobile retains the complete story and desktop does not become a dashboard.

## Wireframe completion checklist

- [x] Text specification covers all eight screens and required states.
- [x] Entry from instructor preview/share and the Business Plan V2 self-serve boundary are defined.
- [x] Realistic synthetic content replaces placeholder copy.
- [x] Every screen defines user/commercial purpose, emotion, hierarchy, content, actions, coach presence, evidence, omissions, responsive behaviour, states, accessibility, ethics, and a completion test.
- [ ] Mobile, tablet, and desktop low-fidelity frames drawn.
- [ ] State variants drawn and linked in [SCREEN_STATE_RESPONSIVE_MATRIX.md](SCREEN_STATE_RESPONSIVE_MATRIX.md).
- [ ] Representative instructors and golfers complete the comprehension and ethical-sales test.
- [ ] Aaron records explicit approval of exact frames and version.

The specification is simulated-draft complete. The wireframe artifact, validation, and approval remain missing.

This document is the exact golfer-copy authority for the visual concept defined in [Assumption-Driven Visual Prototype Brief](../06_prototype/ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md). `AUTH-001` permits preparation around its fictional content without treating the scenario, method, price, or design as approved.
