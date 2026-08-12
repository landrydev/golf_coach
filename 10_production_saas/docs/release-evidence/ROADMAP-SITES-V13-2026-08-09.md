# Roadmap Sites version 13 private-candidate evidence

**Observed:** 2026-08-09, with deployment success recorded at
`2026-08-09T04:28:22.001529+00:00`
**Authority:** `AUTH-005`; bounded private release preparation only
**Result:** exact version 13 deployed successfully owner-only; not approved for
public, paid, controlled-real-user, or accepted live operation

## Exact identity

| Field | Recorded value |
|---|---|
| Source/runtime release ID | `f3482845a42730e87f4ff1190550511f19ea6ad5` |
| Saved Sites version | Version `13`; `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_a050ad7d2e408191a7138c91f93f588c` |
| Final deployment | `appgdep_6a7801d93d6481918bc66a4df14bbe14`; status `succeeded` at `2026-08-09T04:28:22.001529+00:00`; provider deployment `site---6a76957326fc819196ebf3a0c95f1ec3` |
| Environment | Revision `15`; changed `RELEASE_ID` and added `APPLICATION_WRITE_MODE=enabled` from revision 14 |
| Production URL | `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Access and billing | Private deployment control verified owner-only; `INSTRUCTOR_ACCESS_MODE=owner_private` and `BILLING_CHECKOUT_ENABLED=false` retained |

Version 13 supersedes version 12 only as the current immutable private
candidate. Version 12 and its exact evidence remain historical. Neither version
is an approved public, paid, real-user, or owner-accepted release.

## Reliability and security delta

Commit `f3482845a42730e87f4ff1190550511f19ea6ad5` adds fail-closed application
write containment, bounded client-side recovery for ambiguous mutations and
authoring drafts, stricter profile and package compare-and-swap behavior, and
share-revocation and same-revision reissue controls. The eleventh migration adds
the rate-limit scopes used by the session-close path. Exact receipt and response
contracts, request ownership fences, bounded persistence, and tenant-aware
lifecycle checks are covered by the release test corpus.

An integrated source and migration security review found no actionable Critical
or High release blocker. This is source/test review evidence, not a penetration
test, hosted authenticated authorization exercise, or real-world security
validation.

`OWNER-SEC-001` remains historically completed. No Sites bypass credential was
generated, rotated, read, displayed, persisted, or used during the version-13
release. No replacement credential exists in this evidence. The release did not
involve a public user, customer identity or data, charge, email or SMS, or live
Stripe action.

## Local clean-build and package evidence

Two distinct detached worktrees checked out the full release commit. Each clean
`npm ci --no-audit` installed 501 locked packages and reported the same five
blocked package install scripts. Each full `npm run verify` passed lint, strict
types, the production build, release-artifact integrity, and 332/332 tests with
zero failures, skips, or todos.

Both clean `dist` trees contained 51 files. The strict normalized comparison
reported three expected framework-generated raw differences and zero normalized
differences. No generated value was recorded. This is normalized
reproducibility, not byte-for-byte identity.

| Package check | Recorded result |
|---|---|
| Local release archive | Gzip SHA-256 `f3c5ce7fc76a52d693f0b1f0fcdfc6385e398cd11df2898a5b66b2d67f09da51`; 3,047,466 bytes; 63 tar entries/51 files |
| Exact archive verification | Passed against the clean build: 11 migrations, 25 source mappings, zero unexpected credential copies, zero unexpected path copies, and the scheduler configuration present |
| Provider package | Stored content hash `sha256:734a527a2d76322ffa341acb02b3a7f52714179021383430e32e578be0193d99`; 7,270,400 bytes; 51 files |
| Main pre-freeze verification | `npm run verify`: 332/332 tests; zero failures, skips, or todos |
| Release-integrity scan | 297 source/evidence text files; zero secret findings; historical Business Plan V1 preserved; lockfile SHA-256 `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d` |
| Production dependency audit | `npm audit --omit=dev`: zero reported vulnerabilities on 2026-08-09 |

The 297-file result is the pre-freeze exact-release integrity scan. These
post-runtime evidence files were not relabelled as part of that earlier count.
After the evidence and current pointers were reconciled, a second integrity run
scanned 299 source/evidence text files with zero secret findings, preserved
historical Business Plan V1, and confirmed the same lockfile digest. That later
check validates the evidence tree; it does not change the immutable runtime
commit or retroactively enlarge the 297-file release-source scan.
The archive verifier binds the clean local build to the local archive. The
provider file count and source/runtime identity bind the saved release to
version 13, but the provider storage hash reflects provider normalization and is
not the local gzip digest.

No generated build credential, source-repository write credential, hosted
secret, identity value, cookie, capability, nonce value, screenshot access URL,
or raw provider log body is reproduced in this record.

## Hosted private-boundary observations

Environment revision 15 changed `RELEASE_ID` and added the exact non-secret
containment setting `APPLICATION_WRITE_MODE=enabled` from revision 14. It
retained `INSTRUCTOR_ACCESS_MODE=owner_private`,
`BILLING_CHECKOUT_ENABLED=false`, and four redacted secret entries. No secret
value was requested or emitted.

The Sites private deployment control was verified owner-only. After deployment
success, signed-out HTTPS requests to `/`, `/app`, `/r`, and `/api/health` each
returned `401`. This verifies only the signed-out Sites boundary. It is not an
authenticated application journey, an application write-mode exercise, a
deep-health result, or an authorization-matrix result.

No bypass credential was used. No public access was enabled, Checkout remained
disabled, and no public user, real instructor or golfer, customer data, charge,
email, SMS, or live Stripe action was involved.

## Rollback and remaining limits

Version 13 includes the new `0010_steep_hemingway` migration and changes runtime
write, recovery, receipt, share-lifecycle, and session-close behavior. The
migration is schema-backward-compatible, but reverting to version 12 would remove
current security and behavior controls, so the v13-to-v12 path is class `B` and
is not an ordinary rollback target. No hosted rollback or forward-fix exercise
was performed; prefer a same-version redeploy or forward fix unless an incident
decision records otherwise.

The candidate remains intentionally bounded:

- the outer Sites audience is owner-only and Checkout is disabled;
- hosted authenticated write-mode behavior and manual signed-in journeys remain
  unexercised;
- hosted SIWC lifecycle, application authorization, manual accessibility,
  browser/CSP execution, scheduler heartbeat, alert delivery, backup and restore,
  rollback, cost, and staffed-response evidence remain open;
- real-world legal, privacy, security, provider, performance, accessibility, and
  customer validation remains open; and
- Aaron has not accepted the exact release or approved public, paid, or
  controlled-real-user operation.

Version 13 is a stronger owner-private candidate. It is not a completed
full-live SaaS release and does not close the remaining provider, real-world,
owner-acceptance, authenticated-hosted, operational, privacy, accessibility, or
validation evidence requirements.
