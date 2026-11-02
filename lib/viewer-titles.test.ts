import { describe, expect, it, vi } from "vitest";
import { createServerSupabaseClient, getCurrentUser } from "./supabase-server";
import { getTitleStates } from "./user-titles";
import { getViewerTitleStates } from "./viewer-titles";

vi.mock("./supabase-server", () => ({
  createServerSupabaseClient: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("./user-titles", () => ({
  getTitleStates: vi.fn(),
}));

describe("getViewerTitleStates", () => {
  it("returns no user or states when signed out, without querying", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const result = await getViewerTitleStates([1]);

    expect(result.userId).toBeNull();
    expect(result.states.size).toBe(0);
    expect(result.unavailable).toBe(false);
    expect(getTitleStates).not.toHaveBeenCalled();
  });

  it("loads the signed-in viewer's states", async () => {
    const client = {};
    const states = new Map();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    vi.mocked(getTitleStates).mockResolvedValue(states);

    const result = await getViewerTitleStates([1, 2]);

    expect(getTitleStates).toHaveBeenCalledWith(client, "u1", [1, 2]);
    expect(result).toEqual({ userId: "u1", states, unavailable: false });
  });

  it("marks states unavailable when the read fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(createServerSupabaseClient).mockResolvedValue({} as never);
    vi.mocked(getTitleStates).mockRejectedValue(new Error("boom"));

    const result = await getViewerTitleStates([1]);

    expect(result.userId).toBe("u1");
    expect(result.states.size).toBe(0);
    expect(result.unavailable).toBe(true);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
