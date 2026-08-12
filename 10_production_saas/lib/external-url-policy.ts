/** Client- and server-safe policy for browser destinations supplied by a coach. */
export function isPublicHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname.length > 253 || !hostname.includes(".")) return false;

  // Browser destinations must be domain names. Reject literals and ambiguous
  // local/private suffixes rather than trying to maintain an IP range parser.
  if (hostname.includes(":") || /^\d+(?:\.\d+){3}$/.test(hostname)) return false;

  const blockedSuffixes = [
    "localhost",
    "local",
    "internal",
    "home.arpa",
    "test",
    "invalid",
    "example",
  ];
  if (
    blockedSuffixes.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    )
  ) {
    return false;
  }

  return hostname
    .split(".")
    .every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    );
}

export function isCanonicalPublicHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      isPublicHostname(parsed.hostname) &&
      parsed.toString() === value
    );
  } catch {
    return false;
  }
}
