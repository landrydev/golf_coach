# Roadmap V1 owner release decisions

**Prepared:** 2026-08-07
**Authority:** `AUTH-005`
**Status:** exact owner and external operating inputs required for a paid public release; these are dependencies, not reinstated design gates

The application fails closed where the decisions below are absent: Sites access
remains owner-only, new Stripe Checkout sessions remain disabled, media upload is
absent, deletion remains an identity-verified request, and working legal/support
copy does not claim a staffed public service.

## Decision order and readiness

| Decision | Current state | Why |
|---|---|---|
| `OWNER-SEC-001` credential containment | **HISTORICAL AUTHORIZATION COMPLETE 2026-08-08; `SEC-001` RETEST PENDING** | Aaron authorized the completed rotation; the provider-invalidated prior value and unchanged owner-only policy are evidenced, while normal signed-in owner retesting remains missing. The separate hosted log retest failed under `LOG-PRIV-001`. |
| `OWNER-SCOPE-001` product/design/content baseline | **READY FOR REVIEW** | Exact version 15 owner-only candidate and evidence records exist; Aaron may approve, modify, or reject the bounded baseline |
| `OWNER-OPS-001` operators and contacts | **PREREQUISITE MISSING** | Names, entity, routes, and public contacts must be supplied |
| `OWNER-COMM-001` offer and consequences | **PREREQUISITE MISSING** | Exact policy and Stripe Product/Price are not supplied or validated |
| `OWNER-PRIV-001` privacy and retention | **PREREQUISITE MISSING** | Versioned policy and qualified Canadian review do not exist |
| `OWNER-MEDIA-001` text-first exclusion | **READY FOR DECISION** | Exclusion matches the implemented fail-closed state |
| `OWNER-PROD-001` origin/providers/access | **PREREQUISITE MISSING; `LOG-PRIV-001` OPEN** | Origin, accounts, access scope, budgets, and provider evidence are unresolved; Sites ignored both v14 and v15 packaged invocation-log controls |
| `OWNER-VALIDATION-001` controlled real operation | **INELIGIBLE WHILE `LOG-PRIV-001` IS OPEN** | Policy, consent, operators, participants, and any transaction limit must be exact, and provider log-privacy enforcement must pass first |
| `OWNER-ACCEPT-001` exact-release acceptance | **OWNER-ONLY REVIEW POSSIBLE; PUBLIC/REAL-USER INELIGIBLE** | The complete evidence packet and all applicable prerequisites must be attached; `LOG-PRIV-001` blocks public and controlled-real-user acceptance |

Owner approval cannot substitute for missing qualified review, hosted authentication
evidence, controlled billing evidence, manual accessibility review, real-user
results, restore/rollback/alert exercises, or provider enforcement of log-privacy
configuration. Those are facts to demonstrate, not facts to approve into existence.

## Recorded decision 0A — contain the exposed SIWC bypass credential

**Incident evidence:** a live Sites bypass credential was exposed in a private tool
transcript while inspecting the owner-only candidate. No credential value is
reproduced in repository evidence.

**Aaron's recorded authorization, 2026-08-08:**

> `OWNER-SEC-001`: rotate and revoke the exposed Sites bypass credential.

**Operation outcome:** one value-safe Sites rotation for project
`appgprj_6a76957326fc819196ebf3a0c95f1ec3` succeeded from
`2026-08-08T18:32:25.588Z` through `2026-08-08T18:32:31.831Z`. The connector contract
immediately invalidated the exposed prior value. Its replacement was not displayed,
persisted, copied, stored, or used. The Sites access policy remained `custom` revision
1 with one owner, zero groups, and zero external visitors. Fresh signed-out requests
to `/`, `/app`, `/api/health`, and `/api/operations/health` all returned `401` with
`no-store` and `no-referrer`. See the
[OWNER-SEC-001 rotation evidence](release-evidence/ROADMAP-SITES-V9-2026-08-08-sec001-rotation.md).

**Remaining retest:** the original value was intentionally not recovered or replayed.
A 15-minute post-operation Worker query returned zero events and is inconclusive for
credential leakage/redaction. No supported signed-in owner browser was mounted, so a
normal owner journey without a bypass header remains untested. `SEC-001` is
**REMEDIATED — RETEST PENDING**, not closed, and the broader SIWC matrix remains open
under `AUTH-EVID-001`. This record resolves only the rotation authorization; it does
not infer any other owner decision or authorize access expansion or release acceptance.

