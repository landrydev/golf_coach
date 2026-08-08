# Local synthetic capacity exercise

**Evidence classification:** `LOCAL SYNTHETIC CAPACITY EVIDENCE — NOT HOSTED PERFORMANCE EVIDENCE`

Run from `10_production_saas`:

```powershell
npm run exercise:capacity:local
```

The npm command first creates the current production Worker bundle and then
runs that bundle in a disposable Miniflare runtime backed by an isolated local
D1 database. It does not start a hosted deployment or use an existing local
database. The runtime is disposed whether the exercise passes or fails.

## Purpose and boundary

This exercise supplies a repeatable quantitative **local observation** for
bounded reads and a representative critical write mix. It is designed to expose
large regressions, unbounded output, failed concurrency, or unexpectedly slow
local code paths before hosted validation. It does not select or approve a
business capacity, latency target, SLO, SLA, tenant limit, or concurrency
promise.

The production bundle is exercised through its real request handlers,
authorization boundary, repositories, migrations, and local D1 implementation.
The only direct D1 writes are the documented synthetic large-tenant seed; all
measured requests go through the production Worker.

## Fixed synthetic workload

The exercise creates two allowlisted fake instructors using reserved
`example.test` identities:

- the small tenant finishes with 2 golfers, 2 development plans, and 1 coaching
  package;
- the large tenant bulk seed adds 120 golfers, 120 development plans, and 120
  coaching packages, then measured authoring leaves it with 122 golfers, 122
  plans, and 121 packages.

The measured workload contains exactly 54 requests:

| Operation | Requests | Expected status |
| --- | ---: | ---: |
| Profile setup | 2 | `200` |
| Package setup | 2 | `201` |
| Complete authoring | 4 | `201` |
| Plan edit | 4 | `200` |
| Publish/share creation | 4 | `201` |
| Share exchange | 4 | `200` |
| Bounded data export | 2 | `200` |
| Bounded golfer lists | 12 | `200` |
| Bounded package lists | 12 | `200` |
| Bounded workspace pages | 8 | `200` |

Four independent author → edit → publish → share flows run concurrently, split
evenly across the two tenants. Each flow remains sequential internally because
later operations require the authoritative revision or capability created by
the prior operation. The two exports run concurrently. Read tasks use maximum
concurrency four. No phase uses concurrency above four.

The list reads use the product's explicit `limit=50` pagination boundary at
representative offsets. The exercise asserts that no response exceeds the
requested item limit. Workspace HTML and export bodies are fully consumed and
checked against generous harness safety caps of 1,000,000 and 6,291,456 bytes,
respectively. These caps prevent an accidentally unbounded local exercise; they
are not product or business thresholds.

## Measurement method

Request latency starts immediately before local Worker dispatch and ends after
the response body has been fully consumed and its bounded-output invariants
have been checked. Setup requests remain in the sample so bundle/runtime cold
behavior is not silently discarded.

For all requests together and for each operation, the JSON record reports:

- sample count;
- p50 latency;
- p95 latency; and
- maximum latency.

Percentiles use the nearest-rank method over sorted samples. Values are rounded
to two decimal places. Concurrent latency samples must not be added together to
infer wall-clock time or throughput.

The script has a 60-second runtime guard covering local runtime initialization,
migrations, seed, workload, verification, and disposal. The preceding
production build belongs to the npm command but is not included in the JSON
runtime duration. The guard is a harness safety bound, not an application
latency or service objective.

## JSON evidence

The final output line begins with `CAPACITY_EVIDENCE_JSON ` followed by one JSON
object containing:

- application, Node.js, npm, Miniflare, Vinext, Wrangler, migration-journal,
  migration-tip, and production Worker bundle versions/integrity;
- workload and total local runtime durations;
- tenant shapes, bulk-seed counts, request counts, and concurrency;
- overall and per-operation p50/p95/max latency;
- HTTP status distribution;
- failure count and minimized failure-category distribution;
- observed bounded-output sizes/counts and the exercise safety caps; and
- explicit limitations.

The record contains no fake email, name, record ID, share capability, cookie,
request/response content, URL, D1 value, or error message. A final privacy
assertion rejects the record if any known fixture identity, bulk-record prefix,
share token marker, or cookie marker appears. The production Worker bundle
SHA-256 is source-integrity metadata, not customer data.

## Pass conditions

The exercise exits nonzero unless all of the following hold:

- every migration and synthetic seed operation succeeds;
- all 54 measured requests return their expected status;
- the final tenant row counts match the declared workload;
- list, workspace, and export outputs stay within the exercise's bounds;
- failure count is zero and status distribution is exactly 44 `200` responses
  plus 10 `201` responses;
- latency summaries are internally ordered and populated;
- maximum concurrency is four;
- the runtime remains below the harness guard; and
- the emitted JSON passes the private-fixture-value scan.

## Limitations

This command uses one local process and one disposable local D1 runtime on the
operator's development machine. It does **not** access Sites, hosted D1, hosted
R2, Stripe, SIWC, customer data, real identities, production credentials, or a
provider network. It does not measure hosted routing, regional or network
latency, provider contention, cold deployment starts, sustained throughput,
soak behavior, resource quotas, failure recovery, multi-region behavior, real
user devices, or alerting.

Results vary with the machine, operating system, background activity, Node.js
runtime, package versions, and build. Compare records only with those limits in
mind. Hosted capacity planning and any approved targets require separate owner
decisions and provider-environment evidence.
