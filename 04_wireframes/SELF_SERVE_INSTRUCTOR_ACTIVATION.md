# Self-Serve Instructor Activation

**CURRENT DRAFT STATUS:** Complete text-based wireframe specification  
**REAL-WORLD STATUS:** No drawn frames or unassisted usability tests completed  
**AARON APPROVAL STATUS:** `AUTH-001` permits assumption-driven visual preparation using this flow; flow decisions and exact frames still require review  
**Depends on:** [Self-Serve Product Strategy](../03_experience_strategy/SELF_SERVE_PRODUCT_STRATEGY.md), [Content Architecture](../03_experience_strategy/CONTENT_ARCHITECTURE.md), [Post-Assessment Roadmap](POST_ASSESSMENT_ROADMAP.md)  
**Decision status:** `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`

## Flow objective

Enable a qualified independent golf instructor to move from first exposure to a credible real golfer share without a sales call, custom proposal, mandatory onboarding meeting, or founder-created content.

The flow must answer:

- What will this help me sell?
- What do I need before I begin?
- Can I use my existing tools?
- How quickly can I create something credible?
- What will my golfer receive?
- Where do I add my package or booking link?
- How do I preview it?
- How do I send it?
- Why should I return and continue paying?

## Activation definition

`[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`

> An instructor creates and shares a complete golfer roadmap connected to a current lesson package, without human onboarding.

The future experience may log intermediate milestones, but none replaces the share event. A founder-authored roadmap, scheduled walkthrough, or manually configured account is assisted beta behavior, not human-free activation.

## Global flow rules

- Show the realistic end result before asking for an account.
- Show **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month per instructor** and essential terms before signup.
- State that current coaching, video, launch-monitor, booking, payment, and communication tools remain.
- Use one primary action per step and preserve a clear back/edit route.
- Mark required, optional, and deferred inputs explicitly.
- Save progress and explain the expected return behavior in the future design.
- Never require logo, media, measurements, academy information, or custom brand work for first value.
- Do not generate coaching judgment or silently select a package.
- Preview the complete golfer experience before share.
- Do not design a complete dashboard; provide only the return state needed for the first loop.

## Step 1 — Marketing-page promise

| Specification field | Definition |
|---|---|
| Instructor question | “What is this, who is it for, and what will it help me sell?” |
| Product answer | A coach-branded roadmap for independent instructors that turns an assessment into a clear first-phase and lesson-package recommendation, while preserving existing tools and methods. |
| Required input | None. The page must communicate value before requesting data. |
| Desired emotion | Relevant, respected, and curious—not targeted by a generic growth claim. |
| Primary action | “See a sample golfer roadmap.” A secondary “Start your trial” may remain visible after the first explanatory block. |
| Friction risk | “Sell more” sounds manipulative; visitor assumes booking, CRM, academy software, or consulting; price and work are hidden. |
| Empty and error state | If the visual demonstration fails, show the same promise, process, and sample in accessible text/static form. Never leave a blank hero or force a call. |
| What must be optional | Video demonstration, animation, testimonials, detailed lifecycle explanation, contact with founder. |
| What can be deferred | Team tier, integrations, complete feature inventory, annual plan, case-study outcome claims. |
| How support is avoided | Plain audience/outcome/mechanism language, a three-step how-it-works preview, explicit “keep your tools” list, readiness list, transparent price and FAQ links. |

### Required message hierarchy

1. “Sell the plan, not another hour.” candidate benefit line.
2. Plain description of assessment → personalized roadmap → first phase/package.
3. “For individual golf instructors across Canada.”
4. “Works above the tools and methods you already use.”
5. Preview of coach input and golfer output.
6. **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month**, no setup fee, cancel path.

## Step 2 — Sample-roadmap preview

