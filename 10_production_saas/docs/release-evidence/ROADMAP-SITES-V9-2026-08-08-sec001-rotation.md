# OWNER-SEC-001 SIWC bypass-credential rotation evidence

**Date:** 2026-08-08
**Disposition:** `SEC-001` remediated; authenticated retest pending
**Credential values:** intentionally omitted

## Exact boundary

| Field | Recorded value |
|---|---|
| Owner authorization | Aaron authorized `OWNER-SEC-001` on 2026-08-08: rotate and revoke the exposed Sites bypass credential |
| Sites project | `appgprj_6a76957326fc819196ebf3a0c95f1ec3` |
| Candidate | `ROADMAP-SITES-V9-2026-08-08` |
| Runtime commit | `6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d` |
| Saved version | Version 9, `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_58bb67e8e23c8191a584540a09e363c5` |
| Deployment | `appgdep_6a7768f92c588191934eda8abea6d6b4`; environment revision 11 |
| Rotation window | `2026-08-08T18:32:25.588Z` through `2026-08-08T18:32:31.831Z` |

## Authorized operation and credential handling

The Sites SIWC bypass-token generation operation was called exactly once for the
project above. Its provider contract states that calling it when a token already
exists rotates the token and immediately invalidates the prior token. The operation
succeeded. This is authoritative control-plane invalidation evidence for the exposed
prior value; it is not an empirical replay-denial test.

The operation returned a replacement bearer only within the tool-call execution
boundary. The replacement was not displayed, persisted, copied, stored, or used, and
no credential value appears in this record. The available provider tooling exposes
rotation, not a revoke-only operation, so this result proves invalidation of the
exposed prior value but does not claim that the Sites project has no bypass-token
mechanism or active replacement value.

The original exposed value had deliberately not been retained. It was therefore not
replayed after rotation. Recovering or reproducing it merely to perform a denial
probe would have expanded secret handling and was not attempted.

## Access-policy continuity

Value-safe owner listings were inspected immediately before and after rotation.

| Observation | Before | After |
|---|---|---|
| Project state | Active; latest version 9 | Active; latest version 9 |
| Access mode | `custom` | `custom` |
| Access-policy revision | 1 | 1 |
| Allowed users | One owner | One owner |
| Allowed groups | Zero | Zero |
| External visitors | Zero | Zero |

No access expansion, source change, saved version, environment revision, or
deployment occurred as part of the rotation.

## Post-operation containment probes

At approximately `2026-08-08T18:33:41Z`, signed-out HTTPS requests without a bypass
header produced the following results:

| Path | Status | Cache control | Referrer policy |
|---|---:|---|---|
| `/` | 401 | `no-store` | `no-referrer` |
| `/app` | 401 | `no-store` | `no-referrer` |
| `/api/health` | 401 | `no-store` | `no-referrer` |
| `/api/operations/health` | 401 | `no-store` | `no-referrer` |

These probes confirm that anonymous containment remained in place. They do not prove
normal signed-in owner authentication or authenticated application behavior.

## Log observation

A value-safe 15-minute Worker-log query completed at
`2026-08-08T18:35:07.665Z` and returned zero events. No raw log event, header,
identity, token, or credential material was emitted into this evidence. Because the
sample was empty, it is inconclusive for runtime credential-leakage and redaction
behavior; absence of returned events is not proof of log completeness or non-leakage.

## Retest disposition

`SEC-001` is **REMEDIATED — RETEST PENDING**, not closed:

- Aaron's authorization is recorded and the provider rotation completed.
- The provider contract immediately invalidated the exposed prior token.
- The replacement value was not exposed, persisted, or used.
- Owner-only access remained unchanged and four signed-out containment probes passed.
- The prior value was unavailable for an empirical replay-denial probe.
- No supported signed-in owner browser was available, so normal owner authentication
  was not tested.
- The post-operation Worker-log sample was empty and cannot establish leakage or
  redaction behavior.

Closure requires a normal signed-in owner journey without a bypass header and a
privacy-safe, meaningful hosted log/redaction sample tied to the exact environment.
The broader SIWC sign-in, recovery, sign-out, stable-identity, spoof-denial, and
cross-device matrix remains separately open under `AUTH-EVID-001`.
