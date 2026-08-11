# Open Questions

**CURRENT STATUS:** Bounded production implementation is authorized; exact Sites v16 remains owner-only as private staging/evidence, while `TECH-006` supersedes Sites as the final paid live-V1 host because current official guidance prohibits enabling financial transactions, data residency is unavailable at launch, some background/hosting patterns are unsupported, cron is unproved, and `LOG-PRIV-001` remains High/open. Direct Cloudflare Workers/D1/R2 is the least-change migration candidate for verification only—not deployed, public, paid, data-migrated, or accepted; `OWNER-SEC-001` remains completed history and all named external/owner dependencies remain open  
**RULE:** Do not resolve an owner question without Aaron; do not resolve an evidence question through simulation.

## Current routing

- Route exact release choices and proposed decision wording through [Owner Release Decisions Required](10_production_saas/docs/OWNER_RELEASE_DECISIONS_REQUIRED.md) and the current section of [Aaron Review Queue](AARON_REVIEW_QUEUE.md).
- Route product, market, usability, commercial, and real-user observations through the applicable validation protocol and [Evidence Log](02_market_validation/EVIDENCE_LOG.md); implementation does not validate them.
- Route technical requirement/evidence gaps through the [Full Live Goal Brief](08_implementation_handoff/FULL_LIVE_IMPLEMENTATION_GOAL_BRIEF.md), [Requirements Traceability](10_production_saas/docs/REQUIREMENTS_TRACEABILITY.md), and [Full Live Completion Audit](10_production_saas/docs/FULL_LIVE_COMPLETION_AUDIT.md). Safe in-scope engineering gaps are not owner questions merely because they remain open.
- Record only Aaron's exact decisions in [DECISION_LOG.md](DECISION_LOG.md). Preserve historical `AQ-*` and prototype assumptions as provenance.

`TECH-006` is an owner-delegated implementation decision under `AUTH-005`, not an owner production-account or release approval. It preserves `TECH-001` and `TECH-005` history, retains Sites v16 owner-only for private staging/evidence, and selects direct Cloudflare Workers/D1/R2 only as the least-change migration candidate to verify. Official Cloudflare documentation supports direct Cron Triggers and `invocation_logs=false`, but documentation is not hosted evidence. No account creation, credential use, charge, domain/public-access change, public-auth provider choice, production-data migration, or release acceptance is authorized or inferred.

## Assumption-driven prototype handling

`AUTH-001` allowed the documentation team to freeze provisional answers to these questions for the historical visual/experience concept. The frozen values are listed as `VP-A01` through `VP-A16` in [Assumption-Driven Visual Prototype Brief](06_prototype/ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md).

That treatment makes the concept internally coherent; it does not close an `OQ-*` or `AQ-*` item, approve a recommendation, or create evidence. If Aaron later answers a question differently, revise the concept through the recorded change rather than treating the prototype default as precedent.

## Owner decisions

