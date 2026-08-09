# Provider responsibility, cost, portability, and exit record

**Status:** Production implementation record under `AUTH-005`, reconciled to the
owner-private Sites version-13 candidate; selected architecture and limited provider
observations, not provider-account approval, budget approval, SLA evidence, public
operation, or live acceptance
**Related decisions:** `TECH-001` through `TECH-004` in
[the decision log](../../DECISION_LOG.md)
**Related:** [Architecture](ARCHITECTURE.md), [Operations](OPERATIONS.md),
[software supply chain](SOFTWARE_SUPPLY_CHAIN.md), [exact-v13 release evidence](release-evidence/ROADMAP-SITES-V13-2026-08-09.md),
and [exact-v13 local exercises](release-evidence/ROADMAP-SITES-V13-2026-08-09-LOCAL-EXERCISES.md)

`[SUPPORTED BY BUSINESS PLAN V2]` The bounded V1 is a Canada-wide self-serve SaaS
for individual instructors. Provider choices must not introduce mandatory onboarding,
facility administration, native coach-package payment, AI, or hidden concierge work.

## Current provider-bound candidate observation

| Field | Exact recorded observation |
|---|---|
| Source/runtime and package | Commit `f3482845a42730e87f4ff1190550511f19ea6ad5`; submitted local archive SHA-256 `f3c5ce7fc76a52d693f0b1f0fcdfc6385e398cd11df2898a5b66b2d67f09da51` (3,047,466 bytes; 63 entries/51 files; 11 migrations); Sites content `sha256:734a527a2d76322ffa341acb02b3a7f52714179021383430e32e578be0193d99` (51 files; 7,270,400 bytes) |
| Sites identity | Project `appgprj_6a76957326fc819196ebf3a0c95f1ec3`; version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_a050ad7d2e408191a7138c91f93f588c`; deployment `appgdep_6a7801d93d6481918bc66a4df14bbe14`; environment revision `15`; final status `succeeded`, provider `updated_at` `2026-08-09T04:28:22.001529+00:00` |
| Access, configuration, and safe probes | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site`; `INSTRUCTOR_ACCESS_MODE=owner_private`, `BILLING_CHECKOUT_ENABLED=false`, and `APPLICATION_WRITE_MODE=enabled`. Four post-version-13 signed-out HTTPS probes each returned outer-policy `401`; status only was recorded. These are anonymous-containment observations, not response-header, authenticated application, write-mode, or CSP-execution evidence. No signed-in or manual browser test was performed. |
| Version-13 behavior and rollback boundary | Version 13 adds fail-closed global write containment, bounded ambiguous-mutation and authoring-draft recovery, stricter profile/package compare-and-swap behavior, share revoke/reissue lifecycle controls, and exact write-bound receipts while retaining version-12 golfer-response recovery. Migration `0010_steep_hemingway` is schema-backward-compatible, but version 12 removes these application controls. The v13-to-v12 path is therefore class `B`; ordinary rollback is forbidden because application behavior and security regress even though the migration is backward compatible. |
| Version-13 credential handling | No bypass credential was generated, read, or used. Historical `OWNER-SEC-001` remains complete; `SEC-001` remains **REMEDIATED — RETEST PENDING** until normal signed-in owner and meaningful privacy-safe hosted-log evidence exists. |
| Historical version-12 package and deployment | Commit `7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c`; submitted archive SHA-256 `994f725ba6c5952c45885a4d72d38804f1b10b8440273dc26ac8bd1c38d2bd75` (2,967,333 bytes; 61 entries/49 files; 10 migrations); Sites content `sha256:0805c04e9dcd5e8bac77f58aec2362dece1754f6eec63ec73d9c2e249bb01700` (49 files; 6,748,160 bytes); saved version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_8868e09fcb28819181cfbebdf82ce73f`; deployment `appgdep_6a77c5c85974819185ce1c8caf13007c`; environment revision `14`; final status `succeeded`, provider `updated_at` `2026-08-09T00:12:04.939300+00:00`. Version 12 introduced operation-keyed golfer-response durability, so its historical v12-to-v11 path remains class `B`. See the [exact v12 record](release-evidence/ROADMAP-SITES-V12-2026-08-09.md). |
| Historical version-11 package and deployment | Commit `44670a64498779cf747914b4465380916a939301`; submitted archive SHA-256 `d88be6513bc58afd057d4a3fb3a6d64b744f7a5c359731ec9fc693a788e1fa0e` (2,966,073 bytes; 61 entries/49 files; 10 migrations); Sites content `sha256:d717035871790252548e7fff4e1192e590b73b7cabfe3f4c011d65ffe4493daa` (49 files; 6,737,920 bytes); saved version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_4c49cdec72bc8191aeece01f5689e51a`; deployment `appgdep_6a77b01714b881918245bb5248349e0d`; environment revision `13`; final status `succeeded`, provider `updated_at` `2026-08-08T22:40:07.742084+00:00`. Version 11 introduced nonce-bound framework scripts, so its historical v11-to-v10 rollback boundary remains class `B`. Its exact local recovery/capacity exercises remain historical predecessor evidence. |
| Historical version-10 package and deployment | Commit `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1`; submitted archive SHA-256 `5d67423e253009714bebe85bba118ded922c9f6b30b926f2af7bd0e3d05cd953` (2,965,930 bytes; 61 entries/49 files; 10 migrations); Sites content `sha256:0534d35af6fcdd8a0f104c5bb21fab5edd0641ec952bd32ae7a3f9c024c62033` (49 files; 6,737,920 bytes); saved version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_1007b9b4ea8c8191968d55991abf374c`; deployment `appgdep_6a779cabaec4819191b0cf1e815ce2e5`; environment revision `12`; final status `succeeded`, provider `updated_at` `2026-08-08T21:17:13.525116+00:00`. Its four signed-out route probes returned `401`/`no-store`/`no-referrer`. This evidence remains historical and does not approve rollback. |
| `OWNER-SEC-001` rotation | Aaron authorized the operation on 2026-08-08. One value-safe Sites rotation succeeded from `2026-08-08T18:32:25.588Z` through `2026-08-08T18:32:31.831Z`; the connector contract immediately invalidated the exposed prior bypass value. The replacement was not displayed, persisted, or used. Access remained `custom` revision 1 with one owner, zero groups, and zero external visitors. Four historical post-operation signed-out routes returned `401`/`no-store`/`no-referrer`. A 15-minute Worker query returned zero events and was inconclusive; the original value was not replayed and normal signed-in owner operation remains untested. See the [rotation evidence](release-evidence/ROADMAP-SITES-V9-2026-08-08-sec001-rotation.md). |
| Sanitized version-8-era log continuity | A read-only query started `2026-08-08T17:27:16.287Z`, completed `2026-08-08T17:27:17.305Z`, and requested 90 minutes from `2026-08-08T15:57:16.287Z`, limit 100, `errors_only=false`. It returned 24 events dated `16:37:26.325Z` through `17:16:40.472Z`: `fetch` 24, outcome `ok` 24, status `200` 23 and handled `403` 1. No scheduled event appeared. Only static route/count metadata was retained; no headers, identities, IPs, IDs, query strings, full URLs, messages, payloads, stacks, or credentials were recorded. This does not prove completeness, health, redaction, alerts, or scheduler operation. |
| Post-version-9 logs | A 15-minute error-filtered query started `2026-08-08T17:41:24.033Z` and returned one handled `/app.rsc` `403` at level `info`/outcome `ok`, so zero error-level, exception, or crash events but one total filtered record. A separate 15-minute broad query started `2026-08-08T17:43:15.519Z` and returned three `fetch`/`ok` events (two `200`, one `403`) and zero scheduled events. These bounded samples do not prove error-free operation or a missing trigger. |
| Post-version-10 logs | The final 30-minute query completed at `2026-08-08T21:31:05.892Z`, 14 minutes 38 seconds after the final deployment began and after the `21:20`, `21:25`, and `21:30` expected five-minute boundaries. It returned zero events and zero scheduled events. This strengthens the suspected scheduler gap but remains inconclusive because log completeness and scheduled-event visibility are unconfirmed; it proves neither error-free operation, redaction, alert delivery, nor authenticated health and closes no operational finding. |
| Post-version-11 logs and scheduler package boundary | The initial 30-minute provider-log aggregate at `2026-08-08T22:58:53.646Z` returned exactly three `fetch`/`info`/`ok` events and `scheduled=0`; its `errors_only` companion returned one handled non-error event. A newer 30-minute broad query and its companion were empty around `2026-08-08T23:20:16.850Z`. The later 60-minute aggregate at `2026-08-08T23:23:52.288Z` returned exactly three `fetch`/`info`/`ok` events with HTTP statuses `200`, `200`, and handled `403`, and `scheduled=0`; its `errors_only` companion returned the handled `403`. No raw events or content were emitted or retained. The exact archive verifier separately confirmed the scheduler-manifest invariant in the 49-file version-11 package. These aggregates strengthen the `OPS-CRON-001` suspicion but remain inconclusive because provider-log completeness, scheduled-event visibility, and trigger metadata were unavailable. They prove neither scheduler absence nor error-free operation, and the archive invariant proves packaging only rather than hosted scheduler provisioning, execution, logs, or alert delivery. |
| Post-version-12 logs | The bounded ten-minute `errors_only` aggregate returned zero records. Its broad companion returned six `fetch`/`info`/`ok` records: HTTP `200`, `200`, and handled `403` twice, with `scheduled=0`. These aggregates remain inconclusive because provider-log completeness, scheduled-event visibility, and trigger metadata were unavailable. They prove neither scheduler absence nor error-free operation, redaction, authenticated health, or alert delivery. |
| Version-9 predecessor artifact boundary | The release-time exact-build version-9 archive inspection passed: 61 safe entries/49 files, 23 source-mapped files, all 10 migrations, exactly 2 expected generated credential files, 0 unexpected copies or paths, and `localBuildCompared: true`. A later retrospective inspection also passed its narrower scope; the subsequently rebuilt working-tree `dist` is not treated as the submitted build. An isolated clean-checkout build passed behavior but did not byte-match the archive, so deterministic byte identity remains unproved for version 9. |
| Automated/local evidence | Two exact-version-13 detached clean installs each installed 501 locked packages, reported five blocked scripts, and passed build, lint, strict types, artifact checks, and 332/332 tests with no failures, skips, or todos. Both builds had 51 files, three expected generated raw differences, and zero normalized differences. The pre-freeze integrity scan covered 297 source/evidence text files with zero findings, preserved Business Plan V1, and confirmed the unchanged lockfile; the production audit reported zero vulnerabilities. Exact-v13 local recovery applied 11 migrations, covered 31 tables across 2 tenants, restored 3 private objects/199 bytes, matched the 34,380-byte snapshot SHA-256 `8eaef0372bf2e4457ab651ec5c7bb3e3b22a51289495187761622fede0a1b139`, passed 3 negative and environment-isolation checks, and took 104,421 ms, which is not an RTO or RPO result. Exact-v13 local capacity completed 54 requests at concurrency 4 with 44 `200`, 10 `201`, 0 failures, and p50/p95/max 46.60/103.30/103.62 ms. See the [canonical v13 record](release-evidence/ROADMAP-SITES-V13-2026-08-09-LOCAL-EXERCISES.md). These remain local synthetic results rather than hosted/provider capacity, recovery, rollback, RPO/RTO, threshold, or SLO/SLA evidence. Historical v12/v11 evidence remains preserved. |
| Not demonstrated | Exact-v13 signed-in browser/manual accessibility, authenticated write-mode, or CSP-execution journeys; hosted scheduler/trigger provisioning, alert delivery, staffed monitoring, rollback, D1/R2 restore, or measured RPO/RTO. Deep readiness is intentionally degraded because exact owner-approved consent-policy content/version and privacy-operator access configuration are absent. |

These are bounded release observations, not provider SLA, durability, recovery,
regional-processing, account-support, cost, or public-suitability evidence. Sites
versions 6 through 12 remain historical predecessor evidence. `OWNER-SEC-001` is
historically complete and the exposed prior value is provider-invalidated. `SEC-001` is
**REMEDIATED — RETEST PENDING**, not closed, because a normal signed-in owner journey
and meaningful privacy-safe hosted log/redaction sample are still missing. No
credential is reproduced or accepted here.

### Current and precursor normalized-reproducibility observations

Exact version-13 commit `f3482845a42730e87f4ff1190550511f19ea6ad5`
passed two distinct detached clean checkouts. Each locked install contained 501
packages, kept the same five install scripts blocked, and passed 332/332
verification with no failures, skips, or todos. The builds had identical 51-file
inventories. Strict comparison reported three expected generated raw differences
and zero normalized differences. The exact archive and provider
records bind that normalized-reproducibility result to the saved/deployed
owner-private candidate; they do not prove provider-side byte identity.

Historical exact version-12 commit
`7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c` passed the predecessor control with
501 packages, five blocked scripts, 242/242 verification, identical 49-file
inventories, three controlled raw differences, and zero normalized differences.
Its immutable release record remains historical; it is not a safe ordinary
rollback target from version 13.

Historical exact version-11 commit
`44670a64498779cf747914b4465380916a939301` passed the same control with 501
packages, five blocked scripts, 237/237 verification, identical 49-file
inventories, three controlled raw differences, and zero normalized differences.
That immutable predecessor evidence does not make version 11 a safe rollback
target from version 13.

Historical exact version-10 commit
`ae35ef25ed46563f6b8f09f5c22dc12581eff8b1` passed the same two-build control with
501 packages, five blocked scripts, 234/234 verification, identical 49-file
inventories, the same three controlled raw differences, and zero normalized
differences. The
[exact version-10 record](release-evidence/ROADMAP-SITES-V10-2026-08-08.md)
remains immutable predecessor evidence; it does not change the historical
version-11-to-10 class-`B` CSP boundary.

Exact precursor commit `66f5203a913f01c8da20555feebdbb99152c052c`
previously passed the same prospective control; its
[precursor record](release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md)
remains separate historical evidence. None of these results alters version 9's
failed byte-rebuild, proves byte identity, makes version 13 public or accepted, or
establishes rollback/restore suitability.

## Current official-provider ambiguity and constraint

Official guidance was checked on 2026-08-08. The
[Sites developer guide](https://learn.chatgpt.com/docs/sites) states that some
background services or hosting patterns may be unsupported and directs builders
not to use Sites to enable financial transactions. It does not document a
cron/scheduled-trigger facility. The
[Sites help article](https://help.openai.com/en/articles/20001339) also warns that
some background services may be unsupported and says the operator remains
responsible when using a third-party payment processor.

The lack of cron documentation is an ambiguity, not direct proof that a trigger is
absent. Combined with `scheduled=0` in the bounded post-version-11 and
post-version-12 broad aggregates,
it makes a deployment/trigger gap a working suspicion only. Provider-log
completeness, scheduled-event visibility, and trigger metadata remain unavailable,
so this does not prove scheduler absence. Before scheduled reconciliation, public
access, or billing becomes an operational dependency, obtain explicit provider
confirmation that the required background and payment pattern is supported, or
record a superseding hosting/scheduler decision and exercise that architecture. Keep
Checkout disabled in the meantime. An owner approval cannot override an actual
provider constraint.

## Responsibility boundary

| Service/boundary | Provider responsibility | Roadmap/operator responsibility | Evidence or decision still open |
|---|---|---|---|
| OpenAI Sites and Cloudflare Worker runtime | Deployment/control-plane behavior, runtime execution, outer access-policy enforcement, binding delivery, provider logs | Secure application logic, release/configuration control, server authorization, headers, least privilege, smoke/rollback evidence | Public access policy, custom origin, account ownership/support path, explicit provider confirmation or superseding decision for background scheduling and payment architecture, hosted alerting/scheduling, terms and budget |
| Dispatch-owned SIWC | Authentication/session claims delivered at the trusted dispatch boundary; the connector rotation contract invalidated the exposed prior bypass value | Internal immutable instructor ID, tenant authorization, entitlement, account lifecycle, spoof denial, recovery/support workflow, and keeping the replacement bypass bearer unused | Normal signed-in owner post-rotation retest, meaningful privacy-safe log/redaction sample, public Canada-wide suitability, stable subject/continuity, sign-in/out/recovery and provider support evidence |
| Cloudflare D1 | Managed database service and provider-native recovery capabilities according to the current account/plan | Schema/migrations, tenant constraints, query integrity, retention, backups beyond provider limits, restore testing, RPO/RTO | Exact production plan/region, hosted restore result, recovery owner and retention schedule |
| Private Cloudflare R2 | Private object service and its provider durability/operations | Object authorization, D1 metadata/ownership, validation, lifecycle, independent recoverability, cost controls | Media remains excluded; plan/region, recovery design, retention/deletion and exercise remain open |
| Stripe hosted billing | Hosted Checkout/Portal, payment processing, provider billing records, signed event delivery | Exact offer/policy, server-created sessions, webhook verification/idempotency, local entitlement projection, reconciliation, support/refunds under approved policy | Sites guidance currently directs builders not to use Sites to enable financial transactions; provider confirmation or superseding hosting decision, account, Product/Price, policy, webhook ingress, credentials/transaction and budget remain open |
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
- Sites cannot expose signed Stripe webhook ingress while protecting instructor routes,
  or the provider does not confirm that the intended third-party payment pattern is
  supportable under current guidance;
- hosted scheduling/background services, logs, alerts, or controlled rollback cannot
  be confirmed or meet operations;
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
