# Exact version-13 local recovery and capacity exercises

**Evidence class:** LOCAL SYNTHETIC EVIDENCE - NOT HOSTED BACKUP, RESTORE,
PERFORMANCE, OR CAPACITY EVIDENCE
**Observed:** 2026-08-09
**Exact source/runtime commit:** `f3482845a42730e87f4ff1190550511f19ea6ad5`
**Result:** both bounded exercises passed; no production resource, identity,
credential, customer data, message, or charge was used

## Exact-source boundary

The exercises used the version-13 source state frozen as commit
`f3482845a42730e87f4ff1190550511f19ea6ad5`. They exercised local compatible
D1/R2 and Worker behavior only. This is local exact-source evidence, not a claim
that hosted D1, R2, SIWC, Sites scheduling, provider networking, or a production
backup was exercised.

## Local logical recovery exercise

Command:

```text
npm run exercise:recovery:local
```

Result: **PASS**. The structured exercise reported 104,421 ms local wall-clock
time.

| Observation | Exact bounded result |
|---|---|
| Schema | All 11 journaled migrations through `0010_steep_hemingway`; 31/31 application tables populated and inspected |
| Tenancy and state | Two synthetic tenants; restored state checks passed |
| D1 snapshot | 34,380 bytes; SHA-256 `8eaef0372bf2e4457ab651ec5c7bb3e3b22a51289495187761622fede0a1b139` |
| R2-compatible objects | Three private synthetic objects; 199 bytes total |
| Negative checks | All three bounded corruption, omission, or mismatch checks were detected |
| Environment isolation | The disposable recovery subprocess isolation checks passed |

The reported duration is local wall-clock time. It is not an RTO, and the
synthetic snapshot does not establish an RPO. The exercise does not establish
provider-native backup retention, deletion recovery, alert delivery, operator
readiness, or recovery of production or customer data.

## Local bounded-capacity exercise

Command:

```text
npm run exercise:capacity:local
```

Result: **PASS** with zero failed requests.

| Observation | Exact bounded result |
|---|---|
| Schema | All 11 journaled migrations through `0010_steep_hemingway` |
| Built Worker | Local production Worker bundle SHA-256 `b34a12724c50908c83767450cbc7c5e98aa781597226f9ec5eaab9d7f77387ad` |
| Workload | Two synthetic tenants; 54 measured requests; maximum concurrency four |
| Status distribution | 44 responses with `200`; 10 with `201`; zero failures |
| Local latency observation | p50 46.6 ms; p95 103.3 ms; maximum 103.62 ms |
| Workload duration | 1,547.01 ms; initialization, workload, and cleanup 1,935.81 ms |
| Bounded outputs | All configured response and export bounds held |

These timings are observations from one disposable process on one development
machine. They are not approved targets, a tenant limit, an SLO/SLA, sustained
load, soak, cold-start, geographic latency, provider contention, or hosted
capacity evidence.

## Security-review relationship

The integrated version-13 source and migration review found no actionable
Critical or High blocker. That review and these local exercises are separate
evidence classes. Together they do not establish hosted authenticated write-mode
behavior, a penetration test, provider-control effectiveness, or real-user
security.

## Isolation and disposition

- Both exercises used synthetic fixtures and local compatible runtimes.
- No Sites deployment mutation, hosted D1/R2 data, SIWC session or bypass,
  Stripe provider operation, real identity, production secret, customer data,
  message, or charge was used.
- The recovery exercise verified two tenants, 31/31 tables, three objects/199
  bytes, three negative checks, and environment isolation.
- The capacity exercise verified the 54-request bounded mix at concurrency four
  with all output bounds held.
- Local generated output is not provider evidence; archive and hosted release
  facts are recorded separately in the version-13 private-candidate evidence.

## What remains open

This record improves exact-version provenance for local recovery and bounded
capacity only. It does not close hosted authenticated write-mode exercise,
provider backup and restore, application rollback or forward-fix, measured
RPO/RTO, hosted performance, SIWC lifecycle, scheduler invocation, alert
delivery, cost monitoring, incident execution, named operator, manual
accessibility, signed-in browser, real-user, provider, or owner-acceptance
evidence.
