# Rollback artifact and schema-compatibility record

**Status:** Exact current candidate and predecessors registered; version 16 to
version 15 is security/recovery behavior class `B` despite an unchanged schema,
and no predecessor resolves `LOG-PRIV-001`; version 12 is not an ordinary
rollback target from versions 16 through 13
because it would remove current
write-containment, recovery, CAS/revision, share-lifecycle, and close-rate-limit
controls; version 11 is not an ordinary target from version 12 because it would
remove golfer-response lost-ack deduplication; the historical v11-to-v10 CSP regression remains class `B`,
and version 7 remains forbidden after version-8-or-later
consent-governed use; hosted rollback and restore remain unexercised
**Last reconciled:** 2026-08-09
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
| Record ID | `RB-CANDIDATE-016` |
| Candidate | `ROADMAP-SITES-V16-2026-08-09` |
| Source and runtime release ID | `91f37ebd542774779f6db7e000832c2f6714e528` |
| Local source package | `outputs/roadmap-sites-v16-91f37eb.tar.gz`; gzip SHA-256 `9119a848bb8b4c7fff1d810280cf845ec44366449adac3176fd35d8c24438fe6`; 3,052,294 bytes; 63 tar entries/51 files; all 11 migrations |
| Sites archive content | `sha256:752f05fd957f8f4b043b5955d9cdbdbf2176b0f1f3414827c9c3e8d0f44f6e2c`; 51 files; 7,290,880 bytes |
| Saved Sites version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_0a4d7dc3d8108191aa4a1b3e14051a96` |
| Successful deployment | `appgdep_6a7826b2f4c481919cc85665dffa2391`; final status `succeeded`, provider `updated_at` `2026-08-09T07:05:36.176024Z` |
| Environment revision used by that deployment | `18` |
| Access boundary | Custom access with one owner, zero groups, and zero external visitors at `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Configuration boundary | `APPLICATION_WRITE_MODE=enabled` and exact `RELEASE_ID`; `INSTRUCTOR_ACCESS_MODE=owner_private` and `BILLING_CHECKOUT_ENABLED=false` retained; four existing secrets retained without disclosure |
| Schema and security behavior | Journal `0000` through `0010`; v16 adds generic document-failure handling, UUIDv4 request references, version-2 attempt lifecycle/ownership checks, exact readiness validation, bounded scheduler-backlog health, and exact-Worker recovery boot. V16-to-v15 removes security/recovery behavior and is class `B` absent an exact narrower compatibility exercise. No predecessor resolves `LOG-PRIV-001`; historical v13-to-v12 and earlier class-`B` boundaries remain. |
| Package-lock SHA-256 | `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d` |
| Hosted containment | Four post-v16 signed-out probes to `/`, `/app`, `/r`, and `/api/health` returned `401` with `no-store`/`no-referrer`. No v16 log query ran; v15 already proved the unchanged packaged switches ineffective. `LOG-PRIV-001` remains High/open. |
| Local recovery observation | Exact v16 passed all 11 migrations, 31/31 tables, a 34,956-byte snapshot, three objects/199 bytes, exact-Worker authenticated reads, expected interrupted-scheduler degradation, and three corruption checks in 105,940 ms. Local-only; no hosted recovery, RPO, or RTO claim. |
| Local capacity observation | Exact v16 completed 54 local requests at concurrency 4 with zero failures and p50/p95/max 41.5/93.18/93.58 ms. No target, SLO/SLA, hosted-capacity, or production-performance claim. |
| Exercise status | **IMMUTABLE CANDIDATE REGISTERED; NOT ROLLBACK- OR HOSTED-RESTORE-TESTED** |

See the [exact version-16 private release record](release-evidence/ROADMAP-SITES-V16-2026-08-09.md)
and [version-15 predecessor record](release-evidence/ROADMAP-SITES-V15-2026-08-09.md).

### Current and precursor supply-control lineage

Exact version-16 commit `91f37ebd542774779f6db7e000832c2f6714e528` passed
346/346 tests in the primary worktree and two detached clean worktrees. Each
clean `npm ci --no-audit` installed 501 locked packages and reported five
blocked install scripts. Both detached builds had 51 files, exactly three
controlled raw differences, three validated build-ID occurrences per build,
and zero differences after strict allowlisted normalization. The exact-version-
16 release-integrity run covered 304 files with zero secret findings, preserved
historical Business Plan V1, and confirmed the lockfile digest; a fresh exact-
version-16 production audit reported zero
vulnerabilities. This is
exact-candidate normalized reproducibility,
not byte identity or hosted rollback evidence.

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

