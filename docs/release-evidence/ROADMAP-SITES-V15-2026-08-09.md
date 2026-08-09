# Roadmap Sites version 15 private-candidate evidence

**Observed:** 2026-08-09, with deployment success recorded at
`2026-08-09T05:31:58.490796Z`  
**Authority:** `AUTH-005`; bounded private release preparation only  
**Result:** exact version 15 deployed successfully owner-only, but the hosted
provider-log opt-out retest failed; not approved for public, paid,
controlled-real-user, or accepted live operation

## Exact identity

| Field | Recorded value |
|---|---|
| Source/runtime release ID | `8a359398099ab9b970df1d28eb3473dcbcd6207f` |
| Saved Sites version | Version `15`; `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_085298ff9b9c819193d48e0df7a71631` |
| Final deployment | `appgdep_6a7810bf6fc08191b2cb9bfb081e58c2`; provider deployment `site---6a76957326fc819196ebf3a0c95f1ec3`; status `succeeded` at `2026-08-09T05:31:58.490796Z` |
| Environment | Revision `17`; exact `RELEASE_ID`, `APPLICATION_WRITE_MODE=enabled`, `INSTRUCTOR_ACCESS_MODE=owner_private`, and `BILLING_CHECKOUT_ENABLED=false`; four secret values retained redacted |
| Production URL | `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Access and billing | Owner-only; `BILLING_CHECKOUT_ENABLED=false` |

Version 15 supersedes version 14 only as the current immutable private
candidate. Version 14 and earlier exact evidence remain historical. No version
is an approved public, paid, controlled-real-user, or owner-accepted release.

## Provider-log opt-out delta and failed hosted retest

The exact version-15 package configures every packaged observability and log-
persistence switch off:

- `observability.enabled=false`;
- `observability.logs.enabled=false`; and
- `observability.logs.invocation_logs=false`.

Release-artifact integrity tests require that exact fail-closed combination.
Despite it, a value-safe provider query returned exactly three post-deployment-
success `fetch` events: `2026-08-09T05:32:32.228Z` (`ok`, `200`),
`2026-08-09T05:32:33.881Z` (`ok`, `200`), and
`2026-08-09T05:32:34.431Z` (`ok`, `403`). All three reported one new
script-version identifier. The query surface returned redaction markers for
cookie and SIWC identity fields, while network-IP and request-signature fields
were nonempty and were not redaction markers. This representation does not
establish how those fields were collected or stored. The provider therefore
continued to expose invocation events after the saved package configured all three
persistence settings off. This is a confirmed provider-setting mismatch and a failed
hosted retest.

Raw event, header, identity, cookie, IP, signature, token, and provider values
processed transiently by the connector/tool were not surfaced in the transcript
or written to this repository. Only the minimum event count/type and timing
relationship to deployment success are recorded. The sample does not establish
collection/storage masking, complete retention duration, access scope, deletion
behavior, or retained-data disposition, but it prevents a claim that the opt-out
worked. A best-effort session-store cleanup checked 11 likely v13 key names
without surfacing values and overwrote two matches with `null`; 34 likely v14/v15
names yielded no matches. Store enumeration is unavailable, so this is not
exhaustive purge or deletion evidence.

The application source/package control is present; hosted privacy closure is
not. Closure requires actual provider enforcement plus disposition of retained
metadata, or a verified migration to a host that enforces the control, followed
by a new exact-release retest. Production privacy, public release, controlled real
users, and provider-log acceptance remain open.

`OWNER-SEC-001` remains historically completed. No SIWC bypass credential was
generated, rotated, read, displayed, persisted, or used during the version-15
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
| Local release archive | `outputs/roadmap-sites-v15-8a35939.tar.gz`; gzip SHA-256 `f987afcd00f9151e4c1a698fdf7aeb06fe8d275ec778494bb7dd38f535406a31`; 3,047,495 bytes; 63 tar entries/51 files |
| Exact archive verification | Passed against the clean build: 11 migrations, 25 source mappings, and the exact all-disabled observability configuration |
| Provider package | Stored content hash `sha256:880189d7d59994b0c72fd34c9c206b2f37328096dea41c2ebd7b4fdf9d6775ad`; 7,270,400 bytes; 51 files |
| Clean verification | Two independent `npm run verify` runs: 333/333 tests each; zero failures, skips, or todos |
| Release-integrity scan | 299 source/evidence text files; zero findings; historical Business Plan V1 preserved; unchanged lockfile digest |
| Production dependency audit | Zero reported vulnerabilities in a fresh exact-version-15 check on 2026-08-09 |

After these evidence files were reconciled, a second release-integrity run
scanned 301 source/evidence text files with zero findings, preserved historical
Business Plan V1, and confirmed the same lockfile digest. That later evidence-
tree check does not change the immutable runtime commit or enlarge the 299-file
pre-evidence scan.

The archive verifier binds the clean local build to the local archive. Provider
file count and source/runtime identity bind the saved release to version 15, but
the provider storage hash reflects provider normalization and is not the local
gzip digest.

## Hosted private-boundary observations

Environment revision 17 changed only the exact release marker from revision 16;
all other runtime entries were preserved. The Sites deployment remained
owner-only and Checkout remained disabled. Fresh
signed-out HTTPS requests to `/`, `/app`, `/r`, and `/api/health` each returned
`401` with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. This
verifies only the signed-out Sites boundary. It is not an authenticated
application journey, SIWC lifecycle test, deep-health result, authorization
matrix, scheduler observation, or real-user exercise.

The three post-success provider events constitute a failed opt-out retest. They
do not prove application-level logging, a signed-in owner journey, scheduler
execution, or absence/presence of any other event outside the bounded query.

## Rollback and remaining limits

Version 15 changes packaged observability behavior relative to version 14 while
carrying forward the product and security controls of its predecessor. Reverting
to version 14 would re-enable provider persistence of custom application logs
without fixing the provider invocation-log mismatch, so it is not a privacy
remediation. No hosted rollback or forward-fix exercise was performed.

The candidate remains intentionally bounded:

- the outer Sites audience is owner-only and Checkout is disabled;
- provider fetch events remained available despite every packaged persistence
  setting being disabled;
- hosted authenticated identity, application writes, browser/CSP behavior,
  scheduler, alert, backup/restore, rollback, accessibility, and acceptance
  evidence remain open; and
- no public, paid, controlled-real-user, or owner-accepted operation is approved.

Version 15 is the current owner-private candidate and failed-provider-retest
evidence. It is not a completed full-live SaaS release and does not close
privacy, scheduler, authentication, public, paid, real-world-validation, or
owner-acceptance requirements.
