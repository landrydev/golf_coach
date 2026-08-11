# Business Direction Change — Self-Serve SaaS

**Effective date:** 2026-08-03  
**Status:** Authoritative amendment to historical Business Plan V1  
**Owner authority:** Aaron explicitly directed the business-model change captured here. This approval applies to the direction change, not to the simulated pricing, packaging, seasonality, metric targets, or design recommendations that follow from it.

> **Subsequent authority note — 2026-08-07:** `AUTH-005` later retired repository phase gates and authorized full production SaaS implementation for the bounded V1. That later implementation authority does not change this amendment's business direction, approve its labelled hypotheses, or rewrite the 2026-08-03 historical state recorded below.

## Purpose

This amendment records a material change in the intended commercial model for the golf-coaching product. It preserves [BUSINESS_PLAN.md](BUSINESS_PLAN.md) unchanged as historical Business Plan V1 and establishes [BUSINESS_PLAN_V2.md](BUSINESS_PLAN_V2.md) as the current consolidated business source.

When Business Plan V1 and Business Plan V2 conflict, current work must follow Business Plan V2. Historical V1 language may be cited only when it is clearly identified as historical or superseded.

## What changed

The initial business is now a Canada-wide, low-cost, plug-and-play, self-serve B2B SaaS product for individual independent golf instructors.

The long-term commercial experience must allow an instructor to:

1. understand the product without a sales call;
2. create an account without human assistance;
3. configure basic coach identity and branding;
4. define or select a lesson-package recommendation;
5. create a credible first golfer roadmap in the first working session;
6. preview and share that roadmap without custom support;
7. connect the golfer's next step to the instructor's existing booking, purchase, or contact process; and
8. see why continued subscription has commercial value.

The working commercial anchor is **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75 per month per individual instructor**. It is not proven willingness-to-pay evidence and is not an approved final price.

The initial customer is an individual independent instructor or teaching professional, not a golf course, large academy, or multi-coach facility. Small academies, indoor-golf businesses, and multi-coach facilities may become a later self-serve team-tier opportunity, but they are not the initial direct-sales motion.

## Why the previous direction is being superseded

The former workspace assumed a more hands-on business that could rely on founder-led selling, setup, onboarding, custom configuration, higher prices, facility relationships, and a small number of higher-value accounts. Aaron has directed the workspace toward a business capable of serving many individual instructors with low per-account acquisition, setup, and support effort.

This is an owner-directed strategic change. It is **not** presented as a conclusion drawn from completed customer research, validated willingness to pay, or proven unit economics. Those forms of evidence still need to be collected.

The change is intended to make these properties structural rather than optional:

- self-serve discovery, purchase, activation, cancellation, and reactivation;
- standardized product behavior and templates;
- minimal custom configuration and founder involvement;
- low ongoing support requirements;
- a simple monthly subscription;
- Canada-wide distribution rather than dependence on one local market; and
- economics that can work at a low monthly price.

## What remains unchanged

The following Business Plan V1 principles remain current and are carried into Business Plan V2:

- The product helps independent golf instructors sell more lesson packages, renew more golfers, and generate more referrals.
- It sits above the tools and coaching methods instructors already use.
- It does not initially replace coaching methodology, video-analysis tools, launch monitors, booking, payments, communication systems, or effective existing coaching workflows.
- It turns goals, assessment findings, coach observations, swing videos, drills, measurements, lesson history, and progress evidence into a personalized, coach-branded development roadmap and player journey.
- The commercial loop remains assessment → personalized roadmap → initial package purchase → visible progress → phase completion → next-package renewal → referral.
- The first wedge remains assessment → personalized roadmap → recommended first phase → lesson-package decision.
- The golfer experience must build clarity, personal relevance, evidence, coach credibility, visible progress, reduced uncertainty, trust, and a natural next step.
- The golfer must never feel manipulated.
- Coach-owned methodology, vendor neutrality, minimal coach administration, real-world validation, and the prohibition on coding before design approval remain in force.

## Previous assumptions that are no longer authoritative

The following V1-derived or simulated assumptions are superseded wherever they appear as active recommendations:

| Superseded assumption | Current replacement |
|---|---|
| Golf-course, academy, or facility contracts are the primary route to market | Individual instructors are the initial customers; facilities are later expansion candidates |
| Founder-led sales calls or custom proposals are required | Product-led explanation, transparent pricing, and self-serve signup are the default path |
| Managed implementation or mandatory onboarding meetings are normal | Standardized, in-product activation must work without human onboarding |
| Custom branding or bespoke client work is part of the initial offer | Basic coach identity and branding use standardized configuration |
| A setup fee is necessary | No mandatory setup fee in the recommended initial hypothesis |
| Concierge reporting or ongoing high-touch service is required | The product must make the roadmap, progress, renewal, and referral experience repeatable with low support |
| The business depends on a few high-value accounts | The model must support many solo-instructor subscriptions |
| Pricing should be driven mainly by active-golfer counts | One simple per-instructor monthly price is the initial hypothesis |
| The launch can focus on one local market | Self-serve distribution is Canada-wide; research should include relevant Canadian seasonality and regional variation |
| Twelve consecutive paid months can be assumed | Paid months, cancellation, pause, data retention, and next-season reactivation must be measured deliberately |
| Multi-coach facility administration belongs in the first product | Solo-instructor activation and the first roadmap are the initial focus |
| Customer business outcome is also the SaaS company's sole North Star | Coaching revenue per assessed golfer remains a customer-success measure; recurring revenue from activated instructors becomes the candidate company North Star |