Exact commit `66f5203a...` remains unsaved and undeployed and is not a rollback
target. Versions 10 through 16 are later deployed descendants with their own exact
release evidence. The precursor exercise does not alter the historical version-9
failed byte-identity result or prove hosted rollback/restore.

### Immediate version 15 and earlier predecessors

Version 15 (`8a359398099ab9b970df1d28eb3473dcbcd6207f`) is the
immediate predecessor. Its schema journal matches version 16, but it lacks the
version-16 failure-boundary, request-reference, attempt-lifecycle, readiness,
scheduler-health, and recovery-boot hardening. The downgrade is class `B`
behaviorally unless an exact exercise establishes a narrower safe path.

Versions 14 (`5db791d0d4a7317a2913d2e65d855cb0bb31baec`) and 13
(`f3482845a42730e87f4ff1190550511f19ea6ad5`) have the same application behavior
and schema as version 15. The historical v15-to-v14/v13 application/schema class is `N`.
Version 14 disabled invocation logs while retaining structured logs; version 13
predated that package control. Sites exposed invocation events for v14 and still
exposed them when v15 configured all packaged log-persistence settings off. Therefore neither
rollback target achieves the privacy objective, and ordinary rollback to v13 must
not be recommended as remediation for `LOG-PRIV-001`.

### Version 12 prohibited routine rollback baseline

| Field | Exact recorded value / status |
|---|---|
| Record ID | `RB-BASE-012` |
| Candidate | `ROADMAP-SITES-V12-2026-08-09` |
| Source and runtime release ID | `7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c` |
| Local source package | `outputs/roadmap-sites-v12-7b77e65.tar.gz`; gzip SHA-256 `994f725ba6c5952c45885a4d72d38804f1b10b8440273dc26ac8bd1c38d2bd75`; 2,967,333 bytes; 61 tar entries/49 files; all 10 migrations |
| Sites archive content hash | `sha256:0805c04e9dcd5e8bac77f58aec2362dece1754f6eec63ec73d9c2e249bb01700`; 49 files; 6,748,160 bytes |
| Saved Sites version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_8868e09fcb28819181cfbebdf82ce73f` |
| Successful deployment | `appgdep_6a77c5c85974819185ce1c8caf13007c`; final status `succeeded`, provider `updated_at` `2026-08-09T00:12:04.939300+00:00` |
| Environment revision used by that deployment | `14` |
| Access boundary | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Schema journal | `0000` through `0009` |
| Exercise status | **SUPERSEDED SUCCESSFUL DEPLOYMENT; V13-TO-V12 IS CLASS `B` BEHAVIORALLY AND VERSION 12 IS NOT A ROUTINE ROLLBACK TARGET** |

Version 12 remains immutable predecessor evidence. It lacks migration `0010` and
the version-13 application-wide write containment, bounded draft/session recovery,
stricter response/CAS/revision boundaries, native billing recovery, account share
revoke/reissue/replacement receipts, and close-rate-limit scopes. Although the
extended rate-limit constraint is backward-readable for version-12 operations,
the overall downgrade removes release-critical behavior and has not been exercised
against the migrated hosted database. The v13-to-v12 path is therefore class `B`.

### Earlier version-11 predecessor and prohibited routine rollback baseline

| Field | Exact recorded value / status |
|---|---|
| Record ID | `RB-BASE-011` |
| Candidate | `ROADMAP-SITES-V11-2026-08-08` |
| Source and runtime release ID | `44670a64498779cf747914b4465380916a939301` |
| Local source package | `outputs/roadmap-sites-v11-44670a6.tar.gz`; gzip SHA-256 `d88be6513bc58afd057d4a3fb3a6d64b744f7a5c359731ec9fc693a788e1fa0e`; 2,966,073 bytes; 61 tar entries/49 files; all 10 migrations |
| Sites archive content hash | `sha256:d717035871790252548e7fff4e1192e590b73b7cabfe3f4c011d65ffe4493daa`; 49 files; 6,737,920 bytes |
| Saved Sites version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_4c49cdec72bc8191aeece01f5689e51a` |
| Successful deployment | `appgdep_6a77b01714b881918245bb5248349e0d`; final status `succeeded`, provider `updated_at` `2026-08-08T22:40:07.742084+00:00` |
| Environment revision used by that deployment | `13` |
| Access boundary | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Schema journal | `0000` through `0009` |
| Exercise status | **SUPERSEDED SUCCESSFUL DEPLOYMENT; V12-TO-V11 IS CLASS `B` BEHAVIORALLY AND VERSION 11 IS NOT A ROUTINE ROLLBACK TARGET** |

