# Beta 2 UI contract migration

Beta 2 changes visible hierarchy, navigation, authoring language, and the golfer publication.
Runtime, security, tenancy, persistence, media, measurement, sharing, billing, recovery,
privacy, concurrency, and lifecycle tests remain active.

Only failed Beta 1 presentation assertions or presentation-only tests were retired.
Every migration was blocked when its assertion or test title referred to a protected
runtime or safety concern. Replacement coverage is provided by:

- `tests/beta2-experience.test.mjs`;
- the complete production verification suite;
- `scripts/beta2-browser-smoke.mjs` rendered acceptance.

Migrated visible contracts: **0**

