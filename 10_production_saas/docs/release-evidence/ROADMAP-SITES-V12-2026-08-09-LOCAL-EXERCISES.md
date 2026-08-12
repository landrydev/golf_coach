# Exact version-12 local recovery and capacity exercises

**Evidence class:** LOCAL SYNTHETIC EVIDENCE — NOT HOSTED BACKUP, RESTORE, PERFORMANCE, OR CAPACITY EVIDENCE
**Observed:** 2026-08-08 in America/Edmonton / 2026-08-09 UTC
**Exact deployed source/runtime commit:** `7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c`
**Execution source commit:** `3bb051a0959800fbadc42f796289c52cbb75edc1`
**Result:** both bounded exercises passed; no production resource, identity, credential, customer data, message, or charge was used

## Runtime-equivalence boundary

The execution commit contains the version-12 release documentation added after
deployment. Before the exercises, this command returned no paths:

```text
git diff --name-only 7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c 3bb051a0959800fbadc42f796289c52cbb75edc1 -- . ':(exclude)README.md' ':(exclude)docs/**'
```

The application source, schema, migrations, package manifest, lockfile, Worker,
and exercise code were therefore identical to the deployed version-12 runtime
commit. This is runtime-equivalent local evidence, not a claim that hosted D1,
R2, SIWC, Sites scheduling, or provider networking was exercised.

## Local logical recovery exercise

Command:

```text
npm run exercise:recovery:local
```

Result: **PASS**. The structured exercise reported 102,306 ms local wall-clock
time; the command completed in approximately 103.3 seconds.

| Observation | Exact bounded result |
|---|---|
| Runtime | Node `v24.18.0`; Wrangler `4.120.0`; Miniflare `5.20260801.1-alpha` |
| Schema | All 10 journaled migrations through `0009_cultured_namora`; migration journal version `7`; 31/31 application tables populated and inspected |
| Tenancy and state | Two synthetic tenants; every column of every populated table, foreign keys, tenant ownership, lifecycle state, audit order, data-request state, and billing projections matched after restore |
| D1 snapshot | 34,380 bytes; SHA-256 `34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54` |
| Post-restore normalization | Active rate-limit windows preserved; expired windows removed; in-flight account/event/reconciliation leases released for retry; running scheduler marked interrupted |
| R2-compatible objects | Three private synthetic objects; 199 bytes total; inventory, D1 metadata, and SHA-256 checks matched |
| Negative checks | Modified D1 snapshot, missing R2 object, and R2 checksum mismatch were each detected |
| Subprocess isolation | Wrangler received generated home/config/temp paths and only the `SystemRoot`/`WINDIR` non-secret parent allowlist; secret-shaped probe variables were absent |

The snapshot contents and checksum match the historical version-11 fixture
because version 12 added no schema migration and retained the same representative
recovery dataset. This new execution establishes current-runtime provenance; it
does not turn the fixture into hosted or provider-native recovery evidence.

The duration is not an RTO, the synthetic snapshot age is not an RPO, and the
exercise does not establish backup retention, deletion recovery, alert delivery,
operator readiness, or recovery of production/customer data.

## Local bounded-capacity exercise

Command:

```text
npm run exercise:capacity:local
```

Result: **PASS** with zero failed requests.

| Observation | Exact bounded result |
|---|---|
| Runtime | Node `v24.18.0`; npm `12.0.1`; Wrangler `4.120.0`; Miniflare `5.20260801.1-alpha`; vinext `0.0.45` |
| Built Worker | Runtime-equivalent production build; generated Worker bundle SHA-256 `53a128f1c0c62e6263b7f0f48472b7c87243b587244c4adda659e48963e05a9f` |
| Workload | Two tenants; 54 measured requests; maximum concurrency four; four author/edit/publish/share-exchange flows; two bounded exports |
| Representative shapes | Small tenant: two golfers/two plans/one package; large tenant: 122 golfers/122 plans/121 packages; list responses remained bounded to 50 items |
| Status distribution | 44 responses with `200`; 10 with `201`; zero failures |
| Local latency observation | p50 42.81 ms; p95 94.21 ms; maximum 94.67 ms |
| Workload duration | 1,433.10 ms; initialization, workload, and cleanup 1,813.79 ms |
| Bounded outputs | Largest export 278,117 bytes; largest workspace response 23,946 bytes |

These timings are observations from one disposable process on one development
machine. They are not approved targets, a tenant limit, an SLO/SLA, sustained
load, soak, cold-start, geographic latency, provider contention, or hosted
capacity evidence. The capacity mix exchanges private shares but does not
replace the separate golfer-response idempotency/race tests.

## Isolation and disposition

- Both exercises used synthetic adults-only fixtures and local compatible
  runtimes.
- No Sites deployment, hosted D1/R2, SIWC session, Stripe provider operation,
  real identity, production secret, customer data, message, or charge was used.
- Each exercise removed its disposable Worker, D1, R2-compatible, snapshot, and
  temporary state on exit.
- The main source worktree remained available; generated `dist` output is not
  evidence of a provider package until separately archived, verified, saved,
  and deployed through the release workflow.

## What remains open

This record improves exact-version provenance for local recovery and bounded
capacity only. It does not close hosted/provider backup and restore, application
rollback or forward-fix, measured RPO/RTO, hosted performance, scheduler
invocation, alert delivery, cost monitoring, incident execution, named operator,
manual accessibility, signed-in browser, real-user, or owner-acceptance evidence.
