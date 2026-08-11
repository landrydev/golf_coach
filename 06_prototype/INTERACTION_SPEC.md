# Interaction Specification

**CURRENT DRAFT STATUS:** Revised for paired prototypes  
**REAL-WORLD STATUS:** No Figma interaction or test exists  
**AARON APPROVAL STATUS:** `AUTH-001` permits preparation of simulated visual interactions; exact interaction design remains unapproved  
**Depends on:** [Assumption-Driven Visual Prototype Brief](ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md), [Visual Prototype Copy and Content](VISUAL_PROTOTYPE_COPY_AND_CONTENT.md), [Prototype Scope](PROTOTYPE_SCOPE.md), [Screen, State, and Responsive Matrix](../04_wireframes/SCREEN_STATE_RESPONSIVE_MATRIX.md)

## Interaction principles

1. One primary action reflects the current question.
2. Back, edit, wait, cancel, and recovery do not destroy valid work without warning.
3. Optional content is visibly skippable.
4. The product never makes a coaching judgment or package choice.
5. Preview precedes share; value precedes purchase, renewal, or referral.
6. Prototype status is explicit: no real account, send, charge, booking, or pause.
7. Keyboard, narrow-screen, reduced-motion, and no-media paths preserve meaning.

## Acquisition interaction

- Order: promise → mechanism → sample → compatibility → price/inclusion → FAQ → start.
- Primary landing action moves to sample; start may remain secondary after explanation.
- Sample exposes coach input and golfer result through operable disclosure or paired static layout.
- FAQ retains headings/keyboard order and never hides essential terms.
- Start opens simulated signup, not a call calendar.
- Failed sample media falls back to equivalent text/static content.

## Signup and step progression

- Declare required information before submission.
- Validate after meaningful entry, not premature red states.
- Error summary points to relevant fields later; valid non-sensitive input persists.
- Step context explains current/next step but does not equate completion with activation.
- Save/return is annotated; Figma states no account is created.

## Identity and package

- Text identity renders immediately; logo/accent is optional with safe fallback.
- Package groups name, purpose/inclusions, price/terms, and external action.
- Invalid link says nothing will be shared and offers edit/contact alternative.
- Prototype never provides package strategy or invents an offer.

## Assessment and phases

- Prompts request short coach-owned judgments.
- Optional evidence starts absent and can be added/removed without penalty.
- Examples are distinct from entered content.
- Phases can be added/reordered/edited with keyboard-equivalent controls; drag is not required.
- First-phase rationale/progress signals are required and package connection is confirmed, not inferred.

## Preview and share

- Preview shows the exact golfer order/version.
- Summary separates blockers from optional omissions; blockers link to edit.
- Share is unavailable only for named material reasons.
- Share review identifies recipient/context, content, access expectation, and no-real-send status.
- Failure says nothing was sent and preserves draft; duplicate/pending avoids repeated action.
- Success names accurate simulated status but never claims a sale or revenue.

## Return and account states

- Incomplete return leads to unfinished step; complete return leads to new/recent roadmap.
- No analytics, CRM, or academy administration.
- Trial/paid/pause/cancel/resume are concept states with no-real-change labels.
- Pause/cancel review shows price/access/retention/resume before simulated confirmation.
- Exit is not obstructed.

## Golfer narrative

- Goal/starting point precede phase/package.
- Forward/back preserves context and uses specific labels.
- Evidence stays with interpretation/limit; media is optional.
- Phase sequence/directional state remain explicit.
- Package action follows purpose, inclusions, synthetic terms, and alternatives.
- Continue/ask/wait/decline lead to distinct simulated outcomes.
- External handoff warns that nothing is booked or charged.

## State transitions

| From | Trigger | To | Required meaning |
|---|---|---|---|
| Landing | View sample | Sample | Golfer result + coach input |
| Price/FAQ | Start | Signup | Trial/price remains available |
| Invalid field | Correct | Valid step | Error clears; other input retained |
| Package | Continue | First golfer | Package summary persists |
| Assessment | Continue | Phases | Goal/starting context persists |
| Phases | Preview | Golfer preview | Result + blockers/omissions |
| Preview | Review share | Share summary | Context + no-real-send notice |
| Share ready | Simulate | Success | Accurate status only |
| Share failed | Retry/edit | Share/field | Nothing sent; draft retained |
| Success | Return | Minimal home | Recent item + useful action |
| Active | Review exit | Account review | Consequences before confirm |
| Golfer package | Continue | External preview | Advance warning; no transaction |
| Golfer package | Alternative | Choice state | No pressure or punishment |

## Back, restart, responsive behavior, and motion

- Back preserves state; leave warns only for meaningful unsaved synthetic work.
- Restart clearly resets synthetic state and is not account cancellation.
- Narrow acquisition retains order; narrow activation uses one column; help follows field.
- Wide form/preview pairing is allowed only with one coherent reading order.
- Golfer narrative remains linear; wide layouts pair only related content.
- No hover-only content, horizontal drag requirement, sticky obstruction, autoplay, countdown, confetti, or motion-only meaning.
- Reduced motion uses immediate state change with preserved focus/context.

## Accessibility annotations required

- page title/heading hierarchy;
- keyboard/focus order and visible focus;
- control-name intent;
- label/instruction/error association;
- save/share/account status announcement intent;
- target size and pointer alternative;
- zoom/reflow notes;
- media alternatives;
- reduced motion; and
- privacy-safe errors.

## Acceptance checklist

- [ ] Both paths complete without task coaching.
- [ ] Required/optional/deferred content understood.
- [ ] Errors preserve work and enable recovery.
- [ ] Preview and golfer view match.
- [ ] No real operation implied/triggered.
- [ ] Alternatives, cancellation, and pause unobstructed.
- [ ] Keyboard/narrow/no-media/reduced-motion meaning preserved.
- [ ] Coach owns all judgments/package choices.
- [ ] Share success does not imply sale.

No interaction is approved until the exact version is tested and Aaron decides.
