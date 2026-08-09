# Owner quality acceptance packet

**Status:** `[OWNER INPUT REQUIRED]`; blank decision packet, not approval
**Purpose:** Bind one immutable release to the quality evidence Aaron reviewed
**Related:** [Findings and retests](FINDINGS_RETEST_LEDGER.md),
[rollback/schema record](ROLLBACK_SCHEMA_COMPATIBILITY.md),
[release evidence](RELEASE_EVIDENCE.md),
[exact-v15 release evidence](release-evidence/ROADMAP-SITES-V15-2026-08-09.md),
[exact-v13 local exercises](release-evidence/ROADMAP-SITES-V13-2026-08-09-LOCAL-EXERCISES.md), and
[owner release decisions](OWNER_RELEASE_DECISIONS_REQUIRED.md)

Owner approval cannot convert an unrun test, missing qualified review, unavailable
provider behavior, or unobserved real-user result into evidence. Complete every field
for the exact candidate; inherited predecessor evidence must stay labelled historical.

## Exact candidate identity

| Field | Recorded current value / remaining input |
|---|---|
| Candidate / source commit / runtime release ID | Sites version 15 / `8a359398099ab9b970df1d28eb3473dcbcd6207f` |
| Archive and source-package SHA-256 | Local gzip `f987afcd00f9151e4c1a698fdf7aeb06fe8d275ec778494bb7dd38f535406a31` (3,047,495 bytes; 63 entries/51 files; 11 migrations); Sites content `sha256:880189d7d59994b0c72fd34c9c206b2f37328096dea41c2ebd7b4fdf9d6775ad` (51 files; 7,270,400 bytes) |
| Sites project, saved version, deployment, environment revision | Project `appgprj_6a76957326fc819196ebf3a0c95f1ec3`; saved version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_085298ff9b9c819193d48e0df7a71631`; deployment `appgdep_6a7810bf6fc08191b2cb9bfb081e58c2`; revision `17`; final status `succeeded`, provider `updated_at` `2026-08-09T05:31:58.490796Z` |
| Authorized URL and access policy | Owner-only at `https://roadmap-golf-coaching.aar-landry.chatgpt.site`; Sites policy `custom` revision 1 with one owner, zero groups, and zero external visitors; no public-access approval |
| Current v15 credential scope | `OWNER-SEC-001` remains historically complete. No bypass was generated, rotated, read, displayed, persisted, or used for version 15. |
| Provider log privacy | `LOG-PRIV-001` is open. Three post-success provider fetch events remained visible despite all packaged observability/log-persistence switches being configured off. The query surface returned redaction markers for cookie/SIWC identity fields, while network-IP and request-signature fields remained nonempty/not redaction markers; collection/storage disposition behind the markers is unknown. Connector/tool processing was transient; no raw field value was surfaced in the transcript or written to the repository. Public and controlled-real-user acceptance are ineligible while this provider-enforcement failure remains open. |
| Credential remediation | Historical `OWNER-SEC-001` authorization completed on 2026-08-08. One value-safe project-level Sites rotation succeeded and invalidated the exposed prior bypass value; the replacement was not displayed, persisted, or used. No bypass was generated, read, or used for version 15. Signed-out containment passed, but a normal signed-in owner retest remains missing, so `SEC-001` is **REMEDIATED — RETEST PENDING**, not closed. The separate hosted provider-log retest ran and failed under `LOG-PRIV-001`. See the historical [rotation evidence](release-evidence/ROADMAP-SITES-V9-2026-08-08-sec001-rotation.md). |
| D1 migration journal and compatibility class | `0000` through `0010_steep_hemingway`. Version-15-to-14/13 application/schema compatibility is class `N`; only packaged observability configuration changed. Neither predecessor resolves `LOG-PRIV-001`, so rollback is not a privacy remediation. Historical version-13-to-12, v12-to-v11, and v11-to-v10 class-`B` boundaries remain recorded. Hosted rollback is untested. |
| Non-secret configuration and binding baseline | Environment revision `17` retains `INSTRUCTOR_ACCESS_MODE=owner_private`, `BILLING_CHECKOUT_ENABLED=false`, and `APPLICATION_WRITE_MODE=enabled`; packaged observability/log-persistence disablement is fully configured. Provider events persisted despite that configuration. Exact owner-approved consent-policy content/version and privacy-operator access configuration are absent, so deep readiness is intentionally degraded; field-level owner review remains `[attach]` |
| Policy/copy/design versions | `[attach]`; privacy/legal, commercial, and exact-release decisions remain open |
| Review date, observation window, reviewers | Automated/local and bounded hosted evidence dated through 2026-08-09; no owner quality review, named manual tester, or staffed hosted observation window is recorded |

Sites versions 6 through 14 remain historical predecessor evidence and are not
silently carried forward as exact-version-15 quality evidence. Version-9 responsive
captures remain historical renderer/layout evidence only; they do not cover
version-15 recovery/share/profile interactions, CSP, headers, authentication, or
other security behavior.

### Exact version-15 normalized-reproducibility control

Exact commit `8a359398099ab9b970df1d28eb3473dcbcd6207f` is the candidate identified
above. Two distinct detached clean checkouts each completed the locked
501-package install with the same five install scripts blocked and passed 333/333
verification with no failures, skips, or todos. Their 51-file inventories matched;
strict comparison found three expected generated raw differences and zero normalized
differences. A separate exact-version-15 release-integrity run covered 299 files
with zero findings, and a fresh exact-version-15 production audit reported zero
vulnerabilities. The
[version-15 record](release-evidence/ROADMAP-SITES-V15-2026-08-09.md) preserves
the historical version-12, version-11, and earlier release evidence and the
version-9 byte-rebuild failure. The control does not make version 15 public or
accepted.

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
is relabelled as exact-version-15 evidence. Neither proves hosted backup/restore,
rollback/forward-fix, scheduler operation, alerting,
named-operator readiness, public operation, real-user behavior, or acceptance.
Historical v12 release and v11 local-exercise records remain predecessor evidence.

