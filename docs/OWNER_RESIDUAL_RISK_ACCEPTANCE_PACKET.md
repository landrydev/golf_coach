# Owner residual-risk acceptance packet

**Status:** `[OWNER INPUT REQUIRED]`; candidate risks, not accepted risks
**Purpose:** Record informed, bounded, time-limited acceptance for one exact release
**Related:** [Findings ledger](FINDINGS_RETEST_LEDGER.md),
[security/privacy](SECURITY_PRIVACY.md), and
[provider/exit record](PROVIDER_RESPONSIBILITY_COST_AND_EXIT.md), plus the
[exact-v11 local exercises](release-evidence/ROADMAP-SITES-V11-2026-08-08-LOCAL-EXERCISES.md)

A residual risk is what remains after implemented controls and applicable evidence
pass. Missing evidence, an unresolved critical incident, unknown customer harm, or a
policy decision that has never been made is not made safe by calling it residual.

## Current candidate scope

These candidate risks are reconciled to owner-private Sites version 11 at
source/runtime release `44670a64498779cf747914b4465380916a939301`, local release
archive SHA-256
`d88be6513bc58afd057d4a3fb3a6d64b744f7a5c359731ec9fc693a788e1fa0e`
(2,966,073 bytes; 61 entries/49 files; 10 migrations),
Sites content hash
`sha256:d717035871790252548e7fff4e1192e590b73b7cabfe3f4c011d65ffe4493daa`
(49 files; 6,737,920 bytes), saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_4c49cdec72bc8191aeece01f5689e51a`,
deployment `appgdep_6a77b01714b881918245bb5248349e0d`, and environment
revision `13`; final status is `succeeded` with provider `updated_at`
`2026-08-08T22:40:07.742084+00:00`. Sites version 10 and earlier remain historical predecessor evidence;
version-11-to-10 rollback would reintroduce the prior script policy and is a
security/behavior regression, not class `N`. In addition,
the privacy-behavior boundary relative to version 7 is not an ordinary rollback
target after consent-governed use. This identity record does not accept a risk or
authorize public, real-user, or paid use.

`RESP-001` and `HARNESS-001` are fixed and their source/test regressions passed
in the exact-version-11 automated suite. The actual Chrome captures remain
exact-version-9 renderer/layout-equivalent evidence for the unchanged UI/CSS only,
not evidence of version-11 CSP, headers, authentication, hosted behavior, or a
manual retest. These are closed defects,
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
Version 11 retained that project-level containment: four no-credential HTTPS probes
returned the outer owner-policy `401` with `no-store`/`no-referrer`; no supported
signed-in owner browser retest occurred.

Version 11 also replaces script `'unsafe-inline'` with per-response CSP nonces.
Automated coverage passed, but supported signed-in hosted-browser CSP, hydration,
navigation, and interaction evidence is absent. `SEC-002` is **REMEDIATED — HOSTED
RETEST PENDING**, not closed or eligible for residual-risk acceptance yet.

Exact version-11 source commit `44670a64498779cf747914b4465380916a939301`
passed two distinct detached clean checkouts and locked installs, two complete
237/237 verification runs, identical 49-file inventories, and strict allowlisted
generated-value normalization with zero remaining differences; each install contained
501 packages and kept the same five install scripts blocked. `SUPPLY-EVID-001`
therefore closes for the current candidate's normalized reproducibility control. The
exact version-11 release record binds that result to the candidate. The separate
[precursor record](release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md)
and version-9 byte-identity failure remain historical; none of these results
establishes owner acceptance or rollback eligibility.

The [exact-v11 local exercise record](release-evidence/ROADMAP-SITES-V11-2026-08-08-LOCAL-EXERCISES.md)
adds exact-commit synthetic recovery and bounded-capacity evidence. Recovery passed
across all ten migrations and 31/31 application tables, two synthetic tenants, and
three R2-compatible objects totalling 199 bytes; it matched the 34,380-byte D1
snapshot SHA-256
`34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54`,
detected three negative integrity scenarios, and isolated secret-shaped variables
from the Wrangler subprocess. Its 103,656 ms local wall-clock duration is not an
RTO and the synthetic snapshot age is not an RPO. Capacity completed 54 requests
at maximum concurrency four with 44 `200`, ten `201`, zero failures, and local
p50/p95/maximum observations of 48.46/107.60/107.83 ms. Those timings are not
performance targets, an SLO/SLA, sustained-load evidence, or hosted capacity.
Neither exercise makes hosted restore, rollback/forward-fix, scheduler operation,
alerting, named-operator readiness, public operation, real-user behavior, or
acceptance eligible for inference.

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
| `RR-PROVIDER-001`: Sites/Worker, SIWC, D1/R2, and deployment/control-plane concentration increases provider-exit impact | Medium | Versioned source/migrations, logical recovery path, immutable internal instructor IDs, private object metadata, and exact v11/v10/v9/v8 artifacts are recorded. Exact v11 passed two independent clean builds with zero differences after strict allowlisted generated-value normalization. Its exact-commit local synthetic recovery passed all 10 migrations and 31/31 tables, two tenants, three R2-compatible objects/199 bytes, snapshot and object integrity including three negative scenarios, and subprocess secret isolation; bounded local capacity passed 54 requests at concurrency four with zero failures. V9's earlier byte-identity failure remains historical. No hosted backup/restore, rollback/forward-fix, portability, RPO/RTO, approved performance-target, or named-operator exercise exists. | Name owner and portability cadence. Revisit on terms/region/support/cost/recovery failure, unsupported runtime, a future deterministic-build control failure, or failed export/restore/portability exercise. |
| `RR-EXTERNAL-001`: Roadmap cannot verify the instructor's external booking/purchase/contact destination or outcome | Medium | HTTPS validation, preview, explicit leave-site warning, separate SaaS billing, no sale/booking attribution, visible ask/wait/decline choices | Confirm truthful copy and support owner. Stop on unsafe/misleading destination reports, pressure pattern, or user belief that Roadmap processed the coach transaction. |

## Items not currently eligible for residual-risk acceptance

- `SEC-001` post-rotation retest: normal signed-in owner operation without a bypass
  header and a meaningful privacy-safe hosted log/redaction sample remain missing;
- `SEC-002` hosted retest: exact version 11 removes script `'unsafe-inline'` through
  per-response nonces, but the supported Browser list was empty, so no signed-in
  hosted browser verified CSP enforcement, hydration, navigation, and representative
  interactions;
- missing hosted identity/spoof/recovery evidence before public authentication;
- missing qualified privacy/legal, retention/deletion, and public-copy decisions
  before real customer/golfer data;
- absent approved consent-policy text/version/required choices and data-request
  operator allowlist/pepper configuration; deep readiness therefore remains degraded;
- missing manual accessibility review where an undiscovered blocker may exist;
  version-9 local 320/390/1440 captures are renderer/layout-equivalent for the
  unchanged UI/CSS only, while exact-v11 automated regression passed; neither body of evidence
  establish keyboard, screen-reader, real-zoom, device, or human acceptance;
- `OPS-CRON-001`: suspected hosted scheduler deployment gap before paid operation.
  Predecessor-v8 through v10 observations supplied no scheduled event. The first
  post-deployment exact-v11 30-minute aggregate at
  `2026-08-08T22:58:53.646Z` returned three `fetch`/`info`/`ok` events, zero
  observed `scheduled` events after three expected boundaries, and one
  `errors_only` `fetch`/`info`/`ok` event with zero error fields. A newer
  30-minute broad query and its `errors_only` companion around
  `2026-08-08T23:20:16.850Z` were empty. The later 60-minute broad aggregate at
  approximately `2026-08-08T23:23:52Z` returned three `fetch`/`info`/`ok` events
  with HTTP `200`, `200`, and handled `403`, and `scheduled=0`; `errors_only`
  returned only the handled `403`. No raw content was emitted or retained.
  Repeated bounded observations strengthen suspicion, but log completeness,
  scheduled-event visibility, and deployed-trigger metadata are unavailable, so
  neither scheduler absence nor error-free operation is proved and the finding
  remains open;
- historical deterministic byte identity for v9. Its isolated immutable-commit export passed
  `npm ci --no-audit` (501 packages), built, and passed 229/229 tests, but the rebuilt
  `dist` did not byte-match the submitted archive: the Windows CRLF checkout changed
  migration/metadata bytes and content-hashed bundles. Line endings are consistent
  with the variance but are not proven to be its only cause. The repository LF rule
  was added after the v9 runtime commit. Exact v11 now closes `SUPPLY-EVID-001` for
  the current normalized reproducibility control, but cannot retroactively prove v9
  byte identity;
- exact-v11 local synthetic recovery/capacity now passes within its recorded scope,
  but hosted backup/restore, rollback/forward-fix, measured RPO/RTO, approved
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
