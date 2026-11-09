import { describe, expect, it } from "vitest";
import {
  browseCountLabel,
  mediaTypeLabel,
  ratingLabel,
  releaseYear,
  titleCountLabel,
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

describe("titleCountLabel", () => {
  it.each([
    [0, "No titles yet"],
    [1, "1 title"],
    [2, "2 titles"],
    [1234, "1,234 titles"],
  ])("%d → %s", (count, label) => {
    expect(titleCountLabel(count)).toBe(label);
  });
});

describe("browseCountLabel", () => {
  it("is titleCountLabel of the whole catalog without filters", () => {
    expect(browseCountLabel(8, 8, false)).toBe("8 titles");
    // The rows read stop at PostgREST's cap; the count doesn't.
    expect(browseCountLabel(1000, 3456, false)).toBe("3,456 titles");
    expect(browseCountLabel(1, 1, false)).toBe("1 title");
    expect(browseCountLabel(0, 0, false)).toBe("No titles yet");
  });

  it.each([
    [3, 8, "3 of 8 titles"],
    [0, 8, "0 of 8 titles"],
    [1, 8, "1 of 8 titles"],
    [1, 1, "1 of 1 title"],
    [0, 0, "0 of 0 titles"],
    [1200, 3456, "1,200 of 3,456 titles"],
  ])("filtered: %d of %d → %s", (shown, total, label) => {
    expect(browseCountLabel(shown, total, true)).toBe(label);
  });

  it("never shows a total below the titles shown (separate reads)", () => {
    expect(browseCountLabel(5, 4, true)).toBe("5 of 5 titles");
  });
});
