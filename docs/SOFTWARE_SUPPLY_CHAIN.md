# Software supply-chain, SBOM, and license inventory

**Status:** Reproducible inventory procedure plus exact Sites-version-10 lockfile,
package, integrity-scan, production-audit, two-clean-build normalized-
reproducibility, and provider/deployment observations; not a legal opinion,
vulnerability certification, exact deployed-archive SBOM, retroactive v9 rebuild,
or byte-for-byte identity claim
**Observed:** 2026-08-08 with Node `24.18.0`, npm `12.0.1`
**Authority:** `package-lock.json` is the exact dependency graph; `package.json`
declares direct intent
**Related:** [Architecture](ARCHITECTURE.md), [Operations](OPERATIONS.md), and
[findings ledger](FINDINGS_RETEST_LEDGER.md)

## Current inventory observation

**Implemented exact-v10 evidence:** the committed lockfile is lockfile version 3 and has
SHA-256 `1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d` at
version-10 source commit `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1`. Its 712
`node_modules/*` locations normalize to 676 unique `name@version` components.
The built-in npm generator produced a CycloneDX 1.5 document with 676 components
and an SPDX 2.3 document with 677 packages, including the application package.
The lock digest is unchanged from versions 8 and 9. The retained full-lock artifacts under
`docs/release-evidence` therefore inventory the same exact locked graph, but keep
their version-8 names and provenance; no version-9- or version-10-named SBOM
regeneration is claimed:

| Retained artifact | Bytes | SHA-256 |
|---|---:|---|
| `ROADMAP-SITES-V8-2026-08-08-sbom.cdx.json` | 680,652 | `ba870097b023f2069fb9d25611f6cb314e2b99399aeeaad848503bca3d213d6d` |
| `ROADMAP-SITES-V8-2026-08-08-sbom.spdx.json` | 827,711 | `19cbf7be9b650049f2a00227e9a716d8b57b881588f642d8addd53a98566bf36` |
| `ROADMAP-SITES-V8-2026-08-08-sbom-manifest.json` | 1,758 | `97a17d0583574c317361c0dcc016e32f36dfb4e87ba2c2bbc0ce55b685935d0e` |

Those counts describe the complete locked graph, including development and
platform-optional packages. They do not prove which components Sites placed in
the deployed archive. Exact-release evidence must retain both the full-lock SBOM
and a shipped-artifact inventory.

### Exact Sites version 10 package, scan, and normalized-reproducibility observation

| Field | Recorded result |
|---|---|
| Source/runtime release ID | `ae35ef25ed46563f6b8f09f5c22dc12581eff8b1` |
| Local package | Gzip SHA-256 `5d67423e253009714bebe85bba118ded922c9f6b30b926f2af7bd0e3d05cd953`; 2,965,930 bytes; 61 tar entries/49 files |
| Sites package | Content hash `sha256:0534d35af6fcdd8a0f104c5bb21fab5edd0641ec952bd32ae7a3f9c024c62033`; 49 files; 6,737,920 bytes |
| Saved/deployed version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_1007b9b4ea8c8191968d55991abf374c`; deployment `appgdep_6a779cabaec4819191b0cf1e815ce2e5`; environment revision `12`; final status `succeeded`, provider `updated_at` `2026-08-08T21:17:13.525116+00:00` |
| Source release-integrity scan | 258 source/evidence text files inspected; zero pattern findings; historical Business Plan V1 preserved; lockfile SHA-256 unchanged. Generated output and dependencies were intentionally excluded |
| Exact archive audit | 61 safe entries/49 files; ten migrations and 23 source-mapped files matched the checked clean build; generated credential material was confined to two expected files with zero unexpected copies or paths |
| Two-clean-build comparison | Two detached exact-commit worktrees each installed 501 locked packages, reported the same five blocked install scripts, and passed 234/234 tests. Both inventories had 49 files; raw differences were confined to three strictly validated generated-value files and zero differences remained after allowlisted normalization |
| Production dependency audit | `npm audit --omit=dev` reported zero vulnerabilities on 2026-08-08 |

The exact version-10 comparator required the framework UUID in exactly three
anchored getter/ISR slots and required the two single-property 64-hex prerender
manifests to match within each build. It recorded no generated value. This is
normalized reproducibility, not byte-for-byte identity. The archive verifier and
Sites package record bind the checked candidate to the saved version and successful
revision-12 deployment; they do not prove provider-side byte identity or create an
exact shipped-artifact SBOM. See the
[exact version-10 release record](release-evidence/ROADMAP-SITES-V10-2026-08-08.md).

### Historical exact Sites version 9 package and scan observation

| Field | Recorded result |
|---|---|
| Source/runtime release ID | `6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d` |
| Local package | Gzip SHA-256 `8b3d0b13f03f0b13cd10602d24af09bf17c34afdcb4cf73518b2b0d857d59e22`; 2,965,984 bytes; 61 tar entries/49 files |
| Sites package | Content hash `sha256:0b3986dc73b1d06539dc85900dfd959549d92bcceb812c231a418766d29411fb`; 49 files; 6,737,920 bytes |
| Saved/deployed version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_58bb67e8e23c8191a584540a09e363c5`; deployment `appgdep_6a7768f92c588191934eda8abea6d6b4`; environment revision `11`; final status `succeeded`, provider `updated_at` `2026-08-08T17:36:53.329945+00:00` |
| Source release-integrity scan | 252 source text files inspected; zero pattern findings; historical Business Plan V1 preserved. Generated output and dependencies were intentionally excluded |
| Submitted-archive audit | 61 safe entries/49 files; ten migrations and 23 source-mapped files matched the release working-tree build; generated credential material was confined to two expected files with zero unexpected copies. This is not an isolated deterministic-rebuild result |
| Production dependency audit | `npm audit --omit=dev` reported zero vulnerabilities |

