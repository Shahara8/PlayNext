import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCatalogTitlesByRefs,
  getTrendingTitles,
  type CatalogTitle,
} from "./catalog";
import { getRelatedTmdbIds } from "./tmdb-related";
import {
  GENRE_BOOST,
  USER_ROWS_PAGE_SIZE,
  getRecommendations,
  hasOpinion,
  isSeed,
  MAX_RECOMMENDATIONS,
  MAX_SEEDS,
  parseLimit,
  pickSeeds,
  scoreCandidates,
  withoutTitle,
  type FeedbackRow,
  type Seed,
} from "./recommendations";

vi.mock("./catalog", () => ({
  getCatalogTitlesByRefs: vi.fn(),
  getTrendingTitles: vi.fn(),
}));

vi.mock("./tmdb-related", () => ({
  getRelatedTmdbIds: vi.fn(),
}));

function feedback(overrides: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    tmdb_id: 1,
    is_favorite: false,
    sentiment: null,
    rating: null,
    updated_at: "2026-11-01T00:00:00Z",
    media_type: "tv",
    title_cache: { genres: [{ id: 18, name: "Drama" }] },
    ...overrides,
  };
}

function title(
  tmdbId: number,
  overrides: Partial<CatalogTitle> = {},
): CatalogTitle {
  return {
    tmdb_id: tmdbId,
    media_type: "tv",
    title: `Title ${tmdbId}`,
    poster_path: null,
    release_date: null,
    genres: [],
    popularity: 0,
    vote_average: null,
    ...overrides,
  };
}

function seed(tmdbId: number, overrides: Partial<Seed> = {}): Seed {
  return { tmdb_id: tmdbId, media_type: "tv", genreIds: [], ...overrides };
}

const ids = (titles: { tmdb_id: number }[]) => titles.map((t) => t.tmdb_id);

describe("isSeed", () => {
  it.each([
    ["a favorite", { is_favorite: true }],
    ["a like", { sentiment: "like" as const }],
    ["a rating of 7", { rating: 7 }],
    ["a rating of 10", { rating: 10 }],
  ])("counts %s", (_, overrides) => {
    expect(isSeed(feedback(overrides))).toBe(true);
  });

  it.each([
    ["a dislike", { sentiment: "dislike" as const }],
    ["a rating of 6", { rating: 6 }],
    ["an all-empty row", {}],
  ])("doesn't count %s", (_, overrides) => {
    expect(isSeed(feedback(overrides))).toBe(false);
  });
});

describe("hasOpinion", () => {
  it("is true for any saved favorite, sentiment, or rating", () => {
    expect(hasOpinion(feedback({ is_favorite: true }))).toBe(true);
    expect(hasOpinion(feedback({ sentiment: "dislike" }))).toBe(true);
    expect(hasOpinion(feedback({ rating: 2 }))).toBe(true);
  });

  it("is false for a row with every field cleared", () => {
    expect(hasOpinion(feedback())).toBe(false);
  });
});

describe("pickSeeds", () => {
  it("keeps seeds only, newest first, with their media type and genre ids", () => {
    const seeds = pickSeeds([
      feedback({ tmdb_id: 1, is_favorite: true, updated_at: "2026-10-01" }),
      feedback({ tmdb_id: 2, sentiment: "dislike", updated_at: "2026-10-03" }),
      feedback({
        tmdb_id: 3,
        rating: 8,
        updated_at: "2026-10-02",
        media_type: "movie",
        title_cache: { genres: null },
      }),
    ]);

    expect(seeds).toEqual([
      { media_type: "movie", tmdb_id: 3, genreIds: [] },
      { media_type: "tv", tmdb_id: 1, genreIds: [18] },
    ]);
  });

  it("caps the seed set at the most recent MAX_SEEDS", () => {
    const rows = Array.from({ length: MAX_SEEDS + 5 }, (_, i) =>
      feedback({
        tmdb_id: i,
        is_favorite: true,
        updated_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      }),
    );

    const seeds = pickSeeds(rows);

    expect(seeds).toHaveLength(MAX_SEEDS);
    expect(seeds[0].tmdb_id).toBe(MAX_SEEDS + 4);
  });

  it("orders by time, not by string, when fractional seconds differ in length", () => {
    const seeds = pickSeeds([
      feedback({
        tmdb_id: 1,
        is_favorite: true,
        updated_at: "2026-11-02T10:00:00+00:00",
      }),
      feedback({
        tmdb_id: 2,
        is_favorite: true,
        updated_at: "2026-11-02T10:00:00.5+00:00",
      }),
    ]);

    expect(seeds.map((s) => s.tmdb_id)).toEqual([2, 1]);
  });

  it("skips a row whose title is gone from title_cache", () => {
    expect(
      pickSeeds([feedback({ is_favorite: true, title_cache: null })]),
    ).toEqual([]);
  });
});

