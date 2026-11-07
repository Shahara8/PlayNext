import { describe, expect, it, vi } from "vitest";
import { ID_CHUNK_SIZE } from "../../../lib/id-chunks";
import type { ResolvedTitle } from "../../../lib/tmdb-resolve";
import { TitleConflictError } from "./resolve";
import { loadTitleNames, supabaseResolutionStore } from "./store";

type Result = {
  data?: unknown;
  error: { message: string; code?: string; details?: string } | null;
};

// The chainable + thenable query stand-in used by lib/catalog.test.ts.
function makeBuilder(results: Result[]) {
  let call = 0;
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    then: (
      resolve: (value: Result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve(results[Math.min(call++, results.length - 1)]).then(
        resolve,
        reject,
      ),
  };
  return builder;
}

function makeClient(results: Record<string, Result[]>) {
  const builders = Object.fromEntries(
    Object.entries(results).map(([table, r]) => [table, makeBuilder(r)]),
  );
  const client = { from: vi.fn((table: string) => builders[table]) };
  return { store: supabaseResolutionStore(client as never), builders };
}

const ok = (data: unknown = null): Result => ({ data, error: null });
const fail = (message: string, code?: string): Result => ({
  data: null,
  error: { message, ...(code ? { code } : {}) },
});

const TITLE: ResolvedTitle = {
  tmdb_id: 603,
  media_type: "movie",
  imdb_id: "tt0133093",
  title: "The Matrix",
  original_title: "The Matrix",
  overview: null,
  poster_path: "/p.jpg",
  backdrop_path: null,
  release_date: "1999-03-31",
  genres: [{ id: 28, name: "Action" }],
  vote_average: 8.2,
  popularity: 80,
};

describe("supabaseResolutionStore", () => {
  it("reads map entries in URL-safe chunks", async () => {
    const ids = Array.from(
      { length: ID_CHUNK_SIZE + 1 },
      (_, i) => `tt${1000000 + i}`,
    );
    const { store, builders } = makeClient({
      imdb_tmdb_map: [ok([{ imdb_id: ids[0] }]), ok([{ imdb_id: ids[100] }])],
    });

    const entries = await store.loadMapEntries(ids);

    expect(entries.map((e) => e.imdb_id)).toEqual([ids[0], ids[100]]);
    const inCalls = builders.imdb_tmdb_map.in.mock.calls;
    expect(inCalls).toHaveLength(2);
    expect(inCalls[0]).toEqual(["imdb_id", ids.slice(0, ID_CHUNK_SIZE)]);
    expect(inCalls[1]).toEqual(["imdb_id", [ids[100]]]);
  });

  it("throws on a map read error", async () => {
    const { store } = makeClient({ imdb_tmdb_map: [fail("boom")] });
    await expect(store.loadMapEntries(["tt0000001"])).rejects.toThrow(
      /imdb_tmdb_map read failed: boom/,
    );
  });

  it("reads refresh times per media type, keyed back to the ref", async () => {
    const { store, builders } = makeClient({
      title_cache: [
        ok([{ tmdb_id: 603, last_refreshed_at: "2026-10-01T00:00:00Z" }]),
        ok([{ tmdb_id: 603, last_refreshed_at: "2026-11-01T00:00:00Z" }]),
      ],
    });

    const times = await store.loadRefreshTimes([
      { media_type: "movie", tmdb_id: 603 },
      { media_type: "tv", tmdb_id: 603 },
    ]);

    expect(times).toEqual([
      {
        ref: { media_type: "movie", tmdb_id: 603 },
        last_refreshed_at: "2026-10-01T00:00:00Z",
      },
      {
        ref: { media_type: "tv", tmdb_id: 603 },
        last_refreshed_at: "2026-11-01T00:00:00Z",
      },
    ]);
    expect(builders.title_cache.eq.mock.calls).toEqual([
      ["media_type", "movie"],
      ["media_type", "tv"],
    ]);
  });

  const IMDB_CLASH = fail(
    'duplicate key value violates unique constraint "title_cache_imdb_id_key"',
    "23505",
  );
  const KEY_CLASH = fail(
    'duplicate key value violates unique constraint "title_cache_pkey"',
    "23505",
  );

  it("inserts a new title with its imdb_id in one write, stamping last_refreshed_at", async () => {
    const { store, builders } = makeClient({ title_cache: [ok()] });

    await store.saveTitle(TITLE, "2026-11-06T03:00:00.000Z");

    expect(builders.title_cache.insert).toHaveBeenCalledWith({
      ...TITLE,
      last_refreshed_at: "2026-11-06T03:00:00.000Z",
    });
    expect(builders.title_cache.update).not.toHaveBeenCalled();
  });

  it("updates a key already stored without touching its imdb_id", async () => {
    // A second IMDb id for one title, or a parallel lookup that inserted it
    // first; Postgres may name either unique constraint.
    for (const clash of [KEY_CLASH, IMDB_CLASH]) {
      const { store, builders } = makeClient({
        title_cache: [clash, ok([{ tmdb_id: 603 }])],
      });

      await store.saveTitle(
        { ...TITLE, imdb_id: "tt7777777" },
        "2026-11-06T03:00:00.000Z",
      );

      const [values] = builders.title_cache.update.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ];
      expect(values).not.toHaveProperty("imdb_id");
      expect(values.last_refreshed_at).toBe("2026-11-06T03:00:00.000Z");
      expect(builders.title_cache.eq.mock.calls).toEqual([
        ["media_type", "movie"],
        ["tmdb_id", 603],
      ]);
    }
  });

  it("throws on a failed title insert, naming the key", async () => {
    const { store, builders } = makeClient({ title_cache: [fail("timeout")] });
    const error = await store.saveTitle(TITLE, "x").catch((e) => e);
    expect(error).not.toBeInstanceOf(TitleConflictError);
    expect(error.message).toMatch(
      /title_cache insert failed \(movie:603\): timeout/,
    );
    expect(builders.title_cache.update).not.toHaveBeenCalled();
  });

  it("reports another title holding the imdb_id as a TitleConflictError", async () => {
    // Insert: clash; update: no row has this key.
    const { store } = makeClient({ title_cache: [IMDB_CLASH, ok([])] });
    await expect(store.saveTitle(TITLE, "x")).rejects.toBeInstanceOf(
      TitleConflictError,
    );
  });

  it("recognizes the clash from the error's details too", async () => {
    const { store } = makeClient({
      title_cache: [
        {
          data: null,
          error: {
            message: "duplicate key value violates unique constraint",
            details: "Key (imdb_id)=(tt0133093) already exists.",
            code: "23505",
          },
        },
        ok([]),
      ],
    });
    await expect(store.saveTitle(TITLE, "x")).rejects.toBeInstanceOf(
      TitleConflictError,
    );
  });

  it("treats a key clash with no row after it as an ordinary error", async () => {
    const { store } = makeClient({ title_cache: [KEY_CLASH, ok([])] });
    const error = await store.saveTitle(TITLE, "x").catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TitleConflictError);
  });

  it("refreshes metadata by key with an update that leaves imdb_id alone", async () => {
    const { store, builders } = makeClient({
      title_cache: [ok([{ tmdb_id: 603 }])],
    });

    await store.refreshTitle(
      { ...TITLE, imdb_id: "tt7777777", vote_average: 8.3 },
      "2026-11-06T03:00:00.000Z",
    );

    const [values] = builders.title_cache.update.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(values).not.toHaveProperty("imdb_id");
    expect(values).not.toHaveProperty("tmdb_id");
    expect(values).toMatchObject({
      title: "The Matrix",
      vote_average: 8.3,
      last_refreshed_at: "2026-11-06T03:00:00.000Z",
    });
    expect(builders.title_cache.eq.mock.calls).toEqual([
      ["media_type", "movie"],
      ["tmdb_id", 603],
    ]);
    expect(builders.title_cache.upsert).not.toHaveBeenCalled();
  });

  it("fails a refresh that finds no row, rather than counting it", async () => {
    const { store } = makeClient({ title_cache: [ok([])] });
    await expect(store.refreshTitle(TITLE, "x")).rejects.toThrow(
      /title_cache refresh found no row \(movie:603\)/,
    );
  });

  it("marks a title refreshed without touching its metadata", async () => {
    const { store, builders } = makeClient({
      title_cache: [ok([{ tmdb_id: 1396 }]), fail("boom")],
    });

    await store.markRefreshed(
      { media_type: "tv", tmdb_id: 1396 },
      "2026-11-06T03:00:00.000Z",
    );
    expect(builders.title_cache.update).toHaveBeenCalledWith({
      last_refreshed_at: "2026-11-06T03:00:00.000Z",
    });
    await expect(
      store.markRefreshed({ media_type: "tv", tmdb_id: 1396 }, "x"),
    ).rejects.toThrow(/title_cache stamp failed \(tv:1396\): boom/);
  });

  it("upserts map entries on imdb_id and throws on error", async () => {
    const entry = {
      imdb_id: "tt9999999",
      media_type: null,
      tmdb_id: null,
      resolution_status: "unresolved" as const,
      last_attempted_at: "2026-11-06T03:00:00.000Z",
      attempt_count: 1,
    };
    const { store, builders } = makeClient({
      imdb_tmdb_map: [ok(), fail("check violation")],
    });

    await store.saveMapEntry(entry);
    expect(builders.imdb_tmdb_map.upsert).toHaveBeenCalledWith(entry, {
      onConflict: "imdb_id",
    });
    await expect(store.saveMapEntry(entry)).rejects.toThrow(
      /imdb_tmdb_map upsert failed \(tt9999999\): check violation/,
    );
  });
});