| ID | Question | Required owner action | Current release route | Historical planning route |
|---|---|---|---|---|
| OQ-01 | What exactly is included in the one Solo plan? | Approve/modify ordinary-use inclusion and any future cost safeguard. | `OWNER-SCOPE-001`, `OWNER-COMM-001` | AQ-01 |
| OQ-02 | Is **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month** the right primary test anchor? | Choose the exact offer/validation anchor and evidence required to change it. | `OWNER-COMM-001` | AQ-02 |
| OQ-03 | Should launch test a 14-day no-card trial? | Approve/modify trial form, eligibility, and conversion behavior. | `OWNER-COMM-001`, `OWNER-VALIDATION-001` | AQ-03 |
| OQ-04 | What initial seasonal account policy should be tested? | Choose cancel/pause/annual direction and exact account/data consequences. | `OWNER-COMM-001`, `OWNER-PRIV-001` | AQ-04 |
| OQ-05 | Is first share the activation event, and is ≤30 active minutes the right test? | Approve/modify event/completeness/time before interpreting real-user results. | `OWNER-SCOPE-001`, `OWNER-VALIDATION-001` | AQ-05 |
| OQ-06 | What exact first product/design/content baseline may be accepted? | Approve, modify, or defer the exact bounded production candidate and exclusions. | `OWNER-SCOPE-001` | AQ-06 |
| OQ-07 | Which 2–3 acquisition channels should be tested first? | Prioritize the proposed product-led mix before external activity. | `OWNER-VALIDATION-001` when activity is authorized | AQ-07 |
| OQ-08 | Which SaaS North Star and thresholds should govern tests? | Approve/modify definitions before interpreting results. | `OWNER-VALIDATION-001` | AQ-08 |
| OQ-09 | Are validation stages/samples/stops appropriate? | Approve the exact protocol before recruitment, real data, messages, or offers. | `OWNER-VALIDATION-001` | AQ-09 |
| OQ-10 | Is the implemented dual visual direction acceptable for the bounded product? | Approve, modify, or defer the exact candidate; do not infer approval from implementation. | `OWNER-SCOPE-001` | AQ-10 |
| OQ-11 | Who operates the service and which support/privacy/incident channels are public? | Supply the exact entity, people, contacts, escalation route, and responsibilities. | `OWNER-OPS-001` | — |
| OQ-13 | What exact consent policy text/version/required choices, notices, golfer authority, retention/deletion, backup-expiry, and data-request procedure apply? | Obtain suitable Canadian review and approve the exact versioned consent and privacy policy/procedure; implemented choices remain **[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]**. | `OWNER-PRIV-001` | AQ-22 |
| OQ-14 | Is media excluded from V1? | Approve the text-first exclusion or separately authorize a complete media policy/control/evidence program. | `OWNER-MEDIA-001` | AQ-15, AQ-22 |
| OQ-15 | Which direct-Cloudflare account, credentials, budget, domain, public OIDC provider/policy, access scope, provider terms/privacy baseline, and alert ownership are authorized for a successor candidate? | Supply or approve those exact external dependencies. Require a new exact deployment to prove privacy-safe log enforcement/retained-data disposition, cron/heartbeats/alerts, backup/restore/rollback, authenticated journeys, accessibility, and controlled billing before any public or real-user operation. `TECH-006` selects a migration candidate only and authorizes none of these external effects. | `OWNER-PROD-001` | — |
| OQ-16 | Which adults, data, consent/policy versions, support, stop triggers, and transaction bounds may be used for controlled validation? | Authorize one exact evaluation only after prerequisites pass. | `OWNER-VALIDATION-001` | AQ-09, AQ-17, AQ-21 |
| OQ-17 | Is one exact deployed release accepted, for what operating scope and residual risks? | Review the complete exact-release packet and record accept/conditional accept/modify/reject with date and conditions. | `OWNER-ACCEPT-001` | — |
| OQ-18 | Which named identities may operate the privacy data-request queue, and who securely provisions and rotates its digest allowlist and pepper? | Name the operators and configuration owner, approve the operating procedure, and provision secrets outside this repository; until then deep health remains degraded. | `OWNER-OPS-001`, `OWNER-PROD-001` | — |

`OQ-12` is closed as an authorization question by Aaron's 2026-08-08 `OWNER-SEC-001` decision. One provider rotation succeeded and contractually invalidated the prior current value without displaying, persisting, or using the replacement. The original value was not replayed, and a normal signed-in owner application retest remains pending because no browser was available. The repeated continuation instruction did not trigger a second operation: no bypass credential was generated, read, rotated, displayed, persisted, or used for v16. Those are technical release-evidence gaps, not another owner decision.

The final-host direction is no longer an open architecture-selection question: `TECH-006` selects direct Cloudflare Workers/D1/R2 as the least-change candidate and supersedes Sites for final paid live-V1 hosting. What remains open is evidence and external authority: authorized Cloudflare account/credentials/budget/domain, a selected and approved public OIDC provider and policy, provider terms/privacy/data-residency review, and a new exact hosted release that passes log, cron, backup, restore, rollback, security, accessibility, alert, and controlled-billing verification. Sites remains private staging/evidence only.

## Customer and market evidence

- How often do solo instructors experience an assessment-to-package clarity problem?
- Which Canadian instructor contexts have the strongest urgency: outdoor seasonal, indoor year-round, mixed, club professional, range, simulator, or independent studio?
- How many have real control of package decisions despite working at a facility?
- What current tools or handmade artifacts already solve the job well?
- Does the problem persist outside premium-positioned instruction and across relevant package values?
- Which awareness channel produces qualified instructors who can activate?
- Do associations and tool partnerships permit an economical product-led path?
- Does any current competitor already provide the full job at a better value?

These require recent-behavior research and current primary-source competitor evidence.

## Self-serve product evidence