Aaron repeated the `OWNER-SEC-001` instruction during version-13 continuation.
Because the authorized rotation/revocation had already completed, no second rotation
was performed and no replacement credential was generated, read, displayed,
persisted, or used. Exact-v13 signed-out probes remained `401`; this preserves the
historical completion of the owner action and does not close `SEC-001`.

## Decision 0B — exact product, design, and content baseline

`[REAL-WORLD VALIDATION REQUIRED]` Selecting the bounded release baseline does not validate demand, usability, pricing, accessibility, coaching outcomes, or real-user comprehension.

**Current evidence:** exact owner-only Sites version 15 is pinned to
source/runtime release commit `8a359398099ab9b970df1d28eb3473dcbcd6207f`,
saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_085298ff9b9c819193d48e0df7a71631`,
and deployment `appgdep_6a7810bf6fc08191b2cb9bfb081e58c2`. Two detached
clean worktrees passed 333/333 verification; their 51-file comparison reported
three expected framework-generated raw differences and zero normalized
differences. The local archive has gzip SHA-256
`f987afcd00f9151e4c1a698fdf7aeb06fe8d275ec778494bb7dd38f535406a31`,
3,047,495 bytes, 63 entries/51 files, and all 11 migrations through
`0010_steep_hemingway`; the
provider package hash is
`sha256:880189d7d59994b0c72fd34c9c206b2f37328096dea41c2ebd7b4fdf9d6775ad`.
The integrated security review found no actionable Critical or High blocker in its
bounded source/package scope. The private deployment succeeded at environment
revision `17` at `2026-08-09T05:31:58.490796Z` with exact `RELEASE_ID`,
`APPLICATION_WRITE_MODE=enabled`,
`INSTRUCTOR_ACCESS_MODE=owner_private`, and
`BILLING_CHECKOUT_ENABLED=false`; four existing secrets were retained without
exposing their values. Fresh signed-out requests to `/`, `/app`, `/r`, and
`/api/health` returned `401` with `no-store`/`no-referrer`. No bypass bearer was generated, read, displayed,
persisted, or used. This is not public/paid launch, owner acceptance, real-user,
hosted signed-in, manual accessibility, scheduler/alert, backup/restore, or RTO/RPO
evidence. `SEC-002` is **REMEDIATED — HOSTED RETEST PENDING** and `SEC-001` is
**REMEDIATED — RETEST PENDING**. Deep readiness remains intentionally degraded
because exact owner-approved consent-policy content/version and privacy-operator
access configuration are absent.

`LOG-PRIV-001` is open. The exact version-15 package configured all observability
and log-persistence switches off, yet Sites returned three post-success fetch events;
the query surface returned redaction markers for cookie/SIWC identity fields, while
network-IP and request-signature fields were nonempty and not redaction markers.
Collection/storage disposition behind the markers is unknown. Connector/tool
processing was transient; no raw field value was surfaced in the transcript or
written to the repository. Version 14 also returned three invocation
events with `invocation_logs=false`. Version-15-to-14/13 application/schema
compatibility is class `N`, but the provider ignores each packaged configuration,
so neither predecessor is a privacy remediation. Scope and media choices remain
reviewable owner decisions; public and controlled-real-user acceptance are
ineligible until this finding is remediated and retested.

**Historical immediate predecessors:** versions 14 and 13 retain their exact
release records. Version 13's local recovery/capacity exercise remains historical
exact-v13 evidence and is not relabelled as version 15.

**Historical predecessor evidence:** exact owner-only Sites version 12 was pinned to source/runtime release commit `7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c`, local archive gzip SHA-256 `994f725ba6c5952c45885a4d72d38804f1b10b8440273dc26ac8bd1c38d2bd75` (2,967,333 bytes; 61 entries/49 files; all 10 migrations), Sites archive content hash `sha256:0805c04e9dcd5e8bac77f58aec2362dece1754f6eec63ec73d9c2e249bb01700` (49 files; 6,748,160 bytes), saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_8868e09fcb28819181cfbebdf82ce73f`, deployment `appgdep_6a77c5c85974819185ce1c8caf13007c`, and environment revision 14. Final status was `succeeded` with provider `updated_at` `2026-08-09T00:12:04.939300+00:00`; four no-credential boundary probes returned `401`/`no-store`/`no-referrer`. Version-9 local synthetic Chrome captures remain renderer/layout-equivalent evidence for the unchanged UI/CSS only; they are not evidence of version-13 CSP, headers, authentication, response recovery, hosted behavior, or human accessibility acceptance.

