import { describe, expect, it } from "vitest";
import { chunkIds, ID_CHUNK_SIZE } from "./id-chunks";

describe("chunkIds", () => {
  it("splits ids into chunks of at most ID_CHUNK_SIZE, in order", () => {
    const ids = Array.from({ length: ID_CHUNK_SIZE * 2 + 1 }, (_, i) => i);

    const chunks = chunkIds(ids);

    expect(chunks.map((c) => c.length)).toEqual([
      ID_CHUNK_SIZE,
      ID_CHUNK_SIZE,
      1,
    ]);
    expect(chunks.flat()).toEqual(ids);
  });

  it("chunks string ids too (imdb ids)", () => {
    const ids = Array.from({ length: ID_CHUNK_SIZE + 1 }, (_, i) => `tt${i}`);
    expect(chunkIds(ids).map((c) => c.length)).toEqual([ID_CHUNK_SIZE, 1]);
  });

  it("returns no chunks for no ids", () => {
    expect(chunkIds([])).toEqual([]);
  });

  it("takes another chunk size", () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("refuses a size that would never advance", () => {
    expect(() => chunkIds([1], 0)).toThrow(/at least 1/);
    expect(() => chunkIds([1], NaN)).toThrow(/at least 1/);
    expect(() => chunkIds([1, 2, 3], 1.5)).toThrow(/integer/);
  });
});