The differing tar-entry and Sites-file counts are provider/package-format
observations, not a dependency-to-runtime reconciliation. The zero audit and secret
findings apply only to the tools, inputs, and advisory data used at verification
time; they do not certify package provenance, absence of malicious behavior, legal
compliance, provider configuration, or runtime safety. An exact shipped-artifact
SBOM and qualified license-obligation review remain open. Sites versions 6, 7, 8,
and 9 are retained as historical predecessor evidence in the release record.

### Historical exact v9 isolated clean-install and rebuild observation

An isolated export of immutable runtime commit
`6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d` used Node.js `v24.18.0` and npm
`12.0.1`. `npm ci --no-audit` installed 501 packages; npm reported five blocked
package install scripts. The subsequent full verification still passed lint, strict
types, production build, artifact-integrity checks, and 229/229 tests. This is clean
behavioral reproducibility evidence for the exact commit.

The isolated rebuilt `dist` did **not** byte-match the submitted v9 archive. The
Windows isolated checkout used CRLF text bytes while the release working tree used
LF for the same Git content; the comparison reported migration/metadata differences
and different content-hashed client/server bundle names. The result is consistent
with line-ending-driven variance, but it does not prove line endings are the only
source of non-determinism. Repository `.gitattributes` now pins text checkouts to LF,
but that control was added after runtime commit v9 and is not a v9 control. The
deployed-v9 failure remains historical and was not retroactively reproduced. See
the [exact v9 clean-install record](release-evidence/ROADMAP-SITES-V9-2026-08-08-clean-install.md).

### Historical precursor normalized-reproducibility observation

At `2026-08-08T19:05:33.6134361Z`, two distinct detached clean worktrees at exact
successor source commit `66f5203a913f01c8da20555feebdbb99152c052c` were
verified on Windows with Node.js `v24.18.0` and npm `12.0.1`. In each worktree,
`npm ci --no-audit` installed 501 locked packages and left five install scripts
blocked. Each `npm run verify` passed lint, strict types, production build, the
release-artifact verifier, and 234/234 tests with zero failures, skips, or todos.
The lockfile SHA-256 remained
`1b70e9ba538e5b990ef89578472d23887ed8a2cdff293a43615867fb2f43d69d`.
The LF checkout policy had SHA-256
`e4cb73429d1d8b59f472654c7ed41afb39872ef5c96f05032833bc62f1662bd6`
and pins `* text=auto eol=lf` with binary exceptions. A successor-commit
`npm audit --omit=dev` also passed on 2026-08-08 with zero reported
vulnerabilities.

The strict comparator found identical 49-file inventories. The only raw
differences were `server/index.js`, `server/ssr/vinext-server.json`, and
`server/vinext-server.json`. For each build, it required one generated UUID in
exactly three anchored build-ID getter/ISR cache-key slots. It also required each
manifest to have the exact single-property 64-hex `prerenderSecret` shape and the
two manifest values to match within that build. No generated values were recorded.
After normalizing only those validated generated values, zero differences remained.
Five focused tests cover the comparator's fail-open boundaries.

At the time, this closed `SUPPLY-EVID-001` prospectively for normalized
reproducibility of the precursor control. It did not establish byte-for-byte
identity, retroactively reproduce deployed Sites version 9 commit
`6b48fae48e8c9ddb87b1d7a8fd13a2ebe395ca0d`, or show that commit `66f5203` was
deployed or reconciled to a provider package. Exact version 10 later repeated the
two-clean-build comparison at its own immutable commit and separately bound the
checked archive to a provider package and deployment; that evidence retains the
same normalized-not-byte-identical limitation. See the
[successor normalized-reproducibility record](release-evidence/ROADMAP-SUPPLY-REPRO-2026-08-08.md).

### Direct production dependencies

