# Scenario A/F browser QA — blocked and invalidated

- Candidate: `candidate-functional-final-20260811-r5`
- Server: `http://127.0.0.1:4175`
- Session opened and closed: `af-a-fresh-r5`
- Scenario F session: not opened
- Status: **BLOCKED / CANDIDATE INVALIDATED — no acceptance claim**

## Scenario A blocker

The fresh self-serve journey cannot continue from its durable minimum golfer save.

1. Profile and optional package creation completed through the real UI. The package appeared in the current list with `Package saved. It can now be connected to a coaching phase.`
2. On `/app/golfers/new`, valid minimum golfer and goal values were submitted through `Save basics and continue`.
3. `POST /api/golfers/staged` returned `201 Created`.
4. The browser requested `/app/golfers/aea0b56e-3910-4762-8d9c-7df760e95ecd/complete.rsc` and received `200 OK`, then immediately requested `/app/golfers/new.rsc` and received `200 OK`.
5. The visible URL remained `/app/golfers/new`. The form was disabled, the button was disabled, and the only success message was `Resumable golfer draft saved.` There was no forward control to the completion route.

This is a normal-journey navigation blocker: the promised continuation is fetched successfully but is replaced by a refresh of the old route. Console review showed 0 errors and 0 warnings, so the failed navigation is silent.

The coordinator subsequently invalidated r5 after a separate Scenario G expired-state `/r/session` 404. All artifacts in this report are therefore diagnostic only.

## Coverage stopped

Interruption/resume, three-phase authoring, exact preview, publish/share/golfer open, no-package/text-first review, responsive/keyboard/touch/overflow checks, and all Scenario F controls were not executed after the blocker.

## Diagnostic artifacts

- `af-a-fresh-dashboard-1440.md`
- `af-a-fresh-dashboard-1440.png`
- `af-a-profile-form-1440.md`
- `af-a-profile-saved-1440.md`
- `af-a-package-form-1440.md`
- `af-a-package-saved-1440.md`
- `af-a-package-saved-1440.png`
- `af-a-golfers-empty-1440.md`
- `af-a-new-golfer-minimum-1440.md`
- `af-a-staged-after-save-1440.md`
- `.playwright-cli/traces/trace-1786431690626.trace`
- `.playwright-cli/traces/trace-1786431690626.network`

None of these artifacts satisfies a Scenario A or F acceptance criterion.
