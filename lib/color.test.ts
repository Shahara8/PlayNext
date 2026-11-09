import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  AA_LARGE,
  AA_TEXT,
  contrastRatio,
  DARK_TEXT,
  LIGHT_TEXT,
  onColor,
  parseHex,
  relativeLuminance,
} from "./color";
import { PROVIDERS } from "./providers";

describe("parseHex", () => {
  it("parses long and short forms, any case", () => {
    expect(parseHex("#4f46E5")).toEqual([79, 70, 229]);
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex(" #000000 ")).toEqual([0, 0, 0]);
  });

  it("rejects anything else", () => {
    for (const bad of ["fff", "#ffff", "#gggggg", "red", "", "#12345"])
      expect(() => parseHex(bad)).toThrow(/not a hex color/);
  });
});

describe("relativeLuminance / contrastRatio", () => {
  it("matches the WCAG reference points", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("is symmetric and 1 for equal colors", () => {
    expect(contrastRatio("#e50914", "#ffffff")).toBe(
      contrastRatio("#ffffff", "#e50914"),
    );
    expect(contrastRatio("#4f46e5", "#4f46e5")).toBe(1);
  });
});

describe("onColor", () => {
  it("picks white on dark colors and dark text on light ones", () => {
    expect(onColor("#000000")).toBe(LIGHT_TEXT);
    expect(onColor("#113ccf")).toBe(LIGHT_TEXT);
    expect(onColor("#ffffff")).toBe(DARK_TEXT);
    expect(onColor("#f5a800")).toBe(DARK_TEXT); // yes amber
  });

  it("gives every provider's Watch button AA text", () => {
    for (const p of PROVIDERS) {
      expect(p.onColor).toBe(onColor(p.color));
      expect(contrastRatio(p.color, p.onColor)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

// The theme tokens in app/globals.css (docs/UI_DIRECTION.md Section 3), read
// from the stylesheet itself so a changed value can't silently break AA.
describe("theme tokens in app/globals.css", () => {
  const css = readFileSync("app/globals.css", "utf8");

  /** The `--name: #hex` declarations of the first block matching `selector`. */
  function tokens(selector: string): Record<string, string> {
    const start = css.indexOf(selector);
    if (start < 0) throw new Error(`no ${selector} block`);
    const open = css.indexOf("{", start);
    const body = css.slice(open + 1, css.indexOf("}", open));
    return Object.fromEntries(
      [...body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)].map(
        (m) => [m[1], m[2]],
      ),
    );
  }

  const light = tokens(":root {");
  const dark = tokens(':root[data-theme="dark"]');
  const darkSystem = tokens(':root:not([data-theme="light"])');

  it("defines the same dark tokens for the setting and the device preference", () => {
    expect(darkSystem).toEqual(dark);
  });

  it("defines every token in both themes", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    expect(Object.keys(light)).toEqual(
      expect.arrayContaining([
        "--bg",
        "--surface",
        "--surface-2",
        "--border",
        "--border-strong",
        "--text",
        "--text-muted",
        "--accent",
        "--accent-contrast",
        "--rating",
        "--danger",
        "--success",
      ]),
    );
  });

  const backgrounds = ["--bg", "--surface", "--surface-2"];
  const texts = [
    "--text",
    "--text-muted",
    "--accent",
    "--rating",
    "--danger",
    "--success",
  ];

  for (const [name, t] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it(`${name}: every text token passes AA on every background`, () => {
      for (const fg of texts)
        for (const bg of backgrounds)
          expect(
            contrastRatio(t[fg], t[bg]),
            `${fg} on ${bg}`,
          ).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it(`${name}: text on the accent and on its soft tint passes AA`, () => {
      expect(
        contrastRatio(t["--accent-contrast"], t["--accent"]),
      ).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        contrastRatio(t["--text"], t["--accent-soft"]),
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it(`${name}: form control borders reach 3:1 on surfaces`, () => {
      for (const bg of backgrounds)
        expect(
          contrastRatio(t["--border-strong"], t[bg]),
          `--border-strong on ${bg}`,
        ).toBeGreaterThanOrEqual(AA_LARGE);
    });
  }
});
