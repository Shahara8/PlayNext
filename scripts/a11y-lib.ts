// Pure judgements for the accessibility checks in scripts/smoke.ts
// (docs/UI_DIRECTION.md Section 2: text contrast at least WCAG AA in both
// themes, tap targets at least 44×44 px, a visible focus ring on everything
// interactive). The browser side (scripts/a11y-probe.ts) only reports raw
// computed styles and sizes; everything that decides pass or fail is here,
// so it's unit-tested (scripts/a11y-lib.test.ts).

import { AA_LARGE, AA_TEXT, contrastRatio } from "../lib/color";

export type Rgba = { r: number; g: number; b: number; a: number };

/**
 * Parses a computed CSS color: `rgb(r, g, b)`, `rgba(r, g, b, a)`, the
 * space-separated `rgb(r g b / a)`, or `#rgb` / `#rrggbb`. `transparent` is
 * fully transparent black. Throws on anything else (e.g. `color(…)` or a
 * named color), so a new color form fails loudly rather than passing.
 */
export function parseCssColor(input: string): Rgba {
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const d =
      hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(d.slice(i, i + 2), 16));
    return { r, g, b, a: 1 };
  }
  const fn = /^rgba?\((.*)\)$/.exec(s);
  if (!fn) throw new Error(`unsupported color: ${input}`);
  const parts = fn[1]
    .replace("/", " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4)
    throw new Error(`unsupported color: ${input}`);
  const channel = (p: string) =>
    p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p);
  const alpha = (p: string) =>
    p.endsWith("%") ? parseFloat(p) / 100 : parseFloat(p);
  const [r, g, b] = parts.slice(0, 3).map(channel);
  const a = parts[3] === undefined ? 1 : alpha(parts[3]);
  if ([r, g, b, a].some((n) => Number.isNaN(n)))
    throw new Error(`unsupported color: ${input}`);
  return { r, g, b, a };
}

/** Source-over: `top` drawn on an opaque `bottom`. */
function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

function toHex({ r, g, b }: Rgba): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * The opaque color behind an element: its background layers, nearest first
 * (the element's own, then each ancestor's), composited until one is opaque.
 * If none is, they sit on white, as the browser's canvas does.
 */
export function flattenBackground(layers: string[]): string {
  const parsed = layers.map(parseCssColor);
  const firstOpaque = parsed.findIndex((c) => c.a >= 1);
  const stack = firstOpaque === -1 ? parsed : parsed.slice(0, firstOpaque + 1);
  let color: Rgba =
    firstOpaque === -1 ? { r: 255, g: 255, b: 255, a: 1 } : stack.pop()!;
  for (let i = stack.length - 1; i >= 0; i--) color = over(stack[i], color);
  return toHex(color);
}

/**
 * WCAG "large text": at least 24 px, or at least 18.66 px (14 pt) and bold.
 * Large text needs 3:1; anything else 4.5:1.
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

/** One piece of visible text, as the probe reports it. */
export type TextSample = {
  /** Where it is, for the failure message (e.g. `p.lead "That page…"`). */
  label: string;
  color: string;
  /** Background layers, nearest first (see flattenBackground). */
  backgrounds: string[];
  fontSizePx: number;
  fontWeight: number;
  /** The product of the element's and its ancestors' opacity. */
  opacity: number;
};

export type ContrastResult = {
  label: string;
  ratio: number;
  required: number;
  foreground: string;
  background: string;
};

/** The contrast of one text sample against what's behind it. */
export function textContrast(sample: TextSample): ContrastResult {
  const background = flattenBackground(sample.backgrounds);
  const fg = parseCssColor(sample.color);
  const foreground = toHex(
    over({ ...fg, a: fg.a * sample.opacity }, parseCssColor(background)),
  );
  return {
    label: sample.label,
    ratio: contrastRatio(foreground, background),
    required: isLargeText(sample.fontSizePx, sample.fontWeight)
      ? AA_LARGE
      : AA_TEXT,
    foreground,
    background,
  };
}

/** The samples below AA, one line each, the same text reported once. */
export function contrastFailures(samples: TextSample[]): string[] {
  const lines = samples
    .map(textContrast)
    .filter((r) => r.ratio < r.required)
    .map(
      (r) =>
        `${r.label}: ${r.ratio.toFixed(2)}:1 < ${r.required}:1 (${r.foreground} on ${r.background})`,
    );
  return [...new Set(lines)];
}

/** One interactive element's size, as the probe reports it. */
export type TapTarget = {
  label: string;
  /** The larger of the element's box and an absolutely placed ::before/::after. */
  width: number;
  height: number;
  /**
   * A link inside a sentence: WCAG 2.5.8 exempts these, since enlarging
   * them would break the line of text.
   */
  inline: boolean;
};

export const MIN_TAP_PX = 44;

/** Targets smaller than 44×44 that aren't inline text links. */
export function tapTargetFailures(
  targets: TapTarget[],
  min = MIN_TAP_PX,
): string[] {
  // Half a pixel of slack: sizes in rem land on fractions at some widths.
  const short = (n: number) => n < min - 0.5;
  return [
    ...new Set(
      targets
        .filter((t) => !t.inline && (short(t.width) || short(t.height)))
        .map(
          (t) =>
            `${t.label}: ${Math.round(t.width)}×${Math.round(t.height)} px`,
        ),
    ),
  ];
}

/** The focused element's ring, as the probe reports it after a Tab. */
export type FocusSample = {
  label: string;
  /** Whether the browser treats this focus as keyboard focus. */
  focusVisible: boolean;
  outlineStyle: string;
  outlineWidthPx: number;
  outlineColor: string;
  /** Background layers behind the ring, nearest first. */
  backgrounds: string[];
  /** An ancestor with overflow clipping cuts the ring off. */
  clipped: boolean;
};

/** Non-text contrast (WCAG 1.4.11): the ring against what's behind it. */
export const RING_CONTRAST = 3;

/** Why a focused element has no usable ring, or null if it's fine. */
export function focusRingProblem(s: FocusSample): string | null {
  if (!s.focusVisible) return "not :focus-visible after Tab";
  if (s.outlineStyle === "none" || s.outlineWidthPx < 2)
    return `no ring (outline ${s.outlineStyle} ${s.outlineWidthPx}px)`;
  const background = flattenBackground(s.backgrounds);
  const ring = flattenBackground([s.outlineColor, background]);
  const ratio = contrastRatio(ring, background);
  if (ratio < RING_CONTRAST)
    return `ring ${ring} on ${background} is ${ratio.toFixed(2)}:1 < ${RING_CONTRAST}:1`;
  if (s.clipped) return "ring clipped by an overflow container";
  return null;
}

/** Focus problems, one line each. */
export function focusFailures(samples: FocusSample[]): string[] {
  return [
    ...new Set(
      samples.flatMap((s) => {
        const problem = focusRingProblem(s);
        return problem ? [`${s.label}: ${problem}`] : [];
      }),
    ),
  ];
}
