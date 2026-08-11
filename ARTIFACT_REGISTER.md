# Artifact Register

> **Register scope note:** Most entries below are the 2026-08-03 pre-production planning register. `AUTH-005` later authorized implementation, and exact production candidate/evidence records now live in [Design and Implementation Version Index](08_implementation_handoff/APPROVED_DESIGN_INDEX.md), [Release Evidence](10_production_saas/docs/RELEASE_EVIDENCE.md), and [Full Live Completion Audit](10_production_saas/docs/FULL_LIVE_COMPLETION_AUDIT.md). Pre-`AUTH-005` “blocked” or “no implementation” statements are historical, not current authority.

**CURRENT STATUS:** Historical planning artifacts registered; exact private Sites v12 is the current owner-only candidate; no exact product/design/content/policy baseline or live release is accepted  
**Purpose:** Make source, specification, planned artifact, evidence, and approval status explicit.

## Authority levels

| Level | Meaning |
|---|---|
| Current source | Governs current planning subject to labels and owner decisions |
| Historical source | Preserved traceability; does not govern where superseded |
| Current specification | Substantive text plan; not a design approval or evidence result |
| Planned real artifact | Required but does not exist |
| Evidence record | Real versioned observation/result; production automated, synthetic-recovery, release, and limited owner-only hosted records now exist alongside still-missing real-user/commercial evidence |
| Approved artifact | Exact version Aaron explicitly approves; historical local-prototype source approvals exist, but no exact production product/design/content baseline or live release is approved/accepted |

## Source and governance

| Artifact | Classification | Current state | Authority / next action |
|---|---|---|---|
| [AGENTS.md](AGENTS.md) | Operational authority | Current | Enforces V2 precedence and authorizes bounded production work under `AUTH-005` while preserving owner-input/material-effect safeguards |
| [Business Plan V1](00_source/BUSINESS_PLAN.md) | Historical source | Preserved unchanged | Use for history/applicable carried-forward content only |
| [Business Direction Change](00_source/BUSINESS_DIRECTION_CHANGE_SELF_SERVE_SAAS.md) | Authoritative amendment | Current | Effective 2026-08-03 |
| [Business Plan V2](00_source/BUSINESS_PLAN_V2.md) | Current source | Current | Governs conflicts with V1 |
| [Source Index](00_source/SOURCE_INDEX.md) | Governance | Current | Defines labels/precedence |
| [Decision Log](DECISION_LOG.md) | Decision history/status | Reconciled | `DIR-001` and `AUTH-005` current; prototype history preserved; unvalidated commercial decisions still await Aaron/evidence |
| [Aaron Review Queue](AARON_REVIEW_QUEUE.md) | Owner action plan | Current | Current `OWNER-*` release decisions first; historical `AQ-*` questions retained and routed |
| [Master Todo](MASTER_TODO.md) | Historical planning snapshot | Superseded for implementation authority | Retained pre-`AUTH-005` critical-path provenance; use `START_HERE.md` and the Full Live Goal Brief for current work |
| [Full Live Implementation Goal Brief](08_implementation_handoff/FULL_LIVE_IMPLEMENTATION_GOAL_BRIEF.md) | Production completion contract | Current | Governs the meaning of full/live/working and the definition of done under `AUTH-005` |
| [Production SaaS](10_production_saas/README.md) | Production implementation | Current owner-only candidate source | Bounded V1 implementation; exact deployed candidate and limitations are recorded separately |
| [Release Evidence](10_production_saas/docs/RELEASE_EVIDENCE.md) | Exact release evidence | Current | Binds source/archive/Sites version/deployment and limits the hosted claims precisely |
| [Full Live Completion Audit](10_production_saas/docs/FULL_LIVE_COMPLETION_AUDIT.md) | Completion/status evidence | Current and incomplete | Records implemented behavior, residual risks, and missing hosted/manual/owner/external evidence |
| [Owner Release Decisions Required](10_production_saas/docs/OWNER_RELEASE_DECISIONS_REQUIRED.md) | Owner decision packet | Current | Routes credential, scope, operator, commercial, privacy, media, provider/access, validation, and acceptance decisions |

