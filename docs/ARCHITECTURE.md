# Production SaaS Architecture

**Document status:** Selected implementation architecture under `AUTH-005`; not evidence of deployment, security, compliance, or production readiness
**Scope:** Bounded Canada-wide self-serve V1 for one independent golf instructor and the instructor's golfers
**Last updated:** 2026-08-07
**Related:** [Security and Privacy](SECURITY_PRIVACY.md), [Operations](OPERATIONS.md), [Requirements Traceability](REQUIREMENTS_TRACEABILITY.md)

## Authority and decision language

`[SUPPORTED BY BUSINESS PLAN V2]` The product is a Canada-wide, self-serve B2B SaaS product for individual independent golf instructors. It helps an instructor turn coach-owned assessment information into a personalized, coach-branded roadmap and player journey. It preserves the instructor's judgment and existing booking, package-payment, communication, video, and analysis tools.

`AUTH-005` authorizes production architecture selection and implementation for that bounded V1. In this document, **selected** means an implementation decision made under that authority. It does not mean the provider account is provisioned, the behavior is verified, or Aaron has accepted a live release.

The historical design gate is not an active implementation gate. Unresolved matters named here are evidence or operational dependencies. Work may continue around them, but affected real operations must not be represented as working until direct evidence exists.

## Bounded V1 system

The production system has four user-facing surfaces:

1. a public acquisition and realistic synthetic-sample surface;
2. a signed-in instructor workspace for identity, package setup, golfer records, roadmap authoring, preview, publishing, lifecycle updates, and subscription management;
3. a private golfer experience reached through a revocable capability link; and
4. hosted Stripe Checkout and Customer Portal surfaces for the instructor's SaaS subscription only.

The golfer's purchase, booking, or contact action remains an instructor-owned external link. It is not processed by this SaaS and must never be confused with the instructor's Stripe subscription.

```mermaid
flowchart LR
    Public[Public visitor] --> Sites[OpenAI Sites / Cloudflare Worker]
    Instructor[Instructor] -->|dispatch-owned SIWC| Sites
    Golfer[Golfer] -->|revocable capability| Sites
    Sites --> D1[(Cloudflare D1)]
    Sites --> R2[(Private Cloudflare R2)]
    Sites -->|Checkout / Portal request| Stripe[Stripe hosted billing]
    Stripe -->|signed webhook| Sites
    Sites --> Audit[(First-party audit events)]
    Sites --> Logs[Sites operational logs]
    Golfer -->|explicit external handoff| CoachLink[Instructor booking / purchase / contact]
```

## Selected stack

| Decision | Selection | V1 responsibility | Important limitation or revisit trigger |
|---|---|---|---|
| `ARCH-001` application and hosting | OpenAI Sites, vinext, React, TypeScript, and a Cloudflare Worker runtime | Server-rendered and interactive public, instructor, golfer, and route-handler surfaces; static assets; deployment wiring | The runtime must remain Worker-compatible. A live Sites release and public-domain configuration are not yet evidenced. |
| `ARCH-002` structured persistence | Cloudflare D1, accessed through server-side data helpers and versioned migrations | Instructor accounts, tenant-owned product records, roadmap state, share-capability records, subscription projection, idempotency records, and audit events | Migration, backup, restore, capacity, and production-binding behavior require direct environment evidence. |
| `ARCH-003` object storage | Private Cloudflare R2 | Approved coach branding, optional golfer evidence/media, generated exports, and other blobs; D1 retains metadata and ownership | Media policy, limits, validation/scanning behavior, retention, and restore handling remain unresolved. R2 is not a public file origin. |
| `ARCH-004` instructor identity | Dispatch-owned Sign in with ChatGPT (SIWC); no app-owned password database | Instructor authentication and server-side attribution of account actions | `[REAL-WORLD VALIDATION REQUIRED]` Confirm that SIWC is supported and appropriate for public Canada-wide instructor sign-in, recovery, account continuity, and the intended Sites access policy. |
| `ARCH-005` golfer access | High-entropy, revocable capability links whose verifier is hashed at rest | Private read access to one published golfer experience without requiring a golfer account | A bearer capability can be forwarded by its recipient. Copy, consent, expiry, revocation, and live logging behavior need policy and acceptance evidence. |
| `ARCH-006` SaaS billing | Stripe Checkout, Customer Portal, and signed webhooks, planned behind server routes | Instructor subscription creation and self-service billing/account management | Production Stripe credentials, the exact approved Stripe Price, tax/refund/failure policy, webhook endpoint, and controlled live transaction evidence are unresolved. |
| `ARCH-007` observability | First-party structured audit events plus Sites operational logs | Security/account/data-change traceability and runtime diagnosis | Sites log access, retention, redaction, alert routing, and correlation must be demonstrated in the deployed environment. |
| `ARCH-008` delivery | Instructor copies a private golfer link and uses an existing communication channel | Completes the share operation without introducing an outbound messaging provider | The app records publish/link lifecycle, not delivery or message receipt. No success copy may imply an email or message was sent. |

