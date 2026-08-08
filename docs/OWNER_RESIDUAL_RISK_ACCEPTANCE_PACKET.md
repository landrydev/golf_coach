# Owner residual-risk acceptance packet

**Status:** `[OWNER INPUT REQUIRED]`; candidate risks, not accepted risks
**Purpose:** Record informed, bounded, time-limited acceptance for one exact release
**Related:** [Findings ledger](FINDINGS_RETEST_LEDGER.md),
[security/privacy](SECURITY_PRIVACY.md), and
[provider/exit record](PROVIDER_RESPONSIBILITY_COST_AND_EXIT.md)

A residual risk is what remains after implemented controls and applicable evidence
pass. Missing evidence, an unresolved critical incident, unknown customer harm, or a
policy decision that has never been made is not made safe by calling it residual.

## Current candidate scope

These candidate risks are reconciled to owner-private Sites version 10 at
source/runtime release `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1`, local release
archive SHA-256
`5d67423e253009714bebe85bba118ded922c9f6b30b926f2af7bd0e3d05cd953`,
Sites content hash
`sha256:0534d35af6fcdd8a0f104c5bb21fab5edd0641ec952bd32ae7a3f9c024c62033`,
saved version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_1007b9b4ea8c8191968d55991abf374c`,
deployment `appgdep_6a779cabaec4819191b0cf1e815ce2e5`, and environment
revision `12`; final status is `succeeded` with provider `updated_at`
`2026-08-08T21:17:13.525116Z`. Sites version 9 and earlier remain historical predecessor evidence;
the privacy-behavior boundary relative to version 7 is not an ordinary rollback
target after consent-governed use. This identity record does not accept a risk or
authorize public, real-user, or paid use.

`RESP-001` and `HARNESS-001` are fixed and their source/test regressions passed
in the exact-version-10 automated suite. The actual Chrome captures remain
exact-version-9 source-equivalent evidence for the unchanged app/runtime UI, not
an exact-version-10 browser, hosted, or manual retest. These are closed defects,
not candidate residual risks, and their closure does not replace hosted journey
or manual accessibility evidence.

Aaron authorized `OWNER-SEC-001` on 2026-08-08. A single value-safe Sites rotation
immediately invalidated the exposed prior bypass value under the provider contract;
the replacement was not displayed, persisted, or used, and owner-only access remained
unchanged. The original value was not replayed, the post-operation Worker sample was
empty and inconclusive, and no signed-in owner browser was mounted. Accordingly,
`SEC-001` is **REMEDIATED — RETEST PENDING**, not an eligible residual risk. See the
[rotation evidence](release-evidence/ROADMAP-SITES-V9-2026-08-08-sec001-rotation.md).
Version 10 retained that project-level containment: four signed-out HTTPS probes
returned the outer owner-policy `401` with `no-store`/`no-referrer`; its bounded log
sample contained zero events and was inconclusive, and no browser retest occurred.

Exact version-10 source commit `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1`
passed two distinct detached clean checkouts and locked installs, three complete
234/234 verification runs, identical 49-file inventories, and strict allowlisted
generated-value normalization with zero remaining differences; each install contained
501 packages and kept the same five install scripts blocked. `SUPPLY-EVID-001`
therefore closes for the current candidate's normalized reproducibility control. The
[exact version-10 record](release-evidence/ROADMAP-SITES-V10-2026-08-08.md)
binds that result to the candidate. The separate
[precursor record](release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md)
and version-9 byte-identity failure remain historical; none of these results
establishes owner acceptance or rollback eligibility.

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
| `RR-CSP-001`: vinext bootstrap currently requires CSP `'unsafe-inline'` for script elements | Medium | Exact v10 passed automated adversarial coverage; framework escaping, raw HTML/SVG exclusion, URL/input controls, no `unsafe-eval`, and inline script-attribute denial are implemented. No version-10 supported-browser deployed-CSP inspection exists. | Security owner reviews exact deployed CSP/test evidence. Revisit on vinext nonce/hash support, any XSS finding, CSP regression, or runtime change. |
| `RR-CAP-001`: an intended golfer can forward a bearer capability | Medium | 256-bit verifier, HMAC fingerprint at rest, fragment/body exchange, short scoped session, neutral failures, expiry, rotation/revocation, no third-party analytics | Accept only after hosted exchange/revoke/session tests and approved sharing copy. Stop on token logging, cross-golfer access, unexplained forwarding harm, or inadequate revocation. |
| `RR-PROVIDER-001`: Sites/Worker, SIWC, D1/R2, and deployment/control-plane concentration increases provider-exit impact | Medium | Versioned source/migrations, logical recovery path, immutable internal instructor IDs, private object metadata, and exact v10/v9/v8 artifacts are recorded. Exact v10 passed two independent clean builds with zero differences after strict allowlisted generated-value normalization; v9's earlier byte-identity failure remains historical. Local recovery passed, but no hosted rollback, restore, or portability exercise exists. | Name owner and portability cadence. Revisit on terms/region/support/cost/recovery failure, unsupported runtime, a future deterministic-build control failure, or failed export/restore/portability exercise. |
| `RR-EXTERNAL-001`: Roadmap cannot verify the instructor's external booking/purchase/contact destination or outcome | Medium | HTTPS validation, preview, explicit leave-site warning, separate SaaS billing, no sale/booking attribution, visible ask/wait/decline choices | Confirm truthful copy and support owner. Stop on unsafe/misleading destination reports, pressure pattern, or user belief that Roadmap processed the coach transaction. |

## Items not currently eligible for residual-risk acceptance

- `SEC-001` post-rotation retest: normal signed-in owner operation without a bypass
  header and a meaningful privacy-safe hosted log/redaction sample remain missing;
- missing hosted identity/spoof/recovery evidence before public authentication;
- missing qualified privacy/legal, retention/deletion, and public-copy decisions
  before real customer/golfer data;
- absent approved consent-policy text/version/required choices and data-request
  operator allowlist/pepper configuration; deep readiness therefore remains degraded;
- missing manual accessibility review where an undiscovered blocker may exist;
  version-9 local 320/390/1440 captures are source-equivalent for the unchanged
  app/runtime UI, while exact-v10 automated regression passed; neither body of evidence
  establish keyboard, screen-reader, real-zoom, device, or human acceptance;
- `OPS-CRON-001`: suspected hosted scheduler deployment gap before paid operation.
  A predecessor-v8 provider query contained 24 fetch events and zero scheduled
  events across multiple expected intervals, and two bounded post-v9 queries
  likewise surfaced fetch-only samples and no scheduled event. The bounded v10
  sample returned zero events and is inconclusive. Log completeness,
  scheduled-event visibility, and deployed-trigger metadata are unavailable, so
  the defect is not confirmed and the evidence remains incomplete;
- historical deterministic byte identity for v9. Its isolated immutable-commit export passed
  `npm ci --no-audit` (501 packages), built, and passed 229/229 tests, but the rebuilt
  `dist` did not byte-match the submitted archive: the Windows CRLF checkout changed
  migration/metadata bytes and content-hashed bundles. Line endings are consistent
  with the variance but are not proven to be its only cause. The repository LF rule
  was added after the v9 runtime commit. Exact v10 now closes `SUPPLY-EVID-001` for
  the current normalized reproducibility control, but cannot retroactively prove v9
  byte identity;
- missing hosted rollback/restore, authenticated health, alert, incident, and
  staffed-operator evidence for the affected operating scope;
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
