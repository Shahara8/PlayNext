import { describe, expect, it } from "vitest";
import { mediaTypeLabel, releaseYear } from "./format";

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