The package lockfile is the version authority for implementation dependencies. Documentation does not promise compatibility beyond the exact built and tested release.

## Component responsibilities

### Sites application and Worker

- Render public pages without requiring authentication.
- Require SIWC on all instructor-owned reads and writes.
- Perform every authorization decision on the server.
- Validate inputs and output-encode coach-authored content.
- Coordinate D1 transactions and private R2 access.
- Exchange golfer capabilities for a scoped session.
- Create Stripe Checkout and Portal sessions for the authenticated instructor.
- Verify and idempotently process Stripe webhooks.
- Emit minimal first-party audit events and privacy-safe operational logs.
- Apply security headers, request-size limits, rate limits, and safe error responses.

### D1

D1 is the authoritative product-state store. The logical domains are:

| Domain | Representative records | Ownership rule |
|---|---|---|
| Identity | instructor, external identity mapping, account state | An app-generated immutable instructor ID owns tenant data. A provider claim is an identity mapping, not a client-supplied tenant key. |
| Coach setup | coach profile, bounded brand settings, external contact/action link | Exactly one instructor tenant in V1. |
| Package | coach-owned package name, purpose, price/currency, terms, external action | Instructor-authored and explicitly confirmed before publication. |
| Golfer | minimal adult golfer identifier and goal/context | Belongs to one instructor; never queried by a client-provided instructor ID. |
| Roadmap | assessment, strengths, barriers, phases, active phase, lessons, practice, evidence, phase review, publication version | Draft and published versions remain distinguishable. Coach judgment is never generated autonomously. |
| Share access | share ID, hashed verifier, status, issued/revoked/expiry metadata, publication version | Grants only the documented golfer read scope for one published roadmap. |
| Abuse control | scoped HMAC subject digest, fixed-window boundary, atomic request count | Short-lived operational rows contain no raw network address, capability, account ID, email, or request content. |
| Billing | Stripe customer/subscription identifiers, processed event IDs, entitlement projection | SaaS subscription only; webhook-derived state is authoritative for billing events. |
| Audit | timestamp, actor class/ID, action, target type/ID, result, request ID, minimal change metadata | Append-oriented and not exposed as ordinary tenant content. |

Every tenant-owned row carries an `instructor_id` or is reachable only through a foreign-key path that does. Server repositories take the authenticated instructor context as a required argument. Client input may name a resource but may not choose its tenant owner.

### R2

- Store bytes under opaque, non-user-controlled keys scoped to an instructor and asset record.
- Keep original filename, content type, byte length, checksum, ownership, consent/status, and lifecycle metadata in D1.
- Serve private objects only through an authorized Worker response; do not expose the bucket or permanent public object URLs.
- Treat uploads as quarantined until type, size, and any approved safety checks pass.
- Delete or retain objects only through the same policy-driven lifecycle as their D1 metadata.
- Keep optional media non-blocking; a complete text-only roadmap remains supported.

### Stripe

- Checkout and Portal sessions are created only by authenticated server routes.
- The instructor's immutable account ID is carried in Stripe metadata where appropriate; price and amount are never trusted from the browser.
- Webhook signatures are checked against the raw request body before parsing or mutation.
- Stripe event IDs are unique in D1 so replay is harmless.
- Subscription state is projected from accepted events; browser redirects are not treated as payment proof.
- Access changes caused by failure, cancellation, or pause follow approved policy and are auditable.
- Coach-package prices and links never use the SaaS Stripe account.

## Identity and authorization model

### Instructor

