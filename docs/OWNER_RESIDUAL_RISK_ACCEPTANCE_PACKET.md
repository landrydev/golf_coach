# Owner residual-risk acceptance packet

**Status:** `[OWNER INPUT REQUIRED]`; candidate risks, not accepted risks
**Purpose:** Record informed, bounded, time-limited acceptance for one exact release
**Related:** [Findings ledger](FINDINGS_RETEST_LEDGER.md),
[security/privacy](SECURITY_PRIVACY.md), and
[provider/exit record](PROVIDER_RESPONSIBILITY_COST_AND_EXIT.md), plus the
 [historical exact-v15 release evidence](release-evidence/ROADMAP-SITES-V15-2026-08-09.md) and
[exact-v13 local exercises](release-evidence/ROADMAP-SITES-V13-2026-08-09-LOCAL-EXERCISES.md)

A residual risk is what remains after implemented controls and applicable evidence
pass. Missing evidence, an unresolved critical incident, unknown customer harm, or a
policy decision that has never been made is not made safe by calling it residual.

## Current candidate scope

These candidate risks are reconciled to owner-private Sites version 16 at
source/runtime release `91f37ebd542774779f6db7e000832c2f6714e528`, local release
archive SHA-256
`9119a848bb8b4c7fff1d810280cf845ec44366449adac3176fd35d8c24438fe6`
(3,052,294 bytes; 51 files; 11 migrations), Sites content hash
`sha256:752f05fd957f8f4b043b5955d9cdbdbf2176b0f1f3414827c9c3e8d0f44f6e2c`
(51 files; 7,290,880 bytes), saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_0a4d7dc3d8108191aa4a1b3e14051a96`,
deployment `appgdep_6a7826b2f4c481919cc85665dffa2391`, and environment
revision `18`; final status is `succeeded` at
`2026-08-09T07:05:36.176024Z`. The environment retains
`INSTRUCTOR_ACCESS_MODE=owner_private` and `BILLING_CHECKOUT_ENABLED=false`, with
`APPLICATION_WRITE_MODE=enabled`, the exact `RELEASE_ID`, and four retained secrets.

Sites version 15 and earlier remain historical predecessor evidence. V16 adds
security, recovery, readiness, and scheduler-health hardening without a new
migration. Do not assume v16-to-v15 is an approved ordinary rollback because it
removes those controls. Neither v15 nor an earlier release resolves
`LOG-PRIV-001`. Historical compatibility classes remain recorded elsewhere. This
identity record accepts no risk and authorizes no public, real-user, or paid use.
Public and controlled-real-user acceptance are ineligible while `LOG-PRIV-001`
remains High/open.

`RESP-001` and `HARNESS-001` are fixed and their source/test regressions passed
in the exact-version-13 automated suite. The actual Chrome captures remain
exact-version-9 historical renderer/layout evidence only, not evidence of
version-13 authoring/share/profile interactions, CSP, headers, authentication,
recovery, hosted behavior, or a manual retest. These are closed defects,
not candidate residual risks, and their closure does not replace hosted journey
or manual accessibility evidence.

Aaron authorized `OWNER-SEC-001` on 2026-08-08, and that historical authorization
is complete. A single value-safe Sites rotation
immediately invalidated the exposed prior bypass value under the provider contract;
the replacement was not displayed, persisted, or used, and owner-only access remained
unchanged. The original value was not replayed, the post-operation Worker sample was
empty and inconclusive, and no signed-in owner browser was mounted. Accordingly,
`SEC-001` is **REMEDIATED — RETEST PENDING**, not an eligible residual risk. See the
[rotation evidence](release-evidence/ROADMAP-SITES-V9-2026-08-08-sec001-rotation.md).
Version 16 retains that project-level containment: four no-credential HTTPS probes
returned the outer owner-policy `401` with `no-store` and `no-referrer`. No bypass
operation or use occurred, and no signed-in owner browser retest occurred.

Version 16 inherits version 11's replacement of script `'unsafe-inline'` with per-response CSP nonces.
Exact-v16 automated coverage passed, including generic HTML only for true top-level
document failures while API/RSC/route-handler/assets/programmatic clients retain
JSON and CSP/security/redirect ordering remains intact. Supported signed-in hosted-browser CSP, hydration,
navigation, and interaction evidence is absent. `SEC-002` is **REMEDIATED — HOSTED
RETEST PENDING**, not closed or eligible for residual-risk acceptance yet.

The version-11 lost-acknowledgement duplicate golfer-response/audit risk remains
closed in version 13, not carried as residual risk. Required safe keys, account-and-resolved-
share-session-scoped HMAC receipts, atomic one-response/one-audit cardinality,
`201` first/`200` replay/`409` changed-input behavior, same/mixed race coverage,
10-second timeout recovery, per-tab ambiguous-outcome persistence, and raw-key
non-persistence/non-logging passed locally. Hosted interruption/reload evidence is
still absent and cannot be accepted into existence.

Version 16 additionally accepts only UUIDv4 request references and hardens keyed-
attempt recovery with fixed 24-hour created/expires values, legacy-v1 retirement,
a future-clock fence, exact-owner compare/remove, and mount/submit expiry checks in
all five keyed flows without automatic replay. Deep readiness validates the exact
migration-`0010` abuse-rate-limit shape, primary key, index, and two share-close
scopes; scheduler health uses a capped 13-account sample, lower-bound backlog, and
fail-closed assessment. These source/test controls are not hosted evidence.

Exact version-16 source commit `91f37ebd542774779f6db7e000832c2f6714e528`
passed two detached clean builds and two complete 346/346 verification runs. Both
inventories contained 51 files; three allowlisted generated raw differences and
zero normalized differences remained. `SUPPLY-EVID-001` closes for this candidate's
normalized reproducibility scope only. Release integrity inspected 304 files with
zero findings, and the production dependency audit reported zero vulnerabilities.
These are bounded source/supply-chain checks, not provider or real-world validation.

The exact-v16 local recovery exercise restored all 31/31 tables and synthetic
D1/R2 inventory, booted the exact Worker, authenticated profile/package/workspace
reads, and correctly reported the normalized interrupted scheduler as failed. The
capacity exercise completed 54 requests with zero failures. These are local-only
results, not hosted restore, RPO/RTO, performance-target, scheduler, or alert
evidence.

The historical [exact-v13 local exercise record](release-evidence/ROADMAP-SITES-V13-2026-08-09-LOCAL-EXERCISES.md)
records predecessor synthetic recovery and bounded-capacity evidence. Recovery
passed across all 11 migrations and 31/31 application tables, two synthetic tenants,
and three R2-compatible objects totalling 199 bytes; it matched the 34,380-byte D1
snapshot SHA-256
`8eaef0372bf2e4457ab651ec5c7bb3e3b22a51289495187761622fede0a1b139`,
detected three negative integrity scenarios, and passed environment-isolation
checks. Its 104,421 ms local wall-clock duration is not an RTO and the synthetic
snapshot is not RPO evidence. Capacity completed 54 requests
at maximum concurrency four with 44 `200`, ten `201`, zero failures, and local
p50/p95/maximum observations of 46.60/103.30/103.62 ms. Those timings are not
performance targets, an SLO/SLA, sustained-load evidence, or hosted capacity.
Neither historical exercise is relabelled as exact-v16 evidence or makes hosted restore,
rollback/forward-fix, scheduler operation,
alerting, named-operator readiness, public operation, real-user behavior, or
acceptance eligible for inference. Historical v12 release and v11 local-exercise
evidence remains preserved in its frozen records.

## Required risk record

| Field | Required value |
|---|---|
| Risk ID and exact release/scope | Stable ID; commit, archive, environment, access/feature boundary |
| Evidence-based scenario | Threat/failure, affected actors/data/operation, current controls and control evidence |
| Rating | Likelihood and impact before/after controls; rationale, not just a colour |
| Alternatives | Remediate, reduce scope/disable feature, transfer, avoid, or accept |
| Decision | Chosen treatment and why the expected benefit justifies remaining harm |
| Accountability | Named owner, due/review date, monitoring signal, mitigation action |
| Stop/revisit trigger | Exact event/threshold that disables the operation or reopens the decision |
| Aaron acceptance | Decision ID, exact wording/date/conditions; no inferred approval |

## Candidate residual risks requiring disposition

Ratings below are recommendations for review, not Aaron's decisions.

| Risk | Proposed residual rating | Implemented containment/evidence | Required disposition and trigger |
|---|---|---|---|
| `RR-CAP-001`: an intended golfer can forward a bearer capability | Medium | 256-bit verifier, HMAC fingerprint at rest, fragment/body exchange, short scoped session, neutral failures, expiry, rotation/revocation, no third-party analytics | Accept only after hosted exchange/revoke/session tests and approved sharing copy. Stop on token logging, cross-golfer access, unexplained forwarding harm, or inadequate revocation. |
| `RR-PROVIDER-001`: Sites/Worker, SIWC, D1/R2, and deployment/control-plane concentration increases provider-exit impact | Medium | Versioned source/migrations, logical recovery path, immutable internal instructor IDs, private object metadata, and exact v16 plus historical artifacts are recorded. Exact v16 passed two independent 346/346 clean builds with zero normalized differences and a local restored-state Worker boot; its 54-request capacity run had zero failures. No hosted backup/restore, rollback/forward-fix, portability, RPO/RTO, approved performance target, or named-operator exercise exists. | Name owner and portability cadence. Revisit on terms/region/support/cost/recovery failure, unsupported runtime, a future deterministic-build control failure, or failed export/restore/portability exercise. `LOG-PRIV-001` is an open blocker, not accepted within this residual rating. |
| `RR-EXTERNAL-001`: Roadmap cannot verify the instructor's external booking/purchase/contact destination or outcome | Medium | HTTPS validation, preview, explicit leave-site warning, separate SaaS billing, no sale/booking attribution, visible ask/wait/decline choices | Confirm truthful copy and support owner. Stop on unsafe/misleading destination reports, pressure pattern, or user belief that Roadmap processed the coach transaction. |

## Items not currently eligible for residual-risk acceptance

- `LOG-PRIV-001`: Sites returned three post-success fetch events after version 15
  configured all packaged observability/log-persistence settings off. The query
  surface returned redaction markers for cookie/SIWC identity fields, while
  network-IP and request-signature fields remained nonempty/not redaction markers;
  collection/storage disposition behind the markers is unknown. Connector/tool
  processing was transient; no raw field value was surfaced in the transcript or
  written to the repository. Version 14 failed similarly. This confirmed provider-
  enforcement failure cannot be accepted as residual risk for public or controlled
  real-user operation. V16 retains the same packaged controls; no v16 provider-log
  query was run because extra processing could not close the enforcement or retained-
  data-disposition gap. Rollback does not resolve it;
- `SEC-001` post-rotation retest: normal signed-in owner operation without a bypass
  header remains missing. Hosted log sampling now exists but failed separately as
  `LOG-PRIV-001` and does not close the authentication retest;
- `SEC-002` hosted retest: exact version 16 inherits per-response nonces without
  script `'unsafe-inline'`, but no signed-in hosted browser verified CSP
  enforcement, hydration, navigation, and representative interactions;
- missing hosted identity/spoof/recovery evidence before public authentication;
- missing qualified privacy/legal, retention/deletion, and public-copy decisions
  before real customer/golfer data;
- absent approved consent-policy text/version/required choices and data-request
  operator allowlist/pepper configuration; deep readiness therefore remains degraded;
- missing manual accessibility review where an undiscovered blocker may exist;
  version-9 local 320/390/1440 captures are renderer/layout-equivalent for the
  historical UI/CSS only, while exact-v16 automated regression passed; neither
  body of evidence establishes keyboard, screen-reader, real-zoom, device, or
  human acceptance;
- `OPS-CRON-001`: suspected hosted scheduler deployment gap before paid operation.
  Predecessor observations remain historical. The post-v12 value-safe capture at
  `2026-08-09T00:13:27.8566565Z` returned zero `errors_only` events and six broad
  `fetch`/`info`/`ok` events—two `200` root, two `200` `/.rsc`, and two handled
  `403` `/app.rsc`—with `scheduled=0`. No raw content was emitted or retained.
  The bounded observation strengthens suspicion, but log completeness,
  scheduled-event visibility, and deployed-trigger metadata are unavailable, so
  neither scheduler absence nor error-free operation is proved and the finding
  remains open;
- historical deterministic byte identity for v9. Its isolated immutable-commit export passed
  `npm ci --no-audit` (501 packages), built, and passed 229/229 tests, but the rebuilt
  `dist` did not byte-match the submitted archive: the Windows CRLF checkout changed
  migration/metadata bytes and content-hashed bundles. Line endings are consistent
  with the variance but are not proven to be its only cause. The repository LF rule
  was added after the v9 runtime commit. Exact v16 closes `SUPPLY-EVID-001` for
  the current normalized reproducibility control, but cannot retroactively prove v9
  byte identity;
- exact-v13 local synthetic recovery/capacity passes within its recorded scope,
  and historical exact-v11 evidence remains preserved, but hosted backup/restore,
  rollback/forward-fix, measured RPO/RTO, approved
  performance targets, authenticated health, scheduler, alert, incident, and
  staffed-operator evidence remains missing for the affected operating scope;
- missing billing policy/configuration/webhook/controlled-transaction evidence before
  paid operation; and
- missing authorized real-account journeys and Aaron's exact-release acceptance.

These items may be resolved, avoided by keeping the affected operation disabled, or
reassessed after evidence exists. Owner silence is not acceptance.

## Viable decisions

For each eligible `RR-*` item, Aaron may accept for an exact bounded scope and period,
require further mitigation/evidence, disable the affected feature/access scope, or
reject the release. **Recommendation:** keep acceptance narrow, name one operator,
set the earliest practical review date, and choose triggers that can actually be
observed and acted on.

## Exact proposed decision wording

> `OWNER-RISK-001`: For Roadmap release **[candidate/commit/archive]** operating as
> **[scope]**, I reviewed residual risks **[RR IDs and record version]** on **[date]**.
> I accept only **[IDs]** at ratings **[ratings]** because **[evidence-based rationale]**.
> **[name]** owns each mitigation and monitoring action **[actions]**. Review on
> **[date]**. Stop or reopen the release on **[exact triggers]**. Risks **[IDs]** are
> not accepted and require **[remediation, evidence, or disabled scope]**. This does
> not waive a critical finding, qualified review, public/billing/retention decision,
> real-account authorization, or `OWNER-ACCEPT-001`.

Record the signed wording in the repository decision log without rewriting earlier
history. Link the exact risk version and release evidence. If scope, provider,
configuration, policy, migration, or finding changes materially, the acceptance no
longer covers the new state until explicitly renewed.