| Component | Exact version | Registry-declared license |
|---|---:|---|
| `drizzle-orm` | `0.45.2` | Apache-2.0 |
| `next` | `16.3.0` | MIT |
| `react` | `19.2.8` | MIT |
| `react-dom` | `19.2.8` | MIT |

### Direct development dependencies

| Component | Exact version | Registry-declared license |
|---|---:|---|
| `@cloudflare/vite-plugin` | `1.51.1` | MIT |
| `@cloudflare/workers-types` | `5.20260808.1` | MIT OR Apache-2.0 |
| `@tailwindcss/postcss` | `4.2.1` | MIT |
| `@types/node` | `22.19.19` | MIT |
| `@types/react` | `19.2.14` | MIT |
| `@types/react-dom` | `19.2.3` | MIT |
| `@vitejs/plugin-react` | `6.0.2` | MIT |
| `@vitejs/plugin-rsc` | `0.5.26` | MIT |
| `drizzle-kit` | `0.31.10` | MIT |
| `eslint` | `9.39.4` | MIT |
| `eslint-config-next` | `16.3.0` | MIT |
| `miniflare` | `5.20260801.1-alpha` | MIT |
| `react-server-dom-webpack` | `19.2.8` | MIT |
| `tailwindcss` | `4.2.1` | MIT |
| `typescript` | `5.9.3` | Apache-2.0 |
| `vinext` | `0.0.45` | MIT |
| `vite` | `8.2.1` | MIT |
| `wrangler` | `4.120.0` | MIT OR Apache-2.0 |

### Full-lock license-expression summary

This is a count of unique CycloneDX components, not a distribution-obligation
conclusion.

| Registry-declared SPDX expression | Components |
|---|---:|
| MIT | 521 |
| Apache-2.0 | 56 |
| MPL-2.0 | 28 |
| LGPL-3.0-or-later | 20 |
| ISC | 17 |
| BSD-2-Clause | 11 |
| Apache-2.0 AND LGPL-3.0-or-later | 6 |
| BSD-3-Clause | 5 |
| MIT OR Apache-2.0 | 4 |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT | 2 |
| CC0-1.0 | 2 |
| 0BSD | 1 |
| BlueOak-1.0.0 | 1 |
| CC-BY-4.0 | 1 |
| Python-2.0 | 1 |

No generated CycloneDX component lacked a registry-declared license expression.
The generated SPDX document nevertheless reports `NOASSERTION` as the concluded
license for every package, correctly reflecting that metadata collection is not a
legal conclusion.

## Release generation and verification

Run from `10_production_saas` against a clean checkout of the exact release commit.
Replace `<release-id>` with an immutable candidate identifier and retain the files
with release evidence.

```powershell
npm ci
npm run generate:supply-chain-evidence -- --release-id <release-id> --source-commit <full-commit-sha>
npm ls --all
npm audit --omit=dev
Get-FileHash -Algorithm SHA256 package-lock.json
Get-FileHash -Algorithm SHA256 docs/release-evidence/<release-id>-sbom.cdx.json
Get-FileHash -Algorithm SHA256 docs/release-evidence/<release-id>-sbom.spdx.json
```

If the shell transcodes redirected native output, use a byte-preserving release
runner. Parse both outputs as JSON before relying on them. Verification must also:

1. confirm the SBOM root name/version and exact package-lock digest;
2. reconcile every locked `name@version` to at least one CycloneDX component;
3. inventory modules/assets actually present in the packaged Sites archive and
   explain any difference from the full lock graph;
4. review direct, transitive, optional, native, WASM, and bundled components;
5. retain license/notice texts required for the shipped set;
6. run vulnerability and secret/configuration checks separately; and
7. record tool versions, time, operator, result, exceptions, and evidence hashes.

`npm audit` covers reported vulnerabilities in its data source; it does not verify
licenses, malicious-package absence, provenance, runtime compatibility, or the
deployed artifact. A clean SBOM diff does not replace build and behavior regression
testing.

## Open review and decision items

**External review required:** the locked graph includes weak-copyleft and attribution
licenses, including LGPL, MPL, and CC-BY expressions, largely through build/image
tooling and platform-specific packages. No qualified reviewer has determined which
components are distributed in the Sites artifact or what notices, source offers,
linking conditions, or other obligations apply. This must be resolved before a
public commercial release; this document does not make that legal decision.

**Recommendation:** assign the dependency owner named in
[Operations](OPERATIONS.md#operational-responsibilities) to review advisories and
lock/SBOM diffs on every release and at a defined cadence. Any new license
expression, missing metadata, integrity change without an intentional lock update,
critical advisory, abandoned framework dependency, or irreconcilable archive/SBOM
difference opens a finding in [the retest ledger](FINDINGS_RETEST_LEDGER.md).

**Owner/external decision still open:** provider budgets, legal/privacy review,
public access, billing configuration, retention policy, and Aaron's exact-release
acceptance are not approved by generating an SBOM.