Dispatch-owned SIWC is the selected identity mechanism. The application reads identity only from trusted request headers supplied by the Sites dispatch layer and never from browser-submitted headers or form fields. The app creates its own immutable `instructor_id` and maps the SIWC identity to it.

The current helper exposes email and an optional display name. Email must be normalized for lookup but should not become a foreign key. If the platform provides a stable opaque subject in the supported public-auth contract, that subject should become the preferred external identity key through a migration; the internal `instructor_id` remains stable.

SIWC authenticates a user. It does not by itself establish a business entitlement. The server also checks account state and Stripe-derived entitlement for paid-only writes. Public content and the golfer capability flow do not use SIWC.

`[REAL-WORLD VALIDATION REQUIRED]` Public self-serve suitability, sign-in UX, account recovery, identity-claim stability, sign-out, cross-device behavior, and support escalation must be verified with the exact hosted configuration. This is an unresolved evidence dependency, not a return to the retired design gate.

### Golfer capability exchange

The selected capability pattern minimizes token exposure:

1. Generate at least 32 random bytes with a cryptographically secure generator.
2. Put the raw verifier in the URL fragment of a link shaped like `/r#token={verifier}`. The route contains no public share-record identifier, and fragments are not sent in the initial HTTP request.
3. First-party browser code sends the verifier in a POST body to a same-origin exchange endpoint, then clears the fragment with `history.replaceState`.
4. The server derives an HMAC-SHA-256 fingerprint using a dedicated secret pepper and resolves the active D1 share-link record by that fingerprint.
5. On success, issue a short-lived, `Secure`, `HttpOnly`, `SameSite=Lax` scoped session cookie that cannot outlive the share capability, then navigate to a token-free golfer URL.
6. Revoke or rotate by changing the share record; the raw verifier is never stored, logged, placed in analytics, or returned after creation.

Before exchange, the public share route reveals no golfer, coach, roadmap, or existence detail. Invalid, expired, and revoked capabilities return the same neutral response class. Rate limiting applies to exchange attempts. The golfer session is read-only unless a later explicit decision defines a narrowly scoped correction/request action.

If fragment exchange is incompatible with the supported browser or accessibility matrix, the replacement must still keep the verifier out of query strings, referrers, analytics, and routine logs. A path-token fallback is not accepted without deployed log-redaction evidence.

## Critical flows

### Instructor acquisition and activation

```text
Public explanation and synthetic sample
→ SIWC sign-in
→ account and coach identity
→ package and external action
→ adult golfer and goal
→ coach-owned assessment, barriers, and phases
→ exact golfer preview
→ coach confirmation
→ publish and create capability
→ instructor copies link
→ minimal return state
```

Draft save is not publication. Link creation is not message delivery. A golfer opening a link is not a package sale. These states must remain separately named in data, UI, audit events, and tests.

### Golfer experience

After capability exchange, the golfer sees the approved coach-authored experience in a coherent narrative: Now, Goal, Roadmap, Lessons, Practice, Evidence, and Phase Review. A missing optional asset or data point renders an honest text-only state. The package action warns before leaving for the instructor's external destination and keeps ask, wait, decline, reassessment, or independent-practice alternatives visible where applicable.

The private Milestone/referral concept is not part of the bounded production V1 unless a later explicit scope decision includes it. Native messaging, booking, and coach-package payment remain excluded.

### SaaS subscription

```text
Authenticated instructor
→ server-created Checkout session using configured Stripe Price
→ hosted Checkout
→ signed webhook accepted and recorded idempotently
→ entitlement projection updated
→ instructor sees accurate account state
→ server-created Customer Portal session for supported changes
```

`[PRICING HYPOTHESIS — REQUIRES VALIDATION]` No amount in planning material is approved merely because a route can accept a Stripe Price ID. Production configuration must point to the exact owner-approved product/price and the UI/legal copy must match it.

### Publish and update consistency

- Authoring writes update a draft, not the published golfer view.
- Publication creates an immutable publication version or a versioned snapshot reference.
- A live capability resolves to a specific approved publication version until the instructor intentionally publishes an update.
- An update either atomically advances the share to the new version or leaves the prior version readable; partial publication is not exposed.
- Revocation takes precedence over cached content and sessions.
- R2 objects referenced by a published version are not deleted until no retained version needs them and policy permits deletion.

## Environment and configuration boundaries

