import { describe, expect, it, vi } from "vitest";
import { createPublicClient } from "./supabase";

vi.mock("./supabase", () => ({
  createPublicClient: vi.fn(),
}));

// Minimal stand-in for the Supabase query builder: every filter/order method
// returns itself (chainable), and the chain is awaited directly (thenable),
// mirroring how @supabase/supabase-js's PostgrestBuilder resolves.
function makeQueryBuilder(result: {
  data: unknown;
  error: { message: string } | null;
}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    contains: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockedCreatePublicClient = vi.mocked(createPublicClient);

describe("getCatalogByProvider", () => {
  it("defaults to provider+region filtered, trending-sorted", async () => {
    const { getCatalogByProvider } = await import("./catalog");
    const rows = [{ tmdb_id: 1, title: "Something" }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    const from = vi.fn(() => builder);
    mockedCreatePublicClient.mockReturnValue({ from } as never);

    const result = await getCatalogByProvider("NETFLIX");

    expect(from).toHaveBeenCalledWith("v_catalog");
    expect(builder.select).toHaveBeenCalledWith("*");
    expect(builder.eq).toHaveBeenNthCalledWith(1, "provider", "NETFLIX");
    expect(builder.eq).toHaveBeenNthCalledWith(2, "region", "IL");
    expect(builder.eq).toHaveBeenCalledTimes(2);
    expect(builder.contains).not.toHaveBeenCalled();
    expect(builder.order).toHaveBeenCalledWith("popularity", {
      ascending: false,
      nullsFirst: false,
    });
    expect(result).toBe(rows);
  });

  it.each([
    ["newest", "release_date", false],
    ["trending", "popularity", false],
    ["rating", "vote_average", false],
    ["alphabetical", "title", true],
  ] as const)(
    "sort=%s orders by %s ascending=%s",
    async (sort, column, ascending) => {
      const { getCatalogByProvider } = await import("./catalog");
      const builder = makeQueryBuilder({ data: [], error: null });
      mockedCreatePublicClient.mockReturnValue({
        from: vi.fn(() => builder),
      } as never);

      await getCatalogByProvider("NETFLIX", { sort });

      expect(builder.order).toHaveBeenCalledWith(column, {
        ascending,
        nullsFirst: false,
      });
    },
  );

  it("applies type, availabilityType, and genre filters when given", async () => {
    const { getCatalogByProvider } = await import("./catalog");
    const builder = makeQueryBuilder({ data: [], error: null });
    mockedCreatePublicClient.mockReturnValue({
      from: vi.fn(() => builder),
    } as never);

    await getCatalogByProvider("NETFLIX", {
      filters: {
        type: "movie",
        availabilityType: "subscription",
        genre: "Drama",
      },
    });

    expect(builder.eq).toHaveBeenCalledWith("type", "movie");
    expect(builder.eq).toHaveBeenCalledWith(
      "availability_type",
      "subscription",
    );
    expect(builder.contains).toHaveBeenCalledWith(
      "genres",
      JSON.stringify([{ name: "Drama" }]),
    );
  });

  it("throws a descriptive error when the query fails", async () => {
    const { getCatalogByProvider } = await import("./catalog");
    const builder = makeQueryBuilder({
      data: null,
      error: { message: "connection refused" },
    });
    mockedCreatePublicClient.mockReturnValue({
      from: vi.fn(() => builder),
    } as never);

    await expect(getCatalogByProvider("NETFLIX")).rejects.toThrow(
      /connection refused/,
    );
  });
});

describe("getProviderGenres", () => {
  it("returns distinct genre names, sorted, for a provider+region", async () => {
    const { getProviderGenres } = await import("./catalog");
    const rows = [
      {
        genres: [
          { id: 18, name: "Drama" },
          { id: 35, name: "Comedy" },
        ],
      },
      { genres: [{ id: 18, name: "Drama" }] },
      { genres: null },
    ];
    const builder = makeQueryBuilder({ data: rows, error: null });
    const from = vi.fn(() => builder);
    mockedCreatePublicClient.mockReturnValue({ from } as never);

    const result = await getProviderGenres("NETFLIX");

    expect(from).toHaveBeenCalledWith("v_catalog");
    expect(builder.select).toHaveBeenCalledWith("genres");
    expect(builder.eq).toHaveBeenNthCalledWith(1, "provider", "NETFLIX");
    expect(builder.eq).toHaveBeenNthCalledWith(2, "region", "IL");
    expect(result).toEqual(["Comedy", "Drama"]);
  });

  it("throws a descriptive error when the query fails", async () => {
    const { getProviderGenres } = await import("./catalog");
    const builder = makeQueryBuilder({
      data: null,
      error: { message: "timeout" },
    });
    mockedCreatePublicClient.mockReturnValue({
      from: vi.fn(() => builder),
    } as never);

    await expect(getProviderGenres("NETFLIX")).rejects.toThrow(/timeout/);
  });
});

describe("getCatalogByTmdbId", () => {
  it("queries v_catalog filtered by tmdb_id only (every provider carrying that title)", async () => {
    const { getCatalogByTmdbId } = await import("./catalog");
    const rows = [
      { tmdb_id: 1396, provider: "NETFLIX" },
      { tmdb_id: 1396, provider: "YES" },
    ];
    const builder = makeQueryBuilder({ data: rows, error: null });
    const from = vi.fn(() => builder);
    mockedCreatePublicClient.mockReturnValue({ from } as never);

    const result = await getCatalogByTmdbId(1396);

    expect(from).toHaveBeenCalledWith("v_catalog");
    expect(builder.eq).toHaveBeenCalledWith("tmdb_id", 1396);
    expect(builder.eq).toHaveBeenCalledTimes(1);
    expect(result).toBe(rows);
  });

  it("throws a descriptive error when the query fails", async () => {
    const { getCatalogByTmdbId } = await import("./catalog");
    const builder = makeQueryBuilder({
      data: null,
      error: { message: "timeout" },
    });
    mockedCreatePublicClient.mockReturnValue({
      from: vi.fn(() => builder),
    } as never);

    await expect(getCatalogByTmdbId(1396)).rejects.toThrow(/timeout/);
  });
});
