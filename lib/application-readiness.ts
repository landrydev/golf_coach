import { requiredConsentPolicyConfigurationReady } from "@/lib/consent-repository";
import { dataRequestOperatorAccessConfigurationReady } from "@/lib/data-request-operator-access";
import { productAccessConfigurationReady } from "@/lib/product-access";
import {
  billingConfigured,
  checkoutConfiguration,
} from "@/lib/stripe";
import { shareTokenPepperConfigurationReady } from "@/lib/tokens";
import {
  readApplicationWriteControl,
  type ApplicationWriteModeState,
} from "@/lib/application-write-control";

export const READINESS_DEPENDENCY_TIMEOUT_MS = 2_000;

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
        .prepare("SELECT 1 AS healthy")
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
  return enabled === "true" && billingConfigured() && Boolean(checkoutConfiguration());
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
