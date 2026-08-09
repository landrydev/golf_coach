# Roadmap Sites version 11 private-candidate evidence

**Observed:** 2026-08-08 22:29Z-22:42Z
**Authority:** `AUTH-005`; bounded private release preparation only
**Result:** exact version 11 deployed successfully owner-only; not approved for
public, paid, controlled-real-user, or accepted live operation

## Exact identity

| Field | Recorded value |
|---|---|
| Source branch head | `main` at `44670a64498779cf747914b4465380916a939301`; the exact commit was pushed to `sites/main` before the version was saved |
| Runtime `RELEASE_ID` | `44670a64498779cf747914b4465380916a939301` |
| Saved Sites version | Version `11`; `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_4c49cdec72bc8191aeece01f5689e51a` |
| Final deployment | `appgdep_6a77b01714b881918245bb5248349e0d`; status `succeeded`; first observed provider `updated_at` `2026-08-08T22:39:30.101490+00:00`; final recheck `updated_at` `2026-08-08T22:40:07.742084+00:00`; no failure message; provider deployment `site---6a76957326fc819196ebf3a0c95f1ec3` |
| Environment | Revision `13`; only `RELEASE_ID` changed from revision 12 |
| Production URL | `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Access and billing | The private-deployment control verified owner-only eligibility before publishing; `INSTRUCTOR_ACCESS_MODE=owner_private` and `BILLING_CHECKOUT_ENABLED=false` remained unchanged |

Version 11 supersedes version 10 only as the current immutable private
candidate. Version 10 and its exact record remain historical evidence; neither
version is an approved public, paid, real-user, or owner-accepted release.

## Security delta

Commit `44670a64498779cf747914b4465380916a939301` binds vinext's executable
bootstrap scripts to a fresh response-specific CSP nonce. For every non-loopback
application response, the Worker creates one 32-hex nonce from `crypto.randomUUID()`,
passes a server-owned CSP into vinext so the framework applies the nonce to its
RSC/hydration scripts, and returns the matching policy. The script directives are:

- `script-src 'self' 'nonce-<response nonce>'`;
- `script-src-elem 'self' 'nonce-<response nonce>'`;
- `script-src-attr 'none'`; and
- no script `'unsafe-inline'` or `'unsafe-eval'` source.

The trusted request boundary deletes caller-supplied CSP and CSP-report-only
headers before inserting the server policy, so a client cannot select the nonce
consumed by the framework. Nonce-bearing public HTML is marked `no-store` to
avoid replaying cached nonce/script pairs. Style `'unsafe-inline'` remains a
separate framework/style compatibility limitation and is not described as script
permission.

Automated production-bundle tests required exactly one correctly shaped nonce in
the returned policy, a different nonce on successive responses, the same nonce on
every emitted executable script, no script `'unsafe-inline'`, `script-src-attr
'none'`, `no-store` on public nonce-bearing HTML, and rejection of client-selected
CSP nonces. The request-boundary regression separately verifies replacement of
caller CSP headers.

This remediates the known `SEC-002` source/package condition in the exact v11
candidate. It does not close the finding: no supported signed-in browser was
available to inspect the hosted application response, execute the normal owner
journey, or confirm the deployed policy/script relationship. `SEC-002` is therefore
**REMEDIATED - HOSTED RETEST PENDING**. `SEC-001` remains independently
**REMEDIATED - RETEST PENDING**; this deployment did not rotate, recover, display,
store, or use any Sites bypass credential.

## Exact clean-build and package evidence

The release was checked on Windows with Node.js `v24.18.0`, npm `12.0.1`, Git
`2.53.0.windows.3`, and bsdtar `3.8.4`. Two distinct detached worktrees checked
out the full release commit. Each clean install added 501 locked packages and
reported the same five blocked package install scripts. Each full `npm run verify`
passed lint, strict types, the production build, release-artifact integrity, and
237/237 tests with zero failures, cancellations, skips, or todos.

Both clean `dist` trees contained 49 files. Raw differences were confined to the
three validated generated-value files:

- `server/index.js`;
- `server/ssr/vinext-server.json`; and
- `server/vinext-server.json`.

The strict comparator required the framework build UUID in exactly three anchored
locations and exact single-property 64-hex prerender manifests whose pair matched
within each build. Zero differences remained after normalizing only those values.
This is normalized reproducibility, not byte-for-byte identity.

| Package check | Recorded result |
|---|---|
| Local release archive | `outputs/roadmap-sites-v11-44670a6.tar.gz`; SHA-256 `d88be6513bc58afd057d4a3fb3a6d64b744f7a5c359731ec9fc693a788e1fa0e`; 2,966,073 bytes; 61 tar entries |
| Exact archive verification | Passed against the unchanged clean left-hand `dist`: 49 files, ten migrations, 23 source-mapped files, exactly two expected server-manifest credential files, zero unexpected copies or paths, no production prerender binding, and the exact `*/5 * * * *` scheduler declaration present |
| Provider package | Content hash `sha256:d717035871790252548e7fff4e1192e590b73b7cabfe3f4c011d65ffe4493daa`; 6,737,920 bytes; 49 files |
| Release-integrity scan | 259 source/evidence text files; zero secret-pattern findings; historical Business Plan V1 preserved; lockfile SHA-256 `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d` |
| Production dependency audit | `npm audit --omit=dev`: zero reported vulnerabilities on 2026-08-08 |

After this immutable release record and the current documentation pointers were
added, a documentation-only integrity repeat scanned 260 source/evidence text
files with zero findings, again preserved Business Plan V1, and retained the same
lockfile digest. The 259-file row above remains the frozen exact-release source
scan; the extra file is evidence, not a runtime change.

The archive verifier proves the exact local build/archive relationship. The
provider file count, commit binding, successful save, and deployment bind the
recorded package to v11, but the provider content hash reflects provider storage
normalization and is not the local gzip digest.

No generated build credential, source-repository write credential, hosted secret,
identity value, cookie, capability, nonce value, screenshot access URL, or raw
provider log body is reproduced in this record. A short-lived source write
credential was used only in one process-scoped Git HTTP header and was neither
placed in the remote URL nor persisted in Git configuration.

## Final private-boundary observations

Environment revision 13 was recorded at
`2026-08-08T22:39:12.312266+00:00`. Its value-safe eight-entry inventory
confirmed the exact `RELEASE_ID`, canonical `APP_URL`,
`INSTRUCTOR_ACCESS_MODE=owner_private`, and
`BILLING_CHECKOUT_ENABLED=false`; four retained secret entries remained
redacted. No Stripe-named, consent-policy-registry, or privacy-operator entry was
present. No secret value was requested or emitted.

After deployment success, independent signed-out HTTPS `GET` requests ran from
`2026-08-08T22:40:40.8612310Z` through
`2026-08-08T22:40:42.0058063Z`. `/`, `/app`, `/api/health`, and
`/api/operations/health` each returned `401`, `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, and no redirect location. This verifies only the
signed-out Sites boundary; it is not authenticated application, deep-health, CSP,
or authorization evidence.

