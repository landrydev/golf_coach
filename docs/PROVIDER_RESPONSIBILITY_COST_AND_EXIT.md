# Provider responsibility, cost, portability, and exit record

**Status:** Production implementation record under `AUTH-005`, reconciled to the
owner-private Sites version-7 candidate; selected architecture and limited provider
observations, not provider-account approval, budget approval, SLA evidence, public
operation, or live acceptance
**Related decisions:** `TECH-001` through `TECH-004` in
[the decision log](../../DECISION_LOG.md)
**Related:** [Architecture](ARCHITECTURE.md), [Operations](OPERATIONS.md), and
[software supply chain](SOFTWARE_SUPPLY_CHAIN.md)

`[SUPPORTED BY BUSINESS PLAN V2]` The bounded V1 is a Canada-wide self-serve SaaS
for individual instructors. Provider choices must not introduce mandatory onboarding,
facility administration, native coach-package payment, AI, or hidden concierge work.

## Current provider-bound candidate observation

| Field | Exact recorded observation |
|---|---|
| Source/runtime and package | Commit `7ed01ec822fdb5c2bfbe6db7e3c99bcba126ac17`; local gzip SHA-256 `a07f06989d3ba6cf05b924b149fc9f955be512223c6f90d5dd8d7628d175e526` (2,916,309 bytes; 57 entries); Sites content `sha256:4a00694b9798f4f84487e8e7ea224703ccbbfc61a32dd132d417dc65b7f153bc` (45 files; 6,236,160 bytes) |
| Sites identity | Project `appgprj_6a76957326fc819196ebf3a0c95f1ec3`; version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_55fe270d85f081919dcd346c8476130d`; deployment `appgdep_6a772e0616b88191972b4e2e0603da52`; environment revision `9`; succeeded `2026-08-08T13:24:35.466957+00:00` |
| Access and safe probes | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site`. External signed-out probes of `/`, `/app`, `/api/health`, and `/api/operations/health` each returned outer-policy `401`. A separate safe 20-minute provider-worker sample contained three non-truncated fetches: `GET /` 200/ok, `GET /.rsc` 200/ok, and `GET /app.rsc` 403/ok at the expected non-owner application boundary; the immediate error-only sample had zero entries. |
| Renderer sanity | Provider-generated `roadmap-sites-v7-renderer.png`, 1200x750, 77,485 bytes, SHA-256 `b40bdedf6b9307ff1750e6b518b1be619e43ca269ac0451a034b0cbd5e30d609`; visual inspection found no obvious clipping/overlap in the desktop landing hero/nav/sample card. |
| Automated/local | 163/163 tests; 204-file integrity scan with zero secret findings and Business Plan V1 preserved; production dependency audit zero vulnerabilities; no generated schema changes; local recovery exercised 8 migrations and 2 synthetic tenants. |
| Not demonstrated | Exact-v7 authenticated browser/manual accessibility journeys, hosted scheduler, authenticated deep health, alert delivery, staffed monitoring, rollback, D1/R2 restore, or measured RPO/RTO. The browser backend was unavailable. |

These are bounded release observations, not provider SLA, durability, recovery,
regional-processing, account-support, cost, or public-suitability evidence. Sites
version 6 remains historical predecessor evidence. `SEC-001` remains contained and
open pending authorized rotation/revocation and retest; no credential is reproduced
or accepted here.

## Responsibility boundary

| Service/boundary | Provider responsibility | Roadmap/operator responsibility | Evidence or decision still open |
|---|---|---|---|
| OpenAI Sites and Cloudflare Worker runtime | Deployment/control-plane behavior, runtime execution, outer access-policy enforcement, binding delivery, provider logs | Secure application logic, release/configuration control, server authorization, headers, least privilege, smoke/rollback evidence | Public access policy, custom origin, account ownership/support path, hosted alerting/scheduling, terms and budget |
| Dispatch-owned SIWC | Authentication/session claims delivered at the trusted dispatch boundary | Internal immutable instructor ID, tenant authorization, entitlement, account lifecycle, spoof denial, recovery/support workflow | Public Canada-wide suitability, stable subject/continuity, sign-in/out/recovery and provider support evidence |
| Cloudflare D1 | Managed database service and provider-native recovery capabilities according to the current account/plan | Schema/migrations, tenant constraints, query integrity, retention, backups beyond provider limits, restore testing, RPO/RTO | Exact production plan/region, hosted restore result, recovery owner and retention schedule |
| Private Cloudflare R2 | Private object service and its provider durability/operations | Object authorization, D1 metadata/ownership, validation, lifecycle, independent recoverability, cost controls | Media remains excluded; plan/region, recovery design, retention/deletion and exercise remain open |
| Stripe hosted billing | Hosted Checkout/Portal, payment processing, provider billing records, signed event delivery | Exact offer/policy, server-created sessions, webhook verification/idempotency, local entitlement projection, reconciliation, support/refunds under approved policy | Account, Product/Price, tax/refund/failure/cancel/pause rules, webhook ingress, live credentials/transaction and budget |
| Instructor's external action destination | Instructor/provider owns booking, purchase, contact, fulfillment, and coach-package transaction | Validate an HTTPS handoff, warn before leaving, preserve choices, never claim sale/booking completion | Real-world comprehension and external-link support evidence |
| npm/open-source ecosystem | Registry distribution and upstream projects under their terms | Pin/integrity review, SBOM, license/advisory review, regression, emergency updates | Named dependency owner and qualified license-obligation review |
| Domain/DNS, if approved | Registrar/DNS service availability and account controls | Authorized ownership, TLS/redirect/origin configuration, renewal, incident recovery | Domain, account, budget, contacts, and final-origin verification |

