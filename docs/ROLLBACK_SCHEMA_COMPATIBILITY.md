# Rollback artifact and schema-compatibility record

**Status:** Exact current candidate and predecessor registered; version 7 is not an
ordinary rollback target after version-8 consent-governed use; hosted rollback and
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
| Record ID | `RB-CANDIDATE-008` |
| Candidate | `ROADMAP-SITES-V8-2026-08-08` |
| Source and runtime release ID | `cf117fef8ea42272d0b7e2358fe4197c024f86a7` |
| Local source package | Gzip SHA-256 `99d615410c2e145e77938f0c5df4449ab8aeb4a544a5c5949fcdafa56a8e1378`; 2,963,266 bytes; 61 tar entries; exact archive verifier passed with 10 migrations |
| Sites archive content | `sha256:9a4119ea60dd64d2a0bf14a55c7e2d27fb3e8ea250f0d064e8bc5a79fb34a87c`; 49 files; 6,737,920 bytes |
| Saved Sites version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_01ba2d860b508191b4d104339921606d` |
| Successful deployment | `appgdep_6a775b172534819196391fd626e95aa3`; succeeded `2026-08-08T16:36:50.529785+00:00` |
| Environment revision used by that deployment | `10` |
| Access boundary | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Schema journal | `0000` through `0009`; migrations `0008` and `0009` are structurally backward-readable, but version 7 does not enforce version-8 consent requirements |
| Package-lock SHA-256 | Canonical Git-blob/SBOM bytes: `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d`; recorded Windows working-checkout/extracted Git source-archive bytes: `a29e63ce73d1de9f40d54ebc615982686af6c53084c107f84e35d1316ba425d1` |
| Local recovery observation | 10 migrations and 2 synthetic tenants passed; snapshot SHA-256 `34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54` |
| Exercise status | **IMMUTABLE CANDIDATE REGISTERED; NOT ROLLBACK- OR HOSTED-RESTORE-TESTED** |

### Historical predecessor and rollback baseline

| Field | Exact recorded value / status |
|---|---|
| Record ID | `RB-BASE-007` |
| Candidate | `ROADMAP-SITES-V7-2026-08-08` |
| Source and runtime release ID | `7ed01ec822fdb5c2bfbe6db7e3c99bcba126ac17` |
| Local source package | Gzip SHA-256 `a07f06989d3ba6cf05b924b149fc9f955be512223c6f90d5dd8d7628d175e526`; 2,916,309 bytes; 57 tar entries |
| Sites archive content hash | `sha256:4a00694b9798f4f84487e8e7ea224703ccbbfc61a32dd132d417dc65b7f153bc`; 45 files; 6,236,160 bytes |
| Saved Sites version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_55fe270d85f081919dcd346c8476130d` |
| Successful deployment | `appgdep_6a772e0616b88191972b4e2e0603da52`; succeeded `2026-08-08T13:24:35.466957+00:00` |
| Environment revision used by that deployment | `9` |
| Access boundary | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Schema journal | `0000` through `0007` |
| Package-lock SHA-256 | `a29e63ce73d1de9f40d54ebc615982686af6c53084c107f84e35d1316ba425d1` |
| Exercise status | **SUPERSEDED SUCCESSFUL DEPLOYMENT; PRIVACY-BEHAVIORALLY FORBIDDEN AS AN ORDINARY TARGET AFTER VERSION-8 CONSENT-GOVERNED USE** |

The version-8 identifiers bind the current candidate, while version 7 is retained
only as immutable predecessor evidence. Version 6 remains an earlier historical
predecessor in release evidence. No older version is a presumed safe target. These
tables do not prove that Sites can switch versions under environment revision 10,
that an older application can safely operate on current hosted data, or that
application/data recovery will succeed.

## Current compatibility observation

**Implemented exact-candidate evidence:** Sites version 8 is immutable at commit
`cf117fef8ea42272d0b7e2358fe4197c024f86a7` with migration journal `0000`
through `0009`. Migration `0008` rebuilds the abuse-rate-limit table to admit the
two privacy-operator scopes; migration `0009` rebuilds the existing consent table
with timestamp-consistency checks while preserving the column shape and indexes.
The migration path preserves valid rows and fails atomically rather than replacing
the original table when a contradictory row violates the new constraint.

Those SQL structures are backward-readable by version 7, but structural
readability is not sufficient for a safe application rollback. Version 7 lacks the
version-8 account `golfer_record` and golfer `roadmap_sharing` enforcement on
ordinary reads, mutations, publication, token exchange, live sessions, and golfer
responses. Once version 8 has governed any real data or disclosure through those
controls, selecting version 7 would remove a mandatory privacy/authorization
boundary. The overall rollback is therefore class `B` behaviorally: ordinary
rollback is forbidden; stop affected writes and use a tested forward fix or
controlled recovery. No hosted version switch or recovery exercise has been run.

| From state | To target | Schema class | Current conclusion |
|---|---|---|---|
| Immutable Sites version 8 | Same saved version 8 | `N` | Existing successful private deployment proves deployability at that time, not rollback or restore |
| Sites version 8 after any consent-governed use | `RB-BASE-007` / Sites version 7 | `B` (behavioral; SQL structures are backward-readable) | **Ordinary rollback forbidden.** Version 7 lacks the required consent enforcement; use a tested forward fix or controlled recovery. |
| Sites version 8 before any consent-governed use, if that state can be proven | `RB-BASE-007` / Sites version 7 | Structurally backward-readable; behavioral class requires exact proof | Do not presume safety. A named operator must prove data/use state, configuration compatibility, the complete security/privacy boundary, and an exact rollback drill before selection. |
| Sites version 8 | Version 6 or any older predecessor | `B` / unsupported | Multiple behavior and evidence deltas are not an approved rollback path. Use a forward fix or tested recovery. |
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
| Verification | Public/identity/instructor/golfer/consent/share/billing/data-request/health/audit/log smoke and integrity queries |
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
   is class `B` behaviorally after any version-8 consent-governed use even though
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
select version 7 after version 8 has governed real records or disclosure; preserve
the current state and use a tested forward fix or recovery path.

`[REAL-WORLD VALIDATION REQUIRED]` No hosted rollback, D1 Time Travel restore, R2
recovery, measured RPO/RTO, or staffed execution is claimed. `OPS-EVID-001` remains
open until a named operator performs and records those exercises against the exact
authorized environment. Aaron's public-launch, retention/legal, billing, real-account,
residual-risk, and exact-release decisions remain unresolved.
