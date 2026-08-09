# Security and Privacy Plan

**Document status:** Implementation control plan under `AUTH-005`; not a security assessment, privacy opinion, legal-compliance claim, or production-readiness claim
**Applies to:** [Production SaaS Architecture](ARCHITECTURE.md)
**Last updated:** 2026-08-09

## Purpose and authority

`AUTH-005` authorizes security engineering, privacy implementation, and formal testing for the bounded production V1. This plan defines the controls the implementation and its operating process must support. A control described here is a requirement until direct evidence proves it is present in the exact release.

`[SUPPORTED BY BUSINESS PLAN V2]` The instructor remains the author of coaching judgments. The product is private by default, collects only what the approved experience needs, preserves golfer agency, does not sell golfer data, and does not expose one instructor's records to another.

`[REAL-WORLD VALIDATION REQUIRED]` Qualified Canadian privacy/legal review, actual user comprehension, technical verification, and operational exercises are still required. No wording in this document determines a legal role, lawful basis, statutory retention period, breach-notification deadline, or jurisdictional obligation.

## Current exact private-candidate security observation

Owner-only Sites version 12 is bound to source/runtime release
`7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c`, saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_8868e09fcb28819181cfbebdf82ce73f`,
private deployment `appgdep_6a77c5c85974819185ce1c8caf13007c`, and
environment revision `14`. Final deployment status is `succeeded` with provider
`updated_at` `2026-08-09T00:12:04.939300+00:00`. This is an implementation evidence point,
not public-release, legal-compliance, or owner-acceptance evidence.

Two detached exact-commit clean worktrees each installed 501 locked packages and
passed build, strict types, lint, artifact integrity, and 242/242 tests. Their
49-file inventories differed only in three strictly validated generated-value
files and had zero differences after allowlisted normalization. The integrity scan
inspected 261 source/evidence text files with zero pattern findings and preserved
historical Business Plan V1. The value-safe artifact verifier found exactly two
expected server-manifest copies of the build-generated prerender credential, zero
unexpected copies or paths, no production prerender binding, and the exact
packaged five-minute scheduler declaration. The exact archive
passed with gzip SHA-256
`994f725ba6c5952c45885a4d72d38804f1b10b8440273dc26ac8bd1c38d2bd75`
and 10 migrations; the separate Sites package has content hash
`sha256:0805c04e9dcd5e8bac77f58aec2362dece1754f6eec63ec73d9c2e249bb01700`.
After the final revision-14 deployment, signed-out HTTPS probes returned the
outer-policy `401` for `/`, `/app`, `/r`, and `/api/health` with `no-store` and
`no-referrer`; those probes demonstrate signed-out containment only.

The release working-tree/archive match is not deterministic byte-rebuild evidence.
An isolated immutable-v9 export installed cleanly and passed the complete 229-test
verification, but its rebuilt `dist` did not byte-match the submitted archive after
Windows CRLF checkout conversion changed migrations/metadata and content-hashed
bundles. Line endings are consistent with, but not proven to be the only cause.
`SUPPLY-EVID-001` therefore remained open for version 9; the LF rule added after
runtime v9 still needed exercise on a later exact candidate.

The later-source control was first exercised at then-undeployed precursor commit
`66f5203a913f01c8da20555feebdbb99152c052c`; its historical result is retained in
the [precursor evidence](release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md).
Exact version 12 repeated the two-clean-build comparison at its own immutable
commit and bound the verified archive to the recorded provider package and
deployment. This closes `SUPPLY-EVID-001` for exact-v12 normalized
reproducibility, not byte-identical output, and does not retroactively change the
failed version-9 byte comparison.

The exact-v12 artifact regression preserves the version-8 through version-11 closure of `SEC-003` for
the build-generated prerender credential boundary and supersedes version 7. It does
not close `SEC-001`; that incident is tracked independently. Aaron authorized
`OWNER-SEC-001` on 2026-08-08, and one value-safe Sites rotation completed at
`2026-08-08T18:32:31.831Z`. The connector contract immediately invalidates the prior
token on rotation. The replacement was not displayed, persisted, copied, or used,
and the access policy remained `custom`, revision 1, with one owner and no groups or
external visitors. The original value was not retained or empirically replayed.

`SEC-001` is **REMEDIATED — RETEST PENDING**, not closed. The historical
post-rotation plus exact-v11 and exact-v12 post-deploy signed-out containment probes passed, but no
supported signed-in owner browser was available. Normal owner authentication
without a bypass header and a meaningful privacy-safe log sample remain required. See the
[value-free rotation evidence](release-evidence/ROADMAP-SITES-V9-2026-08-08-sec001-rotation.md).

Version 12 retains the version-11 remediation of the known `SEC-002`
source/package condition. For every
non-loopback application response, the Worker creates a fresh 32-hex nonce,
inserts a server-owned CSP before vinext rendering, and the framework applies the
matching nonce to every executable RSC/hydration script. `script-src` and
`script-src-elem` contain only `'self'` plus that nonce; script
`'unsafe-inline'` and `'unsafe-eval'` are absent; `script-src-attr 'none'`
remains. The trusted boundary removes caller CSP/report-only headers, and
nonce-bearing public HTML is `no-store`. Automated adversarial tests verify nonce
shape, per-response uniqueness, script matching, caller-CSP replacement, and the
script directives. A supported signed-in hosted response was not available for
inspection, so `SEC-002` is **REMEDIATED — RETEST PENDING** rather than closed.
Nonce and credential values must never be recorded as evidence.

Historical version-9 exact-commit local synthetic Chrome captures are
source-equivalent to version 12 only for unchanged renderer/layout UI and CSS and
cover landing, workspace, and golfer views at 320, 390, and 1440 CSS px. They do not
cover version-12 outcome-unknown retry/reload interaction. During preparation, the 320 px golfer close
action was found compressed into an unusable narrow column; the responsive header
was repaired and a source regression plus a fresh nine-capture retest passed with no
root/body horizontal overflow. The predecessor visual harness also bypassed the
production share-capability exchange by using the raw synthetic capability as a
cookie. The v9 harness now POSTs the capability to `/r/session`, uses only the
returned scoped session cookie, removes only `Secure` for loopback HTTP, and has a
regression forbidding the old pattern. These two findings are closed locally only;
they do not establish hosted golfer-session behavior, manual accessibility, real
device, supported-browser, keyboard, screen-reader, forced-colour, or browser-zoom
evidence. They are not relabelled exact-v12 CSP, header, authentication, response-
recovery, hosted, or manual evidence.

The exact-v12 archive verifier proves that the package declares exactly
`*/5 * * * *`; the Worker exports `scheduled()` and passes local
scheduler-heartbeat tests. A predecessor-v8 provider-log query spanning
`2026-08-08T16:37:26.325Z` through `2026-08-08T17:16:40.472Z` returned 24 events,
all `fetch` and zero `scheduled`, across multiple expected five-minute boundaries.
The exact-v10 30-minute query completed 14m38s after final deployment began and
after the 21:20, 21:25, and 21:30 expected boundaries, but returned zero events.
That historical result strengthens suspicion while remaining inconclusive and
supplies no hosted heartbeat. Historical post-v11 aggregates returned only
`fetch`/`info`/`ok` events and `scheduled=0`; the later 60-minute broad sample
contained HTTP `200`, `200`, and handled `403`, while its `errors_only` companion
returned the handled `403`. The post-v12 ten-minute `errors_only` aggregate
returned zero records; its broad companion returned six `fetch`/`info`/`ok`
records (`200`, `200`, and handled `403` twice) and `scheduled=0`. Because
provider-log completeness, scheduled-event visibility, and deployed trigger
metadata are unavailable here, `OPS-CRON-001` records a suspected hosted scheduler
gap rather than a confirmed platform or application defect. Billing remains
disabled while it is open.

Version 12 also closes the known golfer-response lost-ack duplicate-write gap at
the application boundary. `/r/response` requires a bounded `Idempotency-Key` and
scopes deterministic HMAC response and audit receipts to the account plus resolved
golfer session. The first valid write returns `201`; an exact replay returns the
same response with `200`; changed input under the same key returns `409`. The
response and one audit event are committed atomically, including under same- and
mixed-payload concurrency. A 10-second client timeout reports an outcome-unknown
state without claiming failure and retains the pending key in per-tab
`sessionStorage` across reloads until a definitive result or tab close. The raw key
is never server-persisted or logged. External-handoff clicks use a fresh key for
each click and are intentionally not cross-click deduplicated.

A later review identified three separate controls that are implemented only in
the unreleased successor working tree: `OPS-CONTAIN-001`,
`CLIENT-RECOVERY-002`, and `RESP-RECOVERY-002`. No immutable successor release,
saved Sites version, deployment, environment revision, archive, or hosted result
is claimed. The exact version-12 observations above remain historical/current
hosted evidence and are not relabelled as successor evidence.

The successor's application-write boundary accepts only exact
`APPLICATION_WRITE_MODE=enabled` as write-enabled. Exact `frozen`, missing, and
malformed/padded/case-variant values fail closed. After canonical-origin and
product-access evaluation, and before framework dispatch, the edge blocks every
non-`OPTIONS` mutation and conservatively blocks `GET`/`HEAD` for `/app` and
non-health `/api` routes because those reads may provision, reconcile, rate-limit,
or audit. It returns a generic private/no-store `503` without disclosing whether
the normalized state is `frozen` or `invalid`. Exact health endpoints and
non-application public/golfer `GET`/`HEAD` reads remain outside the classifier.
Scheduled work uses the same parser and exits before D1 or outbound-provider work
unless the value is exact `enabled`. Owner-only operations readiness exposes only
the normalized state and degrades; public health exposes no write-control detail.

The successor's general interactive browser-mutation boundary starts no automatic
replay; deliberately non-blocking external-handoff telemetry remains best-effort.
A single 10-second deadline covers the fetch and complete response-body read, with
an 8 MiB maximum accepted body. Timeout, transport failure, `408`, `425`, `429`,
any `5xx`, an oversized response, or an unreadable/structurally invalid successful
JSON acknowledgement is outcome unknown. A malformed non-2xx body remains a
definitive failure with safe fallback copy. Controls with a stable idempotency
attempt retain it and say to retry the same action; controls without a proven
replay contract say to reload and inspect current state before trying again. This
copy does not claim that an ambiguous action failed.

The successor also binds golfer recovery to a non-reversible 64-hex HMAC context
derived from the exact account, share, and session. Response and close routes
require that context alongside the path-scoped `HttpOnly` cookie and compare it
without an early-exit string comparison. A stale tab's mismatch returns
`409 share_session_changed`, creates neither a golfer response nor its
`golfer.response_recorded` audit, and does not expire the active replacement
cookie. One current-format, context-bound explicit response attempt may be
restored in the same tab; contextless legacy, malformed, invalid-context, or
storage-unavailable state blocks new responses rather than silently discarding
ambiguity. State belonging to a different current session is removed as retired
session state.

Only a successful share exchange atomically creates the new session and retires
the prior one. Invalid, throttled, timed-out, or otherwise retryable exchange
preserves the prior cookie/session, and a tokenless `/r` view does not issue an
automatic session delete. Retryable exchange retains the fragment capability;
definitive success or rejection invokes best-effort fragment scrubbing before any
unmount-sensitive UI work. After definitive server success, a local storage,
history, or scripted-navigation failure does not relabel the exchange/close as
failed; the UI retains a normal-link fallback.

`[OWNER INPUT REQUIRED]` Exact consent-policy-registry entries and the independent
privacy-operator authority/configuration remain unresolved and absent from the
private environment. Those boundaries fail closed; application deep readiness is
therefore intentionally degraded. Real-user operation still requires the exact
owner decisions, qualified review, deployed policy/behavior conformance, and
authenticated/manual evidence described below.

## Security and privacy objectives

1. Authenticate instructors through the selected dispatch-owned SIWC boundary and authorize every tenant operation server-side.
2. Prevent one instructor from reading or changing another instructor's account, golfer, roadmap, media, subscription, or audit data.
3. Keep golfer experiences private unless an instructor intentionally creates a scoped, revocable capability.
4. Preserve confidentiality and integrity of coach-authored content and optional media.
5. Keep SaaS payment-card handling outside the application through Stripe-hosted surfaces.
6. Collect, log, retain, export, correct, revoke, and delete only according to documented and published policy.
7. Fail safely: preserve legitimate drafts where possible, reveal no private content in errors, and never imply an unobserved share, payment, or sale.
8. Make security-relevant changes attributable through minimal first-party audit events without copying sensitive content into logs.

## Actors and trust boundaries

| Actor/system | Trust granted | Trust not granted |
|---|---|---|
| Anonymous visitor | Read published public acquisition and synthetic sample content | No instructor, golfer, roadmap, billing, or private media access |
| SIWC-authenticated instructor | Identity claim from the Sites dispatch boundary | Tenant entitlement or ownership is not inferred from client input; SIWC does not by itself prove a paid account |
| Golfer capability holder | Read the one published roadmap/version and approved private assets granted by the active capability | No authoring, instructor workspace, other golfer, billing, raw audit, or bucket access |
| Sites/Worker runtime | Execute trusted server code and receive configured bindings/secrets | Browser-originated identity headers, tenant IDs, prices, or authorization decisions are never trusted |
| D1 | Authoritative structured application state | It is not a file store and does not make application authorization decisions |
| R2 | Private object bytes | Object key knowledge alone never authorizes a download |
| Stripe | Hosted SaaS billing and signed billing events | It does not process the instructor's coaching-package transaction and a browser redirect is not payment proof |
| Existing coach action destination | External booking, purchase, or contact flow selected by the instructor | The SaaS does not know whether that external action completed unless separately and truthfully recorded |
| Sites logs | Runtime/platform diagnostics | Not an audit ledger, product analytics store, or place for content, tokens, secrets, or payment details |

## Data classification

| Class | Examples | Default handling |
|---|---|---|
| Public | Marketing copy, public FAQ, explicitly synthetic sample roadmap | May be cached and indexed as approved; no real golfer content |
| Internal operational | Release ID, request ID, service status, non-sensitive configuration names, short-lived HMAC abuse counters | Restricted to authorized operators; no secrets or user content |
| Account confidential | Instructor name/email, subscription identifiers/state, support and account history | Tenant- and role-restricted; minimized in logs and exports |
| Golfer confidential | Adult golfer display identifier, goal/context, assessment, barriers, phases, lessons, practice, evidence interpretations, phase review | Private by default; instructor-owned and capability-scoped for the intended golfer |
| Restricted media | Coach/golfer images, swing clips, documents, or other uploaded evidence | Private R2 only; explicit approved purpose/consent, strong validation, no public object URL |
| Security secret | Raw share verifier, share-token pepper, abuse-limit pepper, Stripe secret/webhook secret, hosted deployment credentials | Never committed or logged; runtime-secret storage; raw share verifier is not persisted |

The product must not collect junior-golfer data in V1. It must not infer sensitive characteristics, medical conclusions, or coaching diagnoses. Optional media and measurements may be absent without reducing access to the core text experience.

## Data minimization and purpose boundaries

| Data | Permitted V1 purpose | Prohibited default use |
|---|---|---|
| Instructor identity | Authenticate, identify coach, operate account, support and billing | Public directory, unrelated marketing enrichment, or cross-account profiling |
| Package facts and external link | Explain the coach's recommendation and hand off intentionally | Native coach-package transaction, unverified sales attribution, or link crawling |
| Golfer identifier and goal | Personalize the private roadmap and orient coach judgment | Public profile, lead resale, broad demographics, or unrelated CRM history |
| Assessment and roadmap content | Present coach-owned plan and current player journey | Automated diagnosis, model training, performance prediction, or autonomous recommendation |
| Media/evidence | Support a specific coach-authored claim where approved | Raw archive, automatic analysis, advertising, or public sharing |
| Share/audit records | Authorize access, support revocation, investigate actions | Behavioral advertising or content reconstruction in logs |
| Stripe identifiers/state | Operate the instructor's SaaS subscription | Store card data or combine with golfer package transactions |

`[OWNER INPUT REQUIRED]` Exact consent language, privacy roles, collection notices, media rules, retention periods, deletion exceptions, data-subject processes, billing/tax/refund terms, and incident-notification obligations remain unresolved. The implementation must expose configuration and lifecycle hooks without inventing these policy decisions.

## Authentication and session controls

### Instructor authentication

- Use dispatch-owned SIWC routes and trusted identity headers; do not add app-owned passwords or OAuth callbacks.
- Resolve the external identity to an app-generated immutable instructor ID on the server.
- Treat optional full name as display data, not an authorization claim.
- Reject protected API routes and server actions when identity is absent; hiding a button in the browser is not authorization.
- Mark identity-dependent rendered routes dynamic so content cannot be shared through a static cache.
- Use secure platform session behavior and same-origin relative return paths only.
- Do not trust a browser-supplied `oai-authenticated-user-*` header in any environment where the dispatch boundary has not stripped/replaced it.
- Reauthenticate or require a fresh server-side identity check for billing portal creation, account deletion, share rotation, and other high-impact actions.

`[REAL-WORLD VALIDATION REQUIRED]` Dispatch-owned SIWC's suitability for a public Canada-wide SaaS, identity continuity, recovery, session duration, sign-out, and incident support must be proven with the exact Sites configuration. Until then, the implementation choice is selected but the live public-auth claim is unresolved.

### Instructor product-access policy

One Worker-boundary policy covers HTML, Vinext RSC navigation, and API requests
before the instructor application runs. `owner_private` compares only an
HMAC-SHA-256 digest of the trimmed, lowercased SIWC email against an explicit
digest allowlist. Its pepper is independent from the share-token and abuse
peppers. Plaintext allowlist emails are neither configured nor logged.

`subscription_required` permits core product routes only when the account's
latest Stripe subscription projection has a status in the explicitly configured
allowlist. No status is selected in code as a commercial default. Billing,
profile, export, privacy-request controls, and the minimized private-link access
control at `/app/settings/shares` and `/api/account/shares` remain reachable so
an instructor can subscribe, manage billing, exercise account/data rights, or
remove capability access they still own. The share-control exception reveals no
golfer, recipient, plan-content, raw-token, or session identifier and cannot read
or mutate core product data; all other tenant-scoped plan/share APIs remain
subscription-gated. Entitlement loss does not automatically revoke a capability
or its sessions. Only the instructor's explicit confirmed revocation (or another
documented capability/consent lifecycle transition) does so. Public health,
signed Stripe webhook, and golfer capability endpoints keep their separate
boundaries. Missing or invalid policy configuration fails closed. Denials are
non-cacheable, bounded `403`, `402`, or configuration-failure responses without
identity, status-list, digest, or secret detail.

### Instructor authorization

- All tenant repositories require the authenticated `instructor_id` as a server-created context value.
- Select/update/delete statements include that owner scope or traverse an owner-scoped relationship.
- Resource IDs are opaque and do not substitute for an ownership check.
- Cross-tenant joins, unfiltered administrative listings, and client-chosen ownership fields are prohibited.
- Account and billing state gates affected writes server-side; the exact grace/pause/cancel consequences follow approved policy.
- Operator access, if later required, must be separately authenticated, least-privileged, time-bounded where possible, and audited. There is no implicit support back door.

### Policy-versioned consent-record plumbing

The implementation exposes an authenticated, account-derived `/api/consents`
boundary for current-state reads and immutable `grant` or `withdraw`
transitions. It does not ship consent wording, choose a legal basis, enable an
optional processing purpose, or establish Canadian legal compliance.

- The existing D1 vocabulary is explicit: purposes are `terms`,
  `privacy_notice`, `golfer_record`, `roadmap_sharing`, `media_use`,
  `service_email`, and `optional_analytics`; persisted statuses are `granted`,
  `declined`, `withdrawn`, and `expired`. The public mutation surface currently
  creates only `granted` and `withdrawn` history rows.
- `CONSENT_POLICY_REGISTRY_JSON` is strict owner-supplied configuration. Each
  configured purpose has exact `version`, `purposeDescription`, and allowed
  `subjectTypes`. Any wording change requires a new version. Code supplies no
  substantive defaults.
- Missing, malformed, unlisted, subject-inapplicable, or stale registry state
  makes the effective-grant helper return false and blocks a new grant. An
  empty valid registry still grants nothing. Removing configuration never
  erases history and never prevents withdrawal of the current recorded grant.
  Both the version and exact configured description must match the immutable
  grant, so changing wording without changing the version also fails closed.
- Account identity and ownership are derived from the trusted SIWC boundary.
  Account IDs are not accepted from JSON. A golfer subject is resolved through
  the authenticated account in both the read and the atomic write guard; a
  cross-tenant or absent golfer receives the same bounded not-found result.
- Every transition requires a stable idempotency key, exact JSON keys, the
  expected current record ID, and the relevant policy version. D1 serializes an
  account-row compare-and-swap guard with the append-only consent and audit
  inserts, so a stale or concurrent loser cannot leave partial state.
- Replacement and withdrawal append records; they do not update or relabel a
  prior grant. The tenant data export already includes the complete consent
  record history.
- The production V1 has two policy-neutral technical mappings. A current
  account-scoped `golfer_record` grant is required for golfer creation,
  ordinary instructor list/detail/page/API reads, golfer and plan-content
  changes, and profile/package changes that would revise linked golfer plans.
  A current golfer-scoped `roadmap_sharing` grant, together with the account
  grant, is required to publish, exchange a share token, resolve every live
  share session, and record a golfer response. These names do not choose or
  establish their legal meaning.
- Sensitive writes use a D1-side current-grant guard in the same transaction.
  Version, exact description, internally consistent timestamps, status, and
  expiry are checked against the D1 clock. Sharing withdrawal atomically
  revokes affected links and live sessions; account golfer-record withdrawal
  does so across the tenant. Subsequent capability reads return only the
  neutral unavailable state.
- Self-serve controls render only the configured/stored owner text and version.
  Account golfer-record grant/withdrawal is available before collection and in
  data settings; golfer roadmap-sharing grant/withdrawal is available on the
  plan and golfer-settings surfaces. Missing configuration is shown honestly
  and cannot create a grant, while a still-current persisted grant remains
  withdrawable after configuration removal.
- Narrow post-withdrawal exceptions are intentional: authenticated tenant
  export, data/privacy requests, operator fulfillment, consent-state controls,
  share/session cleanup, and one-way golfer archival remain available. They do
  not restore ordinary instructor disclosure or content mutation.
- Audit stores the action, opaque transition target, authenticated actor,
  trusted request-correlation ID, and only a SHA-256 input fingerprint. Policy
  text, evidence references, raw idempotency keys, emails, and golfer IDs are
  not copied into audit metadata.

`[OWNER INPUT REQUIRED]` The exact registry entries, notices, roles, evidence
requirements, collection moments, retention/expiry rules, and legal meaning of
the two implemented technical mappings require Aaron's recorded decision and
qualified review. Other downstream purposes remain unmapped and disabled.
`[REAL-WORLD VALIDATION REQUIRED]` Before real-user operation, each approved
purpose mapping must be reviewed against every actual collection, use, and
disclosure path, and the deployed text, withdrawal behavior, data export,
operator workflow, and user comprehension must be verified. Media, marketing,
research, and optional analytics remain disabled/unimplemented; a consent
record by itself does not activate them.

### Golfer capability controls

- Generate at least 256 bits of entropy with a cryptographically secure generator.
- Store only an HMAC-SHA-256 fingerprint under a dedicated runtime pepper; never store or log the raw verifier.
- Carry the raw verifier in a fragment and exchange it through a same-origin POST body for a scoped `Secure`, `HttpOnly`, `SameSite=Lax` session cookie.
- Record link-open access, create the browser session, and increment the capability counter in that same atomic POST transaction. Token-free `GET /r/plan` is read-only, so cross-site navigation or prefetch cannot create audit/counter state.
- When replacing a browser session, first validate the new capability and commit
  new-session creation plus prior-session retirement atomically. A rejected or
  retryable exchange must not revoke or clear the prior cookie/session.
- Clear the fragment before further navigation and set `Referrer-Policy: no-referrer` on capability bootstrap and golfer pages.
- Return no personal detail before validation; use equivalent neutral invalid, expired, revoked, and not-found states.
- Rate-limit capability exchanges by a privacy-safe combination of share ID and network signals; do not expose whether a share ID exists.
- Scope each capability to one instructor, one golfer roadmap/publication, read-only actions, and its approved lifetime.
- Support explicit revoke and rotate. Revocation atomically marks the capability and every still-open child session revoked and records the instructor action in the audit ledger.
- Permit an authenticated owner, including one without current core-product
  entitlement, to list only their live capability metadata and explicitly revoke
  one owned capability. List results contain only opaque link identity, published
  revision, lifecycle/access timestamps and counts, expiry, and active-session
  count. Ownership is re-proved in the mutation; another tenant's identifier is
  indistinguishable from a missing record.
- A published revision whose latest capability is revoked or effectively expired
  may be reissued without republishing content only after an explicit
  same-revision confirmation and a newly selected bounded expiry. The transaction
  compares the exact published revision, plan `lastSharedAt`, source capability
  identity/status/version, current consent, absence of a newer source, and absence
  of a live capability. It then retires any residual live capabilities and
  sessions, updates `lastSharedAt`, creates exactly one HMAC-only capability, and
  writes one minimized `share.reissue_same_revision` audit event. A concurrent
  reissue, revocation, edit, consent change, or publication change loses with a
  conflict and creates no partial capability or audit state.
- Publication, inaccessible-link replacement, and same-revision reissue return
  the database receipt's exact operation, source identity/history where
  applicable, revision, lifecycle timestamps, expiry intent, and access facts
  with the one-time fragment URL. The client requires a bare canonical expected
  origin, a byte-canonical URL, equal fresh-link creation/update timestamps, and
  the exact requested day interval before revealing the bearer. Browser history
  must use those authoritative values and must not synthesize lifecycle timestamps
  from its own clock. After a locally initiated revoke whose acknowledgement lacks
  an updated history receipt, reload before offering same-revision reissue.
- Require a bounded, safe-character idempotency key for each golfer response. Scope its deterministic HMAC receipts to the resolved account and share session; replay the same payload without a second response or audit event, and reject changed payload. Never persist the raw key server-side or log it. The browser uses a bounded request timeout and retains one pending ambiguous key only in per-tab session storage until a definitive result or tab closure, allowing a same-tab reload to retry truthfully without creating durable cross-tab state.
- Bind every response and explicit close to an opaque HMAC context for the exact
  account/share/session as well as the `HttpOnly` cookie. Reject a context mismatch
  before response/audit mutation or cookie expiry. Fail closed when older
  contextless, malformed, or unavailable browser recovery state cannot be matched
  safely; do not silently discard it and issue a new attempt.
- Keep capability pages free of third-party scripts, pixels, fonts, embeds, and asset origins that could receive URL or behavior data.
- Prevent indexing and caching of private pages with appropriate response headers.
- Never put raw capabilities in Sites logs, first-party events, error reports, support tickets, or screenshots.

A capability is a bearer secret. It cannot prevent an authorized recipient from copying what they can see or forwarding the link before revocation. User-facing copy and policy must explain this limitation honestly.

## Application and API controls

### Successor write containment and client recovery

The unreleased successor implements one edge-owned containment decision before
framework routing. Its classifier is method and path aware rather than a simple
mutation-method list: authenticated instructor page/RSC reads and non-health API
reads remain write-capable because they can provision identity, reconcile billing,
consume durable abuse counters, or write audits. All non-`GET`/`HEAD` requests
except `OPTIONS` are treated as write-capable. Exact `/api/health` and
`/api/operations/health` are the only API read exceptions. Canonical-origin and
product-access denials run first so the generic write-unavailable response cannot
be used to bypass or distinguish those boundaries.

Only the exact lower-case value `enabled` enables writes. `frozen`, absent,
whitespace-padded, case-variant, empty, and unknown values all disable them;
operations health distinguishes intentional `frozen` from configuration
`invalid`, but public responses do not. The generic `503` is private/no-store and
contains no mode, environment, tenant, identity, or provider detail. Scheduled
execution performs the same exact parse and does no database or outbound-provider
work when disabled.

The general browser mutation helper is an acknowledgement boundary, not a retry
engine. It aborts/cancels at a 10-second end-to-end deadline, accepts at most an
8 MiB body, and reconstructs a response only after the full body is available.
It treats transport/timeout, `408`, `425`, `429`, `5xx`, body overflow, and an
unreadable or structurally invalid successful JSON acknowledgement as unknown
outcomes and never replays automatically. A malformed non-2xx JSON body is a
definitive failure with bounded fallback copy. UI recovery copy must reflect the
underlying server contract: reuse a stable idempotency attempt where one exists,
or require reload/current-state inspection where replay safety is unproven.

### Input, output, and state changes

- Validate request shape, type, length, allowed values, and state transition on the server.
- Normalize URLs and allow only approved `https` destinations for external coach actions; reject credentials, script schemes, internal-network targets, and ambiguous parser forms.
- Store coach-authored text as data and render it with framework escaping. Do not render raw HTML, scripts, unsafe Markdown, or untrusted SVG.
- Apply explicit maximums to text, arrays, request bodies, and files based on tested product needs; do not use arbitrary “unlimited” storage behavior.
- Use D1 prepared statements or ORM parameter binding; never concatenate user input into SQL.
- Use anti-CSRF protection for cookie-authenticated mutations through same-origin checks, appropriate SameSite cookies, and a server-validated token where the exact route model requires it.
- Permit only necessary HTTP methods and content types; return privacy-safe errors with request IDs.
- Make golfer-response, publication, revocation, deletion, and billing-event handling idempotent.
- Use optimistic concurrency or version checks on coach edits so a stale tab cannot silently overwrite a newer roadmap.

### Browser protections

The exact deployed response must be verified for:

- a restrictive Content Security Policy compatible with the built app;
- frame protection through CSP `frame-ancestors`;
- `Referrer-Policy: no-referrer` on private flows;
- MIME sniffing protection;
- restrictive permissions policy;
- transport-only secure cookies with narrow paths and lifetimes;
- no sensitive caching on instructor/golfer responses; and
- consistent origin/host validation for generated absolute URLs and redirects.

Exact v12 implements these application response controls in the Worker, including
the per-response script nonce described above, `frame-ancestors 'none'`,
`Referrer-Policy: no-referrer`, MIME-sniffing protection, a restrictive permissions
policy, and route-aware `no-store`. Automated production-bundle tests exercise the
policy construction and framework nonce propagation. These are exact source and
package claims, not a claim about the Sites outer gate or a complete hosted-browser
result. A supported signed-in browser must still inspect the final deployed
application response and exercise normal hydration/navigation before `SEC-002`
closes.

### Abuse resistance

- Rate-limit sign-in initiation where platform controls allow, capability exchange, publication/share rotation, file upload, Stripe session creation, and support/data-request endpoints.
- Bound account, golfer, roadmap, phase, evidence, and storage usage using a plainly disclosed reasonable-use approach only after product/policy approval.
- Detect repeated cross-tenant misses, capability failures, webhook signature failures, and unusual destructive actions without recording content.
- Fail closed on authorization and capability validation. Degrade optional media before making the text roadmap unavailable.

The application implements the following fixed-window security controls. These
thresholds contain automation and expensive repeated work; they are not product
entitlements, package quotas, sales policy, or a substitute for edge controls.

| Protected operation and privacy-safe subject | Maximum | Fixed window |
|---|---:|---:|
| Golfer capability exchange, per trusted network digest | 30 | 1 minute |
| Golfer capability exchange, per capability digest | 12 | 5 minutes |
| Golfer response, per trusted network digest | 60 | 1 minute |
| Golfer response, per capability digest | 20 | 10 minutes |
| Plan publish/link rotation, per instructor account digest | 12 | 1 hour |
| Link revocation, per instructor account digest | 30 | 1 hour |
| Stripe Checkout creation, per instructor account digest | 5 | 15 minutes |
| Stripe Portal creation, per instructor account digest | 10 | 15 minutes |
| Stripe billing reconciliation, per instructor account digest | 6 | 15 minutes |
| Immediate data export, per instructor account digest | 3 | 1 hour |
| Privacy/data request submission, per instructor account digest | 10 | 1 hour |
| Data-request operator API, per trusted network digest | 60 | 5 minutes |
| Data-request operator API, per authorized operator digest | 30 | 5 minutes |

D1 increments each counter with one atomic `INSERT ... ON CONFLICT DO UPDATE ...
RETURNING` statement. The key is an HMAC-SHA-256 digest under the separate
`ABUSE_LIMIT_PEPPER`; raw network addresses, capability verifiers, account IDs,
emails, and request content are never written to the counter table. Scope and
window boundary are included in the HMAC input to prevent cross-purpose and
cross-window correlation. Rows expire at the fixed-window boundary and are
deleted opportunistically by subsequent
limited requests. Rejected requests return `429`, a bounded neutral JSON error,
`Cache-Control: private, no-store`, and a `Retry-After` value calculated from
the actual window boundary. Production fails closed if the trusted client
network header or pepper is unavailable.

`[REAL-WORLD VALIDATION REQUIRED]` The application-level concurrency behavior is
tested against local D1. Sites/Cloudflare edge-level volumetric protection,
deployed header trust, operational alert thresholds, and observed false-positive
rates still require exact-environment evidence.

## File and media controls

R2 uploads remain disabled or feature-limited until the approved media policy is represented in the UI and operations. When enabled:

1. create an instructor-owned pending asset record before upload;
2. enforce allowed media categories, byte limits, and content-type/magic-byte agreement;
3. generate an opaque server key rather than using the original filename;
4. quarantine the object and prevent golfer delivery until required checks succeed;
5. reject active content and unsafe formats; never directly serve user-authored HTML or SVG;
6. strip or deliberately handle metadata that may expose location, device, or identity;
7. record consent/purpose/status without placing the consent text in logs;
8. use authorized Worker reads for coach preview and golfer delivery;
9. provide equivalent text context, captions/transcript, or descriptions required by the content; and
10. delete bytes and metadata through a retryable, auditable lifecycle job.

`[REAL-WORLD VALIDATION REQUIRED]` The exact malware/safety checking method, accepted formats, size limits, metadata policy, accessibility alternatives, and media-retention consequences have not been approved or exercised.

## Stripe billing controls

- Keep Stripe in test mode outside production and make environment mode explicit.
- Store production secrets only in hosted secret management with restricted operator access.
- Create Checkout and Portal sessions server-side for the authenticated instructor and configured approved price.
- Validate the Stripe webhook signature against the unmodified request body before any acknowledgement or state change.
- Enforce an allowlist of handled event types and persist event ID, processing state, attempt count, and minimal result.
- Acknowledge only after durable receipt; make processing safe to retry and reconcile against Stripe.
- Permit an authenticated instructor to reconcile only locally owned, existing Checkout/subscription references through provider `GET` requests. The browser supplies no provider identifiers, and the operation cannot create a Checkout Session, customer, subscription, charge, refund, cancellation, or Portal Session.
- Persist reconciliation targets with tenant-scoped foreign keys, an expiring lease, bounded safe error history, retry count, and terminal state. Couple the current lease, latest provider-read generation, subscription projection, Checkout completion, customer ownership, and success audit in one D1 batch.
- Serialize Checkout creation and reconciliation with a durable account-scoped operation lease. A stale operation owner must fail its terminal D1 guard rather than create or commit from an obsolete account view.
- Run a bounded five-minute recovery sweep for existing provider-backed
  Checkout work, failed reconciliation leases, and stale open-subscription
  projections. Apply backoff, stop after eight consecutive automatic failures,
  reset that budget on success, and emit only opaque dead-letter
  counts/identifiers for operational response.
- When a newer signed webhook commits the exact provider object and current
  projection generation, resolve its matching failed or in-flight reconciliation
  target in the same D1 batch so a stale worker cannot orphan or overwrite it.
- Never grant entitlement from a success redirect, browser-supplied status, amount, email, or customer ID.
- Protect against one Stripe customer or subscription being attached to two instructor accounts.
- Audit entitlement changes without storing invoice detail, card data, webhook bodies, or secrets in the audit record.
- Separate the instructor's SaaS price/cadence from the coach-authored golfer package price and external link in UI, data, and code.

`[PRICING HYPOTHESIS — REQUIRES VALIDATION]` The planning price, trial, pause price, and commercial/account behavior remain unapproved or unvalidated unless an exact later decision says otherwise. Stripe configuration must not silently convert those hypotheses into policy.

## Audit events and operational logs

### First-party audit ledger

The application writes append-oriented D1 audit events for security- and privacy-relevant actions. Each event contains only:

- event version and timestamp;
- request/correlation ID;
- actor class (`instructor`, `golfer_capability`, `system`, or explicitly authorized operator) and opaque actor ID where applicable;
- action and target type/opaque ID;
- outcome and safe reason code;
- source channel/environment; and
- minimal before/after state labels when necessary.

Required event families include authentication mapping, account lifecycle, coach/package changes, golfer/roadmap create/update, publish/unpublish, capability create/exchange/revoke/rotate, media lifecycle, export/correction/deletion request, subscription-event processing, entitlement change, and authorized operator access.

### Privacy-operator boundary

The [data-request operator workflow](DATA_REQUEST_OPERATOR_WORKFLOW.md) requires
dispatch-owned SIWC plus an independent HMAC-SHA-256 email-digest allowlist.
Owner-private product access and subscription entitlement never grant this role.
Configuration uncertainty returns `503`; a known non-member returns `403`.
Queue/detail output omits emails, contact hashes, request text, provider IDs,
object keys, and record content. Status compare-and-swap and its audit receipt
commit in one D1 batch. Queue traversal is newest-first strict keyset
pagination; null-tenant and future-dated active rows are excluded with safe
counts rather than identifiers. Existing identity-verification-required,
verified, in-progress, and terminal history is read-only. The only mutation is
the non-attesting `submitted` -> `identity_verification_required` marker; it
does not write `identity_verified_at`. Verification, processing, denial,
cancellation, fulfillment, and deletion have no mutation transition. Network
and authorized-operator controls run before queue audit, inventory, or PATCH
work, and their D1 subjects are separately scoped/windowed HMAC digests.

Audit events never contain raw identity headers, raw capabilities, full email addresses unless separately justified and protected, coach/golfer narrative, media URLs, package-payment details, Stripe webhook payloads, or secrets. Audit writes for high-impact mutations must be coupled transactionally where D1 permits or reconciled through a durable outbox pattern.

### Sites operational logs

Sites logs support runtime diagnosis, deployment health, and request correlation. Application log messages use event names, status codes, duration buckets, and opaque IDs. They do not emit request bodies, query strings, URL fragments, cookies, authorization headers, raw webhook payloads, personal content, or secrets.

`[REAL-WORLD VALIDATION REQUIRED]` Demonstrate actual Sites log access, provider-generated fields, route/path treatment, retention, access control, export, redaction, and alert routing. This operational evidence is unresolved and must not be assumed from application logging discipline.

## Privacy lifecycle

### Collection and notice

- Show the approved collection purpose at or before entry of identity, golfer context, assessment, and media.
- Distinguish required, optional, and deferred fields.
- Keep product operation, research, marketing, media, and outward sharing choices separate.
- Do not use a coach's ability to enter data as proof that the golfer authorized every use.

### Access and correction

- The instructor can review and correct account, coach, package, golfer, and roadmap content within the authorized scope.
- The golfer experience provides an approved correction/contact route without exposing additional data.
- Identity/account corrections that affect SIWC or Stripe are reconciled rather than silently overwritten.
- Material published corrections create a new publication version and audit event.

### Export

- Export is generated server-side after a fresh authorization check.
- It contains only the requester's approved scope and excludes raw capability secrets, internal security fields, unrelated audit data, and other tenants.
- Generated export objects are private, short-lived, and deleted according to the approved export policy.

### Revocation and deletion

- Revoking a share stops new access and invalidates scoped sessions as soon as practical.
- Account/golfer deletion is a durable, retryable workflow across D1, R2, capabilities, exports, and caches; it is not a single optimistic UI state.
- Records subject to a permitted retention exception are isolated and no longer available in ordinary product flows.
- Stripe may retain independent billing records under its own applicable obligations; product copy must describe the actual separation after qualified review.
- Backup expiry and deletion limitations must be stated accurately once the backup design is approved.

### Retention

No retention duration is selected in this document. D1 records, R2 objects, audit events, operational logs, exports, cancelled accounts, paused accounts, and backups each require an explicit purpose, duration, deletion mechanism, exception rule, and evidence owner.

## Threat and control register

| Threat | Primary preventive controls | Detection/recovery evidence required |
|---|---|---|
| Cross-tenant object access | Server-derived instructor context, owner-scoped repositories, opaque IDs, authorization on every read/write | Automated negative matrix across all resources plus audit review |
| Forged identity header | Trust only the Sites dispatch boundary; strip/replace browser values; protected server routes | Hosted spoofing tests and dispatch-contract evidence |
| Capability guessing or leakage | 256-bit verifier, hashed-at-rest, fragment/body exchange, neutral errors, rate limits, no third parties/referrers | Token-not-logged test, brute-force controls, revoke/rotate/session invalidation test |
| Stale-tab golfer action applied to a replacement session | Cookie plus account/share/session HMAC context, context-bound per-tab recovery, mismatch before response/audit/close mutation | Cross-tab replacement tests proving `409`, zero response/audit cardinality change, and no active-cookie expiry |
| Stored XSS from coach content | Framework escaping, no raw HTML/SVG, CSP, URL allowlist | Payload test corpus and rendered response/header inspection |
| CSRF or unintended mutation | Same-origin validation, SameSite/secure cookies, route-appropriate CSRF token, explicit confirmation | Cross-origin mutation tests for all state-changing endpoints |
| SQL injection or mass assignment | Schema validation, prepared/bound D1 queries, explicit writable fields | Injection and overposting tests |
| Stripe webhook forgery/replay | Raw-body signature verification, event allowlist, unique event IDs, idempotent state machine | Invalid signature, duplicate, out-of-order, retry, and reconciliation tests |
| Unsafe file upload | Private quarantine, type/size/signature validation, opaque key, no active content, authorized serving | Malformed/polyglot/oversize tests and deletion retry evidence |
| Secret or personal-data leakage | Hosted secrets, log minimization/redaction, no raw token storage, repository scanning | Secret scan, log sample review, error-path review, rotation runbook |
| Accidental destructive action | Confirmation, state preconditions, version checks, idempotent workflow, audit | Restore/rollback and deletion-cancellation tests where policy permits |
| Lost or delayed browser mutation acknowledgement | End-to-end deadline, no automatic replay, stable idempotency/CAS where available, truthful retry-same-attempt or reload-first copy | Timeout, stalled-body, oversized-body, retryable-status, and source-inventory tests plus hosted interruption/reload exercise |
| Unsafe write continuation during an integrity incident | Exact fail-closed write mode, path-aware edge classification, scheduler no-work branch, private operational readiness | Frozen/invalid route matrix, zero-side-effect scheduled tests, and exact hosted containment/re-enable exercise |
| Provider or dependency outage | Bounded timeouts, safe errors, retry/idempotency, text-first fallback, operational runbooks | Failure injection or controlled outage exercises |
| Dependency compromise | Lockfile, review/update cadence, build integrity, least-privilege secrets | Dependency scan/review evidence and emergency update rehearsal |
| Privacy overcollection | Field-purpose inventory, optional fields, adult-only scope, no third-party analytics by default | Data-map review, UI/content review, export/delete sampling |

## Verification required

The exact release requires proportionate evidence for:

- unit and integration tests of validation, state transitions, hashing, idempotency, and authorization helpers;
- end-to-end instructor, golfer capability, subscription, correction, revocation, and deletion journeys;
- systematic cross-tenant tests for every tenant-owned resource and action;
- capability entropy, non-persistence, redaction, expiry/revocation, and session-scope tests;
- SIWC spoofing, missing-identity, sign-out, recovery, and public-hosted behavior;
- Stripe signature, replay, ordering, failure, and reconciliation behavior in test mode plus a controlled authorized live transaction;
- upload, media failure, private-object, and deletion handling if media is enabled;
- response header, cache, redirect, external-link, and browser security review;
- dependency, configuration, secret, and repository scans;
- normalized release-build comparison with `npm run verify:reproducible-builds`
  across two independently created detached clean worktrees, retaining raw
  differences and accepting only strictly validated generated-value variance;
- D1/R2 backup and restore exercises;
- keyboard, screen-reader, zoom/reflow, reduced-motion, no-media, error, and privacy-safe unauthorized-state checks; and
- qualified privacy/legal review of actual product behavior and published copy.

Findings need severity, affected release, owner, mitigation, retest evidence, and disposition. The absence of a finding in one test is not proof of broad security or compliance.

## Incident and disclosure principles

1. Protect people and contain access first; preserve necessary evidence without copying private content casually.
2. Record detection time, scope, affected systems/data classes, containment, decisions, communications owner, and recovery evidence.
3. Rotate affected secrets/capabilities and revoke sessions using the appropriate runbook.
4. Determine notification and reporting duties through the approved legal/privacy process; do not improvise legal conclusions in the incident channel.
5. Restore cautiously, verify tenant isolation and data integrity, and monitor recurrence.
6. Complete a blameless review with corrective actions, owners, dates, and verification.

## Unresolved dependencies, not gates

| Dependency | Why it remains unresolved | What closes the evidence gap |
|---|---|---|
| SIWC for public instructors | The starter guidance describes dispatch-owned SIWC, but the exact public SaaS suitability and support contract are not evidenced | Hosted end-to-end and abuse tests plus a documented provider/support path |
| Consent-policy registry | Technical enforcement exists, but exact owner-approved entries are absent and grants fail closed | Owner decision, qualified review, exact versioned text/configuration, deployed path mapping, withdrawal/export verification, and comprehension evidence |
| Privacy-operator authority | The least-privilege boundary exists, but the named role and independent access configuration are absent, so the API fails closed | Named accountable operator, approved method/policy/evidence, exact secret/digest configuration without values in evidence, authenticated hosted verification, and audited workflow exercise |
| Legal/privacy copy and policy | No qualified review or exact owner-approved lifecycle terms are recorded | Versioned approved policy/copy mapped to actual code and operator workflows |
| Stripe production configuration | No production secret, approved Price, final billing terms, or live transaction evidence is recorded | Authorized configuration, signed webhook evidence, reconciliation, and controlled transaction/refund/failure checks |
| Public domain | Final origin affects cookies, redirects, CSP, CORS, referrers, and public disclosures | Authorized domain plus final-origin security and privacy verification |
| Backup and restore | A strategy without a successful restore does not prove recoverability | Versioned backup inventory and a timed, integrity-checked D1/R2 restore exercise |
| Hosted scheduler | The exact-v12 archive verifier proves the five-minute cron declaration and local invocation passes. Predecessor v8-v11 provider queries produced no scheduled observation. The post-v12 ten-minute broad aggregate returned six `fetch`/`info`/`ok` records and `scheduled=0`; its `errors_only` companion returned zero records. Empty or fetch-only bounded samples do not prove invocation or absence. Log completeness and deployed trigger metadata are unavailable. | Establish Sites cron support and deployed trigger state or move to a supported scheduler; then observe at least three exact-release intervals through authenticated health/provider evidence and exercise a privacy-safe failure alert |
| Sites logging | Provider-generated data, retention, redaction, access, and alerting are not demonstrated | Deployed log sampling, access review, token/PII leak test, and alert exercise |
| Live acceptance | No exact production release has completed controlled real journeys and owner review | Release evidence packet and Aaron's dated acceptance record |

These items constrain affected real-world claims and operations. They do not revoke `AUTH-005` or prevent continued safe implementation and testing.
