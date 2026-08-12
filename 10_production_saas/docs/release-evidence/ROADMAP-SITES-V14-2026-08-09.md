# Roadmap Sites version 14 private-candidate evidence

**Observed:** 2026-08-09, with deployment success recorded at
`2026-08-09T05:19:27.316512Z`  
**Authority:** `AUTH-005`; bounded private release preparation only  
**Result:** exact version 14 deployed successfully owner-only, but its hosted
invocation-log privacy retest failed; not approved for public, paid,
controlled-real-user, or accepted live operation

## Exact identity

| Field | Recorded value |
|---|---|
| Source/runtime release ID | `5db791d0d4a7317a2913d2e65d855cb0bb31baec` |
| Saved Sites version | Version `14`; `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_349b3a9e27e8819189d4de12ac1a89ac` |
| Final deployment | `appgdep_6a780dd0dfb081918e825de46a7a7a17`; provider deployment `site---6a76957326fc819196ebf3a0c95f1ec3`; status `succeeded` at `2026-08-09T05:19:27.316512Z` |
| Environment | Revision `16`; exact `RELEASE_ID`, `APPLICATION_WRITE_MODE=enabled`, `INSTRUCTOR_ACCESS_MODE=owner_private`, and `BILLING_CHECKOUT_ENABLED=false`; four secret values retained redacted |
| Production URL | `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Access and billing | Owner-only; `BILLING_CHECKOUT_ENABLED=false` |

Version 14 superseded version 13 only as an immutable private candidate and was
then superseded by version 15 at the same URL. Version 13 and its exact evidence
remain historical. None of these versions is an approved public, paid,
controlled-real-user, or owner-accepted release.

## Privacy-control delta and failed hosted retest

The exact version-14 package kept provider persistence of custom application logs
configured while setting automatic invocation-log persistence off:

- `observability.enabled=true`;
- `observability.logs.enabled=true`; and
- `observability.logs.invocation_logs=false`.

Release-artifact integrity tests require that exact combination. The source and
package therefore contain the intended minimization control. The hosted result
did not honor that intended boundary: the post-deployment provider query returned
exactly three `fetch` invocation events from `05:20:01.195Z` through
`05:20:02.531Z`, comprising two `200` responses and one `403` response. The query
surface returned redaction markers for cookie and SIWC identity fields, but IP
and signature fields were nonempty and were not redaction markers. The query
representation does not establish how those fields were collected or stored.

Raw header, identity, cookie, IP, signature, token, and event values processed
transiently by the connector/tool were not surfaced in the transcript or written
to this repository. This record retains only the minimum category, count, status,
timestamp-window, and query-surface redaction-state aggregate needed to document
the failed retest.

The packaged setting is therefore not evidence that Sites stopped collecting or
retaining invocation metadata. Version 14 did not close the invocation-log
privacy finding. Closure requires actual provider enforcement plus disposition
of retained metadata, or a verified migration to a host that enforces the
control.

`OWNER-SEC-001` remains historically completed. No SIWC bypass credential was
generated, rotated, read, displayed, persisted, or used during the version-14
release or retest.

## Local clean-build and package evidence

Two distinct detached worktrees checked out the full release commit. Each clean
`npm ci --no-audit` installed 501 locked packages and reported the same five
blocked package install scripts. Each full `npm run verify` passed lint, strict
types, the production build, release-artifact integrity, and 333/333 tests with
zero failures, skips, or todos.

Both clean `dist` trees contained 51 files. The strict normalized comparison
reported three expected framework-generated raw differences and zero normalized
differences. This is normalized reproducibility, not byte-for-byte identity.

| Package check | Recorded result |
|---|---|
| Local release archive | `outputs/roadmap-sites-v14-5db791d.tar.gz`; gzip SHA-256 `42274179e386bbbd89509fa435f0265531d72c26aca4578eb55ea8c5352fd45d`; 3,047,488 bytes; 63 tar entries/51 files |
| Exact archive verification | Passed against the clean build: 11 migrations, 25 source mappings, and the exact intended invocation-log-disable configuration |
| Provider package | Stored content hash `sha256:cf90909c0a45d4e276cd5da4981961cadf60c287f3cbc6244c5f7f375e9beac7`; 7,270,400 bytes; 51 files |
| Clean verification | Two independent `npm run verify` runs: 333/333 tests each; zero failures, skips, or todos |
| Release-integrity scan | 299 source/evidence text files; zero findings |
| Production dependency audit | Zero reported vulnerabilities on 2026-08-09 |

The archive verifier binds the clean local build to the local archive. Provider
file count and source/runtime identity bind the saved release to version 14, but
the provider storage hash reflects provider normalization and is not the local
gzip digest.

## Hosted private-boundary observations

The Sites deployment remained owner-only and Checkout remained disabled. Fresh
signed-out HTTPS requests to `/`, `/app`, `/r`, and `/api/health` each returned
`401` with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. This
verifies only the signed-out Sites boundary. It is not an authenticated
application journey, SIWC lifecycle test, deep-health result, authorization
matrix, scheduler observation, or real-user exercise.

The three provider events described above constitute a failed privacy-control
retest, not proof that the signed-out probes reached the application Worker and
not a complete retention or access audit.

## Supersession and remaining limits

Version 15 superseded version 14 with all packaged observability and log
persistence settings disabled. Version 15's independent hosted retest also
returned post-success fetch events, so successor deployment did not close the
provider-setting mismatch.

Version 14 remains intentionally bounded:

- the outer Sites audience was owner-only and Checkout was disabled;
- hosted invocation metadata persisted despite the packaged opt-out;
- authenticated hosted identity, application writes, browser/CSP behavior,
  scheduler, alert, backup/restore, rollback, accessibility, and acceptance
  evidence remained open; and
- no public, paid, controlled-real-user, or owner-accepted operation was approved.

Version 14 is immutable failed-retest evidence. It is not a completed full-live
SaaS release and does not close privacy, scheduler, authentication, public,
paid, real-world-validation, or owner-acceptance requirements.
