import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_SETTING,
  parseThemeSetting,
  THEME_SETTINGS,
  THEME_STORAGE_KEY,
  themeAttribute,
  themeInitScript,
} from "./theme";

describe("parseThemeSetting", () => {
  it("accepts each setting", () => {
    for (const s of THEME_SETTINGS) expect(parseThemeSetting(s)).toBe(s);
  });

  it("falls back to System for missing or unknown values", () => {
    expect(DEFAULT_THEME_SETTING).toBe("system");
    for (const raw of [null, undefined, "", "Dark", "blue", 1, {}])
      expect(parseThemeSetting(raw)).toBe("system");
  });
});

describe("themeAttribute", () => {
  it("is null for System and the theme otherwise", () => {
    expect(themeAttribute("system")).toBeNull();
    expect(themeAttribute("light")).toBe("light");
    expect(themeAttribute("dark")).toBe("dark");
  });
});

describe("themeInitScript", () => {
  /** Runs the script against a fake localStorage and <html>. */
  function run(stored: string | null | Error) {
    const attrs: Record<string, string> = {};
    const localStorage = {
      getItem(key: string) {
        if (stored instanceof Error) throw stored;
        return key === THEME_STORAGE_KEY ? stored : null;
      },
    };
    const document = {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attrs[name] = value;
        },
      },
    };
    new Function("localStorage", "document", themeInitScript())(
      localStorage,
      document,
    );
    return attrs;
  }

  it("sets data-theme for an explicit choice", () => {
    expect(run("dark")).toEqual({ "data-theme": "dark" });
    expect(run("light")).toEqual({ "data-theme": "light" });
  });

  it("sets nothing for System, nothing stored or a bad value", () => {
    expect(run("system")).toEqual({});
    expect(run(null)).toEqual({});
    expect(run('"><script>')).toEqual({});
  });

  it("survives storage throwing (blocked site data)", () => {
    expect(run(new Error("SecurityError"))).toEqual({});
  });

  it("matches what themeAttribute says for every setting", () => {
    for (const s of THEME_SETTINGS) {
      const attr = themeAttribute(s);
      expect(run(s)).toEqual(attr ? { "data-theme": attr } : {});
    }
  });
});