Historical entries are not to be deleted from [DECISION_LOG.md](../DECISION_LOG.md). Affected entries must be marked `SUPERSEDED` and linked to their replacements.

## New assumptions requiring validation

The direction is authoritative; the following beliefs are not:

- `[UNVALIDATED BUSINESS ASSUMPTION]` Individual instructors across Canada experience the package-conversion, renewal, and referral problem strongly enough to adopt a separate product.
- `[PRICING HYPOTHESIS — REQUIRES VALIDATION]` CAD $75 per month creates an acceptable value and affordability balance.
- `[UNVALIDATED BUSINESS ASSUMPTION]` A standardized roadmap can still feel sufficiently personal and coach-owned.
- `[UNVALIDATED BUSINESS ASSUMPTION]` Instructors can understand the value from a website, demonstration, and sample roadmap without a live explanation.
- `[UNVALIDATED BUSINESS ASSUMPTION]` Instructors can complete setup and share a first roadmap without human onboarding.
- `[UNVALIDATED BUSINESS ASSUMPTION]` Low-cost acquisition channels can produce enough qualified instructor signups without uneconomical paid advertising.
- `[UNVALIDATED BUSINESS ASSUMPTION]` Support time, media/storage cost, and other variable costs can remain low enough for the price.
- `[UNVALIDATED BUSINESS ASSUMPTION]` A simple cancellation, pause, and reactivation policy can accommodate six-to-eight-month outdoor seasons without excessive revenue loss or customer frustration.
- `[UNVALIDATED BUSINESS ASSUMPTION]` A real package opportunity soon after activation gives the instructor a reason to convert and remain subscribed.
- `[UNVALIDATED BUSINESS ASSUMPTION]` Later team-tier demand can be served without distorting the initial solo-instructor product.

Every one of these assumptions requires behavioral, commercial, operational, or usability evidence before it is treated as validated.

## Documents requiring revision

This change affects the authority, priority, content, sequence, or completion criteria of:

- root navigation and governance: `README.md`, `START_HERE.md`, `MASTER_TODO.md`, `AGENTS.md`, `DECISION_LOG.md`, `OPEN_QUESTIONS.md`, `ARTIFACT_REGISTER.md`, `OWNER_SIMULATION_SUMMARY.md`, `AARON_REVIEW_QUEUE.md`, `DESIGN_READINESS_GATE.md`, `WORKSPACE_DEPENDENCY_MAP.md`, and `FINAL_INVENTORY_AND_AUDIT.md`;
- source control: `00_source/SOURCE_INDEX.md`;
- every document in `01_business_foundation/`, `02_market_validation/`, and `03_experience_strategy/`;
- wireframe planning and any golfer-flow specification whose entry, authoring, sharing, subscription, or return-state assumptions change in `04_wireframes/`;
- the visual system and Figma plans in `05_visual_design/`;
- every non-coded prototype plan in `06_prototype/`;
- every business-validation document in `07_business_validation/`;
- every implementation-handoff document in `08_implementation_handoff/`.

The following new planning artifacts are required:

- [BUSINESS_PLAN_V2.md](BUSINESS_PLAN_V2.md);
- [SELF_SERVE_PRODUCT_STRATEGY.md](../03_experience_strategy/SELF_SERVE_PRODUCT_STRATEGY.md);
- [SELF_SERVE_INSTRUCTOR_ACTIVATION.md](../04_wireframes/SELF_SERVE_INSTRUCTOR_ACTIVATION.md); and
- [SELF_SERVE_SAAS_VALIDATION_PLAN.md](../07_business_validation/SELF_SERVE_SAAS_VALIDATION_PLAN.md).

## Authority and interpretation

1. [AGENTS.md](../AGENTS.md) controls how agents work.
2. This amendment records the authoritative business-direction change effective 2026-08-03.
3. [BUSINESS_PLAN_V2.md](BUSINESS_PLAN_V2.md) is the current consolidated business source.
4. [BUSINESS_PLAN.md](BUSINESS_PLAN.md) remains unchanged historical Business Plan V1.
5. Aaron-approved future superseding decisions must be recorded without erasing history.
6. Simulated owner recommendations remain unapproved until Aaron explicitly reviews them.
7. Research and pilot evidence may support, narrow, or challenge assumptions, but it must not be fabricated or confused with simulation.

## Implementation status

This amendment authorizes planning revisions only. It does not authorize application code, a coded prototype, technical architecture, infrastructure, integrations, or production handling of golfer data.

**DESIGN READINESS STATUS: NOT APPROVED**
