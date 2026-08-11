# Full Live Implementation Goal Brief for GPT-5.6 Sol Ultra

**Artifact type:** Planning and future-agent operating brief  
**Prepared:** 2026-08-07  
**Intended model:** GPT-5.6 Sol Ultra  
**Current authority:** Full production SaaS implementation authorized by Aaron under `AUTH-005` on 2026-08-07  
**Implementation authority:** Granted by `AUTH-005`; this brief remains the production definition-of-done contract

## 1. How to use this document

Give this entire document to GPT-5.6 Sol Ultra and instruct it:

> Use this as the operating brief. Create or continue the `/goal` described below, then persist across turns until its complete definition of done is satisfied or the governed work is genuinely blocked. This brief does not itself grant an owner approval that the repository requires.

The agent must read the live repository before relying on this snapshot. Current repository instructions and later recorded owner decisions take precedence over this brief. The agent must never edit a gate, decision record, or standing instruction to manufacture its own authority.

## 2. Required `/goal`

First inspect the current goal state. If there is no unfinished goal, create one with the following objective and no token budget:

> Bring the Canada-wide, self-serve B2B golf-coaching SaaS for individual independent instructors from its current assumption-driven local prototype to a bounded, owner-authorized, evidence-informed, secure, accessible, formally tested, production-deployed, observable, and operationally documented live V1. The live V1 must support the approved end-to-end instructor and golfer journeys with real accounts and authorized real operations, while preserving repository governance, source authority, ethical product boundaries, and every required owner approval. Do not declare the goal complete until the production definition of done in `08_implementation_handoff/FULL_LIVE_IMPLEMENTATION_GOAL_BRIEF.md` is demonstrably satisfied.

If the current unfinished goal already has this objective, continue it. If a different unfinished goal prevents creation, report that conflict precisely and follow the goal system's rules rather than silently replacing it.

After creating or resuming the goal, maintain a current execution plan. Work autonomously within granted authority, verify completed work in proportion to risk, and preserve unresolved prerequisites as prerequisites rather than treating them as optional tasks.

## 3. Meaning of “full live working implementation”

“Full” means the complete approved production V1, not every idea in the business plan or planning library. It does not automatically include team/facility features, native golfer booking or coach-package payment, AI diagnosis, autonomous coaching, a coach marketplace, custom integrations, or every later lifecycle concept.

“Live” means a production environment available through the owner-approved public entry point, using approved production services and policies. It must perform authorized real operations for real users; localhost, static mockups, simulated actions, preview deployments, and synthetic-only demonstrations do not qualify.

“Working” means the approved critical journeys operate end to end, production controls are in place, formal verification has passed, material defects are resolved or explicitly accepted, operational ownership is documented, and Aaron has accepted the exact release.

The scope is bounded by exact owner-approved requirements. When the sources conflict, follow this order:

1. `AGENTS.md` and applicable system/tool safety rules.
2. Later explicit Aaron decisions recorded with durable IDs and exact scope.
3. `00_source/BUSINESS_PLAN_V2.md` and `00_source/BUSINESS_DIRECTION_CHANGE_SELF_SERVE_SAAS.md`.
4. Approved entries and exact versions in `08_implementation_handoff/APPROVED_DESIGN_INDEX.md`.
5. Approved requirements, policies, designs, acceptance criteria, and implementation decisions.
6. Unapproved planning artifacts, which remain inputs or hypotheses only.
7. `00_source/BUSINESS_PLAN.md`, which is preserved historical Business Plan V1 and is superseded where incompatible with V2.

## 4. Governing business facts and unresolved hypotheses

`[SUPPORTED BY BUSINESS PLAN V2]`

- The product is a Canada-wide, self-serve B2B SaaS for individual independent golf instructors.
- It must not depend on a sales call, custom proposal, mandatory onboarding, bespoke setup, or facility enterprise sale.
- It helps instructors present a personalized, coach-branded development roadmap and living player journey using the instructor's judgment and existing tools.
- The first commercial wedge is assessment to personalized roadmap to recommended first coaching phase to lesson-package decision.
- Facilities and multi-coach teams are later candidates, not initial scope by default.

The agent must continue to use these labels accurately:

- `[SUPPORTED BY BUSINESS PLAN V2]`
- `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`
- `[PRICING HYPOTHESIS — REQUIRES VALIDATION]`
- `[UNVALIDATED BUSINESS ASSUMPTION]`
- `[REAL-WORLD VALIDATION REQUIRED]`

