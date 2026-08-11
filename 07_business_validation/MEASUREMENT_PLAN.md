# Measurement Plan

**CURRENT DRAFT STATUS:** Revised for self-serve SaaS and instructor outcomes  
**REAL-WORLD STATUS:** No measurements collected  
**AARON APPROVAL STATUS:** Review required  
**Depends on:** [Business Model and Metrics](../01_business_foundation/BUSINESS_MODEL_AND_METRICS.md), [Self-Serve SaaS Validation Plan](SELF_SERVE_SAAS_VALIDATION_PLAN.md)

## Measurement principle

Measure whether the company delivers self-serve product value and whether that value helps the instructor's business. Do not substitute one for the other.

Every result states eligibility, numerator, denominator, time window, cohort, channel, seasonality, assistance, missingness, and artifact/product version.

## Cohort and assistance definitions

### Cohorts

- Website/direct-link visitors.
- Qualified signups.
- Trial accounts.
- Activated instructors.
- Paid full-price instructors.
- Paused instructors.
- Cancelled seasonal and cancelled non-seasonal instructors.
- Reactivated instructors.
- Assisted-beta participants, reported separately.

### Assistance

- **Human-free:** no live explanation, scheduled onboarding, custom setup, founder-authored content, or task coaching.
- **Reactive support:** user requested help; time/reason logged.
- **Actively assisted:** scheduled or proactive human completion/explanation.
- **Accessibility accommodation:** recorded distinctly; never treated as a product failure by default, while inaccessible design still remains a failure.

## Product-led funnel

```text
Visitor/recipient
→ product explanation/sample
→ qualified signup
→ first draft
→ complete roadmap
→ first share (activation)
→ paid subscription
→ repeat value
→ continue/pause/cancel
→ reactivation/referral
```

| Metric | Definition |
|---|---|
| Visitor-to-signup | Qualified signups ÷ attributable eligible visitors/recipients |
| Product-qualified instructor rate | Qualified signups with core ICP and plausible assessment opportunity ÷ signups |
| Signup-to-draft | Signups starting a first golfer roadmap ÷ qualified signups |
| Signup-to-complete | Signups completing minimum roadmap content ÷ qualified signups |
| Signup-to-activation | Qualified instructors sharing a complete real roadmap ÷ qualified signups |
| Human-free activation | Activated instructors with no human onboarding ÷ activated instructors |
| Time to first roadmap | Active and elapsed time from declared entry to complete draft/share, reported separately |
| Trial-to-paid | Eligible trials beginning paid subscription in declared window ÷ eligible trials |
| First package opportunity | Activated instructors whose shared golfer reaches a real package decision opportunity ÷ activated instructors |

Prototype simulated shares are reported as prototype task completion, not company activation.

## Business North Star and recurring revenue

`[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`

**North Star:** trailing-twelve-month seasonalized recurring subscription revenue from activated instructors.

Before one complete year, report cohort MRR, activated paid instructors, and full-price paid months. Do not annualize peak-season MRR by multiplying it by twelve.

```text
MRR = full-price subscriptions × full monthly price
    + pause subscriptions × pause monthly price
```

Report full and pause MRR separately and combined. No revenue exists yet.

## Retention and seasonality

| Metric | Definition |
|---|---|
| Monthly logo churn | Accounts leaving all paid states in month ÷ paid accounts at month start |
| Seasonal cancellation | Cancellations preclassified/confirmed as off-season ÷ eligible active accounts; reasons preserved |
| Non-seasonal cancellation | Other voluntary cancellations ÷ eligible active accounts |
| Pause entry | Accounts entering candidate pause ÷ eligible active accounts |
| Full-price paid months/year | Number of full-price billed months per customer in declared year/cohort |
| Pause paid months/year | Number of pause billed months separately |
| Reactivation | Eligible seasonal pause/cancel accounts resuming next season ÷ eligible expected-return accounts |
| Time to reactivation | Days from eligible season/resume window to full service |
| Post-reactivation activation | Reactivated accounts completing a new real share in declared window ÷ reactivated accounts |
| Annual-plan adoption | Annual subscribers ÷ eligible paid accounts only if option is later tested |

Never classify churn as seasonal solely to improve retention reporting. Capture declared reason and subsequent return behavior.

## Economics and support