The version-12 response control requires a safe operation key; derives HMAC receipts
from the account, resolved share session, and key; atomically commits one response
and audit per operation; returns `201` first, `200` on identical replay, and `409`
on changed input; and covers same-input/mixed-input races. The client applies a
10-second timeout and retains the key in per-tab `sessionStorage` only across an
ambiguous outcome/reload, clearing it after a definitive result or tab close. Raw
keys are never server-persisted or logged, and external handoffs use fresh keys.
This closes the v11 lost-ack duplicate risk locally; it is not hosted/manual or
real-user acceptance evidence.

Version 13 adds no-auto-replay mutation recovery with strict receipts; account-,
action-, and revision-scoped 24-hour/64-KiB/SHA-256 authoring drafts with explicit
restore and compare-and-swap clear; account/share/session-scoped golfer recovery;
lapsed-owner minimized link list/revoke, same-revision reissue, and lost-ack link
replacement with exact lifecycle receipts; strict profile page-version CAS and
write-bound receipts; independent `DELETE /r/session` close-abuse scopes through
migration `0010`; and a fail-closed application-write boundary at both edge and
scheduled entry points. These are exact local/package/deployed-code claims. The
hosted/manual validation tracked in `OPS-CONTAIN-001`, `CLIENT-RECOVERY-002`, and
`RESP-RECOVERY-002` remains pending.

**Historical exact version-12 supply-control evidence:** two distinct detached clean checkouts at
commit `7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c` each installed 501 locked packages
with the same five blocked install scripts and passed 242/242 verification. Their
49-file inventories matched; raw variation was limited to the three validated
framework-generated-value files and zero differences remained after strict
allowlisted normalization. `npm audit --omit=dev` reported zero vulnerabilities.
Release integrity inspected 261 source/evidence files with zero findings. The
version-12 release record preserves version 11 and earlier history and does not make
version 12 public or accepted. Its response durability is a security/behavior delta,
so rollback from version 12 to version 11 would reintroduce the lost-ack duplicate
response/audit risk and is a regression, not class `N`.

The [exact-v13 local exercise record](release-evidence/ROADMAP-SITES-V13-2026-08-09-LOCAL-EXERCISES.md)
records local synthetic recovery across all 11 migrations and 31/31 tables for two
tenants, three private objects, and three negative checks, plus a 54-request bounded
capacity run with zero failures. The 104,421 ms local recovery wall time is not an
RTO and snapshot age is not an RPO. It is not hosted/provider backup or restore,
deletion recovery, scheduler/alert, or production-capacity evidence.

The historical [exact-v11 local exercise record](release-evidence/ROADMAP-SITES-V11-2026-08-08-LOCAL-EXERCISES.md)
records predecessor local synthetic recovery across all ten migrations and 31/31 tables,
plus a 54-request bounded-capacity run with zero failures. It does not establish
exact-version-13 recovery, hosted restore, rollback, RPO/RTO, performance targets, operator readiness, or
public-release suitability.

**Viable choices:** approve the exact bounded baseline with recorded conditions, require specified modifications and a new candidate, or defer approval while owner-only engineering continues.

**Exact proposed decision wording:**

> `OWNER-SCOPE-001`: I approve the bounded Roadmap V1 baseline in [Requirements Traceability](REQUIREMENTS_TRACEABILITY.md) at commit **[commit]**, the exact rendered UI/content in release **[candidate/version]**, and all listed `EX-*` exclusions. V1 is Canada-wide, adults-only, single-instructor, coach-authored, and text-first. It includes the approved acquisition, instructor, package/external-action, golfer, roadmap, living-plan, sharing, data-request, and SaaS-account journeys. Media upload, juniors, teams/facilities, AI, native coach-package transactions, outbound messaging, marketplace, and milestone/referral features remain excluded. Conditions or required changes are **[exact list]**. This selects release scope and experience; it does not validate demand, usability, pricing, accessibility, or outcomes. Revisit on **[trigger/date]**.

**Consequence of deferral:** implementation and owner-only evidence work continue under `AUTH-005`, but no candidate may be described as the owner-approved product/design/content baseline.

## Decision 1 — accountable operator and public contacts

**Evidence:** the product currently has no approved contracting entity, public
privacy contact, staffed support address, incident escalation route, or named
day-to-day operators.

**Viable choices:**

