# Start Here — Production Completion Guide

**BUSINESS DIRECTION:** [SUPPORTED BY BUSINESS PLAN V2] Canada-wide self-serve B2B SaaS for individual independent golf instructors  
**IMPLEMENTATION AUTHORITY:** Granted under `AUTH-005` on 2026-08-07  
**CURRENT APPLICATION:** [10_production_saas](10_production_saas/README.md)  
**HOSTED STATE:** Exact Sites version 16 deployed successfully owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site`; three 346/346 verification runs, exact archive/normalized reproducibility, browser-failure and recovery hardening, exact readiness/scheduler health, and local-only recovery/capacity evidence recorded; `LOG-PRIV-001` High/open; signed-in hosted retests pending; Checkout disabled; deep health intentionally degraded by absent owner policy/operator configuration  
**FULL-LIVE STATUS:** Active and incomplete; no public/paid release acceptance is recorded

## Next action

Continue the durable objective in [FULL_LIVE_IMPLEMENTATION_GOAL_BRIEF.md](08_implementation_handoff/FULL_LIVE_IMPLEMENTATION_GOAL_BRIEF.md). Close safe engineering, security, accessibility, recovery, observability, and evidence gaps without inventing owner policy. Keep the hosted release owner-only and billing fail-closed until the exact decisions and evidence named below exist.

## Read in this order

1. [AGENTS.md](AGENTS.md) — current authority, source precedence, and safety rules.
2. [Business Plan V2](00_source/BUSINESS_PLAN_V2.md) — current business source.
3. [Full Live Implementation Goal Brief](08_implementation_handoff/FULL_LIVE_IMPLEMENTATION_GOAL_BRIEF.md) — definition of done.
4. [Full Live Completion Audit](10_production_saas/docs/FULL_LIVE_COMPLETION_AUDIT.md) — current completion record and residual risks.
5. [Requirements Traceability](10_production_saas/docs/REQUIREMENTS_TRACEABILITY.md) — V1 journey and cross-cutting requirements.
6. [Release Evidence](10_production_saas/docs/RELEASE_EVIDENCE.md) — exact source, version, deployment, environment, and verification evidence.
7. [Owner Release Decisions Required](10_production_saas/docs/OWNER_RELEASE_DECISIONS_REQUIRED.md) — choices only Aaron or an authorized external reviewer/operator can close.

## What is already authorized and implemented

- `AUTH-005` retired the documentation-only and phase-gate restrictions. Production code, architecture, security work, formal testing, deployment, and operations work are authorized.
- The bounded V1 production application uses a Vinext/React Worker on OpenAI Sites, Cloudflare D1, a private R2 binding, dispatch-owned Sign in with ChatGPT, private revocable golfer capabilities, and a Stripe-hosted SaaS billing boundary.
- The local production-bundle suite currently covers tenant isolation, capability security, consent enforcement and withdrawal revocation, instructor and golfer lifecycle paths, billing ordering/reconciliation races, privacy data-request intake and the bounded operator-review surface, migrations, rendered semantics, and selected accessibility behavior.
- Exact Sites version 16 (`91f37ebd542774779f6db7e000832c2f6714e528`; saved version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_0a4d7dc3d8108191aa4a1b3e14051a96`; successful deployment `appgdep_6a7826b2f4c481919cc85665dffa2391` at `2026-08-09T07:05:36.176024Z`) is deployed at `https://roadmap-golf-coaching.aar-landry.chatgpt.site` behind custom Sites access revision 1 with one owner, zero groups/external visitors, plus application-level `owner_private` authorization at environment revision 18. Writes are enabled, Checkout is disabled, four existing secrets were retained, and the exact release ID is set. Signed-out `/`, `/app`, `/r`, and `/api/health` returned `401`/`no-store`/`no-referrer`; no bypass credential was generated, read, rotated, displayed, persisted, or used for v16.
- Aaron authorized `OWNER-SEC-001` on 2026-08-08. One Sites bypass-credential rotation succeeded from `2026-08-08T18:32:25.588Z` through `2026-08-08T18:32:31.831Z`; the provider contract invalidated the prior current value, and the replacement was not displayed, persisted, or used. Owner-only policy remained unchanged, and signed-out `/`, `/app`, `/api/health`, and `/api/operations/health` probes each returned `401` with `no-store`/`no-referrer`. The original value was not replayed, the bounded log query returned zero events and is inconclusive, and no browser was available for the normal signed-in owner application retest. Treat this as provider remediation with retest pending, not complete authenticated-host evidence.
- Exact version-16 evidence records three 346/346 verification runs including two independent clean installs, each with 501 packages and the same five blocked install scripts. The 51-file builds had three expected raw differences and zero normalized differences. The 3,052,294-byte archive has SHA-256 `9119a848bb8b4c7fff1d810280cf845ec44366449adac3176fd35d8c24438fe6`, 63 entries/51 files, 11 migrations, and 25 source mappings; the provider package is `sha256:752f05fd957f8f4b043b5955d9cdbdbf2176b0f1f3414827c9c3e8d0f44f6e2c`, 7,290,880 bytes/51 files. Production audit reported zero vulnerabilities; release integrity covered 304 files with zero findings and preserved Business Plan V1.
- Version 16 adds generic private top-level-document failure HTML while APIs/RSC/assets remain JSON; validated UUIDv4 client request references; 24-hour keyed-recovery v2 lifecycle with exact-owner cleanup and legacy retirement; exact migration-0010 readiness; and bounded 13-account scheduler backlog health. Its local-only recovery applied all 11 migrations/31 tables/three objects, booted the exact Worker, authenticated profile/package/workspace reads, observed expected interrupted-scheduler degradation, and passed three negative checks. Local capacity completed 54 requests with zero failures. These are not hosted recovery, RPO/RTO/SLO, scheduler/alert, browser/manual accessibility, or real-user proof. **[REAL-WORLD VALIDATION REQUIRED]**
- Version 15 is the immediate superseded private predecessor. It proved all packaged Sites logging switches ineffective: a value-safe query still returned invocation records and potentially identifying network/request metadata, while collection/storage disposition remains unknown. No version-16 provider-log query was run. `LOG-PRIV-001` remains High/open and blocks controlled real-user/public operation; rollback to v15 is not a remedy.
- Nine exact-version-9 local synthetic Chrome 151 captures cover landing, instructor workspace, and golfer plan at 320, 390, and 1440 CSS pixels. Geometry records show no root/body horizontal overflow. They remain historical renderer/layout evidence only; they are not exact-version-16 hosted or human-accessibility evidence and do not prove keyboard order, screen-reader output, forced colours, reduced motion, zoom, supported-browser conformance, CSP enforcement, or human acceptance.
- Consent and data-request operator controls are implemented, but Aaron has not approved the consent policy text, policy version, or required-consent choices, and no operator digest allowlist or pepper is configured. Deep operational health therefore remains degraded by design; implementation does not resolve these owner inputs.

