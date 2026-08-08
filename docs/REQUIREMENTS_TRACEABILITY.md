# Production V1 Requirements Traceability

**Document status:** Bounded V1 implementation and evidence map under `AUTH-005`; not a completion certificate
**Last updated:** 2026-08-08
**Architecture:** [Production SaaS Architecture](ARCHITECTURE.md)
**Controls:** [Security and Privacy](SECURITY_PRIVACY.md)
**Operations:** [Operations Handbook](OPERATIONS.md)
**Current audit:** [Full live V1 completion audit](FULL_LIVE_COMPLETION_AUDIT.md)

## How to use this record

This record maps product intent to an implementation responsibility and to the evidence that would prove the requirement for one exact release. A source file, schema, route, test, build, deployment, or checklist is evidence only for what it directly covers.

No row is complete merely because it appears here. Before changing a row to `EVIDENCED`, the release record must identify the exact source version, environment, test method/result, and any limitation. Indirect or uncertain evidence remains incomplete.

### Status vocabulary

| Status | Meaning |
|---|---|
| `AUTHORITATIVE DIRECTION` | Business Plan V2 or an exact owner decision establishes the direction. It is not implementation evidence. |
| `SELECTED — AUTH-005` | An implementation choice is adopted within the production authority. It is not deployment or acceptance evidence. |
| `IMPLEMENTATION TARGET` | Required behavior is specified; code and/or verification evidence still needs exact-release audit. |
| `EVIDENCED` | Direct evidence for the exact release has been inspected and linked. This document initially makes no such claim. |
| `UNRESOLVED EVIDENCE/OPS DEPENDENCY` | Work may continue, but the affected live claim needs external configuration, policy, exercise, or acceptance evidence. This is not a reinstated design gate. |
| `EXCLUDED` | Outside the bounded V1 unless a later explicit scope decision supersedes it. |

### Label discipline

- `[SUPPORTED BY BUSINESS PLAN V2]` is used only for facts established by the authoritative V2 business source.
- `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` remains attached to unapproved candidate scope, packaging, policy, or experience decisions inherited from planning documents.
- `[PRICING HYPOTHESIS — REQUIRES VALIDATION]` remains attached to any planning price or pause amount.
- `[UNVALIDATED BUSINESS ASSUMPTION]` identifies a business belief that implementation cannot validate by itself.
- `[REAL-WORLD VALIDATION REQUIRED]` identifies a claim that needs qualified review or observed real-world evidence.

## Source authority map

