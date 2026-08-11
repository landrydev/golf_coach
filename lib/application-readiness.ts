import { requiredConsentPolicyConfigurationReady } from "@/lib/consent-repository";
import { dataRequestOperatorAccessConfigurationReady } from "@/lib/data-request-operator-access";
import { productAccessConfigurationReady } from "@/lib/product-access";
import { instructorAuthConfigurationReady } from "@/lib/instructor-auth-contract";
import { checkoutEnabled } from "@/lib/stripe";
import { shareTokenPepperConfigurationReady } from "@/lib/tokens";
import {
  readApplicationWriteControl,
  type ApplicationWriteModeState,
} from "@/lib/application-write-control";

export const READINESS_DEPENDENCY_TIMEOUT_MS = 2_000;

/**
 * Prove the latest security-sensitive D1 shape, not merely that D1 answers.
 * Migration 0011 adds OIDC transactions, revocable HMAC sessions, stable
 * issuer-subject account mappings, and the two authentication rate-limit
 * scopes. The query returns one boolean; schema names and DDL never leave this
 * private dependency check.
 */
const DATABASE_SCHEMA_READINESS_QUERY = `WITH required_columns (
    name, declared_type, required_not_null, default_sql, primary_key_position
  ) AS (
    VALUES
      ('scope', 'TEXT', 1, null, 1),
      ('subject_key_hash', 'TEXT', 1, null, 2),
      ('window_started_at', 'INTEGER', 1, null, 3),
      ('window_expires_at', 'INTEGER', 1, null, 0),
      ('request_count', 'INTEGER', 1, '1', 0),
      ('last_request_at', 'INTEGER', 1, null, 0)
  ), actual_columns AS (
    SELECT name,
           upper(trim(type)) AS declared_type,
           "notnull" AS required_not_null,
           trim(dflt_value) AS default_sql,
           pk AS primary_key_position
      FROM pragma_table_info('abuse_rate_limits')
  )
  SELECT CASE WHEN
    (SELECT count(*) FROM actual_columns) = 6
    AND NOT EXISTS (
      SELECT 1
        FROM required_columns AS required
        LEFT JOIN actual_columns AS actual ON actual.name = required.name
       WHERE actual.name IS NULL
          OR actual.declared_type <> required.declared_type
          OR actual.required_not_null <> required.required_not_null
          OR coalesce(actual.default_sql, '') <> coalesce(required.default_sql, '')
          OR actual.primary_key_position <> required.primary_key_position
    )
    AND (
      SELECT count(*)
        FROM pragma_index_list('abuse_rate_limits')
       WHERE name = 'abuse_rate_limits_expires_idx'
         AND "unique" = 0
         AND origin = 'c'
         AND partial = 0
    ) = 1
    AND (
      SELECT count(*)
        FROM pragma_index_info('abuse_rate_limits_expires_idx')
       WHERE seqno = 0
         AND name = 'window_expires_at'
    ) = 1
    AND (
      SELECT count(*)
        FROM pragma_index_info('abuse_rate_limits_expires_idx')
    ) = 1
    AND EXISTS (
      SELECT 1
        FROM sqlite_master
       WHERE type = 'table'
         AND name = 'abuse_rate_limits'
         AND instr(lower(sql), 'abuse_rate_limits_scope_check') > 0
         AND instr(lower(sql), '''share_close_network''') > 0
         AND instr(lower(sql), '''share_close_session''') > 0
         AND instr(lower(sql), '''auth_login_network''') > 0
         AND instr(lower(sql), '''auth_callback_network''') > 0
    )
    AND EXISTS (
      SELECT 1 FROM pragma_table_info('accounts')
       WHERE name = 'auth_issuer' AND upper(trim(type)) = 'TEXT'
    )
    AND EXISTS (
      SELECT 1 FROM pragma_table_info('accounts')
       WHERE name = 'identity_version'
         AND upper(trim(type)) = 'INTEGER'
         AND "notnull" = 1 AND trim(dflt_value) = '1'
    )
    AND (
      SELECT count(*) FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('oidc_login_transactions', 'instructor_sessions')
    ) = 2
    AND (
      SELECT count(*) FROM sqlite_master
       WHERE type = 'index'
         AND name IN (
           'accounts_legacy_auth_identity_unique',
           'accounts_oidc_auth_identity_unique',
           'accounts_id_identity_version_unique',
           'oidc_login_transactions_expiry_consumed_idx',
           'instructor_sessions_token_hash_unique',
           'instructor_sessions_account_revoked_idx',
           'instructor_sessions_expiry_revoked_idx'
         )
    ) = 7
    THEN 1 ELSE 0 END AS healthy`;

export type ApplicationReadiness = Readonly<{
  status: "ready" | "degraded";
  writeControl: Readonly<{
    state: ApplicationWriteModeState;
  }>;
  checks: Readonly<{
    database: boolean;
    media: boolean;
    applicationOrigin: boolean;
    shareCapabilitySigning: boolean;
    abuseProtection: boolean;
    billingCheckoutPolicy: boolean;
    instructorAccessPolicy: boolean;
    instructorAuthentication: boolean;
    consentPolicy: boolean;
    dataRequestOperatorAccessPolicy: boolean;
    applicationWritesEnabled: boolean;
  }>;
}>;

