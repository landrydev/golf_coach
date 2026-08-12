const DEFAULT_COACH_ACCENT = "#1f5a48";
const ACCENT_BACKGROUNDS = ["#ffffff", "#f6f2e8"] as const;
const MINIMUM_TEXT_CONTRAST = 4.5;

/**
 * Coach accents are used both as text on light surfaces and as a background
 * behind white text. Keep the customization boundary to colours that satisfy
 * normal-text contrast in both uses.
 */
export function isAccessibleCoachAccent(value: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return false;
  return ACCENT_BACKGROUNDS.every(
    (background) => contrastRatio(value, background) >= MINIMUM_TEXT_CONTRAST,
  );
}

export function safeCoachAccent(value?: string | null): string {
  return value && isAccessibleCoachAccent(value)
    ? value
    : DEFAULT_COACH_ACCENT;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
