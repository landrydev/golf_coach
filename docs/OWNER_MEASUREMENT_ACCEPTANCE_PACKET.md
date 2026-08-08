# Owner measurement and validation acceptance packet

**Status:** `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` and
`[REAL-WORLD VALIDATION REQUIRED]`; no metric, target, participant protocol, or
analytics reuse is approved by this document
**Authority:** [Business Plan V2](../../00_source/BUSINESS_PLAN_V2.md) governs; its
numeric targets and commercial expectations remain hypotheses
**Related:** [Owner release decisions](OWNER_RELEASE_DECISIONS_REQUIRED.md) and
[findings ledger](FINDINGS_RETEST_LEDGER.md)

`[SUPPORTED BY BUSINESS PLAN V2]` Roadmap is a self-serve B2B SaaS for individual
instructors. Measurement must separate real self-service from founder assistance,
and it must not confuse a golfer's external coach-package action with a sale processed
or proven by Roadmap.

## Current candidate boundary

The current recorded candidate is owner-private Sites version 10 at source/runtime
release `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1`, saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_1007b9b4ea8c8191968d55991abf374c`,
deployment `appgdep_6a779cabaec4819191b0cf1e815ce2e5`, and environment
revision `12`; final deployment status is `succeeded` with provider `updated_at`
`2026-08-08T21:17:13.525116Z`.
Its 61-entry local release archive is 2,965,930 bytes with gzip SHA-256
`5d67423e253009714bebe85bba118ded922c9f6b30b926f2af7bd0e3d05cd953`;
the Sites content hash is
`sha256:0534d35af6fcdd8a0f104c5bb21fab5edd0641ec952bd32ae7a3f9c024c62033`
across 49 files and 6,737,920 bytes. Sites version 9 is the immediate historical
predecessor but is not a tested or approved version-10 rollback target. Version 7 remains privacy-behaviorally forbidden
as an ordinary target after version-8-or-later consent-governed use.

Exact-version-10 build, lint, strict types, and 234/234 tests passed in three complete
runs. Its local
capacity exercise completed 54 synthetic requests with zero failures, and its local
recovery exercise matched 2 synthetic tenants and 3 objects after all 10 migrations.
These do not supply an approved SLO, hosted capacity, production recovery, or
real-user measurement result. Historical version-9 smoke recorded plain HTTP `/`
redirecting to HTTPS. After version 10 deployed, signed-out HTTPS requests to `/`,
`/app`, `/api/health`, and `/api/operations/health` each returned the outer
owner-policy `401` with `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`.

A sanitized version-8-era continuity query started at
`2026-08-08T17:27:16.287Z`, completed at `2026-08-08T17:27:17.305Z`, requested
the preceding 90 minutes from `2026-08-08T15:57:16.287Z` with limit 100, and
returned 24 `fetch`/outcome-`ok` events (23 `200`, one handled `403`) dated from
`2026-08-08T16:37:26.325Z` through `2026-08-08T17:16:40.472Z`. It recorded only
static route/count metadata and no headers, cookies, identities, IPs, request/ray
IDs, query strings, full URLs, messages, payloads, stacks, or credentials. It does
not prove complete logs, authenticated success, reliability, health, alerting, or
scheduler operation.

A post-version-9 15-minute error-filtered read started at
`2026-08-08T17:41:24.033Z` and returned one handled non-owner `/app.rsc` `403` at
level `info`/outcome `ok`: zero error-level, exception, or crash events, but one
total filtered record. A separate 15-minute broad query started at
`2026-08-08T17:43:15.519Z` and returned three `fetch`/`ok` events and no scheduled
event. The packaged handler exists, but a missing production cron trigger is only a
working suspicion; provider support and trigger configuration are not confirmed.
Do not use these samples as an analytics feed or depend on hosted scheduling for
measurement.

An exact-version-10 bounded provider-log sample returned zero events. It is
inconclusive and does not supersede the historical version-8/version-9 observations
or establish logs, scheduling, authenticated success, reliability, or alerting.

No authenticated browser journey, manual accessibility review, authorized real
instructor/golfer protocol, or real-world measurement exists. Deep readiness remains
intentionally degraded because approved consent-policy and data-request-operator
configuration is absent. None of these observations measures activation, usability,
reliability over time, support burden, accessibility, or participant outcomes. This
packet records no owner acceptance and authorizes no participant, analytics,
public-access, or commercial activity.

## Recommended measurement dictionary

Definitions below are proposed for owner review; no numeric success threshold is
approved. Denominators, eligibility, time windows, and cohort exclusions must be
frozen before observing results.

| Measure | Exact proposed definition | Truthful boundary |
|---|---|---|
| Activation | Eligible instructor creates an account/profile, activates a current package/external action, completes and previews one adult golfer roadmap, publishes it, and creates a private share capability | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`; capability creation is not message delivery or golfer use |
| Human-free activation | Activated instructors with no scheduled onboarding or founder completion divided by activated instructors | Reactive support and every intervention minute/reason are reported separately; assisted activation is not self-serve evidence |
| Time to activation | Elapsed active task time from first authenticated product use to activation, with idle time and assistance rules frozen | No target is approved; speed must not override roadmap quality, consent, accessibility, or coach judgment |
| Share reliability | Valid capabilities successfully exchanged and rendered, segmented from invalid/expired/revoked/rate-limited/error outcomes | Operational health, not proof of golfer comprehension or delivery through the instructor's channel |
| Instructor return/update | Activated instructors who return and make an intentional lesson/practice/evidence/phase update in the defined window | Update count alone does not prove value or coaching outcome |
| Support dependence | Operator minutes and contacts per account, by activation/identity/billing/data/privacy/product reason and assisted-research status | Founder research is reported separately but never hidden to improve self-serve claims |
| Golfer agency/trust | Approved participant task/retell plus pressure, clarity, confidence, correction, sharing-context and decline-choice responses | Requires consented real-world research; no sentiment is inferred from clicks |
| SaaS commercial state | Activated paid instructors, full-price paid months, cohort MRR, cancellation/pause/reactivation and support/cost by cohort | `[PRICING HYPOTHESIS — REQUIRES VALIDATION]`; measure only after exact offer/policy and authorized billing exist |
| External coach action interest | Explicit user handoff initiation, if approved and disclosed | Not a booking, purchase, revenue, conversion, or instructor fulfillment event; never scrape the destination |
| Reliability guardrails | Error/recovery rate, broken shares, security/privacy/access/deletion incidents, billing faults, accessibility blockers, support escalation | A positive growth metric never overrides a guardrail or unresolved serious harm |

