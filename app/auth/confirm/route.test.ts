import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { GET } from "./route";

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

function request(query: string) {
  return new NextRequest(`http://localhost/auth/confirm${query}`);
}

describe("GET /auth/confirm", () => {
  const verifyOtp = vi.fn();

  beforeEach(() => {
    verifyOtp.mockReset();
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { verifyOtp },
    } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("verifies a reset link and lands on the new-password form", async () => {
    verifyOtp.mockResolvedValue({ error: null });

    const res = await GET(
      request("?token_hash=abc&type=recovery&next=/reset-password"),
    );

    expect(verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "abc",
    });
    expect(res.headers.get("location")).toBe("http://localhost/reset-password");
  });

  it("sends a recovery link to the new-password form whatever next says", async () => {
    verifyOtp.mockResolvedValue({ error: null });

    for (const query of [
      "?token_hash=abc&type=recovery",
      "?token_hash=abc&type=recovery&next=/elsewhere",
    ])
      expect((await GET(request(query))).headers.get("location")).toBe(
        "http://localhost/reset-password",
      );
  });

  it("sends an expired recovery link without next back to the reset form", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });

    const res = await GET(request("?token_hash=abc&type=recovery"));

    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=reset_link",
    );
  });

  it("follows a same-origin next for other types", async () => {
    verifyOtp.mockResolvedValue({ error: null });

    const res = await GET(request("?token_hash=abc&type=signup&next=/my-list"));

    expect(res.headers.get("location")).toBe("http://localhost/my-list");
  });

  it("goes home when next is absent or off-site", async () => {
    verifyOtp.mockResolvedValue({ error: null });

    for (const query of [
      "?token_hash=abc&type=signup",
      "?token_hash=abc&type=signup&next=//evil.com",
    ])
      expect((await GET(request(query))).headers.get("location")).toBe(
        "http://localhost/",
      );
  });

  it("sends an expired reset link back to the reset form", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });

    const res = await GET(
      request("?token_hash=abc&type=recovery&next=/reset-password"),
    );

    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=reset_link",
    );
  });

  it("rejects a missing token or unknown type without calling Supabase", async () => {
    for (const [query, error] of [
      ["?type=recovery", "reset_link"],
      ["?token_hash=abc&type=bogus", "auth_callback"],
    ]) {
      const res = await GET(request(query));
      expect(res.headers.get("location")).toBe(
        `http://localhost/login?error=${error}`,
      );
    }
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("treats a thrown verifyOtp as a failure", async () => {
    verifyOtp.mockRejectedValue(new TypeError("fetch failed"));

    const res = await GET(request("?token_hash=abc&type=signup"));

    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=auth_callback",
    );
  });
});