- Can an unexposed instructor understand customer, outcome, mechanism, required work, compatibility, and price?
- Does the realistic sample set an achievable expectation rather than custom-service polish?
- Can an instructor complete identity/package setup without help?
- Can standard prompts create a personal, coach-owned roadmap?
- Which fields can be removed or deferred?
- Can the instructor recover from an invalid link, incomplete package, or missing content?
- Does the preview accurately support a safe share?
- What percentage reaches a real share without onboarding?
- Which support reasons repeat, and which can the product prevent?
- What recurring action beyond first share earns continuation?

The owner-only production candidate can provide local technical and synthetic evidence for these questions, but only authorized unassisted product use can supply real-user evidence. Log every intervention and do not count owner/agent operation as self-serve proof.

## Golfer outcome evidence

- Does the roadmap improve goal, starting-point, phase, package, and next-action comprehension?
- Which personal details matter beyond identity styling?
- Does standardization weaken coach credibility or feel generic?
- Does the roadmap improve package confidence or conversion without pressure?
- How should no-recommendation, wait, decline, and setback states work?
- Which progress, completion, renewal, and milestone content earns recurring value?
- Do golfer sharing and referrals remain distinct and privacy-respecting in behavior?

## Pricing and economics evidence

- Will activated instructors actually pay **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month**?
- What specific use/outcome drives continuation or cancellation?
- Does unlimited ordinary solo use create material variable cost?
- What direct costs, support, refunds, and payment costs affect gross margin?
- Can acquisition pay back within the candidate window?
- What is the natural trial-to-paid rate among qualified instructors with a real assessment opportunity?
- How many full-price months does a seasonal instructor buy?
- Does the candidate pause fee improve continuity and reactivation or create resentment?
- Will cancelled/paused instructors return next season?
- Is an annual option useful only after retention proof?

No hypothetical answer may be presented as willingness-to-pay or unit-economics evidence.

## Policy and professional questions

- What personal/performance content is necessary and appropriate to collect?
- What roles and permissions do instructor and golfer have?
- What consent is required for coaching, research, media, product testing, measurement, and sharing?
- What exact versioned wording and required/optional choice set governs `golfer_record`, `roadmap_sharing`, and every other implemented consent scope?
- How do access, correction, revocation, retention, deletion, and incident response work?
- Who may review the non-destructive privacy-request queue, and how are operator authorization, rotation, revocation, and audit review governed?
- What happens to golfer links/data during trial, paid service, pause, cancellation, and reactivation?
- What billing, tax, refund, failed-payment, proration, reminder, and renewal rules apply?
- What accessibility laws/obligations and audit methods apply in the actual Canadian product context?
- What junior/guardian/safeguarding work is required before any future junior use?

These require qualified advice and Aaron decisions. This workspace is not legal advice.

## Design questions

- Can Calm Product Utility and Quiet Editorial Performance Portfolio feel coherent?
- Does the instructor experience remain clear at narrow widths and across access needs?
- Can a text-only roadmap feel credible?
- Which visual properties communicate professional quality without premium-service signaling?
- Does coach branding remain distinctive within standard controls and protected contrast?
- Is a 12-step activation specification best grouped into fewer visible screens without losing testability?
- What minimal return state supports recurring value without a dashboard?

## Later expansion questions

- What repeated evidence justifies living-journey capability in first paid scope?
- When does renewal/referral value outweigh added coach effort?
- What team demand is real versus one facility's custom request?
- Can a later team tier remain self-serve and preserve solo usability/economics?

## Closure rule

An open question closes only with an explicit owner decision, identified evidence, or qualified professional conclusion. Record owner decisions in [DECISION_LOG.md](DECISION_LOG.md), update the applicable current release packet/evidence record, and preserve the result, limitations, affected documents, and revisit trigger. Silence, implementation, deployment, and repeated simulation do not close questions by themselves. Exact Sites version 16 remains private owner-only staging/evidence; it is no longer the final paid live-V1 host candidate under `TECH-006`. Version 15 remains its immediate Sites predecessor, and versions 14 and earlier remain historical. Direct Cloudflare Workers/D1/R2 is only the un-deployed least-change migration candidate. Its selection does not close the authorized-account, credential, budget, domain, public OIDC, provider-policy/privacy, data-residency, log, cron, backup, rollback, authenticated security/accessibility, controlled-billing, real-world-validation, or acceptance questions. `LOG-PRIV-001` remains High/open, and `SEC-001`, `SEC-002`, and `AUTH-EVID-001` remain open within their recorded scopes.
