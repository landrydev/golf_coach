# Candidate Implementation Requirements

> **Historical requirements baseline:** This document was written before `AUTH-005` and its no-code/gate language describes that earlier authority. Production implementation is now authorized. Use [Requirements Traceability](../10_production_saas/docs/REQUIREMENTS_TRACEABILITY.md) for the live V1 baseline, implementation evidence, and unresolved gaps; preserve the requirements below as source provenance.

**CURRENT DRAFT STATUS:** Historical observable-requirements source; implementation authority superseded by `AUTH-005`  
**REAL-WORLD STATUS:** Production candidate exists; exact owner-approved design/policy baseline and real-world evidence remain incomplete  
**AARON APPROVAL STATUS:** Review required  
**Depends on:** [Approved Design Index](APPROVED_DESIGN_INDEX.md), [Content and Data Requirements](CONTENT_AND_DATA_REQUIREMENTS.md), [Implementation Non-Goals](IMPLEMENTATION_NON_GOALS.md)

## Intended outcome

If the design gate is later approved, a bounded first product should let one independent instructor discover the product, begin without a call, configure the minimum coach/package information, create and preview a credible golfer roadmap, share it, and return—while letting the golfer understand the plan and use an existing external package action without pressure.

Requirements below describe observable behavior only. They select no framework, architecture, data model, vendor, authentication, billing, storage, media, AI, or infrastructure.

## Candidate user flows

### Instructor

```text
Explanation/sample/price → signup → identity → package/link
→ golfer/goal → assessment/evidence → phases/first recommendation
→ preview → share → accurate success → minimal return
```

### Golfer

```text
Private welcome → goal → starting point → barriers → roadmap
→ first phase → package → continue/ask/wait/decline/external action
```

### Account/seasonality

```text
Trial → explicit paid choice → full service
→ continue / candidate pause / cancel → resume where applicable
```

Exact live billing and account behavior remains policy-blocked and unapproved.

## Observable acquisition requirements

- Identify individual instructor, commercial problem, roadmap mechanism, and core outcome.
- Show realistic synthetic golfer output and corresponding coach inputs without gating.
- State existing-tool/method compatibility and explicit non-goals.
- Show **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month per instructor**, inclusion, no setup fee, trial behavior, cancellation, and candidate pause.
- Provide FAQ and self-serve start; no required sales call or custom quote.
- Preserve essential meaning without rich media or motion.

## Observable activation requirements

- Distinguish required, optional, and deferred content.
- Accept minimum coach identity; optional basic branding cannot block value.
- Let instructor define one current package and external action/contact route.
- Capture minimum golfer goal and coach-owned assessment.
- Support 3–4 directional phases, first-phase rationale/progress signals, and explicit package connection.
- Optional media/measurements can be absent.
- Provide non-destructive back/edit/save-return expectation and specific error recovery.
- Preview exact golfer order and material blockers before share.
- Require explicit coach approval of coaching judgments/package facts.
- Confirm intended recipient/context before share.
- Report accurate success/failure/duplicate/pending status; never imply an unobserved sale.
- Provide minimal return state for incomplete/recent/new roadmap and account status, not a complete dashboard.

## Observable golfer requirements

- Identify coach, golfer, private context, and roadmap purpose.
- Present goal and reason before technical assessment or price.
- Include strength, pattern, priority barriers, evidence source/limits where present.
- Present 3–4 directional phases and explain why the first phase leads.
- Connect package purpose, inclusions, current coach price/terms, and external action.
- Warn before leaving to an external process.
- Provide ask, wait, decline, reassessment, or independent-practice path as appropriate.
- Keep coach responsible for all judgments.
- Preserve comprehension in no-media, limited-evidence, unavailable-link, correction, and unauthorized states.
- No hidden urgency, guaranteed result, or product-authored diagnosis.

## Observable account and seasonality requirements

- State current trial/paid/pause/cancel status in text.
- Require explicit paid choice; no obscured trial conversion in the candidate recommendation.
- Show price, access, retention, and resume consequences before pause/cancel.
- Make pause/cancel findable and operable without a call.
- Candidate pause is read-only and preserves approved content/configuration according to future policy.
- Resume leads to the next useful roadmap action without custom reimplementation.
- Exact data/link behavior must match approved privacy, billing, and retention policy.

## State and content requirements

- New, empty, incomplete, complete, long/short, optional absent, invalid, loading, error, success, limited-data, no-media, unauthorized/expired, external-action unavailable.
- Trial active/ending, paid choice, full active, pause review/read-only, cancellation review/state, resume.
- Errors state what happened, what did not happen, and recovery; preserve valid work where appropriate and expose no private content.
- Platform and coach-package prices remain distinguishable.

## Responsive and accessibility requirements

- Preserve content/action at narrow and wide widths and at required zoom/reflow conditions.
- Keyboard operation, logical focus, visible focus, specific control names, error association, status announcement, pointer alternatives, target size, media alternatives, captions/descriptions, and reduced motion follow the approved access specification.
- Price, terms, alternatives, privacy, cancel/pause, and errors never become visual-only or inaccessible secondary content.
- Exact conformance requires suitable implementation testing; Figma evidence is insufficient.

## Trust, privacy, and commercial constraints

- Collect only approved minimum content.
- Real-client use waits for qualified consent/access/retention/deletion/media/sharing review.
- Coach/golfer correction and withdrawal behavior follows approved policy.
- No sale of data, public-by-default sharing, cross-client exposure, or hidden metadata.
- No claims of guaranteed golfer or business results.
- No hidden subscription, setup fee, annual commitment, or cancellation obstruction.

## Operational acceptance hypotheses

Future product should make the candidate activation and economic measures observable:

- complete real share and assistance status;
- time to first roadmap;
- support time/reason;
- trial/paid state and MRR;
- seasonal pause/cancel/reactivation; and
- defined customer-outcome metrics without overclaiming attribution.

This does not prescribe analytics architecture or authorize tracking before privacy review.

## Required real artifacts before implementation

- Aaron-approved acquisition/activation and golfer frames in [Approved Design Index](APPROVED_DESIGN_INDEX.md).
- Accepted paired prototype and evidence.
- Approved price, trial, cancel, pause, and resume policy.
- Approved privacy, access, correction, retention, deletion, media, and share policy.
- Accessibility review and exact acceptance plan.
- Signed [Design Readiness Gate](../DESIGN_READINESS_GATE.md).

## Future acceptance rule

Each implemented behavior must trace to an approved requirement/design/version and pass its defined functional, content, responsive, access, trust, privacy, and commercial test. Unapproved convenience or later-team/lifecycle scope is excluded.

## Current conclusion

These candidate requirements are useful only for future traceability. No implementation is authorized.

**DESIGN READINESS STATUS: NOT APPROVED**