## Quality evidence disposition

| Area | Required evidence | Current disposition |
|---|---|---|
| Automated candidate | Clean install; lint; strict types; production build; complete tests; migration generation/parity; release-integrity and production dependency audit | Both exact-version-15 clean installs contained 501 packages with the same five blocked install scripts and passed 333/333 verification with no failures, skips, or todos. Exact archive verification passed with 63 entries/51 files and all 11 migrations. Two exact-commit builds had three expected generated raw differences and zero normalized differences. A separate exact-v15 release-integrity run covered 299 files with zero findings, and a fresh exact-v15 production audit reported zero vulnerabilities. Historical v13/v12/v11 and earlier evidence remains unchanged. |
| Provider log privacy | Packaged log minimization must be enforced by the host before public or controlled-real-user use | **FAILED / OPEN `LOG-PRIV-001`.** Version 15 configured observability, custom-log collection, and automatic invocation-log persistence off, yet three post-success fetch events remained available. The query surface returned redaction markers for cookie/SIWC identity fields, while network-IP and request-signature fields were nonempty/not redaction markers; collection/storage disposition behind the markers is unknown. Connector/tool processing was transient; no raw field value was surfaced in the transcript or written to the repository. Version 14 failed similarly. Application/schema rollback to v14 or v13 is class `N`, but neither target resolves this provider failure. |
| Current security regression | Exact-candidate automated security and privacy regression | Exact-version-15 verification passed 333/333 in both clean builds, carrying forward the version-13 product/security behavior and adding packaged observability assertions. This is source/build evidence only and cannot override the failed hosted provider-log retest. |
| Security/privacy | Tenant/capability/input/session/CSRF/consent/operator/billing-webhook/abuse tests; deployed headers/log sampling; secret/config review; qualified policy review | Exact-version-15 automated verification passed 333/333 in both clean builds, carrying forward the version-13 product/security behavior and adding packaged observability assertions. Historical `OWNER-SEC-001` remains complete; no bypass was generated, read, or used. Four exact-version-15 signed-out routes returned `401` with `no-store` and `no-referrer`. No signed-in owner browser or authenticated hosted write exercise occurred. `SEC-001` is **REMEDIATED — RETEST PENDING** and `SEC-002` is **REMEDIATED — HOSTED RETEST PENDING**, neither closed. The hosted provider-log sample failed: `LOG-PRIV-001` remains High/open because network-IP and request-signature metadata persisted despite all packaged logging switches being configured off. Exact owner-approved consent policy/operator configuration and qualified policy/legal review also remain open. |
| Accessibility/content | Exact-release responsive captures plus keyboard, focus, screen-reader, forced-colour, zoom, reduced-motion, long-content, browser and truthful-copy review | Nine version-9 local synthetic Chrome captures remain historical renderer/layout evidence only. They are not relabelled as exact-v15 evidence. Exact-v15 browser review, keyboard, screen reader, forced colour, real browser zoom, reduced motion, long-content interaction, supported-browser/device, and human review remain open. |
| Critical journeys | Public, SIWC, instructor setup/return, consent grant/withdrawal, golfer authoring/share/revoke, living updates, external handoff, data requests/operator boundary, error/recovery | Exact-version-15 signed-out `/`, `/app`, `/r`, and `/api/health` requests each received outer-policy `401` with `no-store`/`no-referrer`. Automated coverage exercises bounded ambiguous-mutation/draft recovery, stale-tab and request-ownership fences, strict compare-and-swap behavior, share revoke/reissue, write-bound receipts, and inherited golfer-response idempotency. These are not hosted signed-in journeys. Normal signed-in owner, nonce-CSP, mounted interruption/reload, authenticated write-mode, and real-account journeys remain open. Deep readiness intentionally remains degraded until exact consent/operator configuration exists. |
| Billing | Test-mode Checkout/Portal/webhook ordering/replay/failure/recovery; exact offer/configuration; controlled authorized live exercise if paid | Checkout is disabled; commercial/provider evidence remains open |
| Resilience/operations | Capacity/failure paths, telemetry/audit, alert delivery, scheduler, incident/support/cost drills | The historical exact-v13 bounded local capacity exercise completed 54 requests at maximum concurrency four with zero failures; it is not relabelled as exact-v15 or hosted evidence. Version 15's packaged logging opt-out was not enforced by the provider. Hosted scheduler/trigger provisioning, privacy-safe log completeness, alert delivery, cost, incident/support drills, and named operators remain open. |
| Recovery/release | Exact rollback target, schema compatibility, D1/R2 restore with integrity and measured RPO/RTO | Immutable v15/v14/v13 and earlier artifacts are registered or linked. V15-to-v14/v13 is class `N` for application/schema behavior because only observability configuration changed, but neither rollback resolves `LOG-PRIV-001`. Historical v13-to-v12 remains class `B`. The exact-v13 local recovery exercise remains historical predecessor evidence and is not relabelled as v15. Hosted/provider-native backup/restore, rollback/forward-fix, deletion recovery, alert delivery, named-operator execution, and measured RPO/RTO remain absent. |
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
