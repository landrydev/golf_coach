# F9 commercial function — configuration ready, external activation pending

**Recorded:** 2026-08-10  
**Scope:** `FUNC-090`, `FUNC-091`, and acceptance Scenario H  
**Candidate status:** **CONFIGURATION READY — EXTERNAL ACTIVATION PENDING**  
**Public production activation:** **INCOMPLETE**

This record covers the commercial function that can be implemented and verified
with local synthetic identities and Stripe-compatible test responses. It is not a
price approval, provider-account claim, public signup claim, live-charge test, or
release acceptance.

## Implemented behavior

- Every public acquisition call to action uses the canonical
  `/auth/login?return_to=%2Fapp` boundary. The landing page explains that the same
  provider entry handles sign-in and account creation only when the selected
  identity provider permits signup.
- `BILLING_COMMERCIAL_POLICY_JSON` is a strict, versioned, owner-supplied record for
  the exact Stripe mode, Price, CAD amount, interval, trial, cancellation,
  pause/resume, tax, refund, failed-payment, data-after-end, support, and approval
  reference. It has no application defaults.
- Checkout remains unavailable unless all of the following agree: Stripe secret-key
  test/live mode, Price allowlists, session lifetime, exact commercial policy,
  subscription access policy, and the exact `BILLING_CHECKOUT_ENABLED=true` flag.
- The current Checkout Price projection must match the configured Price ID, CAD
  amount, and billing interval before it can be applied.
- The billing page renders unavailable, incomplete, trialing, active, past-due,
  paused, canceled, unpaid, and ended states with truthful next-step guidance.
- Checkout cancellation and completion-return notices never claim payment success.
  A signed webhook or explicit read-only reconciliation remains authoritative.
- The real Portal route opens a server-owned synthetic Stripe test Portal session,
  persists a bounded audit event, and does not persist the hosted URL.
- The billing page and mobile Settings path distinguish the instructor's Roadmap
  SaaS subscription from golfer-facing coaching packages. Roadmap does not process
  or infer a coaching-package sale.
- An in-product checklist reports only safe readiness categories and the exact
  missing input classes; it never displays secrets or raw configuration.

## Scenario H evidence

| Required step | Evidence | Result |
|---|---|---|
| Start Checkout in provider test mode | `tests/billing-checkout-integration.test.mjs`; real `/api/billing/checkout` route with synthetic Stripe outbound service | Pass |
| Return canceled | Playwright CLI snapshot `output/playwright/candidate-f9-final/.playwright-cli/page-2026-08-11T02-30-36-400Z.yml` | Pass; states that billing did not change |
| Return without assuming success | Playwright CLI snapshot `output/playwright/candidate-f9-final/.playwright-cli/page-2026-08-11T02-31-04-573Z.yml` | Pass; signed webhook/read-only refresh remains authoritative |
| Apply signed test webhook | `tests/billing-webhook-integration.test.mjs` | Pass; durable projection and idempotent replay |
| Reconcile | `tests/billing-reconciliation.test.mjs` and related concurrency/recovery suites | Pass |
| Open Portal | `tests/commercial-billing-provider-flow.test.mjs` | Pass through real route with a synthetic Stripe test response |
| Exercise subscription states | `tests/commercial-billing-ui.test.mjs`, `tests/product-access.test.mjs`, and `tests/stripe-subscription.test.mjs` | Pass for all supported states and explicit entitlement allowlists |
| Keep coach-package payment separate | Billing-page browser snapshot plus `app/app/packages/page.tsx` | Pass |
| Demonstrate missing-input fail-closed state | Browser snapshots and `tests/billing-browser-recovery.test.mjs` | Pass; Checkout/Portal/refresh are unavailable without configuration |

Focused verification recorded during this workstream:

- `npm run typecheck` — pass.
- `npm run build` — pass.
- Commercial policy tests — 4/4 pass, zero skips/todos.
- Billing, Checkout, webhook, reconciliation, entitlement, and UI focused run —
  30/30 pass, zero skips/todos.
- Billing security, readiness, Stripe projection, and direct-configuration focused
  run — 36/36 pass, zero skips/todos.
- Portal success and public acquisition contracts — 3/3 pass, zero skips/todos.
- OIDC contract, hardening, lifecycle, public-host boundary, schema, and public
  acquisition focused run — 27/27 pass, zero skips/todos.
