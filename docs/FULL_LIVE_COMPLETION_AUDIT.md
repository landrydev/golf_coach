# Full live V1 completion audit

**Opened:** 2026-08-08  
**Authority:** `AUTH-005`  
**Status:** active completion record; not a launch approval or completion certificate  
**Companion records:** [requirements traceability](REQUIREMENTS_TRACEABILITY.md), [release evidence](RELEASE_EVIDENCE.md), [owner decisions required](OWNER_RELEASE_DECISIONS_REQUIRED.md)

## Current conclusion

The retired repository gates do not restrict implementation. The bounded V1 is
implemented as a production Worker and exact commit
`e2a6e344d0cccdb73cde4697beca32ad02743f79` is deployed privately as owner-only
Sites version 6 with environment revision 8. The full-live goal is **not complete**
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
| Instructor and golfer journeys | Resumable minimum-first adult golfer setup, three- or four-phase coach-authored roadmap, profile/packages, preview/publication readiness, scoped share session, living-plan updates, responses, six data-request types, and export | Automated production-bundle evidence passed |
| Tenant and capability security | Server-derived tenant, D1 ownership constraints, canonical route guard, missing-identity denial, HMAC-only verifier/session storage, expiry/revocation, rate limits, CSRF, private headers | Automated evidence passed; hosted SIWC spoof/recovery tests remain |
| Concurrency and lifecycle integrity | Revision CAS, staged-save idempotency, single publish winner, profile-change publication/session invalidation, idempotent revoke/session close, current-publication response guard, and atomic data-request deduplication | Automated evidence passed; formal external concurrency/load assessment remains |
| SaaS billing | Server-controlled Checkout/Portal, durable single-attempt idempotency, account-operation leases, provider-authoritative expiry, durable reconciliation targets, pending-sync blocking, signed-webhook leases/replay/race healing, immutable customer ownership, explicit Price/entitlement/freshness policy, scheduled GET-only recovery with fairness/backoff/dead-letter handling, and stale-provider-read fencing | Automated local D1 evidence passed; Checkout remains disabled because exact commercial configuration, public Stripe webhook ingress, and controlled live reconciliation are absent |
| Privacy lifecycle | Tenant export, correction through product edits, share revocation, truthful deletion-review status and retry deduplication | Destructive fulfillment, retention schedule, qualified review, and backup expiry remain unresolved |
| Accessibility and responsive behavior | Semantic/rendered checks and reusable focusable form-error summaries with first-invalid-control focus; the recorded 1440/390/320 CSS-pixel captures are historical version-5 evidence only | Exact version-6 1440/390/320 captures remain outstanding, along with manual keyboard, screen reader, forced-colour, zoom, reduced-motion, and supported-browser acceptance |
| Deployment and observability | Exact version 6 deployed owner-only from the recorded commit/archive at environment revision 8; signed-out `/`, `/app`, and `/api/operations/health` each returned `401`; the immediate error-only Worker-log sample contained zero events; the version-6 renderer produced outcome-`ok` `200` responses for `/` and `/.rsc` plus an expected non-owner `403` for `/app.rsc`; a non-error 20-minute query showed only those fetches and no scheduled event | Deployment, renderer, and signed-out containment passed; authenticated owner smoke, hosted scheduler invocation, operational-health sampling, and alert-delivery evidence remain pending |
| Recoverability and operations | Runbooks document release, incident, D1 Time Travel, R2 limitations, rollback, support, and billing reconciliation; deterministic isolated D1/R2-compatible synthetic export/restore passed | Named owners, alert/cost exercises, hosted D1/R2 restore, rollback, and incident drills remain |
| Commercial and public operation | `[PRICING HYPOTHESIS — REQUIRES VALIDATION]` and `[REAL-WORLD VALIDATION REQUIRED]` remain attached accurately | Exact offer, Stripe Price, tax/refund/failure/cancel/pause rules, domain, contacts, and policies require Aaron/external input |
| Acceptance | No exact-release acceptance decision is recorded | `[OWNER INPUT REQUIRED]` |

## Current automated candidate evidence

- `npm run verify`: lint, strict TypeScript, production build, and 132/132 tests
  passed with zero failures, skips, or todos.
- `npm run db:generate`: schema, journal, all eight migrations, and snapshots agree
  across 31 tables with no migration drift.
- `npm run verify:release-integrity`: 180 text files produced zero secret findings;
  Business Plan V1 remained unchanged and the release lock was pinned.
- `npm run exercise:recovery:local`: two synthetic tenants and three private
  synthetic objects matched after isolated D1/R2-compatible logical restore; the
  Wrangler child-process probe inherited no secret-shaped parent variables.
- The production Worker test matrix covers declared mutation handlers, every
  discovered instructor HTML/RSC/API path, percent-encoded path aliases, missing
  identity, tenant substitution, current share/session expiry, revocation, and
  private response headers.
- Fresh `npm audit --omit=dev` reports zero known production vulnerabilities for
  the exact lock. The package-lock SHA-256 is
  `a29e63ce73d1de9f40d54ebc615982686af6c53084c107f84e35d1316ba425d1`.

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
