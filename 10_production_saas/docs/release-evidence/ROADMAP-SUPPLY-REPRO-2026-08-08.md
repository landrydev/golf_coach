# Successor normalized release-build reproducibility evidence

**Status:** `CLOSED — RETEST PASSED` for the prospective normalized-build
reproducibility control on the undeployed successor source candidate; this is not
byte-for-byte identity or deployment evidence
**Completed:** `2026-08-08T19:05:33.6134361Z`
**Source commit:** `66f5203a913f01c8da20555feebdbb99152c052c`
**Environment:** Windows; Node.js `v24.18.0`; npm `12.0.1`
**Related:** [Findings and retest ledger](../FINDINGS_RETEST_LEDGER.md) and
[software supply chain](../SOFTWARE_SUPPLY_CHAIN.md)

## Evidence boundary

This record covers two distinct detached clean worktrees at the exact successor
source commit above. That commit was not deployed when this evidence completed.
The deployed Sites version 9 source commit
`6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d` was not retroactively reproduced:
its earlier byte-identity failure remains preserved history.

The result is a **normalized reproducibility** pass. The two raw build trees were
not byte-for-byte identical. Normalization was permitted only after strict
structural validation of the framework-generated build UUID and prerender
manifest values described below. No generated UUID or manifest value is recorded
in this evidence.

## Procedure and observed result

Each detached worktree independently ran `npm ci --no-audit`. Each install
materialized 501 locked packages and reported five blocked install scripts. Each
worktree then ran `npm run verify`, which passed lint, strict type checking, a
production build, the release-artifact verifier, and 234/234 tests with zero
failures, skips, or todos.

The strict release-build comparator then compared the two isolated `dist`
directories:

| Check | Observed result |
|---|---|
| Isolation and source | Two distinct detached clean worktrees at exact commit `66f5203a913f01c8da20555feebdbb99152c052c` |
| Checkout policy | `.gitattributes` SHA-256 `e4cb73429d1d8b59f472654c7ed41afb39872ef5c96f05032833bc62f1662bd6`; `* text=auto eol=lf` with binary exceptions |
| Locked graph | `package-lock.json` SHA-256 `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d` |
| Build inventories | Identical inventory of 49 files |
| Raw differences | Exactly `server/index.js`, `server/ssr/vinext-server.json`, and `server/vinext-server.json` |
| Server build UUID | One UUID per build, validated in exactly three anchored locations: the build-ID getter and two ISR cache-key slots |
| Prerender manifests | Each file had the exact single-property `prerenderSecret` shape with a 64-hex value; the two manifest values matched within each build |
| Differences after allowlisted normalization | Zero |

At the successor commit, `npm audit --omit=dev` also completed on 2026-08-08
with zero reported vulnerabilities. That registry/advisory observation has the
usual scope limits and is separate from the reproducibility comparison.

The comparator's five focused tests cover its fail-open boundaries: only the
controlled generated variance is accepted; the two inputs must be independent;
all expected generated paths must exist; manifest byte shape must remain exact;
and the build UUID must remain confined to the anchored compiled ISR/getter
locations. An unexpected stable-file change is rejected.

## Disposition and limitations

`SUPPLY-EVID-001` is closed prospectively for this successor-source control because
every raw difference was confined to a strictly validated framework-generated
value and zero differences remained after allowlisted normalization. This does
not establish byte-for-byte build identity, reproduce the deployed v9 archive,
show that the successor was deployed, reconcile an archive with a provider
package, or replace release-specific runtime and deployment verification.

Reopen the finding if inventories differ, a generated path or value changes
shape or location, a value is not consistent within one build, any non-allowlisted
raw difference appears, any normalized difference remains, or the comparator's
fail-closed tests regress.
