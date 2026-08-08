# Full live V1 completion audit

**Opened:** 2026-08-08  
**Authority:** `AUTH-005`  
**Status:** active completion record; not a launch approval or completion certificate  
**Companion records:** [requirements traceability](REQUIREMENTS_TRACEABILITY.md), [release evidence](RELEASE_EVIDENCE.md), [owner decisions required](OWNER_RELEASE_DECISIONS_REQUIRED.md)

## Current conclusion

The retired repository gates do not restrict implementation. The bounded V1 is
implemented as a production Worker and exact commit
`6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d` is deployed privately as owner-only
Sites version 9 with environment revision 11. The full-live goal is **not complete**
because authenticated hosted acceptance is still absent, the public
commercial/policy inputs and exact consent/operator configuration are unresolved,
controlled real operations and hosted recovery exercises are absent, and Aaron has
not accepted an exact release.

Aaron authorized `OWNER-SEC-001` on 2026-08-08, and one value-safe provider rotation
succeeded. The connector contract immediately invalidated the exposed prior bypass
value; its replacement was neither displayed, persisted, nor used. Owner-only access
remained unchanged and four post-operation signed-out probes passed. The original
value was not replayed, the 15-minute post-operation log sample was empty and
inconclusive, and no signed-in owner browser was mounted. `SEC-001` is therefore
**REMEDIATED — RETEST PENDING**, while `AUTH-EVID-001` remains open. See the
[OWNER-SEC-001 rotation evidence](release-evidence/ROADMAP-SITES-V9-2026-08-08-sec001-rotation.md).

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
| Accessibility and responsive behavior | Semantic/rendered checks, reusable focusable form-error summaries, and exact-commit local synthetic Chrome captures for landing/workspace/golfer at 320/390/1440 px; the capture review found and closed a 320 px golfer-header action compression defect | Local responsive retest passed without page-level horizontal overflow; interaction, human keyboard, screen reader, forced-colour, browser zoom, reduced-motion, supported-browser, real-device, and hosted acceptance remain outstanding |
| Deployment and observability | Exact version 9 deployed owner-only from the recorded commit/archive at environment revision 11; plaintext `/` redirects to HTTPS; signed-out HTTPS `/`, `/app`, `/api/health`, and `/api/operations/health` each returned `401`; the post-deploy broad error-filter sample contained one expected handled non-owner `/app.rsc` `403` with outcome `ok`/level `info` and no error-level event | Deployment and signed-out containment passed; exact local browser evidence is synthetic, deep readiness remains degraded pending exact consent/operator configuration, and authenticated mounted-browser owner smoke, owner operational-health sampling, manual accessibility, alert delivery, and hosted scheduler proof remain pending; zero scheduled events were observed in bounded provider logs, so scheduler deployment is a suspected—not confirmed—gap |
| Recoverability and operations | Runbooks document release, incident, D1 Time Travel, R2 limitations, rollback, support, and billing reconciliation; deterministic isolated D1/R2-compatible synthetic export/restore passed | Named owners, alert/cost exercises, hosted D1/R2 restore, rollback, and incident drills remain |
| Commercial and public operation | `[PRICING HYPOTHESIS — REQUIRES VALIDATION]` and `[REAL-WORLD VALIDATION REQUIRED]` remain attached accurately | Exact offer, Stripe Price, tax/refund/failure/cancel/pause rules, domain, contacts, and policies require Aaron/external input |
| Acceptance | No exact-release acceptance decision is recorded | `[OWNER INPUT REQUIRED]` |

The in-app browser backend was unavailable for the exact version-9 candidate. Local
headless Chrome supplied exact-commit synthetic responsive evidence, but it does not
supply authenticated hosted, manual accessibility, real-device, owner
operational-health, or scheduler evidence. The one expected handled non-owner
renderer-log event supplies none of those missing categories. Version-8 and earlier
provider observations remain historical predecessor evidence.

## Current automated candidate evidence

- `npm run verify`: lint, strict TypeScript, production build, and 229/229 tests
  passed with zero failures, skips, or todos.
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
- `npm run exercise:recovery:local`: two synthetic tenants and three private
  synthetic objects matched after isolated D1/R2-compatible logical restore; the
  snapshot SHA-256 was
  `34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54`; the
  Wrangler child-process probe inherited no secret-shaped parent variables.
- `npm run exercise:capacity:local`: 54 synthetic requests at maximum concurrency
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
- Focused version-9 regressions cover consent policy/lifecycle/enforcement/migration
  and withdrawal races, privacy-operator access/pagination/abuse controls,
  full/package idempotency, handoff/share retry,
  living-content replacement and withdrawal, bounded lists/plan snapshots, export
  preflight/fallback, liveness versus operational readiness, telemetry/log privacy,
  CSP/input hardening, and the enforced production mutation audit-event matrix.
- Exact-commit local Chrome captures at 320, 390, and 1440 px cover the landing,
  instructor workspace, and golfer roadmap. All nine reported no page-level
  horizontal overflow; they do not replace human or hosted accessibility evidence.

### Undeployed successor-source supply-control result

Exact successor source commit `66f5203a913f01c8da20555feebdbb99152c052c`
passed a separate prospective reproducibility exercise. Two distinct detached clean
checkouts each completed a locked install of 501 packages with the same five install
scripts blocked and passed the full 234/234 verification suite. Both builds produced
identical 49-file inventories. Raw variation was confined to `server/index.js` and
the two `vinext-server.json` manifests; strict allowlisted normalization of only the
framework-generated build ID and within-build matching prerender-manifest values
left zero differences. The exact
commit also passed `npm audit --omit=dev` with zero vulnerabilities.

This [successor reproducibility record](release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md)
closes `SUPPLY-EVID-001` prospectively for the successor control only. It does not
retroactively prove byte identity for the deployed version-9 archive. The successor
is not deployed, saved as a Sites version, public, accepted, or a rollback target.

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
  and
- keep the replacement SIWC bypass bearer unused and access owner-only; do not expand
  or accept the release until the `SEC-001` signed-in owner and meaningful hosted-log
  retest passes.

## Remaining completion sequence

1. Complete the recorded post-rotation `SEC-001` retest with a normal signed-in owner
   journey that uses no bypass header and a meaningful privacy-safe hosted
   log/redaction sample. Then complete the broader hosted
   identity/header/spoof/session/recovery matrix under `AUTH-EVID-001`. Do not recover
   or replay the original exposed value merely to manufacture a denial probe.
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