Version 11 is retained as immutable historical evidence. It does not require or
deduplicate golfer-response idempotency keys. Its legacy response payload can also
mismatch a still-active version-12 client holding an outcome-unknown attempt. Those
mixed-version and lost-ack risks are subordinate to the unchanged schema journal;
they make the v12-to-v11 path class `B`.

### Earlier version-10 predecessor and historical CSP boundary

| Field | Exact recorded value / status |
|---|---|
| Record ID | `RB-BASE-010` |
| Candidate | `ROADMAP-SITES-V10-2026-08-08` |
| Source and runtime release ID | `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1` |
| Local source package | `outputs/roadmap-sites-v10-ae35ef2.tar.gz`; gzip SHA-256 `5d67423e253009714bebe85bba118ded922c9f6b30b926f2af7bd0e3d05cd953`; 2,965,930 bytes; 61 tar entries/49 files; all 10 migrations |
| Sites archive content hash | `sha256:0534d35af6fcdd8a0f104c5bb21fab5edd0641ec952bd32ae7a3f9c024c62033`; 49 files; 6,737,920 bytes |
| Saved Sites version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_1007b9b4ea8c8191968d55991abf374c` |
| Successful deployment | `appgdep_6a779cabaec4819191b0cf1e815ce2e5`; final status `succeeded`, provider `updated_at` `2026-08-08T21:17:13.525116+00:00` |
| Environment revision used by that deployment | `12` |
| Access boundary | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Schema journal | `0000` through `0009` |
| Package-lock SHA-256 | `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d` |
| Exercise status | **SUPERSEDED SUCCESSFUL DEPLOYMENT; HISTORICAL V11-TO-V10 IS CLASS `B` SECURITY/BEHAVIORALLY AND VERSION 10 IS NOT A ROUTINE ROLLBACK TARGET** |

Version 10 is retained as immutable historical evidence. It uses
`script-src 'unsafe-inline'` rather than version 11's per-response CSP nonce
boundary. Its unchanged schema journal is subordinate to that security regression
and must not be used to label the overall v11-to-v10 path class `N`.

### Earlier version-9 predecessor

| Field | Exact recorded value / status |
|---|---|
| Record ID | `RB-BASE-009` |
| Candidate | `ROADMAP-SITES-V9-2026-08-08` |
| Source and runtime release ID | `6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d` |
| Local source package | `outputs/roadmap-sites-v9-6b48fae.tar.gz`; gzip SHA-256 `8b3d0b13f03f0b13cd10602d24af09bf17c34afdcb4cf73518b2b0d857d59e22`; 2,965,984 bytes; 61 tar entries/49 files; all 10 migrations. The historical clean rebuild passed behavior but did not byte-match this archive. |
| Sites archive content hash | `sha256:0b3986dc73b1d06539dc85900dfd959549d92bcceb812c231a418766d29411fb`; 49 files; 6,737,920 bytes |
| Saved Sites version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_58bb67e8e23c8191a584540a09e363c5` |
| Successful deployment | `appgdep_6a7768f92c588191934eda8abea6d6b4`; final status `succeeded`, provider `updated_at` `2026-08-08T17:36:53.329945+00:00` |
| Environment revision used by that deployment | `11` |
| Access boundary | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Schema journal | `0000` through `0009` |
| Package-lock SHA-256 | `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d` |
| Exercise status | **SUPERSEDED SUCCESSFUL DEPLOYMENT; HISTORICAL V10-TO-V9 APPLICATION/SCHEMA CLASS `N`, BUT NOT A CURRENT TESTED OR APPROVED ROLLBACK TARGET** |

### Earlier version-8 predecessor

