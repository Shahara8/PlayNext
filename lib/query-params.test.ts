import { describe, expect, it } from "vitest";
import { firstSearchParam, withUpdatedParam } from "./query-params";

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
