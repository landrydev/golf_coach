# Roadmap Beta Recovery Build

This directory is the canonical, source-controlled beta application for Roadmap.
It replaces the broken nested-repository pointer that previously occupied
`10_production_saas` in the parent repository.

## What this beta proves

The beta deliberately tests the smallest complete business loop:

1. an invited independent instructor creates an account;
2. the instructor configures a coach identity and existing lesson package;
3. the instructor creates an adult golfer roadmap containing a goal, assessment,
   current priority, three or four phases, and an honest next action;
4. the instructor adds bounded lesson, practice, evidence, and phase-review records;
5. the instructor previews and publishes a private revocable link; and
6. the golfer reviews the plan and records one bounded response.

It does **not** process lesson payments, send email or text messages, diagnose a
swing, analyze media, support juniors, provide a public coach directory, or claim
that a golfer booked or paid.

## Technical shape

- Node.js 22 or newer.
- No runtime npm dependencies.
- Invite-only multi-instructor accounts.
- Passwords hashed with `scrypt`.
- Signed HttpOnly sessions and CSRF checks.
- Server-enforced tenant isolation.
- Private random share links with publish, replacement, and revocation.
- Atomic JSON persistence suitable for a small controlled beta.
- Responsive instructor and golfer experiences.
- Node test coverage for the critical end-to-end journey, tenant isolation,
  persistence, restart recovery, golfer response, and share revocation.

This is intentionally a beta architecture, not the final scale architecture. The
JSON data file must live on persistent private storage and be backed up.

## Run locally

```powershell
cd 10_production_saas
Copy-Item .env.example .env
# Edit .env and set APP_SECRET and BETA_INVITE_CODE.
$env:APP_SECRET="replace-with-a-long-random-secret"
$env:BETA_INVITE_CODE="replace-with-a-private-code"
npm run verify
npm start
```

Open `http://127.0.0.1:4175`.

The app does not automatically read `.env`; set environment variables in the shell
or through the deployment platform.

## Required production-like configuration

- `APP_SECRET`: at least 32 random characters.
- `BETA_INVITE_CODE`: private code distributed only to approved beta instructors.
- `PUBLIC_ORIGIN`: exact HTTPS origin used to generate private links.
- `COOKIE_SECURE=true` behind HTTPS.
- `DATA_FILE`: path on a persistent, private, backed-up disk.

## Verification

```powershell
npm run verify
```

The verification suite starts the real server against a fresh temporary data store,
registers two instructors, proves tenant isolation, creates and publishes a complete
roadmap, opens the private golfer view, records a golfer response, restarts the
server, confirms persistence, revokes the link, and verifies it is unavailable.

## Controlled-beta operating rules

- Adult golfers only.
- Use only information the instructor is authorized to enter and share.
- Do not store medical diagnoses, government identifiers, payment details, or
  unnecessary personal information.
- Treat the data directory and backups as private.
- Do not promise legal, privacy, security, accessibility, performance, or production
  compliance beyond the evidence actually collected.
- Export and back up data before every deployment.
- Record every beta participant, consent version, support intervention, and severe
  issue outside the application in the beta operations log.

## What comes after evidence

Do not restore media uploads, launch-monitor CSV imports, Stripe billing, or a larger
command centre merely because predecessor code attempted them. Add those capabilities
only when observed beta use shows they are needed for activation, recurring value,
or willingness to pay.