| Specification field | Definition |
|---|---|
| Instructor question | “What will my golfer receive, and could this represent my coaching?” |
| Product answer | A realistic synthetic example shows goal, starting point, barriers, phases, first recommendation, package connection, and next action, paired with the small coach inputs that produced each section. |
| Required input | None. Sample access must not be gated by email or a call. |
| Desired emotion | Credible possibility and informed judgment. |
| Primary action | “Create one for a golfer.” |
| Friction risk | Sample looks like bespoke agency work; synthetic result is mistaken for a real customer; instructor cannot see the effort; mobile view hides the package connection. |
| Empty and error state | If rich media is unavailable, show a complete static/text sample. If an optional evidence item is absent, demonstrate the credible text-only state. |
| What must be optional | Interactive transitions, video evidence, metrics, downloadable sample, audio narration. |
| What can be deferred | Living journey, phase completion, referral flow, alternate templates. |
| How support is avoided | Annotate “coach provides” versus “golfer sees,” label synthetic content, expose input count and optional evidence, explain that the coach owns every judgment. |

### Sample completion test

An unexposed instructor can accurately describe the golfer output, required coach work, package connection, and product boundaries without moderator correction.

## Step 3 — Signup

| Specification field | Definition |
|---|---|
| Instructor question | “Can I begin now, what am I agreeing to, and will I be charged?” |
| Product answer | A minimal account entry starts the candidate 14-day no-card trial; **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month** is visible and paid conversion requires an explicit later choice. |
| Required input | Minimum account identity and the minimum consent/terms acknowledgement required by approved policy. Exact fields remain a design/policy question. |
| Desired emotion | Control and low commitment. |
| Primary action | “Create my account.” |
| Friction risk | Unexpected card request, unclear trial end, password or access failure, too many business/facility questions, terms hidden below action. |
| Empty and error state | Specific inline error, preserve non-sensitive valid input, explain account-exists/recovery state without exposing personal data, provide a non-call recovery route. |
| What must be optional | Phone, facility name, number of coaches, sales-call booking, marketing consent. |
| What can be deferred | Billing details until explicit paid choice; extended profile; referral source detail beyond a lightweight optional field. |
| How support is avoided | Short form, requirements shown before submit, clear error language, accessible focus to error summary, obvious sign-in/recovery route, no custom approval. |

`[REAL-WORLD VALIDATION REQUIRED]` Exact account, consent, authentication, billing, and legal content require qualified review; this wireframe makes no technical choice.

## Step 4 — Coach identity and branding

| Specification field | Definition |
|---|---|
| Instructor question | “Can this look like me without becoming a brand project?” |
| Product answer | Start with coach display name, role/contact identity, and an optional logo or restrained brand accent; show the effect immediately in a small preview. |
| Required input | Coach display name and minimum contact/identity information needed for the golfer to know the source. |
| Desired emotion | Ownership without setup fatigue. |
| Primary action | “Save and set up my package.” |
| Friction risk | Logo format failure, unreadable accent, expectation of custom design, uncertainty about how identity appears, blocking on missing brand assets. |
| Empty and error state | Text identity works without a logo. Invalid assets or contrast choices show a safe default and a clear correction; progress is not lost. |
| What must be optional | Logo, portrait, short philosophy, brand accent, extended biography. |
| What can be deferred | Custom fonts, page layouts, multiple brands, facility identity, custom templates. |
| How support is avoided | Sensible default presentation, constrained standard controls, immediate preview, accepted-content guidance, “skip for now” on optional assets. |

## Step 5 — Package setup

| Specification field | Definition |
|---|---|
| Instructor question | “Where does my current lesson package fit, and where will the golfer go next?” |
| Product answer | Define one current package and connect it to an existing booking, purchase, or contact destination. The product presents; it does not process payment or replace booking. |
| Required input | Package name, concise purpose/inclusions, current price or truthful current-details state, and a valid existing next-action route before real share. |
| Desired emotion | Commercial clarity and compatibility. |
| Primary action | “Save package and add my first golfer.” |
| Friction risk | Instructor has no formal package, package terms are incomplete, URL fails, price/currency is unclear, expectation of native checkout or consulting. |
| Empty and error state | Offer an incomplete draft with exact missing items. A valid direct contact route can substitute for booking/purchase. Never invent terms or auto-select a package. |
| What must be optional | Cadence, practice expectation, evaluation detail, secondary terms, alternate contact route. |
| What can be deferred | Multiple-package library, discounts, native payments, calendar integration, package comparison, team pricing. |
| How support is avoided | Short example, package-purpose prompt, link test/preview, plain boundary copy, required-field summary, ability to edit before share. |

