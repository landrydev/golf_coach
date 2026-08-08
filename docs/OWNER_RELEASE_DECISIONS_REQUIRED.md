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
| `OWNER-SEC-001` credential containment | **RECORDED 2026-08-08; REMEDIATED — RETEST PENDING** | Aaron authorized the rotation; the provider-invalidated prior value and unchanged owner-only policy are evidenced, while normal signed-in owner and meaningful hosted-log retests remain missing |
| `OWNER-SCOPE-001` product/design/content baseline | **READY FOR REVIEW** | Exact version 9 owner-only candidate and evidence records exist; Aaron may approve, modify, or reject the bounded baseline |
| `OWNER-OPS-001` operators and contacts | **PREREQUISITE MISSING** | Names, entity, routes, and public contacts must be supplied |
| `OWNER-COMM-001` offer and consequences | **PREREQUISITE MISSING** | Exact policy and Stripe Product/Price are not supplied or validated |
| `OWNER-PRIV-001` privacy and retention | **PREREQUISITE MISSING** | Versioned policy and qualified Canadian review do not exist |
| `OWNER-MEDIA-001` text-first exclusion | **READY FOR DECISION** | Exclusion matches the implemented fail-closed state |
| `OWNER-PROD-001` origin/providers/access | **PREREQUISITE MISSING** | Origin, accounts, access scope, budgets, and provider evidence are unresolved |
| `OWNER-VALIDATION-001` controlled real operation | **PREREQUISITE MISSING** | Policy, consent, operators, participants, and any transaction limit must be exact |
| `OWNER-ACCEPT-001` exact-release acceptance | **FINAL ONLY** | The complete evidence packet and all applicable prerequisites must be attached |

Owner approval cannot substitute for missing qualified review, hosted authentication evidence, controlled billing evidence, manual accessibility review, real-user results, or restore/rollback/alert exercises. Those are facts to demonstrate, not facts to approve into existence.

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

## Decision 0B — exact product, design, and content baseline

`[REAL-WORLD VALIDATION REQUIRED]` Selecting the bounded release baseline does not validate demand, usability, pricing, accessibility, coaching outcomes, or real-user comprehension.

**Evidence:** exact owner-only candidate `ROADMAP-SITES-V9-2026-08-08` is pinned to source/runtime release commit `6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d`, local archive gzip SHA-256 `8b3d0b13f03f0b13cd10602d24af09bf17c34afdcb4cf73518b2b0d857d59e22`, Sites archive content hash `sha256:0b3986dc73b1d06539dc85900dfd959549d92bcceb812c231a418766d29411fb`, saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_58bb67e8e23c8191a584540a09e363c5`, deployment `appgdep_6a7768f92c588191934eda8abea6d6b4`, environment revision 11, and the evidence/limitation records linked below. Fresh signed-out boundary probes passed. Nine exact-commit local synthetic Chrome captures exercised the landing, workspace, and golfer views at 320, 390, and 1440 CSS pixels without root/body horizontal overflow; this is local layout evidence, not hosted or human accessibility acceptance. Deep readiness is intentionally degraded because exact owner-approved consent-policy content/version and privacy-operator access configuration are absent. Requirements traceability still identifies external, hosted, manual, and owner-decision gaps, so approval may be conditional or deferred.

**Separate undeployed supply-control evidence:** exact successor source commit
`66f5203a913f01c8da20555feebdbb99152c052c` passed two distinct detached clean
checkouts and locked installs (501 packages and the same five blocked install scripts
each), two full 234/234 verification runs, identical 49-file inventories, and a
strict comparison whose only raw differences were `server/index.js` and the two
`vinext-server.json` manifests and whose normalized difference count was zero.
`npm audit --omit=dev` reported zero vulnerabilities. The
[reproducibility record](release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md) closes
`SUPPLY-EVID-001` prospectively for that successor control only. It does not change
version 9's historical byte-rebuild failure or make the successor a deployed, saved,
public, accepted, or rollback candidate.

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

The currently evidenced candidate fields are: `ROADMAP-SITES-V9-2026-08-08`, source/runtime release commit `6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d`, local archive `D:\Projects\golf-coaching-design-blueprint\10_production_saas\outputs\roadmap-sites-v9-6b48fae.tar.gz` (2,965,984 bytes, 61 entries/49 files, gzip SHA-256 `8b3d0b13f03f0b13cd10602d24af09bf17c34afdcb4cf73518b2b0d857d59e22`), Sites archive content hash `sha256:0b3986dc73b1d06539dc85900dfd959549d92bcceb812c231a418766d29411fb` (49 files, 6,737,920 unpacked bytes), saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_58bb67e8e23c8191a584540a09e363c5`, deployment `appgdep_6a7768f92c588191934eda8abea6d6b4` with final status `succeeded` and provider `updated_at` `2026-08-08T17:36:53.329945+00:00`, environment revision 11, fresh signed-out `401` results for `/`, `/app`, `/api/health`, and `/api/operations/health`, and `https://roadmap-golf-coaching.aar-landry.chatgpt.site`. Exact-version-9 local verification includes 229/229 automated tests, a zero-vulnerability production dependency audit, unchanged 31-table/10-migration generation, a 54-request capacity exercise with zero failures, and the isolated D1/R2-compatible recovery exercise; the clean exact-commit install also passed 229/229 tests but did not prove deterministic byte identity with the submitted archive. The exact-commit local responsive record at `docs/release-evidence/ROADMAP-SITES-V9-2026-08-08-responsive-evidence.json` and nine Chrome captures exercise the landing, workspace, and golfer views at 320, 390, and 1440 CSS pixels without root/body horizontal overflow. Those captures use the local production Worker, a local compatible D1, and synthetic adult fixtures; they do not prove hosted rendering, Sites identity, hosted D1/R2, production credentials, customer data, Stripe, public access, real-user behavior, keyboard or screen-reader operation, forced-colour or reduced-motion behavior, zoom, supported-browser coverage, or manual accessibility acceptance. A bounded post-version-9 provider-log query returned three `fetch`/`ok` events (two `200`, one handled `403`) and zero scheduled events; a broad error-filtered query returned the handled `403` at level `info` and no error-level, exception, or crash event. These samples do not prove log completeness, redaction, error-free operation, alert delivery, or hosted scheduling. No exact-version-9 authenticated mounted-browser, observed hosted scheduler invocation, or owner operational-health evidence exists. Exact owner-approved consent-policy content/version and privacy-operator access configuration are absent, so deep readiness is intentionally degraded. These fields describe an owner-only candidate, not a pre-approved or full-live release; any later source, configuration, or deployment needs a new exact record.

**Consequence of deferral:** deployment and technical verification remain useful
evidence, but the production-completion goal remains active and no accepted-live-V1
claim is made.
