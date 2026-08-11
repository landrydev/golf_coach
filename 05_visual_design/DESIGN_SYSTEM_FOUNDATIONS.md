# Design System Foundations

**CURRENT DRAFT STATUS:** Revised Figma foundation plan  
**REAL-WORLD STATUS:** No Figma variables, components, screens, or accessibility verification completed  
**AARON APPROVAL STATUS:** `AUTH-001` permits documentation of prototype-only visual defaults; foundations and exact patterns remain unapproved  
**Depends on:** [Visual Direction](VISUAL_DIRECTION.md), [Accessibility and Content Guidelines](ACCESSIBILITY_AND_CONTENT_GUIDELINES.md)  
**Decision status:** `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`

## Purpose

Define a small reusable visual and interaction grammar for acquisition, instructor activation, account states, and golfer storytelling. This is a Figma plan, not a code library, architecture, or production-token decision.

## Foundation model

Use four levels:

1. **Primitives:** candidate color, type, spacing, radius, border, elevation, and motion values.
2. **Semantic roles:** text, surface, action, focus, error, success, privacy, evidence, coach accent, and account state.
3. **Patterns:** message sections, sample annotations, price, forms, step guidance, preview, story chapters, package, share, account state, and notices.
4. **Flow compositions:** acquisition, instructor activation, golfer conversion, and later lifecycle flows.

No primitive or pattern is approved merely because it exists. It must appear in a named flow and pass content, state, and access review.

The [Assumption-Driven Visual Prototype Brief](../06_prototype/ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md) supplies a small provisional value set for the first concept. Treat those values as expendable Figma inputs, not production tokens, approved foundations, or implementation requirements.

## Experience modes

| Mode | Primary job | Density | Leading behavior |
|---|---|---|---|
| Calm Product Utility | Explain, configure, author, preview, share, manage account | Moderate and task-led | Clear forms, price, status, error, example, one action |
| Quiet Editorial Performance Portfolio | Help a golfer understand goal, evidence, sequence, package, progress | Lower and narrative-led | Editorial headings, coach note, selected evidence, chapter rhythm |

Shared semantic roles and access rules prevent disconnected brands.

## Candidate type roles

| Role | Use | Rule |
|---|---|---|
| `Type/Display` | Acquisition outcome or golfer chapter title | Short; never required for form comprehension |
| `Type/Heading` | Page and section structure | Maps to a real heading level later |
| `Type/Body` | Explanation, coach narrative, FAQ, terms | Optimized for long form and zoom |
| `Type/Label` | Form/control and evidence label | Specific; never placeholder-only |
| `Type/Action` | Buttons and links | Visible text matches accessible name later |
| `Type/Meta` | Source, date, optional/deferred, status | Legible; not hidden fine print |
| `Type/Number` | Price or measurement | Currency/context stays adjacent |

Exact families, weights, and sizes remain visual hypotheses.

## Layout roles

- `Space/Field`: label, instruction, input, validation, and error remain grouped.
- `Space/Task`: separates activation decisions.
- `Space/Section`: separates acquisition or golfer chapters.
- `Space/Evidence`: binds evidence, interpretation, and limit.
- `Layout/Reading`: comfortable story measure.
- `Layout/Task`: single input column with optional wide contextual rail.
- `Layout/Preview`: distinct but ordered exactly like end-user output.
- `Layout/Full`: acquisition/account shell with readable inner measures.

Breakpoint changes must not reorder price terms or alternatives.

## Protected color roles

| Role | Purpose | Rule |
|---|---|---|
| `Surface/Base` | Acquisition/task background | Supports text and focus |
| `Surface/Reading` | Golfer story | Supports long-form contrast |
| `Surface/Subtle` | Help/grouping | Never implies disabled alone |
| `Text/Primary` | Essential meaning | Not coach-overridden |
| `Text/Secondary` | Supporting detail | Meets applicable contrast |
| `Action/Primary` | Leading action | Does not hide alternatives |
| `Focus/Visible` | Keyboard focus | Never obscured/overridden |
| `Status/Error` | Invalid/blocking issue | Text/icon accompany color |
| `Status/Success` | Accurate completion | Never implies an unobserved sale |
| `Status/Attention` | Incomplete/pause/review | Neutral, non-shaming |
| `Privacy/Private` | Access/share context | Always text-labelled |
| `Evidence/*` | Source/maturity | Not a color-only grade |
| `Coach/Accent` | Identity cue | Constrained by contrast/hierarchy |

