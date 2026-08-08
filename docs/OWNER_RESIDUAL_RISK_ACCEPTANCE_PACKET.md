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

These candidate risks are reconciled to owner-private Sites version 9 at
source/runtime release `6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d`, local release
archive SHA-256
`8b3d0b13f03f0b13cd10602d24af09bf17c34afdcb4cf73518b2b0d857d59e22`,
Sites content hash
`sha256:0b3986dc73b1d06539dc85900dfd959549d92bcceb812c231a418766d29411fb`,
saved version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_58bb67e8e23c8191a584540a09e363c5`,
deployment `appgdep_6a7768f92c588191934eda8abea6d6b4`, and environment
revision `11`. Sites versions 8 and earlier remain historical predecessor evidence;
the privacy-behavior boundary relative to version 7 is not an ordinary rollback
target after consent-governed use. This identity record does not accept a risk or
authorize public, real-user, or paid use.

`RESP-001` and `HARNESS-001` are fixed and retested only in the exact-commit local
synthetic browser/harness boundary. They are closed defects, not candidate residual
risks, and their closure does not replace hosted journey or manual accessibility
evidence.

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
| `RR-CSP-001`: vinext bootstrap currently requires CSP `'unsafe-inline'` for script elements | Medium | Exact v9 passed automated adversarial coverage; framework escaping, raw HTML/SVG exclusion, URL/input controls, no `unsafe-eval`, and inline script-attribute denial are implemented. No supported-browser deployed-CSP inspection exists. | Security owner reviews exact deployed CSP/test evidence. Revisit on vinext nonce/hash support, any XSS finding, CSP regression, or runtime change. |
| `RR-CAP-001`: an intended golfer can forward a bearer capability | Medium | 256-bit verifier, HMAC fingerprint at rest, fragment/body exchange, short scoped session, neutral failures, expiry, rotation/revocation, no third-party analytics | Accept only after hosted exchange/revoke/session tests and approved sharing copy. Stop on token logging, cross-golfer access, unexplained forwarding harm, or inadequate revocation. |
| `RR-PROVIDER-001`: Sites/Worker, SIWC, D1/R2, and deployment/control-plane concentration increases provider-exit impact | Medium | Versioned source/migrations, logical recovery path, immutable internal instructor IDs, private object metadata, and exact v9/v8 artifacts are recorded. An isolated exact-v9 clean install built and passed 229/229 tests, but did not reproduce the submitted archive byte-for-byte. Local recovery passed, but no hosted rollback, restore, or portability exercise exists. | Name owner and portability cadence. Revisit on terms/region/support/cost/recovery failure, unsupported runtime, deterministic-rebuild failure after the future LF-pinned candidate, or failed export/restore/portability exercise. |
| `RR-EXTERNAL-001`: Roadmap cannot verify the instructor's external booking/purchase/contact destination or outcome | Medium | HTTPS validation, preview, explicit leave-site warning, separate SaaS billing, no sale/booking attribution, visible ask/wait/decline choices | Confirm truthful copy and support owner. Stop on unsafe/misleading destination reports, pressure pattern, or user belief that Roadmap processed the coach transaction. |

## Items not currently eligible for residual-risk acceptance

- `SEC-001` exposed SIWC bypass credential before rotation/revocation and retest;
- missing hosted identity/spoof/recovery evidence before public authentication;
- missing qualified privacy/legal, retention/deletion, and public-copy decisions
  before real customer/golfer data;
- absent approved consent-policy text/version/required choices and data-request
  operator allowlist/pepper configuration; deep readiness therefore remains degraded;
- missing manual accessibility review where an undiscovered blocker may exist;
  exact-v9 local 320/390/1440 captures and the closed responsive defect do not
  establish keyboard, screen-reader, real-zoom, device, or human acceptance;
- `OPS-CRON-001`: suspected hosted scheduler deployment gap before paid operation.
  A predecessor-v8 provider query contained 24 fetch events and zero scheduled
  events across multiple expected intervals, and two bounded post-v9 queries
  likewise surfaced fetch-only samples and no scheduled event. Log completeness,
  scheduled-event visibility, and deployed-trigger metadata are unavailable, so
  the defect is not confirmed and the evidence remains incomplete;
- deterministic byte identity for v9. Its isolated immutable-commit export passed
  `npm ci --no-audit` (501 packages), built, and passed 229/229 tests, but the rebuilt
  `dist` did not byte-match the submitted archive: the Windows CRLF checkout changed
  migration/metadata bytes and content-hashed bundles. Line endings are consistent
  with the variance but are not proven to be its only cause. The repository LF rule
  was added after the v9 runtime commit and must pass on a later exact candidate;
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
