# Local synthetic recovery exercise

**Evidence classification:** `LOCAL SYNTHETIC EVIDENCE — NOT HOSTED BACKUP/RESTORE EVIDENCE`

Run from `10_production_saas`:

```powershell
npm run exercise:recovery:local
```

The exercise creates only deterministic fake records and private fake objects in an isolated operating-system temporary directory. It then:

1. applies every migration in `drizzle/meta/_journal.json` to a new local D1 database;
2. inserts two synthetic tenants with published plans, active and revoked golfer capabilities/sessions, ordered audit events, data-request states, billing projections, and private-object metadata;
3. creates a Wrangler local D1 data-only logical SQL export, reapplies the same versioned migrations to a second clean local D1 database, and imports the data snapshot there;
4. checks foreign keys, row counts, tenant ownership relationships, publication/revocation state, audit order, data-request state, billing projection generations, and exact source-to-restore equality;
5. snapshots synthetic private objects from a Miniflare R2-compatible bucket into an inventory plus local backup copy, restores them into a second isolated bucket, and checks keys, byte sizes, SHA-256 values, tenant metadata, and D1 references; and
6. removes the temporary exercise directory whether the exercise passes or fails.

The command exits nonzero at the first failed invariant. A pass demonstrates that this repository's current migrations and one local logical-copy procedure can restore the covered synthetic state.

## Reproducible local runtime boundary

- The script imports the directly declared development dependency `miniflare` at exact version `5.20260801.1-alpha`; `package-lock.json` records the already-resolved package, integrity, and transitive graph.
- Each bundled Wrangler subprocess receives generated `CI`, colour, home, temporary-directory, telemetry, and XDG configuration values. `HOME`, `USERPROFILE`, `TEMP`, `TMP`, `TMPDIR`, and `XDG_CONFIG_HOME` all point inside the disposable exercise directory.
- On Windows, only `SystemRoot` and `WINDIR` may be copied from the parent environment because the operating-system runtime can require them. On other platforms the inherited-parent allowlist is empty. No other parent variable, including `PATH`, is forwarded.
- Before any Wrangler command runs, the exercise builds a parent environment containing synthetic `CLOUDFLARE_API_TOKEN`, `DATABASE_URL`, `OPENAI_API_KEY`, `SIWC_BYPASS_TOKEN`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` probes, launches a child with the same environment builder used for Wrangler, and fails unless every probe is absent. The successful command prints a separate `PASS subprocess isolation` line.

It does **not** access Sites, hosted D1, hosted R2, Stripe, SIWC, customer data, production credentials, or provider-native recovery. It does not establish a production backup, deletion recovery, retention policy, RPO, RTO, operator readiness, alert delivery, or a successful hosted restore. Record those separately only after an authorized exercise against the actual provider environment.