The first post-deployment value-safe 30-minute Worker-log aggregate completed at
`2026-08-08T22:58:53.646Z`, 19 minutes 23 seconds after deployment success and
after the 22:45, 22:50, and 22:55 expected five-minute boundaries. It returned
exactly three events: all `fetch`, Worker outcome `ok`, and level `info`; zero
events were observed as `scheduled`. A separate `errors_only` aggregate returned
one `fetch`/`ok`/`info` event with zero error fields. That filter result is
inconclusive rather than evidence of an application error. Multiple expected
boundaries strengthen the scheduler suspicion, but the bounded samples do not
establish completeness, retention, redaction, error absence, alerting, or hosted
scheduled invocation or absence.

A newer 30-minute broad query and its `errors_only` companion around
`2026-08-08T23:20:16.850Z` were empty. A later value-safe provider observation at
approximately
`2026-08-08T23:23:52Z` returned the same three `fetch`/`info`/`ok` events over a
60-minute window (`200`, `200`, and handled `403`) with `scheduled=0`;
`errors_only` returned only the handled `403`. No raw content was emitted
or retained. Repeated polling strengthens the suspicion but cannot resolve the
unavailable log-completeness, scheduled-visibility, or deployed-trigger-metadata
boundary.

The supported in-app browser setup and discovery workflow found no mounted browser.
No standalone fallback browser or bypass credential was used. Consequently the
normal signed-in owner journey, exact hosted CSP inspection, SIWC lifecycle,
application authorization matrix, authenticated operations health, and hosted
accessibility evidence remain absent.

After deployment, the recovery and capacity harnesses were replayed from a
disposable detached worktree at exact runtime commit
`44670a64498779cf747914b4465380916a939301`. Recovery passed across all ten
migrations, 31/31 tables, two synthetic tenants, three private R2-compatible
objects, three negative-integrity scenarios, and subprocess secret isolation.
Capacity passed 54 bounded requests at maximum concurrency four with zero failures.
The [exact-v11 local exercise record](ROADMAP-SITES-V11-2026-08-08-LOCAL-EXERCISES.md)
preserves exact measurements and limitations. These results are local synthetic
evidence, not hosted recovery, performance, RPO, RTO, capacity, or operator proof.

## Rollback and remaining limits

Version 11 makes a runtime/browser-security change without a schema, migration,
binding, dependency-lock, or product-data contract change. A v11-to-v10 rollback
would nevertheless remove the per-response nonce control and reintroduce script
`'unsafe-inline'`. It is therefore a security/behavior regression, not an ordinary
class-`N` rollback and not an approved routine rollback target. Prefer same-version
redeploy or a forward fix; any emergency rollback requires explicit incident risk
disposition and post-action security verification.

The candidate remains intentionally fail-closed:

- the outer Sites audience is owner-only;
- Checkout remains disabled and no charge was attempted;
- exact consent-policy and privacy-operator configuration remains absent;
- no hosted scheduler heartbeat, alert exercise, D1/R2 restore, application
  rollback, cost view, or staffed response was demonstrated;
- no customer data, real instructor/golfer, public visitor, or external message
  was used; and
- Aaron has not approved the exact product scope/design/content, commercial
  policy, privacy/legal basis, media boundary, public production access/providers,
  controlled validation, residual risks, quality disposition, or exact release.

Version 11 is a stronger owner-private candidate. It is not a completed full-live
SaaS release and does not close `AUTH-EVID-001`, `A11Y-EVID-001`,
`OPS-CRON-001`, `OPS-EVID-001`, `OPS-EVID-002`, `PRIV-EVID-001`,
`BILL-EVID-001`, `VAL-EVID-001`, or `ACCEPT-001`.
