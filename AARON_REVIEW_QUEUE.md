# Aaron Review Queue — Self-Serve SaaS

**CURRENT STATUS:** `AUTH-005` implementation authority recorded; exact Sites version 16 remains owner-only as a private staging/evidence deployment with Checkout disabled and degraded deep health, but `TECH-006` supersedes Sites as the final paid live-V1 host. Direct Cloudflare Workers/D1/R2 is the least-change migration candidate for verification only—not deployed, public, or accepted. `LOG-PRIV-001`, external hosting/auth/account dependencies, signed-in hosted retests, policy/operator inputs, and exact-release decisions remain pending; `OWNER-SEC-001` remains completed historical remediation  
**PURPOSE:** Give Aaron a sequenced set of explicit approve/reject/modify decisions without inferring product validation, policy approval, public authority, or release acceptance.

## Decision method

For each item record in [DECISION_LOG.md](DECISION_LOG.md):

- `APPROVE`, `REJECT`, or `MODIFY`;
- exact replacement wording/value if modified;
- rationale;
- scope and affected artifacts;
- date;
- evidence reviewed; and
- revisit trigger.

Approval of a price or strategy does not validate it. Approval of a planning artifact does not approve a design, alter `AUTH-005`, or accept an implemented release.

## Current release decision queue

The exact decision packets, proposed wording, prerequisites, and consequences of deferral live in [Owner Release Decisions Required](10_production_saas/docs/OWNER_RELEASE_DECISIONS_REQUIRED.md). This queue takes priority over the historical `AQ-*` planning sequence for the current owner-only Sites staging/evidence deployment and the un-deployed direct-Cloudflare migration candidate.

`OWNER-SEC-001` is no longer a pending owner decision. Aaron authorized it on 2026-08-08, and one provider rotation completed successfully. The provider contract invalidated the prior current value, the replacement was not displayed, persisted, or used, and owner-only access remained unchanged. The original value was not replayed, and a normal signed-in owner application test remains pending because no browser was available. The repeated continuation instruction did not trigger a second operation: no bypass credential was generated, read, rotated, displayed, persisted, or used for v16. Those are release-evidence tasks, not another authorization request.

`TECH-006` records the current official hosting constraint. OpenAI Sites guidance explicitly says financial transactions must not be enabled, data residency is unavailable at launch, and some background-service or hosting patterns are unsupported. With `LOG-PRIV-001` and unproved cron execution, Sites is retained only as private owner-only staging/evidence and is superseded as the final paid live-V1 host. Direct Cloudflare Workers/D1/R2 is selected under `AUTH-005` only as the least-change migration candidate to verify; official Cloudflare documentation supports direct Cron Triggers and `invocation_logs=false`, but neither control is treated as effective until a new exact hosted release proves it. No Cloudflare account creation, credential use, charge, domain/public-access change, public-auth provider choice, production-data migration, or release acceptance is authorized or inferred.

| Order | Decision | Current readiness | What Aaron decides |
|---|---|---|---|
| 1 | `OWNER-SCOPE-001` product/design/content baseline | Ready for review | Approve, modify, or defer the exact bounded version-16 baseline and its recorded exclusions/conditions; the nine version-9 local synthetic Chrome captures are predecessor evidence only for unchanged renderer/layout portions, not exact-version-16 hosted behavior, failure/recovery contract, accessibility, usability, or outcomes. |
| 2 | `OWNER-OPS-001` operators and contacts | Prerequisite inputs missing | Name the operating entity/people, authorized privacy data-request operators, public support/privacy contacts, incident route, and ongoing responsibilities; authorize secure operator allowlist/pepper provisioning without recording secret material here. |
| 3 | `OWNER-COMM-001` offer and account consequences | Prerequisite inputs missing | Approve the exact CAD offer, Stripe Product/Price, trial, tax, refund, failure, cancel, pause/resume, and entitlement/data consequences. |
| 4 | `OWNER-PRIV-001` privacy, consent, and retention | Prerequisite qualified review/inputs missing | Approve the exact consent policy text, policy version, required-consent choices, versioned notices, golfer authority, retention/deletion/backup-expiry schedule, and data-request procedure after suitable Canadian review. |
| 5 | `OWNER-MEDIA-001` text-first exclusion | Ready for decision | Keep media excluded from V1 or authorize a later complete policy/control/evidence packet; the current candidate has no media flow. |
| 6 | `OWNER-PROD-001` origin/providers/access | Direct Cloudflare migration candidate selected; external authority/evidence missing; `LOG-PRIV-001` High/open | Supply or approve the exact Cloudflare account, credential authority, budget, domain, and cost/alert owner; select and approve a public OIDC provider and identity/session policy; require provider terms/privacy and data-residency review. Before any access expansion, accept only a new exact deployment that proves privacy-safe log enforcement and retained-data disposition, cron/heartbeat/alerts, backup/restore/rollback, authenticated journeys, and controlled billing. This decision does not authorize account creation, a charge, public access, auth-provider selection by the agent, data migration, or acceptance. |
| 7 | `OWNER-VALIDATION-001` controlled real operation | Prerequisites missing | Authorize exact adult participants, access, consent/policy, support, data, stop triggers, and any bounded transaction only after prerequisites pass. |
| 8 | `OWNER-ACCEPT-001` exact-release acceptance | Final only | Accept, conditionally accept, modify, or reject one exact release/configuration after the complete evidence packet is reviewed. |

