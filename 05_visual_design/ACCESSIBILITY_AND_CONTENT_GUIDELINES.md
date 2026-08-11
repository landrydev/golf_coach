# Accessibility and Content Guidelines

**CURRENT DRAFT STATUS:** Revised candidate requirements for acquisition, activation, account, and golfer flows  
**REAL-WORLD STATUS:** No design audit, specialist review, assistive-technology test, or legal review completed  
**AARON APPROVAL STATUS:** Review required  
**Depends on:** [Content Architecture](../03_experience_strategy/CONTENT_ARCHITECTURE.md), [Self-Serve Instructor Activation](../04_wireframes/SELF_SERVE_INSTRUCTOR_ACTIVATION.md), [Visual Direction](VISUAL_DIRECTION.md)  
**Decision status:** `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`

## Accessibility target

`[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`

Use **WCAG 2.2 Level AA** as the minimum design and future implementation conformance target, while voluntarily applying stronger focus and target-size practices where practical. This is a product-quality recommendation, not a statement of legal compliance.

`[EXTERNAL EVIDENCE — W3C, ACCESSED 2026-08-03]`

- W3C's [WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/) describes testable, technology-independent success criteria and advises using WCAG 2.2 for current accessibility work.
- W3C's [Reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) explains that ordinary horizontal-language content should reflow at a width equivalent to 320 CSS pixels without two-dimensional reading.
- W3C's [Target Size (Minimum) guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) defines the Level AA minimum as a target that can contain a 24-by-24 CSS-pixel square or meets a documented exception.
- W3C's [Captions guidance](https://www.w3.org/WAI/media/av/captions/) defines captions as synchronized text for speech and meaningful non-speech audio; broader W3C media guidance also addresses visual description and transcripts.

`[REAL-WORLD VALIDATION REQUIRED]` Before approval or implementation, confirm applicable accessibility laws, policies, contract requirements, current W3C errata/version, and testing scope with qualified specialists for the actual Canadian market and product form.

## Measurable design requirements

### Perceivable

- Normal text and images of text meet at least 4.5:1 contrast; large text meets at least 3:1 under adopted WCAG definitions.
- Meaningful non-text controls, states, focus boundaries where applicable, and essential graphics meet at least 3:1 against adjacent colors.
- Color never carries required/optional, phase, evidence, error, privacy, share, subscription, or improvement meaning alone.
- Text resizes to at least 200% without loss of content or function.
- Narrative and form content reflows to a 320-CSS-pixel-wide equivalent without two-axis scrolling, subject to valid exceptions.
- Text-spacing adjustments do not clip, overlap, or hide content/actions.
- Informative images and sample/evidence frames have equivalent text; decorative imagery is ignored later.
- Prerecorded speech and meaningful audio have accurate captions. Necessary visual swing/chart information has adequate description or transcript as applicable.
- No product explanation, field instruction, evidence claim, or action requires audio/video.

### Operable

- Every link, form field, disclosure, media control, preview, share, account control, and recovery path is keyboard operable without a trap.
- Focus order follows the current task or narrative; it does not jump from goal to price ahead of rationale.
- Focus is visible and not obscured by sticky regions or overlays.
- **Internal design target:** a clearly contrasting focus indicator comparable to a 2-pixel perimeter.
- **Internal design target:** controls generally provide at least a 44-by-44-pixel touch area; no target falls below WCAG 2.2 AA without a valid exception.
- No drag, swipe, hover, motion gesture, or device motion is the only input method.
- No autoplay; users control media and can stop motion.
- No signup, purchase, trial, review, consent, share, cancel, pause, or referral decision is timed.
- Reduced-motion behavior preserves meaning and sequence.

### Understandable

- Every page has a descriptive title and one clear top-level heading.
- Headings describe a user question or content; styling does not fake structure.
- Labels are specific: “Save package and add my first golfer,” “Ask Maya a question,” “Keep private,” not “Next,” “Submit,” or icon alone.
- Visible action text matches the future accessible name.
- Navigation, save/return, help, and account controls are consistent.
- Context changes only after explicit action; external handoff receives advance warning.
- Errors identify what happened, what did not happen, and recovery, without exposing private content.
- Platform price/cadence, trial behavior, cancel/pause consequences, golfer package terms, evidence limits, alternatives, and privacy remain plain text—not tooltips or visual annotations.
- Repeated information should not require re-entry unless justified for privacy/security.

