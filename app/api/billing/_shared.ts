import { RequestError } from "@/lib/http";

export function applicationOrigin(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new RequestError(
        503,
        "application_origin_not_configured",
        "Billing is unavailable because the application origin is not configured.",
      );
    }
    return new URL(request.url).origin;
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new RequestError(
      503,
      "application_origin_invalid",
      "Billing is unavailable because the application origin is invalid.",
    );
  }

  const localDevelopmentOrigin =
    process.env.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localDevelopmentOrigin) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  ) {
    throw new RequestError(
      503,
      "application_origin_invalid",
      "Billing is unavailable because the application origin is invalid.",
    );
  }

  return url.origin;
}

export function hostedBillingUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RequestError(
      502,
      "billing_provider_response_invalid",
      "Billing is temporarily unavailable. No charge was made.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
  ) {
    throw new RequestError(
      502,
      "billing_provider_response_invalid",
      "Billing is temporarily unavailable. No charge was made.",
    );
  }
  return url.toString();
}

export function billingRedirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function requestId(request: Request): string {
  return request.headers.get("cf-ray") ?? crypto.randomUUID();
}
