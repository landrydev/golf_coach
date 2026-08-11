# Acceptance Scenarios E/G — invalidated partial report

- Candidate: `candidate-functional-final-20260811-r4`
- Origin: `http://127.0.0.1:4175`
- Source identity: `b680c92effac6af0521d1a7ed1d11f909a33721ea7f59d8fff1e25e38b7535c5`
- Exact-candidate verification recorded by the manifest: `489/489` passed
- E/G session opened: `eg-e-r4-long`
- Outcome: **INVALIDATED — no acceptance claim**

## Invalidation and stop condition

The root QA coordinator invalidated r4 because Scenario B found a Content Security Policy defect. The E/G run stopped immediately on that instruction. The active trace was saved and the only E/G browser session was closed. No Scenario G session was opened and no further UI action was taken after invalidation.

All observations below are partial evidence from the now-invalid candidate. They must not be used to accept Scenario E, Scenario G, or the candidate as a whole.

## Partial Scenario E observations

The isolated long-content QA entry authenticated as `qa.long-content@example.test` and reached the rich plan at:

`/app/coaching/plans/268bf515-bdba-40c9-ac35-c2edf8a9bf2c?tab=lessons`

At `1440 × 1000`, the visible form was used to create one truthful scheduled lesson:

- Title: `EG r4 scheduled-to-completed representative lesson`
- Purpose: `Review centered contact under one ordinary target constraint without claiming a booking outcome.`
- Phase: the current centered-contact phase
- Initial state: `Scheduled`
- Scheduled date/time: `2026-08-15T09:30`
- Next check: `Complete only after recording the observed lesson and bounded sources.`
- Phase connection: `Scheduled within the current centered-contact phase.`

Observed results before invalidation:

- `POST /api/plans/268bf515-bdba-40c9-ac35-c2edf8a9bf2c/coaching/lessons` returned `201 Created`.
- The following workspace refresh returned `200 OK`.
- Browser console inspection reported `0` errors and `0` warnings at that checkpoint.
- The UI announced `Lesson record created.`
- The creation form reset to blank/default values.
- The new lesson was visible as `scheduled`, dated August 15, 2026.
- Plan revision changed from `15` to `16`; the visible lesson count changed from `2` to `3` and timeline count from `10` to `11`.
- The new lesson editor opened at DOM deep-link target `workspace-lesson-278ca649-47a7-4953-8fcc-5a5339646c99` and exposed lifecycle, observed-detail, evidence-selection, and measurement-session controls.
- The Evidence tab opened and exposed the coach-observation, golfer-report, measurement, outcome-count, media, comparison, and note types. No evidence mutation was submitted before invalidation.

The required scheduled-to-completed transition, attached evidence and measurement, all source-first review cases, milestone/history verification, publication invalidation/republish, and final console/network checks remain incomplete.

## Scenario G status

Scenario G was not started. No public golfer, responsive viewport, keyboard/touch, overflow/reflow, reduced-motion, media fallback, lifecycle-share, or print-media result was collected for acceptance.

## Preserved artifacts

- Dashboard screenshot: [`eg-e-r4-dashboard-1440.png`](eg-e-r4-dashboard-1440.png)
- Browser trace: [`.playwright-cli/traces/trace-1786430007633.trace`](.playwright-cli/traces/trace-1786430007633.trace)
- Network trace: [`.playwright-cli/traces/trace-1786430007633.network`](.playwright-cli/traces/trace-1786430007633.network)
- Trace stacks: [`.playwright-cli/traces/trace-1786430007633.stacks`](.playwright-cli/traces/trace-1786430007633.stacks)
- Lesson-entry snapshot: [`.playwright-cli/page-2026-08-11T06-33-54-315Z.yml`](.playwright-cli/page-2026-08-11T06-33-54-315Z.yml)
- Post-create snapshot: [`.playwright-cli/page-2026-08-11T06-36-53-563Z.yml`](.playwright-cli/page-2026-08-11T06-36-53-563Z.yml)
- Open lesson-editor snapshot: [`.playwright-cli/page-2026-08-11T06-37-30-470Z.yml`](.playwright-cli/page-2026-08-11T06-37-30-470Z.yml)
- Evidence-panel snapshot: [`.playwright-cli/page-2026-08-11T06-38-01-125Z.yml`](.playwright-cli/page-2026-08-11T06-38-01-125Z.yml)

## Cleanup and residual state

- Closed session: `eg-e-r4-long`
- No other E/G session was opened.
- The synthetic scheduled lesson above remains persisted in the invalidated r4 long-content fixture. It was created through the browser UI only; no direct database operation was used.
- No source, build, server, or candidate-manifest file was edited by this E/G run.
