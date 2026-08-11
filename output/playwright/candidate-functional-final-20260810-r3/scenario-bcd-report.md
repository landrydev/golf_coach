# Acceptance Scenarios B–D browser QA report

**Candidate:** `candidate-functional-final-20260810-r3`  
**Origin:** `http://127.0.0.1:4175`  
**Fixture identity:** `standard` / Coach Rowan  
**Result:** `INVALIDATED — B PARTIAL, C/D NOT EXECUTED`

The r3 exact candidate was invalidated by separate real-browser findings before
Scenarios B–D could be completed: a real Scenario E lesson-reset crash and a
potential Scenario A package response-recovery defect requiring investigation. The
coordinating agent ordered an immediate stop. Nothing in this report is acceptance
evidence for B, C, D, or the candidate as a whole.

## Scenario B partial observation

Session `bcd-b` opened the real `standard` coach workspace at 1440×1000, navigated
through the visible **Media** link, and reached the private media upload form. Four
genuinely browser-generated synthetic WebM files were saved only under this
candidate's `.playwright-cli` artifact directory:

- `bcd-b-baseline-landscape.webm` — 640×360 source canvas, 20,132 bytes.
- `bcd-b-current-portrait.webm` — 360×640 source canvas, 6,372 bytes.
- `bcd-b-replacement-landscape.webm` — 800×450 source canvas, 3,342 bytes.
- `bcd-b-retry-square.webm` — 480×480 source canvas, 8,577 bytes.

The baseline file was selected in the form, but **Upload privately was never
submitted**. No API write, storage write, attachment, publication, or other product
mutation occurred. The fault endpoint was not armed.

At the stop boundary:

- Browser console: 0 messages, 0 errors, 0 warnings.
- Recorded non-static requests: all returned 200; no failed request appeared.
- Keyboard, mobile, overflow, upload, attachment, playback, replacement,
  publication, prior-share invalidation, failure persistence, and retry were not
  exercised.

Partial, invalidated artifacts:

- `bcd-b-dashboard-1440.md`
- `bcd-b-invalidated-file-selected-1440.md`
- `bcd-b-invalidated-file-selected-1440.png`
- `.playwright-cli/traces/trace-1786428179805.trace`
- `.playwright-cli/traces/trace-1786428179805.network`
- `.playwright-cli/traces/resources/`

The trace was stopped cleanly and browser session `bcd-b` was closed.

## Scenarios C and D

Sessions for C and D were never opened. No drill, assignment, check-in, review,
manual metric, CSV import, comparison, publication, or golfer-view operation was
attempted.

## Required disposition

Treat all B/C/D results as `not_recorded` for r3. After the candidate-wide defects
are corrected, create a new source-bound candidate and rerun B, C, and D sequentially
from fresh isolated `standard` state.