These facts do not prove public suitability, legal compliance, demand, recoverability, manual accessibility, real-user success, or Aaron's exact-release acceptance.

## What remains incomplete

The current [Full Live Completion Audit](10_production_saas/docs/FULL_LIVE_COMPLETION_AUDIT.md) records the bounded V1 journeys as implemented in the production Worker and exercised locally. It does not identify authoring, publication readiness, return state, correction, sharing, or living-plan lifecycle as wholly missing subsystems. Do not restart or duplicate those completed areas merely because older planning files still describe them as future work.

What remains falls into three categories:

1. **Safe autonomous hardening/evidence:** resolve newly identified source/test defects against [Requirements Traceability](10_production_saas/docs/REQUIREMENTS_TRACEABILITY.md); build on historical local responsive evidence and exact-version-16 automated/deployment evidence with content, interaction, accessibility, failure/retry, audit, migration, recovery, forward-fix/redeploy, release-integrity, privacy-safe observability, scheduler, dependency, and runbook evidence without real users or charges.
2. **Hosted/manual/operational evidence:** authenticated SIWC journeys—including the pending normal-owner post-rotation retest and any remaining direct prior-value denial evidence—final-origin security behavior, provider confirmation or a verified superseding host/scheduler for background recovery and paid operation, scheduler/log/alert operation, provider-backed restore/rollback, manual accessibility/browser review, operator queue operation, controlled Stripe exercises, and support/incident/cost drills remain unproved or incomplete within their recorded scopes.
3. **Owner/external decisions and validation:** exact product/design/content acceptance, consent policy text/version/required choices, operator allowlist/pepper and named operators, commercial and privacy policy, origin/access/provider authority, real participants/data/transactions, qualified review, residual-risk disposition, and exact-release acceptance remain outside autonomous inference.

