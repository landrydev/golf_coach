# Workspace Dependency Map

**CURRENT STATUS:** Production implementation authorized under `AUTH-005`; exact Sites version 12 is deployed successfully owner-only with degraded deep health and remains unaccepted; golfer-response idempotency/recovery, exact archive verification, and normalized reproducibility are recorded with hosted supported-browser retest pending  
**PURPOSE:** Show how a change propagates and why implementation authority, evidence, owner decisions, public operation, and release acceptance remain distinct.

## Authority chain

```text
AGENTS.md
  records AUTH-005, source precedence, and current safety/owner-input boundaries
        ↓
Business Direction Change (effective 2026-08-03)
  establishes owner-directed self-serve model
        ↓
Business Plan V2
  current business authority
        ↓
Decision Log
  preserves history + records AUTH-005 and selected production decisions
        ↓
Full Live Implementation Goal Brief + bounded V1 requirements/non-goals
        ↓
selected architecture + production application + migrations + controls
        ↓
exact automated, hosted, manual, operational, and real-world evidence
        ↓
Owner Release Decisions Required + residual-risk disposition
        ↓
Aaron acceptance of one exact release for its stated operating scope
```

`AUTH-005` supplies production implementation authority; the historical design gate no longer sits in this authority chain. Missing evidence or owner decisions limit the affected live/public/paid claim but do not block safe bounded engineering.

[Business Plan V1](00_source/BUSINESS_PLAN.md) remains historical and unchanged. It does not override V2 where incompatible.

## Production-completion and validation paths

The current production-completion path is:

```text
AUTH-005 production authority
        ↓
bounded Canada-wide solo-instructor V1 implementation
        ↓
exact post-commit automated, integrity, capacity, and synthetic recovery evidence
        ↓
exact owner-only Sites candidate and immutable release record
        ↓
approved consent/operator configuration + remaining hosted, manual, policy, operational, and real-user evidence
        ↓
Aaron's dated acceptance of one exact release and operating scope
```

The separate product/commercial validation path remains:

```text
solo-instructor problem discovery
        ↓
unaided acquisition message + realistic sample + price comprehension
        ↓
low-fidelity signup/setup/authoring/preview/share
        ↓
low-fidelity golfer roadmap/package decision
        ↓
dual visual direction + required patterns/states
        ↓
paired non-coded prototype
        ↓
unassisted instructor + golfer testing
        ↓
assisted beta with every intervention logged
        ↓
privacy/access/billing/seasonality policy decisions
        ↓
exact versioned evidence + owner decisions
        ↓
authorized controlled true self-serve beta
        ↓
product-led/seasonal cohorts and later team-tier evidence
```

Engineering evidence cannot replace real-user or commercial evidence. Founder-assisted research can inform earlier steps but cannot jump the validation chain or prove self-service.

### Historical prototype-preparation branch

`AUTH-001` created a bounded exploratory branch in the 2026-08-03 planning state: the visual concept could use frozen prototype-only assumptions before the `AQ-*` questions were answered. That branch can expose and clarify questions, but it cannot jump from visual plausibility to evidence or approval. Its former implementation restriction was later superseded by `AUTH-003`/`AUTH-004` for the local prototype and by `AUTH-005` for production.

```text
AUTH-001
  ↓
visual-prototype brief + exact copy
  ↓
assumption-driven non-coded Figma concept
  ↓
Aaron critique / later exact decision

No path from this branch independently authorizes code; current production authority comes from AUTH-005.
```

`AUTH-002` added a prepared implementation prompt after that historical branch:

```text
visual brief + copy + exact owner code authority
  ↓
historical DESIGN_READINESS_GATE preflight
  ↓ only if approved
local React/Node interactive rendering
  ↓
Aaron prototype-MVP review
  ↓ only after a new authorization
security and formal testing phases
```

This chain records the authority in force when `AUTH-002` was written; it is not the current production execution path. React/Node in that prompt was limited to the prototype rendering and created no production-stack precedent. The Sites/Vinext/React production selection was later recorded independently under `TECH-001` and `AUTH-005`.

## Source and governance dependencies