| Environment | Data rule | External effects | Evidence expectation |
|---|---|---|---|
| Local | Synthetic or generated test data only | Stripe test mode or fakes; no customer messages | Build, unit/integration tests, migrations, and developer checks |
| Preview | Approved non-production test accounts and non-sensitive fixtures | Stripe test mode; no production package links unless explicitly controlled | Production-like journey, authorization, accessibility, and failure-path evidence |
| Production | Authorized real adult user data under published policy | Real SIWC, D1/R2, Stripe, domain, and explicitly initiated external handoffs | Smoke checks, controlled transaction evidence, monitoring, backup/restore, and Aaron's exact-release acceptance |

Logical D1 and R2 bindings are declared in `.openai/hosting.json`; Sites owns actual Cloudflare resource creation and deployment wiring. Secrets and hosted runtime values are managed through the hosting control plane, never committed to the repository. Environment identity must be explicit so a preview cannot silently use production data or Stripe live mode.

## Deliberate exclusions

`[SUPPORTED BY BUSINESS PLAN V2]` The initial architecture does not implement:

- facility, academy, team, or enterprise account administration;
- native golfer booking, scheduling, coach-package checkout, payment, invoicing, or refunds;
- a coach marketplace or public golfer roadmap;
- autonomous diagnosis, coaching, roadmap generation, package recommendation, or performance prediction;
- launch-monitor, CRM, booking, payment, messaging, or media-analysis integrations;
- custom website/branding delivery, managed roadmap creation, or concierge onboarding;
- an unbounded dashboard, revenue-attribution engine, social feed, gamification system, or speculative reporting;
- junior-golfer accounts or data;
- operation outside Canada; or
- AI features of any kind.

## Alternatives and rationale

| Area | Selected | Deferred/rejected for bounded V1 | Rationale |
|---|---|---|---|
| Hosting | Sites + Cloudflare Worker | Separate Node server or multi-service deployment | Keeps one deployable surface and matches the existing Sites project while supporting server routes. |
| Persistence | D1 | Browser storage or an external managed SQL service | Durable tenant records require server-authoritative relational ownership and migrations. |
| Files | Private R2 | Public asset URLs or blobs in D1 | Keeps file bytes private and separate from searchable ownership metadata. |
| Instructor identity | Dispatch-owned SIWC | App-owned passwords, custom OAuth, or starter-scaffolded public auth | Avoids owning password/session infrastructure, subject to the unresolved public-auth suitability evidence. |
| Golfer access | Revocable capability | Mandatory golfer account or public link | Keeps the viewing path low-friction while providing revocation and server-side scope. |
| SaaS billing | Stripe hosted surfaces | Custom card capture | Keeps card collection outside the app and makes webhook events the billing authority. |
| Sharing delivery | Copy link | Email/SMS provider | Meets the V1 share need without introducing consent, deliverability, and messaging operations. |
| Observability | First-party audit + Sites logs | Third-party product analytics by default | Minimizes disclosed data flows and separates accountable change history from runtime diagnostics. |

## Unresolved evidence and operational dependencies

These do not invalidate the selected architecture and do not reinstate a design gate. They limit what can truthfully be called live or accepted:

| Dependency | Evidence required before the affected live claim |
|---|---|
| SIWC/public-auth suitability | Supported production contract, end-to-end sign-in/recovery/sign-out tests, identity-claim handling, and support path for external instructors |
| Stripe production credentials and exact price | Authorized account ownership, approved Price ID and commercial copy, webhook secret, tax/refund/failure policy, and controlled live transaction evidence |
| Public domain | Authorized domain, DNS/hosting configuration, transport and redirect checks, and final-origin security-header/cookie verification |
| Legal and privacy copy | Qualified review plus published copy that matches actual consent, sharing, retention, deletion, billing, and support behavior |
| Backups and recovery | Documented D1/R2 procedure, retained evidence, successful restore exercise, measured recovery result, and named operator |
| Sites logs | Demonstrated access, retention, redaction, correlation, alert routing, and capability-token exclusion in the real environment |
| Live acceptance | Exact release/version, public URL, controlled critical-journey evidence, residual-risk record, and Aaron's dated acceptance decision |

No section of this document claims legal compliance, security certification, availability level, successful restore, successful billing, production deployment, or owner acceptance.