- Targeted ESLint — pass; the CSS file is outside the ESLint configuration and was
  reported as ignored, not as an error.

Frozen-source revision 9 repository-wide `npm run verify` subsequently exited 0
with 526/526 passing and 0 fail/cancel/skip/todo. Node reported `40865.1364ms`;
tool wall time was `55057ms`. The exact candidate-scoped log is
[`output/playwright/candidate-functional-final-20260811-r9/verify-functional-final-20260811-r9.log`](../../output/playwright/candidate-functional-final-20260811-r9/verify-functional-final-20260811-r9.log).
The source SHA-256 is
`bf27e9b45ff00401511bde350cca7319dbfd8ed89b8c0dbc434f52b19bc4a2f2`; the build
SHA-256 is
`6b1b5d298536c951e074c1e495f909bb626a62ef58ba1a8590bc23e3f3329d44`.
This exact-source automated result does not substitute for Playwright A–H,
owner/provider activation, or overall completion evidence. Revision 9 remains
acceptance-ineligible: A–H browser, visual, and PDF evidence is `not_recorded`
because Playwright daemon escalation was rejected by the Codex usage limit until
August 17. That is an execution-service blocker, not a product result.

Revision 8 remains historical and browser-ineligible because its browser run found
the upload-form snapshot and proxy-masking defects. Both are fixed and tested in
revision 9 source, but that does not rehabilitate revision 8. Revisions 1–7 remain
historical, acceptance-ineligible diagnostics. Revision 6 remains ineligible for
its recorded media-limit and golfer-directory blockers. Revision 5 remains
ineligible for its staged-golfer and expired-session defects, and revision 4 remains
ineligible for its CSP `blob:` media defect. Post-repair scratch replays are
diagnostic only. No Scenario A–H or overall acceptance is recorded, and no public
or live commercial activation is claimed.

## Playwright CLI evidence

The final F9-local browser pass used the repository's pinned Playwright CLI and the
real built application. No Playwright test specification was created.

- `output/playwright/candidate-f9-final/scenario-h-acquisition-390.png`
- `output/playwright/candidate-f9-final/scenario-h-billing-fail-closed-390.png`
- `output/playwright/candidate-f9-final/scenario-h-billing-fail-closed-1440.png`
- `output/playwright/candidate-f9-final/.playwright-cli/` accessibility snapshots
- Browser console review: 0 errors and 0 warnings.
- Mobile path exercised: Overview → Settings → Review Roadmap plan and billing.
- Visual review: no horizontal clipping; mobile commercial items reflow to one
  column; unavailable controls remain visibly disabled and explained.

The generated candidate manifest intentionally remains completion-ineligible because
it is an F9 workstream packet, not the whole-product exact-final-candidate packet.

## Exact external activation dependencies

The following inputs remain unavailable and must not be invented:

1. `OWNER-COMM-001`: exact Roadmap Solo CAD amount and interval, approved Stripe
   Product/Price, trial decision, cancellation effective date, pause/resume policy,
   tax treatment, refund rule, failed-payment access/data consequences,
   post-entitlement data period, support contact, approval reference, and review
   trigger.
2. `OWNER-PROD-001`: owner-controlled public domain, Cloudflare account and scoped
   credentials, selected OIDC provider/account, issuer/client/redirect/session
   policy, signup eligibility, provider privacy/data-location baseline, and public
   access scope.
3. Stripe provider activation: owner-controlled Stripe account, test and later live
   secret provisioning, signed webhook endpoint/secret, exact Product/Price, Portal
   behavior, tax configuration, and provider-side parity with the versioned local
   policy.
4. Exact subscription entitlement allowlists for trial, active, past-due, paused,
   canceled, unpaid, and ended states, plus the maximum provider-projection age.
5. Controlled hosted evidence for OIDC signup/sign-in, Stripe test Checkout,
   webhook delivery, reconciliation, Portal, pause/resume, cancellation, and failed
   payment on the exact deployed candidate.
6. Separate owner authorization and controlled evidence before any live charge or
   public availability claim.

Until these are supplied and verified, `BILLING_CHECKOUT_ENABLED=false` remains the
truthful production posture. No live charge, public signup, or public production
release is claimed by this record.
