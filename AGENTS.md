# Standing Rules for AI Agents

This repository is authorized for full production SaaS implementation under `AUTH-005`, effective 2026-08-07. The historical [DESIGN_READINESS_GATE.md](DESIGN_READINESS_GATE.md) is retained for provenance but no longer blocks product, architecture, implementation, security, testing, deployment, or operational work.

## Business-source authority

- [00_source/BUSINESS_PLAN.md](00_source/BUSINESS_PLAN.md) is preserved unchanged as historical Business Plan V1.
- [00_source/BUSINESS_DIRECTION_CHANGE_SELF_SERVE_SAAS.md](00_source/BUSINESS_DIRECTION_CHANGE_SELF_SERVE_SAAS.md) is the authoritative amendment effective 2026-08-03.
- [00_source/BUSINESS_PLAN_V2.md](00_source/BUSINESS_PLAN_V2.md) is the current authoritative business source.
- When Business Plan V1 and Business Plan V2 conflict, agents must follow Business Plan V2 and must identify V1-only material as historical or superseded.
- The approved direction is a Canada-wide, self-serve B2B SaaS product for individual golf instructors. Pricing, packaging, seasonality, simulated owner choices, and numeric targets remain unapproved or unvalidated unless Aaron explicitly records otherwise.

## Prototype-preparation authority

- `AUTH-001` records Aaron's authorization to prepare every document needed for one assumption-driven **visual and experience prototype**, not a usable MVP.
- The canonical preparation artifacts are [06_prototype/ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md](06_prototype/ASSUMPTION_DRIVEN_VISUAL_PROTOTYPE_BRIEF.md) and [06_prototype/VISUAL_PROTOTYPE_COPY_AND_CONTENT.md](06_prototype/VISUAL_PROTOTYPE_COPY_AND_CONTENT.md).
- Those artifacts may freeze unanswered choices for concept preparation, but they do not approve the choices, authorize the Figma artifact without a request, validate the experience, change the design-readiness gate, or authorize application code.
- `AUTH-002` records Aaron's authorization to prepare [08_implementation_handoff/PROTOTYPE_IMPLEMENTATION_AGENT_PROMPT.md](08_implementation_handoff/PROTOTYPE_IMPLEMENTATION_AGENT_PROMPT.md) for a future local React/Node.js interactive rendering. It does not authorize execution before the design gate.
- React/Node is owner-specified for that local prototype medium only and must not be treated as production architecture.
- If later authorized, the interactive prototype must remain local, synthetic, simulated, and explicitly labelled `ASSUMPTION-DRIVEN LOCAL PROTOTYPE — NOT APPROVED` until Aaron approves the exact version.
- Under `AUTH-002`, security work and formal, extensive, or automated testing were deferred until Aaron explicitly authorized the next phase. `AUTH-005` supplied that later authority for the bounded production V1. This does not weaken system, tool, sandbox, or filesystem safety rules.

## Production implementation authority

- `AUTH-005` records Aaron's instruction: “Lets remove all gates, I want you to full implement a production SaaS.”
- `AUTH-005` supersedes the repository's documentation-only and phase-gate restrictions and authorizes production planning, architecture selection, application code, schemas, integrations, security engineering, automated and manual testing, deployment assets, infrastructure configuration, and production release work needed for the bounded Canada-wide self-serve V1.
- Agents may make and record implementation decisions when Aaron has not specified a preference, while preserving the approved business direction and explicit product boundaries in Business Plan V2.
- Security, privacy, accessibility, testing, observability, backup, recovery, ethical-sales, and truthful-operation requirements remain release requirements. They are not removed by retiring approval gates.
- Paid purchases, domain registration, customer communications, production credentials, and other material external effects remain subject to applicable system/tool approvals and available owner accounts. No repository instruction can waive those safeguards.
- For Sites project `appgprj_6a76957326fc819196ebf3a0c95f1ec3`, agents must not call the generic Sites `get_site` operation because its response can include the live SIWC bypass bearer. Use value-safe project listing, version, deployment-status, access, environment, and log operations instead. Do not generate, rotate, display, persist, or use a SIWC bypass bearer without exact owner authorization for that operation; suppress and discard any replacement returned by an authorized rotation.

- Agents may organize, critique, summarize, create planning documents, and implement the production SaaS within `AUTH-005`.
- Agents may create application code, coded prototypes, automated tests, database schemas, integrations, deployment files, infrastructure files, and framework/package-manager structures required by the production implementation.
- Agents may select and document technical architecture, frameworks, databases, hosting, authentication, media storage, payments, and other providers consistent with the approved business direction and production requirements.
- Agents may not resolve `[OWNER INPUT REQUIRED]` items without Aaron’s explicit decision.
- Agents must label business-plan facts, external evidence, assumptions, and recommendations distinctly.
- Agents must not overwrite approved design decisions; propose a superseding decision in [DECISION_LOG.md](DECISION_LOG.md) instead.
- Exploratory Figma concepts are not approved designs unless Aaron labels and records approval.
- Agents must preserve [00_source/BUSINESS_PLAN.md](00_source/BUSINESS_PLAN.md) unchanged and must not silently rewrite source history.
- Agents must use `[SUPPORTED BY BUSINESS PLAN V2]`, `[SIMULATED OWNER DECISION — REQUIRES AARON REVIEW]`, `[PRICING HYPOTHESIS — REQUIRES VALIDATION]`, `[UNVALIDATED BUSINESS ASSUMPTION]`, and `[REAL-WORLD VALIDATION REQUIRED]` accurately in current planning artifacts.
- Agents must stop after completing the assigned task or reaching another valid terminal condition. Completing a planning artifact does not by itself prove production readiness or authorize an otherwise out-of-scope material external effect; implementation and deployment work within `AUTH-005` remain authorized.
