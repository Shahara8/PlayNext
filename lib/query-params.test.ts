import { describe, expect, it } from "vitest";
import {
  firstSearchParam,
  MAX_TMDB_ID,
  parseTmdbId,
  withUpdatedParam,
} from "./query-params";

describe("parseTmdbId", () => {
  it("parses a plain positive id", () => {
    expect(parseTmdbId("456")).toBe(456);
    expect(parseTmdbId(String(MAX_TMDB_ID))).toBe(MAX_TMDB_ID);
  });

  it("rejects non-canonical forms, so a title has one URL", () => {
    for (const raw of ["0x1c8", "4.56e2", "456.0", "+456", "0456", " 456", ""])
      expect(parseTmdbId(raw)).toBeNull();
  });

  it("rejects zero, negatives, and ids past Postgres integer", () => {
    expect(parseTmdbId("0")).toBeNull();
    expect(parseTmdbId("-1")).toBeNull();
    expect(parseTmdbId(String(MAX_TMDB_ID + 1))).toBeNull();
  });
});

describe("firstSearchParam", () => {
  it("returns the value unchanged for a single string", () => {
    expect(firstSearchParam("netflix")).toBe("netflix");
  });

  it("returns the first element for an array", () => {
    expect(firstSearchParam(["a", "b"])).toBe("a");
  });

  it("returns an empty string for undefined", () => {
    expect(firstSearchParam(undefined)).toBe("");
  });
});

describe("withUpdatedParam", () => {
  it("adds a new param to an empty query string", () => {
    expect(withUpdatedParam("", "/search", "q", "avatar")).toBe(
      "/search?q=avatar",
    );
  });

  it("sets a param while preserving existing ones", () => {
    expect(
      withUpdatedParam("sort=newest", "/browse/netflix", "type", "movie"),
    ).toBe("/browse/netflix?sort=newest&type=movie");
  });

  it("overwrites an existing param's value", () => {
    expect(withUpdatedParam("q=old", "/search", "q", "new")).toBe(
      "/search?q=new",
    );
  });

  it("deletes the param and returns the bare pathname when value is empty and nothing else remains", () => {
    expect(withUpdatedParam("q=old", "/search", "q", "")).toBe("/search");
  });

  it("deletes the param but keeps the rest of the query string", () => {
    expect(withUpdatedParam("sort=newest&q=old", "/search", "q", "")).toBe(
      "/search?sort=newest",
    );
  });
});
