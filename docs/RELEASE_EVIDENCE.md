# Roadmap V1 release evidence

**Candidate:** `roadmap-production-saas` 1.0.0
**Evidence opened:** 2026-08-07
**Authority:** `AUTH-005`
**Status:** implementation and private-release evidence in progress; not accepted for public launch

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

Exact release commit, archive/migration checksums, Sites version/deployment IDs,
environment revision, URL, and hosted smoke results are recorded only after the
immutable candidate is pushed and privately deployed.

## Manual and operational evidence still required

- keyboard, visible-focus, screen-reader, contrast, reduced-motion, long-content,
  and supported-browser review beyond the recorded 320 CSS px/reflow and no-media checks;
- hosted SIWC sign-in, sign-out, recovery, spoofing, identity continuity, and isolation;
- controlled Stripe test-mode Checkout/Portal/webhook/cancel/failure/replay exercise;
- deployed cache, referrer, no-index, private-link, revocation, and log-leak checks;
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
| New SaaS charges | Fail-closed through `BILLING_CHECKOUT_ENABLED=false` until exact price/policy approval and configuration |
| Media upload | Disabled until consent, formats, scanning, accessibility, storage, and retention are approved and exercised |
| Destructive account deletion | Not automated; only an identity/retention review request is created |
| Abuse/rate-limit controls | D1-backed atomic fixed-window controls cover capability exchange/response, publish/revoke, Checkout/Portal, export, and data requests with HMAC-only subjects and truthful `429`/`Retry-After`; deployed edge/header/alert evidence remains required |
| Backup/recovery claim | Not made until a successful isolated D1/R2 restore exercise is recorded |
| Legal/compliance claim | Not made; qualified review and final operating details remain required |
| Production acceptance | Not granted; Aaron must accept one exact deployed release separately |

No critical finding may be removed from this table merely to make the release look
complete. It must be remediated, exercised, or explicitly dispositioned by the
accountable owner.