1. Aaron personally owns each initial operating role and publishes dedicated
   business contact channels.
2. A named operating entity and other named people/providers own specific roles.
3. Keep the release owner-only while assignments are prepared.

**Recommendation:** choice 1 for a bounded initial launch, with one published
support/privacy address and an explicit escalation backup.

**Exact proposed decision wording:**

> `OWNER-OPS-001`: I approve **[legal/operating name]** as the Roadmap service
> operator. **[name]** owns release, support, privacy requests, billing, security
> incidents, backup/recovery, and dependency maintenance, except **[delegations]**.
> Publish **[support address]** and **[privacy address]**. Escalate urgent incidents
> through **[route]**. Review assignments on **[date]**.

**Consequence of deferral:** owner-only deployment can be exercised, but unattended
real-user operation and general public availability remain unsupported.

## Decision 2 — exact SaaS offer and account consequences

`[PRICING HYPOTHESIS — REQUIRES VALIDATION]` Planning amounts, trial, and seasonal
pause concepts are not approved prices or validated demand evidence.

**Evidence:** the Stripe boundary is implemented and tested locally, but no approved
Product/Price, live credentials, tax treatment, trial, refund terms, failed-payment
behavior, cancellation consequences, pause/resume behavior, or paid entitlement
policy is configured.

**Viable choices:**

1. One recurring Solo price with no trial or seasonal pause in the initial release.
2. A time-limited trial and/or pause option with exact consequences.
3. Keep Checkout disabled and run only an owner-controlled non-commercial release.

**Recommendation:** choice 1 for the smallest auditable billing lifecycle; validate
price separately and add pause only after policy and support evidence exist.

**Exact proposed decision wording:**

> `OWNER-COMM-001`: I approve Roadmap Solo at **CAD $[amount] every [interval]**,
> **[tax treatment]**, with **[trial/no trial]**. Cancellation takes effect **[when]**;
> refunds follow **[rule]**; failed payment causes **[access and data consequence]**;
> account data remains available for **[duration]** after paid access ends. Seasonal
> pause is **[excluded / exact approved behavior]**. Stripe Product **[id/name]** and
> Price **[id]** are the only approved live Checkout configuration. Review on
> **[date or evidence trigger]**.

**Consequence of deferral:** `BILLING_CHECKOUT_ENABLED=false` remains mandatory; no
charge or paid-self-serve claim is allowed.

## Decision 3 — privacy, retention, deletion, and golfer authority

**Evidence:** tenant isolation, private capabilities, correction, export, revocation,
archival, auditable deletion requests, immutable consent transitions, and the
bounded non-attesting privacy-operator queue/marker are implemented. Exact
`golfer_record` and `roadmap_sharing` purpose text/version, privacy-operator identity
and access configuration, notices, roles, retention periods, deletion exceptions,
backup expiry, and the instructor's required basis for adult golfer records still
need Aaron's decision and qualified review. Their absence intentionally degrades
deep readiness.

**Viable choices:**

1. Approve a category-by-category schedule after Canadian privacy/legal review.
2. Approve a short conservative interim schedule with counsel review before public use.
3. Keep all use synthetic/owner-controlled.

**Recommendation:** choice 1. Record separate periods for active product data,
archived/cancelled accounts, capability/audit records, exports, operational logs,
Stripe references, D1 recovery points, and R2 objects; do not use one blanket period.

**Exact proposed decision wording:**

> `OWNER-PRIV-001`: I approve privacy notice **[version]**, terms **[version]**, and
> the data schedule in **[artifact/version]** after review by **[qualified reviewer]**.
> I approve exact purpose text/version **[golfer_record values]** for the account grant
> and **[roadmap_sharing values]** for each golfer grant. Instructors must attest
> **[exact authority/notice requirement]** before entering an adult golfer record and
> **[exact sharing requirement]** before publishing. Privacy-operator access is limited
> to **[named role/identity configuration]**. Access, correction, withdrawal, export,
> deletion, exceptions, backup expiry, and incident notification follow **[versioned
> procedure]**. Review on **[date]**.

**Consequence of deferral:** only controlled private operation is supportable; deep
readiness remains degraded, consent-gated journeys remain fail-closed, privacy-
operator access remains unconfigured, and destructive deletion cannot be represented
as immediate or automatic.

## Decision 4 — media

`[REAL-WORLD VALIDATION REQUIRED]` No approved consent language, allowed formats,
byte limits, malware/content checks, metadata policy, accessibility alternative,
or retention behavior exists for uploaded evidence.