### Robust future behavior

Future handoff must require meaningful names, roles, values, states, headings, relationships, status announcements, and error messages. This document selects no implementation technology and Figma cannot prove semantic conformance.

## Self-serve acquisition, form, and account requirements

`[SUPPORTED BY BUSINESS PLAN V2]` Accessibility begins before a golfer roadmap exists. A qualified instructor must be able to understand the product, inspect the sample, find **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month**, sign up, configure identity/package content, create, preview, share, cancel, pause, and resume without a support call.

- Preserve problem → outcome → mechanism → sample → price → action hierarchy.
- Sample meaning remains available without animation, hover, video, or precise pointer.
- Forms use persistent labels, field instructions where needed, required/optional text, and examples distinguishable from entered content.
- Errors preserve valid non-sensitive input, associate with fields, provide summary where useful, and move focus predictably.
- Multi-step progress identifies current step in text; progress alone is not activation.
- Save/return, incomplete, trial, paid, pause, cancelled, and resumed states have meaningful headings/status.
- Preview exposes the golfer's logical order and remains keyboard operable.
- Recipient/share summaries and success/failure status work without color or motion.
- Price, recurring cadence, trial, cancellation, pause, data-access consequence, and external handoff are never fine print.
- Cancel and pause receive the same focus, target, contrast, error, and clarity quality as continuation.
- Required help is inline or in operable disclosures; never hover-only or a mandatory live conversation.
- Authentication, billing, consent, and privacy patterns require later semantic/specialist testing.

## Cognitive load and decision accessibility

- One dominant priority and one primary action per decision region.
- Use progressive disclosure; essential reasoning, limits, price, terms, and alternatives remain exposed.
- Keep sentences concrete and generally short where meaning allows.
- Define golf/measurement terminology at first use; prefer outcome language.
- Avoid memory-dependent tasks: current goal, step, phase, and status remain available.
- Avoid flashing, parallax, scroll-jacking, background motion, confetti, and interruptions.
- Let the instructor save/return and the golfer review, go back, wait, or ask without penalty.
- Do not use warning language to shame incomplete setup, practice, non-purchase, cancellation, or pause.
- Do not ask facility, academy, integration, or advanced-brand questions before first value.
- A missing logo, video, or measurement must look optional, not erroneous.
- Explain why each required instructor input matters to the golfer.

## Media and evidence checklist

- [ ] Sample/clip title explains why it matters.
- [ ] Synthetic status or date/context/source is visible.
- [ ] Coach interpretation and limitation are adjacent.
- [ ] Future controls are keyboard accessible.
- [ ] No autoplay; volume/playback are controlled.
- [ ] Accurate captions cover speech and meaningful sound.
- [ ] Text description covers visual detail required for the claim.
- [ ] Before/current media receive equal crop, scale, grading, and control treatment.
- [ ] Static/text comparison preserves meaning with reduced motion/no media.
- [ ] Failed media does not remove claim context or recovery.

## Coach voice

### Attributes

Calm, specific, observant, candid about limits, encouraging without generic praise, direct about recommendation, and respectful of choice.

### Use

- “Your goal is…”
- “What I observed…”
- “The evidence suggests…”
- “This is an early indication…”
- “What remains unproven…”
- “I recommend this phase because…”
- “A reasonable alternative is…”
- “We will reassess after…”

### Avoid

- “Fix your swing.”
- “Guaranteed results.”
- “Transform your game.”
- “You're falling behind.”
- “Don't lose your progress.”
- “Only a few spots left” as an interface pressure pattern.
- “Great job!” without a specific reason.
- “The data says” when the coach interprets.
- “Our AI recommends” or any coachless diagnosis.

## Platform voice

### Attributes

Direct about audience, effort, price, and limits; helpful without acting as coach; specific about required, optional, saved, sent, and unsent states; calm in errors/account decisions; honest about trial, cancel, pause, support, and data expectations.

