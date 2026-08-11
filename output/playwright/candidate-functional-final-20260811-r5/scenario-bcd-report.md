# Acceptance Scenarios B–D browser QA report

**Candidate:** `candidate-functional-final-20260811-r5`  
**Source identity:** `3bd41168b2b7116c547a6ba947f37297a6121220936fb8d8e32c3ae7bcfbe492`  
**Authoritative automated baseline:** 489/489  
**Origin:** `http://127.0.0.1:4175` (exact PID 18168 when this session began)  
**Result:** `INVALIDATED PARTIAL EVIDENCE ONLY — B INCOMPLETE; C/D NOT STARTED`

## Candidate-wide stop

The root coordinator stopped this work after independent exact-candidate browser
sessions confirmed two release-blocking defects: Scenario A reached a dead end after
a successful staged golfer save, and Scenario G produced an expired-state 404
console/network error. Those findings invalidate r5 candidate acceptance regardless
of the partial B observations below. This report does not accept Scenario B, C, D,
any A–H scenario, or the overall goal.

## Scenario B partial observations

Session `bcd-b-r5` entered the isolated `standard` fixture through
`/__qa/standard/app`, used a 1440×1000 viewport, and navigated to the visible Media
destination.

- A real browser-readable synthetic PNG poster was selected through the ordinary
  file chooser and submitted through the product upload form.
- The UI reported the upload complete, showed one stored item, and rendered a
  `Ready` image card titled `r5 synthetic video poster`, including its accessible
  description, Aug 11, 2026 capture date, landscape orientation, and synthetic-only
  coach context.
- The Chromium-generated `bcd-b-r5-baseline-landscape.webm` was then selected through
  the ordinary file chooser. Its accessible description, down-the-line label,
  capture date, landscape orientation, caption, and non-diagnostic coach context
  were filled.
- Before submission, the automation attempted to select the poster from the
  collapsed optional `<details>` control without first expanding it. Playwright
  timed out waiting for the hidden `<select>` to become visible. This is an
  automation interruption, not a product finding; no baseline-video POST was
  reached.
- The candidate-wide stop arrived while that already-issued command was waiting.
  No further interaction or mutation was performed.

Replacement, private video playback, lesson/evidence attachment, publication,
withdrawal/fallback, old-share denial, storage-failure retry, and mobile playback
therefore remain `not_recorded` for r5 Scenario B.

## Scenarios C and D

No Scenario C or D session was opened. Drill reuse/customization/two-golfer history,
practice check-in/review sourcing, manual multi-metric entry, CSV mapping/unit/partial
commit, receipt/download, and comparison evidence all remain `not_recorded`.

## Preserved diagnostic artifacts

- `bcd-b-r5-dashboard-1440.md`
- `.playwright-cli/page-2026-08-11T07-05-56-744Z.yml` — ready poster state
- `.playwright-cli/traces/trace-1786431769263.trace`
- `.playwright-cli/traces/trace-1786431769263.network`
- `.playwright-cli/traces/resources/`
- `bcd-b-r5-poster.png`
- `bcd-b-r5-baseline-landscape.webm`
- `bcd-b-r5-current-portrait.webm`
- `bcd-b-r5-replacement.webm`
- `bcd-b-r5-storage-retry.webm`

The trace was finalized and browser session `bcd-b-r5` was closed. No product
source, build, server, or candidate manifest was edited by this B/C/D work.
