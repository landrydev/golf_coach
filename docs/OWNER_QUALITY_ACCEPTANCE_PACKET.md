# Owner quality acceptance packet

**Status:** `[OWNER INPUT REQUIRED]`; blank decision packet, not approval
**Purpose:** Bind one immutable release to the quality evidence Aaron reviewed
**Related:** [Findings and retests](FINDINGS_RETEST_LEDGER.md),
[rollback/schema record](ROLLBACK_SCHEMA_COMPATIBILITY.md),
[release evidence](RELEASE_EVIDENCE.md),
 [historical exact-v15 release evidence](release-evidence/ROADMAP-SITES-V15-2026-08-09.md),
[exact-v13 local exercises](release-evidence/ROADMAP-SITES-V13-2026-08-09-LOCAL-EXERCISES.md), and
[owner release decisions](OWNER_RELEASE_DECISIONS_REQUIRED.md)

Owner approval cannot convert an unrun test, missing qualified review, unavailable
provider behavior, or unobserved real-user result into evidence. Complete every field
for the exact candidate; inherited predecessor evidence must stay labelled historical.

## Exact candidate identity

| Field | Recorded current value / remaining input |
|---|---|
| Candidate / source commit / runtime release ID | Sites version 16 / `91f37ebd542774779f6db7e000832c2f6714e528` |
| Archive and source-package SHA-256 | Local gzip `9119a848bb8b4c7fff1d810280cf845ec44366449adac3176fd35d8c24438fe6` (3,052,294 bytes; 51 files; 11 migrations); Sites content `sha256:752f05fd957f8f4b043b5955d9cdbdbf2176b0f1f3414827c9c3e8d0f44f6e2c` (51 files; 7,290,880 bytes) |
| Sites project, saved version, deployment, environment revision | Project `appgprj_6a76957326fc819196ebf3a0c95f1ec3`; saved version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_0a4d7dc3d8108191aa4a1b3e14051a96`; deployment `appgdep_6a7826b2f4c481919cc85665dffa2391`; revision `18`; final status `succeeded` at `2026-08-09T07:05:36.176024Z` |
| Authorized URL and access policy | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site`; Sites policy `custom` revision 1 with one owner, zero groups, and zero external visitors; no public-access approval |
| Current v16 credential scope | `OWNER-SEC-001` remains historically complete. No bypass operation or use occurred for version 16. |
| Provider log privacy | `LOG-PRIV-001` is High/open before any real-user or public operation. V15 remains the latest failed provider sample: three fetch events remained visible despite all switches being off, with nonempty network-IP/request-signature fields and unknown collection/storage disposition. No v16 query was run because controls were unchanged and extra processing could not close the gap. No raw value is reproduced here. |
| Credential remediation | Historical `OWNER-SEC-001` completed on 2026-08-08; the exposed prior value was provider-invalidated and the replacement was never displayed, persisted, or used. No bypass operation/use occurred for v16. `SEC-001` remains **REMEDIATED — RETEST PENDING** because normal signed-in owner evidence is absent. |
| D1 migration journal and compatibility | `0000` through `0010_steep_hemingway`. V16 adds application security/recovery/readiness hardening without a new migration. Do not assume v16-to-v15 is an approved ordinary rollback because that removes those controls. Neither v15 nor earlier resolves `LOG-PRIV-001`; hosted rollback remains untested. |
| Non-secret configuration and binding baseline | Revision `18` retains `INSTRUCTOR_ACCESS_MODE=owner_private`, `BILLING_CHECKOUT_ENABLED=false`, and `APPLICATION_WRITE_MODE=enabled`; exact `RELEASE_ID` and four retained secrets are applied. Consent-policy and privacy-operator configuration remain absent, so deep readiness intentionally degrades. |
| Policy/copy/design versions | `[attach]`; privacy/legal, commercial, and exact-release decisions remain open |
| Review date, observation window, reviewers | Automated/local and bounded hosted evidence dated through 2026-08-09; no owner quality review, named manual tester, or staffed hosted observation window is recorded |

Sites versions 6 through 15 remain historical predecessor evidence and are not
silently carried forward as exact-version-16 quality evidence. Version-9 responsive
captures remain historical renderer/layout evidence only; they do not cover
version-16 recovery/share/profile interactions, CSP, headers, authentication, or
other security behavior.

### Exact version-16 normalized-reproducibility and hardening control