export async function loadApplicationReadiness(input: {
  database: D1Database;
  media: R2Bucket;
  dependencyTimeoutMs?: number;
}): Promise<ApplicationReadiness> {
  const writeControl = readApplicationWriteControl(
    process.env.APPLICATION_WRITE_MODE,
  );
  const checks = {
    database: false,
    media: false,
    applicationOrigin: validProductionOrigin(process.env.APP_URL),
    shareCapabilitySigning: shareTokenPepperConfigurationReady(
      process.env.SHARE_TOKEN_PEPPER,
    ),
    abuseProtection: (process.env.ABUSE_LIMIT_PEPPER?.trim().length ?? 0) >= 32,
    billingCheckoutPolicy: billingCheckoutPolicyReady(),
    instructorAccessPolicy: productAccessConfigurationReady({
      INSTRUCTOR_ACCESS_MODE: process.env.INSTRUCTOR_ACCESS_MODE,
      OWNER_PRIVATE_ACCESS_PEPPER: process.env.OWNER_PRIVATE_ACCESS_PEPPER,
      OWNER_PRIVATE_EMAIL_DIGESTS: process.env.OWNER_PRIVATE_EMAIL_DIGESTS,
      SUBSCRIPTION_ACCESS_STATUSES: process.env.SUBSCRIPTION_ACCESS_STATUSES,
      STRIPE_CHECKOUT_PRICE_ID: process.env.STRIPE_CHECKOUT_PRICE_ID,
      STRIPE_RECOGNIZED_PRICE_IDS: process.env.STRIPE_RECOGNIZED_PRICE_IDS,
      SUBSCRIPTION_ENTITLEMENT_PRICE_IDS:
        process.env.SUBSCRIPTION_ENTITLEMENT_PRICE_IDS,
      SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS:
        process.env.SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS,
    }),
    instructorAuthentication: instructorAuthConfigurationReady({
      APP_URL: process.env.APP_URL,
      INSTRUCTOR_AUTH_MODE: process.env.INSTRUCTOR_AUTH_MODE,
      OIDC_ISSUER: process.env.OIDC_ISSUER,
      OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID,
      OIDC_TOKEN_ENDPOINT_AUTH_METHOD:
        process.env.OIDC_TOKEN_ENDPOINT_AUTH_METHOD,
      OIDC_ID_TOKEN_SIGNING_ALG: process.env.OIDC_ID_TOKEN_SIGNING_ALG,
      AUTH_SESSION_LIFETIME_SECONDS:
        process.env.AUTH_SESSION_LIFETIME_SECONDS,
      OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET,
      AUTH_SESSION_PEPPER: process.env.AUTH_SESSION_PEPPER,
      AUTH_TRANSACTION_ENCRYPTION_KEY:
        process.env.AUTH_TRANSACTION_ENCRYPTION_KEY,
    }),
    consentPolicy: requiredConsentPolicyConfigurationReady(
      process.env.CONSENT_POLICY_REGISTRY_JSON,
    ),
    dataRequestOperatorAccessPolicy:
      dataRequestOperatorAccessConfigurationReady({
        DATA_REQUEST_OPERATOR_ACCESS_PEPPER:
          process.env.DATA_REQUEST_OPERATOR_ACCESS_PEPPER,
        DATA_REQUEST_OPERATOR_EMAIL_DIGESTS:
          process.env.DATA_REQUEST_OPERATOR_EMAIL_DIGESTS,
      }),
    applicationWritesEnabled: writeControl.writesEnabled,
  };

  const dependencyTimeoutMs =
    typeof input.dependencyTimeoutMs === "number" &&
    Number.isFinite(input.dependencyTimeoutMs) &&
    input.dependencyTimeoutMs > 0
      ? input.dependencyTimeoutMs
      : READINESS_DEPENDENCY_TIMEOUT_MS;

  [checks.database, checks.media] = await Promise.all([
    boundedDependencyCheck(async () => {
      const result = await input.database
        .prepare(DATABASE_SCHEMA_READINESS_QUERY)
        .first<{ healthy: number }>();
      return result?.healthy === 1;
    }, dependencyTimeoutMs),
    boundedDependencyCheck(async () => {
      // A missing sentinel is normal. Completing this private HEAD proves the
      // configured R2 binding is reachable without reading customer objects.
      await input.media.head("__roadmap_healthcheck__");
      return true;
    }, dependencyTimeoutMs),
  ]);

  return {
    status: Object.values(checks).every(Boolean) ? "ready" : "degraded",
    writeControl: { state: writeControl.state },
    checks,
  };
}

async function boundedDependencyCheck(
  operation: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const completed = Promise.resolve()
    .then(operation)
    .then(Boolean, () => false);
  const deadline = new Promise<false>((resolve) => {
    timeout = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([completed, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function billingCheckoutPolicyReady(): boolean {
  const enabled = process.env.BILLING_CHECKOUT_ENABLED;
  if (enabled === "false") return true;
  return enabled === "true" && checkoutEnabled();
}

function validProductionOrigin(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const origin = new URL(value);
    return (
      origin.protocol === "https:" &&
      !origin.username &&
      !origin.password &&
      !origin.search &&
      !origin.hash &&
      ["", "/"].includes(origin.pathname)
    );
  } catch {
    return false;
  }
}
