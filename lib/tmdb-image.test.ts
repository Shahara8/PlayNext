import { describe, expect, it } from "vitest";
import { backdropUrl, posterUrl } from "./tmdb-image";

describe("posterUrl", () => {
  it("builds a full TMDB image URL from a path", () => {
    expect(posterUrl("/abc123.jpg")).toBe(
      "https://image.tmdb.org/t/p/w342/abc123.jpg",
    );
  });

  it("honors an explicit size", () => {
    expect(posterUrl("/abc123.jpg", "w500")).toBe(
      "https://image.tmdb.org/t/p/w500/abc123.jpg",
    );
  });

  it("returns null when there is no path", () => {
    expect(posterUrl(null)).toBeNull();
  });
});

describe("backdropUrl", () => {
  it("builds a full TMDB image URL from a path", () => {
    expect(backdropUrl("/xyz789.jpg")).toBe(
      "https://image.tmdb.org/t/p/w1280/xyz789.jpg",
    );
  });

  it("returns null when there is no path", () => {
    expect(backdropUrl(null)).toBeNull();
  });
});
