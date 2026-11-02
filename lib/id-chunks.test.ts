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

  it("returns no chunks for no ids", () => {
    expect(chunkIds([])).toEqual([]);
  });
});
