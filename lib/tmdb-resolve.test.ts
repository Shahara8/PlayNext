import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTitleDetails, resolveImdbToTmdb } from "./tmdb-resolve";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers: new Headers(),
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
    // 401: not retried (tmdbFetch's retries are covered in lib/tmdb.test.ts).
    fetchMock().mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(resolveImdbToTmdb("tt0111161")).rejects.toThrow(/401/);
  });
});

describe("fetchTitleDetails", () => {
  beforeEach(() => {
    process.env.TMDB_API_KEY = "test-token";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    delete process.env.TMDB_API_KEY;
    vi.unstubAllGlobals();
  });

  const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;

  it("fetches a movie by key alone, with no /find call", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({
        id: 603,
        imdb_id: "tt0133093",
        title: "The Matrix",
        original_title: "The Matrix",
        overview: "",
        poster_path: "/p.jpg",
        backdrop_path: null,
        release_date: "1999-03-31",
        genres: [],
        vote_average: 8.2,
        popularity: 80,
      }),
    );

    const result = await fetchTitleDetails(
      { media_type: "movie", tmdb_id: 603 },
      "tt0133093",
    );

    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(fetchMock().mock.calls[0][0]).toContain("/movie/603?");
    expect(result).toMatchObject({
      media_type: "movie",
      tmdb_id: 603,
      vote_average: 8.2,
      overview: null,
    });
  });

  it("keeps the given imdb_id when TMDB's details have none", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({
        id: 1396,
        name: "Breaking Bad",
        original_name: "Breaking Bad",
        overview: "x",
        poster_path: null,
        backdrop_path: null,
        first_air_date: "2008-01-20",
        genres: [],
        vote_average: 8.9,
        popularity: 300,
        external_ids: { imdb_id: null },
      }),
    );

    const result = await fetchTitleDetails(
      { media_type: "tv", tmdb_id: 1396 },
      "tt0903747",
    );

    expect(fetchMock().mock.calls[0][0]).toContain("/tv/1396?");
    expect(result.imdb_id).toBe("tt0903747");
  });

  it("treats an empty imdb_id from TMDB as missing", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({
        id: 603,
        imdb_id: "",
        title: "The Matrix",
        original_title: "The Matrix",
        overview: "",
        poster_path: null,
        backdrop_path: null,
        release_date: "",
        genres: [],
        vote_average: 0,
        popularity: 0,
      }),
    );

    const result = await fetchTitleDetails(
      { media_type: "movie", tmdb_id: 603 },
      "tt0133093",
    );

    expect(result.imdb_id).toBe("tt0133093");
  });
});
