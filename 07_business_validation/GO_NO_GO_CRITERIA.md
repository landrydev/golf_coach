# Go / No-Go Criteria

**CURRENT DRAFT STATUS:** Revised staged gates for self-serve SaaS  
**REAL-WORLD STATUS:** No gate has passed  
**AARON APPROVAL STATUS:** Review required  
**Depends on:** [Self-Serve SaaS Validation Plan](SELF_SERVE_SAAS_VALIDATION_PLAN.md), [Measurement Plan](MEASUREMENT_PLAN.md), [Design Readiness Gate](../DESIGN_READINESS_GATE.md)

## Decision vocabulary

- **GO:** Required evidence and guardrails pass for the next named stage only.
- **MODIFY:** Core signal exists; a bounded change and retest are required.
- **PAUSE:** Evidence/policy/time is insufficient; do not infer failure or success.
- **NO-GO:** Structural evidence contradicts the model or a hard-stop condition persists.

No stage authorizes later stages automatically. Only Aaron can approve owner decisions and the design gate.

## Gate 1 — problem and initial customer

Candidate GO conditions:

- Core solo instructors across more than one Canadian context show a repeated recent assessment-to-package clarity problem.
- They control/influence the package recommendation and use at least minimal assessment evidence.
- Current tools/workarounds do not already solve the full job well.
- Seasonality and facility context are variations, not prerequisites.
- Golfers show corresponding uncertainty about plan/package without demanding manipulation.

NO-GO or segment reconsideration when only facilities/academies have the problem, one-off lessons dominate with no desire for phases, or the needed product is booking/CRM/analysis rather than the defined roadmap.

## Gate 2 — unaided acquisition comprehension

Candidate GO conditions:

- Previously unexposed qualified instructors accurately retell audience, problem, outcome, mechanism, required inputs, compatibility, and first action.
- The realistic sample is understood as standard self-serve output, not custom service.
- **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month**, inclusion, no setup fee, trial status, cancel, and pause hypothesis are findable and accurately understood.
- No required sales-call mental model remains.

MODIFY if message hierarchy or sample causes bounded confusion. NO-GO if the proposition repeatedly requires founder explanation.

## Gate 3 — non-coded activation prototype

Candidate GO conditions are the exact [Prototype Acceptance Criteria](../06_prototype/PROTOTYPE_ACCEPTANCE_CRITERIA.md), including:

- at least 6/8 qualified instructors reach complete simulated share without human onboarding;
- at least 6/8 do so within the candidate 30-active-minute target without sacrificing authenticity/accuracy;
- required/optional/deferred content and errors are understood;
- price/account states are comprehended;
- zero critical findings; and
- the exact version is reviewed by Aaron.

Prototype GO permits design-gate consideration, not code.

## Gate 4 — golfer roadmap and trust

Candidate GO conditions:

- Thresholds for goal, starting point, phase, package, alternatives, personal relevance, and coach ownership pass.
- Limited/error states preserve comprehension.
- Zero critical pressure, claim, privacy, or access issue.
- Instructor authenticity review shows standard output can represent real coach judgment.

NO-GO if clarity requires misleading certainty or personalization requires bespoke design.

## Gate 5 — assisted beta learning

Candidate GO-to-design-gate conditions:

- Real instructors can produce and share credible roadmaps using the standard structure.
- Every founder intervention is logged and has a plausible bounded product/policy response.
- Golfer comprehension and trust persist with real content.
- Package outcome evidence is interpretable with limits.
- Normal use does not appear inherently dependent on custom setup/reporting.
- Privacy, consent, access, sharing, correction, and retention incidents are absent or resolved.

Assisted beta cannot pass the self-serve economics gate.

## Gate 6 — pre-code design readiness

Use [DESIGN_READINESS_GATE.md](../DESIGN_READINESS_GATE.md). It additionally requires approved acquisition, price, signup, activation, package setup, first roadmap, preview, share, return, cancellation, pause, and resume designs plus exact prototype evidence.

**Current required result: NOT APPROVED.**

## Gate 7 — true self-serve beta after authorization

Candidate GO conditions:

- At least 40% of qualified eligible signups activate.
- At least 80% of activated instructors do so without human onboarding.
- At least 20% of qualified eligible trials become paid.
- Median normal support after activation is at most 10 minutes/account/month.
- Real activated users make an actual choice around **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month**.
- Repeat use or a credible recurring-value behavior appears after first share.
- No critical ethics/privacy/access incident.

All numeric conditions are `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`. Define eligibility and missingness before calculation.

## Gate 8 — scalable economics and seasonality

Candidate GO conditions:

- Gross margin trends toward at least 80% before R&D/overhead.
- CAC payback is at most 4 full-price paid months for tested channels.
- Working model supports about 8 full-price paid months/customer/year or evidence supports a revised model.
- Seasonal and non-seasonal churn are distinguishable.
- At least 40% of eligible seasonal pause/cancel accounts reactivate in the next relevant season.
- Support/custom work does not grow linearly as hidden service.
- Referral contribution is measured without privacy compromise.
- Solo economics do not depend on facility contracts or team expansion.

These thresholds are simulated recommendations. A complete seasonal cohort may require PAUSE rather than a premature decision.

## Lifecycle expansion gates

### Living journey

Advance when repeated assessment/active-client behavior shows recurring value, update effort is acceptable, and instructors/golfers use the current-priority view.

### Renewal

Advance when real phase completion exists, evidence supports distinct next-phase recommendations, and renewal remains ethical.

### Referral

Advance when meaningful milestones occur, privacy/share policy is approved, and referral remains separate from golfer-content sharing.

### Team tier

Advance only when repeated qualified demand shows solo instructors/teams need shared administration and the added scope can remain self-serve. One facility request is insufficient.

## Hard-stop rules

Stop the affected stage for:

- fabricated evidence or outcome;
- consent/privacy/access incident not safely contained;
- hidden subscription, charge, cancellation, or data consequence;
- manipulative package/renewal/referral behavior;
- guaranteed or materially unsupported coaching/revenue claim;
- recurring founder explanation, custom setup, or roadmap authorship needed for normal value;
- acquisition/support cost incompatible with the price;
- product pressure to replace coach judgment or tools; or
- any attempt to begin code before signed design approval.

## Decision record

Every gate decision records:

- date and decision owner;
- exact stage/artifact/version;
- participant/cohort and assistance status;
- thresholds and results;
- evidence IDs and counterevidence;
- guardrail/incidents;
- limitations/missingness;
- GO/MODIFY/PAUSE/NO-GO;
- next authorized stage; and
- revisit trigger.

## Current assessment

No real evidence has been collected, no exact Figma prototype exists, and Aaron has not approved the simulated recommendations or design gate.

**DESIGN READINESS STATUS: NOT APPROVED**
