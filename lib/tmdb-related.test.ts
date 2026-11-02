import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_BACKOFF_MS, resetTmdbCooldown } from "./tmdb";
import { getRelatedTmdbIds, SPARSE_RECOMMENDATIONS } from "./tmdb-related";

// cacheLife only works inside Next's runtime; caching itself isn't under test.
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

function listResponse(
  ids: number[],
  status = 200,
  headers: Record<string, string> = {},
) {
  return {
    ok: status === 200,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers(headers),
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
    resetTmdbCooldown();
  });

  afterEach(() => {
    delete process.env.TMDB_API_KEY;
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
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
    fetchMock().mockResolvedValueOnce(listResponse([], 401));

    await expect(getRelatedTmdbIds("movie", 550)).rejects.toThrow(/401/);
  });

  it("fails at once on a rate limit too long to wait out on a page", async () => {
    fetchMock().mockResolvedValueOnce(
      listResponse([], 429, { "Retry-After": "10" }),
    );

    await expect(getRelatedTmdbIds("movie", 550)).rejects.toThrow(/429/);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("retries a brief TMDB hiccup within the page's budget", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    fetchMock()
      .mockResolvedValueOnce(listResponse([], 503, { "Retry-After": "0" }))
      .mockResolvedValueOnce(listResponse(range(1, SPARSE_RECOMMENDATIONS)));

    const result = getRelatedTmdbIds("tv", 1);
    await vi.advanceTimersByTimeAsync(BASE_BACKOFF_MS);

    expect(await result).toHaveLength(SPARSE_RECOMMENDATIONS);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
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