Any newly discovered defect must be recorded against the exact source/release and fixed/tested normally under `AUTH-005`; deployment does not freeze engineering. Version 15 is the immediate predecessor, but it does not remediate `LOG-PRIV-001`; prefer a forward fix or supported-host migration. Older rollback restrictions remain recorded in their immutable release evidence, and version 7 must not be used after consent-governed data or operation exists because it predates the current consent boundary.

## Safe work that remains authorized

- Close bounded source, test, accessibility, security, reliability, recovery, and evidence gaps identified by the current traceability and completion audit.
- Improve observability, scheduler evidence, request correlation, operational health, bounded pagination, dependency hygiene, and runbooks using synthetic/local evidence.
- Prepare exact owner-only candidate releases when appropriate, preserving immutable provenance and fail-closed configuration; do not imply acceptance from deployment.
- Reconcile stale live-navigation documents while retaining historical snapshots and Business Plan V1 unchanged.

## Decisions and external evidence an agent must not invent

- Final product scope/design/content acceptance and residual-risk disposition.
- Accountable legal/operator name, public support/privacy contacts, incident route, and named operating roles.
- Exact SaaS price, tax, trial, refund, failed-payment, cancellation, pause, retention, and deletion consequences.
- Qualified Canadian privacy/legal review, notices, retention schedule, deletion exceptions, and golfer-authority language.
- Exact owner-approved consent policy text, policy version, required-consent choices, and the authorized data-request operator allowlist/pepper configuration.
- Final public origin/domain, public SIWC suitability, live Stripe account/Product/Price, budgets, and alert destinations.
- Authorization for public access, controlled real users/data, and any controlled live charge.
- Aaron's dated acceptance of one exact release, configuration, policy set, operating scope, and risk record.

## Operating constraints until those decisions exist

- Keep Sites access owner-only and application access in fail-closed `owner_private` mode.
- Keep `BILLING_CHECKOUT_ENABLED=false`; do not configure or exercise a live charge.
- Do not rely on the packaged five-minute trigger until hosted scheduling is explicitly supported and at least three exact-release heartbeats plus alert failure handling are observed.
- Use synthetic data only; do not recruit, message, or onboard real users.
- Keep the unconfigured consent/operator readiness checks degraded; do not treat implemented policy defaults as approved. **[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]** Any candidate policy choice remains provisional until Aaron records it.
- Keep media upload, junior use, public discovery, AI, native coach-package payment, and outbound messaging absent.
- Describe deletion as an identity-verified review workflow, not completed erasure.
- Do not claim hosted scheduler operation, backup/restore success, manual accessibility conformance, public SIWC suitability, legal compliance, or live acceptance without evidence.

## Historical planning record

The visual, prototype, and gate documents dated 2026-08-03 remain valuable provenance. Their pre-`AUTH-005` statements describe the authority then in force and do not override the later production authorization. [DESIGN_READINESS_GATE.md](DESIGN_READINESS_GATE.md) is retained as a historical readiness/evidence record, not a current gate.

**IMPLEMENTATION AUTHORITY: GRANTED; OWNER-ONLY SITES V16: DEPLOYED; FULL-LIVE DEFINITION OF DONE: NOT YET SATISFIED**
