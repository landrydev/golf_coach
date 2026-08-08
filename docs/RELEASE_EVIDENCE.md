# Roadmap V1 release evidence

**Candidate:** `roadmap-production-saas` 1.0.0
**Evidence opened:** 2026-08-07
**Authority:** `AUTH-005`
**Status:** hardened owner-only Sites version 8 succeeded; not accepted for public launch or real-user operation

This file records evidence for one exact candidate. A command result supports only
the scope it actually exercised. A successful private deployment is not Aaron's
acceptance and is not evidence that unresolved policy or live operations work.

## Implemented candidate boundary

- public Canadian instructor acquisition page and visibly synthetic example;
- SIWC-attributed, single-instructor tenant workspace with local-only synthetic fallback;
- coach identity, bounded branding, coach-package and external-action records;
- resumable adults-only golfer identity/title/goal capture followed by bounded coaching completion;
- goal, assessment, priority, first-phase rationale/signals, and three- or four-phase roadmap creation;
- draft return, contextual next action, core editing, stale-revision rejection, exact golfer preview, canonical publication readiness, and coach confirmation;
- living lesson, practice, evidence, and phase-review updates, including lesson
  archive, practice retirement/replacement, evidence withdrawal, revision fencing,
  publication invalidation, and minimized replacement-retirement audit events;
- HMAC-fingerprinted, expiring, revision-scoped golfer access with fragment exchange,
  HTTP-only session, one-active-link rotation, access status, and revocation;
- immutable, versioned purpose-consent grants and withdrawals with exact text evidence,
  account/golfer scope, D1-clock validity, fail-closed publication/share enforcement,
  and atomic capability/session revocation on roadmap-sharing withdrawal;
- separate Stripe Checkout/Portal/webhook boundary for the Roadmap SaaS subscription,
  with tenant-scoped read-only refresh and bounded scheduled recovery;
- tenant-scoped bounded JSON export with count preflight and durable manual-request
  fallback, plus non-destructive access, correction, deletion, restriction, and
  consent-withdrawal request intake;
- public working-release privacy, terms, and support boundaries;
- D1 schema/migration, private R2 binding, audit events, public and owner-operator
  health checks, release-aware scheduler heartbeat, bounded request telemetry,
  runtime log-field allowlisting, strengthened CSP/input controls, correlation
  identifiers, and privacy-safe error responses;
- tenant-scoped race-safe idempotency for full golfer authoring and package creation,
  resilient client retry behavior for share exchange and external handoff tracking,
  bounded list traversal, and bounded coach/golfer plan snapshots.

Media upload, junior golfers, native coach-package transactions, teams/facilities,
marketplace, AI, CRM/messaging, and unapproved analytics are excluded or disabled.

## Automated evidence

