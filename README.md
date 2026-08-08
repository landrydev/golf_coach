# Roadmap production SaaS

Roadmap is a Canada-wide, self-serve SaaS for individual golf instructors. It
turns coach-authored assessment judgment into a private, coach-branded golfer
roadmap and living development journey. The SaaS subscription is separate from
the instructor's external lesson-package booking or payment service.

This directory is the production application authorized by `AUTH-005`. Product,
security, privacy, and operational decisions are documented in [`docs/`](docs/).

## Current private release

Sites version 11 is deployed owner-only at
<https://roadmap-golf-coaching.aar-landry.chatgpt.site> from release commit
`44670a64498779cf747914b4465380916a939301`, saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_4c49cdec72bc8191aeece01f5689e51a`,
deployment `appgdep_6a77b01714b881918245bb5248349e0d`, and environment revision 13.
The deployment succeeded with provider `updated_at`
`2026-08-08T22:40:07.742084+00:00`.
The outer Sites policy allows only the owner; Stripe Checkout remains disabled. This is a production deployment, not
a public launch or accepted real-user release. Exact evidence and unresolved
operating dependencies are recorded in
[`docs/RELEASE_EVIDENCE.md`](docs/RELEASE_EVIDENCE.md).

The version-11 release archive has gzip SHA-256
`d88be6513bc58afd057d4a3fb3a6d64b744f7a5c359731ec9fc693a788e1fa0e`,
is 2,966,073 bytes, and contains 61 entries/49 files and all ten migrations. Its saved provider
package has content hash
`sha256:d717035871790252548e7fff4e1192e590b73b7cabfe3f4c011d65ffe4493daa`
across 49 files and 6,737,920 bytes. Four fresh no-credential probes remained contained at the
owner-only policy with `401`, `no-store`, and `no-referrer`.

The latest exact application-runtime local synthetic browser evidence records nine Chrome 151 captures of
the landing page, instructor workspace, and golfer plan at 320, 390, and 1440 CSS
pixels, with no root/body horizontal overflow. See the
[`ROADMAP-SITES-V9-2026-08-08` responsive evidence](docs/release-evidence/ROADMAP-SITES-V9-2026-08-08-responsive-evidence.json).
The version-9 captures remain a renderer/layout source-equivalent baseline for the
unchanged rendered UI and CSS carried into version 11. They are not evidence of
version-11 CSP, headers, authentication, hosted runtime, browser interaction, or
security behavior, and they are not relabelled as exact-version-11 hosted or manual
evidence. Version 11 replaces the prior inline-script allowance with per-response
script nonces, but no supported signed-in hosted browser was available to retest that
deployed behavior. `SEC-002` is therefore **REMEDIATED — HOSTED RETEST PENDING**,
not closed.
Those captures use the local production Worker bundle, local compatible D1, and
synthetic adults-only fixtures. They are not hosted journey evidence, manual
accessibility review, assistive-technology evidence, or owner acceptance.

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
- `DATA_REQUEST_OPERATOR_EMAIL_DIGESTS`: nonempty comma-separated, unique
  HMAC-SHA-256 digests of trimmed, lowercased operator SIWC emails; never
  plaintext emails
- `CONSENT_POLICY_REGISTRY_JSON`: strict owner-supplied mapping of approved
  purpose versions, exact descriptions, and permitted account/golfer subject
  types. Missing, invalid, stale, or unlisted configuration grants nothing;
  configuration records choices but does not enable optional processing. The
  V1 fails closed unless `golfer_record` is configured for `account` subjects
  and `roadmap_sharing` is configured for `golfer` subjects; real processing
  still requires a matching current grant, and exact wording changes require a
  new version

Hosted secrets:

- `SHARE_TOKEN_PEPPER`: random, independent secret of at least 32 characters
  used for share-token HMACs
- `ABUSE_LIMIT_PEPPER`: separate random secret used for non-reversible abuse-counter subject HMACs
- `OWNER_PRIVATE_ACCESS_PEPPER`: third independent random secret, at least 32
  characters, used only for the owner-private email allowlist
- `DATA_REQUEST_OPERATOR_ACCESS_PEPPER`: separate random secret of at least 32
  characters, used only for the privacy-operator email allowlist
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Bindings declared in `.openai/hosting.json`:

- `DB`: D1 database
- `MEDIA`: private R2 bucket

Checkout stays unavailable when Stripe configuration is absent. Production
share-token hashing fails closed when its pepper is absent. Public `/api/health`
is an intentionally shallow liveness probe: it reports only `live` plus the
immutable release identifier and does not touch D1 or R2. The owner-only
`/api/operations/health` endpoint performs the deeper D1, R2, origin,
share-token-pepper, abuse-limit-pepper, explicit Checkout-policy, selected
instructor-access-policy, required consent-policy coverage, privacy-operator
access configuration, and scheduler-readiness checks. Missing or invalid
consent or operator configuration degrades readiness. The response exposes
only safe boolean statuses, never policy text or versions, an access mode,
allowlist, digest, pepper, or email.

The Worker applies this policy to instructor HTML, Vinext `.rsc` navigation,
and APIs. `owner_private` covers every `/app` route and every non-public API.
In `subscription_required`, billing, settings/profile, export, privacy-data
request, and consent current-state/withdrawal controls remain reachable; other instructor surfaces require a fresh
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
Version 11's nonce-based CSP is a security/behavior change, so a version-11-to-10
rollback would reintroduce the prior inline-script policy and must not be classified
as a no-change (`N`) rollback.

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
