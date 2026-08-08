import { productAccessConfigurationReady } from "@/lib/product-access";
import {
  billingConfigured,
  checkoutConfiguration,
} from "@/lib/stripe";
import { shareTokenPepperConfigurationReady } from "@/lib/tokens";

export type ApplicationReadiness = Readonly<{
  status: "ready" | "degraded";
  checks: Readonly<{
    database: boolean;
    media: boolean;
    applicationOrigin: boolean;
    shareCapabilitySigning: boolean;
    abuseProtection: boolean;
    billingCheckoutPolicy: boolean;
    instructorAccessPolicy: boolean;
  }>;
}>;

export async function loadApplicationReadiness(input: {
  database: D1Database;
  media: R2Bucket;
}): Promise<ApplicationReadiness> {
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
  };

  try {
    const result = await input.database
      .prepare("SELECT 1 AS healthy")
      .first<{ healthy: number }>();
    checks.database = result?.healthy === 1;
  } catch {
    checks.database = false;
  }

  try {
    // A missing sentinel is normal. Completing this private HEAD proves the
    // configured R2 binding is reachable without reading customer objects.
    await input.media.head("__roadmap_healthcheck__");
    checks.media = true;
  } catch {
    checks.media = false;
  }

  return {
    status: Object.values(checks).every(Boolean) ? "ready" : "degraded",
    checks,
  };
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
