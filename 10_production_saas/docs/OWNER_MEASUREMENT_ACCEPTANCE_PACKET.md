# Owner measurement and validation acceptance packet

**Status:** `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` and
`[REAL-WORLD VALIDATION REQUIRED]`; no metric, target, participant protocol, or
analytics reuse is approved by this document
**Authority:** [Business Plan V2](../../00_source/BUSINESS_PLAN_V2.md) governs; its
numeric targets and commercial expectations remain hypotheses
**Related:** [Owner release decisions](OWNER_RELEASE_DECISIONS_REQUIRED.md),
[findings ledger](FINDINGS_RETEST_LEDGER.md), current [Release Evidence](RELEASE_EVIDENCE.md),
[exact-v13 local exercises](release-evidence/ROADMAP-SITES-V13-2026-08-09-LOCAL-EXERCISES.md),
and [historical exact-v14 release evidence](release-evidence/ROADMAP-SITES-V14-2026-08-09.md)

`[SUPPORTED BY BUSINESS PLAN V2]` Roadmap is a self-serve B2B SaaS for individual
instructors. Measurement must separate real self-service from founder assistance,
and it must not confuse a golfer's external coach-package action with a sale processed
or proven by Roadmap.

## Current candidate boundary

The current recorded candidate is owner-private Sites version 16 at source/runtime
release `91f37ebd542774779f6db7e000832c2f6714e528`, saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_0a4d7dc3d8108191aa4a1b3e14051a96`,
deployment `appgdep_6a7826b2f4c481919cc85665dffa2391`, and environment
revision `18`; final deployment status is `succeeded` at
`2026-08-09T07:05:36.176024Z`. The environment remains
`INSTRUCTOR_ACCESS_MODE=owner_private` and `BILLING_CHECKOUT_ENABLED=false`, with
`APPLICATION_WRITE_MODE=enabled` added as an exact fail-closed application
containment setting. Sites access remains custom revision 1 with one owner, zero
groups, and zero external visitors; four existing secrets were retained without
exposing their values, and the exact `RELEASE_ID` is set.

Its 63-entry/51-file local release archive is 3,052,294 bytes, contains all 11
migrations and 25 source mappings, and has gzip SHA-256
`9119a848bb8b4c7fff1d810280cf845ec44366449adac3176fd35d8c24438fe6`;
the Sites content hash is
`sha256:752f05fd957f8f4b043b5955d9cdbdbf2176b0f1f3414827c9c3e8d0f44f6e2c`
across 51 files and 7,290,880 bytes. Version 15 is the immediate immutable historical
predecessor; versions 14 and 13 are older provenance. Version 15 does not achieve
the privacy objective or resolve `LOG-PRIV-001`. The historical
version-13-to-12 path remains class `B`: migration
`0010_steep_hemingway` is schema-backward-compatible, but rollback removes
fail-closed global write containment and newer authoring, share, profile,
recovery, receipt, and compare-and-swap behavior. The historical v12-to-v11 lost-
acknowledgement regression and privacy-behavior boundary relative to version 7
also remain recorded.

Three exact-version-16 verification runs, including both independent clean installs,
passed 346/346 with no failures, skips,
or todos. Their 51-file builds had three expected generated raw differences and
zero normalized differences; both clean installs contained 501 packages with the
same five blocked install scripts. A separate exact-version-16 release-integrity run
covered 304 files with zero findings and preserved Business Plan V1, and the
production dependency audit reported zero vulnerabilities.

The exact-version-16 local synthetic exercise applied all 11 migrations, inspected
31/31 tables, restored three R2-compatible objects, booted the exact built Worker,
authenticated profile, package, and workspace reads, observed the expected degraded
interrupted-scheduler state, and passed three negative checks. The companion bounded-
capacity run completed 54 requests with zero failures. These local results do not supply
approved performance targets, an SLO/SLA, hosted capacity or backup/restore,
rollback/forward-fix, RPO/RTO, scheduler, named-operator readiness, production
recovery, or a real-user measurement result. Historical exact-v12, v11, and v10
evidence remains predecessor evidence.

After version 16 deployed, signed-out HTTPS requests to `/`, `/app`, `/r`, and
`/api/health` each returned the outer owner-policy `401` with `no-store` and
`no-referrer`. This is not evidence for authenticated application behavior or
browser execution.

`LOG-PRIV-001` remains open and makes public or controlled-real-user acceptance
ineligible. Version 15's exact predecessor package configured observability, custom-log
collection, and automatic invocation-log persistence off, yet the provider returned
three post-success `fetch` events. The query surface returned redaction markers for
cookie and SIWC identity fields; network-IP and request-signature fields remained
nonempty and were not redaction markers. Collection/storage disposition behind
the markers is unknown. Connector/tool processing was transient; no raw field
value was surfaced in the transcript or written to the repository. Version 14 also returned three
invocation events with `invocation_logs=false`. The provider ignores the packaged
privacy configuration. No version-16 provider-log query was run because the
collection/storage disposition remains unknown and v15 already proved the packaged
controls ineffective. Rollback to version 15, 14, or 13 is not a privacy remedy.

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

Historical version-11 aggregates remain preserved in its frozen release record.
The historical post-v12 value-safe capture completed at
`2026-08-09T00:13:27.8566565Z`: `errors_only` returned zero events, while the
broad aggregate returned six `fetch`/`info`/`ok` events—two `200` root requests,
two `200` `/.rsc` requests, and two handled `403` `/app.rsc` requests—and
`scheduled=0`. No raw content was emitted or retained. This bounded observation
does not establish log completeness or redaction, hosted scheduling or absence,
authenticated success, reliability, or alerting because scheduled-event visibility
and deployed trigger metadata remain unavailable.

No authenticated browser journey, manual accessibility review, authorized real
instructor/golfer protocol, or real-world measurement exists. Deep readiness remains
intentionally degraded because approved consent-policy and data-request-operator
configuration is absent. None of these observations measures activation, usability,
reliability over time, support burden, accessibility, or participant outcomes. This
packet records no owner acceptance and authorizes no participant, analytics,
public-access, or commercial activity.

Version 16 carries forward version 15's nonce, golfer-response, bounded
ambiguous-mutation and authoring-draft recovery, stricter profile/package
compare-and-swap handling, share revoke/reissue lifecycle controls, exact
write-bound receipts, and global write containment. It adds generic private
top-level-document failures, JSON API/RSC/asset boundaries, validated UUIDv4 request
references, 24-hour keyed-recovery v2 lifecycle and legacy retirement, exact
migration-0010 readiness, and bounded 13-account scheduler-backlog health. These controls improve
reliability but do not themselves measure golfer agency, trust, hosted behavior,
or real-world success. No hosted signed-in browser, manual accessibility review,
authenticated write-mode exercise, backup/restore, scheduler/alert exercise, or
provider validation occurred. No bypass credential was generated, read, rotated,
displayed, persisted, or used.
`SEC-002` is **REMEDIATED — HOSTED RETEST PENDING**. Historical `OWNER-SEC-001`
authorization is complete, while `SEC-001` remains **REMEDIATED — RETEST PENDING**
and `AUTH-EVID-001` remains open.

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