describe("scoreCandidates", () => {
  it("ranks by how many seeds relate to each title", () => {
    const ranked = scoreCandidates(
      [seed(1), seed(2)],
      [
        [10, 20],
        [20, 30],
      ],
      [title(10), title(20), title(30)],
      new Set(),
    );

    expect(ids(ranked)[0]).toBe(20);
  });

  it("boosts genre overlap with the seeds, below one extra seed", () => {
    const drama = { id: 18, name: "Drama" };
    const comedy = { id: 35, name: "Comedy" };
    const seeds = [seed(1, { genreIds: [18] }), seed(2)];

    const ranked = scoreCandidates(
      seeds,
      [
        [10, 20, 30],
        [30, 40],
      ],
      [
        title(10, { genres: [comedy] }),
        title(20, { genres: [drama, comedy] }),
        title(30, { genres: [comedy] }),
        title(40, { genres: [drama] }),
      ],
      new Set(),
    );

    // 30: two seeds, no overlap. 40: one seed + full overlap (1 + GENRE_BOOST).
    // 20: half overlap. 10: none.
    expect(GENRE_BOOST).toBeLessThan(1);
    expect(ids(ranked)).toEqual([30, 40, 20, 10]);
  });

  it("matches on media type, since TMDB ids repeat across movies and TV", () => {
    const ranked = scoreCandidates(
      [seed(1, { media_type: "movie" })],
      [[10]],
      [title(10, { media_type: "tv" })],
      new Set(),
    );

    expect(ranked).toEqual([]);
  });

  it("drops excluded titles and titles no seed relates to", () => {
    const ranked = scoreCandidates(
      [seed(1)],
      [[10, 20]],
      [title(10), title(20), title(30)],
      new Set(["tv:20"]),
    );

    expect(ids(ranked)).toEqual([10]);
  });

  it("excluding a movie doesn't exclude the show with the same TMDB id", () => {
    const ranked = scoreCandidates(
      [seed(1)],
      [[20]],
      [title(20)],
      new Set(["movie:20"]),
    );

    expect(ids(ranked)).toEqual([20]);
  });

  it("tolerates a seed whose lookup failed", () => {
    const ranked = scoreCandidates(
      [seed(1), seed(2)],
      [null, [10]],
      [title(10)],
      new Set(),
    );

    expect(ids(ranked)).toEqual([10]);
  });

  it("breaks ties by popularity", () => {
    const ranked = scoreCandidates(
      [seed(1)],
      [[10, 20]],
      [title(10, { popularity: 5 }), title(20, { popularity: 50 })],
      new Set(),
    );

    expect(ids(ranked)).toEqual([20, 10]);
  });
});

describe("parseLimit", () => {
  it("accepts a whole number in range", () => {
    expect(parseLimit("5")).toBe(5);
  });

  it("clamps to 1..MAX_RECOMMENDATIONS", () => {
    expect(parseLimit("0")).toBe(1);
    expect(parseLimit("500")).toBe(MAX_RECOMMENDATIONS);
  });

  it.each([null, "", "abc", "2.5", " ", "0x5", "-3"])(
    "falls back to the max for %j",
    (value) => {
      expect(parseLimit(value)).toBe(MAX_RECOMMENDATIONS);
    },
  );
});

