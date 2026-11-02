import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRelatedTmdbIds, SPARSE_RECOMMENDATIONS } from "./tmdb-related";

// cacheLife only works inside Next's runtime; caching itself isn't under test.
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

function listResponse(ids: number[], status = 200) {
  return {
    ok: status === 200,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => ({ results: ids.map((id) => ({ id })) }),
  } as Response;
}

function range(from: number, count: number) {
  return Array.from({ length: count }, (_, i) => from + i);
}

describe("getRelatedTmdbIds", () => {
  beforeEach(() => {
    process.env.TMDB_API_KEY = "test-token";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    delete process.env.TMDB_API_KEY;
    vi.unstubAllGlobals();
  });

  function fetchMock() {
    return fetch as unknown as ReturnType<typeof vi.fn>;
  }

  it("returns /recommendations alone when it isn't sparse", async () => {
    const ids = range(100, SPARSE_RECOMMENDATIONS);
    fetchMock().mockResolvedValueOnce(listResponse(ids));

    expect(await getRelatedTmdbIds("tv", 1396)).toEqual(ids);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(fetchMock().mock.calls[0][0]).toContain("/tv/1396/recommendations");
  });

  it("tops up a sparse list with /similar, without duplicates", async () => {
    fetchMock()
      .mockResolvedValueOnce(listResponse([1, 2]))
      .mockResolvedValueOnce(listResponse([2, 3]));

    expect(await getRelatedTmdbIds("movie", 550)).toEqual([1, 2, 3]);
    expect(fetchMock().mock.calls[1][0]).toContain("/movie/550/similar");
  });

  it("throws when TMDB fails", async () => {
    fetchMock().mockResolvedValueOnce(listResponse([], 429));

    await expect(getRelatedTmdbIds("movie", 550)).rejects.toThrow(/429/);
  });

  it("returns no ids for a title TMDB no longer has", async () => {
    fetchMock().mockResolvedValueOnce(listResponse([], 404));

    expect(await getRelatedTmdbIds("movie", 550)).toEqual([]);
  });

  it("shares one timeout signal across both requests", async () => {
    fetchMock()
      .mockResolvedValueOnce(listResponse([1]))
      .mockResolvedValueOnce(listResponse([2]));

    await getRelatedTmdbIds("tv", 1);

    const [first, second] = fetchMock().mock.calls.map(([, init]) => init);
    expect(first.signal).toBeInstanceOf(AbortSignal);
    expect(second.signal).toBe(first.signal);
  });
});
