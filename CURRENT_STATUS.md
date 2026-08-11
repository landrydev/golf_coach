# Roadmap — Canonical Project Status

**Project stage:** controlled-beta recovery  
**Canonical application:** `10_production_saas`  
**Current source version:** `0.1.0` beta recovery build  
**Public/paid release:** not live  
**Market validation:** not yet completed

## Why this status file exists

The earlier workspace accumulated planning documents, local prototypes, private
OpenAI Sites releases, rich functional experiments, and many evidence packets. The
original `10_production_saas` directory was committed as a broken nested Git pointer,
so the production source was not recoverable from GitHub.

The recovery build replaces that pointer with a compact source-controlled beta that
can be cloned, run, tested, backed up, and understood by another person.

## Product scope now

Roadmap helps an independent golf instructor convert an adult golfer assessment into
a private coach-branded development journey:

- goal and motivation;
- starting assessment, strengths, barriers, and current priority;
- three or four directional phases;
- an existing lesson-package or contact action;
- lesson chapters, practice, selected evidence, and phase reviews;
- a private revocable golfer link; and
- one bounded golfer response.

## What is historical

Folders `00_source` through `09_local_prototype`, the root decision history, and
`output/` remain useful provenance. They are not the operational status of the beta.
Where a historical status conflicts with this file and the source under
`10_production_saas`, use this file for current navigation while preserving the
historical record.

## Immediate sequence

1. Merge the beta-recovery pull request after review.
2. Clone the repository fresh and run `npm run verify` under `10_production_saas`.
3. Deploy one invite-only HTTPS instance with persistent private storage and backups.
4. Complete a manual mobile/desktop/keyboard review of that exact deployment.
5. Approve a bounded beta notice, participant list, support route, retention rule,
   and stop conditions.
6. Run five instructor sessions before adding major functionality.

## Non-negotiable truth

Automated tests do not validate demand, usability, willingness to pay, commercial
outcomes, legal compliance, or production suitability. The next project milestone
is observed beta use—not another autonomous feature expansion.
