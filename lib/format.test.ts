import { describe, expect, it } from "vitest";
import {
  mediaTypeLabel,
  ratingLabel,
  releaseYear,
  titleWithYear,
} from "./format";

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

describe("ratingLabel", () => {
  it("shows one decimal place", () => {
    expect(ratingLabel(7.8)).toBe("7.8");
    expect(ratingLabel(8)).toBe("8.0");
    expect(ratingLabel(10)).toBe("10.0");
  });

  it("rounds to one decimal place", () => {
    expect(ratingLabel(7.86)).toBe("7.9");
  });

  it("is null for an unknown rating", () => {
    expect(ratingLabel(null)).toBeNull();
  });

  it("is null for 0, TMDB's value for a title with no votes", () => {
    expect(ratingLabel(0)).toBeNull();
    // Would read "0.0" too.
    expect(ratingLabel(0.04)).toBeNull();
    expect(ratingLabel(0.05)).toBe("0.1");
  });

  it("is null for a value that isn't a real score", () => {
    expect(ratingLabel(Number.NaN)).toBeNull();
    expect(ratingLabel(Number.POSITIVE_INFINITY)).toBeNull();
    expect(ratingLabel(-1)).toBeNull();
  });
});
