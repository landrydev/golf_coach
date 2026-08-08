export type ShareToken = {
  raw: string;
  hash: string;
  prefix: string;
};

export type ShareSessionToken = {
  raw: string;
  hash: string;
};

const MINIMUM_SHARE_TOKEN_PEPPER_LENGTH = 32;

export function shareTokenPepperConfigurationReady(
  value: string | undefined,
): boolean {
  return (value?.trim().length ?? 0) >= MINIMUM_SHARE_TOKEN_PEPPER_LENGTH;
}

export async function createShareToken(): Promise<ShareToken> {
  const raw = createOpaqueToken();
  return {
    raw,
    hash: await hashToken(raw),
    prefix: raw.slice(0, 8),
  };
}

export async function createShareSessionToken(): Promise<ShareSessionToken> {
  const raw = createOpaqueToken();
  return {
    raw,
    // Domain separation prevents a session fingerprint from matching a share
    // verifier fingerprint even in the effectively impossible event that the
    // two independent random values are equal.
    hash: await hashShareSessionToken(raw),
  };
}

export function hashShareSessionToken(raw: string): Promise<string> {
  return hashToken(`share-session-v1:${raw}`);
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

function createOpaqueToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function shareTokenPepper(): string {
  const configured = process.env.SHARE_TOKEN_PEPPER?.trim();
  if (configured && shareTokenPepperConfigurationReady(configured)) {
    return configured;
  }
  if (!configured && process.env.NODE_ENV !== "production") {
    return "roadmap-local-development-pepper-not-for-production";
  }
  if (!configured) {
    throw new Error("SHARE_TOKEN_PEPPER is required in production.");
  }
  throw new Error("SHARE_TOKEN_PEPPER must be at least 32 characters.");
}