Provider controls do not replace application authorization, policy, backup testing,
incident response, or owner acceptance. Application controls do not prove provider
availability, regional handling, contractual commitments, or recoverability.

## Cost-driver model

No provider price or numeric budget is approved here. Current fees and limits are
temporally variable and must be copied from the exact authorized accounts into a
dated, owner-approved cost sheet before public operation.

| Cost family | Primary drivers | Signal and containment |
|---|---|---|
| Sites/Worker | Requests, CPU duration, build/deploy frequency, log volume, scheduled invocations | Provider usage/cost view, route-family telemetry, bounded pagination/work, rate limits, release cadence |
| D1 | Rows/storage, reads/writes, indexes, migrations, backup/export activity | Operations/storage trend, slow/error signals, data minimization, bounded queries, archive/retention policy |
| R2 | Stored bytes, put/get/list/delete operations, egress or retrieval pattern, independent backup copy | Private inventory/checksums, media disabled by default, format/size limits if later approved, lifecycle and budget alerts |
| Stripe | Subscription transactions, refunds/disputes, currency/tax features, webhook/reconciliation work | Stripe reports plus local projection/reconciliation; exact commercial policy and owner budget required |
| Identity/access | Auth/session/provider support load and account-recovery cases | Sign-in failure/support records without personal log content; stop if public support is inadequate |
| Operations | Domain, qualified legal/privacy/accessibility review, support/incident labour, backup storage/exercises, dependency maintenance | Named owner, time by reason, monthly cost review; founder/research time reported separately |

**Recommendation:** `OWNER-PROD-001` should name the budget owner, monthly warning and
stop thresholds for each family, review cadence, and authority to contain abnormal
usage. Do not market "unlimited" behavior or impose an undisclosed limit. No charge,
domain purchase, or provider-plan change is authorized by this recommendation.

## Portability and exit considerations

| Boundary | Portable asset | Lock-in/exit work |
|---|---|---|
| Application | TypeScript/React source, tests, public assets, requirements | vinext, Worker APIs, Sites packaging, bindings, dispatch identity headers, and runtime behavior need replacement/adaptation |
| D1 | Versioned SQLite-oriented schema/migrations and logical data export | Provider migration state, SQL differences, constraints, timestamps, concurrency, backup semantics, and tenant integrity need target validation |
| R2 | Bytes plus checksums and D1 metadata; an S3-compatible transfer may be possible if account features permit | Preserve opaque ownership keys, metadata/object consistency, private serving, lifecycle and deletion evidence; do not rely on same-provider copy as independent recovery |
| SIWC | Internal `instructor_id` keeps tenant ownership separate from the external claim | Migrate identity mappings only through verified reauthentication; invalidate sessions, prevent account takeover/duplication, and publish a support path |
| Stripe | Provider IDs, event receipts, local projection and reconciliation history can be exported/rebuilt | Existing subscriptions/payment methods may not transfer automatically; migration needs provider/legal/customer communication and cannot be inferred from local state |
| Golfer capabilities | Publication records and hashed verifier state remain in D1 | Links are origin/session-policy dependent. A domain/provider move needs tested redirects or intentional link rotation without leaking tokens |
| Domain | An owner-controlled domain improves entry-point portability | Registrar/DNS ownership, renewal, TLS, redirect, cookie/origin and incident controls must be approved and exercised |
| Audit/logs | First-party audit rows are application-owned | Provider operational logs may have separate retention/export limits; preserve only approved privacy-safe incident evidence |

## Exit sequence

1. Record authority, reason, scope, target, data/policy obligations, stop window, and
   accountable operators. Customer communication or account changes require exact
   authorization.
2. Stop new signups and Checkout safely; preserve webhook/event reconciliation and
   do not invent cancellation/refund consequences.
3. Export D1, R2 inventory/objects, configuration, SBOM, audit continuity, identity
   mapping, and Stripe reconciliation references with checksums and access control.
4. Prove target schema, tenant ownership, private-object access, identity migration,
   capability behavior, billing projection, deletion/retention, and recovery in an
   isolated environment.
5. Shift the authorized origin/access policy, rotate environment-specific secrets
   and webhooks, run final-origin security/accessibility/critical-journey checks, and
   retain a tested rollback window.
6. Decommission old services only after integrity, approved retention/deletion,
   billing settlement, legal/privacy, backup, and owner acceptance evidence pass.

## Revisit triggers

Reopen `TECH-001` through `TECH-003` when any of these occurs:

- SIWC cannot provide stable, supportable public identity/recovery for the target users;
- Sites cannot expose signed Stripe webhook ingress while protecting instructor routes;
- hosted scheduling, logs, alerts, or controlled rollback cannot meet operations;
- D1/R2 capacity, consistency, latency, location, backup, RPO/RTO, or deletion behavior fails an approved requirement;
- actual monthly or per-tenant cost crosses an owner-approved warning/stop threshold;
- a provider/security/license incident, material terms change, unsupported runtime, or abandoned dependency changes risk;
- a portability exercise cannot reproduce tenant/data/capability/billing integrity;
- approved scope later adds media, teams/facilities, other jurisdictions, or another need the bounded stack cannot safely satisfy.

The trigger opens an evidence-backed superseding decision; it does not silently
change architecture. Public launch, provider accounts/budgets, billing, retention/legal,
real accounts, and Aaron's exact-release acceptance remain `[OWNER INPUT REQUIRED]`
or external dependencies as recorded in
[owner release decisions](OWNER_RELEASE_DECISIONS_REQUIRED.md).
