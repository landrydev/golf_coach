# Local Browser Review

**Candidate:** Roadmap Beta Recovery Build `0.1.0`  
**Date:** 2026-08-11  
**Evidence class:** local synthetic Chromium review; not hosted acceptance

## What was exercised

Chromium was launched through the DevTools protocol and the exact beta JavaScript
and CSS were rendered with synthetic API responses.

- Login form rendered and submitted a complete email/password body.
- Successful login transitioned to the instructor dashboard.
- Dashboard rendered one published golfer, status counts, and the beta-success prompt.
- Golfer-facing roadmap rendered goal, current priority, phases, lesson, practice,
  evidence, package action, and bounded response controls.
- Desktop geometry was checked at 1440 × 1000 CSS pixels.
- Mobile geometry was checked at 390 × 844 CSS pixels.
- Root document horizontal overflow was absent at both reviewed widths.

## Defects found and fixed during review

1. Successful authentication called a nonexistent `renderShell` function. The flow
   now renders the dashboard directly.
2. Login/registration disabled form controls before constructing `FormData`, which
   omitted the submitted values. Form data is now captured before the busy state.
3. Profile saving had the same disabled-control ordering defect. Profile data is now
   captured before the busy state.
4. The mobile anchor navigation and highlighted current-phase card extended the root
   document by four pixels. Responsive layout rules now keep root width at 390 pixels;
   the anchor navigation itself remains intentionally horizontally scrollable.

## Limitations

This review used synthetic API responses and local source. It does not prove:

- the exact hosted environment;
- human usability or accessibility;
- screen-reader output;
- every supported browser;
- slow-network or production storage behavior;
- real customer success; or
- public/paid release suitability.

A final manual review of the exact invite-only HTTPS deployment is still required
before participants are invited.
