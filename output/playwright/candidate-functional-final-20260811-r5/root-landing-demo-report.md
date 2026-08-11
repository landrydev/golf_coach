# Root landing/demo QA — invalidated partial report

- Candidate: `candidate-functional-final-20260811-r5`
- Source identity: `3bd41168b2b7116c547a6ba947f37297a6121220936fb8d8e32c3ae7bcfbe492`
- Automated baseline: 489/489 passed
- Outcome: **INVALIDATED — diagnostic evidence only**

The coordinator stopped this run when independent browser sessions confirmed a Scenario A staged-golfer continuation dead end and a Scenario G expired-session 404 console/network error. None of the artifacts below is acceptance evidence.

## Landing observations completed before the stop

- The 1440 × 1000 and 320 × 844 landing views rendered coherently with no page-level horizontal overflow.
- All ten inspected landing requests, including the exact r5 bundles and favicon, returned 200.
- Console review reported 0 errors and 0 warnings.
- The first keyboard Tab focused `Skip to main content` with `href="#main-content"`.
- Emulated reduced motion matched and the page exposed zero running animations.
- The exact response CSP included `media-src 'self' blob:` while retaining `worker-src 'none'`, `frame-src 'none'`, and `object-src 'none'`.

Artifacts:

- `root-landing-1440.md`
- `root-landing-1440.png`
- `root-landing-320.md`
- `root-landing-320.png`
- `root-landing-focus-1440.md`
- `.playwright-cli/traces/trace-1786431685651.trace`
- `.playwright-cli/traces/trace-1786431685651.network`

## Resettable demo observations completed before the stop

- The demo rendered at 390 × 844 without page-level horizontal overflow and clearly disclosed fictional, editable, non-persistent data.
- `Now`, `Practice`, `Media & data`, and `Journey` were real tab controls.
- Practice exposed the structured purpose/equipment/setup/dosage/success/stop rule and a bounded check-in. Selecting `Completed · about right` changed the live status to `Synthetic check-in recorded in this browser view only.`
- Media & data exposed a synthetic image pair, a working Baseline/Current toggle, exact units, selected metrics, sample sizes, and limitations.
- Journey exposed lessons, practice, check-in, selected media/data, and the source-described phase-review decision.
- Console review reported 0 errors and 0 warnings during the partial demo journey.

Artifacts:

- `root-demo-initial-390.md`
- `root-demo-initial-390.png`
- `root-demo-practice-390.md`
- `root-demo-practice-390.png`
- `root-demo-practice-completed-390.md`
- `root-demo-media-data-390.md`
- `root-demo-media-data-390.png`
- `root-demo-media-baseline-390.md`
- `root-demo-journey-390.md`
- `root-demo-journey-390.png`
- `.playwright-cli/traces/trace-1786431850956.trace`
- `.playwright-cli/traces/trace-1786431850956.network`

The demo filter/reset completion, desktop demo review, source-bound Scenario H, and the remaining global visual matrix were not completed after invalidation.
