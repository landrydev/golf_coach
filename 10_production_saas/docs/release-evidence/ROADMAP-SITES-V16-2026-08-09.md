# Roadmap Sites version 16 private-candidate evidence

**Observed:** 2026-08-09, with deployment success recorded at
`2026-08-09T07:05:36.176024Z`

**Authority:** `AUTH-005`; bounded private release preparation only

**Result:** exact version 16 deployed successfully owner-only with additional
failure-boundary, recovery, readiness, and scheduler hardening; `LOG-PRIV-001`
remains High/open and blocks real-user or public operation

## Exact identity

| Field | Recorded value |
|---|---|
| Source/runtime release ID | `91f37ebd542774779f6db7e000832c2f6714e528` |
| Saved Sites version | Version `16`; `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_0a4d7dc3d8108191aa4a1b3e14051a96` |
| Final deployment | `appgdep_6a7826b2f4c481919cc85665dffa2391`; status `succeeded` at `2026-08-09T07:05:36.176024Z` |
| Environment | Revision `18`; exact `RELEASE_ID`, `APPLICATION_WRITE_MODE=enabled`, `INSTRUCTOR_ACCESS_MODE=owner_private`, and `BILLING_CHECKOUT_ENABLED=false`; four existing secrets retained without disclosure |
| Production URL | `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Access and billing | Custom Sites access with one owner, zero groups, and zero external visitors; `BILLING_CHECKOUT_ENABLED=false` |

Version 16 supersedes version 15 only as the current immutable owner-private
candidate. Version 15 and earlier exact evidence remain historical. No version
is an approved public, paid, controlled-real-user, or owner-accepted release.

## Version-16 hardening boundary

The exact source and package add the following bounded controls:

- top-level HTML document navigations receive a generic private, non-cacheable
  HTML failure page, while API, RSC, asset, and other non-document requests keep
  the generic JSON failure contract;
- client-visible request references are retained only when the response supplies
  a valid UUIDv4 `X-Request-ID`, including retryable, timeout, body, API, and
  malformed-success failures;
- keyed client attempts use a version-2 record with a 24-hour lifecycle, retire
  legacy version-1 state, recheck expiry on mount and submission, and clear only
  the exact attempt still owned by the completing operation across all five
  keyed creation/review flows;
- deep readiness validates the exact migration-`0010` abuse-rate-limit table,
  primary key, index, and permitted-scope contract rather than using a generic
  database query;
- scheduler health samples a bounded 13 due accounts, identifies a lower-bound
  backlog beyond its 12-account work capacity, and remains degraded until the
  backlog drains; and
- the local recovery exercise restores data and objects, then boots and probes
  the exact built Worker rather than stopping at logical-copy checks.

Automated and local evidence for these controls does not establish their behavior
through a signed-in hosted browser, actual hosted scheduler, provider recovery,
or real-user traffic.

## Clean-build and package evidence

The primary release worktree and two distinct detached exact-commit worktrees
each passed the complete `npm run verify` result: 346/346 tests with zero
failures, skips, or todos. Each detached clean worktree ran `npm ci --no-audit`,
installed 501 locked packages, and reported the same five blocked package install
scripts.

Both detached clean builds contained 51 files. The strict comparison found
exactly three allowlisted framework-generated raw differences, exactly three
validated build-ID occurrences in each build, and zero differences after the
allowlisted normalization. This is normalized reproducibility, not byte-for-byte
identity.

| Package check | Recorded result |
|---|---|
| Local release archive | `outputs/roadmap-sites-v16-91f37eb.tar.gz`; gzip SHA-256 `9119a848bb8b4c7fff1d810280cf845ec44366449adac3176fd35d8c24438fe6`; 3,052,294 bytes; 63 tar entries/51 files |
| Exact archive verification | Passed against the clean build: all 11 migrations and 25 source mappings were present |
| Provider package | Stored content hash `sha256:752f05fd957f8f4b043b5955d9cdbdbf2176b0f1f3414827c9c3e8d0f44f6e2c`; 7,290,880 bytes; 51 files |
| Clean verification | Primary plus two detached exact-commit runs: 346/346 tests each; zero failures, skips, or todos |
| Release-integrity scan | 304 source/evidence text files; zero secret findings; historical Business Plan V1 preserved; lockfile SHA-256 `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d` |
| Production dependency audit | Zero reported vulnerabilities in the exact-version-16 production dependency check on 2026-08-09 |

The archive verifier binds the clean local build to the local archive. Provider
file count and source/runtime identity bind the saved release to version 16, but
the provider storage hash reflects the provider representation and is not the
local gzip digest.

After this evidence record was added, the evidence-only reconciliation tree
passed `npm run verify:release-integrity` across 305 source/evidence text files
with zero secret findings while again preserving historical Business Plan V1
and the same lockfile digest. This later documentation check is not part of the
immutable deployed runtime and did not create a new Sites version or deployment.

## Exact-version-16 local exercises

The local synthetic recovery exercise passed against the exact version-16
source. It applied all 11 migrations, covered 31/31 application tables, produced
a 34,956-byte D1 snapshot with SHA-256
`123631eb46858ef7f5962b00ec4a7e0da736d2afe048f6b2598b16c0f3ba1e0a`,
restored three private synthetic objects totalling 199 bytes, and passed all
three corruption checks. It then booted the exact built Worker against the
restored D1/R2-compatible state and completed authenticated synthetic profile,
package, and workspace reads. Owner-operations health returned the expected
degraded result because the restore normalization converted an interrupted
running scheduler item to a failed state. Total local wall-clock time was
105,940 ms.

The bounded local capacity exercise completed 54 synthetic requests at maximum
concurrency four with zero failures. Its local latency was p50 41.5 ms, p95
93.18 ms, and maximum 93.58 ms. No business target, SLO/SLA, hosted capacity,
network, provider-saturation, recovery point, or recovery-time claim is derived
from either local exercise.

## Hosted private-boundary observations

Environment revision 18 bound `RELEASE_ID` to the exact version-16 commit while
retaining `APPLICATION_WRITE_MODE=enabled`,
`INSTRUCTOR_ACCESS_MODE=owner_private`, `BILLING_CHECKOUT_ENABLED=false`, and
four secret values without disclosing them. The Sites custom access policy
remained one owner with zero groups and zero external visitors.

Fresh signed-out HTTPS requests to `/`, `/app`, `/r`, and `/api/health` each
returned `401` with `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`. This verifies only the signed-out Sites boundary.
It is not an authenticated application journey, generic HTML failure-page test,
RSC/API contract test, deep-health result, SIWC lifecycle test, scheduler
observation, recovery exercise, or real-user evidence. No supported signed-in
browser evidence was available.

`OWNER-SEC-001` remains historically completed. No SIWC bypass credential was
generated, read, rotated, displayed, persisted, or used for this release or its
probes.

## Open provider-log constraint

`LOG-PRIV-001` remains High/open. Version 15 already proved that Sites returned
three post-success fetch events after the exact package configured
`observability.enabled=false`, `observability.logs.enabled=false`, and
`observability.logs.invocation_logs=false`. No version-16 provider-log query was
run: the packaged switches are unchanged, the version-15 result already proved
they were ineffective, and another query would add provider/tool processing
without satisfying the closure criteria.

Closure still requires actual provider enforcement and retained-data
disposition, followed by a value-safe exact-release retest, or a verified
migration to a host that enforces the required control. Version 16 therefore
does not establish logging privacy, provider deletion/retention, or alerting and
must not be expanded to real users or public access.

## Rollback and remaining limits

Version 16 does not change the migration journal, but rolling back to version 15
would remove its browser-failure, client-attempt, readiness, scheduler-health,
and exact-Worker recovery hardening. That downgrade is security/recovery
behavior class `B` unless an exact compatibility exercise proves an explicitly
bounded recovery path. Neither version resolves `LOG-PRIV-001`. No hosted
rollback, authenticated write/freeze, scheduler, or provider-recovery exercise
was performed.

Version 16 is the current owner-private candidate. It is not a completed full-
live SaaS release and does not close privacy, hosted authentication, scheduler,
backup/restore, accessibility, public, paid, real-user, legal/policy, or owner-
acceptance requirements.
