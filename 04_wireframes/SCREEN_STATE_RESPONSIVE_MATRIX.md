# Screen, State, and Responsive Matrix

**CURRENT DRAFT STATUS:** Revised coverage index  
**REAL-WORLD STATUS:** Specifications exist; drawn coverage not verified  
**Depends on:** [Wireframe Workplan](WIREFRAME_WORKPLAN.md), [Self-Serve Instructor Activation](SELF_SERVE_INSTRUCTOR_ACTIVATION.md)

## Status vocabulary

- **Spec complete:** behavior and content are defined in text.
- **Frame missing:** no real low/high-fidelity frame is linked.
- **Test missing:** no representative participant has used the exact version.
- **Policy blocked:** privacy, billing, access, retention, or sharing policy must be resolved before live use.
- **Later:** coherent future lifecycle scope, not in first activation/product decision.

## Flow coverage

| Flow | Text specification | First design priority | Current conclusion |
|---|---|---:|---|
| Acquisition promise/sample/price/signup | [Self-Serve Instructor Activation](SELF_SERVE_INSTRUCTOR_ACTIVATION.md), Steps 1–3 | 1 | Spec complete; frames/tests missing |
| Instructor setup/authoring/preview/share/return | [Self-Serve Instructor Activation](SELF_SERVE_INSTRUCTOR_ACTIVATION.md), Steps 4–12 | 1 | Spec complete; frames/tests missing |
| Golfer post-assessment roadmap | [Post-Assessment Roadmap](POST_ASSESSMENT_ROADMAP.md) | 1 | Golfer spec complete; frames/tests missing |
| Living Player Journey | [Living Player Journey](LIVING_PLAYER_JOURNEY.md) | Later | Specified for recurring-value continuity |
| Phase completion and renewal | [Phase Completion and Renewal](PHASE_COMPLETION_AND_RENEWAL.md) | Later | Specified; evidence missing |
| Milestone and referral | [Milestone and Referral](MILESTONE_AND_REFERRAL.md) | Later | Specified; policy/evidence missing |

## First-product state matrix

| Area | Complete/default | Empty/incomplete | Error/recovery | Narrow-screen rule | Accessibility/trust requirement |
|---|---|---|---|---|---|
| Landing promise | Audience, outcome, mechanism, primary action | Static text still explains value if media absent | Sample/demo failure has text equivalent | Preserve message → how it works → sample → price order | No animation or visual required for meaning |
| Sample | Full synthetic roadmap + coach-input annotations | Text-only, no optional media | Failed rich preview falls back without gating | Narrative order, not thumbnail grid | Synthetic label and media alternatives visible |
| Price/FAQ | Price, inclusion, trial, cancel, pause hypothesis | Unknown policy marked unresolved before approval | No custom-quote fallback | Price and terms precede CTA | Currency, recurrence, and exit understandable |
| Signup | Minimal valid entry | Required fields named | Specific inline + summary; valid input preserved | Single column | Labels, focus, recovery, consent clarity |
| Coach identity | Text identity + optional brand | No logo uses safe default | Invalid asset/accent returns correction | Preview follows input | Contrast-safe fallback; optional means optional |
| Package | Current package + external action | Draft names exact missing content | Invalid link/contact route; no invented terms | Purpose/price/action remain together | External handoff and alternatives clear |
| First golfer | Approved identifier + goal | Goal missing; optional context absent | Privacy-safe duplicate/invalid state | Minimum inputs lead | Data minimization and plain purpose |
| Assessment | Strength, pattern, barriers | Text-only and optional evidence absent | Unsupported/missing claim review | One prompt group at a time | Examples distinguishable from user content |
| Phases | 3–4 phases + first recommendation | Missing purpose or no appropriate recommendation | Non-destructive reorder/edit | Sequence stays readable | Directional status not color-only |
| Preview | Exact golfer order, complete | Optional omission intentional | Material blocker links to edit | Golfer-first narrow preview | Keyboard review and error traversal |
| Share | Recipient/context confirmed | No recipient/context | Failed/pending/duplicate/cancelled, no silent send | Summary before action | Privacy-safe status; no timed pressure |
| Success | Accurate delivery status | Not shown for failed/pending | Retry/edit without false success | One next action | No unobserved sale/revenue claim |
| Return | Recent roadmap + contextual next action | First-roadmap empty or incomplete | Privacy-safe load/recovery | No dashboard grid dependency | Status and actions exposed semantically |
| Trial/paid | Exact account state | Trial end/choice clear | Billing failure policy blocked | State near account action | Explicit paid consent; no hidden conversion |
| Pause/cancel/resume | Clear current state and consequence | No history still explains options | Resume/cancel failure preserves state | One account action at a time | Exit is discoverable and understandable |

## Golfer-flow matrix

| Area | Complete/default | Limited/missing | Failure/alternative | Narrow-screen and access rule |
|---|---|---|---|---|
| Welcome/goal | Coach, golfer, purpose, goal | No media; concise goal | Incorrect goal → contact/correction | Identity and goal lead; text complete |
| Starting point/barriers | Strength, pattern, evidence/limits | Observation-only state | Evidence unavailable or disputed | No raw-data horizontal dependency |
| Roadmap/first phase | Directional phases and rationale | Reduced later-phase detail | No recommendation/reassessment | Sequence stacks with status labels |
| Package | Purpose, inclusions, price/terms | Contact-for-current-details only if truthful | Package unavailable/question/wait/decline | Terms precede action; no sticky obstruction |
| External handoff | Warns what will happen | Direct contact alternative | Invalid/unavailable action | Roadmap remains useful; no transaction simulation |
| Privacy/access | Intended private access | Expired/unauthorized generic state | Correction/contact without data exposure | No personal detail in error state |

## Later-flow account continuity

- A paused instructor account may be read-only under the candidate policy; exact golfer-link behavior is unresolved.
- Cancellation must not be designed as immediate deletion unless policy and consent require it; retention and access remain owner/legal decisions.
- Living journey, renewal, and milestone content must not become unavailable or public through an unclear subscription transition.
- No state here selects production authentication, storage, billing, or delivery architecture.

## Remaining real artifacts

- [ ] Narrow and wide low-fidelity frames for all first-product rows.
- [ ] High-fidelity acquisition/activation and golfer prototype.
- [ ] Keyboard, focus, zoom, narrow-screen, media-alternative, and recovery annotations.
- [ ] Versioned participant results with assistance status.
- [ ] Privacy, consent, billing, retention, cancel, pause, resume, and live-share policies.
- [ ] Aaron approval of exact frame versions.

## Completion checklist

- [x] Discovery, explanation, sample, signup, pricing, onboarding-free authoring, preview, share, activation, paid conversion, retention, cancellation, seasonality, support, and referral implications are represented.
- [x] Required/optional/deferred and failure states are explicit.
- [x] Later lifecycle flows remain separate from first activation.
- [ ] Drawn/tested/approved status remains open.

**DESIGN READINESS STATUS: NOT APPROVED**
