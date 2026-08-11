# Provider responsibility, cost, portability, and exit record

**Status:** Production implementation record under `AUTH-005`, reconciled to
`TECH-006`; exact Sites version 16 is owner-private staging/evidence and direct
Cloudflare Workers/D1/R2 is an un-deployed verification candidate—not provider-
account approval, budget approval, SLA evidence, public operation, or live acceptance
**Related decisions:** `TECH-001` through `TECH-006` in
[the decision log](../../DECISION_LOG.md)
**Related:** [Architecture](ARCHITECTURE.md), [Operations](OPERATIONS.md),
[software supply chain](SOFTWARE_SUPPLY_CHAIN.md), [historical exact-v13 release evidence](release-evidence/ROADMAP-SITES-V13-2026-08-09.md),
and [historical exact-v13 local exercises](release-evidence/ROADMAP-SITES-V13-2026-08-09-LOCAL-EXERCISES.md)

`[SUPPORTED BY BUSINESS PLAN V2]` The bounded V1 is a Canada-wide self-serve SaaS
for individual instructors. Provider choices must not introduce mandatory onboarding,
facility administration, native coach-package payment, AI, or hidden concierge work.

Current official Sites guidance prohibits using Sites to enable financial
transactions and states that data residency is unavailable at launch; it also
warns that some background-service or hosting patterns are unsupported. Combined
with open High `LOG-PRIV-001` and unproved Sites cron, that makes Sites unsuitable
as the final paid live-V1 host. `TECH-006` preserves it only as contained private
staging and selects direct Cloudflare as the least-change candidate to verify.

## Current Sites staging observation

