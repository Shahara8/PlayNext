import { describe, expect, it } from "vitest";
import { mediaTypeLabel, releaseYear, titleWithYear } from "./format";

describe("releaseYear", () => {
  it("extracts the four-digit year from a date string", () => {
    expect(releaseYear("2008-01-20")).toBe("2008");
  });

  it("returns null for null", () => {
    expect(releaseYear(null)).toBeNull();
  });
});

describe("mediaTypeLabel", () => {
  it("labels tv as TV Series", () => {
    expect(mediaTypeLabel("tv")).toBe("TV Series");
  });

  it("labels movie as Movie", () => {
    expect(mediaTypeLabel("movie")).toBe("Movie");
  });
});

describe("titleWithYear", () => {
  it("appends the release year", () => {
    expect(titleWithYear({ title: "Up", release_date: "2009-05-29" })).toBe(
      "Up (2009)",
    );
  });

  it("is just the title when the year is unknown", () => {
    expect(titleWithYear({ title: "Up", release_date: null })).toBe("Up");
  });
});
