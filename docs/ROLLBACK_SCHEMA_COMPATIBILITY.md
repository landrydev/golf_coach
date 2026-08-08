# Rollback artifact and schema-compatibility record

**Status:** Exact current candidate and predecessors registered; version 7 is not an
ordinary rollback target after version-8-or-later consent-governed use; hosted rollback and
restore remain unexercised
**Last reconciled:** 2026-08-08
**Related:** [Operations rollback procedure](OPERATIONS.md#rollback-procedure),
[release evidence](RELEASE_EVIDENCE.md#exact-private-sites-release), and
[findings ledger](FINDINGS_RETEST_LEDGER.md)

Application rollback, configuration rollback, Stripe reconciliation, secret
rotation, and D1/R2 recovery are different operations. Selecting an older Sites
version must never silently reverse SQL, overwrite data, delete billing history,
or restore an exposed secret.

## Registered current candidate and rollback baseline

### Current exact candidate

| Field | Exact recorded value / status |
|---|---|
| Record ID | `RB-CANDIDATE-009` |
| Candidate | `ROADMAP-SITES-V9-2026-08-08` |
| Source and runtime release ID | `6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d` |
| Local source package | `outputs/roadmap-sites-v9-6b48fae.tar.gz`; gzip SHA-256 `8b3d0b13f03f0b13cd10602d24af09bf17c34afdcb4cf73518b2b0d857d59e22`; 2,965,984 bytes; 61 tar entries/49 files; the release-time exact-build comparison passed and found all 10 migrations. A later isolated clean build passed behavior but did not byte-match this archive, so deterministic rebuilding remains unproved for version 9. |
| Sites archive content | `sha256:0b3986dc73b1d06539dc85900dfd959549d92bcceb812c231a418766d29411fb`; 49 files; 6,737,920 bytes |
| Saved Sites version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_58bb67e8e23c8191a584540a09e363c5` |
| Successful deployment | `appgdep_6a7768f92c588191934eda8abea6d6b4`; final status `succeeded`, provider `updated_at` `2026-08-08T17:36:53.329945+00:00` |
| Environment revision used by that deployment | `11` |
| Access boundary | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Schema journal | `0000` through `0009`; no additional SQL migration appears in the version-9 package relative to version 8; version 7 does not enforce the consent requirements introduced in version 8 and retained by the current candidate |
| Package-lock SHA-256 | `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d` |
| Hosted containment/log continuity | HTTP `/` redirected to HTTPS; four signed-out HTTPS probes returned `401` with `no-store`/`no-referrer`. A pre-v9 24-event sanitized log sample contained only `fetch`/`ok` events (23 `200`, one handled `403`) and no scheduled event. Post-v9 bounded queries found zero error-level/exception/crash events, one handled `403` in the broad error filter, and no scheduled event. None of this is rollback, authenticated-health, scheduler, or completeness evidence. |
| Local recovery observation | The exact-version-9 exercise applied all 10 migrations, restored 2 synthetic tenants and 3 private synthetic objects, enforced child-process secret isolation, and matched snapshot SHA-256 `34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54`. This is local D1/R2-compatible evidence, not hosted/provider-native recovery. |
| Exercise status | **IMMUTABLE CANDIDATE REGISTERED; NOT ROLLBACK- OR HOSTED-RESTORE-TESTED** |

### Undeployed successor-source build observation

Commit `66f5203a913f01c8da20555feebdbb99152c052c` was checked in two independently
created detached clean worktrees. Each `npm ci --no-audit` installed 501 locked
packages and reported five blocked install scripts; each `npm run verify` passed
234/234 tests. The two builds had the same 49 paths. Only
`server/index.js`, `server/ssr/vinext-server.json`, and
`server/vinext-server.json` differed before strict allowlisted validation of the
framework-generated build identifier and within-build matching prerender-secret
manifest pairs;
zero differences remained after normalization. This is normalized reproducibility,
not byte identity. See the [successor reproducibility record](release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md).

The successor commit is not saved or deployed in Sites, has no registered runtime
or environment revision, has not been exercised against hosted state, and is not a
rollback target. It does not alter any version-9 identifier, the version-9 failed
byte-identity result, or the hosted owner-only status.

### Immediate historical predecessor and potential rollback baseline

| Field | Exact recorded value / status |
|---|---|
| Record ID | `RB-BASE-008` |
| Candidate | `ROADMAP-SITES-V8-2026-08-08` |
| Source and runtime release ID | `cf117fef8ea42272d0b7e2358fe4197c024f86a7` |
| Local source package | Gzip SHA-256 `99d615410c2e145e77938f0c5df4449ab8aeb4a544a5c5949fcdafa56a8e1378`; 2,963,266 bytes; 61 tar entries; exact archive verifier passed with 10 migrations |
| Sites archive content hash | `sha256:9a4119ea60dd64d2a0bf14a55c7e2d27fb3e8ea250f0d064e8bc5a79fb34a87c`; 49 files; 6,737,920 bytes |
| Saved Sites version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_01ba2d860b508191b4d104339921606d` |
| Successful deployment | `appgdep_6a775b172534819196391fd626e95aa3`; succeeded `2026-08-08T16:36:50.529785+00:00` |
| Environment revision used by that deployment | `10` |
| Access boundary | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Schema journal | `0000` through `0009` |
| Package-lock SHA-256 | `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d` |
| Exercise status | **SUPERSEDED SUCCESSFUL DEPLOYMENT; SAME SCHEMA JOURNAL, BUT NOT A TESTED OR APPROVED VERSION-9 ROLLBACK TARGET** |

### Older privacy-incompatible predecessor

`RB-BASE-007` remains immutable historical evidence for version 7 at commit
`7ed01ec822fdb5c2bfbe6db7e3c99bcba126ac17`, saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_55fe270d85f081919dcd346c8476130d`,
deployment `appgdep_6a772e0616b88191972b4e2e0603da52`, environment revision 9,
and schema journal `0000` through `0007`. Its local package gzip SHA-256 is
`a07f06989d3ba6cf05b924b149fc9f955be512223c6f90d5dd8d7628d175e526`;
the Sites content hash is
`sha256:4a00694b9798f4f84487e8e7ea224703ccbbfc61a32dd132d417dc65b7f153bc`.
It is privacy-behaviorally forbidden as an ordinary target after version-8-or-later
consent-governed use.

The version-9 identifiers bind the current candidate. Version 8 is the immediate
historical predecessor; versions 7 and 6 are older predecessor evidence. No older
version is a presumed safe target. These records do not prove that Sites can switch
versions under environment revision 11, that an older application can safely operate
on current hosted data/configuration, or that application/data recovery will succeed.

## Current compatibility observation

**Implemented exact-candidate evidence:** Sites version 9 is immutable at commit
`6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d` with migration journal `0000`
through `0009`; the package contains no additional SQL migration relative to version
8. Migration `0008` rebuilds the abuse-rate-limit table to admit the
two privacy-operator scopes; migration `0009` rebuilds the existing consent table
with timestamp-consistency checks while preserving the column shape and indexes.
The migration path preserves valid rows and fails atomically rather than replacing
the original table when a contradictory row violates the new constraint.

Version 8 has the same schema journal, but neither source/configuration equivalence
nor a hosted version switch has been exercised, so version-9 to version-8 rollback
remains unclassified. Those SQL structures are also backward-readable by version 7,
but structural
readability is not sufficient for a safe application rollback. Version 7 lacks the
version-8 account `golfer_record` and golfer `roadmap_sharing` enforcement on
ordinary reads, mutations, publication, token exchange, live sessions, and golfer
responses. Once version 8 or 9 has governed any real data or disclosure through those
controls, selecting version 7 would remove a mandatory privacy/authorization
boundary. The overall rollback is therefore class `B` behaviorally: ordinary
rollback is forbidden; stop affected writes and use a tested forward fix or
controlled recovery. No hosted version switch or recovery exercise has been run.

| From state | To target | Schema class | Current conclusion |
|---|---|---|---|
| Immutable Sites version 9 | Same saved version 9 | `N` | Existing successful private deployment proves deployability at that time, not rollback or restore |
| Sites version 9 | `RB-BASE-008` / Sites version 8 | `U` pending exact behavior/configuration classification | Same schema journal alone is insufficient. Do not select until the source/configuration delta and an exact rollback drill prove safety. |
| Sites version 9 after any version-8-or-later consent-governed use | `RB-BASE-007` / Sites version 7 | `B` (behavioral; SQL structures are backward-readable) | **Ordinary rollback forbidden.** Version 7 lacks the required consent enforcement; use a tested forward fix or controlled recovery. |
| Sites version 9 | Version 6 or any older predecessor | `B` / unsupported | Multiple behavior and evidence deltas are not an approved rollback path. Use a forward fix or tested recovery. |
| Undeployed successor source `66f5203a913f01c8da20555feebdbb99152c052c` | Any deployed version | Not applicable | Normalized build reproducibility alone does not create a saved runtime or rollback target. Do not use this source as a rollback action. |
| Any future release with migration/configuration changes | Any predecessor | Unclassified | **Do not roll back** until the per-release matrix below is completed and exercised. |

Compatibility classes are:

| Class | Meaning | Default response |
|---|---|---|
| `N` | No schema change | Code rollback may proceed only after configuration and exact-release tests pass |
| `A` | Additive/backward-compatible change; old code ignores new nullable/defaulted structures | Prove old-code reads/writes and constraints against the migrated schema before release |
| `T` | Transitional expand/migrate/contract sequence | Roll back only within the explicitly tested compatibility window |
| `B` | Breaking/destructive change, old code would misread/write data, or the old release would remove a mandatory security/privacy behavior | No ordinary code rollback; stop writes and use an approved forward fix or tested recovery plan |

## Required per-release compatibility record

Complete this before every deployment that changes code, configuration, bindings,
or migrations.

| Field | Required value |
|---|---|
| Forward release | Commit, runtime release ID, archive hash, saved version, deployment, environment revision |
| Rollback target | Saved immutable version, source commit, archive hash, last-known-good evidence |
| Schema before/after | D1 database/environment, journal entries and hashes, provider migration state |
| Compatibility class | `N`, `A`, `T`, or `B`, with SQL/data and security/privacy behavior rationale |
| Tested application window | Exact old/new code versions proven against exact before/after schemas |
| Configuration delta | Non-secret names/values, bindings, access policy, feature flags, canonical origin; secret inventory/rotation state without values |
| Data protection | Pre-change D1 bookmark/recovery point, R2 inventory/checksums, in-flight export/deletion state |
| Billing protection | Checkout state, webhook backlog, account-operation leases, reconciliation targets, recognized/entitled Prices |
| Trigger and authority | Quantified rollback triggers, decision maker, release operator, communication/escalation route |
| Verification | Public/identity/instructor/golfer/consent/share/billing/data-request/health/audit/log smoke and integrity queries; two independent clean builds compared with `npm run verify:reproducible-builds`, recorded as normalized reproducibility rather than byte identity |
| Result | Time started/completed, customer effect, data integrity, unresolved findings, next action |

Do not put secret values, raw capabilities, personal content, webhook bodies, or
customer identifiers in this record.

## Rollback execution sheet

1. Declare the incident/change window, freeze affected writes when integrity is
   uncertain, and preserve privacy-safe evidence.
2. Identify the currently running release, environment revision, D1 migration
   state, R2 inventory, Stripe backlog, and exact `RB-*` target.
3. Confirm the compatibility record is complete. If class `B` or unknown, do not
   select old code; choose a tested forward fix or controlled recovery. Version 7
   is class `B` behaviorally after any version-8-or-later consent-governed use even though
   migrations `0008` and `0009` remain structurally backward-readable.
4. Record the provider D1 pre-change bookmark/recovery point. Do not run reverse SQL.
5. Redeploy/select the exact saved Sites version and apply only its compatible
   non-secret configuration. Preserve hosted secret values unless a separate
   authorized rotation is required.
6. Verify release identity and run the scoped smoke/integrity matrix. Confirm tenant
   isolation, share revoke/session state, audit continuity, data requests, and Stripe
   projections before reopening writes.
7. Observe errors, latency, D1/R2 failures, authentication, audit writes, and billing
   reconciliation for the approved window.
8. Record result and open findings. A failed rollback remains evidence; do not erase it.

If D1 data itself must be recovered, follow
[the restore exercise](OPERATIONS.md#restore-exercise). A D1 restore overwrites a
database and is not an application rollback. R2 deletion recovery and Stripe state
repair are also separate, explicitly authorized procedures.

## Stop conditions and open evidence

Stop ordinary rollback and escalate when the compatibility class is unknown or `B`,
a migration is partially applied, tenant ownership/integrity is uncertain, consent
or sharing enforcement would regress, capability/secret exposure exists, audit writes
fail, deletion/export work is in flight without a safe state, Stripe events are
unresolved, or the target/configuration hashes do not match. In particular, do not
select version 7 after version 8 or 9 has governed real records or disclosure; preserve
the current state and use a tested forward fix or recovery path.

`[REAL-WORLD VALIDATION REQUIRED]` No hosted rollback, D1 Time Travel restore, R2
recovery, measured RPO/RTO, or staffed execution is claimed. `OPS-EVID-001` remains
open until a named operator performs and records those exercises against the exact
authorized environment. Aaron's public-launch, retention/legal, billing, real-account,
residual-risk, and exact-release decisions remain unresolved.
