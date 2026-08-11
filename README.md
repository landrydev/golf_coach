# Roadmap Golf Coaching SaaS

Roadmap is an invite-only beta for independent golf instructors. It turns an adult
golfer assessment into a private, coach-branded development journey that clarifies
the goal, current priority, coaching phases, supporting lesson package, and next
useful action.

## Start here

- [Canonical current status](CURRENT_STATUS.md)
- [Beta application](10_production_saas/README.md)
- [Beta scope and readiness](10_production_saas/BETA_STATUS.md)
- [Current business source](00_source/BUSINESS_PLAN_V2.md)
- [Decision history](DECISION_LOG.md)

## Run the beta

```powershell
cd 10_production_saas
$env:APP_SECRET="replace-with-at-least-32-random-characters"
$env:BETA_INVITE_CODE="replace-with-a-private-code"
npm run verify
npm start
```

Open `http://127.0.0.1:4175`.

## Repository map

- `10_production_saas/` — current source-controlled beta.
- `00_source/` — authoritative and historical business sources.
- `01_business_foundation/` through `08_implementation_handoff/` — planning and
  specification history.
- `09_local_prototype/` — earlier synthetic visual prototype.
- `output/` — predecessor QA and evidence artifacts; not current source.

## Current boundary

The beta includes instructor accounts, coach profiles, packages, golfer roadmaps,
lessons, practice, evidence, phase reviews, private sharing, and bounded golfer
responses. It excludes live billing, native lesson payment, messaging, media upload,
launch-monitor import, AI diagnosis, juniors, teams, and public discovery.

**Current objective:** prove that qualified instructors can create and share a useful
roadmap with real adult golfers at acceptable effort before expanding the product.
