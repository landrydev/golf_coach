# Scenario A/F browser QA — invalidated partial run

- Candidate: `candidate-functional-final-20260811-r4`
- Server: `http://127.0.0.1:4175`
- Session opened: `af-a-fresh-r4`
- Session closed: `af-a-fresh-r4`
- Status: **INVALIDATED — no acceptance claim**

The QA coordinator invalidated r4 because of a Scenario B CSP defect and directed all browser work to stop. The partial Scenario A artifacts below are diagnostic only. Scenario F was not started.

## Partial work completed before invalidation

1. Entered through the fresh scenario route and captured the empty desktop dashboard.
2. Persisted coach identity through the settings UI while leaving optional logo and coach-photo branding unset; the UI retained the initials fallback.
3. Created the optional `Foundation rebuild` package through the UI. The package appeared in the current-package list with the confirmed success status.
4. Created the minimum golfer/goal draft for `Jordan Rivers`; the UI displayed `Resumable golfer draft saved.`

The interruption/resume proof, remaining roadmap authoring, exact preview, publish/share/golfer-open path, no-package path, all responsive/keyboard/touch/overflow checks, and all Scenario F work were not completed. Console and request review was interrupted when the candidate was invalidated and is not claimed.

## Invalidated artifacts

- `af-a-fresh-dashboard-1440.md`
- `af-a-fresh-dashboard-1440.png`
- `af-a-profile-form-1440.md`
- `af-a-profile-saved-1440.md`
- `af-a-package-form-1440.md`
- `af-a-package-saved-1440.md`
- `af-a-package-saved-1440.png`
- `af-a-golfers-empty-1440.md`
- `af-a-new-golfer-minimum-1440.md`
- `af-a-staged-step2-1440.md`
- `af-a-staged-post-save-check.md`
- `.playwright-cli/traces/trace-1786429987684.trace`
- `.playwright-cli/traces/trace-1786429987684.network`

These files do not satisfy any Scenario A or F acceptance criterion and must not be promoted as final-candidate evidence.
