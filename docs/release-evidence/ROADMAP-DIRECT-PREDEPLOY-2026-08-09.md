# Direct successor local pre-deployment evidence

**Date:** 2026-08-09  
**Status:** `PASS — LOCAL ENGINEERING EVIDENCE ONLY; PROVIDER AND RELEASE READINESS BLOCKED`  
**Candidate:** undeployed direct Cloudflare Worker/D1/R2 successor under `TECH-006`  
**Production release:** not authorized, deployed, or accepted

## Evidence boundary

This record covers the current working-tree implementation and local synthetic
verification of the direct-host successor. It does not prove a Cloudflare account,
resource binding, public domain, OIDC-provider configuration, production-data
migration, hosted operation, real-user suitability, billing activation, policy
approval, or Aaron's acceptance of an exact release.

No provider credential was requested, read, displayed, written, or used while
producing this record. No Cloudflare resource, DNS record, OIDC application, Stripe
resource, deployment, access policy, or external system was changed.

`OWNER-SEC-001` is already complete. The one authorized Sites operation on
2026-08-08 immediately invalidated the exposed prior bypass value without
displaying, persisting, or using its replacement. It was deliberately not repeated.
See the [value-safe rotation record](ROADMAP-SITES-V9-2026-08-08-sec001-rotation.md).

## Direct-host authentication and session boundary

The local direct-host candidate now implements a provider-neutral OpenID Connect
authorization-code flow with PKCE S256, state, nonce, exact issuer/audience checks,
RS256 signature verification, one-time transaction consumption, stable
issuer-plus-subject identity, and no automatic email-based account merge.

The session boundary uses HMAC-fingerprinted server-side sessions and secure
`__Host-` cookies. It enforces expiry, revocation, account identity-version fencing,
same-browser rotation, a deterministic ten-session active cap, scheduled retention
cleanup, and minimized sign-out audit events. Configuration, database, and provider
outages preserve retryable cookies, while definitive invalid/revoked/expired
sessions clear them. Authorization, token, and JWKS endpoints must use allowed
public HTTPS origins, cannot resolve to the application origin, and cannot redirect.
Untrusted browser identity headers are stripped before an authenticated internal
identity is injected.

The public landing, header, footer, and support sign-in actions are native top-level
links to `/auth/login?return_to=%2Fapp`; anonymous users are not sent directly to an
authenticated `/app` dead end.

This is implementation evidence, not provider evidence. No exact OIDC tenant,
application, client, secret, discovery document, callback registration, or hosted
identity journey has been approved or exercised.

## Local verification results

| Command | Observed result | Evidence limit |
|---|---|---|
| `npm run verify` | Lint, strict type checking, production build, release-artifact integrity, and **389/389 tests** passed with zero failures | Local automated evidence only |
| Release-artifact integrity within `npm run verify` | 53 files scanned; two expected server-credential source files and two expected compiled copies; zero unexpected credential or credential-path copies; no prerender binding; scheduler configured; custom log collection disabled; invocation and persistence logs configured disabled | Source/package inspection cannot prove provider enforcement |
| `npm run exercise:recovery:local` | Passed all 12 migrations through `0011_stormy_shard`; 33/33 application tables; two tenants; D1 snapshot 37,130 bytes with SHA-256 `9df4d3fb74f15f7cc4f4dcfa9abaea0a5409883e45207209c90c6a106d723f81`; restored OIDC transactions removed; restored instructor sessions revoked and identity-version fenced; billing, scheduler, and rate state normalized; exact built-Worker profile/package/workspace reads passed; three R2-compatible objects totaling 199 bytes; three negative integrity checks and subprocess isolation passed; wall clock 112,959 ms | Synthetic local recovery only; not hosted restore, RPO, RTO, or operator evidence |
| `npm run exercise:capacity:local` | Passed 54 measured requests across two synthetic tenants, maximum concurrency four, two- and 122-golfer account shapes, four author/edit/publish/share flows, and two exports; zero failures; p50 43.40 ms, p95 95.89 ms, max 96.48 ms; 44 status-200 and ten status-201 responses; built Worker SHA-256 `97a8ec9fadb9c9c6d4d66281b6bffcb444c7c3b29e5f8e85434f7f457f043ffc` | Synthetic local capacity only; not a hosted SLO or production-load result |
| `node scripts/preflight-direct-d1.mjs` | Passed the contained local preflight and refreshed the ignored hash-linked manifest | No network or provider operation is permitted by this command |

## Direct preflight manifest

The refreshed `.work/private-successor-preflight/manifest.json` is intentionally
ignored and value-safe. It records schema version 1 and operations-contract version
2. Its migration inventory contains 25 files: 12 numbered SQL migrations, 12 schema
snapshots, and the migration journal.

| Field | SHA-256 / result |
|---|---|
| Operations contract | `016caafccbdc23d9c8bea17ade54a2f2f340b067c45bc87017108132cc4490bd` |
| Migration inventory | `9da84b2836daaf920f28bfd7d9790f32e1fd8d814bf2bff96f4b26a1ee8647c6` |
| Readiness statement | `6f4c01f4ccbc382c9905f03cd8efded49cb96e3b919df1f3b6c8a1f00ff10e90` |
| Whole manifest | `fab4a49821d44273c68cc6739f11e6b98ee0a74d687f64f9c5dde1ae9f82a3e5` |
| Containment stage | `ready=true` |
| Local stage | `ready=true` |
| Provider stage | `ready=false` |
| Release stage | `ready=false` |

The direct configuration contract also requires exactly `nodejs_compat` and
`global_fetch_strictly_public`, a frozen write mode, owner-private access, disabled
Checkout, OIDC v1 with RS256 and `client_secret_basic`, the exact runtime-valid
consent registry, and secret delivery outside source/configuration files.

## Remaining production dependencies

`[REAL-WORLD VALIDATION REQUIRED]` The following dependencies remain open and may
not be converted into green local flags:

- authorized Cloudflare account, project, operator, budget, and domain credentials;
- pinned Worker, D1, R2, DNS/TLS, secret-store, log-retention, alerting, and scheduler
  configuration with least-privilege evidence;
- an approved OIDC provider tenant/application/client, callback configuration and
  secret, plus hosted discovery, authorization, token, JWKS, sign-in, sign-out,
  revocation, recovery, spoof-denial, and cross-device tests;
- an explicit legacy Sites-SIWC-to-OIDC account link/migration ceremony if Aaron
  chooses to preserve the prior owner identity or data; email similarity must not
  silently link identities;
- hosted migration, backup/restore, rollback/forward-fix, scheduler, alert delivery,
  privacy-safe logging, RPO/RTO, and controlled-journey evidence;
- owner-approved Stripe Product/Price, billing activation, tax/refund/cancel/failure
  consequences, and controlled provider transaction evidence; Checkout remains
  disabled;
- approved privacy, legal, retention, audit-retention, refund, and support policies;
- hosted supported-browser, keyboard, screen-reader, zoom/reflow, forced-colour,
  responsive, and real-user validation; and
- Aaron's dated acceptance of the exact deployed release.

The correct readiness result remains `releaseReady=false`. Local success narrows the
remaining work; it does not authorize a deployment or a public/customer release.