## Current specifications by stage

| Area | Registered specification set | State |
|---|---|---|
| Business foundation | All files under [`01_business_foundation`](01_business_foundation/PRODUCT_DEFINITION.md) | Revised for V2; unvalidated |
| Market validation | All files under [`02_market_validation`](02_market_validation/RESEARCH_PLAN.md) | Protocols ready for review; no participant evidence |
| Experience strategy | Existing set plus [Self-Serve Product Strategy](03_experience_strategy/SELF_SERVE_PRODUCT_STRATEGY.md) | Revised; untested |
| Wireframes | Existing golfer/lifecycle specs plus [Self-Serve Instructor Activation](04_wireframes/SELF_SERVE_INSTRUCTOR_ACTIVATION.md) | Text complete; no frames |
| Visual design | [Visual Direction](05_visual_design/VISUAL_DIRECTION.md), [Foundations](05_visual_design/DESIGN_SYSTEM_FOUNDATIONS.md), [Accessibility](05_visual_design/ACCESSIBILITY_AND_CONTENT_GUIDELINES.md), [Figma Plan](05_visual_design/FIGMA_FILE_PLAN.md) | Revised; no Figma |
| Prototype | Existing paired set plus [Assumption-Driven Visual Prototype Brief](06_prototype/ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md) and [Visual Prototype Copy and Content](06_prototype/VISUAL_PROTOTYPE_COPY_AND_CONTENT.md) | Visual-concept preparation complete; no Figma prototype/test |
| Business validation | Existing set plus [Self-Serve SaaS Validation Plan](07_business_validation/SELF_SERVE_SAAS_VALIDATION_PLAN.md) | Revised; no beta/commercial evidence |
| Implementation handoff and production | [Full Live Goal Brief](08_implementation_handoff/FULL_LIVE_IMPLEMENTATION_GOAL_BRIEF.md), [Requirements Traceability](10_production_saas/docs/REQUIREMENTS_TRACEABILITY.md), [Production SaaS](10_production_saas/README.md), and current evidence/runbooks | Bounded V1 implemented; Sites v12 deployed owner-only with degraded deep health; golfer-response idempotency/recovery, exact archive verification, normalized reproducibility, and two 242/242 clean-worktree runs recorded; hosted supported-browser retest and exact product/design/content/policy approval/full-live acceptance absent |

## Current production candidates and evidence

