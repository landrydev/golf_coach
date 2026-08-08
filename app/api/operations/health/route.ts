import { env } from "cloudflare:workers";
import { requireApiIdentity } from "@/lib/identity";
import { ownerOperatorAccessGranted } from "@/lib/product-access";
import { loadSchedulerOperationalHealth } from "@/lib/scheduler-heartbeat";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const auth = await requireApiIdentity();
    if (auth.response) return privateJsonResponse(auth.response);

    const operatorAllowed = await ownerOperatorAccessGranted({
      authenticatedEmail: auth.identity.email,
      environment: {
        OWNER_PRIVATE_ACCESS_PEPPER:
          process.env.OWNER_PRIVATE_ACCESS_PEPPER,
        OWNER_PRIVATE_EMAIL_DIGESTS:
          process.env.OWNER_PRIVATE_EMAIL_DIGESTS,
      },
    });
    if (!operatorAllowed) {
      return privateJson(
        {
          error: {
            code: "operator_access_denied",
            message: "Operational health is not available for this account.",
          },
        },
        403,
      );
    }

    const health = await loadSchedulerOperationalHealth({
      database: env.DB,
      releaseId: process.env.RELEASE_ID,
    });
    return privateJson(health, health.status === "ready" ? 200 : 503);
  } catch {
    return privateJson(
      {
        error: {
          code: "operational_health_unavailable",
          message: "Operational health is temporarily unavailable.",
        },
      },
      503,
    );
  }
}

function privateJson(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: privateHeaders(),
  });
}

function privateJsonResponse(response: Response): Response {
  const headers = privateHeaders();
  for (const [name, value] of headers) response.headers.set(name, value);
  return response;
}

function privateHeaders(): Headers {
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });
}