describe("loadTitleNames", () => {
  it("reads title_cache's names per media type", async () => {
    const { builders } = makeClient({
      title_cache: [
        ok([
          { tmdb_id: 400617, title: "Phantom Thread", original_title: null },
        ]),
        ok([{ tmdb_id: 56017, title: "Shtisel", original_title: "שטיסל" }]),
      ],
    });
    const client = { from: vi.fn(() => builders.title_cache) };

    const names = await loadTitleNames(client as never, [
      { media_type: "movie", tmdb_id: 400617 },
      { media_type: "tv", tmdb_id: 56017 },
    ]);

    expect(names).toEqual([
      {
        ref: { media_type: "movie", tmdb_id: 400617 },
        title: "Phantom Thread",
        original_title: null,
      },
      {
        ref: { media_type: "tv", tmdb_id: 56017 },
        title: "Shtisel",
        original_title: "שטיסל",
      },
    ]);
    expect(builders.title_cache.eq.mock.calls).toEqual([
      ["media_type", "movie"],
      ["media_type", "tv"],
    ]);
  });

  it("throws when title_cache can't be read", async () => {
    const { builders } = makeClient({ title_cache: [fail("boom")] });
    const client = { from: vi.fn(() => builders.title_cache) };
    await expect(
      loadTitleNames(client as never, [{ media_type: "movie", tmdb_id: 1 }]),
    ).rejects.toThrow(/title_cache read failed: boom/);
  });
});
