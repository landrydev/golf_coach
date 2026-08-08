# Roadmap V1 release evidence

**Candidate:** `roadmap-production-saas` 1.0.0
**Evidence opened:** 2026-08-07
**Authority:** `AUTH-005`
**Status:** owner-only Sites production release succeeded; not accepted for public launch or real-user operation

This file records evidence for one exact candidate. A command result supports only
the scope it actually exercised. A successful private deployment is not Aaron's
acceptance and is not evidence that unresolved policy or live operations work.

## Implemented candidate boundary

- public Canadian instructor acquisition page and visibly synthetic example;
- SIWC-attributed, single-instructor tenant workspace with local-only synthetic fallback;
- coach identity, bounded branding, coach-package and external-action records;
- adults-only golfer, goal, assessment, priority, and four-phase roadmap creation;
- draft return, core editing, stale-revision rejection, exact golfer preview, and coach confirmation;
- living lesson, practice, evidence, and phase-review updates;
- HMAC-fingerprinted, expiring, revision-scoped golfer access with fragment exchange,
  HTTP-only session, one-active-link rotation, access status, and revocation;
- separate Stripe Checkout/Portal/webhook boundary for the Roadmap SaaS subscription;
- tenant-scoped JSON export and non-destructive deletion-review request;
- public working-release privacy, terms, and support boundaries;
- D1 schema/migration, private R2 binding, audit events, health checks, security headers,
  correlation identifiers, and privacy-safe error responses.

Media upload, junior golfers, native coach-package transactions, teams/facilities,
marketplace, AI, CRM/messaging, and unapproved analytics are excluded or disabled.

## Automated evidence

| Check | Current result | Scope and limitation |
|---|---|---|
| Clean `npm ci` | Passed: 501 packages installed, 502 audited | Exact outside-tree source copy; lockfile SHA-256 `73E540DD099306121351E884E195C86203D61BFB9775C5A4D002CBD6CCAC2757` |
| `npm run lint` | Passed | Repository ESLint; does not prove runtime behavior or accessibility |
| `npm run typecheck` | Passed | Strict TypeScript including Worker/D1/R2 ambient types |
| `npm run build` | Passed | Vinext/Worker production bundle and route discovery |
| `npm test` | Passed: 36/36, zero failed or skipped | Rendered routes/headers, schema and migration parity, validation, billing controls, capability controls, rate limiting, and D1-backed critical/package/golfer/phase lifecycles |
| `npm audit` | Passed: zero known vulnerabilities | Full dependency advisory snapshot; not an independent security assessment |
| `npm audit --omit=dev` | Passed: zero known vulnerabilities | Production dependency advisory snapshot |
| `npx drizzle-kit check` | Passed | Drizzle schema/config consistency; both journaled migrations were also byte-identical in the clean build |
| D1 integration journeys | Passed | Production Worker plus real local D1 exercised tenant isolation, stale revisions, package/golfer invalidation, share lifecycle and response, and four phase-review transitions; not hosted SIWC or live-provider evidence |

The clean build's `dist/server/wrangler.json` pointed to `index.js`; the server entry
passed `node --check`, client assets and observability configuration were present,
the D1/R2 bindings were `DB`/`MEDIA`, and both journaled migrations were packaged.

## Local rendered and reflow evidence

The synthetic visual-review harness uses the production Worker bundle, D1 migrations,
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

This evidence does not substitute for a real screen reader, supported-device matrix,
or human keyboard/accessibility acceptance review. The in-app browser backend was not
available, so actual Tab order, screen-reader announcements, forced-colour behavior,
and real browser zoom remain explicitly unverified.

## Exact private Sites release

| Field | Exact recorded value |
|---|---|
| Release commit / runtime `RELEASE_ID` | `240c9ed9d70ced5f3ed51691f1dc0339224f24bd` |
| Sites project | `appgprj_6a76957326fc819196ebf3a0c95f1ec3` (`roadmap-golf-coaching`) |
| Saved version | Version 2, `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_121f031c4ea88191ad84db23a0e0169e` |
| Final deployment | `appgdep_6a769ade815881918e61687843424fb3`, `succeeded`, no failure message |
| Owner-only production URL | `https://roadmap-golf-coaching.aar-landry.chatgpt.site` |
| Applied environment revision | 4 |
| Access policy | Revision 1; `custom`; one non-external owner; zero editors, groups, or external visitors |
| Local archive SHA-256 | `85C7D78AA04814673869AF09299AB484E140ECDEDA09C93F603AF5EE637186DC` |
| Sites archive content hash | `sha256:2c1d0c5d7b8cb0ce39fbc96f4deedbc1b82a1be9aae244815a5575f72aabb71f` |
| Hosting metadata SHA-256 | `B5A8DCD7E593F2F90A2E084450CA64655077844F90CE763C7A8B8A449107B6BA` |
| Migration `0000` SHA-256 | `867192A1E43D8243985CA838A7BCAF146CCF3FDFB4B1A736B0BD6F13198E1FF2` |
| Migration `0001` SHA-256 | `564742C53AD8D13427673DEB69F96B24707A1E967525EDC1BBADF559A685573C` |

