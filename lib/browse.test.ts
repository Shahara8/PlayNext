import { describe, expect, it } from "vitest";
import {
  browseEmptyCopy,
  clearFiltersHref,
  hasActiveFilters,
  parseBrowseParams,
} from "./browse";

describe("parseBrowseParams", () => {
  it("defaults: trending, no filters", () => {
    expect(parseBrowseParams({})).toEqual({
      sort: "trending",
      filters: {
        type: undefined,
        availabilityType: undefined,
        genre: undefined,
      },
    });
  });

  it("reads every known value", () => {
    expect(
      parseBrowseParams({
        sort: "rating",
        type: "tv_series",
        avail: "rent",
        genre: "Drama",
      }),
    ).toEqual({
      sort: "rating",
      filters: { type: "tv_series", availabilityType: "rent", genre: "Drama" },
    });
  });

  it("ignores unknown sort, type and availability values", () => {
    expect(
      parseBrowseParams({ sort: "bogus", type: "anime", avail: "gratis" }),
    ).toEqual({
      sort: "trending",
      filters: {
        type: undefined,
        availabilityType: undefined,
        genre: undefined,
      },
    });
  });

  it("takes the first value when a key repeats", () => {
    expect(
      parseBrowseParams({ sort: ["newest", "rating"], genre: ["Comedy", "x"] }),
    ).toMatchObject({ sort: "newest", filters: { genre: "Comedy" } });
  });

  it("treats an empty genre as no genre", () => {
    expect(parseBrowseParams({ genre: "" }).filters.genre).toBeUndefined();
  });
});

describe("hasActiveFilters", () => {
  it("is false with no filters", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(
      hasActiveFilters(parseBrowseParams({ sort: "rating" }).filters),
    ).toBe(false);
  });

  it.each([
    [{ type: "movie" as const }],
    [{ availabilityType: "free" as const }],
    [{ genre: "Drama" }],
  ])("is true with %o", (filters) => {
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it("is false for invalid values the parser dropped", () => {
    expect(
      hasActiveFilters(parseBrowseParams({ type: "x", avail: "y" }).filters),
    ).toBe(false);
  });
});

describe("clearFiltersHref", () => {
  it("is the bare page for the default sort", () => {
    expect(clearFiltersHref("netflix", "trending")).toBe("/browse/netflix");
  });

  it("keeps any other sort", () => {
    expect(clearFiltersHref("partner-tv", "rating")).toBe(
      "/browse/partner-tv?sort=rating",
    );
  });
});

describe("browseEmptyCopy", () => {
  it("offers to clear the filters when nothing matched them", () => {
    expect(browseEmptyCopy("Netflix", "/browse/netflix?sort=rating")).toEqual({
      line: "Nothing matches these filters",
      hint: "Try a different type, availability or genre.",
      action: {
        label: "Clear filters",
        href: "/browse/netflix?sort=rating",
        clearsFilters: true,
      },
    });
  });

  it("names the service and goes home when it has no titles", () => {
    const copy = browseEmptyCopy("Partner TV", null);
    expect(copy.line).toBe("Nothing available on Partner TV yet");
    expect(copy.action).toEqual({
      label: "Browse other services",
      href: "/",
      clearsFilters: false,
    });
  });
});
