# Rollback artifact and schema-compatibility record

**Status:** Exact rollback target registered; hosted rollback and restore remain
unexercised
**Last reconciled:** 2026-08-08
**Related:** [Operations rollback procedure](OPERATIONS.md#rollback-procedure),
[release evidence](RELEASE_EVIDENCE.md#exact-private-sites-release), and
[findings ledger](FINDINGS_RETEST_LEDGER.md)

Application rollback, configuration rollback, Stripe reconciliation, secret
rotation, and D1/R2 recovery are different operations. Selecting an older Sites
version must never silently reverse SQL, overwrite data, delete billing history,
or restore an exposed secret.

## Registered rollback target

| Field | Exact recorded value / status |
|---|---|
| Record ID | `RB-BASE-006` |
| Candidate | `ROADMAP-SITES-V6-2026-08-08` |
| Source and runtime release ID | `e2a6e344d0cccdb73cde4697beca32ad02743f79` |
| Sites archive content hash | `sha256:0b66689cad4d08639783b85faf4cbc76611317864e3bb644143f56708ba762b9` |
| Saved Sites version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_2c09bb4c47b0819192eba33a8e075edc` |
| Successful deployment | `appgdep_6a7714dd7bbc8191a4b2118e22ee8c97` |
| Environment revision used by that deployment | `8` |
| Access boundary | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Schema journal | `0000` through `0007`; journal SHA-256 `c30d149f36f949b1edb419fe4ecd2d8abc73d2d1eb55f4fb3f858327dd899335` |
| Migration digests | Exact per-file SHA-256 values are frozen in [release evidence](RELEASE_EVIDENCE.md#exact-private-sites-release) |
| Package-lock SHA-256 | `a29e63ce73d1de9f40d54ebc615982686af6c53084c107f84e35d1316ba425d1` |
| Exercise status | **REGISTERED, NOT ROLLBACK-TESTED** |

The saved version and content hash identify the current code rollback artifact.
They do not prove that Sites can redeploy it under a later environment revision or
that it can safely read a later schema.

## Current compatibility observation

**Implemented repository evidence:** on 2026-08-08,
`git diff --quiet e2a6e344d0cccdb73cde4697beca32ad02743f79 -- drizzle db`
returned success. The current working candidate therefore introduces no repository
schema or migration change relative to version 6. This is preliminary class `N`
evidence only: the working tree is not an immutable release, and hosted rollback,
configuration compatibility, and data integrity have not been exercised.

| From state | To target | Schema class | Current conclusion |
|---|---|---|---|
| Sites version 6 on its recorded schema/configuration | Same saved version 6 | `N` | Existing successful deployment proves deployability at that time, not a rollback drill |
| Current uncommitted candidate, no migration delta | `RB-BASE-006` | Preliminary `N` | Code rollback is plausible; exact-candidate build, hosted deployment switch, smoke, and data-integrity evidence are still required |
| Any future release with migration/configuration changes | `RB-BASE-006` | Unclassified | **Do not roll back** until the per-release matrix below is completed and exercised |

Compatibility classes are:

| Class | Meaning | Default response |
|---|---|---|
| `N` | No schema change | Code rollback may proceed only after configuration and exact-release tests pass |
| `A` | Additive/backward-compatible change; old code ignores new nullable/defaulted structures | Prove old-code reads/writes and constraints against the migrated schema before release |
| `T` | Transitional expand/migrate/contract sequence | Roll back only within the explicitly tested compatibility window |
| `B` | Breaking/destructive change or old code would misread/write data | No ordinary code rollback; stop writes and use an approved forward fix or tested recovery plan |

## Required per-release compatibility record

Complete this before every deployment that changes code, configuration, bindings,
or migrations.

| Field | Required value |
|---|---|
| Forward release | Commit, runtime release ID, archive hash, saved version, deployment, environment revision |
| Rollback target | Saved immutable version, source commit, archive hash, last-known-good evidence |
| Schema before/after | D1 database/environment, journal entries and hashes, provider migration state |
| Compatibility class | `N`, `A`, `T`, or `B`, with SQL/data rationale |
| Tested application window | Exact old/new code versions proven against exact before/after schemas |
| Configuration delta | Non-secret names/values, bindings, access policy, feature flags, canonical origin; secret inventory/rotation state without values |
| Data protection | Pre-change D1 bookmark/recovery point, R2 inventory/checksums, in-flight export/deletion state |
| Billing protection | Checkout state, webhook backlog, account-operation leases, reconciliation targets, recognized/entitled Prices |
| Trigger and authority | Quantified rollback triggers, decision maker, release operator, communication/escalation route |
| Verification | Public/identity/instructor/golfer/billing/data-request/health/audit/log smoke and integrity queries |
| Result | Time started/completed, customer effect, data integrity, unresolved findings, next action |

Do not put secret values, raw capabilities, personal content, webhook bodies, or
customer identifiers in this record.

## Rollback execution sheet

1. Declare the incident/change window, freeze affected writes when integrity is
   uncertain, and preserve privacy-safe evidence.
2. Identify the currently running release, environment revision, D1 migration
   state, R2 inventory, Stripe backlog, and exact `RB-*` target.
3. Confirm the compatibility record is complete. If class `B` or unknown, do not
   select old code; choose a tested forward fix or controlled recovery.
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

Stop ordinary rollback and escalate when schema class is unknown or `B`, a migration
is partially applied, tenant ownership/integrity is uncertain, capability/secret
exposure exists, audit writes fail, deletion/export work is in flight without a safe
state, Stripe events are unresolved, or the target/configuration hashes do not match.

`[REAL-WORLD VALIDATION REQUIRED]` No hosted rollback, D1 Time Travel restore, R2
recovery, measured RPO/RTO, or staffed execution is claimed. `OPS-EVID-001` remains
open until a named operator performs and records those exercises against the exact
authorized environment. Aaron's public-launch, retention/legal, billing, real-account,
residual-risk, and exact-release decisions remain unresolved.
