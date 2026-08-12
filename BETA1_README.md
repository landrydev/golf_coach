# Roadmap Beta 1 — local full-feature experience

Beta 1 is the complete recovered Sol Ultra application running locally with synthetic accounts, D1 data, R2-compatible private media storage, and all existing product surfaces available for review.

It does not require Cloudflare, OIDC, Stripe, a domain, production secrets, or real golfer data.

## Fastest start on Windows

From the complete Beta 1 folder, double-click:

```text
BETA1_START.cmd
```

The launcher will:

1. verify that Node.js 22.13 or newer is installed;
2. install the exact locked dependencies when needed;
3. build the real application;
4. start the synthetic full-feature server at `http://127.0.0.1:4175`;
5. open `BETA1_HOME.html`; and
6. open the standard full-feature coach workspace.

Keep the separate **Roadmap Beta 1 server** PowerShell window open while using the application. Close that window to stop Beta 1 and reset the synthetic scenarios.

## PowerShell options

Run normally:

```powershell
.\BETA1_START.ps1
```

Replace `node_modules` from the lockfile before launch:

```powershell
.\BETA1_START.ps1 -Reinstall
```

Run the complete lint, typecheck, production build, artifact checks, and automated test suite before launch:

```powershell
.\BETA1_START.ps1 -Verify
```

## Recommended first tour

1. Open **Standard full-feature account** from `BETA1_HOME.html`.
2. Review Overview and the golfer command centre.
3. Open the seeded golfer and inspect the roadmap, lessons, practice, evidence, launch data, reviews, timeline, and sharing controls.
4. Use the sidebar to inspect Drill library, Roadmap templates, Media, Packages, Plan & billing, and Settings.
5. Open the matching golfer experience at `/__qa/standard/golfer`.
6. Use the **Fresh coach** scenario to experience the empty-state and first-roadmap flow.
7. Use **Thirty golfers** to assess portfolio management.
8. Use **Long-content** and the access-state scenarios to inspect edge cases.

## Functionality represented in Beta 1

- instructor profile and coach branding;
- packages and external next-action links;
- adult golfer records;
- guided three- and four-phase roadmap authoring;
- roadmap templates;
- exact preview, publish, reissue, replace, expire, and revoke;
- private golfer access and bounded responses;
- lessons and status transitions;
- drill library and reusable practice assignments;
- golfer practice check-ins;
- evidence and evidence-backed phase reviews;
- living timeline and progress context;
- private media library, upload, delivery, replacement, and removal;
- baseline/current media workflow;
- manual launch-monitor metrics;
- CSV review, mapping, validation, and import;
- selected metric comparisons;
- coach and golfer responsive experiences;
- share centre, QR, and print preparation;
- account and billing states in local safe/test form;
- fresh, empty, long, mixed, expired, revoked, republished, error, and recovery states.

## Synthetic files

A launch-monitor CSV is included at:

```text
10_production_saas\beta1\assets\launch-monitor-sample.csv
```

For media upload, use an ordinary JPG, PNG, WebP, MP4, MOV, or WebM from your computer. The local synthetic policy allows files up to 50 MB and does not require production consent configuration.

## Data behavior

- Beta 1 uses synthetic identities and synthetic coaching records.
- Scenario data is local and temporary.
- Changes made during a session are intentionally reset when the server is closed.
- Do not enter real customer, payment, medical, or confidential information.
- The standard and long-content scenarios include rich pre-seeded coaching data; swing-media upload remains interactive so the real upload workflow can be experienced.

## Troubleshooting

### Node.js is missing or too old

Install Node.js 22.13 or newer and rerun the launcher.

### Port 4175 is already in use

Close any previous **Roadmap Beta 1 server** window, then rerun the launcher.

### The server window reports a build or dependency error

Run:

```powershell
.\BETA1_START.ps1 -Reinstall -Verify
```

### Start manually

```powershell
Set-Location .\10_production_saas
npm ci --ignore-scripts
npm run qa:functional:server
```

Then open:

```text
http://127.0.0.1:4175/__qa/standard/app
```

## Evidence boundary

This package is intended to let Aaron experience and evaluate the complete implemented product locally. It does not establish public-host readiness, legal compliance, market validation, payment acceptance, production recoverability, or real-user success.