**Viable choices:** exclude media from V1, or approve and fund the complete controlled
upload lifecycle.

**Recommendation:** exclude media from the initial public V1. The text-first roadmap,
coach observations, and evidence limitations already work without it.

**Exact proposed decision wording:**

> `OWNER-MEDIA-001`: Media upload is **excluded from Roadmap V1**. No user-facing
> upload or private-object delivery may be enabled. Reconsider only after an approved
> consent, safety, accessibility, retention, deletion, provider, cost, and verification
> packet.

**Consequence of deferral:** the current disabled state remains correct.

## Decision 5 — public origin, access scope, and production providers

**Evidence:** OpenAI Sites, D1, private R2, dispatch-owned Sign in with ChatGPT, and
Stripe-hosted billing are selected under `AUTH-005`; a final domain, live Stripe
account/configuration, provider-region record, budget owner, and public-auth support
path are not supplied.

**Viable choices:** keep owner-only access, permit an exact controlled allowlist, or authorize public access; use the Sites URL or an owner-controlled custom domain; approve or reject each attached provider/account/configuration baseline.

**Recommendation:** exercise the exact candidate owner-only on its Sites URL first; then approve one controlled allowlist before any public mode, and approve one domain plus the exact live provider accounts/configuration only after hosted authentication and operating evidence pass.

**Exact proposed decision wording:**

> `OWNER-PROD-001`: I approve **[owner-only / exact controlled allowlist / public]** access and **[Sites URL / owner-controlled domain]** as the entry point. I approve provider/account inventory **[version]**, with monthly budget/alert **[limits]** and owner **[name]**. I authorize only the exact configured Stripe, Sites, D1, R2, and SIWC operations described there. Public webhook ingress and instructor/golfer access boundaries are **[exact configuration]**. Review provider access and cost on **[date]**.

**Consequence of deferral:** the Sites release stays owner-only; no custom-domain,
public-auth-suitability, or live-billing claim is made.

## Decision 6 — controlled real-user and transaction authorization

**Evidence:** the full-live definition of done requires authorized real instructor and golfer journeys. Participant contact, real personal data, public-access changes, customer messages, and live charges are material external effects; `AUTH-005` does not make their unspecified details safe or exact.

**Viable choices:** owner-only synthetic operation, a controlled adults-only evaluation with exact allowlist and no live charge, or a controlled evaluation with one precisely bounded authorized live transaction/refund exercise after all billing prerequisites pass.

**Exact proposed decision wording:**

> `OWNER-VALIDATION-001`: I authorize a controlled adults-only Roadmap V1 evaluation with **[participants and access mode]**, using policy and consent versions **[IDs]**, support/incident owner **[name]**, retention schedule **[version]**, and approved contact channels **[channels]**. Live Stripe activity is **[prohibited / limited to exact transaction, refund behavior, currency, and maximum amount]**. Media and junior use remain excluded. Stop on **[security, privacy, billing, support, or data-loss triggers]**. Activation and validation measures follow **[versioned protocol]**; results remain unvalidated until observed and recorded.

**Consequence of deferral:** use synthetic data only, contact no participants, change no public access, send no customer messages, and create no live charge.

## Decision 7 — exact-release acceptance

This decision is made only after the candidate URL, source commit, archived build,
saved Sites version, deployment/environment revision, migrations, smoke results, restore result,
access policy, known limitations, and residual risks are attached to the release
evidence record.

**Exact proposed decision wording:**

> `OWNER-ACCEPT-001`: I reviewed Roadmap release **[exact candidate/version and source commit]** at **[exact URL]** on **[date]**. I accept it for **[owner-only / controlled users / public]** operation under configuration **[revision]**, policies **[versions]**, and residual-risk record **[version]**. Approved operators are **[names]**. Stop/revisit triggers are **[exact triggers]**.