| Field | Exact recorded observation |
|---|---|
| Source/runtime and package | Current exact commit `91f37ebd542774779f6db7e000832c2f6714e528`; local archive SHA-256 `9119a848bb8b4c7fff1d810280cf845ec44366449adac3176fd35d8c24438fe6` (3,052,294 bytes; 51 files; 11 migrations); Sites content `sha256:752f05fd957f8f4b043b5955d9cdbdbf2176b0f1f3414827c9c3e8d0f44f6e2c` (51 files; 7,290,880 bytes). The v16 package retains all three observability/logging switches as `false`. |
| Sites identity | Project `appgprj_6a76957326fc819196ebf3a0c95f1ec3`; version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_0a4d7dc3d8108191aa4a1b3e14051a96`; deployment `appgdep_6a7826b2f4c481919cc85665dffa2391`; provider deployment `site---6a76957326fc819196ebf3a0c95f1ec3`; environment revision `18`; final status `succeeded` at `2026-08-09T07:05:36.176024Z` |
| Access, configuration, and safe probes | Owner-only custom access remains one owner, no groups, and no external visitors. Exact `RELEASE_ID`, `APPLICATION_WRITE_MODE=enabled`, `INSTRUCTOR_ACCESS_MODE=owner_private`, `BILLING_CHECKOUT_ENABLED=false`, and four retained secrets are applied. Four post-v16 signed-out HTTPS probes returned outer-policy `401` with `no-store` and `no-referrer`. These are anonymous-containment observations only. |
| Hosted invocation-log enforcement | A value-safe v13 audit found one provider invocation whose query surface returned redaction markers for cookie/SIWC identity fields while network-IP/request-signature fields were nonempty and were not markers. Exact v14 commit `5db791d0d4a7317a2913d2e65d855cb0bb31baec` packaged `observability.enabled=true`, `logs.enabled=true`, and `invocation_logs=false`; after deployment success at `2026-08-09T05:19:27.316512Z`, Sites still returned three fetch records from `05:20:01.195Z` through `05:20:02.531Z` (two `200`, one handled `403`) with the same query-surface classification. V15 configured all packaged observability/logging settings off, but Sites returned three more fetch records at `2026-08-09T05:32:32.228Z`, `05:32:33.881Z`, and `05:32:34.431Z` (two `200`, one handled `403`) under one new script-version identifier, again with query-surface redaction markers on cookie/SIWC identity and nonempty, non-marker network-IP/request-signature fields. Raw field values processed transiently by the connector/tool were not surfaced in the transcript or written to the repository. Collection/storage masking and retained-data disposition remain unknown. This confirms a provider enforcement/configuration limitation, not an application-logger leak. It is High before real-user/public operation; no customer-data incident is claimed for this owner-only/no-customer-data candidate, although network/signature metadata remained available at the query surface. The application D1 audit remains required. |
| Version-16 provider-log posture | V16 retains all three packaged logging switches as `false`. No v16 provider-log query was run because controls were unchanged and additional processing could not close the enforcement or retained-data-disposition gap. V15 remains the latest failed provider sample. `LOG-PRIV-001` remains High/open and blocks any real-user/public operation. |
| Current credential handling | Historical `OWNER-SEC-001` remains complete; no bypass operation or use occurred for v16. `SEC-001` remains **REMEDIATED — RETEST PENDING** until normal signed-in owner behavior is demonstrated. |
| Exact-v16 security/recovery boundary | Generic private/no-store HTML is limited to true top-level document `401`/`403`/`503`/`500` failures; API, RSC, route-handler, asset, and other programmatic clients retain JSON. CSP nonce/security/redirect ordering is preserved. Client request references are UUIDv4-only. Keyed-attempt v2 has a fixed 24-hour lifecycle, v1 retirement, future-clock fence, exact-owner remove, mount/submit expiry in five flows, and no automatic replay. |
| Exact-v16 readiness and local operations | Deep readiness validates exact migration-`0010` abuse-rate-limit shape/PK/index/share-close scopes. Scheduler health samples at most 13 due accounts, reports lower-bound backlog, degrades until drained, and fails closed on assessment errors. Local recovery restored 31/31 tables and synthetic D1/R2 inventory, booted the exact Worker, authenticated profile/package/workspace reads, and returned expected scheduler-failed health. Capacity completed 54 requests with zero failures. These are local-only, not hosted/RPO/RTO/capacity/SLO claims. |
| Historical version-13 package, deployment, and behavior | Commit `f3482845a42730e87f4ff1190550511f19ea6ad5`; submitted local archive SHA-256 `f3c5ce7fc76a52d693f0b1f0fcdfc6385e398cd11df2898a5b66b2d67f09da51` (3,047,466 bytes; 63 entries/51 files; 11 migrations); Sites content `sha256:734a527a2d76322ffa341acb02b3a7f52714179021383430e32e578be0193d99` (51 files; 7,270,400 bytes); saved version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_a050ad7d2e408191a7138c91f93f588c`; deployment `appgdep_6a7801d93d6481918bc66a4df14bbe14`; environment revision `15`; final status `succeeded` at `2026-08-09T04:28:22.001529+00:00`. V13 added fail-closed global write containment, bounded ambiguous-mutation/authoring-draft recovery, stricter compare-and-swap behavior, share lifecycle controls, and exact write-bound receipts. Migration `0010_steep_hemingway` is schema-backward-compatible, but v12 removes these controls; the historical v13-to-v12 path remains class `B` and ordinary rollback is forbidden. |
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
| Automated/local evidence | Two exact-v16 detached clean builds each passed 346/346. Both had 51 files, three allowlisted generated raw differences, and zero normalized differences. Release integrity covered 304 files with zero findings; production audit found zero vulnerabilities. Exact-v16 local recovery restored 31/31 tables and synthetic D1/R2 inventory and booted the exact Worker; capacity completed 54 requests with zero failures. These remain local source/build exercises, not hosted/provider capacity, recovery, RPO/RTO, threshold, or SLO/SLA evidence. Historical v15/v13 and earlier evidence remains preserved. |
| Not demonstrated | Exact-v16 signed-in browser/manual accessibility, authenticated hosted write-mode or CSP-execution journeys; provider enforcement/disposition of hosted logs; hosted scheduler/trigger provisioning, recovery, alert delivery, staffed monitoring, rollback, or measured RPO/RTO. Exact owner-approved consent-policy and privacy-operator configuration remain absent, so deep readiness intentionally degrades. |

These are bounded release observations, not provider SLA, durability, recovery,
regional-processing, account-support, cost, or public-suitability evidence. Sites
versions 6 through 15 remain historical predecessor evidence. `OWNER-SEC-001` is
historically complete and the exposed prior value is provider-invalidated. `SEC-001` is
**REMEDIATED — RETEST PENDING**, not closed, because a normal signed-in owner journey
is still missing. The value-safe hosted log sample instead confirmed the separate
provider-enforcement limitation; no credential or raw log/header value is
reproduced or accepted here.

### Current lineage and precursor normalized-reproducibility observations

Exact version-16 commit `91f37ebd542774779f6db7e000832c2f6714e528`
passed two detached clean builds and 346/346 verification in each. The builds had
identical 51-file inventories; strict comparison reported three allowlisted
generated raw differences and zero normalized differences. The archive, provider
package, saved version, and successful private deployment bind the result to v16.
This does not prove provider-side byte identity, hosted recovery, or acceptance.

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
failed byte-rebuild, proves byte identity, makes version 16 public or accepted, or
establishes rollback/restore suitability.

