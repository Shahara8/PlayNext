import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_TITLE_STATE,
  getFavoriteTitles,
  getTitleStates,
  getWatchlistTitles,
  nextSentiment,
  parseRating,
  setFavorite,
  setInWatchlist,
  setRating,
  setSentiment,
  STATE_QUERY_CHUNK_SIZE,
  titleStateKey,
} from "./user-titles";

type Result = { data?: unknown; error: { message: string } | null };

// Same chainable + thenable stand-in as lib/catalog.test.ts, with the extra
// methods these queries use.
function makeBuilder(result: Result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    then: (
      resolve: (value: Result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function makeClient(results: Record<string, Result>) {
  const builders = Object.fromEntries(
    Object.entries(results).map(([table, result]) => [
      table,
      makeBuilder(result),
    ]),
  );
  const client = { from: vi.fn((table: string) => builders[table]) };
  return { client: client as never, builders };
}

const FEEDBACK_CONFLICT = { onConflict: "user_id,tmdb_id" };

describe("nextSentiment", () => {
  it("sets a sentiment when there is none", () => {
    expect(nextSentiment(null, "like")).toBe("like");
  });

  it("clears the sentiment when the active one is clicked", () => {
    expect(nextSentiment("like", "like")).toBeNull();
  });

  it("switches when the other sentiment is clicked", () => {
    expect(nextSentiment("like", "dislike")).toBe("dislike");
  });
});

describe("parseRating", () => {
  it("accepts every value on the 1-10 scale", () => {
    expect(parseRating("1")).toBe(1);
    expect(parseRating("10")).toBe(10);
  });

  it.each(["", "0", "11", "7.5", "abc"])("rejects %j", (value) => {
    expect(parseRating(value)).toBeNull();
  });
});

describe("titleStateKey", () => {
  it("is stable for equal states", () => {
    expect(titleStateKey(1, { ...EMPTY_TITLE_STATE })).toBe(
      titleStateKey(1, EMPTY_TITLE_STATE),
    );
  });

  it.each([
    { isFavorite: true },
    { sentiment: "like" as const },
    { rating: 7 },
    { inWatchlist: true },
  ])("changes when %o changes", (change) => {
    expect(titleStateKey(1, { ...EMPTY_TITLE_STATE, ...change })).not.toBe(
      titleStateKey(1, EMPTY_TITLE_STATE),
    );
  });

  it("differs per title", () => {
    expect(titleStateKey(1, EMPTY_TITLE_STATE)).not.toBe(
      titleStateKey(2, EMPTY_TITLE_STATE),
    );
  });
});

describe("getTitleStates", () => {
  it("makes no round trip for an empty id list", async () => {
    const { client, builders } = makeClient({
      user_title_feedback: { data: [], error: null },
    });

    const states = await getTitleStates(client, "u1", []);

    expect(states.size).toBe(0);
    expect(builders.user_title_feedback.select).not.toHaveBeenCalled();
  });

  it("merges feedback and watchlist rows per title", async () => {
    const { client, builders } = makeClient({
      user_title_feedback: {
        data: [
          { tmdb_id: 1, is_favorite: true, sentiment: "like", rating: 8 },
          { tmdb_id: 2, is_favorite: false, sentiment: null, rating: null },
        ],
        error: null,
      },
      user_watchlist: {
        data: [{ tmdb_id: 2 }, { tmdb_id: 3 }],
        error: null,
      },
    });

    const states = await getTitleStates(client, "u1", [1, 2, 3, 4]);

    expect(builders.user_title_feedback.eq).toHaveBeenCalledWith(
      "user_id",
      "u1",
    );
    expect(builders.user_title_feedback.in).toHaveBeenCalledWith(
      "tmdb_id",
      [1, 2, 3, 4],
    );
    expect(builders.user_watchlist.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(states.get(1)).toEqual({
      isFavorite: true,
      sentiment: "like",
      rating: 8,
      inWatchlist: false,
    });
    expect(states.get(2)).toEqual({ ...EMPTY_TITLE_STATE, inWatchlist: true });
    expect(states.get(3)).toEqual({ ...EMPTY_TITLE_STATE, inWatchlist: true });
    expect(states.has(4)).toBe(false);
  });

  it("splits large id lists into chunked .in() queries", async () => {
    const { client, builders } = makeClient({
      user_title_feedback: { data: [], error: null },
      user_watchlist: { data: [], error: null },
    });
    const ids = Array.from(
      { length: STATE_QUERY_CHUNK_SIZE * 2 + 1 },
      (_, i) => i + 1,
    );

    await getTitleStates(client, "u1", ids);

    const chunks = (
      builders.user_title_feedback.in.mock.calls as unknown as [
        string,
        number[],
      ][]
    ).map(([, chunk]) => chunk);
    expect(chunks.map((c) => c.length)).toEqual([
      STATE_QUERY_CHUNK_SIZE,
      STATE_QUERY_CHUNK_SIZE,
      1,
    ]);
    expect(chunks.flat()).toEqual(ids);
    expect(builders.user_watchlist.in).toHaveBeenCalledTimes(3);
  });

  it.each(["user_title_feedback", "user_watchlist"])(
    "throws when the %s read fails",
    async (failing) => {
      const { client } = makeClient({
        user_title_feedback: { data: [], error: null },
        user_watchlist: { data: [], error: null },
        [failing]: { data: null, error: { message: "boom" } },
      });

      await expect(getTitleStates(client, "u1", [1])).rejects.toThrow(
        "getTitleStates failed: boom",
      );
    },
  );
});

describe("feedback writes", () => {
  it.each([
    ["setFavorite", () => setFavorite, true, { is_favorite: true }],
    ["setSentiment", () => setSentiment, "dislike", { sentiment: "dislike" }],
    ["setSentiment clear", () => setSentiment, null, { sentiment: null }],
    ["setRating", () => setRating, 9, { rating: 9 }],
    ["setRating clear", () => setRating, null, { rating: null }],
  ] as const)(
    "%s upserts only its own column (timestamps are left to the DB)",
    async (_name, getWrite, value, fields) => {
      const { client, builders } = makeClient({
        user_title_feedback: { error: null },
      });

      await (getWrite() as (...args: unknown[]) => Promise<void>)(
        client,
        "u1",
        42,
        value,
      );

      expect(builders.user_title_feedback.upsert).toHaveBeenCalledWith(
        { user_id: "u1", tmdb_id: 42, ...fields },
        FEEDBACK_CONFLICT,
      );
    },
  );

  it("throws when the upsert fails", async () => {
    const { client } = makeClient({
      user_title_feedback: { error: { message: "denied" } },
    });

    await expect(setFavorite(client, "u1", 42, true)).rejects.toThrow(
      "upsertFeedback failed: denied",
    );
  });
});

describe("setInWatchlist", () => {
  it("adds via an insert-or-ignore upsert", async () => {
    const { client, builders } = makeClient({
      user_watchlist: { error: null },
    });

    await setInWatchlist(client, "u1", 42, true);

    expect(builders.user_watchlist.upsert).toHaveBeenCalledWith(
      { user_id: "u1", tmdb_id: 42 },
      { onConflict: "user_id,tmdb_id", ignoreDuplicates: true },
    );
    expect(builders.user_watchlist.delete).not.toHaveBeenCalled();
  });

  it("removes only that user's row for that title", async () => {
    const { client, builders } = makeClient({
      user_watchlist: { error: null },
    });

    await setInWatchlist(client, "u1", 42, false);

    expect(builders.user_watchlist.delete).toHaveBeenCalled();
    expect(builders.user_watchlist.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(builders.user_watchlist.eq).toHaveBeenCalledWith("tmdb_id", 42);
    expect(builders.user_watchlist.upsert).not.toHaveBeenCalled();
  });

  it("throws when the write fails", async () => {
    const { client } = makeClient({
      user_watchlist: { error: { message: "denied" } },
    });

    await expect(setInWatchlist(client, "u1", 42, false)).rejects.toThrow(
      "setInWatchlist failed: denied",
    );
  });
});

describe("My List queries", () => {
  const title = { tmdb_id: 1, title: "Something" };

  it("getWatchlistTitles flattens the embed, newest first", async () => {
    const { client, builders } = makeClient({
      user_watchlist: { data: [{ title_cache: title }], error: null },
    });

    await expect(getWatchlistTitles(client, "u1")).resolves.toEqual([title]);

    expect(builders.user_watchlist.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(builders.user_watchlist.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
  });

  it("getFavoriteTitles only selects favorited rows, newest favorite first", async () => {
    const { client, builders } = makeClient({
      user_title_feedback: { data: [{ title_cache: title }], error: null },
    });

    await expect(getFavoriteTitles(client, "u1")).resolves.toEqual([title]);

    expect(builders.user_title_feedback.eq).toHaveBeenCalledWith(
      "is_favorite",
      true,
    );
    expect(builders.user_title_feedback.order).toHaveBeenCalledWith(
      "favorited_at",
      { ascending: false },
    );
  });

  it("both throw when the read fails", async () => {
    const { client } = makeClient({
      user_watchlist: { data: null, error: { message: "boom" } },
      user_title_feedback: { data: null, error: { message: "boom" } },
    });

    await expect(getWatchlistTitles(client, "u1")).rejects.toThrow(
      "getWatchlistTitles failed: boom",
    );
    await expect(getFavoriteTitles(client, "u1")).rejects.toThrow(
      "getFavoriteTitles failed: boom",
    );
  });
});
