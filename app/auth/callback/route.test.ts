import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { GET } from "./route";

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

function request(query: string) {
  return new NextRequest(`http://localhost/auth/callback${query}`);
}

describe("GET /auth/callback", () => {
  const exchangeCodeForSession = vi.fn();

  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("exchanges the code and goes home", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const res = await GET(request("?code=c1"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("c1");
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("follows a same-origin next, never an off-site one", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    expect(
      (await GET(request("?code=c1&next=/reset-password"))).headers.get(
        "location",
      ),
    ).toBe("http://localhost/reset-password");
    expect(
      (await GET(request("?code=c1&next=//evil.com"))).headers.get("location"),
    ).toBe("http://localhost/");
  });

  it("sends a failed reset link back to the reset form", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "bad" } });

    const res = await GET(request("?code=c1&next=/reset-password"));

    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=reset_link",
    );
  });

  it("sends any other failure to the generic sign-in error", async () => {
    exchangeCodeForSession.mockRejectedValue(new TypeError("fetch failed"));

    for (const query of ["?code=c1", "?error=access_denied"])
      expect((await GET(request(query))).headers.get("location")).toBe(
        "http://localhost/login?error=auth_callback",
      );
  });

  it("doesn't call Supabase without a code", async () => {
    await GET(request("?error=access_denied"));

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