Until these decisions and their prerequisite evidence exist, keep Sites owner-only as private staging/evidence, application access fail-closed, Checkout disabled, media/juniors/public discovery/outbound messaging absent, and all use synthetic. Do not create or configure a Cloudflare account, credentials, domain, public OIDC provider, public access, production-data migration, or billing operation under `TECH-006`. `LOG-PRIV-001` must be remediated on a new exact hosted candidate before any controlled real-user or public operation. Do not rely on either the Sites-packaged cron or documented direct Cloudflare controls until hosted trigger, privacy, heartbeat, and alert operation are proved. The absent owner-approved consent policy configuration and operator digest allowlist/pepper intentionally leave deep health degraded; do not treat implementation defaults as approval. **[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]**

## Historical `AUTH-001` context

Aaron authorized preparation of the documents needed for an assumption-driven **visual and experience prototype**, not a usable MVP. The concept may use the candidate answers below as provisional prototype inputs without waiting for individual decisions.

`AUTH-001` does not mark any `AQ-*` item approved. It does not approve the resulting visual artifact, research protocol, policy, design-readiness gate, technical choice, coded prototype, or application code. The frozen concept assumptions and exact copy are in [Assumption-Driven Visual Prototype Brief](06_prototype/ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md) and [Visual Prototype Copy and Content](06_prototype/VISUAL_PROTOTYPE_COPY_AND_CONTENT.md).

## Historical AQ-01–AQ-10 planning queue

These questions remain useful unresolved planning inputs where a current owner decision has not superseded them. They are no longer the production implementation-authority sequence and must be routed through the current release decisions above when they affect the exact candidate.

### AQ-01 — Solo plan inclusion

**Proposal:** `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` Offer one Solo Instructor plan with one coach identity, standard branding/templates, package/link setup, preview/share, and unlimited roadmaps/active golfer records within ordinary solo use. No setup fee, custom quote, call, or long contract.

**Why first:** Inclusion defines price presentation, activation, support, cost measurement, prototype copy, and later scope.

**Aaron chooses:** approve / define a specific transparent allowance / modify included capabilities. Do not introduce multiple launch tiers without a reason.

**Primary files:** [Pricing and Offer](07_business_validation/PRICING_AND_OFFER_HYPOTHESES.md), [Business Model](01_business_foundation/BUSINESS_MODEL_AND_METRICS.md).

### AQ-02 — Primary price anchor

**Proposal:** **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75 per month per individual instructor**.

**Why now:** The website, research, trial, unit economics, and seasonality tests need one honest anchor.

**Aaron chooses:** approve as the primary validation anchor / change the test amount / define the evidence required before any live offer.

**Important:** This is not willingness-to-pay proof or an approved final market price.

### AQ-03 — Trial

**Proposal:** `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` 14-day no-card trial, complete activation loop, price visible before signup, explicit paid choice, no sales call.

**Tradeoff:** Low friction and ethical conversion versus low-intent signups and instructors with no assessment opportunity during the window.

**Aaron chooses:** approve / direct-paid comparison / different trial length or qualification / no trial.

### AQ-04 — Seasonality policy

**Proposal:** Month-to-month **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month**, cancel anytime, optional read-only pause at **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $15/month** for up to six months, annual billing deferred.

**Tradeoff:** Continuity/reactivation versus extra policy/fee complexity.

**Aaron chooses:** cancel/reactivate only / pause model / read-only model / annual option / combination, plus what evidence triggers revision.

**Policy dependencies:** data/link access, retention/deletion, reminders, billing, refunds, tax, and resume.