| Check | Current result | Scope and limitation |
|---|---|---|
| `npm run verify` | Passed: lint, strict TypeScript, production Worker build, and 226/226 tests; zero failures, cancellations, skips, or todos | Exact version-8 release source commit; covers source/build/automated behavior, not hosted identity, provider operation, manual accessibility, policy, or real users |
| `npm run verify:release-integrity` | Release-time/pre-SBOM pass: 248 runtime-source text files scanned with zero pattern findings; historical Business Plan V1 digest preserved; the recorded Windows working-checkout/extracted Git source-archive byte representation of `package-lock.json` had SHA-256 `a29e63ce73d1de9f40d54ebc615982686af6c53084c107f84e35d1316ba425d1` | Exact version-8 source only; the canonical Git-blob/SBOM lock digest is `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d`. After the three SBOM JSON artifacts were retained, the reconciliation rerun scanned 251 files with zero findings. The check intentionally excludes generated `dist`, `outputs`, dependencies, coverage, and work directories and is not an independent security assessment |
| Exact-v8 artifact and submitted-archive audit | Passed: 61 safe tar entries/49 files; 23 source-mapped controls matched; all ten migrations were present; the archive matched the fresh local `dist`; exactly two matching generated prerender-credential files were confined to expected server locations; zero unexpected credential copies were found | The verifier reported `localBuildCompared: true`. Credential material was never printed. This proves the checked local build/archive relationship, not deterministic rebuilds on another machine or provider-side byte identity |
| Full-lock SBOM generation | Passed: lockfile digest matched exact source; CycloneDX 1.5 contains 676 components and SPDX 2.3 contains 677 packages | Exact-v8 artifacts and hashes are recorded in [Software Supply Chain](SOFTWARE_SUPPLY_CHAIN.md); this is inventory, not provenance, license advice, or vulnerability certification |
| `npm run audit:production` | Fresh 2026-08-08 result: zero known production vulnerabilities | Exact lock; advisory snapshot is time-bounded and not an independent assessment |
| `npm run db:generate` | Passed: `No schema changes, nothing to migrate` | Drizzle schema, journal, snapshots, and ten packaged migrations agree across 31 tables |
| `npm run exercise:recovery:local` | Passed: ten migrations per isolated D1 database, two synthetic tenants, three private synthetic objects, child-process secret isolation, and snapshot SHA-256 `34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54` | Deterministic D1/R2-compatible logical-copy exercise only; not hosted/provider-native recovery, production data, RPO, RTO, or operator evidence |
| D1 integration journeys | Passed | Production Worker plus real local D1 exercised tenant isolation; consent grant/withdrawal and final-statement share/session race fencing; staged-save replay/races; three- and four-phase lifecycles; publication/session invalidation; share expiry/revocation/response; data-request operator boundaries; scheduler/dead-letter states; Checkout/reconciliation races; webhook healing; migration upgrades; and stale provider-read fencing; not hosted SIWC or live-provider evidence |
| `git diff --check` | Passed; no whitespace errors, with only line-ending warnings reported | Source-tree consistency check only; not behavioral evidence |

Version-8 focused regressions additionally cover full-authoring and package-creation
idempotency; client handoff/share retry; living-content withdrawal and practice
replacement audits; bounded golfer/package pagination and plan snapshots; export
preflight/manual fallback; shallow liveness versus owner-only operational health;
allowlisted request telemetry and runtime log privacy; CSP/input/overposting cases;
consent policy/lifecycle/enforcement/migration and concurrent withdrawal fences;
data-request operator access/pagination/abuse boundaries; and the complete declared
mutation-route audit-event matrix. These remain automated
local/production-bundle results, not mounted-browser or hosted operational evidence.

The clean build's `dist/server/wrangler.json` pointed to `index.js`; the server entry
passed `node --check`, client assets and observability configuration were present,
  the D1/R2 bindings were `DB`/`MEDIA`, the `*/5 * * * *` scheduled trigger and
  Worker scheduled export were present, and all ten journaled migrations were packaged.

## Predecessor local rendered and reflow evidence

The version-5 synthetic visual-review harness used the production Worker bundle, D1 migrations,
authenticated instructor headers, and a real fragment-to-cookie golfer capability
exchange. No customer data is used.

- Desktop landing and workspace were visually inspected at 1440 CSS px.
- Chrome DevTools device metrics established true 390 and 320 CSS px viewports for
  landing, workspace, and golfer views. In every case
  `documentElement.scrollWidth === documentElement.clientWidth`; the golfer section
  navigation alone scrolls intentionally inside its own `overflow-x: auto` region.
- The 320 CSS px checks are the reflow equivalent of a 1280 CSS px layout at 400%.
- The screenshots in [`docs/release-evidence`](release-evidence/) record the inspected
  desktop, 390 px, and 320 px states. They are synthetic and local, not hosted-service
  or real-user evidence.
