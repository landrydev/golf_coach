# Production findings and retest ledger

**Status:** Active release-control record under `AUTH-005`; last reconciled
2026-08-08
**Boundary:** The current recorded candidate is owner-only Sites version 7, bound
to immutable source commit `7ed01ec822fdb5c2bfbe6db7e3c99bcba126ac17` and the
exact saved version and deployment below. Sites version 6 remains historical
predecessor evidence; neither private deployment is accepted public production.
**Related:** [Release evidence](RELEASE_EVIDENCE.md),
[Full-live completion audit](FULL_LIVE_COMPLETION_AUDIT.md),
[Security and privacy](SECURITY_PRIVACY.md), and
[owner release decisions](OWNER_RELEASE_DECISIONS_REQUIRED.md)

This ledger separates a confirmed defect or incident from a missing evidence item
or owner/external dependency. A severity on an evidence gap describes its release
effect; it does not assert that an undiscovered product defect exists. A document
edit does not close a hosted, manual, legal, real-user, or owner-acceptance item.

## Current exact-candidate evidence snapshot

| Field | Recorded Sites version 7 evidence |
|---|---|
| Source and runtime release ID | `7ed01ec822fdb5c2bfbe6db7e3c99bcba126ac17` |
| Package | Local gzip SHA-256 `a07f06989d3ba6cf05b924b149fc9f955be512223c6f90d5dd8d7628d175e526`; 2,916,309 bytes; 57 tar entries. Sites content `sha256:4a00694b9798f4f84487e8e7ea224703ccbbfc61a32dd132d417dc65b7f153bc`; 45 files; 6,236,160 bytes. |
| Sites release | Saved version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_55fe270d85f081919dcd346c8476130d`; deployment `appgdep_6a772e0616b88191972b4e2e0603da52`; environment revision `9`; succeeded `2026-08-08T13:24:35.466957+00:00` |
| Automated/local evidence | Production build, strict types, lint, and 163/163 tests passed; release-integrity inspected 204 text files with zero secret findings, preserved Business Plan V1, and confirmed package-lock SHA-256 `a29e63ce73d1de9f40d54ebc615982686af6c53084c107f84e35d1316ba425d1`; production dependency audit reported zero vulnerabilities; migration generation produced no schema changes; local recovery exercised 8 migrations and 2 synthetic tenants. |
| Owner-private probes | Signed-out requests to `/`, `/app`, `/api/health`, and `/api/operations/health` each returned the outer-policy `401`. A separate safe 20-minute worker sample contained three non-truncated fetches: `GET /` 200/ok, `GET /.rsc` 200/ok, and `GET /app.rsc` 403/ok at the expected non-owner application boundary; an immediate error-only sample returned zero entries. These observations do not exercise authenticated identity, deep health, alerting, or a staffed observation window. |
| Renderer sanity | Sites-generated `roadmap-sites-v7-renderer.png`, 1200x750, 77,485 bytes, SHA-256 `b40bdedf6b9307ff1750e6b518b1be619e43ca269ac0451a034b0cbd5e30d609`; visual inspection found no obvious clipping/overlap in the complete desktop landing hero/nav/sample card. This is not authenticated, responsive, interaction, browser, or manual accessibility evidence. |
| Evidence still absent | No exact-v7 authenticated browser journey, manual accessibility review, hosted scheduler/deep-health exercise, application rollback, D1/R2 restore, or measured RPO/RTO. The browser backend was unavailable. |

The automated and signed-out observations are exact-v7 evidence, but they do not
close any row whose closure requires authenticated, manual, hosted, external,
qualified-review, or owner-acceptance evidence.

## Classification and closure rules

| Class | Meaning |
|---|---|
| Critical | Current plausible unauthorized access, material data loss, unsafe billing, or similarly severe harm; do not expand affected operation while open |
| High | Release-blocking weakness or missing evidence for the affected public/real/paid operation |
| Medium | Material control limitation with containment; remediate or obtain explicit residual-risk acceptance before affected release |
| Low | Bounded issue with low expected harm; track to verified closure |
| Not applicable | Decision or dependency that needs resolution but is not itself a technical finding |

Allowed statuses are `OPEN`, `CONTAINED`, `REMEDIATED — RETEST PENDING`,
`CLOSED — RETEST PASSED`, and `ACCEPTED RESIDUAL RISK`. Only an exact-release
retest may produce `CLOSED — RETEST PASSED`. Residual-risk status requires Aaron's
dated decision, named owner, mitigation, review date, and stop/revisit trigger.

## Current ledger

| ID | Type / severity | Affected boundary and evidence | Current containment or remediation | Owner and status | Required closure and retest |
|---|---|---|---|---|---|
| `SEC-001` | Confirmed credential incident / **Critical** | A Sites project lookup returned a live SIWC bypass bearer credential in a private tool transcript for project `appgprj_6a76957326fc819196ebf3a0c95f1ec3`. The value is not reproduced or used. See the exact incident record in [release evidence](RELEASE_EVIDENCE.md#exact-private-sites-release). | Outer Sites access and application access remain owner-only. Prior values are treated as compromised. | Aaron authorizes the operation; release/security operators remain unassigned. **CONTAINED** | Record `OWNER-SEC-001`; rotate or revoke without recording values; prove the prior credential is denied and normal owner authentication still succeeds; sample logs for leakage. Do not expand access before this passes. |
| `SEC-003` | Confirmed build-credential exposure / **High** | Exact-v7 `vinext-server.json` artifacts contain the same build-generated prerender credential in two server-only manifests. Its value appeared in a private audit transcript and is not reproduced, invoked, or persisted elsewhere. The packaged Worker normally returns `404` for the internal prerender routes unless a build-only environment flag is set; that flag is absent from the recorded production configuration. | Version 7 remains owner-only. A value-safe artifact audit found exactly the two expected server-manifest copies, no client/Worker copy, and no production prerender binding. Missing and incorrect credentials fail closed in the Node server, while the production Worker keeps both internal routes disabled. | Release/security operators unassigned. **REMEDIATED — RETEST PENDING** | Build and privately deploy a fresh exact candidate to rotate the generated value; re-run source, build-artifact, submitted-archive, configuration, Worker-route, and Node-route checks without logging credential material. Record the prior candidate as superseded before considering closure. |
| `SEC-002` | Design limitation / **Medium** | Exact Sites version 7 permits `'unsafe-inline'` in CSP `script-src` for framework bootstrap and denies inline script attributes with `script-src-attr 'none'`. Automated adversarial coverage passed, but the exact deployed CSP was not inspected in a supported browser. | Framework escaping, no raw HTML/SVG, input limits, URL allowlisting, no `unsafe-eval`, and `script-src-attr 'none'` reduce exposure. | Security owner unassigned. **OPEN** | Inspect the exact deployed CSP and adversarial renders in supported browsers; document whether vinext supports nonces/hashes; remove `'unsafe-inline'` when compatible or obtain time-bounded `OWNER-RISK-001` acceptance. |
| `AUTH-EVID-001` | Hosted evidence gap / **High before public access** | Exact-v7 SIWC sign-in, recovery, sign-out, stable identity, header-spoof denial, and cross-device behavior have not been demonstrated in the hosted configuration. Signed-out outer-policy `401` responses are not authenticated application evidence. | Owner-only outer policy and application HMAC allowlist fail closed. | Release/security operators unassigned. **OPEN** | After `SEC-001` is closed, complete an authenticated hosted matrix using authorized accounts, including forged/missing header denial and session termination; attach privacy-safe results to the exact release. |
| `A11Y-EVID-001` | Manual evidence gap / **High before public acceptance** | Automated semantics and reflow checks exist, but exact-v7 keyboard, focus, screen-reader, forced-colour, 200%/400% zoom, reduced-motion, long-content, and supported-browser review is absent because the browser backend was unavailable. Historical screenshots are predecessor evidence only. | No claim of complete WCAG conformance is made. | Quality/accessibility owner unassigned. **OPEN** | Execute the approved manual matrix on the exact release, enter every defect here with severity, remediate release blockers, and retest with named tester, browser/assistive-technology versions, date, and artifacts. |
| `OPS-EVID-001` | Recovery evidence gap / **High** | The exact-v7 local synthetic logical recovery exercise passed 8 migrations and 2 tenants (snapshot SHA-256 `ebbba2d865090457ef567a1d15658cad0457e4e7d89c2c1975ec45ce944887c5`), but no controlled hosted D1/R2 restore or exact application rollback has been exercised. Provider durability is not treated as restore evidence. | Owner-only operation; recovery procedures exist; media upload is disabled. | Backup/recovery and release operators unassigned. **OPEN** | Complete [rollback and schema compatibility](ROLLBACK_SCHEMA_COMPATIBILITY.md), take a provider recovery point, exercise rollback separately from restore, measure RPO/RTO, verify tenant/capability/audit integrity, and attach results. |
| `OPS-EVID-002` | Operational evidence gap / **High for paid operation; Medium while billing-disabled owner-only** | Packaged scheduling and local heartbeat tests exist, but exact-v7 hosted scheduled invocation, authenticated deep health, alert delivery, cost monitoring, and staffed response have not been demonstrated. The safe 20-minute worker sample showed three expected fetch outcomes and zero immediate error entries, but it was not a scheduler, deep-health, monitoring-window, or alert test. | Checkout is disabled and hosted scheduling is not relied on for current owner-only operation. | Operations/billing owners unassigned. **OPEN** | Observe scheduled invocation and operational health in the exact environment; trigger privacy-safe test alerts; record receipt, escalation, response time, cost view, and corrective action. |
| `BILL-EVID-001` | External/owner dependency / **High for paid operation** | No approved offer, Product/Price, tax/refund/failure/cancel/pause policy, live credentials, publicly reachable signed webhook, or controlled real reconciliation/transaction evidence exists. | `BILLING_CHECKOUT_ENABLED=false`; production Stripe variables are absent from the recorded release. | Aaron plus billing operator, currently unassigned. **OPEN** | Record `OWNER-COMM-001` and `OWNER-PROD-001`; provision exact authorized configuration; pass Stripe test-mode failure/replay/order/recovery tests and one explicitly authorized controlled live exercise before enabling Checkout. |
| `PRIV-EVID-001` | Owner/external dependency / **High before real-user public operation** | Exact privacy notice, retention/deletion/backup-expiry schedule, instructor authority for golfer data, contracting entity, contacts, and qualified Canadian review are absent. | Synthetic/owner-controlled use only; media is disabled; deletion is represented as a review request rather than completed deletion. | Aaron, privacy lead, and qualified reviewer; assignments unresolved. **OPEN** | Record `OWNER-OPS-001`, `OWNER-PRIV-001`, and `OWNER-MEDIA-001`; map versioned copy/policy to behavior and operator workflows; complete qualified review and deployed conformance check. |
| `VAL-EVID-001` | Real-world evidence gap / **High for full-live acceptance** | No authorized real instructor/golfer critical journey, unassisted activation result, support-burden record, or approved measurement protocol exists. | No demand, usability, price, retention, seasonality, or outcome claim is made from simulation. | Aaron and validation owner, currently unassigned. **OPEN** | Approve [the measurement packet](OWNER_MEASUREMENT_ACCEPTANCE_PACKET.md) and `OWNER-VALIDATION-001`; run the bounded adults-only protocol with approved consent/policy and record assistance/confounders. |
| `ACCEPT-001` | Owner decision / **Not applicable** | Aaron has not accepted an exact release, operating scope, configuration, policies, owners, or residual risks. | Deployment is described as an owner-only candidate, not an accepted public V1. | Aaron. **OPEN** | Complete the quality and risk packets, attach all exact-release evidence, then record `OWNER-ACCEPT-001` with date, scope, conditions, owners, and revisit triggers. |

## Retest log

Add one row per attempt; never replace a failed result with a later pass.

| Finding ID | Date/time and tester | Exact release / environment | Method and scope | Result | Evidence location | Follow-up |
|---|---|---|---|---|---|---|
| _No finding-closing exact-release retest is recorded in this ledger yet._ | — | — | — | — | — | — |

For closure, update the original row's status but preserve every retest row. Link the
exact command or manual protocol, immutable release identifier, environment,
expected and actual result, limitations, and reviewer. A release with any open
Critical finding, any un-dispositioned High finding applicable to its operating
scope, or an unapproved material residual risk is not accepted production evidence.
