# Full live V1 completion audit

**Opened:** 2026-08-08  
**Authority:** `AUTH-005`  
**Status:** active completion record; not a launch approval or completion certificate  
**Companion records:** [requirements traceability](REQUIREMENTS_TRACEABILITY.md), [release evidence](RELEASE_EVIDENCE.md), [owner decisions required](OWNER_RELEASE_DECISIONS_REQUIRED.md)

## Current conclusion

The retired repository gates do not restrict implementation. The bounded V1 is
implemented as a production Worker and exact commit
`cf117fef8ea42272d0b7e2358fe4197c024f86a7` is deployed privately as owner-only
Sites version 8 with environment revision 10. The full-live goal is **not complete**
because authenticated hosted acceptance is still absent, the public
commercial/policy inputs and exact consent/operator configuration are unresolved,
controlled real operations and hosted recovery exercises are absent, and Aaron has
not accepted an exact release.

Those are evidence, operating, and owner-decision dependencies. They are not a
reinstated design gate and they do not invalidate completed engineering evidence.

## Phase and definition-of-done status

| Area | Current evidence | Status |
|---|---|---|
| Authority and source precedence | `AUTH-005` authorizes production implementation; Business Plan V2 remains authoritative and Business Plan V1 remains unchanged | Implemented and preserved |
| Bounded architecture | Sites/Vinext Worker, SIWC boundary, D1, private R2 binding, Stripe-hosted SaaS billing boundary, no AI or native coach-package payment | Selected under `AUTH-005`; provider suitability still needs live evidence |
| Instructor and golfer journeys | Resumable minimum-first adult golfer setup, three- or four-phase coach-authored roadmap, profile/packages, preview/publication readiness, scoped share session with retry recovery, non-blocking native external handoff, living-plan create/archive/retire/withdraw/replace updates, responses, six data-request types, and bounded export/manual fallback | Automated production-bundle evidence passed |
| Tenant and capability security | Server-derived tenant, D1 ownership constraints, canonical route guard, missing-identity denial, HMAC-only verifier/session storage, expiry/revocation, rate limits, CSRF, private headers | Automated evidence passed; hosted SIWC spoof/recovery tests remain |
| Concurrency and lifecycle integrity | Revision CAS, tenant-scoped race-safe staged/full-authoring/package idempotency, single publish winner, profile-change and living-content publication/session invalidation, atomic practice-replacement retirement audits, idempotent revoke/session close, current-publication response guard, and atomic data-request/export-fallback deduplication | Automated evidence passed; formal external concurrency/load assessment remains |
| SaaS billing | Server-controlled Checkout/Portal, durable single-attempt idempotency, account-operation leases, provider-authoritative expiry, durable reconciliation targets, pending-sync blocking, signed-webhook leases/replay/race healing, immutable customer ownership, explicit Price/entitlement/freshness policy, scheduled GET-only recovery with fairness/backoff/dead-letter handling, and stale-provider-read fencing | Automated local D1 evidence passed; Checkout remains disabled because exact commercial configuration, public Stripe webhook ingress, and controlled live reconciliation are absent |
| Privacy lifecycle | Tenant export with pre-load record bounds and durable manual-request fallback; immutable versioned purpose grants/withdrawals with exact-text evidence; account `golfer_record` and golfer `roadmap_sharing` enforcement; atomic capability/session revocation; correction through product edits; truthful deletion-review status; bounded privacy-operator queue/marker; request deduplication; bounded request telemetry; and stable-identifier-free runtime log fields | Exact owner-approved consent policy/content versions and privacy-operator access configuration are absent, so deep readiness is intentionally degraded; destructive fulfillment, retention schedule, qualified review, hosted operator/log sampling, and backup expiry remain unresolved |
| Accessibility and responsive behavior | Semantic/rendered checks and reusable focusable form-error summaries with first-invalid-control focus; predecessor Sites/version-5 images remain historical evidence only | Exact version-8 mounted-browser responsive captures remain outstanding, along with interaction, manual keyboard, screen reader, forced-colour, zoom, reduced-motion, and supported-browser acceptance; the browser backend was unavailable |
| Deployment and observability | Exact version 8 deployed owner-only from the recorded commit/archive at environment revision 10; signed-out `/`, `/app`, `/api/health`, and `/api/operations/health` each returned `401`; the error-only Worker-log sample contained one expected non-owner `/app.rsc` `403` with outcome `ok` | Deployment and signed-out containment passed; no exact-v8 renderer/manual inspection is claimed, deep readiness is intentionally degraded pending exact consent/operator configuration, and authenticated mounted-browser owner smoke, hosted scheduler invocation, owner operational-health sampling, manual accessibility, and alert-delivery evidence remain pending |
| Recoverability and operations | Runbooks document release, incident, D1 Time Travel, R2 limitations, rollback, support, and billing reconciliation; deterministic isolated D1/R2-compatible synthetic export/restore passed | Named owners, alert/cost exercises, hosted D1/R2 restore, rollback, and incident drills remain |
| Commercial and public operation | `[PRICING HYPOTHESIS — REQUIRES VALIDATION]` and `[REAL-WORLD VALIDATION REQUIRED]` remain attached accurately | Exact offer, Stripe Price, tax/refund/failure/cancel/pause rules, domain, contacts, and policies require Aaron/external input |
| Acceptance | No exact-release acceptance decision is recorded | `[OWNER INPUT REQUIRED]` |