Business Plan V2's activation, seasonal revenue, support, conversion, payback,
retention, and reactivation targets remain `[UNVALIDATED BUSINESS ASSUMPTION]` or
simulated choices. Do not import those numbers into dashboards, release criteria, or
public claims until Aaron approves exact definitions and real evidence supports them.

## Data-minimizing collection rules

- First-party audit events are accountability records, and provider logs are
  diagnostics; neither becomes product analytics merely because it exists.
- Approve each measurement purpose, field, retention period, access role, and
  deletion/export behavior before real-user collection.
- Never collect raw capability tokens/fragments, cookies, SIWC headers, narrative
  roadmap content, full external URLs, payment details, webhook bodies, or secret values.
- Prefer event-family/status/timestamp/release and pseudonymous tenant identifiers;
  suppress small cohorts where reporting could identify a person.
- Keep participant identity/consent and raw qualitative material outside the source
  repository in an approved restricted system.
- Record founder assistance, recruitment source, season, assessment opportunity,
  instructor experience, package context, device/accessibility needs, outages, and
  other confounders rather than attributing every result to Roadmap.
- Do not contact participants, change public access, use real golfer data, send
  messages, or create a live charge without `OWNER-VALIDATION-001` and applicable
  policy/consent/operator authority.

## Protocol fields Aaron must approve

| Field | Required decision |
|---|---|
| Purpose and decisions | Which product/commercial question each measure can change; prohibited secondary use |
| Participants and access | Adults-only inclusion/exclusion, recruitment, compensation, owner-only/allowlist/public boundary |
| Stages/cohorts | Assisted research, assisted beta, true self-serve, paid operation; acquisition source and seasonal cohort |
| Eligibility and windows | Signup/activation denominator, opportunity criteria, observation dates, idle/duplicate/test-account rules |
| Assistance | What counts as onboarding, reactive support, founder completion, and research facilitation |
| Policy/consent | Exact privacy/terms/research/recording versions, instructor authority for golfer records, withdrawal and contact routes |
| Collection/retention | Event dictionary/version, data map, access, storage, suppression, retention/deletion and export handling |
| Analysis | Predefined calculations, missing data, confounders, qualitative method, limitations; no post-result threshold invention |
| Guardrails/stop triggers | Security/privacy/billing/accessibility/trust/support/data-loss conditions that stop collection or operation |
| Owners | Validation lead, privacy lead, support/incident route, analyst/reviewer and Aaron's decision authority |

## Viable decisions

1. Approve a controlled adults-only, no-live-charge protocol after policy, consent,
   operators, collection fields, and stop triggers are exact.
2. Approve a later bounded paid protocol only after billing prerequisites and a
   maximum authorized transaction/refund scope are exact.
3. Keep operation synthetic/owner-only and defer real-world claims.

**Recommendation:** begin with choice 1 and the minimum events needed to measure
self-serve activation, support dependence, share reliability, and trust guardrails.
Do not introduce third-party analytics by default. Defer revenue attribution,
seasonality, retention, and coach-package outcome claims until the necessary time
window and data quality exist.

## Exact proposed decision wording

> `OWNER-MEASURE-001`: I approve measurement protocol **[artifact/version]** for
> **[exact adults-only cohort and access scope]** from **[dates]**. Approved measures,
> definitions, events, fields, retention, access and suppression are **[exact list]**.
> Assistance and confounders follow **[rules]**. No numeric target is approved except
> **[exact labelled hypotheses, if any]**. **[name]** owns validation and **[name]**
> owns privacy/support escalation. Stop on **[exact guardrails]**. External coach
> handoffs are not sales evidence, and results remain unvalidated until observed,
> reviewed, and reported with limitations.

This packet does not itself authorize participants or external effects. Pair the
approved dictionary with the exact `OWNER-VALIDATION-001` wording in
[owner release decisions](OWNER_RELEASE_DECISIONS_REQUIRED.md). Final release
acceptance remains separate under `OWNER-ACCEPT-001`.
