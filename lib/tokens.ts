export type ShareToken = {
  raw: string;
  hash: string;
  prefix: string;
};

export async function createShareToken(): Promise<ShareToken> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = toBase64Url(bytes);
  return {
    raw,
    hash: await hashToken(raw),
    prefix: raw.slice(0, 8),
  };
}

export async function hashToken(raw: string): Promise<string> {
  const pepper = shareTokenPepper();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(raw),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function newId(): string {
  return crypto.randomUUID();
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function shareTokenPepper(): string {
  const configured = process.env.SHARE_TOKEN_PEPPER?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") {
    return "roadmap-local-development-pepper-not-for-production";
  }
  throw new Error("SHARE_TOKEN_PEPPER is required in production.");
}