| Priority/use | Source | What it establishes for this implementation |
|---|---|---|
| Standing authority | [AGENTS.md](../../AGENTS.md) and `AUTH-005` in the [Decision Log](../../DECISION_LOG.md) | Full production implementation authority; V2 precedence; safety, truthful-operation, label, and owner-input rules |
| Authoritative business source | [Business Plan V2](../../00_source/BUSINESS_PLAN_V2.md) and [direction amendment](../../00_source/BUSINESS_DIRECTION_CHANGE_SELF_SERVE_SAAS.md) | Canada-wide self-serve B2B SaaS; solo independent instructor; coach-branded roadmap; existing tools; first wedge; business/product exclusions |
| Production completion contract | [Full Live Implementation Goal Brief](../../08_implementation_handoff/FULL_LIVE_IMPLEMENTATION_GOAL_BRIEF.md) | Meaning of full/live/working; required production journeys, quality evidence, operational evidence, exclusions, and exact-release acceptance |
| Observable candidate behavior | [Implementation Requirements](../../08_implementation_handoff/IMPLEMENTATION_REQUIREMENTS.md), [Content and Data Requirements](../../08_implementation_handoff/CONTENT_AND_DATA_REQUIREMENTS.md), and [Screen/State Matrix](../../04_wireframes/SCREEN_STATE_RESPONSIVE_MATRIX.md) | Detailed behavior/states used as the V1 implementation baseline under `AUTH-005`; their old no-code status is superseded for implementation authority, not for validation status |
| Product/ethical boundaries | [Product Boundaries](../../01_business_foundation/PRODUCT_BOUNDARIES.md) and [Ethical Sales and Trust Rules](../../03_experience_strategy/ETHICAL_SALES_AND_TRUST_RULES.md) | Coach ownership, privacy-by-default intent, external coach-package handoff, non-pressure paths, and explicit non-goals |
| Journey specifications | [Commercial and Golfer Journey](../../03_experience_strategy/COMMERCIAL_AND_GOLFER_JOURNEY.md), [Post-Assessment Roadmap](../../04_wireframes/POST_ASSESSMENT_ROADMAP.md), [Living Player Journey](../../04_wireframes/LIVING_PLAYER_JOURNEY.md), and [Phase Completion and Renewal](../../04_wireframes/PHASE_COMPLETION_AND_RENEWAL.md) | Instructor activation, golfer assessment-to-package story, Now/Goal/Roadmap/Lessons/Practice/Evidence/Phase Review continuity, and accurate outcome states; these remain unvalidated |
| Accessibility target input | [Accessibility and Content Guidelines](../../05_visual_design/ACCESSIBILITY_AND_CONTENT_GUIDELINES.md) | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` WCAG 2.2 AA candidate target, accessible content, forms, focus, reflow, media alternatives, and error recovery |
| Historical prototype evidence | [Approved Design Index](../../08_implementation_handoff/APPROVED_DESIGN_INDEX.md) and [Local Prototype README](../../09_local_prototype/README.md) | `AUTH-004` local golfer-first rendering history; not approval or evidence for the production release |

[Business Plan V1](../../00_source/BUSINESS_PLAN.md) remains preserved historical source material and is superseded where it conflicts with Business Plan V2.

## Bounded V1 journey map

The rows below are the selected production implementation baseline under `AUTH-005`. Candidate journey detail remains `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` and `[REAL-WORLD VALIDATION REQUIRED]` where the cited sources say so. Selecting a bounded implementation does not manufacture market, usability, policy, or acceptance evidence.

| ID | Required user outcome | Primary source and authority | Selected implementation responsibility | Exact evidence required | Initial status |
|---|---|---|---|---|---|
| `V1-ACQ-01` | A Canada-wide independent instructor can understand audience, problem, mechanism, effort, limits, and self-serve next step without a call | `[SUPPORTED BY BUSINESS PLAN V2]` BP V2 §§1, 7–10; Goal Brief §§4, 7 Phase 4 | Public Sites route with plain-language landing content, compatibility/non-goals, direct signup, no mandatory sales path | Content diff against approved release copy; anonymous narrow/wide/keyboard checks; unaided comprehension evidence | `IMPLEMENTATION TARGET` |
| `V1-ACQ-02` | Visitor can inspect a realistic synthetic coach-input-to-golfer-output example with no real client data | BP V2 §9; Content/Data “Acquisition”; Ethical Rules | Public synthetic sample, visibly labelled, complete without video/motion | Source-content review, synthetic label inspection, no-real-data audit, no-media/accessibility test | `IMPLEMENTATION TARGET` |
| `V1-ACQ-03` | Platform price, cadence, inclusion, trial/payment choice, cancellation/pause status, support and privacy expectations are truthful before charge | BP V2 §§9, 11–12; Ethical Rules; Goal Brief §7 | Configuration-backed commercial copy; Checkout disabled safely when exact policy/Price is absent | Aaron decision, deployed copy/config comparison, controlled Checkout test, legal/privacy review | `UNRESOLVED EVIDENCE/OPS DEPENDENCY` |
| `V1-ID-01` | Instructor can sign in, sign out, recover access, and return to the correct isolated account | Goal Brief §§7, 9; candidate implementation requirements | Dispatch-owned SIWC, internal immutable instructor ID, server-side identity mapping; no app-owned passwords | Hosted SIWC contract/suitability evidence; sign-in/sign-out/recovery/spoof tests; identity continuity and tenant-isolation suite | `UNRESOLVED EVIDENCE/OPS DEPENDENCY` |
| `V1-SETUP-01` | Instructor can enter minimum coach identity and optional bounded branding without a logo blocking value | BP V2 §7; Product Boundaries “Instructor activation”; Content/Data “Coach identity” | Authenticated coach-profile form, safe defaults, private asset handling where enabled | Validation/unit tests; persistence/ownership tests; long/short/no-logo/contrast/accessibility checks | `IMPLEMENTATION TARGET` |
| `V1-PKG-01` | Instructor can define a current coaching package, truthful price/current-details state, material terms, and one external action | BP V2 §§6–7; Content/Data “Package”; Ethical Rules | Tenant-owned package CRUD; validated HTTPS external link; explicit coach confirmation | Ownership/input/link tests; preview/published parity; missing/changed/unavailable package tests | `IMPLEMENTATION TARGET` |
| `V1-PKG-02` | SaaS subscription and coach-package price/action cannot be confused | Product Boundaries “Commercial”; Goal Brief §9 | Separate data models, page regions, labels, routes, and Stripe usage; coach action remains external | Content review, schema/route audit, Stripe test evidence, external handoff test | `IMPLEMENTATION TARGET` |
| `V1-GOLFER-01` | Instructor can create only the minimum adult golfer record and goal/context needed for the plan | BP V2 §7; Content/Data “Golfer and goal”; Product Boundaries “Information” | Adult-eligibility confirmation, minimal tenant-owned golfer record, optional context | Data-map/field-purpose review; adult-only negative test; ownership and validation tests | `IMPLEMENTATION TARGET` |
| `V1-ASSESS-01` | Instructor can record a strength, starting pattern, priority barriers, selected evidence/limits, and uncertainty | BP V2 §6; Post-Assessment Roadmap; Ethical Rules | Coach-authored assessment and evidence model; optional media; no autonomous diagnosis | Form/state tests; explicit coach-approval evidence; no-media/limited/conflicting/no-recommendation tests | `IMPLEMENTATION TARGET` |
| `V1-ROADMAP-01` | Instructor can create three or four directional phases and select a justified first phase linked to the package | BP V2 §§6–8; Implementation Requirements “Activation” | Ordered, tenant-owned phases; first-phase rationale, progress signals, limits, package relationship | Count/order/state tests; stale-edit protection; coach confirmation; content/ethical review | `IMPLEMENTATION TARGET` |
| `V1-DRAFT-01` | Instructor can save, return, edit, and recover without destructive loss or false completion | Implementation Requirements “Activation”; Screen/State Matrix | Draft state, server persistence, version/concurrency check, specific errors, minimal return view | Refresh/cross-device where supported, stale-tab, partial/invalid, retry, and data-loss tests | `IMPLEMENTATION TARGET` |
| `V1-PREVIEW-01` | Instructor can inspect the exact material golfer order and resolve blockers before sharing | BP V2 §7; Content/Data “Preview/share”; Screen/State Matrix | Same publication renderer/content model used by preview and golfer view; blocker summary; coach approval | Preview-versus-published structural/content comparison; keyboard/error traversal; long/no-media states | `IMPLEMENTATION TARGET` |
| `V1-SHARE-01` | Instructor intentionally publishes one version and creates/copies a private, revocable share capability | BP V2 §§7–8; Goal Brief Phase 4; Architecture `ARCH-005` | 256-bit capability; hashed/HMAC verifier at rest; version scope; copy-link delivery; revoke/rotate | Entropy/hash/non-persistence tests; publish atomicity; log-leak test; revoke/rotate/session invalidation tests | `IMPLEMENTATION TARGET` |
| `V1-SHARE-02` | Share status is accurate and never implies a message, receipt, booking, payment, or sale | Implementation Requirements “Activation”; Commercial/Golfer Journey | Separate draft, published, link-created, link-opened, response, and external-action-opened states; no outbound provider | State-transition and copy tests; duplicate/failure/cancel tests; audit-event inspection | `IMPLEMENTATION TARGET` |
| `V1-GVIEW-01` | Intended golfer can privately open one published version; unauthorized/expired/revoked states disclose nothing | Goal Brief §§7, 9; Product Boundaries; Post-Assessment Roadmap | Fragment/body capability exchange, scoped secure session, no-index/no-cache/referrer controls, neutral failure | Hosted browser/network/header tests; token/log/referrer review; unauthorized-state content inspection | `IMPLEMENTATION TARGET` |
| `V1-GVIEW-02` | Golfer sees coach identity, private context, Goal, honest starting point, strengths, barriers, evidence sources/limits, and directional Roadmap | BP V2 §§6–8, 15; Post-Assessment Roadmap | Read-only published narrative with coach attribution and optional-evidence fallbacks | Exact-content review, limited/no-media/long content tests, golfer comprehension and trust evidence | `IMPLEMENTATION TARGET` |
| `V1-LIVE-01` | Golfer can navigate the selected V1 continuity: Now, Goal, Roadmap, Lessons, Practice, Evidence, and Phase Review | Goal Brief Phase 4; `AUTH-004` historical direction; Living Player Journey; Phase Completion/Renewal | One coherent read-only published player journey, current priority leading; history does not become a generic dashboard | Route/navigation/state coverage, content consistency, narrow/keyboard/reflow tests, longitudinal real-world validation | `IMPLEMENTATION TARGET` |
| `V1-ACTION-01` | Golfer understands first-phase/package fit and can begin externally, ask, wait, decline, seek reassessment, or practise independently without pressure | BP V2 §§6–7, 15; Commercial/Golfer Journey; Ethical Rules | Current coach package terms, clear external warning, visible alternatives, neutral response state | Ethical/content review; action prominence/focus tests; unavailable-link and every alternative-path test | `IMPLEMENTATION TARGET` |
| `V1-RETURN-01` | Instructor returns to recent/incomplete golfer work and the next useful action without a full dashboard or human onboarding | BP V2 §7; Implementation Requirements | Minimal tenant-scoped return list/status and contextual create/continue/update actions | New/empty/incomplete/recent/unauthorized/error tests; support-dependence observation | `IMPLEMENTATION TARGET` |
| `V1-BILL-01` | Instructor can make an explicit SaaS purchase through hosted Checkout and see provider-authoritative state | Goal Brief Phase 4; BP V2 §§11–12 as hypotheses; Architecture `ARCH-006` | Server-created Stripe Checkout; configured Price; signature-verified idempotent webhook; authenticated GET-only account reconciliation; durable tenant-scoped reconciliation targets; account-scoped operation lease; bounded scheduled GET-only recovery; D1 entitlement projection | Unit/integration tests for signature/replay/order/failure/reconciliation, lease races, scheduler fairness/backoff/dead-letter recovery, and stale-generation fencing; Stripe test-mode E2E; approved controlled live transaction | `UNRESOLVED EVIDENCE/OPS DEPENDENCY` |
| `V1-BILL-02` | Instructor can use hosted Portal for supported account changes; cancel/pause/failure consequences match approved policy | Goal Brief Phase 4; Implementation Requirements “Account”; Ethical Rules | Server-created Customer Portal; signed-webhook and tenant-scoped read-only reconciliation; accurate local state and policy-driven entitlements | Approved policy/Portal config; cancel/failure/resume tests; reconciliation and stale-read fencing; deployed copy check | `UNRESOLVED EVIDENCE/OPS DEPENDENCY` |
| `V1-DATA-01` | Instructor/golfer can use approved access, correction, export, revocation, and deletion paths | Goal Brief Phase 4; Content/Data “Privacy”; Ethical Rules | Authenticated/request workflow, private export, cross-store deletion orchestration, auditable status | Qualified policy review; identity/scope tests; D1/R2/export/capability deletion and backup-expiry evidence | `UNRESOLVED EVIDENCE/OPS DEPENDENCY` |
| `V1-RECOVERY-01` | Errors explain what happened, what did not happen, and recovery without exposing private content or losing valid work | Implementation Requirements “State”; Screen/State Matrix | Typed privacy-safe errors, request IDs, preserved draft, retry/alternate path, neutral unauthorized state | Failure injection across D1/R2/SIWC/Stripe/external link; content/accessibility review | `IMPLEMENTATION TARGET` |
| `V1-SUPPORT-01` | Self-serve help exists and support can handle genuine issues without becoming hidden managed service | BP V2 §§8, 13, 16; Self-Serve Product Strategy | Inline guidance, public support route, support categories and intervention-time recording | Help findability/comprehension; unassisted tests; support runbook and actual support records | `IMPLEMENTATION TARGET` |

## Cross-cutting requirement map

| ID | Requirement | Source | Selected control/evidence home | Evidence required | Initial status |
|---|---|---|---|---|---|
| `X-TENANT-01` | No cross-instructor data access | Goal Brief §§7, 9; Content/Data privacy constraints | [Security and Privacy](SECURITY_PRIVACY.md) identity/authorization; D1 ownership constraints | Automated all-resource/action cross-tenant matrix and manual code review | `IMPLEMENTATION TARGET` |
| `X-PRIVATE-01` | Private-by-default golfer content and no personal detail before authorization | Product Boundaries; Ethical Rules | Hashed capability, private R2, neutral errors, no third-party scripts on golfer routes | Hosted capability/network/cache/log tests | `IMPLEMENTATION TARGET` |
| `X-MIN-01` | Collect only approved minimum content; optional media/measurements never block core value | BP V2 §7.1; Content/Data; Product Boundaries | Data classification/purpose map; optional schema/forms; text-first rendering | Field-purpose and schema review; no-media/optional-absent E2E | `IMPLEMENTATION TARGET` |
| `X-COACH-01` | Coach owns every diagnosis, priority, phase, evidence interpretation, and recommendation | `[SUPPORTED BY BUSINESS PLAN V2]` BP V2 §§6, 15; Ethical Rules | No AI; coach-authored forms; explicit pre-publication confirmation; audit | Code/dependency review, content flow test, coach confirmation and real-world authenticity evidence | `IMPLEMENTATION TARGET` |
| `X-ETHICS-01` | No urgency, scarcity, shame, guarantees, hidden alternatives, or false outcome claims | BP V2 §15; Ethical Rules | Content rules, visible alternatives, truthful state model, no synthetic/live confusion | Exact-copy review, path prominence/focus audit, representative golfer testing | `IMPLEMENTATION TARGET` |
| `X-A11Y-01` | Acquisition, sign-in, authoring, preview, share, golfer, billing, account exit, error and recovery are accessible | BP V2 §15.4; Accessibility Guidelines candidate target | Semantic React UI, keyboard/focus/status/error behavior, reflow, reduced motion, media alternatives | Automated checks plus manual keyboard, screen reader, zoom/reflow, contrast, reduced-motion, no-media tests | `IMPLEMENTATION TARGET` |
| `X-RESP-01` | Material meaning/actions survive supported narrow/wide widths and long/short content | Screen/State Matrix; Content/Data extremes | Responsive content-first layouts and no horizontal narrative dependency | Supported-browser/device matrix; 320 CSS px equivalent and 200%/400% review as applicable | `IMPLEMENTATION TARGET` |
| `X-SEC-01` | Authentication, session, input, output, webhook, file, secret, dependency, and abuse controls pass | Goal Brief Phase 5 | [Security and Privacy](SECURITY_PRIVACY.md) | Threat-model review, automated abuse cases, config/dependency/secret assessment, remediation/retest | `IMPLEMENTATION TARGET` |
| `X-AUDIT-01` | Security/privacy/account/data/billing changes produce minimal first-party audit events | Goal Brief Phases 4, 6; Architecture `ARCH-007` | D1 append-oriented audit events and reconciliation | Event coverage tests, transactional/outbox behavior, content-minimization review | `IMPLEMENTATION TARGET` |
| `X-LOG-01` | Runtime is diagnosable without leaking content, tokens, secrets, or payment data | Goal Brief Phases 5–6; Architecture `ARCH-007` | Structured app logging plus Sites logs | Deployed log samples, access/retention/redaction review, alert exercise | `UNRESOLVED EVIDENCE/OPS DEPENDENCY` |
| `X-BACKUP-01` | D1/R2 state is backed up and recoverable under documented policy | Goal Brief §§7, 9 | [Operations](OPERATIONS.md) backup/restore procedure | Successful isolated restore, integrity checks, actual recovery measurements, named owner | `UNRESOLVED EVIDENCE/OPS DEPENDENCY` |
| `X-OPS-01` | Deployment, migration, rollback, incident, support, billing, data-request, maintenance and cost operations are documented and exercised | Goal Brief Phases 6–7 and §9 | [Operations](OPERATIONS.md) | Exact release packet, exercises, alert response, role assignments, configuration inventory | `UNRESOLVED EVIDENCE/OPS DEPENDENCY` |
| `X-LEGAL-01` | Published legal/privacy/billing/support copy matches actual behavior | Goal Brief Phases 2, 6 and §9; Content/Data privacy classification | Versioned copy and behavior-to-policy review | Qualified review, Aaron decision where required, deployed content and scenario comparison | `UNRESOLVED EVIDENCE/OPS DEPENDENCY` |
| `X-LIVE-01` | Exact accepted release is available at the authorized public entry point and works with controlled real operations | Goal Brief §§3, 7, 9 | Sites production release and final evidence packet | Domain/config baseline, live smoke/transaction, monitoring/recovery evidence, Aaron acceptance | `UNRESOLVED EVIDENCE/OPS DEPENDENCY` |

## Default V1 exclusions

The following exclusions come from `[SUPPORTED BY BUSINESS PLAN V2]` product boundaries and the Goal Brief §8. `AUTH-005` authorizes the bounded V1; it does not silently add these features. A change requires an explicit superseding scope decision and updated requirements, risk, design, implementation, and verification evidence.

| ID | Excluded capability | Source | Architectural enforcement/evidence |
|---|---|---|---|
| `EX-TEAM-01` | Facility, academy, team, roles/permissions, aggregate reporting, or enterprise sales | BP V2 §§1, 4, 7; Goal Brief §8 | One instructor identity/tenant model; no facility hierarchy, seats, or enterprise workflow |
| `EX-COACH-PAY-01` | Native booking, scheduling, purchasing, payment, invoice, refund, or tax operation for the instructor's coaching package | BP V2 §7.2; Goal Brief §§8–9 | Coach package stores only a validated external action; Stripe routes are SaaS billing only |
| `EX-MARKET-01` | Public coach marketplace, directory, discovery, or lead marketplace | BP V2 §7.2; Goal Brief §8 | No public instructor index/search; public content is platform-owned and synthetic |
| `EX-AI-01` | Autonomous diagnosis, coaching, roadmap/phase/package generation, outcome prediction, or any AI feature | BP V2 §§6–7; Goal Brief §§7–8 | No AI provider/model/dependency/call path; coach confirmation required for judgments |
| `EX-INT-01` | Launch-monitor, CRM, booking, coach-payment, messaging, video-analysis, or communication-platform integration | BP V2 §§1, 4, 7; Goal Brief §8 | Manual coach input, optional private upload, external action link, copy-link sharing |
| `EX-CUSTOM-01` | Unlimited branding, custom implementation, website building, managed content/report production, or concierge onboarding | BP V2 §7.2; Goal Brief §8 | Bounded profile fields/templates and self-serve support boundary |
| `EX-DASH-01` | Complete CRM/dashboard, revenue attribution, speculative analytics/reporting, gamification, or social feed | Product Boundaries; Goal Brief §8 | Minimal return state and necessary first-party audit/operational signals only |
| `EX-JUNIOR-01` | Junior-golfer data or use | Goal Brief §8; Product Boundaries; Ethical Rules | Adult eligibility confirmation and rejection before golfer data collection/share |
| `EX-GEO-01` | Operation outside Canada | BP V2 §§1, 2, 4; Goal Brief §8 | Public scope/copy and operating policy remain Canada-wide; expansion requires jurisdictional review |
| `EX-MILESTONE-01` | Milestone sharing, public/social story, referral reward, or automated instructor referral in V1 | BP V2 §6.3; Product Boundaries “later lifecycle”; [Milestone and Referral](../../04_wireframes/MILESTONE_AND_REFERRAL.md) | No milestone/referral/public-share routes or events; Phase Review may conclude without referral |
| `EX-MSG-01` | Product-sent email/SMS/chat or claim of delivered message | BP V2 existing-tool rule; Goal Brief §8 integrations | Instructor copies capability and uses an existing channel; state is “link created/copied,” not “sent” |
| `EX-NATIVE-APPS-01` | Native mobile applications, GPS, simulator, or facility operations | Product Boundaries explicit non-goals | Responsive web only; no mobile-platform or facility infrastructure |

## Policy and commercial hypotheses that implementation must not silently decide

| Topic | Required label/status | Implementation behavior until resolved |
|---|---|---|
| CAD $75/month Solo plan | `[PRICING HYPOTHESIS — REQUIRES VALIDATION]` | Read exact configured Stripe Price and approved display copy; do not hard-code the hypothesis as a production fact |
| 14-day no-card trial | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` | No hidden auto-conversion; feature/config remains off or explicitly non-live until exact decision/configuration |
| CAD $15/month seasonal pause and six-month maximum | `[PRICING HYPOTHESIS — REQUIRES VALIDATION]` and `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` | Do not invent Stripe/product behavior; represent only the approved account states and consequences |
| “Unlimited” ordinary solo use | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` | Enforce safe technical bounds; publish reasonable-use language only after evidence and decision |
| Retention/deletion durations | `[OWNER INPUT REQUIRED]` plus `[REAL-WORLD VALIDATION REQUIRED]` | Keep lifecycle configurable/auditable; no undocumented duration or deletion promise |
| Media consent/limits | `[OWNER INPUT REQUIRED]` plus `[REAL-WORLD VALIDATION REQUIRED]` | Keep media optional and disabled/limited until approved policy and controls are present |
| Tax/refund/failed-payment/cancel consequences | `[OWNER INPUT REQUIRED]` plus `[REAL-WORLD VALIDATION REQUIRED]` | Stripe integration cannot convert a technical state into policy; copy and entitlement transitions await exact decision |
| Activation, conversion, retention, support and revenue targets | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` or `[UNVALIDATED BUSINESS ASSUMPTION]` as sourced | Instrument only approved necessary events; never report a target as achieved without real cohort evidence |

