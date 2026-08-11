# Roadmap local prototype

`ASSUMPTION-DRIVEN LOCAL PROTOTYPE — NOT APPROVED`

This is version `0.2.0`, a local, synthetic, simulated React/Node.js rendering of `DOCSET-CLIENT-2026-08-03-A`. The default experience is Mark Chen's client-facing coaching plan, including Now, Goal, Roadmap, Lessons, Practice, Evidence, Phase Review, and a later private Milestone concept. It is not a production MVP and performs no real account, storage, upload, sharing, booking, payment, pause, cancellation, or external-service operation.

## Start

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5180`. The fixed local port avoids a separate workspace service already using 5173. A refresh may reset prototype state.

## Client experience map

- `Now`: current goal cue, phase, priority, coach note, next practice, and latest evidence
- `My goal`: Mark's outcome, motivation, constraints, and honest boundary
- `Roadmap`: four interactive phases with purpose, status, and evidence expectations
- `Lessons`: three-session chapter list and detailed lesson narrative
- `Practice`: coach-authored prescription, interactive session checklist, success check, and stop/ask rule
- `Evidence`: baseline/current/mixed evidence comparisons with source and limitations
- `Phase review`: delivered value, remaining uncertainty, next-phase rationale, independent path, and synthetic package option
- `Milestone`: clearly labelled later private milestone concept with no real save or sharing

All actions remain local preset interactions. No external route is opened.

## Prototype-only technical choices

- React renders a single browser experience.
- Vite supplies the local Node.js development server and build command.
- State is preset and held only in component/browser-session memory.
- CSS and text create all visual placeholders; there are no remote runtime assets.
- No persistence, API, authentication, analytics, security subsystem, test suite, deployment, or production architecture is included.

Security work and formal testing are intentionally deferred. Only install, compile/build, local-process start, and main-URL response checks are permitted before Aaron reviews and approves an exact prototype version.