`RB-BASE-008` remains immutable historical evidence at commit
`cf117fef8ea42272d0b7e2358fe4197c024f86a7`, local archive gzip SHA-256
`99d615410c2e145e77938f0c5df4449ab8aeb4a544a5c5949fcdafa56a8e1378`
(2,963,266 bytes; 61 entries), Sites content hash
`sha256:9a4119ea60dd64d2a0bf14a55c7e2d27fb3e8ea250f0d064e8bc5a79fb34a87c`
(49 files; 6,737,920 bytes), saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_01ba2d860b508191b4d104339921606d`,
deployment `appgdep_6a775b172534819196391fd626e95aa3`, environment revision
10, and journal `0000` through `0009`. It is not an immediate v13 rollback target
and remains unexercised for that purpose.

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

The version-16 identifiers bind the current candidate. Version 15 is the
immediate behaviorally incompatible predecessor; versions 14 and 13 are older
observability-lineage predecessors, and version 12 and earlier are older
predecessor evidence. No
older version is a presumed safe target. These records do not prove that Sites can
switch versions from environment revision 18, that an older application can safely
operate on current hosted data/configuration, or that application/data recovery will
succeed.

## Current compatibility observation

**Implemented exact-candidate evidence:** Sites version 16 is immutable at commit
`91f37ebd542774779f6db7e000832c2f6714e528` with migration journal `0000`
through `0010`. Migration `0010_steep_hemingway` extends the rate-limit scope
constraint for `share_close_network` and `share_close_session`, and upgrade tests
passed. The SQL change is backward-readable for predecessor operations. The
v16-to-v15 path is class `B` behaviorally because version 15 removes current
failure-boundary, request-reference, attempt-lifecycle, readiness, scheduler-
health, and recovery-boot controls. No predecessor resolves `LOG-PRIV-001`.
The historical v13-to-v12 classification carries forward; every
v16/v15/v14/v13-to-v12 path is class `B` because version 12 removes
application-wide write containment, bounded draft/session recovery, stricter
response/CAS/revision boundaries, native billing recovery, and account share
revoke/reissue/replacement controls. The provider switch and exact rollback smoke
remain unexercised. Version 12 is therefore neither a routine class-`N` target nor
an approved rollback target. The v12-to-v11 lost-ack and v11-to-v10 CSP regressions
remain historical class-`B` evidence.

The historical v10-to-v9 comparison found the same application/runtime source,
package lock, bindings, runtime configuration contract, and schema journal for that
past pair, supporting application/schema class `N` between those two releases. That
fact does not classify or authorize a current v16-to-v9 action. Any version selection
must preserve current secret values, owner-only access,
`BILLING_CHECKOUT_ENABLED=false`, and a compatible `APPLICATION_WRITE_MODE`; do not restore an old environment revision
wholesale. Application rollback is not D1/R2 data restore and does not undo or
repeat the project-level `OWNER-SEC-001` SIWC credential rotation.

Migration `0008` rebuilds the abuse-rate-limit table to admit the two
privacy-operator scopes; migration `0009` rebuilds the existing consent table with
timestamp-consistency checks while preserving the column shape and indexes. The
migration path preserves valid rows and fails atomically rather than replacing the
original table when a contradictory row violates the new constraint. Migration
`0010` rebuilds the rate-limit table again to admit the two share-close scopes while
retaining every prior scope; exact upgrade tests cover the transition.

The SQL structures are also backward-readable by version 7,
but structural
readability is not sufficient for a safe application rollback. Version 7 lacks the
version-8 account `golfer_record` and golfer `roadmap_sharing` enforcement on
ordinary reads, mutations, publication, token exchange, live sessions, and golfer
responses. Once any version from 8 through 16 has governed real data or disclosure through those
controls, selecting version 7 would remove a mandatory privacy/authorization
boundary. The overall rollback is therefore class `B` behaviorally: ordinary
rollback is forbidden; stop affected writes and use a tested forward fix or
controlled recovery. No hosted version switch or recovery exercise has been run.

| From state | To target | Schema class | Current conclusion |
|---|---|---|---|
| Immutable Sites version 16 | Same saved version 16 | `N` | Existing successful private deployment proves deployability at that time, not rollback or restore |
| Sites version 16 | Sites version 15 | `B` behaviorally; schema journal unchanged | **Ordinary rollback forbidden absent an exact narrower exercise.** Version 15 removes current failure-boundary, request-reference, attempt-lifecycle, readiness, scheduler-health, and recovery-boot controls and does not resolve `LOG-PRIV-001`. |
| Historical Sites version 15 | Sites version 14 or 13 | `N` application/schema for that historical comparison | Only packaged observability configuration changed. Neither target resolves `LOG-PRIV-001`; do not recommend v13 as privacy remediation. |
| Sites versions 16 through 13 | `RB-BASE-012` / Sites version 12 | `B` behaviorally; migration `0010` is backward-readable but downgrade behavior is unexercised | **Ordinary rollback forbidden.** Version 12 removes write containment, bounded draft/session recovery, stricter CAS/revision boundaries, native billing recovery, share lifecycle controls, and close-rate-limit scopes. Use a tested forward fix or another explicitly classified recovery path. |
| Historical Sites version 12 | `RB-BASE-011` / Sites version 11 | `B` behaviorally; schema shape through `0009` unchanged | Preserved historical evidence: version 11 removes lost-ack response/audit deduplication, and its legacy response payload can mismatch an active version-12 client holding an outcome-unknown key. |
| Sites versions 16 through 13 | `RB-BASE-010` / Sites version 10 | `B` / unsupported as a current rollback path | Skips multiple predecessors and removes multiple mandatory security/recovery boundaries, including the nonce-CSP boundary. |
| Historical Sites version 11 | `RB-BASE-010` / Sites version 10 | `B` security/behaviorally; schema shape unchanged | Preserved historical compatibility evidence: version 10 removes the per-response framework-script nonce boundary and reintroduces `script-src 'unsafe-inline'`. |
| Historical Sites version 10 | `RB-BASE-009` / Sites version 9 | `N` application/schema for that historical pair; operationally unexercised | Preserved compatibility evidence only. It is not a current version-16 rollback route and neither release is approved as a routine target. |
| Sites versions 16 through 13 | `RB-BASE-009` / Sites version 9 | `B` / unsupported | Skips multiple predecessors and mandatory security/behavior boundaries. Historical v10-to-v9 class `N` does not authorize this action. |
| Sites versions 16 through 13 | `RB-BASE-008` / Sites version 8 | `U` pending exact behavior/configuration classification | Version 8 is not an immediate baseline. Do not select it merely because part of the journal is backward-readable. |
| Any Sites version from 16 through 13 after version-8-or-later consent-governed use | `RB-BASE-007` / Sites version 7 | `B` (behavioral; SQL structures are backward-readable) | **Ordinary rollback forbidden.** Version 7 lacks the required consent enforcement; use a tested forward fix or controlled recovery. |
| Sites versions 16 through 13 | Version 6 or any older predecessor | `B` / unsupported | Multiple security, behavior, migration, and evidence deltas are not an approved rollback path. Use a forward fix or tested recovery. |
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
   select old code; choose a tested forward fix or controlled recovery. Version 12
   is class `B` from versions 16 through 13 because it removes current write-containment,
   recovery, CAS/revision, share-lifecycle, and session-close controls. Historical
   version 11 is class `B` from version 12 because it removes golfer-response
   lost-ack deduplication and can mismatch an active version-12 client. Historical version
   10 is class `B` from version 11 because it reintroduces
   `script-src 'unsafe-inline'`; version 7 is also class `B` behaviorally after any
   version-8-through-15 consent-governed use even though migrations `0008` and `0009`
   remain structurally backward-readable.
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
select version 12 as an ordinary target from versions 16 through 13, because doing so would
remove current application write-containment, recovery, CAS/revision,
share-lifecycle, and session-close controls without a hosted compatibility
exercise. The historical v12-to-v11 lost-ack and v11-to-v10 CSP regressions also remain
class `B`. Do not select version 7 after any version from 8 through 15 has governed
real records or disclosure. Preserve the current state and use a
tested forward fix or recovery path.

`[REAL-WORLD VALIDATION REQUIRED]` No hosted rollback, D1 Time Travel restore, R2
recovery, measured RPO/RTO, or staffed execution is claimed. `OPS-EVID-001` remains
open until a named operator performs and records those exercises against the exact
authorized environment. Aaron's public-launch, retention/legal, billing, real-account,
residual-risk, and exact-release decisions remain unresolved.