## Evidence dependency ledger

These are explicitly **not** design gates. They are the missing evidence or external operating conditions needed for honest live claims.

| Dependency | Affected requirements | Current claim allowed | Closure evidence |
|---|---|---|---|
| SIWC/public-auth suitability | `V1-ID-01`, `X-TENANT-01`, `X-SEC-01` | Selected instructor identity architecture; no public production suitability claim | Exact hosted contract/config, sign-in/recovery/sign-out/spoof/tenant tests, documented support path |
| Stripe credentials and exact Price | `V1-ACQ-03`, `V1-BILL-01`, `V1-BILL-02`, `V1-PKG-02` | Planned hosted billing; no live charge or approved-price claim | Authorized live account/secrets, approved Product/Price and policy, webhook evidence, controlled transaction/reconciliation |
| Production domain | `V1-ACQ-01`, `V1-ID-01`, `V1-GVIEW-01`, `X-SEC-01`, `X-LIVE-01` | Deployable application shape; no approved public entry point | Domain authority, DNS/TLS/canonical redirect, origin/cookie/header/referrer tests |
| Legal/privacy/support/billing copy | `V1-ACQ-03`, `V1-DATA-01`, `V1-BILL-02`, `X-LEGAL-01` | Technical lifecycle hooks; no compliance/policy-completeness claim | Qualified review, exact owner decisions, versioned deployed copy matched to behavior |
| Backup and restore exercise | `X-BACKUP-01`, `X-OPS-01`, `X-LIVE-01` | Documented intended procedure; no recoverability claim | Isolated D1/R2 restore with integrity checks, measured results, operator and remediations |
| Sites logs and alerts | `X-LOG-01`, `X-OPS-01`, `X-LIVE-01` | Selected observability sources; no retention/redaction/alert-effectiveness claim | Deployed sampling, token/PII checks, access review, alert delivery and response exercise |
| Live acceptance | All live/working claims | Implementation may be built/tested/deployed within authority; completion remains unproven | Exact release/URL/config, full requirement audit, controlled real journeys, residual-risk record, Aaron's dated acceptance |