The archive contains top-level `dist/server/index.js`, current hosting metadata,
both journaled migrations, client assets, and the production favicon. Sites reports
33 archived files in the saved version. The source branch was pushed with a
short-lived per-command authorization header; no repository credential is stored in
the remote URL, Git configuration, environment files, or source.

Credential-handling incident: the initial `create_site` result was accidentally
surfaced unredacted in the private tool transcript while its response shape was being
parsed. That credential was never written to disk or Git and was not used for a push;
it expired at `2026-08-08T02:43:30.052Z`. Every actual push used a newly issued
per-command credential, and the source/built secret scan found no persisted Sites
credential. No active credential from that result remains.

Environment revision 4 contains the exact canonical `APP_URL`, the release commit,
`BILLING_CHECKOUT_ENABLED=false`, and two independent masked secrets for share-token
and abuse-counter HMACs. Stripe and development-auth variables are absent. Rotating
the share-token pepper would invalidate active golfer capabilities and therefore is
an explicit operation, not routine redeployment behavior.

### Hosted smoke evidence and limits

- Final version 2 deployed successfully with environment revision 4 and remains the
  current live version at the recorded URL.
- A signed-out request to `/` receives `401 Unauthorized` from the outer Sites access
  policy with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, proving
  the release is not anonymously reachable.
- During the preceding immutable version-1 bootstrap of the same application code,
  Sites' authenticated renderer recorded Worker `200` responses for `/`, `/.rsc`,
  and `/app.rsc`; the provider-generated production screenshot rendered the expected
  Roadmap landing page. Provider logs redacted cookies, SIWC identity headers, and
  platform version metadata. Version 2 changes only favicon metadata/asset and its
  rendered regression test; its full local production suite remains 36/36.
- The initial renderer exposed a missing `/favicon.ico` request. Version 2 adds an
  explicit SVG icon, asserts its rendered metadata, and packages `dist/client/favicon.svg`.
- An `errors_only` log query immediately after final deployment returned zero events.
  No 5xx, Worker exception, or failed deployment is recorded.

The in-app browser backend was unavailable and the bypass-token tool was not invoked,
because no bypass token was requested. Consequently, an exact final authenticated
owner session, `/api/health` response, private golfer link in an unaffiliated browser,
and live R2 check are not claimed. The owner-only outer policy also prevents a real
Stripe webhook or unaffiliated golfer from reaching the application by design.

## Manual and operational evidence still required

- keyboard, visible-focus, screen-reader, contrast, reduced-motion, long-content,
  and supported-browser review beyond the recorded 320 CSS px/reflow and no-media checks;
- hosted SIWC sign-in, sign-out, recovery, spoofing, identity continuity, and isolation;
- controlled Stripe test-mode Checkout/Portal/webhook/cancel/failure/replay exercise;
- authenticated deployed cache, no-index, private-link, revocation, and deeper log-leak checks beyond the recorded outer-gate/referrer evidence;
- actual D1/R2 binding, migration, backup, restore, rollback, alert, log-redaction,
  webhook reconciliation, cost, and incident exercises;
- qualified Canadian privacy/legal review and behavior-to-copy comparison;
- configured operator, privacy/support channel, public domain, exact commercial policy,
  approved Stripe Price, tax/refund/failure/cancel consequences, and retention schedule;
- authorized real-user validation and Aaron's acceptance of the exact release.

## Release blockers and residual risks

| Item | Current disposition |
|---|---|
| General public access | Blocked; working legal/support copy explicitly limits this to controlled private release |
| Owner-only production release | Deployed successfully as Sites version 2; final authenticated owner acceptance and controlled real journeys remain unrecorded |
| New SaaS charges | Fail-closed through `BILLING_CHECKOUT_ENABLED=false` until exact price/policy approval and configuration |
| Paid entitlement enforcement | Billing projection exists, but no owner-approved failed/cancelled/unpaid access consequence is implemented or claimed |
| Media upload | Disabled until consent, formats, scanning, accessibility, storage, and retention are approved and exercised |
| Destructive account deletion | Not automated; only an identity/retention review request is created |
| Fresh reauthentication | High-impact actions rely on the current SIWC session; provider capability/configuration for explicit recent-auth proof remains unresolved |
| Abuse/rate-limit controls | D1-backed atomic fixed-window controls cover capability exchange/response, publish/revoke, Checkout/Portal, export, and data requests with HMAC-only subjects and truthful `429`/`Retry-After`; deployed edge/header/alert evidence remains required |
| Backup/recovery claim | Not made until a successful isolated D1/R2 restore exercise is recorded |
| Legal/compliance claim | Not made; qualified review and final operating details remain required |
| Production acceptance | Not granted; Aaron must accept one exact deployed release separately |

No critical finding may be removed from this table merely to make the release look
complete. It must be remediated, exercised, or explicitly dispositioned by the
accountable owner.