Exact commit `91f37ebd542774779f6db7e000832c2f6714e528` is the candidate above. Two
detached clean worktrees each passed 346/346. Their 51-file inventories matched;
strict comparison found three allowlisted generated raw differences and zero
normalized differences. Release integrity covered 304 files with zero findings,
and the production audit reported zero vulnerabilities.

V16 limits generic private/no-store HTML failures to true top-level documents and
keeps JSON for API/RSC/route-handler/assets/programmatic clients while preserving
CSP nonce/security/redirect ordering. Request references are UUIDv4-only. Keyed-
attempt v2 fixes the 24-hour lifecycle, retires v1, fences future clocks, enforces
exact-owner removal and mount/submit expiry in five flows, and never auto-replays.
Deep readiness validates the exact migration-`0010` rate-limit schema/index/scopes;
scheduler health uses a 13-account capped sample with lower-bound backlog and
fail-closed assessment behavior. These controls do not make v16 public or accepted.

### Exact version-16 local synthetic exercises

The v16 recovery exercise restored all 31/31 application tables and synthetic
D1/R2 inventory, booted the exact built Worker, authenticated profile, package,
and workspace reads, and produced the expected scheduler-failed operations-health
result after interrupted work was normalized. The capacity exercise completed 54
requests with zero failures. These are local-only results, not hosted restore,
provider backup, RPO/RTO, performance-target, scheduler, or alert evidence.

### Historical exact version-13 local synthetic exercises

The [canonical v13 exercise record](release-evidence/ROADMAP-SITES-V13-2026-08-09-LOCAL-EXERCISES.md)
binds the disposable local recovery and bounded-capacity runs to exact source/runtime
commit `f3482845a42730e87f4ff1190550511f19ea6ad5`. Recovery passed across all 11
migrations and 31/31 application tables, two synthetic tenants, and three
R2-compatible objects totalling 199 bytes. It matched the 34,380-byte D1 snapshot
SHA-256 `8eaef0372bf2e4457ab651ec5c7bb3e3b22a51289495187761622fede0a1b139`,
detected three negative integrity scenarios, and passed environment-isolation
checks. Its 104,421 ms local wall-clock duration is not an RTO and the synthetic
snapshot is not RPO evidence.

The bounded-capacity exercise completed 54 requests at maximum concurrency four
with 44 `200`, ten `201`, zero failures, and local p50/p95/maximum observations of
46.60/103.30/103.62 ms. Those observations are not approved performance targets,
an SLO/SLA, sustained-load or soak evidence, or hosted capacity. Neither exercise
is relabelled as exact-version-16 evidence. Neither proves hosted backup/restore,
rollback/forward-fix, scheduler operation, alerting,
named-operator readiness, public operation, real-user behavior, or acceptance.
Historical v12 release and v11 local-exercise records remain predecessor evidence.

## Quality evidence disposition

