# Prototype Implementation Agent Prompt — Local React/Node Interactive Experience

**PROMPT STATUS:** Ready to give to a future implementation agent  
**OWNER DIRECTION:** Aaron requested a local React/Node.js interactive rendering of the assumption-driven visual prototype  
**AUTHORIZATION STATUS:** Prompt preparation only; this file does not authorize execution while the repository design gate remains unapproved  
**PROTOTYPE TYPE:** Local, synthetic, interactive visual/experience prototype—not a production MVP  
**SECURITY AND TESTING STATUS:** Deferred until Aaron explicitly approves the prototype MVP and authorizes the next phase  
**AUTHORIZATION RECORD:** `AUTH-002` in [Decision Log](../DECISION_LOG.md) authorizes this prompt as a planning artifact only  
**Depends on:** [Assumption-Driven Visual Prototype Brief](../06_prototype/ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md), [Visual Prototype Copy and Content](../06_prototype/VISUAL_PROTOTYPE_COPY_AND_CONTENT.md), [Interaction Specification](../06_prototype/INTERACTION_SPEC.md), [Implementation Non-Goals](IMPLEMENTATION_NON_GOALS.md), [Approved Design Index](APPROVED_DESIGN_INDEX.md), [Design Readiness Gate](../DESIGN_READINESS_GATE.md)

## Copy the prompt below

You are the implementation agent for a **local-only, assumption-driven React/Node.js interactive prototype** in:

`D:\Projects\golf-coaching-design-blueprint`

Your job is to render the documented visual and experience concept as a coherent local interactive prototype. This is not a production MVP, deployable SaaS product, security exercise, or comprehensive testing phase.

## 1. Mandatory authority preflight

Before creating or changing any application, framework, package-manager, test, or infrastructure file:

1. Read the root `AGENTS.md` completely.
2. Read `DESIGN_READINESS_GATE.md` completely.
3. Inspect `DECISION_LOG.md` for the exact owner authorization governing this implementation.
4. Inspect `08_implementation_handoff/APPROVED_DESIGN_INDEX.md` for the exact approved artifact/version and scope governing this implementation.
5. Confirm that the current repository rules explicitly authorize application code and that the approved source set is identifiable.

If `DESIGN_READINESS_GATE.md` still ends with:

`DESIGN READINESS STATUS: NOT APPROVED`

or if no later owner decision explicitly authorizes this bounded coded prototype, **stop without creating code**. Also stop if the approval does not identify the exact artifact/version or documented source set to render. Report that the implementation prompt is ready but the required repository authority or source approval has not been granted. Do not infer authorization from the existence of this prompt, `AUTH-001`, `AUTH-002`, completed documentation, or Aaron's request to prepare a prompt.

Do not edit the gate yourself. Only Aaron may approve it.

If the gate and owner authorization permit the prototype, continue with the instructions below.

## 2. Required reading before implementation

Read these files completely and use them in this precedence order:

1. `AGENTS.md`
2. `DESIGN_READINESS_GATE.md`
3. `DECISION_LOG.md`
4. `08_implementation_handoff/APPROVED_DESIGN_INDEX.md`
5. Every exact artifact/version or documented source set named by the governing approval
6. `00_source/BUSINESS_PLAN_V2.md`
7. `06_prototype/ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md`
8. `06_prototype/VISUAL_PROTOTYPE_COPY_AND_CONTENT.md`
9. `04_wireframes/SELF_SERVE_INSTRUCTOR_ACTIVATION.md`
10. `04_wireframes/POST_ASSESSMENT_ROADMAP.md`
11. `06_prototype/SYNTHETIC_GOLFER_PROFILE.md`
12. `04_wireframes/SCREEN_STATE_RESPONSIVE_MATRIX.md`
13. `06_prototype/INTERACTION_SPEC.md`
14. `05_visual_design/VISUAL_DIRECTION.md`
15. `05_visual_design/DESIGN_SYSTEM_FOUNDATIONS.md`
16. `05_visual_design/ACCESSIBILITY_AND_CONTENT_GUIDELINES.md`
17. `08_implementation_handoff/IMPLEMENTATION_NON_GOALS.md`

When documents differ:

- Root `AGENTS.md`, the signed gate, and the governing owner decisions control authorization and operating boundaries.
- Business Plan V2 controls the current business direction.
- The exact artifact/version and conditions recorded in the Approved Design Index control approved visual and experience decisions.
- The assumption-driven prototype brief controls prototype scope, frame IDs, visual defaults, and simulation boundaries only where a later approved decision or artifact has not superseded a provisional choice.
- The visual-prototype copy deck controls acquisition and activation language.
- The post-assessment roadmap controls golfer-facing copy.
- No convenience may turn a simulated operation into a real one.

Do not resolve `[OWNER INPUT REQUIRED]` items or invent decisions. Use any expressly approved decision first; otherwise use `VP-A01` through `VP-A16` exactly as provisional prototype defaults and preserve their review-required status. Record any implementation interpretation in the handoff instead of expanding scope. Stop and request owner direction only if an unresolved conflict makes the approved bounded rendering impossible.

## 3. Required outcome

