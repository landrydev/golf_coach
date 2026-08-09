# Local synthetic recovery exercise

**Evidence classification:** `LOCAL SYNTHETIC EVIDENCE — NOT HOSTED BACKUP/RESTORE EVIDENCE`

Run from `10_production_saas`:

```powershell
npm run exercise:recovery:local
```

## Recorded exact-version-11 result

The exact-version-11 run at source/runtime release
`44670a64498779cf747914b4465380916a939301` passed. It applied all 10
migrations through `0009_cultured_namora`, populated and compared all 31
application tables across 2 synthetic tenants, and restored 3 private synthetic
objects. The D1 logical snapshot was 34,380 bytes with SHA-256
`34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54`;
the object inventory totalled 199 bytes.

All three negative integrity checks detected their intended fault: modified D1
content, a missing R2 object, and an R2 checksum mismatch. The child-process
isolation check also passed: generated home, configuration, and temporary paths
were used, only `SystemRoot` and `WINDIR` were eligible for forwarding on
Windows, and the modeled parent secret probes were absent from the child.
Post-restore normalization preserved active rate limits, removed expired limits,
made in-flight account, billing-event, and reconciliation leases retry-safe, and
marked the running scheduler heartbeat interrupted.

The measured 103,656 ms is local wall-clock duration, not an RTO measurement;
snapshot age is not an RPO measurement. This exact-commit result remains local
synthetic evidence and is not a hosted D1/R2 restore, provider-backup,
deletion-recovery, operator-readiness, or alert-delivery result. See the
[canonical exact-version-11 local exercise record](release-evidence/ROADMAP-SITES-V11-2026-08-08-LOCAL-EXERCISES.md).

The command creates only deterministic fake records and private fake objects in
an isolated operating-system temporary directory. It exits nonzero at the first
failed invariant and removes the temporary directory whether it passes or
fails.

## What the exercise covers

The exercise:

1. reads the migration journal and latest Drizzle schema snapshot, fails if an
   application table is not explicitly classified, and applies every journaled
   migration to a new local D1 database;
2. populates every one of the 31 current application-schema tables with
   representative synthetic product, sharing, privacy, audit, billing, and
   operational state across two tenants;
3. creates a Wrangler local D1 data-only logical SQL export, reapplies the same
   migrations to a second clean local database, and imports the snapshot;
4. checks foreign keys and tenant relationships, then compares every column of
   every populated row in all 31 tables between source and restore;
5. snapshots three synthetic private objects from a Miniflare R2-compatible
   bucket, restores them to a second isolated bucket, and verifies inventory,
   byte size, SHA-256, minimized tenant metadata, and D1 references;
6. proves that the integrity checks reject a syntactically valid but
   content-modified D1 snapshot, an R2 inventory with a missing object, and a
   backup body with a checksum mismatch;
7. applies deterministic post-restore normalization to execution state that
   cannot remain valid after a process-level restore, then verifies every
   normalized field and proves all other tables were unchanged; and
8. emits one privacy-safe JSON evidence record after the human-readable pass
   lines.

A pass demonstrates that the repository's current migrations and this one
local logical-copy procedure preserve the covered synthetic state. It is not
provider or production recovery evidence.

## Exact table boundary

All 28 authoritative product and billing lifecycle tables are populated:

`accounts`, `assessments`, `audit_events`, `billing_checkout_attempts`,
`billing_customers`, `billing_events`, `billing_reconciliation_targets`,
`billing_subscription_projection_generations`, `coaching_packages`,
`consent_records`, `data_requests`, `development_plans`, `evidence_items`,
`golfer_goals`, `golfer_plan_responses`, `golfers`, `instructor_profiles`,
`lessons`, `media_assets`, `phase_priorities`, `phase_review_evidence`,
`phase_reviews`, `plan_phases`, `plan_priorities`, `practice_items`,
`share_links`, `share_sessions`, and `subscriptions`.

All three application operational-state tables are also populated:

`abuse_rate_limits`, `billing_account_operation_leases`, and
`scheduler_heartbeat`.

**Intentionally excluded application-schema tables:** none. SQLite/D1 runtime
implementation tables that are not declared in the latest Drizzle application
schema are not application lifecycle tables and are outside this exercise's
table-coverage count.

The exercise uses the latest journaled Drizzle snapshot to construct bounded
canonical reads. Each read includes all declared columns and deterministically
orders rows by the table's primary key. Exact source-to-restore equality is
therefore stronger than a row-count-only check.

## Post-restore operational-state policy exercised

The synthetic source deliberately contains valid but in-flight state. After
exact raw source-to-restore equality is proven, the restored copy is normalized
at a deterministic synthetic recovery timestamp:

- every held `billing_account_operation_leases` row becomes `idle`; operation,
  token, and expiry are cleared, and release/update timestamps are recorded;
- every `processing` `billing_events` row becomes `failed`, its lease fields are
  cleared, and a minimized retry-required recovery code/message is recorded;
- every `processing` `billing_reconciliation_targets` row becomes `failed`, its
  lease fields are cleared, completion/error fields are recorded, and it is
  scheduled for retry without being dead-lettered;
- a `running` `scheduler_heartbeat` becomes `failed` with result counters
  cleared and a normalized interruption code; and
- expired `abuse_rate_limits` windows are removed while an unexpired window is
  retained, so restore does not silently weaken active abuse protection.

These transitions are idempotent. The exercise verifies them after execution
and compares every table outside the five deliberately changed tables against
the pre-normalization restored state. Provider-authoritative lifecycle records
such as an open Checkout attempt are preserved; this local exercise does not
invent a Stripe outcome.

## JSON evidence record

The final output line begins with `RECOVERY_EVIDENCE_JSON ` followed by one JSON
object. The record contains:

- application, Node.js, Miniflare, Wrangler, migration-journal, migration-tip,
  and schema-snapshot versions;
- local wall-clock duration;
- covered authoritative and operational tables, schema/population counts, and
  the explicit intentionally excluded table list;
- normalization results;
- snapshot byte size and SHA-256 plus R2-compatible object count/bytes;
- named negative integrity scenarios and their pass state;
- subprocess environment-isolation status; and
- explicit limitations.

It does not emit synthetic account IDs, emails, object keys, content, bearer
material, lease tokens, or fixture row values. The snapshot checksum is an
integrity identifier for fake local data, not customer or credential material.
The duration is labelled as a local wall-clock observation and is not an RTO
measurement. The snapshot age is not an RPO measurement.

## Reproducible local runtime boundary

- The script imports the directly declared development dependency `miniflare`
  and verifies the installed Miniflare and Wrangler versions equal the exact
  declarations in `package.json`. `package-lock.json` records their resolved
  integrity and transitive graph.
- Each bundled Wrangler subprocess receives generated `CI`, colour, home,
  temporary-directory, telemetry, and XDG configuration values. `HOME`,
  `USERPROFILE`, `TEMP`, `TMP`, `TMPDIR`, and `XDG_CONFIG_HOME` point inside the
  disposable exercise directory.
- On Windows, only `SystemRoot` and `WINDIR` may be copied from the parent
  environment because the operating-system runtime can require them. On other
  platforms the inherited-parent allowlist is empty. No other parent variable,
  including `PATH`, is forwarded.
- Before any Wrangler command runs, the exercise puts synthetic secret-shaped
  probes into a modeled parent environment, launches a child through the same
  environment builder used for Wrangler, and fails unless every probe is
  absent.

## Limitations

The command does **not** access Sites, hosted D1, hosted R2, Stripe, SIWC,
customer data, production credentials, or provider-native recovery. It does not
establish a production backup, retention policy, deletion recovery, operator
readiness, alert delivery, measured RPO/RTO, or a successful hosted restore.
Those require a separately authorized exercise against the actual provider
environment and must be recorded as separate evidence.