## Shape, stroke, elevation, and motion

- Modest radii and borders group without a card wall.
- Elevation is rare and reserved for real overlays.
- Focus is explicit, not simulated by hover.
- Motion supports orientation only and has a static equivalent.
- No confetti, pulsing CTA, countdown, scroll-jacking, or motion-only comparison.

## Figma pattern inventory

### Acquisition and account

- `Marketing/Hero`
- `Marketing/HowItWorks`
- `Sample/CoachInputToGolferOutput`
- `Pricing/SoloPlan`
- `FAQ/Disclosure`
- `Account/TrialStatus`
- `Account/PaidStatus`
- `Account/PauseOption`
- `Account/CancelledState`
- `Account/ResumeState`

### Instructor activation

- `Flow/StepHeader`
- `Form/Field`
- `Form/RequiredOptional`
- `Form/Example`
- `Form/ErrorSummary`
- `Identity/BasicPreview`
- `Package/Summary`
- `Evidence/OptionalInput`
- `Roadmap/PhaseEditor`
- `Preview/GolferView`
- `Share/RecipientSummary`
- `Status/ActivationSuccess`
- `Home/FirstLoopReturn`

### Golfer story

- `Story/Header`
- `Story/Goal`
- `Coach/Note`
- `Evidence/ItemAndLimit`
- `Roadmap/PhaseSequence`
- `Recommendation/FirstPhase`
- `Package/Recommendation`
- `Action/PrimaryAndAlternatives`
- `Progress/Claim`
- `Setback/TruthPattern`
- `Review/PhaseCompletion`
- `Share/PrivatePreview`

### Shared

- `Navigation/Minimal`
- `Status/Notice`
- `Privacy/AccessNotice`
- `External/HandoffWarning`
- `Media/AccessibleEvidence`
- `Error/PrivateSafe`

## Required states

Where applicable include default, hover, focus, pressed, selected, invalid, incomplete, disabled/unavailable with explanation, loading, success, long/short content, no optional content, limited data, narrow/wide, zoom/reflow annotation, keyboard order, and reduced motion.

Account patterns also require trial ending, explicit paid choice, active full price, candidate pause, cancelled, retained/read-only, and resumed. These are design states, not approved billing policy or technical behavior.

## Responsive composition

- Acquisition hierarchy stays stable.
- Forms use one main column and preserve label/instruction/error association.
- Required help is never hover-only.
- Preview defaults to golfer narrow-screen order.
- Golfer evidence remains adjacent to interpretation and limit.
- Price/terms and cancel/pause consequences remain with actions.
- No horizontal navigation or drag is the only way through phases or steps.

## Coach-brand adaptation

Create at least three fictional themes: dark-green traditional, blue contemporary, and monochrome minimal. Only logo/photo and a constrained accent change. Text, focus, error, privacy, success, surfaces, spacing, structure, and platform subscription content remain protected.

## Design QA checklist

- [ ] Pattern derives from a named requirement.
- [ ] Required, optional, deferred, error, and empty content are distinguishable.
- [ ] Instructor and golfer modes share semantic foundations.
- [ ] Price, terms, external handoff, alternatives, cancel, and pause are legible.
- [ ] Coach branding cannot break hierarchy or contrast.
- [ ] Keyboard, focus, zoom/reflow, media alternative, and reduced-motion notes exist.
- [ ] No speculative analytics dashboard, team administration, checkout, or custom-site pattern was added.
- [ ] Exact tested frame/version is traceable.

## Aaron review decision

Aaron should review the two-mode foundation, protected roles, pattern inventory, account states, and coach-theme boundary. No Figma or implementation artifact is approved by this plan.
