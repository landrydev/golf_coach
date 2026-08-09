# Production Operations Handbook

**Document status:** Operating model and runbook specification under `AUTH-005`; not evidence that production is provisioned, live, monitored, backed up, recoverable, or accepted
**System:** [Production SaaS Architecture](ARCHITECTURE.md)
**Security/privacy controls:** [Security and Privacy Plan](SECURITY_PRIVACY.md)
**Last updated:** 2026-08-09

## Operating position

`AUTH-005` authorizes deployment preparation, release, and operation of the bounded Canada-wide self-serve V1. The retired design gate does not block implementation. The checks in this handbook are operational safety controls and evidence requirements; they are not a renamed product phase gate.

An owner-only Sites production release now exists. Its exact URL, source commit,
version, deployment, access policy, environment revision, hashes, and bounded smoke
results are recorded in [Release Evidence](RELEASE_EVIDENCE.md). That deployment is
not a public launch or Aaron's acceptance. No successful hosted backup/restore or rollback
exercise, staffed operating assignment, alert-delivery exercise, live Stripe flow,
qualified legal/privacy review, or controlled real-user validation is claimed.

The current exact private candidate is Sites version 12 at source/runtime release
`7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c`, saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_8868e09fcb28819181cfbebdf82ce73f`,
deployment `appgdep_6a77c5c85974819185ce1c8caf13007c`, and environment
revision `14`. The deployment status is `succeeded` with provider `updated_at`
`2026-08-09T00:12:04.939300+00:00` and no recorded failure. The URL remains
`https://roadmap-golf-coaching.aar-landry.chatgpt.site`. The saved Sites archive is
`sha256:0805c04e9dcd5e8bac77f58aec2362dece1754f6eec63ec73d9c2e249bb01700`
with 49 files and 6,748,160 bytes. The submitted local archive is
`outputs/roadmap-sites-v12-7b77e65.tar.gz`, 2,967,333 bytes with 61 entries/49
files, all ten migrations, and gzip SHA-256
`994f725ba6c5952c45885a4d72d38804f1b10b8440273dc26ac8bd1c38d2bd75`.
Checkout remains disabled and access remains owner-only.

The superseded owner-only version-11 candidate remains immutable historical
evidence at commit `44670a64498779cf747914b4465380916a939301`, saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_4c49cdec72bc8191aeece01f5689e51a`,
deployment `appgdep_6a77b01714b881918245bb5248349e0d`, and environment
revision `13`. Its final provider status was `succeeded` with `updated_at`
`2026-08-08T22:40:07.742084+00:00`. Its submitted archive was 2,966,073 bytes
with 61 entries/49 files and gzip SHA-256
`d88be6513bc58afd057d4a3fb3a6d64b744f7a5c359731ec9fc693a788e1fa0e`;
the Sites package was
`sha256:d717035871790252548e7fff4e1192e590b73b7cabfe3f4c011d65ffe4493daa`
with 49 files and 6,737,920 bytes. Its exact local recovery and bounded-capacity
exercises remain historical evidence and are not relabelled as version-12 results.

The superseded owner-only version-10 candidate remains immutable historical
evidence at commit `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1`, saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_1007b9b4ea8c8191968d55991abf374c`,
deployment `appgdep_6a779cabaec4819191b0cf1e815ce2e5`, and environment
revision `12`. Its final provider status was `succeeded` with `updated_at`
`2026-08-08T21:17:13.525116+00:00`. Its submitted archive was 2,965,930 bytes
with 61 entries/49 files and gzip SHA-256
`5d67423e253009714bebe85bba118ded922c9f6b30b926f2af7bd0e3d05cd953`;
the Sites package was
`sha256:0534d35af6fcdd8a0f104c5bb21fab5edd0641ec952bd32ae7a3f9c024c62033`
with 49 files and 6,737,920 bytes. Its four signed-out route probes returned
`401` with `no-store`/`no-referrer`. Those facts are not overwritten by v12 and
do not make v10 a current rollback target.

Version 12 changes lost-ack behavior relative to version 11. Golfer-response writes
now require an account-and-resolved-session-scoped `Idempotency-Key`; deterministic
HMAC response/audit receipts make an exact replay return the original result while
a changed payload is rejected. A version-12 client can also remain active across a
deployment boundary while holding an outcome-unknown key, but version 11 returns a
legacy payload and performs no same-key deduplication. The v12-to-v11 path is
therefore security/behavior class `B`, not ordinary class `N`, even though the
migration journal remains unchanged through `0009`. Ordinary rollback to version
11 is forbidden. The historical v11-to-v10 CSP regression also remains class `B`:
version 10 removes per-response framework-script nonces and reintroduces
`script-src 'unsafe-inline'`. The older v10-to-v9 application/schema class-`N`
observation remains historical evidence only.

Operationally, the golfer client bounds an attempt at 10 seconds and keeps an
outcome-unknown key in per-tab `sessionStorage` across reloads until a definitive
result or tab close. The server returns `201` for the first write, `200` for an
exact replay, and `409` for changed input under the same key; raw keys are not
server-persisted or logged. External-handoff clicks use fresh keys and are not
cross-click deduplicated.

Version 12 was independently checked in two detached clean worktrees. Each
`npm ci --no-audit` installed 501 locked packages and reported five blocked
install scripts; each `npm run verify` passed 242/242 tests. Both builds contained
the same 49 files. Raw differences were confined to the three controlled generated
files and strict allowlisted normalization left zero differences. The production
dependency audit reported zero vulnerabilities, and the release-integrity scan
covered 261 source/evidence text files with zero findings while preserving
historical Business Plan V1. This is normalized reproducibility, not byte identity.

Two historical exact-version-11 local synthetic exercises passed against release
`44670a64498779cf747914b4465380916a939301`. The recovery exercise applied all 10
migrations, covered all 31 application tables across 2 synthetic tenants, restored
3 private synthetic objects, and matched a 34,380-byte D1 snapshot with SHA-256
`34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54`.
All three negative integrity checks passed and the subprocess secret-isolation
boundary held. Its 103,656 ms duration is local wall-clock time, not an RTO.
The capacity exercise completed 54 requests at maximum concurrency 4 with
44 `200`, 10 `201`, and 0 failures; its local overall latency was p50 48.46 ms,
p95 107.60 ms, and maximum 107.83 ms. These are exact-commit local observations,
not hosted recovery, RPO/RTO, provider backup, rollback, production capacity,
SLO/SLA, sustained-load, or network-latency evidence. See the
[canonical exact-version-11 local exercise record](release-evidence/ROADMAP-SITES-V11-2026-08-08-LOCAL-EXERCISES.md).

