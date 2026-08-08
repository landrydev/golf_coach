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
| `OWNER-SEC-001` credential containment | **READY FOR DECISION** | Exact contained operation is known; Aaron's explicit authority is required before rotating/revoking the exposed credential |
| `OWNER-SCOPE-001` product/design/content baseline | **READY FOR REVIEW** | Exact version 5 candidate and residual-risk records exist; Aaron may approve, modify, or reject the bounded baseline |
| `OWNER-OPS-001` operators and contacts | **PREREQUISITE MISSING** | Names, entity, routes, and public contacts must be supplied |
| `OWNER-COMM-001` offer and consequences | **PREREQUISITE MISSING** | Exact policy and Stripe Product/Price are not supplied or validated |
| `OWNER-PRIV-001` privacy and retention | **PREREQUISITE MISSING** | Versioned policy and qualified Canadian review do not exist |
| `OWNER-MEDIA-001` text-first exclusion | **READY FOR DECISION** | Exclusion matches the implemented fail-closed state |
| `OWNER-PROD-001` origin/providers/access | **PREREQUISITE MISSING** | Origin, accounts, access scope, budgets, and provider evidence are unresolved |
| `OWNER-VALIDATION-001` controlled real operation | **PREREQUISITE MISSING** | Policy, consent, operators, participants, and any transaction limit must be exact |
| `OWNER-ACCEPT-001` exact-release acceptance | **FINAL ONLY** | The complete evidence packet and all applicable prerequisites must be attached |

Owner approval cannot substitute for missing qualified review, hosted authentication evidence, controlled billing evidence, manual accessibility review, real-user results, or restore/rollback/alert exercises. Those are facts to demonstrate, not facts to approve into existence.

## Decision 0A — contain the exposed SIWC bypass credential

**Evidence:** a live Sites bypass credential was exposed in a private tool transcript while inspecting the owner-only candidate. The value is not reproduced in repository evidence. The outer owner-only policy and application-level `owner_private` authorization contain current exposure, but prior values must be treated as compromised before access expands or a release is accepted.

**Viable choices:**

1. Authorize immediate rotation/revocation while the site remains owner-only, then verify old-credential denial and owner access.
2. Keep the candidate owner-only and defer rotation; do not accept or expand access.

**Recommendation:** choice 1.

**Exact proposed decision wording:**

> `OWNER-SEC-001`: I authorize rotation or revocation of the exposed SIWC bypass credential for Sites project `appgprj_6a76957326fc819196ebf3a0c95f1ec3`. Treat every prior value as compromised and invalid after the operation. Do not record credential values. Keep access owner-only during rotation, verify the old credential is denied and owner authentication still works, and attach the operation result to release evidence.

**Consequence of deferral:** keep owner-only containment; do not use the exposed value, expand access, or accept a release.

## Decision 0B — exact product, design, and content baseline

`[REAL-WORLD VALIDATION REQUIRED]` Selecting the bounded release baseline does not validate demand, usability, pricing, accessibility, coaching outcomes, or real-user comprehension.

**Evidence:** exact owner-only candidate `ROADMAP-SITES-V5-2026-08-08` is pinned to source commit `ef258da53e15b2d516e22c65b24a017965f34dd0`, saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_6eb13fe073b88191b6c2d5c50c44ae15`, environment revision 7, and the evidence/limitation records linked below. Requirements traceability still identifies engineering and external-evidence gaps, so approval may be conditional or deferred.

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
archival, and auditable deletion requests are implemented. Exact notices, privacy
roles, retention periods, deletion exceptions, backup expiry, and the instructor's
required basis for adult golfer records still need qualified review.

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
> Instructors must attest **[exact authority/notice requirement]** before entering an
> adult golfer record and **[exact sharing requirement]** before publishing. Access,
> correction, withdrawal, export, deletion, exceptions, backup expiry, and incident
> notification follow **[versioned procedure]**. Review on **[date]**.

**Consequence of deferral:** only controlled private operation is supportable;
destructive deletion cannot be represented as immediate or automatic.

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

This decision is made only after the candidate URL, source commit, saved Sites
version, deployment/environment revision, migrations, smoke results, restore result,
access policy, known limitations, and residual risks are attached to the release
evidence record.

**Exact proposed decision wording:**

> `OWNER-ACCEPT-001`: I reviewed Roadmap release **[exact candidate/version and source commit]** at **[exact URL]** on **[date]**. I accept it for **[owner-only / controlled users / public]** operation under configuration **[revision]**, policies **[versions]**, and residual-risk record **[version]**. Approved operators are **[names]**. Stop/revisit triggers are **[exact triggers]**.

The currently evidenced candidate fields are: `ROADMAP-SITES-V5-2026-08-08`, source commit `ef258da53e15b2d516e22c65b24a017965f34dd0`, saved Sites version `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_6eb13fe073b88191b6c2d5c50c44ae15`, environment revision 7, and `https://roadmap-golf-coaching.aar-landry.chatgpt.site`. Those fields describe an owner-only candidate, not a pre-approved release; any later source, configuration, or deployment needs a new exact record.

**Consequence of deferral:** deployment and technical verification remain useful
evidence, but the production-completion goal remains active and no accepted-live-V1
claim is made.