- Static runtime review found `lang="en-CA"`, one H1 per inspected route, logical
  heading progression, skip links, main and uniquely named complementary/navigation
  landmarks, labelled forms, named interactive controls, no duplicate IDs, and no
  broken `aria-labelledby` references. Focused semantic/contrast tests passed 16/16;
  sampled text and focus-ring contrasts met their applicable AA thresholds.

Versions 6, 7, and 8 change roadmap, authoring, recovery, consent, and bounded-data surfaces, so
this visual evidence is retained only for predecessor scope and is not exact
version-8 runtime evidence. It does not
substitute for a real screen reader, supported-device matrix,
or human keyboard/accessibility acceptance review. The in-app browser backend was not
available, so actual Tab order, screen-reader announcements, forced-colour behavior,
and real browser zoom remain explicitly unverified.

## Exact private Sites release

| Field | Exact recorded value |
|---|---|
| Candidate | `ROADMAP-SITES-V8-2026-08-08` |
| Release commit / runtime `RELEASE_ID` | `cf117fef8ea42272d0b7e2358fe4197c024f86a7` |
| Local submitted archive | `D:\Projects\golf-coaching-design-blueprint\10_production_saas\outputs\roadmap-sites-v8-cf117fe.tar.gz`; 2,963,266 bytes; 61 tar entries; gzip SHA-256 `99d615410c2e145e77938f0c5df4449ab8aeb4a544a5c5949fcdafa56a8e1378` |
| Sites project | `appgprj_6a76957326fc819196ebf3a0c95f1ec3` (`roadmap-golf-coaching`) |
| Saved version | Version 8, `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_01ba2d860b508191b4d104339921606d` |
| Sites archive record | Content hash `sha256:9a4119ea60dd64d2a0bf14a55c7e2d27fb3e8ea250f0d064e8bc5a79fb34a87c`; 49 files; 6,737,920 unpacked bytes |
| Final deployment | `appgdep_6a775b172534819196391fd626e95aa3`, `succeeded` at `2026-08-08T16:36:50.529785+00:00`, no failure message |
| Owner-only production URL | `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Applied environment revision | 10 |
| Access policy | Owner-only; not a public release or real-user acceptance |

The version-8 source branch was pushed using a short-lived authorization header
scoped to the command; the credential was not persisted in the remote URL, Git
configuration, environment files, or source. Environment revision 10 binds
`RELEASE_ID` to the exact version-8 commit while retaining the owner-private,
billing-disabled configuration. The archive includes the built Worker, client
assets, hosting metadata, all ten journaled migrations, and the production icon.
The local gzip digest and Sites content hash describe different representations and
are recorded separately rather than treated as interchangeable.

The exact archive verifier counted 61 safe entries/49 files, matched 23 source-mapped
files, confirmed all ten migrations, compared the archive to the fresh local build,
and found the two expected generated credential files with zero unexpected copies.
That bounded credential check does not authorize reading, copying, or reusing any
generated credential material.

### Version 8 hosted smoke evidence and limits

- Fresh signed-out GETs to `/`, `/app`, `/api/health`, and
  `/api/operations/health` each returned `401` from the outer owner-only Sites
  policy. This demonstrates anonymous denial on those paths, not authenticated
  application health or journey behavior.
- An immediate error-only Worker-log query after the successful deployment returned
  one expected `/app.rsc` event with status `403` and outcome `ok`. This is a
  bounded non-owner renderer observation, not proof of error-free
  operation, log completeness, redaction, retention, alert delivery, or scheduled
  invocation.
- Deep operational readiness is intentionally degraded because exact owner-approved
  consent-policy content/version and privacy-operator access configuration are absent.
  No authenticated deep-readiness response is claimed.
- The in-app browser backend was unavailable. No exact version-8 authenticated
  mounted-browser journey, manual accessibility review, owner operational-health
  response, private golfer-link exercise, or hosted scheduler observation is
  claimed. Version-5 screenshots and version-7/version-6 renderer/log observations are
  historical evidence only.

### Predecessor version 7 exact record

Sites version 7 used source/runtime release
`7ed01ec822fdb5c2bfbe6db7e3c99bcba126ac17`, local gzip SHA-256
`a07f06989d3ba6cf05b924b149fc9f955be512223c6f90d5dd8d7628d175e526`,
Sites content hash
`sha256:4a00694b9798f4f84487e8e7ea224703ccbbfc61a32dd132d417dc65b7f153bc`,
saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_55fe270d85f081919dcd346c8476130d`,
deployment `appgdep_6a772e0616b88191972b4e2e0603da52`, and environment
revision 9. Its 1200×750 renderer image and Worker-log samples remain historical
predecessor observations and do not supply exact-version-8 browser, accessibility,
health, or operational evidence. Version 8 supersedes version 7 at the same URL.

