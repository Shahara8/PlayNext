import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveImdbToTmdb } from "./tmdb-resolve";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as Response;
}

describe("resolveImdbToTmdb", () => {
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

  it("sends the TMDB token as a bearer header, never as an api_key query param", async () => {
    fetchMock()
      .mockResolvedValueOnce(
        jsonResponse({ movie_results: [{ id: 278 }], tv_results: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 278,
          imdb_id: "tt0111161",
          title: "The Shawshank Redemption",
          original_title: "The Shawshank Redemption",
          overview: "Two imprisoned men bond over a number of years.",
          poster_path: "/poster.jpg",
          backdrop_path: "/backdrop.jpg",
          release_date: "1994-09-23",
          genres: [{ id: 18, name: "Drama" }],
          vote_average: 8.7,
          popularity: 50.2,
        }),
      );

    await resolveImdbToTmdb("tt0111161");

    const [findUrl, findOptions] = fetchMock().mock.calls[0];
    expect(findUrl).not.toContain("api_key");
    expect(findOptions.headers.Authorization).toBe("Bearer test-token");
  });

  it("resolves a movie match and maps all fields", async () => {
    fetchMock()
      .mockResolvedValueOnce(
        jsonResponse({ movie_results: [{ id: 278 }], tv_results: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 278,
          imdb_id: "tt0111161",
          title: "The Shawshank Redemption",
          original_title: "The Shawshank Redemption",
          overview: "Two imprisoned men bond over a number of years.",
          poster_path: "/poster.jpg",
          backdrop_path: "/backdrop.jpg",
          release_date: "1994-09-23",
          genres: [{ id: 18, name: "Drama" }],
          vote_average: 8.7,
          popularity: 50.2,
        }),
      );

    const result = await resolveImdbToTmdb("tt0111161");

    expect(result).toEqual({
      tmdb_id: 278,
      media_type: "movie",
      imdb_id: "tt0111161",
      title: "The Shawshank Redemption",
      original_title: "The Shawshank Redemption",
      overview: "Two imprisoned men bond over a number of years.",
      poster_path: "/poster.jpg",
      backdrop_path: "/backdrop.jpg",
      release_date: "1994-09-23",
      genres: [{ id: 18, name: "Drama" }],
      vote_average: 8.7,
      popularity: 50.2,
    });
  });

  it("resolves a tv match when expectedType is tv_series, hitting /tv not /movie", async () => {
    fetchMock()
      .mockResolvedValueOnce(
        jsonResponse({
          movie_results: [],
          tv_results: [{ id: 1396 }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 1396,
          name: "Breaking Bad",
          original_name: "Breaking Bad",
          overview: "A chemistry teacher turns to crime.",
          poster_path: "/bb-poster.jpg",
          backdrop_path: "/bb-backdrop.jpg",
          first_air_date: "2008-01-20",
          genres: [{ id: 18, name: "Drama" }],
          vote_average: 8.9,
          popularity: 300,
          external_ids: { imdb_id: "tt0903747" },
        }),
      );

    const result = await resolveImdbToTmdb("tt0903747", "tv_series");

    expect(result?.media_type).toBe("tv");
    expect(result?.title).toBe("Breaking Bad");
    expect(result?.release_date).toBe("2008-01-20");
    expect(result?.imdb_id).toBe("tt0903747");

    const [detailUrl] = fetchMock().mock.calls[1];
    expect(detailUrl).toContain("/tv/1396");
  });

  it("falls back to a movie match when expectedType is tv_series but only a movie hit exists", async () => {
    fetchMock()
      .mockResolvedValueOnce(
        jsonResponse({ movie_results: [{ id: 42 }], tv_results: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 42,
          imdb_id: "tt0000042",
          title: "Fallback Movie",
          original_title: "Fallback Movie",
          overview: "",
          poster_path: null,
          backdrop_path: null,
          release_date: "2001-01-01",
          genres: [],
          vote_average: 0,
          popularity: 0,
        }),
      );

    const result = await resolveImdbToTmdb("tt0000042", "tv_series");
    expect(result?.media_type).toBe("movie");
  });

  it("returns null when TMDB has no match at all", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({ movie_results: [], tv_results: [] }),
    );

    expect(await resolveImdbToTmdb("tt9999999")).toBeNull();
  });

  it("throws when TMDB_API_KEY is not set", async () => {
    delete process.env.TMDB_API_KEY;
    await expect(resolveImdbToTmdb("tt0111161")).rejects.toThrow(
      /TMDB_API_KEY/,
    );
  });

  it("throws with the status code when the TMDB request fails", async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({}, false, 500));
    await expect(resolveImdbToTmdb("tt0111161")).rejects.toThrow(/500/);
  });
});
