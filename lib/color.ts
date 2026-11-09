// Color contrast helpers (WCAG 2.x relative luminance and contrast ratio).
// Used to pick readable text on the streaming services' brand colors
// (`onColor` in lib/providers.ts) and, in tests, to check the theme tokens in
// app/globals.css against WCAG AA (docs/UI_DIRECTION.md Section 3).

/** Dark text for light backgrounds: the light theme's `--text`. */
export const DARK_TEXT = "#111827";
/** Light text for dark backgrounds. */
export const LIGHT_TEXT = "#ffffff";

/** WCAG AA minimum for body text. */
export const AA_TEXT = 4.5;
/** WCAG AA minimum for large text and icons. */
export const AA_LARGE = 3;

/** Parses `#rgb` or `#rrggbb` into 0–255 channels. Throws on anything else. */
export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a hex color: ${hex}`);
  const digits =
    m[1].length === 3
      ? [...m[1]].map((d) => d + d).join("")
      : m[1].toLowerCase();
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, 1 to 21 (order doesn't matter). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The text color for a background: white or dark, whichever contrasts more.
 * Ties go to white.
 */
export function onColor(background: string): string {
  return contrastRatio(background, LIGHT_TEXT) >=
    contrastRatio(background, DARK_TEXT)
    ? LIGHT_TEXT
    : DARK_TEXT;
}