Create a local interactive prototype that lets a reviewer click through:

1. product landing and explanation;
2. the synthetic sample roadmap;
3. compatibility and preparation;
4. Solo pricing, trial, seasonality, and FAQ;
5. simulated signup;
6. coach identity;
7. package setup;
8. first golfer and goal;
9. starting assessment;
10. roadmap phases and first recommendation;
11. exact golfer preview;
12. simulated share review and success;
13. minimal roadmaps return state;
14. trial, pause, cancellation, and resume concepts;
15. the complete eight-screen golfer roadmap; and
16. the ten critical alternate states `ST-01` through `ST-10`.

Implement the 34 frame IDs defined in the prototype brief, or consolidate screens only when every frame remains directly reachable and its intended question, state, and outcome stay distinct.

The experience must work as a reviewable visual narrative at approximately:

- narrow/mobile: 390 pixels wide; and
- wide/desktop: 1440 pixels wide.

This does not require production responsive coverage.

## 4. Technical boundary

Aaron has specified React and Node.js **for this local prototype only**. This is not a production-stack or architecture decision.

Use:

- React for the browser interface;
- Node.js for the local runtime/server;
- the smallest practical dependency set;
- static synthetic content and deterministic preset states;
- component or browser-session memory only; a refresh may reset the prototype;
- local assets or CSS-created placeholders only; and
- one documented local command that starts the experience.

Prefer a simple structure over production architecture. Do not introduce a database, persistent API, authentication service, worker, queue, cloud service, container, deployment system, analytics system, telemetry, external integration, or remote dependency at runtime.

Do not treat this prototype medium as a recommendation for the future product.

## 5. Local-only and synthetic-data rules

- Bind and present the prototype for local use only.
- Use only the fictional Maya Bennett, Bennett Golf Coaching, and Mark Chen scenario.
- Use synthetic invalid-domain addresses and links where a value is visually required.
- Do not accept, import, store, transmit, or display real instructor, golfer, payment, contact, credential, or participant data.
- Do not call external APIs, send messages, open booking/payment providers, or fetch remote customer content.
- Do not add secrets, environment credentials, API keys, or production configuration.
- Do not claim that local-only scope makes the prototype secure.

## 6. Simulation contract

The following interactions must be visually believable but operationally fake:

- signup and sign-in;
- password entry;
- save and return;
- logo or media upload;
- package-link validation;
- roadmap generation;
- preview generation;
- email, text, link creation, or sharing;
- booking, purchasing, payment, or contact submission;
- trial start or conversion;
- pause, cancellation, retention, deletion, or resume;
- access authorization or expiry; and
- analytics, support, or outcome tracking.

Use deterministic state transitions and the exact notices in the copy deck. Before every consequential simulated action, make it clear that nothing will be created, saved, sent, booked, paused, cancelled, or charged.

Do not implement hidden real behavior behind a simulated interface.

## 7. Visual and content fidelity

Use the prototype-only visual kit from the brief:

- Calm Product Utility for acquisition and instructor tasks.
- Quiet Editorial Performance Portfolio for golfer screens.
- Inter for utility copy and Source Serif 4 for editorial display where available, with local/system fallbacks.
- The documented candidate colour roles, spacing, radii, restrained surfaces, and minimal motion.
- The `Roadmap` placeholder wordmark and fictional Bennett Golf Coaching identity.

Use exact content from the copy authorities. Do not create substitute marketing claims, testimonials, ratings, customer counts, performance outcomes, conversion claims, urgency, scarcity, discounts, popularity badges, or real legal copy.

All platform pricing must retain the visible prototype-hypothesis treatment associated with **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month per instructor** and the candidate **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $15/month seasonal pause**. Keep the fictional CAD $595 coach package visually and semantically separate from the SaaS price.

## 8. Interaction requirements

- Provide clear forward, back, edit, close, and restart paths.
- Preserve preset state while moving backward within the current browser session where practical.
- Make every critical alternate state reachable through an obvious prototype control or a small reviewer state menu.
- Keep reviewer-only state controls visually separate from participant-facing UI.
- Preview must render the same golfer content as the golfer path.
- Continue, ask, wait, and independent-practice choices must reach distinct neutral outcome screens.
- External handoff must stop at a preview saying nothing was booked or charged.
- Share failure must say nothing was sent and keep the simulated draft.
- No-recommendation must stop before a package recommendation.
- Unauthorized access must reveal no fictional personal content.
- Avoid autoplay, countdowns, confetti, parallax, scroll-jacking, or motion-only meaning.
- Use basic semantic elements, visible labels, sensible focus order, and ordinary keyboard activation as implementation practices; do not perform or claim accessibility testing before approval.

## 9. Explicitly excluded product work

Do not implement:

- real accounts or authentication;
- database or file persistence;
- real golfer records;
- email, SMS, sharing, or public links;
- booking, scheduling, payment, billing, invoices, taxes, refunds, or subscriptions;
- real media upload, storage, playback pipeline, or analysis;
- CRM, analytics, reports, dashboards, or revenue attribution;
- academy, facility, team, role, or permission features;
- living player journey, renewal, referral, or later lifecycle product flows beyond clearly labelled context;
- integrations, AI, automated coaching, or package recommendations;
- production hosting, deployment, CI/CD, containers, infrastructure, observability, or monitoring; or
- any production architecture decision.

