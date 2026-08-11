# Scenario A/F browser QA — invalidated partial run

Candidate: `candidate-functional-final-20260811-r6`  
Source identity: `cb650bf6ee78f5a63615f2f40289b096933b3938b82c09bd001b74a1526c9e2f`  
Automated verification supplied for the candidate: 496/496  
Session opened and closed: `af-a-r6`

## Result

No Scenario A or F acceptance claim is made. The candidate was invalidated during the shared browser run by the independently confirmed blocker `BROWSER-E-MEDIA-UPLOAD-ADVERTISED-LIMIT-413`: a 2.28 MB PNG received HTTP 413 while the UI advertised an approximately 48 MB upload limit. Scenario A stopped immediately while still in progress, and Scenario F was not started.

## Partial Scenario A observations before invalidation

- Entered the isolated `fresh` fixture through the real UI.
- Saved a coach identity with business/contact context while leaving logo and coach photo unset. The initials fallback and live accent preview remained visible and useful.
- Created a truthful external coaching package. The package appeared in the current-package list, and the submitted form entered its confirmed terminal state.
- Created a three-phase coach-owned roadmap template through the real UI. The run exercised duplicate, edit, reorder, and add-phase controls before persistence.
- Created the minimum golfer/goal record through `POST /api/golfers/staged` and landed on the returned golfer's `/complete` route.
- Deliberately interrupted authoring by returning to the golfer directory. The persisted record appeared as `setup incomplete` with an exact `Continue setup` link to the same golfer ID.
- Resumed the record, selected the saved three-phase template, and applied its phase structure. The form displayed three populated phases and continued to require golfer-specific assessment and priority judgment.
- The run stopped while entering those golfer-specific fields. It did not complete preview, publication, sharing, golfer access, the second four-phase/no-package case, or responsive checks.

## Evidence

- Trace: `.playwright-cli/traces/trace-1786433846016.trace`
- Network log: `.playwright-cli/traces/trace-1786433846016.network`
- Fresh dashboard snapshot: `.playwright-cli/page-2026-08-11T07-37-39-190Z.yml`
- Confirmed package snapshot: `.playwright-cli/page-2026-08-11T07-41-07-203Z.yml`
- Persisted template snapshot: `.playwright-cli/page-2026-08-11T07-44-59-470Z.yml`
- Staged completion landing snapshot: `.playwright-cli/page-2026-08-11T07-46-51-893Z.yml`
- Interrupted golfer-directory snapshot: `.playwright-cli/page-2026-08-11T07-47-21-891Z.yml`
- Resumed completion snapshot: `.playwright-cli/page-2026-08-11T07-47-45-580Z.yml`
- Applied-template snapshot: `.playwright-cli/page-2026-08-11T07-48-57-673Z.yml`

Console and final request inventories were not reviewed after the global stop instruction. No screenshots were captured before invalidation. No Scenario F session or artifacts were created.
