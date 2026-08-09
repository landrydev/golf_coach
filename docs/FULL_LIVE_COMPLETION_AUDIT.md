# Full live V1 completion audit

**Opened:** 2026-08-08  
**Authority:** `AUTH-005`  
**Status:** active completion record; not a launch approval or completion certificate  
**Companion records:** [requirements traceability](REQUIREMENTS_TRACEABILITY.md), [release evidence](RELEASE_EVIDENCE.md), [exact-v11 local exercises](release-evidence/ROADMAP-SITES-V11-2026-08-08-LOCAL-EXERCISES.md), [owner decisions required](OWNER_RELEASE_DECISIONS_REQUIRED.md)

## Current conclusion

The retired repository gates do not restrict implementation. The bounded V1 is
implemented as a production Worker and exact commit
`44670a64498779cf747914b4465380916a939301` is deployed privately as owner-only
Sites version 11 with environment revision 13. The full-live goal is **not complete**
because authenticated hosted acceptance is still absent, the public
commercial/policy inputs and exact consent/operator configuration are unresolved,
controlled real operations and hosted recovery exercises are absent, and Aaron has
not accepted an exact release.

The saved version is
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_4c49cdec72bc8191aeece01f5689e51a`;
deployment `appgdep_6a77b01714b881918245bb5248349e0d` remains `succeeded`,
with final provider status `updated_at` `2026-08-08T22:40:07.742084+00:00`.
Checkout remains disabled and access remains owner-only.

Aaron authorized `OWNER-SEC-001` on 2026-08-08, and one value-safe provider rotation
succeeded. The connector contract immediately invalidated the exposed prior bypass
value; its replacement was neither displayed, persisted, nor used. Owner-only access
remained unchanged and four post-operation signed-out probes passed. The original
value was not replayed, the 15-minute post-operation log sample was empty and
inconclusive, and no signed-in owner browser was mounted. `SEC-001` remains
**REMEDIATED — RETEST PENDING**, while `AUTH-EVID-001` remains open. The later
version-11 deployment neither reverses the project-level credential rotation nor
supplies the missing normal signed-in owner/log retest. See the
[OWNER-SEC-001 rotation evidence](release-evidence/ROADMAP-SITES-V9-2026-08-08-sec001-rotation.md).

Version 11 replaces the prior script-element `'unsafe-inline'` allowance with
per-response CSP nonces. Exact automated coverage passed, but a supported signed-in
hosted browser was unavailable for deployed CSP and hydration/interaction retesting.
`SEC-002` is **REMEDIATED — HOSTED RETEST PENDING**, not closed.

Those are evidence, operating, and owner-decision dependencies. They are not a
reinstated design gate and they do not invalidate completed engineering evidence.

Current official Sites guidance also leaves the paid-operation host unresolved.
The [Sites developer guide](https://learn.chatgpt.com/docs/sites) says some
background services or hosting patterns are unsupported and cautions against using
Sites to enable financial transactions, while the
[Sites help article](https://help.openai.com/en/articles/20001339) describes
third-party payment processing as an operator responsibility. Neither documents a
Sites cron facility. That conflict/omission plus the bounded zero-scheduled-event
observations requires provider confirmation or a verified superseding host/scheduler
before paid operation; it does not by itself prove that Sites discarded the trigger.

## Phase and definition-of-done status

| Area | Current evidence | Status |
|---|---|---|
| Authority and source precedence | `AUTH-005` authorizes production implementation; Business Plan V2 remains authoritative and Business Plan V1 remains unchanged | Implemented and preserved |
| Bounded architecture | Sites/Vinext Worker, SIWC boundary, D1, private R2 binding, Stripe-hosted SaaS billing boundary, no AI or native coach-package payment | Selected under `AUTH-005`; provider suitability still needs live evidence |
| Instructor and golfer journeys | Resumable minimum-first adult golfer setup, three- or four-phase coach-authored roadmap, profile/packages, preview/publication readiness, scoped share session with retry recovery, non-blocking native external handoff, living-plan create/archive/retire/withdraw/replace updates, responses, six data-request types, and bounded export/manual fallback | Automated production-bundle evidence passed |
| Tenant and capability security | Server-derived tenant, D1 ownership constraints, canonical route guard, missing-identity denial, HMAC-only verifier/session storage, expiry/revocation, rate limits, CSRF, private headers; the exposed Sites bypass value was invalidated by one value-safe provider rotation under `OWNER-SEC-001` | Automated evidence and provider-attested rotation passed; `SEC-001` signed-in owner/log retest plus the broader hosted SIWC spoof/recovery matrix remain |
| Concurrency and lifecycle integrity | Revision CAS, tenant-scoped race-safe staged/full-authoring/package idempotency, single publish winner, profile-change and living-content publication/session invalidation, atomic practice-replacement retirement audits, idempotent revoke/session close, current-publication response guard, and atomic data-request/export-fallback deduplication | Automated evidence passed; formal external concurrency/load assessment remains |
| SaaS billing | Server-controlled Checkout/Portal, durable single-attempt idempotency, account-operation leases, provider-authoritative expiry, durable reconciliation targets, pending-sync blocking, signed-webhook leases/replay/race healing, immutable customer ownership, explicit Price/entitlement/freshness policy, scheduled GET-only recovery with fairness/backoff/dead-letter handling, and stale-provider-read fencing | Automated local D1 evidence passed; Checkout remains disabled because exact commercial configuration, public Stripe webhook ingress, and controlled live reconciliation are absent |
| Privacy lifecycle | Tenant export with pre-load record bounds and durable manual-request fallback; immutable versioned purpose grants/withdrawals with exact-text evidence; account `golfer_record` and golfer `roadmap_sharing` enforcement; atomic capability/session revocation; correction through product edits; truthful deletion-review status; bounded privacy-operator queue/marker; request deduplication; bounded request telemetry; and stable-identifier-free runtime log fields | Exact owner-approved consent policy/content versions and privacy-operator access configuration are absent, so deep readiness is intentionally degraded; destructive fulfillment, retention schedule, qualified review, hosted operator/log sampling, and backup expiry remain unresolved |
| Accessibility and responsive behavior | Semantic/rendered checks, reusable focusable form-error summaries, and historical exact-version-9 local synthetic Chrome captures for renderer/layout-equivalent landing/workspace/golfer UI and CSS at 320/390/1440 px; the capture review found and closed a 320 px golfer-header action compression defect | The historical local responsive retest passed without page-level horizontal overflow; it is not version-11 CSP, header, authentication, or security evidence. Interaction, human keyboard, screen reader, forced-colour, browser zoom, reduced-motion, supported-browser, real-device, and hosted acceptance remain outstanding |
| Deployment and observability | Exact version 11 deployed owner-only from commit `44670a64498779cf747914b4465380916a939301` and the recorded archives at environment revision 13; signed-out HTTPS `/`, `/app`, `/api/health`, and `/api/operations/health` each returned `401` with `no-store`/`no-referrer`. The first post-deployment exact-v11 30-minute aggregate at `2026-08-08T22:58:53.646Z` returned three `fetch`/`info`/`ok` events, zero observed `scheduled` events after three expected boundaries, and one `errors_only` `fetch`/`info`/`ok` event with zero error fields. A newer 30-minute broad query and its `errors_only` companion around `2026-08-08T23:20:16.850Z` were empty. The later 60-minute broad aggregate at approximately `2026-08-08T23:23:52Z` returned three `fetch`/`info`/`ok` events with HTTP `200`, `200`, and handled `403`, and `scheduled=0`; `errors_only` returned only the handled `403`. No raw content was emitted or retained. | Version-11 deployment and signed-out containment passed. The repeated bounded log results strengthen the suspected scheduler gap but prove neither version-11 error-free operation, log completeness/redaction, health, nor hosted scheduler invocation or absence because trigger metadata and scheduled-event visibility are unconfirmed. `SEC-002` nonce remediation still needs supported signed-in hosted-browser retesting. Exact local browser evidence is synthetic, deep readiness remains degraded pending exact consent/operator configuration, and authenticated mounted-browser owner smoke, owner operational-health sampling, manual accessibility, alert delivery, and hosted scheduler proof remain pending. |
| Recoverability and operations | Runbooks document release, incident, D1 Time Travel, R2 limitations, rollback, support, and billing reconciliation. The [exact-v11 local exercise record](release-evidence/ROADMAP-SITES-V11-2026-08-08-LOCAL-EXERCISES.md) records a deterministic isolated D1/R2-compatible synthetic restore across all 10 migrations and 31/31 tables, two tenants, three R2-compatible objects/199 bytes, three negative integrity scenarios, and child-process secret isolation; its separate bounded-capacity run completed 54 requests at concurrency four with zero failures. | Exact-v11 local synthetic recovery/capacity passed within its recorded scope. Hosted D1/R2 backup/restore, rollback or forward-fix, RPO/RTO, approved performance targets, scheduler, named operators, alert/cost exercises, and incident drills remain open. |
| Commercial and public operation | `[PRICING HYPOTHESIS — REQUIRES VALIDATION]` and `[REAL-WORLD VALIDATION REQUIRED]` remain attached accurately | Exact offer, Stripe Price, tax/refund/failure/cancel/pause rules, domain, contacts, and policies require Aaron/external input |
| Acceptance | No exact-release acceptance decision is recorded | `[OWNER INPUT REQUIRED]` |

The supported Browser list was empty, so browser review remained unavailable for the
exact version-11 candidate.
Version-9 local headless Chrome evidence covers only the renderer/layout-equivalent
UI and CSS at its recorded commit; it does not establish version-11 CSP, headers,
authentication, or other Worker security behavior. It is predecessor evidence and does not supply
authenticated hosted, manual accessibility, real-device, owner operational-health,
or scheduler evidence for version 11. The final bounded version-11 provider
aggregate and predecessor samples supply no authenticated, complete-redaction,
alert-delivery, or confirmed scheduler evidence for those missing categories.
Version 9 and earlier provider observations remain historical predecessor evidence.

## Current candidate and inherited automated evidence

- Exact version 11 uses source/runtime commit
  `44670a64498779cf747914b4465380916a939301`. Its submitted local archive has
  SHA-256 `d88be6513bc58afd057d4a3fb3a6d64b744f7a5c359731ec9fc693a788e1fa0e`,
  is 2,966,073 bytes, and contains 61 entries/49 files and all ten migrations.
  The saved provider archive has content hash
  `sha256:d717035871790252548e7fff4e1192e590b73b7cabfe3f4c011d65ffe4493daa`,
  49 files, and 6,737,920 bytes.
- Version 11 implements per-response script nonces and removes script
  `'unsafe-inline'`. That is a security/behavior delta from version 10, so
  version-11-to-10 rollback is a regression and not application class `N` even
  though the migration journal remains unchanged.
- Each of two exact-version-11 detached clean worktrees installed 501 locked
  packages, reported the same five blocked install scripts, and passed the full
  237/237 verification suite.
- Exact-version-11 release integrity inspected 259 source/evidence text files,
  found zero secret findings, preserved Business Plan V1, and confirmed the lock
  SHA-256. `npm audit --omit=dev` reported zero known production vulnerabilities.
- The two exact-version-11 clean builds produced identical 49-file inventories.
  Raw variation was limited to three validated generated-value files; strict
  allowlisted normalization left zero differences. This proves the recorded
  normalized-reproducibility control, not byte-for-byte identity.
- The [exact-version-11 local exercise record](release-evidence/ROADMAP-SITES-V11-2026-08-08-LOCAL-EXERCISES.md)
  binds both synthetic exercises to deployed source commit
  `44670a64498779cf747914b4465380916a939301`. Recovery passed in 103,656 ms of
  local wall-clock time across all ten migrations and 31/31 application tables,
  restored two synthetic tenants and three R2-compatible objects totalling 199
  bytes, matched the 34,380-byte snapshot SHA-256
  `34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54`,
  detected a modified D1 snapshot, a missing object, and an object checksum
  mismatch, and kept secret-shaped variables out of the Wrangler subprocess.
  The bounded-capacity exercise completed 54 requests at maximum concurrency four
  with 44 `200`, ten `201`, zero failures, and local observations of p50 48.46 ms,
  p95 107.60 ms, and maximum 107.83 ms. The wall-clock duration is not an RTO,
  the snapshot age is not an RPO, and the timings are not a performance target,
  SLO, SLA, sustained-load, or hosted-capacity result.
- Historical exact-version-10 local evidence includes a post-deployment
  `npm run db:generate` result confirming
  31 tables and no migration drift. The local synthetic capacity exercise
  completed 54 requests at concurrency four with zero failures; the isolated
  recovery exercise applied all ten migrations, covered 31/31 tables, restored
  two synthetic tenants and three private objects, and matched snapshot SHA-256
  `34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54`.
  These remain historical local synthetic results, not exact-version-11 hosted
  capacity, provider-native
  recovery, RPO/RTO, SLO, or operator evidence.

- The exact-version-9 runtime baseline `npm run verify` passed lint, strict
  TypeScript, production build, and 229/229 tests with zero failures, skips, or
  todos; preserve that result as predecessor evidence rather than relabelling it as
  an exact-version-11 execution.
- `npm run db:generate`: `No schema changes, nothing to migrate`; schema, journal,
  all ten migrations, and snapshots agree across 31 tables.
- `npm run verify:release-integrity`: 252 source text files produced zero secret
  findings; Business Plan V1 remained unchanged and the release lock was pinned.
- An isolated exact-commit `npm ci --no-audit` installed 501 packages and the fresh
  checkout passed the full 229-test verification. Its rebuilt output did not
  byte-match the submitted archive after Windows line-ending conversion, so clean
  behavioral reproducibility is proved but deterministic byte identity is not. A
  post-runtime `.gitattributes` control pins future text checkouts to LF. It is not
  version-9 evidence; the separate successor exercise below tests that later control.
- Historical exact-version-9 `npm run exercise:recovery:local`: two synthetic tenants and three private
  synthetic objects matched after isolated D1/R2-compatible logical restore; the
  snapshot SHA-256 was
  `34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54`; the
  Wrangler child-process probe inherited no secret-shaped parent variables.
- Historical exact-version-9 `npm run exercise:capacity:local`: 54 synthetic requests at maximum concurrency
  four, four author/edit/publish/share flows, two exports, and zero failures; local
  p50 was 42.75 ms, p95 107.09 ms, and max 107.99 ms. This is not hosted capacity or
  an approved SLO.
- The production Worker test matrix covers declared mutation handlers, every
  discovered instructor HTML/RSC/API path, percent-encoded path aliases, missing
  identity, tenant substitution, current share/session expiry, revocation, and
  private response headers.
- Fresh `npm run audit:production` reports zero known production vulnerabilities for
  the exact lock. The package-lock SHA-256 is
  `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d`.
- `git diff --check` reported no whitespace errors (line-ending warnings only).
- Focused historical version-9 regressions cover consent policy/lifecycle/enforcement/migration
  and withdrawal races, privacy-operator access/pagination/abuse controls,
  full/package idempotency, handoff/share retry,
  living-content replacement and withdrawal, bounded lists/plan snapshots, export
  preflight/fallback, liveness versus operational readiness, telemetry/log privacy,
  CSP/input hardening, and the enforced production mutation audit-event matrix.
- Historical exact-version-9 local Chrome captures at 320, 390, and 1440 px cover the landing,
  instructor workspace, and golfer roadmap. All nine reported no page-level
  horizontal overflow. Their source-equivalence is limited to renderer/layout UI
  and CSS; they do not verify version-11 CSP, headers, authentication, or other
  security behavior and do not replace human or hosted accessibility evidence.

### Exact-version-11 supply-control result and historical predecessors

Exact version-11 commit `44670a64498779cf747914b4465380916a939301`
passed the two-detached-worktree normalized-reproducibility exercise described
above. Raw variation was confined to `server/index.js` and the two
`vinext-server.json` manifests; strict normalization accepted only the validated
framework build ID and matching prerender-manifest values, leaving zero
differences.

Exact precursor commit `66f5203a913f01c8da20555feebdbb99152c052c`
previously passed the same prospective control. Its
[historical reproducibility record](release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md)
remains separate, as do the version-10 release record and version 9's failed
byte-identity result. The exact version-11 release record binds the current control
to the saved provider version and deployment.
`SUPPLY-EVID-001` is closed only for this normalized-reproducibility scope; it
does not prove byte-for-byte identity, public acceptance, rollback, or hosted
restore.

Automated checks do not prove legal compliance, public demand, public-auth
suitability, accessibility conformance, operational recoverability, or live-user
success.

## Safe release constraints

Until the linked owner decisions and exercises are complete:

- keep the Sites access policy owner-only;
- keep the configured application-level `owner_private` HMAC allowlist fail-closed;
- keep `BILLING_CHECKOUT_ENABLED=false` and omit live Stripe secrets/Price;
- leave consent activation and privacy-operator access fail-closed until Aaron
  approves the exact purpose text/version and operator assignment/configuration;
- keep media upload, junior use, public discovery, AI, native coach-package payment,
  and outbound messaging absent;
- describe account deletion only as a review request, never as completed deletion;
- do not treat D1 Time Travel or R2 durability as a completed backup/restore program;
- keep the replacement SIWC bypass bearer unused and access owner-only; do not expand
  or accept the release until the `SEC-001` signed-in owner and meaningful hosted-log
  retest passes;
- do not close `SEC-002` until a supported signed-in hosted browser verifies the
  nonce CSP, hydration, navigation, and representative interactions on exact version 11.

## Remaining completion sequence

1. Complete the recorded post-rotation `SEC-001` retest with a normal signed-in owner
   journey that uses no bypass header and a meaningful privacy-safe hosted
   log/redaction sample. Then complete the broader hosted
   identity/header/spoof/session/recovery matrix under `AUTH-EVID-001`. Do not recover
   or replay the original exposed value merely to manufacture a denial probe. In the
   same supported signed-in hosted browser, verify version 11's nonce CSP, hydration,
   navigation, and representative interactions; keep `SEC-002` at **REMEDIATED —
   HOSTED RETEST PENDING** until that passes.
2. Record exact owner decisions for scope/design/copy, versioned consent purposes,
   privacy-operator assignment/access, public contacts, commercial consequences,
   privacy/retention/deletion, media exclusion, providers, public origin, and
   residual risks; then configure and retest deep readiness without exposing secrets.
3. Approve and provision a Stripe-reachable signed-webhook ingress that does not expose
   instructor routes; record the exact Price/status/entitlement/freshness/tax/refund/
   cancel policy; then exercise the implemented durable Checkout, replay, ordering,
   rotation, and reconciliation paths in controlled Stripe test and authorized live
   transactions before enabling Checkout.
4. Complete manual accessibility/browser review, controlled D1/R2 restore and
   rollback, establish whether Sites actually installs or exposes the declared
   five-minute Worker trigger, observe at least three successful heartbeats, then
   complete monitoring/alert/cost/support/incident exercises, qualified policy
   review, and authorized real instructor/golfer journeys.
5. Have Aaron accept the exact release with date, operating scope, configuration,
   policies, named owners, residual risks, and stop/revisit triggers.

The goal may be marked complete only after every applicable item above is evidenced
or receives an explicit, durable, accountable risk disposition consistent with the
goal brief.
