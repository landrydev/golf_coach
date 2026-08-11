# Golf Coaching Self-Serve SaaS Workspace

This workspace now contains the planning history, local prototype, and production implementation of a Canada-wide, self-serve B2B SaaS product for individual golf instructors. Aaron retired the repository phase gates and authorized full production SaaS implementation through `AUTH-005` on 2026-08-07.

The current implementation is in [10_production_saas](10_production_saas/README.md). An exact candidate is deployed to OpenAI Sites with owner-only access while public operating, policy, commercial, and release-acceptance decisions remain unresolved. Deployment is evidence, not Aaron's acceptance of a public or paid release.

## Source and decision authority

1. [AGENTS.md](AGENTS.md) records the current repository rules and `AUTH-005` implementation authority.
2. [BUSINESS_PLAN_V2.md](00_source/BUSINESS_PLAN_V2.md) is the current authoritative business source.
3. [BUSINESS_DIRECTION_CHANGE_SELF_SERVE_SAAS.md](00_source/BUSINESS_DIRECTION_CHANGE_SELF_SERVE_SAAS.md) is the authoritative amendment effective 2026-08-03.
4. [BUSINESS_PLAN.md](00_source/BUSINESS_PLAN.md) is unchanged historical Business Plan V1.
5. [DECISION_LOG.md](DECISION_LOG.md) records owner authorizations and delegated production decisions.
6. [FULL_LIVE_IMPLEMENTATION_GOAL_BRIEF.md](08_implementation_handoff/FULL_LIVE_IMPLEMENTATION_GOAL_BRIEF.md) is the production definition-of-done contract.

When V1 and V2 conflict, use V2. Historical V1 pricing, facility, founder-led sales, setup, and managed-service assumptions do not govern current work. Pricing, packaging, seasonality, numeric targets, and other unapproved commercial choices remain hypotheses even though implementation is authorized.

## Current status

| Dimension | State | Meaning |
|---|---|---|
| Business direction | **CURRENT** | Individual instructor, Canada-wide, self-serve SaaS is owner-directed |
| Implementation authority | **AUTHORIZED** | `AUTH-005` permits production architecture, code, security, testing, deployment, and operations work |
| Historical design gate | **RETIRED** | [DESIGN_READINESS_GATE.md](DESIGN_READINESS_GATE.md) remains a provenance and evidence record, not an implementation blocker |
| Production application | **IMPLEMENTED CANDIDATE** | The bounded Worker application, D1 schema, private R2 binding, SIWC boundary, Stripe boundary, tests, and runbooks exist |
| Hosted candidate | **OWNER-ONLY** | Exact Sites version 12 (`7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c`) is deployed successfully at environment revision 14. Session/account-scoped golfer-response idempotency, a bounded client timeout, and same-tab ambiguous-outcome recovery are implemented; exact archive verification, normalized reproducibility, and two 242/242 clean-worktree runs passed. Signed-in hosted CSP/auth browser retest remains pending. Checkout remains disabled and the release is not accepted for public, paid, or real-user operation; see the [version-12 record](10_production_saas/docs/release-evidence/ROADMAP-SITES-V12-2026-08-09.md) and [Release Evidence](10_production_saas/docs/RELEASE_EVIDENCE.md) |
| Responsive evidence | **LOCAL SYNTHETIC ONLY** | Nine exact-version-9 Chrome captures cover landing, instructor workspace, and golfer plan at 320, 390, and 1440 CSS pixels without root/body horizontal overflow. They remain predecessor evidence only for renderer/layout portions unchanged through version 11, not exact-version-12 hosted behavior, its response-recovery contract, or human accessibility acceptance. |
| Checkout | **DISABLED** | No approved offer, live Price, policy set, credentials, or controlled transaction is recorded |
| Public/live acceptance | **NOT COMPLETE** | Aaron has not accepted an exact public or paid release; real-user, policy, recovery, accessibility, and operating evidence remains incomplete |

Version 11 is the immediate superseded private predecessor. Ordinary rollback from version 12 to version 11 is forbidden because it would remove the lost-ack deduplication and ambiguous-outcome recovery contract; prefer same-version redeploy or a forward fix, with any emergency rollback requiring explicit incident risk disposition and post-action verification. The historical version-11-to-version-10 CSP regression remains a separate predecessor limitation.

## Product boundary

`[SUPPORTED BY BUSINESS PLAN V2]` The product helps an independent instructor turn an adult golfer's goal, assessment, evidence, barriers, development phases, and existing lesson package into a private coach-branded roadmap. The instructor previews and intentionally publishes that roadmap; the golfer receives a clear, ethical view of current direction and an external handoff to the instructor's existing booking, payment, or communication tool.

The implementation does not treat Roadmap as a coach marketplace, medical or biomechanical diagnosis system, autonomous coach, native coach-package payment processor, booking system, or outbound messaging platform. Media upload, junior use, facilities/teams, and AI remain outside the bounded V1 unless a later recorded decision changes scope.

The working planning price remains **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75 per month per individual instructor**. It is not an approved live offer.

## Continue the work

1. Read [START_HERE.md](START_HERE.md) for the current operator path.
2. Use the [full-live completion audit](10_production_saas/docs/FULL_LIVE_COMPLETION_AUDIT.md) and [requirements traceability](10_production_saas/docs/REQUIREMENTS_TRACEABILITY.md) to select engineering work.
3. Use [Release Evidence](10_production_saas/docs/RELEASE_EVIDENCE.md) for exact deployed provenance and limitations.
4. Use [Owner Release Decisions Required](10_production_saas/docs/OWNER_RELEASE_DECISIONS_REQUIRED.md) for decisions only Aaron can supply.
5. Record new authority or superseding choices in [DECISION_LOG.md](DECISION_LOG.md); never rewrite Business Plan V1 or erase historical decisions.

## Historical material

Folders `01_business_foundation` through `09_local_prototype` preserve the business, research, experience, wireframe, visual, prototype, validation, and earlier handoff record. Pre-`AUTH-005` documents may correctly describe the authority that existed when they were written. Where those snapshots conflict with current implementation authority, `AUTH-005`, [AGENTS.md](AGENTS.md), and the live production records control.

## Required labels

- `[SUPPORTED BY BUSINESS PLAN V2]` — grounded in the current business source.
- `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` — concrete recommendation, not approval.
- `[PRICING HYPOTHESIS — REQUIRES VALIDATION]` — unvalidated price or price-related amount.
- `[UNVALIDATED BUSINESS ASSUMPTION]` — plausible but unproven belief.
- `[REAL-WORLD VALIDATION REQUIRED]` — missing behavioral, commercial, operational, professional, or usability evidence.
- `[OWNER INPUT REQUIRED]` — an exact accountable owner decision cannot be selected by an implementation agent.

**IMPLEMENTATION AUTHORITY: GRANTED UNDER `AUTH-005`; FULL-LIVE ACCEPTANCE: NOT COMPLETE**
