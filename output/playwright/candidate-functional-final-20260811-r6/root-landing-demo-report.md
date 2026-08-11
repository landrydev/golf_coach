# Landing and resettable demo — source-bound browser report

- Candidate: `candidate-functional-final-20260811-r6`
- Source identity: `cb650bf6ee78f5a63615f2f40289b096933b3938b82c09bd001b74a1526c9e2f`
- Automated baseline: 496/496 passed
- Result: **PASS**

## Landing

- The 1440 × 1000 and 320 × 844 full-page views rendered coherently with no page-level horizontal overflow.
- All ten inspected requests returned HTTP 200 and loaded the exact r6 bundles.
- Console review reported 0 errors and 0 warnings.
- The first keyboard Tab focused `Skip to main content` with `href="#main-content"`.
- Emulated reduced motion matched and exposed zero running animations.
- Public acquisition links use the canonical identity boundary and clearly distinguish the fictional sample from customer proof.

Artifacts: `root-landing-1440.md`, `root-landing-1440.png`, `root-landing-320.md`, `root-landing-320.png`, `root-landing-focus-1440.md`, `.playwright-cli/traces/trace-1786433813194.trace`, and `.playwright-cli/traces/trace-1786433813194.network`.

## Resettable synthetic demo

- The demo rendered without page-level overflow at 390 × 844 and 1440 × 1000 and disclosed fictional, editable, non-persistent content.
- `Now`, `Practice`, `Media & data`, and `Journey` were real controls.
- Practice exposed purpose, equipment, setup, dosage, success check, stop/ask rule, and a bounded golfer check-in. The completed choice updated the live status.
- Media & data exposed a working Baseline/Current toggle, synthetic image pair, exact units, selected metrics, sample sizes, and limitations.
- Journey exposed lesson, practice, check-in, media/data, and phase-review history. Selecting the `Lessons` filter reduced the visible entries accordingly.
- `Reset demo` restored `Now`; reopening Practice proved `No synthetic response selected.`
- Console review reported 0 errors and 0 warnings. All 11 inspected page, bundle, favicon, and synthetic-image requests returned HTTP 200.

Artifacts: `root-demo-initial-390.md`, `root-demo-initial-390.png`, `root-demo-practice-completed-390.md`, `root-demo-media-baseline-390.md`, `root-demo-media-baseline-390.png`, `root-demo-journey-390.md`, `root-demo-journey-lessons-390.md`, `root-demo-reset-390.md`, `root-demo-reset-proof-390.md`, `root-demo-reset-1440.png`, `.playwright-cli/traces/trace-1786433894755.trace`, and `.playwright-cli/traces/trace-1786433894755.network`.
