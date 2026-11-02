import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getRecommendations } from "@/lib/recommendations";
import {
  createServerSupabaseClient,
  getCurrentUser,
} from "@/lib/supabase-server";
import { GET } from "./route";

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/recommendations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recommendations")>()),
  getRecommendations: vi.fn(),
}));

function request(query = "") {
  return new NextRequest(`http://localhost/api/recommendations${query}`);
}

describe("GET /api/recommendations", () => {
  const client = {};
  const recommendations = {
    hasSeeds: true,
    seedLookupsFailed: false,
    titles: [],
  };

  it("returns the signed-in viewer's recommendations", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    vi.mocked(getRecommendations).mockResolvedValue(recommendations);

    const res = await GET(request("?limit=5"));

    expect(getRecommendations).toHaveBeenCalledWith(
      { supabase: client, userId: "u1" },
      5,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(recommendations);
  });

  it("serves a signed-out viewer with no user id, at the default limit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(createServerSupabaseClient).mockClear();
    vi.mocked(getRecommendations).mockResolvedValue(recommendations);

    const res = await GET(request());

    expect(getRecommendations).toHaveBeenCalledWith(null, 20);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("returns a 500 with a generic message when it fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    vi.mocked(getRecommendations).mockRejectedValue(new Error("db password"));

    const res = await GET(request());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Couldn't load recommendations.",
    });
    consoleError.mockRestore();
  });
});