### Use

- “You will need one current lesson package and one recent assessment.”
- “A logo is optional. Your name and coach identity are enough to begin.”
- “This example shows structure; you provide and approve every coaching judgment.”
- “Nothing was shared. Correct the booking link and try again.”
- “Review what remains available before choosing seasonal pause.”

### Avoid

- “Book a strategy call to unlock your roadmap.”
- “Set up your academy.”
- “Your AI coaching plan is ready.”
- “Upgrade now or lose your golfers.”
- “Only two spots remain.”
- “Success!” when a roadmap is only saved or a commercial outcome is unknown.

## Content patterns

### Self-serve readiness

> “Before you begin: have your coach identity, one current lesson package and link, and one golfer's goal and assessment. Video and launch data are optional.”

### Required/optional

> “Required to make the first phase clear: [field]. Optional supporting evidence: [field]. You can add it later.”

### Product error

> “The roadmap was not shared because [specific issue]. Your draft is saved. [Direct recovery action].”

### Trial and platform price

> “Try the complete first-roadmap flow for the stated period. After an explicit paid choice, the working price is [price/cadence]. No setup fee; cancel under the displayed policy.”

### Pause/cancel

> “Choose full service, seasonal pause, or cancellation after reviewing price, access, retention, and resume consequences. Nothing changes until you confirm.”

### Golfer goal

> “You want to [outcome] because [reason]. [Context] shapes how we begin.”

### Starting point

> “What already works: [strength]. The pattern limiting [goal] is [observation]. [Evidence source and limit].”

### Recommendation

> “I recommend [phase] first because [reason]. We will look for [signals]. This does not yet promise [limit].”

### Uncertainty/setback

> “What happened: [fact]. What we know: [evidence]. What remains uncertain: [limit]. Next: [action] and [reassessment].”

### Progress/completion

> “[Change] appeared in [context] at [maturity/reliability]. It does not yet prove [limit]. I recommend [continue/revise/pause/independent practice] because [reason].”

### Golfer package

> “[Package] supports [phase] through [inclusions/cadence]. It costs [price/currency]. At completion, [review/choices]. You may [begin], [ask], [wait], or [other path].”

### Milestone

> “[Achievement] matters because [goal connection]. Evidence: [source]. Limitation: [limit]. This stays private unless you choose otherwise.”

## Reading and comprehension goal

`[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]` Aim for plain language that a broad adult audience can understand on first reading; use roughly Grade 8 readability only as a diagnostic, never as a replacement for participant comprehension or precise golf meaning.

`[REAL-WORLD VALIDATION REQUIRED]` Test unaided retell with target instructors and golfers across golf knowledge, language confidence, age, and access needs. Instructors must explain product job, work, price, and first action; golfers must explain goal, evidence limit, phase, package purpose, and alternatives.

## Prototype and design-review protocol

1. Keyboard-only walkthrough from acquisition through signup, authoring, preview/share, golfer action, and account exit.
2. Screen-reader structure/control-name review when a semantically testable artifact exists.
3. 200% text/zoom and 400%/320-equivalent reflow review.
4. Reduced-motion and no-video variants.
5. Contrast review of every fictional coach theme/state.
6. Touch-target and pointer-alternative review.
7. Captions, transcript/description, and media-control review.
8. Long/short text, text spacing, and expanded-label review.
9. Signup errors, incomplete content, unauthorized, unavailable action, private, share failure, trial/paid, pause/cancel, and resume scenarios.
10. Representative participant testing plus specialist audit for needs absent from the sample.

## Acceptance rule

Any failure that hides or blocks product purpose, required work, platform price/terms, signup, authoring, error recovery, account exit, golfer goal, coach reasoning, evidence limits, package terms, ethical alternatives, privacy, or the primary task is critical and blocks approval. Record method, artifact version, result, defect, owner, and retest.

## Aaron review decision

Aaron should review the WCAG 2.2 AA candidate target, stronger focus/target goals, self-serve form/account requirements, coach/platform voices, patterns, and test protocol. Legal applicability and conformance remain real-world work.
