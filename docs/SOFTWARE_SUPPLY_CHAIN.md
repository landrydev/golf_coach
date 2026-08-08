# Software supply-chain, SBOM, and license inventory

**Status:** Reproducible inventory procedure plus exact Sites-version-7 lockfile,
package, integrity-scan, and production-audit observations; not a legal opinion,
vulnerability certification, or exact deployed-archive SBOM
**Observed:** 2026-08-08 with Node `24.18.0`, npm `12.0.1`
**Authority:** `package-lock.json` is the exact dependency graph; `package.json`
declares direct intent
**Related:** [Architecture](ARCHITECTURE.md), [Operations](OPERATIONS.md), and
[findings ledger](FINDINGS_RETEST_LEDGER.md)

## Current inventory observation

**Implemented exact-v7 evidence:** the committed lockfile is lockfile version 3 and has
SHA-256 `a29e63ce73d1de9f40d54ebc615982686af6c53084c107f84e35d1316ba425d1`.
It is unchanged across the recorded Sites version-6 source and immutable
version-7 source commit `7ed01ec822fdb5c2bfbe6db7e3c99bcba126ac17`. Its 712
`node_modules/*` locations normalize to 676 unique `name@version` components.
The built-in npm generator produced a CycloneDX 1.5 document with 676 components
and an SPDX 2.3 document with 677 packages, including the application package.

Those counts describe the complete locked graph, including development and
platform-optional packages. They do not prove which components Sites placed in
the deployed archive. Exact-release evidence must retain both the full-lock SBOM
and a shipped-artifact inventory.

### Exact Sites version 7 package and scan observation

| Field | Recorded result |
|---|---|
| Source/runtime release ID | `7ed01ec822fdb5c2bfbe6db7e3c99bcba126ac17` |
| Local package | Gzip SHA-256 `a07f06989d3ba6cf05b924b149fc9f955be512223c6f90d5dd8d7628d175e526`; 2,916,309 bytes; 57 tar entries |
| Sites package | Content hash `sha256:4a00694b9798f4f84487e8e7ea224703ccbbfc61a32dd132d417dc65b7f153bc`; 45 files; 6,236,160 bytes |
| Saved/deployed version | `appgprj_6a76957326fc819196ebf3a0c95f1ec3~appgver_55fe270d85f081919dcd346c8476130d`; deployment `appgdep_6a772e0616b88191972b4e2e0603da52`; environment revision `9` |
| Release-integrity scan | 204 text files inspected; zero secret findings; historical Business Plan V1 preserved; package-lock digest matched |
| Production dependency audit | `npm audit --omit=dev` reported zero vulnerabilities |

The differing tar-entry and Sites-file counts are provider/package-format
observations, not a dependency-to-runtime reconciliation. The zero audit and secret
findings apply only to the tools, inputs, and advisory data used at verification
time; they do not certify package provenance, absence of malicious behavior, legal
compliance, provider configuration, or runtime safety. An exact shipped-artifact
SBOM and qualified license-obligation review remain open. Sites version 6 evidence
is retained as historical predecessor evidence in the release record.

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
npm sbom --package-lock-only --sbom-format cyclonedx --sbom-type application > docs/release-evidence/<release-id>-sbom.cdx.json
npm sbom --package-lock-only --sbom-format spdx --sbom-type application > docs/release-evidence/<release-id>-sbom.spdx.json
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