The earlier successor-source exercise at commit
`66f5203a913f01c8da20555feebdbb99152c052c` used two independently created
detached clean worktrees. Each `npm ci --no-audit` installed 501 locked packages
and reported five blocked install scripts; each `npm run verify` passed 234/234
tests. Both builds contained the same 49 paths. Strict allowlisted normalization
of the framework-generated build identifier and matching prerender-manifest pair
left zero differences. The [successor record](release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md)
is exact to `66f5203a...`; the later exact v10, v11, and v12 checks do not change the
failed historical version-9 byte comparison.

After version 11 deployed, four signed-out HTTPS probes to `/`, `/app`,
`/api/health`, and `/api/operations/health` ran from
`2026-08-08T22:40:40.8612310Z` through `2026-08-08T22:40:42.0058063Z`. Each
returned the owner-only outer-policy `401` with `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`. These are transport/header/anonymous-containment
observations, not authenticated application, CSP execution, deep-health, or journey
evidence. A signed-in hosted browser was unavailable, so the nonce-bearing hosted
HTML and framework-script execution were not inspected through the intended owner
experience.

After version 12 deployed, four fresh signed-out HTTPS probes remained at the
owner-only outer policy and returned `401` with `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`. These are transport/header/anonymous-containment
observations only. The supported in-app browser runtime had no available browser,
so no signed-in owner journey, manual accessibility result, CSP execution result,
or authenticated application behavior is claimed for version 12.

Aaron authorized `OWNER-SEC-001` on 2026-08-08. One value-safe Sites rotation ran
from `2026-08-08T18:32:25.588Z` through `2026-08-08T18:32:31.831Z` and succeeded;
the connector contract immediately invalidated the exposed prior bypass value. The
replacement bearer was not displayed, persisted, copied, stored, or used. The Sites
policy remained `custom` revision 1 with one owner, zero groups, and zero external
visitors. Fresh signed-out probes of the same four routes again returned `401` with
`no-store` and `no-referrer`. A subsequent 15-minute Worker query returned zero
events and is inconclusive for leakage or redaction. The original secret was not
replayed, and no signed-in owner browser was mounted, so `SEC-001` is
**REMEDIATED — RETEST PENDING**, not closed. See the
[OWNER-SEC-001 rotation evidence](release-evidence/ROADMAP-SITES-V9-2026-08-08-sec001-rotation.md).

A read-only version-8-era continuity query started at
`2026-08-08T17:27:16.287Z`, completed at `2026-08-08T17:27:17.305Z`, and requested
the preceding 90 minutes from `2026-08-08T15:57:16.287Z` with limit 100 and
`errors_only=false`. It returned 24 events dated from
`2026-08-08T16:37:26.325Z` through `2026-08-08T17:16:40.472Z`: all were `fetch`
with Worker outcome `ok`, with 23 status `200` and one handled status `403`.
Route counts were `/` 2, `/.rsc` 2, `/app.rsc` 7, `/app/billing.rsc` 2,
`/app/golfers.rsc` 1, `/app/packages.rsc` 2, `/app/settings.rsc` 3,
`/app/settings/data.rsc` 2, and `/privacy.rsc`, `/support.rsc`, and `/terms.rsc`
1 each. No scheduled event appeared in that bounded snapshot. The recorded
appendix excludes headers, cookies, identities, IPs, request/ray IDs, query
strings, full URLs, messages, payloads, stack traces, and credential values.
It proves only that the provider returned those invocations; it does not prove
log completeness, retention, redaction, authenticated success, application
health, alert delivery, or scheduler operation.

A fresh post-version-9 error-filtered read started at
`2026-08-08T17:41:24.033Z`, completed at `2026-08-08T17:41:25.057Z`, and requested
15 minutes from `2026-08-08T17:26:24.033Z` with limit 100. The provider's broad
error filter returned one handled non-owner `/app.rsc` `403` at
`2026-08-08T17:36:51.476Z`; it was level `info`, `fetch`, and outcome `ok`.
Accordingly, zero error-level, exception, or crash events were returned, but the
query result count was one rather than zero. A separate bounded post-version-9
query at `2026-08-08T17:43:15.519Z` requested 15 minutes with limit 100 and
`errors_only=false`; it returned three `fetch`/`ok` events (two `200`, one `403`)
and zero scheduled events. These short samples do not prove an error-free release.

The final 30-minute post-version-10 Worker-log query completed at
`2026-08-08T21:31:05.892Z`, 14 minutes 38 seconds after the final deployment began
and after the `21:20`, `21:25`, and `21:30` expected five-minute boundaries. It
returned zero events and zero scheduled events. This strengthens the suspected hosted
scheduler gap, but remains inconclusive because log completeness and scheduled-event
visibility are unconfirmed. The empty sample does not establish error-free operation,
redaction, alert delivery, or authenticated health and adds no closure evidence for
`SEC-001`, `AUTH-EVID-001`, `OPS-CRON-001`, or `OPS-EVID-002`.

The initial post-version-11 provider-log aggregate was captured at
`2026-08-08T22:58:53.646Z`, 19 minutes 23 seconds after deployment success and
after the `22:45`, `22:50`, and `22:55` expected five-minute boundaries. Its
30-minute broad window returned exactly three events: `fetch=3`, `outcome ok=3`,
`level info=3`, and `scheduled=0`. The companion `errors_only` query returned
exactly one `fetch`/`info`/`ok` event with zero error fields. Neither query emitted
raw events. This strengthens the `OPS-CRON-001` suspicion but remains inconclusive:
provider-log completeness, scheduled-event visibility, and trigger metadata were
unavailable. It does not prove scheduler absence or error-free operation.

