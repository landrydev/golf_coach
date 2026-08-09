# Roadmap Sites version 12 private-candidate evidence

**Observed:** 2026-08-09 00:12Z-00:13Z
**Authority:** `AUTH-005`; bounded private release preparation only
**Result:** exact version 12 deployed successfully owner-only; not approved for
public, paid, controlled-real-user, or accepted live operation

## Exact identity

| Field | Recorded value |
|---|---|
| Source/runtime release ID | `7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c` |
| Saved Sites version | Version `12`; `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_8868e09fcb28819181cfbebdf82ce73f` |
| Final deployment | `appgdep_6a77c5c85974819185ce1c8caf13007c`; status `succeeded` at provider `updated_at` `2026-08-09T00:12:04.939300+00:00`; no failure message |
| Environment | Revision `14`; only `RELEASE_ID` changed from revision 13 |
| Production URL | `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Access and billing | `INSTRUCTOR_ACCESS_MODE=owner_private` and `BILLING_CHECKOUT_ENABLED=false` remained unchanged; this is not a public or paid release |

Version 12 supersedes version 11 only as the current immutable private candidate.
Version 11 and its exact local-exercise record remain historical evidence; neither
version is an approved public, paid, real-user, or owner-accepted release.

## Golfer-response reliability delta

Commit `7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c` adds a required, syntactically
bounded `Idempotency-Key` to golfer-response submission. The server derives
account-and-resolved-session-scoped HMAC receipts and commits one response and
one corresponding audit event atomically for each logical key. It returns `201`
for the first accepted write, `200` for an exact replay, and `409` if the same
scoped key is reused with a changed payload.

The browser client applies a ten-second timeout. When the result is ambiguous,
it retains the same logical attempt in per-tab `sessionStorage` and reuses it on
retry until a definitive result or tab close. Definitive completion or rejection
clears the attempt. The raw idempotency key is not persisted or logged by the
server. Focused integration coverage includes sequential replay, changed-payload
rejection, session scoping, database cardinality, raw-key absence, and a mixed
four-way race that still produces exactly one response/audit pair.

This closes the identified source-level duplicate-write window for lost golfer
response acknowledgements. It does not prove hosted-browser retries, provider
delivery semantics, real-network recovery, or user comprehension of an ambiguous
outcome. No schema or migration change was required.

## Exact clean-build and package evidence

Two distinct detached worktrees checked out the full release commit. Each clean
`npm ci --no-audit` installed 501 locked packages and reported the same five
blocked package install scripts. Each full `npm run verify` passed lint, strict
types, the production build, release-artifact integrity, and 242/242 tests with
zero failures, cancellations, skips, or todos.

Both clean `dist` trees contained 49 files. Raw differences were confined to the
three validated generated-value files:

- `server/index.js`;
- `server/ssr/vinext-server.json`; and
- `server/vinext-server.json`.

The strict comparator required the framework build identifier in exactly three
anchored locations and accepted only the two matching, single-property generated
credential manifests. Exactly three allowlisted raw generated-value differences
and zero normalized differences remained across the 49 files. No generated value
was recorded. This is normalized reproducibility, not byte-for-byte identity.

| Package check | Recorded result |
|---|---|
| Local release archive | `outputs/roadmap-sites-v12-7b77e65.tar.gz`; gzip SHA-256 `994f725ba6c5952c45885a4d72d38804f1b10b8440273dc26ac8bd1c38d2bd75`; 2,967,333 bytes; 61 tar entries/49 files |
| Exact archive verification | Passed against the clean build: ten migrations, 23 source-mapped controls, exactly two expected generated credential files, zero unexpected copies or paths, and the scheduler manifest present |
| Packaging procedure | The Sites packaging shell helper was unavailable in the Windows environment. Its exact archive contract was reproduced in PowerShell, and the archive verifier passed; this is not a claim that the unavailable shell helper itself ran |
| Provider package | Content hash `sha256:0805c04e9dcd5e8bac77f58aec2362dece1754f6eec63ec73d9c2e249bb01700`; 6,748,160 bytes; 49 files |
| Database generation | `npm run db:generate` passed with `No schema changes, nothing to migrate` |
| Release-integrity scan | 261 source/evidence text files; zero secret findings; historical Business Plan V1 preserved; lockfile SHA-256 `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d` |
| Production dependency audit | `npm audit --omit=dev`: zero reported vulnerabilities on 2026-08-09 |

The 261-file integrity result is the frozen exact-release scan. This evidence file
was created after the runtime commit and does not retroactively change that count.
A separate post-evidence reconciliation run on 2026-08-09 scanned the resulting
262-file source/evidence set with zero secret findings, preserved historical
Business Plan V1, and confirmed the same lockfile SHA-256. That later result verifies
the reconciled documentation tree; it is not relabelled as the frozen runtime scan.
The archive verifier proves the exact local build/archive relationship. The
provider file count, source/runtime identity, successful save, and deployment bind
the recorded package to v12, but the provider content hash reflects provider
storage normalization and is not the local gzip digest.

No generated build credential, source-repository write credential, hosted secret,
identity value, cookie, capability, nonce value, screenshot access URL, raw
idempotency key, or raw provider log body is reproduced in this record.

## Private-boundary observations

Environment revision 14 retained the canonical `APP_URL`,
`INSTRUCTOR_ACCESS_MODE=owner_private`, and
`BILLING_CHECKOUT_ENABLED=false`; only `RELEASE_ID` changed from revision 13.
Four secret entries remained redacted. No secret value was requested or emitted.

After deployment success, signed-out HTTPS `GET` requests to `/`, `/app`, `/r`,
and `/api/health` each returned `401`, `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, and `Content-Type: text/html;charset=utf-8`. This verifies only
the signed-out Sites boundary; it is not authenticated application, deep-health,
CSP, or authorization evidence.

A post-v12 ten-minute `errors_only` Worker-log aggregate returned zero events. A
broad aggregate captured at `2026-08-09T00:13:27.8566565Z` returned six
`fetch`/`info`/`ok` events: two sequences of `GET /` status `200`, `GET /.rsc`
status `200`, and `GET /app.rsc` handled status `403`. It returned
`scheduled=0`. No raw event or content was emitted or retained. These bounded
aggregates do not establish log completeness, redaction, retention, error
absence, alert delivery, or hosted scheduled invocation or absence.

The supported in-app browser workflow found no available browser. No standalone
fallback browser and no Sites bypass credential were used. Consequently no
signed-in hosted journey, manual accessibility review, hosted CSP/script
execution inspection, SIWC lifecycle, authenticated operations-health response,
or application authorization matrix is claimed.

## Rollback and remaining limits

Version 12 changes runtime response-write behavior without changing the schema,
migration set, bindings, dependency lock, or product-data contract. Rolling back
to v11 would remove the session-scoped idempotency and bounded ambiguous-outcome
recovery control and could recreate duplicate golfer responses/audits after a lost
acknowledgement. Prefer same-version redeploy or a forward fix; any emergency
rollback requires explicit incident risk disposition and post-action verification.

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

Version 12 is a stronger owner-private candidate. It is not a completed full-live
SaaS release and does not close `AUTH-EVID-001`, `A11Y-EVID-001`,
`OPS-CRON-001`, `OPS-EVID-001`, `OPS-EVID-002`, `PRIV-EVID-001`,
`BILL-EVID-001`, `VAL-EVID-001`, or `ACCEPT-001`.
