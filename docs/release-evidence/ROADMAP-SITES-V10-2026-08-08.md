# Roadmap Sites version 10 private-candidate evidence

**Observed:** 2026-08-08 20:49Z–22:07Z  
**Authority:** `AUTH-005`; bounded private release preparation only  
**Result:** exact version 10 deployed successfully owner-only; not approved for
public, paid, controlled-real-user, or accepted live operation

## Exact identity

| Field | Recorded value |
|---|---|
| Source branch head | `main` at `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1`; local `HEAD` and `sites/main` matched after push |
| Runtime `RELEASE_ID` | `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1` |
| Saved Sites version | Version `10`; `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_1007b9b4ea8c8191968d55991abf374c` |
| Final deployment | `appgdep_6a779cabaec4819191b0cf1e815ce2e5`; status `succeeded`; provider `updated_at` `2026-08-08T21:17:13.525116+00:00` |
| Environment | Revision `12`; only `RELEASE_ID` changed from revision 11 |
| Production URL | `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Access and billing | Provider-verified owner-only deployment path; Checkout remained disabled |

An earlier deployment of the same saved version,
`appgdep_6a779c2df2588191b0d80791ad9bb82e`, succeeded against environment revision
11. It was immediately superseded before the evidence freeze because revision 11
still carried the version-9 `RELEASE_ID`. No source, secret, access, billing, or
policy value changed when revision 12 corrected that release label. The final
candidate is only the revision-12 deployment identified above.

## Exact clean-build and package evidence

The release was checked on Windows with Node.js `v24.18.0` and npm `12.0.1`.
Two distinct detached worktrees checked out the full release commit. Each clean
install added 501 locked packages and reported the same five blocked package
install scripts. Each full `npm run verify` passed lint, strict types, the
production build, release-artifact integrity, and 234/234 tests with zero
failures, cancellations, skips, or todos.

The first parallel attempt against predecessor commit
`b695cc051f1501a2b66ab2d4d67ba9a07db77b46` exposed a calendar-dependent test
fixture: its supposedly active billing-event lease was fixed to 20:10Z, while
the production guard correctly compared it with the real clock. Commit
`ae35ef25ed46563f6b8f09f5c22dc12581eff8b1` anchored only the fixture claim and
lease expiry to the runtime clock while preserving deterministic provider-event
ordering. The production guard and schema were unchanged. Two concurrent focused
runs then passed 2/2 each, the main full suite passed 234/234, and both detached
release suites passed 234/234 in parallel.

The two clean `dist` trees each contained 49 files. Raw differences were confined
to the three expected generated-value files:

- `server/index.js`
- `server/ssr/vinext-server.json`
- `server/vinext-server.json`

The strict comparator required the framework build UUID in exactly three anchored
locations and exact single-property 64-hex prerender manifests whose pair matched
within each build. It found zero differences after normalizing only those validated
values. This is normalized reproducibility, not byte-for-byte identity.

| Package check | Recorded result |
|---|---|
| Local release archive | SHA-256 `5d67423e253009714bebe85bba118ded922c9f6b30b926f2af7bd0e3d05cd953`; 2,965,930 bytes; 61 tar entries |
| Exact archive verification | Passed against the clean left-hand `dist`: 49 files, ten migrations, 23 source-mapped files, two expected server-manifest credential files, zero unexpected copies or paths |
| Provider package | Content hash `sha256:0534d35af6fcdd8a0f104c5bb21fab5edd0641ec952bd32ae7a3f9c024c62033`; 6,737,920 bytes; 49 files |
| Release-integrity scan | 258 source/evidence text files; zero secret-pattern findings; historical Business Plan V1 preserved; lockfile SHA-256 `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d` |
| Production dependency audit | `npm audit --omit=dev`: zero reported vulnerabilities on 2026-08-08 |

## Post-deployment exact-runtime local exercises

After the evidence-document reconciliation, tracked changes relative to release
commit `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1` remained confined to
`README.md` and `docs/`. No application/runtime, schema, migration, dependency,
binding, or package file differed from the deployed commit. The following
commands were then rerun against that exact runtime source:

- `npm run db:generate` confirmed 31 tables and reported
  `No schema changes, nothing to migrate`.
- `npm run exercise:capacity:local` passed against a disposable production
  Worker and local D1-compatible runtime: two synthetic tenants, 54 measured
  requests, maximum concurrency four, four author/edit/publish/share flows, two
  bounded exports, and zero failures. Observed local latency was p50 49.26 ms,
  p95 103.23 ms, and max 103.63 ms.
- `npm run exercise:recovery:local` applied all ten migrations to each isolated
  database, covered all 31 application tables, restored two synthetic tenants
  and three private synthetic objects, matched snapshot SHA-256
  `34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54`,
  passed three negative integrity scenarios, and confirmed secret-shaped parent
  variables were not forwarded to the Wrangler child process.

The disposable resources were removed. These are exact-runtime local synthetic
results only. They do not establish hosted/provider capacity, production-data
recovery, backup retention, RPO/RTO, an SLO/SLA, operator readiness, or
real-user performance.

A subsequent post-evidence reconciliation reran
`npm run verify:release-integrity` after this version-10 record was added. It
scanned 259 source/evidence text files with zero findings, preserved historical
Business Plan V1, and retained the same lockfile SHA-256. This is distinct from
the frozen exact-release scan of 258 files recorded above; the additional file is
release evidence, not a runtime change.

One later full-suite reconciliation repeat returned 233/234 because the
concurrent abuse-limit fixture crossed a real aligned 60-second network window:
the five-minute capability counter still reached 20 and produced the required
12 denied-plan/8 rate-limited split, while expiry cleanup correctly removed the
single prior-minute network row and left a current count of 19. The production
UPSERT, schema, limits, and route were unchanged. A test-only guard now starts
that burst within the first half of a minute and asserts that it remains within
the captured window, preserving the exact `[20, 20]` assertion without weakening
the control. Sixteen focused reruns and the following complete 234/234 suite
passed. This post-release test-fixture hardening is not a runtime or package
change.

No generated build credential, source-repository write credential, hosted secret,
identity value, cookie, raw capability, or provider log body was emitted into this
record. The short-lived source write credential was used only as a per-command HTTP
header and then released from session state; it was not placed in a remote URL or
Git configuration.

## Final private-boundary observations

After the revision-12 deployment succeeded, independent signed-out HTTPS `GET`
requests to `/`, `/app`, `/api/health`, and `/api/operations/health` each returned
`401`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and no redirect
location. This verifies the observed signed-out outer boundary only; it is not a
normal signed-in owner test or application authorization matrix.

A value-safe revision-12 environment inventory contained eight entries. It confirmed
the exact `RELEASE_ID`, canonical `APP_URL`, `INSTRUCTOR_ACCESS_MODE=owner_private`,
and `BILLING_CHECKOUT_ENABLED=false`; four retained secret entries remained redacted.
No consent-policy registry, privacy-operator digest/pepper, or Stripe-named entry was
present. No secret value was requested for evidence or emitted.

A value-safe 15-minute Worker-log query completed at `2026-08-08T21:15:25.212Z`
immediately before the final environment-labelled redeployment, and a 30-minute
query completed at `2026-08-08T21:26:16.717Z` after it. A final 30-minute query
completed at `2026-08-08T21:31:05.892Z`, 14 minutes 38 seconds after the final
deployment started and after the 21:20, 21:25, and 21:30 five-minute boundaries.
All returned zero events. No raw log content was emitted. The empty samples are
inconclusive for runtime redaction, error absence, completeness, retention, or
alerting. They strengthen the suspected scheduler-deployment gap but do not prove
that no scheduled invocation occurred because provider log completeness and
scheduled-event visibility are unavailable.
No signed-in browser was mounted in this run, so normal owner access,
`/api/operations/health`, SIWC lifecycle, mounted interaction, and hosted
accessibility evidence remain absent.

## Scope and remaining gates

Version 10 supersedes version 9 only as the current immutable private candidate.
Version-9 deployment, credential-rotation, responsive-capture, and failed
byte-identity records remain historical evidence and are not rewritten.

The candidate remains intentionally fail-closed:

- the outer Sites audience is owner-only;
- `BILLING_CHECKOUT_ENABLED` remains disabled and no charge was attempted;
- exact consent-policy registry and privacy-operator configuration remain absent;
- deep operational readiness is therefore expected to remain degraded;
- no hosted scheduler heartbeat, alert delivery, backup/restore, rollback, cost
  view, or staffed response was exercised;
- no customer data, real instructor/golfer, public visitor, or external message
  was used; and
- Aaron has not approved the exact scope/design/content, commercial policy,
  privacy/legal basis, media boundary, production access/providers, controlled
  validation, residual risks, quality disposition, or exact release.

[OpenAI's Sites developer guide](https://learn.chatgpt.com/docs/sites) currently
documents Sites as a public beta, treats every deployed URL as a production
deployment, requires testing from the intended visitor experience, notes that some
background-service and hosting patterns may be unsupported, and separates the Site
audience from in-app authentication. The
[Sites help article](https://help.openai.com/en/articles/20001339-creating-and-managing-chatgpt-sites)
also assigns the Site owner responsibility for third-party payment operation and
customer-facing commercial obligations. Those provider constraints reinforce the
owner-only, billing-disabled containment; they do not close `AUTH-EVID-001`,
`A11Y-EVID-001`, `OPS-CRON-001`, `OPS-EVID-001`, or `OPS-EVID-002`.
