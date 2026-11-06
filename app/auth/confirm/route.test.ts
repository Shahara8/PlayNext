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
  const exchangeCodeForSession = vi.fn();

  beforeEach(() => {
    verifyOtp.mockReset();
    exchangeCodeForSession.mockReset();
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { verifyOtp, exchangeCodeForSession },
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

  it("verifies a sign-up confirmation link (type=email) and goes home", async () => {
    verifyOtp.mockResolvedValue({ error: null });

    const res = await GET(request("?token_hash=abc&type=email"));

    expect(verifyOtp).toHaveBeenCalledWith({
      type: "email",
      token_hash: "abc",
    });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("falls back to the default template's PKCE code", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const res = await GET(request("?code=xyz"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("xyz");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("sends a failed code exchange to the sign-in error", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { message: "no verifier" },
    });

    const res = await GET(request("?code=xyz"));

    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=auth_callback",
    );
  });

  it("prefers the token hash and never mixes in a code", async () => {
    verifyOtp.mockResolvedValue({ error: null });

    await GET(request("?token_hash=abc&type=email&code=xyz"));
    expect(exchangeCodeForSession).not.toHaveBeenCalled();

    // A token hash with a bad type fails rather than trying the code.
    const res = await GET(request("?token_hash=abc&type=bogus&code=xyz"));
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=auth_callback",
    );
  });

  it("logs Supabase's own error when the link carries no token", async () => {
    const res = await GET(
      request(
        "?error=access_denied&error_description=Email+link+is+invalid+or+has+expired",
      ),
    );

    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=auth_callback",
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("/auth/confirm"),
      expect.objectContaining({
        error: "Email link is invalid or has expired",
      }),
    );
  });
});
