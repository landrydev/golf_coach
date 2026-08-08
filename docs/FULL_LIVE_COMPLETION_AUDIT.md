# Full live V1 completion audit

**Opened:** 2026-08-08  
**Authority:** `AUTH-005`  
**Status:** active completion record; not a launch approval or completion certificate  
**Companion records:** [requirements traceability](REQUIREMENTS_TRACEABILITY.md), [release evidence](RELEASE_EVIDENCE.md), [owner decisions required](OWNER_RELEASE_DECISIONS_REQUIRED.md)

## Current conclusion

The retired repository gates do not restrict implementation. The bounded V1 is
implemented as a production Worker and exact commit
`7ed01ec822fdb5c2bfbe6db7e3c99bcba126ac17` is deployed privately as owner-only
Sites version 7 with environment revision 9. The full-live goal is **not complete**
because authenticated hosted acceptance is still absent, the public
commercial/policy inputs are unresolved, controlled real operations and hosted
recovery exercises are absent, and Aaron has not accepted an exact release.

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
| Privacy lifecycle | Tenant export with pre-load record bounds and durable manual-request fallback, correction through product edits, living-content withdrawal, share revocation, truthful deletion-review status, request deduplication, bounded request telemetry, and stable-identifier-free runtime log fields | Destructive fulfillment, retention schedule, qualified review, hosted log sampling, and backup expiry remain unresolved |
| Accessibility and responsive behavior | Semantic/rendered checks and reusable focusable form-error summaries with first-invalid-control focus; one Sites-generated 1200×750 version-7 desktop landing image passed a limited visual sanity inspection; the recorded 1440/390/320 CSS-pixel captures remain historical version-5 evidence only | Exact version-7 mounted-browser responsive captures remain outstanding, along with interaction, manual keyboard, screen reader, forced-colour, zoom, reduced-motion, and supported-browser acceptance |
| Deployment and observability | Exact version 7 deployed owner-only from the recorded commit/archive at environment revision 9; signed-out `/`, `/app`, `/api/health`, and `/api/operations/health` each returned `401`; the immediate error-only Worker-log sample contained zero events; a non-error 20-minute sample recorded untruncated outcome-`ok` renderer fetches for `/` (`200`), `/.rsc` (`200`), and expected non-owner `/app.rsc` (`403`); one 1200×750 renderer image passed a limited landing-page sanity review | Deployment, renderer sanity, and signed-out containment passed; authenticated mounted-browser owner smoke, hosted scheduler invocation, owner operational-health sampling, manual accessibility, and alert-delivery evidence remain pending |
| Recoverability and operations | Runbooks document release, incident, D1 Time Travel, R2 limitations, rollback, support, and billing reconciliation; deterministic isolated D1/R2-compatible synthetic export/restore passed | Named owners, alert/cost exercises, hosted D1/R2 restore, rollback, and incident drills remain |
| Commercial and public operation | `[PRICING HYPOTHESIS — REQUIRES VALIDATION]` and `[REAL-WORLD VALIDATION REQUIRED]` remain attached accurately | Exact offer, Stripe Price, tax/refund/failure/cancel/pause rules, domain, contacts, and policies require Aaron/external input |
| Acceptance | No exact-release acceptance decision is recorded | `[OWNER INPUT REQUIRED]` |

The in-app browser backend was unavailable for the exact version-7 candidate.
Accordingly, the single Sites renderer image and renderer fetch sample do not supply
authenticated mounted-browser, interaction, manual accessibility, responsive,
owner operational-health, or hosted scheduler evidence. Version-5 screenshots are
retained only as historical predecessor evidence.

## Current automated candidate evidence

- `npm run verify`: lint, strict TypeScript, production build, and 163/163 tests
  passed with zero failures, skips, or todos.
- `npm run db:generate`: `No schema changes, nothing to migrate`; schema, journal,
  all eight migrations, and snapshots agree across 31 tables.
- `npm run verify:release-integrity`: 204 text files produced zero secret findings;
  Business Plan V1 remained unchanged and the release lock was pinned.
- `npm run exercise:recovery:local`: two synthetic tenants and three private
  synthetic objects matched after isolated D1/R2-compatible logical restore; the
  snapshot SHA-256 was
  `ebbba2d865090457ef567a1d15658cad0457e4e7d89c2c1975ec45ce944887c5`; the
  Wrangler child-process probe inherited no secret-shaped parent variables.
- The production Worker test matrix covers declared mutation handlers, every
  discovered instructor HTML/RSC/API path, percent-encoded path aliases, missing
  identity, tenant substitution, current share/session expiry, revocation, and
  private response headers.
- Fresh `npm run audit:production` reports zero known production vulnerabilities for
  the exact lock. The package-lock SHA-256 is
  `a29e63ce73d1de9f40d54ebc615982686af6c53084c107f84e35d1316ba425d1`.
- `git diff --check` reported no whitespace errors (line-ending warnings only).
- Focused version-7 regressions cover full/package idempotency, handoff/share retry,
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
2. Record exact owner decisions for scope/design/copy, operator and contacts,
   commercial consequences, privacy/retention/deletion, media exclusion, providers,
   public origin, and residual risks.
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