| Document | Informs | Authority rule |
|---|---|---|
| [AGENTS.md](AGENTS.md) | Entire workspace | Operational authority; authorizes bounded production work under `AUTH-005` and prohibits owner-decision inference |
| [Business Direction Change](00_source/BUSINESS_DIRECTION_CHANGE_SELF_SERVE_SAAS.md) | V1→V2 interpretation | Authoritative amendment |
| [Business Plan V2](00_source/BUSINESS_PLAN_V2.md) | All current strategy/design/validation | Current business source; labels preserve hypotheses |
| [Business Plan V1](00_source/BUSINESS_PLAN.md) | Historical context | Preserved; incompatible assumptions superseded |
| [Source Index](00_source/SOURCE_INDEX.md) | Labels and precedence | Controls fact/evidence/simulation distinction |
| [Decision Log](DECISION_LOG.md) | Every material choice and owner authorization | `DIR-001` and `AUTH-005` current; `AUTH-001`–`AUTH-004` preserve prototype history; commercial hypotheses remain unapproved |
| [Aaron Review Queue](AARON_REVIEW_QUEUE.md) | Owner sequence | Current release decisions first; historical `AQ-*` questions retained and routed |
| [Evidence Log](02_market_validation/EVIDENCE_LOG.md) | Research traceability | Real behavior only; no simulation as evidence |
| [Artifact Register](ARTIFACT_REGISTER.md) | Artifact existence/status | Registers production candidates/evidence without implying design approval or release acceptance |

## Business-foundation dependencies

| Document | Primary inputs | Primary consumers |
|---|---|---|
| [Product Definition](01_business_foundation/PRODUCT_DEFINITION.md) | V2 | ICP, value, boundaries, strategy, design |
| [Target Customer](01_business_foundation/TARGET_CUSTOMER.md) | Definition + owner direction | Recruitment, acquisition message, beta eligibility, pricing |
| [Value Proposition](01_business_foundation/VALUE_PROPOSITION.md) | Definition + ICP | Landing/sample, interviews, visual, prototype |
| [Business Model and Metrics](01_business_foundation/BUSINESS_MODEL_AND_METRICS.md) | V2 + value | Pricing, validation, measurement, go/no-go |
| [Product Boundaries](01_business_foundation/PRODUCT_BOUNDARIES.md) | Definition + self-serve constraints | All scopes, states, prototypes, implementation, traceability, and release review |

Any customer, price, activation, seasonality, or business-model change propagates across all five.

## Market-evidence dependencies

| Document | Uses | Returns evidence to / can change |
|---|---|---|
| [Research Plan](02_market_validation/RESEARCH_PLAN.md) | ICP, hypotheses, metrics | Evidence Log; ICP, offer, stages, scope |
| [Instructor Guide](02_market_validation/INSTRUCTOR_INTERVIEW_GUIDE.md) | Recent workflow + self-serve/season questions | Segment, inputs, message, price, support, seasonality |
| [Golfer Guide](02_market_validation/GOLFER_INTERVIEW_GUIDE.md) | Golfer journey/ethics | Narrative, package, evidence, trust, later lifecycle |
| [Competitor Scorecard](02_market_validation/COMPETITOR_TEARDOWN_SCORECARD.md) | Current primary sources | Differentiation, acquisition/onboarding patterns, boundaries |
| [Evidence Log](02_market_validation/EVIDENCE_LOG.md) | Versioned observations | Decision Log and every downstream revision |

New evidence enters the Evidence Log before it changes a recommendation.

## Experience-strategy dependencies

| Document | Primary role | Main consumers |
|---|---|---|
| [Self-Serve Product Strategy](03_experience_strategy/SELF_SERVE_PRODUCT_STRATEGY.md) | Acquisition, activation, retention, support, team deferral | Wireframes, Figma, prototype, validation, handoff |
| [Experience Vision](03_experience_strategy/EXPERIENCE_VISION.md) | Dual instructor/golfer outcome | Principles, visual direction, critique |
| [Experience Principles](03_experience_strategy/EXPERIENCE_PRINCIPLES.md) | Nine tradeoff rules | Every screen/state/test |
| [Commercial and Golfer Journey](03_experience_strategy/COMMERCIAL_AND_GOLFER_JOURNEY.md) | Connect SaaS and golfer loops | Content architecture, wireframes, metrics |
| [Content Architecture](03_experience_strategy/CONTENT_ARCHITECTURE.md) | Required/optional/deferred content | Activation, golfer frames, copy, handoff |
| [Coach Effort and Support](03_experience_strategy/COACH_EFFORT_MODEL.md) | Time/support hypotheses | Activation, prototype, beta, economics |
| [Ethical Sales and Trust](03_experience_strategy/ETHICAL_SALES_AND_TRUST_RULES.md) | Subscription and golfer autonomy | Acquisition, package, account, privacy, implementation, and release review |

## Design and prototype dependencies

