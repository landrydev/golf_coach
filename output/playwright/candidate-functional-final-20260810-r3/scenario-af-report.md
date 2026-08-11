# Scenario A/F browser QA — invalidated partial run

- Candidate: `candidate-functional-final-20260810-r3`
- Server: `http://127.0.0.1:4175`
- Session: `af-a-fresh-r3` (closed)
- Status: **INVALIDATED — not acceptance evidence**

The run was stopped immediately on the QA coordinator's instruction after an independent Scenario E defect invalidated candidate r3. Scenario F, responsive-width coverage, keyboard/overflow checks, golfer creation/resume, roadmap preview/publish/share, and the four-phase/no-package path were therefore not executed and must be rerun against a new candidate.

## Partial Scenario A observations

1. Entered through `/__qa/fresh/app`, reached `/app`, and confirmed the fresh setup dashboard.
2. Used the settings UI to persist coach identity while leaving logo and coach-photo branding unset. The saved UI showed the intended initials fallback.
3. Used the packages UI to submit a valid coaching package.
4. The package `POST /api/packages` returned `201 Created`, and the following `/app/packages.rsc` request returned `200 OK`; nevertheless, the UI disabled the form and displayed: “Roadmap could not confirm whether the package was saved… Retry exact saved attempt.” Reference: `439c968e-b518-4cfa-94ee-0482b60f6e5c`.

That success-response/error-UI mismatch is a separate blocking diagnostic from this partial run. It was not retried because the candidate was invalidated and QA was ordered to stop.

## Console and requests

- Console review at stop: 0 messages, 0 errors, 0 warnings.
- Relevant requests: `PUT /api/profile` → 200; `POST /api/packages` → 201; subsequent `/app/packages.rsc` → 200. All recorded app/RSC requests in this partial flow were 200-series.

## Invalidated artifacts

- `af-a-fresh-dashboard-1440.md`
- `af-a-fresh-dashboard-1440.png`
- `af-a-profile-form-1440.md`
- `af-a-profile-saved-1440.md`
- `af-a-packages-empty-1440.md`
- `af-a-package-saved-1440.md`
- `af-a-package-saved-1440.png`
- `.playwright-cli/traces/trace-1786428078920.trace`
- `.playwright-cli/traces/trace-1786428078920.network`

These files are diagnostic only and do not satisfy any Scenario A or F acceptance criterion.
