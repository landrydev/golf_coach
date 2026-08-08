# Exact v9 isolated clean-install evidence

**Evidence class:** exact-runtime-commit isolated local reproduction; not hosted,
provider, or deterministic byte-identity evidence
**Runtime commit:** `6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d`
**Environment:** Windows; Node.js `v24.18.0`; npm `12.0.1`
**Recorded:** 2026-08-08

An isolated export of the immutable runtime commit was installed without reusing the
candidate working tree's `node_modules`.

| Step | Result |
|---|---|
| `npm ci --no-audit` | Passed; 501 packages installed in 48.7 seconds |
| Install-script policy | npm reported five blocked package install scripts; the subsequent complete build and verification still passed |
| `npm run verify` | Passed in 62.8 seconds: lint, strict TypeScript, production build, release-artifact integrity, and 229/229 tests; zero failures, cancellations, skips, or todos |
| Generated artifact integrity | Passed: 49 scanned files, two expected server credential files/copies, zero unexpected credential copies or paths, and no production prerender binding |

The rebuilt `dist` was then compared with the submitted v9 archive by
`scripts/verify-release-archive.mjs`. That byte-identity comparison **did not pass**.
The isolated Windows checkout used CRLF text bytes while the release working tree
used LF for the same Git content; the comparison reported migration/metadata byte
differences and different content-hashed client/server bundle names. This is
consistent with line-ending-driven build variance, but the exercise does not prove
that line endings are the only source of non-determinism.

Consequently, this record proves that a clean install of the exact commit builds and
passes the full automated suite. It does not prove a deterministic byte-for-byte
rebuild of the submitted archive on another checkout. Repository-level
`.gitattributes` now pins text checkouts to LF for future candidates; that control was
added after runtime commit v9 and must be exercised on a later exact candidate before
the deterministic-rebuild gap can be closed.
