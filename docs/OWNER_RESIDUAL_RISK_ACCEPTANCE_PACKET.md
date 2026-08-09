# Owner residual-risk acceptance packet

**Status:** `[OWNER INPUT REQUIRED]`; candidate risks, not accepted risks
**Purpose:** Record informed, bounded, time-limited acceptance for one exact release
**Related:** [Findings ledger](FINDINGS_RETEST_LEDGER.md),
[security/privacy](SECURITY_PRIVACY.md), and
[provider/exit record](PROVIDER_RESPONSIBILITY_COST_AND_EXIT.md), plus the
[historical exact-v11 local exercises](release-evidence/ROADMAP-SITES-V11-2026-08-08-LOCAL-EXERCISES.md)

A residual risk is what remains after implemented controls and applicable evidence
pass. Missing evidence, an unresolved critical incident, unknown customer harm, or a
policy decision that has never been made is not made safe by calling it residual.

## Current candidate scope

These candidate risks are reconciled to owner-private Sites version 12 at
source/runtime release `7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c`, local release
archive SHA-256
`994f725ba6c5952c45885a4d72d38804f1b10b8440273dc26ac8bd1c38d2bd75`
(2,967,333 bytes; 61 entries/49 files; 10 migrations),
Sites content hash
`sha256:0805c04e9dcd5e8bac77f58aec2362dece1754f6eec63ec73d9c2e249bb01700`
(49 files; 6,748,160 bytes), saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_8868e09fcb28819181cfbebdf82ce73f`,
deployment `appgdep_6a77c5c85974819185ce1c8caf13007c`, and environment
revision `14`; final status is `succeeded` with provider `updated_at`
`2026-08-09T00:12:04.939300+00:00`. Sites version 11 and earlier remain historical predecessor evidence;
version-12-to-11 rollback would reintroduce the lost-ack duplicate response/audit risk and is a
security/behavior regression, not class `N`. In addition,
the privacy-behavior boundary relative to version 7 is not an ordinary rollback
target after consent-governed use. This identity record does not accept a risk or
authorize public, real-user, or paid use.

`RESP-001` and `HARNESS-001` are fixed and their source/test regressions passed
in the exact-version-12 automated suite. The actual Chrome captures remain
exact-version-9 renderer/layout-equivalent evidence for the unchanged UI/CSS only,
not evidence of version-12 CSP, headers, authentication, response recovery, hosted behavior, or a
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
Version 12 retained that project-level containment: four no-credential HTTPS probes
returned the outer owner-policy `401` with `no-store`/`no-referrer`; no supported
signed-in owner browser retest occurred.

Version 12 inherits version 11's replacement of script `'unsafe-inline'` with per-response CSP nonces.
Automated coverage passed, but supported signed-in hosted-browser CSP, hydration,
navigation, and interaction evidence is absent. `SEC-002` is **REMEDIATED — HOSTED
RETEST PENDING**, not closed or eligible for residual-risk acceptance yet.

The version-11 lost-acknowledgement duplicate golfer-response/audit risk is closed in
version 12, not carried as residual risk. Required safe keys, account-and-resolved-
share-session-scoped HMAC receipts, atomic one-response/one-audit cardinality,
`201` first/`200` replay/`409` changed-input behavior, same/mixed race coverage,
10-second timeout recovery, per-tab ambiguous-outcome persistence, and raw-key
non-persistence/non-logging passed locally. Hosted interruption/reload evidence is
still absent and cannot be accepted into existence.

Exact version-12 source commit `7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c`
passed two distinct detached clean checkouts and locked installs, two complete
242/242 verification runs, identical 49-file inventories, and strict allowlisted
generated-value normalization with zero remaining differences; each install contained
501 packages and kept the same five install scripts blocked. `SUPPLY-EVID-001`
therefore closes for the current candidate's normalized reproducibility control. The
exact version-12 release record binds that result to the candidate. The separate
[precursor record](release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md)
and version-9 byte-identity failure remain historical; none of these results
establishes owner acceptance or rollback eligibility.

The historical [exact-v11 local exercise record](release-evidence/ROADMAP-SITES-V11-2026-08-08-LOCAL-EXERCISES.md)
adds predecessor exact-commit synthetic recovery and bounded-capacity evidence. Recovery passed
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
Neither exercise is exact-version-12 recovery evidence or makes hosted restore, rollback/forward-fix, scheduler operation,
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
| `RR-PROVIDER-001`: Sites/Worker, SIWC, D1/R2, and deployment/control-plane concentration increases provider-exit impact | Medium | Versioned source/migrations, logical recovery path, immutable internal instructor IDs, private object metadata, and exact v12/v11/v10/v9/v8 artifacts are recorded. Exact v12 passed two independent 242/242 clean builds with zero differences after strict allowlisted generated-value normalization. Historical exact-v11 local recovery/capacity passed within its recorded scope but is not exact-v12 recovery evidence. No hosted backup/restore, rollback/forward-fix, portability, RPO/RTO, approved performance-target, or named-operator exercise exists. | Name owner and portability cadence. Revisit on terms/region/support/cost/recovery failure, unsupported runtime, a future deterministic-build control failure, or failed export/restore/portability exercise. |
| `RR-EXTERNAL-001`: Roadmap cannot verify the instructor's external booking/purchase/contact destination or outcome | Medium | HTTPS validation, preview, explicit leave-site warning, separate SaaS billing, no sale/booking attribution, visible ask/wait/decline choices | Confirm truthful copy and support owner. Stop on unsafe/misleading destination reports, pressure pattern, or user belief that Roadmap processed the coach transaction. |

## Items not currently eligible for residual-risk acceptance

- `SEC-001` post-rotation retest: normal signed-in owner operation without a bypass
  header and a meaningful privacy-safe hosted log/redaction sample remain missing;
- `SEC-002` hosted retest: exact version 12 inherits per-response nonces without script `'unsafe-inline'`,
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
  unchanged UI/CSS only, while exact-v12 automated regression passed; neither body of evidence
  establish keyboard, screen-reader, real-zoom, device, or human acceptance;
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
  was added after the v9 runtime commit. Exact v12 closes `SUPPLY-EVID-001` for
  the current normalized reproducibility control, but cannot retroactively prove v9
  byte identity;
- historical exact-v11 local synthetic recovery/capacity passes within its recorded scope,
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