The currently evidenced candidate fields are: Sites version 15, source/runtime
release commit `8a359398099ab9b970df1d28eb3473dcbcd6207f`, saved version
`appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_085298ff9b9c819193d48e0df7a71631`,
deployment `appgdep_6a7810bf6fc08191b2cb9bfb081e58c2`, local archive
gzip SHA-256 `f987afcd00f9151e4c1a698fdf7aeb06fe8d275ec778494bb7dd38f535406a31`
(3,047,495 bytes; 63 entries/51 files; 11 migrations), provider package
`sha256:880189d7d59994b0c72fd34c9c206b2f37328096dea41c2ebd7b4fdf9d6775ad`
(51 files; 7,270,400 bytes), successful private deployment at
`2026-08-09T05:31:58.490796Z` under environment revision `17`, and
`https://roadmap-golf-coaching.aar-landry.chatgpt.site`. The exact configuration
records the same `RELEASE_ID`, `APPLICATION_WRITE_MODE=enabled`,
`INSTRUCTOR_ACCESS_MODE=owner_private`, and
`BILLING_CHECKOUT_ENABLED=false`; four redacted secrets were retained. Both
detached clean worktrees passed 333/333 verification; their 51-file comparison
reported three expected raw differences and zero normalized differences. The
integrated security review found no actionable Critical or High blocker in its
bounded scope. Fresh
signed-out `/`, `/app`, `/r`, and `/api/health` requests returned `401` with
`no-store`/`no-referrer`; no bypass
credential was generated, read, displayed, persisted, or used. `SEC-002` is
**REMEDIATED — HOSTED RETEST PENDING** and `SEC-001` is **REMEDIATED — RETEST
PENDING**. `LOG-PRIV-001` remains open because three provider fetch events
persisted despite all packaged logging switches being configured off. Public and
controlled-real-user acceptance are ineligible. No exact-version-15 authenticated mounted-browser, manual
accessibility/CSP review, hosted frozen/missing/invalid/restored-enabled exercise,
zero-side-effect hosted scheduler proof, owner operational-health observation,
controlled hosted write, provider backup/restore, alert delivery, complete hosted-
log sample, public/paid launch, real-user result, or owner acceptance exists.
Exact owner-approved consent-policy content/version and privacy-operator access
configuration remain absent. These fields describe an owner-only, Checkout-
disabled candidate; any later source, configuration, or deployment needs a new
exact record.

The superseded version-12 candidate fields were: source/runtime release commit `7b77e6507c1b1c1acb091ab046808cf8b5cc0a5c`, local archive gzip SHA-256 `994f725ba6c5952c45885a4d72d38804f1b10b8440273dc26ac8bd1c38d2bd75` (2,967,333 bytes; 61 entries/49 files; 10 migrations), Sites archive content hash `sha256:0805c04e9dcd5e8bac77f58aec2362dece1754f6eec63ec73d9c2e249bb01700` (49 files; 6,748,160 unpacked bytes), saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_8868e09fcb28819181cfbebdf82ce73f`, deployment `appgdep_6a77c5c85974819185ce1c8caf13007c` with final status `succeeded` and provider `updated_at` `2026-08-09T00:12:04.939300+00:00`, environment revision 14, fresh signed-out `401`/`no-store`/`no-referrer` results for `/`, `/app`, `/r`, and `/api/health`, and `https://roadmap-golf-coaching.aar-landry.chatgpt.site`. Both exact-version-12 clean installs contained 501 packages with the same five blocked install scripts and passed 242/242 verification. The builds matched across 49 files with three controlled raw differences and zero normalized differences; production dependency audit reported zero vulnerabilities; release integrity inspected 261 source/evidence files with zero findings and preserved Business Plan V1. Version-9 responsive captures and exact-v11 recovery/capacity exercises remain historical predecessor evidence only. `SEC-002` is **REMEDIATED — HOSTED RETEST PENDING** and `SEC-001` is **REMEDIATED — RETEST PENDING**. No exact-version-12 authenticated mounted-browser, manual accessibility/CSP review, observed hosted scheduler invocation, complete hosted-log sample, hosted recovery, or owner operational-health evidence exists. A post-v12 value-safe capture at `2026-08-09T00:13:27.8566565Z` returned six broad `fetch`/`info`/`ok` events and zero `errors_only` events, with `scheduled=0`; it remains inconclusive. Version-12-to-11 rollback would reintroduce the lost-ack duplicate response/audit risk and is a security/behavior regression, not class `N`. Exact owner-approved consent-policy content/version and privacy-operator access configuration are absent, so deep readiness is intentionally degraded. These fields described an owner-only, Checkout-disabled candidate at that time; version 13 now supersedes it as the current private candidate.

The final version-12 historical sentence above is itself superseded: versions 13
and 14 are now immutable predecessors, and version 15 is the current private
candidate.

**Consequence of deferral:** deployment and technical verification remain useful
evidence, but the production-completion goal remains active and no accepted-live-V1
claim is made.
