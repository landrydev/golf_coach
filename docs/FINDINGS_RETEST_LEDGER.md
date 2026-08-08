# Production findings and retest ledger

**Status:** Active release-control record under `AUTH-005`; last reconciled
2026-08-08
**Boundary:** The current recorded candidate is owner-only Sites version 8, bound
to immutable source commit `cf117fef8ea42272d0b7e2358fe4197c024f86a7` and the
exact saved version and deployment below. Sites version 7 is superseded
predecessor evidence and is not an ordinary rollback target after consent-governed
use. Neither private deployment is accepted public production.
**Related:** [Release evidence](RELEASE_EVIDENCE.md),
[Full-live completion audit](FULL_LIVE_COMPLETION_AUDIT.md),
[Security and privacy](SECURITY_PRIVACY.md), and
[owner release decisions](OWNER_RELEASE_DECISIONS_REQUIRED.md)

This ledger separates a confirmed defect or incident from a missing evidence item
or owner/external dependency. A severity on an evidence gap describes its release
effect; it does not assert that an undiscovered product defect exists. A document
edit does not close a hosted, manual, legal, real-user, or owner-acceptance item.

## Current exact-candidate evidence snapshot

| Field | Recorded Sites version 8 evidence |
|---|---|
| Source and runtime release ID | `cf117fef8ea42272d0b7e2358fe4197c024f86a7` |
| Package | Local gzip SHA-256 `99d615410c2e145e77938f0c5df4449ab8aeb4a544a5c5949fcdafa56a8e1378`; 2,963,266 bytes; 61 tar entries. The exact archive verifier passed and found 10 migrations. Sites content `sha256:9a4119ea60dd64d2a0bf14a55c7e2d27fb3e8ea250f0d064e8bc5a79fb34a87c`; 49 files; 6,737,920 bytes. |
| Sites release | Saved version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_01ba2d860b508191b4d104339921606d`; deployment `appgdep_6a775b172534819196391fd626e95aa3`; environment revision `10`; succeeded `2026-08-08T16:36:50.529785+00:00` |
| Automated/local evidence | Production build, strict types, lint, and 226/226 tests passed; the release-time/pre-SBOM integrity pass inspected 248 runtime-source text files with zero secret findings, preserved Business Plan V1, and confirmed Windows working-checkout/extracted Git source-archive package-lock SHA-256 `a29e63ce73d1de9f40d54ebc615982686af6c53084c107f84e35d1316ba425d1`; the canonical Git-blob/SBOM digest is `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d`. The post-SBOM reconciliation scanned 251 files with zero findings. Production dependency audit reported zero vulnerabilities. A fresh post-commit build's value-safe artifact verifier found 49 files, exactly two expected server-manifest credential copies, zero unexpected copies or paths, and no production prerender binding. |
| Owner-private probes | Signed-out requests to `/`, `/app`, `/api/health`, and `/api/operations/health` each returned the outer-policy `401`. These observations prove signed-out containment only; they do not exercise authenticated identity, application deep health, alerting, or a staffed observation window. |
| Configuration readiness | Consent-policy-registry and independent privacy-operator owner decisions/configuration remain absent. The corresponding controls fail closed, and deep readiness is therefore intentionally degraded rather than represented as ready. |
| Renderer sanity | No exact-v8 mounted-browser or renderer inspection is recorded. The version-7 renderer image is predecessor evidence only. |
| Evidence still absent | No exact-v8 authenticated browser journey, manual accessibility review, hosted scheduler/deep-health exercise, application rollback, D1/R2 restore, or measured RPO/RTO. The browser backend was unavailable. |

The automated and signed-out observations are exact-v8 evidence, but they do not
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
| `SEC-003` | Confirmed build-credential exposure / **High** | The superseded version-7 build's generated prerender credential appeared in a private audit transcript. Its value is not reproduced or invoked in this evidence. | Version 8 was freshly built after exact source commit `cf117fef8ea42272d0b7e2358fe4197c024f86a7`. Its value-safe artifact verifier found exactly two expected server-manifest copies, zero unexpected copies or paths, and no production prerender binding; the exact submitted archive passed independently and the immutable candidate was deployed owner-only. Version 7 is superseded. | Release/security operators unassigned. **CLOSED — RETEST PASSED** | Closed for the build-generated prerender credential boundary on exact private version 8. Preserve the retest row below. Reopen on any unexpected credential copy/path, production prerender binding, reachable internal prerender route, archive/source mismatch, or reuse of a superseded artifact. This does not close `SEC-001`. |
| `SEC-002` | Design limitation / **Medium** | Exact Sites version 8 permits `'unsafe-inline'` in CSP `script-src` for framework bootstrap and denies inline script attributes with `script-src-attr 'none'`. Automated adversarial coverage passed, but the exact deployed CSP was not inspected in a supported browser. | Framework escaping, no raw HTML/SVG, input limits, URL allowlisting, no `unsafe-eval`, and `script-src-attr 'none'` reduce exposure. | Security owner unassigned. **OPEN** | Inspect the exact deployed CSP and adversarial renders in supported browsers; document whether vinext supports nonces/hashes; remove `'unsafe-inline'` when compatible or obtain time-bounded `OWNER-RISK-001` acceptance. |
| `AUTH-EVID-001` | Hosted evidence gap / **High before public access** | Exact-v8 SIWC sign-in, recovery, sign-out, stable identity, header-spoof denial, and cross-device behavior have not been demonstrated in the hosted configuration. Signed-out outer-policy `401` responses are not authenticated application evidence. | Owner-only outer policy and application HMAC allowlist fail closed. | Release/security operators unassigned. **OPEN** | After `SEC-001` is closed, complete an authenticated hosted matrix using authorized accounts, including forged/missing header denial and session termination; attach privacy-safe results to the exact release. |
| `A11Y-EVID-001` | Manual evidence gap / **High before public acceptance** | Automated semantics and reflow checks exist, but exact-v8 keyboard, focus, screen-reader, forced-colour, 200%/400% zoom, reduced-motion, long-content, and supported-browser review is absent because the browser backend was unavailable. Historical screenshots are predecessor evidence only. | No claim of complete WCAG conformance is made. | Quality/accessibility owner unassigned. **OPEN** | Execute the approved manual matrix on the exact release, enter every defect here with severity, remediate release blockers, and retest with named tester, browser/assistive-technology versions, date, and artifacts. |
| `OPS-EVID-001` | Recovery evidence gap / **High** | The exact-v8 local synthetic logical recovery exercise passed 10 migrations and 2 tenants (snapshot SHA-256 `34d14d9992bdae8b24d4504680f71ed00f5af2171152583fc40909ca89fd7a54`), but no controlled hosted D1/R2 restore or exact application rollback has been exercised. Provider durability is not treated as restore evidence. | Owner-only operation; recovery procedures exist; media upload is disabled. | Backup/recovery and release operators unassigned. **OPEN** | Complete [rollback and schema compatibility](ROLLBACK_SCHEMA_COMPATIBILITY.md), take a provider recovery point, exercise rollback separately from restore, measure RPO/RTO, verify tenant/capability/consent/audit integrity, and attach results. |
| `OPS-EVID-002` | Operational evidence gap / **High for paid operation; Medium while billing-disabled owner-only** | Packaged scheduling and local heartbeat tests exist, but exact-v8 hosted scheduled invocation, authenticated deep health, alert delivery, cost monitoring, and staffed response have not been demonstrated. Deep readiness is intentionally degraded because required consent and privacy-operator configuration is absent. | Checkout is disabled, consent and operator boundaries fail closed, and hosted scheduling is not relied on for current owner-only operation. | Operations/billing owners unassigned. **OPEN** | Resolve exact consent/operator owner decisions and configuration, then observe scheduled invocation and operational health in the exact environment; trigger privacy-safe test alerts; record receipt, escalation, response time, cost view, and corrective action. |
| `BILL-EVID-001` | External/owner dependency / **High for paid operation** | No approved offer, Product/Price, tax/refund/failure/cancel/pause policy, live credentials, publicly reachable signed webhook, or controlled real reconciliation/transaction evidence exists. | `BILLING_CHECKOUT_ENABLED=false`; production Stripe variables are absent from the recorded release. | Aaron plus billing operator, currently unassigned. **OPEN** | Record `OWNER-COMM-001` and `OWNER-PROD-001`; provision exact authorized configuration; pass Stripe test-mode failure/replay/order/recovery tests and one explicitly authorized controlled live exercise before enabling Checkout. |
| `PRIV-EVID-001` | Owner/external dependency / **High before real-user public operation** | Exact privacy notice, consent-policy registry entries, retention/deletion/backup-expiry schedule, instructor authority for golfer data, privacy-operator authority/configuration, contracting entity, contacts, and qualified Canadian review are absent. | Synthetic/owner-controlled use only; required consent and privacy-operator configuration fails closed; media is disabled; deletion is represented as a review request rather than completed deletion. | Aaron, privacy lead, and qualified reviewer; assignments unresolved. **OPEN** | Record `OWNER-OPS-001`, `OWNER-PRIV-001`, and `OWNER-MEDIA-001`; map versioned copy/policy to behavior and operator workflows; complete qualified review and deployed conformance check. |
| `VAL-EVID-001` | Real-world evidence gap / **High for full-live acceptance** | No authorized real instructor/golfer critical journey, unassisted activation result, support-burden record, or approved measurement protocol exists. | No demand, usability, price, retention, seasonality, or outcome claim is made from simulation. | Aaron and validation owner, currently unassigned. **OPEN** | Approve [the measurement packet](OWNER_MEASUREMENT_ACCEPTANCE_PACKET.md) and `OWNER-VALIDATION-001`; run the bounded adults-only protocol with approved consent/policy and record assistance/confounders. |
| `ACCEPT-001` | Owner decision / **Not applicable** | Aaron has not accepted an exact release, operating scope, configuration, policies, owners, or residual risks. | Deployment is described as an owner-only candidate, not an accepted public V1. | Aaron. **OPEN** | Complete the quality and risk packets, attach all exact-release evidence, then record `OWNER-ACCEPT-001` with date, scope, conditions, owners, and revisit triggers. |

## Retest log

Add one row per attempt; never replace a failed result with a later pass.

| Finding ID | Date/time and tester | Exact release / environment | Method and scope | Result | Evidence location | Follow-up |
|---|---|---|---|---|---|---|
| `SEC-003` | 2026-08-08; automated release workflow | Sites version 8; commit `cf117fef8ea42272d0b7e2358fe4197c024f86a7`; environment revision `10`; private deployment `appgdep_6a775b172534819196391fd626e95aa3` | Fresh post-commit build; value-safe artifact scan (49 files, two expected server-manifest copies, zero unexpected copies/paths, production prerender binding false); exact archive verification (gzip SHA-256 `99d615410c2e145e77938f0c5df4449ab8aeb4a544a5c5949fcdafa56a8e1378`, 10 migrations); private deployment; four signed-out containment probes | **PASS — CLOSED** for the build-generated prerender credential boundary. Signed-out probes to `/`, `/app`, `/api/health`, and `/api/operations/health` each returned `401`. | Exact version/archive/deployment identifiers in this ledger and [release evidence](RELEASE_EVIDENCE.md) | Keep version 7 superseded; reopen on a listed trigger. `SEC-001` remains independently contained/open pending `OWNER-SEC-001` rotation and proof. |

For closure, update the original row's status but preserve every retest row. Link the
exact command or manual protocol, immutable release identifier, environment,
expected and actual result, limitations, and reviewer. A release with any open
Critical finding, any un-dispositioned High finding applicable to its operating
scope, or an unapproved material residual risk is not accepted production evidence.
