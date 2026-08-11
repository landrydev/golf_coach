# Acceptance Scenarios E/G — stopped partial browser report

- Candidate: `candidate-functional-final-20260810-r3`
- Server: `http://127.0.0.1:4175`
- Run date: 2026-08-11 (America/Edmonton)
- Tooling: repository-pinned Playwright CLI wrapper
- Outcome: **STOPPED — candidate defect found before Scenario E completion; Scenario G not started**

## Stop condition

The first state-changing Scenario E flow produced a real uncaught browser error after the server successfully created the record. Per the instruction to stop and report real defects immediately, no further E/G interactions were performed.

### Reproduction

Session `eg-e-long`, headed browser, viewport `1440 × 1000`:

1. Opened `http://127.0.0.1:4175/__qa/long-content/app`; the QA harness authenticated and reached `/app` as `qa.long-content@example.test`.
2. Followed the visible **New lesson** link to `/app/coaching/plans/24837357-3c07-43ba-8307-803d8bc53c59?tab=lessons`.
3. Entered the following visible form values:
   - Lesson title: `EG scheduled transfer lesson 2026-08-11`
   - Purpose: `Validate centered contact under one representative constraint.`
   - Initial state: `Scheduled`
   - Scheduled date/time: `2026-08-12T09:30`
   - Coach observation: `Scheduled through the exact-candidate browser flow; no observation claimed yet.`
4. Activated **Create lesson**.
5. The request `POST /api/plans/24837357-3c07-43ba-8307-803d8bc53c59/coaching/lessons` returned `201 Created`; the workspace refresh request returned `200 OK`.
6. The UI announced `Lesson record created.` and showed the new scheduled lesson, but the creation form remained populated.
7. Playwright console inspection reported one error and zero warnings:

   ```text
   TypeError: Cannot read properties of null (reading 'reset')
       at s (http://127.0.0.1:4175/assets/worker-entry-6qVX8Lf6.js:5:1481)
   ```

No failed network request explains the error. The server-side mutation succeeded before the client-side exception.

### Source correlation (read-only)

The obvious source match is `app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx:1125` in the lesson-create submit handler:

```tsx
await mutate(/* ... */, "Lesson record created.");
event.currentTarget.reset();
```

The awaited mutation allows the submit event's `currentTarget` to become `null` before `reset()` is evaluated. This matches both the minified stack and the visibly unreset form. Other handlers in the same file use the same post-`await` pattern and should be audited during the fix, although they were not exercised in this stopped run.

## Evidence

- Full-page frozen defect screenshot: [`eg-e-defect-lesson-reset.png`](eg-e-defect-lesson-reset.png)
- Browser trace: [`.playwright-cli/traces/trace-1786428128943.trace`](.playwright-cli/traces/trace-1786428128943.trace)
- Network trace: [`.playwright-cli/traces/trace-1786428128943.network`](.playwright-cli/traces/trace-1786428128943.network)
- Trace stacks: [`.playwright-cli/traces/trace-1786428128943.stacks`](.playwright-cli/traces/trace-1786428128943.stacks)
- Initial lesson-workspace snapshot: [`.playwright-cli/page-2026-08-11T06-03-43-175Z.yml`](.playwright-cli/page-2026-08-11T06-03-43-175Z.yml)

The Playwright session was closed after the trace and screenshot were saved.

## Acceptance impact and residual state

- Scenario E is **not accepted**: the required clean-console evidence is false, and the successful create flow leaves stale form values that create a duplicate-submission risk.
- Scenario G is **not executed** because the run stopped at the first real defect.
- Responsive, keyboard, reflow/overflow, reduced-motion, lifecycle-link, low-bandwidth/missing-media, and print/PDF evidence remain outstanding.
- The long-content QA fixture now contains the persisted scheduled lesson above. It was created through the UI only; no direct database operation was used. A rerun should use a freshly reset candidate/fixture or explicitly account for this record.
- This report is partial defect evidence only and is not a completion claim.