The current CAD $75/month Solo price, CAD $15/month seasonal-pause option, packaging, trial, account policies, numeric targets, acquisition assumptions, and outcome expectations remain hypotheses unless a later exact owner decision or real evidence changes their status. Repetition in repository documents is not validation.

## 5. Historical pre-`AUTH-005` snapshot requiring live reconciliation

The bullets below record the repository state immediately before `AUTH-005`; they
are retained for provenance and must not be read as current implementation limits.
The live implementation and release state is recorded under `10_production_saas/`.

As of the pre-authorization snapshot on 2026-08-07:

- `09_local_prototype` identifies itself as version `0.2.0`.
- It is a local React/Node.js synthetic rendering of `DOCSET-CLIENT-2026-08-03-A`.
- It covers a golfer-first experience with Now, Goal, Roadmap, Lessons, Practice, Evidence, Phase Review, and a later private Milestone concept.
- `AUTH-003` and `AUTH-004` authorize only the bounded local rendering.
- The exact rendered prototype still awaits Aaron's review in `08_implementation_handoff/APPROVED_DESIGN_INDEX.md`.
- Real accounts, persistence, sharing, messaging, billing, media operations, deployment, production architecture, security work, and formal testing are not authorized by those decisions.
- Research, policy, design, readiness, and status documents contain incomplete items and some stale summary text. Their statuses must be reconciled through explicit decisions, not silently normalized.

React and Node.js were owner-specified only for the local prototype. Production
architecture was later selected under `AUTH-005` and is recorded in `TECH-001`
through `TECH-004` and `10_production_saas/docs/ARCHITECTURE.md`.

## 6. Superseded authority preflight and continuing safeguards

`AUTH-005` supersedes the repository phase-gate model and authorizes the production implementation described by this goal. The following list is retained as an implementation decision and evidence checklist rather than a sequence of owner-approval blockers.

The implementation record must explicitly and durably identify:

1. the exact prototype or design version accepted as the product-direction baseline, including requested changes;
2. the exact production V1 scope and non-goals;
3. which simulated business choices are approved for implementation and which remain experiments;
4. the approved privacy, consent, access, correction, sharing, media, retention, deletion, billing, tax, refund, failed-payment, cancellation, pause, resume, incident, and support policies;
5. permission to plan and select production architecture and providers;
6. permission to implement real accounts, persistence, sharing, SaaS billing, and any other approved real operation;
7. permission to perform security engineering and formal/automated testing;
8. permission to use approved external services, domains, credentials, budgets, and production data;
9. permission to deploy and operate the exact approved release; and
10. the decision IDs, conditions, stop triggers, and revisit triggers governing those permissions.

`AUTH-005` supplies the implementation authority that the earlier prototype decisions did not. Exact technical choices, release configuration, evidence, and residual risks must still be recorded. System/tool approvals, unavailable credentials, and unspecified paid charges remain external constraints.

The agent may now create application code, tests, schemas, integrations, deployment assets, infrastructure configuration, framework files, and production-provider decisions under `AUTH-005`.

When a decision is missing, present Aaron with a concise decision packet containing the evidence, viable choices, a clearly labelled recommendation, tradeoffs, exact proposed decision wording, and the consequence of deferral. Do not fill `[OWNER INPUT REQUIRED]` items on Aaron's behalf.

## 7. Phased execution contract

Each workstream must have explicit inputs, outputs, acceptance evidence, and
authority. `AUTH-005` authorizes execution across these workstreams; they are not
sequential owner-approval gates. External account authority, unspecified paid
charges, public-access changes, production data or user activity, and exact-release
acceptance still require their applicable evidence or decision.

### Phase 0 — Reconcile authority and baseline

- Read `AGENTS.md`, the two authoritative V2 business sources, `DESIGN_READINESS_GATE.md`, `DECISION_LOG.md`, `APPROVED_DESIGN_INDEX.md`, the current prototype, and all relevant requirements/non-goals.
- Inventory the repository and identify stale, contradictory, missing, or unapproved status claims.
- Confirm the exact current prototype version and what has actually been mechanically verified.
- Produce the owner decision/authorization docket required to proceed.
- Record decisions only from Aaron's exact instructions; preserve superseded history.

**Exit condition:** the live authority map is accurate and remaining external or
owner dependencies are explicit. `AUTH-005`, rather than this workstream, supplies
the production implementation authority.

### Phase 1 — Validate product and commercial prerequisites

