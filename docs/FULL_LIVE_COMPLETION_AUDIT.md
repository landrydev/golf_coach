# Full live V1 completion audit

**Opened:** 2026-08-08  
**Authority:** `AUTH-005`  
**Status:** active completion record; not a launch approval or completion certificate  
**Companion records:** [requirements traceability](REQUIREMENTS_TRACEABILITY.md), [release evidence](RELEASE_EVIDENCE.md), [owner decisions required](OWNER_RELEASE_DECISIONS_REQUIRED.md)

## Current conclusion

The retired repository gates do not restrict implementation. The bounded V1 is
implemented as a production Worker and exact commit
`8eed9e1395e18fee8e1e61f4344abcd5a35f93b5` is deployed privately as owner-only
Sites version 3 with environment revision 5. The full-live goal is **not complete**
because authenticated hosted acceptance is still absent, the public
commercial/policy inputs are unresolved, controlled real operations and recovery
exercises are absent, and Aaron has not accepted an exact release.

Those are evidence, operating, and owner-decision dependencies. They are not a
reinstated design gate and they do not invalidate completed engineering evidence.

## Phase and definition-of-done status

| Area | Current evidence | Status |
|---|---|---|
| Authority and source precedence | `AUTH-005` authorizes production implementation; Business Plan V2 remains authoritative and Business Plan V1 remains unchanged | Implemented and preserved |
| Bounded architecture | Sites/Vinext Worker, SIWC boundary, D1, private R2 binding, Stripe-hosted SaaS billing boundary, no AI or native coach-package payment | Selected under `AUTH-005`; provider suitability still needs live evidence |
| Instructor and golfer journeys | Profile, packages, adult golfer, coach-authored roadmap, preview/publish, scoped share session, living-plan updates, responses, export, and deletion-review intake | Automated production-bundle evidence passed |
| Tenant and capability security | Server-derived tenant, D1 ownership constraints, canonical route guard, missing-identity denial, HMAC-only verifier/session storage, expiry/revocation, rate limits, CSRF, private headers | Automated evidence passed; hosted SIWC spoof/recovery tests remain |
| Concurrency and lifecycle integrity | Revision CAS, single publish winner, idempotent revoke/session close, current-publication response guard, atomic deletion-request deduplication | Automated evidence passed; formal external concurrency/load assessment remains |
| SaaS billing | Server-controlled Checkout/Portal, signed webhook, local projection, bounded provider timeout, event processing lease | Checkout disabled; public billing blocked by policy/config and unresolved duplicate-session/recovery/customer-ownership findings |
| Privacy lifecycle | Tenant export, correction through product edits, share revocation, truthful deletion-review status and retry deduplication | Destructive fulfillment, retention schedule, qualified review, and backup expiry remain unresolved |
| Accessibility and responsive behavior | Semantic/rendered checks and recorded 1440/390/320 CSS-pixel local visual evidence | Manual keyboard, screen reader, forced-colour, zoom, reduced-motion, and supported-browser acceptance remain |
| Deployment and observability | Exact version 3 deployed owner-only; the immediate error-only and wider log samples were empty | Deployment passed; authenticated hosted smoke and meaningful invocation logs remain pending |
| Recoverability and operations | Runbooks document release, incident, D1 Time Travel, R2 limitations, rollback, support, and billing reconciliation | Named owners, alert/cost exercises, D1/R2 restore, rollback, and incident drills remain |
| Commercial and public operation | `[PRICING HYPOTHESIS — REQUIRES VALIDATION]` and `[REAL-WORLD VALIDATION REQUIRED]` remain attached accurately | Exact offer, Stripe Price, tax/refund/failure/cancel/pause rules, domain, contacts, and policies require Aaron/external input |
| Acceptance | No exact-release acceptance decision is recorded | `[OWNER INPUT REQUIRED]` |

## Current automated candidate evidence

- `npm run verify`: lint, strict TypeScript, production build, and 47/47 tests
  passed with zero failures, skips, or todos.
- `npx drizzle-kit check`: schema, journal, snapshots, and migration configuration
  passed.
- The production Worker test matrix covers 19 declared mutation handlers, every
  discovered instructor HTML/RSC/API path, percent-encoded path aliases, missing
  identity, tenant substitution, current share/session expiry, revocation, and
  private response headers.
- The package lock SHA-256 remains
  `73E540DD099306121351E884E195C86203D61BFB9775C5A4D002CBD6CCAC2757`,
  identical to the previously recorded zero-advisory audit snapshot. A fresh live
  npm advisory query was attempted on 2026-08-08 but could not run because external
  command approval capacity was unavailable; no newer zero-advisory claim is made.

Automated checks do not prove legal compliance, public demand, public-auth
suitability, accessibility conformance, operational recoverability, or live-user
success.

## Safe release constraints

Until the linked owner decisions and exercises are complete:

- keep the Sites access policy owner-only;
- configure the application-level `owner_private` HMAC allowlist before deploying
  the current candidate, or it will intentionally fail closed;
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
3. Remediate and test the public-billing lifecycle before enabling Checkout, including
   pending-session duplication, webhook crash recovery/reprocessing, durable Stripe
   customer ownership, accepted entitlement Price IDs, and freshness/reconciliation.
4. Complete manual accessibility/browser review, controlled D1/R2 restore and
   rollback, monitoring/alert/cost/support/incident exercises, qualified policy
   review, and authorized real instructor/golfer journeys.
5. Have Aaron accept the exact release with date, operating scope, configuration,
   policies, named owners, residual risks, and stop/revisit triggers.

The goal may be marked complete only after every applicable item above is evidenced
or receives an explicit, durable, accountable risk disposition consistent with the
goal brief.
