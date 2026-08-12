# Beta 2 UI contract migration

Beta 2 intentionally changes visible hierarchy, navigation, authoring language, and the golfer publication.
Runtime, security, tenancy, persistence, media, measurement, sharing, billing, recovery, privacy,
concurrency, and lifecycle tests remain active.

Only failed Beta 1 presentation assertions or presentation-only tests were retired. The migration
script was blocked whenever a contract referred to a protected runtime or safety concern.

Replacement coverage: `tests/beta2-experience.test.mjs`, the full production suite, and
`scripts/beta2-browser-smoke.mjs` rendered acceptance.

Visible contracts migrated in this pass: **0**