| Stage | Inputs | Required output before next stage |
|---|---|---|
| Assumption-driven visual preparation | `AUTH-001` + [prototype brief](06_prototype/ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md) + [copy deck](06_prototype/VISUAL_PROTOTYPE_COPY_AND_CONTENT.md) | Frozen concept assumptions, exact copy, 34-frame contract, visual defaults, simulation boundary |
| Acquisition/activation text | Self-serve strategy + content + effort + ethics | [12-step specification](04_wireframes/SELF_SERVE_INSTRUCTOR_ACTIVATION.md) |
| Golfer text | Product thesis + content + ethics + synthetic profile | [8-screen specification](04_wireframes/POST_ASSESSMENT_ROADMAP.md) |
| Low fidelity | Both text flows + [workplan](04_wireframes/WIREFRAME_WORKPLAN.md) + [state matrix](04_wireframes/SCREEN_STATE_RESPONSIVE_MATRIX.md) | Narrow/wide frames, states, unassisted findings |
| Visual direction | Tested hierarchy + [dual mode](05_visual_design/VISUAL_DIRECTION.md) + access guide | Exact Figma direction and required patterns |
| Figma high fidelity | Approved/revised low-fi + [Figma plan](05_visual_design/FIGMA_FILE_PLAN.md) | Acquisition, activation, golfer, account state sets |
| Paired prototype | High-fi + [scope](06_prototype/PROTOTYPE_SCOPE.md) + [interaction](06_prototype/INTERACTION_SPEC.md) | Exact linked prototypes |
| Prototype test | [Script](06_prototype/USER_TEST_SCRIPT.md) + [acceptance](06_prototype/PROTOTYPE_ACCEPTANCE_CRITERIA.md) | Evidence, issue record, revision/retest, Aaron decision |

Preview-to-golfer parity is a hard dependency: changing an instructor input, preview, or golfer screen requires review of all three.

## Business validation dependencies

| Document | Depends on | Blocks/informs |
|---|---|---|
| [Pricing and Offer](07_business_validation/PRICING_AND_OFFER_HYPOTHESES.md) | Model, cost/use, owner choice | Acquisition copy, trial, billing/pause policy, paid tests |
| [Self-Serve Validation](07_business_validation/SELF_SERVE_SAAS_VALIDATION_PLAN.md) | Research, prototype, measurement, go/no-go | Stage authority and evidence claims |
| [Pilot and Beta](07_business_validation/PILOT_PLAN.md) | Policies, exact candidate, authority/evidence distinction | Assisted learning and future self-serve evidence |
| [Measurement Plan](07_business_validation/MEASUREMENT_PLAN.md) | Metric decisions + cohorts | North Star, funnel, economics, customer outcomes |
| [Go / No-Go](07_business_validation/GO_NO_GO_CRITERIA.md) | Predeclared thresholds + all evidence | Proceed/modify/pause/stop |

True self-serve beta no longer depends on the retired design gate. It still requires exact authorization for participants, access, policy/consent, personal data, support, and any transaction; assisted beta does not prove human-free activation.

## Handoff, release, and historical-gate dependencies

| Document | Required inputs | Current status |
|---|---|---|
| [Approved Design Index](08_implementation_handoff/APPROVED_DESIGN_INDEX.md) | Exact candidates, artifacts, evidence, and Aaron decisions | Sites v12 indexed as current private owner-only candidate; v11 and earlier retained as superseded predecessors; exact design/content/policy approval and acceptance absent |
| [Content and Data Requirements](08_implementation_handoff/CONTENT_AND_DATA_REQUIREMENTS.md) | Product/content/privacy baseline | Implementation input under `AUTH-005`; unresolved policy remains owner/external work |
| [Implementation Requirements](08_implementation_handoff/IMPLEMENTATION_REQUIREMENTS.md) | Bounded behavior baseline | Implemented and traced for the current candidate; historical no-code restriction superseded |
| [Implementation Non-Goals](08_implementation_handoff/IMPLEMENTATION_NON_GOALS.md) | Business boundaries + bounded V1 scope | Active scope boundary unless superseded explicitly |
| [Build Readiness Checklist](08_implementation_handoff/BUILD_READINESS_CHECKLIST.md) | Authority, evidence, owner decisions, and release state | Implementation authorized/built; public, paid, and accepted operation not ready |
| [Successor reproducibility record](10_production_saas/docs/release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md) | Exact successor source, two independent clean builds, and strict generated-value normalization | Prospective supply control passed at `66f5203a913f01c8da20555feebdbb99152c052c`; source is not a deployment or release candidate |
| [Prototype Implementation Agent Prompt](08_implementation_handoff/PROTOTYPE_IMPLEMENTATION_AGENT_PROMPT.md) | Historical local-prototype source set | Historical prompt; not the production authority or architecture source |
| [Full Live Implementation Goal Brief](08_implementation_handoff/FULL_LIVE_IMPLEMENTATION_GOAL_BRIEF.md) | `AUTH-005`, V2, bounded requirements, and production definition of done | Current completion contract |
| [Design Readiness Gate](DESIGN_READINESS_GATE.md) | Historical pre-production evidence checklist | Retired as a gate; retained for provenance only |

