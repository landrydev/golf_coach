# Roadmap production SaaS

Roadmap is a Canada-wide, self-serve SaaS for individual golf instructors. It
turns coach-authored assessment judgment into a private, coach-branded golfer
roadmap and living development journey. The SaaS subscription is separate from
the instructor's external lesson-package booking or payment service.

This directory is the production application authorized by `AUTH-005`. Product,
security, privacy, and operational decisions are documented in [`docs/`](docs/).

## Current private release

Sites version 2 is deployed owner-only at
<https://roadmap-golf-coaching.aar-landry.chatgpt.site> from release commit
`240c9ed9d70ced5f3ed51691f1dc0339224f24bd`. The outer Sites policy allows only
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
- Stripe-hosted Checkout and Customer Portal for the Roadmap SaaS subscription

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
- `STRIPE_SOLO_PRICE_ID`: the exact approved Stripe recurring Price
- `BILLING_CHECKOUT_ENABLED`: fail-closed `true` only after exact price/policy approval

Hosted secrets:

- `SHARE_TOKEN_PEPPER`: random, independent secret used for share-token HMACs
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
abuse-limit-pepper, and the selected instructor-access policy are ready. Health
exposes only access-policy readiness, never its mode, status list, digests,
pepper, or email.

The Worker applies this policy to instructor HTML, Vinext `.rsc` navigation,
and APIs. `owner_private` covers every `/app` route and every non-public API.
In `subscription_required`, billing, settings/profile, export, and privacy-data
request controls remain reachable; other instructor surfaces require the latest
signed-webhook subscription status to be explicitly allowed. Health, Stripe's
signed webhook, and golfer capability endpoints remain separate.

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