- Complete or explicitly disposition the planned instructor, golfer, competitor, usability, assisted-beta, self-serve, pricing, support, seasonality, and commercial evidence work.
- Distinguish observed evidence, counterevidence, limitations, and founder assistance.
- Do not claim demand, usability, self-serve activation, price acceptance, package outcomes, retention, or economics from simulation.
- Resolve the owner decisions needed to establish a bounded production V1.

`[REAL-WORLD VALIDATION REQUIRED]` Any activity involving participants, messages, recruitment, accounts, personal information, spending, or external organizations requires the applicable consent, policy, authority, and human coordination.

**Exit condition:** the bounded V1 product boundary follows Business Plan V2, and
unvalidated commercial claims and owner-policy dependencies are explicitly
labelled rather than silently decided.

### Phase 2 — Approve product, experience, content, and policy

- Produce and review exact acquisition, instructor activation, instructor return-state, golfer roadmap, living-journey, account-state, error-state, and responsive designs required by the approved V1.
- Ensure instructor preview and golfer delivery use the same approved content model.
- Approve exact marketing, onboarding, product, error, notification, billing, privacy, and policy copy.
- Complete suitable accessibility, content, ethical-sales, privacy/legal, and operational reviews.
- Populate `APPROVED_DESIGN_INDEX.md` only with exact accepted artifacts, versions, evidence, conditions, and decision IDs.
- Update requirements traceability without turning recommendations into approvals.

**Exit condition:** exact versioned requirements, implementation baselines, copy,
policies, acceptance criteria, and non-goals are traceable; any item that genuinely
requires Aaron's decision remains `[OWNER INPUT REQUIRED]`.

### Phase 3 — Authorize and select production architecture

Under the production-planning authority supplied by `AUTH-005`:

- Derive architecture requirements from the approved product, data, security, privacy, accessibility, availability, performance, operational, cost, and regional constraints.
- Evaluate viable alternatives before selecting the production application stack, data stores, hosting, identity, storage, SaaS billing, email or sharing delivery, observability, analytics, backup, and deployment approach.
- Prefer the simplest solution that satisfies the approved V1 and operational obligations.
- Record architecture decisions, rejected alternatives, costs, risks, data flows, threat boundaries, provider responsibilities, exit considerations, and revisit triggers.
- Do not carry React/Node.js forward solely because the prototype used them.
- Do not introduce AI unless Aaron separately approves an exact use case, model/provider decision, data policy, safety boundary, evaluation plan, and user disclosure.

**Exit condition:** implementation architecture and its evidence are durably
recorded. Provider-account authority, spending, and material residual-risk
acceptance remain explicit owner/external dependencies where applicable.

### Phase 4 — Build the approved production V1

Implement only the approved scope. Unless the approved requirements state otherwise, the V1 decision set must explicitly address:

- public acquisition and transparent self-serve entry;
- instructor identity, authentication, recovery, account lifecycle, and account isolation;
- coach profile and bounded branding;
- lesson-package configuration and external coach-package action links;
- golfer records, goals, constraints, assessments, priorities, and coach-authored phases;
- instructor creation, preview, editing, publishing, updating, and controlled sharing of roadmaps;
- golfer access to the approved Now, Goal, Roadmap, Lessons, Practice, Evidence, and Phase Review journey;
- approved progress, media, milestone, renewal, referral, and notification behavior, if included in V1;
- real SaaS subscription lifecycle, including approved trial, billing, cancellation, pause, resume, failure, and data consequences;
- privacy choices, consent, access, correction, revocation, export, retention, and deletion behavior required by approved policy;
- required support, incident, administrative, and recovery capabilities;
- responsive and accessible interaction across the approved support matrix; and
- analytics and audit events limited to approved, disclosed, necessary data.

The product must preserve coach ownership. It must not invent diagnoses, guarantee outcomes, disguise sales pressure as coaching, fabricate evidence, or imply that external coach-package booking/payment occurred when it did not.

Use migrations, fixtures, configuration, secrets handling, dependency controls, and environment separation appropriate to the approved architecture. Never use real customer data as development or test data without explicit, policy-compliant authorization.

**Exit condition:** every approved requirement is implemented and traceable, with no unauthorized feature or hidden real behavior.

### Phase 5 — Security, privacy, accessibility, and formal verification

`AUTH-005` authorizes security, privacy, accessibility, and formal verification.
Execute the applicable verification strategy, including:

