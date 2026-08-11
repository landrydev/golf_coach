# Acceptance Scenarios B–D browser QA report

**Candidate:** `candidate-functional-final-20260811-r4`  
**Origin:** `http://127.0.0.1:4175`  
**Fixture identity:** `standard` / Coach Rowan  
**Source identity:** `b680c92…`  
**Automated baseline:** 489/489  
**Result:** `FAILED — CANDIDATE INVALIDATED IN SCENARIO B; C/D NOT STARTED`

## Confirmed Scenario B defect

The real browser media-upload journey cannot read selected video metadata under the
r4 Content Security Policy.

Reproduction in headed Chrome session `bcd-b-r4`, viewport 1440×1000:

1. Entered through `/__qa/standard/app` and navigated to the visible **Media**
   destination.
2. Generated a synthetic 640×360 PNG poster and four synthetic WebM clips through
   Chromium itself. Every file was stored only under this candidate artifact
   directory.
3. Uploaded the poster through the real media form. `POST /api/media` returned
   `201 Created`, and the library showed one ready item.
4. Selected `bcd-b-r4-baseline-landscape.webm` in the same real form, entered its
   accessible description, view, captured date, landscape orientation, caption,
   coach context, and selected the uploaded poster.
5. Chromium blocked the form's video-metadata `blob:` URL. The console recorded one
   error and zero warnings:

   ```text
   Loading media from 'blob:http://127.0.0.1:4175/…' violates the following
   Content Security Policy directive: "default-src 'self'". Note that 'media-src'
   was not explicitly set, so 'default-src' is used as a fallback. The action has
   been blocked.
   ```

6. The UI displayed: **“The video metadata could not be read. Choose a valid source
   file.”** No video upload request was issued. The request ledger contains only the
   successful poster `POST /api/media` mutation.

This is a product/CSP defect, not an invalid fixture-file result: the clips were
created by the same Chromium runtime as WebM video blobs, and the browser explicitly
reported that CSP blocked the `blob:` media load before metadata could be read. The
ordinary video-upload path therefore cannot reach private persistence, poster
association, attachment, publication, playback, replacement, failure/retry, or
withdrawal.

## Scope stopped

Per the stop-on-defect instruction, no further state-changing interaction occurred.
The storage-fault endpoint was not armed. Scenario C and Scenario D browser sessions
were never opened, so drill lifecycle, two-golfer assignment/check-in/history,
manual/CSV launch data, comparison, and download remain `not_recorded` for r4.
Mobile, keyboard, touch-equivalent, and overflow checks also remain unexecuted.

The ready synthetic poster remains in the isolated `standard` fixture because it was
created through the UI before the defect. No direct database operation was used.
Session `bcd-b-r4` was closed after the trace was finalized.

## Diagnostic artifacts

- `bcd-b-r4-dashboard-1440.md`
- `bcd-b-r4-baseline-form-timeout.md`
- `bcd-b-r4-defect-csp-video-metadata-1440.md`
- `bcd-b-r4-defect-csp-video-metadata-1440.png`
- `.playwright-cli/console-2026-08-11T06-34-50-436Z.log`
- `.playwright-cli/traces/trace-1786430023693.trace`
- `.playwright-cli/traces/trace-1786430023693.network`
- `.playwright-cli/traces/resources/`
- `bcd-b-r4-poster.png` — 16,543 bytes
- `bcd-b-r4-baseline-landscape.webm` — 13,171 bytes
- `bcd-b-r4-current-portrait.webm` — 10,461 bytes
- `bcd-b-r4-storage-retry.webm` — 10,279 bytes
- `bcd-b-r4-replacement.webm` — 11,937 bytes

These artifacts are defect diagnostics only. They do not satisfy Scenario B, C, D,
or overall acceptance.