### AQ-05 — Activation event and time hypothesis

**Proposal:** An instructor creates and shares a complete roadmap tied to a current package without human onboarding. Candidate first-session target: 30 active minutes or less.

**Why:** Share is the first value-bearing event; a time target makes plug-and-play falsifiable.

**Aaron chooses:** approve event / change completeness or share definition / change or remove time target. Any time remains a usability hypothesis.

### AQ-06 — First product and design scope

**Proposal:** Minimum acquisition explanation/sample/price/signup; identity/package setup; golfer/assessment/phases; preview/share/success/minimal return; golfer roadmap; essential trial/paid/cancel/pause/resume states. Exclude complete dashboard, later lifecycle, teams, native transactions, integrations, and technical expansion.

**Why:** Conversion-only scope cannot test self-service; broad scope dilutes the wedge.

**Aaron chooses:** approve / narrow / modify, naming the exact first-loop endpoint.

### AQ-07 — Product-led acquisition model

**Proposal:** Clear landing/sample/price/FAQ plus founder educational content, instructor communities, associations, complementary-tool partnerships, referrals/word of mouth, search learning, and direct outreach into self-serve signup. Paid ads deferred.

**Why:** **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month** cannot support an unmeasured enterprise sales motion.

**Aaron chooses:** approve initial channel order / choose 2–3 channels for first tests / define CAC evidence before paid ads.

### AQ-08 — North Star and economic thresholds

**Proposal:** trailing-12-month seasonalized recurring revenue from activated instructors; before a full year report cohort MRR, activated paid instructors, and paid months.

**Candidate thresholds:** 8 full-price months/year, ≥80% gross margin, ≤10 support minutes/account/month, ≥80% human-free activation among activated, ≥40% qualified signup-to-activation, ≥20% trial-to-paid, ≤4 full-price months CAC payback, ≥40% eligible reactivation.

**Aaron chooses:** approve/modify metric and each threshold before any results. All figures are simulated decision thresholds, not benchmarks.

### AQ-09 — Validation sequence and gates

**Proposal:** 12 instructor + 12 golfer discovery; 8 unexposed activation tests; 10 golfer + 5 authenticity tests; 5–8 assisted beta; design gate; post-gate self-serve beta with at least 15 instructors; scaled/seasonal cohorts later.

**Why:** Separates founder-assisted learning from actual self-serve proof.

**Aaron chooses:** approve samples/order/stop rules / modify with rationale / specify prerequisites for real offers and data.

### AQ-10 — Visual direction and paired prototype

**Proposal:** Calm Product Utility for instructor tasks plus Quiet Editorial Performance Portfolio for golfer stories, in a governed 14-page Figma plan; paired acquisition/activation and golfer prototype.

**Why:** A bespoke-looking golfer artifact must still be achievable through a standardized low-cost product.

**Aaron chooses:** approve direction for exploration / modify modes / provide liked/disliked references / approve paired prototype coverage. No exact design is approved without a versioned artifact.

**Current preparation status:** `AUTH-001` permits preparation for one assumption-driven visual concept using these modes and paired coverage. It does not resolve this approval decision or itself request creation of the Figma artifact.

## Historical AQ-11–AQ-27 continuation

### AQ-11 — Initial customer screen

Review required/strong-fit/exclusion criteria, Canada-wide context, and boundary participants in [TARGET_CUSTOMER.md](01_business_foundation/TARGET_CUSTOMER.md).

### AQ-12 — Product descriptor and benefit line

Review “coach-branded golf development roadmap” and “Sell the plan, not another hour.” Confirm ethical tone and unaided-comprehension test.

### AQ-13 — Nine experience principles

Review acquisition, activation, golfer meaning/evidence/coach ownership, one priority, earned actions, truth, privacy/access/exit.

### AQ-14 — Instructor effort/support boundaries

Review candidate 10-minute minimum setup, 15-minute roadmap, 30-minute first-share, and ≤10 support minutes/account/month. All require direct timing.

### AQ-15 — Content minimums

Review required/optional/deferred identity, package, golfer, assessment, evidence, phase, preview, and share content.

### AQ-16 — Ethical subscription and golfer-sales rules

Review transparent trial, charge, cancellation, pause, data consequences, package alternatives, pressure stops, and claim responsibility.

### AQ-17 — Research consent and evidence protocol

Approve participant handling, adults-only boundary, artifact versioning, assistance classification, and no-identifiable-data rule before recruitment.

