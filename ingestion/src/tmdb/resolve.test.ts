import { afterEach, describe, expect, it, vi } from "vitest";
import { TmdbError } from "../../../lib/tmdb";
import { titleKey, type TitleRef } from "../../../lib/title-ref";
import type { ResolvedTitle } from "../../../lib/tmdb-resolve";
import {
  LIVE_TMDB,
  MAX_CONSECUTIVE_FAILURES,
  resolveTitleKeys,
  TitleConflictError,
  withTitleKeys,
  type MapEntry,
  type ResolutionStore,
  type TmdbLookups,
} from "./resolve";

const NOW = new Date("2026-11-06T03:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

function title(ref: TitleRef, imdbId: string, name = "Title"): ResolvedTitle {
  return {
    ...ref,
    imdb_id: imdbId,
    title: name,
    original_title: null,
    overview: null,
    poster_path: null,
    backdrop_path: null,
    release_date: null,
    genres: [],
    vote_average: 7,
    popularity: 1,
  };
}

/** imdb_tmdb_map + title_cache in memory, enforcing the map's foreign key. */
function memoryStore(
  map: MapEntry[] = [],
  refreshed: { ref: TitleRef; at: string }[] = [],
) {
  const entries = new Map(map.map((e) => [e.imdb_id, e]));
  const titles = new Map<string, { title?: ResolvedTitle; at: string }>(
    refreshed.map((r) => [titleKey(r.ref), { at: r.at }]),
  );
  const store = {
    entries,
    titles,
    loadMapEntries: vi.fn(async (ids: readonly string[]) =>
      ids.flatMap((id) => (entries.has(id) ? [entries.get(id)!] : [])),
    ),
    loadRefreshTimes: vi.fn(async (refs: readonly TitleRef[]) =>
      refs.flatMap((ref) => {
        const row = titles.get(titleKey(ref));
        return row ? [{ ref, last_refreshed_at: row.at }] : [];
      }),
    ),
    saveTitle: vi.fn(async (t: ResolvedTitle, at: string) => {
      titles.set(titleKey(t), { title: t, at });
    }),
    refreshTitle: vi.fn(async (t: ResolvedTitle, at: string) => {
      titles.set(titleKey(t), { title: t, at });
    }),
    markRefreshed: vi.fn(async (ref: TitleRef, at: string) => {
      titles.set(titleKey(ref), { ...titles.get(titleKey(ref)), at });
    }),
    saveMapEntry: vi.fn(async (entry: MapEntry) => {
      if (entry.media_type && entry.tmdb_id !== null)
        if (!titles.has(titleKey({ ...entry } as TitleRef)))
          throw new Error("foreign key violation");
      entries.set(entry.imdb_id, entry);
    }),
  } satisfies ResolutionStore & Record<string, unknown>;
  return store;
}

function lookups(
  resolve: TmdbLookups["resolve"] = async () => null,
  details: TmdbLookups["details"] = async (ref, imdbId) =>
    title(ref, imdbId, "Refreshed"),
) {
  return { resolve: vi.fn(resolve), details: vi.fn(details) };
}

const movie = (tmdb_id: number): TitleRef => ({ media_type: "movie", tmdb_id });
const tv = (tmdb_id: number): TitleRef => ({ media_type: "tv", tmdb_id });

const resolvedEntry = (imdb_id: string, ref: TitleRef): MapEntry => ({
  imdb_id,
  ...ref,
  resolution_status: "resolved",
  last_attempted_at: daysAgo(100),
  attempt_count: 1,
});
const unresolvedEntry = (imdb_id: string, days: number): MapEntry => ({
  imdb_id,
  media_type: null,
  tmdb_id: null,
  resolution_status: "unresolved",
  last_attempted_at: daysAgo(days),
  attempt_count: 2,
});

const run = (
  rows: { imdb_id: string; type: "movie" | "tv_series" }[],
  store: ReturnType<typeof memoryStore>,
  tmdb: TmdbLookups,
  options = {},
) => resolveTitleKeys(rows, store, tmdb, { now: NOW, ...options });

describe("resolveTitleKeys", () => {
  it("looks up a new id, caches title_cache before the map, and returns its key", async () => {
    const store = memoryStore();
    const tmdb = lookups(async (id) => title(tv(1396), id));

    const result = await run(
      [{ imdb_id: "tt0903747", type: "tv_series" }],
      store,
      tmdb,
    );

    expect(result.keys.get("tt0903747")).toEqual(tv(1396));
    expect(tmdb.resolve).toHaveBeenCalledWith("tt0903747", "tv_series");
    expect(store.saveTitle.mock.invocationCallOrder[0]).toBeLessThan(
      store.saveMapEntry.mock.invocationCallOrder[0],
    );
    expect(store.titles.get("tv:1396")?.at).toBe(NOW.toISOString());
    expect(store.entries.get("tt0903747")).toEqual({
      imdb_id: "tt0903747",
      media_type: "tv",
      tmdb_id: 1396,
      resolution_status: "resolved",
      last_attempted_at: NOW.toISOString(),
      attempt_count: 1,
    });
    expect(result.stats).toMatchObject({ ids: 1, resolved: 1, cached: 0 });
  });

  it("uses a cached key with no TMDB call while it's fresh", async () => {
    const store = memoryStore(
      [resolvedEntry("tt0133093", movie(603))],
      [{ ref: movie(603), at: daysAgo(2) }],
    );
    const tmdb = lookups();

    const result = await run(
      [{ imdb_id: "tt0133093", type: "movie" }],
      store,
      tmdb,
    );

    expect(result.keys.get("tt0133093")).toEqual(movie(603));
    expect(tmdb.resolve).not.toHaveBeenCalled();
    expect(tmdb.details).not.toHaveBeenCalled();
    expect(result.stats).toMatchObject({ cached: 1, refreshed: 0 });
  });

  it("refreshes a cached title older than 7 days, by key", async () => {
    const store = memoryStore(
      [resolvedEntry("tt0133093", movie(603))],
      [{ ref: movie(603), at: daysAgo(8) }],
    );
    const tmdb = lookups();

    const result = await run(
      [{ imdb_id: "tt0133093", type: "movie" }],
      store,
      tmdb,
    );

    expect(tmdb.details).toHaveBeenCalledWith(movie(603), "tt0133093");
    expect(tmdb.resolve).not.toHaveBeenCalled();
    // An update that leaves the stored imdb_id alone, not a new upsert.
    expect(store.refreshTitle).toHaveBeenCalledTimes(1);
    expect(store.saveTitle).not.toHaveBeenCalled();
    expect(store.titles.get("movie:603")).toMatchObject({
      at: NOW.toISOString(),
      title: { title: "Refreshed" },
    });
    expect(result.stats.refreshed).toBe(1);
  });

  it("caps refreshes per run, oldest first, once per title key", async () => {
    const store = memoryStore(
      [
        resolvedEntry("tt0000001", movie(1)),
        resolvedEntry("tt0000002", movie(2)),
        resolvedEntry("tt0000003", movie(3)),
        // A second imdb_id for movie 3 (TMDB merged duplicates).
        resolvedEntry("tt0000033", movie(3)),
      ],
      [
        { ref: movie(1), at: daysAgo(9) },
        { ref: movie(2), at: daysAgo(30) },
        { ref: movie(3), at: daysAgo(20) },
      ],
    );
    const tmdb = lookups();

    await run(
      ["tt0000001", "tt0000002", "tt0000003", "tt0000033"].map((imdb_id) => ({
        imdb_id,
        type: "movie" as const,
      })),
      store,
      tmdb,
      { maxRefreshes: 2, concurrency: 1 },
    );

    expect(tmdb.details.mock.calls.map(([ref]) => ref.tmdb_id)).toEqual([2, 3]);
  });

  it("keeps the cached key and metadata when a refresh fails", async () => {
    const store = memoryStore(
      [resolvedEntry("tt0133093", movie(603))],
      [{ ref: movie(603), at: daysAgo(8) }],
    );
    const tmdb = lookups(undefined, async () => {
      throw new TmdbError("TMDB request failed: 503", 503);
    });

    const result = await run(
      [{ imdb_id: "tt0133093", type: "movie" }],
      store,
      tmdb,
    );

    expect(result.keys.get("tt0133093")).toEqual(movie(603));
    expect(store.refreshTitle).not.toHaveBeenCalled();
    // An outage isn't the title's fault: it stays first in line.
    expect(store.markRefreshed).not.toHaveBeenCalled();
    expect(result.stats).toMatchObject({ refreshed: 0, tmdbFailures: 1 });
    expect(result.errors[0]).toMatchObject({ stage: "refresh" });
  });

  it("doesn't store a refresh that describes another title", async () => {
    const store = memoryStore(
      [resolvedEntry("tt0133093", movie(603))],
      [{ ref: movie(603), at: daysAgo(8) }],
    );
    const tmdb = lookups(undefined, async (_ref, id) => title(tv(603), id));

    const result = await run(
      [{ imdb_id: "tt0133093", type: "movie" }],
      store,
      tmdb,
    );

    expect(store.refreshTitle).not.toHaveBeenCalled();
    expect(store.markRefreshed).toHaveBeenCalledWith(
      movie(603),
      NOW.toISOString(),
    );
    expect(result.errors[0].message).toMatch(/returned tv:603/);
  });

  it("records no match as unresolved, with no key", async () => {
    const store = memoryStore();
    const result = await run(
      [{ imdb_id: "tt9999999", type: "movie" }],
      store,
      lookups(),
    );

    expect(result.keys.get("tt9999999")).toBeNull();
    expect(store.entries.get("tt9999999")).toMatchObject({
      resolution_status: "unresolved",
      media_type: null,
      tmdb_id: null,
      attempt_count: 1,
      last_attempted_at: NOW.toISOString(),
    });
    expect(result.stats.unresolved).toBe(1);
  });

  it("doesn't ask TMDB again about an unresolved id within 30 days", async () => {
    const store = memoryStore([
      unresolvedEntry("tt9999999", 29),
      { ...unresolvedEntry("tt8888888", 1), resolution_status: "ambiguous" },
    ]);
    const tmdb = lookups();

    const result = await run(
      [
        { imdb_id: "tt9999999", type: "movie" },
        { imdb_id: "tt8888888", type: "movie" },
      ],
      store,
      tmdb,
    );

    expect(tmdb.resolve).not.toHaveBeenCalled();
    expect(result.keys.get("tt9999999")).toBeNull();
    expect(result.stats.waiting).toBe(2);
  });

  it("retries an unresolved id whose stamp won't parse, rather than never", async () => {
    const store = memoryStore([
      { ...unresolvedEntry("tt9999999", 1), last_attempted_at: "garbage" },
    ]);
    const tmdb = lookups();

    await run([{ imdb_id: "tt9999999", type: "movie" }], store, tmdb);

    expect(tmdb.resolve).toHaveBeenCalledTimes(1);
  });

  it("retries an unresolved id after 30 days and counts the attempt", async () => {
    const store = memoryStore([unresolvedEntry("tt9999999", 30)]);
    const tmdb = lookups(async (id) => title(movie(42), id));

    const result = await run(
      [{ imdb_id: "tt9999999", type: "movie" }],
      store,
      tmdb,
    );

    expect(result.keys.get("tt9999999")).toEqual(movie(42));
    expect(store.entries.get("tt9999999")).toMatchObject({
      resolution_status: "resolved",
      attempt_count: 3,
    });
  });

  it("caches nothing when a lookup fails: the id is asked about next run", async () => {
    const store = memoryStore();
    const tmdb = lookups(async () => {
      throw new TmdbError("TMDB request failed: 503", 503);
    });

    const result = await run(
      [{ imdb_id: "tt0133093", type: "movie" }],
      store,
      tmdb,
    );

    expect(result.keys.get("tt0133093")).toBeNull();
    expect(store.saveMapEntry).not.toHaveBeenCalled();
    expect(result.stats).toMatchObject({ tmdbFailures: 1, tmdbDown: false });
    expect(result.errors).toEqual([
      {
        imdb_id: "tt0133093",
        stage: "lookup",
        message: "TMDB request failed: 503",
      },
    ]);
  });

  it("stops calling TMDB after repeated failures, and still keys every row", async () => {
    const ids = Array.from(
      { length: 20 },
      (_, i) => `tt${String(1000000 + i)}`,
    );
    const store = memoryStore(
      [resolvedEntry("tt0133093", movie(603))],
      [{ ref: movie(603), at: daysAgo(8) }],
    );
    const tmdb = lookups(
      async () => {
        throw new Error("fetch failed");
      },
      async () => {
        throw new Error("fetch failed");
      },
    );

    const result = await run(
      [...ids, "tt0133093"].map((imdb_id) => ({
        imdb_id,
        type: "movie" as const,
      })),
      store,
      tmdb,
      { concurrency: 1 },
    );

    expect(tmdb.resolve).toHaveBeenCalledTimes(MAX_CONSECUTIVE_FAILURES);
    expect(tmdb.details).not.toHaveBeenCalled();
    expect(result.stats).toMatchObject({
      tmdbDown: true,
      tmdbFailures: MAX_CONSECUTIVE_FAILURES,
      // The other lookups. The refresh stage isn't even read.
      skipped: 20 - MAX_CONSECUTIVE_FAILURES,
    });
    expect(store.loadRefreshTimes).not.toHaveBeenCalled();
    // Every id has an answer: the availability update never waits on TMDB.
    expect(result.keys.size).toBe(21);
    expect(result.keys.get("tt0133093")).toEqual(movie(603));
    expect(ids.every((id) => result.keys.get(id) === null)).toBe(true);
  });

  it("a success resets the failure count", async () => {
    let call = 0;
    const tmdb = lookups(async (id) => {
      call++;
      if (call % MAX_CONSECUTIVE_FAILURES === 0) return title(movie(call), id);
      throw new Error("flaky");
    });
    const ids = Array.from({ length: 12 }, (_, i) => `tt${1000000 + i}`);

    const result = await run(
      ids.map((imdb_id) => ({ imdb_id, type: "movie" as const })),
      memoryStore(),
      tmdb,
      { concurrency: 1 },
    );

    expect(result.stats.tmdbDown).toBe(false);
    expect(tmdb.resolve).toHaveBeenCalledTimes(12);
  });

  it("gives up on a partial outage that keeps resetting the run of failures", async () => {
    // Fails 3 calls of every 4: never 5 in a row, but mostly failing.
    let call = 0;
    const tmdb = lookups(async (id) => {
      call++;
      if (call % 4 === 0) return title(movie(call), id);
      throw new Error("fetch failed");
    });
    const ids = Array.from({ length: 100 }, (_, i) => `tt${1000000 + i}`);

    const result = await run(
      ids.map((imdb_id) => ({ imdb_id, type: "movie" as const })),
      memoryStore(),
      tmdb,
      { concurrency: 1 },
    );

    expect(result.stats.tmdbDown).toBe(true);
    // Call 21 fails with 16 of 21 failed: past the 50% line.
    expect(tmdb.resolve).toHaveBeenCalledTimes(21);
  });

  it("gives up at once on a rejected token (401)", async () => {
    const tmdb = lookups(async () => {
      throw new TmdbError("TMDB request failed: 401", 401);
    });
    const ids = ["tt0000001", "tt0000002", "tt0000003"];

    const result = await run(
      ids.map((imdb_id) => ({ imdb_id, type: "movie" as const })),
      memoryStore(),
      tmdb,
      { concurrency: 1 },
    );

    expect(tmdb.resolve).toHaveBeenCalledTimes(1);
    expect(result.stats).toMatchObject({ tmdbDown: true, skipped: 2 });
  });

  it("returns no key when title_cache can't be written, and goes on", async () => {
    const store = memoryStore();
    store.saveTitle.mockRejectedValueOnce(
      new Error("duplicate key value violates unique constraint"),
    );
    const tmdb = lookups(async (id) => title(movie(Number(id.slice(2))), id));

    const result = await run(
      [
        { imdb_id: "tt0000001", type: "movie" },
        { imdb_id: "tt0000002", type: "movie" },
      ],
      store,
      tmdb,
      { concurrency: 1 },
    );

    expect(result.keys.get("tt0000001")).toBeNull();
    expect(store.entries.has("tt0000001")).toBe(false);
    expect(result.keys.get("tt0000002")).toEqual(movie(2));
    expect(result.stats).toMatchObject({ saveFailures: 1, resolved: 1 });
    expect(result.errors[0]).toMatchObject({ stage: "save" });
  });

  it("keeps the key when only the map write fails (title_cache has the row)", async () => {
    const store = memoryStore();
    store.saveMapEntry.mockRejectedValueOnce(new Error("network"));

    const result = await run(
      [{ imdb_id: "tt0000001", type: "movie" }],
      store,
      lookups(async (id) => title(movie(1), id)),
    );

    expect(result.keys.get("tt0000001")).toEqual(movie(1));
    expect(result.stats.saveFailures).toBe(1);
  });

  it("asks once per imdb_id, with the first row's type", async () => {
    const tmdb = lookups();
    await run(
      [
        { imdb_id: "tt0000001", type: "tv_series" },
        { imdb_id: "tt0000001", type: "movie" },
      ],
      memoryStore(),
      tmdb,
    );
    expect(tmdb.resolve).toHaveBeenCalledTimes(1);
    expect(tmdb.resolve).toHaveBeenCalledWith("tt0000001", "tv_series");
  });

  it("lets a database read failure through: the run can't go on without it", async () => {
    const store = memoryStore();
    store.loadMapEntries.mockRejectedValueOnce(new Error("db down"));
    await expect(
      run([{ imdb_id: "tt0000001", type: "movie" }], store, lookups()),
    ).rejects.toThrow("db down");
  });

  it("refreshes first a title whose stamp won't parse", async () => {
    const store = memoryStore(
      [
        resolvedEntry("tt0000001", movie(1)),
        resolvedEntry("tt0000002", movie(2)),
      ],
      [
        { ref: movie(1), at: daysAgo(30) },
        { ref: movie(2), at: "not a date" },
      ],
    );
    const tmdb = lookups();

    await run(
      ["tt0000001", "tt0000002"].map((imdb_id) => ({
        imdb_id,
        type: "movie" as const,
      })),
      store,
      tmdb,
      { maxRefreshes: 1 },
    );

    expect(tmdb.details.mock.calls.map(([ref]) => ref.tmdb_id)).toEqual([2]);
  });

  it("handles an empty file with no calls", async () => {
    const store = memoryStore();
    const tmdb = lookups();
    const result = await run([], store, tmdb);
    expect(result.keys.size).toBe(0);
    expect(tmdb.resolve).not.toHaveBeenCalled();
  });
});

describe("resolveTitleKeys: lasting per-title problems", () => {
  const notFound = () => {
    throw new TmdbError("TMDB request failed: 404", 404);
  };

  it("counts a 403 (a firewall, a suspended key) toward giving up, caching nothing", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `tt${1000000 + i}`);
    const store = memoryStore();
    const tmdb = lookups(async () => {
      throw new TmdbError("TMDB request failed: 403", 403);
    });

    const result = await run(
      ids.map((imdb_id) => ({ imdb_id, type: "movie" as const })),
      store,
      tmdb,
      { concurrency: 1 },
    );

    expect(tmdb.resolve).toHaveBeenCalledTimes(MAX_CONSECUTIVE_FAILURES);
    expect(result.stats.tmdbDown).toBe(true);
    expect(store.saveMapEntry).not.toHaveBeenCalled();
  });

  it("caches a 404 lookup as unresolved, and 404s never mean TMDB is down", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `tt${1000000 + i}`);
    const store = memoryStore();
    const tmdb = lookups(async () => notFound());

    const result = await run(
      ids.map((imdb_id) => ({ imdb_id, type: "movie" as const })),
      store,
      tmdb,
      { concurrency: 1 },
    );

    expect(tmdb.resolve).toHaveBeenCalledTimes(10);
    expect(result.stats).toMatchObject({ tmdbDown: false, unresolved: 10 });
    expect(store.entries.get(ids[0])?.resolution_status).toBe("unresolved");
  });

  it("moves a title TMDB 404s on refresh to the back of the queue, keeping its data", async () => {
    const store = memoryStore(
      [resolvedEntry("tt0133093", movie(603))],
      [{ ref: movie(603), at: daysAgo(8) }],
    );
    const tmdb = lookups(undefined, async () => notFound());

    const result = await run(
      [{ imdb_id: "tt0133093", type: "movie" }],
      store,
      tmdb,
    );

    expect(store.markRefreshed).toHaveBeenCalledWith(
      movie(603),
      NOW.toISOString(),
    );
    expect(store.refreshTitle).not.toHaveBeenCalled();
    expect(tmdb.resolve).not.toHaveBeenCalled();
    expect(result.keys.get("tt0133093")).toEqual(movie(603));
    expect(result.stats).toMatchObject({ refreshed: 0, tmdbDown: false });
    expect(result.errors[0]).toMatchObject({ stage: "refresh" });
  });

  it("caches a match whose imdb_id another title holds as ambiguous, with no key", async () => {
    const store = memoryStore();
    store.saveTitle.mockRejectedValueOnce(
      new TitleConflictError("duplicate key value (imdb_id)"),
    );

    const result = await run(
      [{ imdb_id: "tt0000001", type: "tv_series" }],
      store,
      lookups(async (id) => title(tv(1), id)),
    );

    expect(result.keys.get("tt0000001")).toBeNull();
    expect(store.entries.get("tt0000001")).toMatchObject({
      resolution_status: "ambiguous",
      media_type: null,
      tmdb_id: null,
    });
    expect(result.stats).toMatchObject({ ambiguous: 1, resolved: 0 });

    // So the next run (within 30 days) doesn't ask TMDB again.
    const tmdb = lookups();
    await run([{ imdb_id: "tt0000001", type: "tv_series" }], store, tmdb);
    expect(tmdb.resolve).not.toHaveBeenCalled();
  });

  it("stores the title under the feed's IMDb id when TMDB's own is taken", async () => {
    const store = memoryStore();
    store.saveTitle.mockRejectedValueOnce(
      new TitleConflictError("duplicate key value (imdb_id)"),
    );

    const result = await run(
      [{ imdb_id: "tt0000001", type: "movie" }],
      store,
      // TMDB lists another (canonical) IMDb id for the match.
      lookups(async () => title(movie(1), "tt0000002")),
    );

    expect(store.saveTitle).toHaveBeenCalledTimes(2);
    expect(store.saveTitle.mock.calls[1][0].imdb_id).toBe("tt0000001");
    expect(result.keys.get("tt0000001")).toEqual(movie(1));
    expect(result.stats).toMatchObject({ resolved: 1, saveFailures: 0 });
  });

  it("counts an unresolved id only once it's cached", async () => {
    const store = memoryStore();
    store.saveMapEntry.mockRejectedValueOnce(new Error("network"));

    const result = await run(
      [{ imdb_id: "tt9999999", type: "movie" }],
      store,
      lookups(),
    );

    expect(result.stats).toMatchObject({ unresolved: 0, saveFailures: 1 });
  });
});

describe("withTitleKeys", () => {
  it("sets the key's columns, both or neither, replacing the feed's tmdb_id hint", () => {
    const rows = [
      { imdb_id: "tt0000001", tmdb_id: 999, title: "A" },
      { imdb_id: "tt0000002", tmdb_id: 5, title: "B" },
    ];
    const keys = new Map([
      ["tt0000001", tv(1)],
      ["tt0000002", null],
    ]);

    expect(withTitleKeys(rows, keys)).toEqual([
      { imdb_id: "tt0000001", title: "A", media_type: "tv", tmdb_id: 1 },
      { imdb_id: "tt0000002", title: "B", media_type: null, tmdb_id: null },
    ]);
  });
});

describe("LIVE_TMDB", () => {
  afterEach(() => {
    delete process.env.TMDB_API_KEY;
    vi.unstubAllGlobals();
  });

  it("gives every TMDB request a time limit, so a hung call can't stall the run", async () => {
    process.env.TMDB_API_KEY = "test-token";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: async () => ({ movie_results: [], tv_results: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await LIVE_TMDB.resolve("tt0133093", "movie");

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
