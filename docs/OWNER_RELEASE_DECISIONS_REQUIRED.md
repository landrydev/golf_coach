# Roadmap V1 owner release decisions

**Prepared:** 2026-08-07
**Authority:** `AUTH-005`
**Status:** exact owner and external operating inputs required for a paid public release; these are dependencies, not reinstated design gates

The application fails closed where the decisions below are absent: Sites access
remains owner-only, new Stripe Checkout sessions remain disabled, media upload is
absent, deletion remains an identity-verified request, and working legal/support
copy does not claim a staffed public service.

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

## Decision 5 — public origin and production providers

**Evidence:** OpenAI Sites, D1, private R2, dispatch-owned Sign in with ChatGPT, and
Stripe-hosted billing are selected under `AUTH-005`; a final domain, live Stripe
account/configuration, provider-region record, budget owner, and public-auth support
path are not supplied.

**Recommendation:** exercise the exact candidate owner-only on its Sites URL first;
then approve one domain and the exact live provider accounts/configuration.

**Exact proposed decision wording:**

> `OWNER-PROD-001`: I approve **[domain/origin]** as the public entry point and the
> provider/account inventory **[version]**, with monthly budget/alert **[limits]** and
> owner **[name]**. I authorize the exact configured Stripe, Sites, D1, R2, and SIWC
> operations described there. Review provider access and cost on **[date]**.

**Consequence of deferral:** the Sites release stays owner-only; no custom-domain,
public-auth-suitability, or live-billing claim is made.

## Decision 6 — exact-release acceptance

This decision is made only after the candidate URL, source commit, saved Sites
version, deployment/environment revision, migrations, smoke results, restore result,
access policy, known limitations, and residual risks are attached to the release
evidence record.

**Exact proposed decision wording:**

> `OWNER-ACCEPT-001`: I reviewed Roadmap release **[release ID]** at **[exact URL]**
> on **[date]**. I accept it for **[owner-only / controlled users / public]** operation
> under configuration **[revision]**, policies **[versions]**, and the residual-risk
> record **[version]**. Approved operators are **[names]**. Stop/revisit triggers are
> **[exact triggers]**.

**Consequence of deferral:** deployment and technical verification remain useful
evidence, but the production-completion goal remains active and no accepted-live-V1
claim is made.
