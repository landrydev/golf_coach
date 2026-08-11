# Content Architecture

**CURRENT DRAFT STATUS:** Revised for acquisition, activation, and golfer delivery  
**REAL-WORLD STATUS:** Content model unvalidated  
**AARON APPROVAL STATUS:** Review required  
**Depends on:** [Commercial and Golfer Journey](COMMERCIAL_AND_GOLFER_JOURNEY.md), [Product Boundaries](../01_business_foundation/PRODUCT_BOUNDARIES.md)  
**Decision status:** `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`

## Architecture principle

Content must support three questions in order:

1. **Prospect:** Is this product relevant, credible, compatible, affordable, and possible without help?
2. **Instructor:** What is the minimum coach-owned input needed to create and share the first roadmap?
3. **Golfer:** What do I want, where am I starting, what matters first, why this phase/package, and what may I do next?

The content architecture is a design model, not a database schema or implementation choice.

## Acquisition content hierarchy

| Order | Content object | Required answer | Deferred or optional |
|---:|---|---|---|
| 1 | Audience and problem | Independent instructor; weak assessment-to-package clarity | Segment nuance |
| 2 | Commercial outcome | More appropriate package, renewal, and referral opportunities | Numeric outcome claims until evidence |
| 3 | Product mechanism | Coach inputs → personalized roadmap → golfer decision | Detailed lifecycle modules |
| 4 | Realistic sample | What the golfer receives and what the coach supplied | Interactive behavior if a static sample works |
| 5 | Compatibility | Existing coaching, video, launch, booking, payment, and communication tools remain | Specific integrations |
| 6 | Work required | Identity, package, goal, assessment, barriers, phases, preview, share | Optional media/measurements |
| 7 | Price and inclusion | **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month/instructor**, no setup fee, cancel path | Later team tier and annual plan |
| 8 | FAQ and trust | Trial, support, privacy expectations, seasonality, fit/non-fit | Deep help library |
| 9 | Start action | Self-serve signup or trial | Optional call as secondary help/research |

## Instructor activation objects

### Account and coach identity

- Required: account identifier, coach display name, role or short identity, contact route.
- Optional: logo, photo, short philosophy, brand accent.
- Deferred: custom typography, custom templates, multi-coach roles, facility hierarchy.

### Package

- Required before share: package name, phase purpose or fit, current price/currency or a truthful contact-for-current-details state, material inclusions, existing next-action destination.
- Optional: cadence, practice expectation, evaluation point, concise terms.
- Deferred: native checkout, inventory, discount engine, package comparisons, revenue tracking integration.

### Golfer profile

- Required: preferred display name or approved identifier, desired outcome, why it matters when available.
- Optional: relevant playing context, constraints, typical score/handicap if coach and golfer use it.
- Deferred: broad demographics, full CRM record, irrelevant personal history.

### Assessment

- Required: concise starting statement, at least one strength, primary performance pattern, one to three priority barriers.
- Optional: zero to three selected evidence items with source and limit.
- Deferred: raw measurement inventory, full video library, automated diagnosis.

### Roadmap

- Required: three or four directional phases, first-phase purpose, coach rationale, progress signals, package connection.
- Optional: later-phase detail, practice commitment, selected supporting evidence.
- Deferred: fixed timeline promise, exhaustive curriculum, automated prescription.

### Preview and share

- Required: complete golfer-order preview, missing-critical-content check, coach confirmation, intended recipient/context, clear share action, edit path.
- Optional: short personal note.
- Deferred: bulk delivery, campaigns, public sharing, academy distribution.

## Golfer-facing narrative objects

| Object | Owner | Required meaning | Content restraint |
|---|---|---|---|
| Coach identity | Instructor | Who made the judgment and how to contact them | Basic brand only |
| Golfer goal | Golfer, confirmed by coach | Desired outcome and personal reason | One primary goal |
| Starting point | Coach | Strengths, current pattern, evidence basis and limits | Concise, non-shaming |
| Barrier | Coach | What most affects the goal and why | One primary + up to two supporting |
| Roadmap phase | Coach | Directional purpose and sequence | Three or four phases |
| Recommended first phase | Coach | Why it leads, what work occurs, what progress may look like | One current recommendation |
| Package | Instructor | Commercial container, inclusions, price/terms, evaluation | One lead package |
| Next action | Instructor, chosen by golfer | Buy/book/contact plus ask/wait/decline | No manipulative urgency |
| Evidence item | Source + coach interpretation | What was observed and what it supports | Zero to three in first story |
| Progress/completion | Coach | What changed, reliability, limits, what remains | Later lifecycle only after validation |
| Share/referral | Golfer choice | What leaves private context and why | Separate, granular actions |

## Evidence taxonomy

Use clear source labels where material:

- coach-observed;
- measured, with relevant context;
- golfer-reported;
- on-course recorded;
- early indication;
- repeated in practice;
- reliable under variation;
- transferred to course; and
- reflected in scoring.

Do not present the taxonomy as an automated performance scale. The coach chooses the truthful label.

## Required content states

Every relevant object must specify:

- complete;
- optional absent;
- required missing;
- draft/incomplete;
- invalid or conflicting;
- corrected or revised;
- unavailable external action;
- limited-data/media alternative;
- unauthorized or expired access;
- paused account;
- cancelled account and retention explanation; and
- resumed account.

## Plain-language and length rules

- Lead with the answer to the user's current question.
- Use coach language a golfer can retell; explain necessary technical terms.
- Separate observation, interpretation, plan, and commercial terms.
- Use examples as structure guidance, never as default coaching truth.
- Keep optional prompts collapsed or secondary until needed.
- Test short, typical, and extreme truthful content.
- Do not use “AI,” automation, or methodology claims that have not been authorized.

## Source and approval rules

| Content | Source/owner | Required confirmation |
|---|---|---|
| Marketing business outcome | Current business plan plus real evidence | No numeric claim without evidence and owner approval |
| Price and policy | Owner-approved offer version | Working values stay labelled as hypotheses |
| Coach identity and package | Instructor | Current before sharing |
| Golfer goal/context | Golfer report or coach record | Respectful and accurate |
| Assessment, barriers, phases | Instructor | Explicit coach approval |
| Progress and completion | Instructor plus evidence | Claim strength matches evidence |
| Shareable content | Coach source approval + golfer selection | Granular consent under future policy |

## Validation

- `[REAL-WORLD VALIDATION REQUIRED]` Test acquisition hierarchy through unaided retell.
- `[REAL-WORLD VALIDATION REQUIRED]` Map at least 12 real assessment workflows to the activation objects.
- `[REAL-WORLD VALIDATION REQUIRED]` Test empty, missing, error, save/return, pause, cancel, and resume content.
- `[REAL-WORLD VALIDATION REQUIRED]` Obtain qualified review for privacy, consent, retention, deletion, billing, and sharing before real use.

## Aaron review decision

Aaron should review the three-layer architecture, required/optional/deferred rules, acquisition hierarchy, package requirements, evidence taxonomy, and account states. This is not a technical data model.
