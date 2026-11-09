import { describe, expect, it } from "vitest";
import {
  contrastFailures,
  flattenBackground,
  focusFailures,
  focusRingProblem,
  isLargeText,
  parseCssColor,
  tapTargetFailures,
  textContrast,
  type FocusSample,
  type TextSample,
} from "./a11y-lib";

describe("parseCssColor", () => {
  it.each([
    ["rgb(17, 24, 39)", { r: 17, g: 24, b: 39, a: 1 }],
    ["rgba(0, 0, 0, 0)", { r: 0, g: 0, b: 0, a: 0 }],
    ["rgba(255, 255, 255, 0.5)", { r: 255, g: 255, b: 255, a: 0.5 }],
    ["rgb(10 20 30 / 25%)", { r: 10, g: 20, b: 30, a: 0.25 }],
    ["#fff", { r: 255, g: 255, b: 255, a: 1 }],
    ["#4F46E5", { r: 79, g: 70, b: 229, a: 1 }],
    ["transparent", { r: 0, g: 0, b: 0, a: 0 }],
  ])("parses %s", (input, expected) => {
    expect(parseCssColor(input)).toEqual(expected);
  });

  it.each(["red", "color(srgb 1 0 0)", "rgb(1, 2)", "rgb(a, b, c)", ""])(
    "rejects %j rather than guessing",
    (input) => {
      expect(() => parseCssColor(input)).toThrow(/unsupported color/);
    },
  );
});

describe("flattenBackground", () => {
  it("stops at the first opaque layer", () => {
    expect(
      flattenBackground([
        "rgba(0, 0, 0, 0)",
        "rgb(21, 26, 41)",
        "rgb(255, 255, 255)",
      ]),
    ).toBe("#151a29");
  });

  it("composites a translucent layer over the one below", () => {
    expect(
      flattenBackground(["rgba(0, 0, 0, 0.5)", "rgb(255, 255, 255)"]),
    ).toBe("#808080");
  });

  it("falls back to white when nothing is opaque (the canvas)", () => {
    expect(flattenBackground(["rgba(0, 0, 0, 0)"])).toBe("#ffffff");
    expect(flattenBackground([])).toBe("#ffffff");
  });
});

describe("isLargeText", () => {
  it.each([
    [24, 400, true],
    [23.9, 400, false],
    [18.66, 700, true],
    [18.66, 600, false],
    [18, 700, false],
    [28, 700, true],
  ])("%spx at weight %s → %s", (size, weight, large) => {
    expect(isLargeText(size, weight)).toBe(large);
  });
});

const sample = (over: Partial<TextSample> = {}): TextSample => ({
  label: "p",
  color: "rgb(17, 24, 39)",
  backgrounds: ["rgb(255, 255, 255)"],
  fontSizePx: 16,
  fontWeight: 400,
  opacity: 1,
  ...over,
});

describe("textContrast", () => {
  it("measures text against the flattened background", () => {
    const r = textContrast(sample());
    expect(r.ratio).toBeGreaterThan(17);
    expect(r.required).toBe(4.5);
    expect(r.background).toBe("#ffffff");
  });

  it("needs only 3:1 for large text", () => {
    expect(
      textContrast(sample({ fontSizePx: 28, fontWeight: 700 })).required,
    ).toBe(3);
  });

  it("fades the text by the element's opacity", () => {
    const full = textContrast(sample()).ratio;
    const faded = textContrast(sample({ opacity: 0.5 })).ratio;
    expect(faded).toBeLessThan(full / 2);
  });

  it("fades the text by its own alpha", () => {
    expect(
      textContrast(sample({ color: "rgba(17, 24, 39, 0.3)" })).ratio,
    ).toBeLessThan(4.5);
  });
});

describe("contrastFailures", () => {
  it("passes the theme's muted text on its surface", () => {
    // Light --text-muted on --surface.
    expect(contrastFailures([sample({ color: "rgb(91, 100, 120)" })])).toEqual(
      [],
    );
  });

  it("reports dark --accent on --accent-soft (the pressed card icon bug)", () => {
    const lines = contrastFailures([
      sample({
        label: 'button.icon "♥"',
        color: "rgb(129, 140, 248)",
        backgrounds: ["rgb(43, 47, 92)"],
      }),
    ]);
    expect(lines).toEqual([
      'button.icon "♥": 4.23:1 < 4.5:1 (#818cf8 on #2b2f5c)',
    ]);
  });

  it("reports the same text once", () => {
    const bad = sample({ color: "rgb(200, 200, 200)" });
    expect(contrastFailures([bad, bad])).toHaveLength(1);
  });
});

describe("tapTargetFailures", () => {
  it("passes 44×44 and larger, and allows half a pixel of rounding", () => {
    expect(
      tapTargetFailures([
        { label: "a", width: 44, height: 44, inline: false },
        { label: "b", width: 120, height: 43.6, inline: false },
      ]),
    ).toEqual([]);
  });

  it("reports a target short in either direction", () => {
    expect(
      tapTargetFailures([
        { label: 'button "Light"', width: 57, height: 36, inline: false },
        { label: 'a "TMDB"', width: 38, height: 44, inline: false },
      ]),
    ).toEqual(['button "Light": 57×36 px', 'a "TMDB": 38×44 px']);
  });

  it("exempts links inside a sentence", () => {
    expect(
      tapTargetFailures([
        { label: 'a "Sign in"', width: 40, height: 20, inline: true },
      ]),
    ).toEqual([]);
  });
});

const ring = (over: Partial<FocusSample> = {}): FocusSample => ({
  label: "a",
  focusVisible: true,
  outlineStyle: "solid",
  outlineWidthPx: 2,
  outlineColor: "rgb(79, 70, 229)",
  backgrounds: ["rgb(246, 247, 251)"],
  clipped: false,
  ...over,
});

describe("focusRingProblem", () => {
  it("accepts the theme's ring (2 px --accent) on --bg in both themes", () => {
    expect(focusRingProblem(ring())).toBeNull();
    expect(
      focusRingProblem(
        ring({
          outlineColor: "rgb(129, 140, 248)",
          backgrounds: ["rgb(11, 14, 26)"],
        }),
      ),
    ).toBeNull();
  });

  it("rejects no outline, or one under 2 px", () => {
    expect(focusRingProblem(ring({ outlineStyle: "none" }))).toMatch(/no ring/);
    expect(focusRingProblem(ring({ outlineWidthPx: 1 }))).toMatch(/no ring/);
  });

  it("rejects a ring that doesn't stand out from what's behind it", () => {
    expect(
      focusRingProblem(
        ring({
          outlineColor: "rgb(225, 228, 238)",
          backgrounds: ["rgb(255, 255, 255)"],
        }),
      ),
    ).toMatch(/< 3:1/);
  });

  it("rejects a clipped ring and focus that isn't :focus-visible", () => {
    expect(focusRingProblem(ring({ clipped: true }))).toMatch(/clipped/);
    expect(focusRingProblem(ring({ focusVisible: false }))).toMatch(
      /focus-visible/,
    );
  });
});

describe("focusFailures", () => {
  it("lists only the problems, labelled", () => {
    expect(
      focusFailures([ring(), ring({ label: "a.card", clipped: true })]),
    ).toEqual(["a.card: ring clipped by an overflow container"]);
  });
});