## Step 6 — First golfer

| Specification field | Definition |
|---|---|
| Instructor question | “What golfer information is truly needed?” |
| Product answer | Add only the identity needed for the private roadmap, the golfer's desired outcome, and why it matters when known. |
| Required input | Approved golfer display name/identifier and primary desired outcome. Exact privacy/consent fields depend on approved policy. |
| Desired emotion | Focus and respect for privacy. |
| Primary action | “Add the starting assessment.” |
| Friction risk | Product resembles a CRM, requests irrelevant demographics, real consent expectations are unclear, instructor lacks wording for the goal. |
| Empty and error state | A goal is required before share; provide a neutral question prompt, not fabricated copy. Invalid or duplicate context preserves the draft and explains the issue privately. |
| What must be optional | Photo, handicap, typical score, playing context, upcoming event, supporting outcomes. |
| What can be deferred | Address, birth date, broad contact record, family data, full playing history, facility membership. |
| How support is avoided | Explain why each field appears to the golfer, show a short goal example, use progressive disclosure, default to data minimization. |

## Step 7 — Assessment content

| Specification field | Definition |
|---|---|
| Instructor question | “How do I turn my real assessment into a clear starting point without writing a report?” |
| Product answer | Capture a concise strength, primary pattern, and one to three barriers; add selected evidence only when it helps explain the decision. |
| Required input | Starting summary, at least one strength, primary pattern, and one priority barrier. |
| Desired emotion | Professional authorship and restraint. |
| Primary action | “Build the roadmap phases.” |
| Friction risk | Long narrative fields, technical jargon, pressure to fill every evidence type, template copy becoming a diagnosis, shaming language. |
| Empty and error state | Required missing content is named specifically. Optional media/measurements can remain absent with a credible text-only state. Unsupported claims trigger review guidance, not automated coaching correction. |
| What must be optional | Video, photos, launch data, measurements, drills, additional barriers, detailed evidence taxonomy. |
| What can be deferred | Full notes, raw data, media editing/annotation, historical comparisons, automated analysis. |
| How support is avoided | Structured short prompts, one useful example per field, character guidance as a design hypothesis, evidence-source/limit labels, clear “optional” treatment. |

## Step 8 — Roadmap phases

| Specification field | Definition |
|---|---|
| Instructor question | “How do I show a credible sequence and connect what comes first to my package?” |
| Product answer | Name three or four directional phases, explain each purpose briefly, select the first phase, state why it leads and what progress may look like, then confirm the package fit. |
| Required input | Three or four phase names/purposes, first-phase selection, coach rationale, progress signals, and a selected current package. |
| Desired emotion | Coherent plan and control of methodology. |
| Primary action | “Preview the golfer roadmap.” |
| Friction risk | Generic preset is mistaken for methodology, too much future detail, fixed timeline implied, package chosen by the product, instructor cannot reorder or correct. |
| Empty and error state | Show which phase purpose or first-phase connection is missing. Permit editing/reordering without loss. If no package fits, defer share and offer a truthful reassessment/contact state. |
| What must be optional | Exact timelines, later-phase drills, detailed evidence, secondary outcomes, custom imagery. |
| What can be deferred | Template library, drag-heavy planning, branching plans, automated recommendations, multi-coach approval. |
| How support is avoided | Standard structural examples labelled as examples, plain phase-purpose prompts, explicit directional-language cue, visible package connection summary. |

## Step 9 — Preview