## Change propagation rules

1. **Customer/model/geography change:** review every business, acquisition, research, pricing, prototype, validation, summary, queue, and handoff artifact.
2. **Price/inclusion/trial/seasonality change:** update V2 decision, landing/FAQ, activation/account states, ethics, research, measurement, validation, policy, configuration, traceability, and release evidence.
3. **Activation change:** update product definition, strategy, wireframe, metrics, prototype/production behavior, acceptance criteria, beta, handoff, traceability, and release evidence.
4. **Content/evidence change:** update content architecture, activation, golfer flow, synthetic profile, prototype, access copy, and handoff.
5. **Visual change:** cannot change content priority, price transparency, or ethical alternatives without upstream decision review.
6. **Prototype finding:** changes exact artifact/acceptance record; it does not validate market or silently approve design.
7. **Assisted-beta result:** may change product/policy, but never counts as human-free activation.
8. **Seasonal result:** changes price/retention recommendations only with defined cohort and full limitations.
9. **Team request:** remains later until repeated evidence and an explicit superseding decision.
10. **Owner decision:** preserves prior record and links all affected artifacts.
11. **Owner preparation authorization:** allows only the named exploratory activity; it does not silently approve assumptions, artifacts, evidence, product/design/content, production operation, or release acceptance.

## Current dependency status

- V2 source/revised text specifications: present.
- Historical assumption-driven visual-prototype brief/copy and local prototype: present; no exact production UI/content baseline is owner-approved.
- Production application: implemented for the bounded V1; exact Sites version 12, runtime commit `7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c`, saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_8868e09fcb28819181cfbebdf82ce73f`, and successful deployment `appgdep_6a77c5c85974819185ce1c8caf13007c` is deployed owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site` with Checkout disabled at environment revision 14; provider `updated_at` is `2026-08-09T00:12:04.939300+00:00`.
- Exact version-12 evidence: session/account-scoped golfer-response idempotency, a bounded client timeout, and same-tab ambiguous-outcome recovery are implemented; exact archive verification and normalized reproducibility passed, and two exact-commit clean worktrees each passed 242/242 automated tests. Hosted-browser retry, signed-in supported-browser CSP/auth, real-network recovery, manual accessibility, scheduler/recovery, public, paid, real-user, and acceptance proof remain absent. **[REAL-WORLD VALIDATION REQUIRED]**
- Historical supply evidence: version 9's clean build passed behavior but failed archive byte identity. Exact source commit `66f5203a913f01c8da20555feebdbb99152c052c` later passed the prospective normalized-reproducibility control, and the control was rerun successfully at exact version-10 commit `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1` before that deployment. Version 10's recorded 234-test, normalized-reproducibility, capacity/recovery, and hosted-containment results remain historical predecessor evidence. Version 11's two clean-worktree 237/237 runs, exact archive verification, and CSP remediation also remain exact historical predecessor facts. Version 12's two clean-worktree 242/242 runs, exact archive verification, and normalized reproducibility are recorded separately and do not retroactively change earlier results. See the [version-12 record](10_production_saas/docs/release-evidence/ROADMAP-SITES-V12-2026-08-09.md), [version-11 record](10_production_saas/docs/release-evidence/ROADMAP-SITES-V11-2026-08-08.md), [version-10 record](10_production_saas/docs/release-evidence/ROADMAP-SITES-V10-2026-08-08.md), and [earlier supply-control record](10_production_saas/docs/release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md).
- Consent enforcement and the bounded non-destructive privacy-request operator surface are implemented. Owner-approved consent text/version/required choices and the operator digest allowlist/pepper are absent, so deep health remains degraded and real consent-governed use is unauthorized.
- Sites version 11 is the immediate superseded predecessor. Ordinary version-12-to-version-11 rollback is forbidden because it removes lost-ack response deduplication and ambiguous-outcome recovery; use same-version redeploy or a forward fix unless an emergency rollback receives explicit incident risk disposition and post-action verification. The version-11-to-version-10 CSP regression remains historical. Versions 10, 9, and 8 are older superseded records. Version 7 remains historical provenance but is forbidden as a rollback target after consent-governed use.
- Real research, current competitor study, qualified policy review, manual accessibility, controlled real-user/payment evidence, retention, seasonality, and CAC/payback evidence: missing.
- Owner release decisions, named operating roles/contacts, public-access authority, commercial/privacy policy, residual-risk disposition, and exact-release acceptance: missing.
- Approved Design Index: production candidates are indexed, but exact product/design/content approval remains empty.

**IMPLEMENTATION AUTHORITY: GRANTED UNDER `AUTH-005`; OWNER-ONLY SITES V12: DEPLOYED; FULL-LIVE ACCEPTANCE: NOT RECORDED**