The in-app browser backend was unavailable for the exact version-8 candidate.
Accordingly, the one expected non-owner renderer-log event does not supply
authenticated mounted-browser, interaction, manual accessibility, responsive,
owner operational-health, or hosted scheduler evidence. Version-5 and version-7
images are retained only as historical predecessor evidence.

## Current automated candidate evidence

- `npm run verify`: lint, strict TypeScript, production build, and 226/226 tests
  passed with zero failures, skips, or todos.
- `npm run db:generate`: `No schema changes, nothing to migrate`; schema, journal,
  all ten migrations, and snapshots agree across 31 tables.
- Release-time/pre-SBOM `npm run verify:release-integrity`: 248 runtime-source
  text files produced zero secret findings; Business Plan V1 remained unchanged and
  the release lock was pinned. The post-SBOM evidence reconciliation rerun scanned
  251 files with the same zero-finding and source-history result.
- `npm run exercise:recovery:local`: two synthetic tenants and three private
  synthetic objects matched after isolated D1/R2-compatible logical restore; the
  snapshot SHA-256 was
  `34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54`; the
  Wrangler child-process probe inherited no secret-shaped parent variables.
- The production Worker test matrix covers declared mutation handlers, every
  discovered instructor HTML/RSC/API path, percent-encoded path aliases, missing
  identity, tenant substitution, current share/session expiry, revocation, and
  private response headers.
- Fresh `npm run audit:production` reports zero known production vulnerabilities for
  the exact lock. The package-lock SHA-256 is
  `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d`.
- `git diff --check` reported no whitespace errors (line-ending warnings only).
- Focused version-8 regressions cover consent policy/lifecycle/enforcement/migration
  and withdrawal races, privacy-operator access/pagination/abuse controls,
  full/package idempotency, handoff/share retry,
  living-content replacement and withdrawal, bounded lists/plan snapshots, export
  preflight/fallback, liveness versus operational readiness, telemetry/log privacy,
  CSP/input hardening, and the enforced production mutation audit-event matrix.

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
- rotate or revoke the exposed SIWC bypass credential before access expands or the
  release is accepted.

## Remaining completion sequence

1. Rotate/revoke the exposed bypass token under explicit Aaron authorization and run
   authenticated hosted identity/header/spoof/session checks without using the
   exposed credential.
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
   rollback, monitoring/alert/cost/support/incident exercises, qualified policy
   review, and authorized real instructor/golfer journeys.
5. Have Aaron accept the exact release with date, operating scope, configuration,
   policies, named owners, residual risks, and stop/revisit triggers.

The goal may be marked complete only after every applicable item above is evidenced
or receives an explicit, durable, accountable risk disposition consistent with the
goal brief.
