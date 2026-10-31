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