- code review and static quality checks;
- unit, integration, contract, and end-to-end automated tests;
- production-like critical-journey and failure-path tests;
- authorization, account-isolation, input-handling, session, sharing, billing-webhook, and abuse-case tests;
- dependency, secret, configuration, and infrastructure review;
- threat modelling, security assessment, vulnerability remediation, and independent review where warranted;
- data lifecycle, consent, deletion, backup, restore, and recovery verification;
- WCAG-oriented automated and manual accessibility checks with representative users or specialists where required;
- supported-browser, responsive, reduced-motion, no-media, slow-network, failure, and recovery checks;
- performance, capacity, reliability, observability, rollback, backup, and restore exercises; and
- exact content, price, policy, analytics, and design conformance review.

Do not weaken checks merely to produce a passing result. Record test environment, version, evidence, known limitations, severity, owner, disposition, and retest result. Do not claim legal compliance, security, accessibility, performance, or production readiness beyond the evidence.

**Exit condition:** all release-blocking criteria pass; no unresolved critical issue remains; other material risks have explicit owners and Aaron-approved dispositions.

### Phase 6 — Deploy, release, and operate

`AUTH-005` authorizes deployment and release preparation for the bounded V1.
Using only authorized accounts and material external effects:

- Provision approved production services and least-privilege access through authorized accounts.
- Configure the approved public domain, transport protection, secrets, data services, backups, monitoring, alerting, billing, delivery services, and environment controls.
- Run an approved migration and release procedure with rollback capability.
- Perform production smoke and synthetic checks without exposing unauthorized data or triggering unintended charges/messages.
- Verify critical real operations using approved test accounts and controlled transactions.
- Publish approved legal, privacy, support, billing, and status information.
- Enable logging, alert routing, incident response, support intake, backup monitoring, cost monitoring, and ownership handoffs.
- Record the exact release version, environment, configuration baseline, evidence, known limitations, and rollback point.

**Exit condition:** the exact accepted release is live, observable, supportable, recoverable, and operating under approved policies.

### Phase 7 — Acceptance and bounded launch validation

- Have Aaron review and accept the exact live release.
- Confirm approved instructor and golfer journeys with authorized real-world use.
- Monitor activation, failures, support burden, trust/ethics guardrails, billing behavior, and operational health using approved definitions.
- Separate product evidence from founder intervention, seasonality, instructor skill, lead quality, and other confounders.
- Resolve launch-blocking findings and document deferred items without expanding scope silently.
- Record the release decision, remaining risks, owners, and revisit triggers.

**Exit condition:** Aaron accepts the live V1 and the production definition of done is fully evidenced.

## 8. Default V1 exclusions unless Aaron explicitly approves otherwise

- Facility, academy, team, role-administration, or enterprise-sales features.
- Native booking, scheduling, purchasing, or payment for an instructor's coaching packages.
- A coach marketplace, public discovery directory, or lead marketplace.
- Autonomous diagnosis, coaching, roadmap generation, package recommendation, or outcome prediction.
- Launch-monitor, CRM, booking, payment, messaging, or media-analysis integrations beyond an approved V1 need.
- Unlimited custom branding, custom implementation, managed content production, or concierge onboarding.
- Unbounded dashboards, revenue attribution, gamification, social feeds, or speculative reporting.
- Junior-golfer use until safeguarding, consent, policy, and product requirements are separately approved.
- Expansion beyond Canada until jurisdictional, commercial, tax, privacy, policy, and support implications are approved.

An exclusion may be reconsidered through a superseding owner decision. It must never enter the implementation through incidental engineering convenience.

## 9. Production definition of done

Do not mark the `/goal` complete until evidence shows all applicable conditions below are true:

### Authority and scope

- Exact V1 scope, requirements, designs, content, policies, architecture, providers, verification plan, release, and production operation are owner-approved and durably versioned.
- All implementation work was performed within explicit authority.
- Business Plan V1 remains preserved and V2 precedence remains intact.
- Hypotheses and unvalidated outcomes remain accurately labelled.

### Product behavior

- The approved acquisition, instructor, golfer, account, billing, sharing, lifecycle, error, and recovery journeys work end to end in production.
- Real operations are real and transparent; simulated actions are not left in the live critical path.
- Instructor and golfer permissions and account/data isolation behave as approved.
- Coach-package actions remain external unless native handling was separately approved.
- The experience preserves coach judgment, golfer agency, evidence limitations, and ethical-sales boundaries.

### Quality and risk

