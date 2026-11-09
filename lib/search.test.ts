import { describe, expect, it, vi } from "vitest";
import { createPublicClient } from "./supabase";

vi.mock("./supabase", () => ({
  createPublicClient: vi.fn(),
}));

const mockedCreatePublicClient = vi.mocked(createPublicClient);

describe("searchTitles", () => {
  it("returns [] without calling the RPC for an empty/whitespace query", async () => {
    const { searchTitles } = await import("./search");
    const rpc = vi.fn();
    mockedCreatePublicClient.mockReturnValue({ rpc } as never);

    expect(await searchTitles("")).toEqual([]);
    expect(await searchTitles("   ")).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls search_titles with the trimmed query and a result limit", async () => {
    const { searchTitles } = await import("./search");
    const rows = [{ tmdb_id: 1396, title: "Breaking Bad", providers: [] }];
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    mockedCreatePublicClient.mockReturnValue({ rpc } as never);

    const result = await searchTitles("  breaking bad  ");

    expect(rpc).toHaveBeenCalledWith("search_titles", {
      search_query: "breaking bad",
      result_limit: 20,
    });
    expect(result).toBe(rows);
  });

  it("throws a descriptive error when the RPC fails", async () => {
    const { searchTitles } = await import("./search");
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "timeout" },
    });
    mockedCreatePublicClient.mockReturnValue({ rpc } as never);

    await expect(searchTitles("x")).rejects.toThrow(/timeout/);
  });
});

describe("showsClosestMatches", () => {
  const rows = (...titles: string[]) => titles.map((title) => ({ title }));

  it("is false when the best match contains the query", async () => {
    const { showsClosestMatches } = await import("./search");
    expect(showsClosestMatches("stranger", rows("Stranger Things"))).toBe(
      false,
    );
    expect(showsClosestMatches("things", rows("Stranger Things"))).toBe(false);
  });

  it("is true for a typo match", async () => {
    const { showsClosestMatches } = await import("./search");
    expect(showsClosestMatches("strnger", rows("Stranger Things"))).toBe(true);
  });

  it("is false when any result contains the query, even below a near-miss", async () => {
    const { showsClosestMatches } = await import("./search");
    expect(
      showsClosestMatches("dark", rows("Dark", "The Dark Knight", "Ozark")),
    ).toBe(false);
    expect(showsClosestMatches("king", rows("Kong", "The Lion King"))).toBe(
      false,
    );
    expect(showsClosestMatches("drak", rows("Dark", "Ozark"))).toBe(true);
  });

  it("ignores case, accents, punctuation and extra spaces", async () => {
    const { showsClosestMatches } = await import("./search");
    expect(showsClosestMatches("  SPIDER   man ", rows("Spider-Man"))).toBe(
      false,
    );
    expect(showsClosestMatches("spiderman", rows("Spider-Man"))).toBe(false);
    expect(showsClosestMatches("spider man", rows("Spiderman"))).toBe(false);
    expect(showsClosestMatches("amelie", rows("Amélie"))).toBe(false);
    expect(showsClosestMatches("Amélie", rows("Amelie"))).toBe(false);
    expect(
      showsClosestMatches("la casa de papel", rows("La Casa de Papel")),
    ).toBe(false);
  });

  it("is false with no results or nothing to compare", async () => {
    const { showsClosestMatches } = await import("./search");
    expect(showsClosestMatches("strnger", [])).toBe(false);
    expect(showsClosestMatches("", rows("Dark"))).toBe(false);
    expect(showsClosestMatches("?!", rows("Dark"))).toBe(false);
  });

  it("treats a query longer than the title as not contained", async () => {
    const { showsClosestMatches } = await import("./search");
    expect(showsClosestMatches("dark matter", rows("Dark"))).toBe(true);
  });
});

describe("resultsLine", () => {
  it("counts results, singular and plural", async () => {
    const { resultsLine } = await import("./search");
    expect(resultsLine(1, "dark")).toBe("1 result for “dark”");
    expect(resultsLine(7, "dark")).toBe("7 results for “dark”");
  });

  it("says Top 20 at the result limit, since there may be more", async () => {
    const { resultsLine } = await import("./search");
    expect(resultsLine(20, "the")).toBe("Top 20 results for “the”");
    expect(resultsLine(19, "the")).toBe("19 results for “the”");
  });
});