## 10. Security work prohibited before prototype approval

Until Aaron explicitly approves the prototype MVP and separately authorizes a security phase, do **not**:

- design or implement production authentication, authorization, roles, sessions, password storage, or account recovery;
- add encryption, key management, secret management, HTTPS configuration, hardened headers, CSP, CORS policy, CSRF controls, rate limiting, audit logging, or production privacy controls;
- perform threat modelling, OWASP review, penetration testing, vulnerability scanning, dependency-security remediation, security hardening, or security documentation;
- add security products, scanners, middleware, or packages; or
- claim that the prototype is secure, private, compliant, or production-safe.

This instruction does not permit unsafe or destructive behavior. Continue to follow system, sandbox, filesystem, and repository safety rules. Keep the prototype synthetic and local so deferred security work is not mistaken for acceptable handling of real data.

## 11. Testing work prohibited before prototype approval

Until Aaron explicitly approves the prototype MVP and separately authorizes testing, do **not**:

- create automated tests or test fixtures;
- add Jest, Vitest, Playwright, Cypress, Testing Library, Storybook test tooling, or another test framework;
- create `tests`, `__tests__`, test-spec, snapshot, mock-server, or QA directories/files;
- run unit, integration, end-to-end, regression, visual-regression, snapshot, accessibility, compatibility, security, performance, load, stress, soak, fuzz, mutation, edge-case, or exploratory test programs;
- create CI test workflows, coverage reports, test matrices, defect campaigns, or formal QA documentation; or
- claim that the prototype has passed usability, accessibility, browser, security, performance, or production testing.

### Permitted pre-approval operability check

Only perform the minimum mechanical verification needed to hand over a runnable local prototype:

1. dependencies can be installed;
2. the project compiles or builds without an error;
3. the local Node process starts;
4. the main local URL returns the React interface; and
5. no real external operation is triggered during startup.

Do not turn this into behavioral testing. If compilation or startup fails, fix only what is necessary to compile and start. Report all flows and states as **not formally tested**.

## 12. Work discipline

- Inspect the workspace before writing and preserve all existing documentation and unrelated changes.
- Do not modify `00_source/BUSINESS_PLAN.md`.
- Do not mark any `AQ-*`, `SS-*`, `VP-A*`, design, policy, or acceptance criterion approved.
- Do not modify the design-readiness gate unless Aaron supplies the exact decision and authorization outside this prompt.
- Keep prototype code isolated from the documentation hierarchy in the exact location authorized at execution time.
- Use non-destructive file operations and the repository's required editing tools.
- Do not initialize Git, create a branch, commit, push, deploy, publish, or contact external systems unless separately requested and authorized.
- Do not browse for market evidence, libraries, visual inspiration, or product recommendations unless a missing dependency makes local startup impossible and the governing environment permits it.
- If a dependency choice is unavoidable, choose the smallest conventional option, record it as prototype-only, and do not describe it as product architecture.
- Do not expand work because a full product would normally require more.

## 13. Completion definition

Stop implementation when all of the following are true:

- The local React/Node prototype renders the documented acquisition, activation, golfer, account-concept, and alternate-state experiences.
- All 34 frame IDs are implemented or traceably consolidated.
- The exact synthetic content and price classifications are present.
- The experience works at the two reference presentation widths without obvious clipping during implementation.
- Every consequential action remains clearly simulated.
- No real data, service, integration, persistence, security subsystem, test suite, deployment, or production architecture was added.
- The permitted compile/start check succeeds, or the exact startup blocker is reported.
- The prototype is labelled `ASSUMPTION-DRIVEN LOCAL PROTOTYPE — NOT APPROVED`.

Do not proceed into security, testing, optimization, refactoring for scale, production hardening, deployment, analytics, or additional features.

## 14. Required handoff

Provide Aaron with:

- the local project location;
- the single command used to start it;
- the local URL;
- a concise route/frame map;
- files and dependencies created;
- prototype-only technical choices;
- which frame IDs were consolidated, if any;
- known visual or interaction limitations;
- confirmation that every product or business operation is simulated and all scenario data is synthetic;
- confirmation that no security work or formal testing was performed;
- the result of the limited compile/start operability check;
- confirmation that no deployment or external service was created; and
- an explicit statement that the prototype awaits Aaron's MVP review.

Then stop.

## 15. Post-approval hold

Do not begin security work, formal testing, broader QA, production architecture, or MVP hardening until Aaron sends a new explicit instruction that:

1. identifies the exact prototype version being approved;
2. states that the prototype MVP is approved; and
3. authorizes the specific next phase, such as testing, security review, or production planning.

Approval of a visual impression alone does not silently authorize every later phase.

## Current repository reminder

At the time this prompt was prepared, the repository still stated:

**DESIGN READINESS STATUS: NOT APPROVED**

Therefore this prompt is ready for future use but is not, by itself, permission to create code now.