- Approved automated and manual verification passes against the exact release.
- Security, privacy, accessibility, resilience, performance, billing, data-lifecycle, and recovery acceptance criteria pass.
- No unresolved critical defect, security finding, privacy issue, accessibility blocker, data-loss risk, billing fault, or ethical dark pattern remains.
- Every accepted residual risk has an owner, rationale, mitigation, review date, and Aaron approval.

### Production and operations

- The approved production URL and services are live under authorized ownership.
- Monitoring, alerting, logs, backups, restore, rollback, incident response, support, billing operations, data requests, dependency maintenance, and cost controls are documented and exercised as required.
- Secrets and privileged access are controlled, inventory is current, and no development secret or synthetic shortcut substitutes for production controls.
- Required legal, privacy, billing, support, and user-facing policy materials are published and consistent with actual behavior.

### Evidence and handoff

- A requirements-to-design-to-code-to-verification traceability record identifies the exact release evidence.
- The repository contains current setup, architecture, environment, deployment, rollback, operations, support, security, privacy, data, billing, and release documentation appropriate to the approved system.
- Aaron has reviewed the exact production release and recorded acceptance with decision ID, date, conditions, residual risks, and revisit triggers.
- The final handoff states what is live, what is excluded, what remains unvalidated, how to operate/recover it, and who owns every ongoing responsibility.

Deployment alone is not completion. A functioning happy-path demo is not completion. Passing tests without an approved live release is not completion. Owner acceptance without the required safety and operational evidence is not completion.

## 10. Working discipline for Sol Ultra

- Lead each turn with the highest-value safe work that current authority permits.
- Inspect before editing and preserve unrelated user changes.
- Use the repository's required editing mechanisms and never rewrite source history.
- Keep a concise plan with at most one active step and update it as evidence changes.
- Maintain a decision, assumption, risk, dependency, and authorization ledger throughout the goal.
- Prefer reversible, reviewable increments and small release units.
- Verify each meaningful change before relying on it.
- Request approval immediately before actions involving credentials, paid services,
  production data, external messages, destructive changes, public-access changes,
  or other material external effects when approval is not already exact.
- `AUTH-005` authorizes ordinary bounded deployment and production-release work.
  Never purchase services, register domains, contact participants, send customer
  messages, or create a charge merely because those actions are necessary for
  eventual completion.
- Never weaken security, privacy, accessibility, testing, observability, or recovery requirements to make the goal appear complete.
- Never mark an unmet evidence requirement as satisfied based on effort,
  inference, simulation, or owner silence. This is truthfulness discipline, not
  a reinstated phase or design gate.
- If progress requires Aaron or another human, finish every safe prerequisite, present a precise handoff or decision request, and keep the goal incomplete until the dependency is resolved.
- Follow the platform's goal-status rules if an external dependency creates a repeated genuine impasse.

## 11. Required final report before goal completion

The final report must include:

1. exact production release/version and public entry point;
2. exact owner authorization and acceptance decision IDs;
3. concise implemented-scope and explicit-exclusion summary;
4. architecture and external-service inventory;
5. data categories, flows, retention, deletion, backup, and recovery summary;
6. authentication, authorization, security, privacy, accessibility, and billing-control summary;
7. verification commands, environments, results, and evidence locations;
8. deployment, rollback, monitoring, alerting, incident, support, and maintenance handoff;
9. known limitations, residual risks, owners, dates, and revisit triggers;
10. validation status for pricing, packaging, activation, retention, seasonality, support, and commercial outcomes;
11. confirmation that historical Business Plan V1 was not rewritten and V2 governed conflicts; and
12. the goal system's final token-usage report if required when marking a budgeted goal complete.

Only after this report is accurate and every production definition-of-done condition is satisfied may the agent mark the `/goal` complete.

## 12. Status of this brief

This document began as a planning artifact and now serves as the persistent
production definition-of-done contract. `AUTH-005` superseded the repository's
documentation-only rule and bounded-prototype phase restrictions. It authorizes
production scope selection within Business Plan V2, architecture, implementation,
security work, formal testing, deployment, release preparation, and bounded
operations.

`AUTH-005` does not validate commercial hypotheses, supply unavailable provider
accounts or credentials, approve an unspecified paid charge, authorize customer
communications or production-data use without applicable controls, make the site
public by itself, or constitute Aaron's acceptance of an exact release. Those
remaining decisions, external effects, controlled real operations, and acceptance
must still be recorded explicitly and durably where required.
