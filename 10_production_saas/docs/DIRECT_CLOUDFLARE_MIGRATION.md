# Direct Cloudflare migration readiness

**Status:** Engineering preparation under `AUTH-005` and `TECH-006`; bounded,
non-public portability evidence only. This is not Cloudflare account authority,
deployment authorization, production configuration, or release-readiness evidence.

The direct Cloudflare profile exists to test whether the exact built Worker can be
moved away from the Sites deployment boundary. It deliberately cannot expose a
public endpoint. The generated profile now reserves the exact `oidc_v1` contract,
and the local adversarial suite admits that runtime boundary. Release verification
still fails closed because provider bindings and hosted release evidence do not
exist.

## Safety boundary

The Sites staging release accepts dispatch identity only behind the trusted Sites
boundary. A direct public Worker cannot inherit that trust. Its `oidc_v1` contract
must strip every browser-supplied Sites and application-private identity header,
validate a provider-neutral OpenID Connect authorization-code flow, and accept only
a live revocable server-side session before it injects an internal identity.

The generated configuration consequently sets all of the following:

- `workers_dev=false`;
- `preview_urls=false`;
- no routes;
- exactly `nodejs_compat` and `global_fetch_strictly_public` compatibility flags;
- `INSTRUCTOR_AUTH_MODE=oidc_v1`;
- exact non-secret `OIDC_ISSUER`, `OIDC_CLIENT_ID`, token-endpoint authentication
  method, ID-token signing algorithm, and fixed session lifetime values;
- `observability.enabled=false`, `logs.enabled=false`, and
  `invocation_logs=false`.

Do not add a route, enable a preview URL, or deploy this configuration. The runtime
verifies identity cryptographically at the Worker boundary and strips untrusted
identity headers; its admission remains tied to the exact local adversarial suite.
Merely changing a configuration label, local readiness flag, or manifest continues
to fail verification.

## Render contract

Run the renderer only through its package script so `dist/server/wrangler.json` is
freshly rebuilt first:

```text
npm run render:direct-cloudflare-config -- \
  --account-id <32-lowercase-hex-account-id> \
  --worker-name <lowercase-worker-name> \
  --d1-database-name <lowercase-d1-name> \
  --d1-database-id <canonical-lowercase-uuid> \
  --r2-bucket <lowercase-r2-bucket> \
  --app-url <exact-https-origin> \
  --oidc-issuer <exact-public-https-issuer> \
  --oidc-client-id <public-client-id> \
  --auth-session-lifetime-seconds <900-86400> \
  --release-id <immutable-release-id> \
  --consent-policy-registry-json <approved-json-object>
```

These are non-secret resource identifiers only. The explicit account ID pins every
later Wrangler operation to the reviewed Cloudflare account rather than allowing an
interactive or multi-account choice. The tool accepts no account token,
API token, password, pepper, webhook secret, Sites bypass value, arbitrary variable,
custom input path, or custom output path. `APP_URL` must be an exact public HTTPS
origin such as `https://app.example.ca`, without a trailing slash, port, path, query,
fragment, IP address, or localhost name. The issuer may contain a canonical path but
must use public HTTPS and have no credentials, port, query, or fragment. Session
lifetime has no implicit operator default and is bounded to 15 minutes through 24
hours. The consent registry must match the runtime's exact purpose-entry shape and
must contain `golfer_record` for account subjects and `roadmap_sharing` for golfer
subjects. Unknown keys, partial policies, duplicate subjects, or secret-shaped
configuration fields are rejected before a file is written.

`OIDC_CLIENT_SECRET`, `AUTH_SESSION_PEPPER`, and
`AUTH_TRANSACTION_ENCRYPTION_KEY` are required runtime secrets. They are never CLI
arguments and must be provisioned through the authorized Cloudflare secret store;
the renderer and generated file must never contain their values.

Output is fixed at ignored
`.work/direct-cloudflare/wrangler.json`. The renderer refuses to write if `.work` is
not ignored. Never force-add that file to source control. No generated configuration
belongs in `dist`, because doing so would change the verified build inventory.

The renderer projects only reviewed deployment fields from the fresh build and
replaces Sites-local resource placeholders with explicit inputs. It does not copy
`topLevelName`, `project_id`, runtime variables, or secret-bearing configuration.

| Generated field | Exact resolved release material |
|---|---|
| `main` | `dist/server/index.js` |
| `assets.directory` | `dist/client` |
| D1 `migrations_dir` | `dist/.openai/drizzle` |

The built Sites-normalized file currently contains
`migrations_dir="../../migrations"`, but that location does not exist in the
application. The direct profile intentionally uses the packaged
`dist/.openai/drizzle` copy. Rendering fails unless it contains a journal and numbered
SQL migrations and exactly matches source `drizzle/`.

## Verification behavior

The structural inspection is available for engineering work:

```text
node scripts/verify-direct-cloudflare-config.mjs --structural-only
```

The verifier first runs the contained local D1 preflight and writes a hash-linked,
value-safe manifest at
`.work/private-successor-preflight/manifest.json`. Operations readiness is true only
when that exact manifest validates against the current source and packaged
17-migration `0000`–`0016_handy_green_goblin` inventory, the isolated D1 exercise
applied every migration, the journal's latest identity matched `0016`, migration
0011's authentication structures passed inspection, and `foreign_key_check` was
empty. Missing, stale, altered, or self-inconsistent local evidence keeps operations
readiness false.

The release-readiness command rebuilds and then verifies the fixed generated file:

```text
npm run verify:direct-cloudflare-config
```

That release command is expected to exit non-zero even when local authentication,
configuration, and D1 preflight checks pass. Provider account, database, media,
OIDC, domain/TLS, secret provisioning, log/alerting, hosted journey, accessibility,
recovery, and exact-version owner evidence remain explicit blockers. This is the
intended fail-closed result, not a reason to weaken the check. Structural success is
local evidence only and cannot promote provider, hosted, or release readiness.

## Still required before any migration or release

`[REAL-WORLD VALIDATION REQUIRED]` This preparation does not select or configure a
Cloudflare account, establish account ownership or least privilege, create D1/R2
resources, apply migrations to a provider database, transfer data, configure secrets, attach a domain,
prove TLS/DNS, prove disabled log retention, exercise cron, deliver alerts, restore a
backup, measure RPO/RTO, enable Stripe, or authorize customer data.

Before an actual migration, Aaron must approve the provider/account/domain/operator
and budget boundary; an exact direct authentication architecture must pass security
review; production resources and secret delivery must be configured out of band;
backup/restore and migration rehearsals must pass; and the resulting exact release
must complete the normal acceptance process. The D1 identifier and migration path in
this file do not prove that any migration has been applied.