describe("getRecommendations", () => {
  function makeClient(feedbackRows: FeedbackRow[], watchlistIds: number[]) {
    const results: Record<string, unknown[]> = {
      user_title_feedback: feedbackRows,
      user_watchlist: watchlistIds.map((tmdb_id) => ({
        media_type: "tv",
        tmdb_id,
      })),
    };
    const builders: Record<
      string,
      { select: unknown; eq: unknown; range: ReturnType<typeof vi.fn> }
    > = {};
    const from = vi.fn((table: string) => {
      // Serves `results[table]` sliced by the requested range, like PostgREST.
      let range: [number, number] = [0, Infinity];
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        range: vi.fn((from: number, to: number) => {
          range = [from, to];
          return builder;
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: results[table].slice(range[0], range[1] + 1),
            error: null,
          }).then(resolve),
      };
      builders[table] = builder;
      return builder;
    });
    return {
      viewer: { supabase: { from } as never, userId: "u1" },
      from,
      builders,
    };
  }

  beforeEach(() => {
    vi.mocked(getTrendingTitles).mockReset();
    vi.mocked(getCatalogTitlesByRefs).mockReset();
    vi.mocked(getRelatedTmdbIds).mockReset();
  });

  it("returns trending titles to a signed-out viewer", async () => {
    vi.mocked(getTrendingTitles).mockResolvedValue([title(1)]);
    const result = await getRecommendations(null, 5);

    expect(getTrendingTitles).toHaveBeenCalledWith(5);
    expect(result).toEqual({
      hasSeeds: false,
      seedLookupsFailed: false,
      titles: [{ ...title(1), source: "trending" }],
    });
  });

  it("falls back to trending without seeds, minus disliked and watchlisted titles", async () => {
    vi.mocked(getTrendingTitles).mockResolvedValue([title(9)]);
    const { viewer, builders } = makeClient(
      [
        feedback({ tmdb_id: 1, sentiment: "dislike" }),
        feedback({ tmdb_id: 2 }), // all-empty: not excluded
      ],
      [3],
    );

    const result = await getRecommendations(viewer, 5);

    expect(builders.user_title_feedback.eq).toHaveBeenCalledWith(
      "user_id",
      "u1",
    );
    expect(builders.user_watchlist.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(getRelatedTmdbIds).not.toHaveBeenCalled();
    expect(getTrendingTitles).toHaveBeenCalledWith(
      5,
      new Set(["tv:1", "tv:3"]),
    );
    expect(result.hasSeeds).toBe(false);
    expect(result.titles.map((t) => t.source)).toEqual(["trending"]);
  });

  it("puts seed-based picks first and tops up with trending", async () => {
    vi.mocked(getRelatedTmdbIds).mockResolvedValue([10, 11, 3]);
    vi.mocked(getCatalogTitlesByRefs).mockResolvedValue([title(10)]);
    // Trending may include a pick; it's not repeated.
    vi.mocked(getTrendingTitles).mockResolvedValue([title(10), title(20)]);
    const { viewer } = makeClient(
      [feedback({ tmdb_id: 1, is_favorite: true })],
      [3],
    );

    const result = await getRecommendations(viewer, 2);

    expect(getRelatedTmdbIds).toHaveBeenCalledWith("tv", 1);
    // Excluded ids aren't looked up in the catalog.
    expect(getCatalogTitlesByRefs).toHaveBeenCalledWith([
      { media_type: "tv", tmdb_id: 10 },
      { media_type: "tv", tmdb_id: 11 },
    ]);
    expect(getTrendingTitles).toHaveBeenCalledWith(
      2,
      new Set(["tv:1", "tv:3"]),
    );
    expect(result).toEqual({
      hasSeeds: true,
      seedLookupsFailed: false,
      titles: [
        { ...title(10), source: "seeds" },
        { ...title(20), source: "trending" },
      ],
    });
  });

  it("adds no trending titles when picks fill the limit", async () => {
    vi.mocked(getRelatedTmdbIds).mockResolvedValue([10, 11, 12]);
    vi.mocked(getCatalogTitlesByRefs).mockResolvedValue([
      title(10),
      title(11),
      title(12),
    ]);
    vi.mocked(getTrendingTitles).mockResolvedValue([title(20), title(21)]);
    const { viewer } = makeClient([feedback({ sentiment: "like" })], []);

    const result = await getRecommendations(viewer, 2);

    expect(result.titles.map((t) => t.source)).toEqual(["seeds", "seeds"]);
  });

  it("keeps going when one seed's TMDB lookup fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(getRelatedTmdbIds)
      .mockRejectedValueOnce(new Error("TMDB down"))
      .mockResolvedValueOnce([10]);
    vi.mocked(getCatalogTitlesByRefs).mockResolvedValue([title(10)]);
    vi.mocked(getTrendingTitles).mockResolvedValue([]);
    const { viewer } = makeClient(
      [
        feedback({ tmdb_id: 1, rating: 9, updated_at: "2026-10-02" }),
        feedback({ tmdb_id: 2, rating: 8, updated_at: "2026-10-01" }),
      ],
      [],
    );

    const result = await getRecommendations(viewer, 5);

    expect(ids(result.titles)).toEqual([10]);
    expect(result.seedLookupsFailed).toBe(true);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("flags when seed TMDB lookups failed", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(getRelatedTmdbIds).mockRejectedValue(new Error("TMDB down"));
    vi.mocked(getTrendingTitles).mockResolvedValue([title(20)]);
    const { viewer } = makeClient([feedback({ is_favorite: true })], []);

    const result = await getRecommendations(viewer, 5);

    expect(result.seedLookupsFailed).toBe(true);
    expect(result.titles.map((t) => t.source)).toEqual(["trending"]);
    consoleError.mockRestore();
  });

  it("logs failed seed lookups once per call, not once per seed", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const reason = new Error("rate limited");
    vi.mocked(getRelatedTmdbIds).mockRejectedValue(reason);
    vi.mocked(getTrendingTitles).mockResolvedValue([]);
    const { viewer } = makeClient(
      [1, 2, 3].map((tmdb_id) => feedback({ tmdb_id, sentiment: "like" })),
      [],
    );

    await getRecommendations(viewer, 5);

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][0]).toMatch(/3 of 3 seed lookups/);
    expect(consoleError.mock.calls[0][1]).toBe(reason);
    consoleError.mockRestore();
  });

  it("reads every page of a long history", async () => {
    vi.mocked(getTrendingTitles).mockResolvedValue([]);
    // Past the first page: a dislike that must still be excluded.
    const rows = Array.from({ length: USER_ROWS_PAGE_SIZE + 1 }, (_, i) =>
      feedback({ tmdb_id: i + 1, sentiment: "dislike" }),
    );
    const { viewer, from } = makeClient(rows, []);

    await getRecommendations(viewer, 5);

    // One query per page.
    expect(
      from.mock.calls.filter(([table]) => table === "user_title_feedback"),
    ).toHaveLength(2);
    const excluded = vi.mocked(getTrendingTitles).mock.calls[0][1]!;
    expect(excluded.has(`tv:${USER_ROWS_PAGE_SIZE + 1}`)).toBe(true);
  });

  it("skips the catalog lookup when TMDB suggests nothing new", async () => {
    vi.mocked(getRelatedTmdbIds).mockResolvedValue([]);
    vi.mocked(getTrendingTitles).mockResolvedValue([title(20)]);
    const { viewer } = makeClient([feedback({ is_favorite: true })], []);

    const result = await getRecommendations(viewer, 5);

    expect(getCatalogTitlesByRefs).not.toHaveBeenCalled();
    expect(result.hasSeeds).toBe(true);
    expect(result.titles.map((t) => t.source)).toEqual(["trending"]);
  });

  it("reports seeds even when none could be used", async () => {
    vi.mocked(getTrendingTitles).mockResolvedValue([]);
    const { viewer } = makeClient(
      [feedback({ is_favorite: true, title_cache: null })],
      [],
    );

    const result = await getRecommendations(viewer, 5);

    expect(getRelatedTmdbIds).not.toHaveBeenCalled();
    expect(result.hasSeeds).toBe(true);
  });

  it("throws when the viewer's feedback can't be read", async () => {
    const from = vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        range: vi.fn(() => builder),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: "denied" } }).then(
            resolve,
          ),
      };
      return builder;
    });

    await expect(
      getRecommendations({ supabase: { from } as never, userId: "u1" }, 5),
    ).rejects.toThrow(/denied/);
  });
});

describe("withoutTitle", () => {
  const recs = (ids: number[]) => ({
    hasSeeds: true,
    seedLookupsFailed: false,
    titles: ids.map((id) => ({ ...title(id), source: "trending" as const })),
  });

  it("drops the title and keeps the rest, up to the limit", () => {
    const result = withoutTitle(recs([1, 2, 3, 4]), "tv:2", 3);
    expect(result.titles.map((t) => t.tmdb_id)).toEqual([1, 3, 4]);
    expect(result.hasSeeds).toBe(true);
  });

  it("cuts to the limit when the title isn't there", () => {
    const result = withoutTitle(recs([1, 2, 3, 4]), "tv:9", 3);
    expect(result.titles.map((t) => t.tmdb_id)).toEqual([1, 2, 3]);
  });

  it("matches on the whole key, so a movie with the same id stays", () => {
    const result = withoutTitle(recs([1, 2]), "movie:1", 2);
    expect(result.titles.map((t) => t.tmdb_id)).toEqual([1, 2]);
  });

  it("only cuts when there is no title to drop", () => {
    const result = withoutTitle(recs([1, 2, 3]), null, 2);
    expect(result.titles.map((t) => t.tmdb_id)).toEqual([1, 2]);
  });
});
