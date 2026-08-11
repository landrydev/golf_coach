# Acceptance Scenarios E/G — invalidated partial report

- Candidate: `candidate-functional-final-20260811-r5`
- Origin: `http://127.0.0.1:4175`
- Source identity: `3bd41168b2b7116c547a6ba947f37297a6121220936fb8d8e32c3ae7bcfbe492`
- Manifest verification: `489/489` passed
- Outcome: **INVALIDATED — no Scenario E/G acceptance claim**

## Stop condition

The required expired-share state produced a real console/network defect. The exact r5 candidate was subsequently invalidated by the root coordinator for this defect and a separate Scenario A defect. All E/G work stopped immediately; traces were saved and every E/G session was closed.

### Expired-share reproduction

Session `eg-g-r5-expired`, viewport `390 × 844`:

1. Opened `http://127.0.0.1:4175/__qa/expired/golfer` through the pinned Playwright wrapper.
2. The browser reached `/r` and correctly rendered the sanitized unavailable state:
   - `Plan unavailable`
   - `This private roadmap cannot be opened.`
   - No golfer information was disclosed.
3. The browser nevertheless recorded one console error and the matching failed request:

   ```text
   [ERROR] Failed to load resource: the server responded with a status of 404 (Not Found)
   http://127.0.0.1:4175/r/session:0
   ```

   ```text
   POST http://127.0.0.1:4175/r/session => 404 Not Found
   ```

This fails the required clean-console/network evidence for the expired lifecycle state even though the visible disclosure boundary is correct.

## Partial Scenario G evidence gathered before the stop

Session `eg-g-r5-long` opened the long-content golfer share and completed the following checks before closing cleanly:

- Share exchange: `POST /r/session => 200 OK`.
- Private plan load: `GET /r/plan.rsc?... => 200 OK`.
- Console: `0` errors and `0` warnings.
- The exact roadmap exposed Now, Goal, Roadmap, Lessons, Practice, Media, Data, Evidence, Timeline, and Phase review navigation.
- Long-form goal, assessment, four phases, current takeaway, next useful action, completed lessons, two active practice records with check-in controls, selected summary measurements/comparison, evidence limitations, milestone, historical timeline, exact phase-review sources, next-option choices, coach branding, updated date, and access-expiry disclosure were visible.
- No-media state was explicit and text-first: `No media is selected for this revision. The complete text-first roadmap remains available on any connection.`
- Full-page screenshots were captured at `320 × 844`, `390 × 844`, `768 × 1024`, and `1440 × 1000`.
- Page-level horizontal scrolling was not possible at any inspected viewport (`maxScrollLeft: 0`). The narrow section navigation intentionally owns its horizontal overflow.
- At 320px, Tab focused the `Skip to coaching plan` link. The visible buttons measured at least 44px high; the Media section link activated successfully at the narrow viewport.
- A branded print PDF was generated through the browser CLI.

These are useful partial observations only. Expired failed; revoked and republished old/new states were not run after the stop.

## Scenario E status

Scenario E was not started. No lesson, evidence, measurement, review transition, milestone, publication, or share state was mutated by this r5 E/G run.

## Artifacts

Long-content responsive and print evidence:

- [`eg-g-r5-long-320.png`](eg-g-r5-long-320.png)
- [`eg-g-r5-long-390.png`](eg-g-r5-long-390.png)
- [`eg-g-r5-long-768.png`](eg-g-r5-long-768.png)
- [`eg-g-r5-long-1440.png`](eg-g-r5-long-1440.png)
- [`eg-g-r5-long-print.pdf`](eg-g-r5-long-print.pdf)
- [Long-content trace](.playwright-cli/traces/trace-1786431727655.trace)
- [Long-content network trace](.playwright-cli/traces/trace-1786431727655.network)

Expired-state defect evidence:

- [`eg-g-r5-expired-console-defect-390.png`](eg-g-r5-expired-console-defect-390.png)
- [Console log](.playwright-cli/console-2026-08-11T07-05-54-582Z.log)
- [Expired-state trace](.playwright-cli/traces/trace-1786431961180.trace)

The expired request occurred during initial navigation, before tracing began, so its trace-network file is empty. The pinned wrapper's `requests` output captured the exact `POST /r/session => 404` result quoted above.

## Cleanup

- Closed: `eg-g-r5-long`
- Closed: `eg-g-r5-expired`
- No other E/G session was opened.
- No source, build, server, or candidate-manifest file was edited.
- This document is invalidated partial evidence only.
