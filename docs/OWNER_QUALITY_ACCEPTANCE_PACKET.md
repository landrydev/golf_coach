# Owner quality acceptance packet

**Status:** `[OWNER INPUT REQUIRED]`; blank decision packet, not approval
**Purpose:** Bind one immutable release to the quality evidence Aaron reviewed
**Related:** [Findings and retests](FINDINGS_RETEST_LEDGER.md),
[rollback/schema record](ROLLBACK_SCHEMA_COMPATIBILITY.md),
[release evidence](RELEASE_EVIDENCE.md), and
[owner release decisions](OWNER_RELEASE_DECISIONS_REQUIRED.md)

Owner approval cannot convert an unrun test, missing qualified review, unavailable
provider behavior, or unobserved real-user result into evidence. Complete every field
for the exact candidate; inherited predecessor evidence must stay labelled historical.

## Exact candidate identity

| Field | Required value |
|---|---|
| Candidate / source commit / runtime release ID | `[attach]` |
| Archive and source-package SHA-256 | `[attach]` |
| Sites project, saved version, deployment, environment revision | `[attach]` |
| Authorized URL and access policy | `[attach]` |
| D1 migration journal and compatibility class | `[attach]` |
| Non-secret configuration and binding baseline | `[attach]` |
| Policy/copy/design versions | `[attach]` |
| Review date, observation window, reviewers | `[attach]` |

## Quality evidence disposition

| Area | Required evidence | Current disposition |
|---|---|---|
| Automated candidate | Clean install; lint; strict types; production build; complete tests; migration generation/parity; release-integrity and production dependency audit | Attach exact-release command outputs, counts, limitations, hashes |
| Security/privacy | Tenant/capability/input/session/CSRF/billing-webhook/abuse tests; deployed headers/log sampling; secret/config review; qualified policy review | Hosted identity, credential rotation, policy/legal and log evidence remain open |
| Accessibility/content | Exact-release responsive captures plus keyboard, focus, screen-reader, forced-colour, zoom, reduced-motion, long-content, browser and truthful-copy review | Manual exact-release review remains open |
| Critical journeys | Public, SIWC, instructor setup/return, golfer authoring/share/revoke, living updates, external handoff, data requests, error/recovery | Authenticated hosted and authorized real-account journeys remain open |
| Billing | Test-mode Checkout/Portal/webhook ordering/replay/failure/recovery; exact offer/configuration; controlled authorized live exercise if paid | Checkout is disabled; commercial/provider evidence remains open |
| Resilience/operations | Capacity/failure paths, telemetry/audit, alert delivery, scheduler, incident/support/cost drills | Hosted exercises and named operators remain open |
| Recovery/release | Exact rollback target, schema compatibility, D1/R2 restore with integrity and measured RPO/RTO | Procedures/local synthetic evidence exist; hosted exercise remains open |
| Findings | No open Critical item; every applicable release-blocking finding closed; every residual risk linked to a dated decision | See active [ledger](FINDINGS_RETEST_LEDGER.md) |

## Viable decisions

1. **Accept quality for an exact bounded operating scope** only after every applicable
   release-blocking row passes and residual risks are separately accepted.
2. **Require changes or retests** with exact finding IDs and keep the candidate
   owner-only/non-commercial.
3. **Reject the candidate** and identify the safe rollback/next candidate.

**Recommendation:** choice 1 only when the evidence table is complete, `SEC-001` is
closed, no applicable Critical/High release finding remains open, manual and hosted
checks pass, and [the risk packet](OWNER_RESIDUAL_RISK_ACCEPTANCE_PACKET.md) contains
no missing owner/date/trigger. Until then, choose 2.

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
unauthorized, and the production-completion goal open. `OWNER-QUALITY-001` is not
`OWNER-ACCEPT-001`; final acceptance still needs the complete operating, policy,
risk, measurement, and exact-release record.
