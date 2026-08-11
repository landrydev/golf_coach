# Acceptance Scenarios E/G - stopped on r6 product defect

- Candidate: `candidate-functional-final-20260811-r6`
- Origin: `http://127.0.0.1:4175`
- Source identity: `cb650bf6ee78f5a63615f2f40289b096933b3938b82c09bd001b74a1526c9e2f`
- Authoritative verification: `496/496` passed, zero fail/cancel/skip/todo
- Outcome: **STOPPED - no Scenario E or G acceptance claim**

## Stop condition

`BROWSER-E-MEDIA-UPLOAD-ADVERTISED-LIMIT-413`

The visible media library advertises `Up to 48 MB`, but a valid existing PNG from the
exact source tree was rejected well below that limit:

- Selected file: `10_production_saas/public/og.png`
- File size: `2,282,761` bytes
- Multipart request size: `2,284,141` bytes
- Request: `POST http://127.0.0.1:4175/api/media`
- Result: `413 Payload Too Large`
- Response content type: `text/plain;charset=UTF-8`
- Response body: `Payload Too Large`
- Request reference: `510a541d-d4f2-4d2a-85cf-c0f255781ac4`
- Browser console: `1` error, `0` warnings

Exact console entry:

```text
[ERROR] Failed to load resource: the server responded with a status of 413 (Payload Too Large)
http://127.0.0.1:4175/api/media:0
```

The UI remained fail-closed and showed an accessible alert saying the upload did not
finish, but the configured upload limit and the actual browser/runtime limit disagree.
The plain-text upstream response suggests a request-body limit before the application
media policy handles the file; that is an inference and requires source/runtime diagnosis.

## Scenario E partial evidence before the stop

Session `eg-e-r6-three-phase`, fixture `three-phase`, viewport `1440 x 1000`:

1. Created scheduled lesson `R6 transition lesson` through the ordinary coach UI.
   `POST /api/plans/{plan}/coaching/lessons => 201 Created` and the visible lesson card
   showed `scheduled` with its scheduled date.
2. Expanded the lesson editor and confirmed it exposes lifecycle, golfer learning,
   takeaway, next-check, phase-connection, evidence, and launch-measurement controls.
3. Created six distinct source-bounded evidence records through the ordinary UI; all six
   `POST /api/plans/{plan}/coaching/evidence` requests returned `201 Created`:
   - coach observation
   - golfer report
   - measurement (`142.5 yd`, baseline)
   - outcome count (`4 of 6`)
   - comparison (`146 yd`, current, like-for-like group)
   - note explicitly marked as contextual rather than proof
4. Attempted the private media upload needed for the seventh `media` evidence type.
   The `413` console/network defect occurred and all later work stopped immediately.

The scheduled-to-completed lesson transition, media evidence, practice/check-in,
measurement-session linkage, atomic review outcomes, milestones, publication truth, and
historical/deep-link checks were therefore not completed. Partial observations are not
acceptance evidence.

## Scenario G status

Not started. The required stop-on-first-defect rule prevented responsive golfer,
keyboard/touch, media, lifecycle, sharing, QR, revoke/reissue, and print/PDF work.

## Artifacts

- [`eg-e-r6-media-upload-413.png`](eg-e-r6-media-upload-413.png)
- [Console log](.playwright-cli/console-2026-08-11T07-38-10-985Z.log)
- [Failure snapshot](.playwright-cli/page-2026-08-11T07-46-31-095Z.yml)
- [Trace](.playwright-cli/traces/trace-1786433889952.trace)
- [Network trace](.playwright-cli/traces/trace-1786433889952.network)

## Cleanup

- Trace stopped successfully.
- Browser session `eg-e-r6-three-phase` closed successfully.
- No other E/G session was opened.
- No source, build, server, or candidate-manifest file was edited.