| Artifact ID | Artifact | Current state | Authority / limitation |
|---|---|---|---|
| ART-C05 | `ROADMAP-SITES-V5-2026-08-08` | Superseded owner-only candidate | Deployed under `AUTH-005`, then superseded by version 6; never accepted for controlled-user or public operation |
| ART-C06 | `ROADMAP-SITES-V6-2026-08-08` | Superseded owner-only candidate | Deployed under `AUTH-005`, then superseded by version 7; never accepted for controlled-user or public operation |
| ART-C07 | `ROADMAP-SITES-V7-2026-08-08` | Superseded owner-only candidate | Commit `7ed01ec822fdb5c2bfbe6db7e3c99bcba126ac17`, exact saved Sites version, deployment, and environment revision 9 remain historical; never accepted for controlled-user or public operation; forbidden as a rollback target after consent-governed use |
| ART-C08 | `ROADMAP-SITES-V8-2026-08-08` | Superseded owner-only candidate | Runtime commit `cf117fef8ea42272d0b7e2358fe4197c024f86a7`; saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_01ba2d860b508191b4d104339921606d`; successful deployment `appgdep_6a775b172534819196391fd626e95aa3`; environment revision 10; superseded by version 9; never accepted for controlled-user or public operation |
| ART-C09 | `ROADMAP-SITES-V9-2026-08-08` | Superseded private owner-only candidate | Runtime commit `6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d`; saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_58bb67e8e23c8191a584540a09e363c5`; successful deployment `appgdep_6a7768f92c588191934eda8abea6d6b4`; environment revision 11; superseded by version 10; never accepted for controlled-user or public operation |
| ART-C10 | `ROADMAP-SITES-V10-2026-08-08` | Superseded private owner-only candidate | Runtime commit `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1`; saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_1007b9b4ea8c8191968d55991abf374c`; successful deployment `appgdep_6a779cabaec4819191b0cf1e815ce2e5`; environment revision 12; provider `updated_at` `2026-08-08T21:17:13.525116Z`; superseded by version 11; never accepted for controlled-user or public operation |
| ART-C11 | `ROADMAP-SITES-V11-2026-08-08` | Superseded private owner-only candidate | Runtime commit `44670a64498779cf747914b4465380916a939301`; saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_4c49cdec72bc8191aeece01f5689e51a`; successful deployment `appgdep_6a77b01714b881918245bb5248349e0d`; environment revision 13; provider `updated_at` `2026-08-08T22:40:07.742084Z`; owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site`; Checkout disabled; CSP nonce code-remediated and exact-archive verified with hosted supported-browser retest pending; superseded by version 12; no product/design/content/policy approval or live-release acceptance |
| ART-C12 | `ROADMAP-SITES-V12-2026-08-09` | Current private owner-only candidate | Runtime commit `7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c`; saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_8868e09fcb28819181cfbebdf82ce73f`; successful deployment `appgdep_6a77c5c85974819185ce1c8caf13007c`; environment revision 14; provider `updated_at` `2026-08-09T00:12:04.939300+00:00`; owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site`; Checkout disabled; session/account-scoped golfer-response idempotency and bounded same-tab recovery added; exact archive verification, normalized reproducibility, and two 242/242 clean-worktree runs passed; no product/design/content/policy approval or live-release acceptance |
| ART-E09 | Version-7 automated verification record | Historical | Preserves the exact version-7 evidence within its recorded limits; superseded by version 8 and not reusable as current-candidate evidence |
| ART-E10 | Version-7 owner-only hosted release record | Historical and limited | Preserves deployment identity and the limited version-7 hosted observations; not evidence for version 8 and not authenticated hosted acceptance, public operation, billing, recovery, or real-user use |
| ART-E11 | Version-8 post-commit verification record | Present for exact version-8 source | Artifact/archive and release-integrity evidence green; 226 automated tests; release-time/pre-SBOM scan of 248 runtime-source text files; post-SBOM reconciliation scan of 251 files; `npm audit` zero; 54/54 capacity checks local-only; recovery across 10 migrations/31 tables local-only. **[REAL-WORLD VALIDATION REQUIRED]** |
| ART-E12 | Version-8 owner-only hosted release record | Present but limited | Saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_01ba2d860b508191b4d104339921606d` and deployment `appgdep_6a775b172534819196391fd626e95aa3` succeeded at environment revision 10 for the private URL; does not prove authenticated/manual accessibility, hosted operations/recovery, operator workflow, public operation, billing, real-user success, or acceptance |
| ART-E13 | Version-9 exact-source verification record | Historical exact-version-9 evidence | Artifact/archive and release-integrity evidence green; 229 automated tests; 252 runtime-source text files and 258 expanded evidence/source files scanned with zero secret findings; `npm audit --omit=dev` zero; 54 local synthetic requests with zero failures; local recovery across 10 migrations/31 tables, two tenants, and three objects. The isolated clean install passed behavior but not byte identity. **[REAL-WORLD VALIDATION REQUIRED]** |
| ART-E14 | Version-9 owner-only hosted release record | Historical and limited | Saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_58bb67e8e23c8191a584540a09e363c5` and deployment `appgdep_6a7768f92c588191934eda8abea6d6b4` succeeded at environment revision 11 for the private URL; signed-out containment passed, but authenticated/manual accessibility, hosted scheduler/recovery/alerts, operator workflow, public operation, billing, real-user success, and acceptance remain unproved |
| ART-E15 | [Historical successor-source reproducibility record](10_production_saas/docs/release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md) | Exact source-control evidence at `66f5203a913f01c8da20555feebdbb99152c052c`; not itself a release candidate | Two distinct detached clean checkouts each completed a locked install of 501 packages with five install scripts blocked and passed 234/234 verification. Their 49-file inventories matched; raw differences were limited to `server/index.js` and two `vinext-server.json` manifests, with zero differences after strict allowlisted generated-value normalization. The exact commit remains undeployed and does not repair version 9's historical byte-rebuild failure; the control was later rerun at exact deployed version-10 commit. |
| ART-E16 | [Version-10 exact private-candidate evidence](10_production_saas/docs/release-evidence/ROADMAP-SITES-V10-2026-08-08.md) | Historical exact-version-10 verification and hosted-containment record | Three complete 234/234 verification runs passed; two exact-commit clean builds had identical 49-file inventories and zero differences after strict generated-value normalization; the 258-file integrity scan and production audit passed; version 10 deployed successfully owner-only at environment revision 12. It is superseded by version 11 and was never accepted for controlled users or public operation. |
| ART-E17 | [Version-11 exact private-candidate evidence](10_production_saas/docs/release-evidence/ROADMAP-SITES-V11-2026-08-08.md) | Historical superseded exact-version-11 verification and deployment record | CSP nonce code remediation and exact-archive verification passed; each of two exact-commit clean worktrees passed 237/237 automated tests; version 11 deployed successfully owner-only at environment revision 13 and was superseded by version 12. Signed-in hosted supported-browser CSP/auth, manual accessibility, hosted scheduler/recovery/alerts, operator workflow, public operation, billing, real-user success, and acceptance remain unproved. |
| ART-E18 | [Version-12 exact private-candidate evidence](10_production_saas/docs/release-evidence/ROADMAP-SITES-V12-2026-08-09.md) | Current exact-version-12 verification and deployment record | Session/account-scoped golfer-response idempotency, a ten-second client timeout, and same-tab ambiguous-outcome recovery are recorded; exact archive verification and normalized reproducibility passed; each of two exact-commit clean worktrees passed 242/242 automated tests; version 12 deployed successfully owner-only at environment revision 14 with Checkout disabled. Hosted-browser retry, signed-in CSP/auth, manual accessibility, hosted scheduler/recovery/alerts, operator workflow, public operation, billing, real-user success, and acceptance remain unproved. Ordinary rollback to version 11 is forbidden because it regresses the lost-ack deduplication/recovery contract. |

Use the [Design and Implementation Version Index](08_implementation_handoff/APPROVED_DESIGN_INDEX.md) as the canonical candidate/version ledger. Any later source, configuration, or deployment change requires a new exact candidate/evidence record.

## Planned real design artifacts

| Artifact ID | Required artifact | Expected location/reference | Current status | Approval condition |
|---|---|---|---|---|
| ART-D01 | Governed Figma file | Register actual URL/version later | MISSING | File follows governance; no approval implied |
| ART-D02 | Acquisition low-fi | Figma page 04/related board | MISSING | Tested/versioned/Aaron decision |
| ART-D03 | 12-step activation low-fi | Figma page 04 | MISSING | States/widths/test/Aaron decision |
| ART-D04 | 8-screen golfer low-fi | Figma page 05 | MISSING | Preview parity/test/Aaron decision |
| ART-D05 | Dual visual-direction exploration | Figma page 06 | MISSING | Identical-content test + Aaron choice |
| ART-D06 | Required patterns/states | Figma page 07 | MISSING | Derive only from approved/specified flows |
| ART-D07 | Acquisition high-fi | Figma page 08 | MISSING | Content/access/test/exact approval |
| ART-D08 | Activation high-fi | Figma page 09 | MISSING | Full critical state set/exact approval |
| ART-D09 | Golfer high-fi | Figma page 10 | MISSING | Exact linked preview/output approval |
| ART-D10 | Paired clickable prototype | Figma page 12 | MISSING | Acceptance thresholds and exact decision |
| ART-D11 | Accessibility audit | Suitable semantic artifact + report | MISSING | Specialist/representative testing |

`AUTH-001` made ART-D01 through ART-D10 eligible for exploratory visual preparation using explicitly provisional defaults. Their `MISSING` status remains accurate for that historical Figma/design program, but no longer blocks production implementation under `AUTH-005`. It still means no such artifact can be claimed as reviewed or approved.

`AUTH-002` registered the implementation-agent prompt as a **historical planning artifact**, not current production authority. Its preflight/no-code limitation describes the authority then in force. `AUTH-003`/`AUTH-004` later authorized the local prototype and `AUTH-005` independently authorized production architecture, implementation, security, and formal testing.

## Planned real evidence and policy artifacts

| Artifact ID | Artifact | Current status | Minimum content |
|---|---|---|---|
| ART-E01 | 12 instructor discovery records/synthesis | MISSING | Recent behavior, artifacts, region/season, counterevidence |
| ART-E02 | 12 golfer discovery records/synthesis | MISSING | Recent assessment/package journey and trust |
| ART-E03 | Current competitor teardown | MISSING | Dated primary-source/self-serve observations |
| ART-E04 | 8 instructor activation test record | MISSING | Exact version, task, assistance, errors, retell |
| ART-E05 | 10 golfer + 5 authenticity test record | MISSING | Comprehension, trust, coach ownership, effort |
| ART-E06 | Assisted-beta intervention/outcome record | MISSING | 5–8 instructors, every founder touch, real shares |
| ART-E07 | True self-serve beta record | FUTURE / OWNER- AND POLICY-AUTHORIZED | ≥15 instructors, live activation/payment/support; exact participants, access, consent, support, data, stop triggers, and any transaction require current authorization |
| ART-E08 | Seasonal cohort report | FUTURE | paid/pause/cancel/reactivation across relevant season |
| ART-P01 | Privacy/consent/access/share policy | IMPLEMENTED CONTROL / APPROVED POLICY MISSING | Consent enforcement exists, but exact policy text/version/required choices still require qualified review + Aaron decision |
| ART-P02 | Billing/trial/cancel/pause/resume policy | MISSING | Qualified review + Aaron decision |
| ART-P03 | Support/incident/withdrawal procedure | MISSING | Roles, triggers, records, escalation |
| ART-P04 | Privacy data-request operator authority/configuration | IMPLEMENTED CONTROL / CONFIGURATION MISSING | Name authorized operators and securely provision the digest allowlist/pepper outside the repository; absence intentionally degrades deep health |

## Approved artifact register

Historical local prototype source sets were authorized under `AUTH-003` and `AUTH-004`; production implementation is authorized under `AUTH-005`. No exact production product/design/content baseline, public policy set, or accepted live release is recorded. Use [APPROVED_DESIGN_INDEX.md](08_implementation_handoff/APPROVED_DESIGN_INDEX.md) for the current version index.

## Registration rules

- Record exact name/version/date/location/owner/status.
- Mark synthetic content and unvalidated claims.
- Link evidence to exact tested artifact.
- Preserve superseded artifacts and replacement IDs.
- Never label a URL, frame, or policy approved without Aaron's explicit recorded decision.
- Register technical/code candidates and evidence under `AUTH-005` without mislabelling them as approved designs, validated outcomes, or accepted releases.

**IMPLEMENTATION AUTHORITY: GRANTED UNDER `AUTH-005`; EXACT DESIGN/POLICY/LIVE RELEASE ACCEPTANCE: NOT RECORDED**
