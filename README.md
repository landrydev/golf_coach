# Roadmap production SaaS

Roadmap is a Canada-wide, self-serve SaaS for individual golf instructors. It
turns coach-authored assessment judgment into a private, coach-branded golfer
roadmap and living development journey. The SaaS subscription is separate from
the instructor's external lesson-package booking or payment service.

This directory is the production application authorized by `AUTH-005`. Product,
security, privacy, and operational decisions are documented in [`docs/`](docs/).

## Current private release

Sites version 5 is deployed owner-only at
<https://roadmap-golf-coaching.aar-landry.chatgpt.site> from release commit
`ef258da53e15b2d516e22c65b24a017965f34dd0`. The outer Sites policy allows only
the owner; Stripe Checkout remains disabled. This is a production deployment, not
a public launch or accepted real-user release. Exact evidence and unresolved
operating dependencies are recorded in
[`docs/RELEASE_EVIDENCE.md`](docs/RELEASE_EVIDENCE.md).

## Runtime

- Vinext/React on OpenAI Sites and Cloudflare Workers
- Cloudflare D1 for tenant-owned structured records
- private Cloudflare R2 binding for approved future media/export objects
- dispatch-owned Sign in with ChatGPT for instructor identity
- 256-bit, HMAC-fingerprinted, revision-scoped golfer capability links
- Stripe-hosted Checkout and Customer Portal for the Roadmap SaaS subscription,
  with signed-webhook projection, authenticated read-only account refresh, and
  a packaged, locally exercised scheduled-recovery handler for existing provider-backed work

No application password, card number, raw Stripe webhook payload, or raw share
token is stored in D1. Media upload remains disabled until its exact consent,
format, scanning, and retention policy is approved.

## Local setup

Requirements: Node.js 22.13 or later.

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Development uses the synthetic identity in `.env.local`. Production ignores
that fallback and requires the dispatch-injected SIWC identity headers.

The local Cloudflare plugin provides project-local D1/R2 state under
`.wrangler/`. Never use customer data in local development or tests.

## Required configuration

Public, non-secret variables:

- `APP_URL`: exact HTTPS origin, without a path or trailing slash
- `RELEASE_ID`: immutable release label used by health and release evidence
- `INSTRUCTOR_ACCESS_MODE`: exactly `owner_private` or `subscription_required`
- `OWNER_PRIVATE_EMAIL_DIGESTS`: comma-separated HMAC-SHA-256 digests of
  trimmed, lowercased owner SIWC emails; never plaintext emails
- `SUBSCRIPTION_ACCESS_STATUSES`: explicit comma-separated Stripe statuses that
  may use core product routes in `subscription_required` mode
- `STRIPE_CHECKOUT_PRICE_ID`: the sole Price for new Checkout Sessions
- `STRIPE_RECOGNIZED_PRICE_IDS`: current and historical Prices whose provider
  events may update the local projection
- `SUBSCRIPTION_ENTITLEMENT_PRICE_IDS`: explicit recognized-Price subset that
  may grant core product access
- `SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS`: required maximum provider
  projection age in subscription mode, from 900 through 31536000 seconds; the
  application selects no default and schedules refresh before that boundary
- `STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS`: explicit Checkout lifetime from
  1860 through 86400 seconds; the application selects no default
- `BILLING_CHECKOUT_ENABLED`: fail-closed `true` only after exact price/policy approval

Hosted secrets:

- `SHARE_TOKEN_PEPPER`: random, independent secret of at least 32 characters
  used for share-token HMACs
- `ABUSE_LIMIT_PEPPER`: separate random secret used for non-reversible abuse-counter subject HMACs
- `OWNER_PRIVATE_ACCESS_PEPPER`: third independent random secret, at least 32
  characters, used only for the owner-private email allowlist
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Bindings declared in `.openai/hosting.json`:

- `DB`: D1 database
- `MEDIA`: private R2 bucket

Checkout stays unavailable when Stripe configuration is absent. Production
share-token hashing fails closed when its pepper is absent. `/api/health`
returns `503 degraded` until D1, R2, origin, share-token-pepper,
abuse-limit-pepper, the explicit Checkout enable/disable policy, and the selected
instructor-access policy are ready. Health exposes only access-policy readiness,
never its mode, status list, digests, pepper, or email.

The Worker applies this policy to instructor HTML, Vinext `.rsc` navigation,
and APIs. `owner_private` covers every `/app` route and every non-public API.
In `subscription_required`, billing, settings/profile, export, and privacy-data
request controls remain reachable; other instructor surfaces require a fresh
provider-authoritative subscription status and Price to be explicitly allowed.
That projection can be applied from a signed webhook or an explicit, read-only
refresh of the authenticated account's existing Stripe references. A packaged five-minute
scheduled handler retries failed or abandoned provider-backed reconciliation with
bounded backoff and no Stripe object creation. It records a privacy-safe D1 heartbeat
for owner-operator health checks and safely performs no provider work when Stripe
credentials or the complete billing policy are absent. The handler is locally exercised;
hosted Sites trigger provisioning/invocation remains unproven and must not be relied on
for paid operation until independently observed. Health, Stripe's signed webhook, and
golfer capability endpoints remain separate.

## Verification

```powershell
npm run verify
npm run audit:production
```

`verify` runs ESLint, strict TypeScript, a clean production build, rendered
route tests, security-header checks, schema/migration parity, tenancy
constraints, validation helpers, and capability-link controls. A release also
requires the production-like journey, accessibility, billing test-mode,
backup/restore, alert, and live smoke evidence described in
[`docs/OPERATIONS.md`](docs/OPERATIONS.md).

Run `npm run verify` against the exact source commit and record its emitted test
count with the release; this README intentionally does not freeze a count that
can become stale as coverage grows. Exact-release automated, hosted, and
still-missing manual/operational evidence is recorded in
[`docs/RELEASE_EVIDENCE.md`](docs/RELEASE_EVIDENCE.md).

## Database migrations

Schema source lives in `db/schema.ts`; committed forward migrations live in
`drizzle/`. Generate a new migration with `npm run db:generate`, inspect it,
test it against the previous schema and representative synthetic edge cases,
and never rewrite an already-applied migration.

Application rollback and data recovery are separate. Follow the release,
migration, rollback, backup, restore, incident, and Stripe reconciliation
procedures in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## Production boundaries

- adults only in V1
- one independent instructor per account; no teams or facilities
- no AI diagnosis, coaching, roadmap generation, or outcome prediction
- no native coach-package booking, purchase, payment, or sale attribution
- no marketplace, CRM, messaging, or video-analysis integration
- every material plan edit withdraws publication and revokes active access
- public sample data is synthetic; tests and local fixtures must stay synthetic

Pricing, tax/refund/failure consequences, retention periods, qualified legal
review, live Stripe credentials, public domain, restore evidence, operational
owners, and Aaron's exact-release acceptance remain truthful external release
dependencies where the repository says they are unresolved.
