# Prototype Scope

**CURRENT DRAFT STATUS:** Revised paired prototype plan with visual preparation pack and future local-rendering prompt  
**REAL-WORLD STATUS:** No Figma prototype or test result exists  
**AARON APPROVAL STATUS:** `AUTH-001` permits visual concept preparation; `AUTH-002` permits prompt preparation for a future local React/Node rendering; exact scope, artifact, gate, and assumptions remain unapproved  
**Depends on:** [Assumption-Driven Visual Prototype Brief](ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md), [Visual Prototype Copy and Content](VISUAL_PROTOTYPE_COPY_AND_CONTENT.md), [Figma File Plan](../05_visual_design/FIGMA_FILE_PLAN.md), [Self-Serve Instructor Activation](../04_wireframes/SELF_SERVE_INSTRUCTOR_ACTIVATION.md), [Post-Assessment Roadmap](../04_wireframes/POST_ASSESSMENT_ROADMAP.md)  
**Decision status:** `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`

## Prototype thesis

`[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`

The first high-fidelity prototype must test two connected experiences:

1. whether a qualified instructor can understand, begin, configure, author, preview, and simulate sharing a first roadmap without human onboarding; and
2. whether a golfer can understand that roadmap and evaluate the connected lesson package without pressure.

A conversion-only golfer prototype cannot validate the self-serve business. An activation-only authoring prototype cannot validate the promised golfer outcome.

## Authorized artifact form

Aaron clarified that this prototype is visual and experience-led rather than a true usable MVP. `AUTH-001` prepared a Figma-oriented click-through specification with preset content and simulated state changes. `AUTH-002` now prepares a future implementation-agent prompt to render the same experience locally with React and Node.js after the design gate is explicitly approved.

React/Node is a prototype-only owner constraint, not a production architecture choice. No code execution, working account, persistence, real share, booking, payment, billing, cancellation, security phase, formal testing phase, or production technical architecture is currently authorized.

The [Assumption-Driven Visual Prototype Brief](ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md) makes the visual scope executable without unanswered owner questions while preserving every choice as provisional.

## Prototype A — acquisition and instructor activation

### Canonical path

```text
Landing promise → how it works → realistic sample → compatibility
→ Solo price/FAQ → trial/signup → coach identity → package/link
→ first golfer/goal → assessment/evidence → phases/recommendation
→ golfer preview → share review → simulated success → minimal return
```

### In-scope interactions

- Navigate from problem/outcome to sample and price.
- Inspect coach input versus golfer output.
- Expand FAQ with keyboard-equivalent behavior annotated.
- Simulate candidate signup; no account is created.
- Enter synthetic or participant-supplied non-identifying test content.
- Skip optional logo/media/measurement fields.
- Add one fictional package and external link.
- Complete structured assessment and phases.
- Review completeness, correct an error, and preview the exact golfer flow.
- Simulate share, failure, and success; nothing is sent.
- Return to the minimal product state.
- Inspect candidate trial, paid, pause, cancel, and resume concepts without changing real state.

### Required variants

- Sample media unavailable → static/text equivalent.
- Existing account/recovery.
- No logo and invalid brand asset.
- Package missing fact; invalid link; contact alternative.
- Optional evidence absent; required assessment content missing.
- No appropriate package recommendation.
- Preview with one material blocker.
- Share cancelled, failed, pending/duplicate, successful.
- First-loop empty, incomplete, complete return states.
- Trial end, explicit paid choice, active, seasonal pause, cancel, resume.

## Prototype B — golfer roadmap and package decision

### Canonical path

```text
Private welcome → desired outcome → starting point → important barriers
→ development roadmap → recommended first phase
→ lesson-package recommendation → clear next action
```

### In-scope interactions

- Move forward/back without losing context.
- Inspect selected evidence and its limitation.
- Understand phase sequence and current recommendation.
- Evaluate package purpose, inclusions, synthetic coach price/terms, and external next action.
- Choose simulated continue, ask, wait, or decline.
- Encounter text-only, limited-evidence, unavailable-link, and unauthorized states.
- Review privacy/external-handoff language.

### Required variants

- Narrow and wide layouts; long and short truthful content.
- No media and limited evidence.
- Incorrect goal/correction path.
- No recommendation/reassessment path.
- Package unavailable and external-link failure.
- Ask/wait/decline/independent-practice alternatives.
- Unauthorized or expired private access.
- Keyboard/focus, zoom/reflow, reduced-motion, and media-alternative annotations.

