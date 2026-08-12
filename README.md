# Roadmap — Golf Coaching Self-Serve SaaS

Roadmap is a Canada-wide, self-serve B2B SaaS concept for individual golf instructors. It helps a coach turn an adult golfer's goal, assessment, evidence, priorities, development phases, and existing lesson package into a private coach-branded roadmap and living coaching journey.

## Start here

Read [CURRENT_STATUS.md](CURRENT_STATUS.md) first. It is the single current-status entry point and explains:

- how the original Sol Ultra application was recovered;
- which branches contain the preserved and integrated source;
- what is actually implemented;
- what has passed clean-clone verification;
- what still blocks a controlled beta; and
- the next execution sequence.

The current production source is under [`10_production_saas/`](10_production_saas/README.md) on the recovery integration branch and will replace the broken nested-Git pointer after pull request review.

## Current position

| Dimension | Current state |
|---|---|
| Business direction | Individual-instructor, Canada-wide, self-serve SaaS |
| Production source | Recovered from the original nested repository |
| Automated verification | Clean-clone lint, typecheck, build, artifact checks, tests, and production dependency audit pass |
| Rich product functionality | Implemented candidate: roadmaps, living plans, media, drills, launch data, private sharing, OIDC boundary, and fail-closed billing test flows |
| Exact beta release | Not yet frozen or manually accepted |
| Hosted rich candidate | Not deployed |
| OpenAI Sites | Older owner-only staging/evidence only; not the final paid host |
| Checkout | Disabled until exact owner-approved commercial/provider configuration exists |
| Market validation | No completed instructor/golfer beta or payment evidence |
| Public/paid launch | Not ready or accepted |

## Source and decision authority

Use the following order:

1. [AGENTS.md](AGENTS.md) and applicable safety/tool rules.
2. Later explicit Aaron decisions recorded in [DECISION_LOG.md](DECISION_LOG.md).
3. [Business Plan V2](00_source/BUSINESS_PLAN_V2.md) and the [self-serve direction amendment](00_source/BUSINESS_DIRECTION_CHANGE_SELF_SERVE_SAAS.md).
4. Exact current source, test, release, and status records.
5. Historical planning and prototype documents according to their recorded date.
6. [Business Plan V1](00_source/BUSINESS_PLAN.md), preserved unchanged as historical source where V2 supersedes it.

`AUTH-005` authorizes production implementation. It does not validate demand, price, usability, outcomes, retention, or acquisition economics, and it does not accept a release on Aaron's behalf.

## Repository map

| Path | Purpose |
|---|---|
| `00_source/` | Historical V1, authoritative direction amendment, and Business Plan V2 |
| `01_business_foundation/` | Product, customer, value, economics, and boundaries |
| `02_market_validation/` | Research protocols and evidence log |
| `03_experience_strategy/` | Experience, content, effort, trust, and self-serve strategy |
| `04_wireframes/` | Instructor and golfer flow specifications |
| `05_visual_design/` | Visual, design-system, accessibility, and Figma planning |
| `06_prototype/` | Assumption-driven prototype specifications and test scripts |
| `07_business_validation/` | Offer, pilot, measurement, and go/no-go plans |
| `08_implementation_handoff/` | Requirements, non-goals, functional and full-live goal briefs |
| `09_local_prototype/` | Historical synthetic React prototype |
| `10_production_saas/` | Recovered real production application, migrations, tests, and operations records |
| `CURRENT_STATUS.md` | Current recovery, candidate, blocker, and next-action record |

## Product boundary

The product preserves the instructor's coaching ownership and existing tools. It is not a coach marketplace, autonomous coach, swing-diagnosis engine, general CRM, booking system, native coach-package payment processor, or outbound messaging platform.

The working planning price remains **[PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75 per month per individual instructor**. It is not an approved live offer or willingness-to-pay evidence.

## Immediate execution rule

Do not restart broad autonomous feature expansion. First import and freeze the recovered source, complete exact-candidate browser and hosted acceptance, then run a small controlled adult-instructor beta. Major scope changes should follow repeated observed evidence.

**CURRENT CONCLUSION: REAL APPLICATION RECOVERED AND CLEAN-CLONE VERIFIED; SOURCE IMPORT AND BETA ACCEPTANCE IN PROGRESS; PUBLIC/PAID RELEASE NOT READY.**
