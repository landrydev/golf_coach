import { env } from "cloudflare:workers";
import { productAccessConfigurationReady } from "@/lib/product-access";
import { shareTokenPepperConfigurationReady } from "@/lib/tokens";
import {
  billingConfigured,
  checkoutConfiguration,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    database: false,
    media: false,
    applicationOrigin: validProductionOrigin(process.env.APP_URL),
    shareTokenPepper: shareTokenPepperConfigurationReady(
      process.env.SHARE_TOKEN_PEPPER,
    ),
    abuseLimitPepper: (process.env.ABUSE_LIMIT_PEPPER?.trim().length ?? 0) >= 32,
    billingCheckoutPolicy: billingCheckoutPolicyReady(),
    instructorAccessPolicy: productAccessConfigurationReady({
      INSTRUCTOR_ACCESS_MODE: process.env.INSTRUCTOR_ACCESS_MODE,
      OWNER_PRIVATE_ACCESS_PEPPER: process.env.OWNER_PRIVATE_ACCESS_PEPPER,
      OWNER_PRIVATE_EMAIL_DIGESTS: process.env.OWNER_PRIVATE_EMAIL_DIGESTS,
      SUBSCRIPTION_ACCESS_STATUSES:
        process.env.SUBSCRIPTION_ACCESS_STATUSES,
      STRIPE_CHECKOUT_PRICE_ID: process.env.STRIPE_CHECKOUT_PRICE_ID,
      STRIPE_RECOGNIZED_PRICE_IDS: process.env.STRIPE_RECOGNIZED_PRICE_IDS,
      SUBSCRIPTION_ENTITLEMENT_PRICE_IDS:
        process.env.SUBSCRIPTION_ENTITLEMENT_PRICE_IDS,
      SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS:
        process.env.SUBSCRIPTION_MAX_PROJECTION_AGE_SECONDS,
    }),
  };

  try {
    const result = await env.DB.prepare("SELECT 1 AS healthy").first<{
      healthy: number;
    }>();
    checks.database = result?.healthy === 1;
  } catch {
    checks.database = false;
  }

  try {
    // A missing sentinel is the normal result; completing the private HEAD
    // operation proves that the production R2 binding is reachable.
    await env.MEDIA.head("__roadmap_healthcheck__");
    checks.media = true;
  } catch {
    checks.media = false;
  }

  const ready = Object.values(checks).every(Boolean);
  return Response.json(
    {
      status: ready ? "ready" : "degraded",
      releaseId: process.env.RELEASE_ID?.trim() || "unversioned",
      checks,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );
}

function billingCheckoutPolicyReady(): boolean {
  // Match checkoutEnabled() exactly. Whitespace or any non-canonical value is
  // a configuration error, never a silently normalized enable/disable flag.
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