| Metric | Definition |
|---|---|
| Gross margin | (Subscription revenue − directly attributable service costs) ÷ revenue |
| CAC by channel | Attributable spend + labor ÷ new paid instructors from that channel |
| CAC payback | CAC ÷ monthly gross profit per new full-price instructor |
| Support time/account | Normal support minutes ÷ active accounts; report median, distribution, reason |
| Assisted-beta effort | Founder research/setup/content/support time, separately by category |
| Refund/dispute rate | Applicable refunds/disputes ÷ billed accounts/transactions when live |
| Referral contribution | New qualified/paid instructors attributed to instructor referrals ÷ total new qualified/paid instructors |
| Team-tier signal | Qualified solo accounts explicitly needing multi-coach capability and verified team opportunity; no assumed expansion revenue |

Direct cost categories are measured from actual operations; this plan selects no architecture, vendor, or storage model.

## Customer business-outcome metrics

| Metric | Definition |
|---|---|
| Eligible assessment | Adult core-context assessment where an ongoing recommendation would ordinarily occur; exclusions predeclared |
| Assessment-to-package conversion | Eligible golfers committing to a qualifying multi-session package in declared window ÷ eligible assessed golfers |
| Revenue per eligible assessed golfer | Qualifying coaching revenue committed/collected in declared window ÷ eligible assessments; basis consistent |
| Lessons purchased per golfer | Qualifying sessions purchased in declared period ÷ eligible golfers |
| Phase completion | Eligible phases reaching coach-confirmed complete/partial/revised status ÷ started phases |
| Package renewal | Eligible completed phases followed by qualifying next phase in declared window ÷ eligible completed phases |
| Instructor referral rate | Qualified referred instructor prospects/accounts ÷ eligible activated instructors asked/offered under declared rule |
| Golfer qualified referral | Referred prospect who consents and books an assessment ÷ eligible golfers offered an earned referral moment |

Revenue per assessed golfer is a customer-success measure, not the SaaS North Star.

## Experience and ethical metrics

- Unaided product/sample/price retell.
- Required/optional/deferred understanding.
- Roadmap completeness and coach authenticity.
- Golfer core retell: goal, starting point, first phase, package purpose, action.
- Substantive personal details identified.
- Evidence-source/limit comprehension.
- Ask/wait/decline discoverability.
- Interface pressure, misleading claim, privacy/access, and accessibility flags.
- Error recovery and share-status comprehension.
- Cancel/pause/resume consequence comprehension.

One critical manipulation, material claim, privacy, or access failure blocks the affected gate regardless of favorable conversion.

## Candidate target hypotheses

| Measure | Candidate | Status |
|---|---:|---|
| Qualified signup-to-activation | ≥40% | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` |
| Activated without human onboarding | ≥80% | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` |
| Qualified trial-to-paid | ≥20% | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` |
| Full-price paid months/customer/year | 8 | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` |
| Gross margin before R&D/overhead | ≥80% | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` |
| Median normal support post-activation | ≤10 min/account/month | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` |
| CAC payback | ≤4 full-price paid months | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` |
| Eligible next-season reactivation | ≥40% | `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` |

These are not forecasts or industry benchmarks.

## Baseline, attribution, and confounders

- Set eligibility and outcome windows before results.
- Report numerator/denominator and individual instructor cohorts.
- Use the same revenue basis before/after.
- Record lead source, season, package/price change, availability, instructor, golfer mix, external promotion, and support.
- Do not attribute all change to the roadmap.
- Separate prototype, assisted beta, true self-serve beta, and scaled cohorts.
- Do not compare peak outdoor season with off-season without explicit interpretation.

## Data-quality rules

- No fabricated or backfilled evidence.
- Record missing, unknown, excluded, and disputed values.
- Define source of truth and reconciliation before live reporting.
- Do not store identifiable raw records here.
- Preserve counterevidence and failed/abandoned flows.
- Version formulas and policy changes.
- Small samples receive directional interpretation and intervals/ranges where appropriate; avoid false precision.

## Analysis outputs

1. Funnel by channel/cohort/assistance.
2. Activation time, completeness, support, and failure reasons.
3. MRR/paid-month/churn/pause/reactivation bridge.
4. CAC, payback, gross margin, and support-cost view.
5. Instructor customer-outcome view with attribution limits.
6. Golfer comprehension/trust/guardrail view.
7. Seasonal/year-round cohort comparison.
8. Decision recommendation with evidence IDs and missingness.

## Aaron review decision

Aaron should review the North Star, formulas, activation definition, seasonal classification, economic targets, and reporting boundaries before live measurement.