## Exact-release completion audit

Before any production-complete claim, perform and record this audit:

1. Freeze the release identifier, dependency lock, migrations, configuration names, Sites deployment, D1/R2 resources, Stripe mode/Price, public domain, and content/policy versions.
2. For every `V1-*` and `X-*` row, link direct source/design/code/test/runtime evidence and record pass, fail, not applicable with authority, or missing.
3. Confirm every `EX-*` row by route/schema/dependency/UI search and runtime behavior; absence from navigation alone is insufficient.
4. Verify business-plan and hypothesis labels in acquisition, billing, support, and reporting copy.
5. Inspect authorization coverage for every D1/R2 resource and action, not a sample endpoint.
6. Inspect the capability through generation, storage, exchange, logs/referrers, session, publication update, revocation, and deletion.
7. Inspect Stripe through Checkout/Portal creation, signed webhook receipt, replay/order/failure/reconciliation, entitlement, cancellation/failure, and a controlled authorized live transaction.
8. Complete responsive/accessibility, security/privacy, failure/recovery, backup/restore, rollback, logging/alerting, support/data-request, and cost exercises against the exact release.
9. Reconcile every finding and residual risk with severity, owner, mitigation, review date, and explicit disposition.
10. Record the exact public URL and Aaron's acceptance decision with date, conditions, residual risks, and revisit triggers.

Until that audit is complete, this traceability record demonstrates organized requirements—not a secure, compliant, accessible, recoverable, live, or accepted production SaaS.