| Area | Required evidence | Current disposition |
|---|---|---|
| Automated candidate | Clean install; lint; strict types; production build; complete tests; migration generation/parity; release-integrity and production dependency audit | Both exact-v16 clean worktrees passed 346/346. Each build had 51 files; comparison found three allowlisted generated raw differences and zero normalized differences. Exact archive verification covered all 11 migrations. Release integrity covered 304 files with zero findings, and the production audit reported zero vulnerabilities. |
| Provider log privacy | Packaged log minimization must be enforced by the host before public or controlled-real-user use | **FAILED / OPEN `LOG-PRIV-001`.** V15 configured all three packaged switches off, yet three post-success fetch events remained available with nonempty network-IP/request-signature fields and unknown collection/storage disposition. V16 retains the same settings; no v16 query was run because extra processing could not close the gap. No raw value is reproduced. Rollback does not resolve this provider failure. |
| Current security regression | Exact-candidate automated security and privacy regression | Exact-v16 verification passed 346/346 in both clean builds. Document-aware failure media, UUIDv4-only request references, keyed-attempt-v2 lifecycle/ownership/expiry, exact migration readiness, and capped scheduler-health behavior passed locally. This cannot override missing hosted evidence or the v15 provider-log failure. |
| Security/privacy | Tenant/capability/input/session/CSRF/consent/operator/billing-webhook/abuse tests; deployed headers/log sampling; secret/config review; qualified policy review | Exact-v16 automated verification passed 346/346. `OWNER-SEC-001` remains historically complete; no bypass operation/use occurred. Four signed-out routes returned `401`/`no-store`/`no-referrer`. `SEC-001` is **REMEDIATED — RETEST PENDING**, `SEC-002` is **REMEDIATED — HOSTED RETEST PENDING**, and `AUTH-EVID-001` remains open. `LOG-PRIV-001` remains High/open; no v16 provider-log query was run. Consent/operator configuration and qualified review remain open. |
| Accessibility/content | Exact-release responsive captures plus keyboard, focus, screen-reader, forced-colour, zoom, reduced-motion, long-content, browser and truthful-copy review | Nine version-9 captures remain historical renderer/layout evidence only. Exact-v16 manual browser, keyboard, screen reader, forced colour, zoom, reduced motion, long-content, supported-browser/device, and human review remain open. |
| Critical journeys | Public, SIWC, instructor setup/return, consent grant/withdrawal, golfer authoring/share/revoke, living updates, external handoff, data requests/operator boundary, error/recovery | Exact-v16 signed-out `/`, `/app`, `/r`, and `/api/health` received outer-policy `401`/`no-store`/`no-referrer`. Automated coverage includes the v16 document/API failure boundary and keyed-attempt-v2 recovery controls. These are not hosted signed-in journeys. Normal signed-in owner, nonce CSP, mounted interruption/reload, authenticated write mode, and real-account journeys remain open. |
| Billing | Test-mode Checkout/Portal/webhook ordering/replay/failure/recovery; exact offer/configuration; controlled authorized live exercise if paid | Checkout is disabled; commercial/provider evidence remains open |
| Resilience/operations | Capacity/failure paths, telemetry/audit, alert delivery, scheduler, incident/support/cost drills | Exact-v16 local capacity completed 54 requests with zero failures. Deep readiness and capped scheduler-backlog behavior passed locally. This is not hosted capacity/scheduler/alert evidence. V15's log opt-out remained unenforced, and no v16 log query was run. |
| Recovery/release | Exact rollback target, schema compatibility, D1/R2 restore with integrity and measured RPO/RTO | Exact-v16 local recovery restored 31/31 tables and synthetic D1/R2 inventory and booted the exact Worker with authenticated profile/package/workspace reads plus expected scheduler-failed health. It is not hosted/provider-native restore, RPO/RTO, rollback/forward-fix, or alert evidence. V16-to-v15 ordinary rollback is not approved because it removes v16 hardening. |
| Findings | No open Critical item; every applicable release-blocking finding closed; every residual risk linked to a dated decision | See active [ledger](FINDINGS_RETEST_LEDGER.md) |

## Viable decisions

1. **Accept quality for an exact bounded operating scope** only after every applicable
   release-blocking row passes and residual risks are separately accepted.
2. **Require changes or retests** with exact finding IDs and keep the candidate
   owner-only/non-commercial.
3. **Reject the candidate** and identify the safe rollback/next candidate.

**Recommendation:** choice 1 only when the evidence table is complete, the required
`SEC-001` and `SEC-002` hosted retests pass, no applicable Critical/High release
finding remains open, `LOG-PRIV-001` is remediated and passes a provider retest,
manual and hosted checks pass, and
[the risk packet](OWNER_RESIDUAL_RISK_ACCEPTANCE_PACKET.md) contains no missing
owner/date/trigger. Until then, choose 2.

## Exact proposed decision wording

> `OWNER-QUALITY-001`: I reviewed Roadmap candidate **[candidate]**, source commit
> **[commit]**, archive **[hash]**, saved Sites version/deployment **[IDs]**, environment
> revision **[revision]**, migration state **[state]**, and evidence packet **[version]**
> on **[date]**. I **[accept / require changes / reject]** its quality for
> **[owner-only / controlled adults-only / public]** operation. Passed evidence is
> **[exact list]**. Failed, missing, or limited evidence is **[exact list and finding
> IDs]**. Required action/retest is **[action, owner, due date]**. This decision does
> not approve pricing, billing, retention/legal terms, real-user activity, residual
> risks, or final release acceptance unless those exact decisions are separately
> identified.

## Consequence of deferral

Engineering and owner-only evidence work continue under `AUTH-005`. Keep access
owner-only, Checkout disabled, media absent, real-user/customer activity
unauthorized while `LOG-PRIV-001` remains open, and the production-completion goal
open. `OWNER-QUALITY-001` is not
`OWNER-ACCEPT-001`; final acceptance still needs the complete operating, policy,
risk, measurement, and exact-release record.
