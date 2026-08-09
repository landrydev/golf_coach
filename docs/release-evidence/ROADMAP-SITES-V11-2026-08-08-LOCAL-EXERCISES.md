# Exact version-11 local recovery and capacity exercises

**Evidence class:** EXACT-COMMIT LOCAL SYNTHETIC EVIDENCE — NOT HOSTED RECOVERY, PERFORMANCE, RPO, RTO, OR CAPACITY EVIDENCE

**Candidate:** `ROADMAP-SITES-V11-2026-08-08`

**Exact source/runtime commit:** `44670a64498779cf747914b4465380916a939301`

**Recorded:** 2026-08-08T23:29:42.9157465Z

## Isolation and provenance

Both exercises ran from one disposable detached Git worktree at the exact deployed
runtime commit. The worktree reused the repository's lock-aligned installed
dependencies; the exercise scripts independently required the installed Miniflare,
Vinext, and Wrangler versions to equal the pinned package manifest. Earlier v11
supply-chain evidence separately records two clean installs and complete verification.

No hosted Sites, D1, R2, Stripe, SIWC session, production credential, customer data,
message, charge, or public-access change was used. The disposable worktree and all
synthetic state were removed after the run.

## Recovery exercise

Command: `npm run exercise:recovery:local`

Result: **PASS** in 103,656 ms of local wall-clock time.

| Control | Exact observation |
|---|---|
| Schema | All 10 journaled migrations through `0009_cultured_namora`; 31/31 application tables populated and inspected |
| Relational fixtures | Two isolated synthetic tenants; every populated column, foreign key, tenant-ownership relation, lifecycle state, audit order, data-request state, and billing projection matched after logical restore |
| D1 snapshot | 34,380 bytes; SHA-256 `34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54` |
| R2-compatible fixtures | Three private synthetic objects; 199 bytes; inventory and SHA-256 values matched D1 metadata |
| Retry normalization | Active rate-limit windows preserved; expired windows removed; in-flight account, billing-event, and reconciliation leases released for retry; running scheduler marked interrupted |
| Negative checks | Modified D1 snapshot, missing R2 object, and R2 checksum mismatch were each detected |
| Subprocess isolation | Wrangler received generated home/config/temp locations plus only `SystemRoot`/`WINDIR`; secret-shaped probe variables were not forwarded |

The duration is not an RTO measurement, the synthetic snapshot age is not an RPO
measurement, and the result does not prove provider-native backup retention,
deletion recovery, hosted restore, operator readiness, or alert delivery.

## Capacity exercise

Command: `npm run exercise:capacity:local`

Result: **PASS** with zero failed requests.

| Control | Exact observation |
|---|---|
| Built Worker | Exact-commit production build; generated Worker bundle SHA-256 `900548775456e482eb5a75a440e2700b8d669117353cd0d1c69bc4eff3b1481f` |
| Workload | Two synthetic tenants; 54 measured requests; maximum concurrency 4 |
| Critical mix | Four author/edit/publish/share-exchange flows plus two bounded exports |
| Representative rows | Small tenant: 2 golfers, 2 plans, 1 package. Large tenant: 122 golfers, 122 plans, 121 packages |
| Status distribution | 44 responses with `200`; 10 with `201`; zero failures |
| Bounded reads | Twelve golfer lists, twelve package lists, and eight workspace renders; maximum list length 50 |
| Bounded outputs | Largest export 278,117 bytes; largest workspace response 23,946 bytes |
| Local timing observation | p50 48.46 ms; p95 107.60 ms; maximum 107.83 ms; workload 1,638.06 ms; full harness 2,038.37 ms |

These are disposable single-process local observations. They do not establish a
business threshold, tenant limit, SLO, SLA, sustained load, soak, provider network,
geographic latency, cold-start, contention, hosted capacity, or production
performance claim.

## Cleanup and dependency restoration

During worktree cleanup, Windows junction handling emptied the main generated
`node_modules` directory. Source files, the package lock, Git history, release
archives, and hosted state were unchanged. `npm ci --no-audit` immediately restored
all 501 locked packages; the same five install scripts remained blocked. The normal
post-restoration build passed, and the subsequently modified current working source
passed the full repository gate with 241/241 tests. Those checks confirm dependency
restoration and current-branch operability; they do not relabel the exercises or that
successor-source test run as exact-version-11 evidence.

## Disposition

This upgrades local synthetic recovery and bounded-capacity evidence from the
historical exact-version-10 run to the exact deployed version-11 runtime source. It
does not close `OPS-EVID-001`, `OPS-CRON-001`, hosted backup/restore, application
rollback/forward-fix, alerting, cost monitoring, named-operator, RPO/RTO, or public
release requirements.