A later value-safe audit added two bounded observations. A newer 30-minute broad
query and its `errors_only` companion completed around
`2026-08-08T23:20:16.850Z` and returned no events. The 60-minute aggregate captured
at `2026-08-08T23:23:52.288Z` returned exactly three `fetch`/`info`/`ok` events
with HTTP statuses `200`, `200`, and handled `403`, and `scheduled=0`; its
`errors_only` companion returned the single handled `fetch`/`info`/`ok` `403`.
No raw events or raw content were emitted or retained. The different bounded
windows do not establish completeness, absence, or error-free operation. Provider
log completeness, scheduled-event visibility, and trigger metadata remained
unavailable, so the later observations remain inconclusive for `OPS-CRON-001`.

The exact version-11 archive verifier confirmed the scheduler-manifest invariant:
the packaged Worker configuration contains the expected five-minute cron. That is
package evidence only. The final aggregate's `scheduled=0` is a bounded
provider-returned observation, not proof that no hosted invocation occurred, and
provider trigger inventory was unavailable. Hosted scheduler provisioning and
execution therefore remain unproven.

The bounded post-version-12 ten-minute provider-log aggregates remain similarly
inconclusive. The `errors_only` query returned zero records. The broad aggregate
returned six `fetch`/`info`/`ok` records: HTTP `200`, `200`, and handled `403`
twice, with `scheduled=0`. This is not proof of complete logs, error-free operation,
redaction, authenticated health, scheduler absence, or scheduler operation.

The packaged scheduled handler and local heartbeat evidence exist, but the bounded
provider aggregates returned no scheduled event. A missing or unprovisioned
production cron trigger is therefore a working suspicion, not a confirmed diagnosis:
the inspected evidence cannot distinguish a deployment trigger gap from no visible
invocation in the sampled windows or incomplete provider logs. Do not rely on hosted
scheduling until trigger configuration and an actual hosted invocation are
independently demonstrated.