### Predecessor version 6 exact record

| Field | Exact recorded value |
|---|---|
| Candidate | `ROADMAP-SITES-V6-2026-08-08` |
| Release commit / runtime `RELEASE_ID` | `e2a6e344d0cccdb73cde4697beca32ad02743f79` |
| Sites project | `appgprj_6a76957326fc819196ebf3a0c95f1ec3` (`roadmap-golf-coaching`) |
| Saved version | Version 6, `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_2c09bb4c47b0819192eba33a8e075edc` |
| Final deployment | `appgdep_6a7714dd7bbc8191a4b2118e22ee8c97`, `succeeded`, no failure message |
| Owner-only production URL | `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Applied environment revision | 8 |
| Access policy | Owner-only; the private deployment control re-verified the current caller as the sole allowed viewer with no allowed groups before publishing |
| Post-deploy exact-source package reproduction SHA-256 | `sha256:a70ad6b200f78b9b0b9378a7db48aa7aa0e0f574cb2ffb7331ab2d5e312c1123` |
| Sites archive content hash | `sha256:0b66689cad4d08639783b85faf4cbc76611317864e3bb644143f56708ba762b9` |
| Hosting metadata SHA-256 | `b5a8dcd7e593f2f90a2e084450ca64655077844f90ce763c7a8b8a449107b6ba` |
| Migration `0000` SHA-256 | `867192A1E43D8243985CA838A7BCAF146CCF3FDFB4B1A736B0BD6F13198E1FF2` |
| Migration `0001` SHA-256 | `564742C53AD8D13427673DEB69F96B24707A1E967525EDC1BBADF559A685573C` |
| Migration `0002` SHA-256 | `097331EA0EA50AB2D218843D64E915D6792BF333E52F4A5A4E26E49366C6241C` |
| Migration `0003` SHA-256 | `944612D2312ADD149C97F4AF19A0EDF8ACD69A78DC6858DA8D6D6AD57E9AADBF` |
| Migration `0004` SHA-256 | `852731EBE773F7B132E3542366C9A598EBA434A605A5F45A1BA8C6EE9B20BA02` |
| Migration `0005` SHA-256 | `B17621AEA0F98CFD0CEFDF8224B48E78D4F0432CD8790D31A2A8D5F19606CAEF` |
| Migration `0006` SHA-256 | `70D8BF569CC0F553194D835834E24B56643FFD14F7929407E17C8C5C2D5E009F` |
| Migration `0007` SHA-256 | `e2ae559183026af697365979d2003bf0a383e5ab24237c51c69812b8cd84f7e0` |

The archive contains top-level `dist/server/index.js`, current hosting metadata,
all eight journaled migrations, client assets, and the production favicon. A
post-deploy package reproduction from the unchanged exact source/build lists 57
entries (2,903,482 bytes); it is labeled separately and does not substitute for the
connector's uploaded-archive record. Sites reports 45 archived files (6,174,720
bytes) and the content hash above for saved version 6. The
source branch was pushed with a
short-lived per-command authorization header; no repository credential is stored in
the remote URL, Git configuration, environment files, or source.

Credential-handling incident 1: the initial `create_site` result was accidentally
surfaced unredacted in the private tool transcript while its response shape was being
parsed. That credential was never written to disk or Git and was not used for a push;
it expired at `2026-08-08T02:43:30.052Z`. Every actual push used a newly issued
per-command credential, and the source/built secret scan found no persisted Sites
credential. No active credential from that result remains.

Credential-handling incident 2: at `2026-08-08T03:07:47.953Z`, a read-only Sites
project lookup unexpectedly returned a non-null SIWC bypass bearer credential. A
response sanitizer did not account for the connector's nested result envelope, so
the credential appeared in the private tool transcript. It was not invoked, copied
to a file, placed in Git, or used for any request. Current tooling does not expose a
revoke-only operation, and the token-generation/rotation action requires Aaron's
explicit instruction. Treat this credential as exposed: rotate or revoke it before
adding any visitor, changing the site to public, or accepting the release. Do not
copy its value into an incident record, support channel, command, or repository file.

Environment revision 8 changed only `RELEASE_ID` to the exact version-6 commit;
the Sites patch operation preserved revision-7 `APP_URL`,
`BILLING_CHECKOUT_ENABLED=false`, `INSTRUCTOR_ACCESS_MODE=owner_private`, and three
independent masked secrets for share-token, abuse-counter, and owner-access HMACs.
Application configuration stores that owner identity only as a separate masked HMAC
digest; plaintext was not copied into the application environment, source, or release
output. Stripe and development-auth variables are absent. Rotating
the share-token pepper would invalidate active golfer capabilities and therefore is
an explicit operation, not routine redeployment behavior.

#### Version 6 hosted smoke evidence and limits

- Version 6 deployed successfully with environment revision 8 and was current when
  this predecessor evidence was recorded; version 8 now supersedes it at the same URL.
- A fresh signed-out GET to `/` after version-6 deployment received `401 Unauthorized`
  from the outer Sites access policy with `Cache-Control: no-store` and
  `Referrer-Policy: no-referrer`; separate signed-out GETs to `/app` and
  `/api/operations/health` also received `401`. This proves those paths are not
  anonymously reachable, not that authenticated application behavior works.
- The immediate version-6 error-only Worker-log query over the preceding 15 minutes
  returned zero events. This is an observation-window result, not an absolute
  no-error or authenticated smoke claim. Log retention, access, export, and alert
  routing remain unverified.
- Sites' version-6 renderer recorded Worker `200` responses for `/` and `/.rsc`
  and an expected `403` for its non-owner `/app.rsc` probe. All three invocations
  completed with outcome `ok`; provider logs redacted cookies and SIWC name/email
  values but retained network and client metadata. This is provider-renderer
  evidence, not an authenticated owner journey.
- During the earlier immutable version-1 bootstrap,
  Sites' authenticated renderer recorded Worker `200` responses for `/`, `/.rsc`,
  and `/app.rsc`; the provider-generated production screenshot rendered the expected
  Roadmap landing page. Provider logs redacted cookies, SIWC identity headers, and
  platform version metadata. That renderer evidence predates the version-4 hardening
  release and is retained only for its direct scope.
- The initial renderer exposed a missing `/favicon.ico` request. Version 2 adds an
  explicit SVG icon, asserts its rendered metadata, and packages `dist/client/favicon.svg`.
- The version-6 archive contains the `*/5 * * * *` trigger, the built Worker exports
  `scheduled`, and local Miniflare invokes that handler and its release-aware durable
  heartbeat in the scheduler regression suite. A non-error 20-minute hosted-log query
  returned only the three provider-renderer fetch events above and no scheduled event;
  signed-out access cannot inspect the owner-only operational-health response. Hosted
  cron invocation is not claimed or relied on for this billing-disabled owner-only
  release. Version-5 four-boundary log observations remain predecessor evidence only.

The in-app browser backend was unavailable and the SIWC bypass token-generation tool
was not invoked. The unexpectedly disclosed existing bypass credential was not used.
Consequently, an exact final authenticated owner session, `/api/health` response,
private golfer link in an unaffiliated browser, and live R2 check are not claimed.
The owner-only outer policy also prevents a real Stripe webhook or unaffiliated golfer
from reaching the application by design.

## Manual and operational evidence still required

- keyboard, visible-focus, screen-reader, contrast, reduced-motion, long-content,
  and supported-browser review beyond the recorded 320 CSS px/reflow and no-media checks;
- hosted SIWC sign-in, sign-out, recovery, spoofing, identity continuity, and isolation;
- controlled Stripe test-mode Checkout/Portal/webhook/cancel/failure/replay exercise;
- authenticated deployed cache, no-index, private-link, revocation, and deeper log-leak checks beyond the recorded outer-gate/referrer evidence;
- actual D1/R2 binding, migration, backup, restore, rollback, hosted cron invocation,
  alert, log-redaction, webhook reconciliation, cost, and incident exercises;
- qualified Canadian privacy/legal review and behavior-to-copy comparison;
- exact owner-approved consent policy/content versions, configured privacy operator,
  privacy/support channel, public domain, exact commercial policy, approved Stripe
  Price, tax/refund/failure/cancel consequences, and retention schedule;
- authorized real-user validation and Aaron's acceptance of the exact release.

## Release blockers and residual risks

| Item | Current disposition |
|---|---|
| General public access | Blocked; working legal/support copy explicitly limits this to controlled private release |
| Owner-only production release | Deployed successfully as Sites version 8; final authenticated owner acceptance and controlled real journeys remain unrecorded |
| Deep operational readiness | Intentionally degraded because exact owner-approved consent-policy content/version and privacy-operator access configuration are absent; no authenticated deep-readiness pass is claimed |
| SIWC bypass credential exposure | A connector-returned active bearer appeared in the private tool transcript and was not used or persisted; explicit owner-directed rotation/revocation is required before access expands |
| New SaaS charges | Fail-closed through `BILLING_CHECKOUT_ENABLED=false` until exact price/policy approval and configuration |
| Paid entitlement enforcement | A fail-closed, explicit-status guard exists but production remains in `owner_private`; no owner-approved failed/cancelled/unpaid consequence is selected or claimed |
| Public billing reliability | Durable attempts and reconciliation targets, account-operation leases, provider-authoritative expiry, pending-sync blocking, event leases, customer ownership, explicit Price/freshness policy, scheduled GET-only recovery with fairness/backoff/dead-letter handling, webhook race healing, and stale-read fencing are implemented and locally exercised; Checkout remains disabled because owner-only Sites access blocks Stripe ingress and exact commercial configuration/live reconciliation evidence is absent |
| Media upload | Disabled until consent, formats, scanning, accessibility, storage, and retention are approved and exercised |
| Destructive account deletion | Not automated; only an identity/retention review request is created |
| Fresh reauthentication | High-impact actions rely on the current SIWC session; provider capability/configuration for explicit recent-auth proof remains unresolved |
| Abuse/rate-limit controls | D1-backed atomic fixed-window controls cover capability exchange/response, publish/revoke, Checkout/Portal/reconciliation, export, and data requests with HMAC-only subjects and truthful `429`/`Retry-After`; deployed edge/header/alert evidence remains required |
| Backup/recovery claim | Local synthetic D1/R2-compatible logical restore passed; no hosted/provider-native backup, restore, rollback, RPO, or RTO claim is made |
| Legal/compliance claim | Not made; qualified review and final operating details remain required |
| Production acceptance | Not granted; Aaron must accept one exact deployed release separately |

No critical finding may be removed from this table merely to make the release look
complete. It must be remediated, exercised, or explicitly dispositioned by the
accountable owner.
