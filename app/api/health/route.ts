import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    database: false,
    media: false,
    applicationOrigin: validProductionOrigin(process.env.APP_URL),
    shareTokenPepper: Boolean(process.env.SHARE_TOKEN_PEPPER?.trim()),
    abuseLimitPepper: (process.env.ABUSE_LIMIT_PEPPER?.trim().length ?? 0) >= 32,
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
