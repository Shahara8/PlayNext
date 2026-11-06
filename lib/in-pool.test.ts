import { describe, expect, it } from "vitest";
import { inPool } from "./in-pool";

describe("inPool", () => {
  it("runs every item once, never more than `limit` at a time", async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];

    await inPool([1, 2, 3, 4, 5, 6, 7], 3, async (item, index) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      seen[index] = item;
      running--;
    });

    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });

  it("does nothing for no items, and treats a limit that isn't a positive number as 1", async () => {
    const calls: number[] = [];
    await inPool([], 4, async () => {
      calls.push(0);
    });
    await inPool([1, 2], 0, async (item) => {
      calls.push(item);
    });
    await inPool([3, 4], Number.NaN, async (item) => {
      calls.push(item);
    });
    expect(calls).toEqual([1, 2, 3, 4]);
  });

  it("starts no new item once a task has failed", async () => {
    const started: number[] = [];
    await expect(
      inPool([1, 2, 3, 4, 5], 1, async (item) => {
        started.push(item);
        if (item === 2) throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([1, 2]);
  });

  it("rejects when a task throws", async () => {
    await expect(
      inPool([1], 2, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