| Specification field | Definition |
|---|---|
| Instructor question | “What exactly will my golfer see, and is every claim and link right?” |
| Product answer | Show the full golfer experience in its intended order and responsive context, with a concise completeness/claim/term review and direct edit links. |
| Required input | Explicit coach review/approval of coaching judgments, package facts, and next action before share. |
| Desired emotion | Confidence and accountability. |
| Primary action | “Review sharing.” |
| Friction risk | Preview differs from delivery, errors are hard to locate, mobile layout is ignored, coach skims unsupported claims, missing optional content looks broken. |
| Empty and error state | Block share only for material required content, invalid action, or unresolved access issue. Name each blocker and link to correction. Optional omissions render intentionally. |
| What must be optional | Switching among every device size, media playback, printing/download, alternate visual themes. |
| What can be deferred | Collaborative approvals, version comparison, analytics, custom export. |
| How support is avoided | Exact end-user preview, responsive width controls where useful, review checklist, edit-in-context links, truthful optional-content states. |

## Step 10 — Share

| Specification field | Definition |
|---|---|
| Instructor question | “How do I send this safely, and what happens next?” |
| Product answer | Identify the intended golfer and channel/context, summarize what is being shared, explain access expectations, and provide one clear share action plus cancel/back. |
| Required input | Intended recipient/context and explicit share confirmation under the future approved consent/access policy. |
| Desired emotion | Safe, deliberate action. |
| Primary action | “Share roadmap.” In the non-coded prototype, simulate success without sending anything. |
| Friction risk | Wrong recipient, accidental public link, unclear consent, duplicate sends, disabled external route, expectation that prototype really sends. |
| Empty and error state | No partial or silent success. Preserve the approved roadmap, state whether nothing was sent, and give retry/edit/copy-safe-alternative only when policy permits. Never expose golfer details in an error. |
| What must be optional | Personal message, multiple channels, immediate booking action, share analytics. |
| What can be deferred | Bulk send, automated reminders, public sharing, team delivery, marketing use. |
| How support is avoided | Complete share summary, explicit recipient/context, one confirmation, clear success/failure, duplicate prevention expectation, accessible recovery. |

## Step 11 — Activation success

| Specification field | Definition |
|---|---|
| Instructor question | “Did it work, and what should I do now?” |
| Product answer | Confirm that the specific roadmap was shared, show the golfer's external next action, explain how to correct/update if needed, and identify the next useful product action. |
| Required input | None beyond successful share state. |
| Desired emotion | Accomplishment grounded in real value, not confetti or vanity metrics. |
| Primary action | “View shared roadmap” or “Return to my roadmaps,” depending on test context. |
| Friction risk | Success claims a package sale, unclear share status, product pushes payment/referral before value, user cannot correct. |
| Empty and error state | If share is pending/failed, do not display activation success. State exact status and safe recovery. |
| What must be optional | Create another golfer immediately, share product referral, outcome logging, trial upgrade action before relevant timing. |
| What can be deferred | Engagement badges, social celebration, conversion analytics, automated follow-up. |
| How support is avoided | Name the roadmap and status, give view/edit route, show what the golfer sees next, provide one relevant next action. |

### Success copy boundary

Allowed: “Mark's roadmap is ready in the prototype” or, in a future authorized product, an accurate delivery status.  
Not allowed: “You just won a new package,” “Revenue unlocked,” or any unobserved outcome.

## Step 12 — Return-to-product state

| Specification field | Definition |
|---|---|
| Instructor question | “Where is the roadmap, what needs attention, and why should I come back?” |
| Product answer | A minimal home state shows create another roadmap, find recent drafts/shared roadmaps, continue an incomplete item, and understand account/trial status. Later validated progress/renewal actions may appear when relevant. |
| Required input | None to view owned product state. |
| Desired emotion | Orientation and recurring usefulness. |
| Primary action | Contextual: “Create another roadmap” for an empty/complete state or “Continue first roadmap” for an incomplete state. |
| Friction risk | Complete dashboard sprawl, vanity analytics, academy administration, unclear trial/paid state, missing draft, seasonal pause dead end. |
| Empty and error state | True empty state leads to first golfer; incomplete state leads to exact next required step; loading/error protects privacy; paused state is read-only with clear resume; cancelled state follows future retention policy. |
| What must be optional | Outcome note, later progress update, account referral, help contact. |
| What can be deferred | CRM pipeline, revenue analytics, scheduling, messaging, multi-coach permissions, aggregate facility reports. |
| How support is avoided | One state-based primary action, clear statuses, recent items, account/trial explanation, direct correction/resume route, no hidden administrative model. |

