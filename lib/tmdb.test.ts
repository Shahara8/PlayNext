import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TmdbError, tmdbFetch } from "./tmdb";

function response(status: number, body: unknown = {}) {
  return {
    ok: status === 200,
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    json: async () => body,
  } as Response;
}

describe("tmdbFetch", () => {
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

  it("builds the URL from the path and params and returns the JSON body", async () => {
    fetchMock().mockResolvedValueOnce(response(200, { id: 1 }));

    expect(
      await tmdbFetch("/find/tt1", { external_source: "imdb_id" }),
    ).toEqual({ id: 1 });
    expect(fetchMock().mock.calls[0][0]).toBe(
      "https://api.themoviedb.org/3/find/tt1?external_source=imdb_id",
    );
  });

  it("passes the caller's abort signal through, and none by default", async () => {
    fetchMock().mockResolvedValue(response(200));
    const signal = AbortSignal.timeout(1000);

    await tmdbFetch("/a", {}, signal);
    await tmdbFetch("/b");

    expect(fetchMock().mock.calls[0][1].signal).toBe(signal);
    expect(fetchMock().mock.calls[1][1].signal).toBeUndefined();
  });

  it("throws a TmdbError carrying the HTTP status", async () => {
    fetchMock().mockResolvedValueOnce(response(404));

    const error = await tmdbFetch("/movie/1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TmdbError);
    expect((error as TmdbError).status).toBe(404);
  });

  it("throws without a token, before any request", async () => {
    delete process.env.TMDB_API_KEY;

    await expect(tmdbFetch("/movie/1")).rejects.toThrow(/TMDB_API_KEY/);
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});