### AQ-18 — Competitor review scope

Approve categories/scenarios for current primary-source teardown, including self-serve acquisition/onboarding/cancel/seasonality patterns.

### AQ-19 — Synthetic Mark/Maya scenario

Review fictional identities, assessment facts, four phases, CAD $595 coach package, future CAD $745 package, and method neutrality. These are not platform prices.

### AQ-20 — Prototype acceptance limits

Review all PA thresholds, zero-critical rule, assistance exclusions, and one consolidated revision/retest boundary.

### AQ-21 — Assisted beta offer and sample

Approve 5–8 core instructors, how any compensation/free access is described, actual price test conditions, and intervention reporting.

### AQ-22 — Privacy/access/sharing policy work

Authorize qualified advice and decide roles, consent, correction, media, access, sharing, revocation, retention, deletion, incident, and withdrawal behavior before real use.

### AQ-23 — Billing/cancellation/pause policy work

Decide future tax, trial conversion, billing timing, failure, refund, proration, cancel, pause, link access, reminder, and resume questions after qualified review.

### AQ-24 — Accessibility target

Review WCAG 2.2 AA candidate target, stronger focus/target goals, and testing protocol; legal applicability/conformance remain professional/real work.

### AQ-25 — Later lifecycle entry gates

Review when living journey, phase completion/renewal, milestone, and referral can enter scope.

### AQ-26 — Team-tier revisit trigger

Define the repeated demand/solo-evidence threshold needed before small academy/multi-coach design work begins.

### AQ-27 — Design readiness

Historical disposition: `AUTH-003` later authorized the bounded local prototype and `AUTH-005` retired the repository gate as an implementation restriction. Do not use [DESIGN_READINESS_GATE.md](DESIGN_READINESS_GATE.md) to authorize or block current engineering. Exact product/design/content review now routes to `OWNER-SCOPE-001`; exact live-release acceptance routes to `OWNER-ACCEPT-001` and still requires the applicable evidence.

## Current decision boundary

- `AUTH-005` authorizes bounded engineering and the selected Sites/Vinext, D1, R2, SIWC, Stripe, capability-sharing, and external coach-action decisions are recorded in [DECISION_LOG.md](DECISION_LOG.md). Aaron need not re-authorize ordinary in-scope implementation work.
- Final willingness-to-pay or market-size claims without evidence.
- Live junior-golfer scope without safeguarding/consent work.
- Facility enterprise motion as an unrecorded exception.
- An exact price, policy, public-access change, participant/data operation, unspecified charge, production credential action, residual-risk acceptance, or release acceptance without the applicable current decision and evidence.

## Current conclusion

`DIR-001` is the authoritative self-serve business direction and `AUTH-005` authorizes the bounded production implementation. Exact Sites version 16 at runtime commit `91f37ebd542774779f6db7e000832c2f6714e528`, saved version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_0a4d7dc3d8108191aa4a1b3e14051a96`, successful deployment `appgdep_6a7826b2f4c481919cc85665dffa2391` at `2026-08-09T07:05:36.176024Z`, and environment revision 18 remains private owner-only staging/evidence at `https://roadmap-golf-coaching.aar-landry.chatgpt.site`. Checkout remains disabled. Its recorded 346/346 verification, normalized supply evidence, and local-only recovery/capacity results remain valid within their stated limits, but they do not prove hosted recovery, scheduler, alerts, browser/manual operation, or public suitability. `LOG-PRIV-001` remains High/open; `SEC-001`, `SEC-002`, and `AUTH-EVID-001` remain pending. `OWNER-SEC-001` remains completed history, and no bypass credential was generated, read, rotated, displayed, persisted, or used for v16.

Under `TECH-006`, current official Sites constraints supersede Sites only as the final paid live-V1 host; `TECH-001` and `TECH-005` remain preserved architecture and containment history. Direct Cloudflare Workers/D1/R2 is the least-change migration candidate for verification, not a deployed, public, paid, production-data, or accepted release. Closure still requires authorized Cloudflare account/credentials/budget/domain, an approved public OIDC provider and policy, provider terms/privacy review, and a new exact deployment with log, cron, backup, restore, rollback, authenticated-journey, accessibility, alert, and controlled-billing evidence. The `OWNER-*` queue remains pending, and no implementation decision counts as owner approval or validation.

**IMPLEMENTATION AUTHORITY: GRANTED; CURRENT OWNER RELEASE DECISIONS AND EXACT-RELEASE ACCEPTANCE: PENDING**
