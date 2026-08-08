declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MEDIA: R2Bucket;
    APP_URL?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_SOLO_PRICE_ID?: string;
    BILLING_CHECKOUT_ENABLED?: string;
    SHARE_TOKEN_PEPPER?: string;
    ABUSE_LIMIT_PEPPER?: string;
    RELEASE_ID?: string;
    DEV_AUTH_EMAIL?: string;
    DEV_AUTH_NAME?: string;
  }
}
