# Scenarios B–D browser QA report

**Candidate:** `candidate-functional-final-20260810`  
**Origin:** `http://127.0.0.1:4175`  
**Status:** `INVALIDATED — NOT EXECUTED`

The exact candidate was invalidated before Acceptance Scenarios B, C, or D were
executed. A separate real-browser review found a demo-page `/auth/login.rsc`
prefetch request returning 404 and a corresponding console error. This is an
exact-candidate blocker, so no B/C/D observation may be treated as acceptance
evidence.

The first pinned-wrapper invocation attempted to open the `standard` scenario in
session `bcd-b`, but Playwright failed before opening Chromium:

```text
EPERM: operation not permitted, mkdir
C:\Users\aarla\AppData\Local\ms-playwright\daemon\586ea7bbdf0d0ed5
```

Consequently:

- `bcd-b` never opened; `bcd-c` and `bcd-d` were never invoked.
- No B/C/D synthetic upload files, mutations, screenshots, snapshots, traces, or
  acceptance results were created.
- No B/C/D product behavior was assessed and no pass/fail conclusion is recorded.
- Existing browser processes and artifacts from other QA sessions were left
  untouched.

Re-run B, C, and D from fresh isolated `standard` state only after a new exact
candidate is built, source-bound, and shown free of the invalidating console/network
failure.