## Connection between prototypes

The instructor preview opens the exact golfer content/version used in Prototype B. Share success does not imply purchase. The golfer package action leads to a clearly simulated external handoff and cannot alter an instructor subscription state.

```text
Instructor field or choice → preview location → golfer content → golfer retell/action
```

## Out of scope

- Production website, functional SaaS product, or deployable MVP. A future local React/Node rendering may proceed only after the gate and exact owner authorization in its prompt.
- Real signup, authentication, payment, billing, email, message, share, booking, or account change.
- Real golfer data, coach brands, testimonials, customer results, or accepted-price claims.
- Complete dashboard, CRM, academy administration, or analytics suite.
- Native booking/payment, integrations, media storage, or technical architecture.
- Automated diagnosis, methodology, or recommendations.
- Custom branding or founder setup.
- Full living journey, renewal, or referral prototype; later screens may appear only as marked context.
- Scaled acquisition, commercial lift, retention, and economics proof.

## Content authority

- Direction/scope come from [Business Plan V2](../00_source/BUSINESS_PLAN_V2.md).
- Platform price appears as **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month per instructor**.
- Candidate 14-day trial and **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $15/month pause** are simulated recommendations.
- Coach-package price/terms are fictional content from [Synthetic Golfer Profile](SYNTHETIC_GOLFER_PROFILE.md), not platform pricing.
- No reaction becomes evidence until a versioned session is recorded.

## Navigation and state model

- Acquisition provides clear routes to sample, price, FAQ, and start.
- Activation uses one task at a time with back, save/return expectation, step context, and edit.
- Preview uses golfer order and edit links.
- Share requires confirmation and accurate simulated status.
- Golfer narrative avoids forced linear traps.
- Alternatives, cancel, close, and restart are visible where relevant.
- Restart resets only synthetic state and warns the moderator.

## Responsive and accessibility expectations

- Test primary tasks at narrow and wide layouts.
- Preserve hierarchy, labels/errors, price/terms, preview order, golfer reasoning, package terms, and alternatives.
- No essential task depends on horizontal drag, hover, or split pane.
- Figma must annotate heading/focus order, control names, error association, media alternatives, zoom/reflow, target size, reduced motion, and status announcements.
- Figma can support visual/interaction testing but cannot prove semantic conformance.

## Primary research questions

### Acquisition and activation

1. Can an unexposed instructor explain customer, outcome, mechanism, inputs, compatibility, price, and first action?
2. Can the instructor distinguish coach input from golfer output?
3. Is **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month** and cancel context understood?
4. Can minimum identity/package setup be completed without help?
5. Can standard prompts produce a credible assessment and phase sequence?
6. Can the instructor recover and distinguish optional/deferred content?
7. Can they preview and simulate sharing within the effort hypothesis?
8. Can they explain return and seasonal account states?

### Golfer outcome

9. Can the golfer retell goal, starting point, barriers, first phase, package purpose, terms, and alternatives?
10. Does it feel personal for substantive reasons?
11. Are evidence limits and directional phases understood?
12. Is the coach visibly responsible?
13. Can the golfer continue, ask, wait, or decline without pressure?
14. Do limited/error/access states preserve meaning and trust?

## Deliverables

- Versioned acquisition/activation and golfer visual prototypes; any local React/Node rendering remains a review artifact, not product implementation evidence.
- Flow/state map and responsive annotations.
- Test scripts/task IDs and participant records with assistance.
- Findings by severity and acceptance scorecard.
- Aaron-review board with exact version and unresolved questions.

## Acceptance boundary

Success can support clarity, credibility, personal relevance, tested usability, ethical presentation, and plausibility of unassisted activation. It does not validate demand, live payment, commercial lift, retention, seasonality, support economics, production feasibility, compliance, or technical choices.

## Completion checklist

- [x] Paired scope and connection defined.
- [x] Acquisition, sample, price, signup, activation, preview, share, return, golfer decision, and account states included.
- [x] Real operations and technical choices excluded.
- [x] Assumption-driven frame contract, visual defaults, simulation boundary, and exact copy prepared.
- [x] Future local React/Node implementation-agent prompt prepared; execution remains blocked.
- [ ] Figma prototypes exist.
- [ ] 8 instructors, 10 golfers, and 5 authenticity reviewers complete sessions or limitations are recorded.
- [ ] Accessibility/design review completed.
- [ ] Exact version accepted/revised and Aaron decides.

**DESIGN READINESS STATUS: NOT APPROVED**
