import { describe, expect, it } from "vitest";
import { LEGACY_TITLE_IDS, legacyTitleRedirects } from "./legacy-title-ids";

describe("LEGACY_TITLE_IDS", () => {
  it("has one entry per id (each old link meant one title)", () => {
    const ids = LEGACY_TITLE_IDS.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("holds the 32 titles frozen by migration 0007", () => {
    expect(LEGACY_TITLE_IDS).toHaveLength(32);
  });
});

describe("legacyTitleRedirects", () => {
  it("308s each old path to its media-typed path", () => {
    const redirects = legacyTitleRedirects();

    expect(redirects).toHaveLength(LEGACY_TITLE_IDS.length);
    expect(redirects).toContainEqual({
      source: "/title/1396",
      destination: "/title/tv/1396",
      permanent: true,
    });
    expect(redirects).toContainEqual({
      source: "/title/687163",
      destination: "/title/movie/687163",
      permanent: true,
    });
  });
});