## Current provider constraint and successor direction

Official guidance was rechecked on 2026-08-09. The
[Sites developer guide](https://learn.chatgpt.com/docs/sites) states that some
background services or hosting patterns may be unsupported, data residency is
unavailable at launch (including Sites code, D1/R2, artifacts, and logs), and Sites
must not be used to process card data or enable financial transactions. It does not
document a cron/scheduled-trigger facility. These are final-host constraints, not
items that an owner approval can waive.

The hosted invocation-log issue is no longer ambiguous. Cloudflare's
[Workers Logs documentation](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
says `invocation_logs=false` disables invocation logs and documents seven days as
the maximum Workers Logs retention. Sites returned invocation records after exact
v14 packaged that setting and again after exact v15 configured all packaged
observability/logging settings off. Exact v16 retains those settings, but no v16
query was run because the unchanged controls and extra processing could not close
the enforcement/disposition gap. The Sites connector provides no log-configuration,
retention, or deletion control. Provider support must demonstrate actual
enforcement and provide a disposition for retained metadata, including applicable
access, retention, and deletion handling, or the application must migrate to a
host that enforces the control, before real-user/public operation. Logging/alerting remains degraded,
the risk is High at that boundary, and Checkout remains disabled. This does not
replace the application-owned D1 audit.

The lack of Sites cron documentation is not direct proof that a trigger is absent.
Combined with `scheduled=0` in bounded predecessor aggregates, it leaves the Sites
trigger unproved. `TECH-006` resolves the architecture direction rather than that
historical fact: direct Cloudflare documents Cron Triggers and documents
`invocation_logs=false`, but neither control is effective release evidence until an
exact successor deployment proves trigger provisioning/execution, privacy-safe log
enforcement and retained-data disposition, heartbeat and alert delivery. Keep Sites
owner-only and Checkout disabled.

## Responsibility boundary

| Service/boundary | Provider responsibility | Roadmap/operator responsibility | Evidence or decision still open |
|---|---|---|---|
| OpenAI Sites staging and its Worker runtime | Private deployment/control-plane behavior, outer owner-only policy, binding delivery, and provider-generated log behavior for the historical staging line | Keep exact v16 private, synthetic, and billing-disabled; preserve release evidence and never rely on the bypass credential | `LOG-PRIV-001`, absent data residency, financial-transaction restriction, and unproved cron prevent final paid/public use. Sites remains staging/evidence only. |
| Direct Cloudflare Workers runtime | Authorized-account control plane, Worker execution, direct cron provisioning, D1/R2 bindings, and enforcement of configured platform controls | Exact generated config, least privilege, secrets, server authorization, privacy-safe logging, heartbeats/alerts, smoke, rollback/forward-fix, cost control, and immutable release evidence | Account, credentials, budget, domain, deployment, terms/privacy/data-residency review, log/cron proof, recovery, alert, cost, and owner acceptance are all absent. |
| Public OIDC provider | Primary authentication, issuer metadata/JWKS, subject continuity, provider session/recovery and support according to the approved contract | Authorization-code/PKCE/state/nonce validation, exact issuer/audience/signature checks, server-side revocable sessions, secure cookies, account isolation/linking, sign-out and audit | Exact provider/account/policy is unselected; no client credentials, hosted flow, account-link/recovery evidence, security review, or public suitability approval exists. Do not silently merge identities by email. |
| Dispatch-owned SIWC | Authentication/session claims delivered at the Sites staging boundary; the connector rotation contract invalidated the exposed prior bypass value | Preserve owner-only staging containment and internal immutable instructor ID; never treat client-supplied identity headers as trusted on a direct host | Normal signed-in owner post-rotation staging retest remains absent; SIWC is superseded for final-host identity under `TECH-006`. |
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
| R2 | Stored bytes, put/get/list/delete operations, egress or retrieval pattern, independent backup copy | Private inventory/checksums, uploads fail closed without approved bounded policy/configuration, format/size limits, lifecycle and budget alerts |
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
| Audit/logs | First-party D1 audit rows are application-owned and remain required | Sites ignored packaged invocation-log disable controls and exposes no connector configuration/retention/deletion control. The query surface returned nonempty, non-marker network/signature fields; collection/storage masking and retained-data disposition are unknown. Preserve only value-safe evidence; require actual provider enforcement plus retained-data disposition, or migrate to a host that enforces the control, before real-user/public operation. |

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
- hosted invocation logs continue after the packaged disable control, or provider
  support cannot supply an enforceable configuration and retained-metadata
  disposition;
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