## Cross-flow states that must be drawn

- New visitor, returning visitor, and sample media unavailable.
- New signup, existing account, invalid entry, and recovery.
- No logo, invalid logo, unreadable accent, and safe default.
- No formal package, incomplete package, invalid external link, and contact-route alternative.
- First golfer empty, required goal missing, and optional context absent.
- Text-only assessment, optional evidence present, evidence unavailable, and unsupported-claim review.
- Incomplete phases, no appropriate recommendation, and revised sequence.
- Preview complete, material blocker, optional omission, and narrow-screen review.
- Share ready, cancelled, pending, failed, duplicated, and successful.
- Trial active, explicit paid choice, full-price active, pause candidate, cancelled, and resumed.
- Unauthorized/expired access and privacy-safe generic error.

No production behavior is authorized by naming these states.

## Responsive behavior

- Acquisition explanation, sample, price, and CTA retain order on narrow screens.
- Input steps use one primary column; contextual example/help follows the relevant field rather than forming a competing rail.
- Sticky actions may be explored only when they do not hide errors, terms, keyboard focus, or content.
- Preview defaults to the golfer's likely narrow-screen reading order and allows wider inspection without implying device-specific truth.
- Tables in this text specification must become readable stacked structures in actual small-screen designs.

## Accessibility and content requirements

- Logical headings, labels, instructions, descriptions, and error associations.
- Keyboard operation and visible focus for every control and preview action.
- Error summary moves focus appropriately and does not erase valid input.
- No color-only required/optional, status, evidence, or share meaning.
- Text alternative for sample media and uploaded evidence.
- No timed task, countdown, or motion-only explanation.
- Price, trial, cancellation, pause, privacy expectation, and external handoff remain readable at zoom and narrow widths.
- Plain-language examples are distinguishable from instructor-entered content.

## Measurement annotations for prototype

Record by step:

- entry and exit;
- first click;
- active and elapsed time;
- error, backtrack, and recovery;
- optional fields attempted;
- help opened;
- moderator or founder assistance;
- abandonment reason;
- content completeness and coach-authenticity rating; and
- unaided retell of what happens next.

`[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` Candidate first-session goal: a qualified instructor reaches a credible share within 30 active minutes. The time is a usability hypothesis, not website copy or a validated promise.

## Wireframe completion checklist

- [x] All 12 steps specify instructor question, product answer, required input, emotion, primary action, friction, empty/error, optional, deferred, and no-support mechanism.
- [x] Acquisition, pricing, compatibility, signup, setup, authoring, preview, share, success, return, and seasonal account states are covered.
- [x] Human-free activation is distinct from assisted completion.
- [x] No complete dashboard, team administration, payment processing, or technical architecture is designed.
- [ ] Mobile and wider low-fidelity frames drawn.
- [ ] All critical states linked in [SCREEN_STATE_RESPONSIVE_MATRIX.md](SCREEN_STATE_RESPONSIVE_MATRIX.md).
- [ ] Eight previously unexposed instructors complete unassisted testing.
- [ ] Content, accessibility, privacy, billing, cancellation, and retention policies reviewed.
- [ ] Aaron approves the exact frame version.

The text specification is complete. Drawn artifacts, evidence, policies, and approval are missing.

For the authorized visual concept, use the exact frame boundary and provisional defaults in [Assumption-Driven Visual Prototype Brief](../06_prototype/ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md) and the exact screen language in [Visual Prototype Copy and Content](../06_prototype/VISUAL_PROTOTYPE_COPY_AND_CONTENT.md). Their use does not approve this flow.