Current official-provider guidance was checked on 2026-08-08. The
[Sites developer guide](https://learn.chatgpt.com/docs/sites) says some background
services or hosting patterns may be unsupported and directs builders not to use
Sites to enable financial transactions; it does not document a cron/scheduled-trigger
facility. The [Sites help article](https://help.openai.com/en/articles/20001339)
likewise warns that some background services may be unsupported and places
responsibility for third-party processor payments on the operator. Silence about a
cron facility is provider ambiguity, not proof that no trigger can exist. Obtain
explicit provider confirmation of the intended scheduler and payment architecture,
or record and verify a superseding hosting/scheduler decision, before depending on
hosted reconciliation, enabling Checkout, or expanding to public/paid operation.

The existing exact version-8 artifact evidence closed `SEC-003` for its
build-generated prerender credential boundary; the bounded version-9 retrospective
inspection is additional continuity evidence, not a replacement exact-build
attestation. `OWNER-SEC-001` is recorded and the exposed prior value was invalidated
by the provider rotation contract. `SEC-001` remains **REMEDIATED — RETEST PENDING**
until a normal signed-in owner journey and a meaningful privacy-safe hosted
log/redaction sample pass; the original value was intentionally not recovered for
replay. Consent-policy-registry and privacy-operator owner decisions and configuration
also remain absent; those controls fail closed and deep readiness is intentionally
degraded.

`[SUPPORTED BY BUSINESS PLAN V2]` Normal operation must remain self-serve for an individual instructor. It must not rely on scheduled onboarding, custom setup, concierge roadmap creation, or facility administration. Support activity is logged so hidden founder labor is not mistaken for product performance.

## Operational responsibilities

One person may hold several roles initially, but each responsibility needs a named human before live operation. Repository automation is not an accountable owner.

| Role | Responsibilities | Current assignment evidence |
|---|---|---|
| Service owner | Scope, risk acceptance, public release, provider budgets, commercial policy, live acceptance | Aaron is the owner decision authority; day-to-day assignment still needs a release record |
| Release operator | Sites deployment, configuration inventory, migrations, smoke checks, rollback, release log | Unresolved |
| Security incident lead | Triage, containment, evidence handling, secret/capability rotation, recovery coordination | Unresolved |
| Privacy/data-request lead | Intake, identity verification, access/correction/export/deletion workflow, legal escalation | Unresolved |
| Billing operator | Stripe configuration, webhook reconciliation, disputes/refunds under approved policy, customer/account correction | Unresolved |
| Support owner | Instructor support intake, classification, response, escalation, intervention-time recording | Unresolved |
| Backup/recovery owner | Backup monitoring, restore exercises, recovery evidence, retention alignment | Unresolved |
| Dependency owner | Runtime/dependency updates, advisory triage, regression evidence, emergency patching | Unresolved |

`[OWNER INPUT REQUIRED]` Aaron must designate accountable operators and an escalation route before unattended real-user operation. This is an operational dependency, not a restriction on ongoing implementation.

## Environment model

| Environment | Intended use | Data | Provider mode | Promotion rule |
|---|---|---|---|---|
| Local | Development and automated checks | Synthetic/generated fixtures only | Local Sites simulation; Stripe fake/test behavior | Never promoted as a live URL |
| Preview | Integrated production-like verification | Approved non-production accounts and non-sensitive fixtures | Separate preview bindings and Stripe test mode | No real customer onboarding, customer messages, or live charges |
| Production | Authorized real adult instructors and golfer records | Data collected under published policy | Production Sites, D1, R2, SIWC, Stripe, domain, logs, and alerts | Exact release/configuration recorded and controlled checks completed |

Environment identity must be visible to operators and machine-checkable. Preview and production must not share D1 databases, R2 buckets, Stripe secrets, webhook secrets, capability peppers, or other credentials. A production build must not contain a development secret or synthetic shortcut.

## Configuration and secret inventory

The inventory records a name, purpose, environment, provider owner, last rotation/check, consumers, and rotation procedure. It never records the secret value.

| Item | Type | Operational rule |
|---|---|---|
| D1 `DB` binding | Sites-managed resource binding | Separate per environment; migration version and backup source recorded |
| R2 binding | Sites-managed resource binding | Private; separate per environment; object lifecycle and inventory monitored |
| Sites SIWC bypass bearer | Provider-managed credential | The exposed prior value was invalidated by one authorized provider rotation; the replacement was not displayed, persisted, or used. Available tooling exposes rotation rather than revoke-only disablement. Keep it unused and keep access owner-only pending the signed-in owner and hosted-log retest. |
| Share-token pepper | Runtime secret | Unique per environment; rotation plan accounts for active capabilities rather than silently breaking them |
| Abuse-limit pepper | Runtime secret | Unique and independent per environment; rotation resets non-reversible short-lived counters and must be correlated with the release |
| Owner-private access pepper | Runtime secret | At least 32 characters, unique and independent; rotate atomically with every owner-email HMAC digest |
| Owner-private email digests | Runtime configuration | Comma-separated HMAC-SHA-256 hex digests only; never plaintext email |
| Data-request operator access pepper | Runtime secret | At least 32 characters and independent from product-access and abuse-control peppers; rotate atomically with every privacy-operator digest |
| Data-request operator email digests | Runtime configuration | Unique comma-separated HMAC-SHA-256 digests of normalized SIWC email only; missing/invalid configuration fails the operator API closed and never falls back to owner or subscriber status |
| Subscription access statuses | Runtime configuration | Explicit owner-approved status list; there is no code default |
| Checkout enabled policy | Runtime configuration | `BILLING_CHECKOUT_ENABLED` must be the exact canonical `true` or `false`; missing or malformed values fail health and keep Checkout unavailable |
| Consent policy registry | Runtime configuration | `CONSENT_POLICY_REGISTRY_JSON` contains only exact owner-approved purpose versions, descriptions, and subject types. Missing/invalid/unlisted entries grant nothing; a wording change requires a version change. Configuration permits recording choices but does not enable optional processing. |
| Stripe secret key | Runtime secret | Test/live modes separated; least privilege where provider permits; rotate on suspected exposure |
| Stripe webhook secret | Runtime secret | Endpoint- and environment-specific; verify against raw body; rotate with overlap/replay plan |
| Stripe Checkout Price ID | Runtime configuration, not a secret | `STRIPE_CHECKOUT_PRICE_ID` must identify the exact approved product/price; browser values never override it |
| Recognized Stripe Price IDs | Runtime configuration, not a secret | `STRIPE_RECOGNIZED_PRICE_IDS` lists every current or historical Price whose provider state may update the projection |
| Entitlement Stripe Price IDs | Runtime configuration, not a secret | `SUBSCRIPTION_ENTITLEMENT_PRICE_IDS` is an explicit recognized-Price subset allowed to grant product access |
| Maximum subscription projection age | Runtime configuration | `SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS` must be explicitly set from 900 through 31536000 seconds in subscription mode; no default is selected |
| Checkout Session lifetime | Runtime configuration | `STRIPE_CHECKOUT_SESSION_LIFETIME_SECONDS` must be explicitly set from 1860 through 86400 seconds before Checkout is enabled |
| Canonical application origin | Runtime configuration | Exact approved HTTPS origin; used for redirect and absolute-URL allowlisting |
| Release identifier | Build configuration | Immutable commit/artifact identifier exposed to health/diagnostic output without secrets |

Logical D1/R2 declarations live in `.openai/hosting.json`; Sites owns real Cloudflare resource provisioning and deployment wiring. Hosted runtime values are managed through the Sites control plane. No `.env` file, dashboard export, credential screenshot, or copied webhook payload belongs in version control.

For the current private version-12 environment, do not invent consent or
privacy-operator values to make deep health green. `CONSENT_POLICY_REGISTRY_JSON`
and the independent operator access configuration remain owner/qualified-review
dependencies. Their absence must continue to fail the affected controls closed and
report degraded readiness until the exact decisions and configuration are recorded.

### Instructor product-access configuration

Set exactly one `INSTRUCTOR_ACCESS_MODE` and verify the boolean
`instructorAccessPolicy` health check before smoke testing. For
`owner_private`, normalize each authorized SIWC email by trimming and
lowercasing it, compute HMAC-SHA-256 with the dedicated pepper, and configure
only the lowercase 64-character digests. Never paste plaintext allowlist emails
into variables, tickets, logs, or release evidence.

For `subscription_required`, explicitly configure one or more of `incomplete`,
`trialing`, `active`, `past_due`, `paused`, `canceled`, `unpaid`, or `ended`.
This is owner-approved commercial/operations policy, not a code default.
Missing, empty, duplicate, or unknown values fail closed. Verify that account,
billing, and data controls remain reachable without an eligible subscription;
core pages/APIs return the generic subscription-required response; approved
signed-webhook states grant core access; and public health, webhook, and golfer
routes remain separate.

## Release procedure

The release operator records every step and attaches evidence to an immutable release identifier.

### 1. Prepare

- Confirm the intended V1 scope and exclusions against [Requirements Traceability](REQUIREMENTS_TRACEABILITY.md).
- Review repository changes and dependency-lock changes; exclude unrelated or generated secrets.
- Confirm production configuration names, binding presence, canonical origin, Stripe mode/Price, and feature flags without printing secret values.
- Review schema migration SQL, rollback/forward-fix approach, expected lock/write behavior, and backup point.
- Confirm approved public, legal, privacy, billing, support, and error copy matches the release behavior.
- Record known defects and residual risks with owner/disposition; an unresolved critical risk is not hidden by deployment urgency.

### 2. Verify build and behavior

- Install from the committed lockfile in a clean environment.
- For a release that claims reproducible output, create two independent detached
  clean worktrees at the exact candidate commit, run `npm ci --no-audit` and
  `npm run verify` in each, then run
  `npm run verify:reproducible-builds -- --left-dist <first>/dist --right-dist <second>/dist`.
  Preserve the raw difference paths and require strict validation of every
  normalized generated value; record the outcome as normalized reproducibility,
  not byte identity.
- Run formatting/static checks, type/build checks, unit/integration tests, and the full relevant end-to-end suite.
- Run cross-tenant, capability-link, Stripe-webhook, data-lifecycle, accessibility, and failure-path checks appropriate to the change.
- Generate and inspect any D1 migration after schema changes.
- Confirm no development preview metadata, starter content, debug endpoint, fake billing success, or synthetic-only critical-path behavior remains.
- Run `npm run verify:release-integrity` to scan release text for secret-shaped values, reject unexpected environment files/symlinks, verify the immutable Business Plan V1 hash, check the migration journal, and validate the Sites resource manifest. Treat a clean scan as bounded evidence, not proof that no secret exists outside the scanned source.
- Capture command, environment, version, result, limitations, and artifact checksums; a green command without scope/context is weak evidence.

The repository's package scripts are the command authority. Typical current entry
points are `npm run build`, `npm run lint`, `npm test`, and
`npm run verify:reproducible-builds`; operators must inspect the scripts rather
than assume their coverage.

### 3. Protect data and deploy

- Take or verify the documented pre-change D1 recovery point and required R2 inventory state.
- Apply migration through the approved Sites/D1 process and record its version/result.
- Deploy the immutable application release through Sites.
- Verify actual D1/R2 bindings, environment identity, secret/config presence, and release identifier.
- Do not send customer communications, create real charges, or exercise destructive data paths outside an approved controlled test.

### 4. Production smoke checks

Use authorized test accounts and data. Confirm:

- public landing, sample, privacy/support/legal destinations, and canonical redirects;
- SIWC start, callback ownership, authenticated page, sign-out, unauthorized response, and tenant isolation;
- instructor setup, draft save/return, preview, publish, capability creation, exchange, view, revoke, and neutral invalid state;
- Now, Goal, Roadmap, Lessons, Practice, Evidence, and Phase Review rendering, including no-media and narrow-screen behavior;
- external coach action warning and handoff without any claim that booking/payment completed;
- Stripe test or specifically authorized controlled live Checkout/Portal/webhook flow;
- first-party audit events, Sites log correlation, alerts, and privacy-safe log content;
- health, D1/R2 access, error handling, caching, security headers, and release identifier.

### 5. Observe and close

- Monitor errors, latency, authentication failures, capability failures, data-store failures, audit-write failures, webhook backlog, and cost signals for the agreed observation window.
- Record release start/end, operator, exact URL, version, migration, configuration baseline, smoke results, alerts, known limitations, and rollback point.
- Keep the release open until failed checks are resolved, rolled back, or explicitly dispositioned by the accountable owner.
- Aaron's acceptance of an exact live release is recorded separately; deployment is not acceptance.

## Database migration procedure

1. Make schema changes in the repository schema source.
2. Generate a versioned migration and inspect the SQL rather than relying only on ORM types.
3. Test against a representative copy containing edge-case fixture data and the preceding schema version.
4. Verify constraints, indexes, ownership fields, default/backfill behavior, and downgrade/forward-fix consequences.
5. Classify destructive or long-running changes and select expand/migrate/contract steps where one-step mutation is unsafe.
6. Create/verify the recovery point, apply once, record the migration journal/version, and run data-integrity checks.
7. Deploy application code in the compatible sequence and monitor D1 errors.

Never edit an already-applied migration to change history. A failed production migration is contained, diagnosed, and either safely rolled forward or restored according to the tested plan.

## Rollback procedure

Application rollback and data recovery are distinct:

- If code is incompatible or unhealthy but data remains valid, redeploy the last known-good immutable Sites release and verify it against the current schema.
- If a migration is backward-compatible, roll back application code without reversing data automatically.
- If data integrity is at risk, stop affected writes, preserve evidence, and use the tested D1 recovery procedure. Do not improvise destructive reverse SQL.
- If capability or secret exposure is involved, revoke/rotate separately; code rollback does not remove exposed secrets.
- If a Stripe event processor caused a bad entitlement projection, preserve accepted webhook events and rebuild/reconcile state rather than deleting billing history.

Sites version 12 packages the migration journal through `0009`. Version 11 is the
immediate deployed predecessor and has no new SQL migration to reverse, but it lacks
version 12's server-side same-key golfer-response deduplication. A version-12 client
can also hold an outcome-unknown key across reload while version 11 returns the
legacy response payload. Selecting version 11 can therefore turn a lost
acknowledgment or mixed-version request into repeated response/audit writes. Treat
the v12-to-v11 path as class `B`: ordinary rollback is forbidden even though the
schema shape is unchanged. Use a tested forward fix or another explicitly
classified recovery path.

The historical v11-to-v10 path remains class `B`: version 10 lacks the
per-response CSP nonce behavior and uses `script-src 'unsafe-inline'`. That
security regression remains historical compatibility evidence and does not create
a fallback path from version 12.

The historical v10-to-v9 application/schema comparison remains class `N` for that
past pair because their application/runtime source, package lock, bindings, runtime
configuration contract, and journal matched. It does not classify a current
v12-to-v9 action, authorize skipping versions 11 and 10, or make version 9 an approved target.
Any authorized version selection must preserve current secret values, owner-only
access, and `BILLING_CHECKOUT_ENABLED=false`; never restore an old environment
revision wholesale.

Application rollback is not D1/R2 data restore. It also does not restore, revoke, or
rotate the project-level SIWC bypass credential; the recorded `OWNER-SEC-001`
rotation remains in force independently of the selected application version.
Migrations `0008` and `0009` remain structurally backward-readable by version 7,
but version 7 lacks the consent enforcement introduced in version 8 and retained
by the current candidate for ordinary instructor reads/writes and golfer sharing.
After consent-governed real data or disclosure under version 8, 9, 10, 11, or 12, rollback to
version 7 is class `B` behaviorally and forbidden as an ordinary code rollback.
Freeze affected writes and use a tested forward fix or controlled recovery. Do not
treat SQL shape compatibility as authorization/privacy compatibility.

Exact source commit `66f5203a913f01c8da20555feebdbb99152c052c` remains the
undeployed exact subject of the precursor normalized reproducibility exercise.
Versions 10, 11, and 12 are later deployed descendants with their own exact release
evidence; the earlier exercise does not
make commit `66f5203a...` a saved runtime or rollback target.

Every rollback records trigger, decision maker, affected release/migration, customer impact, data-integrity result, verification, and follow-up action.

## Monitoring and alerting

### Signal sources

- **Sites logs:** request/runtime failures, Worker exceptions, route status, latency, deployment/version correlation, and provider diagnostics.
- **First-party audit events:** identity mapping, resource changes, publication/share lifecycle, data requests, billing-event outcomes, and authorized operator access.
- **Application health checks:** release identifier and safe dependency reachability; no personal data or secret echo.
- **Stripe dashboard/webhooks:** delivery attempts, signature failures, backlog, disputes, and subscription anomalies.
- **D1/R2 provider views:** availability/errors, storage/operation growth, and configured backup indicators.
- **Synthetic checks:** anonymous public path and controlled private critical paths using dedicated test records without customer data.

### Required alert families

| Condition | Initial response |
|---|---|
| Sustained public/instructor/golfer 5xx or unavailable health | Confirm release/provider scope, pause changes, rollback when change-correlated |
| D1 write/read or migration failure | Protect writes, inspect integrity, preserve evidence, invoke database recovery path |
| R2 private-read/upload/delete failure | Keep text experience available, stop unsafe uploads/deletes, reconcile metadata/objects |
| Authentication spike or hosted SIWC outage | Verify provider state and spoofing indicators, present privacy-safe status, avoid account workarounds |
| Capability exchange failure/guessing spike | Rate-limit, investigate, rotate affected capabilities, check log exposure |
| Sustained application `429` responses | Separate expected containment from a false positive or attack; inspect only privacy-safe scope/count signals and do not disable controls without a recorded incident decision |
| Cross-tenant or authorization anomaly | Treat as a security incident, contain immediately, preserve evidence, evaluate affected records |
| Stripe signature failure or webhook backlog | Stop manual entitlement guessing, inspect endpoint/secrets, retry/reconcile from durable events |
| Audit-write failure | Block or queue high-impact mutations according to the tested design; do not silently lose accountability |
| Backup missed or restore verification failed | Escalate to backup owner; do not claim recoverability until corrected and re-exercised |
| Cost or usage anomaly | Identify route/resource/tenant pattern, contain abuse safely, preserve legitimate user access where possible |

No availability objective, alert threshold, response-time promise, RPO, or RTO is approved in this document. Establish values from owner risk decisions and observed production behavior, then record and test them. Numeric business targets in planning materials remain unapproved or unvalidated unless explicitly decided.

## Logging practice

- Generate a request/correlation ID at the trusted edge/app boundary and carry it through safe application events.
- Use structured event names and opaque resource IDs; do not interpolate user content into messages.
- Never log cookies, raw SIWC headers, raw share verifiers, URL fragments, request/response bodies, Stripe secrets/webhook payloads, R2 signed access, or personal roadmap content.
- Avoid query strings in logs; golfer capability design does not use them.
- Restrict log access to named operators and review access periodically.
- Sample deployed Sites logs and failure paths before live acceptance; provider-generated logging may differ from application expectations.
- Retention and export behavior must match the approved privacy/security policy.

`[REAL-WORLD VALIDATION REQUIRED]` Sites log retention, redaction, access, export, and alert routing are unresolved until demonstrated in the actual production account.

## Backup and restore

### Backup set

- D1 schema, migrations, and all authoritative structured records.
- R2 object inventory and required private objects.
- Non-secret configuration baseline, dependency lockfile, release artifact/identifier, and domain/provider mapping.
- Secret inventory and rotation procedures, not secret values.
- Stripe reconciliation identifiers/state needed to rebuild the local entitlement projection; Stripe remains the external billing record.

### Backup requirements

- Provider capability checked against current first-party documentation on
  2026-08-08: production-backend D1 databases have always-on Time Travel, with
  point-in-time restoration to any minute in the plan's retention window (currently
  documented as 7 days on Workers Free and 30 days on Workers Paid). A restore
  overwrites the database in place and cancels in-flight queries, so the operator must
  first verify the actual database backend/plan and record the pre-restore bookmark.
  See Cloudflare's [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/).
- If provider-native recovery cannot meet the approved need, use an authorized scheduled logical export to a separately controlled location; do not assume an R2 bucket in the same failure domain is sufficient without analysis.
- R2 redundancy/durability does not recover an intentional or accidental object
  deletion. Bucket locks can reduce accidental deletion risk and lifecycle rules can
  enforce approved expiry, but neither is a substitute for an independently recoverable
  copy. See Cloudflare's [R2 durability](https://developers.cloudflare.com/r2/reference/durability/),
  [bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/), and
  [object lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
- Protect backup access with least privilege and environment separation.
- Define retention and deletion for D1, R2, exports, audit events, cancelled accounts, and backup copies through approved policy.
- Monitor backup creation and object/inventory completeness; a scheduled job is not proof of a usable backup.

### Restore exercise

1. Select a dated recovery point and a clean isolated recovery environment.
2. Restore D1 using the documented provider procedure and record elapsed time, errors, and version.
3. Restore or reconnect the corresponding R2 objects and validate checksums/inventory relationships.
4. Deploy the exact compatible application and configuration without production secrets leaking into the exercise.
5. Verify representative instructor ownership, golfer capability state, published versions, media access, audit continuity, and Stripe reconciliation.
6. Confirm deleted/revoked records do not re-enter ordinary access incorrectly.
7. Record actual recovery point, recovery time, integrity result, gaps, owner, and corrective actions.

For a repeatable pre-production check of the repository's logical-copy path, run
`npm run exercise:recovery:local` and follow
[Local synthetic recovery exercise](LOCAL_SYNTHETIC_RECOVERY_EXERCISE.md). The
exact-version-11 run passed all 10 migrations and 31 application tables for 2
synthetic tenants and 3 private synthetic objects. It matched a 34,380-byte D1
snapshot with SHA-256
`34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54`,
passed all 3 negative integrity checks and the child-process secret-isolation
check, and took 103,656 ms of local wall-clock time. That duration is not an RTO,
and the result remains labelled `LOCAL SYNTHETIC EVIDENCE — NOT HOSTED
BACKUP/RESTORE EVIDENCE`; it must not be entered as provider or production
recovery evidence. The exact record is
[here](release-evidence/ROADMAP-SITES-V11-2026-08-08-LOCAL-EXERCISES.md).

`[REAL-WORLD VALIDATION REQUIRED]` No successful hosted D1/R2 restore exercise is claimed here. Provider-native backup and restore, real environment separation, operator execution, alerting, deletion recovery, and measured RPO/RTO remain unresolved operational evidence, not a reason to stop implementation work.

## Incident response runbook

### Severity assessment

Immediately classify whether the event involves cross-tenant access, raw capability/secret exposure, unauthorized personal data, destructive data change, billing error, widespread outage, or an ethical/trust harm. Exact severity definitions and notification obligations require the approved incident policy.

### Response sequence

1. **Detect and record:** open an incident record with time, reporter, symptoms, release, environment, and correlation IDs; avoid copying private content.
2. **Contain:** stop affected writes/features, revoke capabilities/sessions, rotate secrets, block abusive paths, or roll back as evidence warrants.
3. **Preserve evidence:** retain relevant audit/log/provider evidence under restricted access and documented handling.
4. **Assess:** determine systems, tenants, records/data classes, time window, billing impact, and user harm; involve qualified legal/privacy advice when required.
5. **Recover:** restore trusted code/data/configuration, verify isolation and integrity, and monitor recurrence.
6. **Communicate:** only the authorized owner sends accurate notices through approved channels; do not speculate or minimize.
7. **Review:** document cause, contributing conditions, timeline, decisions, corrective actions, owners, dates, and verification.

## Focused operational runbooks

### SIWC unavailable or identity mismatch

- Confirm provider/system status and release correlation without bypassing authentication.
- Keep public and already-authorized golfer read paths available only if their controls are unaffected.
- Do not create manual shared accounts, trust an email supplied in a support message, or edit tenant ownership to “fix” sign-in.
- Use the documented recovery/support path once SIWC public suitability is confirmed; audit any authorized identity remapping.
- If identity spoofing is suspected, treat it as a security incident.

### Golfer link reported exposed

- Verify the requesting instructor through SIWC and ownership.
- Revoke the capability and its scoped sessions; create a new verifier only after explicit instructor action.
- Review capability exchange/audit events and Sites logs using opaque IDs.
- Explain that prior recipients may have retained viewed/copied content; do not promise retroactive erasure.
- Escalate if exposure may involve unauthorized personal data.

### Stripe webhook delayed, duplicated, or out of order

- Inspect durable event receipt and signature outcome; do not edit entitlement from a browser screenshot.
- Retry idempotent processing and reconcile the subscription against Stripe using the authenticated account mapping. The instructor's **Refresh billing status** action may read only that account's existing local Checkout/subscription references; it never creates or changes a provider object.
- Keep duplicate event IDs no-op and record the result.
- Apply approved grace/failure/cancel policy; do not invent access consequences during the incident.
- Correct customer-visible state and audit the reconciliation.

### Incorrect external coach action

- Preserve the roadmap and mark the action unavailable rather than implying a booking/payment failure inside the SaaS.
- Let the instructor correct the URL/contact route, preview, and intentionally republish.
- Never follow or scrape the destination to infer a sale.

### Data access, correction, export, or deletion request

Use the bounded [data-request operator workflow](DATA_REQUEST_OPERATOR_WORKFLOW.md)
for queue review, one-request count-only dry-run inventory, and non-destructive
status changes. Its independent SIWC/HMAC role, exact-version compare-and-swap,
idempotent receipt, and audit events do not authorize or perform fulfillment,
export delivery, deletion, account-state changes, or policy decisions.

The queue uses strict newest-first keyset pages (default 50, maximum 100), so
old in-progress work cannot conceal new submissions. Treat
`excludedOrphanCount` or `excludedFutureDatedCount` above zero as a data-quality
signal: preserve safe evidence, investigate through an approved restricted
path, and do not place excluded request identifiers into routine tickets or
logs. Identity-verification-required, verified, in-progress, denied, cancelled,
fulfilled, and failed detail is read-only. The sole marker is `submitted` ->
`identity_verification_required`; it does not attest verification or write
verification evidence. Verification, processing, denial, cancellation,
fulfillment, and deletion remain unavailable until Aaron has approved method,
policy, evidence, roles, and recovery. Repeated operator calls are bounded at
60 per trusted network and 30 per authorized operator digest per five minutes
before queue audit, inventory, or transition work.

- Record the request and verify requester authority through the approved channel.
- Determine scope across SIWC mapping, D1, R2, share sessions/capabilities, exports, audit/log records, backups, and Stripe-held billing records.
- Apply the approved policy and any qualified exception; do not promise a deadline or deletion scope not yet established.
- Use a second-person review for broad or destructive actions where the operating model requires it.
- Verify the result, record residual backup/provider handling, and communicate accurately.

## Support operations

The public support route must state scope, expected channel, privacy limits, and urgent security/privacy escalation. Normal support may explain existing documentation and recover product errors. It does not include scheduled onboarding, package consulting, custom templates, roadmap writing, branding design, data cleanup, or facility setup.

Each support interaction records category, product area, resolution, reactive versus proactive help, time spent, and whether founder/operator intervention was required. Do not copy golfer narrative or media into support systems unless the approved process requires it and the requester is authorized.

Support themes feed product improvement and self-serve evidence. They do not justify hidden claims that activation was unassisted.

## Billing operations

- Maintain a production/test Stripe inventory: account owner, product/Price IDs, portal configuration, webhook endpoint/secrets, tax settings, supported account changes, and policy version.
- Reconcile accepted webhook events and local subscription projections through the authenticated account refresh and, only after hosted trigger provisioning is independently proven, the packaged bounded five-minute Worker schedule. The handler selects only due existing provider-backed Checkout work, failed/expired reconciliation targets, and stale nonterminal subscription projections; it does not create a provider object or sweep every subscription speculatively. It records a privacy-safe singleton D1 heartbeat even when billing is disabled and safely does no provider work when Stripe credentials or the complete billing policy are absent. Local invocation is exercised; current Sites-hosted invocation remains unproven and must not be an operational billing dependency.
- Use the tenant-scoped refresh for an authenticated account when a signed webhook is delayed. Its durable reconciliation target records lease, retry, failure, and success state; provider generation fencing prevents an older GET response from overwriting a newer provider projection.
- Automatic retries use bounded backoff and stop after eight consecutive
  automatic failures; successful refreshes reset that failure budget without
  erasing the total attempt history. The durable dead-letter timestamp and a
  structured error log are the operator signal. A signed webhook that later
  resolves the exact object clears the matching failed or in-flight target
  atomically with its provider projection. Alert delivery, named response ownership, and a real
  Stripe recovery exercise remain operational evidence dependencies.
- Review failed webhook deliveries, duplicate customers/subscriptions, entitlement mismatches, disputes, refunds, and failed payments under approved policy.
- Ensure customer-facing price, recurrence, taxes, trial, cancel/pause, refund, and data consequences match Stripe configuration.
- Keep SaaS billing support separate from the instructor's external coach-package transaction.

### Fail-closed Price or credential rotation

Treat Price, Stripe-account, and webhook-secret changes as a billing migration,
not as a routine environment edit:

1. Set `BILLING_CHECKOUT_ENABLED=false` first and verify health/runtime agree on
   that exact canonical value. Disabling new Checkout does not cancel a hosted
   Session whose URL was already issued and does not disable Customer Portal.
2. Inventory every `reserved`, `open`, `completed_pending_sync`, and
   `quarantined` Checkout attempt, every open subscription, and every failed or
   processing billing event. Reconcile them against Stripe before changing the
   active Price or account credentials. Explicitly expire obsolete open Stripe
   Sessions; changing application configuration alone cannot revoke their URLs.
3. Keep every unsettled or historically synchronized Price in
   `STRIPE_RECOGNIZED_PRICE_IDS` through the complete provider retry and manual
   reconciliation horizon. The current Checkout Price must remain recognized
   and entitled. Removing a Price from
   `SUBSCRIPTION_ENTITLEMENT_PRICE_IDS` intentionally removes product access for
   subscriptions on that Price and therefore requires the exact approved
   customer consequence—not an inferred operator choice.
4. Keep the old webhook delivery path and verification secret usable until its
   accepted events are terminally processed or reconciled. A Stripe-account or
   secret cutover without that overlap can strand paid attempts.
5. Apply the approved new configuration with Checkout still disabled, verify
   policy readiness and signed test-mode reconciliation, then run the expressly
   authorized controlled live transaction before enabling new commercial use.

The owner-only Sites access layer currently blocks third-party webhook ingress.
Do not enable live billing until an approved deployment exposes the signed
webhook route to Stripe without exposing instructor routes.

`[PRICING HYPOTHESIS — REQUIRES VALIDATION]` CAD $75/month, the trial, and a CAD $15/month seasonal pause are planning hypotheses until an exact later decision and Stripe configuration approve them. Production credentials and an exact Price remain unresolved operational dependencies.

## Dependency and cost maintenance

- Review runtime and application dependencies on a defined cadence and on material security advisories.
- Keep the lockfile committed; review transitive changes and perform regression/security checks before promotion.
- Record provider/runtime compatibility for the exact vinext/React/Worker release.
- Remove unused providers, bindings, dependencies, and secrets.
- Monitor D1 operations/storage, R2 storage/egress/operations, Worker usage, Sites costs, Stripe fees, and abnormal tenant usage.
- Do not impose a hidden usage limit or claim “unlimited” behavior beyond the approved offer and observed safe operating range.

## Live release evidence packet

The packet for one exact release contains:

- immutable release identifier and public URL;
- source/dependency/configuration/migration baseline;
- named operators and escalation routes;
- environment/provider/binding/secret inventory confirmation without secret values;
- automated and manual verification results with exact scope;
- public, instructor, golfer, billing, error/recovery, privacy, and accessibility smoke evidence;
- Sites log, alert, first-party audit, webhook reconciliation, and cost-monitoring evidence;
- backup inventory and successful restore-exercise result;
- legal/privacy/billing/support copy versions and approval record;
- open defects and residual risks with owner/disposition;
- rollback point and exercise/result; and
- Aaron's exact-release acceptance decision, date, conditions, and revisit triggers.

Deployment alone, a working happy path, or a green build does not complete this packet.

## Unresolved operational dependencies, not gates

| Dependency | Current truthful status | Required operational evidence |
|---|---|---|
| SIWC/public-auth suitability | Selected architecture; the exposed bypass value is provider-invalidated under recorded `OWNER-SEC-001`, but normal signed-in owner operation and public production suitability remain unproven | Normal signed-in owner retest without a bypass header; hosted sign-in/recovery/sign-out, identity continuity, spoof/abuse, meaningful privacy-safe log sampling, and support evidence |
| Stripe live account/price | Planned integration; Checkout disabled; production credentials and exact approved Price unavailable/unrecorded; current Sites guidance directs builders not to use Sites to enable financial transactions | Explicit provider confirmation or a verified superseding hosting decision, authorized secret/config inventory, policy alignment, reachable signed webhook, and controlled transaction evidence |
| Domain | No approved production entry point recorded here | Authorized domain, DNS/redirect/TLS/origin checks, published support/legal destinations |
| Legal and privacy copy | Exact qualified/owner-approved copy not recorded | Versioned review and deployed copy/behavior conformance |
| Backup/restore | Procedure specified; an exact-v11 local synthetic logical-copy exercise passed 10 migrations, 31 tables, 2 tenants, 3 objects, 3 negative checks, and secret isolation. No successful hosted/provider restore is claimed, and 103,656 ms is not an RTO | Hosted D1/R2 restore evidence with integrity, measured recovery and recovery point, provider/environment separation, and named owner |
| Hosted capacity/performance | An exact-v11 single-process local exercise completed 54 requests at concurrency 4 with 44 `200`, 10 `201`, 0 failures, and local p50/p95/max of 48.46/107.60/107.83 ms. It sets no business threshold, SLO/SLA, or hosted limit | Approved capacity targets plus hosted, network, contention, sustained-load, quota, failure, and representative-device evidence |
| Sites logs/alerts and scheduling | Bounded sanitized fetch samples exist; access/retention/redaction/alerts remain unproven. Historical post-v11 aggregates returned only fetch events and `scheduled=0`. The post-v12 ten-minute `errors_only` aggregate returned zero records; its broad companion returned six `fetch`/`info`/`ok` records (`200`, `200`, and handled `403` twice) and `scheduled=0`. Completeness, scheduled-event visibility, trigger metadata, and official background-service support remain unresolved | Provider confirmation or superseding scheduler/hosting decision, hosted trigger invocation, token/PII checks, alert delivery and response exercise |
| Live acceptance | No exact production release acceptance recorded | Complete evidence packet and Aaron's dated release acceptance |

These dependencies determine whether affected production claims are supported. They do not retract `AUTH-005`, and they must not be described as completed until evidence exists.
